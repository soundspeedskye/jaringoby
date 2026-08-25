import type { CommentMentionInput, CommentReaction, SyncStatus } from "@/shared/api/types";

/** API 댓글 타입과 분리된, 대화 UI가 렌더링하는 최소 모델이다. */
export type ThreadMessage = {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  syncStatus?: SyncStatus;
  replyToId?: string;
};

export type MentionCandidate = {
  userId: string;
  nickname: string;
  avatar: string;
  avatarUri?: string;
  isCurrentUser: boolean;
};

export type ThreadFeatures = {
  replies: boolean;
  reactions: boolean;
  maxLength: number;
  placeholder: string;
};

export type CreateThreadMessageInput = {
  body: string;
  clientRequestId: string;
  replyToId?: string;
  mentions?: readonly CommentMentionInput[];
};

export type ThreadActions = {
  create: (input: CreateThreadMessageInput) => Promise<unknown>;
  update: (commentId: string, body: string) => Promise<unknown>;
  remove: (commentId: string) => Promise<void>;
  toggleReaction?: (commentId: string, emoji: CommentReaction["emoji"]) => Promise<void>;
};
