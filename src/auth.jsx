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
        <Link className="button-link" to="/account">Open My SCCS portal</Link>
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
