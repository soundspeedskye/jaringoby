import { File as ExpoFile } from 'expo-file-system';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

import type { AppRepository, Unsubscribe, UpdateExpenseOptions } from '@/shared/api/repository';
import { createSupabaseClientForAccessToken } from '@/shared/api/supabase-client';
import type {
  AddCommentInput,
  AddRoomPostCommentInput,
  AddRoomPostInput,
  AddExpenseInput,
  AppSnapshot,
  Comment,
  CommentReactionEmoji,
  CreateRoomInput,
  Expense,
  InvitePreview,
  Profile,
  Room,
  RoomMember,
  RoomPost,
  RoomPostComment,
  RoomPostReactionEmoji,
  SwitchRoomInput,
  UpdateRoomSettingsInput,
} from '@/shared/api/types';
import type {
  CommentReactionRow,
  CommentRow,
  ExpenseExceptionApprovalRow,
  ExpenseExceptionRow,
  ExpenseRow,
  InviteCodeRow,
  JsonObject,
  NotificationRow,
  PeriodDayRow,
  PeriodMemberRow,
  PeriodResultRow,
  PeriodStatusRow,
  PreferenceRow,
  ProfileRow,
  RoomMemberRow,
  RoomMemberStatsRow,
  RoomPostCommentRow,
  RoomPostReactionRow,
  RoomPostRow,
  RoomRow,
} from './supabase/rows';
import { CATEGORY_TO_DATABASE } from './supabase/rows';
import {
  asObject,
  hash32,
  mapComment,
  mapCommentReaction,
  mapExpense,
  mapExpenseException,
  mapExpenseExceptionApproval,
  mapInvitePreview,
  mapNotification,
  mapPeriod,
  mapPeriodMember,
  mapPeriodResult,
  mapProfile,
  mapRoom,
  mapRoomMember,
  mapRoomPost,
  mapRoomPostComment,
  mapRoomPostReaction,
  mapStats,
  requiredString,
} from './supabase/mappers';
import { RepositoryError } from './supabase/errors';

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const SIGNED_URL_REFRESH_MS = 50 * 60 * 1_000;
const MAX_EXPENSE_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;
const EXPENSE_COLUMNS =
  'id,client_request_id,period_id,user_id,amount,point_amount,category,memo,photo_path,occurred_at,created_at,updated_at,deleted_at,version';
const COMMENT_COLUMNS =
  'id,client_request_id,expense_id,user_id,body,reply_to_comment_id,created_at,updated_at,deleted_at,version';
const NOTIFICATION_COLUMNS =
  'id,user_id,kind,actor_id,room_id,period_id,expense_id,comment_id,post_id,route,read_at,created_at';
const ROOM_POST_COLUMNS =
  'id,client_request_id,room_id,period_id,kind,author_id,body,created_at,updated_at,deleted_at,version';
const ROOM_POST_COMMENT_COLUMNS =
  'id,client_request_id,post_id,author_id,body,created_at,updated_at,deleted_at,version';
const REALTIME_TABLES = [
  'profiles',
  'rooms',
  'room_members',
  'periods',
  'period_members',
  'period_results',
  'expenses',
  'comments',
  'comment_reactions',
  'room_posts',
  'room_post_comments',
  'room_post_reactions',
  'notifications',
  'expense_exceptions',
  'expense_exception_approvals',
] as const;
type RealtimeTable = (typeof REALTIME_TABLES)[number];

type SupabaseRepositoryOptions = {
  fixedUserId?: string;
  observeAuth?: boolean;
};

type ReloadJob = {
  isFullReloadInFlight: boolean;
  needsFullReload: boolean;
  promise: Promise<AppSnapshot>;
  tables: Set<RealtimeTable>;
};

function mergeReloadRequest(
  job: ReloadJob,
  tables: ReadonlySet<RealtimeTable> | undefined,
): void {
  if (tables === undefined) {
    if (job.needsFullReload || job.isFullReloadInFlight) return;
    job.needsFullReload = true;
    job.tables.clear();
    return;
  }
  if (job.needsFullReload) return;
  tables.forEach((table) => job.tables.add(table));
}

export class SupabaseRepository implements AppRepository {
  private readonly listeners = new Set<(snapshot: AppSnapshot) => void>();
  private lastSnapshot: AppSnapshot | null = null;
  private loading: Promise<AppSnapshot> | null = null;
  private realtimeChannel: RealtimeChannel | null = null;
  private realtimeUserId: string | null = null;
  private realtimeReloadTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly realtimeDirtyTables = new Set<RealtimeTable>();
  private realtimeNeedsFullReload = false;
  private signedUrlRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private reloadJob: ReloadJob | null = null;
  private authUserId: string | null | undefined;
  private authGeneration = 0;

  private readonly fixedUserId?: string;

  constructor(
    private readonly client: SupabaseClient,
    options: SupabaseRepositoryOptions = {},
  ) {
    this.fixedUserId = options.fixedUserId;
    if (this.fixedUserId) this.authUserId = this.fixedUserId;
    if (options.observeAuth === false) return;
    this.client.auth.onAuthStateChange((event, session) => {
      const nextUserId = session?.user.id ?? null;
      const userChanged = this.authUserId !== undefined && this.authUserId !== nextUserId;
      this.authUserId = nextUserId;
      if (!session || userChanged) {
        this.authGeneration += 1;
        this.lastSnapshot = null;
        this.loading = null;
        this.reloadJob = null;
        void this.teardownRealtime();
      } else if (event === 'SIGNED_IN' && this.listeners.size > 0) {
        this.scheduleRealtimeReload();
      }
    });
  }

  async runAsUser<T>(
    userId: string,
    work: (repository: AppRepository) => Promise<T>,
  ): Promise<T> {
    if (this.fixedUserId) {
      if (this.fixedUserId !== userId) {
        throw new RepositoryError('SESSION_CHANGED', '로그인 사용자가 바뀌었어요.');
      }
      return work(this);
    }
    const { data, error } = await this.client.auth.getSession();
    if (error) throw translateError(error, '로그인 상태를 확인하지 못했어요.');
    if (!data.session || data.session.user.id !== userId) {
      throw new RepositoryError('SESSION_CHANGED', '로그인 사용자가 바뀌었어요.');
    }
    const scoped = new SupabaseRepository(
      createSupabaseClientForAccessToken(data.session.access_token),
      { fixedUserId: userId, observeAuth: false },
    );
    return work(scoped);
  }

  async cleanupExpensePhoto(path: string): Promise<void> {
    const { error } = await this.client.storage.from('expense-photos').remove([path]);
    if (error) throw translateError(error, '교체 또는 삭제된 사진을 정리하지 못했어요.');
  }

  async load(): Promise<AppSnapshot> {
    // A realtime or mutation refresh already in progress is newer than a
    // standalone load. Joining it prevents a slower load from committing stale
    // data after the refresh has completed.
    if (this.reloadJob) {
      mergeReloadRequest(this.reloadJob, undefined);
      return clone(await this.reloadJob.promise);
    }
    if (!this.loading) {
      const generation = this.authGeneration;
      const request = this.fetchSnapshot()
        .then((snapshot) => {
          this.assertCurrentAuthSnapshot(snapshot, generation);
          this.lastSnapshot = snapshot;
          return snapshot;
        });
      this.loading = request;
      void request.then(
        () => {
          if (this.loading === request) this.loading = null;
        },
        () => {
          if (this.loading === request) this.loading = null;
        },
      );
    }
    return clone(await this.loading);
  }

  async updateNickname(nickname: string): Promise<Profile> {
    await this.requireUserId();
    const { error } = await this.client.rpc('update_my_nickname', {
      p_nickname: nickname.trim(),
    });
    if (error) throw translateError(error, '닉네임을 변경하지 못했어요.');
    const snapshot = await this.reloadAndNotify();
    return clone(requireProfile(snapshot, snapshot.currentUserId));
  }

  async updateAvatar(input: { avatarKey?: string; photoUri?: string | null }): Promise<Profile> {
    const userId = await this.requireUserId();
    const snapshot = this.lastSnapshot ?? await this.load();
    const current = requireProfile(snapshot, userId);
    const avatarKey = input.avatarKey ?? current.avatarKey ?? current.avatar;
    let avatarPath = current.avatarPath ?? null;
    let uploadedPath: string | null = null;
    if (input.photoUri !== undefined) {
      if (input.photoUri) {
        uploadedPath = await this.uploadProfilePhoto(input.photoUri, userId);
        avatarPath = uploadedPath;
      } else {
        avatarPath = null;
      }
    }
    const { error } = await this.client.rpc('update_my_avatar', {
      p_avatar_key: avatarKey,
      p_avatar_path: avatarPath,
    });
    if (error) {
      if (uploadedPath) await this.removeOrphanProfilePhoto(uploadedPath);
      throw translateError(error, '프로필 사진을 변경하지 못했어요.');
    }
    if (current.avatarPath && current.avatarPath !== avatarPath) {
      await this.removeOrphanProfilePhoto(current.avatarPath);
    }
    const next = await this.reloadAndNotify();
    return clone(requireProfile(next, userId));
  }

  async createRoom(input: CreateRoomInput): Promise<Room> {
    await this.requireUserId();
    const requestId = toRequestUuid(input.clientRequestId ?? makeUuid());
    const { data, error } = await this.client.rpc('create_room', {
      p_name: input.name.trim(),
      p_base_amount: input.baseAmount,
      p_capacity: input.capacity,
      p_client_request_id: requestId,
    });
    if (error) throw translateError(error, '방을 만들지 못했어요.');

    const payload = firstObject(data);
    const roomPayload = asObject(payload?.room);
    const id = requiredString(roomPayload?.id, '생성된 방 ID');
    const snapshot = await this.reloadAndNotify();
    return clone(requireRoom(snapshot, id));
  }

  async updateRoomSettings(input: UpdateRoomSettingsInput): Promise<Room> {
    await this.requireUserId();
    const { error } = await this.client.rpc('update_room_settings', {
      p_room_id: input.roomId,
      p_name: input.name.trim(),
      p_capacity: input.capacity,
    });
    if (error) throw translateError(error, '방 설정을 저장하지 못했어요.');
    const snapshot = await this.reloadAndNotify();
    return clone(requireRoom(snapshot, input.roomId));
  }

  async previewInvite(inviteCode: string): Promise<InvitePreview> {
    await this.requireUserId();
    const normalized = inviteCode.trim().toUpperCase();
    const { data, error } = await this.client.rpc('preview_room_invite', { p_invite_code: normalized });
    if (error) throw translateError(error, '참여 코드를 확인하지 못했어요.');

    const payload = firstObject(data);
    if (!payload || payload.ok !== true) {
      throw inviteError(typeof payload?.error_code === 'string' ? payload.error_code : 'INVALID_CODE');
    }
    return mapInvitePreview(normalized, payload);
  }

  async joinRoom(inviteCode: string): Promise<RoomMember> {
    await this.requireUserId();
    const normalized = inviteCode.trim().toUpperCase();
    const { data, error } = await this.client.rpc('join_room', { p_invite_code: normalized });
    if (error) throw translateError(error, '방에 참여하지 못했어요.');

    const payload = firstObject(data);
    if (!payload || payload.ok !== true) {
      throw inviteError(typeof payload?.error_code === 'string' ? payload.error_code : 'INVALID_CODE');
    }
    const memberPayload = asObject(payload.member);
    const roomId = requiredString(memberPayload?.room_id, '참여 방 ID');
    const userId = requiredString(memberPayload?.user_id, '참여 사용자 ID');
    const snapshot = await this.reloadAndNotify();
    const member = snapshot.roomMembers.find(
      (item) => item.roomId === roomId && item.userId === userId,
    );
    if (!member) throw new RepositoryError('INVALID_RESPONSE', '참여 결과를 다시 불러오지 못했어요.');
    return clone(member);
  }

  async leaveRoom(roomId: string, successorId?: string): Promise<void> {
    await this.requireUserId();
    const { error } = await this.client.rpc('leave_room', {
      p_room_id: roomId,
      p_successor_user_id: successorId ?? null,
    });
    if (error) throw translateError(error, '방을 나가지 못했어요.');
    await this.reloadAndNotify();
  }

  async closeRoom(roomId: string): Promise<void> {
    await this.requireUserId();
    const { error } = await this.client.rpc('close_room', { p_room_id: roomId });
    if (error) throw translateError(error, '방을 닫지 못했어요.');
    await this.reloadAndNotify();
  }

  async switchRoom(input: SwitchRoomInput): Promise<RoomMember> {
    await this.requireUserId();
    const joinCode = input.joinCode.trim().toUpperCase();
    const { data, error } = await this.client.rpc('switch_room', {
      p_leave_room_id: input.leaveRoomId,
      p_successor_user_id: input.successorId ?? null,
      p_join_code: joinCode,
    });
    // The join half reports capacity/re-join failures by rolling the whole
    // switch back and raising, so the friendly reason arrives as an error.
    if (error) throw switchRoomError(error);

    const payload = firstObject(data);
    const joinPayload = asObject(payload?.join);
    const memberPayload = asObject(joinPayload?.member);
    const roomId = requiredString(memberPayload?.room_id, '참여 방 ID');
    const userId = requiredString(memberPayload?.user_id, '참여 사용자 ID');
    const snapshot = await this.reloadAndNotify();
    const member = snapshot.roomMembers.find(
      (item) => item.roomId === roomId && item.userId === userId,
    );
    if (!member) throw new RepositoryError('INVALID_RESPONSE', '참여 결과를 다시 불러오지 못했어요.');
    return clone(member);
  }

  async approveExpenseException(expenseId: string): Promise<void> {
    await this.requireUserId();
    const { error } = await this.client.rpc('approve_expense_exception', {
      p_expense_id: expenseId,
    });
    if (error) throw translateError(error, '예외를 승인하지 못했어요.');
    await this.reloadRealtimeTablesAndNotify(
      new Set<RealtimeTable>(['expense_exception_approvals']),
    );
  }

  async removeExpenseExceptionApproval(expenseId: string): Promise<void> {
    await this.requireUserId();
    const { error } = await this.client.rpc('remove_expense_exception_approval', {
      p_expense_id: expenseId,
    });
    if (error) throw translateError(error, '승인을 취소하지 못했어요.');
    await this.reloadRealtimeTablesAndNotify(
      new Set<RealtimeTable>(['expense_exception_approvals']),
    );
  }

  async withdrawExpenseException(expenseId: string): Promise<void> {
    await this.requireUserId();
    const { error } = await this.client.rpc('withdraw_expense_exception', {
      p_expense_id: expenseId,
    });
    if (error) throw translateError(error, '예외를 취소하지 못했어요.');
    // Withdrawing drops the exception row and cascades its approvals.
    await this.reloadRealtimeTablesAndNotify(
      new Set<RealtimeTable>(['expense_exceptions', 'expense_exception_approvals']),
    );
  }

  async addExpense(input: AddExpenseInput): Promise<Expense> {
    const userId = await this.requireUserId();
    const requestId = toRequestUuid(input.clientRequestId);
    const photoPath = input.photoUri
      ? await this.uploadExpensePhoto(input.photoUri, input.periodId, userId, requestId)
      : null;
    const { data, error } = await this.client.rpc('add_expense', {
      p_period_id: input.periodId ?? null,
      p_amount: input.amount,
      p_point_amount: input.pointAmount,
      p_category: CATEGORY_TO_DATABASE[input.category],
      p_occurred_at: input.occurredAt,
      p_memo: input.memo || null,
      p_photo_path: photoPath,
      p_client_request_id: requestId,
      p_exception_reason: input.exceptionReason?.trim() || null,
    });
    if (error) {
      if (photoPath) await this.removeOrphanPhoto(photoPath);
      throw translateError(error, '지출을 저장하지 못했어요.');
    }

    const id = requiredString(firstObject(data)?.id, '생성된 지출 ID');
    // add_expense can also insert an exception row, so patch both tables.
    const snapshot = await this.reloadRealtimeTablesAndNotify(
      new Set<RealtimeTable>(['expenses', 'expense_exceptions']),
    );
    return clone(requireExpense(snapshot, id));
  }

  async updateExpense(
    expenseId: string,
    patch: Partial<AddExpenseInput>,
    options?: UpdateExpenseOptions,
  ): Promise<Expense> {
    const userId = await this.requireUserId();
    const current = await this.findCurrentExpense(expenseId);
    if (patch.periodId !== undefined && patch.periodId !== current.periodId) {
      throw new RepositoryError('IMMUTABLE_FIELD', '등록한 주차는 변경할 수 없어요.');
    }
    if (patch.clientRequestId !== undefined && patch.clientRequestId !== current.clientRequestId) {
      throw new RepositoryError('IMMUTABLE_FIELD', '요청 식별자는 변경할 수 없어요.');
    }
    const expectedVersion = requireVersion(current.version, '지출');
    const next = { ...current, ...patch };
    let photoPath = current.photoPath ?? null;
    let uploadedNewPhoto = false;
    if (patch.photoUri !== undefined && patch.photoUri !== current.photoUri) {
      if (patch.photoUri) {
        photoPath = await this.uploadExpensePhoto(
          patch.photoUri,
          current.periodId,
          userId,
          `${expenseId}-v${expectedVersion + 1}-${hash32(patch.photoUri).toString(16)}`,
          options?.expectedPhotoPath,
        );
        uploadedNewPhoto = true;
      } else {
        photoPath = null;
      }
    }

    const { error } = await this.client.rpc('update_expense', {
      p_expense_id: expenseId,
      p_amount: next.amount,
      p_point_amount: next.pointAmount,
      p_category: CATEGORY_TO_DATABASE[next.category],
      p_occurred_at: next.occurredAt,
      p_memo: next.memo || null,
      p_photo_path: photoPath,
      p_expected_version: expectedVersion,
    });
    if (error) {
      if (uploadedNewPhoto && photoPath) await this.removeOrphanPhoto(photoPath);
      throw translateError(error, '지출을 수정하지 못했어요.');
    }

    if (uploadedNewPhoto && current.photoPath && current.photoPath !== photoPath) {
      await this.removeOrphanPhoto(current.photoPath);
    }
    const snapshot = await this.reloadRealtimeTablesAndNotify(
      new Set<RealtimeTable>(['expenses']),
    );
    return clone(requireExpense(snapshot, expenseId));
  }

  async deleteExpense(expenseId: string): Promise<void> {
    await this.requireUserId();
    const current = await this.findCurrentExpense(expenseId);
    const { error } = await this.client.rpc('delete_expense', {
      p_expense_id: expenseId,
      p_expected_version: requireVersion(current.version, '지출'),
    });
    if (error) throw translateError(error, '지출을 삭제하지 못했어요.');
    if (current.photoPath) await this.removeOrphanPhoto(current.photoPath);
    await this.reloadRealtimeTablesAndNotify(new Set<RealtimeTable>(['expenses']));
  }

  async deleteArchivedPeriod(periodId: string): Promise<void> {
    await this.requireUserId();
    const snapshot = this.lastSnapshot ?? await this.load();
    const photoPaths = snapshot.expenses
      .filter((expense) => expense.periodId === periodId)
      .map((expense) => expense.photoPath)
      .filter((path): path is string => typeof path === 'string');
    const { error } = await this.client.rpc('delete_archived_period', {
      p_period_id: periodId,
    });
    if (error) throw translateError(error, '지난 주차를 삭제하지 못했어요.');
    if (photoPaths.length) {
      const { error: storageError } = await this.client.storage
        .from('expense-photos')
        .remove(photoPaths);
      if (storageError) console.warn('삭제된 지난 주차의 사진 정리 오류', storageError);
    }
    await this.reloadAndNotify();
  }

  async addComment(input: AddCommentInput): Promise<Comment> {
    await this.requireUserId();
    const requestId = toRequestUuid(input.clientRequestId);
    const { data, error } = await this.client.rpc('add_comment', {
      p_expense_id: input.expenseId,
      p_body: input.body,
      p_reply_to_comment_id: input.replyToId ?? null,
      p_client_request_id: requestId,
    });
    if (error) throw translateError(error, '댓글을 보내지 못했어요.');

    const id = requiredString(firstObject(data)?.id, '생성된 댓글 ID');
    const snapshot = await this.reloadRealtimeTablesAndNotify(
      new Set<RealtimeTable>(['comments']),
    );
    return clone(requireComment(snapshot, id));
  }

  async updateComment(commentId: string, body: string): Promise<Comment> {
    await this.requireUserId();
    const current = await this.findCurrentComment(commentId);
    const { error } = await this.client.rpc('update_comment', {
      p_comment_id: commentId,
      p_body: body,
      p_expected_version: requireVersion(current.version, '댓글'),
    });
    if (error) throw translateError(error, '댓글을 수정하지 못했어요.');
    const snapshot = await this.reloadRealtimeTablesAndNotify(
      new Set<RealtimeTable>(['comments']),
    );
    return clone(requireComment(snapshot, commentId));
  }

  async deleteComment(commentId: string): Promise<void> {
    await this.requireUserId();
    const current = await this.findCurrentComment(commentId);
    const { error } = await this.client.rpc('delete_comment', {
      p_comment_id: commentId,
      p_expected_version: requireVersion(current.version, '댓글'),
    });
    if (error) throw translateError(error, '댓글을 삭제하지 못했어요.');
    await this.reloadRealtimeTablesAndNotify(new Set<RealtimeTable>(['comments']));
  }

  async toggleCommentReaction(
    commentId: string,
    emoji: CommentReactionEmoji,
  ): Promise<void> {
    await this.requireUserId();
    const { error } = await this.client.rpc('toggle_comment_reaction', {
      p_comment_id: commentId,
      p_emoji: emoji,
    });
    if (error) throw translateError(error, '댓글 반응을 변경하지 못했어요.');
    await this.reloadRealtimeTablesAndNotify(
      new Set<RealtimeTable>(['comment_reactions']),
    );
  }

  async addRoomPost(input: AddRoomPostInput): Promise<RoomPost> {
    await this.requireUserId();
    const { data, error } = await this.client.rpc('add_room_post', {
      p_room_id: input.roomId,
      p_kind: input.kind === 'NOTICE' ? 'notice' : 'post',
      p_body: input.body,
      p_client_request_id: toRequestUuid(input.clientRequestId),
    });
    if (error) throw translateError(error, '냥톡을 남기지 못했어요.');
    const id = requiredString(firstObject(data)?.id, '생성된 냥톡 ID');
    const snapshot = await this.reloadRealtimeTablesAndNotify(
      new Set<RealtimeTable>(['room_posts']),
    );
    return clone(requireRoomPost(snapshot, id));
  }

  async updateRoomPost(postId: string, body: string): Promise<RoomPost> {
    await this.requireUserId();
    const current = await this.findCurrentRoomPost(postId);
    const { error } = await this.client.rpc('update_room_post', {
      p_post_id: postId,
      p_body: body,
      p_expected_version: requireVersion(current.version, '냥톡'),
    });
    if (error) throw translateError(error, '냥톡을 수정하지 못했어요.');
    const snapshot = await this.reloadRealtimeTablesAndNotify(
      new Set<RealtimeTable>(['room_posts']),
    );
    return clone(requireRoomPost(snapshot, postId));
  }

  async deleteRoomPost(postId: string): Promise<void> {
    await this.requireUserId();
    const current = await this.findCurrentRoomPost(postId);
    const { error } = await this.client.rpc('delete_room_post', {
      p_post_id: postId,
      p_expected_version: requireVersion(current.version, '냥톡'),
    });
    if (error) throw translateError(error, '냥톡을 삭제하지 못했어요.');
    await this.reloadRealtimeTablesAndNotify(new Set<RealtimeTable>(['room_posts']));
  }

  async addRoomPostComment(input: AddRoomPostCommentInput): Promise<RoomPostComment> {
    await this.requireUserId();
    const { data, error } = await this.client.rpc('add_room_post_comment', {
      p_post_id: input.postId,
      p_body: input.body,
      p_client_request_id: toRequestUuid(input.clientRequestId),
    });
    if (error) throw translateError(error, '댓글을 남기지 못했어요.');
    const id = requiredString(firstObject(data)?.id, '생성된 댓글 ID');
    const snapshot = await this.reloadRealtimeTablesAndNotify(
      new Set<RealtimeTable>(['room_post_comments']),
    );
    return clone(requireRoomPostComment(snapshot, id));
  }

  async updateRoomPostComment(commentId: string, body: string): Promise<RoomPostComment> {
    await this.requireUserId();
    const current = await this.findCurrentRoomPostComment(commentId);
    const { error } = await this.client.rpc('update_room_post_comment', {
      p_comment_id: commentId,
      p_body: body,
      p_expected_version: requireVersion(current.version, '댓글'),
    });
    if (error) throw translateError(error, '댓글을 수정하지 못했어요.');
    const snapshot = await this.reloadRealtimeTablesAndNotify(
      new Set<RealtimeTable>(['room_post_comments']),
    );
    return clone(requireRoomPostComment(snapshot, commentId));
  }

  async deleteRoomPostComment(commentId: string): Promise<void> {
    await this.requireUserId();
    const current = await this.findCurrentRoomPostComment(commentId);
    const { error } = await this.client.rpc('delete_room_post_comment', {
      p_comment_id: commentId,
      p_expected_version: requireVersion(current.version, '댓글'),
    });
    if (error) throw translateError(error, '댓글을 삭제하지 못했어요.');
    await this.reloadRealtimeTablesAndNotify(new Set<RealtimeTable>(['room_post_comments']));
  }

  async toggleRoomPostReaction(postId: string, emoji: RoomPostReactionEmoji): Promise<void> {
    await this.requireUserId();
    const { error } = await this.client.rpc('toggle_room_post_reaction', {
      p_post_id: postId,
      p_emoji: emoji,
    });
    if (error) throw translateError(error, '반응을 변경하지 못했어요.');
    await this.reloadRealtimeTablesAndNotify(
      new Set<RealtimeTable>(['room_post_reactions']),
    );
  }

  async markNotificationsRead(notificationIds: readonly string[]): Promise<void> {
    await this.requireUserId();
    const ids = [...new Set(notificationIds)].filter((id) => id.length > 0);
    if (ids.length === 0) return;
    const { error } = await this.client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .in('id', ids)
      .is('read_at', null);
    if (error) throw translateError(error, '소식을 읽음 처리하지 못했어요.');
    await this.reloadRealtimeTablesAndNotify(new Set<RealtimeTable>(['notifications']));
  }

  async markAllNotificationsRead(): Promise<void> {
    const userId = await this.requireUserId();
    const { error } = await this.client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null);
    if (error) throw translateError(error, '모든 소식을 읽음 처리하지 못했어요.');
    await this.reloadRealtimeTablesAndNotify(new Set<RealtimeTable>(['notifications']));
  }

  subscribe(listener: (snapshot: AppSnapshot) => void): Unsubscribe {
    this.listeners.add(listener);
    if (this.lastSnapshot) listener(clone(this.lastSnapshot));
    if (this.lastSnapshot && !this.realtimeChannel) {
      void this.ensureRealtime(this.lastSnapshot.currentUserId);
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) void this.teardownRealtime();
    };
  }

  private async fetchSnapshot(): Promise<AppSnapshot> {
    const userId = await this.requireUserId();
    await this.ensureRealtime(userId);

    const [
      profilesResult,
      roomsResult,
      roomMembersResult,
      periodsResult,
      periodDaysResult,
      periodMembersResult,
      periodResultsResult,
      statsResult,
      invitesResult,
      expenseRows,
      commentRows,
      commentReactionRows,
      roomPostRows,
      roomPostCommentRows,
      roomPostReactionRows,
      notificationRows,
      exceptionRows,
      approvalRows,
      preferencesResult,
    ] = await Promise.all([
      this.client.from('profiles').select('id,nickname,avatar_key,avatar_path,nickname_changed_at'),
      this.client
        .from('rooms')
        .select('id,name,owner_id,base_amount,capacity,status,created_at,closed_at')
        .order('created_at', { ascending: false }),
      this.client
        .from('room_members')
        .select('room_id,user_id,role,status,joined_at')
        .order('joined_at', { ascending: true }),
      this.client
        .from('period_status_view')
        .select('id,room_id,week_index,week_start,week_end,selected_day_count,valid_day_count,holiday_version_id,finalized_at,created_at,state')
        .order('week_start', { ascending: false }),
      this.client.from('period_days').select('period_id,day_on,is_holiday'),
      this.client
        .from('period_members')
        .select('period_id,user_id,status,joined_at,joined_on,is_late_join,eligible_day_count,applied_limit')
        .order('joined_at', { ascending: true }),
      this.client
        .from('period_results')
        .select('period_id,room_id,user_id,nickname_snapshot,applied_limit,spent_amount,remaining_amount,achieved,is_crown,finalized_at'),
      this.client
        .from('room_member_stats')
        .select('room_id,user_id,participated_week_count,achieved_week_count,crown_count,current_streak'),
      this.client.from('invite_codes').select('room_id,code,is_active').eq('is_active', true),
      this.fetchExpenseRows(),
      this.fetchCommentRows(),
      this.fetchCommentReactionRows(),
      this.fetchRoomPostRows(),
      this.fetchRoomPostCommentRows(),
      this.fetchRoomPostReactionRows(),
      this.fetchNotificationRows(),
      this.fetchExceptionRows(),
      this.fetchExceptionApprovalRows(),
      this.client.from('user_room_preferences').select('room_id,is_hidden'),
    ]);

    const results = [
      profilesResult,
      roomsResult,
      roomMembersResult,
      periodsResult,
      periodDaysResult,
      periodMembersResult,
      periodResultsResult,
      statsResult,
      invitesResult,
      preferencesResult,
    ];
    const failed = results.find((result) => result.error);
    if (failed?.error) throw translateError(failed.error, '앱 데이터를 불러오지 못했어요.');

    const profileRows = rows<ProfileRow>(profilesResult.data);
    const roomRows = rows<RoomRow>(roomsResult.data);
    const roomMemberRows = rows<RoomMemberRow>(roomMembersResult.data);
    const periodRows = rows<PeriodStatusRow>(periodsResult.data);
    const periodDayRows = rows<PeriodDayRow>(periodDaysResult.data);
    const periodMemberRows = rows<PeriodMemberRow>(periodMembersResult.data);
    const periodResultRows = rows<PeriodResultRow>(periodResultsResult.data);
    const statsRows = rows<RoomMemberStatsRow>(statsResult.data);
    const inviteRows = rows<InviteCodeRow>(invitesResult.data);
    const preferenceRows = rows<PreferenceRow>(preferencesResult.data);

    const [expenseSignedUrls, avatarSignedUrls] = await Promise.all([
      this.createSignedUrlMap(
        'expense-photos',
        expenseRows
          .filter((row) => row.deleted_at === null)
          .map((row) => row.photo_path)
          .filter(isString),
      ),
      this.createSignedUrlMap(
        'profile-images',
        profileRows.map((row) => row.avatar_path).filter(isString),
      ),
    ]);
    this.scheduleSignedUrlRefresh(expenseSignedUrls.size + avatarSignedUrls.size > 0);

    const hiddenClosedIds = new Set(
      preferenceRows.filter((row) => row.is_hidden).map((row) => row.room_id),
    );
    const inviteByRoom = new Map(
      inviteRows.filter((row) => row.is_active).map((row) => [row.room_id, row.code]),
    );
    const rooms = roomRows
      .filter((row) => row.status !== 'closed' || !hiddenClosedIds.has(row.id))
      .map((row) => mapRoom(row, inviteByRoom.get(row.id)));
    const visibleRoomIds = new Set(rooms.map((room) => room.id));
    const daysByPeriod = groupBy(periodDayRows, (row) => row.period_id);
    const periods = periodRows
      .filter((row) => visibleRoomIds.has(row.room_id))
      .map((row) => mapPeriod(row, daysByPeriod.get(row.id) ?? []));
    const visiblePeriodIds = new Set(periods.map((period) => period.id));
    const visibleExpenseRows = filterVisibleExpenseRows(expenseRows, visiblePeriodIds);
    const visibleExpenseIds = new Set(visibleExpenseRows.map((row) => row.id));
    const visibleCommentRows = filterVisibleCommentRows(commentRows, visibleExpenseIds);
    const visibleCommentIds = new Set(visibleCommentRows.map((row) => row.id));
    const visibleRoomPostRows = roomPostRows.filter((row) => visibleRoomIds.has(row.room_id));
    const visibleRoomPostIds = new Set(visibleRoomPostRows.map((row) => row.id));
    const visibleRoomPostCommentRows = roomPostCommentRows.filter((row) =>
      visibleRoomPostIds.has(row.post_id),
    );
    const visibleExceptionRows = exceptionRows.filter((row) =>
      visibleExpenseIds.has(row.expense_id),
    );
    const visibleApprovalRows = approvalRows.filter((row) =>
      visibleExpenseIds.has(row.expense_id),
    );

    return {
      currentUserId: userId,
      profiles: profileRows.map((row) => mapProfile(row, avatarSignedUrls)),
      rooms,
      roomMembers: roomMemberRows
        .filter((row) => visibleRoomIds.has(row.room_id))
        .map(mapRoomMember),
      periods,
      periodMembers: periodMemberRows
        .filter((row) => visiblePeriodIds.has(row.period_id))
        .map(mapPeriodMember),
      periodResults: periodResultRows
        .filter((row) => visiblePeriodIds.has(row.period_id))
        .map(mapPeriodResult),
      memberStats: statsRows
        .filter((row) => visibleRoomIds.has(row.room_id))
        .map(mapStats),
      expenses: visibleExpenseRows.map((row) => mapExpense(row, expenseSignedUrls)),
      comments: visibleCommentRows.map(mapComment),
      commentReactions: commentReactionRows
        .filter((row) => visibleCommentIds.has(row.comment_id))
        .map(mapCommentReaction),
      roomPosts: visibleRoomPostRows.map(mapRoomPost),
      roomPostComments: visibleRoomPostCommentRows.map(mapRoomPostComment),
      roomPostReactions: roomPostReactionRows
        .filter((row) => visibleRoomPostIds.has(row.post_id))
        .map(mapRoomPostReaction),
      notifications: notificationRows.map(mapNotification),
      expenseExceptions: visibleExceptionRows.map(mapExpenseException),
      expenseExceptionApprovals: visibleApprovalRows.map(mapExpenseExceptionApproval),
      processedRequestIds: collectProcessedRequestIds(expenseRows, commentRows, userId),
    };
  }

  private async fetchExpenseRows(): Promise<ExpenseRow[]> {
    const result = await this.client
      .from('expenses')
      .select(EXPENSE_COLUMNS)
      .order('created_at', { ascending: false });
    if (result.error) {
      throw translateError(result.error, '지출 데이터를 갱신하지 못했어요.');
    }
    return rows<ExpenseRow>(result.data);
  }

  private async fetchCommentRows(): Promise<CommentRow[]> {
    const result = await this.client
      .from('comments')
      .select(COMMENT_COLUMNS)
      .order('created_at', { ascending: true });
    if (result.error) {
      throw translateError(result.error, '댓글 데이터를 갱신하지 못했어요.');
    }
    return rows<CommentRow>(result.data);
  }

  private async fetchCommentReactionRows(): Promise<CommentReactionRow[]> {
    const result = await this.client
      .from('comment_reactions')
      .select('comment_id,user_id,emoji,created_at');
    if (result.error) {
      throw translateError(result.error, '댓글 반응을 갱신하지 못했어요.');
    }
    return rows<CommentReactionRow>(result.data);
  }

  private async fetchRoomPostRows(): Promise<RoomPostRow[]> {
    const result = await this.client
      .from('room_posts')
      .select(ROOM_POST_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(200);
    if (result.error) throw translateError(result.error, '냥톡을 갱신하지 못했어요.');
    return rows<RoomPostRow>(result.data);
  }

  private async fetchRoomPostCommentRows(): Promise<RoomPostCommentRow[]> {
    const result = await this.client
      .from('room_post_comments')
      .select(ROOM_POST_COMMENT_COLUMNS)
      .order('created_at', { ascending: true });
    if (result.error) throw translateError(result.error, '냥톡 댓글을 갱신하지 못했어요.');
    return rows<RoomPostCommentRow>(result.data);
  }

  private async fetchRoomPostReactionRows(): Promise<RoomPostReactionRow[]> {
    const result = await this.client
      .from('room_post_reactions')
      .select('post_id,user_id,emoji,created_at');
    if (result.error) throw translateError(result.error, '냥톡 반응을 갱신하지 못했어요.');
    return rows<RoomPostReactionRow>(result.data);
  }

  private async fetchNotificationRows(): Promise<NotificationRow[]> {
    const result = await this.client
      .from('notifications')
      .select(NOTIFICATION_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(100);
    if (result.error) {
      throw translateError(result.error, '소식 데이터를 갱신하지 못했어요.');
    }
    return rows<NotificationRow>(result.data);
  }

  private async fetchExceptionRows(): Promise<ExpenseExceptionRow[]> {
    const result = await this.client
      .from('expense_exceptions')
      .select('expense_id,reason,requested_by,requested_at');
    if (result.error) {
      throw translateError(result.error, '예외 데이터를 갱신하지 못했어요.');
    }
    return rows<ExpenseExceptionRow>(result.data);
  }

  private async fetchExceptionApprovalRows(): Promise<ExpenseExceptionApprovalRow[]> {
    const result = await this.client
      .from('expense_exception_approvals')
      .select('expense_id,user_id,created_at');
    if (result.error) {
      throw translateError(result.error, '예외 승인 데이터를 갱신하지 못했어요.');
    }
    return rows<ExpenseExceptionApprovalRow>(result.data);
  }

  private async requireUserId(): Promise<string> {
    if (this.fixedUserId) return this.fixedUserId;
    const { data, error } = await this.client.auth.getSession();
    if (error) throw translateError(error, '로그인 상태를 확인하지 못했어요.');
    if (!data.session?.user.id) {
      throw new RepositoryError('AUTH_REQUIRED', '로그인이 필요해요.');
    }
    return data.session.user.id;
  }

  private async ensureRealtime(userId: string): Promise<void> {
    if (this.listeners.size === 0) return;
    if (this.realtimeChannel && this.realtimeUserId === userId) return;
    if (this.realtimeChannel) await this.client.removeChannel(this.realtimeChannel);

    let channel = this.client.channel(`jaringoby:${userId}`);
    for (const table of REALTIME_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => this.scheduleRealtimeReload(table),
      );
    }
    this.realtimeChannel = channel;
    this.realtimeUserId = userId;
    channel.subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Supabase realtime 연결 오류', error);
      }
    });
  }

  private async teardownRealtime(): Promise<void> {
    if (this.realtimeReloadTimer) clearTimeout(this.realtimeReloadTimer);
    if (this.signedUrlRefreshTimer) clearTimeout(this.signedUrlRefreshTimer);
    this.realtimeReloadTimer = null;
    this.realtimeDirtyTables.clear();
    this.realtimeNeedsFullReload = false;
    this.signedUrlRefreshTimer = null;
    const channel = this.realtimeChannel;
    this.realtimeChannel = null;
    this.realtimeUserId = null;
    if (channel) {
      try {
        await this.client.removeChannel(channel);
      } catch (error) {
        console.warn('Supabase realtime 채널 정리 오류', error);
      }
    }
  }

  private scheduleRealtimeReload(table?: RealtimeTable): void {
    if (table) this.realtimeDirtyTables.add(table);
    else this.realtimeNeedsFullReload = true;
    if (this.realtimeReloadTimer) clearTimeout(this.realtimeReloadTimer);
    this.realtimeReloadTimer = setTimeout(() => {
      this.realtimeReloadTimer = null;
      const needsFullReload = this.realtimeNeedsFullReload;
      const dirtyTables = new Set(this.realtimeDirtyTables);
      this.realtimeNeedsFullReload = false;
      this.realtimeDirtyTables.clear();
      const reload = needsFullReload
        ? this.reloadAndNotify()
        : this.reloadRealtimeTablesAndNotify(dirtyTables);
      void reload.catch((error: unknown) => {
        console.warn('Supabase realtime 데이터 갱신 오류', error);
      });
    }, 120);
  }

  private scheduleSignedUrlRefresh(hasSignedUrls: boolean): void {
    if (this.signedUrlRefreshTimer) clearTimeout(this.signedUrlRefreshTimer);
    this.signedUrlRefreshTimer = null;
    if (!hasSignedUrls || this.listeners.size === 0) return;
    this.signedUrlRefreshTimer = setTimeout(() => {
      this.signedUrlRefreshTimer = null;
      if (this.listeners.size === 0) return;
      void this.reloadAndNotify().catch((error: unknown) => {
        console.warn('비공개 사진 URL 갱신 오류', error);
      });
    }, SIGNED_URL_REFRESH_MS);
  }

  private async reloadAndNotify(): Promise<AppSnapshot> {
    return this.requestReload();
  }

  private async reloadRealtimeTablesAndNotify(
    tables: ReadonlySet<RealtimeTable>,
  ): Promise<AppSnapshot> {
    return this.requestReload(tables);
  }

  private async requestReload(
    tables?: ReadonlySet<RealtimeTable>,
  ): Promise<AppSnapshot> {
    const activeJob = this.reloadJob;
    if (activeJob) {
      mergeReloadRequest(activeJob, tables);
      return clone(await activeJob.promise);
    }

    let job: ReloadJob;
    const promise = Promise.resolve().then(() => this.drainReloadRequests(job));
    job = {
      isFullReloadInFlight: false,
      needsFullReload: tables === undefined,
      promise,
      tables: new Set(tables),
    };
    this.reloadJob = job;
    void promise.then(
      () => {
        if (this.reloadJob === job) this.reloadJob = null;
      },
      () => {
        if (this.reloadJob === job) this.reloadJob = null;
      },
    );
    return clone(await promise);
  }

  private async drainReloadRequests(job: ReloadJob): Promise<AppSnapshot> {
    let latestSnapshot: AppSnapshot | null = null;
    let workingSnapshot = this.lastSnapshot;
    while (job.needsFullReload || job.tables.size > 0) {
      const needsFullReload = job.needsFullReload;
      const tables = new Set(job.tables);
      job.needsFullReload = false;
      job.tables.clear();
      // A mutation can race an older in-flight load. Let that load settle, then
      // fetch once more so the emitted state always includes the committed row.
      if (this.loading) await this.loading.catch(() => undefined);
      const generation = this.authGeneration;
      job.isFullReloadInFlight = needsFullReload;
      let snapshot: AppSnapshot;
      try {
        snapshot = needsFullReload
          ? await this.fetchSnapshot()
          : await this.fetchRealtimeSnapshot(tables, workingSnapshot);
      } finally {
        job.isFullReloadInFlight = false;
      }
      this.assertCurrentAuthSnapshot(snapshot, generation);
      if (this.reloadJob !== job) {
        throw new RepositoryError(
          'SESSION_CHANGED',
          '로그인 사용자가 바뀌었어요. 현재 계정의 데이터를 다시 불러와 주세요.',
        );
      }
      latestSnapshot = snapshot;
      workingSnapshot = snapshot;
      // New dirty/full requests may have arrived while the fetch was running.
      // Do not expose an internally inconsistent intermediate snapshot; the
      // next iteration patches from this working copy and only the final state
      // is committed below.
      if (job.needsFullReload || job.tables.size > 0) continue;
      this.lastSnapshot = snapshot;
      this.listeners.forEach((listener) => listener(clone(snapshot)));
    }
    if (!latestSnapshot) {
      throw new RepositoryError('RELOAD_CANCELLED', '데이터 갱신 요청이 취소됐어요.');
    }
    return latestSnapshot;
  }

  private async fetchRealtimeSnapshot(
    tables: ReadonlySet<RealtimeTable>,
    baseSnapshot: AppSnapshot | null = this.lastSnapshot,
  ): Promise<AppSnapshot> {
    const canPatchSnapshot = [...tables].every(
      (table) =>
        table === 'expenses' ||
        table === 'comments' ||
        table === 'comment_reactions' ||
        table === 'expense_exceptions' ||
        table === 'expense_exception_approvals',
    );
    const previous = baseSnapshot;
    if (!previous || !canPatchSnapshot || tables.size === 0) {
      return this.fetchSnapshot();
    }

    const userId = await this.requireUserId();
    const shouldFetchExpenses = tables.has('expenses');
    const shouldFetchComments = tables.has('comments');
    const shouldFetchCommentReactions = tables.has('comment_reactions');
    const shouldFetchExceptions = tables.has('expense_exceptions');
    const shouldFetchApprovals = tables.has('expense_exception_approvals');
    const [expenseRows, commentRows, commentReactionRows, exceptionRows, approvalRows] = await Promise.all([
      shouldFetchExpenses
        ? this.fetchExpenseRows()
        : Promise.resolve(null),
      shouldFetchComments
        ? this.fetchCommentRows()
        : Promise.resolve(null),
      shouldFetchCommentReactions
        ? this.fetchCommentReactionRows()
        : Promise.resolve(null),
      shouldFetchExceptions
        ? this.fetchExceptionRows()
        : Promise.resolve(null),
      shouldFetchApprovals
        ? this.fetchExceptionApprovalRows()
        : Promise.resolve(null),
    ]);

    const visiblePeriodIds = new Set(previous.periods.map((period) => period.id));
    const visibleExpenseRows = expenseRows
      ? filterVisibleExpenseRows(expenseRows, visiblePeriodIds)
      : null;
    let expenses = previous.expenses;
    if (visibleExpenseRows) {
      const expenseSignedUrls = new Map<string, string>();
      previous.expenses.forEach((expense) => {
        if (expense.photoPath && expense.photoUri) {
          expenseSignedUrls.set(expense.photoPath, expense.photoUri);
        }
      });
      const unsignedPaths = visibleExpenseRows
        .filter((row) => row.deleted_at === null)
        .map((row) => row.photo_path)
        .filter(isString)
        .filter((path) => !expenseSignedUrls.has(path));
      const newSignedUrls = await this.createSignedUrlMap('expense-photos', unsignedPaths);
      newSignedUrls.forEach((url, path) => expenseSignedUrls.set(path, url));
      expenses = visibleExpenseRows.map((row) => mapExpense(row, expenseSignedUrls));
      if (expenseSignedUrls.size > 0) this.scheduleSignedUrlRefresh(true);
    }

    const visibleExpenseIds = new Set(expenses.map((expense) => expense.id));
    const expensesChanged = visibleExpenseRows !== null;
    const comments = commentRows
      ? filterVisibleCommentRows(commentRows, visibleExpenseIds).map(mapComment)
      : expensesChanged
        ? previous.comments.filter((comment) => visibleExpenseIds.has(comment.expenseId))
        : previous.comments;
    const visibleCommentIds = new Set(comments.map((comment) => comment.id));
    const commentReactions = commentReactionRows
      ? commentReactionRows
          .filter((row) => visibleCommentIds.has(row.comment_id))
          .map(mapCommentReaction)
      : comments !== previous.comments
        ? previous.commentReactions.filter((reaction) =>
            visibleCommentIds.has(reaction.commentId),
          )
        : previous.commentReactions;
    // Exceptions/approvals live in their own arrays keyed by expense_id, so a
    // patch either refetches the touched table or re-filters the carried-over
    // rows against the (possibly shrunk) visible expense set.
    const expenseExceptions = exceptionRows
      ? exceptionRows
          .filter((row) => visibleExpenseIds.has(row.expense_id))
          .map(mapExpenseException)
      : expensesChanged
        ? previous.expenseExceptions.filter((row) => visibleExpenseIds.has(row.expenseId))
        : previous.expenseExceptions;
    const expenseExceptionApprovals = approvalRows
      ? approvalRows
          .filter((row) => visibleExpenseIds.has(row.expense_id))
          .map(mapExpenseExceptionApproval)
      : expensesChanged
        ? previous.expenseExceptionApprovals.filter((row) =>
            visibleExpenseIds.has(row.expenseId),
          )
        : previous.expenseExceptionApprovals;
    const processedRequestIds = new Set(previous.processedRequestIds);
    collectProcessedRequestIds(expenseRows ?? [], commentRows ?? [], userId)
      .forEach((requestId) => processedRequestIds.add(requestId));

    return {
      ...previous,
      currentUserId: userId,
      expenses,
      comments,
      commentReactions,
      expenseExceptions,
      expenseExceptionApprovals,
      processedRequestIds: [...processedRequestIds],
    };
  }

  private assertCurrentAuthSnapshot(snapshot: AppSnapshot, generation: number): void {
    if (
      generation !== this.authGeneration ||
      this.authUserId === null ||
      (this.authUserId !== undefined && snapshot.currentUserId !== this.authUserId)
    ) {
      throw new RepositoryError(
        'SESSION_CHANGED',
        '로그인 사용자가 바뀌었어요. 현재 계정의 데이터를 다시 불러와 주세요.',
      );
    }
  }

  private async findCurrentExpense(expenseId: string): Promise<Expense> {
    const snapshot = this.lastSnapshot ?? (await this.load());
    return requireExpense(snapshot, expenseId);
  }

  private async findCurrentComment(commentId: string): Promise<Comment> {
    const snapshot = this.lastSnapshot ?? (await this.load());
    return requireComment(snapshot, commentId);
  }

  private async findCurrentRoomPost(postId: string): Promise<RoomPost> {
    const snapshot = this.lastSnapshot ?? (await this.load());
    return requireRoomPost(snapshot, postId);
  }

  private async findCurrentRoomPostComment(commentId: string): Promise<RoomPostComment> {
    const snapshot = this.lastSnapshot ?? (await this.load());
    return requireRoomPostComment(snapshot, commentId);
  }

  private async uploadExpensePhoto(
    uri: string,
    periodId: string | undefined,
    userId: string,
    objectStem: string,
    expectedPath?: string,
  ): Promise<string> {
    const file = await readPhoto(uri);
    if (file.buffer.byteLength > MAX_EXPENSE_PHOTO_BYTES) {
      throw new RepositoryError('PHOTO_TOO_LARGE', '지출 사진은 10MB 이하여야 해요.');
    }
    const path = expectedPath ??
      `${periodId ?? 'personal'}/${userId}/${safeObjectStem(objectStem)}.${file.extension}`;
    const { error } = await this.client.storage.from('expense-photos').upload(path, file.buffer, {
      cacheControl: '3600',
      contentType: file.contentType,
      upsert: false,
    });
    if (error && !isAlreadyExistsError(error)) {
      throw translateError(error, '사진을 업로드하지 못했어요.');
    }
    return path;
  }

  private async uploadProfilePhoto(uri: string, userId: string): Promise<string> {
    const file = await readPhoto(uri);
    if (file.buffer.byteLength > MAX_PROFILE_PHOTO_BYTES) {
      throw new RepositoryError('PHOTO_TOO_LARGE', '프로필 사진은 5MB 이하여야 해요.');
    }
    const path = `${userId}/${makeUuid()}.${file.extension}`;
    const { error } = await this.client.storage.from('profile-images').upload(path, file.buffer, {
      cacheControl: '3600',
      contentType: file.contentType,
      upsert: false,
    });
    if (error) throw translateError(error, '프로필 사진을 업로드하지 못했어요.');
    return path;
  }

  private async removeOrphanPhoto(path: string): Promise<void> {
    try {
      await this.cleanupExpensePhoto(path);
    } catch (error) {
      console.warn('교체 또는 삭제된 사진 정리 오류', error);
    }
  }

  private async removeOrphanProfilePhoto(path: string): Promise<void> {
    try {
      const { error } = await this.client.storage.from('profile-images').remove([path]);
      if (error) throw error;
    } catch (error) {
      console.warn('교체 또는 삭제된 프로필 사진 정리 오류', error);
    }
  }

  private async createSignedUrlMap(bucket: string, paths: string[]): Promise<Map<string, string>> {
    const uniquePaths = [...new Set(paths)];
    if (uniquePaths.length === 0) return new Map();
    const signedUrls = new Map<string, string>();
    for (let offset = 0; offset < uniquePaths.length; offset += 100) {
      const chunk = uniquePaths.slice(offset, offset + 100);
      const { data, error } = await this.client.storage
        .from(bucket)
        .createSignedUrls(chunk, SIGNED_URL_TTL_SECONDS);
      if (error) {
        console.warn(`${bucket} 서명 URL 생성 오류`, error);
        continue;
      }
      data?.forEach((entry, index) => {
        if (entry.signedUrl) signedUrls.set(entry.path || chunk[index], entry.signedUrl);
      });
    }
    return signedUrls;
  }
}

async function readPhoto(uri: string): Promise<{
  buffer: ArrayBuffer;
  contentType: string;
  extension: string;
}> {
  let buffer: ArrayBuffer;
  let detectedType = '';
  try {
    if (/^(file|content):/u.test(uri)) {
      const file = new ExpoFile(uri);
      buffer = await file.arrayBuffer();
      detectedType = file.type;
    } else {
      const response = await fetch(uri);
      if (!response.ok) throw new Error(`photo read failed (${response.status})`);
      detectedType = response.headers.get('content-type')?.split(';')[0] ?? '';
      buffer = await response.arrayBuffer();
    }
  } catch (error) {
    throw new RepositoryError('PHOTO_READ_FAILED', '선택한 사진 파일을 읽지 못했어요.', { cause: error });
  }

  const uriExtension = /\.([a-z0-9]+)(?:[?#]|$)/iu.exec(uri)?.[1]?.toLowerCase();
  const contentType = normalizeImageType(detectedType, uriExtension);
  const extension = extensionForContentType(contentType);
  return { buffer, contentType, extension };
}

function normalizeImageType(type: string, extension?: string): string {
  const normalized = type.toLowerCase();
  if (['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(normalized)) {
    return normalized;
  }
  const byExtension: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
  };
  if (extension && byExtension[extension]) return byExtension[extension];
  throw new RepositoryError('PHOTO_TYPE_NOT_ALLOWED', 'JPEG, PNG, WebP, HEIC 사진만 올릴 수 있어요.');
}

function extensionForContentType(contentType: string): string {
  if (contentType === 'image/jpeg') return 'jpg';
  return contentType.slice('image/'.length);
}

function translateError(error: unknown, fallback: string): RepositoryError {
  if (error instanceof RepositoryError) return error;
  const value = asObject(error);
  const code = typeof value?.code === 'string' ? value.code : 'SUPABASE_ERROR';
  const message = typeof value?.message === 'string' ? value.message : '';
  const normalized = message.toLowerCase();
  const status = value?.status ?? value?.statusCode;

  if (Number(status) === 401 || normalized.includes('jwt expired') || normalized.includes('invalid jwt')) {
    return new RepositoryError('AUTH_REQUIRED', '로그인이 만료됐어요. 다시 로그인해 주세요.', { cause: error });
  }
  if (message === 'NICKNAME_COOLDOWN') {
    return new RepositoryError('NICKNAME_COOLDOWN', '닉네임은 7일에 한 번만 변경할 수 있어요.', { cause: error });
  }
  if (message === 'INVALID_NICKNAME') {
    return new RepositoryError('INVALID_NICKNAME', '닉네임은 앞뒤 공백을 제외하고 2~20자로 입력해 주세요.', { cause: error });
  }
  if (code === '40001' || normalized.includes('version conflict')) {
    return new RepositoryError('VERSION_CONFLICT', '다른 기기에서 먼저 수정했어요. 새로고침한 뒤 다시 시도해 주세요.', { cause: error });
  }
  if (code === '42501' || normalized.includes('permission denied')) {
    return new RepositoryError('FORBIDDEN', '이 작업을 수행할 권한이 없어요.', { cause: error });
  }
  if (normalized.includes('failed to fetch') || normalized.includes('network request failed')) {
    return new RepositoryError('NETWORK_ERROR', '네트워크 연결을 확인한 뒤 다시 시도해 주세요.', { cause: error });
  }
  const policyMessage = policyErrorMessage(normalized);
  return new RepositoryError(code, policyMessage ?? fallback, { cause: error });
}

function policyErrorMessage(message: string): string | null {
  if (message.includes('authentication required')) return '로그인이 필요해요.';
  if (message.includes('room name')) return '방 이름을 확인해 주세요.';
  if (message.includes('holiday dataset does not cover')) return '이번 주 공휴일 데이터가 아직 준비되지 않았어요.';
  if (message.includes('published korean holiday dataset')) return '공휴일 데이터가 아직 준비되지 않았어요.';
  if (message.includes('capacity can only increase')) return '정원은 현재보다 크게, 최대 10명까지 설정할 수 있어요.';
  if (message.includes('closed rooms are read-only') || message.includes('closed rooms do not open')) {
    return '닫힌 방은 읽기 전용이에요.';
  }
  if (message.includes('expense adjustment deadline')) return '지출 보정 마감이 지나 수정할 수 없어요.';
  if (message.includes('writable only during active and adjustment')) return '현재는 지출을 입력하거나 수정할 수 없는 기간이에요.';
  if (message.includes('active period membership')) return '이번 주차 참여자만 지출을 기록할 수 있어요.';
  if (message.includes('active room membership')) return '방 참여자만 쓸 수 있어요.';
  if (message.includes('expense time is outside')) return '주차 기간과 내 합류일 안의 지출만 등록할 수 있어요.';
  if (message.includes('excluded holiday')) return '공휴일 지출은 주차 한도에 포함할 수 없어요.';
  if (message.includes('uploaded photo is required') || message.includes('photo upload')) return '마감 전에 지출 사진 1장 업로드를 완료해 주세요.';
  if (message.includes('room owner must select')) return '방장이 나가려면 다른 참여자에게 방장을 넘겨야 해요.';
  if (message.includes('comment edit window')) return '댓글은 작성 후 5분 안에만 수정할 수 있어요.';
  if (message.includes('comment is read-only')) return '정산이 끝난 주차의 댓글은 읽기 전용이에요.';
  if (message.includes('comment body')) return '댓글은 앞뒤 공백을 제외하고 1~500자로 입력해 주세요.';
  return null;
}

function inviteError(code: string): RepositoryError {
  const messages: Record<string, string> = {
    INVALID_CODE: '참여 코드를 확인해 주세요.',
    RATE_LIMITED: '코드를 너무 자주 확인했어요. 10분 뒤 다시 시도해 주세요.',
    ROOM_CLOSED: '이미 닫힌 방이에요.',
    CAPACITY_FULL: '방 정원이 가득 찼어요.',
    ALREADY_PARTICIPATED: '이미 참여했거나 참여했던 방이에요.',
  };
  return new RepositoryError(code, messages[code] ?? '방에 참여할 수 없어요.');
}

// switch_room rolls the leave back and raises when the join half fails, tagging
// the reason as "switch_room join failed: <CODE>". Recover that code so the
// caller sees the same friendly message join_room would have produced; anything
// else (e.g. owner-successor rules from the leave half) falls through to the
// shared policy translator.
function switchRoomError(error: unknown): RepositoryError {
  const value = asObject(error);
  const message = typeof value?.message === 'string' ? value.message : '';
  const matched = /switch_room join failed:\s*([A-Z_]+)/u.exec(message);
  if (matched) return inviteError(matched[1]);
  return translateError(error, '방을 옮기지 못했어요.');
}

function isAlreadyExistsError(error: unknown): boolean {
  const value = asObject(error);
  const message = typeof value?.message === 'string' ? value.message.toLowerCase() : '';
  const status = value?.statusCode ?? value?.status;
  return Number(status) === 409 || message.includes('already exists') || message.includes('duplicate');
}

function toRequestUuid(value: string): string {
  if (!value.trim()) {
    throw new RepositoryError('REQUEST_ID_REQUIRED', '중복 저장 방지를 위한 요청 식별자가 필요해요.');
  }
  const normalized = value.trim().toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(normalized)) {
    return normalized;
  }
  const words = [hash32(`0:${value}`), hash32(`1:${value}`), hash32(`2:${value}`), hash32(`3:${value}`)];
  const hex = words.map((word) => word.toString(16).padStart(8, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function makeUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const seed = `${Date.now()}:${Math.random()}:${Math.random()}`;
  return toRequestUuid(seed);
}

function safeObjectStem(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/gu, '-').slice(0, 120);
}

function requireVersion(version: number | undefined, entity: string): number {
  if (!Number.isInteger(version) || (version ?? 0) < 1) {
    throw new RepositoryError('VERSION_REQUIRED', `${entity}의 최신 버전을 불러온 뒤 다시 시도해 주세요.`);
  }
  return version as number;
}

function requireRoom(snapshot: AppSnapshot, id: string): Room {
  const room = snapshot.rooms.find((item) => item.id === id);
  if (!room) throw new RepositoryError('NOT_FOUND', '방을 찾을 수 없어요.');
  return room;
}

function requireProfile(snapshot: AppSnapshot, id: string): Profile {
  const profile = snapshot.profiles.find((item) => item.id === id);
  if (!profile) throw new RepositoryError('NOT_FOUND', '프로필을 찾을 수 없어요.');
  return profile;
}

function requireExpense(snapshot: AppSnapshot, id: string): Expense {
  const expense = snapshot.expenses.find((item) => item.id === id);
  if (!expense) throw new RepositoryError('NOT_FOUND', '지출 기록을 찾을 수 없어요.');
  return expense;
}

function requireComment(snapshot: AppSnapshot, id: string): Comment {
  const comment = snapshot.comments.find((item) => item.id === id);
  if (!comment) throw new RepositoryError('NOT_FOUND', '댓글을 찾을 수 없어요.');
  return comment;
}

function requireRoomPost(snapshot: AppSnapshot, id: string): RoomPost {
  const post = snapshot.roomPosts.find((item) => item.id === id);
  if (!post) throw new RepositoryError('NOT_FOUND', '냥톡을 찾을 수 없어요.');
  return post;
}

function requireRoomPostComment(snapshot: AppSnapshot, id: string): RoomPostComment {
  const comment = snapshot.roomPostComments.find((item) => item.id === id);
  if (!comment) throw new RepositoryError('NOT_FOUND', '댓글을 찾을 수 없어요.');
  return comment;
}

function rows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function filterVisibleExpenseRows(
  expenseRows: ExpenseRow[],
  visiblePeriodIds: ReadonlySet<string>,
): ExpenseRow[] {
  return expenseRows.filter(
    (row) => !row.period_id || visiblePeriodIds.has(row.period_id),
  );
}

function filterVisibleCommentRows(
  commentRows: CommentRow[],
  visibleExpenseIds: ReadonlySet<string>,
): CommentRow[] {
  return commentRows.filter((row) => visibleExpenseIds.has(row.expense_id));
}

function collectProcessedRequestIds(
  expenseRows: ExpenseRow[],
  commentRows: CommentRow[],
  userId: string,
): string[] {
  return [
    ...expenseRows
      .filter((row) => row.user_id === userId)
      .map((row) => row.client_request_id),
    ...commentRows
      .filter((row) => row.user_id === userId)
      .map((row) => row.client_request_id),
  ];
}

function firstObject(value: unknown): JsonObject | null {
  if (Array.isArray(value)) return asObject(value[0]);
  return asObject(value);
}

function isString(value: string | null): value is string {
  return typeof value === 'string' && value.length > 0;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const item of items) {
    const itemKey = key(item);
    const group = result.get(itemKey) ?? [];
    group.push(item);
    result.set(itemKey, group);
  }
  return result;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
