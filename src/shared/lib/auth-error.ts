/**
 * 인증 실패를 사용자가 읽고 행동할 수 있는 문구로 옮긴다.
 *
 * 원인이 전혀 다른 실패들이 한 문구로 뭉개지면 사용자는 자기가 고칠 수 있는
 * 문제(비밀번호를 바꾸면 되는 상황)조차 앱 고장으로 읽는다. 그래서 서버가
 * 알려준 만큼은 그대로 전달한다.
 *
 * 판정은 `code`를 우선한다. 메시지 본문은 GoTrue 버전에 따라 문장이 바뀌므로
 * 코드가 없는 옛 응답을 위한 보조 수단으로만 쓴다.
 */

export type AuthAction =
  | "SIGN_IN"
  | "SIGN_UP"
  | "RESET_REQUEST"
  | "PASSWORD_UPDATE"
  | "SIGN_OUT";

/** supabase-js AuthError에서 판정에 쓰는 부분. */
export type AuthFailure = {
  code?: string;
  /** AuthSessionMissingError처럼 코드 없이 이름으로만 구분되는 것이 있다. */
  name?: string;
  message?: string;
};

const ACTION_FALLBACK: Record<AuthAction, string> = {
  SIGN_IN: "로그인하지 못했어요. 잠시 후 다시 시도해 주세요.",
  SIGN_UP: "계정을 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
  RESET_REQUEST: "재설정 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.",
  PASSWORD_UPDATE: "비밀번호를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.",
  SIGN_OUT: "로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.",
};

const LINK_EXPIRED = "재설정 링크가 만료됐거나 이미 사용됐어요. 다시 요청해 주세요.";

/** 같은 코드라도 어떤 동작 중이냐에 따라 사용자가 할 일이 다른 것들. */
const BY_ACTION: Partial<Record<string, Partial<Record<AuthAction, string>>>> = {
  // 메일 발송 실패가 여기로 온다(SMTP 인증 실패 등). "잠시 후"로 풀리지 않는
  // 서버 설정 문제일 수 있어 재시도만 안내하지 않는다.
  unexpected_failure: {
    RESET_REQUEST:
      "메일을 보내지 못했어요. 문제가 이어지면 문의해 주세요.",
  },
  session_not_found: { PASSWORD_UPDATE: LINK_EXPIRED },
  session_expired: { PASSWORD_UPDATE: LINK_EXPIRED },
  bad_jwt: { PASSWORD_UPDATE: LINK_EXPIRED },
};

const BY_CODE: Record<string, string> = {
  invalid_credentials: "이메일 또는 비밀번호를 확인해 주세요.",
  email_not_confirmed: "이메일 인증을 먼저 완료해 주세요.",
  user_already_exists: "이미 가입된 이메일이에요.",
  email_exists: "이미 가입된 이메일이에요.",
  same_password: "지금 쓰는 비밀번호와 다른 걸로 정해 주세요.",
  weak_password: "너무 쉽게 추측되는 비밀번호예요. 다른 걸로 정해 주세요.",
  over_email_send_rate_limit: "메일 요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.",
  over_request_rate_limit: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
  otp_expired: LINK_EXPIRED,
  email_address_invalid: "이메일 주소를 확인해 주세요.",
  validation_failed: "입력한 내용을 다시 확인해 주세요.",
  signup_disabled: "지금은 새 계정을 만들 수 없어요.",
  user_banned: "사용할 수 없는 계정이에요. 문의해 주세요.",
  user_not_found: "계정을 찾을 수 없어요.",
};

export function authErrorMessage(
  failure: AuthFailure | null | undefined,
  action: AuthAction,
): string {
  const fallback = ACTION_FALLBACK[action];
  if (!failure) return fallback;

  // 세션이 없으면 요청은 서버에 닿지도 않는다. 비밀번호 변경 중이라면 링크가
  // 이미 소모된 경우이므로 다시 요청하라고 알려야 한다.
  if (failure.name === "AuthSessionMissingError") {
    return action === "PASSWORD_UPDATE"
      ? LINK_EXPIRED
      : "로그인 정보가 없어요. 다시 로그인해 주세요.";
  }

  const code = failure.code;
  if (code) {
    const byAction = BY_ACTION[code]?.[action];
    if (byAction) return byAction;
    const byCode = BY_CODE[code];
    if (byCode) return byCode;
  }

  return legacyMessage(failure.message ?? "") ?? fallback;
}

/**
 * 코드가 없던 시절의 응답을 위한 보조 판정. 코드가 붙은 뒤로는 위에서 걸리므로
 * 여기까지 오는 경우는 드물다.
 */
function legacyMessage(message: string): string | null {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login")) return BY_CODE.invalid_credentials;
  if (normalized.includes("email not confirmed")) return BY_CODE.email_not_confirmed;
  if (normalized.includes("already registered")) return BY_CODE.user_already_exists;
  if (normalized.includes("should be different")) return BY_CODE.same_password;
  if (normalized.includes("auth session missing")) return LINK_EXPIRED;
  if (normalized.includes("rate limit")) return BY_CODE.over_request_rate_limit;
  return null;
}
