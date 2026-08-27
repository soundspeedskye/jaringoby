-- 커뮤니티 글 수정은 생성 시의 카테고리별 검증을 그대로 다시 적용한다.

drop function if exists public.update_room_post(uuid, text, integer);
drop function if exists private.update_room_post_impl(uuid, text, integer);

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
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_post public.room_posts%rowtype;
  v_room public.rooms%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'post title must be 1 to 100 characters';
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'post body must be 1 to 500 characters';
  end if;

  select * into v_post from public.room_posts where id = p_post_id for update;
  if v_post.id is null or v_post.deleted_at is not null then
    raise exception using errcode = '22023', message = 'post is unavailable';
  end if;
  select * into v_room from public.rooms where id = v_post.room_id for update;
  if v_room.status <> 'open' then
    raise exception using errcode = '22023', message = 'room is closed';
  end if;
  if not private.is_active_room_member(v_post.room_id, v_user_id) then
    raise exception using errcode = '42501', message = 'active room membership required';
  end if;
  if v_post.author_id <> v_user_id
    and not (v_post.kind = 'notice' and v_room.owner_id = v_user_id) then
    raise exception using errcode = '42501', message = 'post is not editable';
  end if;
  if v_post.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'post version conflict';
  end if;

  if p_category = 'secret_purchase' then
    if v_post.kind <> 'post' or p_secret_purchase_amount is null or p_secret_purchase_amount <= 0
      or p_secret_purchase_occurred_at is null or p_secret_purchase_category is null then
      raise exception using errcode = '22023', message = 'secret purchase requires amount, occurred_at and category';
    end if;
  elsif p_secret_purchase_amount is not null or p_secret_purchase_occurred_at is not null
    or p_secret_purchase_category is not null then
    raise exception using errcode = '22023', message = 'only secret purchases may include purchase details';
  end if;
  if p_photo_path is not null and p_photo_path <> v_post.photo_path
    and position(v_user_id::text || '/' in p_photo_path) <> 1 then
    raise exception using errcode = '22023', message = 'photo path does not belong to the current user';
  end if;

  update public.room_posts
  set category = p_category,
      title = btrim(p_title),
      body = btrim(p_body),
      photo_path = p_photo_path,
      secret_purchase_amount = p_secret_purchase_amount,
      secret_purchase_occurred_at = p_secret_purchase_occurred_at,
      secret_purchase_category = p_secret_purchase_category,
      version = version + 1
  where id = p_post_id
  returning * into v_post;

  perform private.write_audit_event(
    v_user_id,
    'room_post.updated',
    'room_post',
    v_post.id,
    jsonb_build_object('version', v_post.version)
  );
  return v_post;
end;
$$;

create or replace function public.update_room_post(
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
language sql security invoker set search_path = ''
as $$ select private.update_room_community_post_impl(
  p_post_id, p_category, p_title, p_body, p_photo_path,
  p_secret_purchase_amount, p_secret_purchase_occurred_at,
  p_secret_purchase_category, p_expected_version
); $$;

revoke all on function public.update_room_post(
  uuid, public.room_post_category, text, text, text, bigint, timestamptz,
  public.expense_category, integer
) from public, anon, service_role;
grant execute on function public.update_room_post(
  uuid, public.room_post_category, text, text, text, bigint, timestamptz,
  public.expense_category, integer
) to authenticated;
