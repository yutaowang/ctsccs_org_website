import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { Button, Card, Header, Notice, Screen, ui } from "@/components/ui";
import { colors } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { fullName, type Course, type Registration, type Student } from "@/lib/types";
import { useAuth } from "@/providers/auth";

export default function Courses() {
  const { session } = useAuth(); const [students, setStudents] = useState<Student[]>([]); const [courses, setCourses] = useState<Course[]>([]); const [registrations, setRegistrations] = useState<Record<number, Registration>>({}); const [busy, setBusy] = useState(true); const [status, setStatus] = useState<{ message?: string; error?: string }>({});
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
    if (error) setStatus({ error: error.message }); else { setStatus({ message: clear ? "All classes cancelled." : "Registration saved." }); await load(); }
  };
  const sessionCourses = (number: number) => courses.filter((course) => Number(course.class_time_id) === number);
  return <Screen refreshing={busy}>
    <Header eyebrow="2026–2027" title="Course Registration"><Text style={ui.body}>Select one course for each available session, then save each student.</Text></Header>
    <Notice {...status} />
    {!students.length && <Card><Text style={ui.body}>Add a student from the Family tab before registering.</Text></Card>}
    {students.map((student) => {
      const registration = registrations[student.id] || { student_id: student.id };
      return <Card key={student.id}>
        <Text style={ui.heading}>{fullName(student)}</Text>
        {[1, 2, 3].map((number) => {
          const available = sessionCourses(number); const field = `session_${number}` as keyof Registration;
          const selectedId = registration[field] as number | null | undefined;
          const selected = available.find((course) => course.id === selectedId);
          return <View key={number} style={styles.session}>
            <Text style={ui.subheading}>Session {number}</Text>
            {available.length ? <>
              <View style={styles.pickerBorder}><Picker accessibilityLabel={`Select a course for session ${number}`} selectedValue={selectedId ?? 0} onValueChange={(value) => choose(student.id, number, Number(value) || null)} style={styles.picker} dropdownIconColor={colors.navy}>
                <Picker.Item label="Select a course" value={0} color={colors.muted} />
                {available.map((course) => <Picker.Item key={course.id} label={`${course.name || course.short_name || "Course"} — ${course.display_time || "Time TBD"}`} value={course.id} />)}
              </Picker></View>
              {selected && <View style={styles.details}><Text style={styles.courseName}>{selected.name || selected.short_name}</Text><Text style={ui.muted}>{selected.display_time || "Time TBD"} · {selected.classroom || "Room TBD"}</Text><Text style={styles.price}>${selected.donation || 0}</Text></View>}
            </> : <Text style={ui.muted}>No open courses in this session.</Text>}
          </View>;
        })}
        <Button title="Save registration" onPress={() => save(student.id)} />
        <Button title="Cancel all classes" kind="danger" onPress={() => save(student.id, true)} />
      </Card>;
    })}
  </Screen>;
}
const styles = StyleSheet.create({
  session: { gap: 7 }, pickerBorder: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.white, overflow: "hidden" },
  picker: { color: colors.navy, minHeight: 52 }, details: { borderRadius: 10, padding: 11, backgroundColor: colors.cream, gap: 3 },
  courseName: { color: colors.navy, fontWeight: "700", fontSize: 15 }, price: { color: colors.blue, fontWeight: "800" },
});
