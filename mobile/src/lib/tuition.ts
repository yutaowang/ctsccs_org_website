import type { Course, Registration, Seat } from "./types";
export const money = (value: number) => `$${Number(value || 0).toLocaleString()}`;
export function hasFreeSeat(course: Course, studentId: number, seats: Seat[]) {
  return /^CHN\d*$/i.test(String(course.type || "").trim()) && seats.some((seat) => seat.student_id === studentId && seat.class_id === course.id && seat.seat_number != null && !seat.released_at);
}
export function courseCharge(course: Course, studentId: number, seats: Seat[]) {
  const tuition = Number(course.donation || 0);
  if (!hasFreeSeat(course, studentId, seats)) return tuition;
  return /maliping/i.test(String(course.name || "")) ? Math.min(tuition, 80) : 0;
}
export function tuitionTotal(registrations: Registration[], courses: Course[], seats: Seat[]) {
  return registrations.reduce((total, registration) => total + [...new Set([registration.session_1, registration.session_2, registration.session_3].filter((id): id is number => typeof id === "number"))]
    .reduce((sum, id) => sum + courseCharge(courses.find((course) => course.id === id) || { id: Number(id) }, registration.student_id, seats), 0), 0);
}
