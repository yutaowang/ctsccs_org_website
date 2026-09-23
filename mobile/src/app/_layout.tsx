import { useEffect } from "react";
import { Stack, router } from "expo-router";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "@/providers/auth";
import { LanguageProvider } from "@/providers/language";
import { registerPushDevice } from "@/lib/push";

function AppStack() {
  const { session } = useAuth();
  useEffect(() => {
    if (session) void registerPushDevice(session.user.id).catch((error) => console.warn("Push registration failed", error));
  }, [session]);
  useEffect(() => {
    const open = (notification: Notifications.Notification) => {
      const url = notification.request.content.data?.url;
      router.push(typeof url === "string" ? url as never : "/(tabs)/notifications");
    };
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response?.notification) open(response.notification);
    });
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => open(response.notification));
    return () => subscription.remove();
  }, []);
  return <><StatusBar style="light" /><Stack screenOptions={{ headerShown: false }} /></>;
}
export default function RootLayout() { return <LanguageProvider><AuthProvider><AppStack /></AuthProvider></LanguageProvider>; }
