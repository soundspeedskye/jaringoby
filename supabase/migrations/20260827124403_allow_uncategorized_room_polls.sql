-- 투표는 카테고리 분류 대상이 아니다. 기존에 UI 기본값으로 저장된 카테고리도 비운다.
alter table public.room_posts
  drop constraint if exists room_posts_secret_purchase_shape,
  alter column category drop not null;

update public.room_posts
set category = null
where kind = 'poll';

alter table public.room_posts
  add constraint room_posts_category_shape check (
    (
      kind = 'poll'
      and category is null
      and secret_purchase_amount is null
      and secret_purchase_occurred_at is null
      and secret_purchase_category is null
    )
    or (
      kind <> 'poll'
      and category is not null
      and (
        (
          category = 'secret_purchase'
          and kind = 'post'
          and secret_purchase_amount > 0
          and secret_purchase_occurred_at is not null
          and secret_purchase_category is not null
        )
        or (
          category <> 'secret_purchase'
          and secret_purchase_amount is null
          and secret_purchase_occurred_at is null
          and secret_purchase_category is null
        )
      )
    )
  );

create or replace function private.add_room_community_post_impl(
  p_room_id uuid,
  p_kind public.room_post_kind,
  p_category public.room_post_category,
  p_title text,
  p_body text,
  p_options text[],
  p_photo_path text,
  p_secret_purchase_amount bigint,
  p_secret_purchase_occurred_at timestamptz,
  p_secret_purchase_category public.expense_category,
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
  if p_title is null or char_length(btrim(p_title)) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'post title must be 1 to 100 characters';
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'post body must be 1 to 500 characters';
  end if;
  if p_kind = 'poll' then
    if p_category is not null then raise exception using errcode = '22023', message = 'polls must not have a category'; end if;
    if p_options is null or cardinality(p_options) not between 2 and 4
      or exists (select 1 from unnest(p_options) option_body where char_length(btrim(option_body)) not between 1 and 60)
      or (select count(distinct btrim(option_body)) from unnest(p_options) option_body) <> cardinality(p_options) then
      raise exception using errcode = '22023', message = 'poll must have 2 to 4 distinct options of 1 to 60 characters';
    end if;
  else
    if p_category is null then raise exception using errcode = '22023', message = 'post category is required'; end if;
    if p_options is not null and cardinality(p_options) > 0 then
      raise exception using errcode = '22023', message = 'only polls may include options';
    end if;
  end if;
  if p_category = 'secret_purchase' then
    if p_kind <> 'post' or p_secret_purchase_amount is null or p_secret_purchase_amount <= 0
      or p_secret_purchase_occurred_at is null or p_secret_purchase_category is null then
      raise exception using errcode = '22023', message = 'secret purchase requires amount, occurred_at and category';
    end if;
  elsif p_secret_purchase_amount is not null or p_secret_purchase_occurred_at is not null or p_secret_purchase_category is not null then
    raise exception using errcode = '22023', message = 'only secret purchases may include purchase details';
  end if;
  if p_photo_path is not null and position(v_user_id::text || '/' in p_photo_path) <> 1 then
    raise exception using errcode = '22023', message = 'photo path does not belong to the current user';
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
    room_id, period_id, kind, category, author_id, title, body, photo_path,
    secret_purchase_amount, secret_purchase_occurred_at, secret_purchase_category,
    poll_closes_at, client_request_id
  ) values (
    p_room_id, private.current_room_period_id(p_room_id), p_kind, p_category,
    v_user_id, btrim(p_title), btrim(p_body), p_photo_path,
    p_secret_purchase_amount, p_secret_purchase_occurred_at, p_secret_purchase_category,
    case when p_kind = 'poll' then (
      date_trunc('day', statement_timestamp() at time zone 'Asia/Seoul') + interval '2 days'
    ) at time zone 'Asia/Seoul' end,
    p_client_request_id
  ) returning * into v_post;

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
        null, null, '/community', 'room_notice:' || v_post.id::text
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

create or replace function private.update_room_community_post_impl(
  p_post_id uuid,
  p_category public.room_post_category,
  p_title text,
  p_body text,
  p_photo_path text,
  p_secret_purchase_amount bigint,
  p_secret_purchase_occurred_at timestamptz,
  p_secret_purchase_category public.expense_category,
  p_expected_version integer
)
returns public.room_posts
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
  if p_title is null or char_length(btrim(p_title)) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'post title must be 1 to 100 characters';
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'post body must be 1 to 500 characters';
  end if;

  select * into v_post from public.room_posts where id = p_post_id for update;
  if v_post.id is null or v_post.deleted_at is not null then raise exception using errcode = '22023', message = 'post is unavailable'; end if;
  select * into v_room from public.rooms where id = v_post.room_id for update;
  if v_room.status <> 'open' then raise exception using errcode = '22023', message = 'room is closed'; end if;
  if not private.is_active_room_member(v_post.room_id, v_user_id) then raise exception using errcode = '42501', message = 'active room membership required'; end if;
  if v_post.author_id <> v_user_id and not (v_post.kind = 'notice' and v_room.owner_id = v_user_id) then
    raise exception using errcode = '42501', message = 'post is not editable';
  end if;
  if v_post.version <> p_expected_version then raise exception using errcode = '40001', message = 'post version conflict'; end if;

  if v_post.kind = 'poll' then
    if p_category is not null then raise exception using errcode = '22023', message = 'polls must not have a category'; end if;
  elsif p_category is null then
    raise exception using errcode = '22023', message = 'post category is required';
  end if;
  if p_category = 'secret_purchase' then
    if v_post.kind <> 'post' or p_secret_purchase_amount is null or p_secret_purchase_amount <= 0
      or p_secret_purchase_occurred_at is null or p_secret_purchase_category is null then
      raise exception using errcode = '22023', message = 'secret purchase requires amount, occurred_at and category';
    end if;
  elsif p_secret_purchase_amount is not null or p_secret_purchase_occurred_at is not null or p_secret_purchase_category is not null then
    raise exception using errcode = '22023', message = 'only secret purchases may include purchase details';
  end if;
  if p_photo_path is not null and p_photo_path <> v_post.photo_path
    and position(v_user_id::text || '/' in p_photo_path) <> 1 then
    raise exception using errcode = '22023', message = 'photo path does not belong to the current user';
  end if;

  update public.room_posts
  set category = p_category, title = btrim(p_title), body = btrim(p_body), photo_path = p_photo_path,
      secret_purchase_amount = p_secret_purchase_amount,
      secret_purchase_occurred_at = p_secret_purchase_occurred_at,
      secret_purchase_category = p_secret_purchase_category,
      version = version + 1
  where id = p_post_id
  returning * into v_post;
  perform private.write_audit_event(v_user_id, 'room_post.updated', 'room_post', v_post.id,
    jsonb_build_object('version', v_post.version));
  return v_post;
end;
$$;

revoke all on function public.add_room_post(
  uuid, public.room_post_kind, public.room_post_category, text, text, text[], text, bigint,
  timestamptz, public.expense_category, uuid
) from public, anon, service_role;
grant execute on function public.add_room_post(
  uuid, public.room_post_kind, public.room_post_category, text, text, text[], text, bigint,
  timestamptz, public.expense_category, uuid
) to authenticated;

revoke all on function public.update_room_post(
  uuid, public.room_post_category, text, text, text, bigint, timestamptz,
  public.expense_category, integer
) from public, anon, service_role;
grant execute on function public.update_room_post(
  uuid, public.room_post_category, text, text, text, bigint, timestamptz,
  public.expense_category, integer
) to authenticated;
