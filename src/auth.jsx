import React, { createContext, useContext, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "./supabase";

const FAMILY_ROLE = "sccs_family_role";
const AuthContext = createContext({
  session: null,
  loading: true,
  recovering: false,
  role: FAMILY_ROLE,
  teacherId: null,
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const [role, setRole] = useState(FAMILY_ROLE);
  const [teacherId, setTeacherId] = useState(null);

  const loadRole = async (nextSession) => {
    if (!nextSession || !supabase) {
      setRole(FAMILY_ROLE);
      setTeacherId(null);
      return;
    }
    const { data } = await supabase
      .from("user_roles")
      .select("role, teacher_id")
      .eq("user_id", nextSession.user.id)
      .maybeSingle();
    setRole(data?.role || FAMILY_ROLE);
    setTeacherId(data?.teacher_id || null);
  };

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadRole(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setLoading(true);
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_OUT") setRecovering(false);
      void loadRole(nextSession).finally(() => setLoading(false));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{
      session,
      loading,
      recovering,
      role,
      teacherId,
      refreshRole: (nextSession = session) => loadRole(nextSession),
      finishRecovery: () => setRecovering(false),
      signOut: () => supabase?.auth.signOut(),
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

function Layout({ title, children, wide = false }) {
  return (
    <article className="inner-page">
      <header className="page-title"><span>Online Registration</span><h1>{title}</h1></header>
      <section className={`page-section auth-card ${wide ? "wide" : ""}`}>{children}</section>
    </article>
  );
}

function Message({ error, message }) {
  if (!error && !message) return null;
  return <div className={`form-message ${error ? "error" : ""}`}>{error || message}</div>;
}

function RequiredLabel({ children }) {
  return <span>{children} <strong className="required-marker" aria-label="required">*</strong></span>;
}

export function LoginPage({ Link, navigate }) {
  const { session, loading, role, signOut } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [retypePassword, setRetypePassword] = useState("");
  const [signupProfile, setSignupProfile] = useState({
    parent_first_name: "",
    parent_last_name: "",
    parent_chinese_name: "",
    address: "",
    city: "",
    state: "CT",
    zip: "",
    phone: "",
    wechat: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const verifySignupToken = async () => {
      if (!supabase) return;
      const query = new URLSearchParams(window.location.search);
      const tokenHash = query.get("token_hash") || query.get("token");
      const type = query.get("type");
      if (!tokenHash || type !== "signup") return;

      setBusy(true);
      setError("");
      setMessage("Validating your email...");
      const result = await supabase.auth.verifyOtp({
        type: "signup",
        token_hash: tokenHash,
      });
      if (cancelled) return;
      setBusy(false);
      if (result.error) {
        setMessage("");
        setError(result.error.message);
        return;
      }
      window.history.replaceState({}, "", "/login");
      setMessage("Email validated. Opening Online Registration...");
      navigate?.("/account");
    };

    void verifySignupToken();
    return () => { cancelled = true; };
  }, [navigate]);

  useEffect(() => {
    if (!loading && session && role === FAMILY_ROLE) navigate?.("/account");
  }, [loading, session, role, navigate]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (mode === "signup" && password !== retypePassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    let result;

    if (mode === "signup") {
      const response = await fetch("/api/create-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, profile: signupProfile }),
      });
      const body = await response.json();
      result = response.ok ? { data: body, error: null } : {
        data: null,
        error: new Error(body.error || "Account creation failed."),
      };
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
    else if (mode === "signup") setMessage(result.data.message);
    else if (mode === "reset") setMessage(result.data.message);
    else navigate?.("/account");
  };

  if (!isSupabaseConfigured) return <Layout title="Online Registration"><Message error="Supabase is not configured." /></Layout>;
  if (loading) return <Layout title="Online Registration"><p>Loading...</p></Layout>;
  if (session) {
    if (role !== FAMILY_ROLE) {
      return (
        <Layout title="Online Registration">
          <Message message="Online Registration is for family accounts. Staff and admin login links are sent separately by email." />
          <button className="outline-link" type="button" onClick={signOut}>Log out</button>
        </Layout>
      );
    }
    return <Layout title="Online Registration"><p>Opening Online Registration...</p></Layout>;
  }

  const titles = {
    login: "Log in to your family account",
    signup: "Create a family account",
    reset: "Reset your password",
  };

  return (
    <Layout title={titles[mode]} wide={mode === "signup"}>
      <form className={`auth-form ${mode === "signup" ? "signup-form" : ""}`} onSubmit={submit}>
        {mode === "signup" && (
          <>
            <label><RequiredLabel>Parent First Name</RequiredLabel><input value={signupProfile.parent_first_name} onChange={(e) => setSignupProfile({ ...signupProfile, parent_first_name: e.target.value })} required /></label>
            <label><RequiredLabel>Parent Last Name</RequiredLabel><input value={signupProfile.parent_last_name} onChange={(e) => setSignupProfile({ ...signupProfile, parent_last_name: e.target.value })} required /></label>
            <label><span>Parent Chinese Name (Optional)</span><input value={signupProfile.parent_chinese_name} onChange={(e) => setSignupProfile({ ...signupProfile, parent_chinese_name: e.target.value })} /></label>
            <label className="wide"><RequiredLabel>Address</RequiredLabel><input value={signupProfile.address} onChange={(e) => setSignupProfile({ ...signupProfile, address: e.target.value })} required /></label>
            <label><RequiredLabel>City</RequiredLabel><input value={signupProfile.city} onChange={(e) => setSignupProfile({ ...signupProfile, city: e.target.value })} required /></label>
            <label><RequiredLabel>State</RequiredLabel><input value={signupProfile.state} onChange={(e) => setSignupProfile({ ...signupProfile, state: e.target.value })} required /></label>
            <label><RequiredLabel>Zip</RequiredLabel><input value={signupProfile.zip} onChange={(e) => setSignupProfile({ ...signupProfile, zip: e.target.value })} required /></label>
            <label><RequiredLabel>Phone</RequiredLabel><input type="tel" value={signupProfile.phone} onChange={(e) => setSignupProfile({ ...signupProfile, phone: e.target.value })} required /></label>
            <label><span>Wechat</span><input value={signupProfile.wechat} onChange={(e) => setSignupProfile({ ...signupProfile, wechat: e.target.value })} /></label>
          </>
        )}
        <label className={mode === "signup" ? "wide" : ""}><RequiredLabel>{mode === "signup" ? "Email / Username" : "Email"}</RequiredLabel><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        {mode !== "reset" && (
          <label><RequiredLabel>Password</RequiredLabel><input type="password" minLength="8" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        )}
        {mode === "signup" && (
          <label><RequiredLabel>Retype Password</RequiredLabel><input type="password" minLength="8" value={retypePassword} onChange={(e) => setRetypePassword(e.target.value)} required /></label>
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

export function ResetPasswordPage({ Link }) {
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const verifyRecoveryToken = async () => {
      if (!supabase) {
        setError("Supabase is not configured.");
        setChecking(false);
        return;
      }

      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const hashError = hash.get("error_description") || hash.get("error");
      if (hashError) {
        setError(hashError.replace(/\+/g, " "));
        setChecking(false);
        return;
      }

      const tokenHash = query.get("token_hash") || query.get("token");
      const type = query.get("type") || "recovery";
      if (!tokenHash || type !== "recovery") {
        setError("This password reset link is invalid. Please request a new link.");
        setChecking(false);
        return;
      }

      const result = await supabase.auth.verifyOtp({
        type: "recovery",
        token_hash: tokenHash,
      });
      if (cancelled) return;
      if (result.error) {
        setError(result.error.message);
      } else {
        window.history.replaceState({}, "", "/reset-password");
        setReady(true);
      }
      setChecking(false);
    };

    void verifyRecoveryToken();
    return () => { cancelled = true; };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const result = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setPassword("");
    setReady(false);
    setMessage("Your password has been updated. You can now open the portal.");
  };

  return (
    <Layout title="Set a new password">
      {checking && <p>Checking your reset link...</p>}
      {!checking && <Message error={error} message={message} />}
      {ready && (
        <form className="auth-form" onSubmit={submit}>
          <label>
            <span>New password</span>
            <input
              type="password"
              minLength="8"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button className="button-link" type="submit" disabled={busy}>
            {busy ? "Updating..." : "Update password"}
          </button>
        </form>
      )}
      {!checking && !ready && (
        <div className="auth-switches">
          <Link className="button-link" to="/login">Request a new reset link</Link>
          <Link className="outline-link" to="/account">Open portal</Link>
        </div>
      )}
    </Layout>
  );
}
