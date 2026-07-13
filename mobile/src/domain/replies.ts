export const DELETED_REPLY_PREVIEW = '삭제된 메시지에 대한 답글' as const;
export const COMMENT_MAX_NON_WHITESPACE_CHARACTERS = 500;

export interface CommentBodyValidation {
  readonly valid: boolean;
  readonly nonWhitespaceCharacters: number;
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

export function validateCommentBody(body: string): CommentBodyValidation {
  const nonWhitespaceCharacters = Array.from(body).filter((character) => !/\s/u.test(character)).length;
  const reason =
    nonWhitespaceCharacters === 0
      ? 'EMPTY'
      : nonWhitespaceCharacters > COMMENT_MAX_NON_WHITESPACE_CHARACTERS
        ? 'TOO_LONG'
        : 'VALID';
  return Object.freeze({
    valid: reason === 'VALID',
    nonWhitespaceCharacters,
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
