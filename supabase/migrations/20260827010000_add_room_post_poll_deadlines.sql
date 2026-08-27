-- 투표는 생성일의 다음 날 23:59:59.999(KST)까지 열린다.
-- 저장값은 닫히기 시작하는 시각(그 다음 날 00:00 KST)으로 둬서 비교를 단순하게 한다.

alter table public.room_posts
  add column if not exists poll_closes_at timestamptz;

-- 기존 투표도 같은 규칙으로 마감 처리한다.
update public.room_posts
set poll_closes_at = (
  date_trunc('day', created_at at time zone 'Asia/Seoul') + interval '2 days'
) at time zone 'Asia/Seoul'
where kind = 'poll' and poll_closes_at is null;

alter table public.room_posts
  drop constraint if exists room_posts_poll_deadline_shape,
  add constraint room_posts_poll_deadline_shape check (
    (kind = 'poll' and poll_closes_at is not null)
    or (kind <> 'poll' and poll_closes_at is null)
  );

create or replace function private.add_room_post_impl(
  p_room_id uuid,
  p_kind public.room_post_kind,
  p_body text,
  p_options text[],
  p_client_request_id uuid
)
returns public.room_posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_post public.room_posts%rowtype;
  v_recipient record;
  v_position integer;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  if p_client_request_id is null then raise exception using errcode = '22023', message = 'client_request_id is required'; end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'post body must be 1 to 500 characters';
  end if;
  if p_kind = 'poll' then
    if p_options is null or cardinality(p_options) not between 2 and 4
      or exists (select 1 from unnest(p_options) option_body where char_length(btrim(option_body)) not between 1 and 60)
      or (select count(distinct btrim(option_body)) from unnest(p_options) option_body) <> cardinality(p_options) then
      raise exception using errcode = '22023', message = 'poll must have 2 to 4 distinct options of 1 to 60 characters';
    end if;
  elsif p_options is not null and cardinality(p_options) > 0 then
    raise exception using errcode = '22023', message = 'only polls may include options';
  end if;

  select * into v_post from public.room_posts
  where author_id = v_user_id and client_request_id = p_client_request_id;
  if found then return v_post; end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if v_room.id is null or v_room.status <> 'open' then
    raise exception using errcode = '22023', message = 'room is closed or unavailable';
  end if;
  if not private.is_active_room_member(p_room_id, v_user_id) then
    raise exception using errcode = '42501', message = 'active room membership required';
  end if;
  if p_kind = 'notice' and v_room.owner_id <> v_user_id then
    raise exception using errcode = '42501', message = 'only the room owner can post a notice';
  end if;

  insert into public.room_posts(
    room_id, period_id, kind, author_id, body, poll_closes_at, client_request_id
  )
  values (
    p_room_id,
    private.current_room_period_id(p_room_id),
    p_kind,
    v_user_id,
    btrim(p_body),
    case when p_kind = 'poll' then (
      date_trunc('day', statement_timestamp() at time zone 'Asia/Seoul') + interval '2 days'
    ) at time zone 'Asia/Seoul' end,
    p_client_request_id
  )
  returning * into v_post;

  if p_kind = 'poll' then
    for v_position in 1..cardinality(p_options) loop
      insert into public.room_post_poll_options(post_id, body, position)
      values (v_post.id, btrim(p_options[v_position]), v_position - 1);
    end loop;
  end if;

  if p_kind = 'notice' then
    for v_recipient in
      select user_id from public.room_members
      where room_id = p_room_id and status = 'active' and user_id <> v_user_id
    loop
      perform private.enqueue_notification(
        v_recipient.user_id, 'room_notice', v_user_id, p_room_id, v_post.period_id,
        null, null, '/room/board', 'room_notice:' || v_post.id::text
      );
      update public.notifications
      set post_id = v_post.id
      where user_id = v_recipient.user_id and dedupe_key = 'room_notice:' || v_post.id::text;
    end loop;
  end if;
  perform private.write_audit_event(v_user_id, 'room_post.created', 'room_post', v_post.id,
    jsonb_build_object('room_id', p_room_id, 'kind', p_kind));
  return v_post;
end;
$$;

create or replace function private.vote_room_post_poll_impl(p_post_id uuid, p_option_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_post public.room_posts%rowtype;
  v_room public.rooms%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  select * into v_post from public.room_posts where id = p_post_id for update;
  if v_post.id is null or v_post.deleted_at is not null or v_post.kind <> 'poll' then
    raise exception using errcode = '22023', message = 'poll is unavailable';
  end if;
  if statement_timestamp() >= v_post.poll_closes_at then
    raise exception using errcode = '22023', message = 'poll has closed';
  end if;
  select * into v_room from public.rooms where id = v_post.room_id for update;
  if v_room.status <> 'open' or not private.is_active_room_member(v_post.room_id, v_user_id) then
    raise exception using errcode = '42501', message = 'active room membership required';
  end if;
  if not exists (
    select 1 from public.room_post_poll_options where id = p_option_id and post_id = p_post_id
  ) then
    raise exception using errcode = '22023', message = 'poll option is unavailable';
  end if;

  insert into public.room_post_poll_votes(post_id, option_id, user_id)
  values (p_post_id, p_option_id, v_user_id)
  on conflict (post_id, user_id) do update
    set option_id = excluded.option_id, created_at = statement_timestamp();
  perform private.write_audit_event(v_user_id, 'room_post_poll.voted', 'room_post', p_post_id,
    jsonb_build_object('option_id', p_option_id));
end;
$$;
