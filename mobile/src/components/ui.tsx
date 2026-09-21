import type { PropsWithChildren } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, type TextInputProps, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/lib/theme";

export function Screen({ children, refreshing = false }: PropsWithChildren<{ refreshing?: boolean }>) {
  return <SafeAreaView style={styles.safe} edges={["top"]}><ScrollView contentContainerStyle={styles.screen}>{refreshing && <ActivityIndicator color={colors.blue} />}{children}</ScrollView></SafeAreaView>;
}
export function Header({ eyebrow, title, children }: PropsWithChildren<{ eyebrow?: string; title: string }>) {
  return <View style={styles.header}>{eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}<Text style={styles.title}>{title}</Text>{children}</View>;
}
export function Card({ children }: PropsWithChildren) { return <View style={styles.card}>{children}</View>; }
export function Field(props: TextInputProps & { label: string }) {
  return <View style={styles.field}><Text style={styles.label}>{props.label}</Text><TextInput {...props} placeholderTextColor="#94a0b2" style={[styles.input, props.multiline && styles.multiline, props.style]} /></View>;
}
export function Button({ title, onPress, disabled, kind = "primary" }: { title: string; onPress: () => void; disabled?: boolean; kind?: "primary" | "secondary" | "danger" }) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.button, kind === "secondary" && styles.secondary, kind === "danger" && styles.danger, (disabled || pressed) && styles.dim]}><Text style={[styles.buttonText, kind === "secondary" && styles.secondaryText]}>{title}</Text></Pressable>;
}
export function Notice({ message, error }: { message?: string; error?: string }) {
  if (!message && !error) return null;
  return <View style={[styles.notice, error ? styles.errorNotice : styles.successNotice]}><Text style={error ? styles.errorText : styles.successText}>{error || message}</Text></View>;
}
export const ui = StyleSheet.create({
  row: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  heading: { color: colors.navy, fontSize: 19, fontWeight: "800", marginBottom: 8 },
  subheading: { color: colors.navy, fontSize: 16, fontWeight: "700" },
  body: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  amount: { color: colors.navy, fontSize: 22, fontWeight: "800" },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
});
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  screen: { padding: 18, gap: 14, paddingBottom: 40 },
  header: { marginBottom: 4 }, eyebrow: { color: colors.blue, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  title: { color: colors.navy, fontSize: 30, fontWeight: "900", marginTop: 3 },
  card: { backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 10, shadowColor: "#0b2545", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  field: { gap: 6 }, label: { color: colors.navy, fontSize: 13, fontWeight: "700" },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.white, color: colors.ink, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16 },
  multiline: { minHeight: 110, textAlignVertical: "top" },
  button: { backgroundColor: colors.blue, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, alignItems: "center", justifyContent: "center", minHeight: 44 },
  secondary: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.blue }, danger: { backgroundColor: colors.red }, dim: { opacity: 0.55 },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: "800" }, secondaryText: { color: colors.blue },
  notice: { borderRadius: 10, padding: 12 }, errorNotice: { backgroundColor: "#fdecea" }, successNotice: { backgroundColor: "#e8f6ed" }, errorText: { color: colors.red }, successText: { color: colors.green },
});
