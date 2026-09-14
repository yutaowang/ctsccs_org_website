import React, { useEffect, useState } from "react";
import { supabase } from "./supabase";

const blank = { name_zh: "", name_en: "", email: "", display_order: 0, is_active: true, is_public: true };

export function PtaManager({ onChange }) {
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const request = async (action, member = {}) => {
    setBusy(true);
    setError("");
    try {
      const result = await supabase.rpc("manage_pta_leaders", { action, member });
      if (result.error) throw result.error;
      setMembers(result.data || []);
      if (action !== "list") {
        setForm(blank);
        await onChange();
      }
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { void request("list"); }, []);

  return <div className="portal-panel">
    <div className="panel-heading"><h2>家长会 PTA Leaders</h2></div>
    <p>在任成员的邮箱用于匹配家庭报名邮箱，匹配后免除 $40 安全巡逻押金。邮箱不会显示在公开页面。</p>
    <p>Active members receive the household deposit waiver when their email matches the family account. Emails remain private.</p>
    {error && <p className="form-message error" role="alert">{error}</p>}
    <form className="portal-form" onSubmit={(event) => {
      event.preventDefault();
      if (!form.name_zh.trim() && !form.name_en.trim()) { setError("Enter at least one name."); return; }
      void request("save", form);
    }}>
      <label><span>中文姓名</span><input value={form.name_zh} onChange={(event) => setForm({ ...form, name_zh: event.target.value })} /></label>
      <label><span>English name</span><input value={form.name_en} onChange={(event) => setForm({ ...form, name_en: event.target.value })} /></label>
      <label><span>家庭邮箱 Family account email</span><input type="email" value={form.email || ""} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
      <label><span>Display order</span><input type="number" step="1" value={form.display_order} onChange={(event) => setForm({ ...form, display_order: Number(event.target.value) })} /></label>
      <label><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />在任 Active (eligible for waiver)</label>
      <label><input type="checkbox" checked={form.is_public} onChange={(event) => setForm({ ...form, is_public: event.target.checked })} />在网站展示 Show on website</label>
      <div className="button-row"><button className="button-link" disabled={busy}>{form.id ? "Save changes" : "Add PTA leader"}</button><button type="button" className="outline-link" disabled={busy} onClick={() => setForm(blank)}>Cancel edit</button></div>
    </form>
    <div className="data-table-wrap"><table className="data-table">
      <thead><tr><th>Name</th><th>Family email</th><th>Active</th><th>Public</th><th>Order</th><th>Actions</th></tr></thead>
      <tbody>{members.map((member) => <tr key={member.id}>
        <td>{member.name_zh} {member.name_en}</td><td>{member.email || "Email needed for waiver"}</td><td>{member.is_active ? "Yes" : "No"}</td><td>{member.is_public ? "Yes" : "No"}</td><td>{member.display_order}</td>
        <td><button type="button" disabled={busy} onClick={() => setForm({ ...member, email: member.email || "" })}>Edit</button> <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Delete ${member.name_zh || member.name_en}?`)) void request("delete", { id: member.id }); }}>Delete</button></td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}
