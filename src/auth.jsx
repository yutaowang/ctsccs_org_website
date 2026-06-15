import React, { createContext, useContext, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "./supabase";

const AuthContext = createContext({ session: null, loading: true, recovering: false });

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_OUT") setRecovering(false);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{
      session,
      loading,
      recovering,
      finishRecovery: () => setRecovering(false),
      signOut: () => supabase?.auth.signOut(),
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

function Layout({ title, children }) {
  return (
    <article className="inner-page">
      <header className="page-title"><span>My SCCS</span><h1>{title}</h1></header>
      <section className="page-section auth-card">{children}</section>
    </article>
  );
}

function Message({ error, message }) {
  if (!error && !message) return null;
  return <div className={`form-message ${error ? "error" : ""}`}>{error || message}</div>;
}

export function LoginPage({ Link }) {
  const { session, loading } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const options = { emailRedirectTo: `${window.location.origin}/account` };
    let result;

    if (mode === "signup") {
      result = await supabase.auth.signUp({ email, password, options });
    } else if (mode === "reset") {
      const response = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await response.json();
      result = response.ok ? { data: body, error: null } : {
        data: null,
        error: new Error(body.error || "Password reset request failed."),
      };
    } else {
      result = await supabase.auth.signInWithPassword({ email, password });
    }

    setBusy(false);
    if (result.error) setError(result.error.message);
    else if (mode === "signup") setMessage("Account created. Please confirm your email.");
    else if (mode === "reset") setMessage(result.data.message);
  };

  if (!isSupabaseConfigured) return <Layout title="My SCCS"><Message error="Supabase is not configured." /></Layout>;
  if (loading) return <Layout title="My SCCS"><p>Loading...</p></Layout>;
  if (session) {
    return (
      <Layout title="My SCCS">
        <p>Signed in as <strong>{session.user.email}</strong>.</p>
        <Link className="button-link" to="/account">Open family account</Link>
      </Layout>
    );
  }

  const titles = {
    login: "Log in to your family account",
    signup: "Create a family account",
    reset: "Reset your password",
  };

  return (
    <Layout title={titles[mode]}>
      <form className="auth-form" onSubmit={submit}>
        <label><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        {mode !== "reset" && (
          <label><span>Password</span><input type="password" minLength="8" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        )}
        <Message error={error} message={message} />
        <button className="button-link" type="submit" disabled={busy}>{busy ? "Please wait..." : titles[mode]}</button>
      </form>
      <div className="auth-switches">
        {mode !== "login" && <button type="button" onClick={() => setMode("login")}>Log in</button>}
        {mode !== "signup" && <button type="button" onClick={() => setMode("signup")}>Create account</button>}
        {mode !== "reset" && <button type="button" onClick={() => setMode("reset")}>Forgot password?</button>}
      </div>
    </Layout>
  );
}

const familyFields = [
  "family_name", "parent_first_name", "parent_last_name", "parent_chinese_name",
  "address", "city", "state", "zip", "phone", "wechat",
];
const studentFields = ["first_name", "last_name", "chinese_name", "gender", "birth_year"];
const blank = (fields) => Object.fromEntries(fields.map((field) => [field, ""]));

export function AccountPage({ Link }) {
  const { session, loading, recovering, finishRecovery, signOut } = useAuth();
  const [family, setFamily] = useState({ ...blank(familyFields), state: "CT" });
  const [students, setStudents] = useState([]);
  const [student, setStudent] = useState(blank(studentFields));
  const [classes, setClasses] = useState([]);
  const [registrations, setRegistrations] = useState({});
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState({ error: "", message: "" });

  const load = async () => {
    if (!session) return;
    const classResult = await supabase.from("classes")
      .select("id, name, type, class_times(display_time)")
      .eq("is_open", true)
      .order("name");
    if (!classResult.error) setClasses(classResult.data || []);

    const result = await supabase.from("families").select("*").eq("user_id", session.user.id).maybeSingle();
    if (result.error) return setStatus({ error: result.error.message, message: "" });
    if (!result.data) return;
    setFamily(result.data);
    const studentResult = await supabase.from("students").select("*").eq("family_id", result.data.id).order("created_at");
    if (studentResult.error) setStatus({ error: studentResult.error.message, message: "" });
    else {
      const rows = studentResult.data || [];
      setStudents(rows);
      if (rows.length > 0) {
        const registrationResult = await supabase.from("class_registrations")
          .select("*")
          .in("student_id", rows.map((row) => row.id));
        if (!registrationResult.error) {
          setRegistrations(Object.fromEntries(
            (registrationResult.data || []).map((row) => [row.student_id, row]),
          ));
        }
      }
    }
  };

  useEffect(() => { load(); }, [session]);

  if (loading) return <Layout title="Family account"><p>Loading...</p></Layout>;
  if (!session) return <Layout title="Family account"><p>Please log in first.</p><Link className="button-link" to="/login">Log in</Link></Layout>;

  const saveFamily = async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(familyFields.map((field) => [field, family[field] || null]));
    const result = await supabase.from("families")
      .upsert({ ...payload, user_id: session.user.id }, { onConflict: "user_id" }).select().single();
    if (result.error) setStatus({ error: result.error.message, message: "" });
    else {
      setFamily(result.data);
      setStatus({ error: "", message: "Family information saved." });
    }
  };

  const addStudent = async (event) => {
    event.preventDefault();
    if (!family.id) return setStatus({ error: "Save family information first.", message: "" });
    const result = await supabase.from("students").insert({ ...student, family_id: family.id });
    if (result.error) setStatus({ error: result.error.message, message: "" });
    else {
      setStudent(blank(studentFields));
      setStatus({ error: "", message: "Student added." });
      await load();
    }
  };

  const removeStudent = async (id) => {
    const result = await supabase.from("students").delete().eq("id", id);
    if (result.error) setStatus({ error: result.error.message, message: "" });
    else await load();
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

  const setRegistrationField = (studentId, field, value) => {
    setRegistrations({
      ...registrations,
      [studentId]: {
        ...registrations[studentId],
        student_id: studentId,
        [field]: value ? Number(value) : null,
      },
    });
  };

  const saveRegistration = async (studentId) => {
    const current = registrations[studentId] || { student_id: studentId };
    const result = await supabase.from("class_registrations").upsert({
      student_id: studentId,
      session_1: current.session_1 || null,
      session_2: current.session_2 || null,
      session_3: current.session_3 || null,
    }, { onConflict: "student_id" });
    if (result.error) setStatus({ error: result.error.message, message: "" });
    else setStatus({ error: "", message: "Course registration saved." });
  };

  return (
    <Layout title="Family account">
      <div className="account-heading">
        <p>Signed in as <strong>{session.user.email}</strong></p>
        <button className="outline-link" type="button" onClick={signOut}>Sign out</button>
      </div>
      <Message {...status} />
      {recovering && (
        <div className="form-message">
          This password recovery link is valid. Set a new password below to finish.
        </div>
      )}
      <form className="account-form" onSubmit={saveFamily}>
        <h2>Family information</h2>
        {familyFields.map((field) => (
          <label key={field}><span>{field.replaceAll("_", " ")}</span>
            <input value={family[field] || ""} onChange={(e) => setFamily({ ...family, [field]: e.target.value })} />
          </label>
        ))}
        <button className="button-link" type="submit">Save family information</button>
      </form>
      <div className="student-list">
        <h2>Students</h2>
        {students.length === 0 && <p>No students have been added.</p>}
        {students.map((row) => (
          <div key={row.id}><span><strong>{row.first_name} {row.last_name}</strong>{row.chinese_name && ` · ${row.chinese_name}`}</span>
            <button type="button" onClick={() => removeStudent(row.id)}>Remove</button>
          </div>
        ))}
      </div>
      {students.length > 0 && (
        <div className="registration-list">
          <h2>Course registration</h2>
          {classes.length === 0 && <p>Add open classes in Supabase before selecting courses.</p>}
          {students.map((row) => (
            <div className="registration-row" key={row.id}>
              <h3>{row.first_name} {row.last_name}</h3>
              {[1, 2, 3].map((sessionNumber) => {
                const field = `session_${sessionNumber}`;
                return (
                  <label key={field}><span>Session {sessionNumber}</span>
                    <select
                      value={registrations[row.id]?.[field] || ""}
                      onChange={(e) => setRegistrationField(row.id, field, e.target.value)}
                    >
                      <option value="">No class selected</option>
                      {classes.map((course) => (
                        <option value={course.id} key={course.id}>
                          {course.name}{course.class_times?.display_time ? ` · ${course.class_times.display_time}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
              <button className="button-link" type="button" onClick={() => saveRegistration(row.id)}>Save registration</button>
            </div>
          ))}
        </div>
      )}
      <form className="account-form" onSubmit={addStudent}>
        <h2>Add student</h2>
        {studentFields.map((field) => (
          <label key={field}><span>{field.replaceAll("_", " ")}</span>
            <input value={student[field]} onChange={(e) => setStudent({ ...student, [field]: e.target.value })} required={field === "first_name" || field === "last_name"} />
          </label>
        ))}
        <button className="button-link" type="submit">Add student</button>
      </form>
      <form className="account-form" onSubmit={updatePassword}>
        <h2>{recovering ? "Set a new password" : "Change password"}</h2>
        <label><span>New password</span>
          <input type="password" minLength="8" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
        </label>
        <button className="button-link" type="submit">Update password</button>
      </form>
    </Layout>
  );
}
