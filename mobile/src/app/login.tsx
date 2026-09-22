import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { Button, Card, Field, Notice } from "@/components/ui";
import { siteUrl } from "@/lib/supabase";
import { colors } from "@/lib/theme";
import { useAuth } from "@/providers/auth";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const { session, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<{ message?: string; error?: string }>({});
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  if (session) return <Redirect href="/(tabs)/home" />;

  const submit = async () => {
    setBusy(true); setStatus({});
    const error = await signIn(email.trim(), password);
    setStatus({ error: error || undefined }); setBusy(false);
  };
  const requestPasswordReset = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    setStatus({});
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setStatus({ error: "Please enter a valid email address first." }); return;
    }
    setResetBusy(true);
    try {
      const response = await fetch(`${siteUrl}/api/forgot-password`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const result = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Password reset request failed.");
      setStatus({ message: result.message || "If an account exists for this email, a password reset link has been sent." });
    } catch (error) {
      setStatus({ error: error instanceof Error ? error.message : "Password reset is temporarily unavailable." });
    } finally { setResetBusy(false); }
  };

  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.page}>
    <View style={styles.brand}><Text style={styles.mark}>SCCS</Text><Text style={styles.chinese}>东南康州中文学校</Text><Text style={styles.english}>Southeastern Connecticut Chinese School</Text></View>
    <Card>
      <Text style={styles.title}>Sign in</Text>
      <Text style={styles.help}>Families and teachers use the same SCCS account credentials.</Text>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" onSubmitEditing={submit} />
      <Notice {...status} />
      <Button title={busy ? "Signing in…" : "Sign in"} onPress={submit} disabled={busy || resetBusy || !email || !password} />
      <Button title={resetBusy ? "Sending reset email…" : "忘记密码 / Forgot password"} kind="secondary" onPress={requestPasswordReset} disabled={busy || resetBusy || !email} />
    </Card>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: "center", backgroundColor: colors.navy, padding: 22, gap: 26 },
  brand: { alignItems: "center", gap: 4 }, mark: { color: colors.gold, fontSize: 42, fontWeight: "900", letterSpacing: 3 },
  chinese: { color: colors.white, fontSize: 21, fontWeight: "800" }, english: { color: "#dbe7f8", textAlign: "center" },
  title: { color: colors.navy, fontSize: 26, fontWeight: "900" }, help: { color: colors.muted, lineHeight: 20 },
});
