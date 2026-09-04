import { useCallback, useRef, useState } from 'react';

export type SubmitController = {
  /** 제출이 도는 동안 참. 버튼의 loading/disabled에 그대로 쓴다. */
  submitting: boolean;
  /** 화면 아래 FormMessage에 보여 줄 문구. 제출을 시작할 때마다 비워진다. */
  error: string | null;
  setError: (message: string | null) => void;
  /**
   * 폼 제출 본문을 감싼다. 본문은 두 가지 방법으로 실패를 알린다.
   *  - 문자열을 돌려주면 그 문구를 그대로 보여 준다(입력값 검증 실패).
   *  - 예외를 던지면 그 메시지를, 메시지가 없으면 fallback을 보여 준다(요청 실패).
   * 진행 중에는 다시 들어오지 않으므로 화면마다 이중 제출을 막을 필요가 없다.
   *
   * 한 화면이 서로 다른 요청을 같은 자리에 보고할 때는 fallback을 그 호출에만
   * 덮어쓴다(예: 같은 버튼 자리에서 "나가기"와 "방 닫기").
   */
  submit: (
    run: () => Promise<string | void> | string | void,
    fallback?: string,
  ) => Promise<void>;
};

/**
 * 폼 화면 11곳이 똑같이 쓰던 "오류 비우고 → 진행 표시 켜고 → 요청하고 →
 * 실패하면 문구 남기고 → 진행 표시 끄기"를 한곳에 모은다.
 *
 * fallbackMessage는 예외에 사람이 읽을 메시지가 없을 때만 쓰인다.
 */
export function useSubmit(fallbackMessage: string): SubmitController {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // submitting은 다음 렌더에야 반영되므로, 연타를 막는 판단은 ref로 한다.
  const running = useRef(false);

  const submit = useCallback(
    async (
      run: () => Promise<string | void> | string | void,
      fallback?: string,
    ) => {
      if (running.current) return;
      running.current = true;
      setError(null);
      setSubmitting(true);
      try {
        const rejection = await run();
        if (rejection) setError(rejection);
      } catch (reason) {
        setError(
          reason instanceof Error ? reason.message : fallback ?? fallbackMessage,
        );
      } finally {
        running.current = false;
        setSubmitting(false);
      }
    },
    [fallbackMessage],
  );

  return { submitting, error, setError, submit };
}
