// Create or edit a sales memo with warranty: customer, products (quantity,
// serial numbers, price, each product's own warranty), discount and payment.
// Saving gives one warranty code for the whole memo. The server decides
// the dates and statuses; this form only collects the details.
import { useMemo, useState } from "react";
import { useSettings } from "../../context/SettingsContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import Icon from "../../components/ui/Icon.jsx";
import { dhakaDateInput } from "../../lib/format.js";
import { adminApi } from "../adminApi.js";
import { Busy, Field } from "../ui.jsx";
import ProductPicker from "./ProductPicker.jsx";

export const PAYMENT_METHODS = [
  { value: "transfer", label: "Account transfer" },
  { value: "cash", label: "Cash" },
  { value: "mobile", label: "Mobile banking" },
];
const UNITS = [
  { value: "day", label: "Days" },
  { value: "month", label: "Months" },
  { value: "year", label: "Years" },
];
const moneyFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
export const tk = (n) => `৳${moneyFormat.format(Number(n) || 0)}`;
const toNum = (v) => {
  const t = String(v ?? "").replace(/[\s,৳]/g, "");
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
};

let key = 1;
const emptyItem = () => ({ key: key++, id: null, product: null, productName: "", quantity: 1, serials: [""], unitPrice: "", warrantyValue: "", warrantyUnit: "day", warrantyType: "warranty", warrantyNote: "" });

function fromInitial(item) {
  return {
    key: key++,
    id: item.id,
    product: item.productId ? { dbId: item.productId, name: item.productName, sku: item.productRef } : null,
    productName: item.productId ? "" : item.productName,
    quantity: item.quantity,
    serials: item.serials.length ? [...item.serials, ...Array(Math.max(0, item.quantity - item.serials.length)).fill("")] : Array(item.quantity).fill(""),
    unitPrice: item.unitPrice === null ? "" : String(item.unitPrice),
    warrantyValue: item.warrantyValue ? String(item.warrantyValue) : "",
    warrantyUnit: item.warrantyUnit || "day",
    warrantyType: item.warrantyType || "warranty",
    warrantyNote: item.warrantyNote || "",
  };
}

export default function WarrantyForm({ initial = null, presetProduct = null, onSaved, onCancel }) {
  const { settings } = useSettings();
  const toast = useToast();
  const editing = Boolean(initial);
  const [customerName, setCustomerName] = useState(initial?.customerName || "");
  const [customerPhone, setCustomerPhone] = useState(initial?.customerPhone || "");
  const [startsAt, setStartsAt] = useState(editing ? dhakaDateInput(initial.startsAt) : dhakaDateInput());
  const [items, setItems] = useState(() => {
    if (editing) return initial.items.map(fromInitial);
    const first = emptyItem();
    if (presetProduct) {
      first.product = presetProduct;
      first.unitPrice = presetProduct.price ? String(presetProduct.price) : "";
      if (presetProduct.warrantyDays) first.warrantyValue = String(presetProduct.warrantyDays);
    }
    return [first];
  });
  const [discount, setDiscount] = useState(initial?.discount ? String(initial.discount) : "");
  const [payment, setPayment] = useState(initial?.paymentMethod || "");
  const [terms, setTerms] = useState(initial?.terms ?? settings.warrantyTerms ?? "");
  const [notes, setNotes] = useState(initial?.internalNotes || "");
  const [moreOpen, setMoreOpen] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const setItem = (k, change) => setItems((list) => list.map((it) => (it.key === k ? { ...it, ...change } : it)));
  const setQty = (it, raw) => {
    const q = Math.max(1, Math.min(99, Number(String(raw).replace(/\D/g, "")) || 1));
    const serials = [...it.serials];
    while (serials.length < q) serials.push("");
    // Keep typed serials when lowering the quantity only if they are empty.
    while (serials.length > q && serials[serials.length - 1] === "") serials.pop();
    setItem(it.key, { quantity: q, serials });
  };

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, it) => sum + (toNum(it.unitPrice) || 0) * (Number(it.quantity) || 0), 0);
    const d = toNum(discount) || 0;
    return { subtotal, discount: d, total: Math.max(0, subtotal - d) };
  }, [items, discount]);

  const err = (path) => errors[path];

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setBusy(true);
    const body = {
      customerName,
      customerPhone,
      startsAt,
      paymentMethod: payment,
      discount,
      terms,
      internalNotes: notes,
      items: items.map((it) => ({
        id: it.id,
        productId: it.product?.dbId || null,
        productName: it.product ? "" : it.productName,
        quantity: it.quantity,
        serials: it.serials.map((s) => s.trim()).filter(Boolean),
        unitPrice: it.unitPrice,
        warrantyValue: it.warrantyValue,
        warrantyUnit: it.warrantyUnit,
        warrantyType: it.warrantyType,
        warrantyNote: it.warrantyNote,
      })),
    };
    try {
      const res = editing ? await adminApi(`/admin/warranties/${initial.id}`, { method: "PUT", body }) : await adminApi("/admin/warranties", { method: "POST", body });
      onSaved(res.warranty);
    } catch (error) {
      setErrors(error.errors || {});
      toast(error.status === 422 ? "Please fix the marked fields." : error.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <section className="a-card" aria-labelledby="wf-customer">
        <div className="a-card__head">
          <h2 id="wf-customer" className="a-card__title">
            Customer
          </h2>
          <span className="a-card__note">Printed on the memo. Never shown on the website.</span>
        </div>
        <div className="a-grid a-grid--2">
          <Field label="Purchaser's name" error={err("customerName")}>
            {(p) => <input {...p} className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={80} autoComplete="off" />}
          </Field>
          <Field label="Phone" error={err("customerPhone")} hint="Saved with the warranty code, so you can find the code later by this number.">
            {(p) => <input {...p} className="input" inputMode="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} maxLength={30} autoComplete="off" placeholder="01XXXXXXXXX" />}
          </Field>
        </div>
      </section>

      <section className="a-card" aria-labelledby="wf-items">
        <div className="a-card__head">
          <h2 id="wf-items" className="a-card__title">
            Products
          </h2>
          <span className="a-card__note">Each product has its own warranty</span>
        </div>
        {err("items") ? <p className="field__error">{err("items")}</p> : null}
        <ol className="m-items">
          {items.map((it, i) => {
            const p = `items.${i}.`;
            const amount = (toNum(it.unitPrice) || 0) * it.quantity;
            return (
              <li key={it.key} className="m-item">
                <div className="m-item__head">
                  <span className="m-item__no">Product {i + 1}</span>
                  {items.length > 1 ? (
                    <button type="button" className="a-iconbtn a-iconbtn--danger" onClick={() => setItems((list) => list.filter((x) => x.key !== it.key))} aria-label={`Remove product ${i + 1}`}>
                      <Icon name="trash" size={16} />
                    </button>
                  ) : null}
                </div>
                <div className="stack" style={{ "--gap": "12px" }}>
                  <ProductPicker
                    value={it.product}
                    placeholder="Pick a listed product (optional)"
                    onPick={(prod) =>
                      setItem(it.key, {
                        product: prod,
                        unitPrice: it.unitPrice || (prod.price ? String(prod.price) : ""),
                        warrantyValue: it.warrantyValue || (prod.warrantyDays ? String(prod.warrantyDays) : ""),
                        warrantyUnit: it.warrantyValue ? it.warrantyUnit : "day",
                      })
                    }
                    onClear={() => setItem(it.key, { product: null })}
                  />
                  {!it.product ? (
                    <Field label="Or type the product name" error={err(p + "productName")}>
                      {(fp) => <input {...fp} className="input" value={it.productName} onChange={(e) => setItem(it.key, { productName: e.target.value })} maxLength={160} placeholder="e.g. ASUS TUF Gaming A15 FA506IV" />}
                    </Field>
                  ) : err(p + "productName") ? (
                    <p className="field__error">{err(p + "productName")}</p>
                  ) : null}

                  <div className="m-item__grid">
                    <Field label="Unit" error={err(p + "quantity")}>
                      {(fp) => (
                        <div className="m-qty">
                          <button type="button" className="a-iconbtn" onClick={() => setQty(it, it.quantity - 1)} disabled={it.quantity <= 1} aria-label="One less">
                            <Icon name="minus" size={15} />
                          </button>
                          <input {...fp} className="input num" inputMode="numeric" value={it.quantity} onChange={(e) => setQty(it, e.target.value)} />
                          <button type="button" className="a-iconbtn" onClick={() => setQty(it, it.quantity + 1)} disabled={it.quantity >= 99} aria-label="One more">
                            <Icon name="plus" size={15} />
                          </button>
                        </div>
                      )}
                    </Field>
                    <Field label="Price for one unit (৳)" error={err(p + "unitPrice")}>
                      {(fp) => <input {...fp} className="input num" inputMode="decimal" value={it.unitPrice} onChange={(e) => setItem(it.key, { unitPrice: e.target.value })} placeholder="e.g. 63000" />}
                    </Field>
                    <div className="field m-amount">
                      <span className="field__label">Amount</span>
                      <strong className="num">{tk(amount)}</strong>
                    </div>
                  </div>

                  <div className="field">
                    <span className="field__label">Serial number{it.quantity > 1 ? "s (one per unit)" : " (SN)"}</span>
                    <div className="m-serials">
                      {it.serials.map((sn, si) => (
                        <input
                          key={si}
                          className="input"
                          value={sn}
                          onChange={(e) => setItem(it.key, { serials: it.serials.map((x, xi) => (xi === si ? e.target.value : x)) })}
                          placeholder={it.quantity > 1 ? `SN of unit ${si + 1}` : "e.g. N8NRCX03A8521"}
                          maxLength={80}
                          aria-label={`Serial number ${si + 1} of product ${i + 1}`}
                          autoComplete="off"
                          spellCheck="false"
                        />
                      ))}
                    </div>
                    {err(p + "serials") ? <p className="field__error">{err(p + "serials")}</p> : null}
                  </div>

                  <div className="field">
                    <span className="field__label" id={`wtype-${it.key}`}>
                      Type of warranty
                    </span>
                    <div className="a-segment" role="radiogroup" aria-labelledby={`wtype-${it.key}`}>
                      {[
                        ["warranty", "Warranty"],
                        ["service", "Service Warranty"],
                      ].map(([value, label]) => (
                        <button key={value} type="button" role="radio" aria-checked={it.warrantyType === value} aria-pressed={it.warrantyType === value} onClick={() => setItem(it.key, { warrantyType: value })}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="m-item__grid">
                    <Field label={it.warrantyType === "service" ? "Service warranty period" : "Warranty period"} error={err(p + "warrantyValue")} hint={`Leave empty for no warranty. On the memo: "${it.warrantyValue ? `${it.warrantyValue} ${UNITS.find((u) => u.value === it.warrantyUnit)?.label}` : "2 Years"} ${it.warrantyType === "service" ? "Service Warranty" : "Warranty"}".`}>
                      {(fp) => (
                        <div className="m-period">
                          <input {...fp} className="input num" inputMode="numeric" value={it.warrantyValue} onChange={(e) => setItem(it.key, { warrantyValue: e.target.value.replace(/\D/g, "") })} placeholder="e.g. 2" />
                          <select className="select" value={it.warrantyUnit} onChange={(e) => setItem(it.key, { warrantyUnit: e.target.value })} aria-label="Warranty unit">
                            {UNITS.map((u) => (
                              <option key={u.value} value={u.value}>
                                {u.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </Field>
                    <Field label="Extra line on the memo" optional hint="e.g. 15 Days Replacement">
                      {(fp) => <input {...fp} className="input" value={it.warrantyNote} onChange={(e) => setItem(it.key, { warrantyNote: e.target.value })} maxLength={160} />}
                    </Field>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setItems((list) => [...list, emptyItem()])} disabled={items.length >= 30}>
          <Icon name="plus" size={16} /> Add another product
        </button>
      </section>

      <section className="a-card" aria-labelledby="wf-pay">
        <div className="a-card__head">
          <h2 id="wf-pay" className="a-card__title">
            Payment
          </h2>
        </div>
        <div className="stack">
          <div className="m-totals">
            <div>
              <span>Subtotal</span>
              <strong className="num">{tk(totals.subtotal)}</strong>
            </div>
            <Field label="Discount (৳)" optional error={err("discount")} hint="Leave empty for no discount; then the memo shows no discount line.">
              {(p) => <input {...p} className="input num" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />}
            </Field>
            <div className="m-totals__total">
              <span>Total</span>
              <strong className="num">{tk(totals.total)}</strong>
            </div>
          </div>
          <div className="field">
            <span className="field__label" id="wf-method">
              Payment method
            </span>
            <div className="a-segment" role="radiogroup" aria-labelledby="wf-method">
              {PAYMENT_METHODS.map((m) => (
                <button key={m.value} type="button" role="radio" aria-checked={payment === m.value} aria-pressed={payment === m.value} onClick={() => setPayment(m.value)}>
                  {m.label}
                </button>
              ))}
            </div>
            {err("paymentMethod") ? <p className="field__error">{err("paymentMethod")}</p> : null}
          </div>
          <Field label="Date of purchase" hint="The warranty of each product starts on this day." error={err("startsAt")}>
            {(p) => <input {...p} className="input" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} style={{ maxWidth: 220 }} />}
          </Field>
        </div>
      </section>

      <section className="a-card">
        <button type="button" className="m-more" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
          <span className="a-card__title">Terms and private notes</span>
          <Icon name={moreOpen ? "chevronUp" : "chevronDown"} size={18} />
        </button>
        {moreOpen ? (
          <div className="stack" style={{ marginTop: 14 }}>
            <Field label="Warranty terms" hint="Shown on the public check page. Saved with this memo.">
              {(p) => <textarea {...p} className="textarea" rows={5} value={terms} onChange={(e) => setTerms(e.target.value)} />}
            </Field>
            <Field label="Private notes" optional hint="Only shown here: what was tested, anything for a later claim.">
              {(p) => <textarea {...p} className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />}
            </Field>
          </div>
        ) : null}
      </section>

      <div className="a-savebar">
        {onCancel ? (
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? <Busy /> : <Icon name={editing ? "save" : "receipt"} size={18} />} {editing ? "Save changes" : "Create memo and warranty code"}
        </button>
      </div>
    </form>
  );
}
