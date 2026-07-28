export const DELETED_REPLY_PREVIEW = '삭제된 메시지에 대한 답글' as const;
export const COMMENT_MAX_CHARACTERS = 500;

export interface CommentBodyValidation {
  readonly valid: boolean;
  /** Length the database will see, i.e. char_length(btrim(body)). */
  readonly length: number;
  readonly reason: 'VALID' | 'EMPTY' | 'TOO_LONG';
}

export interface ReplyTargetMessage {
  readonly messageId: string;
  readonly authorNickname: string;
  readonly body: string;
  readonly deleted: boolean;
  /** A reply can itself be targeted, but this ancestry is never copied into the new command. */
  readonly replyToMessageId?: string | null;
}

export interface ReplyDraft {
  readonly body: '';
  readonly quote: {
    readonly messageId: string;
    readonly authorNickname: string;
    readonly preview: string;
    readonly deleted: boolean;
    readonly readOnly: true;
  };
}

export interface CommentCommand {
  readonly body: string;
  /** Exactly zero or one direct message reference; no nested reply object is persisted. */
  readonly replyToMessageId: string | null;
}

/**
 * Normalizes exactly like the database, which stores `btrim(body)`.
 * Postgres `btrim` with one argument strips spaces only — not newlines or
 * tabs — so a JavaScript `.trim()` would remove more than the server does.
 */
export function normalizeCommentBody(body: string): string {
  return body.replace(/^ +| +$/gu, '');
}

/**
 * Mirrors `char_length(btrim(body)) between 1 and 500`. `char_length` counts
 * code points, so surrogate pairs (emoji) must not be counted as two.
 * Whitespace-only bodies are rejected here even though `btrim` would let a
 * newline through: staying stricter than the server never lets through
 * something it would refuse.
 */
export function validateCommentBody(body: string): CommentBodyValidation {
  const length = Array.from(normalizeCommentBody(body)).length;
  const reason =
    body.trim().length === 0
      ? 'EMPTY'
      : length > COMMENT_MAX_CHARACTERS
        ? 'TOO_LONG'
        : 'VALID';
  return Object.freeze({
    valid: reason === 'VALID',
    length,
    reason,
  });
}

export function prepareReplyDraft(target: ReplyTargetMessage, previewLength = 60): ReplyDraft {
  if (!target.messageId.trim()) {
    throw new RangeError('Reply target messageId is required');
  }
  if (!Number.isInteger(previewLength) || previewLength < 1) {
    throw new RangeError('previewLength must be a positive integer');
  }

  const preview = target.deleted
    ? DELETED_REPLY_PREVIEW
    : truncateCodePoints(target.body.replace(/\s+/gu, ' ').trim(), previewLength);

  return Object.freeze({
    // The quoted source never gets injected into the editable composer body.
    body: '' as const,
    quote: Object.freeze({
      messageId: target.messageId,
      authorNickname: target.authorNickname,
      preview,
      deleted: target.deleted,
      readOnly: true as const,
    }),
  });
}

export function createCommentCommand(body: string, replyDraft?: ReplyDraft | null): CommentCommand {
  const validation = validateCommentBody(body);
  if (!validation.valid) {
    throw new RangeError(`Invalid comment body: ${validation.reason}`);
  }
  return Object.freeze({
    body,
    replyToMessageId: replyDraft?.quote.messageId ?? null,
  });
}

function truncateCodePoints(value: string, maxLength: number): string {
  const points = Array.from(value);
  return points.length <= maxLength ? value : `${points.slice(0, maxLength).join('')}…`;
}
