import { Redirect, Tabs } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image, StyleSheet, Text, View, type ColorValue } from "react-native";
import logo from "../../../assets/icon.png";
import { colors } from "@/lib/theme";
import { useAuth } from "@/providers/auth";

const titles: Record<string, { en: string; zh: string }> = {
  home: { en: "Home", zh: "首页" },
  students: { en: "Family", zh: "家庭" },
  courses: { en: "Courses", zh: "课程" },
  billing: { en: "Billing", zh: "缴费" },
  attendance: { en: "Attendance", zh: "点名" },
  notifications: { en: "Notices", zh: "通知" },
};

const icons = {
  home: "home-outline",
  students: "account-group-outline",
  courses: "book-open-page-variant-outline",
  billing: "credit-card-outline",
  attendance: "clipboard-check-outline",
  notifications: "bell-outline",
} as const;

function HeaderTitle({ title }: { title: { en: string; zh: string } }) {
  return <View style={styles.headerTitle}>
    <Image source={logo} style={styles.logo} resizeMode="contain" />
    <View style={styles.navLabel}><Text style={styles.headerText}>{title.en}</Text><Text style={styles.headerChinese}>{title.zh}</Text></View>
  </View>;
}
function TabLabel({ title, color }: { title: { en: string; zh: string }; color: ColorValue }) {
  return <View style={styles.navLabel}><Text style={[styles.tabLabel, { color }]}>{title.en}</Text><Text style={[styles.tabChinese, { color }]}>{title.zh}</Text></View>;
}

export default function TabsLayout() {
  const { session, role, loading } = useAuth();
  if (!loading && !session) return <Redirect href="/login" />;
  const family = role === "sccs_family_role";
  const teacher = role === "sccs_teacher_ta_role";

  return <Tabs screenOptions={({ route }) => ({
    headerStyle: { backgroundColor: colors.navy },
    headerTintColor: colors.white,
    headerTitle: () => <HeaderTitle title={titles[route.name] || { en: "SCCS", zh: "中文学校" }} />,
    headerTitleAlign: "left",
    tabBarActiveTintColor: colors.blue,
    tabBarInactiveTintColor: colors.muted,
    tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name={icons[route.name as keyof typeof icons] || "circle-outline"} color={color} size={Math.min(size, 19)} />,
    tabBarIconStyle: styles.tabIcon,
    tabBarLabelPosition: "beside-icon",
    tabBarShowLabel: true,
    tabBarLabel: ({ color }) => <TabLabel title={titles[route.name] || { en: "SCCS", zh: "中文学校" }} color={color} />,
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
  headerChinese: { color: colors.white, fontSize: 19, fontWeight: "700" },
  navLabel: { flexDirection: "row", alignItems: "baseline", gap: 3 },
  tabBar: { height: 52, paddingTop: 0, paddingBottom: 0 },
  tabItem: { minWidth: 0, alignItems: "center", justifyContent: "center" },
  tabIcon: { margin: 0 },
  tabLabel: { margin: 0, fontSize: 11, lineHeight: 14, fontWeight: "700" },
  tabChinese: { fontSize: 10, lineHeight: 13, fontWeight: "700" },
});
