import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/providers/auth";
import { colors } from "@/lib/theme";
export default function Index() { const { session, loading } = useAuth(); if (loading) return <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator color={colors.blue} /></View>; return <Redirect href={session ? "/(tabs)/home" : "/login"} />; }
