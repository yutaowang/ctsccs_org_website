import React, { useState } from "react";
import { useAuth } from "./auth";
import { AccountPage } from "./portal";
import { isSupabaseConfigured, supabase } from "./supabase";

const STAFF_ROLES = new Set([
  "sccs_superadmin_role",
  "sccs_admin_team_role",
  "sccs_teacher_ta_role",
]);

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
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const login = async (event) => {
    event.preventDefault();
    setChecking(true);
    setError("");
    const email = identifier.trim().toLowerCase();
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
            <span>ctsccs.org email</span>
            <input type="email" value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" required />
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

  return <AccountPage Link={Link} staffOnly />;
}
