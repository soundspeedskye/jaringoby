import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { getRepositoryRuntime } from '@/data/repository-factory';
import { getSupabaseClient } from '@/data/supabase-client';

type SessionContextValue = {
  loading: boolean;
  requiresAuth: boolean;
  recoveryMode: boolean;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, nickname: string) => Promise<'SIGNED_IN' | 'CONFIRM_EMAIL'>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  completeRecovery: () => void;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const runtime = getRepositoryRuntime();
  const requiresAuth = runtime.dataMode === 'supabase';
  const [loading, setLoading] = useState(requiresAuth);
  const [session, setSession] = useState<Session | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    if (!requiresAuth) return;
    let cancelled = false;
    const client = getSupabaseClient();
    const applyAuthUrl = async (url: string | null) => {
      if (!url) return;
      const params = authUrlParameters(url);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (!accessToken || !refreshToken) return;
      if (params.get('type') === 'recovery') setRecoveryMode(true);
      await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    };

    const authSubscription = client.auth.onAuthStateChange((event, nextSession) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      setSession(nextSession);
      setLoading(false);
    }).data.subscription;
    const linkSubscription = Linking.addEventListener('url', ({ url }) => {
      void applyAuthUrl(url);
    });
    void Promise.all([client.auth.getSession(), Linking.getInitialURL()])
      .then(async ([sessionResult, initialUrl]) => {
        if (sessionResult.error) throw sessionResult.error;
        await applyAuthUrl(initialUrl);
        if (!cancelled) setSession(sessionResult.data.session);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      authSubscription.unsubscribe();
      linkSubscription.remove();
    };
  }, [requiresAuth]);

  const signIn = useCallback(async (email: string, password: string) => {
    validateEmail(email);
    validatePassword(password);
    const { error } = await getSupabaseClient().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw authError(error.message);
  }, []);

  const signUp = useCallback(async (email: string, password: string, nickname: string) => {
    validateEmail(email);
    validatePassword(password);
    const cleanNickname = nickname.trim();
    if (cleanNickname.length < 2 || cleanNickname.length > 20) {
      throw new Error('닉네임은 공백을 제외하고 2~20자로 입력해 주세요.');
    }
    const { data, error } = await getSupabaseClient().auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { nickname: cleanNickname },
        emailRedirectTo: Linking.createURL('/'),
      },
    });
    if (error) throw authError(error.message);
    return data.session ? 'SIGNED_IN' : 'CONFIRM_EMAIL';
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    validateEmail(email);
    const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: Linking.createURL('/reset-password'),
    });
    if (error) throw authError(error.message);
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    validatePassword(password);
    const { error } = await getSupabaseClient().auth.updateUser({ password });
    if (error) throw authError(error.message);
    setRecoveryMode(false);
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await getSupabaseClient().auth.signOut({ scope: 'local' });
    if (error) throw authError(error.message);
    setRecoveryMode(false);
  }, []);

  const value = useMemo<SessionContextValue>(() => ({
    loading,
    requiresAuth,
    recoveryMode,
    session,
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
    completeRecovery: () => setRecoveryMode(false),
    signOut,
  }), [loading, recoveryMode, requestPasswordReset, requiresAuth, session, signIn, signOut, signUp, updatePassword]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}

function authUrlParameters(url: string): URLSearchParams {
  const [, fragment = ''] = url.split('#', 2);
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#', 1)[0] : '';
  return new URLSearchParams(fragment || query);
}

function validateEmail(value: string): void {
  if (!/^\S+@\S+\.\S+$/u.test(value.trim())) throw new Error('이메일 주소를 확인해 주세요.');
}

function validatePassword(value: string): void {
  if (value.length < 8) throw new Error('비밀번호는 8자 이상이어야 해요.');
}

function authError(message: string): Error {
  const normalized = message.toLowerCase();
  if (normalized.includes('invalid login')) return new Error('이메일 또는 비밀번호를 확인해 주세요.');
  if (normalized.includes('email not confirmed')) return new Error('이메일 인증을 먼저 완료해 주세요.');
  if (normalized.includes('already registered')) return new Error('이미 가입된 이메일이에요.');
  if (normalized.includes('rate limit')) return new Error('요청이 너무 많아요. 잠시 후 다시 시도해 주세요.');
  return new Error('계정 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
}
