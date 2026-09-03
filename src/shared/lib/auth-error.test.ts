import { describe, expect, it } from 'vitest';

import { authErrorMessage } from '@/shared/lib/auth-error';

describe('authErrorMessage', () => {
  it('tells the user to pick a different password instead of blaming the app', () => {
    // 실제로 겪은 사례: 서버는 422 same_password를 돌려주는데 화면에는
    // "계정 요청을 처리하지 못했어요"가 떠서 원인을 알 수 없었다.
    const message = authErrorMessage(
      {
        code: 'same_password',
        message: 'New password should be different from the old password.',
      },
      'PASSWORD_UPDATE',
    );
    expect(message).toContain('다른 걸로');
    expect(message).not.toContain('잠시 후');
  });

  it('does not tell the user to retry when the server failed to send the mail', () => {
    // SMTP 인증 실패는 재시도로 풀리지 않는다.
    const message = authErrorMessage({ code: 'unexpected_failure' }, 'RESET_REQUEST');
    expect(message).toContain('보내지 못했어요');
    expect(message).not.toContain('잠시 후');
  });

  it.each([
    ['session_not_found'],
    ['session_expired'],
    ['bad_jwt'],
    ['otp_expired'],
  ])('treats %s during a password update as a spent link', (code) => {
    expect(authErrorMessage({ code }, 'PASSWORD_UPDATE')).toContain('만료');
  });

  it('reads a missing session as a spent link, since the request never left the device', () => {
    expect(
      authErrorMessage(
        { name: 'AuthSessionMissingError', message: 'Auth session missing!' },
        'PASSWORD_UPDATE',
      ),
    ).toContain('만료');
  });

  it('asks the user to sign in again when the session is missing elsewhere', () => {
    expect(
      authErrorMessage(
        { name: 'AuthSessionMissingError', message: 'Auth session missing!' },
        'SIGN_IN',
      ),
    ).toContain('다시 로그인');
  });

  it.each([
    ['invalid_credentials', '확인해 주세요'],
    ['email_not_confirmed', '이메일 인증'],
    ['user_already_exists', '이미 가입'],
    ['weak_password', '추측'],
    ['over_email_send_rate_limit', '잠시 후'],
  ])('maps %s to a specific message', (code, expected) => {
    expect(authErrorMessage({ code }, 'SIGN_IN')).toContain(expected);
  });

  it('falls back to the action being attempted, not one generic sentence', () => {
    expect(authErrorMessage({ code: 'something_new' }, 'RESET_REQUEST')).toContain('재설정 메일');
    expect(authErrorMessage({ code: 'something_new' }, 'PASSWORD_UPDATE')).toContain('비밀번호를 바꾸지');
    expect(authErrorMessage({ code: 'something_new' }, 'SIGN_UP')).toContain('계정을 만들지');
    expect(authErrorMessage(null, 'SIGN_IN')).toContain('로그인하지 못했어요');
  });

  it('still reads older responses that carry no code', () => {
    expect(
      authErrorMessage({ message: 'Invalid login credentials' }, 'SIGN_IN'),
    ).toContain('이메일 또는 비밀번호');
    expect(
      authErrorMessage(
        { message: 'New password should be different from the old password.' },
        'PASSWORD_UPDATE',
      ),
    ).toContain('다른 걸로');
  });
});
