import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useMemo } from 'react';

import type { AppRepository } from '@/shared/api/repository';
import type {
  AddCommentInput,
  AddRoomPostCommentInput,
  AddRoomPostInput,
  AddExpenseInput,
  Comment,
  CommentReactionEmoji,
  CreateRoomInput,
  Expense,
  InvitePreview,
  Room,
  RoomMember,
  Profile,
  RoomPost,
  RoomPostComment,
  RoomPostReactionEmoji,
  ExpenseExceptionResponseDecision,
  SwitchRoomInput,
  UpdateRoomSettingsInput,
  UpdateRoomPostInput,
} from '@/shared/api/types';
import { useAppExecution } from '@/shared/providers/app-status-provider';

export type AppActionsContextValue = {
  updateNickname: (nickname: string) => Promise<Profile>;
  updateAvatar: (input: { avatarKey?: string; photoUri?: string | null }) => Promise<Profile>;
  createRoom: (input: CreateRoomInput) => Promise<Room>;
  updateRoomSettings: (input: UpdateRoomSettingsInput) => Promise<Room>;
  previewInvite: (inviteCode: string) => Promise<InvitePreview>;
  joinRoom: (inviteCode: string) => Promise<RoomMember>;
  leaveRoom: (roomId: string, successorId?: string) => Promise<void>;
  closeRoom: (roomId: string) => Promise<void>;
  switchRoom: (input: SwitchRoomInput) => Promise<RoomMember>;
  addExpense: (input: AddExpenseInput) => Promise<Expense>;
  respondToExpenseException: (
    expenseId: string,
    decision: ExpenseExceptionResponseDecision,
  ) => Promise<void>;
  withdrawExpenseException: (expenseId: string) => Promise<void>;
  updateExpense: (expenseId: string, patch: Partial<AddExpenseInput>) => Promise<Expense>;
  deleteExpense: (expenseId: string) => Promise<void>;
  deleteArchivedPeriod: (periodId: string) => Promise<void>;
  addComment: (input: AddCommentInput) => Promise<Comment>;
  updateComment: (commentId: string, body: string) => Promise<Comment>;
  deleteComment: (commentId: string) => Promise<void>;
  toggleCommentReaction: (commentId: string, emoji: CommentReactionEmoji) => Promise<void>;
  addRoomPost: (input: AddRoomPostInput) => Promise<RoomPost>;
  updateRoomPost: (input: UpdateRoomPostInput) => Promise<RoomPost>;
  deleteRoomPost: (postId: string) => Promise<void>;
  addRoomPostComment: (input: AddRoomPostCommentInput) => Promise<RoomPostComment>;
  updateRoomPostComment: (commentId: string, body: string) => Promise<RoomPostComment>;
  deleteRoomPostComment: (commentId: string) => Promise<void>;
  toggleRoomPostReaction: (postId: string, emoji: RoomPostReactionEmoji) => Promise<void>;
  markRoomPostRead: (postId: string) => Promise<void>;
  voteRoomPostPoll: (postId: string, optionId: string) => Promise<void>;
  markNotificationsRead: (notificationIds: readonly string[]) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
};

const AppActionsContext = createContext<AppActionsContextValue | null>(null);

export function AppActionsProvider({
  children,
  repository,
}: PropsWithChildren<{ repository: AppRepository }>) {
  const { execute } = useAppExecution();
  const updateNickname = useCallback(
    (nickname: string) => execute(() => repository.updateNickname(nickname)),
    [execute, repository],
  );
  const updateAvatar = useCallback(
    (input: { avatarKey?: string; photoUri?: string | null }) =>
      execute(() => repository.updateAvatar(input)),
    [execute, repository],
  );
  const createRoom = useCallback(
    (input: CreateRoomInput) => execute(() => repository.createRoom(input)),
    [execute, repository],
  );
  const updateRoomSettings = useCallback(
    (input: UpdateRoomSettingsInput) =>
      execute(() => repository.updateRoomSettings(input)),
    [execute, repository],
  );
  const previewInvite = useCallback(
    (code: string) => execute(() => repository.previewInvite(code)),
    [execute, repository],
  );
  const joinRoom = useCallback(
    (code: string) => execute(() => repository.joinRoom(code)),
    [execute, repository],
  );
  const leaveRoom = useCallback(
    (roomId: string, successorId?: string) =>
      execute(() => repository.leaveRoom(roomId, successorId)),
    [execute, repository],
  );
  const closeRoom = useCallback(
    (roomId: string) => execute(() => repository.closeRoom(roomId)),
    [execute, repository],
  );
  const switchRoom = useCallback(
    (input: SwitchRoomInput) => execute(() => repository.switchRoom(input)),
    [execute, repository],
  );
  const addExpense = useCallback(
    (input: AddExpenseInput) => execute(() => repository.addExpense(input)),
    [execute, repository],
  );
  const respondToExpenseException = useCallback(
    (expenseId: string, decision: ExpenseExceptionResponseDecision) =>
      execute(() => repository.respondToExpenseException(expenseId, decision)),
    [execute, repository],
  );
  const withdrawExpenseException = useCallback(
    (expenseId: string) => execute(() => repository.withdrawExpenseException(expenseId)),
    [execute, repository],
  );
  const updateExpense = useCallback(
    (expenseId: string, patch: Partial<AddExpenseInput>) => execute(() => repository.updateExpense(expenseId, patch)),
    [execute, repository],
  );
  const deleteExpense = useCallback(
    (expenseId: string) => execute(() => repository.deleteExpense(expenseId)),
    [execute, repository],
  );
  const deleteArchivedPeriod = useCallback(
    (periodId: string) => execute(() => repository.deleteArchivedPeriod(periodId)),
    [execute, repository],
  );
  const addComment = useCallback(
    (input: AddCommentInput) => execute(() => repository.addComment(input)),
    [execute, repository],
  );
  const updateComment = useCallback(
    (commentId: string, body: string) => execute(() => repository.updateComment(commentId, body)),
    [execute, repository],
  );
  const deleteComment = useCallback(
    (commentId: string) => execute(() => repository.deleteComment(commentId)),
    [execute, repository],
  );
  const toggleCommentReaction = useCallback(
    (commentId: string, emoji: CommentReactionEmoji) =>
      execute(() => repository.toggleCommentReaction(commentId, emoji)),
    [execute, repository],
  );
  const addRoomPost = useCallback(
    (input: AddRoomPostInput) => execute(() => repository.addRoomPost(input)),
    [execute, repository],
  );
  const updateRoomPost = useCallback(
    (input: UpdateRoomPostInput) => execute(() => repository.updateRoomPost(input)),
    [execute, repository],
  );
  const deleteRoomPost = useCallback(
    (postId: string) => execute(() => repository.deleteRoomPost(postId)),
    [execute, repository],
  );
  const addRoomPostComment = useCallback(
    (input: AddRoomPostCommentInput) => execute(() => repository.addRoomPostComment(input)),
    [execute, repository],
  );
  const updateRoomPostComment = useCallback(
    (commentId: string, body: string) => execute(() => repository.updateRoomPostComment(commentId, body)),
    [execute, repository],
  );
  const deleteRoomPostComment = useCallback(
    (commentId: string) => execute(() => repository.deleteRoomPostComment(commentId)),
    [execute, repository],
  );
  const toggleRoomPostReaction = useCallback(
    (postId: string, emoji: RoomPostReactionEmoji) =>
      execute(() => repository.toggleRoomPostReaction(postId, emoji)),
    [execute, repository],
  );
  const markRoomPostRead = useCallback(
    (postId: string) => execute(() => repository.markRoomPostRead(postId)),
    [execute, repository],
  );
  const voteRoomPostPoll = useCallback(
    (postId: string, optionId: string) => execute(() => repository.voteRoomPostPoll(postId, optionId)),
    [execute, repository],
  );
  const markNotificationsRead = useCallback(
    (notificationIds: readonly string[]) =>
      execute(() => repository.markNotificationsRead(notificationIds)),
    [execute, repository],
  );
  const markAllNotificationsRead = useCallback(
    () => execute(() => repository.markAllNotificationsRead()),
    [execute, repository],
  );

  const value = useMemo<AppActionsContextValue>(() => ({
    updateNickname,
    updateAvatar,
    createRoom,
    updateRoomSettings,
    previewInvite,
    joinRoom,
    leaveRoom,
    closeRoom,
    switchRoom,
    addExpense,
    respondToExpenseException,
    withdrawExpenseException,
    updateExpense,
    deleteExpense,
    deleteArchivedPeriod,
    addComment,
    updateComment,
    deleteComment,
    toggleCommentReaction,
    addRoomPost,
    updateRoomPost,
    deleteRoomPost,
    addRoomPostComment,
    updateRoomPostComment,
    deleteRoomPostComment,
    toggleRoomPostReaction,
    markRoomPostRead,
    voteRoomPostPoll,
    markNotificationsRead,
    markAllNotificationsRead,
  }), [
    addComment,
    addExpense,
    respondToExpenseException,
    withdrawExpenseException,
    closeRoom,
    createRoom,
    updateRoomSettings,
    deleteComment,
    toggleCommentReaction,
    addRoomPost,
    updateRoomPost,
    deleteRoomPost,
    addRoomPostComment,
    updateRoomPostComment,
    deleteRoomPostComment,
    toggleRoomPostReaction,
    markRoomPostRead,
    voteRoomPostPoll,
    deleteArchivedPeriod,
    deleteExpense,
    joinRoom,
    leaveRoom,
    switchRoom,
    previewInvite,
    updateAvatar,
    updateNickname,
    updateComment,
    updateExpense,
    markAllNotificationsRead,
    markNotificationsRead,
  ]);

  return <AppActionsContext.Provider value={value}>{children}</AppActionsContext.Provider>;
}

export function useAppActions(): AppActionsContextValue {
  const context = useContext(AppActionsContext);
  if (!context) throw new Error('useAppActions must be used inside AppActionsProvider');
  return context;
}
