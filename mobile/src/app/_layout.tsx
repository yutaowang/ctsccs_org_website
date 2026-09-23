import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/providers/auth";
import { LanguageProvider } from "@/providers/language";

function AppStack() {
  return <><StatusBar style="light" /><Stack screenOptions={{ headerShown: false }} /></>;
}
export default function RootLayout() { return <LanguageProvider><AuthProvider><AppStack /></AuthProvider></LanguageProvider>; }
