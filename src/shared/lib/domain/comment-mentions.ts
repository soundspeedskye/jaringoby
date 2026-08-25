import type { CommentMentionInput } from "@/shared/api/types";

export type ActiveMention = { start: number; end: number; query: string };

/** TextInput의 UTF-16 커서 위치에서 열려 있는 @검색어를 찾는다. */
export function findActiveMention(body: string, cursor: number): ActiveMention | null {
  const prefix = body.slice(0, cursor);
  const match = /(?:^|\s)@([^\s@]*)$/u.exec(prefix);
  if (!match) return null;
  return {
    start: prefix.length - match[0].length + (match[0].startsWith("@") ? 0 : 1),
    end: cursor,
    query: match[1] ?? "",
  };
}

export function codePointLength(value: string): number {
  return Array.from(value).length;
}

/** 본문 변경으로 건드려진 멘션은 일반 텍스트로 전환하고, 나머지는 위치를 보정한다. */
export function remapMentions(
  previousBody: string,
  nextBody: string,
  mentions: readonly CommentMentionInput[],
): CommentMentionInput[] {
  const previous = Array.from(previousBody);
  const next = Array.from(nextBody);
  let prefix = 0;
  while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < previous.length - prefix
    && suffix < next.length - prefix
    && previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) suffix += 1;
  const previousEnd = previous.length - suffix;
  const nextEnd = next.length - suffix;
  const shift = nextEnd - previousEnd;
  return mentions.flatMap((mention) => {
    if (mention.end <= prefix) return [mention];
    if (mention.start >= previousEnd) {
      return [{ ...mention, start: mention.start + shift, end: mention.end + shift }];
    }
    return [];
  });
}

export function replaceActiveMention(
  body: string,
  active: ActiveMention,
  candidate: { userId: string; nickname: string },
  mentions: readonly CommentMentionInput[],
): { body: string; mentions: CommentMentionInput[]; cursor: number } {
  const value = `@${candidate.nickname} `;
  const nextBody = `${body.slice(0, active.start)}${value}${body.slice(active.end)}`;
  const start = codePointLength(nextBody.slice(0, active.start));
  const end = start + codePointLength(`@${candidate.nickname}`);
  return {
    body: nextBody,
    mentions: [
      ...remapMentions(body, nextBody, mentions),
      { userId: candidate.userId, start, end, displayName: candidate.nickname },
    ].sort((left, right) => left.start - right.start),
    cursor: active.start + value.length,
  };
}

export function isRenderableMention(body: string, mention: CommentMentionInput): boolean {
  const points = Array.from(body);
  return points.slice(mention.start, mention.end).join("") === `@${mention.displayName}`;
}
