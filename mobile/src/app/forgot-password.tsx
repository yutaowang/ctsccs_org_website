import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { Redirect, router } from "expo-router";
import { BilingualText, Button, Card, Field, Notice } from "@/components/ui";
import { siteUrl } from "@/lib/supabase";
import { colors } from "@/lib/theme";
import { useAuth } from "@/providers/auth";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPassword() {
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ message?: string; error?: string }>({});
  const [busy, setBusy] = useState(false);
  if (session) return <Redirect href="/(tabs)/home" />;

  const submit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    setStatus({});
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setStatus({ error: "Please enter a valid email address. / 请输入有效的电子邮箱。" });
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`${siteUrl}/api/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const result = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Password reset request failed. / 密码重置请求失败。");
      setStatus({
        message: "If an account exists for this email, a password reset link has been sent. / 如果该邮箱对应一个账户，密码重置链接已发送。",
      });
    } catch (error) {
      setStatus({ error: error instanceof Error ? error.message : "Password reset is temporarily unavailable. / 密码重置服务暂时不可用。" });
    } finally {
      setBusy(false);
    }
  };

  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.page}>
    <Card>
      <BilingualText en="Reset Password" zh="重置密码" style={styles.title} size={26} />
      <BilingualText en="Enter the email address used for your SCCS account. We will send you a password reset link." zh="请输入 SCCS 账户使用的电子邮箱，我们会向您发送密码重置链接。" style={styles.help} />
      <Field label="Email" labelZh="电子邮箱" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" onSubmitEditing={submit} />
      <Notice {...status} />
      <Button title={busy ? "Sending reset email…" : "Reset Password"} titleZh={busy ? "正在发送重置邮件…" : "重置密码"} onPress={submit} disabled={busy || !email} />
      <Button title="Back to Sign In" titleZh="返回登录" kind="secondary" onPress={() => router.back()} disabled={busy} />
    </Card>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: "center", backgroundColor: colors.navy, padding: 22 },
  title: { color: colors.navy, fontSize: 26, fontWeight: "900" },
  help: { color: colors.muted, lineHeight: 20 },
});
