-- 댓글 반응은 사용자·댓글·이모지 조합당 한 번만 남긴다.
create table public.comment_reactions (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji),
  constraint comment_reactions_emoji_check check (emoji in ('❤️', '👍', '👏'))
);

create index comment_reactions_comment_idx
  on public.comment_reactions (comment_id, created_at);

alter table public.comment_reactions enable row level security;

create policy comment_reactions_read_room_members
on public.comment_reactions
for select
to authenticated
using (
  exists (
    select 1
    from public.comments c
    join public.expenses e on e.id = c.expense_id
    where c.id = comment_reactions.comment_id
      and e.period_id is not null
      and private.is_period_room_member(e.period_id, (select auth.uid()))
  )
);

create function private.toggle_comment_reaction_impl(
  p_comment_id uuid,
  p_emoji text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_comment public.comments%rowtype;
  v_expense public.expenses%rowtype;
  v_period public.periods%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_emoji is null or p_emoji not in ('❤️', '👍', '👏') then
    raise exception using errcode = '22023', message = 'unsupported comment reaction';
  end if;

  select c.* into v_comment
  from public.comments c
  where c.id = p_comment_id;
  if v_comment.id is null or v_comment.deleted_at is not null then
    raise exception using errcode = '22023', message = 'comment must be visible to react';
  end if;

  select e.* into v_expense
  from public.expenses e
  where e.id = v_comment.expense_id;
  if v_expense.id is null
     or v_expense.period_id is null
     or v_expense.deleted_at is not null then
    raise exception using errcode = '22023', message = 'comment reaction requires a visible period expense';
  end if;

  select p.* into strict v_period
  from public.periods p
  where p.id = v_expense.period_id;
  if statement_timestamp() < v_period.starts_at
     or statement_timestamp() >= v_period.finalizes_at then
    raise exception using errcode = '22023', message = 'comment reactions are writable only through settlement';
  end if;
  if not private.is_active_room_member(v_period.room_id, v_user_id) then
    raise exception using errcode = '42501', message = 'an active room membership is required';
  end if;

  delete from public.comment_reactions
  where comment_id = p_comment_id
    and user_id = v_user_id
    and emoji = p_emoji;
  if found then
    return false;
  end if;

  insert into public.comment_reactions (comment_id, user_id, emoji)
  values (p_comment_id, v_user_id, p_emoji);
  return true;
end;
$$;

create function public.toggle_comment_reaction(
  p_comment_id uuid,
  p_emoji text
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.toggle_comment_reaction_impl(p_comment_id, p_emoji);
$$;

revoke all on function private.toggle_comment_reaction_impl(uuid, text)
  from public, anon;
grant execute on function private.toggle_comment_reaction_impl(uuid, text)
  to authenticated;
revoke execute on function public.toggle_comment_reaction(uuid, text)
  from public, anon, service_role;
grant execute on function public.toggle_comment_reaction(uuid, text)
  to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'comment_reactions'
     ) then
    alter publication supabase_realtime add table public.comment_reactions;
  end if;
end;
$$;
