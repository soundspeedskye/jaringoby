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
} from '@/data/types';
import { useAppExecution } from '@/providers/app-status-provider';
import { useAppStore } from '@/providers/app-store-provider';

export type AppActionsContextValue = {
  resetDemo: () => Promise<void>;
  createRoom: (input: CreateRoomInput) => Promise<Room>;
  previewInvite: (inviteCode: string) => Promise<InvitePreview>;
  joinRoom: (inviteCode: string) => Promise<RoomMember>;
  addExpense: (input: AddExpenseInput) => Promise<Expense>;
  updateExpense: (expenseId: string, patch: Partial<AddExpenseInput>) => Promise<Expense>;
  deleteExpense: (expenseId: string) => Promise<void>;
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
  const addExpense = useCallback(
    (input: AddExpenseInput) => execute(() => repository.addExpense(input)),
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
    addExpense,
    updateExpense,
    deleteExpense,
    addComment,
    updateComment,
    deleteComment,
  }), [
    addComment,
    addExpense,
    createRoom,
    deleteComment,
    deleteExpense,
    joinRoom,
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
