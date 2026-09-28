import type { Course, Registration, Seat } from "./types";
export const money = (value: number) => `$${Number(value || 0).toLocaleString()}`;
export function registrationCourseIds(registration?: Partial<Registration>) {
  return [...new Set([registration?.session_1, registration?.session_2, registration?.session_3]
    .map((id) => Number(id))
    .filter((id) => Number.isSafeInteger(id) && id > 0))];
}
export function hasFreeSeat(course: Course, studentId: number, seats: Seat[]) {
  return /^CHN\d*$/i.test(String(course.type || "").trim()) && seats.some((seat) => String(seat.student_id) === String(studentId) && String(seat.class_id) === String(course.id) && seat.seat_number != null && !seat.released_at);
}
export function courseCharge(course: Course, studentId: number, seats: Seat[]) {
  const tuition = Number(course.donation || 0);
  if (!hasFreeSeat(course, studentId, seats)) return tuition;
  return /maliping/i.test(String(course.name || "")) ? Math.min(tuition, 80) : 0;
}
export function tuitionTotal(registrations: Registration[], courses: Course[], seats: Seat[]) {
  return registrations.reduce((total, registration) => total + registrationCourseIds(registration)
    .reduce((sum, id) => sum + courseCharge(courses.find((course) => String(course.id) === String(id)) || { id }, registration.student_id, seats), 0), 0);
}
