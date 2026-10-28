import { useState } from "react";
import { useToast } from "../../context/ToastContext.jsx";
import Icon from "../../components/ui/Icon.jsx";
import { adminApi } from "../adminApi.js";
import { useAdmin } from "../AdminContext.js";
import { Busy, Field, PageHead, useDocTitle } from "../ui.jsx";

export default function Account() {
  useDocTitle("Account");
  const toast = useToast();
  const { admin, logout } = useAdmin();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    if (form.newPassword !== form.confirm) {
      setErrors({ confirm: "The two new passwords are not the same." });
      return;
    }
    setBusy(true);
    try {
      await adminApi("/admin/account/password", { method: "PUT", body: { currentPassword: form.currentPassword, newPassword: form.newPassword } });
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
      toast("Password changed");
    } catch (err) {
      setErrors(err.errors || {});
      if (err.status !== 422) toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title="Account" sub={`Logged in as ${admin?.name} (${admin?.email}).`} />
      <form className="a-card" onSubmit={submit} noValidate style={{ maxWidth: 560 }}>
        <div className="a-card__head">
          <h2 className="a-card__title">Change password</h2>
        </div>
        <div className="stack">
          <Field label="Current password" error={errors.currentPassword}>
            {(p) => <input {...p} className="input" type="password" autoComplete="current-password" value={form.currentPassword} onChange={set("currentPassword")} />}
          </Field>
          <Field label="New password" hint="At least 10 characters, with letters and numbers." error={errors.newPassword}>
            {(p) => <input {...p} className="input" type="password" autoComplete="new-password" value={form.newPassword} onChange={set("newPassword")} />}
          </Field>
          <Field label="Type the new password again" error={errors.confirm}>
            {(p) => <input {...p} className="input" type="password" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} />}
          </Field>
          <div className="row" style={{ "--gap": "10px" }}>
            <button type="submit" className="btn btn--primary" disabled={busy || !form.currentPassword || !form.newPassword}>
              {busy ? <Busy /> : <Icon name="keyRound" size={17} />} Change password
            </button>
            <button type="button" className="btn btn--ghost" onClick={logout}>
              <Icon name="logOut" size={17} /> Log out
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
