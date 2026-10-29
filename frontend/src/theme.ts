// Design tokens for this app. Light theme only.Always modify the colors and theme to Dark, Light or Dark and Light according to the design guidelines.
//
// The keys match the "color" block of /app/design_guidelines.json. Fill the
// values from that file (or from the user's brand colors). Keep every key; do
// not add a second theme or colors file; do not write color literals in
// components.
//
// How the names work: a plain key is a background, and its `on` partner is the
// text or icon color that sits on top of it. Always use them as a pair.
//   <View style={{ backgroundColor: colors.brandPrimary }}>
//     <Text style={{ color: colors.onBrandPrimary }}>Continue</Text>
//   </View>
//
// Styling a screen or component: build the sheet with makeStyles so colors
// and layout live together and follow the active scheme:
//   const useStyles = makeStyles((colors) => ({
//     card: { backgroundColor: colors.surfaceSecondary, padding: 16 },
//     title: { color: colors.onSurfaceSecondary, fontSize: 16 },
//   }));
//   function Screen() {
//     const styles = useStyles();
//     return <View style={styles.card}><Text style={styles.title}>Hi</Text></View>;
//   }
// For color props that are not styles (icon color, placeholderTextColor,
// ActivityIndicator) read useTheme().colors inside the component.
// Never call StyleSheet.create with color values at module level; it cannot
// follow the scheme.
//
// To support dark mode later: add `dark` to `themes` with every key filled.
// Nothing else changes; the device setting takes over automatically.
// Feel free to add as many new colors as you need to support the design guidelines.

import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  // Surfaces
  surface: "#F2F6F5", // app canvas (soft mint grey)
  onSurface: "#0F1E2E", // primary text
  surfaceSecondary: "#FFFFFF", // cards, sheets, list rows
  onSurfaceSecondary: "#3B4A5C", // body text on cards
  surfaceTertiary: "#E6EFED", // inputs, chips, nested fills
  onSurfaceTertiary: "#0F1E2E",
  surfaceInverse: "#0F1E2E",
  onSurfaceInverse: "#FFFFFF",
  muted: "#7A8797", // captions, placeholders

  // Brand (deep teal)
  brand: "#0E8F7E",
  onBrand: "#FFFFFF",
  brandPrimary: "#0E8F7E", // primary CTA, active states
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#0A5F55", // darker teal: gradients, floating nav
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#D7F0EA", // soft teal chips and icon wells
  onBrandTertiary: "#0A5F55",
  accent: "#E3F98E", // lime highlight (badges like "Available")
  onAccent: "#2F3A06",

  // Status
  success: "#16A34A",
  onSuccess: "#FFFFFF",
  warning: "#E08A00",
  onWarning: "#FFFFFF",
  error: "#E5484D",
  onError: "#FFFFFF",
  info: "#3E63DD",
  onInfo: "#FFFFFF",

  // Lines
  border: "#E3EAE8",
  borderStrong: "#0E8F7E",
  divider: "#EDF2F1",

  // Elevation (CSS box-shadow strings, supported on native and web)
  shadowSoft: "0px 6px 18px rgba(15, 30, 46, 0.06)",
  shadowLift: "0px 14px 30px rgba(10, 95, 85, 0.22)",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

// In-app theme toggle, only after `dark` exists in `themes`. Call
// setColorScheme("dark"), setColorScheme("light"), or setColorScheme(null) to
// follow the device. Every useTheme() consumer re-renders. Persisting the
// choice and re-applying it on launch is the toggle's job.
export function setColorScheme(scheme: ColorScheme | null) {
  // RN 0.86 re-reads the device scheme only for the literal "unspecified";
  // null would pin useColorScheme() to null and the app to light.
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

// Keep native surfaces (alerts, pickers, navigation chrome) on the schemes this
// app ships: light only forces light; once `dark` exists the device decides.
// Optional call because react-native-web does not implement it.
setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system === "dark" && themes.dark ? "dark" : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

// Themed StyleSheet: returns a hook that builds the sheet from the active
// scheme's colors and memoizes it until the scheme changes.
export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}


