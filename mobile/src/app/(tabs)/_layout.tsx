import { Redirect, Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { useAuth } from "@/providers/auth";
import { colors } from "@/lib/theme";
const icon = (label: string, color: ColorValue) => <Text style={{ color, fontWeight: "900", fontSize: 12 }}>{label}</Text>;
export default function TabsLayout() {
  const { session, role, loading } = useAuth(); if (!loading && !session) return <Redirect href="/login" />;
  const family = role === "sccs_family_role"; const teacher = role === "sccs_teacher_ta_role";
  return <Tabs screenOptions={{ headerStyle: { backgroundColor: colors.navy }, headerTintColor: colors.white, tabBarActiveTintColor: colors.blue, tabBarInactiveTintColor: colors.muted, tabBarStyle: { height: 66, paddingBottom: 8, paddingTop: 6 } }}>
    <Tabs.Screen name="home" options={{ title: "Home", tabBarIcon: ({ color }) => icon("HOME", color) }} />
    <Tabs.Screen name="students" options={{ title: "Family", href: family ? undefined : null, tabBarIcon: ({ color }) => icon("FAM", color) }} />
    <Tabs.Screen name="courses" options={{ title: "Courses", href: family ? undefined : null, tabBarIcon: ({ color }) => icon("CLASS", color) }} />
    <Tabs.Screen name="billing" options={{ title: "Billing", href: family ? undefined : null, tabBarIcon: ({ color }) => icon("PAY", color) }} />
    <Tabs.Screen name="attendance" options={{ title: "Attendance", href: teacher ? undefined : null, tabBarIcon: ({ color }) => icon("ATT", color) }} />
    <Tabs.Screen name="notifications" options={{ title: "Notices", tabBarIcon: ({ color }) => icon("NEWS", color) }} />
  </Tabs>;
}
