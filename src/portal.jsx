import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth";
import { courseDescriptionLinkFor } from "./pages";
import { supabase } from "./supabase";

const roles = {
  family: "sccs_family_role",
  teacher: "sccs_teacher_ta_role",
  team: "sccs_admin_team_role",
  superadmin: "sccs_superadmin_role",
};
const familyFields = [
  "parent_first_name", "parent_last_name", "parent_chinese_name",
  "address", "city", "state", "zip", "phone", "wechat",
];
const studentFields = ["first_name", "last_name", "chinese_name", "gender", "birth_year"];
const blank = (fields) => Object.fromEntries(fields.map((field) => [field, ""]));
const fullName = (row) => [
  row?.first_name || row?.parent_first_name,
  row?.last_name || row?.parent_last_name,
].filter(Boolean).join(" ");
const hasFamilyId = (value) => String(value ?? "").trim() !== "";

const teacherLabel = (teacher) => (
  fullName(teacher) || teacher?.short_name || teacher?.email_1 || `Teacher ${teacher?.id || ""}`.trim()
);

const teacherForCourse = (course, teachers, assignments) => {
  const assignment = assignments.find((row) => row.class_id === course?.id);
  const assignedTeacher = teachers.find((row) => row.id === assignment?.teacher_id);
  const shortNameTeacher = teachers.find((row) => (
    String(row.short_name || "").trim().toLowerCase()
    === String(course?.teacher_short_name || "").trim().toLowerCase()
  ));
  return assignedTeacher || shortNameTeacher;
};

const teacherDisplayName = (course, teachers, assignments, fallback = "TBD") => {
  if (course?.teacher_name) return course.teacher_name;
  const teacher = teacherForCourse(course, teachers, assignments);
  return fullName(teacher) || teacher?.short_name || course?.teacher_short_name || fallback;
};

const sortPrimitive = (value) => {
  if (React.isValidElement(value)) return "";
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim();
  if (text && !Number.isNaN(Number(text))) return Number(text);
  return text.toLowerCase();
};

const compareValues = (left, right) => {
  const normalizedLeft = sortPrimitive(left);
  const normalizedRight = sortPrimitive(right);
  if (typeof normalizedLeft === "number" && typeof normalizedRight === "number") {
    return normalizedLeft - normalizedRight;
  }
  return String(normalizedLeft).localeCompare(String(normalizedRight), undefined, {
    numeric: true,
    sensitivity: "base",
  });
};

const sortedByLabel = (items, labelFor) => (
  [...items].sort((left, right) => compareValues(labelFor(left), labelFor(right)))
);
const familySortLabel = (family) => (
  `${fullName(family) || ""} ${family?.email || ""} ${family?.legacy_family_id || family?.id || ""}`
);

const fetchAllRows = async (buildQuery, pageSize = 1000) => {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const result = await buildQuery().range(from, from + pageSize - 1);
    if (result.error) return { data: rows, error: result.error };
    rows.push(...(result.data || []));
    if (!result.data || result.data.length < pageSize) {
      return { data: rows, error: null };
    }
  }
};

const donationAmount = (course) => Number(course?.donation || 0);
const donationTotal = (courses) => courses.reduce((sum, course) => sum + donationAmount(course), 0);
const registeredClassIds = (registration) => [1, 2, 3]
  .map((number) => registration?.[`session_${number}`])
  .filter(Boolean);
const formatDonation = (value) => `$${Number(value || 0).toLocaleString()}`;
const formatPaymentAmount = (cents, currency = "usd") => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: String(currency || "usd").toUpperCase(),
}).format(Number(cents || 0) / 100);
const formatTimestamp = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
};
const csvEscape = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const SAFETY_PATROL_DEPOSIT = 40;

const classStatusRank = (course) => (course?.is_open === false ? 1 : 0);

function settingDate(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.date || value.deadline || value.text || "";
}

function isDateOpenThrough(dateText) {
  if (!dateText) return true;
  const date = new Date(`${dateText}T23:59:59`);
  if (Number.isNaN(date.getTime())) return true;
  return Date.now() <= date.getTime();
}

function PortalLayout({ title, tabs, active, setActive, children }) {
  const { session, role, signOut } = useAuth();
  return (
    <article className="inner-page portal-page">
      <header className="page-title">
        <span>Online Registration</span>
        <h1>{title}</h1>
      </header>
      <section className="page-section portal-card">
        <div className="portal-identity">
          <div>
            <strong>{session?.user.email}</strong>
            <small>{role.replaceAll("_", " ")}</small>
          </div>
          <button className="outline-link" type="button" onClick={signOut}>Log out</button>
        </div>
        <nav className="portal-tabs" aria-label="Account sections">
          {tabs.map(([key, label]) => (
            <button
              className={active === key ? "is-active" : ""}
              type="button"
              onClick={() => setActive(key)}
              key={key}
            >
              {label}
            </button>
          ))}
        </nav>
        {children}
      </section>
    </article>
  );
}

function Status({ status }) {
  if (!status.error && !status.message) return null;
  return (
    <div className={`form-message ${status.error ? "error" : ""}`}>
      {status.error || status.message}
    </div>
  );
}

function FamilyPortal() {
  const { session, recovering, finishRecovery } = useAuth();
  const [active, setActive] = useState(recovering ? "password" : "summary");
  const [family, setFamily] = useState({ ...blank(familyFields), state: "CT" });
  const [students, setStudents] = useState([]);
  const [student, setStudent] = useState(blank(studentFields));
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [registrations, setRegistrations] = useState({});
  const [familyPayments, setFamilyPayments] = useState([]);
  const [registrationDeadline, setRegistrationDeadline] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState({ error: "", message: "" });
  const [paymentBusy, setPaymentBusy] = useState(false);

  const load = async () => {
    const [classResult, familyResult, settingResult] = await Promise.all([
      supabase.from("public_course_schedule")
        .select("id, name, short_name, type, classroom, teacher_short_name, teacher_name, class_time_id, display_time, donation")
        .eq("is_open", true).order("name"),
      supabase.from("families").select("*")
        .eq("user_id", session.user.id).maybeSingle(),
      supabase.from("site_settings").select("value")
        .eq("key", "registration_change_deadline").maybeSingle(),
    ]);
    if (!classResult.error) setClasses(classResult.data || []);
    if (!settingResult.error) setRegistrationDeadline(settingDate(settingResult.data?.value));
    const [teacherResult, assignmentResult] = await Promise.all([
      supabase.from("teachers").select("*"),
      supabase.from("teacher_classes").select("*"),
    ]);
    if (!teacherResult.error) setTeachers(teacherResult.data || []);
    if (!assignmentResult.error) setAssignments(assignmentResult.data || []);
    if (familyResult.error) {
      setStatus({ error: familyResult.error.message, message: "" });
      return;
    }
    if (!familyResult.data) {
      setFamilyPayments([]);
      return;
    }
    setFamily(familyResult.data);
    const [studentResult, paymentResult] = await Promise.all([
      supabase.from("students")
        .select("*").eq("family_id", familyResult.data.id).order("created_at"),
      supabase.from("payments")
        .select("*").eq("family_id", familyResult.data.id).order("paid_at", { ascending: false }),
    ]);
    if (paymentResult.error) {
      setStatus({ error: paymentResult.error.message, message: "" });
      return;
    }
    setFamilyPayments(paymentResult.data || []);
    if (studentResult.error) {
      setStatus({ error: studentResult.error.message, message: "" });
      return;
    }
    const rows = studentResult.data || [];
    setStudents(rows);
    if (!rows.length) {
      setRegistrations({});
      return;
    }
    const registrationResult = await supabase.from("class_registrations")
      .select("*").in("student_id", rows.map((row) => row.id));
    if (!registrationResult.error) {
      setRegistrations(Object.fromEntries(
        (registrationResult.data || []).map((row) => [row.student_id, row]),
      ));
    }
  };

  useEffect(() => {
    let cancelled = false;
    const syncPayment = async () => {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get("session_id");
      if (params.get("payment") !== "success" || !sessionId) return;
      setStatus({ error: "", message: "Confirming online payment..." });
      try {
        const result = await fetch("/api/sync-checkout-session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ session_id: sessionId }),
        });
        const body = await result.json().catch(() => ({}));
        if (!result.ok) throw new Error(body.error || "Could not confirm online payment.");
        if (cancelled) return;
        window.history.replaceState({}, "", "/account?payment=success");
        setStatus({ error: "", message: "Online payment confirmed." });
        await load();
      } catch (error) {
        if (!cancelled) setStatus({ error: error.message, message: "" });
      }
    };
    void syncPayment();
    return () => { cancelled = true; };
  }, [session.access_token]);

  useEffect(() => { load(); }, [session]);
  useEffect(() => { if (recovering) setActive("password"); }, [recovering]);

  const saveFamily = async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(
      familyFields.map((field) => [field, family[field] || null]),
    );
    const result = await supabase.from("families")
      .upsert(
        { ...payload, email: session.user.email, user_id: session.user.id },
        { onConflict: "user_id" },
      ).select().single();
    if (result.error) setStatus({ error: result.error.message, message: "" });
    else {
      setFamily(result.data);
      setStatus({ error: "", message: "Family profile saved." });
    }
  };

  const resetStudentForm = () => {
    setStudent(blank(studentFields));
    setEditingStudentId(null);
  };

  const editStudent = (row) => {
    setStudent(Object.fromEntries(
      studentFields.map((field) => [field, row[field] || ""]),
    ));
    setEditingStudentId(row.id);
  };

  const saveStudent = async (event) => {
    event.preventDefault();
    if (!family.id) {
      setStatus({ error: "Please complete the family profile first.", message: "" });
      setActive("profile");
      return;
    }
    const payload = {
      ...Object.fromEntries(studentFields.map((field) => [field, student[field] || null])),
      birth_year: student.birth_year || null,
      family_id: family.id,
    };
    const result = editingStudentId
      ? await supabase.from("students").update(payload).eq("id", editingStudentId)
      : await supabase.from("students").insert(payload);
    if (result.error) setStatus({ error: result.error.message, message: "" });
    else {
      resetStudentForm();
      setStatus({ error: "", message: editingStudentId ? "Student updated." : "Student added." });
      await load();
    }
  };

  const deleteStudent = async (row) => {
    const name = fullName(row) || "this student";
    if (!window.confirm(`Delete ${name}? This will also remove this student's registration.`)) return;
    const result = await supabase.from("students").delete().eq("id", row.id);
    if (result.error) setStatus({ error: result.error.message, message: "" });
    else {
      if (editingStudentId === row.id) resetStudentForm();
      setStatus({ error: "", message: "Student deleted." });
      await load();
    }
  };

  const saveRegistration = async (studentId, cancel = false) => {
    if (!isDateOpenThrough(registrationDeadline)) {
      setStatus({
        error: `Class changes are closed. The change deadline was ${registrationDeadline}.`,
        message: "",
      });
      return;
    }
    const current = registrations[studentId] || {};
    const payload = {
      student_id: studentId,
      session_1: cancel ? null : current.session_1 || null,
      session_2: cancel ? null : current.session_2 || null,
      session_3: cancel ? null : current.session_3 || null,
    };
    const result = await supabase.from("class_registrations")
      .upsert(payload, { onConflict: "student_id" });
    if (result.error) setStatus({ error: result.error.message, message: "" });
    else {
      setStatus({
        error: "",
        message: cancel ? "All classes cancelled." : "Registration saved.",
      });
      await load();
    }
  };

  const updatePassword = async (event) => {
    event.preventDefault();
    const result = await supabase.auth.updateUser({ password: newPassword });
    if (result.error) setStatus({ error: result.error.message, message: "" });
    else {
      setNewPassword("");
      finishRecovery();
      setStatus({ error: "", message: "Password updated." });
    }
  };

  const courseDetails = (id) => {
    const course = classes.find((row) => row.id === id);
    if (!course) return null;
    const descriptionLink = courseDescriptionLinkFor(course.name || course.short_name);
    return {
      ...course,
      teacher: teacherDisplayName(course, teachers, assignments),
      time: course.class_times?.display_time || course.display_time || "Time TBD",
      classroom: course.classroom || "Room TBD",
      descriptionLink,
    };
  };
  const registeredCoursesFor = (registration) => [1, 2, 3]
    .map((number) => courseDetails(registration?.[`session_${number}`]))
    .filter(Boolean);
  const familyDonationTotal = students.reduce((sum, row) => (
    sum + donationTotal(registeredCoursesFor(registrations[row.id] || {}))
  ), 0);
  const hasRegisteredCourses = students.some((row) => (
    registeredCoursesFor(registrations[row.id] || {}).length > 0
  ));
  const paymentTotal = hasRegisteredCourses ? familyDonationTotal + SAFETY_PATROL_DEPOSIT : 0;
  const paidTotalCents = familyPayments
    .filter((row) => row.status === "paid")
    .reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
  const isPaid = paymentTotal > 0 && paidTotalCents >= Math.round(paymentTotal * 100);
  const tabs = [
    ["summary", "Summary"],
    ["student", "Student"],
    ["register", "Register"],
    ["profile", "Profile"],
    ["password", "Password"],
  ];
  const registrationChangeOpen = isDateOpenThrough(registrationDeadline);
  const startOnlinePayment = async () => {
    setPaymentBusy(true);
    setStatus({ error: "", message: "" });
    try {
      const result = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const body = await result.json();
      if (!result.ok) throw new Error(body.error || "Could not start online payment.");
      window.location.href = body.url;
    } catch (error) {
      setPaymentBusy(false);
      setStatus({ error: error.message, message: "" });
    }
  };

  return (
    <PortalLayout title="Family Account" tabs={tabs} active={active} setActive={setActive}>
      <Status status={status} />
      {active === "summary" && (
        <div className="portal-panel print-area">
          <div className="panel-heading">
            <div><span>账户概览</span><h2>Family Summary</h2></div>
            <button className="outline-link no-print" type="button" onClick={() => window.print()}>
              Print registration summary
            </button>
          </div>
          <dl className="summary-grid">
            <div><dt>Family ID</dt><dd>{family.legacy_family_id || family.id || "New"}</dd></div>
            <div><dt>Parent</dt><dd>{fullName(family) || "Not provided"}</dd></div>
            <div><dt>Email</dt><dd>{session.user.email}</dd></div>
            <div><dt>Phone</dt><dd>{family.phone || "Not provided"}</dd></div>
            <div className="wide"><dt>Address</dt><dd>{[family.address, family.city, family.state, family.zip].filter(Boolean).join(", ") || "Not provided"}</dd></div>
          </dl>
          <h3>Students and registrations</h3>
          {!students.length && <div className="empty-state">No students yet. Use Student to begin.</div>}
          {students.map((row) => {
            const registration = registrations[row.id] || {};
            const registeredCourses = registeredCoursesFor(registration);
            return (
              <div className="student-summary" key={row.id}>
                <div className="student-summary-heading">
                  <strong>{fullName(row)} {row.chinese_name && `· ${row.chinese_name}`}</strong>
                </div>
                {registeredCourses.length ? (
                  <div className="student-course-table data-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Course</th>
                          <th>Classroom</th>
                          <th>Teacher</th>
                          <th>Donation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {registeredCourses.map((course) => (
                          <tr key={course.id}>
                            <td>{course.time}</td>
                            <td>{course.name || course.short_name}</td>
                            <td>{course.classroom}</td>
                            <td>{course.teacher}</td>
                            <td>{formatDonation(course.donation)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <span className="student-no-registration">No classes selected.</span>
                )}
              </div>
            );
          })}
          <div className="donation-summary">
            <div><span>Donation subtotal</span><strong>{formatDonation(familyDonationTotal)}</strong></div>
            <div><span>Safety Patrol Deposit</span><strong>{formatDonation(SAFETY_PATROL_DEPOSIT)}</strong></div>
            <div className="donation-total-row"><span>Total</span><strong>{formatDonation(paymentTotal || familyDonationTotal + SAFETY_PATROL_DEPOSIT)}</strong></div>
          </div>
          <div className="payment-action no-print">
            <button
              className={`button-link ${isPaid ? "is-paid" : ""}`}
              type="button"
              onClick={startOnlinePayment}
              disabled={!paymentTotal || paymentBusy || isPaid}
            >
              {isPaid ? "Paid" : paymentBusy ? "Opening payment..." : "Pay online"}
            </button>
          </div>
          <div className="registration-notes">
            <strong>Notes</strong>
            <p>1. 填写付款信息 Fill out payment information on both copies;</p>
            <p>2. 和支票一起交给注册工作人员 Please bring the Registration Summary along with a payment check to the Registration Desk.</p>
            <p>3. Safety Patrol Deposit: $40 将在家长参与学校值日后退还 $40 will be refunded after parents participate in school safety patrol duty.</p>
          </div>
          <section className="office-use">
            <h3>For Office Use Only</h3>
            <div className="office-use-grid">
              <div><span>FamID:</span><strong>{family.legacy_family_id || family.id || "New"}</strong></div>
              <div><span>Name:</span><strong>{fullName(family) || "Not provided"}</strong></div>
              <div><span>Email:</span><strong>{session.user.email}</strong></div>
              <div><span>Total Amount Received $</span><i /></div>
              <div><span>Check #</span><i /></div>
              <div><span>Cash $</span><i /></div>
              <div><span>Payment Received By:</span><i /></div>
              <div><span>Paid By:</span><i /></div>
              <div><span>Print Name:</span><i /></div>
              <div><span>Signature:</span><i /></div>
              <div><span>Print Name:</span><i /></div>
              <div><span>Signature:</span><i /></div>
            </div>
          </section>
        </div>
      )}
      {active === "student" && (
        <div className="portal-panel">
          <div className="panel-heading">
            <div><span>学生信息</span><h2>Student</h2></div>
          </div>
          {students.length ? (
            <div className="data-table-wrap student-admin-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Chinese Name</th>
                    <th>Gender</th>
                    <th>Birth Year</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((row) => (
                    <tr key={row.id}>
                      <td>{fullName(row) || "Unnamed student"}</td>
                      <td>{row.chinese_name || ""}</td>
                      <td>{row.gender || ""}</td>
                      <td>{row.birth_year || ""}</td>
                      <td>
                        <div className="button-row compact">
                          <button className="outline-link" type="button" onClick={() => editStudent(row)}>Edit</button>
                          <button className="outline-link danger" type="button" onClick={() => deleteStudent(row)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">No students yet. Add a student below.</div>
          )}
          <form className="portal-form embedded" onSubmit={saveStudent}>
            <div className="panel-heading"><div><span>{editingStudentId ? "编辑学生" : "添加学生"}</span><h2>{editingStudentId ? "Edit Student" : "Add Student"}</h2></div></div>
            {studentFields.map((field) => (
              <label key={field}>
                <span>{field.replaceAll("_", " ")}</span>
                {field === "gender" ? (
                  <select value={student[field]} onChange={(event) => setStudent({ ...student, [field]: event.target.value })} required>
                    <option value="">Select</option>
                    {["Female", "Male", "Other"].map((option) => <option key={option}>{option}</option>)}
                  </select>
                ) : (
                  <input
                    value={student[field]}
                    onChange={(event) => setStudent({ ...student, [field]: event.target.value })}
                    required={["first_name", "last_name", "birth_year"].includes(field)}
                    {...(field === "birth_year" ? {
                      inputMode: "numeric",
                      maxLength: 4,
                      pattern: "\\d{4}",
                      placeholder: "YYYY",
                      title: "Enter a 4-digit year, e.g. 2016",
                    } : {})}
                  />
                )}
              </label>
            ))}
            <div className="button-row">
              <button className="button-link" type="submit">{editingStudentId ? "Update student" : "Add student"}</button>
              {editingStudentId && <button className="outline-link" type="button" onClick={resetStudentForm}>Cancel edit</button>}
            </div>
          </form>
        </div>
      )}
      {active === "register" && (
        <div className="portal-panel">
          <div className="panel-heading"><div><span>注册课程</span><h2>Register Classes</h2></div></div>
          {registrationDeadline && (
            <div className={`form-message ${registrationChangeOpen ? "" : "error"}`}>
              Class changes are {registrationChangeOpen ? "open" : "closed"}. Deadline: {registrationDeadline}.
            </div>
          )}
          {!students.length && <div className="empty-state">Please add a student before registering classes.</div>}
          {students.map((row) => (
            <div className="registration-card" key={row.id}>
              <h3>{fullName(row)}</h3>
              <div className="registration-selects">
                {[1, 2, 3].map((number) => {
                  const field = `session_${number}`;
                  return (
                    <label key={field}><span>Session {number}</span>
                      <select
                        value={registrations[row.id]?.[field] || ""}
                        disabled={!registrationChangeOpen}
                        onChange={(event) => setRegistrations({
                          ...registrations,
                          [row.id]: {
                            ...registrations[row.id],
                            student_id: row.id,
                            [field]: event.target.value ? Number(event.target.value) : null,
                          },
                        })}
                      >
                        <option value="">No class</option>
                        {sortedByLabel(
                          classes.filter((course) => Number(course.class_time_id) === number),
                          (course) => course.name || course.short_name || "",
                        ).map((course) => (
                          <option value={course.id} key={course.id}>
                            {course.name}{course.class_times?.display_time || course.display_time ? ` · ${course.class_times?.display_time || course.display_time}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
              <div className="button-row">
                <button className="button-link" type="button" onClick={() => saveRegistration(row.id)} disabled={!registrationChangeOpen}>Save registration</button>
                <button className="outline-link" type="button" onClick={() => saveRegistration(row.id, true)} disabled={!registrationChangeOpen}>Cancel all</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {active === "profile" && (
        <form className="portal-form" onSubmit={saveFamily}>
          <div className="panel-heading">
            <div><span>更新家庭信息</span><h2>Update Profile</h2></div>
            <div className="profile-family-id">Family ID: <strong>{family.legacy_family_id || family.id || "Not assigned"}</strong></div>
          </div>
          {familyFields.map((field) => (
            <label className={field === "address" ? "wide" : ""} key={field}>
              <span>{field.replaceAll("_", " ")}</span>
              <input value={family[field] || ""} onChange={(event) => setFamily({ ...family, [field]: event.target.value })} />
            </label>
          ))}
          <label className="wide"><span>Email / username</span><input value={session.user.email} readOnly /></label>
          <button className="button-link" type="submit">Update profile</button>
        </form>
      )}
      {active === "password" && (
        <form className="portal-form compact" onSubmit={updatePassword}>
          <div className="panel-heading"><div><span>更改密码</span><h2>{recovering ? "Set New Password" : "Change Password"}</h2></div></div>
          <label className="wide"><span>New password</span><input type="password" minLength="8" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
          <button className="button-link" type="submit">Update password</button>
        </form>
      )}
    </PortalLayout>
  );
}

function DataTable({ columns, rows, empty = "No records found." }) {
  const [sort, setSort] = useState(null);
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    return rows.slice().sort((left, right) => {
      const result = compareValues(left[sort.key], right[sort.key]);
      return sort.direction === "asc" ? result : -result;
    });
  }, [rows, sort]);
  const toggleSort = (key) => {
    setSort((current) => (
      current?.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    ));
  };
  if (!rows.length) return <div className="empty-state">{empty}</div>;
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map(([key, label]) => (
              <th key={key}>
                <button
                  className={`sort-header ${sort?.key === key ? "is-active" : ""}`}
                  type="button"
                  onClick={() => toggleSort(key)}
                >
                  <span>{label}</span>
                  <span aria-hidden="true">{sort?.key === key && sort.direction === "desc" ? "v" : "^"}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, index) => (
            <tr key={row.id || `${index}-${columns[0][0]}`}>
              {columns.map(([key]) => <td key={key}>{row[key] ?? ""}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActionTable({ columns, rows, empty = "No records found." }) {
  const [sort, setSort] = useState(null);
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    return rows.slice().sort((left, right) => {
      const result = compareValues(
        left.sortValues?.[sort.index] ?? left.cells[sort.index],
        right.sortValues?.[sort.index] ?? right.cells[sort.index],
      );
      return sort.direction === "asc" ? result : -result;
    });
  }, [rows, sort]);
  const toggleSort = (index) => {
    setSort((current) => (
      current?.index === index
        ? { index, direction: current.direction === "asc" ? "desc" : "asc" }
        : { index, direction: "asc" }
    ));
  };
  if (!rows.length) return <div className="empty-state">{empty}</div>;
  return (
    <div className="data-table-wrap">
      <table className="data-table action-table">
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={column}>
                <button
                  className={`sort-header ${sort?.index === index ? "is-active" : ""}`}
                  type="button"
                  onClick={() => toggleSort(index)}
                >
                  <span>{column}</span>
                  <span aria-hidden="true">{sort?.index === index && sort.direction === "desc" ? "v" : "^"}</span>
                </button>
              </th>
            ))}
            <th className="actions-column" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr key={row.id}>
              {row.cells.map((cell, index) => <td key={`${row.id}-${index}`}>{cell}</td>)}
              <td className="actions-cell">{row.actions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowActions({ onEdit, onDelete, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const buttonRef = React.useRef(null);
  const menuRef = React.useRef(null);

  const placeMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuWidth = 178;
    const actionCount = Number(Boolean(onEdit)) + Number(Boolean(onDelete));
    const menuHeight = Math.max(52, actionCount * 52);
    const gap = 8;
    const viewportPadding = 10;
    const opensLeft = rect.left >= menuWidth + gap + viewportPadding;
    const left = opensLeft
      ? rect.left - menuWidth - gap
      : Math.min(window.innerWidth - menuWidth - viewportPadding, rect.right + gap);
    const top = Math.min(
      window.innerHeight - menuHeight - viewportPadding,
      Math.max(viewportPadding, rect.top + rect.height / 2 - menuHeight / 2),
    );
    setPosition({ left, top });
  };

  useEffect(() => {
    if (!open) return undefined;
    placeMenu();
    const close = (event) => {
      if (buttonRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const update = () => placeMenu();
    document.addEventListener("pointerdown", close);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  return (
    <div className="row-actions">
      <button
        ref={buttonRef}
        className={`row-actions-trigger ${open ? "is-open" : ""}`}
        type="button"
        aria-label="Row actions"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        ...
      </button>
      {open && (
        <div ref={menuRef} className="row-actions-menu" style={position || undefined}>
          {onEdit && <button type="button" onClick={() => { setOpen(false); onEdit(); }}>Edit</button>}
          {onDelete && <button className="danger" type="button" onClick={() => { setOpen(false); onDelete(); }} disabled={disabled}>Delete</button>}
        </div>
      )}
    </div>
  );
}

function StaffUserManager() {
  const { session } = useAuth();
  const emptyForm = {
    id: "",
    email: "",
    password: "",
    role: "sccs_admin_team_role",
    first_name: "",
    last_name: "",
    phone: "",
    title: "",
  };
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState({ error: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [staffSearch, setStaffSearch] = useState("");

  const request = async (method = "GET", body) => {
    const response = await fetch("/api/admin-users", {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Admin account operation failed.");
    return result;
  };

  const load = async () => {
    try {
      const result = await request();
      setUsers(result.users || []);
    } catch (error) {
      setStatus({ error: error.message, message: "" });
    }
  };
  useEffect(() => { load(); }, [session.access_token]);

  const submit = async (event) => {
    event.preventDefault();
    const email = form.email.trim().toLowerCase();
    if (!/^[^\s@]+@ctsccs\.org$/i.test(email)) {
      setStatus({ error: "Admin email is required and must end with @ctsccs.org.", message: "" });
      return;
    }
    setBusy(true);
    setStatus({ error: "", message: "" });
    try {
      await request(form.id ? "PATCH" : "POST", { ...form, email });
      setStatus({
        error: "",
        message: form.id ? "Admin account updated." : "Admin account created.",
      });
      setForm(emptyForm);
      await load();
    } catch (error) {
      setStatus({ error: error.message, message: "" });
    } finally {
      setBusy(false);
    }
  };

  const edit = (user) => {
    setFormOpen(true);
    setForm({
      ...emptyForm,
      id: user.id,
      email: user.email,
      role: "sccs_admin_team_role",
      first_name: user.profile?.first_name || "",
      last_name: user.profile?.last_name || "",
      phone: user.profile?.phone || "",
      title: user.profile?.title || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (user) => {
    if (!window.confirm(`Delete admin account ${user.email}?`)) return;
    setBusy(true);
    try {
      await request("DELETE", { id: user.id });
      setStatus({ error: "", message: "Admin account deleted." });
      if (form.id === user.id) setForm(emptyForm);
      await load();
    } catch (error) {
      setStatus({ error: error.message, message: "" });
    } finally {
      setBusy(false);
    }
  };

  const staffQuery = staffSearch.trim().toLowerCase();
  const filteredUsers = !staffQuery ? users : users.filter((user) => {
    const searchable = [
      user.email,
      user.role,
      "Admin Team Member",
      user.profile?.first_name,
      user.profile?.last_name,
      user.profile?.phone,
      user.profile?.title,
    ].join(" ").toLowerCase();
    return searchable.includes(staffQuery);
  });
  return (
    <div className="portal-panel">
      <div className="panel-heading">
        <div><span>Admin Management</span><h2>Manage Admins</h2></div>
      </div>
      <Status status={status} />
      <p className="staff-help">
        Use this page to create, search, update, and delete admin team login accounts.
        Admin accounts receive <code>sccs_admin_team_role</code>, and email is required to end with <code>@ctsccs.org</code>.
      </p>
      <section className={`collapsible-editor ${formOpen ? "is-open" : ""}`}>
        <button className="collapsible-editor-toggle" type="button" onClick={() => setFormOpen(!formOpen)} aria-expanded={formOpen}>
          <span>{form.id ? "Edit admin user" : "Create admin user"}</span>
          <span aria-hidden="true">{formOpen ? "v" : ">"}</span>
        </button>
        {formOpen && (
          <form className="portal-form staff-user-form" onSubmit={submit}>
            <label><span>Admin email (@ctsccs.org)</span><input type="email" pattern="^[^@\s]+@ctsccs\.org$" title="Email must end with @ctsccs.org" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
            <label><span>{form.id ? "New password (optional)" : "Temporary password"}</span><input type="password" minLength="10" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required={!form.id} /></label>
            <label><span>Role</span><input value="sccs_admin_team_role" disabled /></label>
            <label><span>First name</span><input value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} /></label>
            <label><span>Last name</span><input value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} /></label>
            <label><span>Phone</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
            <label><span>Title</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
            <div className="button-row">
              <button className="button-link" type="submit" disabled={busy}>{form.id ? "Update admin user" : "Create admin user"}</button>
              {form.id && <button className="outline-link" type="button" onClick={() => setForm(emptyForm)}>Cancel edit</button>}
            </div>
          </form>
        )}
      </section>
      <label className="standalone-field staff-search">
        <span>Search admins</span>
        <input value={staffSearch} onChange={(event) => setStaffSearch(event.target.value)} placeholder="Email, name, phone, title, or role" />
      </label>
      <ActionTable
        columns={["Email", "Role", "Name", "Phone", "Title"]}
        rows={filteredUsers.map((user) => ({
          id: user.id,
          cells: [
            user.email,
            "Admin Team Member",
            fullName(user.profile) || "",
            user.profile?.phone || "",
            user.profile?.title || "",
          ],
          actions: <RowActions onEdit={() => edit(user)} onDelete={() => remove(user)} disabled={busy} />,
        }))}
        empty={users.length ? "No admin accounts match this search." : "No admin team member login accounts."}
      />
    </div>
  );
}

function ClassManager({ classes, classTimes, teachers, assignments, registrations, onReload, setStatus }) {
  const emptyClass = {
    id: "",
    short_name: "",
    name: "",
    maximum: "",
    class_time_id: "",
    type: "",
    donation: "",
    classroom: "",
    teacher_short_name: "",
    teacher_id: "",
    is_open: true,
    equivalent: "",
    textbook: "",
  };
  const [form, setForm] = useState(emptyClass);
  const [classSearch, setClassSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const classPayload = () => ({
    short_name: form.short_name.trim() || null,
    name: form.name.trim() || null,
    maximum: form.maximum === "" ? null : Number(form.maximum),
    class_time_id: form.class_time_id ? Number(form.class_time_id) : null,
    type: form.type.trim() || null,
    donation: form.donation === "" ? null : Number(form.donation),
    classroom: form.classroom.trim() || null,
    teacher_short_name: form.teacher_short_name.trim() || null,
    is_open: Boolean(form.is_open),
    equivalent: form.equivalent.trim() || null,
    textbook: form.textbook.trim() || null,
  });

  const saveAssignment = async (classId) => {
    await supabase.from("teacher_classes").delete().eq("class_id", classId);
    if (!form.teacher_id) return { error: null };
    return supabase.from("teacher_classes").insert({
      class_id: classId,
      teacher_id: Number(form.teacher_id),
      is_primary: true,
    });
  };

  const updateClassTeacher = (teacherId) => {
    const teacher = teachers.find((row) => String(row.id) === String(teacherId));
    setForm({
      ...form,
      teacher_id: teacherId,
      teacher_short_name: teacher?.short_name || "",
    });
  };

  const saveClass = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setStatus({ error: "Class name is required.", message: "" });
      return;
    }
    setBusy(true);
    setStatus({ error: "", message: "" });
    const result = form.id
      ? await supabase.from("classes").update(classPayload()).eq("id", form.id).select("id").single()
      : await supabase.from("classes").insert(classPayload()).select("id").single();
    if (result.error) {
      setStatus({ error: result.error.message, message: "" });
      setBusy(false);
      return;
    }
    const assignmentResult = await saveAssignment(result.data.id);
    if (assignmentResult.error) {
      setStatus({ error: assignmentResult.error.message, message: "" });
    } else {
      setForm(emptyClass);
      setStatus({ error: "", message: form.id ? "Class updated." : "Class created." });
      await onReload();
    }
    setBusy(false);
  };

  const editClass = (course) => {
    const assignment = assignments.find((row) => row.class_id === course.id);
    const assignedTeacher = teachers.find((row) => row.id === assignment?.teacher_id);
    setFormOpen(true);
    setForm({
      ...emptyClass,
      id: course.id,
      short_name: course.short_name || "",
      name: course.name || "",
      maximum: course.maximum ?? "",
      class_time_id: course.class_time_id || "",
      type: course.type || "",
      donation: course.donation ?? "",
      classroom: course.classroom || "",
      teacher_short_name: assignedTeacher?.short_name || course.teacher_short_name || "",
      teacher_id: assignment?.teacher_id || "",
      is_open: course.is_open !== false,
      equivalent: course.equivalent || "",
      textbook: course.textbook || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteClass = async (course) => {
    if (!window.confirm(`Delete class ${course.name || course.short_name || course.id}?`)) return;
    setBusy(true);
    const result = await supabase.from("classes").delete().eq("id", course.id);
    if (result.error) {
      setStatus({ error: result.error.message, message: "" });
    } else {
      if (form.id === course.id) setForm(emptyClass);
      setStatus({ error: "", message: "Class deleted." });
      await onReload();
    }
    setBusy(false);
  };

  const query = classSearch.trim().toLowerCase();
  const filteredClasses = (!query ? classes : classes.filter((course) => {
    return [
      course.short_name,
      course.name,
      course.type,
      course.classroom,
      course.teacher_short_name,
      teacherDisplayName(course, teachers, assignments, ""),
      course.class_times?.display_time,
      course.textbook,
    ].join(" ").toLowerCase().includes(query);
  })).slice().sort((left, right) => (
    classStatusRank(left) - classStatusRank(right)
    || compareValues(left.class_times?.display_time || "", right.class_times?.display_time || "")
    || compareValues(left.name || left.short_name || "", right.name || right.short_name || "")
  ));
  const teacherOptions = sortedByLabel(teachers, teacherLabel);
  const classTimeOptions = sortedByLabel(classTimes, (time) => time.display_time || time.name || time.id);
  const classTypeOptions = sortedByLabel(
    Array.from(new Set(classes.map((course) => course.type).filter(Boolean))),
    (type) => type,
  );

  return (
    <div className="portal-panel">
      <div className="panel-heading">
        <div><span>Class Management</span><h2>Classes</h2></div>
      </div>
      <p className="staff-help">
        Use this page to create, search, update, and delete course records.
        Teacher assignment is saved to <code>teacher_classes</code>; class details are saved to <code>classes</code>.
      </p>
      <section className={`collapsible-editor ${formOpen ? "is-open" : ""}`}>
        <button className="collapsible-editor-toggle" type="button" onClick={() => setFormOpen(!formOpen)} aria-expanded={formOpen}>
          <span>{form.id ? "Edit class" : "Create class"}</span>
          <span aria-hidden="true">{formOpen ? "v" : ">"}</span>
        </button>
        {formOpen && (
          <form className="portal-form staff-user-form" onSubmit={saveClass}>
            <label><span>Class name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
            <label><span>Short name</span><input value={form.short_name} onChange={(event) => setForm({ ...form, short_name: event.target.value })} placeholder="e.g. CN3" /></label>
            <label><span>Teacher</span><select value={form.teacher_id} onChange={(event) => updateClassTeacher(event.target.value)}><option value="">No teacher assigned</option>{teacherOptions.map((teacher) => <option value={teacher.id} key={teacher.id}>{teacherLabel(teacher)}</option>)}</select></label>
            <label><span>Teacher short name</span><input value={form.teacher_short_name} readOnly /></label>
            <label><span>Class time</span><select value={form.class_time_id} onChange={(event) => setForm({ ...form, class_time_id: event.target.value })}><option value="">No time selected</option>{classTimeOptions.map((time) => <option value={time.id} key={time.id}>{time.display_time || time.name || time.id}</option>)}</select></label>
            <label><span>Classroom</span><input value={form.classroom} onChange={(event) => setForm({ ...form, classroom: event.target.value })} /></label>
            <label><span>Type</span><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="">No type selected</option>{classTypeOptions.map((type) => <option value={type} key={type}>{type}</option>)}</select></label>
            <label><span>Maximum seats</span><input type="number" min="0" value={form.maximum} onChange={(event) => setForm({ ...form, maximum: event.target.value })} /></label>
            <label><span>Tuition / donation</span><input type="number" min="0" value={form.donation} onChange={(event) => setForm({ ...form, donation: event.target.value })} /></label>
            <label><span>Equivalent</span><input value={form.equivalent} onChange={(event) => setForm({ ...form, equivalent: event.target.value })} /></label>
            <label className="wide"><span>Textbook</span><input value={form.textbook} onChange={(event) => setForm({ ...form, textbook: event.target.value })} /></label>
            <label><span>Status</span><select value={form.is_open ? "open" : "closed"} onChange={(event) => setForm({ ...form, is_open: event.target.value === "open" })}><option value="closed">Closed</option><option value="open">Open</option></select></label>
            <div className="button-row">
              <button className="button-link" type="submit" disabled={busy}>{form.id ? "Update class" : "Create class"}</button>
              {form.id && <button className="outline-link" type="button" onClick={() => setForm(emptyClass)}>Cancel edit</button>}
            </div>
          </form>
        )}
      </section>
      <label className="standalone-field staff-search">
        <span>Search classes</span>
        <input value={classSearch} onChange={(event) => setClassSearch(event.target.value)} placeholder="Class name, short name, teacher, room, time, or type" />
      </label>
      <ActionTable
        columns={["ID", "Name", "Registered", "Available", "Teacher", "Room", "Time", "Status"]}
        rows={filteredClasses.map((course) => {
          const registered = registrations.filter((row) => [row.session_1, row.session_2, row.session_3].includes(course.id)).length;
          const teacherName = teacherDisplayName(course, teachers, assignments, "");
          return {
            id: course.id,
            cells: [
              course.legacy_class_id || course.id,
              course.name || course.short_name || "",
              registered,
              course.maximum == null ? "" : Math.max(course.maximum - registered, 0),
              teacherName,
              course.classroom || "",
              course.class_times?.display_time || "",
              course.is_open === false ? "Closed" : "Open",
            ],
            sortValues: [
              course.legacy_class_id || course.id,
              course.name || course.short_name || "",
              registered,
              course.maximum == null ? "" : Math.max(course.maximum - registered, 0),
              teacherName,
              course.classroom || "",
              course.class_times?.display_time || "",
              classStatusRank(course),
            ],
            actions: <RowActions onEdit={() => editClass(course)} onDelete={() => deleteClass(course)} disabled={busy} />,
          };
        })}
        empty={classes.length ? "No classes match this search." : "No class records."}
      />
    </div>
  );
}

function TeacherManager({ teachers, assignments = [], onReload, setStatus }) {
  const { session } = useAuth();
  const emptyTeacher = {
    id: "",
    short_name: "",
    first_name: "",
    last_name: "",
    email_1: "",
    phone_1: "",
    email_2: "",
    phone_2: "",
    temporary_password: "",
  };
  const [form, setForm] = useState(emptyTeacher);
  const [teacherSearch, setTeacherSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const payload = () => ({
    short_name: form.short_name.trim() || null,
    first_name: form.first_name.trim() || null,
    last_name: form.last_name.trim() || null,
    email_1: form.email_1.trim() || null,
    phone_1: form.phone_1.trim() || null,
    email_2: form.email_2.trim() || null,
    phone_2: form.phone_2.trim() || null,
  });

  const saveTeacher = async (event) => {
    event.preventDefault();
    if (!form.short_name.trim() && !form.first_name.trim() && !form.last_name.trim()) {
      setStatus({ error: "Please enter at least a short name or teacher name.", message: "" });
      return;
    }
    setBusy(true);
    setStatus({ error: "", message: "" });
    const temporaryPassword = form.temporary_password.trim();
    const request = form.id
      ? supabase.from("teachers").update(payload()).eq("id", form.id).select("*").single()
      : supabase.from("teachers").insert(payload()).select("*").single();
    const result = await request;
    if (result.error) {
      setStatus({ error: result.error.message, message: "" });
    } else {
      if (temporaryPassword) {
        const email = (result.data.email_1 || form.email_1 || "").trim();
        if (!email) {
          setStatus({ error: "Teacher record saved, but login was not updated: Email 1 is required.", message: "" });
          setBusy(false);
          return;
        }
        try {
          const loginResult = await fetch("/api/teacher-login", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              teacherId: result.data.id,
              email,
              password: temporaryPassword,
            }),
          });
          const loginBody = await loginResult.json();
          if (!loginResult.ok) {
            setStatus({ error: `Teacher record saved, but login was not updated: ${loginBody.error || "Could not save teacher login."}`, message: "" });
            setBusy(false);
            return;
          }
        } catch (error) {
          setStatus({ error: `Teacher record saved, but login was not updated: ${error.message || "Could not save teacher login."}`, message: "" });
          setBusy(false);
          return;
        }
      }
      setForm(emptyTeacher);
      setStatus({
        error: "",
        message: temporaryPassword
          ? "Teacher saved and login updated."
          : form.id ? "Teacher updated." : "Teacher created.",
      });
      await onReload();
    }
    setBusy(false);
  };

  const editTeacher = (teacher) => {
    setFormOpen(true);
    setForm({
      ...emptyTeacher,
      id: teacher.id,
      short_name: teacher.short_name || "",
      first_name: teacher.first_name || "",
      last_name: teacher.last_name || "",
      email_1: teacher.email_1 || "",
      phone_1: teacher.phone_1 || "",
      email_2: teacher.email_2 || "",
      phone_2: teacher.phone_2 || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteTeacher = async (teacher) => {
    if (!window.confirm(`Delete teacher ${fullName(teacher) || teacher.short_name || teacher.id}?`)) return;
    if (assignments.some((assignment) => assignment.teacher_id === teacher.id)) {
      setStatus({
        error: "Please remove all classes assigned to this teacher before deleting this teacher account.",
        message: "",
      });
      return;
    }
    setBusy(true);
    const result = await supabase.from("teachers").delete().eq("id", teacher.id);
    if (result.error) {
      const message = result.error.code === "23503"
        ? "Please remove all classes assigned to this teacher before deleting this teacher account."
        : result.error.code === "23514"
          ? "Please remove all classes assigned to this teacher before deleting this teacher account."
        : result.error.message;
      setStatus({ error: message, message: "" });
    } else {
      if (form.id === teacher.id) setForm(emptyTeacher);
      setStatus({ error: "", message: "Teacher deleted." });
      await onReload();
    }
    setBusy(false);
  };

  const query = teacherSearch.trim().toLowerCase();
  const filteredTeachers = !query ? teachers : teachers.filter((teacher) => [
    teacher.short_name,
    teacher.first_name,
    teacher.last_name,
    teacher.email_1,
    teacher.phone_1,
    teacher.email_2,
    teacher.phone_2,
  ].join(" ").toLowerCase().includes(query));

  return (
    <div className="portal-panel">
      <div className="panel-heading">
        <div><span>Teacher Management</span><h2>Teacher</h2></div>
      </div>
      <p className="staff-help">
        Use this page to create, search, update, and delete teacher records.
        Teacher email can be any valid email address and is not required to use <code>@ctsccs.org</code>.
        Teacher portal login accounts use <code>sccs_teacher_ta_role</code>. Set a temporary password to let a teacher log in at <code>/admin</code>; they can change it on the Password tab after login.
      </p>
      <section className={`collapsible-editor ${formOpen ? "is-open" : ""}`}>
        <button className="collapsible-editor-toggle" type="button" onClick={() => setFormOpen(!formOpen)} aria-expanded={formOpen}>
          <span>{form.id ? "Edit teacher" : "Create teacher"}</span>
          <span aria-hidden="true">{formOpen ? "v" : ">"}</span>
        </button>
        {formOpen && (
          <form className="portal-form staff-user-form" onSubmit={saveTeacher}>
            <label><span>Short name</span><input value={form.short_name} onChange={(event) => setForm({ ...form, short_name: event.target.value })} placeholder="e.g. yzhao" /></label>
            <label><span>Role</span><input value="sccs_teacher_ta_role" disabled /></label>
            <label><span>First name</span><input value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} /></label>
            <label><span>Last name</span><input value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} /></label>
            <label><span>Email 1</span><input type="email" value={form.email_1} onChange={(event) => setForm({ ...form, email_1: event.target.value })} /></label>
            <label><span>Temporary password</span><input type="password" minLength="10" autoComplete="new-password" value={form.temporary_password} onChange={(event) => setForm({ ...form, temporary_password: event.target.value })} placeholder={form.id ? "Leave blank to keep login unchanged" : "Optional teacher login password"} /></label>
            <label><span>Phone 1</span><input value={form.phone_1} onChange={(event) => setForm({ ...form, phone_1: event.target.value })} /></label>
            <label><span>Email 2</span><input type="email" value={form.email_2} onChange={(event) => setForm({ ...form, email_2: event.target.value })} /></label>
            <label><span>Phone 2</span><input value={form.phone_2} onChange={(event) => setForm({ ...form, phone_2: event.target.value })} /></label>
            <div className="button-row">
              <button className="button-link" type="submit" disabled={busy}>{form.id ? "Update teacher" : "Create teacher"}</button>
              {form.id && <button className="outline-link" type="button" onClick={() => setForm(emptyTeacher)}>Cancel edit</button>}
            </div>
          </form>
        )}
      </section>
      <label className="standalone-field staff-search">
        <span>Search teachers</span>
        <input value={teacherSearch} onChange={(event) => setTeacherSearch(event.target.value)} placeholder="Name, short name, email, or phone" />
      </label>
      <ActionTable
        columns={["Teacher", "Short Name", "Phone", "Email", "Phone 2", "Email 2"]}
        rows={filteredTeachers.map((teacher) => ({
          id: teacher.id,
          cells: [
            teacherLabel(teacher),
            teacher.short_name || "",
            teacher.phone_1 || "",
            teacher.email_1 || "",
            teacher.phone_2 || "",
            teacher.email_2 || "",
          ],
          actions: <RowActions onEdit={() => editTeacher(teacher)} onDelete={() => deleteTeacher(teacher)} disabled={busy} />,
        }))}
        empty={teachers.length ? "No teachers match this search." : "No teacher records."}
      />
    </div>
  );
}

function StaffPortal({ isAdmin }) {
  const { session, role, teacherId, refreshRole } = useAuth();
  const [active, setActive] = useState(isAdmin ? "classes" : "classes");
  const [classes, setClasses] = useState([]);
  const [classTimes, setClassTimes] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [students, setStudents] = useState([]);
  const [families, setFamilies] = useState([]);
  const [familyAccounts, setFamilyAccounts] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [gradeRecords, setGradeRecords] = useState([]);
  const [payments, setPayments] = useState([]);
  const [familyPaymentRecords, setFamilyPaymentRecords] = useState([]);
  const [paymentForm, setPaymentForm] = useState({
    family_id: "",
    family_query: "",
    type: "payment",
    method: "cash",
    amount: "",
    check_number: "",
    notes: "",
  });
  const [userRoles, setUserRoles] = useState([]);
  const [siteSettings, setSiteSettings] = useState([]);
  const [settingKey, setSettingKey] = useState("");
  const [settingValue, setSettingValue] = useState("");
  const [settingEdit, setSettingEdit] = useState(null);
  const [search, setSearch] = useState("");
  const [paymentHistorySearch, setPaymentHistorySearch] = useState("");
  const [adjustEdit, setAdjustEdit] = useState(null);
  const [selectedPrintFamilyId, setSelectedPrintFamilyId] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expandedAttendanceDates, setExpandedAttendanceDates] = useState({});
  const [examName, setExamName] = useState("");
  const [gradeScores, setGradeScores] = useState({});
  const [expandedGradeExams, setExpandedGradeExams] = useState({});
  const [emailTarget, setEmailTarget] = useState("");
  const [emailDrafts, setEmailDrafts] = useState({});
  const [emailBusyTarget, setEmailBusyTarget] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState({ error: "", message: "" });
  const [rosterEmailBusy, setRosterEmailBusy] = useState(false);

  const load = async () => {
    const requests = [
      fetchAllRows(() => supabase.from("classes").select("*, class_times(display_time)").order("name")),
      fetchAllRows(() => supabase.from("class_times").select("*").order("id")),
      fetchAllRows(() => supabase.from("teacher_classes").select("*")),
      fetchAllRows(() => supabase.from("teachers").select("*").order("last_name")),
      fetchAllRows(() => supabase.from("students").select("*").order("last_name")),
      fetchAllRows(() => supabase.from("families").select("*").order("legacy_family_id")),
      fetchAllRows(() => supabase.from("class_registrations").select("*")),
      fetchAllRows(() => supabase.from("attendance").select("*").order("class_date", { ascending: false })),
      fetchAllRows(() => supabase.from("student_grades").select("*").order("recorded_at", { ascending: false })),
    ];
    if (isAdmin) {
      requests.push(
        fetchAllRows(() => supabase.from("payments").select("*").order("paid_at", { ascending: false })),
        fetchAllRows(() => supabase.from("family_registrations").select("*")),
        fetchAllRows(() => supabase.from("user_roles").select("*").order("created_at")),
        fetchAllRows(() => supabase.from("site_settings").select("*").order("key")),
      );
    }
    const results = await Promise.all(requests);
    const firstError = results.find((result) => result.error)?.error;
    if (firstError) setStatus({ error: firstError.message, message: "" });
    setClasses(results[0].data || []);
    setClassTimes(results[1].data || []);
    setAssignments(results[2].data || []);
    setTeachers(results[3].data || []);
    setStudents(results[4].data || []);
    setFamilies(results[5].data || []);
    setRegistrations(results[6].data || []);
    setAttendanceRecords(results[7].data || []);
    setGradeRecords(results[8].data || []);
    if (isAdmin) {
      setPayments(results[9].data || []);
      setFamilyPaymentRecords(results[10].data || []);
      setUserRoles(results[11].data || []);
      setSiteSettings(results[12].data || []);
      const accountResult = await fetch("/api/family-accounts", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (accountResult.ok) {
        const body = await accountResult.json();
        setFamilyAccounts(body.accounts || []);
      } else {
        setFamilyAccounts([]);
      }
    }
  };
  useEffect(() => { load(); }, [role, teacherId]);
  useEffect(() => {
    if (active === "classes") load();
  }, [active]);

  const registrationByStudentId = new Map(registrations.map((row) => [row.student_id, row]));
  const paymentNumber = (value) => {
    const normalized = typeof value === "string" ? value.replace(/[$,]/g, "").trim() : value;
    const number = Number(normalized || 0);
    return Number.isFinite(number) ? number : 0;
  };
  const paymentsByFamilyId = payments.reduce((groups, row) => {
    const familyPayments = groups.get(row.family_id) || [];
    familyPayments.push(row);
    groups.set(row.family_id, familyPayments);
    return groups;
  }, new Map());
  const legacyPaymentForFamily = (family) => familyPaymentRecords.find((row) => (
    row.family_id === family.id
    || row.legacy_family_id === family.legacy_family_id
    || row.legacy_family_id === family.id
  ));
  const legacyPaidTotal = (row) => [
    row?.pay_1_cash, row?.pay_1_check, row?.pay_2_cash, row?.pay_2_check,
    row?.pay_3_cash, row?.pay_3_check, row?.pay_4_cash, row?.pay_4_check,
    row?.pay_5_cash, row?.pay_5_check,
  ].reduce((sum, value) => sum + paymentNumber(value), 0);
  const legacyRefundTotal = (row) => [
    row?.pay_3_refund, row?.day_3_refund, row?.day_2_refund, row?.pay_4_refund, row?.pay_5_refund,
  ].reduce((sum, value) => sum + paymentNumber(value), 0);
  const paymentDueForFamily = (family) => {
    const familyStudents = students.filter((student) => student.family_id === family.id);
    const familyCourses = familyStudents.flatMap((student) => (
      registeredClassIds(registrationByStudentId.get(student.id))
        .map((classId) => classes.find((course) => course.id === classId))
        .filter(Boolean)
    ));
    const legacyPayment = legacyPaymentForFamily(family);
    const tuition = familyCourses.length
      ? donationTotal(familyCourses)
      : paymentNumber(legacyPayment?.registration_fee);
    const pta = familyCourses.length ? SAFETY_PATROL_DEPOSIT : paymentNumber(legacyPayment?.patrol_deposit);
    const adjust = paymentNumber(legacyPayment?.late_fee);
    return {
      legacyPayment,
      tuition,
      pta,
      adjust,
      due: tuition + pta + adjust,
    };
  };
  const paymentSummaryForFamily = (family) => {
    const charges = paymentDueForFamily(family);
    const familyPayments = paymentsByFamilyId.get(family.id) || [];
    const paidCents = familyPayments
      .filter((payment) => payment.status === "paid")
      .reduce((sum, payment) => sum + Number(payment.amount_cents || 0), 0);
    const refundCents = familyPayments
      .filter((payment) => payment.status === "refunded")
      .reduce((sum, payment) => sum + Number(payment.amount_cents || 0), 0);
    const paid = legacyPaidTotal(charges.legacyPayment) + (paidCents / 100);
    const refund = legacyRefundTotal(charges.legacyPayment) + (refundCents / 100);
    return {
      ...charges,
      paid,
      refund,
      balance: charges.due - paid + refund,
    };
  };
  const paymentFamilyOptions = sortedByLabel(
    families.filter((family) => hasFamilyId(family.legacy_family_id || family.id)),
    familySortLabel,
  );
  const paymentFamilySearchLabel = (family) => (
    `${fullName(family) || "Family"} · FamID ${family.legacy_family_id || family.id} · ${family.email || "No email"} · Balance ${formatDonation(paymentSummaryForFamily(family).balance)}`
  );
  const resolvePaymentFamily = () => {
    const query = paymentForm.family_query.trim().toLowerCase();
    if (paymentForm.family_id) {
      const selected = families.find((family) => String(family.id) === String(paymentForm.family_id));
      if (selected) return { family: selected };
    }
    if (!query) return { error: "Please enter a FamID, email, or name." };

    const exact = paymentFamilyOptions.filter((family) => {
      const familyId = String(family.legacy_family_id || family.id).toLowerCase();
      return (
        familyId === query
        || String(family.email || "").toLowerCase() === query
        || fullName(family).toLowerCase() === query
        || paymentFamilySearchLabel(family).toLowerCase() === query
      );
    });
    if (exact.length === 1) return { family: exact[0] };

    const partial = paymentFamilyOptions.filter((family) => (
      String(family.legacy_family_id || family.id).toLowerCase().includes(query)
      || String(family.email || "").toLowerCase().includes(query)
      || fullName(family).toLowerCase().includes(query)
      || paymentFamilySearchLabel(family).toLowerCase().includes(query)
    ));
    if (partial.length === 1) return { family: partial[0] };
    if (partial.length > 1) return { error: "More than one family matches. Please type a more specific FamID, email, or name." };
    return { error: "No family matches that FamID, email, or name." };
  };
  const savePayment = async (event) => {
    event.preventDefault();
    const resolved = resolvePaymentFamily();
    const enteredAmountCents = Math.round(Number(paymentForm.amount) * 100);
    if (resolved.error || !Number.isFinite(enteredAmountCents) || enteredAmountCents === 0) {
      setStatus({ error: resolved.error || "Please enter a valid payment amount.", message: "" });
      return;
    }
    const isRefund = paymentForm.type === "refund" || enteredAmountCents < 0;
    const amountCents = Math.abs(enteredAmountCents);
    const { error } = await supabase.from("payments").insert({
      family_id: Number(resolved.family.id),
      method: paymentForm.method,
      amount_cents: amountCents,
      currency: "usd",
      paid_at: new Date().toISOString(),
      status: isRefund ? "refunded" : "paid",
      check_number: paymentForm.method === "check" ? paymentForm.check_number.trim() || null : null,
      notes: paymentForm.notes.trim() || null,
      created_by: session.user.id,
    });
    if (error) {
      setStatus({ error: error.message, message: "" });
      return;
    }
    setPaymentForm({ family_id: "", family_query: "", type: "payment", method: "cash", amount: "", check_number: "", notes: "" });
    setStatus({ error: "", message: isRefund ? "Refund recorded." : "Payment recorded." });
    load();
  };
  const refundPayment = async (payment) => {
    if (!window.confirm(`Record a refund for payment #${payment.id}?`)) return;
    const { error } = await supabase.from("payments").insert({
      family_id: Number(payment.family_id),
      method: payment.method,
      amount_cents: Number(payment.amount_cents || 0),
      currency: payment.currency || "usd",
      paid_at: new Date().toISOString(),
      status: "refunded",
      check_number: payment.method === "check" ? payment.check_number || null : null,
      notes: `Refund for payment #${payment.id}${payment.notes ? `: ${payment.notes}` : ""}`,
      created_by: session.user.id,
    });
    if (error) {
      setStatus({ error: error.message, message: "" });
      return;
    }
    setStatus({ error: "", message: "Refund recorded." });
    load();
  };
  const beginAdjustEdit = (row) => {
    setAdjustEdit({
      familyId: row.id,
      familyRegistrationId: row.family_registration_id,
      legacyFamilyId: row.fam_id,
      value: String(row.adjust_amount ?? 0),
    });
  };
  const saveAdjust = async (row) => {
    const amount = Math.round(Number(adjustEdit?.value));
    if (!Number.isFinite(amount)) {
      setStatus({ error: "Please enter a valid adjustment amount.", message: "" });
      return;
    }
    const payload = {
      family_id: Number(row.id),
      legacy_family_id: Number.isFinite(Number(row.fam_id)) ? Number(row.fam_id) : null,
      late_fee: amount,
    };
    const request = row.family_registration_id
      ? supabase.from("family_registrations").update({ late_fee: amount }).eq("id", row.family_registration_id)
      : supabase.from("family_registrations").insert(payload);
    const { error } = await request;
    if (error) {
      setStatus({ error: error.message, message: "" });
      return;
    }
    setAdjustEdit(null);
    setStatus({ error: "", message: "Adjustment updated." });
    load();
  };

  const visibleClassIds = useMemo(() => {
    if (isAdmin) return new Set(classes.map((row) => row.id));
    return new Set(
      assignments.filter((row) => row.teacher_id === teacherId).map((row) => row.class_id),
    );
  }, [assignments, classes, isAdmin, teacherId]);
  const visibleClasses = sortedByLabel(
    classes.filter((row) => visibleClassIds.has(row.id)),
    (course) => course.name || course.short_name || "",
  );
  const rosterClasses = visibleClasses.filter((row) => row.is_open !== false);
  const activeClassOptions = active === "rosters" ? rosterClasses : visibleClasses;
  const selectedClassValue = activeClassOptions.some((row) => String(row.id) === String(selectedClass))
    ? selectedClass
    : activeClassOptions[0]?.id || "";
  const selectedClassId = Number(selectedClassValue);
  const selectedCourse = activeClassOptions.find((row) => row.id === selectedClassId);
  const selectedTeacher = teacherForCourse(selectedCourse, teachers, assignments);
  const selectedTeacherEmail = selectedTeacher?.email_1 || selectedTeacher?.email_2 || "";
  const rosterRows = useMemo(() => {
    if (!selectedClassId) return [];
    return registrations
      .filter((row) => [row.session_1, row.session_2, row.session_3].includes(selectedClassId))
      .map((registration) => {
        const student = students.find((row) => row.id === registration.student_id);
        const family = families.find((row) => row.id === student?.family_id);
        return {
          id: registration.id,
          family_id: family?.legacy_family_id || family?.id,
          student: fullName(student),
          parent: fullName(family),
          email: family?.email,
          phone: family?.phone,
          student_id: student?.id,
        };
      })
      .filter((row) => hasFamilyId(row.family_id));
  }, [selectedClassId, registrations, students, families]);
  const sendRosterEmail = async () => {
    if (!selectedTeacherEmail) {
      setStatus({ error: "This class does not have a teacher email.", message: "" });
      return;
    }
    setRosterEmailBusy(true);
    setStatus({ error: "", message: "" });
    try {
      const result = await fetch("/api/email-roster", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          teacherEmail: selectedTeacherEmail,
          course: {
            name: selectedCourse?.name || "Class",
            time: selectedCourse?.class_times?.display_time || "",
            teacher: teacherDisplayName(selectedCourse, teachers, assignments, ""),
            room: selectedCourse?.classroom || "",
          },
          rows: rosterRows,
        }),
      });
      const body = await result.json();
      if (!result.ok) throw new Error(body.error || "Could not email roster.");
      setStatus({ error: "", message: body.message || "Roster PDF sent to teacher." });
    } catch (error) {
      setStatus({ error: error.message, message: "" });
    } finally {
      setRosterEmailBusy(false);
    }
  };

  const updateEmailDraft = (target, field, value) => {
    setEmailDrafts((current) => ({
      ...current,
      [target]: {
        subject: "",
        message: "",
        ...current[target],
        [field]: value,
      },
    }));
  };

  const sendStudentEmail = async (target, recipients) => {
    const draft = emailDrafts[target] || {};
    const cleanRecipients = Array.from(new Set(recipients.filter(Boolean)));
    if (!selectedTeacherEmail) {
      setStatus({ error: "This class does not have a teacher email for CC.", message: "" });
      return;
    }
    if (!cleanRecipients.length) {
      setStatus({ error: "No valid student email is available.", message: "" });
      return;
    }
    if (!draft.subject?.trim() || !draft.message?.trim()) {
      setStatus({ error: "Please enter both Title and Content.", message: "" });
      return;
    }
    setEmailBusyTarget(target);
    setStatus({ error: "", message: "" });
    try {
      const result = await fetch("/api/email-students", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          recipients: cleanRecipients,
          teacherEmail: selectedTeacherEmail,
          teacherName: teacherDisplayName(selectedCourse, teachers, assignments, "SCCS Teacher"),
          subject: draft.subject,
          message: draft.message,
        }),
      });
      const body = await result.json();
      if (!result.ok) throw new Error(body.error || "Could not send email.");
      setEmailTarget("");
      setEmailDrafts((current) => ({ ...current, [target]: { subject: "", message: "" } }));
      setStatus({ error: "", message: body.message || "Email sent." });
    } catch (error) {
      setStatus({ error: error.message, message: "" });
    } finally {
      setEmailBusyTarget("");
    }
  };

  const classRows = visibleClasses.map((course) => {
    const count = registrations.filter((row) => (
      [row.session_1, row.session_2, row.session_3].includes(course.id)
    )).length;
    return {
      id: course.legacy_class_id || course.id,
      name: course.name,
      count,
      available: course.maximum == null ? "" : Math.max(course.maximum - count, 0),
      teacher: teacherDisplayName(course, teachers, assignments, ""),
      room: course.classroom,
      time: course.class_times?.display_time,
    };
  });

  const attendanceForSelectedDate = useMemo(() => (
    Object.fromEntries(
      attendanceRecords
        .filter((row) => row.class_id === selectedClassId && row.class_date === attendanceDate)
        .map((row) => [row.student_id, row]),
    )
  ), [attendanceRecords, selectedClassId, attendanceDate]);
  const attendanceHistoryRows = useMemo(() => (
    attendanceRecords
      .filter((row) => row.class_id === selectedClassId)
      .map((row) => {
        const student = students.find((item) => item.id === row.student_id);
        return {
          id: row.id,
          date: row.class_date,
          recorded_at: row.recorded_at ? new Date(row.recorded_at).toLocaleString() : "",
          student: fullName(student) || row.student_id,
          status: row.status,
          notes: row.notes || "",
        };
      })
      .sort((left, right) => (
        compareValues(right.date, left.date)
        || compareValues(right.recorded_at, left.recorded_at)
        || compareValues(left.student, right.student)
      ))
  ), [attendanceRecords, selectedClassId, students]);
  const attendanceHistoryGroups = useMemo(() => {
    const groups = new Map();
    attendanceHistoryRows.forEach((row) => {
      if (!groups.has(row.date)) groups.set(row.date, []);
      groups.get(row.date).push(row);
    });
    return Array.from(groups.entries())
      .map(([date, rows]) => ({
        date,
        rows,
        counts: rows.reduce((summary, row) => ({
          ...summary,
          [row.status]: (summary[row.status] || 0) + 1,
        }), {}),
      }))
      .sort((left, right) => compareValues(right.date, left.date));
  }, [attendanceHistoryRows]);
  const toggleAttendanceDate = (date) => {
    setExpandedAttendanceDates((current) => ({
      ...current,
      [date]: !current[date],
    }));
  };

  const saveAttendance = async (studentId, classId, statusValue) => {
    if (!attendanceDate) {
      setStatus({ error: "Please select an attendance date.", message: "" });
      return;
    }
    const result = await supabase.from("attendance").upsert({
      class_id: classId,
      student_id: studentId,
      class_date: attendanceDate,
      status: statusValue,
      recorded_by: session.user.id,
    }, { onConflict: "class_id,student_id,class_date" });
    setStatus(result.error
      ? { error: result.error.message, message: "" }
      : { error: "", message: "Attendance saved." });
    if (!result.error) await load();
  };

  const gradeHistoryRows = useMemo(() => (
    gradeRecords
      .filter((row) => row.class_id === selectedClassId)
      .map((row) => {
        const student = students.find((item) => item.id === row.student_id);
        return {
          id: row.id,
          exam: row.assignment_name,
          recorded_at: row.recorded_at ? new Date(row.recorded_at).toLocaleString() : "",
          student: fullName(student) || row.student_id,
          score: row.score ?? "",
          comments: row.comments || "",
        };
      })
      .sort((left, right) => (
        compareValues(right.recorded_at, left.recorded_at)
        || compareValues(left.student, right.student)
      ))
  ), [gradeRecords, selectedClassId, students]);
  const gradeExamGroups = useMemo(() => {
    const groups = new Map();
    gradeHistoryRows.forEach((row) => {
      if (!groups.has(row.exam)) groups.set(row.exam, []);
      groups.get(row.exam).push(row);
    });
    return Array.from(groups.entries())
      .map(([exam, rows]) => ({
        exam,
        rows,
        recordedAt: rows[0]?.recorded_at || "",
      }))
      .sort((left, right) => compareValues(right.recordedAt, left.recordedAt) || compareValues(left.exam, right.exam));
  }, [gradeHistoryRows]);
  const toggleGradeExam = (exam) => {
    setExpandedGradeExams((current) => ({
      ...current,
      [exam]: !current[exam],
    }));
  };

  const saveGrades = async (event) => {
    event.preventDefault();
    const normalizedExamName = examName.trim();
    if (!normalizedExamName) {
      setStatus({ error: "Please enter an exam name.", message: "" });
      return;
    }
    const rows = rosterRows
      .map((row) => ({
        class_id: selectedClassId,
        student_id: row.student_id,
        grading_period: "Exam",
        assignment_name: normalizedExamName,
        score: gradeScores[row.student_id] === "" || gradeScores[row.student_id] == null
          ? null
          : Number(gradeScores[row.student_id]),
        maximum_score: null,
        letter_grade: null,
        comments: null,
        recorded_by: session.user.id,
      }))
      .filter((row) => row.score !== null && !Number.isNaN(row.score));
    if (!rows.length) {
      setStatus({ error: "Please enter at least one score.", message: "" });
      return;
    }
    const result = await supabase.from("student_grades").upsert(rows, {
      onConflict: "class_id,student_id,grading_period,assignment_name",
    });
    setStatus(result.error
      ? { error: result.error.message, message: "" }
      : { error: "", message: "Grades saved." });
    if (!result.error) {
      setGradeScores({});
      await load();
    }
  };

  const loadExamForEdit = (exam) => {
    setExamName(exam);
    setGradeScores(Object.fromEntries(
      gradeRecords
        .filter((row) => row.class_id === selectedClassId && row.assignment_name === exam)
        .map((row) => [row.student_id, row.score ?? ""]),
    ));
    setStatus({ error: "", message: `Loaded ${exam}.` });
  };

  const updateRole = async (userId, nextRole) => {
    const result = await supabase.from("user_roles").update({ role: nextRole })
      .eq("user_id", userId);
    setStatus(result.error
      ? { error: result.error.message, message: "" }
      : { error: "", message: "User role updated." });
    if (!result.error) {
      await load();
      await refreshRole();
    }
  };

  const updateTeacherLink = async (userId, nextTeacherId) => {
    const result = await supabase.from("user_roles")
      .update({ teacher_id: nextTeacherId ? Number(nextTeacherId) : null })
      .eq("user_id", userId);
    setStatus(result.error
      ? { error: result.error.message, message: "" }
      : { error: "", message: "Teacher account link updated." });
    if (!result.error) await load();
  };

  const parseSettingValue = (text) => {
    try {
      return JSON.parse(text);
    } catch {
      return { text };
    }
  };
  const saveSetting = async (event) => {
    event.preventDefault();
    const value = parseSettingValue(settingValue);
    const result = await supabase.from("site_settings").upsert({
      key: settingKey.trim(),
      value,
      updated_by: session.user.id,
    });
    setStatus(result.error
      ? { error: result.error.message, message: "" }
      : { error: "", message: "Site setting saved." });
    if (!result.error) {
      setSettingKey("");
      setSettingValue("");
      await load();
    }
  };
  const beginSettingEdit = (row) => {
    setSettingEdit({
      rowId: `${row.exists ? "saved" : "new"}-${row.key}`,
      originalKey: row.exists ? row.key : "",
      key: row.key,
      value: JSON.stringify(row.value),
    });
  };
  const saveSettingEdit = async () => {
    const nextKey = settingEdit?.key.trim();
    if (!nextKey) {
      setStatus({ error: "Setting key is required.", message: "" });
      return;
    }
    const payload = {
      key: nextKey,
      value: parseSettingValue(settingEdit.value),
      updated_by: session.user.id,
    };
    const result = settingEdit.originalKey
      ? await supabase.from("site_settings").update(payload).eq("key", settingEdit.originalKey)
      : await supabase.from("site_settings").upsert(payload);
    setStatus(result.error
      ? { error: result.error.message, message: "" }
      : { error: "", message: "Site setting saved." });
    if (!result.error) {
      setSettingEdit(null);
      await load();
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    const result = await supabase.auth.updateUser({ password: newPassword });
    setStatus(result.error
      ? { error: result.error.message, message: "" }
      : { error: "", message: "Password updated." });
    if (!result.error) setNewPassword("");
  };

  const adminTabs = [
    ["classes", "Classes"], ["teachers", "Teachers"], ["rosters", "Rosters"],
    ["registrations", "Registration Summary"], ["payments", "Payment History"],
    ["search", "Family Search"], ["print", "Print Registration"],
  ];
  if (role === roles.superadmin) adminTabs.push(["staff", "ADMINS"], ["settings", "Site Settings"]);
  adminTabs.push(["password", "Password"]);
  const teacherTabs = [
    ["classes", "My Classes"], ["rosters", "Roster"], ["attendance", "Attendance"],
    ["grades", "Grades"], ["email", "Email Students"], ["password", "Password"],
  ];
  const tabs = isAdmin ? adminTabs : teacherTabs;
  const siteSettingRows = siteSettings.some((row) => row.key === "registration_change_deadline")
    ? siteSettings.map((row) => ({ ...row, exists: true }))
    : [
      {
        key: "registration_change_deadline",
        value: { date: "2026-09-21" },
        updated_at: "",
        exists: false,
      },
      ...siteSettings.map((row) => ({ ...row, exists: true })),
    ];
  const query = search.trim().toLowerCase();
  const studentsByFamilyId = students.reduce((groups, student) => {
    const rows = groups.get(student.family_id) || [];
    rows.push(student);
    groups.set(student.family_id, rows);
    return groups;
  }, new Map());
  const accountByFamilyId = new Map(familyAccounts
    .filter((account) => account.family_id)
    .map((account) => [account.family_id, account]));
  const accountByEmail = new Map(familyAccounts
    .filter((account) => account.email)
    .map((account) => [String(account.email).toLowerCase(), account]));
  const paidCentsForFamily = (familyId) => (paymentsByFamilyId.get(familyId) || [])
    .filter((payment) => payment.status === "paid")
    .reduce((sum, payment) => sum + Number(payment.amount_cents || 0), 0);
  const hasPaidPayment = (familyId) => paidCentsForFamily(familyId) > 0;
  const legacyPaidForFamily = (family) => {
    const row = legacyPaymentForFamily(family);
    return [
      row?.pay_1_cash, row?.pay_1_check, row?.pay_2_cash, row?.pay_2_check,
      row?.pay_3_cash, row?.pay_3_check, row?.pay_4_cash, row?.pay_4_check,
      row?.pay_5_cash, row?.pay_5_check,
    ].reduce((sum, value) => sum + paymentNumber(value), 0);
  };
  const familyAccountFor = (family) => (
    accountByFamilyId.get(family.id)
    || accountByEmail.get(String(family.email || "").toLowerCase())
    || null
  );
  const familySearchStatus = (family, familyStudents) => {
    const registeredCourses = familyStudents.flatMap((student) => (
      registeredClassIds(registrationByStudentId.get(student.id))
    ));
    const { due, balance } = paymentSummaryForFamily(family);
    const account = familyAccountFor(family);
    if (due > 0 && balance <= 0) return "Paid";
    if (registeredCourses.length && due > 0) return "Waiting for Payment";
    if (registeredCourses.length) return "Registered Classes";
    if (familyStudents.length) return "Added Students";
    if (account?.confirmed_at) return "Validated account only";
    return "Registered account only";
  };
  const deleteFamilySearchRow = async (row) => {
    if (row.has_paid_payment) {
      setStatus({ error: "This family has payment records and cannot be deleted.", message: "" });
      return;
    }
    if (!window.confirm(`Delete ${row.parent || row.email || "this family account"}? This will remove the family account, students, and class registrations.`)) {
      return;
    }
    const result = await fetch("/api/family-accounts", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        familyId: row.family_record_id,
        accountId: row.account_id,
      }),
    });
    const body = await result.json().catch(() => ({}));
    if (!result.ok) {
      setStatus({ error: body.error || "Could not delete family account.", message: "" });
      return;
    }
    setStatus({ error: "", message: "Family account deleted." });
    if (String(selectedPrintFamilyId) === String(row.family_record_id)) setSelectedPrintFamilyId("");
    await load();
  };
  const familySearchRows = sortedByLabel(families
    .filter((family) => hasFamilyId(family.legacy_family_id || family.id))
    .map((family) => {
      const familyStudents = studentsByFamilyId.get(family.id) || [];
      const account = familyAccountFor(family);
      const statusLabel = familySearchStatus(family, familyStudents);
      return {
        id: `family-${family.id}`,
        family_record_id: family.id,
        account_id: account?.id || family.user_id || null,
        family_id: family.legacy_family_id || family.id,
        parent: fullName(family) || "Not provided",
        student: familyStudents.length ? familyStudents.map(fullName).filter(Boolean).join(", ") : "No students yet",
        email: family.email,
        phone: family.phone,
        status: statusLabel,
        has_paid_payment: hasPaidPayment(family.id) || legacyPaidForFamily(family) > 0,
      };
    }), (row) => `${row.parent || ""} ${row.email || ""} ${row.family_id || ""}`);
  const familyIdsWithProfile = new Set(families.map((family) => family.id));
  const familyEmailsWithProfile = new Set(families.map((family) => String(family.email || "").toLowerCase()).filter(Boolean));
  const authOnlyRows = familyAccounts
    .filter((account) => !account.family_id || !familyIdsWithProfile.has(account.family_id))
    .filter((account) => !account.has_family_profile)
    .filter((account) => !familyEmailsWithProfile.has(String(account.email || "").toLowerCase()))
    .map((account) => ({
      id: `account-${account.id}`,
      family_record_id: null,
      account_id: account.id,
      family_id: "No profile",
      parent: "No family profile",
      student: "No students yet",
      email: account.email,
      phone: "",
      status: account.confirmed_at ? "Validated account only" : "Registered account only",
      has_paid_payment: false,
    }));
  const searchRows = !query ? [] : sortedByLabel(
    [...familySearchRows, ...authOnlyRows]
      .filter((row) => Object.values(row).some((value) => String(value || "").toLowerCase().includes(query))),
    (row) => `${row.parent || ""} ${row.email || ""} ${row.family_id || ""}`,
  );
  const searchActionRows = searchRows.map((row) => ({
    id: row.id,
    cells: [row.family_id, row.parent, row.student, row.email, row.phone, row.status],
    sortValues: [row.family_id, row.parent, row.student, row.email, row.phone, row.status],
    actions: (
      row.has_paid_payment
        ? <button className="danger-text-button" type="button" onClick={() => deleteFamilySearchRow(row)}>Cannot delete</button>
        : <RowActions onDelete={() => deleteFamilySearchRow(row)} />
    ),
  }));
  const printFamilyOptions = sortedByLabel(Array.from(
    new Map(
      searchRows
        .map((row) => families.find((family) => family.id === row.family_record_id))
        .filter(Boolean)
        .map((family) => [family.id, family]),
    ).values(),
  ), familySortLabel);
  const selectedPrintFamily = families.find((family) => String(family.id) === String(selectedPrintFamilyId))
    || (printFamilyOptions.length === 1 ? printFamilyOptions[0] : null);
  const selectedPrintStudents = selectedPrintFamily
    ? students.filter((student) => student.family_id === selectedPrintFamily.id)
    : [];
  const selectedPrintRegistrations = Object.fromEntries(
    registrations
      .filter((registration) => selectedPrintStudents.some((student) => student.id === registration.student_id))
      .map((registration) => [registration.student_id, registration]),
  );
  const adminCourseDetails = (id) => {
    const course = classes.find((row) => row.id === id);
    if (!course) return null;
    return {
      ...course,
      teacher: teacherDisplayName(course, teachers, assignments),
      time: course.class_times?.display_time || course.display_time || "Time TBD",
      classroom: course.classroom || "Room TBD",
      descriptionLink: courseDescriptionLinkFor(course.name || course.short_name),
    };
  };
  const adminRegisteredCoursesFor = (registration) => [1, 2, 3]
    .map((number) => adminCourseDetails(registration?.[`session_${number}`]))
    .filter(Boolean);
  const selectedPrintDonationTotal = selectedPrintStudents.reduce((sum, student) => (
    sum + donationTotal(adminRegisteredCoursesFor(selectedPrintRegistrations[student.id] || {}))
  ), 0);
  const registrationRows = sortedByLabel(registrations.map((row) => {
    const student = students.find((item) => item.id === row.student_id);
    const family = families.find((item) => item.id === student?.family_id);
    return {
      id: row.id,
      family_id: family?.legacy_family_id || family?.id,
      parent: fullName(family),
      student_id: student?.legacy_student_id || student?.id,
      student: fullName(student),
      session_1: classes.find((item) => item.id === row.session_1)?.short_name,
      session_2: classes.find((item) => item.id === row.session_2)?.short_name,
      session_3: classes.find((item) => item.id === row.session_3)?.short_name,
    };
  }).filter((row) => hasFamilyId(row.family_id)), (row) => `${row.parent || ""} ${row.family_id || ""}`);
  const legacyMethods = (row) => {
    const methods = [];
    if ([row?.pay_1_cash, row?.pay_2_cash, row?.pay_3_cash, row?.pay_4_cash, row?.pay_5_cash]
      .some((value) => paymentNumber(value) > 0)) methods.push("cash");
    if ([row?.pay_1_check, row?.pay_2_check, row?.pay_3_check, row?.pay_4_check, row?.pay_5_check]
      .some((value) => paymentNumber(value) > 0)) methods.push("check");
    return methods;
  };
  const paymentRows = sortedByLabel(families.map((family) => {
    const charges = paymentSummaryForFamily(family);
    const { legacyPayment, tuition, pta, adjust, due, paid, refund, balance } = charges;
    const familyPayments = paymentsByFamilyId.get(family.id) || [];
    const methods = Array.from(new Set([
      ...legacyMethods(legacyPayment),
      ...familyPayments
        .map((payment) => payment.method)
        .filter(Boolean),
    ]));
      return {
        id: family.id,
        fam_id: family.legacy_family_id || family.id,
        family_registration_id: legacyPayment?.id || null,
        email: family.email,
        name: fullName(family),
        tuition: formatDonation(tuition),
        pta: formatDonation(pta),
        adjust: formatDonation(adjust),
        adjust_amount: adjust,
      due: formatDonation(due),
      refund: formatDonation(refund),
      paid: formatDonation(paid),
      balance: formatDonation(balance),
      method: methods.join(", "),
      transactions: familyPayments.map((payment) => {
        const refundAlreadyRecorded = familyPayments.some((candidate) => (
          candidate.status === "refunded"
          && String(candidate.notes || "").startsWith(`Refund for payment #${payment.id}`)
        ));
        return {
          id: payment.id,
          family_id: payment.family_id,
          method: payment.method || "",
          paid: payment.status === "paid" ? formatPaymentAmount(payment.amount_cents, payment.currency) : "",
          refund: payment.status === "refunded" ? formatPaymentAmount(payment.amount_cents, payment.currency) : "",
          amount_cents: payment.amount_cents,
          currency: payment.currency,
          paid_at: formatTimestamp(payment.paid_at),
          status: payment.status || "",
          check_number: payment.check_number,
          notes: payment.notes,
          canRefund: payment.status === "paid" && ["cash", "check"].includes(payment.method) && !refundAlreadyRecorded,
          detail: payment.check_number
            ? `Check #${payment.check_number}`
            : payment.card_last4
              ? `${payment.card_brand || "card"} ending ${payment.card_last4}`
              : payment.stripe_checkout_session_id || payment.notes || "",
        };
      }),
      sort_due: due,
      sort_paid: paid,
      sort_balance: balance,
    };
  }).filter((row) => hasFamilyId(row.fam_id) && (row.sort_due > 0 || row.sort_paid > 0)), (row) => `${row.name || ""} ${row.email || ""} ${row.fam_id || ""}`);
  const paymentHistoryQuery = paymentHistorySearch.trim().toLowerCase();
  const visiblePaymentRows = paymentHistoryQuery
    ? paymentRows.filter((row) => {
      const haystack = [
        row.fam_id, row.email, row.name, row.tuition, row.pta, row.adjust, row.due,
        row.refund, row.paid, row.balance, row.method,
        ...row.transactions.flatMap((payment) => [
          payment.id, payment.method, payment.paid, payment.refund, payment.status, payment.paid_at, payment.detail,
        ]),
      ].join(" ").toLowerCase();
      return haystack.includes(paymentHistoryQuery);
    })
    : paymentRows;
  const exportPaymentHistory = () => {
    const rows = [
      [
        "FamID", "Email", "Name", "Tuition", "PTA", "Adjust", "Due", "Refund", "Paid", "Balance",
        "Method", "Transaction Status", "Transaction Timestamp", "Transaction Detail",
      ],
      ...visiblePaymentRows.flatMap((row) => [
        [row.fam_id, row.email, row.name, row.tuition, row.pta, row.adjust, row.due, row.refund, row.paid, row.balance, row.method, "", "", ""],
        ...row.transactions.map((payment) => [
          row.fam_id, "", `Payment ${payment.id}`, "", "", "", "", payment.refund, payment.paid, "", payment.method,
          payment.status, payment.paid_at, payment.detail,
        ]),
      ]),
    ];
    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `payment-history-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PortalLayout
      title={role === roles.superadmin ? "Administrator Portal" : isAdmin ? "Management Team Portal" : "Teacher / TA Portal"}
      tabs={tabs}
      active={active}
      setActive={setActive}
    >
      <Status status={status} />
      {active === "classes" && (isAdmin ? <ClassManager classes={classes} classTimes={classTimes} teachers={teachers} assignments={assignments} registrations={registrations} onReload={load} setStatus={setStatus} /> : <div className="portal-panel"><div className="panel-heading"><div><span>课程</span><h2>My Classes</h2></div></div><DataTable columns={[["id", "ID"], ["name", "Name"], ["count", "Registered"], ["available", "Available"], ["teacher", "Teacher"], ["room", "Room"], ["time", "Time"]]} rows={classRows} /></div>)}
      {active === "teachers" && <TeacherManager teachers={teachers} assignments={assignments} onReload={load} setStatus={setStatus} />}
      {["rosters", "attendance", "grades", "email"].includes(active) && (
        <div className={`portal-panel ${active === "rosters" ? "print-area" : ""}`}>
          <div className="panel-heading">
            <div><span>报名单</span><h2>{active === "rosters" ? "Class Roster" : active === "email" ? "Email Students" : active[0].toUpperCase() + active.slice(1)}</h2></div>
            {active === "rosters" && (
              <div className="button-row no-print">
                <button className="outline-link" type="button" onClick={() => window.print()}>Print Roster</button>
                <button
                  className="button-link"
                  type="button"
                  onClick={sendRosterEmail}
                  disabled={rosterEmailBusy || !selectedTeacherEmail}
                  title={selectedTeacherEmail ? "" : "No teacher email is available for this class."}
                >
                  {rosterEmailBusy ? "Sending..." : "Email to Teacher"}
                </button>
              </div>
            )}
          </div>
          <label className="standalone-field no-print"><span>Class</span><select value={selectedClassValue} onChange={(event) => setSelectedClass(event.target.value)}>{activeClassOptions.map((row) => <option value={row.id} key={row.id}>{row.name}</option>)}</select></label>
          {active === "rosters" && (
            <div className="roster-summary">
              <div><span>Class</span><strong>{selectedCourse?.name || "Class Roster"}</strong></div>
              <div><span>Time</span><strong>{selectedCourse?.class_times?.display_time || "Time TBD"}</strong></div>
              <div><span>Teacher</span><strong>{teacherDisplayName(selectedCourse, teachers, assignments, "Teacher TBD")}</strong></div>
              <div><span>Classroom</span><strong>{selectedCourse?.classroom || "Room TBD"}</strong></div>
            </div>
          )}
          {active === "rosters" && <DataTable columns={[["family_id", "Family ID"], ["student", "Student"], ["parent", "Parent"], ["email", "Email"], ["phone", "Phone"]]} rows={rosterRows} />}
          {active === "attendance" && (
            <div className="attendance-panel">
              <div className="attendance-toolbar">
                <label className="standalone-field">
                  <span>Attendance date</span>
                  <input type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} />
                </label>
              </div>
              {!rosterRows.length && <div className="empty-state">No students are registered for this class.</div>}
              {rosterRows.map((row) => (
                <div className="attendance-row" key={row.id}>
                  <div>
                    <strong>{row.student}</strong>
                    <span>{attendanceForSelectedDate[row.student_id]?.recorded_at ? `Last saved ${new Date(attendanceForSelectedDate[row.student_id].recorded_at).toLocaleString()}` : "No record for this date"}</span>
                  </div>
                  <select
                    value={attendanceForSelectedDate[row.student_id]?.status || ""}
                    onChange={(event) => saveAttendance(row.student_id, Number(selectedClassValue), event.target.value)}
                  >
                    <option value="" disabled>Select status</option>
                    <option value="absent">Absent</option>
                    <option value="excused">Excused</option>
                    <option value="late">Late</option>
                    <option value="present">Present</option>
                  </select>
                </div>
              ))}
              <div className="attendance-history">
                <h3>Attendance History</h3>
                {!attendanceHistoryGroups.length && <div className="empty-state">No attendance records for this class.</div>}
                {attendanceHistoryGroups.map((group) => {
                  const expanded = Boolean(expandedAttendanceDates[group.date]);
                  return (
                    <section className="attendance-history-group" key={group.date}>
                      <button className="attendance-history-date" type="button" onClick={() => toggleAttendanceDate(group.date)} aria-expanded={expanded}>
                        <span>{expanded ? "v" : ">"}</span>
                        <strong>{group.date}</strong>
                        <small>
                          {group.rows.length} records
                          {group.counts.present ? ` · Present ${group.counts.present}` : ""}
                          {group.counts.absent ? ` · Absent ${group.counts.absent}` : ""}
                          {group.counts.late ? ` · Late ${group.counts.late}` : ""}
                          {group.counts.excused ? ` · Excused ${group.counts.excused}` : ""}
                        </small>
                      </button>
                      {expanded && (
                        <div className="data-table-wrap attendance-history-table">
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>Recorded</th>
                                <th>Student</th>
                                <th>Status</th>
                                <th>Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.rows.map((row) => (
                                <tr key={row.id}>
                                  <td>{row.recorded_at}</td>
                                  <td>{row.student}</td>
                                  <td>{row.status}</td>
                                  <td>{row.notes}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </div>
          )}
          {active === "grades" && (
            <div className="grades-panel">
              <form className="grades-entry" onSubmit={saveGrades}>
                <label className="standalone-field">
                  <span>Exam name</span>
                  <input value={examName} onChange={(event) => setExamName(event.target.value)} placeholder="e.g. Midterm Exam" required />
                </label>
                {!rosterRows.length && <div className="empty-state">No students are registered for this class.</div>}
                {rosterRows.length > 0 && (
                  <div className="data-table-wrap grade-entry-table">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rosterRows.map((row) => (
                          <tr key={row.student_id}>
                            <td>{row.student}</td>
                            <td>
                              <input
                                type="number"
                                step="0.01"
                                value={gradeScores[row.student_id] ?? ""}
                                onChange={(event) => setGradeScores({
                                  ...gradeScores,
                                  [row.student_id]: event.target.value,
                                })}
                                placeholder="Score"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <button className="button-link" type="submit" disabled={!rosterRows.length}>Save grades</button>
              </form>
              <div className="grades-history">
                <h3>Grades History</h3>
                {!gradeExamGroups.length && <div className="empty-state">No grade records for this class.</div>}
                {gradeExamGroups.map((group) => {
                  const expanded = Boolean(expandedGradeExams[group.exam]);
                  return (
                    <section className="grade-history-group" key={group.exam}>
                      <button className="grade-history-exam" type="button" onClick={() => toggleGradeExam(group.exam)} aria-expanded={expanded}>
                        <span>{expanded ? "v" : ">"}</span>
                        <strong>{group.exam}</strong>
                        <small>{group.rows.length} grades{group.recordedAt ? ` · Last saved ${group.recordedAt}` : ""}</small>
                      </button>
                      {expanded && (
                        <>
                          <div className="grade-history-actions">
                            <button className="outline-link" type="button" onClick={() => loadExamForEdit(group.exam)}>Edit this exam</button>
                          </div>
                          <div className="data-table-wrap grade-history-table">
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>Student</th>
                                  <th>Score</th>
                                  <th>Recorded</th>
                                  <th>Comments</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.rows.map((row) => (
                                  <tr key={row.id}>
                                    <td>{row.student}</td>
                                    <td>{row.score}</td>
                                    <td>{row.recorded_at}</td>
                                    <td>{row.comments}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </section>
                  );
                })}
              </div>
            </div>
          )}
          {active === "email" && (
            <div className="student-email-panel">
              <div className="form-message">
                You need a ctsccs.org teacher email to email students. Messages are sent through SCCS email and CC your teacher email automatically.
              </div>
              {!rosterRows.length && <div className="empty-state">No students are registered for this class.</div>}
              {rosterRows.map((row) => {
                const target = `student-${row.student_id}`;
                const draft = emailDrafts[target] || {};
                const expanded = emailTarget === target;
                return (
                  <section className="student-email-card" key={row.id}>
                    <div className="student-email-row">
                      <div>
                        <strong>{row.student}</strong>
                        <span>{row.email || "No email available"}</span>
                      </div>
                      <button
                        className="outline-link"
                        type="button"
                        onClick={() => setEmailTarget(expanded ? "" : target)}
                        disabled={!row.email}
                      >
                        Email
                      </button>
                    </div>
                    {expanded && (
                      <div className="student-email-form">
                        <input
                          value={draft.subject || ""}
                          onChange={(event) => updateEmailDraft(target, "subject", event.target.value)}
                          placeholder="Title"
                        />
                        <textarea
                          value={draft.message || ""}
                          onChange={(event) => updateEmailDraft(target, "message", event.target.value)}
                          placeholder="Content"
                        />
                        <button
                          className="button-link"
                          type="button"
                          onClick={() => sendStudentEmail(target, [row.email])}
                          disabled={emailBusyTarget === target}
                        >
                          {emailBusyTarget === target ? "Sending..." : "Send"}
                        </button>
                      </div>
                    )}
                  </section>
                );
              })}
              {rosterRows.length > 0 && (
                <section className="student-email-card email-all-card">
                  <div className="student-email-row">
                    <div>
                      <strong>Email to All</strong>
                      <span>{Array.from(new Set(rosterRows.map((row) => row.email).filter(Boolean))).length} available emails</span>
                    </div>
                    <button className="outline-link" type="button" onClick={() => setEmailTarget(emailTarget === "all" ? "" : "all")}>
                      Email to All
                    </button>
                  </div>
                  {emailTarget === "all" && (
                    <div className="student-email-form">
                      <input
                        value={emailDrafts.all?.subject || ""}
                        onChange={(event) => updateEmailDraft("all", "subject", event.target.value)}
                        placeholder="Title"
                      />
                      <textarea
                        value={emailDrafts.all?.message || ""}
                        onChange={(event) => updateEmailDraft("all", "message", event.target.value)}
                        placeholder="Content"
                      />
                      <button
                        className="button-link"
                        type="button"
                        onClick={() => sendStudentEmail("all", Array.from(new Set(rosterRows.map((row) => row.email).filter(Boolean))))}
                        disabled={emailBusyTarget === "all"}
                      >
                        {emailBusyTarget === "all" ? "Sending..." : "Send"}
                      </button>
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </div>
      )}
      {active === "registrations" && <div className="portal-panel"><div className="panel-heading"><div><span>所有注册课程信息</span><h2>Registration Summary</h2></div></div><DataTable columns={[["family_id", "Family ID"], ["parent", "Parent"], ["student_id", "Student ID"], ["student", "Student"], ["session_1", "Session 1"], ["session_2", "Session 2"], ["session_3", "Session 3"]]} rows={registrationRows} /></div>}
      {active === "payments" && (
        <div className="portal-panel">
          <div className="panel-heading">
            <div><span>支付记录</span><h2>Payment History</h2></div>
            <button className="outline-link" type="button" onClick={exportPaymentHistory}>Export to CSV</button>
          </div>
          <form className="portal-form compact payment-record-form" onSubmit={savePayment}>
            <label>
              <span>Family</span>
              <input
                list="payment-family-options"
                value={paymentForm.family_query}
                onChange={(event) => {
                  const value = event.target.value;
                  const selected = paymentFamilyOptions.find((family) => paymentFamilySearchLabel(family) === value);
                  setPaymentForm({
                    ...paymentForm,
                    family_query: value,
                    family_id: selected?.id || "",
                  });
                }}
                placeholder="FamID, email, or name"
                required
              />
              <datalist id="payment-family-options">
                {paymentFamilyOptions.map((family) => (
                  <option value={paymentFamilySearchLabel(family)} key={family.id} />
                ))}
              </datalist>
            </label>
            <label>
              <span>Type</span>
              <select value={paymentForm.type} onChange={(event) => setPaymentForm({ ...paymentForm, type: event.target.value })}>
                <option value="payment">Payment</option>
                <option value="refund">Refund</option>
              </select>
            </label>
            <label>
              <span>Method</span>
              <select value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })}>
                <option value="cash">Cash</option>
                <option value="check">Check</option>
              </select>
            </label>
            <label>
              <span>Amount</span>
              <input type="number" step="0.01" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} placeholder="0.00" required />
            </label>
            <label>
              <span>Check #</span>
              <input value={paymentForm.check_number} onChange={(event) => setPaymentForm({ ...paymentForm, check_number: event.target.value })} disabled={paymentForm.method !== "check"} />
            </label>
            <label className="wide">
              <span>Notes</span>
              <input value={paymentForm.notes} onChange={(event) => setPaymentForm({ ...paymentForm, notes: event.target.value })} />
            </label>
            <button className="button-link" type="submit">
              {paymentForm.type === "refund" ? "Record refund" : "Record payment"}
            </button>
          </form>
          <label className="standalone-field payment-history-search">
            <span>Search Payment History</span>
            <input
              value={paymentHistorySearch}
              onChange={(event) => setPaymentHistorySearch(event.target.value)}
              placeholder="FamID, email, name, method, check number, or transaction detail"
            />
          </label>
          {!visiblePaymentRows.length ? (
            <div className="empty-state">No payment records.</div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table payment-history-table">
                <thead>
                  <tr>
                    <th>FamID</th>
                    <th>Email</th>
                    <th>Name</th>
                    <th>Tuition</th>
                    <th>PTA</th>
                    <th>Adjust</th>
                    <th>Due</th>
                    <th>Refund</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Method</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePaymentRows.map((row) => (
                    <React.Fragment key={row.id}>
                      <tr>
                        <td>{row.fam_id}</td>
                        <td>{row.email}</td>
                        <td>{row.name}</td>
                        <td>{row.tuition}</td>
                        <td>{row.pta}</td>
                        <td>
                          {adjustEdit?.familyId === row.id ? (
                            <div className="inline-adjust-editor">
                              <input
                                type="number"
                                step="1"
                                value={adjustEdit.value}
                                onChange={(event) => setAdjustEdit({ ...adjustEdit, value: event.target.value })}
                                aria-label={`Adjustment for ${row.name || row.fam_id}`}
                              />
                              <button className="outline-link compact-action" type="button" onClick={() => saveAdjust(row)}>Save</button>
                              <button className="outline-link compact-action" type="button" onClick={() => setAdjustEdit(null)}>Cancel</button>
                            </div>
                          ) : (
                            <div className="inline-adjust-display">
                              <button className="inline-adjust-value" type="button" onClick={() => beginAdjustEdit(row)}>
                                {row.adjust}
                              </button>
                            </div>
                          )}
                        </td>
                        <td>{row.due}</td>
                        <td>{row.refund}</td>
                        <td>{row.paid}</td>
                        <td>{row.balance}</td>
                        <td>{row.method}</td>
                      </tr>
                      {row.transactions.length > 0 && (
                        <tr className="payment-transactions-row">
                          <td aria-label="FamID">{row.fam_id}</td>
                          <td colSpan="10">
                            <table className="payment-transactions-table">
                              <thead>
                                <tr>
                                  <th>Payment</th>
                                  <th>Method</th>
                                  <th>Paid</th>
                                  <th>Refund</th>
                                  <th>Status</th>
                                  <th>Timestamp</th>
                                  <th>Detail</th>
                                  <th>Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.transactions.map((payment) => (
                                  <tr key={payment.id}>
                                    <td>#{payment.id}</td>
                                    <td>{payment.method}</td>
                                    <td>{payment.paid}</td>
                                    <td>{payment.refund}</td>
                                    <td>{payment.status}</td>
                                    <td>{payment.paid_at}</td>
                                    <td>{payment.detail}</td>
                                    <td>
                                      {payment.canRefund && (
                                        <button className="outline-link compact-action" type="button" onClick={() => refundPayment(payment)}>
                                          Refund
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {active === "search" && <div className="portal-panel"><div className="panel-heading"><div><span>家庭与学生搜索</span><h2>Search Families</h2></div></div><label className="standalone-field"><span>Family ID, parent/student name, phone, or email</span><input value={search} onChange={(event) => { setSearch(event.target.value); setSelectedPrintFamilyId(""); }} /></label><ActionTable columns={["Family ID", "Parent", "Student", "Email", "Phone", "Status"]} rows={searchActionRows} empty="Enter a search term." /></div>}
      {active === "print" && (
        <div className="portal-panel print-area">
          <div className="panel-heading">
            <div><span>打印注册信息</span><h2>Print Registration</h2></div>
            <button className="outline-link no-print" type="button" onClick={() => window.print()} disabled={!selectedPrintFamily}>Print</button>
          </div>
          {!query && <div className="empty-state no-print">Use Family Search first, then return here to print the family summary.</div>}
          {query && printFamilyOptions.length > 1 && (
            <label className="standalone-field no-print">
              <span>Select family to print</span>
              <select value={selectedPrintFamily?.id || ""} onChange={(event) => setSelectedPrintFamilyId(event.target.value)}>
                <option value="">Select family</option>
                {printFamilyOptions.map((family) => (
                  <option value={family.id} key={family.id}>
                    {family.legacy_family_id || family.id} · {fullName(family) || family.email || "Family"}
                  </option>
                ))}
              </select>
            </label>
          )}
          {query && !printFamilyOptions.length && <div className="empty-state no-print">No matching family found. Refine Family Search and try again.</div>}
          {selectedPrintFamily && (
            <>
              <div className="panel-heading print-summary-heading">
                <div><span>账户概览</span><h2>Family Summary</h2></div>
              </div>
              <dl className="summary-grid">
                <div><dt>Family ID</dt><dd>{selectedPrintFamily.legacy_family_id || selectedPrintFamily.id}</dd></div>
                <div><dt>Parent</dt><dd>{fullName(selectedPrintFamily) || "Not provided"}</dd></div>
                <div><dt>Email</dt><dd>{selectedPrintFamily.email || "Not provided"}</dd></div>
                <div><dt>Phone</dt><dd>{selectedPrintFamily.phone || "Not provided"}</dd></div>
                <div className="wide"><dt>Address</dt><dd>{[selectedPrintFamily.address, selectedPrintFamily.city, selectedPrintFamily.state, selectedPrintFamily.zip].filter(Boolean).join(", ") || "Not provided"}</dd></div>
              </dl>
              <h3>Students and registrations</h3>
              {!selectedPrintStudents.length && <div className="empty-state">No students found for this family.</div>}
              {selectedPrintStudents.map((student) => {
                const registration = selectedPrintRegistrations[student.id] || {};
                const registeredCourses = adminRegisteredCoursesFor(registration);
                return (
                  <div className="student-summary" key={student.id}>
                    <div className="student-summary-heading">
                      <strong>{fullName(student)} {student.chinese_name && `· ${student.chinese_name}`}</strong>
                    </div>
                    {registeredCourses.length ? (
                      <div className="student-course-table data-table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Time</th>
                              <th>Course</th>
                              <th>Classroom</th>
                              <th>Teacher</th>
                              <th>Donation</th>
                            </tr>
                          </thead>
                          <tbody>
                            {registeredCourses.map((course) => (
                              <tr key={course.id}>
                                <td>{course.time}</td>
                                <td>{course.name || course.short_name}</td>
                                <td>{course.classroom}</td>
                                <td>{course.teacher}</td>
                                <td>{formatDonation(course.donation)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <span className="student-no-registration">No classes selected.</span>
                    )}
                  </div>
                );
              })}
              <div className="donation-summary">
                <div><span>Donation subtotal</span><strong>{formatDonation(selectedPrintDonationTotal)}</strong></div>
                <div><span>Safety Patrol Deposit</span><strong>{formatDonation(SAFETY_PATROL_DEPOSIT)}</strong></div>
                <div className="donation-total-row"><span>Total</span><strong>{formatDonation(selectedPrintDonationTotal + SAFETY_PATROL_DEPOSIT)}</strong></div>
              </div>
              <div className="registration-notes">
                <strong>Notes</strong>
                <p>1. 填写付款信息 Fill out payment information on both copies;</p>
                <p>2. 和支票一起交给注册工作人员 Please bring the Registration Summary along with a payment check to the Registration Desk.</p>
                <p>3. Safety Patrol Deposit: $40 将在家长参与学校值日后退还 $40 will be refunded after parents participate in school safety patrol duty.</p>
              </div>
              <section className="office-use">
                <h3>For Office Use Only</h3>
                <div className="office-use-grid">
                  <div><span>FamID:</span><strong>{selectedPrintFamily.legacy_family_id || selectedPrintFamily.id}</strong></div>
                  <div><span>Name:</span><strong>{fullName(selectedPrintFamily) || "Not provided"}</strong></div>
                  <div><span>Email:</span><strong>{selectedPrintFamily.email || "Not provided"}</strong></div>
                  <div><span>Total Amount Received $</span><i /></div>
                  <div><span>Check #</span><i /></div>
                  <div><span>Cash $</span><i /></div>
                  <div><span>Payment Received By:</span><i /></div>
                  <div><span>Paid By:</span><i /></div>
                  <div><span>Print Name:</span><i /></div>
                  <div><span>Signature:</span><i /></div>
                  <div><span>Print Name:</span><i /></div>
                  <div><span>Signature:</span><i /></div>
                </div>
              </section>
            </>
          )}
        </div>
      )}
      {active === "staff" && <StaffUserManager />}
      {active === "settings" && (
        <div className="portal-panel">
          <div className="panel-heading"><div><span>网站配置</span><h2>Site Settings</h2></div></div>
          <form className="portal-form compact" onSubmit={saveSetting}>
            <label>
              <span>Setting key</span>
              <input value={settingKey} onChange={(event) => setSettingKey(event.target.value)} placeholder="registration_change_deadline" required />
            </label>
            <label>
              <span>JSON value or text</span>
              <input value={settingValue} onChange={(event) => setSettingValue(event.target.value)} placeholder='{"date":"2026-09-21"}' required />
            </label>
            <button className="button-link" type="submit">Save setting</button>
          </form>
          <div className="data-table-wrap site-settings-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Value</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {siteSettingRows.map((row) => {
                  const rowId = `${row.exists ? "saved" : "new"}-${row.key}`;
                  const isEditing = settingEdit?.rowId === rowId;
                  return (
                    <tr key={rowId}>
                      <td>
                        {isEditing ? (
                          <input
                            className="setting-key-input"
                            value={settingEdit.key}
                            onChange={(event) => setSettingEdit({ ...settingEdit, key: event.target.value })}
                          />
                        ) : (
                          <button className="setting-value-button key" type="button" onClick={() => beginSettingEdit(row)}>
                            {row.key}
                          </button>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <div className="setting-value-editor">
                            <textarea
                              value={settingEdit.value}
                              onChange={(event) => setSettingEdit({ ...settingEdit, value: event.target.value })}
                            />
                            <div className="setting-editor-actions">
                              <button className="outline-link compact-action" type="button" onClick={saveSettingEdit}>Save</button>
                              <button className="outline-link compact-action" type="button" onClick={() => setSettingEdit(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button className="setting-value-button" type="button" onClick={() => beginSettingEdit(row)}>
                            {JSON.stringify(row.value)}
                          </button>
                        )}
                      </td>
                      <td>{row.exists ? formatTimestamp(row.updated_at) : "Not saved"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {active === "password" && (
        <div className="password-panel-stack">
          <form className="portal-form compact" onSubmit={changePassword}>
            <div className="panel-heading"><div><span>更改密码</span><h2>Change Password</h2></div></div>
            <label className="wide"><span>New password</span><input type="password" minLength="12" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
            <button className="button-link" type="submit">Update password</button>
          </form>
        </div>
      )}
    </PortalLayout>
  );
}

export function AccountPage({ Link, staffOnly = false }) {
  const { session, loading, role, signOut } = useAuth();
  if (loading) return <article className="inner-page"><section className="page-section"><p>Loading...</p></section></article>;
  if (!session) return <article className="inner-page"><section className="page-section"><p>Please log in first.</p><Link className="button-link" to="/login">Log in</Link></section></article>;
  if (staffOnly && role === roles.family) return <article className="inner-page"><section className="page-section"><div className="form-message error">This account is not authorized for the staff portal. Please contact IT.</div></section></article>;
  if (!staffOnly && role !== roles.family) return <article className="inner-page"><section className="page-section"><div className="form-message">Online Registration is for family accounts. Teacher and admin login links are sent separately by email.</div><button className="outline-link" type="button" onClick={signOut}>Log out</button></section></article>;
  if (role === roles.family) return <FamilyPortal />;
  if (role === roles.teacher) return <StaffPortal isAdmin={false} />;
  return <StaffPortal isAdmin />;
}
