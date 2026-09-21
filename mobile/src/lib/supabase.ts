import "react-native-url-polyfill/auto";
import "expo-sqlite/localStorage/install";
import { AppState, Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
export const siteUrl = (process.env.EXPO_PUBLIC_SITE_URL || "https://ctsccs.org").replace(/\/$/, "");
export const configured = Boolean(url && key);

export const supabase = createClient(url || "https://invalid.local", key || "missing", {
  db: { schema: "sccs" },
  auth: { storage: localStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

if (Platform.OS !== "web") AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh(); else supabase.auth.stopAutoRefresh();
});
