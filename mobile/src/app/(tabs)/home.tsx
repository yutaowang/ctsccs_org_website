import { Text } from "react-native";
import { router } from "expo-router";
import { BilingualText, Button, Card, Header, Screen, ui } from "@/components/ui";
import { useAuth } from "@/providers/auth";
const labels = {
  sccs_family_role: { en: "Family", zh: "家庭账户" },
  sccs_teacher_ta_role: { en: "Teacher", zh: "教师账户" },
  sccs_admin_team_role: { en: "Admin Team", zh: "管理团队" },
  sccs_superadmin_role: { en: "Administrator", zh: "管理员" },
};
export default function Home() {
  const { session, role, signOut } = useAuth(); const family = role === "sccs_family_role"; const teacher = role === "sccs_teacher_ta_role";
  const account = role ? labels[role] : { en: "Account", zh: "账户" };
  const description = family
    ? { en: "Manage students, course registration, tuition, and payments.", zh: "管理学生、课程报名、学费和付款。" }
    : teacher
      ? { en: "Take attendance for assigned classes and review school notices.", zh: "为所授课程点名并查看学校通知。" }
      : { en: "Review and publish school notifications.", zh: "查看并发布学校通知。" };
  return <Screen><Header eyebrow="SCCS Mobile" eyebrowZh="中文学校移动端" title="Welcome" titleZh="欢迎"><Text style={ui.body}>{session?.user.email}</Text></Header><Card><BilingualText en={account.en} zh={account.zh} style={ui.heading} size={19} /><BilingualText {...description} style={ui.body} /></Card>{family && <><Button title="Students and family profile" titleZh="学生和家庭资料" onPress={() => router.push("/(tabs)/students")} /><Button title="Course registration" titleZh="课程报名" onPress={() => router.push("/(tabs)/courses")} kind="secondary" /><Button title="Tuition and payment" titleZh="学费与付款" onPress={() => router.push("/(tabs)/billing")} kind="secondary" /></>}{teacher && <Button title="Take attendance" titleZh="学生点名" onPress={() => router.push("/(tabs)/attendance")} />}<Button title="School notifications" titleZh="学校通知" onPress={() => router.push("/(tabs)/notifications")} kind="secondary" /><Button title="Sign out" titleZh="退出登录" onPress={() => void signOut()} kind="danger" /></Screen>;
}
