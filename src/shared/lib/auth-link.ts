/**
 * 비밀번호 재설정 딥링크 판정. 앱은 아무 딥링크로나 열릴 수 있고 URL fragment에는
 * 그대로 세션이 되는 토큰이 실려 오므로, 세션을 건드리기 전에 "우리가 요청했던
 * 경로로 온 복구 링크인가"를 먼저 좁힌다.
 *
 * 여기서는 형식만 본다. 토큰이 진짜인지는 호출부가 서버에 확인한다(getUser).
 */

export type RecoveryAuthLink = {
  accessToken: string;
  refreshToken: string;
};

/** `Linking.parse(url)` 결과 중 경로 판정에 쓰는 부분. */
export type DeepLinkLocation = {
  hostname: string | null;
  path: string | null;
};

const RECOVERY_ROUTE = "reset-password";

export function parseRecoveryAuthLink(
  url: string,
  location: DeepLinkLocation,
): RecoveryAuthLink | null {
  if (routeOf(location) !== RECOVERY_ROUTE) return null;

  const params = authUrlParameters(url);
  if (params.get("type") !== "recovery") return null;
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  return accessToken && refreshToken ? { accessToken, refreshToken } : null;
}

/**
 * 같은 경로가 실행 환경에 따라 hostname이나 path 어느 쪽으로도 온다.
 *
 *   스토어 빌드    zaringovy://reset-password        → hostname=reset-password, path=null
 *   삼중 슬래시    zaringovy:///reset-password       → hostname=null,           path=reset-password
 *   Expo Go       exp://10.0.0.2:8081/--/reset-…    → hostname=null,           path=reset-password
 *   개발 빌드      zaringovy://10.0.0.2:8081/reset-… → hostname=10.0.0.2,       path=reset-password
 *
 * 마지막 줄이 핵심이다. 개발 서버에 붙은 개발 빌드는 hostUri가 URL에 남아
 * hostname이 LAN 주소가 되므로, 둘을 이어 붙이면 어떤 값과도 맞지 않는다.
 * path가 있으면 그쪽이 언제나 실제 경로다.
 */
function routeOf(location: DeepLinkLocation): string {
  const raw = trimSlashes(location.path ?? "") || trimSlashes(location.hostname ?? "");
  return raw;
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/gu, "");
}

/**
 * implicit flow는 토큰을 fragment(`#`)에 싣지만 거절 응답은 query(`?`)로 오기도 한다.
 * 둘 다 받아 같은 방식으로 읽는다.
 */
function authUrlParameters(url: string): URLSearchParams {
  const [, fragment = ""] = url.split("#", 2);
  const query = url.includes("?")
    ? url.slice(url.indexOf("?") + 1).split("#", 1)[0]
    : "";
  return new URLSearchParams(fragment || query);
}
