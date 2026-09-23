import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from "react-native";
import { Redirect, router } from "expo-router";
import { BilingualText, Button, Card, Field, Header, LanguageToggle, Notice, Screen, ui } from "@/components/ui";
import { siteUrl } from "@/lib/supabase";
import { colors } from "@/lib/theme";
import { useAuth } from "@/providers/auth";
import { useLanguage } from "@/providers/language";

const EMAIL_PATTERN = /^[^@ ]+@[^@ ]+[.][^@ ]+$/;
const ZIP_PATTERN = /^[0-9]{5}$/;
const PHONE_PATTERN = /^[0-9]{3}-[0-9]{3}-[0-9]{4}$/;

type Profile = {
  parent_first_name: string;
  parent_last_name: string;
  parent_chinese_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  wechat: string;
  pfizer_employee: boolean;
};

const initialProfile: Profile = {
  parent_first_name: "",
  parent_last_name: "",
  parent_chinese_name: "",
  address: "",
  city: "",
  state: "CT",
  zip: "",
  phone: "",
  wechat: "",
  pfizer_employee: false,
};

export default function CreateAccount() {
  const { session } = useAuth();
  const { t } = useLanguage();
  const [profile, setProfile] = useState(initialProfile);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [retypePassword, setRetypePassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ message?: string; error?: string }>({});

  if (session) return <Redirect href="/(tabs)/home" />;

  const update = <K extends keyof Profile>(key: K, value: Profile[K]) => setProfile((current) => ({ ...current, [key]: value }));
  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    const formatted = digits.length <= 3 ? digits : digits.length <= 6 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    update("phone", formatted);
  };

  const submit = async () => {
    setStatus({});
    const required = [profile.parent_first_name, profile.parent_last_name, profile.address, profile.city, profile.state, profile.zip, profile.phone, email, password, retypePassword];
    if (required.some((value) => !value.trim())) return setStatus({ error: t("Please complete all required fields.", "请填写所有必填项目。") });
    if (!EMAIL_PATTERN.test(email.trim())) return setStatus({ error: t("Enter a valid email address.", "请输入有效的电子邮箱地址。") });
    if (password.length < 8) return setStatus({ error: t("Password must be at least 8 characters.", "密码至少需要 8 个字符。") });
    if (password !== retypePassword) return setStatus({ error: t("Passwords do not match.", "两次输入的密码不一致。") });
    if (!ZIP_PATTERN.test(profile.zip)) return setStatus({ error: t("Zip must be exactly 5 digits.", "邮政编码必须为 5 位数字。") });
    if (!PHONE_PATTERN.test(profile.phone)) return setStatus({ error: t("Phone must use ###-###-#### format.", "电话号码格式必须为 ###-###-####。") });
    if (!/^[A-Za-z]{2}$/.test(profile.state)) return setStatus({ error: t("State must be a two-letter code.", "州名请填写两位英文缩写。") });
    if (profile.pfizer_employee && !["pfizer.com", "ctsccs.org"].includes(email.trim().toLowerCase().split("@").pop() || "")) {
      return setStatus({ error: t("Pfizer and SCCS employees must register with a pfizer.com or ctsccs.org email address.", "辉瑞和 SCCS 员工必须使用 pfizer.com 或 ctsccs.org 邮箱注册。") });
    }
    setBusy(true);
    try {
      const response = await fetch(`${siteUrl}/api/create-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password, profile: { ...profile, state: profile.state.toUpperCase() } }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || t("Account creation failed.", "账户创建失败。"));
      setStatus({ message: t("Please check your email and validate your account before signing in.", "请查看电子邮件并验证账户，然后再登录。") });
    } catch (error) {
      setStatus({ error: error instanceof Error ? error.message : t("Account creation failed.", "账户创建失败。") });
    } finally {
      setBusy(false);
    }
  };

  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.page}>
    <Screen>
      <View style={styles.topRow}><Button title="Back to Sign In" titleZh="返回登录" kind="secondary" onPress={() => router.back()} /><LanguageToggle /></View>
      <Header eyebrow="Family account" eyebrowZh="家庭账户" title="Create Account" titleZh="创建账户" />
      <Card>
        <BilingualText en="Fields marked with * are required." zh="标有 * 的项目为必填项。" style={ui.muted} size={13} />
        <Field label="Parent First Name *" labelZh="家长名字 *" value={profile.parent_first_name} onChangeText={(value) => update("parent_first_name", value)} autoComplete="name-given" />
        <Field label="Parent Last Name *" labelZh="家长姓氏 *" value={profile.parent_last_name} onChangeText={(value) => update("parent_last_name", value)} autoComplete="name-family" />
        <Field label="Parent Chinese Name (Optional)" labelZh="家长中文姓名（选填）" value={profile.parent_chinese_name} onChangeText={(value) => update("parent_chinese_name", value)} />
        <Field label="Address *" labelZh="地址 *" value={profile.address} onChangeText={(value) => update("address", value)} autoComplete="street-address" />
        <Field label="City *" labelZh="城市 *" value={profile.city} onChangeText={(value) => update("city", value)} autoComplete="postal-address-locality" />
        <View style={styles.twoColumns}>
          <View style={styles.flex}><Field label="State *" labelZh="州 *" value={profile.state} onChangeText={(value) => update("state", value.slice(0, 2).toUpperCase())} autoCapitalize="characters" maxLength={2} autoComplete="postal-address-region" /></View>
          <View style={styles.flex}><Field label="Zip *" labelZh="邮政编码 *" value={profile.zip} onChangeText={(value) => update("zip", value.replace(/\D/g, "").slice(0, 5))} keyboardType="number-pad" maxLength={5} autoComplete="postal-code" /></View>
        </View>
        <Field label="Phone *" labelZh="电话 *" value={profile.phone} onChangeText={formatPhone} placeholder="###-###-####" keyboardType="phone-pad" autoComplete="tel" maxLength={12} />
        <Field label="WeChat (Optional)" labelZh="微信（选填）" value={profile.wechat} onChangeText={(value) => update("wechat", value)} />
        <BilingualText en="Are you a Pfizer employee, or do you work for SCCS?" zh="您是辉瑞员工或 SCCS 工作人员吗？" style={styles.question} size={13} />
        <View style={styles.choiceRow}>
          {[false, true].map((value) => <Pressable key={String(value)} onPress={() => update("pfizer_employee", value)} style={[styles.choice, profile.pfizer_employee === value && styles.choiceSelected]}>
            <BilingualText en={value ? "Yes" : "No"} zh={value ? "是" : "否"} style={[styles.choiceText, profile.pfizer_employee === value && styles.choiceTextSelected]} />
          </Pressable>)}
        </View>
        <Field label="Email / Username *" labelZh="电子邮箱 / 用户名 *" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
        <Field label="Password *" labelZh="密码 *" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
        <Field label="Retype Password *" labelZh="再次输入密码 *" value={retypePassword} onChangeText={setRetypePassword} secureTextEntry autoComplete="new-password" onSubmitEditing={submit} />
        <Notice {...status} />
        <Button title={busy ? "Creating Account…" : "Create a Family Account"} titleZh={busy ? "正在创建账户…" : "创建家庭账户"} onPress={submit} disabled={busy} />
        {status.message && <Button title="Back to Sign In" titleZh="返回登录" kind="secondary" onPress={() => router.replace("/login")} />}
      </Card>
    </Screen>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.cream },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  twoColumns: { flexDirection: "row", gap: 12 }, flex: { flex: 1 },
  question: { color: colors.navy, fontWeight: "700", marginTop: 2 },
  choiceRow: { flexDirection: "row", gap: 10 },
  choice: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 11, alignItems: "center", backgroundColor: colors.white },
  choiceSelected: { backgroundColor: colors.blue, borderColor: colors.blue },
  choiceText: { color: colors.navy, fontWeight: "700" }, choiceTextSelected: { color: colors.white },
});
