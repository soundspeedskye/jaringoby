import type {
  AppSnapshot,
  Comment,
  Expense,
  Profile,
  Room,
  RoomPost,
  RoomPostComment,
} from "@/shared/api/types";

import { RepositoryError } from "./errors";

/** RPC·쿼리 응답에서 꼭 있어야 하는 값을 꺼낸다. 없으면 오류로 바꾼다. */

export function requireVersion(
  version: number | undefined,
  entity: string,
): number {
  if (!Number.isInteger(version) || (version ?? 0) < 1) {
    throw new RepositoryError(
      "VERSION_REQUIRED",
      `${entity}의 최신 버전을 불러온 뒤 다시 시도해 주세요.`,
    );
  }
  return version as number;
}

export function requireRoom(snapshot: AppSnapshot, id: string): Room {
  const room = snapshot.rooms.find((item) => item.id === id);
  if (!room) throw new RepositoryError("NOT_FOUND", "방을 찾을 수 없어요.");
  return room;
}

export function requireProfile(snapshot: AppSnapshot, id: string): Profile {
  const profile = snapshot.profiles.find((item) => item.id === id);
  if (!profile)
    throw new RepositoryError("NOT_FOUND", "프로필을 찾을 수 없어요.");
  return profile;
}

export function requireExpense(snapshot: AppSnapshot, id: string): Expense {
  const expense = snapshot.expenses.find((item) => item.id === id);
  if (!expense)
    throw new RepositoryError("NOT_FOUND", "지출 기록을 찾을 수 없어요.");
  return expense;
}

export function requireComment(snapshot: AppSnapshot, id: string): Comment {
  const comment = snapshot.comments.find((item) => item.id === id);
  if (!comment)
    throw new RepositoryError("NOT_FOUND", "댓글을 찾을 수 없어요.");
  return comment;
}

export function requireRoomPost(snapshot: AppSnapshot, id: string): RoomPost {
  const post = snapshot.roomPosts.find((item) => item.id === id);
  if (!post) throw new RepositoryError("NOT_FOUND", "기록을 찾을 수 없어요.");
  return post;
}

export function requireRoomPostComment(
  snapshot: AppSnapshot,
  id: string,
): RoomPostComment {
  const comment = snapshot.roomPostComments.find((item) => item.id === id);
  if (!comment)
    throw new RepositoryError("NOT_FOUND", "댓글을 찾을 수 없어요.");
  return comment;
}
