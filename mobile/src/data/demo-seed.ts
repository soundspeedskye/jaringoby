import type { AppSnapshot, Period, PeriodMember, PeriodResult } from '@/data/types';
import {
  addLocalDays,
  createPeriodMemberPlan,
  createPeriodTimeline,
  createKoreanHolidaySnapshot,
  createWeekdayCalendar,
  getPeriodPhase,
  isWeekday,
  resolveFirstWeekStart,
  toSeoulLocalDate,
  type LocalDate,
} from '@/domain';

function demoPhoto(emoji: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="100%" height="100%" fill="${color}"/><circle cx="450" cy="300" r="190" fill="#fff7e6" opacity=".72"/><text x="450" y="355" font-size="190" text-anchor="middle">${emoji}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function seoulTime(date: LocalDate, time: string): string {
  return `${date}T${time}+09:00`;
}

const EMPTY_HOLIDAYS = createKoreanHolidaySnapshot({
  version: 'demo-empty',
  capturedAt: '2026-01-01T00:00:00+09:00',
  dates: [],
});

/**
 * 데모 상태: 방 1개에 지난 주차(정산 완료)와 현재 주차(진행 또는 대기)가 있다.
 * 주말에 열면 현재 주차는 다음 주 월요일의 WAITING 주차다 (D6).
 */
export function createDemoSnapshot(): AppSnapshot {
  const today = toSeoulLocalDate(Date.now());
  const currentWeekStart = resolveFirstWeekStart(today);
  const previousWeekStart = addLocalDays(currentWeekStart, -7);
  const roomCreatedAt = seoulTime(addLocalDays(previousWeekStart, -3), '10:00:00');

  const currentCalendar = createWeekdayCalendar({
    weekStart: currentWeekStart,
    holidaySnapshot: EMPTY_HOLIDAYS,
  });
  const lateJoinDate = isWeekday(today) && today > currentWeekStart ? today : currentWeekStart;
  const myPlan = createPeriodMemberPlan({
    calendar: currentCalendar,
    joinedOn: lateJoinDate,
    baseAmount: 50_000,
  });

  const previousPeriod: Period = demoPeriod('period-prev', 1, previousWeekStart);
  const currentPeriod: Period = demoPeriod('period-current', 2, currentWeekStart);

  const previousMembers: PeriodMember[] = [
    demoPeriodMember('period-prev', 'user-minji', previousWeekStart),
    demoPeriodMember('period-prev', 'user-me', previousWeekStart),
    demoPeriodMember('period-prev', 'user-jungwoo', previousWeekStart),
  ];
  const currentMembers: PeriodMember[] = [
    demoPeriodMember('period-current', 'user-minji', currentWeekStart),
    {
      periodId: 'period-current',
      userId: 'user-me',
      joinedAt: seoulTime(lateJoinDate, '09:00:00'),
      joinedDate: myPlan.joinedOn,
      eligibleDayCount: myPlan.eligibleDayCount,
      appliedLimit: myPlan.appliedLimit,
      status: 'ACTIVE',
      isLateJoiner: myPlan.isLateJoin,
    },
    demoPeriodMember('period-current', 'user-jungwoo', currentWeekStart),
  ];

  // 주말에는 직전 주차가 아직 정산 전(ADJUSTMENT/SETTLEMENT)일 수 있다.
  // 결과·통계는 ARCHIVED일 때만 시드하고, 이후는 LocalRepository가 정산한다.
  const previousFinalized = previousPeriod.phase === 'ARCHIVED';
  const previousResults: PeriodResult[] = previousFinalized
    ? [
        demoResult(previousPeriod, 'user-minji', '민지', 4_500, true),
        demoResult(previousPeriod, 'user-me', '나', 12_000, false),
        demoResult(previousPeriod, 'user-jungwoo', '정우', 38_000, false),
      ]
    : [];

  const prevTuesday = addLocalDays(previousWeekStart, 1);
  const prevWednesday = addLocalDays(previousWeekStart, 2);

  return {
    currentUserId: 'user-me',
    profiles: [
      { id: 'user-me', nickname: '나', avatar: '🙂' },
      { id: 'user-minji', nickname: '민지', avatar: '🌿' },
      { id: 'user-jungwoo', nickname: '정우', avatar: '🐿️' },
    ],
    rooms: [
      {
        id: 'room-demo',
        ownerId: 'user-minji',
        name: '5만원 방어 작전',
        inviteCode: 'SAVE55',
        baseAmount: 50_000,
        capacity: 6,
        status: 'OPEN',
        createdAt: roomCreatedAt,
      },
    ],
    roomMembers: [
      { roomId: 'room-demo', userId: 'user-minji', role: 'OWNER', status: 'ACTIVE', joinedAt: roomCreatedAt },
      { roomId: 'room-demo', userId: 'user-me', role: 'MEMBER', status: 'ACTIVE', joinedAt: seoulTime(previousWeekStart, '09:00:00') },
      { roomId: 'room-demo', userId: 'user-jungwoo', role: 'MEMBER', status: 'ACTIVE', joinedAt: seoulTime(addLocalDays(previousWeekStart, -1), '11:00:00') },
    ],
    periods: [currentPeriod, previousPeriod],
    periodMembers: [...previousMembers, ...currentMembers],
    periodResults: previousResults,
    // refreshState가 periodResults에서 다시 계산하지만, 첫 렌더 전 기본값을 둔다.
    memberStats: previousFinalized
      ? [
          demoStats('user-minji', true),
          demoStats('user-me', false),
          demoStats('user-jungwoo', false),
        ]
      : [],
    expenses: [
      {
        id: 'expense-minji-coffee',
        clientRequestId: 'seed-expense-1',
        periodId: 'period-prev',
        userId: 'user-minji',
        amount: 4_500,
        category: '커피',
        memo: '텀블러 할인까지 챙겼어요 ☕',
        photoUri: demoPhoto('☕', '#D8B08C'),
        occurredAt: seoulTime(prevTuesday, '08:42:00'),
        createdAt: seoulTime(prevTuesday, '08:44:00'),
        updatedAt: seoulTime(prevTuesday, '08:44:00'),
        syncStatus: 'SYNCED',
      },
      {
        id: 'expense-me-lunch',
        clientRequestId: 'seed-expense-2',
        periodId: 'period-prev',
        userId: 'user-me',
        amount: 12_000,
        category: '점심',
        memo: '회사 앞 샐러드로 가볍게!',
        photoUri: demoPhoto('🥗', '#B7C98C'),
        occurredAt: seoulTime(prevWednesday, '12:18:00'),
        createdAt: seoulTime(prevWednesday, '12:20:00'),
        updatedAt: seoulTime(prevWednesday, '12:20:00'),
        syncStatus: 'SYNCED',
      },
      {
        id: 'expense-jungwoo-lunch',
        clientRequestId: 'seed-expense-3',
        periodId: 'period-prev',
        userId: 'user-jungwoo',
        amount: 9_000,
        category: '점심',
        memo: '구내식당',
        photoUri: demoPhoto('🍱', '#E9C48B'),
        occurredAt: seoulTime(prevWednesday, '12:10:00'),
        createdAt: seoulTime(prevWednesday, '12:11:00'),
        updatedAt: seoulTime(prevWednesday, '12:11:00'),
        syncStatus: 'SYNCED',
      },
      {
        id: 'expense-jungwoo-essential',
        clientRequestId: 'seed-expense-4',
        periodId: 'period-prev',
        userId: 'user-jungwoo',
        amount: 29_000,
        category: '필수품',
        memo: '세제와 휴지',
        photoUri: demoPhoto('🧻', '#D9D7C7'),
        occurredAt: seoulTime(prevTuesday, '19:10:00'),
        createdAt: seoulTime(prevTuesday, '19:12:00'),
        updatedAt: seoulTime(prevTuesday, '19:12:00'),
        syncStatus: 'SYNCED',
      },
    ],
    comments: [
      {
        id: 'comment-1',
        clientRequestId: 'seed-comment-1',
        expenseId: 'expense-me-lunch',
        userId: 'user-minji',
        body: '완전 알뜰하다 👏',
        createdAt: seoulTime(prevWednesday, '12:24:00'),
        updatedAt: seoulTime(prevWednesday, '12:24:00'),
        syncStatus: 'SYNCED',
      },
      {
        id: 'comment-2',
        clientRequestId: 'seed-comment-2',
        expenseId: 'expense-me-lunch',
        userId: 'user-me',
        body: '다음 주도 같이 가자!',
        replyToId: 'comment-1',
        createdAt: seoulTime(prevWednesday, '12:26:00'),
        updatedAt: seoulTime(prevWednesday, '12:26:00'),
        syncStatus: 'SYNCED',
      },
    ],
    processedRequestIds: [],
  };
}

function demoPeriod(id: string, weekIndex: number, weekStart: LocalDate): Period {
  const timeline = createPeriodTimeline(weekStart);
  const phase = getPeriodPhase(timeline, Date.now());
  return {
    id,
    roomId: 'room-demo',
    weekIndex,
    weekStart,
    weekEnd: addLocalDays(weekStart, 4),
    selectedDayCount: 5,
    validDayCount: 5,
    holidayDates: [],
    holidayVersionId: 'demo-empty',
    phase,
    isRestWeek: false,
    finalizedAt: phase === 'ARCHIVED' ? new Date(timeline.F).toISOString() : undefined,
    createdAt: seoulTime(weekStart, '00:00:00'),
  };
}

function demoPeriodMember(periodId: string, userId: string, weekStart: LocalDate): PeriodMember {
  return {
    periodId,
    userId,
    joinedAt: seoulTime(weekStart, '00:00:00'),
    joinedDate: weekStart,
    eligibleDayCount: 5,
    appliedLimit: 50_000,
    status: 'ACTIVE',
    isLateJoiner: false,
  };
}

function demoResult(period: Period, userId: string, nickname: string, spent: number, crown: boolean): PeriodResult {
  return {
    periodId: period.id,
    roomId: period.roomId,
    userId,
    nickname,
    appliedLimit: 50_000,
    spentAmount: spent,
    remainingAmount: 50_000 - spent,
    achieved: spent <= 50_000,
    isCrown: crown,
    finalizedAt: period.finalizedAt ?? new Date(createPeriodTimeline(period.weekStart).F).toISOString(),
  };
}

function demoStats(userId: string, crowned: boolean) {
  return {
    roomId: 'room-demo',
    userId,
    participatedWeekCount: 1,
    achievedWeekCount: 1,
    crownCount: crowned ? 1 : 0,
    currentStreak: 1,
  };
}
