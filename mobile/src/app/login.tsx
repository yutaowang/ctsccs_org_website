import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { Button, Card, Field, Notice } from "@/components/ui";
import { colors } from "@/lib/theme";
import { useAuth } from "@/providers/auth";

export default function Login() {
  const { session, signIn } = useAuth(); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  if (session) return <Redirect href="/(tabs)/home" />;
  const submit = async () => { setBusy(true); setError(""); const message = await signIn(email, password); setError(message || ""); setBusy(false); };
  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.page}><View style={styles.brand}><Text style={styles.mark}>SCCS</Text><Text style={styles.chinese}>东南康州中文学校</Text><Text style={styles.english}>Southeastern Connecticut Chinese School</Text></View><Card><Text style={styles.title}>Sign in</Text><Text style={styles.help}>Families and teachers use the same SCCS account credentials.</Text><Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" /><Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" onSubmitEditing={submit} /><Notice error={error} /><Button title={busy ? "Signing in…" : "Sign in"} onPress={submit} disabled={busy || !email || !password} /></Card></KeyboardAvoidingView>;
}
const styles = StyleSheet.create({ page: { flex: 1, justifyContent: "center", backgroundColor: colors.navy, padding: 22, gap: 26 }, brand: { alignItems: "center", gap: 4 }, mark: { color: colors.gold, fontSize: 42, fontWeight: "900", letterSpacing: 3 }, chinese: { color: colors.white, fontSize: 21, fontWeight: "800" }, english: { color: "#dbe7f8", textAlign: "center" }, title: { color: colors.navy, fontSize: 26, fontWeight: "900" }, help: { color: colors.muted, lineHeight: 20 } });
