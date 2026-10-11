import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { BilingualText, Notice, Screen } from "@/components/ui";
import { siteUrl, supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";
import { useAuth } from "@/providers/auth";
import { useLanguage } from "@/providers/language";
const labels = {
  sccs_family_role: { en: "Family", zh: "家庭账户" },
  sccs_teacher_ta_role: { en: "Teacher", zh: "教师账户" },
  sccs_admin_team_role: { en: "Admin Team", zh: "管理团队" },
  sccs_superadmin_role: { en: "Administrator", zh: "管理员" },
};

function HomeButton({
  title,
  titleZh,
  onPress,
  kind = "outline",
  disabled = false,
}: {
  title: string;
  titleZh: string;
  onPress: () => void;
  kind?: "outline" | "primary" | "danger";
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        kind === "primary" && styles.primaryAction,
        kind === "danger" && styles.dangerAction,
        (pressed || disabled) && styles.actionPressed,
      ]}
    >
      <BilingualText
        en={title}
        zh={titleZh}
        size={16}
        style={[styles.actionText, kind !== "outline" && styles.filledActionText]}
      />
    </Pressable>
  );
}

export default function Home() {
  const { session, role, signOut } = useAuth(); const family = role === "sccs_family_role"; const teacher = role === "sccs_teacher_ta_role";
  const { t } = useLanguage();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const account = role ? labels[role] : { en: "Account", zh: "账户" };
  const description = family
    ? { en: "Manage students, course registration, tuition, and payments.", zh: "管理学生、课程报名、学费和付款。" }
    : teacher
      ? { en: "Take attendance for assigned classes and review school notices.", zh: "为所授课程点名并查看学校通知。" }
      : { en: "Review and publish school notifications.", zh: "查看并发布学校通知。" };
  const deleteAccount = async () => {
    if (!session || deleting) return;
    setDeleting(true); setDeleteError("");
    try {
      const response = await fetch(`${siteUrl}/api/delete-account`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json() as { error?: string; code?: string };
      if (!response.ok) {
        if (result.code === "ACCOUNT_NOT_EMPTY") {
          Alert.alert(
            t("Account cannot be deleted", "暂时无法删除账户"),
            t(
              "Please cancel all registered courses first, then delete every student from the Family page. You can delete the account after those steps are complete.",
              "请先取消所有已注册的课程，然后在“家庭”页面删除全部学生。完成后即可删除账户。",
            ),
          );
          return;
        }
        throw new Error(result.error || "Could not delete account.");
      }
      await supabase.auth.signOut({ scope: "local" });
      router.replace("/login");
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete account. / 无法删除账户。");
    } finally {
      setDeleting(false);
    }
  };
  const confirmDelete = () => Alert.alert(
    t("Delete account?", "确认删除账户？"),
    t(
      "This permanently deletes your SCCS Family account and cannot be undone. Continue?",
      "此操作将永久删除您的 SCCS 家庭账户，并且无法撤销。是否继续？",
    ),
    [
      { text: t("Cancel", "取消"), style: "cancel" },
      { text: t("Delete account", "删除账户"), style: "destructive", onPress: () => void deleteAccount() },
    ],
    { cancelable: false },
  );
  return (
    <Screen>
      <View style={styles.welcome}>
        <BilingualText en="Welcome" zh="欢迎" size={38} style={styles.welcomeTitle} />
        <Text style={styles.email}>{session?.user.email}</Text>
      </View>

      <View style={styles.card}>
        <BilingualText en={account.en} zh={account.zh} size={22} style={styles.cardTitle} />
        <BilingualText {...description} size={16} style={styles.description} />

        <View style={styles.actions}>
          {family && (
            <>
              <HomeButton title="Students and family profile" titleZh="学生和家庭资料" onPress={() => router.push("/(tabs)/students")} />
              <HomeButton title="Course registration" titleZh="课程报名" onPress={() => router.push("/(tabs)/courses")} />
              <HomeButton title="Tuition and payment" titleZh="学费与付款" onPress={() => router.push("/(tabs)/billing")} />
            </>
          )}
          {teacher && <HomeButton title="Take attendance" titleZh="学生点名" onPress={() => router.push("/(tabs)/attendance")} />}
          <HomeButton title="School notifications" titleZh="学校通知" onPress={() => router.push("/(tabs)/notifications")} />
          <HomeButton title="Sign out" titleZh="退出登录" onPress={() => void signOut()} kind="primary" />
        </View>
      </View>

      {family && (
        <View style={styles.card}>
          <BilingualText en="Account deletion" zh="删除账户" size={21} style={styles.cardTitle} />
          <BilingualText
            en="Available only after all course registrations and students have been removed."
            zh="只有取消所有课程并删除全部学生后，才能删除账户。"
            size={15}
            style={styles.deleteDescription}
          />
          <Notice error={deleteError} />
          <HomeButton
            title={deleting ? "Deleting account…" : "Delete account"}
            titleZh={deleting ? "正在删除账户…" : "删除账户"}
            onPress={confirmDelete}
            disabled={deleting}
            kind="danger"
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  welcome: {
    paddingHorizontal: 8,
    paddingTop: 2,
    paddingBottom: 12,
    gap: 4,
  },
  welcomeTitle: {
    color: colors.navy,
    fontSize: 38,
    lineHeight: 46,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  email: {
    color: colors.navy,
    fontSize: 17,
    lineHeight: 24,
  },
  card: {
    backgroundColor: colors.white,
    borderColor: "#d3e2f2",
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    gap: 12,
    shadowColor: "#15345f",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.11,
    shadowRadius: 9,
    elevation: 3,
  },
  cardTitle: {
    color: colors.navy,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
  },
  description: {
    color: colors.navy,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 4,
  },
  deleteDescription: {
    color: "#60779b",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 2,
  },
  actions: {
    gap: 10,
  },
  action: {
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
    borderColor: "#0871d9",
    borderWidth: 1.5,
    borderRadius: 10,
  },
  primaryAction: {
    backgroundColor: "#1169c4",
    borderColor: "#1169c4",
  },
  dangerAction: {
    backgroundColor: "#d52c27",
    borderColor: "#d52c27",
  },
  actionPressed: {
    opacity: 0.62,
  },
  actionText: {
    color: "#096ac7",
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
    textAlign: "center",
  },
  filledActionText: {
    color: colors.white,
  },
});
