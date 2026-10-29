import { Alert, AlertButton, Platform } from "react-native";

// React Native Web's Alert.alert is a no-op, so fall back to browser dialogs on web.
export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, buttons);
    return;
  }
  if (typeof window === "undefined") return;
  const text = message ? `${title}\n\n${message}` : title;
  const action = buttons?.find((button) => button.style !== "cancel" && button.onPress);
  if (action) {
    if (window.confirm(text)) action.onPress?.();
    else buttons?.find((button) => button.style === "cancel")?.onPress?.();
    return;
  }
  window.alert(text);
  buttons?.[0]?.onPress?.();
}
