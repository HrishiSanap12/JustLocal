import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { SavedLocation } from "@/src/api";
import { GeocodeResult, reverseGeocode, searchAddresses } from "@/src/geocoding";
import { makeStyles, useTheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";
import { MapLocationPicker } from "./map-location-picker";
import { MapCoordinate } from "./map-location-picker.types";
import { showAlert } from "@/src/alert";

const RECENTS_KEY = "justlocal_location_recents";
const CURRENT_KEY = "justlocal_location_current";
const MAX_RECENTS = 6;

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 20 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14 },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 13, marginBottom: 16 },
  cta: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 18, backgroundColor: colors.brandTertiary, marginBottom: 20 },
  ctaIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  ctaTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  ctaCopy: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  section: { color: colors.onSurface, fontSize: 15, fontWeight: "800", marginTop: 8, marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  rowLabel: { color: colors.onSurface, fontWeight: "800", fontSize: 14 },
  rowAddress: { color: colors.muted, fontSize: 12, marginTop: 2 },
  iconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  input: { height: 52, borderRadius: 16, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, color: colors.onSurface, fontSize: 14, marginBottom: 10 },
  primary: { minHeight: 46, borderRadius: 14, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, flexDirection: "row", gap: 8 },
  primaryText: { color: colors.onBrandPrimary, fontSize: 14, fontWeight: "800" },
  hint: { color: colors.muted, fontSize: 12, marginTop: 10, textAlign: "center" },
  mapHint: { color: colors.muted, fontSize: 12, marginTop: 8 },
}));

function Press({ children, onPress, style, disabled, testID }: { children: React.ReactNode; onPress?: () => void; style?: object; disabled?: boolean; testID?: string }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} testID={testID} style={({ pressed }) => [style, { opacity: disabled ? 0.5 : pressed ? 0.72 : 1 }]}>
      {children}
    </Pressable>
  );
}

export async function loadSavedLocation(): Promise<SavedLocation | null> {
  const raw = await storage.getItem(CURRENT_KEY, "");
  if (!raw) return null;
  try { return JSON.parse(raw) as SavedLocation; } catch { return null; }
}

async function loadRecents(): Promise<SavedLocation[]> {
  const raw = await storage.getItem(RECENTS_KEY, "");
  if (!raw) return [];
  try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

async function saveRecents(recents: SavedLocation[]) {
  await storage.setItem(RECENTS_KEY, JSON.stringify(recents));
}

async function saveCurrent(location: SavedLocation | null) {
  if (location) {
    await storage.setItem(CURRENT_KEY, JSON.stringify(location));
  } else {
    await storage.removeItem(CURRENT_KEY);
  }
}

export function LocationModal({ visible, onClose, onPick, current }: { visible: boolean; onClose: () => void; onPick: (loc: SavedLocation) => void; current: SavedLocation | null }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [recents, setRecents] = useState<SavedLocation[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [manual, setManual] = useState("");
  const [mapPoint, setMapPoint] = useState<MapCoordinate | null>(null);
  const [pointLabel, setPointLabel] = useState("");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    const term = query.trim();
    if (term.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      searchAddresses(term, mapPoint ?? (current?.latitude !== undefined && current.longitude !== undefined ? { latitude: current.latitude, longitude: current.longitude } : null), controller.signal)
        .then((results) => { setSuggestions(results); setSearchError(results.length ? "" : "No matching places found."); })
        .catch((err) => { if (!controller.signal.aborted) setSearchError(err instanceof Error ? err.message : "Search failed"); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 400);
    return () => { controller.abort(); clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Reset the form each time the picker opens.
  const handleShow = () => {
    void loadRecents().then(setRecents);
    setManual(current?.address ?? "");
    setPointLabel(current?.label ?? "");
    setQuery("");
    setSuggestions([]);
    setSearchError("");
    setMapPoint(current?.latitude !== undefined && current.longitude !== undefined
      ? { latitude: current.latitude, longitude: current.longitude }
      : null);
  };

  const changeQuery = (value: string) => {
    setQuery(value);
    if (value.trim().length < 3) { setSuggestions([]); setSearchError(""); }
  };

  const persistPick = async (loc: SavedLocation) => {
    const next = [loc, ...recents.filter((r) => r.address !== loc.address)].slice(0, MAX_RECENTS);
    setRecents(next);
    setMapPoint(loc.latitude !== undefined && loc.longitude !== undefined
      ? { latitude: loc.latitude, longitude: loc.longitude }
      : null);
    setManual(loc.address);
    await saveRecents(next);
    await saveCurrent(loc);
    onPick(loc);
  };

  const detect = async () => {
    setDetecting(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        if (!permission.canAskAgain) {
          showAlert(
            "Location access needed",
            "Enable location for Justlocal in your device settings to use precise delivery.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() },
            ],
          );
        } else {
          showAlert("Location permission needed", "We need location access to find your delivery point.");
        }
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [place] = await Location.reverseGeocodeAsync({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      const label = [place?.name, place?.street].filter(Boolean).join(", ") || place?.district || "Current location";
      const address = [place?.street, place?.district, place?.city, place?.region, place?.postalCode].filter(Boolean).join(", ") || `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
      await persistPick({
        id: `loc-${Date.now()}`, label, address,
        latitude: position.coords.latitude, longitude: position.coords.longitude, savedAt: Date.now(),
      });
    } catch (err) {
      showAlert("Couldn't detect location", err instanceof Error ? err.message : "Please try again or type an address.");
    } finally {
      setDetecting(false);
    }
  };

  // Coordinates are required: typed text alone is not a location.
  const saveManual = async () => {
    if (!mapPoint) {
      showAlert("Pick a place", "Choose a search result or tap the map so pharmacies know where you are.");
      return;
    }
    const address = manual.trim() || `Pinned map location (${mapPoint.latitude.toFixed(5)}, ${mapPoint.longitude.toFixed(5)})`;
    await persistPick({
      id: `loc-${Date.now()}`,
      label: pointLabel || "Pinned delivery location",
      address,
      latitude: mapPoint.latitude,
      longitude: mapPoint.longitude,
      savedAt: Date.now(),
    });
  };

  const chooseSuggestion = (result: GeocodeResult) => {
    setMapPoint({ latitude: result.latitude, longitude: result.longitude });
    setManual(result.address);
    setPointLabel(result.label);
    setQuery("");
    setSuggestions([]);
  };

  const selectMapPoint = async (point: MapCoordinate) => {
    setMapPoint(point);
    setPointLabel("Pinned delivery location");
    setManual(`Pinned map location (${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)})`);
    if (Platform.OS !== "web") {
      try {
        const [place] = await Location.reverseGeocodeAsync(point);
        const address = [place?.name, place?.street, place?.district, place?.city, place?.region, place?.postalCode].filter(Boolean).join(", ");
        if (address) { setManual(address); return; }
      } catch { /* fall back to Photon */ }
    }
    try {
      const place = await reverseGeocode(point.latitude, point.longitude);
      if (place) { setManual(place.address); setPointLabel(place.label); }
    } catch {
      // The address can still be typed if reverse geocoding is unavailable.
    }
  };

  const remove = async (id: string) => {
    const next = recents.filter((r) => r.id !== id);
    setRecents(next);
    await saveRecents(next);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} onShow={handleShow}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Press testID="location-modal-close" onPress={onClose} style={styles.iconButton}><Ionicons name="close" size={22} color={colors.onSurface} /></Press>
          <Text style={styles.title}>Choose location</Text>
          <View style={{ width: 44 }} />
        </View>
        <Text style={styles.subtitle}>Set your delivery point to see nearby pharmacies and accurate ETAs.</Text>

        <Press testID="location-detect" style={styles.cta} onPress={detect} disabled={detecting}>
          <View style={styles.ctaIcon}>{detecting ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Ionicons name="navigate" size={20} color={colors.onBrandPrimary} />}</View>
          <View style={{ flex: 1 }}>
            <Text style={styles.ctaTitle}>Use current location</Text>
            <Text style={styles.ctaCopy}>{Platform.OS === "web" ? "Uses your browser's location" : "We'll request device location once"}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.onSurface} />
        </Press>

        {current && (
          <>
            <Text style={styles.section}>Current</Text>
            <View style={styles.row}>
              <View style={styles.rowIcon}><Ionicons name="location" size={18} color={colors.brandPrimary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{current.label}</Text>
                <Text style={styles.rowAddress}>{current.address}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            </View>
          </>
        )}

        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={styles.section}>Search for a place</Text>
          <TextInput
            testID="location-search-input"
            style={styles.input}
            value={query}
            onChangeText={changeQuery}
            placeholder="Area, street, landmark…"
            placeholderTextColor={colors.muted}
            autoCorrect={false}
          />
          {searching && <ActivityIndicator color={colors.brandPrimary} style={{ marginBottom: 8 }} />}
          {searchError ? <Text style={styles.mapHint}>{searchError}</Text> : null}
          {suggestions.map((result, index) => (
            <Press key={`${result.latitude}-${result.longitude}-${index}`} testID={`location-suggestion-${index}`} style={styles.row} onPress={() => chooseSuggestion(result)}>
              <View style={styles.rowIcon}><Ionicons name="search" size={16} color={colors.brandPrimary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{result.label}</Text>
                <Text style={styles.rowAddress} numberOfLines={2}>{result.address}</Text>
              </View>
            </Press>
          ))}
          <Text style={styles.section}>Or choose on map</Text>
          <MapLocationPicker selected={mapPoint} onSelect={(point) => void selectMapPoint(point)} />
          <Text style={styles.mapHint}>{mapPoint ? "Pin selected. Add or adjust the delivery address below." : "Tap the map to place a pin at your delivery point."}</Text>
          <Text style={styles.section}>Delivery address</Text>
          <TextInput
            testID="location-manual-input"
            style={styles.input}
            value={manual}
            onChangeText={setManual}
            placeholder={mapPoint ? "Flat, building, street, area…" : "Search or tap the map first"}
            editable={Boolean(mapPoint)}
            placeholderTextColor={colors.muted}
            returnKeyType="done"
            onSubmitEditing={saveManual}
          />
          <Press testID="location-manual-save" style={styles.primary} onPress={saveManual} disabled={!mapPoint}>
            <Text style={styles.primaryText}>{mapPoint ? "Save this location" : "Pick a place first"}</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.onBrandPrimary} />
          </Press>
          <Text style={styles.hint}>The pin supplies the coordinates; add your flat or building so the pharmacy can find your door. Address search uses OpenStreetMap (Photon).</Text>
          {recents.length > 0 && <Text style={styles.section}>Saved & recent</Text>}
          {recents.map((item) => (
            <View key={item.id} style={styles.row}>
              <Press style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }} onPress={() => persistPick(item)}>
                <View style={styles.rowIcon}><Ionicons name="time-outline" size={18} color={colors.brandPrimary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  <Text style={styles.rowAddress} numberOfLines={1}>{item.address}</Text>
                </View>
              </Press>
              <Press onPress={() => remove(item.id)}><Ionicons name="close-circle" size={20} color={colors.muted} /></Press>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

export const LocationIcon: IconName = "location";
