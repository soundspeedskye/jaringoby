// 댓글 행마다 불리므로 포맷터를 매번 만들지 않는다. Intl 포맷터 생성은
// 포맷 자체보다 훨씬 비싸다(→ shared/lib/format.ts에 같은 이유의 캐시가 있다).
let formatter: Intl.DateTimeFormat | undefined;

const commentTimeFormat = (): Intl.DateTimeFormat => (formatter ??= new Intl.DateTimeFormat("ko-KR", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
}));

export function formatCommentTime(value: string): string {
  return commentTimeFormat().format(new Date(value));
}
