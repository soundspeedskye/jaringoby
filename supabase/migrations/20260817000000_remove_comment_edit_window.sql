-- 댓글 5분 편집 제한을 없앤다.
-- 작성자 본인이면 주차가 확정(F)되기 전까지 언제든 고칠 수 있다.
-- 보관된 주차의 동결은 아래 finalizes_at 검사가 그대로 맡으므로 함께 풀리지 않는다.

create or replace function private.update_comment_impl(
  p_comment_id uuid,
  p_body text,
  p_expected_version integer
)
returns public.comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_comment public.comments%rowtype;
  v_period public.periods%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'comment body must be 1 to 500 characters';
  end if;

  select c.* into v_comment
  from public.comments c
  where c.id = p_comment_id
  for update;
  if v_comment.id is null or v_comment.user_id <> v_user_id then
    raise exception using errcode = '42501', message = 'comment not found or not owned by current user';
  end if;
  if v_comment.deleted_at is not null then
    raise exception using errcode = '22023', message = 'deleted comment cannot be edited';
  end if;
  if v_comment.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'comment version conflict';
  end if;

  select p.* into strict v_period
  from public.periods p
  join public.expenses e on e.period_id = p.id
  where e.id = v_comment.expense_id;
  if statement_timestamp() >= v_period.finalizes_at
     or not private.is_active_room_member(v_period.room_id, v_user_id) then
    raise exception using errcode = '42501', message = 'comment is read-only';
  end if;

  update public.comments
  set body = btrim(p_body),
      version = version + 1,
      edited_at = statement_timestamp()
  where id = p_comment_id
  returning * into v_comment;

  perform private.write_audit_event(
    v_user_id,
    'comment.updated',
    'comment',
    v_comment.id,
    jsonb_build_object('version', v_comment.version)
  );
  return v_comment;
end;
$$;
