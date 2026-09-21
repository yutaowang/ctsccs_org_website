import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { supabase } from "./supabase";

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true }) });
export async function registerPushDevice(userId: string) {
  if (!Device.isDevice) return;
  if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("school", { name: "School notices", importance: Notifications.AndroidImportance.HIGH });
  let status = (await Notifications.getPermissionsAsync()).status;
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return;
  const expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await supabase.from("push_devices").upsert({ expo_push_token: expoPushToken, user_id: userId, platform: Platform.OS, enabled: true }, { onConflict: "expo_push_token" });
}
