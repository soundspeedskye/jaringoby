-- 커뮤니티 댓글도 지출 댓글과 같은 1단계 답글을 지원한다.
-- 일반 삭제는 소프트 삭제라 부모 ID를 보존하고, 계정 삭제의 실제 행 삭제만 NULL로 정리한다.
alter table public.room_post_comments
  add column reply_to_comment_id uuid
    references public.room_post_comments(id) on delete set null,
  add constraint room_post_comments_not_self_reply
    check (reply_to_comment_id is null or reply_to_comment_id <> id);

create index room_post_comments_reply_idx
  on public.room_post_comments(reply_to_comment_id)
  where reply_to_comment_id is not null;

-- PostgreSQL은 함수 인자 목록을 CREATE OR REPLACE로 바꿀 수 없으므로,
-- 공개 wrapper와 내부 구현을 새 답글 인자로 다시 만든다.
drop function public.add_room_post_comment(uuid, text, uuid);
drop function private.add_room_post_comment_impl(uuid, text, uuid);

create function private.add_room_post_comment_impl(
  p_post_id uuid,
  p_body text,
  p_reply_to_comment_id uuid,
  p_client_request_id uuid
)
returns public.room_post_comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_post public.room_posts%rowtype;
  v_parent public.room_post_comments%rowtype;
  v_comment public.room_post_comments%rowtype;
  v_room public.rooms%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_client_request_id is null
     or p_body is null
     or char_length(btrim(p_body)) not between 1 and 300 then
    raise exception using errcode = '22023', message = 'comment body must be 1 to 300 characters';
  end if;

  select * into v_comment
  from public.room_post_comments
  where author_id = v_user_id and client_request_id = p_client_request_id;
  if found then return v_comment; end if;

  select * into v_post from public.room_posts where id = p_post_id;
  if v_post.id is null or v_post.deleted_at is not null then
    raise exception using errcode = '22023', message = 'post is unavailable';
  end if;
  select * into v_room from public.rooms where id = v_post.room_id;
  if v_room.status <> 'open'
     or not private.is_active_room_member(v_post.room_id, v_user_id) then
    raise exception using errcode = '42501', message = 'active room membership required';
  end if;

  if p_reply_to_comment_id is not null then
    select * into v_parent
    from public.room_post_comments
    where id = p_reply_to_comment_id;
    if v_parent.id is null or v_parent.post_id <> p_post_id then
      raise exception using errcode = '22023', message = 'reply target must be a comment on the same post';
    end if;
  end if;

  insert into public.room_post_comments(
    post_id, author_id, body, reply_to_comment_id, client_request_id
  ) values (
    p_post_id, v_user_id, btrim(p_body), p_reply_to_comment_id, p_client_request_id
  ) returning * into v_comment;

  perform private.write_audit_event(
    v_user_id,
    'room_post_comment.created',
    'room_post_comment',
    v_comment.id,
    jsonb_build_object(
      'post_id', p_post_id,
      'reply_to_comment_id', p_reply_to_comment_id
    )
  );
  return v_comment;
end;
$$;

create function public.add_room_post_comment(
  p_post_id uuid,
  p_body text,
  p_reply_to_comment_id uuid,
  p_client_request_id uuid
)
returns public.room_post_comments
language sql
security invoker
set search_path = ''
as $$
  select private.add_room_post_comment_impl(
    p_post_id,
    p_body,
    p_reply_to_comment_id,
    p_client_request_id
  );
$$;

revoke all on function private.add_room_post_comment_impl(uuid, text, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.add_room_post_comment(uuid, text, uuid, uuid)
  from public, anon, service_role;
grant execute on function public.add_room_post_comment(uuid, text, uuid, uuid)
  to authenticated;
