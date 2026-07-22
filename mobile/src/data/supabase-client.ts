import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

let singleton: SupabaseClient | null = null;
let hasInstalledAppStateListener = false;

export function hasSupabaseConfiguration(): boolean {
  return Boolean(
    supabaseUrl &&
      isSafeSupabaseUrl(supabaseUrl) &&
      supabasePublishableKey &&
      !supabaseUrl.includes('your-project') &&
      !supabasePublishableKey.includes('your_key') &&
      isSafePublishableKey(supabasePublishableKey),
  );
}

/**
 * Returns the one public-client instance shared by the auth gate and data
 * repository. Only a publishable key is accepted through the Expo public env.
 */
export function getSupabaseClient(): SupabaseClient {
  if (singleton) return singleton;
  if (!hasSupabaseConfiguration() || !supabaseUrl || !supabasePublishableKey) {
    throw new Error('SUPABASE_NOT_CONFIGURED: Supabase 연결 정보가 설정되지 않았어요.');
  }

  singleton = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      ...(Platform.OS === 'web' ? {} : { storage: AsyncStorage }),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  });

  if (Platform.OS !== 'web' && !hasInstalledAppStateListener) {
    hasInstalledAppStateListener = true;
    if (AppState.currentState === 'active') singleton.auth.startAutoRefresh();
    AppState.addEventListener('change', (state) => {
      if (!singleton) return;
      if (state === 'active') singleton.auth.startAutoRefresh();
      else singleton.auth.stopAutoRefresh();
    });
  }

  return singleton;
}

/** Creates a non-persistent data client pinned to one already-issued user token. */
export function createSupabaseClientForAccessToken(accessToken: string): SupabaseClient {
  if (!hasSupabaseConfiguration() || !supabaseUrl || !supabasePublishableKey) {
    throw new Error('SUPABASE_NOT_CONFIGURED: Supabase 연결 정보가 설정되지 않았어요.');
  }
  return createClient(supabaseUrl, supabasePublishableKey, {
    accessToken: async () => accessToken,
  });
}

function isSafeSupabaseUrl(value: string): boolean {
  if (/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/u.test(value)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/[^\s]*)?$/u.test(value);
}

function isSafePublishableKey(key: string): boolean {
  if (key.startsWith('sb_publishable_')) return true;
  if (key.startsWith('sb_secret_')) return false;

  const payload = key.split('.')[1];
  if (!payload) return false;
  try {
    const decoded = decodeBase64UrlAscii(payload);
    const claims = JSON.parse(decoded) as { role?: unknown };
    return claims.role === 'anon';
  } catch {
    return false;
  }
}

function decodeBase64UrlAscii(value: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const source = value.replace(/-/gu, '+').replace(/_/gu, '/').replace(/=+$/gu, '');
  let bits = 0;
  let bitCount = 0;
  let result = '';
  for (const character of source) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('invalid base64url');
    bits = (bits << 6) | index;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      result += String.fromCharCode((bits >>> bitCount) & 0xff);
    }
  }
  return result;
}
