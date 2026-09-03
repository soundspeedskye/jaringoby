import { describe, expect, it } from 'vitest';

import {
  parseRecoveryAuthLink,
  recoveryLinkError,
  type DeepLinkLocation,
} from '@/shared/lib/auth-link';

// 아래 location 값은 실행 환경별 `Linking.parse(url)` 실제 출력이다.
// expo-linking은 new URL()로 파싱한 뒤 Expo Go에서만 `/--/` 접두사를 벗겨낸다.
const STORE: DeepLinkLocation = { hostname: 'reset-password', path: null };
const TRIPLE_SLASH: DeepLinkLocation = { hostname: null, path: 'reset-password' };
const EXPO_GO: DeepLinkLocation = { hostname: null, path: 'reset-password' };
const DEV_BUILD: DeepLinkLocation = { hostname: '10.0.0.2', path: 'reset-password' };

const TOKENS = 'access_token=head.body.sig&refresh_token=r-123&type=recovery';

describe('parseRecoveryAuthLink', () => {
  it('reads the tokens a store build receives', () => {
    expect(
      parseRecoveryAuthLink(`zaringovy://reset-password#${TOKENS}`, STORE),
    ).toEqual({
      kind: 'TOKENS',
      accessToken: 'head.body.sig',
      refreshToken: 'r-123',
    });
  });

  it.each([
    ['triple-slashed scheme', 'zaringovy:///reset-password', TRIPLE_SLASH],
    ['Expo Go', 'exp://10.0.0.2:8081/--/reset-password', EXPO_GO],
    // 개발 서버에 붙은 개발 빌드는 hostUri가 URL에 남아 hostname이 LAN 주소가 된다.
    // hostname과 path를 이어 붙이면 이 경우에만 경로가 어긋나 링크가 무시된다.
    ['a dev build on a dev server', 'zaringovy://10.0.0.2:8081/reset-password', DEV_BUILD],
  ])('reads the tokens on %s too', (_name, base, location) => {
    expect(parseRecoveryAuthLink(`${base}#${TOKENS}`, location)).toEqual({
      kind: 'TOKENS',
      accessToken: 'head.body.sig',
      refreshToken: 'r-123',
    });
  });

  it('reports an expired link, which arrives with no tokens and no type', () => {
    expect(
      parseRecoveryAuthLink(
        'zaringovy://reset-password#error=access_denied&error_code=otp_expired',
        STORE,
      ),
    ).toEqual({ kind: 'REJECTED', code: 'otp_expired' });
  });

  it('reports a rejection that carries no error_code', () => {
    expect(
      parseRecoveryAuthLink('zaringovy://reset-password?error=access_denied', STORE),
    ).toEqual({ kind: 'REJECTED', code: null });
  });

  it('ignores deep links that are not the recovery route', () => {
    expect(
      parseRecoveryAuthLink(`zaringovy://room/join#${TOKENS}`, {
        hostname: 'room',
        path: 'join',
      }),
    ).toBeNull();
  });

  it('ignores a recovery-route link that is not a recovery response', () => {
    expect(
      parseRecoveryAuthLink('zaringovy://reset-password', STORE),
    ).toBeNull();
  });

  it('ignores tokens that arrive without the recovery type', () => {
    expect(
      parseRecoveryAuthLink(
        'zaringovy://reset-password#access_token=head.body.sig&refresh_token=r-123',
        STORE,
      ),
    ).toBeNull();
  });

  it('refuses a half-filled token pair rather than starting a session', () => {
    expect(
      parseRecoveryAuthLink(
        'zaringovy://reset-password#access_token=head.body.sig&type=recovery',
        STORE,
      ),
    ).toBeNull();
  });
});

describe('recoveryLinkError', () => {
  it('names expiry as the cause so the user knows to request a new link', () => {
    expect(recoveryLinkError('otp_expired')).toContain('만료');
    expect(recoveryLinkError('access_denied')).toContain('만료');
  });

  it('still explains an unrecognised rejection', () => {
    expect(recoveryLinkError(null)).toContain('다시 요청');
    expect(recoveryLinkError('something_new')).toContain('다시 요청');
  });
});
