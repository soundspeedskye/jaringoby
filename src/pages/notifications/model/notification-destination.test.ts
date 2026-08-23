import { describe, expect, it } from "vitest";

import { notificationDestination } from "@/pages/notifications/model/notification-destination";
import type { AppNotification } from "@/shared/api/types";

function notification(overrides: Partial<AppNotification>): AppNotification {
  return {
    id: "n1",
    userId: "u1",
    kind: "expense_created",
    route: "/rooms/legacy/members",
    createdAt: "2026-08-23T00:00:00.000Z",
    ...overrides,
  };
}

describe("notificationDestination", () => {
  it("댓글 소식은 지출 상세로 가면서 댓글 id를 함께 넘긴다", () => {
    const destination = notificationDestination(
      notification({ kind: "expense_comment", expenseId: "e1", commentId: "c1" }),
    );

    expect(destination).toEqual({
      type: "push",
      pathname: "/expense/[id]",
      params: { id: "e1", cid: "c1" },
    });
  });

  it("답글 소식도 같은 규칙을 따른다", () => {
    const destination = notificationDestination(
      notification({ kind: "comment_reply", expenseId: "e2", commentId: "c2" }),
    );

    expect(destination).toEqual({
      type: "push",
      pathname: "/expense/[id]",
      params: { id: "e2", cid: "c2" },
    });
  });

  it("댓글 id가 없는 지출 소식은 지출 상세로만 보낸다", () => {
    const destination = notificationDestination(
      notification({ kind: "expense_created", expenseId: "e3" }),
    );

    expect(destination).toEqual({
      type: "push",
      pathname: "/expense/[id]",
      params: { id: "e3" },
    });
  });

  it("공지 소식은 글 상세로 바로 보낸다", () => {
    const destination = notificationDestination(
      notification({ kind: "room_notice", postId: "p1" }),
    );

    expect(destination).toEqual({ type: "push", pathname: "/room/board/p1" });
  });

  it("post_id가 없던 시절의 공지 소식은 목록으로 보낸다", () => {
    const destination = notificationDestination(notification({ kind: "room_notice" }));

    expect(destination).toEqual({ type: "push", pathname: "/room/board" });
  });

  it("갈 화면이 없는 소식은 홈으로 보낸다", () => {
    const destination = notificationDestination(notification({ kind: "member_joined" }));

    expect(destination).toEqual({ type: "dismissTo", pathname: "/" });
  });

  it("저장된 route 컬럼은 쓰지 않는다", () => {
    const destination = notificationDestination(
      notification({
        kind: "expense_comment",
        expenseId: "e4",
        commentId: "c4",
        route: "/challenges/old/expenses/e4",
      }),
    );

    expect(destination).toEqual({
      type: "push",
      pathname: "/expense/[id]",
      params: { id: "e4", cid: "c4" },
    });
  });
});
