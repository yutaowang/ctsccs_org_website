export type AppRole = "sccs_family_role" | "sccs_teacher_ta_role" | "sccs_admin_team_role" | "sccs_superadmin_role";
export type Family = { id: number; user_id: string; legacy_family_id?: number; email?: string; parent_first_name?: string; parent_last_name?: string; parent_chinese_name?: string; address?: string; city?: string; state?: string; zip?: string; phone?: string; waterford_resident?: boolean };
export type Student = { id: number; family_id: number; first_name?: string; last_name?: string; chinese_name?: string; gender?: string; birth_year?: string };
export type Course = { id: number; name?: string; short_name?: string; type?: string; donation?: number; classroom?: string; class_time_id?: number; display_time?: string; maximum?: number; is_open?: boolean; class_times?: { display_time?: string } | null };
export type Registration = { id?: number; student_id: number; session_1?: number | null; session_2?: number | null; session_3?: number | null };
export type Seat = { student_id: number; class_id: number; seat_number?: number | null; released_at?: string | null };
export type AttendanceStatus = "present" | "late" | "excused" | "absent";
export const fullName = (row?: { first_name?: string; last_name?: string; parent_first_name?: string; parent_last_name?: string }) => row ? [row.first_name || row.parent_first_name, row.last_name || row.parent_last_name].filter(Boolean).join(" ") : "";
