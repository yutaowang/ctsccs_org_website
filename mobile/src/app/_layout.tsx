import { useEffect } from "react";
import { Stack, router, useRootNavigationState } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "@/providers/auth";
import { LanguageProvider } from "@/providers/language";

type NotificationLike = { request: { content: { data?: Record<string, unknown> | null } } };

function AppStack() {
  const { session } = useAuth();
  const navigationState = useRootNavigationState();
  useEffect(() => {
    if (session) void import("@/lib/push")
      .then(({ registerPushDevice }) => registerPushDevice(session.user.id))
      .catch((error) => console.warn("Push notifications are unavailable in this development client", error));
  }, [session]);
  useEffect(() => {
    if (!navigationState?.key) return;
    let active = true;
    let subscription: { remove: () => void } | undefined;
    const open = (notification: NotificationLike) => {
      const url = notification.request.content.data?.url;
      router.push(typeof url === "string" ? url as never : "/(tabs)/notifications");
    };
    void import("expo-notifications").then(async (Notifications) => {
      if (!active) return;
      const response = await Notifications.getLastNotificationResponseAsync();
      if (active && response?.notification) open(response.notification);
      if (active) subscription = Notifications.addNotificationResponseReceivedListener((next) => open(next.notification));
    }).catch((error) => console.warn("Notification routing is unavailable in this development client", error));
    return () => { active = false; subscription?.remove(); };
  }, [navigationState?.key]);
  return <><StatusBar style="light" /><Stack screenOptions={{ headerShown: false }} /></>;
}
export default function RootLayout() { return <LanguageProvider><AuthProvider><AppStack /></AuthProvider></LanguageProvider>; }
