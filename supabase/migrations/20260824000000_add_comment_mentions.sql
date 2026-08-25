alter type public.notification_kind add value if not exists 'comment_mention';

create table public.comment_mentions (
  comment_id uuid not null references public.comments (id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles (id) on delete restrict,
  start_offset integer not null,
  end_offset integer not null,
  display_name text not null,
  primary key (comment_id, start_offset),
  constraint comment_mentions_range_check check (start_offset >= 0 and end_offset > start_offset),
  constraint comment_mentions_display_name_check check (char_length(display_name) between 1 and 40)
);

create index comment_mentions_user_idx
  on public.comment_mentions (mentioned_user_id, comment_id);

alter table public.comment_mentions enable row level security;

create policy comment_mentions_read_room_members
on public.comment_mentions
for select
to authenticated
using (
  exists (
    select 1
    from public.comments c
    join public.expenses e on e.id = c.expense_id
    join public.periods p on p.id = e.period_id
    where c.id = comment_mentions.comment_id
      and private.is_period_room_member(p.id, (select auth.uid()))
  )
);

grant select on table public.comment_mentions to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'comment_mentions'
     ) then
    alter publication supabase_realtime add table public.comment_mentions;
  end if;
end;
$$;
