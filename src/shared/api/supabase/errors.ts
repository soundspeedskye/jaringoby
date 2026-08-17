/** 리포지토리 계층이 던지는 오류. 매퍼와 리포지토리 양쪽이 쓰므로
    순환 import를 피하려고 별도 모듈에 둔다. */
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
