import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "../../lib/router.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import Icon from "../../components/ui/Icon.jsx";
import Modal, { ConfirmDialog } from "../../components/ui/Modal.jsx";
import { dateLong, dateShort, dateTime } from "../../lib/format.js";
import { toWaNumber, whatsappLink } from "../../lib/contact.js";
import { adminApi } from "../adminApi.js";
import WarrantyForm, { tk } from "../components/WarrantyForm.jsx";
import { downloadMemoPdf } from "../lib/memoPdf.js";
import { Busy, CopyButton, Field, LoadError, PageHead, useAdminApi, useDocTitle } from "../ui.jsx";
import { remainingText, WARRANTY_LABELS } from "./WarrantiesList.jsx";

export default function WarrantyDetail({ id }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const created = params.get("created") === "1";
  const { data, error, loading, reload, setData } = useAdminApi(`/admin/warranties/${id}`);
  const w = data?.warranty;
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState(null); // { kind: "extend" | "void" | "delete", item? }
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  useDocTitle(w ? `Memo ${w.invoiceNo || w.code}` : "Warranty");

  const downloadMemo = async () => {
    setPdfBusy(true);
    try {
      await downloadMemoPdf(w.memo);
      toast("Memo downloaded as PDF");
    } catch (err) {
      toast(err.message || "Could not create the PDF.", "error");
    } finally {
      setPdfBusy(false);
    }
  };

  const act = async (path, body, message) => {
    setBusy(true);
    try {
      const res = await adminApi(`/admin/warranties/${id}${path}`, { method: "POST", body });
      setData({ warranty: res.warranty });
      setDialog(null);
      toast(message);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) {
    return (
      <>
        <PageHead title="Warranty" back={{ to: "/admin/warranties", label: "Warranties" }} />
        <LoadError error={error} onRetry={reload} />
      </>
    );
  }
  if (loading || !w) return <div className="skeleton" style={{ height: 260 }} />;

  if (editing) {
    return (
      <>
        <PageHead title={`Edit memo ${w.invoiceNo || w.code}`} back={{ to: `/admin/warranties/${id}`, label: "Back", onClick: (e) => (e.preventDefault(), setEditing(false)) }} />
        <WarrantyForm
          initial={w}
          onSaved={(saved) => {
            setData({ warranty: saved });
            setEditing(false);
            toast("Memo saved");
          }}
          onCancel={() => setEditing(false)}
        />
      </>
    );
  }

  const link = `${window.location.origin}/warranty?code=${w.code}`;
  const message = `Hello ${w.customerName}, your HyperByte warranty code is ${w.code}${w.invoiceNo ? ` (memo ${w.invoiceNo})` : ""}. Check your warranty any time: ${link}`;
  const customerWa = toWaNumber(w.customerPhone);
  const memoVoid = w.status === "void" && w.voidedAt;

  return (
    <>
      <PageHead
        title={w.customerName || w.productName}
        sub={`${w.invoiceNo ? `Memo ${w.invoiceNo}, ` : ""}created ${dateTime(w.createdAt)}`}
        back={{ to: "/admin/warranties", label: "Warranties" }}
        actions={
          <>
            <button type="button" className="btn btn--primary btn--sm" onClick={downloadMemo} disabled={pdfBusy}>
              {pdfBusy ? <Busy /> : <Icon name="arrowDown" size={16} />} Download memo (PDF)
            </button>
            <Link to={`/admin/warranties/${id}/memo`} className="btn btn--ghost btn--sm">
              <Icon name="receipt" size={16} /> View memo
            </Link>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>
              <Icon name="pencil" size={16} /> Edit
            </button>
          </>
        }
      />

      {created ? (
        <p className="notice" style={{ marginBottom: 16 }} role="status">
          <Icon name="circleCheck" size={18} /> Memo created. Download the memo as a PDF for the customer, and send the code on WhatsApp.
        </p>
      ) : null}

      <div className="a-dash" style={{ marginTop: 0 }}>
        <div className="stack">
          <section className="a-wcode" aria-label="Warranty code">
            <span className={`badge badge--${w.status}`}>{WARRANTY_LABELS[w.status]}</span>
            <span className="a-wcode__code">{w.code}</span>
            <span className="a-remaining num">
              {w.itemCount} product{w.itemCount === 1 ? "" : "s"}
              {w.status === "active" ? `, longest warranty: ${remainingText(w)}` : ""}
            </span>
            <div className="a-wcode__actions">
              <CopyButton text={w.code} label="Copy code" />
              <CopyButton text={message} label="Copy message" icon="messageSquare" />
              {customerWa ? (
                <a className="btn btn--whatsapp btn--sm" href={whatsappLink(customerWa, message)} target="_blank" rel="noopener noreferrer">
                  <Icon name="whatsapp" size={16} /> Send to {w.customerName || "customer"}
                </a>
              ) : (
                <a className="btn btn--whatsapp btn--sm" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
                  <Icon name="whatsapp" size={16} /> Share on WhatsApp
                </a>
              )}
              <a className="btn btn--ghost btn--sm" href={link} target="_blank" rel="noopener noreferrer">
                <Icon name="external" size={16} /> Open check page
              </a>
            </div>
          </section>

          <section className="a-card" aria-labelledby="wd-items">
            <div className="a-card__head">
              <h2 id="wd-items" className="a-card__title">
                Products on this memo
              </h2>
              <span className="a-card__note">Each has its own warranty</span>
            </div>
            <ul className="m-ditems" role="list">
              {w.items.map((it) => (
                <li key={it.id} className="m-ditem">
                  <div className="m-ditem__top">
                    <div>
                      <p className="m-ditem__name">
                        {it.productId ? (
                          <Link to={`/admin/products/${it.productId}`} className="link">
                            {it.productName}
                          </Link>
                        ) : (
                          it.productName
                        )}
                        {it.quantity > 1 ? <span className="faint"> × {it.quantity}</span> : null}
                      </p>
                      <p className="m-ditem__meta">
                        {it.serials.length ? <span>SN: {it.serials.join(", ")}</span> : <span className="faint">No serial number</span>}
                        {it.unitPrice !== null ? <span className="num">{tk(it.amount)}</span> : null}
                      </p>
                    </div>
                    <span className={`badge badge--${it.status === "none" ? "unavailable" : it.status}`}>{it.status === "none" ? "No warranty" : WARRANTY_LABELS[it.status]}</span>
                  </div>
                  {it.status !== "none" ? (
                    <p className="m-ditem__period">
                      {it.period} {it.typeLabel || "Warranty"}{it.warrantyNote ? `, ${it.warrantyNote}` : ""}. {it.status === "expired" ? "Ended" : "Ends"} {dateShort(it.expiresAt)}
                      {it.status === "active" ? ` (${remainingText(it)})` : ""}
                      {it.status === "void" && it.voidReason ? `. Void: ${it.voidReason}` : ""}
                    </p>
                  ) : it.warrantyNote ? (
                    <p className="m-ditem__period">{it.warrantyNote}</p>
                  ) : null}
                  {!memoVoid && it.status !== "none" ? (
                    <div className="m-ditem__actions">
                      {it.status !== "void" ? (
                        <>
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDialog({ kind: "extend", item: it })}>
                            <Icon name="calendar" size={15} /> Extend
                          </button>
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDialog({ kind: "void", item: it })}>
                            <Icon name="ban" size={15} /> Void this product
                          </button>
                        </>
                      ) : (
                        <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => act("/restore", { itemId: it.id }, `${it.productName} restored`)}>
                          <Icon name="rotateCcw" size={15} /> Restore
                        </button>
                      )}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          <section className="a-card" aria-labelledby="wd-facts">
            <div className="a-card__head">
              <h2 id="wd-facts" className="a-card__title">
                Memo details
              </h2>
            </div>
            <dl className="a-facts">
              <div>
                <dt>Customer</dt>
                <dd>{w.customerName || "—"}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{w.customerPhone || "—"}</dd>
              </div>
              <div>
                <dt>Memo number</dt>
                <dd className="num">{w.invoiceNo || "—"}</dd>
              </div>
              <div>
                <dt>Date of purchase</dt>
                <dd>{dateLong(w.startsAt)}</dd>
              </div>
              <div>
                <dt>Subtotal</dt>
                <dd className="num">{tk(w.subtotal)}</dd>
              </div>
              {w.discount > 0 ? (
                <div>
                  <dt>Discount</dt>
                  <dd className="num">{tk(w.discount)}</dd>
                </div>
              ) : null}
              <div>
                <dt>Total</dt>
                <dd className="num">{tk(w.total)}</dd>
              </div>
              <div>
                <dt>Payment</dt>
                <dd>{w.paymentLabel || "—"}</dd>
              </div>
            </dl>
            {w.internalNotes ? <p className="a-terms" style={{ marginTop: 14 }}>{w.internalNotes}</p> : null}
          </section>
        </div>

        <div className="stack">
          <section className="a-card" aria-labelledby="wd-actions">
            <div className="a-card__head">
              <h2 id="wd-actions" className="a-card__title">
                The whole memo
              </h2>
            </div>
            <div className="stack" style={{ "--gap": "10px" }}>
              <button type="button" className="btn btn--ghost" onClick={() => setDialog({ kind: "extend" })} disabled={w.status === "void" || w.status === "none"}>
                <Icon name="calendar" size={17} /> Extend every product
              </button>
              {memoVoid ? (
                <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => act("/restore", {}, "Memo restored")}>
                  {busy ? <Busy /> : <Icon name="rotateCcw" size={17} />} Restore (undo void)
                </button>
              ) : (
                <button type="button" className="btn btn--ghost" onClick={() => setDialog({ kind: "void" })}>
                  <Icon name="ban" size={17} /> Void the whole memo
                </button>
              )}
              <button type="button" className="btn btn--danger" onClick={() => setDialog({ kind: "delete" })}>
                <Icon name="trash" size={17} /> Delete memo
              </button>
              <p className="field__hint">Void keeps the memo and shows "Void" on the check page. Delete removes it completely; the code then shows "Not registered".</p>
            </div>
          </section>
          <section className="a-card" aria-labelledby="wd-terms">
            <div className="a-card__head">
              <h2 id="wd-terms" className="a-card__title">
                Terms shown to the customer
              </h2>
            </div>
            <p className="a-terms">{w.terms || "No terms."}</p>
          </section>
        </div>
      </div>

      {dialog?.kind === "extend" ? (
        <ExtendDialog
          item={dialog.item}
          busy={busy}
          onCancel={() => setDialog(null)}
          onExtend={(body) => act("/extend", { ...body, itemId: dialog.item?.id }, dialog.item ? `${dialog.item.productName} extended` : "Every product extended")}
        />
      ) : null}
      {dialog?.kind === "void" ? (
        <VoidDialog
          item={dialog.item}
          busy={busy}
          onCancel={() => setDialog(null)}
          onVoid={(reason) => act("/void", { reason, itemId: dialog.item?.id }, dialog.item ? `${dialog.item.productName} voided` : "Memo voided")}
        />
      ) : null}
      {dialog?.kind === "delete" ? (
        <ConfirmDialog
          title={`Delete memo ${w.code}?`}
          message="The memo and all its products are removed for good. If the customer checks this code, the website will say it is not registered. To keep a history, void it instead."
          confirmLabel="Delete memo"
          confirmText={w.code}
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await adminApi(`/admin/warranties/${id}`, { method: "DELETE", body: { confirmCode: w.code } });
              toast(`Deleted ${w.code}`);
              navigate("/admin/warranties", { replace: true });
            } catch (err) {
              toast(err.message, "error");
              setBusy(false);
            }
          }}
        />
      ) : null}
    </>
  );
}

function ExtendDialog({ item, busy, onCancel, onExtend }) {
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("days");
  const options = [
    ["+7 days", { days: 7 }],
    ["+15 days", { days: 15 }],
    ["+1 month", { months: 1 }],
    ["+3 months", { months: 3 }],
  ];
  return (
    <Modal
      title={item ? `Extend ${item.productName}` : "Extend every product"}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" disabled={busy || !Number(amount)} onClick={() => onExtend({ [unit]: Number(amount) })}>
            {busy ? <Busy /> : <Icon name="calendar" size={17} />} Extend
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="muted small">
          {item
            ? item.status === "expired"
              ? "This warranty has ended, so the extra time counts from now."
              : `Currently ends ${dateLong(item.expiresAt)}. The extra time is added to that date.`
            : "The extra time is added to each product's end date (or from now, if it has ended). Void products are not changed."}
        </p>
        <div className="a-segment">
          {options.map(([label, body]) => (
            <button key={label} type="button" disabled={busy} onClick={() => onExtend(body)}>
              {label}
            </button>
          ))}
        </div>
        <div className="row" style={{ "--gap": "8px", alignItems: "flex-end" }}>
          <Field label="Or add">
            {(p) => <input {...p} className="input num" inputMode="numeric" style={{ width: 110 }} value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />}
          </Field>
          <Field label="Unit">
            {(p) => (
              <select {...p} className="select" style={{ width: 130 }} value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="days">days</option>
                <option value="months">months</option>
              </select>
            )}
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function VoidDialog({ item, busy, onCancel, onVoid }) {
  const [reason, setReason] = useState("");
  return (
    <Modal
      title={item ? `Void the warranty of ${item.productName}?` : "Void the whole memo?"}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn--danger" disabled={busy || reason.trim().length < 3} onClick={() => onVoid(reason.trim())}>
            {busy ? <Busy /> : <Icon name="ban" size={17} />} Void
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="muted small">
          {item ? "Only this product shows \"Void\" on the check page; the other products keep their warranty." : "Every product on this memo shows \"Void\" on the check page."} The reason is private. You can restore it later.
        </p>
        <Field label="Reason" hint="For example: product returned, warranty sticker removed, physical damage.">
          {(p) => <input {...p} className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />}
        </Field>
      </div>
    </Modal>
  );
}
