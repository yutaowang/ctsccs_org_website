import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Card, Field, Header, Notice, Screen, ui } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";
import { useAuth } from "@/providers/auth";

type Announcement = { id: number; title: string; body: string; audience: string; published_at: string };

export default function Notifications() {
  const { session, role } = useAuth();
  const [rows, setRows] = useState<Announcement[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("all");
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState<{ message?: string; error?: string }>({});
  const manager = role === "sccs_admin_team_role" || role === "sccs_superadmin_role";

  const load = useCallback(async () => {
    const result = await supabase.from("announcements").select("id,title,body,audience,published_at").order("published_at", { ascending: false }).limit(100);
    setRows(result.data || []);
    if (result.error) setStatus({ error: result.error.message });
    setBusy(false);
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load, role]);

  const publish = async () => {
    if (!session) return;
    setBusy(true);
    setStatus({});
    try {
      const result = await supabase.from("announcements").insert({
        title: title.trim(), body: body.trim(), audience, created_by: session.user.id,
      }).select("id").single();
      if (result.error) throw result.error;
      setTitle("");
      setBody("");
      setStatus({ message: "School notice published." });
      await load();
    } catch (error) {
      setStatus({ error: error instanceof Error ? error.message : "Could not publish school notice." });
    } finally {
      setBusy(false);
    }
  };

  return <Screen refreshing={busy}>
    <Header eyebrow="SCCS" title="School Notices" />
    <Notice {...status} />
    {manager && <Card>
      <Text style={ui.heading}>Publish school notice</Text>
      <Field label="Title" value={title} onChangeText={setTitle} maxLength={120} />
      <Field label="Message" value={body} onChangeText={setBody} multiline maxLength={2000} />
      <Text style={ui.subheading}>Audience</Text>
      <View style={ui.row}>{[["all", "Everyone"], ["families", "Families"], ["teachers", "Teachers"]].map(([value, label]) => <Pressable key={value} onPress={() => setAudience(value)} style={[styles.audience, audience === value && styles.audienceActive]}><Text style={[styles.audienceText, audience === value && styles.audienceTextActive]}>{label}</Text></Pressable>)}</View>
      <Button title="Publish notice" onPress={publish} disabled={busy || !title.trim() || !body.trim()} />
    </Card>}
    {rows.length ? rows.map((row) => <Card key={row.id}>
      <Text style={ui.heading}>{row.title}</Text>
      <Text style={ui.body}>{row.body}</Text>
      <Text style={ui.muted}>{new Date(row.published_at).toLocaleString()} · {row.audience}</Text>
    </Card>) : <Card><Text style={ui.body}>No school notices have been published.</Text></Card>}
  </Screen>;
}

const styles = StyleSheet.create({ audience: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 9 }, audienceActive: { backgroundColor: colors.blue, borderColor: colors.blue }, audienceText: { color: colors.navy, fontWeight: "700" }, audienceTextActive: { color: colors.white } });
