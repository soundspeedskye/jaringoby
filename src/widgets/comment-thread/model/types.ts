import type { AddCommentInput, Comment } from "@/shared/api/types";

export type CommentActionProps = {
  addComment: (input: AddCommentInput) => Promise<Comment>;
  deleteComment: (commentId: string) => Promise<void>;
  updateComment: (commentId: string, body: string) => Promise<Comment>;
};
