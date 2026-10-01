import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import * as AppleAuthentication from "expo-apple-authentication";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Address, api, CartItem, Category, FamilyMember, Medicine, MedicineChatReply, MedicineRequest, Order, Pharmacy, Refill, SavedLocation, User } from "@/src/api";
import { CapsulePill, Wordmark } from "@/src/components/capsule-pill";
import { FamilyModal } from "@/src/components/family-modal";
import { LocationModal, loadSavedLocation } from "@/src/components/location-modal";
import { extractSessionId, signInWithApple, signInWithGoogle } from "@/src/auth-helpers";
import { makeStyles, useTheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
type Tab = "home" | "categories" | "pharmacies" | "requests" | "offers" | "chat" | "orders" | "account";

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { flex: 1 },
  scroll: { paddingHorizontal: 18, paddingBottom: 24 },

  // Text
  caption: { color: colors.muted, fontSize: 12 },
  title: { color: colors.onSurface, fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  sectionTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "800" },
  body: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20 },
  muted: { color: colors.muted, fontSize: 13 },

  // Chrome
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  iconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  search: { height: 52, borderRadius: 17, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 9, marginBottom: 16 },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: 14 },
  chatHeader: { padding: 18, borderBottomWidth: 1, borderBottomColor: colors.divider },
  chatMessages: { flex: 1, paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  chatBubble: { maxWidth: "88%", borderRadius: 14, padding: 12 },
  chatUserBubble: { alignSelf: "flex-end", backgroundColor: colors.brandPrimary },
  chatAssistantBubble: { alignSelf: "flex-start", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  chatUserText: { color: colors.onBrandPrimary, fontSize: 14, lineHeight: 20 },
  chatAssistantText: { color: colors.onSurface, fontSize: 14, lineHeight: 20 },
  chatSources: { marginTop: 9, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.divider, gap: 5 },
  chatSource: { color: colors.brandPrimary, fontSize: 11, fontWeight: "700" },
  chatDisclaimer: { paddingHorizontal: 16, paddingVertical: 9, color: colors.muted, backgroundColor: colors.surfaceSecondary, fontSize: 11, lineHeight: 16 },
  chatComposer: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface },
  chatInput: { flex: 1, maxHeight: 110, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.onSurface, backgroundColor: colors.surfaceSecondary, fontSize: 14 },
  chatSend: { width: 46, height: 44, borderRadius: 12, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },

  // Home
  hero: { borderRadius: 22, overflow: "hidden", marginBottom: 16 },
  heroInner: { minHeight: 174, padding: 20, justifyContent: "space-between" },
  heroTitle: { color: colors.onSurface, fontSize: 25, fontWeight: "800", width: "72%", lineHeight: 29 },
  heroCopy: { color: colors.onSurfaceSecondary, fontSize: 13, width: "72%", marginTop: 5 },
  primaryButton: { minHeight: 46, paddingHorizontal: 18, borderRadius: 16, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  buttonText: { color: colors.onBrandPrimary, fontSize: 14, fontWeight: "800" },
  secondaryButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: colors.onBrandTertiary, fontSize: 13, fontWeight: "800" },
  rxCard: { borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, padding: 15, flexDirection: "row", alignItems: "center", marginBottom: 20 },
  rxIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginRight: 12 },
  quickGrid: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  quickItem: { width: "23%", alignItems: "center", gap: 7 },
  quickIcon: { width: 50, height: 50, borderRadius: 18, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  quickLabel: { color: colors.onSurface, fontSize: 11, fontWeight: "700", textAlign: "center" },
  promo: { borderRadius: 18, overflow: "hidden", marginBottom: 24 },
  promoInner: { padding: 18, minHeight: 112, justifyContent: "center" },
  promoTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "900" },
  promoCopy: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 4 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  link: { color: colors.brandPrimary, fontWeight: "800", fontSize: 13 },
  categoryScroll: { marginHorizontal: -18, paddingHorizontal: 18, marginBottom: 24 },
  categoryPill: { width: 86, alignItems: "center", marginRight: 12, gap: 8 },
  categoryIcon: { width: 56, height: 56, borderRadius: 19, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  categoryName: { color: colors.onSurfaceSecondary, fontSize: 11, textAlign: "center", fontWeight: "700" },
  pharmacyRow: { marginHorizontal: -18, paddingHorizontal: 18, gap: 12 },
  pharmacyCard: { width: 218, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 14 },
  pharmacyBadge: { color: colors.onBrandTertiary, backgroundColor: colors.brandTertiary, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, fontSize: 11, fontWeight: "800", alignSelf: "flex-start", marginBottom: 12 },
  pharmacyLogo: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", marginRight: 10 },
  pharmacyName: { color: colors.onSurface, fontWeight: "800", fontSize: 14, flex: 1 },
  pharmacyMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  freeDelivery: { color: colors.success, fontSize: 11, fontWeight: "700", marginTop: 13 },

  // Tabs
  nav: { borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.surface, flexDirection: "row", justifyContent: "space-around", paddingTop: 9 },
  navItem: { alignItems: "center", minWidth: 58, minHeight: 44, gap: 4 },
  navText: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  navActive: { color: colors.brandPrimary },

  // ------------ AUTH SCREEN ------------
  
  authRoot: { flex: 1, backgroundColor: colors.surface },
  authHero: { paddingTop: 36, paddingBottom: 26, paddingHorizontal: 24, alignItems: "center" },
  authTagPill: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.surface, borderRadius: 999, marginTop: 16, borderWidth: 1, borderColor: colors.brandTertiary },
  authTag: { color: colors.brandPrimary, fontWeight: "800", fontSize: 12, letterSpacing: 0.4 },
  authCard: { marginHorizontal: 18, marginTop: -18, borderRadius: 26, backgroundColor: colors.surface, padding: 22, boxShadow: "0px 12px 24px rgba(11, 37, 69, 0.09)" },
  authTitle: { color: colors.onSurface, fontSize: 26, fontWeight: "900", letterSpacing: -0.5 },
  authSubtitle: { color: colors.muted, fontSize: 14, marginTop: 6, marginBottom: 20 },
  segmented: { flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: 14, padding: 4, marginBottom: 18 },
  segmentPill: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  segmentActive: { backgroundColor: colors.brandPrimary },
  segmentText: { color: colors.muted, fontSize: 13, fontWeight: "800" },
  segmentTextActive: { color: colors.onBrandPrimary },
  inputWrap: { height: 54, borderRadius: 16, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  inputWrapFocus: { borderColor: colors.brandPrimary, backgroundColor: colors.surface },
  inputField: { flex: 1, color: colors.onSurface, fontSize: 15 },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  errorText: { color: colors.error, fontSize: 13, fontWeight: "700", flex: 1 },
  authPrimary: { minHeight: 52, borderRadius: 16, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 18, boxShadow: "0px 8px 16px rgba(13, 148, 136, 0.24)" },
  authPrimaryText: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: "800" },
  socialRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  socialBtn: { flex: 1, height: 52, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  socialText: { color: colors.onSurface, fontSize: 13, fontWeight: "800" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 20, marginBottom: 12 },
  authFooter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 22 },
  footerLink: { color: colors.brandPrimary, fontSize: 14, fontWeight: "900" },

  // Product / cart / modals
  modal: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 18 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14 },
  modalTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "800" },
  productCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 18, padding: 14, marginBottom: 12, flexDirection: "row", gap: 12 },
  productIcon: { width: 62, height: 62, borderRadius: 18, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  productInfo: { flex: 1 },
  productName: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  productPrice: { color: colors.onSurface, fontSize: 16, fontWeight: "900", marginTop: 5 },
  addButton: { minWidth: 54, height: 38, borderRadius: 12, borderWidth: 1, borderColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  addText: { color: colors.brandPrimary, fontWeight: "900", fontSize: 12 },
  tabs: { flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: 14, padding: 4, marginBottom: 18 },
  tabPill: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  tabPillActive: { backgroundColor: colors.brandPrimary },
  tabPillText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  tabPillTextActive: { color: colors.onBrandPrimary },
  orderCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 15, marginBottom: 12 },
  status: { color: colors.success, backgroundColor: colors.brandTertiary, fontSize: 11, fontWeight: "800", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  offerCard: { borderRadius: 18, overflow: "hidden", marginBottom: 14 },
  offerInner: { padding: 18, minHeight: 126, justifyContent: "space-between" },
  offerTitle: { color: colors.onSurface, fontSize: 21, fontWeight: "900" },
  code: { color: colors.onBrandPrimary, backgroundColor: colors.brandPrimary, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, fontSize: 11, fontWeight: "900", overflow: "hidden" },
  profile: { borderRadius: 20, backgroundColor: colors.brandTertiary, padding: 18, flexDirection: "row", alignItems: "center", marginBottom: 20 },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", marginRight: 13 },
  avatarText: { color: colors.onBrandPrimary, fontSize: 22, fontWeight: "900" },
  addressCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, marginBottom: 12 },
  summary: { backgroundColor: colors.surfaceSecondary, borderRadius: 18, padding: 16, marginTop: 18, gap: 11 },
  divider: { height: 1, backgroundColor: colors.divider },
  cartRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.divider },
  quantity: { flexDirection: "row", alignItems: "center", gap: 10 },
  qtyButton: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  timelineDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", marginRight: 12 },
  timelineLine: { width: 2, height: 26, backgroundColor: colors.brandTertiary, marginLeft: 8 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: colors.brandPrimary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brandPrimary },
}));

function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const { colors } = useTheme();
  return <Ionicons name={name} size={size} color={color ?? colors.onSurface} />;
}

function Press({ children, onPress, style, disabled = false, testID, accessibilityLabel }: { children: React.ReactNode; onPress?: () => void; style?: object; disabled?: boolean; testID?: string; accessibilityLabel?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [style, { opacity: disabled ? 0.45 : pressed ? 0.72 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      {children}
    </Pressable>
  );
}

// ----------------- AUTH SCREEN -----------------
function InputField({
  icon,
  ...rest
}: { icon: IconName } & React.ComponentProps<typeof TextInput>) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.inputWrap, focused && styles.inputWrapFocus]}>
      <Icon
        name={icon}
        size={18}
        color={focused ? colors.brandPrimary : colors.muted}
      />

      <TextInput
        {...rest}
        style={styles.inputField}
        placeholderTextColor={colors.muted}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
}
function AuthScreen({ onAuth, prefillSession }: { onAuth: (token: string, user: User) => void; prefillSession?: string | null }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [identifier, setIdentifier] = useState("demo@justlocal.app");
  const [password, setPassword] = useState("Justlocal123!");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<"google" | "apple" | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [error, setError] = useState("");

  const completeAuth = async (nextToken: unknown, nextUser: unknown) => {
    if (typeof nextToken !== "string" || !nextToken.trim()) {
      throw new Error("The server did not return a valid sign-in token.");
    }
    if (!nextUser || typeof nextUser !== "object") {
      throw new Error("The server did not return valid account details.");
    }
    const saved = await storage.secureSet("justlocal_token", nextToken);
    if (!saved) throw new Error("Unable to save your sign-in session.");
    onAuth(nextToken, nextUser as User);
  };

  useEffect(() => {
    if (Platform.OS === "ios") {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
    }
  }, []);

  // If a session_id arrived via deep link, exchange it silently.
  useEffect(() => {
    if (!prefillSession) return;
    (async () => {
      setSocialLoading("google");
      setError("");
      try {
        const { session_token, user } = await api.exchangeSession(prefillSession);
        await completeAuth(session_token, user);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Google sign-in failed. Please try again.");
      } finally {
        setSocialLoading(null);
      }
    })();
  }, [prefillSession, onAuth]);

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      const result = mode === "login" ? await api.login(identifier, password) : await api.register(name, identifier, phone, password);
      await completeAuth(result.token, result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to continue");
    } finally {
      setLoading(false);
    }
  };
  const doGoogle = async () => {
    setSocialLoading("google");
    setError("");
    try {
      const social = await signInWithGoogle();
      if (!social?.session_id) {
        setSocialLoading(null);
        return; // user cancelled or web redirect in progress
      }
      const { session_token, user } = await api.exchangeSession(social.session_id);
      await completeAuth(session_token, user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setSocialLoading(null);
    }
  };

  const doApple = async () => {
    setSocialLoading("apple");
    setError("");
    try {
      const social = await signInWithApple();
      if (!social?.identity_token) return;
      const { token, user } = await api.apple(social.identity_token, social.name, social.email);
      await completeAuth(token, user);
    } catch (err) {
      if ((err as { code?: string })?.code === "ERR_REQUEST_CANCELED") return;
      setError(err instanceof Error ? err.message : "Apple sign-in failed");
    } finally {
      setSocialLoading(null);
    }
  };

  

  return (
    <KeyboardAvoidingView style={styles.authRoot} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={[colors.brandTertiary, colors.surface]} style={styles.authHero}>
          <CapsulePill size={72} />
          <View style={{ height: 18 }} />
          <Wordmark size={34} />
          <View style={styles.authTagPill}>
            <Text style={styles.authTag}>MEDICINES CLOSER TO YOU</Text>
          </View>
        </LinearGradient>

        <View style={styles.authCard}>
          <View style={styles.segmented}>
            {(["login", "signup"] as const).map((option) => (
              <Press key={option} testID={`auth-tab-${option}`} style={[styles.segmentPill, mode === option && styles.segmentActive]} onPress={() => { setMode(option); setError(""); }}>
                <Text style={[styles.segmentText, mode === option && styles.segmentTextActive]}>{option === "login" ? "Log in" : "Sign up"}</Text>
              </Press>
            ))}
          </View>

          <Text style={styles.authTitle}>{mode === "login" ? "Welcome back 👋" : "Create your account"}</Text>
          <Text style={styles.authSubtitle}>
            {mode === "login" ? "Order medicines from your neighbourhood pharmacies." : "Join Justlocal and get medicines delivered in minutes."}
          </Text>

          <View style={{ gap: 12 }}>
            {mode === "signup" && (
              <InputField icon="person-outline" placeholder="Full name" value={name} onChangeText={setName} autoCapitalize="words" />
            )}
            <InputField
              icon="mail-outline"
              placeholder="Email or phone number"
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            {mode === "signup" && (
              <InputField icon="call-outline" placeholder="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            )}
            <InputField icon="lock-closed-outline" placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
          </View>

          {error ? (
            <View style={styles.errorRow}>
              <Icon name="alert-circle" color={colors.error} size={16} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Press testID="auth-submit-button" style={styles.authPrimary} onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
              <>
                <Text style={styles.authPrimaryText}>{mode === "login" ? "Log in" : "Create account"}</Text>
                <Icon name="arrow-forward" color={colors.onBrandPrimary} size={16} />
              </>
            )}
          </Press>

          <View style={styles.dividerRow}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.divider }} />
            <Text style={styles.muted}>or continue with</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.divider }} />
          </View>

          <View style={styles.socialRow}>
            <Press testID="social-google-button" style={styles.socialBtn} onPress={doGoogle} disabled={socialLoading !== null}>
              {socialLoading === "google" ? <ActivityIndicator color={colors.brandPrimary} /> : (
                <>
                  <Icon name="logo-google" size={18} color="#EA4335" />
                  <Text style={styles.socialText}>Google</Text>
                </>
              )}
            </Press>
            {Platform.OS === "ios" && appleAvailable ? (
              <Press testID="social-apple-button" style={[styles.socialBtn, { backgroundColor: colors.onSurface, borderColor: colors.onSurface }]} onPress={doApple} disabled={socialLoading !== null}>
                {socialLoading === "apple" ? <ActivityIndicator color={colors.surface} /> : (
                  <>
                    <Icon name="logo-apple" size={18} color={colors.surface} />
                    <Text style={[styles.socialText, { color: colors.surface }]}>Apple</Text>
                  </>
                )}
              </Press>
            ) : (
              <Press testID="social-apple-disabled" style={[styles.socialBtn, { opacity: 0.6 }]} onPress={() => Alert.alert("Apple Sign-In", "Sign in with Apple is available on iPhone.")}>
                <Icon name="logo-apple" size={18} color={colors.onSurface} />
                <Text style={styles.socialText}>Apple</Text>
              </Press>
            )}
          </View>

          <View style={styles.authFooter}>
            <Text style={styles.muted}>{mode === "login" ? "New to Justlocal?" : "Already a member?"}</Text>
            <Press testID="auth-toggle" onPress={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>
              <Text style={styles.footerLink}>{mode === "login" ? "Create account" : "Log in"}</Text>
            </Press>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ----------------- SHARED CARDS -----------------
function PharmacyCard({ pharmacy, onDirections }: { pharmacy: Pharmacy; onDirections: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const distance = pharmacy.distance_km !== undefined
    ? `${pharmacy.distance_km.toFixed(1)} km`
    : pharmacy.latitude !== undefined && pharmacy.longitude !== undefined
      ? pharmacy.distance
      : "Distance unavailable";
  return (
    <Press testID={`pharmacy-${pharmacy.id}`} accessibilityLabel={`Get directions to ${pharmacy.name}`} style={styles.pharmacyCard} onPress={onDirections}>
      <Text style={styles.pharmacyBadge}>{pharmacy.accepting_requests === false ? "Not accepting requests" : pharmacy.eta || "Verified pharmacy"}</Text>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={styles.pharmacyLogo}><Icon name="medical" color={colors.onBrandPrimary} size={20} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.pharmacyName} numberOfLines={1}>{pharmacy.name}</Text>
          {pharmacy.rating ? <Text style={styles.pharmacyMeta}>★ {pharmacy.rating}{pharmacy.reviews ? ` (${pharmacy.reviews})` : ""}</Text> : null}
          <Text style={styles.pharmacyMeta}>{pharmacy.area} · {distance}</Text>
        </View>
      </View>
      <Text style={styles.freeDelivery}>{pharmacy.threshold ? `Free delivery above ₹${pharmacy.threshold}` : "Get directions"} · Open map</Text>
    </Press>
  );
}

function PharmaciesScreen({ pharmacies, location, onDirections }: { pharmacies: Pharmacy[]; location: SavedLocation | null; onDirections: (pharmacy: Pharmacy) => void }) {
  const styles = useStyles();
  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>Nearby pharmacies</Text>
      <Text style={[styles.body, { marginTop: 5, marginBottom: 18 }]}>{location?.label ? `Sorted from ${location.label}` : "Choose a map location to see pharmacies by distance."}</Text>
      {pharmacies.length ? pharmacies.map((pharmacy) => (
        <PharmacyCard key={pharmacy.id} pharmacy={pharmacy} onDirections={() => onDirections(pharmacy)} />
      )) : <Empty icon="location-outline" title="No pinned pharmacies nearby" copy="Verified pharmacies with a registered map location within 50 km will appear here." />}
    </ScrollView>
  );
}

function ProductCard({ medicine, onAdd, onDetails }: { medicine: Medicine; onAdd: (m: Medicine) => void; onDetails: (m: Medicine) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Press testID={`product-${medicine.id}`} style={styles.productCard} onPress={() => onDetails(medicine)}>
      <View style={styles.productIcon}>
        <Icon name={medicine.prescription_required ? "medical" : "flask-outline"} color={colors.brandPrimary} size={26} />
      </View>
      <View style={styles.productInfo}>
        <Text style={styles.productName}>{medicine.name}</Text>
        <Text style={styles.muted}>{medicine.pack} · {medicine.manufacturer}</Text>
        <Text style={styles.productPrice}>₹{medicine.price}</Text>
        <Text style={{ color: colors.success, fontSize: 11, fontWeight: "700", marginTop: 3 }}>{medicine.availability} · {medicine.nearby_stores} nearby stores</Text>
      </View>
      <Press testID={`product-add-${medicine.id}`} style={styles.addButton} onPress={() => onAdd(medicine)}>
        <Text style={styles.addText}>Add</Text>
      </Press>
    </Press>
  );
}

function Empty({ icon, title, copy }: { icon: IconName; title: string; copy: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: 70 }}>
      <View style={[styles.quickIcon, { marginBottom: 14 }]}><Icon name={icon} color={colors.brandPrimary} size={26} /></View>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={[styles.body, { textAlign: "center", marginTop: 7, maxWidth: 260 }]}>{copy}</Text>
    </View>
  );
}

// ----------------- SCREENS -----------------
function Home({ categories, pharmacies, medicines, onTab, onPrescription, onCategory, onProduct, onAdd, onCart, search, setSearch, cartCount, location, onLocation, onPharmacy, refills, activeProfile, onReorderRefill, onRequestMedicine, now }: {
  categories: Category[]; pharmacies: Pharmacy[]; medicines: Medicine[]; onTab: (t: Tab) => void;
  onPrescription: () => void; onCategory: (c: string) => void; onProduct: (m: Medicine) => void; onAdd: (m: Medicine) => void;
  onCart: () => void; search: string; setSearch: (v: string) => void; cartCount: number;
  location: SavedLocation | null; onLocation: () => void;
  onPharmacy: (pharmacy: Pharmacy) => void;
  refills: Refill[]; activeProfile: FamilyMember | null; onReorderRefill: (r: Refill) => void; onRequestMedicine: (name: string) => void; now: number | null;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <CapsulePill size={30} />
          <Wordmark size={22} />
        </View>
        <Press testID="cart-button" style={styles.iconButton} onPress={onCart}>
          <Icon name="cart-outline" color={colors.brandPrimary} />
          <View style={{ position: "absolute", top: 7, right: 8, minWidth: 15, height: 15, borderRadius: 8, backgroundColor: colors.error, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}>
            <Text style={{ color: colors.onError, fontSize: 9, fontWeight: "900" }}>{cartCount}</Text>
          </View>
        </Press>
      </View>

      <Press testID="location-open" style={styles.locationRow} onPress={onLocation}>
        <Icon name="location" size={20} color={colors.brandPrimary} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.onSurface, fontSize: 14, fontWeight: "800" }}>{location?.label ?? "Choose your location"}  <Icon name="chevron-down" size={14} color={colors.onSurface} /></Text>
          <Text style={styles.muted} numberOfLines={1}>{location?.address ?? "Tap to set delivery address"}</Text>
        </View>
        {activeProfile ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.brandTertiary }}>
            <Icon name="people" size={12} color={colors.brandPrimary} />
            <Text style={{ color: colors.onBrandTertiary, fontSize: 11, fontWeight: "800" }}>For {activeProfile.name.split(" ")[0]}</Text>
          </View>
        ) : null}
      </Press>

      <View style={styles.search}>
        <Icon name="search" color={colors.muted} />
        <TextInput style={styles.searchInput} placeholder="Search medicines, healthcare products…" placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} />
        <Icon name="mic-outline" color={colors.brandPrimary} />
      </View>

      {search.trim().length > 1 && medicines.length === 0 && (
        <Press onPress={() => onRequestMedicine(search.trim())} style={[styles.rxCard, { marginBottom: 15 }]}>
          <View style={styles.rxIcon}><Icon name="help-circle-outline" color={colors.brandPrimary} size={22} /></View>
          <View style={{ flex: 1 }}><Text style={styles.productName}>Can&apos;t find “{search.trim()}”?</Text><Text style={styles.muted}>Request it from verified pharmacies</Text></View>
          <Icon name="chevron-forward" color={colors.brandPrimary} />
        </Press>
      )}

      <Press style={styles.hero} onPress={() => onTab("categories")}>
        <LinearGradient colors={[colors.brandTertiary, colors.surfaceTertiary]} style={styles.heroInner}>
          <View>
            <Text style={styles.heroTitle}>Medicines at your doorstep</Text>
            <Text style={styles.heroCopy}>From trusted local pharmacies to your home, in minutes.</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Press style={styles.primaryButton} onPress={() => onTab("categories")}>
              <Text style={styles.buttonText}>Order now</Text>
              <Icon name="arrow-forward" size={16} color={colors.onBrandPrimary} />
            </Press>
            <Icon name="medical" size={55} color={colors.brandPrimary} />
          </View>
        </LinearGradient>
      </Press>

      <Press style={styles.rxCard} onPress={onPrescription}>
        <View style={styles.rxIcon}><Icon name="cloud-upload-outline" color={colors.brandPrimary} size={23} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.productName}>Upload a prescription</Text>
          <Text style={styles.muted}>We will find the medicines for you</Text>
        </View>
        <Text style={styles.link}>Upload</Text>
      </Press>

      <Press testID="medicine-chat-entry" style={styles.rxCard} onPress={() => onTab("chat")}>
        <View style={styles.rxIcon}><Icon name="chatbubbles-outline" color={colors.brandPrimary} size={22} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.productName}>Medicine questions</Text>
          <Text style={styles.muted}>Ask using reviewed information</Text>
        </View>
        <Icon name="chevron-forward" color={colors.brandPrimary} />
      </Press>

      {refills.length > 0 && (
        <View style={{ marginBottom: 20 }}>
          <View style={[styles.rowBetween, { marginBottom: 10 }]}>
            <Text style={styles.sectionTitle}>Refill reminders</Text>
            <Press onPress={() => onTab("orders")}><Text style={styles.link}>All refills →</Text></Press>
          </View>
          {refills.slice(0, 2).map((refill) => {
            const days = now === null ? null : Math.max(0, Math.ceil((new Date(refill.next_refill_at).getTime() - now) / 86400000));
            const soon = days !== null && days <= 3;
            return (
              <View key={refill.id} style={[styles.rxCard, { marginBottom: 10, backgroundColor: soon ? colors.brandTertiary : colors.surfaceSecondary }]}>
                <View style={[styles.rxIcon, { backgroundColor: soon ? colors.brandPrimary : colors.brandTertiary }]}>
                  <Icon name="alarm-outline" color={soon ? colors.onBrandPrimary : colors.brandPrimary} size={22} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.productName}>{refill.medicine_name}</Text>
                  <Text style={styles.muted}>
                    {refill.for_profile_name ? `For ${refill.for_profile_name} · ` : ""}
                    {days === null ? "Upcoming refill" : soon ? (days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`) : `Refill in ${days} days`}
                  </Text>
                </View>
                <Press testID={`refill-reorder-${refill.id}`} style={styles.primaryButton} onPress={() => onReorderRefill(refill)}>
                  <Text style={styles.buttonText}>Reorder</Text>
                </Press>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.quickGrid}>
        {[["repeat", "Order again", () => onTab("orders")], ["storefront-outline", "Nearby stores", () => onTab("home")], ["pricetag-outline", "Offers", () => onTab("offers")], ["medkit-outline", "Health products", () => onTab("categories")]].map(([icon, label, action]) => (
          <Press key={label as string} style={styles.quickItem} onPress={action as () => void}>
            <View style={styles.quickIcon}><Icon name={icon as IconName} color={colors.brandPrimary} size={22} /></View>
            <Text style={styles.quickLabel}>{label as string}</Text>
          </Press>
        ))}
      </View>

      <View style={[styles.rowBetween, { marginBottom: 13 }]}>
        <Text style={styles.sectionTitle}>Shop by category</Text>
        <Press onPress={() => onTab("categories")}><Text style={styles.link}>See all →</Text></Press>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
        {categories.slice(0, 6).map((category) => (
          <Press key={category.id} style={styles.categoryPill} onPress={() => onCategory(category.name)}>
            <View style={styles.categoryIcon}><Icon name={category.icon as IconName} color={colors.brandPrimary} size={23} /></View>
            <Text style={styles.categoryName} numberOfLines={2}>{category.name}</Text>
          </Press>
        ))}
      </ScrollView>

      <View style={[styles.rowBetween, { marginBottom: 13 }]}>
        <Text style={styles.sectionTitle}>Nearby pharmacies</Text>
        <Press onPress={() => onTab("pharmacies")}><Text style={styles.link}>See all →</Text></Press>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pharmacyRow}>
        {pharmacies.slice(0, 8).map((pharmacy) => <PharmacyCard key={pharmacy.id} pharmacy={pharmacy} onDirections={() => onPharmacy(pharmacy)} />)}
        {pharmacies.length === 0 && <Text style={styles.muted}>No verified pharmacy locations found here yet.</Text>}
      </ScrollView>

      <View style={{ marginTop: 24 }}>
        <View style={[styles.rowBetween, { marginBottom: 13 }]}>
          <Text style={styles.sectionTitle}>Popular near you</Text>
          <Press onPress={() => onTab("categories")}><Text style={styles.link}>Browse</Text></Press>
        </View>
        {medicines.slice(0, 3).map((medicine) => <ProductCard key={medicine.id} medicine={medicine} onAdd={onAdd} onDetails={onProduct} />)}
      </View>
    </ScrollView>
  );
}

function CategoriesScreen({ categories, medicines, search, selectedCategory, onSearch, onProduct, onAdd, onCategory, onRequestMedicine }: { categories: Category[]; medicines: Medicine[]; search: string; selectedCategory: string; onSearch: (value: string) => void; onProduct: (m: Medicine) => void; onAdd: (m: Medicine) => void; onCategory: (c: string) => void; onRequestMedicine: (name: string) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const filtered = categories.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>Categories</Text>
      <Text style={[styles.body, { marginTop: 5, marginBottom: 16 }]}>Find everyday care from nearby stores.</Text>
      <View style={styles.search}>
        <Icon name="search" color={colors.muted} />
        <TextInput style={styles.searchInput} placeholder="Search medicines or categories" placeholderTextColor={colors.muted} value={search} onChangeText={onSearch} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 8 }}>
        <Press testID="category-filter-all" onPress={() => onCategory("")} style={[styles.secondaryButton, !selectedCategory && { backgroundColor: colors.brandPrimary }]}>
          <Text style={[styles.secondaryText, !selectedCategory && { color: colors.onBrandPrimary }]}>All</Text>
        </Press>
        {categories.map((category) => (
          <Press key={category.id} testID={`category-filter-${category.id}`} onPress={() => onCategory(selectedCategory === category.name ? "" : category.name)} style={[styles.secondaryButton, selectedCategory === category.name && { backgroundColor: colors.brandPrimary }]}>
            <Text style={[styles.secondaryText, selectedCategory === category.name && { color: colors.onBrandPrimary }]}>{category.name}</Text>
          </Press>
        ))}
      </ScrollView>
      <LinearGradient colors={[colors.brandTertiary, colors.surfaceTertiary]} style={[styles.promo, { padding: 18 }]}>
        <Text style={styles.heroTitle}>Healthier you, everyday</Text>
        <Text style={styles.body}>Wide range of medicines and healthcare products.</Text>
      </LinearGradient>
      <Text style={[styles.sectionTitle, { marginBottom: 14 }]}>Browse categories</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
        {filtered.map((category) => (
          <Press key={category.id} style={{ width: "31%", alignItems: "center", marginBottom: 22, gap: 7 }} onPress={() => onCategory(category.name)}>
            <View style={[styles.categoryIcon, { width: 62, height: 62 }]}><Icon name={category.icon as IconName} color={colors.brandPrimary} size={25} /></View>
            <Text style={styles.categoryName}>{category.name}</Text>
            <Text style={styles.caption}>{category.count} items</Text>
          </Press>
        ))}
      </View>
      {search.trim() ? (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 8, marginBottom: 13 }]}>{medicines.length ? "Matching medicines" : "No exact catalog match"}</Text>
          {medicines.slice(0, 12).map((medicine) => <ProductCard key={medicine.id} medicine={medicine} onAdd={onAdd} onDetails={onProduct} />)}
          {medicines.length === 0 && <Press style={[styles.rxCard, { marginTop: 6 }]} onPress={() => onRequestMedicine(search.trim())}>
            <View style={styles.rxIcon}><Icon name="help-circle-outline" color={colors.brandPrimary} size={22} /></View>
            <View style={{ flex: 1 }}><Text style={styles.productName}>Request “{search.trim()}”</Text><Text style={styles.muted}>We&apos;ll send the name to verified pharmacies to check.</Text></View>
            <Icon name="chevron-forward" color={colors.brandPrimary} />
          </Press>}
        </>
      ) : (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 8, marginBottom: 13 }]}>Popular products</Text>
          {selectedCategory ? <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>{selectedCategory}</Text> : null}
          {medicines.slice(0, 12).map((medicine) => <ProductCard key={medicine.id} medicine={medicine} onAdd={onAdd} onDetails={onProduct} />)}
        </>
      )}
    </ScrollView>
  );
}

function RequestMedicineModal({ initialName, onClose, onSubmit }: { initialName: string; onClose: () => void; onSubmit: (name: string, quantity: number) => Promise<void> }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [name, setName] = useState(initialName);
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (name.trim().length < 2 || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(name.trim(), quantity);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(11,37,69,0.24)" }}>
        <View style={[styles.modal, { minHeight: "45%", borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 18 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Request a medicine</Text>
            <Press onPress={onClose} style={styles.iconButton}><Icon name="close" /></Press>
          </View>
          <Text style={styles.body}>Enter the medicine name and strength as written on the pack or prescription. Verified pharmacies will check availability.</Text>
          <TextInput testID="custom-medicine-name" style={[styles.inputField, styles.inputWrap, { marginTop: 16 }]} value={name} onChangeText={setName} placeholder="Medicine name and strength" placeholderTextColor={colors.muted} autoCapitalize="words" />
          <View style={[styles.rowBetween, { marginTop: 14 }]}>
            <Text style={styles.productName}>Quantity needed</Text>
            <View style={styles.quantity}>
              <Press style={styles.qtyButton} onPress={() => setQuantity((value) => Math.max(1, value - 1))}><Text style={{ color: colors.brandPrimary, fontWeight: "900" }}>−</Text></Press>
              <Text style={styles.productName}>{quantity}</Text>
              <Press style={styles.qtyButton} onPress={() => setQuantity((value) => Math.min(100, value + 1))}><Text style={{ color: colors.brandPrimary, fontWeight: "900" }}>+</Text></Press>
            </View>
          </View>
          <Text style={[styles.muted, { marginTop: 10 }]}>This sends a request, not an order. A pharmacist confirms the product and price before you choose a pharmacy.</Text>
          <Press testID="send-custom-medicine-request" style={[styles.primaryButton, { marginTop: 18 }]} onPress={() => void submit()} disabled={submitting || name.trim().length < 2}>
            {submitting ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.buttonText}>Request from verified pharmacies</Text>}
          </Press>
        </View>
      </View>
    </Modal>
  );
}

function OrdersScreen({ orders, onTrack, onReorder }: { orders: Order[]; onTrack: (o: Order) => void; onReorder: (o: Order) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [filter, setFilter] = useState("All");
  const visible = filter === "All" ? orders : orders.filter((order) => filter === "Ongoing" ? order.status !== "Delivered" : order.status === filter);
  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>My orders</Text>
      <Text style={[styles.body, { marginTop: 5, marginBottom: 18 }]}>Track deliveries and reorder in a tap.</Text>
      <View style={styles.tabs}>
        {["All", "Ongoing", "Delivered", "Cancelled"].map((item) => (
          <Press key={item} style={[styles.tabPill, filter === item && styles.tabPillActive]} onPress={() => setFilter(item)}>
            <Text style={[styles.tabPillText, filter === item && styles.tabPillTextActive]}>{item}</Text>
          </Press>
        ))}
      </View>
      {visible.length === 0 ? (
        <Empty icon="receipt-outline" title="No orders here yet" copy="Your next local pharmacy order will appear here." />
      ) : visible.map((order) => (
        <View key={order.id} style={styles.orderCard}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.productName}>#{order.order_number}</Text>
              <Text style={styles.muted}>{new Date(order.created_at).toLocaleDateString()} · {order.pharmacy_name}</Text>
            </View>
            <Text style={[styles.status, order.status !== "Delivered" && { color: colors.info, backgroundColor: colors.surfaceTertiary }]}>{order.status}</Text>
          </View>
          <Text style={[styles.body, { marginTop: 14 }]} numberOfLines={1}>{order.items.map((item) => `${item.name} ×${item.quantity}`).join(", ")}</Text>
          <View style={[styles.rowBetween, { marginTop: 14 }]}>
            <Text style={styles.productPrice}>₹{order.total}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Press style={styles.secondaryButton} onPress={() => onReorder(order)}><Text style={styles.secondaryText}>Buy again</Text></Press>
              <Press onPress={() => onTrack(order)}><Text style={[styles.link, { paddingVertical: 12 }]}>View details</Text></Press>
            </View>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function RequestsScreen({ requests, onSelectOffer, onRevoke }: { requests: MedicineRequest[]; onSelectOffer: (request: MedicineRequest, offerId: string) => void; onRevoke: (requestId: string) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [confirmingRequestId, setConfirmingRequestId] = useState<string | null>(null);
  const activeRequests = requests.filter((request) => !["order_placed", "revoked"].includes(request.status));
  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>Pharmacy requests</Text>
      <Text style={[styles.body, { marginTop: 5, marginBottom: 18 }]}>Verified pharmacies accepting requests check availability and send offers. Choose one to create your order.</Text>
      {activeRequests.length === 0 ? (
        <Empty icon="time-outline" title="No active requests" copy="Search for medicines or upload a prescription to ask verified pharmacies." />
      ) : activeRequests.map((request) => {
        const responses = request.offers ?? [];
        const offers = responses.filter((offer) => offer.status === "offered" && offer.availability !== "unavailable");
        const unavailable = responses.filter((offer) => offer.availability === "unavailable");
        return (
          <View key={request.id} style={styles.orderCard}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.productName}>Request {request.id.slice(-8).toUpperCase()}</Text>
                <Text style={styles.muted}>{new Date(request.created_at).toLocaleString()} · {request.matched_pharmacy_count} verified {request.matched_pharmacy_count === 1 ? "pharmacy" : "pharmacies"}</Text>
              </View>
              <Text style={[styles.status, { color: request.status === "no_pharmacies" ? colors.error : colors.info, backgroundColor: colors.surfaceTertiary }]}>{request.status === "collecting_offers" ? "Finding offers" : request.status === "no_pharmacies" ? "No match yet" : request.status.replaceAll("_", " ")}</Text>
            </View>
            {request.items.map((item) => <Text key={item.medicine_id} style={[styles.body, { marginTop: 10 }]}>{item.name} ×{item.quantity}{item.prescription_required ? " · prescription required" : ""}</Text>)}
            {request.prescription_id && <View style={[styles.rxCard, { marginTop: 10, marginBottom: 0 }]}><View style={styles.rxIcon}><Icon name="document-text" color={colors.brandPrimary} /></View><Text style={[styles.body, { flex: 1 }]}>Prescription shared for pharmacist review</Text><Icon name="lock-closed" color={colors.muted} size={15} /></View>}
            {["collecting_offers", "no_pharmacies"].includes(request.status) && (confirmingRequestId === request.id ? (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 13 }}>
                <Text style={[styles.muted, { flex: 1 }]}>Withdraw this request and close outstanding offers?</Text>
                <Press style={styles.secondaryButton} onPress={() => setConfirmingRequestId(null)}><Text style={styles.secondaryText}>Keep</Text></Press>
                <Press style={[styles.secondaryButton, { backgroundColor: colors.error }]} onPress={() => { onRevoke(request.id); setConfirmingRequestId(null); }}><Text style={[styles.secondaryText, { color: colors.onError }]}>Withdraw</Text></Press>
              </View>
            ) : (
              <Press testID={`revoke-request-${request.id}`} style={{ alignSelf: "flex-end", paddingVertical: 9, paddingHorizontal: 4 }} onPress={() => setConfirmingRequestId(request.id)}>
                <Text style={{ color: colors.error, fontSize: 12, fontWeight: "800" }}>Withdraw request</Text>
              </Press>
            ))}
            {offers.length === 0 ? (
              <View style={[styles.addressCard, { marginTop: 13, backgroundColor: colors.surfaceSecondary }]}>
                <Text style={styles.productName}>{request.status === "no_pharmacies" ? "No pharmacy is accepting requests" : unavailable.length ? "No pharmacy could fulfil this request" : "Waiting for pharmacy responses"}</Text>
                <Text style={[styles.muted, { marginTop: 5 }]}>{request.status === "no_pharmacies" ? "Verified pharmacies are currently paused or none have joined yet." : unavailable.length ? "These pharmacies checked their stock and could not supply the request." : "Offers will appear here as pharmacists check their actual stock. This page refreshes automatically."}</Text>
                {unavailable.map((offer) => <Text key={offer.id} style={[styles.muted, { marginTop: 7 }]}>{offer.pharmacy_name}{offer.note ? ` · ${offer.note}` : " · unable to fulfil"}</Text>)}
              </View>
            ) : (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 17, marginBottom: 9 }]}>Offers from pharmacies</Text>
                {offers.map((offer) => (
                  <View key={offer.id} style={[styles.addressCard, { marginBottom: 9, borderColor: colors.brandTertiary }]}>
                    <View style={styles.rowBetween}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.productName}>{offer.pharmacy_name}</Text>
                        <Text style={styles.muted}>{offer.area}{offer.distance_km != null ? ` · ${offer.distance_km.toFixed(1)} km` : ""} · about {offer.eta_minutes} min</Text>
                      </View>
                      <Text style={styles.productPrice}>₹{offer.total}</Text>
                    </View>
                    {offer.items.map((item) => <Text key={item.medicine_id} style={[styles.muted, { marginTop: 7 }]}>{item.name} ×{item.quantity} · ₹{item.total}</Text>)}
                    {offer.note ? <Text style={[styles.body, { marginTop: 8 }]}>{offer.note}</Text> : null}
                    {request.prescription_id && offer.prescription_decision !== "matches" ? <Text style={[styles.muted, { marginTop: 8 }]}>Pharmacist review is not complete for this offer.</Text> : null}
                    <Press style={[styles.primaryButton, { marginTop: 12 }]} onPress={() => onSelectOffer(request, offer.id)} disabled={Boolean(request.prescription_id && offer.prescription_decision !== "matches")}>
                      <Text style={styles.buttonText}>Choose this pharmacy · ₹{offer.total}</Text>
                    </Press>
                    <Text style={[styles.muted, { marginTop: 8 }]}>Cash on delivery. Your order is created only after you choose.</Text>
                  </View>
                ))}
                {unavailable.length > 0 && <Text style={[styles.muted, { marginTop: 3 }]}>{unavailable.length} other {unavailable.length === 1 ? "pharmacy" : "pharmacies"} checked but couldn&apos;t fulfil this request.</Text>}
              </>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

type ChatMessage = { id: string; role: "user" | "assistant"; text: string; result?: MedicineChatReply };

function MedicineChatScreen({ token }: { token: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Ask about a medicine or prescription term. I answer only from retrieved catalog details or pharmacist-approved knowledge, and I will say when I don't have verified information.",
    },
  ]);

  const send = async () => {
    const text = question.trim();
    if (text.length < 2 || sending) return;
    setQuestion("");
    setSending(true);
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: "user", text }]);
    try {
      const result = await api.askMedicineQuestion(token, text);
      setMessages((current) => [...current, { id: `assistant-${Date.now()}`, role: "assistant", text: result.answer, result }]);
    } catch (error) {
      setMessages((current) => [...current, {
        id: `error-${Date.now()}`,
        role: "assistant",
        text: error instanceof Error ? error.message : "Couldn't get an answer. Please try again.",
      }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.content} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.chatHeader}>
        <Text style={styles.title}>Medicine questions</Text>
        <Text style={[styles.muted, { marginTop: 5 }]}>Answers use retrieved sources only. This assistant does not diagnose or give personal treatment advice.</Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.chatMessages} keyboardShouldPersistTaps="handled">
        {messages.map((message) => (
          <View key={message.id} style={[styles.chatBubble, message.role === "user" ? styles.chatUserBubble : styles.chatAssistantBubble]}>
            <Text style={message.role === "user" ? styles.chatUserText : styles.chatAssistantText}>{message.text}</Text>
            {message.result?.sources.length ? (
              <View style={styles.chatSources}>
                {message.result.sources.map((source) => (
                  <View key={source.id}>
                    <Text style={styles.chatSource}>{source.title}{source.medicine ? ` · ${source.medicine}` : ""}</Text>
                    {source.reviewed_by && <Text style={styles.muted}>Reviewed by {source.reviewed_by}{source.last_reviewed ? ` · ${source.last_reviewed}` : ""}</Text>}
                  </View>
                ))}
              </View>
            ) : null}
            {message.result?.disclaimer && <Text style={[styles.muted, { marginTop: 8 }]}>{message.result.disclaimer}</Text>}
          </View>
        ))}
        {sending && <Text style={styles.muted}>Checking verified information…</Text>}
      </ScrollView>
      <Text style={styles.chatDisclaimer}>Do not include personal medical details. Questions and retrieved sources may be stored for pharmacist review. For emergencies, contact local emergency services.</Text>
      <View style={styles.chatComposer}>
        <TextInput
          testID="medicine-chat-input"
          accessibilityLabel="Ask a medicine question"
          style={styles.chatInput}
          value={question}
          onChangeText={setQuestion}
          placeholder="Ask about a medicine…"
          placeholderTextColor={colors.muted}
          multiline
          maxLength={500}
          editable={!sending}
          onSubmitEditing={() => void send()}
        />
        <Press testID="medicine-chat-send" accessibilityLabel="Send question" disabled={sending || question.trim().length < 2} onPress={() => void send()} style={[styles.chatSend, (sending || question.trim().length < 2) && { opacity: 0.5 }]}>
          {sending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Icon name="send" color={colors.onBrandPrimary} />}
        </Press>
      </View>
    </KeyboardAvoidingView>
  );
}

function AccountScreen({ user, onAddresses, onLogout, onOrders, onFamily, familyCount, activeProfile }: {
  user: User; onAddresses: () => void; onLogout: () => void; onOrders: () => void;
  onFamily: () => void; familyCount: number; activeProfile: FamilyMember | null;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const initials = user.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>Account</Text>
      <View style={[styles.profile, { marginTop: 18 }]}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{user.name}</Text>
          <Text style={styles.muted}>{user.email}</Text>
          <Text style={styles.muted}>{user.phone ?? "Add a phone number"}</Text>
        </View>
        <Icon name="chevron-forward" color={colors.brandPrimary} />
      </View>
      {[
        ["receipt-outline", "My orders", onOrders, undefined],
        ["people-outline", "Family profiles", onFamily, familyCount > 0 ? `${familyCount} added${activeProfile ? ` · Active: ${activeProfile.name}` : ""}` : "Add parents, kids, or your partner"],
        ["location-outline", "My addresses", onAddresses, undefined],
        ["card-outline", "Payment methods", () => Alert.alert("Payment methods", "Online payments via Razorpay will be enabled once merchant keys are added."), undefined],
        ["document-text-outline", "Prescriptions", () => Alert.alert("Prescriptions", "Your pharmacist-reviewed prescriptions will appear here."), undefined],
        ["help-circle-outline", "Help & support", () => Alert.alert("Support", "Our local care team is here to help."), undefined],
        ["information-circle-outline", "About Justlocal", () => Alert.alert("Justlocal", "Medicines closer to you."), undefined],
      ].map(([icon, label, action, hint]) => (
        <Press key={label as string} style={{ minHeight: 62, borderBottomWidth: 1, borderBottomColor: colors.divider, flexDirection: "row", alignItems: "center", gap: 13 }} onPress={action as () => void}>
          <View style={styles.iconButton}><Icon name={icon as IconName} size={18} color={colors.brandPrimary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.onSurface, fontSize: 14, fontWeight: "700" }}>{label as string}</Text>
            {hint ? <Text style={[styles.muted, { marginTop: 2 }]} numberOfLines={1}>{hint as string}</Text> : null}
          </View>
          <Icon name="chevron-forward" size={17} color={colors.muted} />
        </Press>
      ))}
      <Press testID="logout-button" style={[styles.secondaryButton, { marginTop: 24 }]} onPress={onLogout}>
        <Text style={styles.secondaryText}>Log out</Text>
      </Press>
    </ScrollView>
  );
}

// ----------------- MODALS -----------------
function AddressModal({ token, user, onDone }: { token: string; user: User; onDone: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [label, setLabel] = useState("Home");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [addresses, setAddresses] = useState<Address[]>(user.addresses);
  const save = async () => {
    if (!address.trim()) return;
    setSaving(true);
    try {
      const result = await api.addAddress(token, { label, address });
      setAddresses([...addresses, result]);
      setAddress("");
      Alert.alert("Address saved", "Your new address is ready for checkout.");
    } catch (err) {
      Alert.alert("Couldn't save address", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <View style={[styles.modal, { paddingTop: 46 }]}>
      <View style={styles.modalHeader}>
        <Press onPress={onDone} style={styles.iconButton}><Icon name="arrow-back" /></Press>
        <Text style={styles.modalTitle}>My addresses</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView>
        {addresses.map((item) => (
          <View key={item.id} style={styles.addressCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.productName}>{item.label}</Text>
              {item.default && <Text style={styles.status}>Default</Text>}
            </View>
            <Text style={[styles.body, { marginTop: 6 }]}>{item.address}</Text>
          </View>
        ))}
        <Text style={[styles.sectionTitle, { marginTop: 10, marginBottom: 12 }]}>Add a new address</Text>
        <TextInput style={[styles.inputField, styles.inputWrap]} value={label} onChangeText={setLabel} placeholder="Label (Home, Work…)" placeholderTextColor={colors.muted} />
        <TextInput style={[styles.inputField, styles.inputWrap, { marginTop: 12, minHeight: 86, textAlignVertical: "top", paddingTop: 15 }]} value={address} onChangeText={setAddress} placeholder="Full delivery address" placeholderTextColor={colors.muted} multiline />
        <Press style={[styles.primaryButton, { marginTop: 16 }]} onPress={save} disabled={saving}>
          <Text style={styles.buttonText}>{saving ? "Saving…" : "Save address"}</Text>
        </Press>
      </ScrollView>
    </View>
  );
}

function UploadModal({ token, onClose, onUploaded }: { token: string; onClose: () => void; onUploaded: (prescriptionId: string, shareConsent: boolean) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [uri, setUri] = useState("");
  const [name, setName] = useState("");
  const [shareConsent, setShareConsent] = useState(false);
  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.75 });
    if (!result.canceled) { setUri(result.assets[0].uri); setName(result.assets[0].fileName ?? "prescription.jpg"); }
  };
  const upload = async () => {
    if (!uri) return;
    try {
      const prescription = await api.uploadPrescription(token, uri, name);
      onUploaded(prescription.id, shareConsent);
    } catch (err) {
      Alert.alert("Upload failed", err instanceof Error ? err.message : "Please try again.");
    }
  };
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(11,37,69,0.24)" }}>
        <View style={[styles.modal, { minHeight: "52%", borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 18 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Upload prescription</Text>
            <Press onPress={onClose} style={styles.iconButton}><Icon name="close" /></Press>
          </View>
          <Text style={styles.body}>Upload a clear image. With your consent, it will be shared with verified pharmacies assigned to your request. A pharmacist reviews it manually.</Text>
          <Press style={[styles.rxCard, { marginTop: 20, justifyContent: "center" }]} onPress={pick}>
            <Icon name="image-outline" color={colors.brandPrimary} size={24} />
            <Text style={[styles.body, { marginLeft: 10 }]}>{name || "Choose an image from your phone"}</Text>
          </Press>
          <Press onPress={() => setShareConsent((current) => !current)} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18, paddingVertical: 8 }}>
            <View style={[styles.radio, shareConsent && styles.radioActive]}>{shareConsent && <View style={styles.radioDot} />}</View>
            <Text style={[styles.body, { flex: 1 }]}>I agree to share this prescription with verified pharmacies for this request only.</Text>
          </Press>
          <Press style={[styles.primaryButton, { marginTop: 16 }]} onPress={upload} disabled={!uri || !shareConsent}>
            <Text style={styles.buttonText}>Upload and continue</Text>
          </Press>
        </View>
      </View>
    </Modal>
  );
}

function TrackingModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modal, { paddingTop: 46 }]}>
        <View style={styles.modalHeader}>
          <Press onPress={onClose} style={styles.iconButton}><Icon name="arrow-back" /></Press>
          <Text style={styles.modalTitle}>Track order</Text>
          <View style={{ width: 44 }} />
        </View>
        <Text style={styles.title}>On its way to you</Text>
        <Text style={[styles.body, { marginTop: 6, marginBottom: 22 }]}>#{order.order_number} · {order.eta}</Text>
        {order.timeline.map((step, index) => (
          <View key={step}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={[styles.timelineDot, index > 2 && { backgroundColor: colors.surfaceTertiary }]}>
                {index <= 2 && <Icon name="checkmark" size={12} color={colors.onBrandPrimary} />}
              </View>
              <View>
                <Text style={styles.productName}>{step}</Text>
                <Text style={styles.muted}>{index <= 2 ? "Completed" : "Pending"}</Text>
              </View>
            </View>
            {index < order.timeline.length - 1 && <View style={styles.timelineLine} />}
          </View>
        ))}
        <View style={[styles.rxCard, { marginTop: 26 }]}>
          <Icon name="call-outline" color={colors.brandPrimary} size={22} />
          <Text style={[styles.body, { marginLeft: 10 }]}>Need help? Contact the pharmacy.</Text>
        </View>
      </View>
    </Modal>
  );
}

function ProductModal({ product, onClose, onAdd }: { product: Medicine | null; onClose: () => void; onAdd: (m: Medicine) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Modal visible={Boolean(product)} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modal, { paddingTop: 46 }]}>
        <View style={styles.modalHeader}>
          <Press onPress={onClose} style={styles.iconButton}><Icon name="arrow-back" /></Press>
          <Text style={styles.modalTitle}>Product details</Text>
          <View style={{ width: 44 }} />
        </View>
        {product && (
          <ScrollView contentContainerStyle={{ paddingVertical: 18 }}>
            <View style={[styles.productIcon, { width: 110, height: 110, alignSelf: "center", marginBottom: 20 }]}>
              <Icon name={product.prescription_required ? "medical" : "flask-outline"} color={colors.brandPrimary} size={46} />
            </View>
            <Text style={styles.title}>{product.name}</Text>
            <Text style={[styles.body, { marginTop: 6 }]}>{product.pack} · {product.manufacturer}</Text>
            <Text style={[styles.productPrice, { fontSize: 23, marginTop: 16 }]}>₹{product.price}</Text>
            {product.prescription_required && (
              <View style={[styles.rxCard, { marginTop: 18 }]}>
                <Icon name="information-circle" color={colors.warning} size={22} />
                <Text style={[styles.body, { flex: 1, marginLeft: 10 }]}>A valid prescription may be required for this medicine.</Text>
              </View>
            )}
            <Text style={[styles.sectionTitle, { marginTop: 24, marginBottom: 8 }]}>About this product</Text>
            <Text style={styles.body}>{product.composition}</Text>
            <Text style={[styles.sectionTitle, { marginTop: 24, marginBottom: 8 }]}>Local availability</Text>
            <Text style={styles.body}>Available at {product.nearby_stores} nearby pharmacies · {product.availability}</Text>
            <Press style={[styles.primaryButton, { marginTop: 28 }]} onPress={() => { onAdd(product); onClose(); }}>
              <Text style={styles.buttonText}>Add to cart · ₹{product.price}</Text>
            </Press>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ----------------- REQUEST CART -----------------

function CartModal({ open, onClose, cart, setCart, onClearCart, user, activeProfile, deliveryAddress, attachedPrescriptionId, attachedPrescriptionConsent, onSubmitRequest, onUploadPrescription }: { open: boolean; onClose: () => void; cart: CartItem[]; setCart: (c: CartItem[]) => void; onClearCart: () => void; user: User; activeProfile: FamilyMember | null; deliveryAddress: string | null; attachedPrescriptionId: string | null; attachedPrescriptionConsent: boolean; onSubmitRequest: (items: CartItem[], prescriptionId: string | null, shareConsent?: boolean) => Promise<boolean>; onUploadPrescription: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [checkout, setCheckout] = useState(false);
  const [placing, setPlacing] = useState(false);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = subtotal >= 299 ? subtotal : subtotal + 29;

  const submitRequest = async () => {
    if (cart.some((item) => item.prescription_required) && !attachedPrescriptionId) {
      Alert.alert("Prescription required", "Attach your prescription before requesting prescription medicines.", [
        { text: "Cancel", style: "cancel" },
        { text: "Upload prescription", onPress: onUploadPrescription },
      ]);
      return;
    }
    setPlacing(true);
    try {
      const submitted = await onSubmitRequest(cart, attachedPrescriptionId, attachedPrescriptionConsent);
      if (submitted) setCheckout(false);
    } catch (err) {
      Alert.alert("Couldn't send request", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modal, { paddingTop: 46 }]}>
        <View style={styles.modalHeader}>
          <Press onPress={onClose} style={styles.iconButton}><Icon name="arrow-back" /></Press>
          <Text style={styles.modalTitle}>{checkout ? "Request offers" : "Your cart"}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={styles.muted}>{cart.length} items</Text>
            <Press testID="clear-cart-button" accessibilityLabel="Clear cart" disabled={cart.length === 0} onPress={() => { setCart([]); onClearCart(); setCheckout(false); }} style={styles.iconButton}>
              <Icon name="trash-outline" color={cart.length ? colors.error : colors.muted} />
            </Press>
          </View>
        </View>
        {checkout ? (
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            {activeProfile ? (
              <View style={[styles.rxCard, { marginBottom: 12, backgroundColor: colors.brandTertiary }]}>
                <View style={styles.rxIcon}><Icon name="people" color={colors.brandPrimary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.productName}>Ordering for {activeProfile.name}</Text>
                  <Text style={styles.muted}>{activeProfile.relation}{activeProfile.age ? ` · ${activeProfile.age} yrs` : ""}</Text>
                </View>
              </View>
            ) : null}
            <Text style={styles.sectionTitle}>Delivery address</Text>
            {deliveryAddress || user.addresses.length ? (
              <View style={[styles.addressCard, { marginTop: 12 }]}>
                <Text style={styles.productName}>{deliveryAddress ? "Selected location" : user.addresses[0].label}</Text>
                <Text style={[styles.body, { marginTop: 5 }]}>{deliveryAddress ?? user.addresses[0].address}</Text>
              </View>
            ) : <Empty icon="location-outline" title="Add an address first" copy="Save a delivery address from Account or the header." />}

            <Text style={[styles.sectionTitle, { marginTop: 22, marginBottom: 12 }]}>How pharmacy matching works</Text>
            <View style={[styles.addressCard, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={styles.productName}>All accepting pharmacies</Text>
              <Text style={[styles.body, { marginTop: 5 }]}>Every verified pharmacy currently accepting requests receives this request and can check its actual stock before sending an offer. You choose one before an order is created.</Text>
              {cart.some((item) => item.prescription_required) && (
                <Press onPress={onUploadPrescription} style={[styles.rxCard, { marginTop: 12, marginBottom: 0 }]}>
                  <View style={styles.rxIcon}><Icon name="document-text-outline" color={colors.brandPrimary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.productName}>{attachedPrescriptionId ? "Prescription attached" : "Add your prescription"}</Text>
                    <Text style={styles.muted}>{attachedPrescriptionId ? "Shared with matched pharmacies for pharmacist review." : "A pharmacist must verify it before the request can be fulfilled."}</Text>
                  </View>
                  <Icon name={attachedPrescriptionId ? "checkmark-circle" : "chevron-forward"} color={colors.brandPrimary} />
                </Press>
              )}
            </View>

            <View style={styles.summary}>
              <View style={styles.rowBetween}><Text style={styles.body}>Estimated catalog total</Text><Text style={styles.sectionTitle}>₹{total}</Text></View>
              <Text style={styles.muted}>Each pharmacy&apos;s final price is shown with its offer.</Text>
            </View>
            <Press testID="request-offers-button" style={[styles.primaryButton, { marginTop: 18 }]} onPress={submitRequest} disabled={placing || cart.length === 0}>
              {placing ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.buttonText}>Send request to pharmacies</Text>}
            </Press>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
            {cart.length === 0 ? (
              <Empty icon="cart-outline" title="Your cart is empty" copy="Add medicines from a nearby pharmacy to get started." />
            ) : (
              <>
                {cart.map((item) => (
                  <View key={item.id} style={styles.cartRow}>
                    <View style={styles.productIcon}><Icon name="medkit" color={colors.brandPrimary} size={22} /></View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.productName}>{item.name}</Text>
                      <Text style={styles.muted}>₹{item.price} each</Text>
                    </View>
                    <View style={styles.quantity}>
                      <Press style={styles.qtyButton} onPress={() => setCart(item.quantity === 1 ? cart.filter((c) => c.id !== item.id) : cart.map((c) => c.id === item.id ? { ...c, quantity: c.quantity - 1 } : c))}>
                        <Text style={{ color: colors.brandPrimary, fontWeight: "900" }}>−</Text>
                      </Press>
                      <Text style={styles.productName}>{item.quantity}</Text>
                      <Press style={styles.qtyButton} onPress={() => setCart(cart.map((c) => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c))}>
                        <Text style={{ color: colors.brandPrimary, fontWeight: "900" }}>+</Text>
                      </Press>
                    </View>
                  </View>
                ))}
                <View style={styles.summary}>
                  <View style={styles.rowBetween}><Text style={styles.body}>Subtotal</Text><Text style={styles.body}>₹{subtotal}</Text></View>
                  <View style={styles.rowBetween}><Text style={styles.body}>Delivery</Text><Text style={styles.body}>{subtotal >= 299 ? "Free" : "₹29"}</Text></View>
                  <View style={styles.divider} />
                  <View style={styles.rowBetween}><Text style={styles.sectionTitle}>Total</Text><Text style={styles.sectionTitle}>₹{total}</Text></View>
                </View>
                <Press testID="checkout-button" style={[styles.primaryButton, { marginTop: 18 }]} onPress={() => setCheckout(true)}>
                  <Text style={styles.buttonText}>Continue to checkout</Text>
                </Press>
              </>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ----------------- ROOT -----------------
export default function Index() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [pendingSession, setPendingSession] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [categories, setCategories] = useState<Category[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [medicineRequests, setMedicineRequests] = useState<MedicineRequest[]>([]);
  const [customMedicineName, setCustomMedicineName] = useState("");
  const [showCustomRequest, setShowCustomRequest] = useState(false);
  const [clockNow, setClockNow] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [product, setProduct] = useState<Medicine | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadContext, setUploadContext] = useState<"standalone" | "cart" | "refill">("standalone");
  const [attachedPrescriptionId, setAttachedPrescriptionId] = useState<string | null>(null);
  const [attachedPrescriptionConsent, setAttachedPrescriptionConsent] = useState(false);
  const [showAddresses, setShowAddresses] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [trackOrder, setTrackOrder] = useState<Order | null>(null);
  // NEW: location, family, refills
  const [location, setLocation] = useState<SavedLocation | null>(null);
  const [showLocation, setShowLocation] = useState(false);
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [activeProfile, setActiveProfile] = useState<FamilyMember | null>(null);
  const [showFamily, setShowFamily] = useState(false);
  const [refills, setRefills] = useState<Refill[]>([]);

  useEffect(() => {
    const updateClock = () => setClockNow(Date.now());
    updateClock();
    const interval = setInterval(updateClock, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async (authToken: string) => {
    const [cats, meds, userOrders, userRequests, fam, rx] = await Promise.all([
      api.categories(), api.medicines(),
      api.orders(authToken), api.medicineRequests(authToken), api.listFamily(authToken), api.listRefills(authToken),
    ]);
    setCategories(cats); setMedicines(meds); setOrders(userOrders);
    setMedicineRequests(userRequests); setFamily(fam); setRefills(rx);
  };

  useEffect(() => {
    let active = true;
    const loadNearbyPharmacies = async () => {
      try {
        const next = await api.pharmacies(location?.latitude, location?.longitude);
        if (active) setPharmacies(next);
      } catch {
        if (active) setPharmacies([]);
      }
    };
    void loadNearbyPharmacies();
    return () => { active = false; };
  }, [location?.latitude, location?.longitude]);

  // Deep-link session_id capture for Google OAuth callback
  useEffect(() => {
    let mounted = true;
    const handleUrl = (url?: string | null) => {
      const id = extractSessionId(url);
      if (id && mounted) setPendingSession(id);
    };

    (async () => {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        handleUrl(window.location.href);
      } else {
        handleUrl(await Linking.getInitialURL());
      }
      const savedLocation = await loadSavedLocation();
      if (savedLocation && mounted) setLocation(savedLocation);
      const stored = await storage.secureGet("justlocal_token", null);
      if (stored) {
        try {
          const current = await api.me(String(stored));
          if (mounted) { setToken(String(stored)); setUser(current); await loadData(String(stored)); }
        } catch {
          await storage.secureRemove("justlocal_token");
        }
      }
      if (mounted) setBooting(false);
    })();

    const sub = Linking.addEventListener("url", (event) => handleUrl(event.url));
    return () => { mounted = false; sub.remove(); };
  }, []);

  // Ask for location once user is authenticated (best-effort)
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          // Non-blocking
        }
      } catch { /* preview may not support location */ }
    })();
  }, [user]);

  useEffect(() => {
    if (!user || !token || tab !== "requests") return;
    let active = true;
    const refresh = () => api.medicineRequests(token).then((next) => { if (active) setMedicineRequests(next); }).catch(() => undefined);
    void refresh();
    const interval = setInterval(refresh, 6000);
    return () => { active = false; clearInterval(interval); };
  }, [tab, token, user]);

  const visibleMedicines = useMemo(
    () => (Array.isArray(medicines) ? medicines : []).filter((item) => (!categoryFilter || item.category === categoryFilter) && (!search || item.name.toLowerCase().includes(search.toLowerCase()) || item.category.toLowerCase().includes(search.toLowerCase()))),
    [medicines, categoryFilter, search]
  );

  const addToCart = (medicine: Medicine) => setCart(cart.some((item) => item.id === medicine.id) ? cart.map((item) => item.id === medicine.id ? { ...item, quantity: item.quantity + 1 } : item) : [...cart, { ...medicine, quantity: 1 }]);
  const auth = (newToken: string, newUser: User) => {
    setToken(newToken); setUser(newUser); setPendingSession(null);
    loadData(newToken).catch(() => undefined);
    // Clean web URL after successful auth
    if (Platform.OS === "web" && typeof window !== "undefined" && window.history) {
      const clean = window.location.origin + window.location.pathname;
      window.history.replaceState(window.history.state, "", clean);
    }
  };
  const logout = async () => {
    if (token) await api.logout(token);
    await storage.secureRemove("justlocal_token");
    setToken(null); setUser(null);
  };

  if (booting) {
    return (
      <View style={[styles.root, { alignItems: "center", justifyContent: "center" }]}>
        <CapsulePill size={64} />
        <View style={{ height: 12 }} />
        <Wordmark size={26} />
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 18 }} />
        <Text style={[styles.muted, { marginTop: 10 }]}>Locating local care…</Text>
      </View>
    );
  }

  if (!user || !token) {
    return (
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <AuthScreen onAuth={auth} prefillSession={pendingSession} />
      </View>
    );
  }

  const refreshOrders = async () => {
    const [nextOrders, nextRefills, nextRequests] = await Promise.all([api.orders(token), api.listRefills(token), api.medicineRequests(token)]);
    setOrders(nextOrders); setRefills(nextRefills); setMedicineRequests(nextRequests);
  };

  const revokeMedicineRequest = async (requestId: string) => {
    try {
      await api.revokeMedicineRequest(token, requestId);
      setMedicineRequests((current) => current.filter((request) => request.id !== requestId));
    } catch (err) {
      Alert.alert("Couldn't withdraw request", err instanceof Error ? err.message : "Please try again.");
    }
  };

  const submitMedicineRequest = async (items: CartItem[], prescriptionId?: string | null, prescriptionShareConsent = false) => {
    if (prescriptionId && !prescriptionShareConsent) {
      Alert.alert("Consent required", "Agree to share the prescription with matched pharmacies before sending the request.");
      return false;
    }
    const address = location?.address || user.addresses[0]?.address;
    if (!address) {
      setShowCart(false);
      Alert.alert("Add a delivery address", "Save an address before requesting offers.", [
        { text: "Not now", style: "cancel" },
        { text: "Open account", onPress: () => setTab("account") },
      ]);
      return false;
    }
    let latitude = location?.latitude;
    let longitude = location?.longitude;
    if (latitude === undefined || longitude === undefined) {
      try {
        const [geocoded] = await Location.geocodeAsync(address);
        latitude = geocoded?.latitude;
        longitude = geocoded?.longitude;
      } catch { /* Some devices or addresses may not support geocoding. */ }
    }
    if (latitude === undefined || longitude === undefined) {
      setShowCart(false);
      Alert.alert("Location needed", "We couldn't locate that address. Choose your delivery point so pharmacies can estimate the distance.", [
        { text: "Not now", style: "cancel" },
        { text: "Set location", onPress: () => setShowLocation(true) },
      ]);
      return false;
    }
    const created = await api.createMedicineRequest(token, {
      items: items.map((item) => ({ medicine_id: item.id, quantity: item.quantity })),
      prescription_id: prescriptionId ?? undefined,
      prescription_share_consent: Boolean(prescriptionId && prescriptionShareConsent),
      address,
      latitude,
      longitude,
      for_profile_id: activeProfile?.id,
      for_profile_name: activeProfile?.name,
    });
    setMedicineRequests((current) => [created, ...current.filter((request) => request.id !== created.id)]);
    setCart([]);
    setAttachedPrescriptionId(null);
    setAttachedPrescriptionConsent(false);
    setShowCart(false);
    setTab("requests");
    Alert.alert("Request sent", created.matched_pharmacy_count
      ? `Sent to ${created.matched_pharmacy_count} accepting ${created.matched_pharmacy_count === 1 ? "pharmacy" : "pharmacies"}. Compare their offers here.`
      : "No verified pharmacies are accepting requests right now.");
    return true;
  };

  const submitCustomMedicineRequest = async (name: string, quantity: number) => {
    const address = location?.address || user.addresses[0]?.address;
    if (!address) {
      setShowCustomRequest(false);
      Alert.alert("Delivery location needed", "Choose your delivery location before requesting this medicine.", [
        { text: "Not now", style: "cancel" },
        { text: "Set location", onPress: () => setShowLocation(true) },
      ]);
      return;
    }
    let latitude = location?.latitude;
    let longitude = location?.longitude;
    if (latitude === undefined || longitude === undefined) {
      try {
        const [geocoded] = await Location.geocodeAsync(address);
        latitude = geocoded?.latitude;
        longitude = geocoded?.longitude;
      } catch { /* A map pin is needed when an address cannot be geocoded. */ }
    }
    if (latitude === undefined || longitude === undefined) {
      setShowCustomRequest(false);
      Alert.alert("Location needed", "Choose your delivery point on the map so pharmacies can estimate the distance.", [
        { text: "Not now", style: "cancel" },
        { text: "Choose on map", onPress: () => setShowLocation(true) },
      ]);
      return;
    }
    try {
      const created = await api.createMedicineRequest(token, {
        items: [{ requested_name: name.trim(), quantity }],
        address,
        latitude,
        longitude,
        for_profile_id: activeProfile?.id,
        for_profile_name: activeProfile?.name,
      });
      setMedicineRequests((current) => [created, ...current.filter((request) => request.id !== created.id)]);
      setCustomMedicineName("");
      setShowCustomRequest(false);
      setTab("requests");
      Alert.alert("Request sent", created.matched_pharmacy_count
        ? `Sent to ${created.matched_pharmacy_count} accepting pharmacies. Compare their offers here.`
        : "No verified pharmacies are accepting requests right now.");
    } catch (err) {
      Alert.alert("Couldn't send request", err instanceof Error ? err.message : "Please try again.");
    }
  };

  const openPrescriptionUpload = (context: "standalone" | "cart" | "refill") => {
    if (!location && !user.addresses[0]?.address) {
      setShowCart(false);
      Alert.alert("Delivery location needed", "Choose a delivery address before sending a request to pharmacies.", [
        { text: "Not now", style: "cancel" },
        { text: "Set location", onPress: () => setShowLocation(true) },
      ]);
      return;
    }
    setUploadContext(context);
    if (context !== "standalone") setShowCart(false);
    setShowUpload(true);
  };

  const handlePrescriptionUploaded = async (prescriptionId: string, shareConsent: boolean) => {
    setShowUpload(false);
    if (uploadContext === "cart") {
      setAttachedPrescriptionId(prescriptionId);
      setAttachedPrescriptionConsent(shareConsent);
      setShowCart(true);
      Alert.alert("Prescription attached", "It will be shared with matched pharmacies when you send this request.");
      return;
    }
    try {
      await submitMedicineRequest(uploadContext === "refill" ? cart : [], prescriptionId, shareConsent);
    } catch (err) {
      Alert.alert("Request could not be sent", err instanceof Error ? err.message : "Please try again.");
    }
  };

  const selectPharmacyOffer = async (request: MedicineRequest, offerId: string) => {
    try {
      const order = await api.selectMedicineOffer(token, request.id, offerId, "cod");
      await refreshOrders();
      setTab("orders");
      Alert.alert("Pharmacy selected", `Order ${order.order_number} is confirmed. Pay cash on delivery.`);
    } catch (err) {
      Alert.alert("Couldn't select this offer", err instanceof Error ? err.message : "Please refresh and try again.");
    }
  };

  const openPharmacyDirections = (pharmacy: Pharmacy) => {
    const destination = pharmacy.latitude !== undefined && pharmacy.longitude !== undefined
      ? `${pharmacy.latitude},${pharmacy.longitude}`
      : `${pharmacy.name}, ${pharmacy.area}`;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
    void Linking.openURL(url).catch(() => Alert.alert("Couldn't open maps", "Please check that a maps app or browser is available."));
  };

  const reorderRefill = async (refill: Refill) => {
    const medicine = medicines.find((item) => item.id === refill.medicine_id);
    if (!medicine) {
      Alert.alert("Medicine unavailable", "This refill is no longer in the shared medicine catalog.");
      return;
    }
    setCart([{ ...medicine, quantity: refill.quantity }]);
    openPrescriptionUpload("refill");
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.content}>
        {tab === "home" && (
          <Home categories={categories} pharmacies={pharmacies} medicines={visibleMedicines}
            onTab={setTab}
            onPrescription={() => openPrescriptionUpload("standalone")}
            onCategory={(category) => { setCategoryFilter(category); setTab("categories"); }}
            onProduct={setProduct}
            onAdd={addToCart}
            onCart={() => setShowCart(true)}
            cartCount={cart.reduce((sum, item) => sum + item.quantity, 0)}
            search={search} setSearch={setSearch}
            location={location} onLocation={() => setShowLocation(true)}
            onPharmacy={openPharmacyDirections}
            refills={refills} activeProfile={activeProfile} onReorderRefill={reorderRefill} now={clockNow}
            onRequestMedicine={(name) => { setCustomMedicineName(name); setShowCustomRequest(true); }}
          />
        )}
        {tab === "categories" && (
          <CategoriesScreen categories={categories} medicines={visibleMedicines} search={search} selectedCategory={categoryFilter} onSearch={setSearch} onProduct={setProduct} onAdd={addToCart} onCategory={setCategoryFilter} onRequestMedicine={(name) => { setCustomMedicineName(name); setShowCustomRequest(true); }} />
        )}
        {tab === "pharmacies" && <PharmaciesScreen pharmacies={pharmacies} location={location} onDirections={openPharmacyDirections} />}
        {(tab === "requests" || tab === "offers") && <RequestsScreen requests={medicineRequests} onSelectOffer={selectPharmacyOffer} onRevoke={(requestId) => void revokeMedicineRequest(requestId)} />}
        {tab === "chat" && <MedicineChatScreen token={token} />}
        {tab === "orders" && (
          <OrdersScreen orders={orders} onTrack={setTrackOrder} onReorder={(order) => {
            const first = medicines.find((item) => item.name === order.items[0]?.name);
            if (first) addToCart(first);
            setShowCart(true);
          }} />
        )}
        {tab === "account" && (
          <AccountScreen user={user} onAddresses={() => setShowAddresses(true)} onOrders={() => setTab("orders")} onLogout={logout}
            onFamily={() => setShowFamily(true)} familyCount={family.length} activeProfile={activeProfile}
          />
        )}
      </View>

      <View style={styles.nav}>
        {(
          [
            ["home", "Home", "home-outline"],
            ["categories", "Categories", "grid-outline"],
            ["requests", "Requests", "hourglass-outline"],
            ["chat", "Ask", "chatbubbles-outline"],
            ["orders", "Orders", "receipt-outline"],
            ["account", "Account", "person-outline"],
          ] as [Tab, string, IconName][]
        ).map(([key, label, icon]) => (
          <Press
            key={key}
            testID={`tab-${key}`}
            style={styles.navItem}
            onPress={() => { setTab(key); setCategoryFilter(""); }}
          >
            <Icon
              name={tab === key ? (icon.replace("-outline", "") as IconName) : icon}
              color={tab === key ? colors.brandPrimary : colors.muted}
            />
            <Text style={[styles.navText, tab === key && styles.navActive]}>{label}</Text>
          </Press>
        ))}
      </View>

      <ProductModal product={product} onClose={() => setProduct(null)} onAdd={addToCart} />
      <CartModal open={showCart} onClose={() => setShowCart(false)} cart={cart} setCart={setCart} onClearCart={() => { setAttachedPrescriptionId(null); setAttachedPrescriptionConsent(false); }} user={user} activeProfile={activeProfile} deliveryAddress={location?.address ?? user.addresses[0]?.address ?? null} attachedPrescriptionId={attachedPrescriptionId} attachedPrescriptionConsent={attachedPrescriptionConsent} onSubmitRequest={submitMedicineRequest} onUploadPrescription={() => openPrescriptionUpload("cart")} />
      <LocationModal visible={showLocation} onClose={() => setShowLocation(false)} onPick={(loc) => { setLocation(loc); setShowLocation(false); }} current={location} />
      {showCustomRequest && <RequestMedicineModal initialName={customMedicineName} onClose={() => setShowCustomRequest(false)} onSubmit={submitCustomMedicineRequest} />}
      <FamilyModal visible={showFamily} onClose={() => setShowFamily(false)} token={token} activeId={activeProfile?.id ?? null} members={family} onChange={setFamily} onPick={(member) => { setActiveProfile(member); setShowFamily(false); }} />
      {showUpload && <UploadModal token={token} onClose={() => setShowUpload(false)} onUploaded={handlePrescriptionUploaded} />}
      {showAddresses && (
        <Modal visible animationType="slide" onRequestClose={() => setShowAddresses(false)}>
          <AddressModal token={token} user={user} onDone={() => setShowAddresses(false)} />
        </Modal>
      )}
      {trackOrder && <TrackingModal order={trackOrder} onClose={() => setTrackOrder(null)} />}
    </View>
  );
}
