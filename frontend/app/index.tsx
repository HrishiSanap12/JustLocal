import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import * as AppleAuthentication from "expo-apple-authentication";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Address, api, CartItem, Category, Medicine, Offer, Order, Pharmacy, User } from "@/src/api";
import { CapsulePill, Wordmark } from "@/src/components/capsule-pill";
import { extractSessionId, signInWithApple, signInWithGoogle } from "@/src/auth-helpers";
import { makeStyles, useTheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
type Tab = "home" | "categories" | "orders" | "offers" | "account";

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
  authCard: { marginHorizontal: 18, marginTop: -18, borderRadius: 26, backgroundColor: colors.surface, padding: 22, shadowColor: colors.onSurface, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.09, shadowRadius: 24, elevation: 8 },
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
  authPrimary: { minHeight: 52, borderRadius: 16, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 18, shadowColor: colors.brandPrimary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.24, shadowRadius: 16, elevation: 4 },
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

function Press({ children, onPress, style, disabled = false, testID }: { children: React.ReactNode; onPress?: () => void; style?: object; disabled?: boolean; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [style, { opacity: disabled ? 0.45 : pressed ? 0.72 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      {children}
    </Pressable>
  );
}

// ----------------- AUTH SCREEN -----------------
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
  const [error, setError] = useState("");
  const [appleAvailable, setAppleAvailable] = useState(false);

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
        await storage.secureSet("justlocal_token", session_token);
        onAuth(session_token, user);
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
      await storage.secureSet("justlocal_token", result.token);
      onAuth(result.token, result.user);
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
      await storage.secureSet("justlocal_token", session_token);
      onAuth(session_token, user);
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
      await storage.secureSet("justlocal_token", token);
      onAuth(token, user);
    } catch (err) {
      if ((err as { code?: string })?.code === "ERR_REQUEST_CANCELED") return;
      setError(err instanceof Error ? err.message : "Apple sign-in failed");
    } finally {
      setSocialLoading(null);
    }
  };

  const InputField = ({ icon, ...rest }: { icon: IconName } & React.ComponentProps<typeof TextInput>) => {
    const [focused, setFocused] = useState(false);
    return (
      <View style={[styles.inputWrap, focused && styles.inputWrapFocus]}>
        <Icon name={icon} size={18} color={focused ? colors.brandPrimary : colors.muted} />
        <TextInput
          {...rest}
          style={styles.inputField}
          placeholderTextColor={colors.muted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </View>
    );
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
function PharmacyCard({ pharmacy }: { pharmacy: Pharmacy }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.pharmacyCard}>
      <Text style={styles.pharmacyBadge}>{pharmacy.eta}</Text>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={styles.pharmacyLogo}><Icon name="medical" color={colors.onBrandPrimary} size={20} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.pharmacyName} numberOfLines={1}>{pharmacy.name}</Text>
          <Text style={styles.pharmacyMeta}>★ {pharmacy.rating} ({pharmacy.reviews})</Text>
          <Text style={styles.pharmacyMeta}>{pharmacy.area} · {pharmacy.distance}</Text>
        </View>
      </View>
      <Text style={styles.freeDelivery}>✓ Free delivery above ₹{pharmacy.threshold}</Text>
    </View>
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
function Home({ categories, pharmacies, offers, medicines, onTab, onPrescription, onCategory, onProduct, onAdd, onCart, search, setSearch, cartCount }: {
  categories: Category[]; pharmacies: Pharmacy[]; offers: Offer[]; medicines: Medicine[]; onTab: (t: Tab) => void;
  onPrescription: () => void; onCategory: (c: string) => void; onProduct: (m: Medicine) => void; onAdd: (m: Medicine) => void;
  onCart: () => void; search: string; setSearch: (v: string) => void; cartCount: number;
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

      <Press style={styles.locationRow} onPress={() => Alert.alert("Location", "Using your current location for nearby pharmacy results.")}>
        <Icon name="location" size={20} color={colors.brandPrimary} />
        <View>
          <Text style={{ color: colors.onSurface, fontSize: 14, fontWeight: "800" }}>Mumbai  <Icon name="chevron-down" size={14} color={colors.onSurface} /></Text>
          <Text style={styles.muted}>Hiranandani Estate, Thane (W)</Text>
        </View>
      </Press>

      <View style={styles.search}>
        <Icon name="search" color={colors.muted} />
        <TextInput style={styles.searchInput} placeholder="Search medicines, healthcare products…" placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} />
        <Icon name="mic-outline" color={colors.brandPrimary} />
      </View>

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

      <View style={styles.quickGrid}>
        {[["repeat", "Order again", () => onTab("orders")], ["storefront-outline", "Nearby stores", () => onTab("home")], ["pricetag-outline", "Offers", () => onTab("offers")], ["medkit-outline", "Health products", () => onTab("categories")]].map(([icon, label, action]) => (
          <Press key={label as string} style={styles.quickItem} onPress={action as () => void}>
            <View style={styles.quickIcon}><Icon name={icon as IconName} color={colors.brandPrimary} size={22} /></View>
            <Text style={styles.quickLabel}>{label as string}</Text>
          </Press>
        ))}
      </View>

      {offers[0] && (
        <Press style={styles.promo} onPress={() => onTab("offers")}>
          <LinearGradient colors={[colors.surfaceTertiary, colors.brandTertiary]} style={styles.promoInner}>
            <Text style={styles.promoTitle}>{offers[0].title}</Text>
            <Text style={styles.promoCopy}>{offers[0].subtitle} · Use code {offers[0].code}</Text>
          </LinearGradient>
        </Press>
      )}

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
        <Text style={styles.link}>See all →</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pharmacyRow}>
        {pharmacies.map((pharmacy) => <PharmacyCard key={pharmacy.id} pharmacy={pharmacy} />)}
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

function CategoriesScreen({ categories, medicines, onProduct, onAdd, onCategory }: { categories: Category[]; medicines: Medicine[]; onProduct: (m: Medicine) => void; onAdd: (m: Medicine) => void; onCategory: (c: string) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [search, setSearch] = useState("");
  const filtered = categories.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>Categories</Text>
      <Text style={[styles.body, { marginTop: 5, marginBottom: 16 }]}>Find everyday care from nearby stores.</Text>
      <View style={styles.search}>
        <Icon name="search" color={colors.muted} />
        <TextInput style={styles.searchInput} placeholder="Search medicines or categories" placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} />
      </View>
      <LinearGradient colors={[colors.brandTertiary, colors.surfaceTertiary]} style={[styles.promo, { padding: 18 }]}>
        <Text style={styles.heroTitle}>Healthier you, everyday</Text>
        <Text style={styles.body}>Wide range of medicines and healthcare products.</Text>
      </LinearGradient>
      <Text style={[styles.sectionTitle, { marginBottom: 14 }]}>Browse all categories</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
        {filtered.map((category) => (
          <Press key={category.id} style={{ width: "31%", alignItems: "center", marginBottom: 22, gap: 7 }} onPress={() => onCategory(category.name)}>
            <View style={[styles.categoryIcon, { width: 62, height: 62 }]}><Icon name={category.icon as IconName} color={colors.brandPrimary} size={25} /></View>
            <Text style={styles.categoryName}>{category.name}</Text>
            <Text style={styles.caption}>{category.count} items</Text>
          </Press>
        ))}
      </View>
      <Text style={[styles.sectionTitle, { marginTop: 8, marginBottom: 13 }]}>Popular products</Text>
      {medicines.slice(0, 6).map((medicine) => <ProductCard key={medicine.id} medicine={medicine} onAdd={onAdd} onDetails={onProduct} />)}
    </ScrollView>
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

function OffersScreen({ offers }: { offers: Offer[] }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>Offers & deals</Text>
      <Text style={[styles.body, { marginTop: 5, marginBottom: 18 }]}>Save more on your everyday health.</Text>
      {offers.map((offer, index) => (
        <Press key={offer.id} style={styles.offerCard} onPress={() => Alert.alert(offer.code, offer.detail)}>
          <LinearGradient
            colors={index === 0 ? [colors.brandTertiary, colors.surfaceTertiary] : index === 1 ? [colors.surfaceTertiary, colors.surfaceSecondary] : [colors.brandTertiary, colors.surfaceSecondary]}
            style={styles.offerInner}
          >
            <View>
              <Text style={styles.offerTitle}>{offer.title}</Text>
              <Text style={styles.body}>{offer.subtitle}</Text>
            </View>
            <Text style={styles.code}>Use code: {offer.code}</Text>
          </LinearGradient>
        </Press>
      ))}
    </ScrollView>
  );
}

function AccountScreen({ user, onAddresses, onLogout, onOrders }: { user: User; onAddresses: () => void; onLogout: () => void; onOrders: () => void }) {
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
        ["receipt-outline", "My orders", onOrders],
        ["location-outline", "My addresses", onAddresses],
        ["card-outline", "Payment methods", () => Alert.alert("Payment methods", "Online payments via Razorpay will be enabled once merchant keys are added.")],
        ["document-text-outline", "Prescriptions", () => Alert.alert("Prescriptions", "Your pharmacist-reviewed prescriptions will appear here.")],
        ["help-circle-outline", "Help & support", () => Alert.alert("Support", "Our local care team is here to help.")],
        ["information-circle-outline", "About Justlocal", () => Alert.alert("Justlocal", "Medicines closer to you.")],
      ].map(([icon, label, action]) => (
        <Press key={label as string} style={{ minHeight: 54, borderBottomWidth: 1, borderBottomColor: colors.divider, flexDirection: "row", alignItems: "center", gap: 13 }} onPress={action as () => void}>
          <View style={styles.iconButton}><Icon name={icon as IconName} size={18} color={colors.brandPrimary} /></View>
          <Text style={{ color: colors.onSurface, fontSize: 14, fontWeight: "700", flex: 1 }}>{label as string}</Text>
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

function UploadModal({ token, onClose }: { token: string; onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [uri, setUri] = useState("");
  const [name, setName] = useState("");
  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.75 });
    if (!result.canceled) { setUri(result.assets[0].uri); setName(result.assets[0].fileName ?? "prescription.jpg"); }
  };
  const upload = async () => {
    if (!uri) return;
    try {
      await api.uploadPrescription(token, uri, name);
      Alert.alert("Prescription uploaded", "A pharmacist will review it before fulfillment.");
      onClose();
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
          <Text style={styles.body}>Upload a clear image. A pharmacist will verify it before any prescription medicine is fulfilled.</Text>
          <Press style={[styles.rxCard, { marginTop: 20, justifyContent: "center" }]} onPress={pick}>
            <Icon name="image-outline" color={colors.brandPrimary} size={24} />
            <Text style={[styles.body, { marginLeft: 10 }]}>{name || "Choose an image from your phone"}</Text>
          </Press>
          <Press style={[styles.primaryButton, { marginTop: 24 }]} onPress={upload} disabled={!uri}>
            <Text style={styles.buttonText}>Send for review</Text>
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

// ----------------- CART & CHECKOUT -----------------
async function payWithRazorpayWeb(checkout: { key_id: string; razorpay_order_id: string; amount: number; currency: string; customer: { name?: string | null; email?: string | null; phone?: string | null } }) {
  return new Promise<{ razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string } | null>((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("Razorpay web is only available in browser"));
    const load = () => new Promise<void>((res, rej) => {
      if ((window as unknown as { Razorpay?: unknown }).Razorpay) return res();
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => res();
      script.onerror = () => rej(new Error("Failed to load Razorpay"));
      document.body.appendChild(script);
    });
    load().then(() => {
      const options = {
        key: checkout.key_id,
        order_id: checkout.razorpay_order_id,
        amount: checkout.amount,
        currency: checkout.currency,
        name: "Justlocal",
        description: "Medicine order",
        prefill: { name: checkout.customer.name ?? "", email: checkout.customer.email ?? "", contact: checkout.customer.phone ?? "" },
        theme: { color: "#0D9488" },
        handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => resolve(response),
        modal: { ondismiss: () => resolve(null) },
      };
      // @ts-expect-error - global Razorpay is injected by the script
      const rzp = new window.Razorpay(options);
      rzp.open();
    }).catch(reject);
  });
}

function CartModal({ open, onClose, cart, setCart, user, token, refreshOrders }: { open: boolean; onClose: () => void; cart: CartItem[]; setCart: (c: CartItem[]) => void; user: User; token: string; refreshOrders: () => Promise<void> }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [checkout, setCheckout] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "razorpay">("cod");
  const [razorpayReady, setRazorpayReady] = useState(false);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = subtotal >= 299 ? subtotal : subtotal + 29;

  useEffect(() => {
    if (!open) return;
    api.razorpayConfig().then((c) => setRazorpayReady(c.ready)).catch(() => setRazorpayReady(false));
  }, [open]);

  const placeOrder = async () => {
    const address = user.addresses[0];
    if (!address) { Alert.alert("Add an address", "Please add a delivery address from Account before checkout."); return; }
    setPlacing(true);
    try {
      const order = await api.createOrder(token, {
        pharmacy_id: "pharmacy-1",
        items: cart.map((item) => ({ medicine_id: item.id, name: item.name, quantity: item.quantity, price: item.price })),
        address: address.address, delivery_method: "delivery", subtotal, discount: 0,
        delivery_fee: subtotal >= 299 ? 0 : 29, total,
      });

      if (paymentMethod === "razorpay") {
        if (!razorpayReady) {
          Alert.alert("Online payment unavailable", "Razorpay isn't configured yet. Your order was placed as Cash on Delivery.");
        } else if (Platform.OS !== "web") {
          Alert.alert("Native build required", "Razorpay checkout runs in a dev build. Your order was placed as Cash on Delivery for now.");
        } else {
          const checkoutData = await api.razorpayOrder(token, order.id);
          const result = await payWithRazorpayWeb(checkoutData);
          if (!result) {
            Alert.alert("Payment cancelled", "Your order is still saved as Cash on Delivery. Retry from Orders.");
          } else {
            await api.razorpayVerify(token, { order_id: order.id, ...result });
            Alert.alert("Payment successful", "Your Justlocal order is confirmed.");
          }
        }
      } else {
        Alert.alert("Order placed", "Your local pharmacy has received the order.");
      }

      setCart([]);
      await refreshOrders();
      setCheckout(false);
      onClose();
    } catch (err) {
      Alert.alert("Couldn't place order", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setPlacing(false);
    }
  };

  const PaymentRow = ({ id, title, subtitle, icon }: { id: "cod" | "razorpay"; title: string; subtitle: string; icon: IconName }) => {
    const selected = paymentMethod === id;
    const disabled = id === "razorpay" && !razorpayReady;
    return (
      <Press
        testID={`payment-${id}`}
        style={[styles.addressCard, { flexDirection: "row", alignItems: "center", gap: 12, borderColor: selected ? colors.brandPrimary : colors.border, opacity: disabled ? 0.55 : 1 }]}
        onPress={() => !disabled && setPaymentMethod(id)}
        disabled={disabled}
      >
        <View style={[styles.categoryIcon, { width: 44, height: 44, borderRadius: 14 }]}><Icon name={icon} color={colors.brandPrimary} size={22} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.productName}>{title}</Text>
          <Text style={styles.muted}>{subtitle}</Text>
        </View>
        <View style={[styles.radio, selected && styles.radioActive]}>{selected && <View style={styles.radioDot} />}</View>
      </Press>
    );
  };

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modal, { paddingTop: 46 }]}>
        <View style={styles.modalHeader}>
          <Press onPress={onClose} style={styles.iconButton}><Icon name="arrow-back" /></Press>
          <Text style={styles.modalTitle}>{checkout ? "Checkout" : "Your cart"}</Text>
          <Text style={styles.muted}>{cart.length} items</Text>
        </View>
        {checkout ? (
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            <Text style={styles.sectionTitle}>Delivery address</Text>
            {user.addresses.length ? (
              <View style={[styles.addressCard, { marginTop: 12 }]}>
                <Text style={styles.productName}>{user.addresses[0].label}</Text>
                <Text style={[styles.body, { marginTop: 5 }]}>{user.addresses[0].address}</Text>
              </View>
            ) : <Empty icon="location-outline" title="Add an address first" copy="Save a delivery address from Account." />}

            <Text style={[styles.sectionTitle, { marginTop: 22, marginBottom: 12 }]}>Fulfilling pharmacy</Text>
            <View style={styles.addressCard}>
              <Text style={styles.productName}>Apollo Pharmacy</Text>
              <Text style={[styles.body, { marginTop: 5 }]}>Hiranandani Estate · 10–15 min</Text>
              <Text style={styles.freeDelivery}>✓ Free delivery above ₹299</Text>
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 22, marginBottom: 12 }]}>Payment method</Text>
            <PaymentRow id="cod" title="Cash on delivery" subtitle="Pay the delivery partner in cash" icon="cash-outline" />
            <PaymentRow id="razorpay" title={razorpayReady ? "Pay online (Razorpay)" : "Online payment (setup pending)"} subtitle={razorpayReady ? "UPI, cards, wallets, netbanking" : "Add Razorpay keys to enable this"} icon="card-outline" />

            <View style={styles.summary}>
              <View style={styles.rowBetween}><Text style={styles.body}>Order total</Text><Text style={styles.sectionTitle}>₹{total}</Text></View>
            </View>
            <Press testID="place-order-button" style={[styles.primaryButton, { marginTop: 18 }]} onPress={placeOrder} disabled={placing}>
              {placing ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.buttonText}>Place order</Text>}
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
  const [offers, setOffers] = useState<Offer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [product, setProduct] = useState<Medicine | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [showAddresses, setShowAddresses] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [trackOrder, setTrackOrder] = useState<Order | null>(null);

  const loadData = async (authToken: string) => {
    const [cats, meds, stores, deals, userOrders] = await Promise.all([
      api.categories(), api.medicines(), api.pharmacies(), api.offers(), api.orders(authToken),
    ]);
    setCategories(cats); setMedicines(meds); setPharmacies(stores); setOffers(deals); setOrders(userOrders);
  };

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

  const visibleMedicines = useMemo(
    () => medicines.filter((item) => (!categoryFilter || item.category === categoryFilter) && (!search || item.name.toLowerCase().includes(search.toLowerCase()) || item.category.toLowerCase().includes(search.toLowerCase()))),
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

  const refreshOrders = async () => setOrders(await api.orders(token));

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.content}>
        {tab === "home" && (
          <Home categories={categories} pharmacies={pharmacies} offers={offers} medicines={visibleMedicines}
            onTab={setTab}
            onPrescription={() => setShowUpload(true)}
            onCategory={(category) => { setCategoryFilter(category); setTab("categories"); }}
            onProduct={setProduct}
            onAdd={addToCart}
            onCart={() => setShowCart(true)}
            cartCount={cart.reduce((sum, item) => sum + item.quantity, 0)}
            search={search} setSearch={setSearch}
          />
        )}
        {tab === "categories" && (
          <CategoriesScreen categories={categories} medicines={visibleMedicines} onProduct={setProduct} onAdd={addToCart} onCategory={setCategoryFilter} />
        )}
        {tab === "orders" && (
          <OrdersScreen orders={orders} onTrack={setTrackOrder} onReorder={(order) => {
            const first = medicines.find((item) => item.name === order.items[0]?.name);
            if (first) addToCart(first);
            setShowCart(true);
          }} />
        )}
        {tab === "offers" && <OffersScreen offers={offers} />}
        {tab === "account" && (
          <AccountScreen user={user} onAddresses={() => setShowAddresses(true)} onOrders={() => setTab("orders")} onLogout={logout} />
        )}
      </View>

      <View style={styles.nav}>
        {(
          [
            ["home", "Home", "home-outline"],
            ["categories", "Categories", "grid-outline"],
            ["orders", "Orders", "receipt-outline"],
            ["offers", "Offers", "pricetag-outline"],
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
      <CartModal open={showCart} onClose={() => setShowCart(false)} cart={cart} setCart={setCart} user={user} token={token} refreshOrders={refreshOrders} />
      {showUpload && <UploadModal token={token} onClose={() => setShowUpload(false)} />}
      {showAddresses && (
        <Modal visible animationType="slide" onRequestClose={() => setShowAddresses(false)}>
          <AddressModal token={token} user={user} onDone={() => setShowAddresses(false)} />
        </Modal>
      )}
      {trackOrder && <TrackingModal order={trackOrder} onClose={() => setTrackOrder(null)} />}
    </View>
  );
}
