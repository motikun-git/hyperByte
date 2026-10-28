import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon.jsx";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Accessible dialog: traps focus, closes with Escape or a click outside. */
export default function Modal({ title, onClose, children, footer, wide = false, initialFocus = true }) {
  const ref = useRef(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current?.();
      }
      if (e.key === "Tab" && ref.current) {
        const items = [...ref.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      const target = initialFocus ? ref.current?.querySelector("input, select, textarea, [data-autofocus]") : null;
      (target || ref.current)?.focus();
    });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [initialFocus]);

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeRef.current?.();
      }}
    >
      <div ref={ref} className={`modal${wide ? " modal--wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="modal__head">
          <h2 id={titleId} className="modal__title">
            {title}
          </h2>
          <button type="button" className="icon-btn" onClick={() => closeRef.current?.()} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </div>
        {children}
        {footer ? <div className="modal__foot">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

/** "Are you sure?" dialog. With `confirmText`, the person must type it first. */
export function ConfirmDialog({ title, message, confirmLabel = "Delete", confirmText, busy, onConfirm, onCancel }) {
  const [typed, setTyped] = useState("");
  const ready = !confirmText || typed.trim().toUpperCase() === confirmText.toUpperCase();
  return (
    <Modal
      title={title}
      onClose={onCancel}
      initialFocus={Boolean(confirmText)}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onCancel} data-autofocus>
            Cancel
          </button>
          <button type="button" className="btn btn--danger" disabled={!ready || busy} onClick={onConfirm}>
            {busy ? <span className="spinner" /> : <Icon name="trash" size={18} />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="muted">{message}</p>
        {confirmText ? (
          <label className="field">
            <span className="field__label">
              Type <strong>{confirmText}</strong> to confirm
            </span>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck="false" />
          </label>
        ) : null}
      </div>
    </Modal>
  );
}
