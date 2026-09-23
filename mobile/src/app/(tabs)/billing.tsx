import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BilingualText, Card, Header, Notice, Screen, ui } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";
import { money, tuitionTotal } from "@/lib/tuition";
import type { Course, Family, Registration, Seat, Student } from "@/lib/types";
import { fullName } from "@/lib/types";
import { useAuth } from "@/providers/auth";
import { useLanguage } from "@/providers/language";

type BillingSnapshot = { registrations: Registration[]; classes: Course[]; seats: Seat[]; deposits: { family_id: number; amount: number }[]; usage: { used: number; waiting: number } };
type Payment = { id: number; amount_cents: number; status: string; paid_at?: string; payment_method?: string };
type StudentCourses = { student: Student; courses: Course[] };
const paymentStatuses: Record<string, { en: string; zh: string }> = { paid: { en: "Paid", zh: "已付款" }, refunded: { en: "Refunded", zh: "已退款" }, pending: { en: "Pending", zh: "待处理" } };

export default function Billing() {
  const { session } = useAuth();
  const { t } = useLanguage();
  const [family, setFamily] = useState<Family | null>(null);
  const [billing, setBilling] = useState<BillingSnapshot | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [schedule, setSchedule] = useState<Course[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState<{ message?: string; error?: string }>({});

  const load = useCallback(async () => {
    if (!session) return;
    setBusy(true); setStatus({});
    const familyResult = await supabase.from("families").select("*").eq("user_id", session.user.id).maybeSingle();
    setFamily(familyResult.data);
    if (familyResult.error) setStatus({ error: familyResult.error.message });
    if (familyResult.data) {
      const [snapshotResult, paymentResult, studentResult, scheduleResult] = await Promise.all([
        supabase.rpc("waterford_billing_snapshot", { target_family_id: familyResult.data.id }),
        supabase.from("payments").select("*").eq("family_id", familyResult.data.id).order("paid_at", { ascending: false }),
        supabase.from("students").select("*").eq("family_id", familyResult.data.id).order("id"),
        supabase.from("public_course_schedule").select("id,name,short_name,type,classroom,teacher_short_name,teacher_name,class_time_id,display_time,donation"),
      ]);
      const snapshot = snapshotResult.data as BillingSnapshot | null;
      if (snapshot) {
        const scheduleById = new Map((scheduleResult.data || []).map((course) => [course.id, course]));
        snapshot.classes = snapshot.classes.map((course) => ({ ...course, ...scheduleById.get(course.id) }));
      }
      setBilling(snapshot); setPayments(paymentResult.data || []); setStudents(studentResult.data || []); setSchedule(scheduleResult.data || []);
      const error = snapshotResult.error || paymentResult.error || studentResult.error || scheduleResult.error;
      if (error) setStatus({ error: error.message });
    }
    setBusy(false);
  }, [session]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const courseById = useMemo(() => new Map((schedule.length ? schedule : (billing?.classes || [])).map((course) => [course.id, course])), [billing, schedule]);
  const registrationsByStudent = useMemo<StudentCourses[]>(() => students.map((student) => {
    const registration = billing?.registrations.find((row) => row.student_id === student.id);
    const ids = [...new Set([registration?.session_1, registration?.session_2, registration?.session_3].filter((id): id is number => typeof id === "number"))];
    const courses = ids.map((id) => courseById.get(id)).filter((course): course is Course => Boolean(course)).sort((a, b) => Number(a.class_time_id || 0) - Number(b.class_time_id || 0));
    return { student, courses };
  }).filter((row) => row.courses.length > 0), [billing, courseById, students]);
  const subtotal = useMemo(() => !billing ? 0 : billing.registrations.reduce((sum, row) => sum + [...new Set([row.session_1, row.session_2, row.session_3].filter((id): id is number => typeof id === "number"))].reduce((courseSum, id) => courseSum + Number(billing.classes.find((course) => course.id === id)?.donation || 0), 0), 0), [billing]);
  const tuition = billing ? tuitionTotal(billing.registrations, billing.classes, billing.seats) : 0;
  const deposit = billing?.deposits?.find((row) => row.family_id === family?.id)?.amount ?? 0;
  const due = tuition + deposit;
  const paid = payments.filter((row) => row.status === "paid").reduce((sum, row) => sum + Number(row.amount_cents || 0) / 100, 0) - payments.filter((row) => row.status === "refunded").reduce((sum, row) => sum + Number(row.amount_cents || 0) / 100, 0);

  return <Screen refreshing={busy}>
    <Header eyebrow="Family account" eyebrowZh="家庭账户" title="Tuition & Payment" titleZh="学费与付款" />
    <Notice {...status} />
    {!family ? <Card><BilingualText en="Complete the family profile first." zh="请先完善家庭资料。" style={ui.body} /></Card> : <>
      <Card>
        <BilingualText en="Course breakdown" zh="课程费用明细" style={ui.heading} size={19} />
        {registrationsByStudent.length ? registrationsByStudent.map(({ student, courses }) => <View key={student.id} style={styles.studentBlock}>
          <Text style={styles.studentName}>{fullName(student) || t("Student", "学生")}{student.chinese_name ? ` · ${student.chinese_name}` : ""}</Text>
          {courses.map((course) => <View key={course.id} style={styles.courseRow}>
            <View style={styles.courseMain}>
              <Text style={styles.courseName}>{course.name || course.short_name || t("Course", "课程")}</Text>
              <Text style={ui.muted}>{course.display_time || t("Time TBD", "时间待定")} · {t("Room", "教室")} {course.classroom || t("TBD", "待定")}</Text>
              <Text style={ui.muted}>{t("Teacher", "教师")}: {course.teacher_name || course.teacher_short_name || t("TBD", "待定")}</Text>
            </View>
            <Text style={styles.courseAmount}>{money(Number(course.donation || 0))}</Text>
          </View>)}
        </View>) : <BilingualText en="No registered courses." zh="暂无已注册课程。" style={ui.muted} size={13} />}
      </Card>
      <Card>
        <View style={ui.between}><BilingualText en="Tuition subtotal" zh="学费小计" style={ui.body} /><Text style={ui.subheading}>{money(subtotal)}</Text></View>
        <View style={ui.between}><BilingualText en="Waterford discount" zh="Waterford 学费减免" style={ui.body} /><Text style={ui.subheading}>-{money(subtotal - tuition)}</Text></View>
        <View style={ui.between}><BilingualText en="Safety Patrol Deposit" zh="安全巡逻押金" style={ui.body} /><Text style={ui.subheading}>{money(deposit)}</Text></View>
        <View style={ui.divider} />
        <View style={ui.between}><BilingualText en="Total due" zh="应付总额" style={ui.heading} size={19} /><Text style={ui.amount}>{money(due)}</Text></View>
        <View style={ui.between}><BilingualText en="Payments received" zh="已收款" style={ui.body} /><Text style={ui.subheading}>{money(paid)}</Text></View>
        <View style={styles.paymentNotice}><BilingualText en="Southeastern Connecticut Chinese School currently accepts cash and checks only. Please come to the school on Sunday to register and make your payment." zh="东南康州中文学校目前只接受现金和支票，请于周日来中文学校注册付款。" style={styles.paymentNoticeText} size={14} /></View>
      </Card>
      {billing && <Card><BilingualText en="Waterford seats" zh="Waterford 免费席位" style={ui.heading} size={19} /><BilingualText en={`${billing.usage.used}/20 free Chinese-course seats used school-wide.`} zh={`全校已使用 ${billing.usage.used}/20 个免费中文课席位。`} style={ui.body} /><BilingualText en="Maliping courses retain the $80 book fee when a free seat is awarded." zh="Maliping 课程获得免费席位后仍需支付 80 美元书本费。" style={ui.muted} size={13} /></Card>}
      <Card>
        <BilingualText en="Payment history" zh="付款记录" style={ui.heading} size={19} />
        {payments.length ? payments.map((row) => { const label = paymentStatuses[row.status]; return <View key={row.id} style={ui.between}><Text style={ui.body}>{label ? t(label.en, label.zh) : row.status} · {row.paid_at ? new Date(row.paid_at).toLocaleDateString() : ""}</Text><Text style={ui.subheading}>{money(row.amount_cents / 100)}</Text></View>; }) : <BilingualText en="No payments recorded." zh="暂无付款记录。" style={ui.muted} size={13} />}
      </Card>
    </>}
  </Screen>;
}

const styles = StyleSheet.create({
  studentBlock: { gap: 4, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, marginTop: 2 },
  studentName: { color: colors.navy, fontSize: 18, fontWeight: "900", marginBottom: 2 },
  courseRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  courseMain: { flex: 1, gap: 3 }, courseName: { color: colors.navy, fontSize: 15, fontWeight: "800" }, courseAmount: { color: colors.navy, fontSize: 16, fontWeight: "800" },
  paymentNotice: { backgroundColor: "#fff5cc", borderColor: colors.gold, borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 4 },
  paymentNoticeText: { color: colors.navy, fontSize: 14, lineHeight: 21, fontWeight: "700" },
});
