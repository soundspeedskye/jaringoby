import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import { fonts, palette, radii, shadow, spacing } from '@/constants/design';

export type AppDialogAction = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

type AppDialogRequest = {
  /** 비우면 항목만 보여준다. 갈래를 고르는 메뉴에는 설명이 필요 없다. */
  title?: string;
  message?: string;
  actions: readonly AppDialogAction[];
};

type AppDialogContextValue = {
  /** 가운데 다이얼로그. 제목·본문은 비울 수 있고, 그러면 항목만 보여준다. */
  showDialog: (
    title?: string,
    message?: string,
    actions?: readonly AppDialogAction[],
  ) => void;
};

const AppDialogContext = createContext<AppDialogContextValue | null>(null);
const DEFAULT_ACTIONS: readonly AppDialogAction[] = [{ text: '확인' }];

export function AppDialogProvider({ children }: PropsWithChildren) {
  const [request, setRequest] = useState<AppDialogRequest | null>(null);

  const showDialog = useCallback<AppDialogContextValue['showDialog']>(
    (title, message, actions = DEFAULT_ACTIONS) => {
      const requested = actions.length ? actions : DEFAULT_ACTIONS;
      setRequest({ title, message, actions: withCancelLast(requested) });
    },
    [],
  );

  const dismiss = useCallback(() => {
    const cancelAction = request?.actions.find((action) => action.style === 'cancel');
    setRequest(null);
    cancelAction?.onPress?.();
  }, [request]);

  const choose = useCallback((action: AppDialogAction) => {
    setRequest(null);
    action.onPress?.();
  }, []);

  const value = useMemo(() => ({ showDialog }), [showDialog]);

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      <Modal
        accessibilityViewIsModal
        animationType="fade"
        onRequestClose={dismiss}
        statusBarTranslucent
        transparent
        visible={Boolean(request)}>
        {request ? (
          <View style={styles.backdrop} testID="app-dialog-backdrop">
            <View
              accessibilityLabel={
                [request.title, request.message].filter(Boolean).join('. ') || undefined
              }
              accessibilityRole="alert"
              style={styles.dialog}
              testID="app-dialog">
              {request.title ? (
                <Text style={styles.title} testID="app-dialog-title">
                  {request.title}
                </Text>
              ) : null}
              {request.message ? <Text style={styles.message}>{request.message}</Text> : null}
              <View
                style={[
                  styles.actions,
                  !request.title && !request.message && styles.actionsOnly,
                ]}>
                {request.actions.map((action, index) => (
                  <Pressable
                    accessibilityRole="button"
                    key={`${action.text}:${index}`}
                    onPress={() => choose(action)}
                    style={({ pressed }) => [
                      styles.action,
                      action.style === 'cancel' && styles.cancelAction,
                      action.style === 'destructive' && styles.destructiveAction,
                      pressed && styles.pressed,
                    ]}
                    testID={`app-dialog-action-${index}`}>
                    <Text
                      style={[
                        styles.actionLabel,
                        action.style === 'cancel' && styles.cancelLabel,
                      ]}>
                      {action.text}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <Pressable
              aria-hidden
              accessible={false}
              focusable={false}
              onPress={dismiss}
              style={styles.dismissLayer}
              tabIndex={-1}
              testID="app-dialog-dismiss"
            />
          </View>
        ) : null}
      </Modal>
    </AppDialogContext.Provider>
  );
}

/** 세로로 쌓이는 버튼에서는 취소가 맨 아래여야 한다. 호출처는 OS Alert 관례대로 먼저 넘긴다. */
function withCancelLast(
  actions: readonly AppDialogAction[],
): readonly AppDialogAction[] {
  return [
    ...actions.filter((action) => action.style !== 'cancel'),
    ...actions.filter((action) => action.style === 'cancel'),
  ];
}

export function useAppDialog(): AppDialogContextValue {
  const context = useContext(AppDialogContext);
  if (!context) throw new Error('useAppDialog must be used inside AppDialogProvider');
  return context;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: 'rgba(52,49,40,0.42)',
  },
  dialog: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: 420,
    padding: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.paper,
    ...shadow,
  },
  dismissLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 0,
  },
  title: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 19,
    fontWeight: '700',
  },
  message: {
    marginTop: spacing.sm,
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 14,
    lineHeight: 21,
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  // 제목·본문이 없으면 위쪽 여백이 붕 뜬다.
  actionsOnly: { marginTop: 0 },
  action: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: palette.green,
  },
  cancelAction: {
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.paper,
  },
  destructiveAction: {
    backgroundColor: palette.danger,
  },
  actionLabel: {
    color: palette.cream,
    fontFamily: fonts.handBold,
    fontSize: 14,
    fontWeight: '700',
  },
  cancelLabel: {
    color: palette.ink,
  },
  pressed: {
    opacity: 0.82,
  },
});
