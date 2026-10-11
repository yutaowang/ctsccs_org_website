import { useState } from "react";
import { Alert, Text } from "react-native";
import { router } from "expo-router";
import { BilingualText, Button, Card, Header, Notice, Screen, ui } from "@/components/ui";
import { siteUrl, supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth";
import { useLanguage } from "@/providers/language";
const labels = {
  sccs_family_role: { en: "Family", zh: "家庭账户" },
  sccs_teacher_ta_role: { en: "Teacher", zh: "教师账户" },
  sccs_admin_team_role: { en: "Admin Team", zh: "管理团队" },
  sccs_superadmin_role: { en: "Administrator", zh: "管理员" },
};
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
  return <Screen><Header eyebrow="SCCS Mobile" eyebrowZh="中文学校移动端" title="Welcome" titleZh="欢迎"><Text style={ui.body}>{session?.user.email}</Text></Header><Card><BilingualText en={account.en} zh={account.zh} style={ui.heading} size={19} /><BilingualText {...description} style={ui.body} /></Card>{family && <><Button title="Students and family profile" titleZh="学生和家庭资料" onPress={() => router.push("/(tabs)/students")} /><Button title="Course registration" titleZh="课程报名" onPress={() => router.push("/(tabs)/courses")} kind="secondary" /><Button title="Tuition and payment" titleZh="学费与付款" onPress={() => router.push("/(tabs)/billing")} kind="secondary" /></>}{teacher && <Button title="Take attendance" titleZh="学生点名" onPress={() => router.push("/(tabs)/attendance")} />}<Button title="School notifications" titleZh="学校通知" onPress={() => router.push("/(tabs)/notifications")} kind="secondary" /><Button title="Sign out" titleZh="退出登录" onPress={() => void signOut()} kind="danger" />{family && <Card><BilingualText en="Account deletion" zh="删除账户" style={ui.heading} size={19} /><BilingualText en="Available only after all course registrations and students have been removed." zh="只有取消所有课程并删除全部学生后，才能删除账户。" style={ui.muted} size={13} /><Notice error={deleteError} /><Button title={deleting ? "Deleting account…" : "Delete account"} titleZh={deleting ? "正在删除账户…" : "删除账户"} onPress={confirmDelete} disabled={deleting} kind="danger" /></Card>}</Screen>;
}
