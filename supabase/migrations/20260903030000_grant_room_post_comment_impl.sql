-- 답글 마이그레이션이 impl을 drop 후 다시 만들면서 authenticated의 EXECUTE까지
-- 회수했다. 공개 wrapper는 security invoker라 호출자 권한으로 impl을 부르므로
-- 댓글 작성이 42501(Forbidden)로 막힌다. 다른 impl과 같은 규칙으로 되돌린다.
-- impl 자체가 security definer로 인증·방 멤버십·방 상태를 모두 검사한다.
grant execute on function private.add_room_post_comment_impl(uuid, text, uuid, uuid)
  to authenticated;
