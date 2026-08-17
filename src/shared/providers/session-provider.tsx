import type { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import type { PropsWithChildren } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { getRepositoryRuntime } from "@/shared/api/repository-factory";
import { getSupabaseClient } from "@/shared/api/supabase-client";

type SessionContextValue = {
  loading: boolean;
  recoveryMode: boolean;
  accountSafetyNotice: string | null;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    nickname: string,
  ) => Promise<"SIGNED_IN" | "CONFIRM_EMAIL">;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  completeRecovery: () => void;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const runtime = getRepositoryRuntime();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [accountSafetyNotice, setAccountSafetyNotice] = useState<string | null>(
    null,
  );
  // 런타임 중 다른 계정의 세션이 들어오는 경우(Expo 재시작·딥링크·저장소
  // 경합 포함)를 명시적인 로그인/복구 흐름과 구분한다.
  const activeUserIdRef = useRef<string | null>(null);
  const accountChangeAllowedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let bootstrapComplete = false;
    const client = getSupabaseClient();
    runtime.setActiveUserId(null);
    const applySession = (event: string, nextSession: Session | null) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      runtime.setActiveUserId(nextSession?.user.id ?? null);
      activeUserIdRef.current = nextSession?.user.id ?? null;
      setSession(nextSession);
      setLoading(false);
    };
    const signOutForUnexpectedAuthLink = async () => {
      // 인증 링크의 계정이 현재 계정과 다르면 링크 세션을 적용하지 않는다.
      // 사용자가 원하지 않은 계정 전환보다 로그인 화면으로 돌아가는 편이 안전하다.
      try {
        await client.auth.signOut({ scope: "local" });
      } finally {
        // 로컬 저장소 정리가 실패해도 UI와 오프라인 데이터 계층은 즉시 비인증
        // 상태로 전환해 다른 계정의 기록을 계속 보이지 않게 한다.
        applySession("AUTH_LINK_ACCOUNT_MISMATCH", null);
        setAccountSafetyNotice("연결을 다시 확인해주세요.");
        setRecoveryMode(false);
      }
    };
    const applyAuthUrl = async (url: string | null) => {
      const link = parseRecoveryAuthLink(url);
      if (!link) return;

      // setSession 전에 서버에서 토큰의 실제 사용자 ID를 확인한다. URL fragment는
      // 어떤 앱 링크에도 붙을 수 있으므로, 토큰 존재만으로 세션을 바꾸면 안 된다.
      const { data, error } = await client.auth.getUser(link.accessToken);
      if (error || !data.user) return;
      const currentResult = await client.auth.getSession();
      if (currentResult.error) throw currentResult.error;
      const currentUserId = currentResult.data.session?.user.id;
      if (currentUserId && currentUserId !== data.user.id) {
        await signOutForUnexpectedAuthLink();
        return;
      }

      setRecoveryMode(true);
      accountChangeAllowedRef.current = true;
      await client.auth.setSession({
        access_token: link.accessToken,
        refresh_token: link.refreshToken,
      });
    };
    const authSubscription = client.auth.onAuthStateChange(
      (event, nextSession) => {
        // The initial URL may replace the persisted session. During bootstrap we
        // select the final session explicitly below; applying INITIAL_SESSION
        // here could replay the previous account's native offline queue first.
        if (cancelled || !bootstrapComplete || event === "INITIAL_SESSION")
          return;
        const currentUserId = activeUserIdRef.current;
        const nextUserId = nextSession?.user.id ?? null;
        const accountChanged = Boolean(
          currentUserId && nextUserId && currentUserId !== nextUserId,
        );
        if (accountChanged && !accountChangeAllowedRef.current) {
          void signOutForUnexpectedAuthLink();
          return;
        }
        if (accountChanged) accountChangeAllowedRef.current = false;
        applySession(event, nextSession);
      },
    ).data.subscription;
    const linkSubscription = Linking.addEventListener("url", ({ url }) => {
      void applyAuthUrl(url).catch(() => undefined);
    });
    void Promise.all([client.auth.getSession(), Linking.getInitialURL()])
      .then(async ([sessionResult, initialUrl]) => {
        if (sessionResult.error) throw sessionResult.error;
        await applyAuthUrl(initialUrl);
        const current = await client.auth.getSession();
        if (current.error) throw current.error;
        if (!cancelled) applySession("BOOTSTRAP", current.data.session);
      })
      .catch(() => {
        if (!cancelled) applySession("BOOTSTRAP", null);
      })
      .finally(() => {
        bootstrapComplete = true;
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      authSubscription.unsubscribe();
      linkSubscription.remove();
    };
  }, [runtime]);

  const signIn = useCallback(async (email: string, password: string) => {
    validateEmail(email);
    validatePassword(password);
    accountChangeAllowedRef.current = true;
    setAccountSafetyNotice(null);
    const { error } = await getSupabaseClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) accountChangeAllowedRef.current = false;
    if (error) throw authError(error.message);
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, nickname: string) => {
      validateEmail(email);
      validatePassword(password);
      const cleanNickname = nickname.trim();
      if (cleanNickname.length < 2 || cleanNickname.length > 20) {
        throw new Error(
          "닉네임은 앞뒤 공백을 제외하고 2~20자로 입력해 주세요.",
        );
      }
      accountChangeAllowedRef.current = true;
      setAccountSafetyNotice(null);
      const { data, error } = await getSupabaseClient().auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { nickname: cleanNickname },
          emailRedirectTo: Linking.createURL("/"),
        },
      });
      if (error) {
        accountChangeAllowedRef.current = false;
        throw authError(error.message);
      }
      if (!data.session) accountChangeAllowedRef.current = false;
      return data.session ? "SIGNED_IN" : "CONFIRM_EMAIL";
    },
    [],
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    validateEmail(email);
    const { error } = await getSupabaseClient().auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: Linking.createURL("/reset-password"),
      },
    );
    if (error) throw authError(error.message);
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    validatePassword(password);
    const { error } = await getSupabaseClient().auth.updateUser({ password });
    if (error) throw authError(error.message);
    setRecoveryMode(false);
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await getSupabaseClient().auth.signOut({
      scope: "local",
    });
    if (error) throw authError(error.message);
    getRepositoryRuntime().setActiveUserId(null);
    activeUserIdRef.current = null;
    accountChangeAllowedRef.current = false;
    setRecoveryMode(false);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      loading,
      recoveryMode,
      accountSafetyNotice,
      session,
      signIn,
      signUp,
      requestPasswordReset,
      updatePassword,
      completeRecovery: () => setRecoveryMode(false),
      signOut,
    }),
    [
      accountSafetyNotice,
      loading,
      recoveryMode,
      requestPasswordReset,
      session,
      signIn,
      signOut,
      signUp,
      updatePassword,
    ],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context)
    throw new Error("useSession must be used inside SessionProvider");
  return context;
}

function authUrlParameters(url: string): URLSearchParams {
  const [, fragment = ""] = url.split("#", 2);
  const query = url.includes("?")
    ? url.slice(url.indexOf("?") + 1).split("#", 1)[0]
    : "";
  return new URLSearchParams(fragment || query);
}

function parseRecoveryAuthLink(url: string | null): {
  accessToken: string;
  refreshToken: string;
} | null {
  if (!url) return null;
  const parsed = Linking.parse(url);
  // createURL('/reset-password') can become either the host or the path,
  // depending on the native scheme form (jaringoby://reset-password vs ///).
  const route = [parsed.hostname, parsed.path]
    .filter((part): part is string => Boolean(part))
    .join("/")
    .replace(/^\/+|\/+$/gu, "");
  const params = authUrlParameters(url);
  if (route !== "reset-password" || params.get("type") !== "recovery") {
    return null;
  }
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  return accessToken && refreshToken ? { accessToken, refreshToken } : null;
}

function validateEmail(value: string): void {
  if (!/^\S+@\S+\.\S+$/u.test(value.trim()))
    throw new Error("이메일 주소를 확인해 주세요.");
}

function validatePassword(value: string): void {
  if (value.length < 8) throw new Error("비밀번호는 8자 이상이어야 해요.");
}

function authError(message: string): Error {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login"))
    return new Error("이메일 또는 비밀번호를 확인해 주세요.");
  if (normalized.includes("email not confirmed"))
    return new Error("이메일 인증을 먼저 완료해 주세요.");
  if (normalized.includes("already registered"))
    return new Error("이미 가입된 이메일이에요.");
  if (normalized.includes("rate limit"))
    return new Error("요청이 너무 많아요. 잠시 후 다시 시도해 주세요.");
  return new Error(
    "계정 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
  );
}
