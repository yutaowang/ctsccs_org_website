import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth";
import { courseDescriptionLinkFor } from "./pages";
import { supabase } from "./supabase";

const roles = {
  family: "sccs_family_role",
  teacher: "sccs_teacher_ta_role",
  team: "sccs_admin_team_role",
  admin: "admin",
};
const familyFields = [
  "family_name", "parent_first_name", "parent_last_name", "parent_chinese_name",
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
  const [registrationDeadline, setRegistrationDeadline] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState({ error: "", message: "" });

  const load = async () => {
    const [classResult, familyResult, settingResult] = await Promise.all([
      supabase.from("public_course_schedule")
        .select("id, name, short_name, type, classroom, teacher_short_name, teacher_name, class_time_id, display_time")
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
    if (!familyResult.data) return;
    setFamily(familyResult.data);
    const studentResult = await supabase.from("students")
      .select("*").eq("family_id", familyResult.data.id).order("created_at");
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
  const tabs = [
    ["summary", "Summary"],
    ["student", "Student"],
    ["register", "Register"],
    ["profile", "Profile"],
    ["password", "Password"],
  ];
  const registrationChangeOpen = isDateOpenThrough(registrationDeadline);

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
            const registeredCourses = [1, 2, 3]
              .map((number) => courseDetails(registration[`session_${number}`]))
              .filter(Boolean);
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
                          <th>Introduction</th>
                        </tr>
                      </thead>
                      <tbody>
                        {registeredCourses.map((course) => (
                          <tr key={course.id}>
                            <td>{course.time}</td>
                            <td>{course.name || course.short_name}</td>
                            <td>{course.classroom}</td>
                            <td>{course.teacher}</td>
                            <td>
                              {course.descriptionLink && (
                                <a href={course.descriptionLink} target="_blank" rel="noreferrer">
                                  Course description
                                </a>
                              )}
                            </td>
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
                    <option value="">Select</option><option>Male</option><option>Female</option><option>Other</option>
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
                        {classes.filter((course) => Number(course.class_time_id) === number).map((course) => (
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
          <div className="panel-heading"><div><span>更新家庭信息</span><h2>Update Profile</h2></div></div>
          {familyFields.map((field) => (
            <label className={field === "address" ? "wide" : ""} key={field}>
              <span>{field.replaceAll("_", " ")}</span>
              <input value={family[field] || ""} onChange={(event) => setFamily({ ...family, [field]: event.target.value })} />
            </label>
          ))}
          <label className="wide"><span>Email / username</span><input value={session.user.email} disabled /></label>
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
    const menuHeight = 52;
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
          <button type="button" onClick={() => { setOpen(false); onEdit(); }}>Edit</button>
          <button className="danger" type="button" onClick={() => { setOpen(false); onDelete(); }} disabled={disabled}>Delete</button>
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
            <label><span>Teacher</span><select value={form.teacher_id} onChange={(event) => updateClassTeacher(event.target.value)}><option value="">No teacher assigned</option>{teachers.map((teacher) => <option value={teacher.id} key={teacher.id}>{teacherLabel(teacher)}</option>)}</select></label>
            <label><span>Teacher short name</span><input value={form.teacher_short_name} readOnly /></label>
            <label><span>Class time</span><select value={form.class_time_id} onChange={(event) => setForm({ ...form, class_time_id: event.target.value })}><option value="">No time selected</option>{classTimes.map((time) => <option value={time.id} key={time.id}>{time.display_time || time.name || time.id}</option>)}</select></label>
            <label><span>Classroom</span><input value={form.classroom} onChange={(event) => setForm({ ...form, classroom: event.target.value })} /></label>
            <label><span>Type</span><input value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} /></label>
            <label><span>Maximum seats</span><input type="number" min="0" value={form.maximum} onChange={(event) => setForm({ ...form, maximum: event.target.value })} /></label>
            <label><span>Tuition / donation</span><input type="number" min="0" value={form.donation} onChange={(event) => setForm({ ...form, donation: event.target.value })} /></label>
            <label><span>Equivalent</span><input value={form.equivalent} onChange={(event) => setForm({ ...form, equivalent: event.target.value })} /></label>
            <label className="wide"><span>Textbook</span><input value={form.textbook} onChange={(event) => setForm({ ...form, textbook: event.target.value })} /></label>
            <label><span>Status</span><select value={form.is_open ? "open" : "closed"} onChange={(event) => setForm({ ...form, is_open: event.target.value === "open" })}><option value="open">Open</option><option value="closed">Closed</option></select></label>
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

function TeacherManager({ teachers, onReload, setStatus }) {
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
    setBusy(true);
    const result = await supabase.from("teachers").delete().eq("id", teacher.id);
    if (result.error) {
      setStatus({ error: result.error.message, message: "" });
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
  const [registrations, setRegistrations] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [payments, setPayments] = useState([]);
  const [userRoles, setUserRoles] = useState([]);
  const [siteSettings, setSiteSettings] = useState([]);
  const [settingKey, setSettingKey] = useState("");
  const [settingValue, setSettingValue] = useState("");
  const [search, setSearch] = useState("");
  const [selectedPrintFamilyId, setSelectedPrintFamilyId] = useState("");
  const [selectedClass, setSelectedClass] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showAttendanceHistory, setShowAttendanceHistory] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState({ error: "", message: "" });
  const [rosterEmailBusy, setRosterEmailBusy] = useState(false);

  const load = async () => {
    const requests = [
      supabase.from("classes").select("*, class_times(display_time)").order("name"),
      supabase.from("class_times").select("*").order("id"),
      supabase.from("teacher_classes").select("*"),
      supabase.from("teachers").select("*").order("last_name"),
      supabase.from("students").select("*").order("last_name"),
      supabase.from("families").select("*").order("legacy_family_id"),
      supabase.from("class_registrations").select("*"),
      supabase.from("attendance").select("*").order("class_date", { ascending: false }),
    ];
    if (isAdmin) {
      requests.push(
        supabase.from("family_registrations").select("*"),
        supabase.from("user_roles").select("*").order("created_at"),
        supabase.from("site_settings").select("*").order("key"),
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
    if (isAdmin) {
      setPayments(results[8].data || []);
      setUserRoles(results[9].data || []);
      setSiteSettings(results[10].data || []);
    }
  };
  useEffect(() => { load(); }, [role, teacherId]);
  useEffect(() => {
    if (active === "classes") load();
  }, [active]);

  const visibleClassIds = useMemo(() => {
    if (isAdmin) return new Set(classes.map((row) => row.id));
    return new Set(
      assignments.filter((row) => row.teacher_id === teacherId).map((row) => row.class_id),
    );
  }, [assignments, classes, isAdmin, teacherId]);
  const visibleClasses = classes.filter((row) => visibleClassIds.has(row.id));
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

  const saveGrade = async (event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const result = await supabase.from("student_grades").upsert({
      class_id: Number(values.get("class_id")),
      student_id: Number(values.get("student_id")),
      grading_period: values.get("grading_period"),
      assignment_name: values.get("assignment_name"),
      score: values.get("score") ? Number(values.get("score")) : null,
      maximum_score: values.get("maximum_score") ? Number(values.get("maximum_score")) : null,
      letter_grade: values.get("letter_grade") || null,
      comments: values.get("comments") || null,
      recorded_by: session.user.id,
    }, { onConflict: "class_id,student_id,grading_period,assignment_name" });
    setStatus(result.error
      ? { error: result.error.message, message: "" }
      : { error: "", message: "Grade saved." });
    if (!result.error) event.currentTarget.reset();
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

  const saveSetting = async (event) => {
    event.preventDefault();
    let value;
    try {
      value = JSON.parse(settingValue);
    } catch {
      value = { text: settingValue };
    }
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
  if (role === roles.admin) adminTabs.push(["staff", "ADMINS"], ["settings", "Site Settings"]);
  adminTabs.push(["password", "Password"]);
  const teacherTabs = [
    ["classes", "My Classes"], ["rosters", "Roster"], ["attendance", "Attendance"],
    ["grades", "Grades"], ["email", "Email Students"], ["password", "Password"],
  ];
  const tabs = isAdmin ? adminTabs : teacherTabs;
  const query = search.trim().toLowerCase();
  const searchRows = !query ? [] : students.map((student) => {
    const family = families.find((row) => row.id === student.family_id);
    return {
      id: student.id,
      family_record_id: family?.id,
      family_id: family?.legacy_family_id || family?.id,
      parent: fullName(family),
      student: fullName(student),
      email: family?.email,
      phone: family?.phone,
    };
  })
    .filter((row) => hasFamilyId(row.family_id))
    .filter((row) => Object.values(row).some((value) => String(value || "").toLowerCase().includes(query)));
  const printFamilyOptions = Array.from(
    new Map(
      searchRows
        .map((row) => families.find((family) => family.id === row.family_record_id))
        .filter(Boolean)
        .map((family) => [family.id, family]),
    ).values(),
  );
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
  const registrationRows = registrations.map((row) => {
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
  }).filter((row) => hasFamilyId(row.family_id));
  const paymentRows = payments.map((row) => {
    const family = families.find((item) => item.id === row.family_id);
    const due = Number(row.registration_fee || 0) + Number(row.late_fee || 0);
    const paid = [
      row.pay_1_cash, row.pay_1_check, row.pay_2_cash, row.pay_2_check,
      row.pay_3_cash, row.pay_3_check, row.pay_4_cash, row.pay_4_check,
      row.pay_5_cash, row.pay_5_check,
    ].reduce((sum, value) => sum + Number(value || 0), 0);
    return {
      id: row.id,
      family_id: family?.legacy_family_id || family?.id,
      email: family?.email,
      name: fullName(family),
      due,
      paid,
      balance: due - paid,
    };
  }).filter((row) => hasFamilyId(row.family_id));

  return (
    <PortalLayout
      title={role === roles.admin ? "Administrator Portal" : isAdmin ? "Management Team Portal" : "Teacher / TA Portal"}
      tabs={tabs}
      active={active}
      setActive={setActive}
    >
      <Status status={status} />
      {active === "classes" && (isAdmin ? <ClassManager classes={classes} classTimes={classTimes} teachers={teachers} assignments={assignments} registrations={registrations} onReload={load} setStatus={setStatus} /> : <div className="portal-panel"><div className="panel-heading"><div><span>课程</span><h2>My Classes</h2></div></div><DataTable columns={[["id", "ID"], ["name", "Name"], ["count", "Registered"], ["available", "Available"], ["teacher", "Teacher"], ["room", "Room"], ["time", "Time"]]} rows={classRows} /></div>)}
      {active === "teachers" && <TeacherManager teachers={teachers} onReload={load} setStatus={setStatus} />}
      {["rosters", "attendance", "grades", "email"].includes(active) && (
        <div className={`portal-panel ${active === "rosters" ? "print-area" : ""}`}>
          <div className="panel-heading">
            <div><span>报名单</span><h2>{active === "rosters" ? "Class Roster" : active[0].toUpperCase() + active.slice(1)}</h2></div>
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
                <button className="outline-link" type="button" onClick={() => setShowAttendanceHistory((current) => !current)}>
                  {showAttendanceHistory ? "Hide attendance history" : "Show attendance history"}
                </button>
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
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                    <option value="late">Late</option>
                    <option value="excused">Excused</option>
                  </select>
                </div>
              ))}
              {showAttendanceHistory && (
                <div className="attendance-history">
                  <h3>Attendance History</h3>
                  <DataTable
                    columns={[["date", "Date"], ["recorded_at", "Recorded"], ["student", "Student"], ["status", "Status"], ["notes", "Notes"]]}
                    rows={attendanceHistoryRows}
                    empty="No attendance records for this class."
                  />
                </div>
              )}
            </div>
          )}
          {active === "grades" && <form className="portal-form compact" onSubmit={saveGrade}><input type="hidden" name="class_id" value={selectedClassValue} /><label><span>Student</span><select name="student_id" required>{rosterRows.map((row) => <option value={row.student_id} key={row.id}>{row.student}</option>)}</select></label><label><span>Grading period</span><input name="grading_period" required /></label><label><span>Assignment</span><input name="assignment_name" required /></label><label><span>Score</span><input name="score" type="number" step="0.01" /></label><label><span>Maximum score</span><input name="maximum_score" type="number" step="0.01" /></label><label><span>Letter grade</span><input name="letter_grade" /></label><label className="wide"><span>Comments</span><textarea name="comments" /></label><button className="button-link" type="submit">Save grade</button></form>}
          {active === "email" && <div className="email-list">{rosterRows.map((row) => <a href={`mailto:${row.email}`} key={row.id}>{row.student} · {row.email}</a>)}</div>}
        </div>
      )}
      {active === "registrations" && <div className="portal-panel"><div className="panel-heading"><div><span>所有注册课程信息</span><h2>Registration Summary</h2></div></div><DataTable columns={[["family_id", "Family ID"], ["parent", "Parent"], ["student_id", "Student ID"], ["student", "Student"], ["session_1", "Session 1"], ["session_2", "Session 2"], ["session_3", "Session 3"]]} rows={registrationRows} /></div>}
      {active === "payments" && <div className="portal-panel"><div className="panel-heading"><div><span>支付记录</span><h2>Payment History</h2></div></div><DataTable columns={[["family_id", "Family ID"], ["email", "Email"], ["name", "Name"], ["due", "Due"], ["paid", "Paid"], ["balance", "Balance"]]} rows={paymentRows} /></div>}
      {active === "search" && <div className="portal-panel"><div className="panel-heading"><div><span>家庭与学生搜索</span><h2>Search Families</h2></div></div><label className="standalone-field"><span>Family ID, parent/student name, phone, or email</span><input value={search} onChange={(event) => { setSearch(event.target.value); setSelectedPrintFamilyId(""); }} /></label><DataTable columns={[["family_id", "Family ID"], ["parent", "Parent"], ["student", "Student"], ["email", "Email"], ["phone", "Phone"]]} rows={searchRows} empty="Enter a search term." /></div>}
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
                const registeredCourses = [1, 2, 3]
                  .map((number) => adminCourseDetails(registration[`session_${number}`]))
                  .filter(Boolean);
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
                              <th>Introduction</th>
                            </tr>
                          </thead>
                          <tbody>
                            {registeredCourses.map((course) => (
                              <tr key={course.id}>
                                <td>{course.time}</td>
                                <td>{course.name || course.short_name}</td>
                                <td>{course.classroom}</td>
                                <td>{course.teacher}</td>
                                <td>
                                  {course.descriptionLink && (
                                    <a href={course.descriptionLink} target="_blank" rel="noreferrer">
                                      Course description
                                    </a>
                                  )}
                                </td>
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
            </>
          )}
        </div>
      )}
      {active === "staff" && <StaffUserManager />}
      {active === "settings" && <div className="portal-panel"><div className="panel-heading"><div><span>网站配置</span><h2>Site Settings</h2></div></div><div className="form-message">To set the class change deadline, use key <strong>registration_change_deadline</strong> and value <strong>{"{\"date\":\"2026-09-21\"}"}</strong>.</div><form className="portal-form compact" onSubmit={saveSetting}><label><span>Setting key</span><input value={settingKey} onChange={(event) => setSettingKey(event.target.value)} placeholder="registration_change_deadline" required /></label><label><span>JSON value or text</span><input value={settingValue} onChange={(event) => setSettingValue(event.target.value)} placeholder='{"date":"2026-09-21"}' required /></label><button className="button-link" type="submit">Save setting</button></form><DataTable columns={[["key", "Key"], ["display_value", "Value"], ["updated_at", "Updated"]]} rows={siteSettings.map((row) => ({ ...row, display_value: JSON.stringify(row.value) }))} /></div>}
      {active === "password" && <form className="portal-form compact" onSubmit={changePassword}><div className="panel-heading"><div><span>更改密码</span><h2>Change Password</h2></div></div><label className="wide"><span>New password</span><input type="password" minLength="12" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label><button className="button-link" type="submit">Update password</button></form>}
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
