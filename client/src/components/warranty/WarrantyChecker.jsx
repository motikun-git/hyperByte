import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api.js";
import { dateLong, dateTime } from "../../lib/format.js";
import { Link } from "../../lib/router.jsx";
import Icon from "../ui/Icon.jsx";

const STATUS = {
  active: { label: "Warranty active", icon: "shieldCheck" },
  expired: { label: "Warranty expired", icon: "clock" },
  void: { label: "Warranty void", icon: "ban" },
  none: { label: "No warranty", icon: "info" },
  not_registered: { label: "Not registered", icon: "alert" },
};

/** Lookup form + result. `initialCode` runs a lookup straight away (from ?code=). */
export default function WarrantyChecker({ initialCode = "", onCodeChange }) {
  const [code, setCode] = useState(initialCode);
  const [state, setState] = useState({ loading: false, result: null, receivedAt: 0, error: "" });
  const lastCode = useRef("");
  const rechecks = useRef(0);

  const lookup = useCallback(
    async (value) => {
      const clean = value.trim();
      if (!clean) {
        setState((s) => ({ ...s, error: "Enter the warranty code from your receipt." }));
        return;
      }
      lastCode.current = clean;
      onCodeChange?.(clean);
      setState((s) => ({ ...s, loading: true, error: "" }));
      try {
        const data = await api(`/warranty/${encodeURIComponent(clean)}`);
        setState({ loading: false, result: data, receivedAt: Date.now(), error: "" });
      } catch (err) {
        if (err.status === 404 && err.data?.status === "not_registered") {
          setState({ loading: false, result: err.data, receivedAt: Date.now(), error: "" });
        } else {
          setState({ loading: false, result: null, receivedAt: 0, error: err.message });
        }
      }
    },
    [onCodeChange]
  );

  useEffect(() => {
    if (initialCode) lookup(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`wcheck panel${state.loading ? " is-scanning" : ""}`}>
      <form
        className="wcheck__form"
        onSubmit={(e) => {
          e.preventDefault();
          rechecks.current = 0;
          lookup(code);
        }}
      >
        <label className="field" htmlFor="warranty-code">
          <span className="field__label">Warranty code</span>
          <span className="wcheck__row">
            <input
              id="warranty-code"
              className="input wcheck__input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="HBW-XXXX-XXXX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck="false"
              inputMode="text"
              maxLength={20}
              aria-invalid={state.error ? "true" : undefined}
              aria-describedby="warranty-code-hint"
            />
            <button type="submit" className="btn btn--primary" disabled={state.loading} data-pulse>
              {state.loading ? <span className="spinner" /> : <Icon name="search" size={18} />}
              Check
            </button>
          </span>
          <span id="warranty-code-hint" className="field__hint">
            The code is on your receipt or in the message we sent when you bought the item.
          </span>
          {state.error ? <span className="field__error">{state.error}</span> : null}
        </label>
      </form>
      <div className="wcheck__scan" aria-hidden="true" />
      <div aria-live="polite">
        {state.result ? (
            <WarrantyResult
            key={`${state.result.code || "none"}-${state.receivedAt}`}
            result={state.result}
            receivedAt={state.receivedAt}
            onRecheck={() => {
              // Ask the server once more when the countdown ends (never in a loop).
              if (rechecks.current < 1) {
                rechecks.current += 1;
                lookup(lastCode.current);
              }
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function ProgressRing({ fraction, status }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  return (
    <svg className={`ring ring--${status}`} viewBox="0 0 128 128" aria-hidden="true">
      <defs>
        <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22D3EE" />
          <stop offset="0.5" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#A855F7" />
        </linearGradient>
      </defs>
      <circle className="ring__track" cx="64" cy="64" r={r} />
      <circle className="ring__value" cx="64" cy="64" r={r} strokeDasharray={c} style={{ "--offset": `${(c * (1 - fraction)).toFixed(2)}px`, "--full": `${c.toFixed(2)}px` }} />
    </svg>
  );
}

function split(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}

function WarrantyResult({ result, receivedAt, onRecheck }) {
  // The server's clock decides; the visitor's clock only moves the countdown along.
  const offset = useMemo(() => (result.serverTime ? Date.parse(result.serverTime) - receivedAt : 0), [result.serverTime, receivedAt]);
  const [now, setNow] = useState(() => Date.now() + offset);
  const rechecked = useRef(false);
  const items = result.items || [];
  const anyActive = items.some((it) => it.status === "active");

  useEffect(() => {
    if (!anyActive) return undefined;
    const id = window.setInterval(() => setNow(Date.now() + offset), 1000);
    return () => window.clearInterval(id);
  }, [anyActive, offset]);

  const runOut = items.some((it) => it.status === "active" && Date.parse(it.expiresAt) - now <= 0);
  // When a countdown reaches zero, ask the server again for the official status.
  useEffect(() => {
    if (runOut && !rechecked.current) {
      rechecked.current = true;
      onRecheck?.();
    }
  }, [runOut, onRecheck]);

  if (!result.found) {
    return (
      <div className="wresult wresult--not_registered">
        <span className="badge badge--not_registered">
          <Icon name="alert" size={14} /> {STATUS.not_registered.label}
        </span>
        <p className="wresult__msg">{result.message}</p>
      </div>
    );
  }

  const overall = STATUS[result.status] || { label: "No warranty", icon: "info" };
  const single = items.length === 1;

  return (
    <div className={`wmemo wmemo--${result.status}`}>
      <div className="wmemo__head">
        <span className={`badge badge--${result.status === "none" ? "unavailable" : result.status}`}>
          <Icon name={overall.icon} size={14} /> {overall.label}
        </span>
        <dl className="wresult__facts">
          <div>
            <dt>Warranty code</dt>
            <dd className="num">{result.code}</dd>
          </div>
          <div>
            <dt>Bought on</dt>
            <dd>{dateLong(result.purchasedAt)}</dd>
          </div>
          <div>
            <dt>Products</dt>
            <dd>{items.length}</dd>
          </div>
        </dl>
      </div>

      <ul className="witems" role="list">
        {items.map((it, i) => (
          <WarrantyItem key={i} item={it} now={now} big={single} />
        ))}
      </ul>

      {result.terms ? (
        <details className="wresult__terms">
          <summary>Warranty terms</summary>
          {result.terms.split(/\n\s*\n/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </details>
      ) : null}
    </div>
  );
}

function WarrantyItem({ item, now, big }) {
  const start = Date.parse(item.startsAt || "");
  const end = Date.parse(item.expiresAt || "");
  const remaining = Math.max(0, end - now);
  const status = item.status === "active" && remaining <= 0 ? "expired" : item.status;
  const total = end - start;
  const fraction = status === "active" && total > 0 ? Math.min(1, remaining / total) : 0;
  const t = split(remaining);
  const meta = STATUS[status] || { label: "No warranty", icon: "info" };

  return (
    <li className={`witem witem--${status}${big ? " witem--big" : ""}`}>
      <div className="witem__ring">
        <ProgressRing fraction={fraction} status={status === "none" ? "void" : status} />
        <div className="wresult__ring-label">
          {status === "active" ? (
            <>
              <strong className="num">{t.days}</strong>
              <span>{t.days === 1 ? "day left" : "days left"}</span>
            </>
          ) : (
            <Icon name={meta.icon} size={big ? 34 : 24} strokeWidth={1.6} />
          )}
        </div>
      </div>
      <div className="witem__info">
        <span className={`badge badge--${status === "none" ? "unavailable" : status}`}>
          <Icon name={meta.icon} size={13} /> {meta.label}
        </span>
        <h3 className="wresult__product">
          {item.name}
          {item.quantity > 1 ? <span className="faint"> × {item.quantity}</span> : null}
        </h3>
        <dl className="wresult__facts">
          {item.serials?.length ? (
            <div className="witem__sn">
              <dt>Serial number{item.serials.length > 1 ? "s" : ""}</dt>
              <dd className="num">{item.serials.join(", ")}</dd>
            </div>
          ) : null}
          {item.period ? (
            <div>
              <dt>{item.type || "Warranty"}</dt>
              <dd>
                {item.period}
                {item.note ? `, ${item.note}` : ""}
              </dd>
            </div>
          ) : item.note ? (
            <div>
              <dt>Note</dt>
              <dd>{item.note}</dd>
            </div>
          ) : null}
          {item.expiresAt ? (
            <div>
              <dt>{status === "expired" ? "Ended" : "Ends"}</dt>
              <dd>{big ? dateTime(item.expiresAt) : dateLong(item.expiresAt)}</dd>
            </div>
          ) : null}
        </dl>
        {status === "active" && big ? (
          <div className="countdown" role="timer" aria-label={`${t.days} days, ${t.hours} hours and ${t.minutes} minutes left`}>
            {[
              ["Days", t.days],
              ["Hours", t.hours],
              ["Minutes", t.minutes],
              ["Seconds", t.seconds],
            ].map(([label, value]) => (
              <div key={label} className="countdown__cell">
                <span className="countdown__value num">{String(value).padStart(2, "0")}</span>
                <span className="countdown__label">{label}</span>
              </div>
            ))}
          </div>
        ) : null}
        {status === "void" ? <p className="wresult__msg">This warranty is no longer valid. Please contact HyperByte for details.</p> : null}
        {item.slug ? (
          <Link to={`/product/${item.slug}`} className="link small">
            View the product page
          </Link>
        ) : null}
      </div>
    </li>
  );
}
