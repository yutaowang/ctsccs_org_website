import { Redirect, Tabs } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image, StyleSheet, Text, View } from "react-native";
import logo from "../../../assets/icon.png";
import { colors } from "@/lib/theme";
import { useAuth } from "@/providers/auth";

const titles: Record<string, string> = {
  home: "Home",
  students: "Family",
  courses: "Courses",
  billing: "Billing",
  attendance: "Attendance",
  notifications: "Notices",
};

const icons = {
  home: "home-outline",
  students: "account-group-outline",
  courses: "book-open-page-variant-outline",
  billing: "credit-card-outline",
  attendance: "clipboard-check-outline",
  notifications: "bell-outline",
} as const;

function HeaderTitle({ title }: { title: string }) {
  return <View style={styles.headerTitle}>
    <Image source={logo} style={styles.logo} resizeMode="contain" />
    <Text style={styles.headerText}>{title}</Text>
  </View>;
}

export default function TabsLayout() {
  const { session, role, loading } = useAuth();
  if (!loading && !session) return <Redirect href="/login" />;
  const family = role === "sccs_family_role";
  const teacher = role === "sccs_teacher_ta_role";

  return <Tabs screenOptions={({ route }) => ({
    headerStyle: { backgroundColor: colors.navy },
    headerTintColor: colors.white,
    headerTitle: () => <HeaderTitle title={titles[route.name] || "SCCS"} />,
    headerTitleAlign: "left",
    tabBarActiveTintColor: colors.blue,
    tabBarInactiveTintColor: colors.muted,
    tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name={icons[route.name as keyof typeof icons] || "circle-outline"} color={color} size={Math.min(size, 19)} />,
    tabBarIconStyle: styles.tabIcon,
    tabBarLabelPosition: "beside-icon",
    tabBarShowLabel: true,
    tabBarLabelStyle: styles.tabLabel,
    tabBarItemStyle: styles.tabItem,
    tabBarStyle: styles.tabBar,
  })}>
    <Tabs.Screen name="home" options={{ title: "Home" }} />
    <Tabs.Screen name="students" options={{ title: "Family", href: family ? undefined : null }} />
    <Tabs.Screen name="courses" options={{ title: "Courses", href: family ? undefined : null }} />
    <Tabs.Screen name="billing" options={{ title: "Billing", href: family ? undefined : null }} />
    <Tabs.Screen name="attendance" options={{ title: "Attendance", href: teacher ? undefined : null }} />
    <Tabs.Screen name="notifications" options={{ title: "Notices" }} />
  </Tabs>;
}

const styles = StyleSheet.create({
  headerTitle: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 34, height: 34, borderRadius: 8 },
  headerText: { color: colors.white, fontSize: 20, fontWeight: "800" },
  tabBar: { height: 52, paddingTop: 0, paddingBottom: 0 },
  tabItem: { minWidth: 0, alignItems: "center", justifyContent: "center" },
  tabIcon: { margin: 0 },
  tabLabel: { margin: 0, fontSize: 11, lineHeight: 14, fontWeight: "700" },
});
