-- 삭제 여부는 deleted_at으로만 관리한다. 원문은 운영 검토를 위해 보존하되
-- 일반 사용자 화면에서는 deleted_at을 기준으로 노출하지 않는다.

create or replace function private.delete_room_post_impl(
  p_post_id uuid,
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
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select * into v_post from public.room_posts where id = p_post_id for update;
  if v_post.id is null then
    raise exception using errcode = '22023', message = 'post not found';
  end if;
  if v_post.deleted_at is not null then
    return v_post;
  end if;

  select * into v_room from public.rooms where id = v_post.room_id for update;
  if v_room.status <> 'open' or not private.is_active_room_member(v_post.room_id, v_user_id) then
    raise exception using errcode = '42501', message = 'post is read-only';
  end if;
  if v_post.author_id <> v_user_id and v_room.owner_id <> v_user_id then
    raise exception using errcode = '42501', message = 'post is not deletable';
  end if;
  if v_post.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'post version conflict';
  end if;

  update public.room_posts
  set deleted_at = statement_timestamp(),
      version = version + 1
  where id = p_post_id
  returning * into v_post;

  perform private.write_audit_event(
    v_user_id,
    'room_post.deleted',
    'room_post',
    v_post.id,
    jsonb_build_object('version', v_post.version)
  );
  return v_post;
end;
$$;

create or replace function private.delete_room_post_comment_impl(
  p_comment_id uuid,
  p_expected_version integer
)
returns public.room_post_comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_comment public.room_post_comments%rowtype;
  v_post public.room_posts%rowtype;
  v_room public.rooms%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select * into v_comment from public.room_post_comments where id = p_comment_id for update;
  if v_comment.id is null then
    raise exception using errcode = '22023', message = 'comment not found';
  end if;
  if v_comment.deleted_at is not null then
    return v_comment;
  end if;
  if v_comment.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'comment version conflict';
  end if;

  select * into v_post from public.room_posts where id = v_comment.post_id;
  select * into v_room from public.rooms where id = v_post.room_id;
  if v_room.status <> 'open' or not private.is_active_room_member(v_post.room_id, v_user_id) then
    raise exception using errcode = '42501', message = 'comment is read-only';
  end if;
  if v_comment.author_id <> v_user_id and v_room.owner_id <> v_user_id then
    raise exception using errcode = '42501', message = 'comment is not deletable';
  end if;

  update public.room_post_comments
  set deleted_at = statement_timestamp(),
      version = version + 1
  where id = p_comment_id
  returning * into v_comment;
  return v_comment;
end;
$$;

-- 삭제된 원문은 운영자만 DB에서 검토한다. 일반 앱 클라이언트에는 본문뿐 아니라
-- 사진, 투표 선택지, 반응도 반환하지 않는다.
drop policy if exists room_posts_read_room_members on public.room_posts;
create policy room_posts_read_room_members on public.room_posts
for select to authenticated
using (
  deleted_at is null
  and private.is_room_member(room_id, auth.uid())
);

drop policy if exists room_post_comments_read_room_members on public.room_post_comments;
create policy room_post_comments_read_room_members on public.room_post_comments
for select to authenticated
using (
  room_post_comments.deleted_at is null
  and exists (
    select 1 from public.room_posts post
    where post.id = room_post_comments.post_id
      and post.deleted_at is null
      and private.is_room_member(post.room_id, auth.uid())
  )
);

drop policy if exists room_post_reactions_read_room_members on public.room_post_reactions;
create policy room_post_reactions_read_room_members on public.room_post_reactions
for select to authenticated
using (
  exists (
    select 1 from public.room_posts post
    where post.id = room_post_reactions.post_id
      and post.deleted_at is null
      and private.is_room_member(post.room_id, auth.uid())
  )
);

drop policy if exists room_post_poll_options_read_room_members on public.room_post_poll_options;
create policy room_post_poll_options_read_room_members on public.room_post_poll_options
for select to authenticated
using (
  exists (
    select 1 from public.room_posts post
    where post.id = room_post_poll_options.post_id
      and post.deleted_at is null
      and private.is_room_member(post.room_id, auth.uid())
  )
);

drop policy if exists room_post_poll_votes_read_room_members on public.room_post_poll_votes;
create policy room_post_poll_votes_read_room_members on public.room_post_poll_votes
for select to authenticated
using (
  exists (
    select 1 from public.room_posts post
    where post.id = room_post_poll_votes.post_id
      and post.deleted_at is null
      and private.is_room_member(post.room_id, auth.uid())
  )
);

drop policy if exists room_post_images_read_room_members on storage.objects;
create policy room_post_images_read_room_members
on storage.objects for select to authenticated
using (
  bucket_id = 'room-post-images'
  and exists (
    select 1 from public.room_posts post
    where post.photo_path = storage.objects.name
      and post.deleted_at is null
      and private.is_room_member(post.room_id, auth.uid())
  )
);
