import { Ionicons } from "@expo/vector-icons";
import { View, Text } from "react-native";

import { useTheme } from "@/src/theme";

// A playful pill-capsule mark: two halves (teal + mint) with a divider bar and
// a small medical cross badge in the centre. Used as the app logo.
export function CapsulePill({ size = 68, inverse = false }: { size?: number; inverse?: boolean }) {
  const { colors } = useTheme();
  const width = size * 1.72;
  const height = size;
  const radius = size / 2;
  return (
    <View style={{ width, height, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width,
          height,
          borderRadius: radius,
          flexDirection: "row",
          overflow: "hidden",
          transform: [{ rotate: "-24deg" }],
          boxShadow: "0px 10px 18px rgba(13, 148, 136, 0.22)",
        }}
      >
        <View style={{ flex: 1, backgroundColor: inverse ? colors.surfaceSecondary : colors.brandPrimary }} />
        <View style={{ width: 3, backgroundColor: inverse ? colors.brandSecondary : colors.surface }} />
        <View style={{ flex: 1, backgroundColor: inverse ? colors.accent : colors.brandTertiary }} />
      </View>
      <View
        style={{
          position: "absolute",
          width: size * 0.52,
          height: size * 0.52,
          borderRadius: size,
          backgroundColor: colors.surface,
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0px 4px 8px rgba(11, 37, 69, 0.08)",
        }}
      >
        <Ionicons name="add" size={size * 0.32} color={colors.brandPrimary} />
      </View>
    </View>
  );
}

export function Wordmark({ size = 30, inverse = false }: { size?: number; inverse?: boolean }) {
  const { colors } = useTheme();
  return (
    <Text style={{ fontSize: size, fontWeight: "900", color: inverse ? colors.onBrandPrimary : colors.onSurface, letterSpacing: -0.8 }}>
      Just<Text style={{ color: inverse ? colors.accent : colors.brandPrimary }}>local</Text>
    </Text>
  );
}
