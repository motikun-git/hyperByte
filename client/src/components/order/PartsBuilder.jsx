// The parts list builder used on the Pre-order and Custom PC build pages:
// the visitor types the parts they want, marks each as pre-owned or new,
// and gets a ready message to send to HyperByte on WhatsApp (Bangladesh or
// China admin) or Facebook. Nothing is ordered or paid on the website.
import { useState } from "react";
import { useSettings } from "../../context/SettingsContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { copyText } from "../../lib/clipboard.js";
import { facebookChat, whatsappLink } from "../../lib/contact.js";
import Icon, { CategoryIcon } from "../ui/Icon.jsx";

const STEPS = [
  { icon: "pencil", text: "Fill in the component boxes" },
  { icon: "sparkles", text: "Press Generate message" },
  { icon: "copy", text: "Copy the generated text" },
  { icon: "send", text: "Send it to our Facebook Page inbox or WhatsApp" },
];

let nextId = 1;
const newRow = (part) => ({ id: nextId++, part, name: "", condition: "pre-owned" });

/**
 * Builds the chat message.
 * intro: first sentence, without the trailing colon.
 * extra: lines added after the parts list, e.g. ["Budget: 1,50,000 taka"].
 */
export function buildPartsMessage(parts, rows, { intro, extra = [] }) {
  const filled = rows.filter((r) => r.name.trim());
  if (!filled.length) return "";
  const lines = filled.map((r) => {
    const part = parts.find((p) => p.key === r.part);
    return `${part.label}: ${r.name.trim()} (${r.condition === "new" ? "New" : "Pre-owned"})`;
  });
  const many = filled.length > 1;
  const extraText = extra.filter(Boolean).length ? `\n\n${extra.filter(Boolean).join("\n")}` : "";
  return `${intro}${many ? "s" : ""} given below:\n\n${lines.join("\n")}${extraText}\n\nPlease let me know the availability, price and when ${many ? "they" : "it"} can arrive.`;
}

export default function PartsBuilder({ id, title, hint, parts, intro, extra = [], children, agreement = null, after = null }) {
  const { settings } = useSettings();
  const toast = useToast();
  const [rows, setRows] = useState(() => parts.map((p) => newRow(p.key)));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const outputId = `${id}-message`;

  const markStale = () => {
    if (message) setStale(true);
  };
  const update = (rowId, change) => {
    setRows((list) => list.map((r) => (r.id === rowId ? { ...r, ...change } : r)));
    markStale();
  };
  const addAnother = (part, afterId) =>
    setRows((list) => {
      const i = list.findIndex((r) => r.id === afterId);
      const copy = [...list];
      copy.splice(i + 1, 0, newRow(part));
      return copy;
    });
  const remove = (rowId) => setRows((list) => list.filter((r) => r.id !== rowId));

  const generate = () => {
    const text = buildPartsMessage(parts, rows, { intro, extra });
    if (!text) {
      setError("Write at least one product name first.");
      return;
    }
    setError("");
    setMessage(text);
    setStale(false);
    window.setTimeout(() => document.getElementById(outputId)?.focus(), 50);
  };

  const copy = async () => {
    if (await copyText(message)) {
      toast("Message copied. Now send it to the admin.");
      return true;
    }
    toast("Could not copy. Select the message and copy it by hand.", "error");
    return false;
  };

  const waBd = whatsappLink(settings.whatsappNumber, message);
  const waCn = whatsappLink(settings.whatsappNumberCn, message);
  const fb = facebookChat(settings);
  const filledCount = rows.filter((r) => r.name.trim()).length;
  const isFirstOfPart = (r, i) => rows.findIndex((x) => x.part === r.part) === i;

  return (
    <section className="pre-builder panel" aria-labelledby={`${id}-title`} onInput={markStale}>
      <div className="pre-builder__head">
        <h2 id={`${id}-title`} className="h3">
          {title}
        </h2>
        {hint ? <p className="faint small">{hint}</p> : null}
      </div>

      <ol className="pre-steps" aria-label="How to send your list">
        {STEPS.map((step, i) => (
          <li key={step.text} className="pre-steps__item">
            <span className="pre-steps__icon">
              <Icon name={step.icon} size={18} />
            </span>
            <span>{step.text}</span>
            {i < STEPS.length - 1 ? <Icon name="arrowRight" size={18} className="pre-steps__arrow" aria-hidden="true" /> : null}
          </li>
        ))}
      </ol>

      <ul className="pre-rows" role="list">
        {rows.map((r, i) => {
          const part = parts.find((p) => p.key === r.part);
          const inputId = `${id}-${r.id}`;
          return (
            <li key={r.id} className={`pre-row${r.name.trim() ? " is-filled" : ""}`}>
              <label className="pre-row__label" htmlFor={inputId}>
                <span className="pre-row__icon">
                  <CategoryIcon type={part.icon} size={18} strokeWidth={1.7} />
                </span>
                {part.label}
              </label>
              <input id={inputId} className="input pre-row__input" value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} placeholder={part.placeholder} maxLength={160} autoComplete="off" />
              <div className="pre-cond" role="radiogroup" aria-label={`${part.label} condition`}>
                <button type="button" role="radio" aria-checked={r.condition === "pre-owned"} onClick={() => update(r.id, { condition: "pre-owned" })}>
                  Pre-owned
                </button>
                <button type="button" role="radio" aria-checked={r.condition === "new"} onClick={() => update(r.id, { condition: "new" })}>
                  New
                </button>
              </div>
              {isFirstOfPart(r, i) ? (
                <button type="button" className="pre-row__more" onClick={() => addAnother(r.part, r.id)} aria-label={`Add another ${part.label}`} title={`Add another ${part.label}`}>
                  <Icon name="plus" size={16} />
                </button>
              ) : (
                <button type="button" className="pre-row__more" onClick={() => remove(r.id)} aria-label={`Remove this ${part.label}`} title="Remove">
                  <Icon name="x" size={16} />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {children}

      <div className="pre-builder__generate">
        <button type="button" className="btn btn--primary btn--lg" onClick={generate} data-pulse>
          <Icon name="sparkles" size={19} /> Generate message
        </button>
        {filledCount ? <span className="faint small">{`${filledCount} item${filledCount === 1 ? "" : "s"} added`}</span> : null}
        {error ? (
          <p className="field__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className={`pre-output${message ? " is-ready" : ""}`}>
        <label className="field__label" htmlFor={outputId}>
          Your message
        </label>
        <div className="pre-output__box">
          <textarea
            id={outputId}
            className="textarea pre-output__text"
            rows={8}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onInput={(e) => e.stopPropagation()}
            placeholder="Your message appears here after you press Generate message. You can still edit it."
          />
          <button type="button" className="btn btn--ghost btn--sm pre-output__copy" onClick={copy} disabled={!message}>
            <Icon name="copy" size={16} /> Copy text
          </button>
        </div>
        {stale ? <p className="faint small">You changed the form. Press Generate message again to update the text.</p> : null}

        <p className="pre-output__send">Copy and send it to the admin:</p>
        {agreement}
        <div className="pre-output__buttons">
          {waBd ? (
            <a className={`btn btn--whatsapp${message ? "" : " is-disabled"}`} href={message ? waBd : undefined} aria-disabled={!message} target="_blank" rel="noopener noreferrer" data-pulse>
              <Icon name="whatsapp" size={19} /> WhatsApp Admin (BD)
            </a>
          ) : null}
          {waCn ? (
            <a className={`btn btn--whatsapp${message ? "" : " is-disabled"}`} href={message ? waCn : undefined} aria-disabled={!message} target="_blank" rel="noopener noreferrer" data-pulse>
              <Icon name="whatsapp" size={19} /> WhatsApp Admin (CN)
            </a>
          ) : null}
          {fb ? (
            <a
              className={`btn btn--facebook${message ? "" : " is-disabled"}`}
              href={message ? fb : undefined}
              aria-disabled={!message}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                if (message) copy();
              }}
            >
              <Icon name="facebook" size={19} /> Facebook
            </a>
          ) : null}
        </div>
        {!waBd && !waCn && !fb ? <p className="faint small">Copy the message and send it to us. Our contact links will appear here soon.</p> : null}
        <p className="faint small">
          {waBd || waCn ? "WhatsApp opens with your message already written. " : ""}
          {fb ? "For Facebook, the message is copied first; paste it into the chat." : ""}
        </p>
        {after}
      </div>
    </section>
  );
}
