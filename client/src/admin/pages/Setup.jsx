import { useState } from "react";
import { api } from "../../lib/api.js";
import Icon from "../../components/ui/Icon.jsx";
import { LogoMark } from "../../components/layout/Logo.jsx";
import { Busy, Field, useDocTitle } from "../ui.jsx";

/** One-time creation of the first admin account, protected by SETUP_TOKEN from api/.env. */
export default function Setup({ status, onDone, onRecheck }) {
  useDocTitle("First-time setup");
  const [form, setForm] = useState({ token: "", name: "", email: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  if (status && !status.databaseConnected) {
    return (
      <Shell>
        <p className="notice notice--error" role="alert">
          <Icon name="alert" size={18} />
          <span>
            The website cannot connect to the database. Check DB_HOST, DB_NAME, DB_USER and DB_PASS in <code>api/.env</code>, then try again.
          </span>
        </p>
        <button type="button" className="btn btn--primary btn--block" onClick={onRecheck}>
          <Icon name="refresh" size={18} /> Try again
        </button>
      </Shell>
    );
  }

  if (status && !status.setupAvailable) {
    return (
      <Shell>
        <p className="notice notice--warn">
          <Icon name="lock" size={18} />
          <span>
            Setup is turned off. To create the first admin account, either add a <code>SETUP_TOKEN</code> of at least 16 characters to <code>api/.env</code> and reload this
            page, or run <code>php api/cli/setup.php</code> on the server.
          </span>
        </p>
        <button type="button" className="btn btn--ghost btn--block" onClick={onRecheck}>
          <Icon name="refresh" size={18} /> Check again
        </button>
      </Shell>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setErrors({});
    if (form.password !== form.confirm) {
      setErrors({ confirm: "The two passwords are not the same." });
      return;
    }
    setBusy(true);
    try {
      const { confirm, ...body } = form;
      const result = await api("/admin/setup", { method: "POST", body });
      onDone(result);
    } catch (err) {
      setError(err.message);
      setErrors(err.errors || {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <form className="stack" onSubmit={submit} noValidate>
        <p className="muted small">
          Create the admin account for this website. You only do this once. The setup token is the <code>SETUP_TOKEN</code> value in <code>api/.env</code>.
        </p>
        {error ? (
          <p className="notice notice--error" role="alert">
            <Icon name="alert" size={18} /> {error}
          </p>
        ) : null}
        <Field label="Setup token" error={errors.token}>
          {(p) => <input {...p} className="input" autoComplete="off" spellCheck="false" value={form.token} onChange={set("token")} autoFocus />}
        </Field>
        <Field label="Your name" error={errors.name}>
          {(p) => <input {...p} className="input" autoComplete="name" value={form.name} onChange={set("name")} />}
        </Field>
        <Field label="Email" hint="You log in with this email." error={errors.email}>
          {(p) => <input {...p} className="input" type="email" inputMode="email" autoComplete="username" value={form.email} onChange={set("email")} />}
        </Field>
        <Field label="Password" hint="At least 10 characters, with letters and numbers." error={errors.password}>
          {(p) => <input {...p} className="input" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} />}
        </Field>
        <Field label="Type the password again" error={errors.confirm}>
          {(p) => <input {...p} className="input" type="password" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} />}
        </Field>
        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          {busy ? <Busy /> : <Icon name="userPlus" size={18} />} Create admin account
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="admin admin-center">
      <div className="a-auth panel">
        <div className="a-auth__brand">
          <LogoMark size={44} />
          <div>
            <h1 className="a-title">Set up hyperByte</h1>
            <p className="faint small">First-time setup of the admin panel.</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
