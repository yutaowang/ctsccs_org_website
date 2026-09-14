// Discounts are granted by the database ledger, never inferred from residency.
export const isChineseCourse = (course) => /^CHN\d*$/i.test(String(course?.type || "").trim());

export const isWaterfordResident = (family) => Boolean(family?.waterford_resident)
  || String(family?.city || "").trim().toLowerCase() === "waterford";

export function patrolDepositFromBilling(familyId, deposits = []) {
  const amount = deposits.find((row) => String(row.family_id) === String(familyId))?.amount;
  return amount === 0 || amount === 40 ? amount : null;
}

export function hasFreeWaterfordSeat(course, studentId, seats) {
  return isChineseCourse(course) && seats.some((seat) => (
    String(seat.student_id) === String(studentId)
    && String(seat.class_id) === String(course.id)
    && seat.seat_number != null
    && seat.released_at == null
  ));
}

export function tuitionForCourses(courses, studentId, seats) {
  return [...new Map(courses.map((course) => [course.id, course])).values()]
    .reduce((sum, course) => sum + (hasFreeWaterfordSeat(course, studentId, seats)
      ? 0 : Number(course.donation || 0)), 0);
}

export function tuitionForRegistrations(registrations, classes, seats) {
  return registrations.reduce((sum, registration) => {
    const ids = [registration.session_1, registration.session_2, registration.session_3];
    const courses = classes.filter((course) => ids.includes(course.id));
    return sum + tuitionForCourses(courses, registration.student_id, seats);
  }, 0);
}
