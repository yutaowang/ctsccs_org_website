import React, { useEffect, useState } from "react";
import { useAuth } from "./auth";
import { AccountPage } from "./portal";
import { isSupabaseConfigured, supabase } from "./supabase";

const STAFF_ROLES = new Set([
  "admin",
  "sccs_admin_team_role",
  "sccs_teacher_ta_role",
]);
const ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_EMAIL = "superadmin@ctsccs.org";

function AdminShell({ children }) {
  return (
    <article className="inner-page admin-entry-page">
      <header className="page-title">
        <span>SCCS Staff</span>
        <h1>Administration Portal</h1>
      </header>
      <section className="page-section admin-entry-card">{children}</section>
    </article>
  );
}

export function AdminPage({ Link }) {
  const { session, loading, role, signOut, refreshRole } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const checkAdministrator = async () => {
      if (!session || role !== "admin") {
        setMustChangePassword(false);
        return;
      }
      const { data } = await supabase.from("admins")
        .select("must_change_password")
        .eq("user_id", session.user.id)
        .maybeSingle();
      setMustChangePassword(Boolean(data?.must_change_password));
    };
    checkAdministrator();
  }, [session, role]);

  const login = async (event) => {
    event.preventDefault();
    setChecking(true);
    setError("");
    const normalized = identifier.trim().toLowerCase();
    let email = normalized;
    if (normalized === ADMIN_USERNAME) {
      try {
        const response = await fetch(`/api/admin-profile?username=${encodeURIComponent(ADMIN_USERNAME)}`);
        const body = await response.json();
        email = response.ok ? body.email || DEFAULT_ADMIN_EMAIL : DEFAULT_ADMIN_EMAIL;
      } catch {
        email = DEFAULT_ADMIN_EMAIL;
      }
    }
    if (!email.endsWith("@ctsccs.org")) {
      setChecking(false);
      setError("Staff access requires a ctsccs.org email address. Please contact IT.");
      return;
    }
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) {
      setChecking(false);
      setError(result.error.message);
      return;
    }
    const roleResult = await supabase.from("user_roles")
      .select("role")
      .eq("user_id", result.data.user.id)
      .maybeSingle();
    if (roleResult.data?.role === "admin" && normalized !== ADMIN_USERNAME) {
      await supabase.auth.signOut();
      setChecking(false);
      setError("Administrator must sign in with username admin.");
      return;
    }
    if (!STAFF_ROLES.has(roleResult.data?.role)) {
      await supabase.auth.signOut();
      setChecking(false);
      setError("This account is not authorized for the staff portal. Please contact IT.");
      return;
    }
    await refreshRole(result.data.session);
    setPassword("");
    setChecking(false);
  };

  const changeInitialPassword = async (event) => {
    event.preventDefault();
    setChecking(true);
    setError("");
    const result = await supabase.auth.updateUser({ password: newPassword });
    if (result.error) {
      setChecking(false);
      setError(result.error.message);
      return;
    }
    const profileResult = await supabase.from("admins")
      .update({ must_change_password: false })
      .eq("user_id", session.user.id);
    if (profileResult.error) {
      setChecking(false);
      setError(profileResult.error.message);
      return;
    }
    setMustChangePassword(false);
    setNewPassword("");
    setChecking(false);
  };

  if (!isSupabaseConfigured) {
    return <AdminShell><div className="form-message error">Supabase is not configured.</div></AdminShell>;
  }
  if (loading) return <AdminShell><p>Loading...</p></AdminShell>;

  if (!session) {
    return (
      <AdminShell>
        <div className="admin-login-intro">
          <h2>Staff sign in</h2>
          <p>For administrators, management team members, teachers, and TAs only.</p>
        </div>
        <form className="auth-form admin-login-form" onSubmit={login}>
          <label>
            <span>Username or ctsccs.org email</span>
            <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" required />
          </label>
          <label>
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
          </label>
          {error && <div className="form-message error">{error}</div>}
          <button className="button-link" type="submit" disabled={checking}>
            {checking ? "Signing in..." : "Sign in to staff portal"}
          </button>
        </form>
        <p className="admin-help">Unauthorized accounts cannot enter. Contact the SCCS IT department for access.</p>
        <Link className="text-link" to="/">Return to public website</Link>
      </AdminShell>
    );
  }

  if (!STAFF_ROLES.has(role)) {
    return (
      <AdminShell>
        <div className="form-message error">
          This account is not authorized for the staff portal. Please contact IT.
        </div>
        <button className="outline-link" type="button" onClick={signOut}>Sign out</button>
      </AdminShell>
    );
  }

  if (role === "admin" && mustChangePassword) {
    return (
      <AdminShell>
        <div className="admin-login-intro">
          <h2>Change initial password</h2>
          <p>You must replace the temporary password before using administrator tools.</p>
        </div>
        <form className="auth-form admin-login-form" onSubmit={changeInitialPassword}>
          <label>
            <span>New password</span>
            <input type="password" minLength="12" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required />
          </label>
          {error && <div className="form-message error">{error}</div>}
          <button className="button-link" type="submit" disabled={checking}>
            {checking ? "Updating..." : "Set new password"}
          </button>
        </form>
      </AdminShell>
    );
  }

  return <AccountPage Link={Link} staffOnly />;
}
