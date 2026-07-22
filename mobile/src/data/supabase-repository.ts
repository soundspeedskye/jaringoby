import { File as ExpoFile } from 'expo-file-system';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

import type { AppRepository, Unsubscribe, UpdateExpenseOptions } from '@/data/repository';
import { createSupabaseClientForAccessToken } from '@/data/supabase-client';
import type {
  AddCommentInput,
  AddExpenseInput,
  AppSnapshot,
  Comment,
  CreateRoomInput,
  Expense,
  InvitePreview,
  Period,
  PeriodMember,
  PeriodResult,
  Profile,
  Room,
  RoomMember,
  RoomMemberStats,
} from '@/data/types';
import type { ExpenseCategory, LocalDate, MemberStatus, PeriodPhase } from '@/domain/types';

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const SIGNED_URL_REFRESH_MS = 50 * 60 * 1_000;
const MAX_EXPENSE_PHOTO_BYTES = 10 * 1024 * 1024;
const REALTIME_TABLES = [
  'rooms',
  'room_members',
  'periods',
  'period_members',
  'period_results',
  'expenses',
  'comments',
] as const;

const CATEGORY_TO_DATABASE: Record<ExpenseCategory, DatabaseExpenseCategory> = {
  점심: 'lunch',
  커피: 'coffee',
  간식: 'snack',
  저녁: 'dinner',
  필수품: 'essential',
  사치품: 'luxury',
};

const CATEGORY_FROM_DATABASE: Record<DatabaseExpenseCategory, ExpenseCategory> = {
  lunch: '점심',
  coffee: '커피',
  snack: '간식',
  dinner: '저녁',
  essential: '필수품',
  luxury: '사치품',
};

type DatabaseExpenseCategory = 'lunch' | 'coffee' | 'snack' | 'dinner' | 'essential' | 'luxury';
type JsonObject = Record<string, unknown>;

type ProfileRow = {
  id: string;
  nickname: string;
  avatar_path: string | null;
};

type RoomRow = {
  id: string;
  name: string;
  owner_id: string;
  base_amount: number | string;
  capacity: number;
  status: 'open' | 'closed';
  created_at: string;
  closed_at: string | null;
};

type RoomMemberRow = {
  room_id: string;
  user_id: string;
  role: 'owner' | 'member';
  status: 'active' | 'left' | 'removed' | 'account_deleted';
  joined_at: string;
};

type PeriodStatusRow = {
  id: string;
  room_id: string;
  week_index: number;
  week_start: string;
  week_end: string;
  selected_day_count: number;
  valid_day_count: number;
  holiday_version_id: string;
  finalized_at: string | null;
  created_at: string;
  state: 'waiting' | 'active' | 'adjustment' | 'settling' | 'archived';
};

type PeriodDayRow = {
  period_id: string;
  day_on: string;
  is_holiday: boolean;
};

type PeriodMemberRow = {
  period_id: string;
  user_id: string;
  status: 'active' | 'left' | 'removed' | 'account_deleted';
  joined_at: string;
  joined_on: string;
  is_late_join: boolean;
  eligible_day_count: number;
  applied_limit: number | string;
};

type PeriodResultRow = {
  period_id: string;
  room_id: string;
  user_id: string;
  nickname_snapshot: string;
  applied_limit: number | string;
  spent_amount: number | string;
  remaining_amount: number | string;
  achieved: boolean;
  is_crown: boolean;
  finalized_at: string;
};

type RoomMemberStatsRow = {
  room_id: string;
  user_id: string;
  participated_week_count: number;
  achieved_week_count: number;
  crown_count: number;
  current_streak: number;
};

type InviteCodeRow = {
  room_id: string;
  code: string;
  is_active: boolean;
};

type ExpenseRow = {
  id: string;
  client_request_id: string;
  period_id: string | null;
  user_id: string;
  amount: number | string;
  category: DatabaseExpenseCategory;
  memo: string | null;
  photo_path: string | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
};

type CommentRow = {
  id: string;
  client_request_id: string;
  expense_id: string;
  user_id: string;
  body: string | null;
  reply_to_comment_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
};

type PreferenceRow = {
  room_id: string;
  is_hidden: boolean;
};

export class RepositoryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`${code}: ${message}`, options);
    this.name = 'RepositoryError';
  }
}

type SupabaseRepositoryOptions = {
  fixedUserId?: string;
  observeAuth?: boolean;
};

export class SupabaseRepository implements AppRepository {
  private readonly listeners = new Set<(snapshot: AppSnapshot) => void>();
  private lastSnapshot: AppSnapshot | null = null;
  private loading: Promise<AppSnapshot> | null = null;
  private realtimeChannel: RealtimeChannel | null = null;
  private realtimeUserId: string | null = null;
  private realtimeReloadTimer: ReturnType<typeof setTimeout> | null = null;
  private signedUrlRefreshTimer: ReturnType<typeof setTimeout> | null = null;
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

  async resetDemo(): Promise<AppSnapshot> {
    throw new RepositoryError('NOT_DEMO_MODE', '실서비스 데이터는 데모 초기화 대상이 아니에요.');
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

  async increaseCapacity(roomId: string, capacity: number): Promise<Room> {
    await this.requireUserId();
    const { error } = await this.client.rpc('update_room_settings', {
      p_room_id: roomId,
      p_name: null,
      p_capacity: capacity,
    });
    if (error) throw translateError(error, '정원을 변경하지 못했어요.');
    const snapshot = await this.reloadAndNotify();
    return clone(requireRoom(snapshot, roomId));
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

  async leaveRoom(roomId: string, successorUserId?: string): Promise<void> {
    await this.requireUserId();
    const { error } = await this.client.rpc('leave_room', {
      p_room_id: roomId,
      p_successor_user_id: successorUserId ?? null,
    });
    if (error) throw translateError(error, '방에서 나가지 못했어요.');
    await this.reloadAndNotify();
  }

  async closeRoom(roomId: string): Promise<Room> {
    await this.requireUserId();
    const { error } = await this.client.rpc('close_room', { p_room_id: roomId });
    if (error) throw translateError(error, '방을 닫지 못했어요.');
    const snapshot = await this.reloadAndNotify();
    return clone(requireRoom(snapshot, roomId));
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
      p_category: CATEGORY_TO_DATABASE[input.category],
      p_occurred_at: input.occurredAt,
      p_memo: input.memo || null,
      p_photo_path: photoPath,
      p_client_request_id: requestId,
    });
    if (error) {
      if (photoPath) await this.removeOrphanPhoto(photoPath);
      throw translateError(error, '지출을 저장하지 못했어요.');
    }

    const id = requiredString(firstObject(data)?.id, '생성된 지출 ID');
    const snapshot = await this.reloadAndNotify();
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
    const snapshot = await this.reloadAndNotify();
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
    const snapshot = await this.reloadAndNotify();
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
    const snapshot = await this.reloadAndNotify();
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
    await this.reloadAndNotify();
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
      expensesResult,
      commentsResult,
      preferencesResult,
    ] = await Promise.all([
      this.client.from('profiles').select('id,nickname,avatar_path'),
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
      this.client
        .from('expenses')
        .select('id,client_request_id,period_id,user_id,amount,category,memo,photo_path,occurred_at,created_at,updated_at,deleted_at,version')
        .order('created_at', { ascending: false }),
      this.client
        .from('comments')
        .select('id,client_request_id,expense_id,user_id,body,reply_to_comment_id,created_at,updated_at,deleted_at,version')
        .order('created_at', { ascending: true }),
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
      expensesResult,
      commentsResult,
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
    const expenseRows = rows<ExpenseRow>(expensesResult.data);
    const commentRows = rows<CommentRow>(commentsResult.data);
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
    const visibleExpenseRows = expenseRows.filter(
      (row) => !row.period_id || visiblePeriodIds.has(row.period_id),
    );
    const visibleExpenseIds = new Set(visibleExpenseRows.map((row) => row.id));

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
      comments: commentRows.filter((row) => visibleExpenseIds.has(row.expense_id)).map(mapComment),
      processedRequestIds: [
        ...expenseRows.filter((row) => row.user_id === userId).map((row) => row.client_request_id),
        ...commentRows.filter((row) => row.user_id === userId).map((row) => row.client_request_id),
      ],
    };
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
        () => this.scheduleRealtimeReload(),
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

  private scheduleRealtimeReload(): void {
    if (this.realtimeReloadTimer) clearTimeout(this.realtimeReloadTimer);
    this.realtimeReloadTimer = setTimeout(() => {
      this.realtimeReloadTimer = null;
      void this.reloadAndNotify().catch((error: unknown) => {
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
    // A mutation can race an older in-flight load. Let that load settle, then
    // fetch once more so the emitted state always includes the committed row.
    if (this.loading) await this.loading.catch(() => undefined);
    const generation = this.authGeneration;
    const snapshot = await this.fetchSnapshot();
    this.assertCurrentAuthSnapshot(snapshot, generation);
    this.lastSnapshot = snapshot;
    this.listeners.forEach((listener) => listener(clone(snapshot)));
    return clone(snapshot);
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

  private async removeOrphanPhoto(path: string): Promise<void> {
    try {
      await this.cleanupExpensePhoto(path);
    } catch (error) {
      console.warn('교체 또는 삭제된 사진 정리 오류', error);
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

function mapProfile(row: ProfileRow, signedUrls: Map<string, string>): Profile {
  const avatarPath = row.avatar_path ?? undefined;
  return {
    id: row.id,
    nickname: row.nickname,
    avatar: defaultAvatar(row.id),
    avatarPath,
    avatarUri: avatarPath ? signedUrls.get(avatarPath) : undefined,
  };
}

function mapRoom(row: RoomRow, inviteCode?: string): Room {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    inviteCode: inviteCode ?? '',
    baseAmount: safeNumber(row.base_amount, '기준 금액'),
    capacity: row.capacity,
    status: row.status === 'closed' ? 'CLOSED' : 'OPEN',
    createdAt: row.created_at,
    closedAt: row.closed_at ?? undefined,
  };
}

function mapRoomMember(row: RoomMemberRow): RoomMember {
  return {
    roomId: row.room_id,
    userId: row.user_id,
    role: row.role === 'owner' ? 'OWNER' : 'MEMBER',
    status: mapMemberStatus(row.status),
    joinedAt: row.joined_at,
  };
}

function mapPeriod(row: PeriodStatusRow, days: PeriodDayRow[]): Period {
  const sortedDays = [...days].sort((left, right) => left.day_on.localeCompare(right.day_on));
  return {
    id: row.id,
    roomId: row.room_id,
    weekIndex: row.week_index,
    weekStart: asLocalDate(row.week_start),
    weekEnd: asLocalDate(row.week_end),
    selectedDayCount: row.selected_day_count,
    validDayCount: row.valid_day_count,
    holidayDates: sortedDays.filter((day) => day.is_holiday).map((day) => asLocalDate(day.day_on)),
    holidayVersionId: row.holiday_version_id,
    phase: mapPhase(row.state),
    isRestWeek: row.valid_day_count === 0,
    finalizedAt: row.finalized_at ?? undefined,
    createdAt: row.created_at,
  };
}

function mapPeriodMember(row: PeriodMemberRow): PeriodMember {
  return {
    periodId: row.period_id,
    userId: row.user_id,
    joinedAt: row.joined_at,
    joinedDate: asLocalDate(row.joined_on),
    eligibleDayCount: row.eligible_day_count,
    appliedLimit: safeNumber(row.applied_limit, '적용 한도'),
    status: mapMemberStatus(row.status),
    isLateJoiner: row.is_late_join,
  };
}

function mapPeriodResult(row: PeriodResultRow): PeriodResult {
  return {
    periodId: row.period_id,
    roomId: row.room_id,
    userId: row.user_id,
    nickname: row.nickname_snapshot,
    appliedLimit: safeNumber(row.applied_limit, '적용 한도'),
    spentAmount: safeNumber(row.spent_amount, '지출 합계'),
    remainingAmount: safeSignedNumber(row.remaining_amount, '잔액'),
    achieved: row.achieved,
    isCrown: row.is_crown,
    finalizedAt: row.finalized_at,
  };
}

function mapStats(row: RoomMemberStatsRow): RoomMemberStats {
  return {
    roomId: row.room_id,
    userId: row.user_id,
    participatedWeekCount: row.participated_week_count,
    achievedWeekCount: row.achieved_week_count,
    crownCount: row.crown_count,
    currentStreak: row.current_streak,
  };
}

function mapExpense(row: ExpenseRow, signedUrls: Map<string, string>): Expense {
  const photoPath = row.photo_path ?? undefined;
  return {
    id: row.id,
    clientRequestId: row.client_request_id,
    periodId: row.period_id ?? undefined,
    userId: row.user_id,
    amount: safeNumber(row.amount, '지출 금액'),
    category: CATEGORY_FROM_DATABASE[row.category],
    memo: row.memo ?? '',
    photoPath,
    photoUri: photoPath ? signedUrls.get(photoPath) : undefined,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
    syncStatus: 'SYNCED',
    version: row.version,
  };
}

function mapComment(row: CommentRow): Comment {
  return {
    id: row.id,
    clientRequestId: row.client_request_id,
    expenseId: row.expense_id,
    userId: row.user_id,
    body: row.deleted_at ? '삭제된 메시지입니다.' : row.body ?? '',
    replyToId: row.reply_to_comment_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
    syncStatus: 'SYNCED',
    version: row.version,
  };
}

function mapInvitePreview(code: string, payload: JsonObject): InvitePreview {
  const room = asObject(payload.room);
  const join = asObject(payload.join);
  if (!room || !join) throw new RepositoryError('INVALID_RESPONSE', '초대 정보 형식이 올바르지 않아요.');
  const period = asObject(payload.current_period);
  const holidays = Array.isArray(period?.holidays) ? period.holidays : [];
  return {
    code,
    roomId: requiredString(room.id, '방 ID'),
    name: requiredString(room.name, '방 이름'),
    baseAmount: safeNumber(room.base_amount, '기준 금액'),
    capacity: safeNumber(room.capacity, '정원'),
    memberCount: safeNumber(room.member_count, '현재 인원'),
    currentPeriod: period
      ? {
          id: requiredString(period.id, '주차 ID'),
          weekStart: asLocalDate(requiredString(period.week_start, '주차 시작일')),
          weekEnd: asLocalDate(requiredString(period.week_end, '주차 종료일')),
          selectedDayCount: safeNumber(period.selected_day_count, '선택 일수'),
          validDayCount: safeNumber(period.valid_day_count, '유효 일수'),
          holidayDates: holidays
            .map(asObject)
            .filter((holiday): holiday is JsonObject => Boolean(holiday))
            .map((holiday) => asLocalDate(requiredString(holiday.date, '공휴일'))),
        }
      : undefined,
    joinedDate: asLocalDate(requiredString(join.joined_on, '합류일')),
    eligibleDayCount: safeNumber(join.eligible_day_count, '남은 유효 일수'),
    appliedLimit: safeNumber(join.applied_limit, '적용 한도'),
    isLateJoiner: join.is_late_join === true,
    participatesThisWeek: join.participates_this_week === true,
    canJoin: join.can_join === true,
  };
}

function mapPhase(state: PeriodStatusRow['state']): PeriodPhase {
  if (state === 'settling') return 'SETTLEMENT';
  return state.toUpperCase() as PeriodPhase;
}

function mapMemberStatus(status: RoomMemberRow['status']): MemberStatus {
  return status.toUpperCase() as MemberStatus;
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

function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
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

function rows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function firstObject(value: unknown): JsonObject | null {
  if (Array.isArray(value)) return asObject(value[0]);
  return asObject(value);
}

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new RepositoryError('INVALID_RESPONSE', `${label} 응답이 올바르지 않아요.`);
  }
  return value;
}

function safeNumber(value: unknown, label: string): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(number)) {
    throw new RepositoryError('INVALID_RESPONSE', `${label} 응답이 올바르지 않아요.`);
  }
  return number;
}

/** remaining_amount can legitimately be negative when a member overspends. */
function safeSignedNumber(value: unknown, label: string): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(number)) {
    throw new RepositoryError('INVALID_RESPONSE', `${label} 응답이 올바르지 않아요.`);
  }
  return number;
}

function asLocalDate(value: string): LocalDate {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new RepositoryError('INVALID_RESPONSE', '날짜 응답 형식이 올바르지 않아요.');
  }
  return value as LocalDate;
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

function defaultAvatar(id: string): string {
  const avatars = ['🙂', '🌿', '🐿️', '🌱', '🍀', '🐣'];
  return avatars[hash32(id) % avatars.length];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
