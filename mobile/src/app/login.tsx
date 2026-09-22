import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { BilingualText, Button, Card, Field, Notice } from "@/components/ui";
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
      setStatus({ error: "Please enter a valid email address first. / 请先输入有效的电子邮箱。" }); return;
    }
    setResetBusy(true);
    try {
      const response = await fetch(`${siteUrl}/api/forgot-password`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const result = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Password reset request failed. / 密码重置请求失败。");
      setStatus({ message: `${result.message || "If an account exists for this email, a password reset link has been sent."} / 如果该邮箱对应一个账户，密码重置链接已发送。` });
    } catch (error) {
      setStatus({ error: error instanceof Error ? error.message : "Password reset is temporarily unavailable. / 密码重置服务暂时不可用。" });
    } finally { setResetBusy(false); }
  };

  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.page}>
    <View style={styles.brand}><Text style={styles.mark}>SCCS</Text><Text style={styles.english}>Southeastern Connecticut Chinese School</Text><Text style={styles.chinese}>东南康州中文学校</Text></View>
    <Card>
      <BilingualText en="Sign in" zh="登录" style={styles.title} size={26} />
      <BilingualText en="Families and teachers use the same SCCS account credentials." zh="家庭和教师使用同一套 SCCS 账户登录信息。" style={styles.help} />
      <Field label="Email" labelZh="电子邮箱" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
      <Field label="Password" labelZh="密码" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" onSubmitEditing={submit} />
      <Notice {...status} />
      <Button title={busy ? "Signing in…" : "Sign in"} titleZh={busy ? "正在登录…" : "登录"} onPress={submit} disabled={busy || resetBusy || !email || !password} />
      <Button title={resetBusy ? "Sending reset email…" : "Forgot password"} titleZh={resetBusy ? "正在发送重置邮件…" : "忘记密码"} kind="secondary" onPress={requestPasswordReset} disabled={busy || resetBusy || !email} />
    </Card>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: "center", backgroundColor: colors.navy, padding: 22, gap: 26 },
  brand: { alignItems: "center", gap: 4 }, mark: { color: colors.gold, fontSize: 42, fontWeight: "900", letterSpacing: 3 },
  chinese: { color: "#dbe7f8", fontSize: 15, fontWeight: "700" }, english: { color: colors.white, fontSize: 16, fontWeight: "800", textAlign: "center" },
  title: { color: colors.navy, fontSize: 26, fontWeight: "900" }, help: { color: colors.muted, lineHeight: 20 },
});
