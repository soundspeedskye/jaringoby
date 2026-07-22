import {
  Alert,
  Modal,
  Platform,
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

import { palette, radii, shadow, spacing } from '@/constants/design';

export type AppDialogAction = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

type AppDialogRequest = {
  title: string;
  message?: string;
  actions: readonly AppDialogAction[];
};

type AppDialogContextValue = {
  showDialog: (
    title: string,
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
      const normalizedActions = actions.length ? actions : DEFAULT_ACTIONS;
      if (Platform.OS !== 'web') {
        Alert.alert(title, message, [...normalizedActions]);
        return;
      }
      setRequest({ title, message, actions: normalizedActions });
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
      {Platform.OS === 'web' ? (
        <Modal
          accessibilityViewIsModal
          animationType="fade"
          onRequestClose={dismiss}
          transparent
          visible={Boolean(request)}>
          {request ? (
            <View style={styles.backdrop} testID="app-dialog-backdrop">
              <View
                accessibilityLabel={`${request.title}${request.message ? `. ${request.message}` : ''}`}
                accessibilityRole="alert"
                style={styles.dialog}
                testID="app-dialog">
                <Text style={styles.title} testID="app-dialog-title">
                  {request.title}
                </Text>
                {request.message ? <Text style={styles.message}>{request.message}</Text> : null}
                <View style={styles.actions}>
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
      ) : null}
    </AppDialogContext.Provider>
  );
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
    fontSize: 20,
    fontWeight: '700',
  },
  message: {
    marginTop: spacing.sm,
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
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
    fontSize: 15,
    fontWeight: '700',
  },
  cancelLabel: {
    color: palette.ink,
  },
  pressed: {
    opacity: 0.82,
  },
});
