import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/providers/auth";

function AppStack() {
  return <><StatusBar style="light" /><Stack screenOptions={{ headerShown: false }} /></>;
}
export default function RootLayout() { return <AuthProvider><AppStack /></AuthProvider>; }
