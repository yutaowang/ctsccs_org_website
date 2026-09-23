import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BilingualText, Button, Card, Field, Header, Notice, Screen, ui } from "@/components/ui";
import { siteUrl, supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";
import { useAuth } from "@/providers/auth";
import { useLanguage } from "@/providers/language";

type Announcement = { id: number; title: string; body: string; audience: string; published_at: string };
const audiences = [["all", "Everyone", "所有人"], ["families", "Families", "家庭"], ["teachers", "Teachers", "教师"]];

export default function Notifications() {
  const { session, role } = useAuth();
  const { t } = useLanguage();
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
      const response = await fetch(`${siteUrl}/api/send-push-notification`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), audience }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("Could not publish notification.", "无法发布通知。"));
      setTitle("");
      setBody("");
      setStatus({ message: t(`Notification published to ${result.sent} device${result.sent === 1 ? "" : "s"}.`, `通知已发送至 ${result.sent} 台设备。`) });
      await load();
    } catch (error) {
      setStatus({ error: error instanceof Error ? error.message : t("Could not publish notification.", "无法发布通知。") });
    } finally {
      setBusy(false);
    }
  };

  return <Screen refreshing={busy}>
    <Header eyebrow="SCCS" eyebrowZh="中文学校" title="School Notices" titleZh="学校通知" />
    <Notice {...status} />
    {manager && <Card>
      <BilingualText en="Publish school notice" zh="发布学校通知" style={ui.heading} size={19} />
      <Field label="Title" labelZh="标题" value={title} onChangeText={setTitle} maxLength={120} />
      <Field label="Message" labelZh="内容" value={body} onChangeText={setBody} multiline maxLength={2000} />
      <BilingualText en="Audience" zh="接收对象" style={ui.subheading} size={16} />
      <View style={ui.row}>{audiences.map(([value, label, labelZh]) => <Pressable key={value} onPress={() => setAudience(value)} style={[styles.audience, audience === value && styles.audienceActive]}><BilingualText en={label} zh={labelZh} style={[styles.audienceText, audience === value && styles.audienceTextActive]} /></Pressable>)}</View>
      <Button title="Publish and Send Push" titleZh="发布并推送通知" onPress={publish} disabled={busy || !title.trim() || !body.trim()} />
    </Card>}
    {rows.length ? rows.map((row) => <Card key={row.id}>
      <Text style={ui.heading}>{row.title}</Text>
      <Text style={ui.body}>{row.body}</Text>
      <Text style={ui.muted}>{new Date(row.published_at).toLocaleString()} · {(() => { const label = audiences.find(([key]) => key === row.audience); return label ? t(label[1], label[2]) : row.audience; })()}</Text>
    </Card>) : <Card><BilingualText en="No school notices have been published." zh="暂未发布学校通知。" style={ui.body} /></Card>}
  </Screen>;
}

const styles = StyleSheet.create({ audience: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 9 }, audienceActive: { backgroundColor: colors.blue, borderColor: colors.blue }, audienceText: { color: colors.navy, fontWeight: "700" }, audienceTextActive: { color: colors.white } });
