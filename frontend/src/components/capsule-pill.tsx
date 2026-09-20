import { Ionicons } from "@expo/vector-icons";
import { View, Text } from "react-native";

import { useTheme } from "@/src/theme";

// A playful pill-capsule mark: two halves (teal + mint) with a divider bar and
// a small medical cross badge in the centre. Used as the app logo.
export function CapsulePill({ size = 68 }: { size?: number }) {
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
          shadowColor: colors.brandPrimary,
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.22,
          shadowRadius: 18,
          elevation: 8,
        }}
      >
        <View style={{ flex: 1, backgroundColor: colors.brandPrimary }} />
        <View style={{ width: 3, backgroundColor: colors.surface }} />
        <View style={{ flex: 1, backgroundColor: colors.brandTertiary }} />
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
          shadowColor: colors.onSurface,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
        }}
      >
        <Ionicons name="add" size={size * 0.32} color={colors.brandPrimary} />
      </View>
    </View>
  );
}

export function Wordmark({ size = 30 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <Text style={{ fontSize: size, fontWeight: "900", color: colors.onSurface, letterSpacing: -0.8 }}>
      Just<Text style={{ color: colors.brandPrimary }}>local</Text>
    </Text>
  );
}
