// Small building blocks shared by the admin pages.
import { useEffect, useId, useState } from "react";
import { Link } from "../lib/router.jsx";
import { useApi } from "../lib/useApi.js";
import { useToast } from "../context/ToastContext.jsx";
import Icon from "../components/ui/Icon.jsx";
import { adminApi } from "./adminApi.js";
import { copyText } from "../lib/clipboard.js";

/** useApi() with the admin session handling. */
export const useAdminApi = (path) => useApi(path, adminApi);

export function useDocTitle(title) {
  useEffect(() => {
    document.title = `${title} | hyperByte admin`;
  }, [title]);
}

/** Warns before closing the tab while a form has unsaved changes. */
export function useUnsavedWarning(dirty) {
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}

export function PageHead({ title, sub, actions, back }) {
  return (
    <header className="a-head">
      <div className="a-head__text">
        {back ? (
          <Link to={back.to} className="a-back" onClick={back.onClick}>
            <Icon name="arrowLeft" size={16} /> {back.label}
          </Link>
        ) : null}
        <h1 className="a-title">{title}</h1>
        {sub ? <p className="a-sub">{sub}</p> : null}
      </div>
      {actions ? <div className="a-head__actions">{actions}</div> : null}
    </header>
  );
}

/**
 * A labelled form field. `children` is a function that receives the props to
 * spread on the input: { id, "aria-describedby", "aria-invalid" }.
 */
export function Field({ label, hint, error, optional = false, children, className = "" }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`field ${className}`}>
      <label className="field__label" htmlFor={id}>
        {label}
        {optional ? <span className="a-optional"> (optional)</span> : null}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint ? (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Switch({ checked, onChange, label, hint, disabled = false }) {
  const id = useId();
  return (
    <div className="a-switch">
      <label className="switch" htmlFor={id}>
        <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-describedby={hint ? `${id}-hint` : undefined} />
        <span className="switch__track" aria-hidden="true" />
        <span>{label}</span>
      </label>
      {hint ? (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A row of filter buttons with counts, like "Available 12". */
export function FilterTabs({ items, value, onChange, label = "Filter" }) {
  return (
    <div className="a-tabs" role="group" aria-label={label}>
      {items.map((t) => (
        <button key={t.value || "all"} type="button" className="a-tab" aria-pressed={value === t.value} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count !== undefined && t.count !== null ? <span className="a-tab__count num">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Pager({ page, pages, onPage }) {
  if (!pages || pages <= 1) return null;
  return (
    <nav className="a-pager" aria-label="Pages">
      <button type="button" className="btn btn--ghost btn--sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <Icon name="chevronLeft" size={16} /> Previous
      </button>
      <span className="faint small num">
        Page {page} of {pages}
      </span>
      <button type="button" className="btn btn--ghost btn--sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next <Icon name="chevronRight" size={16} />
      </button>
    </nav>
  );
}

export function Empty({ icon = "inbox", title, text, children }) {
  return (
    <div className="a-empty">
      <Icon name={icon} size={30} strokeWidth={1.5} />
      <p className="a-empty__title">{title}</p>
      {text ? <p className="muted small">{text}</p> : null}
      {children ? <div className="row" style={{ "--gap": "10px", justifyContent: "center" }}>{children}</div> : null}
    </div>
  );
}

export function LoadError({ error, onRetry }) {
  return (
    <div className="notice notice--error" role="alert">
      <Icon name="alert" size={18} />
      <div className="stack" style={{ "--gap": "8px" }}>
        <span>{error?.message || "Something went wrong."}</span>
        {onRetry ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onRetry} style={{ justifySelf: "start" }}>
            <Icon name="refresh" size={16} /> Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}

export { copyText } from "../lib/clipboard.js";

export function CopyButton({ text, label = "Copy", done = "Copied", className = "btn btn--ghost btn--sm", icon = "copy" }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const t = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        if (await copyText(text)) setCopied(true);
        else toast("Could not copy. Select the text and copy it by hand.", "error");
      }}
    >
      <Icon name={copied ? "check" : icon} size={16} /> {copied ? done : label}
    </button>
  );
}

/** Spinner for buttons that are busy. */
export const Busy = () => <span className="spinner spinner--sm" aria-hidden="true" />;
