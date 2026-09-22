import { useState, type PropsWithChildren } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, type StyleProp, type TextInputProps, type TextStyle, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/lib/theme";

export function Screen({ children, refreshing = false }: PropsWithChildren<{ refreshing?: boolean }>) {
  return <SafeAreaView style={styles.safe} edges={["top"]}><ScrollView contentContainerStyle={styles.screen}>{refreshing && <ActivityIndicator color={colors.blue} />}{children}</ScrollView></SafeAreaView>;
}
export function BilingualText({ en, zh, style, size = 15 }: { en: string; zh: string; style?: StyleProp<TextStyle>; size?: number }) {
  return <Text style={style}>{en}{zh ? <>{"\n"}<Text style={{ fontSize: size - 1 }}>{zh}</Text></> : null}</Text>;
}
export function Header({ eyebrow, eyebrowZh, title, titleZh, children }: PropsWithChildren<{ eyebrow?: string; eyebrowZh?: string; title: string; titleZh?: string }>) {
  return <View style={styles.header}>
    {eyebrow && <BilingualText en={eyebrow} zh={eyebrowZh || ""} style={styles.eyebrow} size={12} />}
    <BilingualText en={title} zh={titleZh || ""} style={styles.title} size={30} />
    {children}
  </View>;
}
export function Card({ children }: PropsWithChildren) { return <View style={styles.card}>{children}</View>; }
export function Field({ label, labelZh, ...props }: TextInputProps & { label: string; labelZh?: string }) {
  return <View style={styles.field}><BilingualText en={label} zh={labelZh || ""} style={styles.label} size={13} /><TextInput {...props} placeholderTextColor="#94a0b2" style={[styles.input, props.multiline && styles.multiline, props.style]} /></View>;
}
export function Button({ title, titleZh, onPress, disabled, kind = "primary" }: { title: string; titleZh?: string; onPress: () => void; disabled?: boolean; kind?: "primary" | "secondary" | "danger" }) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.button, kind === "secondary" && styles.secondary, kind === "danger" && styles.danger, (disabled || pressed) && styles.dim]}><BilingualText en={title} zh={titleZh || ""} style={[styles.buttonText, kind === "secondary" && styles.secondaryText]} /></Pressable>;
}
type DropdownOption = { value: number; label: string; detail?: string };
export function Dropdown({ value, options, placeholder, placeholderZh, onChange }: { value?: number | null; options: DropdownOption[]; placeholder: string; placeholderZh: string; onChange: (value: number | null) => void }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return <>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} style={styles.dropdown}>
      <Text numberOfLines={1} style={[styles.dropdownText, !selected && styles.dropdownPlaceholder]}>{selected?.label || placeholder}</Text>
      <Text style={styles.dropdownArrow}>⌄</Text>
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
        <Pressable style={styles.modalPanel} onPress={(event) => event.stopPropagation()}>
          <BilingualText en={placeholder} zh={placeholderZh} style={styles.modalTitle} size={19} />
          <ScrollView style={styles.optionList}>
            <Pressable style={styles.option} onPress={() => { onChange(null); setOpen(false); }}>
              <BilingualText en="No course" zh="不选择课程" style={styles.optionText} />
            </Pressable>
            {options.map((option) => <Pressable key={option.value} style={[styles.option, option.value === value && styles.optionSelected]} onPress={() => { onChange(option.value); setOpen(false); }}>
              <Text style={[styles.optionText, option.value === value && styles.optionSelectedText]}>{option.label}</Text>
              {!!option.detail && <Text style={[styles.optionDetail, option.value === value && styles.optionSelectedText]}>{option.detail}</Text>}
            </Pressable>)}
          </ScrollView>
          <Button title="Close" titleZh="关闭" kind="secondary" onPress={() => setOpen(false)} />
        </Pressable>
      </Pressable>
    </Modal>
  </>;
}
export function Notice({ message, error }: { message?: string; error?: string }) {
  if (!message && !error) return null;
  const value = error || message || "";
  const separator = value.indexOf(" / ");
  const textStyle = error ? styles.errorText : styles.successText;
  return <View style={[styles.notice, error ? styles.errorNotice : styles.successNotice]}>{separator > 0
    ? <BilingualText en={value.slice(0, separator)} zh={value.slice(separator + 3)} style={textStyle} size={14} />
    : <Text style={textStyle}>{value}</Text>}
  </View>;
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
  dropdown: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.white, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  dropdownText: { flex: 1, color: colors.navy, fontSize: 15 }, dropdownPlaceholder: { color: colors.muted }, dropdownArrow: { color: colors.navy, fontSize: 22 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(5, 18, 38, 0.58)", padding: 20, justifyContent: "center" },
  modalPanel: { maxHeight: "78%", borderRadius: 16, backgroundColor: colors.white, padding: 16, gap: 10 },
  modalTitle: { color: colors.navy, fontSize: 19, fontWeight: "800" }, optionList: { flexGrow: 0 },
  option: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, gap: 3 },
  optionSelected: { backgroundColor: colors.blue }, optionText: { color: colors.navy, fontSize: 15, fontWeight: "700" },
  optionDetail: { color: colors.muted, fontSize: 13 }, optionSelectedText: { color: colors.white },
  notice: { borderRadius: 10, padding: 12 }, errorNotice: { backgroundColor: "#fdecea" }, successNotice: { backgroundColor: "#e8f6ed" }, errorText: { color: colors.red, fontSize: 14 }, successText: { color: colors.green, fontSize: 14 },
});
