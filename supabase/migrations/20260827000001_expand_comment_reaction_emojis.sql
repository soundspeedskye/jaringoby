alter table public.comment_reactions
  drop constraint comment_reactions_emoji_check;

update public.comment_reactions
set emoji = '🩷'
where emoji = '❤️';

alter table public.comment_reactions
  add constraint comment_reactions_emoji_check
  check (emoji in ('🥰', '✌️', '👍', '🥲', '🫠', '🤔', '👏', '👎', '🩷'));

create or replace function private.toggle_comment_reaction_impl(
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
  if p_emoji is null or p_emoji not in ('🥰', '✌️', '👍', '🥲', '🫠', '🤔', '👏', '👎', '🩷') then
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
