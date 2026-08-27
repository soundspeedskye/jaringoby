alter table public.room_post_reactions
  drop constraint room_post_reactions_emoji;

update public.room_post_reactions
set emoji = '🩷'
where emoji = '❤️';

alter table public.room_post_reactions
  add constraint room_post_reactions_emoji
  check (emoji in ('🥰', '✌️', '👍', '🥲', '🫠', '🤔', '👏', '👎', '🩷'));

create or replace function public.toggle_room_post_reaction(
  p_post_id uuid,
  p_emoji text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_emoji is null or p_emoji not in ('🥰', '✌️', '👍', '🥲', '🫠', '🤔', '👏', '👎', '🩷') then
    raise exception using errcode = '22023', message = 'unsupported reaction';
  end if;

  select room_id into v_room_id
  from public.room_posts
  where id = p_post_id
    and deleted_at is null;
  if v_room_id is null or not private.is_active_room_member(v_room_id, v_user_id) then
    raise exception using errcode = '42501', message = 'active room membership required';
  end if;

  if exists (
    select 1
    from public.room_post_reactions
    where post_id = p_post_id
      and user_id = v_user_id
      and emoji = p_emoji
  ) then
    delete from public.room_post_reactions
    where post_id = p_post_id
      and user_id = v_user_id
      and emoji = p_emoji;
  else
    insert into public.room_post_reactions (post_id, user_id, emoji)
    values (p_post_id, v_user_id, p_emoji);
  end if;
end;
$$;
