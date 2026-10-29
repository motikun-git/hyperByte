// The parts list builder used on the Pre-order and Custom PC build pages:
// the visitor types the parts they want and marks each as pre-owned or new.
// A bar fixed to the bottom of the screen opens a popup with the ready
// message (already copied), to send on Facebook Messenger or WhatsApp
// (Admin CN). Nothing is ordered or paid on the website.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSettings } from "../../context/SettingsContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import { copyText } from "../../lib/clipboard.js";
import { facebookChat, messengerLink, whatsappLink } from "../../lib/contact.js";
import Modal from "../ui/Modal.jsx";
import Icon, { CategoryIcon } from "../ui/Icon.jsx";

const STEPS = [
  { icon: "pencil", text: "Fill in the component boxes" },
  { icon: "send", text: "Press Send my list (bottom right)" },
  { icon: "messageCircle", text: "Send it on Facebook or WhatsApp" },
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

export default function PartsBuilder({ id, title, hint, parts, intro, extra = [], children, agreement = null }) {
  const [rows, setRows] = useState(() => parts.map((p) => newRow(p.key)));
  const [open, setOpen] = useState(false);
  const [nudge, setNudge] = useState(false);
  const firstInput = useRef(null);

  const update = (rowId, change) => setRows((list) => list.map((r) => (r.id === rowId ? { ...r, ...change } : r)));
  const addAnother = (part, afterId) =>
    setRows((list) => {
      const i = list.findIndex((r) => r.id === afterId);
      const copy = [...list];
      copy.splice(i + 1, 0, newRow(part));
      return copy;
    });
  const remove = (rowId) => setRows((list) => list.filter((r) => r.id !== rowId));

  const filledCount = rows.filter((r) => r.name.trim()).length;
  const isFirstOfPart = (r, i) => rows.findIndex((x) => x.part === r.part) === i;

  const openSend = () => {
    if (!filledCount) {
      setNudge(true);
      firstInput.current?.focus();
      firstInput.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setNudge(false);
    setOpen(true);
  };

  // Keep the page's last content above the fixed bar.
  useEffect(() => {
    document.documentElement.classList.add("has-sendbar");
    return () => document.documentElement.classList.remove("has-sendbar");
  }, []);

  return (
    <section className="pre-builder panel" aria-labelledby={`${id}-title`}>
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
              <input
                id={inputId}
                ref={i === 0 ? firstInput : undefined}
                className="input pre-row__input"
                value={r.name}
                onChange={(e) => {
                  update(r.id, { name: e.target.value });
                  setNudge(false);
                }}
                placeholder={part.placeholder}
                maxLength={160}
                autoComplete="off"
              />
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

      {/* Rendered on <body>: a blurred or animated parent would stop position: fixed from working. */}
      {createPortal(
        <div className="sendfab" role="region" aria-label="Send your list">
          {nudge ? (
            <span className="sendfab__nudge" role="alert">
              Please select one or more products
            </span>
          ) : null}
          <button type="button" className="sendfab__btn" onClick={openSend} data-pulse>
            <Icon name="send" size={19} />
            <span>Send my list</span>
            {filledCount ? (
              <span className="sendfab__count num" aria-label={`${filledCount} item${filledCount === 1 ? "" : "s"}`}>
                {filledCount}
              </span>
            ) : null}
          </button>
        </div>,
        document.body
      )}

      {open ? <SendDialog initialText={buildPartsMessage(parts, rows, { intro, extra })} agreement={agreement} onClose={() => setOpen(false)} /> : null}
    </section>
  );
}

function SendDialog({ initialText, agreement, onClose }) {
  const { settings } = useSettings();
  const toast = useToast();
  const [text, setText] = useState(initialText);
  const [copied, setCopied] = useState(false);

  // The message is copied as soon as the popup opens, so it can be pasted straight away.
  useEffect(() => {
    copyText(initialText).then(setCopied);
  }, [initialText]);

  const fb = facebookChat(settings);
  const wa = whatsappLink(settings.whatsappNumberCn, text);
  const copyNow = async () => {
    const ok = await copyText(text);
    setCopied(ok);
    if (!ok) toast("Could not copy. Select the message and copy it by hand.", "error");
  };

  return (
    <Modal
      title="Your message"
      onClose={onClose}
      initialFocus={false}
      footer={
        fb || wa ? (
          <div className="send-dialog__foot">
            <span className="send-dialog__label">Send it to us on:</span>
            {fb ? (
              <a className="send-opt send-opt--fb" href={messengerLink(fb)} target="_blank" rel="noopener noreferrer" onClick={copyNow} aria-label="Send on Facebook (Page message)" title="Facebook Page message">
                <span className="send-opt__icon">
                  <Icon name="messenger" size={24} />
                </span>
                <span className="send-opt__text">Facebook</span>
              </a>
            ) : null}
            {wa ? (
              <a className="send-opt send-opt--wa" href={wa} target="_blank" rel="noopener noreferrer" onClick={copyNow} aria-label="Send on WhatsApp (Admin CN)" title="WhatsApp: Admin (CN)">
                <span className="send-opt__icon">
                  <Icon name="whatsapp" size={24} />
                </span>
                <span className="send-opt__text">WhatsApp</span>
              </a>
            ) : null}
          </div>
        ) : null
      }
    >
      <div className="send-dialog">
        <p className="send-dialog__note" role="status">
          <Icon name={copied ? "circleCheck" : "info"} size={17} />
          {copied ? "Copied. If the chat opens empty, just paste it." : "Check your message below. You can still edit it."}
        </p>
        <label className="sr-only" htmlFor="send-message">
          Your message
        </label>
        <textarea id="send-message" className="textarea send-dialog__text" rows={9} value={text} onChange={(e) => setText(e.target.value)} onBlur={copyNow} />

        {typeof agreement === "function" ? agreement(onClose) : agreement}

        {!fb && !wa ? <p className="faint small">Our contact links will appear here soon. The message is copied, so you can paste it to us anywhere.</p> : null}
      </div>
    </Modal>
  );
}
