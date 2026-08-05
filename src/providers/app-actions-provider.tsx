import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useMemo } from 'react';

import type { AppRepository } from '@/data/repository';
import type {
  AddCommentInput,
  AddExpenseInput,
  Comment,
  CreateRoomInput,
  Expense,
  InvitePreview,
  Room,
  RoomMember,
  SwitchRoomInput,
} from '@/data/types';
import { useAppExecution } from '@/providers/app-status-provider';
import { useAppStore } from '@/providers/app-store-provider';

export type AppActionsContextValue = {
  resetDemo: () => Promise<void>;
  createRoom: (input: CreateRoomInput) => Promise<Room>;
  previewInvite: (inviteCode: string) => Promise<InvitePreview>;
  joinRoom: (inviteCode: string) => Promise<RoomMember>;
  leaveRoom: (roomId: string, successorId?: string) => Promise<void>;
  closeRoom: (roomId: string) => Promise<void>;
  switchRoom: (input: SwitchRoomInput) => Promise<RoomMember>;
  addExpense: (input: AddExpenseInput) => Promise<Expense>;
  approveExpenseException: (expenseId: string) => Promise<void>;
  removeExpenseExceptionApproval: (expenseId: string) => Promise<void>;
  withdrawExpenseException: (expenseId: string) => Promise<void>;
  updateExpense: (expenseId: string, patch: Partial<AddExpenseInput>) => Promise<Expense>;
  deleteExpense: (expenseId: string) => Promise<void>;
  deleteArchivedPeriod: (periodId: string) => Promise<void>;
  addComment: (input: AddCommentInput) => Promise<Comment>;
  updateComment: (commentId: string, body: string) => Promise<Comment>;
  deleteComment: (commentId: string) => Promise<void>;
};

const AppActionsContext = createContext<AppActionsContextValue | null>(null);

export function AppActionsProvider({
  children,
  repository,
}: PropsWithChildren<{ repository: AppRepository }>) {
  const store = useAppStore();
  const { execute } = useAppExecution();
  const resetDemo = useCallback(
    () => execute(async () => void store.setSnapshot(await repository.resetDemo())),
    [execute, repository, store],
  );
  const createRoom = useCallback(
    (input: CreateRoomInput) => execute(() => repository.createRoom(input)),
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
  const approveExpenseException = useCallback(
    (expenseId: string) => execute(() => repository.approveExpenseException(expenseId)),
    [execute, repository],
  );
  const removeExpenseExceptionApproval = useCallback(
    (expenseId: string) =>
      execute(() => repository.removeExpenseExceptionApproval(expenseId)),
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

  const value = useMemo<AppActionsContextValue>(() => ({
    resetDemo,
    createRoom,
    previewInvite,
    joinRoom,
    leaveRoom,
    closeRoom,
    switchRoom,
    addExpense,
    approveExpenseException,
    removeExpenseExceptionApproval,
    withdrawExpenseException,
    updateExpense,
    deleteExpense,
    deleteArchivedPeriod,
    addComment,
    updateComment,
    deleteComment,
  }), [
    addComment,
    addExpense,
    approveExpenseException,
    removeExpenseExceptionApproval,
    withdrawExpenseException,
    closeRoom,
    createRoom,
    deleteComment,
    deleteArchivedPeriod,
    deleteExpense,
    joinRoom,
    leaveRoom,
    switchRoom,
    previewInvite,
    resetDemo,
    updateComment,
    updateExpense,
  ]);

  return <AppActionsContext.Provider value={value}>{children}</AppActionsContext.Provider>;
}

export function useAppActions(): AppActionsContextValue {
  const context = useContext(AppActionsContext);
  if (!context) throw new Error('useAppActions must be used inside AppActionsProvider');
  return context;
}
