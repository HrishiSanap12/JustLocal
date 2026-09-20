import * as AppleAuthentication from "expo-apple-authentication";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

WebBrowser.maybeCompleteAuthSession();

export type SocialResult = { session_id?: string; identity_token?: string; name?: string; email?: string } | null;

// Extract session_id from any URL (handles hash fragment and query string)
export function extractSessionId(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/[?#&]session_id=([^&#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// Emergent-managed Google OAuth for Expo (web & native)
export async function signInWithGoogle(): Promise<SocialResult> {
  let redirectUrl: string;
  if (Platform.OS === "web") {
    redirectUrl = typeof window !== "undefined" ? window.location.origin + "/" : "";
  } else {
    redirectUrl = Linking.createURL("");
  }
  const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

  if (Platform.OS === "web") {
    // Full-page redirect; the app remount will process the fragment
    if (typeof window !== "undefined") window.location.href = authUrl;
    return null;
  }

  // Listen for a deep link in parallel, since Android often drops result.url
  let capturedUrl: string | null = null;
  const subscription = Linking.addEventListener("url", (event) => {
    capturedUrl = event.url;
  });
  try {
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    const url = (result.type === "success" ? result.url : null) ?? capturedUrl ?? (await Linking.getInitialURL());
    const session_id = extractSessionId(url);
    return session_id ? { session_id } : null;
  } finally {
    subscription.remove();
  }
}

export async function signInWithApple(): Promise<SocialResult> {
  if (Platform.OS !== "ios") throw new Error("Apple Sign-In is available on iPhone only.");
  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) throw new Error("Apple Sign-In is not available on this device.");
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!credential.identityToken) throw new Error("Apple sign-in was cancelled.");
  const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(" ") || undefined;
  return { identity_token: credential.identityToken, name, email: credential.email ?? undefined };
}
