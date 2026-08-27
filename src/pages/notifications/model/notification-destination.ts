import type { AppNotification } from "@/shared/api/types";

/**
 * 소식 하나를 눌렀을 때 갈 곳.
 *
 * `push`는 소식함 위에 쌓아 뒤로가기로 돌아오게 하고, `dismissTo`는 갈 화면이
 * 따로 없어 홈으로 보내는 경우다.
 *
 * 저장된 `notification.route` 컬럼은 쓰지 않는다. 라우트 구조가 바뀌기 전의
 * 값(`/rooms/...`, `/challenges/...`)이 그대로 남아 있어 앱에 없는 경로다.
 */
export type NotificationDestination =
  | { type: "push"; pathname: string; params?: Record<string, string> }
  | { type: "dismissTo"; pathname: "/" };

export function notificationDestination(
  notification: AppNotification,
): NotificationDestination {
  // 댓글·답글 소식은 어느 댓글 때문에 왔는지까지 데려간다.
  if (notification.expenseId) {
    return {
      type: "push",
      pathname: "/expense/[id]",
      params: {
        id: notification.expenseId,
        ...(notification.commentId ? { cid: notification.commentId } : {}),
      },
    };
  }
  // 공지는 목록이 아니라 그 글로 바로 보낸다.
  if (notification.postId) {
    return { type: "push", pathname: `/community/${notification.postId}` };
  }
  // post_id를 채우기 전에 쌓인 오래된 공지 소식은 글을 특정할 수 없어 목록으로 보낸다.
  if (notification.kind === "room_notice") {
    return { type: "push", pathname: "/community" };
  }
  return { type: "dismissTo", pathname: "/" };
}
