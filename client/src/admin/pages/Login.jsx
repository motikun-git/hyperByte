import { useState } from "react";
import { api } from "../../lib/api.js";
import Icon from "../../components/ui/Icon.jsx";
import { LogoMark } from "../../components/layout/Logo.jsx";
import { Busy, Field, useDocTitle } from "../ui.jsx";

export default function Login({ notice, onDone }) {
  useDocTitle("Log in");
  const [form, setForm] = useState({ email: "", password: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setErrors({});
    try {
      const result = await api("/admin/login", { method: "POST", body: form });
      onDone(result);
    } catch (err) {
      setError(err.message);
      setErrors(err.errors || {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin admin-center">
      <form className="a-auth panel" onSubmit={submit} noValidate>
        <div className="a-auth__brand">
          <LogoMark size={44} />
          <div>
            <h1 className="a-title">hyperByte admin</h1>
            <p className="faint small">Log in to manage products and warranties.</p>
          </div>
        </div>

        {notice ? (
          <p className="notice" role="status">
            <Icon name="info" size={18} /> {notice}
          </p>
        ) : null}
        {error ? (
          <p className="notice notice--error" role="alert">
            <Icon name="alert" size={18} /> {error}
          </p>
        ) : null}

        <Field label="Email" error={errors.email}>
          {(p) => (
            <input
              {...p}
              className="input"
              type="email"
              autoComplete="username"
              inputMode="email"
              autoFocus
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          )}
        </Field>
        <Field label="Password" error={errors.password}>
          {(p) => (
            <div className="a-password">
              <input
                {...p}
                className="input"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <button type="button" className="a-password__toggle" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
                <Icon name={show ? "eyeOff" : "eye"} size={18} />
              </button>
            </div>
          )}
        </Field>

        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          {busy ? <Busy /> : <Icon name="logIn" size={18} />} Log in
        </button>
        <p className="faint small a-auth__foot">
          Forgot the password? Reset it on the server with <code>php api/cli/reset-password.php your@email</code>.{" "}
          <a className="link" href="/">
            Back to the website
          </a>
        </p>
      </form>
    </div>
  );
}
