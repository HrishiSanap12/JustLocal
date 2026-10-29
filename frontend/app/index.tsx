import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import * as AppleAuthentication from "expo-apple-authentication";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Address, api, CartItem, ExtractedMedicine, needsVerification, PrescriptionAnalysis, Category, FamilyMember, Medicine, MedicineChatReply, MedicineRequest, Order, Pharmacy, Refill, SavedLocation, User } from "@/src/api";
import { CapsulePill, Wordmark } from "@/src/components/capsule-pill";
import { FamilyModal } from "@/src/components/family-modal";
import { LocationModal, loadSavedLocation } from "@/src/components/location-modal";
import { searchAddresses } from "@/src/geocoding";
import { extractSessionId, signInWithApple, signInWithGoogle } from "@/src/auth-helpers";
import { makeStyles, useTheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";
import { showAlert } from "@/src/alert";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
type Tab = "home" | "categories" | "pharmacies" | "requests" | "offers" | "chat" | "orders" | "account";

const R = { sm: 14, md: 20, lg: 26, xl: 32, pill: 999 };

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 130 },

  // Text
  caption: { color: colors.muted, fontSize: 12 },
  eyebrow: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  display: { color: colors.onSurface, fontSize: 30, fontWeight: "800", letterSpacing: -0.9, lineHeight: 36 },
  title: { color: colors.onSurface, fontSize: 26, fontWeight: "800", letterSpacing: -0.6 },
  sectionTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  body: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 21 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 18 },

  // Chrome
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  screenHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6, minHeight: 48 },
  iconButton: { width: 46, height: 46, borderRadius: R.pill, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", boxShadow: colors.shadowSoft },
  badgeDot: { position: "absolute", top: 6, right: 6, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: colors.error, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: colors.surfaceSecondary },
  badgeText: { color: colors.onError, fontSize: 9, fontWeight: "900" },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  search: { height: 56, borderRadius: R.pill, backgroundColor: colors.surfaceSecondary, flexDirection: "row", alignItems: "center", paddingLeft: 20, paddingRight: 6, gap: 10, marginBottom: 18, boxShadow: colors.shadowSoft },
  searchInput: { flex: 1, minWidth: 0, color: colors.onSurface, fontSize: 15, height: "100%" },
  searchAction: { width: 44, height: 44, borderRadius: R.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  chatHeader: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  chatMessages: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 10, gap: 12 },
  chatBubble: { maxWidth: "86%", borderRadius: 22, padding: 14 },
  chatUserBubble: { alignSelf: "flex-end", backgroundColor: colors.brandPrimary, borderBottomRightRadius: 6 },
  chatAssistantBubble: { alignSelf: "flex-start", backgroundColor: colors.surfaceSecondary, borderBottomLeftRadius: 6, boxShadow: colors.shadowSoft },
  chatUserText: { color: colors.onBrandPrimary, fontSize: 14, lineHeight: 21 },
  chatAssistantText: { color: colors.onSurface, fontSize: 14, lineHeight: 21 },
  chatSources: { marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.divider, gap: 5 },
  chatSource: { color: colors.brandPrimary, fontSize: 11, fontWeight: "700" },
  chatDisclaimer: { marginHorizontal: 20, marginBottom: 8, color: colors.muted, fontSize: 11, lineHeight: 16 },
  chatComposer: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginHorizontal: 16, marginBottom: 104, padding: 6, paddingLeft: 16, borderRadius: 28, backgroundColor: colors.surfaceSecondary, boxShadow: colors.shadowSoft },
  chatInput: { flex: 1, minWidth: 0, maxHeight: 110, minHeight: 44, paddingVertical: 11, color: colors.onSurface, fontSize: 14 },
  chatSend: { width: 44, height: 44, borderRadius: R.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },

  // Home
  hero: { borderRadius: R.xl, overflow: "hidden", marginBottom: 18, boxShadow: colors.shadowLift },
  heroInner: { minHeight: 188, padding: 22, justifyContent: "space-between" },
  heroTitle: { color: colors.onBrandPrimary, fontSize: 24, fontWeight: "800", lineHeight: 29, letterSpacing: -0.5, maxWidth: "78%" },
  heroCopy: { color: "rgba(255,255,255,0.82)", fontSize: 13, marginTop: 6, maxWidth: "78%", lineHeight: 19 },
  heroPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 12, paddingVertical: 7, borderRadius: R.pill, marginBottom: 14 },
  heroPillText: { color: colors.onBrandPrimary, fontSize: 12, fontWeight: "700" },
  arrowButton: { width: 48, height: 48, borderRadius: R.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  arrowButtonLight: { width: 48, height: 48, borderRadius: R.pill, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  primaryButton: { minHeight: 54, paddingHorizontal: 22, borderRadius: R.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  buttonText: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: "800" },
  secondaryButton: { minHeight: 42, paddingHorizontal: 18, borderRadius: R.pill, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", boxShadow: colors.shadowSoft },
  secondaryText: { color: colors.onSurface, fontSize: 13, fontWeight: "700" },
  chip: { height: 44, paddingHorizontal: 18, borderRadius: R.pill, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  chipActive: { backgroundColor: colors.brandPrimary },
  chipText: { color: colors.onSurface, fontSize: 13, fontWeight: "700" },
  chipTextActive: { color: colors.onBrandPrimary },
  rxCard: { borderRadius: R.lg, backgroundColor: colors.surfaceSecondary, padding: 16, flexDirection: "row", alignItems: "center", marginBottom: 14, boxShadow: colors.shadowSoft },
  rxIcon: { width: 48, height: 48, borderRadius: R.pill, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginRight: 13 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10, marginBottom: 24 },
  quickItem: { width: "48.5%", flexDirection: "row", alignItems: "center", gap: 10, padding: 10, paddingRight: 12, borderRadius: R.pill, backgroundColor: colors.surfaceSecondary, boxShadow: colors.shadowSoft },
  quickIcon: { width: 42, height: 42, borderRadius: R.pill, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  quickLabel: { flex: 1, color: colors.onSurface, fontSize: 13, fontWeight: "700", lineHeight: 17 },
  promo: { borderRadius: R.lg, overflow: "hidden", marginBottom: 24 },
  promoInner: { padding: 18, minHeight: 112, justifyContent: "center" },
  promoTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "900" },
  promoCopy: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 4 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14, marginTop: 6 },
  link: { color: colors.brandPrimary, fontWeight: "700", fontSize: 13 },
  categoryScroll: { marginHorizontal: -20, marginBottom: 22 },
  categoryPill: { width: 86, alignItems: "center", marginRight: 12, gap: 8 },
  categoryIcon: { width: 56, height: 56, borderRadius: R.pill, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  categoryName: { color: colors.onSurface, fontSize: 12, textAlign: "center", fontWeight: "700" },
  pharmacyRow: { marginHorizontal: -20 },
  pharmacyCard: { width: 236, borderRadius: R.lg, backgroundColor: colors.surfaceSecondary, padding: 16, boxShadow: colors.shadowSoft },
  pharmacyBadge: { color: colors.onAccent, backgroundColor: colors.accent, paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.pill, fontSize: 11, fontWeight: "700", alignSelf: "flex-start", overflow: "hidden" },
  pharmacyLogo: { width: 46, height: 46, borderRadius: R.pill, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginRight: 11 },
  pharmacyName: { color: colors.onSurface, fontWeight: "800", fontSize: 15, flex: 1 },
  pharmacyMeta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  freeDelivery: { color: colors.brandPrimary, fontSize: 12, fontWeight: "700" },
  spotlight: { borderRadius: R.xl, padding: 18, marginBottom: 22, overflow: "hidden" },
  spotlightInner: { borderRadius: R.lg, backgroundColor: "rgba(255,255,255,0.14)", padding: 14, marginTop: 16, flexDirection: "row", gap: 10 },
  spotlightLabel: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "600" },
  spotlightValue: { color: colors.onBrandPrimary, fontSize: 14, fontWeight: "800", marginTop: 3 },

  // Product grid
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 14 },
  tile: { width: "48.3%", borderRadius: R.lg, backgroundColor: colors.surfaceSecondary, padding: 12, boxShadow: colors.shadowSoft },
  tileFeatured: { backgroundColor: colors.brandPrimary },
  tileImage: { height: 112, borderRadius: R.md, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: 12 },
  tileName: { color: colors.onSurface, fontSize: 14, fontWeight: "800", lineHeight: 18, minHeight: 36 },
  tileMeta: { color: colors.muted, fontSize: 11, marginTop: 4 },
  tileFooter: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 12 },
  tileTag: { fontSize: 11, fontWeight: "700" },
  tileArrow: { width: 38, height: 38, borderRadius: R.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },

  // Floating tab bar
  navWrap: { position: "absolute", left: 16, right: 16, alignItems: "center" },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.brandSecondary, borderRadius: R.pill, padding: 6, width: "100%", maxWidth: 520, boxShadow: "0px 16px 32px rgba(10, 95, 85, 0.35)" },

  // ------------ AUTH SCREEN ------------
  authRoot: { flex: 1, backgroundColor: colors.surface },
  authHero: { paddingTop: 44, paddingBottom: 56, paddingHorizontal: 24, alignItems: "center", borderBottomLeftRadius: 36, borderBottomRightRadius: 36 },
  authTagPill: { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: "rgba(255,255,255,0.18)", borderRadius: R.pill, marginTop: 16 },
  authTag: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 11, letterSpacing: 1.2 },
  authCard: { marginHorizontal: 18, marginTop: -34, borderRadius: R.xl, backgroundColor: colors.surfaceSecondary, padding: 22, boxShadow: "0px 18px 40px rgba(15, 30, 46, 0.10)" },
  authTitle: { color: colors.onSurface, fontSize: 26, fontWeight: "800", letterSpacing: -0.6 },
  authSubtitle: { color: colors.muted, fontSize: 14, marginTop: 6, marginBottom: 20, lineHeight: 20 },
  segmented: { flexDirection: "row", backgroundColor: colors.surfaceTertiary, borderRadius: R.pill, padding: 5, marginBottom: 20 },
  segmentPill: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: R.pill },
  segmentActive: { backgroundColor: colors.surfaceSecondary, boxShadow: colors.shadowSoft },
  segmentText: { color: colors.muted, fontSize: 14, fontWeight: "700" },
  segmentTextActive: { color: colors.onSurface },
  inputWrap: { height: 56, borderRadius: R.md, backgroundColor: colors.surfaceTertiary, borderWidth: 1.5, borderColor: "transparent", paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  inputWrapFocus: { borderColor: colors.brandPrimary, backgroundColor: colors.surfaceSecondary },
  inputField: { flex: 1, minWidth: 0, color: colors.onSurface, fontSize: 15 },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  errorText: { color: colors.error, fontSize: 13, fontWeight: "700", flex: 1 },
  authPrimary: { minHeight: 56, borderRadius: R.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 20, boxShadow: colors.shadowLift },
  authPrimaryText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "800" },
  socialRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  socialBtn: { flex: 1, height: 54, borderRadius: R.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  socialText: { color: colors.onSurface, fontSize: 14, fontWeight: "700" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 22, marginBottom: 12 },
  authFooter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 22 },
  footerLink: { color: colors.brandPrimary, fontSize: 14, fontWeight: "800" },

  // Product / cart / modals
  modal: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 20 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14 },
  modalTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  productCard: { backgroundColor: colors.surfaceSecondary, borderRadius: R.lg, padding: 12, marginBottom: 12, flexDirection: "row", gap: 12, alignItems: "center", boxShadow: colors.shadowSoft },
  productIcon: { width: 64, height: 64, borderRadius: R.md, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  productInfo: { flex: 1 },
  productName: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  productPrice: { color: colors.onSurface, fontSize: 17, fontWeight: "800", marginTop: 5 },
  addButton: { width: 40, height: 40, borderRadius: R.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  addText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 12 },
  tabs: { flexDirection: "row", backgroundColor: colors.surfaceTertiary, borderRadius: R.pill, padding: 5, marginBottom: 18 },
  tabPill: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: R.pill },
  tabPillActive: { backgroundColor: colors.surfaceSecondary, boxShadow: colors.shadowSoft },
  tabPillText: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  tabPillTextActive: { color: colors.onSurface },
  orderCard: { backgroundColor: colors.surfaceSecondary, borderRadius: R.lg, padding: 18, marginBottom: 14, boxShadow: colors.shadowSoft },
  status: { color: colors.success, backgroundColor: colors.brandTertiary, fontSize: 11, fontWeight: "700", borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 6, overflow: "hidden" },
  offerCard: { borderRadius: R.lg, overflow: "hidden", marginBottom: 14 },
  offerInner: { padding: 18, minHeight: 126, justifyContent: "space-between" },
  offerTitle: { color: colors.onSurface, fontSize: 21, fontWeight: "900" },
  code: { color: colors.onBrandPrimary, backgroundColor: colors.brandPrimary, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.pill, fontSize: 11, fontWeight: "800", overflow: "hidden" },
  profile: { borderRadius: R.xl, padding: 20, marginBottom: 18, overflow: "hidden" },
  avatar: { width: 52, height: 52, borderRadius: R.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.onBrandPrimary, fontSize: 18, fontWeight: "800" },
  addressCard: { backgroundColor: colors.surfaceSecondary, borderRadius: R.md, padding: 16, marginBottom: 12, boxShadow: colors.shadowSoft },
  summary: { backgroundColor: colors.surfaceSecondary, borderRadius: R.lg, padding: 18, marginTop: 18, gap: 11, boxShadow: colors.shadowSoft },
  divider: { height: 1, backgroundColor: colors.divider },
  cartRow: { flexDirection: "row", alignItems: "center", padding: 12, marginBottom: 10, borderRadius: R.lg, backgroundColor: colors.surfaceSecondary, boxShadow: colors.shadowSoft },
  quantity: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surfaceTertiary, borderRadius: R.pill, padding: 4 },
  qtyButton: { width: 32, height: 32, borderRadius: R.pill, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  timelineDot: { width: 22, height: 22, borderRadius: R.pill, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", marginRight: 12 },
  timelineLine: { width: 2, height: 26, backgroundColor: colors.brandTertiary, marginLeft: 10 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: colors.brandPrimary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brandPrimary },
  statTile: { flex: 1, alignItems: "center", gap: 6, paddingVertical: 14, paddingHorizontal: 8, borderRadius: R.md, backgroundColor: colors.surfaceSecondary, boxShadow: colors.shadowSoft },
  statValue: { color: colors.onSurface, fontSize: 13, fontWeight: "800", textAlign: "center" },
  statLabel: { color: colors.muted, fontSize: 11, textAlign: "center" },
  menuCard: { backgroundColor: colors.surfaceSecondary, borderRadius: R.lg, paddingHorizontal: 14, boxShadow: colors.shadowSoft },
  menuRow: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 13 },
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
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [info, setInfo] = useState("");

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
    setInfo("");
    try {
      if (mode === "signup" && !name.trim()) throw new Error("Please enter your name.");
      if (!identifier.trim() || !password) throw new Error("Enter your email and password.");
      const result = mode === "login" ? await api.login(identifier, password) : await api.register(name, identifier, phone, password);
      if (needsVerification(result)) {
        setVerifyEmail(result.email);
        setCode(result.dev_code ?? "");
        setInfo(`We sent a 6-digit code to ${result.email}.${result.dev_code ? " (Dev mode: code pre-filled.)" : ""}`);
        return;
      }
      await completeAuth(result.token, result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to continue");
    } finally {
      setLoading(false);
    }
  };
  const submitCode = async () => {
    if (!verifyEmail) return;
    setLoading(true);
    setError("");
    try {
      const result = await api.verifyEmail(verifyEmail, code);
      await completeAuth(result.token, result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't verify the code");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (!verifyEmail) return;
    setError("");
    try {
      const result = await api.resendCode(verifyEmail);
      if (result.dev_code) setCode(result.dev_code);
      setInfo(`A new code was sent to ${verifyEmail}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't resend the code");
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
        <LinearGradient colors={[colors.brandPrimary, colors.brandSecondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.authHero}>
          <CapsulePill size={72} inverse />
          <View style={{ height: 18 }} />
          <Wordmark size={34} inverse />
          <View style={styles.authTagPill}>
            <Text style={styles.authTag}>MEDICINES CLOSER TO YOU</Text>
          </View>
        </LinearGradient>

        {verifyEmail ? (
          <View style={styles.authCard}>
            <Text style={styles.authTitle}>Verify your email</Text>
            <Text style={styles.authSubtitle}>{info || `Enter the 6-digit code sent to ${verifyEmail}.`}</Text>
            <InputField
              testID="auth-otp-input"
              icon="key-outline"
              placeholder="6-digit code"
              value={code}
              onChangeText={(value: string) => setCode(value.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              autoCapitalize="none"
            />
            {error ? (
              <View style={styles.errorRow}>
                <Icon name="alert-circle" color={colors.error} size={16} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            <Press testID="auth-otp-submit" style={styles.authPrimary} onPress={submitCode} disabled={loading || code.length !== 6}>
              {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
                <>
                  <Text style={styles.authPrimaryText}>Verify and continue</Text>
                  <Icon name="arrow-forward" color={colors.onBrandPrimary} size={16} />
                </>
              )}
            </Press>
            <View style={styles.authFooter}>
              <Press testID="auth-otp-resend" onPress={resend}><Text style={styles.footerLink}>Resend code</Text></Press>
              <Press testID="auth-otp-back" onPress={() => { setVerifyEmail(null); setCode(""); setError(""); setInfo(""); setMode("login"); }}>
                <Text style={styles.footerLink}>Back to log in</Text>
              </Press>
            </View>
          </View>
        ) : (
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
              placeholder={mode === "signup" ? "Email" : "Email or phone number"}
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
              <Press testID="social-apple-disabled" style={[styles.socialBtn, { opacity: 0.6 }]} onPress={() => showAlert("Apple Sign-In", "Sign in with Apple is available on iPhone.")}>
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
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ----------------- SHARED CARDS -----------------
function ScreenHeader({ title, subtitle, right, onBack }: { title: string; subtitle?: string; right?: React.ReactNode; onBack?: () => void }) {
  const styles = useStyles();
  return (
    <View style={{ marginBottom: 18 }}>
      <View style={styles.screenHeader}>
        {onBack ? <Press onPress={onBack} style={styles.iconButton} accessibilityLabel="Go back"><Icon name="chevron-back" /></Press> : null}
        <Text style={[styles.title, { flex: 1, marginLeft: onBack ? 12 : 0 }]} numberOfLines={1}>{title}</Text>
        {right}
      </View>
      {subtitle ? <Text style={[styles.muted, { marginTop: 2 }]}>{subtitle}</Text> : null}
    </View>
  );
}

function SectionRow({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const styles = useStyles();
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onAction ? <Press onPress={onAction}><Text style={styles.link}>{action}</Text></Press> : null}
    </View>
  );
}

function PharmacyCard({ pharmacy, onDirections }: { pharmacy: Pharmacy; onDirections: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const distance = pharmacy.distance_km !== undefined
    ? `${pharmacy.distance_km.toFixed(1)} km`
    : pharmacy.latitude !== undefined && pharmacy.longitude !== undefined
      ? pharmacy.distance
      : "Distance unavailable";
  const accepting = pharmacy.accepting_requests !== false;
  return (
    <Press testID={`pharmacy-${pharmacy.id}`} accessibilityLabel={`Get directions to ${pharmacy.name}`} style={styles.pharmacyCard} onPress={onDirections}>
      <View style={styles.rowBetween}>
        <View style={styles.pharmacyLogo}><Icon name="storefront" color={colors.brandPrimary} size={21} /></View>
        <Text style={[styles.pharmacyBadge, !accepting && { backgroundColor: colors.surfaceTertiary, color: colors.muted }]}>{accepting ? "Accepting" : "Paused"}</Text>
      </View>
      <Text style={[styles.pharmacyName, { marginTop: 14 }]} numberOfLines={1}>{pharmacy.name}</Text>
      <Text style={styles.pharmacyMeta} numberOfLines={1}>{pharmacy.area}</Text>
      <View style={[styles.rowBetween, { marginTop: 14 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {pharmacy.rating ? <Text style={{ color: colors.onSurface, fontSize: 12, fontWeight: "700" }}><Icon name="star" size={12} color="#F5A524" /> {pharmacy.rating}</Text> : null}
          <Text style={styles.freeDelivery}><Icon name="navigate" size={11} color={colors.brandPrimary} /> {distance}</Text>
        </View>
        <View style={styles.tileArrow}><Icon name="arrow-up-outline" size={16} color={colors.onSurface} /></View>
      </View>
    </Press>
  );
}

function PharmaciesScreen({ pharmacies, location, onDirections }: { pharmacies: Pharmacy[]; location: SavedLocation | null; onDirections: (pharmacy: Pharmacy) => void }) {
  const styles = useStyles();
  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.scroll}>
      <ScreenHeader title="Nearby pharmacies" subtitle={location?.label ? `Sorted by distance from ${location.label}` : "Choose a map location to see pharmacies by distance."} />
      <View style={{ gap: 12 }}>
        {pharmacies.length ? pharmacies.map((pharmacy) => (
          <View key={pharmacy.id} style={{ width: "100%" }}><PharmacyCard pharmacy={pharmacy} onDirections={() => onDirections(pharmacy)} /></View>
        )) : <Empty icon="location-outline" title="No pinned pharmacies nearby" copy="Verified pharmacies with a registered map location within 50 km will appear here." />}
      </View>
    </ScrollView>
  );
}

function MedicineThumb({ medicine, size = 64, fill = false }: { medicine: Medicine; size?: number; fill?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const box = fill ? { width: "100%" as const, height: "100%" as const } : { width: size, height: size };
  if (medicine.image_url && !failed) {
    return (
      <View style={[styles.productIcon, box, { overflow: "hidden", backgroundColor: "#FFFFFF" }]}>
        <Image source={{ uri: medicine.image_url }} style={{ width: "100%", height: "100%" }} contentFit="contain" transition={150}
          accessibilityLabel={`${medicine.name} pack image`} onError={() => setFailed(true)} />
      </View>
    );
  }
  return (
    <View style={[styles.productIcon, box]}>
      <Icon name={medicine.prescription_required ? "medical" : "flask-outline"} color={colors.brandPrimary} size={Math.round(Math.min(size, 120) * 0.42)} />
    </View>
  );
}

function ProductTile({ medicine, onAdd, onDetails, featured = false }: { medicine: Medicine; onAdd: (m: Medicine) => void; onDetails: (m: Medicine) => void; featured?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const ink = featured ? colors.onBrandPrimary : colors.onSurface;
  return (
    <Press testID={`product-${medicine.id}`} style={[styles.tile, featured && styles.tileFeatured]} onPress={() => onDetails(medicine)}>
      <View style={styles.tileImage}><MedicineThumb medicine={medicine} fill /></View>
      <Text style={[styles.tileName, { color: ink }]} numberOfLines={2}>{medicine.name}</Text>
      <Text style={[styles.tileMeta, featured && { color: "rgba(255,255,255,0.75)" }]} numberOfLines={1}>{medicine.composition || medicine.form}</Text>
      <View style={styles.tileFooter}>
        <View style={{ flex: 1, paddingRight: 6 }}>
          <Text style={[styles.tileTag, { color: featured ? colors.accent : medicine.prescription_required ? colors.warning : colors.success }]} numberOfLines={1}>
            {medicine.prescription_required ? "Rx likely" : "No Rx usually"}
          </Text>
          <Text style={[styles.tileMeta, { marginTop: 2 }, featured && { color: "rgba(255,255,255,0.75)" }]} numberOfLines={1}>{medicine.price === null ? medicine.form : `₹${medicine.price}`}</Text>
        </View>
        <Press testID={`product-add-${medicine.id}`} accessibilityLabel={`Add ${medicine.name} to cart`} style={[styles.tileArrow, featured && { backgroundColor: colors.surfaceSecondary }]} onPress={() => onAdd(medicine)}>
          <Icon name="add" size={20} color={featured ? colors.brandPrimary : colors.onSurface} />
        </Press>
      </View>
    </Press>
  );
}

function ProductGrid({ medicines, onAdd, onDetails, featureFirst = false }: { medicines: Medicine[]; onAdd: (m: Medicine) => void; onDetails: (m: Medicine) => void; featureFirst?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.grid}>
      {medicines.map((medicine, index) => (
        <ProductTile key={medicine.id} medicine={medicine} onAdd={onAdd} onDetails={onDetails} featured={featureFirst && index === 1} />
      ))}
    </View>
  );
}

function Empty({ icon, title, copy }: { icon: IconName; title: string; copy: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: 56, paddingHorizontal: 20, borderRadius: 26, backgroundColor: colors.surfaceSecondary, boxShadow: colors.shadowSoft }}>
      <View style={[styles.rxIcon, { width: 64, height: 64, marginRight: 0, marginBottom: 16 }]}><Icon name={icon} color={colors.brandPrimary} size={28} /></View>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={[styles.muted, { textAlign: "center", marginTop: 7, maxWidth: 280 }]}>{copy}</Text>
    </View>
  );
}

const NAV_SPRING = { damping: 20, stiffness: 220, mass: 0.7 };

function NavItem({ label, icon, active, showLabel, pending, onPress, testID }: { label: string; icon: string; active: boolean; showLabel: boolean; pending: boolean; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  const progress = useSharedValue(active ? 1 : 0);
  const pressed = useSharedValue(1);
  useEffect(() => {
    progress.set(withSpring(active ? 1 : 0, NAV_SPRING));
  }, [active, progress]);
  const slotStyle = useAnimatedStyle(() => ({
    flexGrow: 1 + (showLabel ? 1.3 : 0.35) * progress.get(),
  }));
  const containerStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], ["rgba(255,255,255,0)", colors.surfaceSecondary]),
    transform: [{ scale: pressed.get() }],
  }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    maxWidth: showLabel ? 84 * progress.get() : 0,
    marginLeft: 6 * progress.get(),
  }));
  const activeIcon = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const idleIcon = useAnimatedStyle(() => ({ opacity: 1 - progress.get() }));
  return (
    <Animated.View style={[{ flexBasis: 0, minWidth: 0 }, slotStyle]}>
    <Pressable
      testID={testID}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={() => { pressed.set(withTiming(0.92, { duration: 90 })); }}
      onPressOut={() => { pressed.set(withSpring(1, NAV_SPRING)); }}
    >
      <Animated.View style={[{ height: 52, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", overflow: "hidden" }, containerStyle]}>
        <View style={{ width: 22, height: 22 }}>
          <Animated.View style={[{ position: "absolute" }, idleIcon]}><Icon name={`${icon}-outline` as IconName} size={21} color="rgba(255,255,255,0.86)" /></Animated.View>
          <Animated.View style={[{ position: "absolute" }, activeIcon]}><Icon name={icon as IconName} size={21} color={colors.brandSecondary} /></Animated.View>
        </View>
        <Animated.Text numberOfLines={1} style={[{ color: colors.brandSecondary, fontSize: 13, fontWeight: "800" }, labelStyle]}>{label}</Animated.Text>
        {pending && !active ? <View style={{ position: "absolute", top: 10, right: "26%", width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} /> : null}
      </Animated.View>
    </Pressable>
    </Animated.View>
  );
}

// Fades and slides each tab's content in when the tab changes.
function TabTransition({ tabKey, children }: { tabKey: string; children: React.ReactNode }) {
  const progress = useSharedValue(1);
  useEffect(() => {
    progress.set(0);
    progress.set(withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) }));
  }, [tabKey, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.2 + 0.8 * progress.get(),
    transform: [{ translateY: 14 * (1 - progress.get()) }],
  }));
  return <Animated.View style={[{ flex: 1 }, style]}>{children}</Animated.View>;
}

function greeting(now: number | null) {
  const hour = now === null ? 12 : new Date(now).getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

// ----------------- SCREENS -----------------
function Home({ user, categories, pharmacies, medicines, onTab, onPrescription, onCategory, onProduct, onAdd, onCart, search, setSearch, cartCount, location, onLocation, onPharmacy, refills, activeProfile, onReorderRefill, onRequestMedicine, activeRequest, now }: {
  user: User; categories: Category[]; pharmacies: Pharmacy[]; medicines: Medicine[]; onTab: (t: Tab) => void;
  onPrescription: () => void; onCategory: (c: string) => void; onProduct: (m: Medicine) => void; onAdd: (m: Medicine) => void;
  onCart: () => void; search: string; setSearch: (v: string) => void; cartCount: number;
  location: SavedLocation | null; onLocation: () => void;
  onPharmacy: (pharmacy: Pharmacy) => void;
  refills: Refill[]; activeProfile: FamilyMember | null; onReorderRefill: (r: Refill) => void; onRequestMedicine: (name: string) => void;
  activeRequest: MedicineRequest | null; now: number | null;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const firstName = user.name.split(" ")[0] || "there";
  const acceptingCount = pharmacies.filter((pharmacy) => pharmacy.accepting_requests !== false).length;
  const searching = search.trim().length > 1;
  const offerCount = activeRequest?.offers.filter((offer) => offer.status === "offered" && offer.availability !== "unavailable").length ?? 0;
  const nextRefill = refills[0];
  const refillDays = nextRefill && now !== null ? Math.max(0, Math.ceil((new Date(nextRefill.next_refill_at).getTime() - now) / 86400000)) : null;

  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {/* Greeting */}
      <View style={styles.header}>
        <Press testID="location-open" style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }} onPress={onLocation}>
          <View style={{ width: 52, height: 52, borderRadius: 999, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", boxShadow: colors.shadowSoft }} accessibilityLabel="Justlocal">
            <CapsulePill size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow} numberOfLines={1}>{greeting(now)}, {firstName}</Text>
            <Text style={{ color: colors.onSurface, fontSize: 15, fontWeight: "800", marginTop: 2 }} numberOfLines={1}>
              <Icon name="location" size={13} color={colors.brandPrimary} /> {location?.label ?? "Set delivery location"} <Icon name="chevron-down" size={12} color={colors.muted} />
            </Text>
          </View>
        </Press>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Press testID="chat-shortcut" style={styles.iconButton} onPress={() => onTab("chat")} accessibilityLabel="Medicine questions">
            <Icon name="chatbubble-ellipses-outline" />
          </Press>
          <Press testID="cart-button" style={styles.iconButton} onPress={onCart} accessibilityLabel="Open cart">
            <Icon name="bag-handle-outline" />
            {cartCount > 0 && <View style={styles.badgeDot}><Text style={styles.badgeText}>{cartCount}</Text></View>}
          </Press>
        </View>
      </View>

      <Text style={[styles.display, { marginBottom: 18 }]}>What do you{"\n"}need today?</Text>

      <View style={styles.search}>
        <Icon name="search" color={colors.muted} />
        <TextInput style={styles.searchInput} placeholder="Search 11,000+ medicines…" placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} returnKeyType="search" />
        <Press style={styles.searchAction} onPress={() => onTab("categories")} accessibilityLabel="Browse categories"><Icon name="options-outline" color={colors.onBrandPrimary} size={19} /></Press>
      </View>

      {activeProfile ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.brandTertiary, marginTop: -6, marginBottom: 16 }}>
          <Icon name="people" size={13} color={colors.brandPrimary} />
          <Text style={{ color: colors.onBrandTertiary, fontSize: 12, fontWeight: "700" }}>Ordering for {activeProfile.name.split(" ")[0]}</Text>
        </View>
      ) : null}

      {searching ? (
        <>
          <SectionRow title={medicines.length ? `Results for “${search.trim()}”` : "No catalog match"} />
          {medicines.length ? <ProductGrid medicines={medicines.slice(0, 20)} onAdd={onAdd} onDetails={onProduct} /> : null}
          <Press onPress={() => onRequestMedicine(search.trim())} style={[styles.rxCard, { marginTop: 14 }]}>
            <View style={styles.rxIcon}><Icon name="paper-plane-outline" color={colors.brandPrimary} size={21} /></View>
            <View style={{ flex: 1 }}><Text style={styles.productName}>Can&apos;t find “{search.trim()}”?</Text><Text style={styles.muted}>Ask verified pharmacies nearby to check</Text></View>
            <Icon name="chevron-forward" color={colors.muted} />
          </Press>
        </>
      ) : (
        <>
          {/* Hero */}
          <Press style={styles.hero} onPress={onPrescription}>
            <LinearGradient colors={[colors.brandPrimary, colors.brandSecondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroInner}>
              <View style={{ position: "absolute", right: -30, top: -30, width: 170, height: 170, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)" }} />
              <View style={{ position: "absolute", right: 30, bottom: -50, width: 120, height: 120, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)" }} />
              <View>
                <View style={styles.heroPill}><Icon name="shield-checkmark" size={13} color={colors.onBrandPrimary} /><Text style={styles.heroPillText}>{acceptingCount} verified {acceptingCount === 1 ? "pharmacy" : "pharmacies"} nearby</Text></View>
                <Text style={styles.heroTitle}>Upload a prescription, get offers in minutes</Text>
                <Text style={styles.heroCopy}>Pharmacists near you check it and send prices. You choose.</Text>
              </View>
              <View style={[styles.rowBetween, { marginTop: 18 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Icon name="cloud-upload-outline" color={colors.onBrandPrimary} size={18} />
                  <Text style={{ color: colors.onBrandPrimary, fontWeight: "800", fontSize: 14 }}>Upload prescription</Text>
                </View>
                <View style={styles.arrowButtonLight}><Icon name="arrow-forward" color={colors.brandPrimary} /></View>
              </View>
            </LinearGradient>
          </Press>

          {/* Active request, like an "upcoming appointment" */}
          {activeRequest ? (
            <Press onPress={() => onTab("requests")} style={[styles.orderCard, { borderWidth: 1.5, borderColor: colors.brandTertiary }]}>
              <View style={styles.rowBetween}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                  <View style={styles.rxIcon}><Icon name="hourglass-outline" color={colors.brandPrimary} size={21} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eyebrow}>Active request</Text>
                    <Text style={styles.productName} numberOfLines={1}>{activeRequest.items.map((item) => item.name).join(", ") || "Prescription review"}</Text>
                  </View>
                </View>
                <View style={styles.arrowButton}><Icon name="arrow-forward" color={colors.onBrandPrimary} /></View>
              </View>
              <View style={[styles.rowBetween, { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.divider }]}>
                <Text style={styles.muted}><Icon name="storefront-outline" size={13} color={colors.muted} /> {activeRequest.matched_pharmacy_count} pharmacies asked</Text>
                <Text style={[styles.link, offerCount ? {} : { color: colors.muted }]}>{offerCount ? `${offerCount} offer${offerCount === 1 ? "" : "s"} ready` : "Waiting for offers"}</Text>
              </View>
            </Press>
          ) : null}

          {/* Refill reminder */}
          {nextRefill ? (
            <View style={[styles.rxCard, { backgroundColor: colors.accent }]}>
              <View style={[styles.rxIcon, { backgroundColor: "rgba(255,255,255,0.6)" }]}><Icon name="alarm-outline" color={colors.onAccent} size={21} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.productName, { color: colors.onAccent }]} numberOfLines={1}>{nextRefill.medicine_name}</Text>
                <Text style={{ color: colors.onAccent, fontSize: 12, marginTop: 2 }}>
                  {nextRefill.for_profile_name ? `For ${nextRefill.for_profile_name} · ` : ""}{refillDays === null ? "Refill coming up" : refillDays === 0 ? "Refill due today" : `Refill in ${refillDays} day${refillDays === 1 ? "" : "s"}`}
                </Text>
              </View>
              <Press testID={`refill-reorder-${nextRefill.id}`} style={[styles.secondaryButton, { boxShadow: "none" }]} onPress={() => onReorderRefill(nextRefill)}>
                <Text style={styles.secondaryText}>Refill</Text>
              </Press>
            </View>
          ) : null}

          {/* Quick actions */}
          <View style={styles.quickGrid}>
            {([
              ["document-text-outline", "Upload Rx", onPrescription],
              ["receipt-outline", "My orders", () => onTab("orders")],
              ["storefront-outline", "Stores", () => onTab("pharmacies")],
              ["chatbubbles-outline", "Ask", () => onTab("chat")],
            ] as [IconName, string, () => void][]).map(([icon, label, action]) => (
              <Press key={label} style={styles.quickItem} onPress={action}>
                <View style={styles.quickIcon}><Icon name={icon} color={colors.brandPrimary} size={20} /></View>
                <Text style={styles.quickLabel} numberOfLines={2}>{label}</Text>
              </Press>
            ))}
          </View>

          {/* Categories as chips */}
          <SectionRow title="Browse by need" action="See all" onAction={() => onTab("categories")} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
            {categories.map((category) => (
              <Press key={category.id} style={styles.chip} onPress={() => onCategory(category.name)}>
                <Icon name={category.icon as IconName} color={colors.brandPrimary} size={16} />
                <Text style={styles.chipText}>{category.name}</Text>
              </Press>
            ))}
          </ScrollView>

          {/* Pharmacies */}
          <SectionRow title="Pharmacies near you" action="See all" onAction={() => onTab("pharmacies")} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.pharmacyRow, { marginBottom: 22 }]} contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingVertical: 6 }}>
            {pharmacies.slice(0, 8).map((pharmacy) => <PharmacyCard key={pharmacy.id} pharmacy={pharmacy} onDirections={() => onPharmacy(pharmacy)} />)}
            {pharmacies.length === 0 && <Text style={styles.muted}>No verified pharmacy locations found here yet.</Text>}
          </ScrollView>

          {/* Medicines */}
          <SectionRow title="Explore medicines" action="Browse" onAction={() => onTab("categories")} />
          <ProductGrid medicines={medicines.slice(0, 6)} onAdd={onAdd} onDetails={onProduct} featureFirst />
        </>
      )}
    </ScrollView>
  );
}

function CategoriesScreen({ categories, medicines, search, selectedCategory, onSearch, onProduct, onAdd, onCategory, onRequestMedicine }: { categories: Category[]; medicines: Medicine[]; search: string; selectedCategory: string; onSearch: (value: string) => void; onProduct: (m: Medicine) => void; onAdd: (m: Medicine) => void; onCategory: (c: string) => void; onRequestMedicine: (name: string) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const total = categories.reduce((sum, item) => sum + item.count, 0);
  const heading = search.trim() ? (medicines.length ? `Results for “${search.trim()}”` : "No catalog match") : selectedCategory || "All medicines";
  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Medicines" subtitle={`${total.toLocaleString()} medicines across ${categories.length} categories`} />
      <View style={styles.search}>
        <Icon name="search" color={colors.muted} />
        <TextInput style={styles.searchInput} placeholder="Search by brand or ingredient" placeholderTextColor={colors.muted} value={search} onChangeText={onSearch} returnKeyType="search" />
        {search ? <Press style={[styles.searchAction, { backgroundColor: colors.surfaceTertiary }]} onPress={() => onSearch("")} accessibilityLabel="Clear search"><Icon name="close" size={18} /></Press> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
        <Press testID="category-filter-all" onPress={() => onCategory("")} style={[styles.chip, !selectedCategory && styles.chipActive]}>
          <Text style={[styles.chipText, !selectedCategory && styles.chipTextActive]}>All</Text>
        </Press>
        {categories.map((category) => {
          const active = selectedCategory === category.name;
          return (
            <Press key={category.id} testID={`category-filter-${category.id}`} onPress={() => onCategory(active ? "" : category.name)} style={[styles.chip, active && styles.chipActive]}>
              <Icon name={category.icon as IconName} size={15} color={active ? colors.onBrandPrimary : colors.brandPrimary} />
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{category.name}</Text>
              <Text style={[styles.caption, active && { color: "rgba(255,255,255,0.75)" }]}>{category.count}</Text>
            </Press>
          );
        })}
      </ScrollView>
      <SectionRow title={heading} />
      {medicines.length ? <ProductGrid medicines={medicines.slice(0, 40)} onAdd={onAdd} onDetails={onProduct} /> : null}
      {search.trim() ? (
        <Press style={[styles.rxCard, { marginTop: 14 }]} onPress={() => onRequestMedicine(search.trim())}>
          <View style={styles.rxIcon}><Icon name="paper-plane-outline" color={colors.brandPrimary} size={21} /></View>
          <View style={{ flex: 1 }}><Text style={styles.productName}>Request “{search.trim()}”</Text><Text style={styles.muted}>We&apos;ll ask verified pharmacies nearby to check.</Text></View>
          <Icon name="chevron-forward" color={colors.muted} />
        </Press>
      ) : null}
      {!medicines.length && !search.trim() ? <Empty icon="medkit-outline" title="Nothing here yet" copy="Try another category or search by ingredient." /> : null}
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
      <ScreenHeader title="My orders" subtitle="Track deliveries and reorder in a tap." />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
        {["All", "Ongoing", "Delivered", "Cancelled"].map((item) => (
          <Press key={item} style={[styles.chip, filter === item && styles.chipActive]} onPress={() => setFilter(item)}>
            <Text style={[styles.chipText, filter === item && styles.chipTextActive]}>{item}</Text>
          </Press>
        ))}
      </ScrollView>
      {visible.length === 0 ? (
        <Empty icon="receipt-outline" title="No orders here yet" copy="Your next local pharmacy order will appear here." />
      ) : visible.map((order) => (
        <View key={order.id} style={styles.orderCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={styles.rxIcon}><Icon name={order.status === "Delivered" ? "checkmark-done" : "bicycle-outline"} color={colors.brandPrimary} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.productName} numberOfLines={1}>{order.pharmacy_name}</Text>
              <Text style={styles.muted} numberOfLines={1}>#{order.order_number} · {new Date(order.created_at).toLocaleDateString()}</Text>
            </View>
          </View>
          <Text style={[styles.status, { alignSelf: "flex-start", marginTop: 12 }, order.status !== "Delivered" && { color: colors.onAccent, backgroundColor: colors.accent }]}>{order.status}</Text>
          <Text style={[styles.body, { marginTop: 14 }]} numberOfLines={2}>{order.items.map((item) => `${item.name} ×${item.quantity}`).join(", ")}</Text>
          <View style={[styles.rowBetween, { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.divider }]}>
            <Text style={styles.productPrice}>₹{order.total}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Press style={[styles.secondaryButton, { backgroundColor: colors.surfaceTertiary, boxShadow: "none" }]} onPress={() => onReorder(order)}><Text style={styles.secondaryText}>Buy again</Text></Press>
              <Press style={[styles.secondaryButton, { backgroundColor: colors.brandPrimary, boxShadow: "none" }]} onPress={() => onTrack(order)}><Text style={[styles.secondaryText, { color: colors.onBrandPrimary }]}>Track</Text></Press>
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
      <ScreenHeader title="Requests" subtitle="Nearby verified pharmacies check stock and send offers. Your order is created only when you choose one." />
      {activeRequests.length === 0 ? (
        <Empty icon="time-outline" title="No active requests" copy="Search for medicines or upload a prescription to ask verified pharmacies." />
      ) : activeRequests.map((request) => {
        const responses = request.offers ?? [];
        const offers = responses.filter((offer) => offer.status === "offered" && offer.availability !== "unavailable");
        const unavailable = responses.filter((offer) => offer.availability === "unavailable");
        return (
          <View key={request.id} style={styles.orderCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={styles.rxIcon}><Icon name="hourglass-outline" color={colors.brandPrimary} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.productName} numberOfLines={1}>Request #{request.id.slice(-6).toUpperCase()}</Text>
                <Text style={styles.muted} numberOfLines={1}>{new Date(request.created_at).toLocaleDateString()} · {request.matched_pharmacy_count} {request.matched_pharmacy_count === 1 ? "pharmacy" : "pharmacies"}</Text>
              </View>
            </View>
            <Text style={[styles.status, { alignSelf: "flex-start", marginTop: 12, color: request.status === "no_pharmacies" ? colors.error : colors.onAccent, backgroundColor: request.status === "no_pharmacies" ? colors.surfaceTertiary : colors.accent }]}>{request.status === "collecting_offers" ? "Finding offers" : request.status === "no_pharmacies" ? "No pharmacy matched yet" : request.status.replaceAll("_", " ")}</Text>
            <View style={{ marginTop: 6 }}>
              {request.items.map((item, index) => (
                <View key={`${item.medicine_id ?? item.name}-${index}`} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }}>
                  <Icon name="medical-outline" size={15} color={colors.brandPrimary} />
                  <Text style={[styles.body, { flex: 1 }]}>{item.name} ×{item.quantity}{item.prescription_required ? " · Rx" : ""}</Text>
                </View>
              ))}
            </View>
            {request.prescription_id && <View style={[styles.rxCard, { marginTop: 12, marginBottom: 0, backgroundColor: colors.surface, boxShadow: "none" }]}><View style={styles.rxIcon}><Icon name="document-text" color={colors.brandPrimary} /></View><Text style={[styles.body, { flex: 1 }]}>Prescription shared for pharmacist review</Text><Icon name="lock-closed" color={colors.muted} size={15} /></View>}
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
                  <View key={offer.id} style={[styles.addressCard, { marginBottom: 10, backgroundColor: colors.surface, boxShadow: "none", borderWidth: 1.5, borderColor: colors.brandTertiary }]}>
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <LinearGradient colors={[colors.brandPrimary, colors.brandSecondary]} style={{ width: 48, height: 48, borderRadius: 999, alignItems: "center", justifyContent: "center" }}>
            <Icon name="sparkles" color={colors.onBrandPrimary} />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Ask Justlocal</Text>
            <Text style={styles.muted}>Answers from verified sources only. No diagnosis or dosing advice.</Text>
          </View>
        </View>
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
  const groups: [string, [IconName, string, () => void, string | undefined][]][] = [
    ["Health", [
      ["people-outline", "Family profiles", onFamily, familyCount > 0 ? `${familyCount} added${activeProfile ? ` · Active: ${activeProfile.name}` : ""}` : "Add parents, kids, or your partner"],
      ["document-text-outline", "Prescriptions", () => showAlert("Prescriptions", "Your pharmacist-reviewed prescriptions will appear here."), undefined],
      ["receipt-outline", "My orders", onOrders, undefined],
    ]],
    ["Delivery & payment", [
      ["location-outline", "Saved addresses", onAddresses, `${user.addresses.length} saved`],
      ["card-outline", "Payment methods", () => showAlert("Payment methods", "Online payments via Razorpay will be enabled once merchant keys are added. Cash on delivery works today."), "Cash on delivery"],
    ]],
    ["Support", [
      ["help-circle-outline", "Help & support", () => showAlert("Support", "Our local care team is here to help."), undefined],
      ["information-circle-outline", "About Justlocal", () => showAlert("Justlocal", "Medicines closer to you."), undefined],
    ]],
  ];
  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.scroll}>
      <ScreenHeader title="Profile" />
      <LinearGradient colors={[colors.brandPrimary, colors.brandSecondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.profile, { boxShadow: colors.shadowLift }]}>
        <View style={{ position: "absolute", right: -40, top: -40, width: 160, height: 160, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)" }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={[styles.avatar, { width: 60, height: 60, backgroundColor: colors.surfaceSecondary }]}><Text style={[styles.avatarText, { color: colors.brandPrimary, fontSize: 21 }]}>{initials}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.onBrandPrimary, fontSize: 20, fontWeight: "800" }} numberOfLines={1}>{user.name}</Text>
            <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, marginTop: 2 }} numberOfLines={1}>{user.email}</Text>
            <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 13 }}>{user.phone ?? "No phone number"}</Text>
          </View>
        </View>
        <View style={styles.spotlightInner}>
          {[["Family", String(familyCount)], ["Places", String(user.addresses.length)], ["Email", user.email_verified === false ? "Pending" : "Verified"]].map(([label, value]) => (
            <View key={label} style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.spotlightLabel} numberOfLines={1}>{label}</Text>
              <Text style={styles.spotlightValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>
      {groups.map(([group, rows]) => (
        <View key={group} style={{ marginBottom: 16 }}>
          <Text style={[styles.eyebrow, { marginBottom: 8, marginLeft: 4 }]}>{group}</Text>
          <View style={styles.menuCard}>
            {rows.map(([icon, label, action, hint], index) => (
              <Press key={label} style={[styles.menuRow, index < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider }]} onPress={action}>
                <View style={[styles.rxIcon, { width: 42, height: 42, marginRight: 0 }]}><Icon name={icon} size={19} color={colors.brandPrimary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.onSurface, fontSize: 15, fontWeight: "700" }}>{label}</Text>
                  {hint ? <Text style={[styles.muted, { marginTop: 2 }]} numberOfLines={1}>{hint}</Text> : null}
                </View>
                <Icon name="chevron-forward" size={17} color={colors.muted} />
              </Press>
            ))}
          </View>
        </View>
      ))}
      <Press testID="logout-button" style={[styles.secondaryButton, { minHeight: 54, flexDirection: "row", gap: 8, marginTop: 6 }]} onPress={onLogout}>
        <Icon name="log-out-outline" color={colors.error} size={19} />
        <Text style={[styles.secondaryText, { color: colors.error }]}>Log out</Text>
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
      showAlert("Address saved", "Your new address is ready for checkout.");
    } catch (err) {
      showAlert("Couldn't save address", err instanceof Error ? err.message : "Please try again.");
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

function ConsentRow({ checked, onToggle, label, testID }: { checked: boolean; onToggle: () => void; label: string; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Press testID={testID} onPress={onToggle} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 14 }}>
      <Icon name={checked ? "checkbox" : "square-outline"} size={22} color={checked ? colors.brandPrimary : colors.muted} />
      <Text style={[styles.body, { flex: 1 }]}>{label}</Text>
    </Press>
  );
}

function medicineLabel(medicine: ExtractedMedicine) {
  return [medicine.name, medicine.strength].filter(Boolean).join(" ").trim();
}

function UploadModal({ token, onClose, onUploaded, collectMedicines }: { token: string; onClose: () => void; onUploaded: (prescriptionId: string, shareConsent: boolean, medicineNames: string[]) => void; collectMedicines: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [uri, setUri] = useState("");
  const [name, setName] = useState("");
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prescriptionId, setPrescriptionId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<PrescriptionAnalysis | null>(null);
  const [analysisNote, setAnalysisNote] = useState("");
  const [externalOcr, setExternalOcr] = useState(false);
  const [externalAvailable, setExternalAvailable] = useState(false);
  const [shareConsent, setShareConsent] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);

  useEffect(() => {
    api.ocrConfig().then((config) => setExternalAvailable(config.external)).catch(() => setExternalAvailable(false));
  }, []);

  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setUri(asset.uri);
      setName(asset.fileName ?? "prescription.jpg");
      setMimeType(asset.mimeType ?? null);
    }
  };

  const upload = async () => {
    if (!uri) return;
    setBusy(true);
    try {
      const uploaded = await api.uploadPrescription(token, uri, name, mimeType);
      setPrescriptionId(uploaded.id);
      if (!collectMedicines) {
        setAnalysisNote("Prescription uploaded. The pharmacist will check it against your cart.");
        return;
      }
      try {
        const result = await api.analyzePrescription(token, uploaded.id, externalAvailable && externalOcr);
        setAnalysis(result);
        setAnalysisNote(result.message);
        setSelected(result.medicines.map((_, index) => index));
      } catch {
        setAnalysisNote("We couldn't read this image automatically. A pharmacist will read your prescription.");
      }
    } catch (err) {
      showAlert("Upload failed", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    if (!prescriptionId) return;
    if (!shareConsent) {
      showAlert("Consent required", "Tick the box to share this prescription with the matched pharmacies.");
      return;
    }
    const names = (analysis?.medicines ?? [])
      .filter((_, index) => selected.includes(index))
      .map(medicineLabel)
      .filter((label) => label.length >= 2)
      .map((label) => label.slice(0, 160));
    onUploaded(prescriptionId, true, Array.from(new Map(names.map((label) => [label.toLowerCase(), label])).values()));
  };

  const medicines = analysis?.medicines ?? [];

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(11,37,69,0.24)" }}>
        <View style={[styles.modal, { minHeight: "52%", maxHeight: "92%", borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 18 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{prescriptionId ? "Review prescription" : busy ? "Uploading…" : "Upload prescription"}</Text>
            <Press onPress={onClose} style={styles.iconButton}><Icon name="close" /></Press>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {!prescriptionId ? (
              <>
                <Text style={styles.body}>Upload a clear photo (JPEG, PNG or WebP, up to 8 MB). A pharmacist always reviews the prescription before making an offer.</Text>
                <Press testID="rx-pick" style={[styles.rxCard, { marginTop: 20, justifyContent: "center" }]} onPress={pick} disabled={busy}>
                  <Icon name="image-outline" color={colors.brandPrimary} size={24} />
                  <Text style={[styles.body, { marginLeft: 10, flex: 1 }]} numberOfLines={2}>{name || "Choose an image from your phone"}</Text>
                </Press>
                {collectMedicines && externalAvailable && (
                  <ConsentRow testID="rx-external-ocr-consent" checked={externalOcr} onToggle={() => setExternalOcr(!externalOcr)}
                    label="Send the image to Veryfi (an external service) to read the medicine names. If unticked, it is read on our server only." />
                )}
                <Press testID="rx-upload" style={[styles.primaryButton, { marginTop: 24 }]} onPress={upload} disabled={!uri || busy}>
                  {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.buttonText}>{collectMedicines ? "Upload and read" : "Upload"}</Text>}
                </Press>
              </>
            ) : (
              <>
                {analysisNote ? <Text style={[styles.body, { marginBottom: 14 }]}>{analysisNote}</Text> : null}
                {collectMedicines && (
                  <>
                    <Text style={[styles.sectionTitle, { marginBottom: 10 }]}>Medicines found</Text>
                    {medicines.length ? medicines.map((medicine, index) => {
                      const isOn = selected.includes(index);
                      return (
                        <Press key={`${medicine.name}-${index}`} testID={`rx-medicine-${index}`}
                          onPress={() => setSelected((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])}
                          style={[styles.addressCard, { marginBottom: 10, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: isOn ? colors.brandPrimary : colors.border, backgroundColor: isOn ? colors.brandTertiary : colors.surface }]}>
                          <Icon name={isOn ? "checkbox" : "square-outline"} size={22} color={isOn ? colors.brandPrimary : colors.muted} />
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.productName}>{medicineLabel(medicine) || "Unreadable name"}</Text>
                            {[medicine.frequency, medicine.duration].some(Boolean) && <Text style={styles.muted}>{[medicine.frequency, medicine.duration].filter(Boolean).join(" · ")}</Text>}
                          </View>
                        </Press>
                      );
                    }) : (
                      <View style={[styles.addressCard, { marginBottom: 10 }]}>
                        <Text style={styles.body}>No medicine names were read. You can still send it: the pharmacist will read the prescription and offer the right medicines.</Text>
                      </View>
                    )}
                    {medicines.length > 0 && <Text style={[styles.muted, { marginBottom: 6 }]}>Untick anything that looks wrong. Machine reading can make mistakes; the pharmacist checks against the prescription.</Text>}
                  </>
                )}
                <ConsentRow testID="rx-share-consent" checked={shareConsent} onToggle={() => setShareConsent(!shareConsent)}
                  label="I agree to share this prescription with the nearby pharmacies matched to my request." />
                <Press testID="rx-confirm" style={[styles.primaryButton, { marginTop: 20 }]} onPress={confirm}>
                  <Text style={styles.buttonText}>{collectMedicines ? "Send to pharmacies" : "Attach to request"}</Text>
                  <Icon name="arrow-forward" color={colors.onBrandPrimary} size={18} />
                </Press>
              </>
            )}
          </ScrollView>
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
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={Boolean(product)} animationType="slide" onRequestClose={onClose}>
      {product && (
        <View style={{ flex: 1, backgroundColor: colors.surface }}>
          <ScrollView contentContainerStyle={{ paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
            <LinearGradient colors={[colors.brandTertiary, colors.surface]} style={{ paddingTop: insets.top + 10, paddingHorizontal: 20, paddingBottom: 26, borderBottomLeftRadius: 36, borderBottomRightRadius: 36 }}>
              <View style={styles.rowBetween}>
                <Press onPress={onClose} style={styles.iconButton} accessibilityLabel="Close details"><Icon name="chevron-back" /></Press>
                <Text style={[styles.modalTitle, { fontSize: 17 }]}>Medicine details</Text>
                <View style={{ width: 46 }} />
              </View>
              <View style={{ alignSelf: "center", width: 220, height: 220, marginTop: 18, borderRadius: 32, overflow: "hidden", backgroundColor: "#FFFFFF", boxShadow: colors.shadowSoft }}>
                <MedicineThumb medicine={product} fill />
              </View>
            </LinearGradient>
            <View style={{ paddingHorizontal: 20 }}>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 4, marginBottom: 10 }}>
                <Text style={[styles.status, { color: colors.onBrandTertiary }]}>{product.category}</Text>
                <Text style={[styles.status, { color: product.prescription_required ? colors.warning : colors.success, backgroundColor: colors.surfaceSecondary }]}>
                  {product.prescription_required ? "Prescription likely" : "Usually no prescription"}
                </Text>
              </View>
              <Text style={[styles.title, { fontSize: 25, lineHeight: 30 }]}>{product.name}</Text>
              <Text style={[styles.muted, { marginTop: 6 }]}>{product.composition || "Composition not listed"}</Text>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
                <View style={styles.statTile}><Icon name="cube-outline" color={colors.brandPrimary} /><Text style={styles.statValue}>{product.form || "Pack"}</Text><Text style={styles.statLabel}>Form</Text></View>
                <View style={styles.statTile}><Icon name="pricetag-outline" color={colors.brandPrimary} /><Text style={styles.statValue}>{product.price === null ? "By offer" : `₹${product.price}`}</Text><Text style={styles.statLabel}>Price</Text></View>
                <View style={styles.statTile}><Icon name="list-outline" color={colors.brandPrimary} /><Text style={styles.statValue}>{product.uses.length || "—"}</Text><Text style={styles.statLabel}>Listed uses</Text></View>
              </View>

              {product.prescription_required && (
                <View style={[styles.rxCard, { marginTop: 18, backgroundColor: colors.accent, boxShadow: "none" }]}>
                  <Icon name="document-text-outline" color={colors.onAccent} size={22} />
                  <Text style={{ flex: 1, marginLeft: 10, color: colors.onAccent, fontSize: 13, lineHeight: 19 }}>A valid prescription is likely required. The pharmacist confirms this before making an offer.</Text>
                </View>
              )}

              {product.uses.length > 0 && (
                <View style={[styles.orderCard, { marginTop: 18 }]}>
                  <Text style={[styles.sectionTitle, { fontSize: 16, marginBottom: 10 }]}>Used for</Text>
                  {product.uses.map((use) => (
                    <View key={use} style={{ flexDirection: "row", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brandPrimary, marginTop: 8 }} />
                      <Text style={[styles.body, { flex: 1 }]}>{use}</Text>
                    </View>
                  ))}
                </View>
              )}
              {product.side_effects.length > 0 && (
                <View style={styles.orderCard}>
                  <Text style={[styles.sectionTitle, { fontSize: 16, marginBottom: 12 }]}>Common side effects</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {product.side_effects.map((effect) => (
                      <Text key={effect} style={{ color: colors.onSurface, backgroundColor: colors.surfaceTertiary, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, fontSize: 12, overflow: "hidden" }}>{effect}</Text>
                    ))}
                  </View>
                </View>
              )}
              <Text style={[styles.caption, { lineHeight: 17, marginTop: 4 }]}>
                Information from a public medicine dataset (Indian medicines, Hugging Face). It is not reviewed by a pharmacist and is not medical advice. Follow your doctor and the pack label.
                {product.prescription_flag_inferred ? " The prescription label is estimated from the ingredients." : ""}
              </Text>
            </View>
          </ScrollView>
          <View style={{ position: "absolute", left: 16, right: 16, bottom: Math.max(insets.bottom, 12) + 4, flexDirection: "row", gap: 10, alignItems: "center", padding: 8, borderRadius: 999, backgroundColor: colors.surfaceSecondary, boxShadow: "0px 14px 30px rgba(15, 30, 46, 0.14)" }}>
            <View style={{ flex: 1, minWidth: 0, paddingLeft: 12 }}>
              <Text style={styles.caption} numberOfLines={1}>Price</Text>
              <Text style={[styles.productName, { fontSize: 16 }]} numberOfLines={1}>{product.price === null ? "In offers" : `₹${product.price}`}</Text>
            </View>
            <Press testID="product-modal-add" style={[styles.primaryButton, { paddingHorizontal: 22 }]} onPress={() => { onAdd(product); onClose(); }}>
              <Icon name="bag-add-outline" color={colors.onBrandPrimary} size={18} />
              <Text style={styles.buttonText}>Add to cart</Text>
            </Press>
          </View>
        </View>
      )}
    </Modal>
  );
}

function CartModal({ open, onClose, cart, setCart, onClearCart, user, activeProfile, deliveryAddress, attachedPrescriptionId, attachedPrescriptionConsent, onSubmitRequest, onUploadPrescription }: { open: boolean; onClose: () => void; cart: CartItem[]; setCart: (c: CartItem[]) => void; onClearCart: () => void; user: User; activeProfile: FamilyMember | null; deliveryAddress: string | null; attachedPrescriptionId: string | null; attachedPrescriptionConsent: boolean; onSubmitRequest: (items: CartItem[], prescriptionId: string | null, shareConsent?: boolean) => Promise<boolean>; onUploadPrescription: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [checkout, setCheckout] = useState(false);
  const [placing, setPlacing] = useState(false);
  const allPriced = cart.every((item) => item.price !== null);
  const subtotal = cart.reduce((sum, item) => sum + (item.price ?? 0) * item.quantity, 0);
  const total = subtotal >= 299 ? subtotal : subtotal + 29;

  const submitRequest = async () => {
    if (cart.some((item) => item.prescription_required) && !attachedPrescriptionId) {
      showAlert("Prescription required", "Attach your prescription before requesting prescription medicines.", [
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
      showAlert("Couldn't send request", err instanceof Error ? err.message : "Please try again.");
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
              {allPriced && cart.length > 0 && <View style={styles.rowBetween}><Text style={styles.body}>Estimated catalog total</Text><Text style={styles.sectionTitle}>₹{total}</Text></View>}
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
                    <MedicineThumb medicine={item} size={48} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
                      <Text style={styles.muted}>{item.price === null ? "Price from pharmacy offer" : `₹${item.price} each`}</Text>
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
  const { width } = useWindowDimensions();
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

  // Search and category filtering run on the server: the catalog has ~11k medicines.
  useEffect(() => {
    if (!token) return;
    let active = true;
    const timer = setTimeout(() => {
      api.medicines(categoryFilter || undefined, search.trim() || undefined, 60)
        .then((next) => { if (active) setMedicines(next); })
        .catch(() => undefined);
    }, search ? 300 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [search, categoryFilter, token]);
  const visibleMedicines = medicines;

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
      showAlert("Couldn't withdraw request", err instanceof Error ? err.message : "Please try again.");
    }
  };

  // Use the picked location's coordinates; otherwise geocode the address (device geocoder, then Photon).
  const resolveCoordinates = async (address: string): Promise<{ latitude?: number; longitude?: number }> => {
    if (location?.latitude !== undefined && location?.longitude !== undefined && location.address === address) {
      return { latitude: location.latitude, longitude: location.longitude };
    }
    if (Platform.OS !== "web") {
      try {
        const [geocoded] = await Location.geocodeAsync(address);
        if (geocoded) return { latitude: geocoded.latitude, longitude: geocoded.longitude };
      } catch { /* fall through to Photon */ }
    }
    try {
      const [match] = await searchAddresses(address);
      if (match) return { latitude: match.latitude, longitude: match.longitude };
    } catch { /* caller asks the customer to pick on the map */ }
    return {};
  };

  const submitMedicineRequest = async (items: CartItem[], prescriptionId?: string | null, prescriptionShareConsent = false, typedNames: string[] = []) => {
    if (prescriptionId && !prescriptionShareConsent) {
      showAlert("Consent required", "Agree to share the prescription with matched pharmacies before sending the request.");
      return false;
    }
    const address = location?.address || user.addresses[0]?.address;
    if (!address) {
      setShowCart(false);
      showAlert("Add a delivery address", "Save an address before requesting offers.", [
        { text: "Not now", style: "cancel" },
        { text: "Open account", onPress: () => setTab("account") },
      ]);
      return false;
    }
    const { latitude, longitude } = await resolveCoordinates(address);
    if (latitude === undefined || longitude === undefined) {
      setShowCart(false);
      showAlert("Location needed", "We couldn't locate that address. Choose your delivery point so pharmacies can estimate the distance.", [
        { text: "Not now", style: "cancel" },
        { text: "Set location", onPress: () => setShowLocation(true) },
      ]);
      return false;
    }
    const created = await api.createMedicineRequest(token, {
      items: [
        ...items.map((item) => ({ medicine_id: item.id, quantity: item.quantity })),
        ...typedNames.map((requested_name) => ({ requested_name, quantity: 1 })),
      ].slice(0, 30),
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
    showAlert("Request sent", created.matched_pharmacy_count
      ? `Sent to ${created.matched_pharmacy_count} accepting ${created.matched_pharmacy_count === 1 ? "pharmacy" : "pharmacies"}. Compare their offers here.`
      : "No verified pharmacies are accepting requests right now.");
    return true;
  };

  const submitCustomMedicineRequest = async (name: string, quantity: number) => {
    const address = location?.address || user.addresses[0]?.address;
    if (!address) {
      setShowCustomRequest(false);
      showAlert("Delivery location needed", "Choose your delivery location before requesting this medicine.", [
        { text: "Not now", style: "cancel" },
        { text: "Set location", onPress: () => setShowLocation(true) },
      ]);
      return;
    }
    const { latitude, longitude } = await resolveCoordinates(address);
    if (latitude === undefined || longitude === undefined) {
      setShowCustomRequest(false);
      showAlert("Location needed", "Choose your delivery point on the map so pharmacies can estimate the distance.", [
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
      showAlert("Request sent", created.matched_pharmacy_count
        ? `Sent to ${created.matched_pharmacy_count} accepting pharmacies. Compare their offers here.`
        : "No verified pharmacies are accepting requests right now.");
    } catch (err) {
      showAlert("Couldn't send request", err instanceof Error ? err.message : "Please try again.");
    }
  };

  const openPrescriptionUpload = (context: "standalone" | "cart" | "refill") => {
    if (!location && !user.addresses[0]?.address) {
      setShowCart(false);
      showAlert("Delivery location needed", "Choose a delivery address before sending a request to pharmacies.", [
        { text: "Not now", style: "cancel" },
        { text: "Set location", onPress: () => setShowLocation(true) },
      ]);
      return;
    }
    setUploadContext(context);
    if (context !== "standalone") setShowCart(false);
    setShowUpload(true);
  };

  const handlePrescriptionUploaded = async (prescriptionId: string, shareConsent: boolean, medicineNames: string[] = []) => {
    setShowUpload(false);
    if (uploadContext === "cart") {
      setAttachedPrescriptionId(prescriptionId);
      setAttachedPrescriptionConsent(shareConsent);
      setShowCart(true);
      showAlert("Prescription attached", "It will be shared with matched pharmacies when you send this request.");
      return;
    }
    try {
      await submitMedicineRequest(uploadContext === "refill" ? cart : [], prescriptionId, shareConsent, uploadContext === "standalone" ? medicineNames : []);
    } catch (err) {
      showAlert("Request could not be sent", err instanceof Error ? err.message : "Please try again.");
    }
  };

  const selectPharmacyOffer = async (request: MedicineRequest, offerId: string) => {
    try {
      const order = await api.selectMedicineOffer(token, request.id, offerId, "cod");
      await refreshOrders();
      setTab("orders");
      showAlert("Pharmacy selected", `Order ${order.order_number} is confirmed. Pay cash on delivery.`);
    } catch (err) {
      showAlert("Couldn't select this offer", err instanceof Error ? err.message : "Please refresh and try again.");
    }
  };

  const openPharmacyDirections = (pharmacy: Pharmacy) => {
    const destination = pharmacy.latitude !== undefined && pharmacy.longitude !== undefined
      ? `${pharmacy.latitude},${pharmacy.longitude}`
      : `${pharmacy.name}, ${pharmacy.area}`;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
    void Linking.openURL(url).catch(() => showAlert("Couldn't open maps", "Please check that a maps app or browser is available."));
  };

  const reorderRefill = async (refill: Refill) => {
    const medicine = medicines.find((item) => item.id === refill.medicine_id) ?? await api.medicine(refill.medicine_id).catch(() => null);
    if (!medicine) {
      showAlert("Medicine unavailable", "This refill is no longer in the shared medicine catalog.");
      return;
    }
    setCart([{ ...medicine, quantity: refill.quantity }]);
    openPrescriptionUpload("refill");
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <TabTransition tabKey={tab}>
        {tab === "home" && (
          <Home user={user} activeRequest={medicineRequests.find((request) => request.status === "collecting_offers") ?? null} categories={categories} pharmacies={pharmacies} medicines={visibleMedicines}
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
            const firstId = order.items[0]?.medicine_id;
            void (async () => {
              const first = firstId ? await api.medicine(firstId).catch(() => null) : null;
              if (first) addToCart(first);
              else showAlert("Not in the catalog", "This medicine is no longer in the catalog. Search for it or send a request by name.");
              setShowCart(true);
            })();
          }} />
        )}
        {tab === "account" && (
          <AccountScreen user={user} onAddresses={() => setShowAddresses(true)} onOrders={() => setTab("orders")} onLogout={logout}
            onFamily={() => setShowFamily(true)} familyCount={family.length} activeProfile={activeProfile}
          />
        )}
      </TabTransition>

      <View style={[styles.navWrap, { bottom: Math.max(insets.bottom, 12) + 4 }]} pointerEvents="box-none">
        <View style={styles.nav}>
          {(
            [
              ["home", "Home", "home"],
              ["categories", "Shop", "grid"],
              ["requests", "Requests", "hourglass"],
              ["chat", "Ask", "chatbubbles"],
              ["orders", "Orders", "receipt"],
              ["account", "Me", "person"],
            ] as [Tab, string, string][]
          ).map(([key, label, icon]) => (
            <NavItem
              key={key}
              testID={`tab-${key}`}
              label={label}
              icon={icon}
              active={tab === key || (key === "requests" && tab === "offers")}
              showLabel={width >= 340}
              pending={key === "requests" && medicineRequests.some((request) => request.status === "collecting_offers")}
              onPress={() => { setTab(key); setCategoryFilter(""); }}
            />
          ))}
        </View>
      </View>

      <ProductModal product={product} onClose={() => setProduct(null)} onAdd={addToCart} />
      <CartModal open={showCart} onClose={() => setShowCart(false)} cart={cart} setCart={setCart} onClearCart={() => { setAttachedPrescriptionId(null); setAttachedPrescriptionConsent(false); }} user={user} activeProfile={activeProfile} deliveryAddress={location?.address ?? user.addresses[0]?.address ?? null} attachedPrescriptionId={attachedPrescriptionId} attachedPrescriptionConsent={attachedPrescriptionConsent} onSubmitRequest={submitMedicineRequest} onUploadPrescription={() => openPrescriptionUpload("cart")} />
      <LocationModal visible={showLocation} onClose={() => setShowLocation(false)} onPick={(loc) => { setLocation(loc); setShowLocation(false); }} current={location} />
      {showCustomRequest && <RequestMedicineModal initialName={customMedicineName} onClose={() => setShowCustomRequest(false)} onSubmit={submitCustomMedicineRequest} />}
      <FamilyModal visible={showFamily} onClose={() => setShowFamily(false)} token={token} activeId={activeProfile?.id ?? null} members={family} onChange={setFamily} onPick={(member) => { setActiveProfile(member); setShowFamily(false); }} />
      {showUpload && <UploadModal token={token} collectMedicines={uploadContext === "standalone"} onClose={() => setShowUpload(false)} onUploaded={(id, consent, names) => void handlePrescriptionUploaded(id, consent, names)} />}
      {showAddresses && (
        <Modal visible animationType="slide" onRequestClose={() => setShowAddresses(false)}>
          <AddressModal token={token} user={user} onDone={() => setShowAddresses(false)} />
        </Modal>
      )}
      {trackOrder && <TrackingModal order={trackOrder} onClose={() => setTrackOrder(null)} />}
    </View>
  );
}
