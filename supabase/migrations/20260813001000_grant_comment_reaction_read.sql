-- public 스키마는 기본 권한이 차단되어 있으므로, 새 반응 테이블의 읽기 권한을
-- 명시적으로 부여해야 RLS 정책이 평가된다.
grant select on table public.comment_reactions to authenticated;
