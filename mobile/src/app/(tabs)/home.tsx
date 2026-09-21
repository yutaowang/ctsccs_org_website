import { Text } from "react-native";
import { router } from "expo-router";
import { Button, Card, Header, Screen, ui } from "@/components/ui";
import { useAuth } from "@/providers/auth";
const labels = { sccs_family_role: "Family", sccs_teacher_ta_role: "Teacher", sccs_admin_team_role: "Admin Team", sccs_superadmin_role: "Administrator" };
export default function Home() {
  const { session, role, signOut } = useAuth(); const family = role === "sccs_family_role"; const teacher = role === "sccs_teacher_ta_role";
  return <Screen><Header eyebrow="SCCS Mobile" title="Welcome"><Text style={ui.body}>{session?.user.email}</Text></Header><Card><Text style={ui.heading}>{role ? labels[role] : "Account"}</Text><Text style={ui.body}>{family ? "Manage students, course registration, tuition, and payments." : teacher ? "Take attendance for your assigned classes and review school notices." : "Review and publish school notifications."}</Text></Card>{family && <><Button title="Students and family profile" onPress={() => router.push("/(tabs)/students")} /><Button title="Course registration" onPress={() => router.push("/(tabs)/courses")} kind="secondary" /><Button title="Tuition and payment" onPress={() => router.push("/(tabs)/billing")} kind="secondary" /></>}{teacher && <Button title="Take attendance" onPress={() => router.push("/(tabs)/attendance")} />}<Button title="School notifications" onPress={() => router.push("/(tabs)/notifications")} kind="secondary" /><Button title="Sign out" onPress={() => void signOut()} kind="danger" /></Screen>;
}
