import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BilingualText, Button, Card, Dropdown, Header, Notice, Screen, ui } from "@/components/ui";
import { colors } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { fullName, type Course, type Registration, type Student } from "@/lib/types";
import { useAuth } from "@/providers/auth";
import { useLanguage } from "@/providers/language";

export default function Courses() {
  const { session } = useAuth(); const [students, setStudents] = useState<Student[]>([]); const [courses, setCourses] = useState<Course[]>([]); const [registrations, setRegistrations] = useState<Record<number, Registration>>({}); const [busy, setBusy] = useState(true); const [status, setStatus] = useState<{ message?: string; error?: string }>({});
  const { t } = useLanguage();
  const load = useCallback(async () => {
    if (!session) return;
    const family = await supabase.from("families").select("id").eq("user_id", session.user.id).maybeSingle();
    const [classResult, studentResult] = await Promise.all([
      supabase.from("public_course_schedule").select("id,name,short_name,type,classroom,class_time_id,display_time,donation").eq("is_open", true).order("class_time_id").order("name"),
      family.data ? supabase.from("students").select("*").eq("family_id", family.data.id).order("created_at") : Promise.resolve({ data: [], error: null }),
    ]);
    setCourses((classResult.data || []) as Course[]); setStudents((studentResult.data || []) as Student[]);
    const ids = (studentResult.data || []).map((row: Student) => row.id);
    if (ids.length) {
      const result = await supabase.from("class_registrations").select("*").in("student_id", ids);
      setRegistrations(Object.fromEntries((result.data || []).map((row: Registration) => [row.student_id, row])));
      if (result.error) setStatus({ error: result.error.message });
    }
    if (classResult.error || studentResult.error) setStatus({ error: classResult.error?.message || studentResult.error?.message });
    setBusy(false);
  }, [session]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const choose = (studentId: number, sessionNumber: number, courseId: number | null) => setRegistrations((current) => ({
    ...current, [studentId]: { ...(current[studentId] || {}), student_id: studentId, [`session_${sessionNumber}`]: courseId },
  }));
  const save = async (studentId: number, clear = false) => {
    const row = registrations[studentId] || { student_id: studentId };
    const payload = { student_id: studentId, session_1: clear ? null : row.session_1 || null, session_2: clear ? null : row.session_2 || null, session_3: clear ? null : row.session_3 || null };
    const { error } = await supabase.from("class_registrations").upsert(payload, { onConflict: "student_id" });
    if (error) setStatus({ error: error.message }); else { setStatus({ message: clear ? "All classes cancelled. / 已取消全部课程。" : "Registration saved. / 课程报名已保存。" }); await load(); }
  };
  const sessionCourses = (number: number) => courses.filter((course) => Number(course.class_time_id) === number);
  return <Screen refreshing={busy}>
    <Header eyebrow="2026–2027 School Year" eyebrowZh="2026–2027 学年" title="Course Registration" titleZh="课程报名"><BilingualText en="Select one course for each available session, then save each student." zh="每个时段选择一门课程，然后保存每位学生的报名。" style={ui.body} /></Header>
    <Notice {...status} />
    {!students.length && <Card><BilingualText en="Add a student from the Family tab before registering." zh="请先在家庭页面添加学生，再进行课程报名。" style={ui.body} /></Card>}
    {students.map((student) => {
      const registration = registrations[student.id] || { student_id: student.id };
      return <Card key={student.id}>
        <Text style={ui.heading}>{fullName(student)}</Text>
        {[1, 2, 3].map((number) => {
          const available = sessionCourses(number); const field = `session_${number}` as keyof Registration;
          const selectedId = registration[field] as number | null | undefined;
          const selected = available.find((course) => course.id === selectedId);
          return <View key={number} style={styles.session}>
            <BilingualText en={`Session ${number}`} zh={`第 ${number} 时段`} style={ui.subheading} size={16} />
            {available.length ? <>
              <Dropdown
                value={selectedId}
                options={available.map((course) => ({ value: course.id, label: course.name || course.short_name || t("Course", "课程"), detail: `${course.display_time || t("Time TBD", "时间待定")} · ${course.classroom || t("Room TBD", "教室待定")} · $${course.donation || 0}` }))}
                placeholder="Select a course"
                placeholderZh="选择课程"
                onChange={(value) => choose(student.id, number, value)}
              />
              {selected && <View style={styles.details}><Text style={styles.courseName}>{selected.name || selected.short_name}</Text><Text style={ui.muted}>{selected.display_time || t("Time TBD", "时间待定")} · {selected.classroom || t("Room TBD", "教室待定")}</Text><Text style={styles.price}>${selected.donation || 0}</Text></View>}
            </> : <BilingualText en="No open courses in this session." zh="此时段暂无开放课程。" style={ui.muted} size={13} />}
          </View>;
        })}
        <Button title="Save registration" titleZh="保存报名" onPress={() => save(student.id)} />
        <Button title="Cancel all classes" titleZh="取消全部课程" kind="danger" onPress={() => save(student.id, true)} />
      </Card>;
    })}
  </Screen>;
}
const styles = StyleSheet.create({
  session: { gap: 7 }, details: { borderRadius: 10, padding: 11, backgroundColor: colors.cream, gap: 3 },
  courseName: { color: colors.navy, fontWeight: "700", fontSize: 15 }, price: { color: colors.blue, fontWeight: "800" },
});
