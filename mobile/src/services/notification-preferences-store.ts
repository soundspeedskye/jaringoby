import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";

const PREFERENCES_KEY = "jaringoby.notification-preferences.v1";

export type NotificationPreferences = {
  periodEvents: boolean;
  socialEvents: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  // 알림 권한 요청은 사용자의 명시적인 opt-in에서만 시작한다.
  periodEvents: false,
  socialEvents: false,
};

type NotificationPreferencesState = {
  ready: boolean;
  preferences: NotificationPreferences;
};

type Listener = () => void;

class NotificationPreferencesStore {
  private state: NotificationPreferencesState = {
    ready: false,
    preferences: DEFAULT_NOTIFICATION_PREFERENCES,
  };
  private readonly listeners = new Set<Listener>();
  private loadPromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  getSnapshot = (): NotificationPreferencesState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  load = (): Promise<void> => {
    if (this.state.ready) return Promise.resolve();
    if (!this.loadPromise) {
      this.loadPromise = this.loadStoredPreferences()
        .finally(() => {
          this.loadPromise = null;
        });
    }
    return this.loadPromise;
  };

  update = (
    key: keyof NotificationPreferences,
    value: boolean,
  ): Promise<void> => {
    const operation = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        await this.load();
        const previous = this.state.preferences;
        if (previous[key] === value) return;
        const next = { ...previous, [key]: value };
        await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
        this.setState({ ready: true, preferences: next });
      });
    this.writeQueue = operation;
    return operation;
  };

  private async loadStoredPreferences(): Promise<void> {
    let preferences = DEFAULT_NOTIFICATION_PREFERENCES;
    try {
      const stored = await AsyncStorage.getItem(PREFERENCES_KEY);
      if (stored) {
        preferences = {
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          ...(JSON.parse(stored) as Partial<NotificationPreferences>),
        };
      }
    } catch {
      preferences = DEFAULT_NOTIFICATION_PREFERENCES;
    }
    this.setState({ ready: true, preferences });
  }

  private setState(state: NotificationPreferencesState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
}

const notificationPreferencesStore = new NotificationPreferencesStore();

export function useNotificationPreferences(): NotificationPreferencesState & {
  updatePreference: (
    key: keyof NotificationPreferences,
    value: boolean,
  ) => Promise<void>;
} {
  const state = useSyncExternalStore(
    notificationPreferencesStore.subscribe,
    notificationPreferencesStore.getSnapshot,
    notificationPreferencesStore.getSnapshot,
  );
  useEffect(() => {
    void notificationPreferencesStore.load();
  }, []);
  return {
    ...state,
    updatePreference: notificationPreferencesStore.update,
  };
}
