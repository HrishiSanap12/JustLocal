import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { api, FamilyMember } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";

const RELATIONS: { value: string; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { value: "self", label: "Myself", icon: "person" },
  { value: "spouse", label: "Spouse", icon: "heart" },
  { value: "parent", label: "Parent", icon: "man" },
  { value: "child", label: "Child", icon: "happy" },
  { value: "sibling", label: "Sibling", icon: "people" },
  { value: "other", label: "Other", icon: "person-add" },
];

const useStyles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 20 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14 },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 13, marginBottom: 16 },
  iconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  cardActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.onBrandPrimary, fontWeight: "900", fontSize: 16 },
  cardName: { color: colors.onSurface, fontSize: 14, fontWeight: "800" },
  cardMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  addTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "800", marginTop: 18, marginBottom: 12 },
  input: { height: 50, borderRadius: 14, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, color: colors.onSurface, fontSize: 14, marginBottom: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 36, borderRadius: 18, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: colors.onBrandPrimary },
  primary: { minHeight: 46, borderRadius: 14, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, flexDirection: "row", gap: 8 },
  primaryText: { color: colors.onBrandPrimary, fontSize: 14, fontWeight: "800" },
  removeBtn: { padding: 8 },
}));

function Press({ children, onPress, style, disabled, testID }: { children: React.ReactNode; onPress?: () => void; style?: object; disabled?: boolean; testID?: string }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} testID={testID} style={({ pressed }) => [style, { opacity: disabled ? 0.5 : pressed ? 0.72 : 1 }]}>
      {children}
    </Pressable>
  );
}

export function FamilyModal({ visible, onClose, token, activeId, members, onChange, onPick }: {
  visible: boolean; onClose: () => void; token: string; activeId: string | null;
  members: FamilyMember[]; onChange: (members: FamilyMember[]) => void; onPick: (member: FamilyMember | null) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("child");
  const [age, setAge] = useState("");
  const [allergies, setAllergies] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    api.listFamily(token).then(onChange).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const save = async () => {
    if (!name.trim()) { Alert.alert("Add a name", "Please give this profile a name."); return; }
    setSaving(true);
    try {
      const parsedAge = age.trim() ? Number(age) : undefined;
      const added = await api.addFamily(token, { name: name.trim(), relation, age: Number.isFinite(parsedAge) ? parsedAge : undefined, allergies: allergies.trim() || undefined });
      onChange([...(members ?? []), added]);
      setName(""); setAge(""); setAllergies(""); setRelation("child");
    } catch (err) {
      Alert.alert("Couldn't save profile", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (member: FamilyMember) => {
    try {
      await api.removeFamily(token, member.id);
      const next = members.filter((m) => m.id !== member.id);
      onChange(next);
      if (activeId === member.id) onPick(null);
    } catch (err) {
      Alert.alert("Couldn't remove profile", err instanceof Error ? err.message : "Please try again.");
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Press testID="family-modal-close" onPress={onClose} style={styles.iconButton}><Ionicons name="close" size={22} color={colors.onSurface} /></Press>
          <Text style={styles.title}>Family profiles</Text>
          <View style={{ width: 44 }} />
        </View>
        <Text style={styles.subtitle}>Order medicines for parents, kids, or your partner and track everything from one account.</Text>

        <ScrollView>
          <Press testID="family-profile-self" style={[styles.card, activeId === null && styles.cardActive]} onPress={() => onPick(null)}>
            <View style={styles.avatar}><Ionicons name="person" size={18} color={colors.onBrandPrimary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardName}>Myself</Text>
              <Text style={styles.cardMeta}>Default profile</Text>
            </View>
            {activeId === null && <Ionicons name="checkmark-circle" size={20} color={colors.brandPrimary} />}
          </Press>

          {(members ?? []).map((member) => (
            <Press key={member.id} testID={`family-profile-${member.id}`} style={[styles.card, activeId === member.id && styles.cardActive]} onPress={() => onPick(member)}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{member.name.charAt(0).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName}>{member.name}</Text>
                <Text style={styles.cardMeta}>
                  {RELATIONS.find((r) => r.value === member.relation)?.label ?? member.relation}
                  {member.age ? ` · ${member.age} yrs` : ""}
                  {member.allergies ? ` · Allergies: ${member.allergies}` : ""}
                </Text>
              </View>
              <Press style={styles.removeBtn} onPress={() => remove(member)}>
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </Press>
            </Press>
          ))}

          <Text style={styles.addTitle}>Add a family member</Text>
          <TextInput testID="family-name-input" style={styles.input} value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={colors.muted} autoCapitalize="words" />
          <View style={styles.chipRow}>
            {RELATIONS.map((option) => (
              <Press key={option.value} style={[styles.chip, relation === option.value && styles.chipActive]} onPress={() => setRelation(option.value)}>
                <Ionicons name={option.icon} size={14} color={relation === option.value ? colors.onBrandPrimary : colors.brandPrimary} />
                <Text style={[styles.chipText, relation === option.value && styles.chipTextActive]}>{option.label}</Text>
              </Press>
            ))}
          </View>
          <TextInput style={styles.input} value={age} onChangeText={setAge} placeholder="Age (optional)" keyboardType="number-pad" placeholderTextColor={colors.muted} />
          <TextInput style={styles.input} value={allergies} onChangeText={setAllergies} placeholder="Known allergies (optional)" placeholderTextColor={colors.muted} />
          <Press testID="family-save" style={styles.primary} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
              <>
                <Text style={styles.primaryText}>Save profile</Text>
                <Ionicons name="checkmark" size={16} color={colors.onBrandPrimary} />
              </>
            )}
          </Press>
        </ScrollView>
      </View>
    </Modal>
  );
}
