import type { AppSnapshot } from '@/data/types';
import { addLocalDays, parseLocalDate, toSeoulLocalDate, type LocalDate } from '@/domain';

function demoPhoto(emoji: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="100%" height="100%" fill="${color}"/><circle cx="450" cy="300" r="190" fill="#fff7e6" opacity=".72"/><text x="450" y="355" font-size="190" text-anchor="middle">${emoji}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function isWeekday(date: LocalDate): boolean {
  const { year, month, day } = parseLocalDate(date);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

function nextWeekday(date: LocalDate): LocalDate {
  let candidate = addLocalDays(date, 1);
  while (!isWeekday(candidate)) candidate = addLocalDays(candidate, 1);
  return candidate;
}

function weekdaysEndingAt(endDate: LocalDate, count: number): LocalDate[] {
  const dates: LocalDate[] = [];
  let candidate = endDate;
  while (dates.length < count) {
    if (isWeekday(candidate)) dates.unshift(candidate);
    candidate = addLocalDays(candidate, -1);
  }
  return dates;
}

function seoulTime(date: LocalDate, time: string): string {
  return `${date}T${time}+09:00`;
}

export function createDemoSnapshot(): AppSnapshot {
  const today = toSeoulLocalDate(Date.now());
  const activeDates = weekdaysEndingAt(nextWeekday(today), 5);
  const [activeStart, secondActiveDate, lateJoinDate, latestExpenseDate, activeEnd] = activeDates;
  const archivedDates = weekdaysEndingAt(addLocalDays(activeStart, -7), 5);
  const archivedStart = archivedDates[0];
  const archivedEnd = archivedDates[archivedDates.length - 1];

  return {
    currentUserId: 'user-me',
    profiles: [
      { id: 'user-me', nickname: '나', avatar: '🙂' },
      { id: 'user-minji', nickname: '민지', avatar: '🌿' },
      { id: 'user-jungwoo', nickname: '정우', avatar: '🐿️' },
    ],
    challenges: [
      {
        id: 'challenge-weekday',
        ownerId: 'user-minji',
        name: '5만원 방어 작전',
        inviteCode: 'SAVE50',
        startDate: activeStart,
        endDate: activeEnd,
        selectedDates: activeDates,
        holidayDates: [],
        holidaySnapshotVersion: `demo-${activeStart}`,
        baseLimit: 50_000,
        capacity: 6,
        phase: 'ACTIVE',
        createdAt: seoulTime(addLocalDays(activeStart, -2), '10:00:00'),
      },
      {
        id: 'challenge-archived',
        ownerId: 'user-me',
        name: '6월 마지막 주 커피 줄이기',
        inviteCode: 'OLD620',
        startDate: archivedStart,
        endDate: archivedEnd,
        selectedDates: archivedDates,
        holidayDates: [],
        holidaySnapshotVersion: `demo-${archivedStart}`,
        baseLimit: 25_000,
        capacity: 4,
        phase: 'ARCHIVED',
        createdAt: seoulTime(addLocalDays(archivedStart, -2), '09:00:00'),
        archivedAt: seoulTime(addLocalDays(archivedEnd, 3), '00:00:00'),
      },
    ],
    members: [
      {
        challengeId: 'challenge-weekday',
        userId: 'user-minji',
        joinedAt: seoulTime(addLocalDays(activeStart, -2), '10:00:00'),
        joinedDate: addLocalDays(activeStart, -2),
        appliedLimit: 50_000,
        status: 'ACTIVE',
        isLateJoiner: false,
      },
      {
        challengeId: 'challenge-weekday',
        userId: 'user-me',
        joinedAt: seoulTime(lateJoinDate, '09:00:00'),
        joinedDate: lateJoinDate,
        appliedLimit: 30_000,
        status: 'ACTIVE',
        isLateJoiner: true,
      },
      {
        challengeId: 'challenge-weekday',
        userId: 'user-jungwoo',
        joinedAt: seoulTime(addLocalDays(activeStart, -1), '11:00:00'),
        joinedDate: addLocalDays(activeStart, -1),
        appliedLimit: 50_000,
        status: 'ACTIVE',
        isLateJoiner: false,
      },
      {
        challengeId: 'challenge-archived',
        userId: 'user-me',
        joinedAt: seoulTime(addLocalDays(archivedStart, -2), '09:00:00'),
        joinedDate: addLocalDays(archivedStart, -2),
        appliedLimit: 25_000,
        status: 'ACTIVE',
        isLateJoiner: false,
      },
    ],
    expenses: [
      {
        id: 'expense-minji-coffee',
        clientRequestId: 'seed-expense-1',
        challengeId: 'challenge-weekday',
        userId: 'user-minji',
        amount: 4_500,
        category: '커피',
        memo: '텀블러 할인까지 챙겼어요 ☕',
        photoUri: demoPhoto('☕', '#D8B08C'),
        occurredAt: seoulTime(latestExpenseDate, '08:42:00'),
        createdAt: seoulTime(latestExpenseDate, '08:44:00'),
        updatedAt: seoulTime(latestExpenseDate, '08:44:00'),
        syncStatus: 'SYNCED',
      },
      {
        id: 'expense-me-lunch',
        clientRequestId: 'seed-expense-2',
        challengeId: 'challenge-weekday',
        userId: 'user-me',
        amount: 12_000,
        category: '점심',
        memo: '회사 앞 샐러드로 가볍게!',
        photoUri: demoPhoto('🥗', '#B7C98C'),
        occurredAt: seoulTime(lateJoinDate, '12:18:00'),
        createdAt: seoulTime(lateJoinDate, '12:20:00'),
        updatedAt: seoulTime(lateJoinDate, '12:20:00'),
        syncStatus: 'SYNCED',
      },
      {
        id: 'expense-jungwoo-lunch',
        clientRequestId: 'seed-expense-3',
        challengeId: 'challenge-weekday',
        userId: 'user-jungwoo',
        amount: 9_000,
        category: '점심',
        memo: '구내식당',
        photoUri: demoPhoto('🍱', '#E9C48B'),
        occurredAt: seoulTime(latestExpenseDate, '12:10:00'),
        createdAt: seoulTime(latestExpenseDate, '12:11:00'),
        updatedAt: seoulTime(latestExpenseDate, '12:11:00'),
        syncStatus: 'SYNCED',
      },
      {
        id: 'expense-jungwoo-essential',
        clientRequestId: 'seed-expense-4',
        challengeId: 'challenge-weekday',
        userId: 'user-jungwoo',
        amount: 29_000,
        category: '필수품',
        memo: '세제와 휴지',
        photoUri: demoPhoto('🧻', '#D9D7C7'),
        occurredAt: seoulTime(secondActiveDate, '19:10:00'),
        createdAt: seoulTime(secondActiveDate, '19:12:00'),
        updatedAt: seoulTime(secondActiveDate, '19:12:00'),
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
        createdAt: seoulTime(lateJoinDate, '12:24:00'),
        updatedAt: seoulTime(lateJoinDate, '12:24:00'),
        syncStatus: 'SYNCED',
      },
      {
        id: 'comment-2',
        clientRequestId: 'seed-comment-2',
        expenseId: 'expense-me-lunch',
        userId: 'user-me',
        body: '내일도 같이 가자!',
        replyToId: 'comment-1',
        createdAt: seoulTime(lateJoinDate, '12:26:00'),
        updatedAt: seoulTime(lateJoinDate, '12:26:00'),
        syncStatus: 'SYNCED',
      },
    ],
    processedRequestIds: [],
  };
}
