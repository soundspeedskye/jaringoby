/**
 * PostgREST가 갓 발급된 토큰을 `PGRST303: JWT issued at future`로 거부하는 일이
 * 있다. 토큰을 발급하는 GoTrue와 검증하는 PostgREST의 시계가 어긋나 있으면,
 * 발급된 지 얼마 안 된 토큰의 iat가 검증 서버 기준으로는 아직 미래이기 때문이다.
 *
 * 앱에서는 토큰이 만료됐을 때만 갱신하므로, 오래 닫아뒀다 열어 갱신이 일어난
 * 직후의 첫 조회가 정확히 이 창에 걸린다. 스냅샷 조회 하나만 실패해도 로드
 * 전체가 무너져 "다시 시도"를 눌러야 하는 에러 화면이 떴다.
 *
 * 실측(2026-08-23): 발급 1.41초 뒤에도 거부됐고, 이어진 네 번의 측정에서는
 * 0.4~0.9초에 통과했다. 즉 보통은 1초 미만이지만 가끔 그보다 크게 벌어진다.
 *
 * 서버 쪽 편차라 앱에서 없앨 수 없다. 시계가 따라잡기를 잠깐 기다렸다 다시
 * 보내는 것 말고는 방법이 없다. PostgREST는 JWT 검증을 쿼리 실행 전에 끝내므로
 * 이 401은 아무것도 실행되지 않았다는 뜻이고, 변경 요청을 다시 보내도 중복
 * 실행되지 않는다.
 */
export const CLOCK_SKEW_RETRY_DELAYS_MS: readonly number[] = [400, 1200];

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function isClockSkewRejection(response: Response): Promise<boolean> {
  if (response.status !== 401) return false;
  try {
    const body = await response.clone().text();
    // 만료·서명 오류 같은 진짜 인증 실패는 재시도해도 소용없다. 시계 편차를
    // 가리키는 응답만 좁게 집어낸다.
    return body.includes('PGRST303') && body.includes('issued at future');
  } catch {
    return false;
  }
}

export function createClockSkewRetryFetch(
  baseFetch: typeof fetch,
  options: {
    delaysMs?: readonly number[];
    wait?: (ms: number) => Promise<void>;
  } = {},
): typeof fetch {
  const delaysMs = options.delaysMs ?? CLOCK_SKEW_RETRY_DELAYS_MS;
  const wait = options.wait ?? sleep;
  return async (input, init) => {
    let response = await baseFetch(input, init);
    // Request 객체는 본문이 이미 소비돼 그대로 다시 보낼 수 없다. supabase-js는
    // URL 문자열로 호출하므로 재시도가 필요한 경로는 전부 아래를 탄다.
    if (typeof input !== 'string' && !(input instanceof URL)) return response;
    for (const ms of delaysMs) {
      if (!(await isClockSkewRejection(response))) return response;
      await wait(ms);
      response = await baseFetch(input, init);
    }
    return response;
  };
}
