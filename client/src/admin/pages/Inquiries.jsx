// Pre-order and sourcing tracker. Entries are added by hand after a chat on
// WhatsApp or Facebook; the website does not read those conversations.
import { useEffect, useState } from "react";
import { useSearchParams } from "../../lib/router.jsx";
import { qs } from "../../lib/api.js";
import { useToast } from "../../context/ToastContext.jsx";
import Icon from "../../components/ui/Icon.jsx";
import Modal, { ConfirmDialog } from "../../components/ui/Modal.jsx";
import { INQUIRY_STATUSES } from "../../lib/constants.js";
import { dateShort, dhakaDateInput, taka } from "../../lib/format.js";
import { toWaNumber, whatsappLink } from "../../lib/contact.js";
import { adminApi } from "../adminApi.js";
import ProductPicker from "../components/ProductPicker.jsx";
import { Busy, Empty, Field, FilterTabs, LoadError, PageHead, Pager, useAdminApi, useDocTitle } from "../ui.jsx";

const OPEN = ["inquiry", "sourcing", "expected", "available"];

export default function Inquiries() {
  useDocTitle("Pre-orders");
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "open";
  const q = params.get("q") || "";
  const page = Number(params.get("page") || 1);
  const [search, setSearch] = useState(q);
  const [editing, setEditing] = useState(null); // null | "new" | inquiry
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const update = (changes) =>
    setParams((p) => {
      for (const [k, v] of Object.entries(changes)) {
        if (v === null || v === undefined || (k !== "status" && v === "") || (k === "page" && Number(v) === 1)) p.delete(k);
        else p.set(k, v);
      }
      if (!("page" in changes)) p.delete("page");
      return p;
    });

  useEffect(() => setSearch(q), [q]);
  useEffect(() => {
    if (search === q) return undefined;
    const t = window.setTimeout(() => update({ q: search.trim() }), 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const list = useAdminApi(`/admin/inquiries${qs({ status, q, page: page > 1 ? page : "" })}`);
  const c = list.data?.counts;
  const tabs = [
    { value: "open", label: "Open", count: c?.open },
    ...Object.entries(INQUIRY_STATUSES).map(([value, label]) => ({ value, label, count: c?.[value] })),
    { value: "", label: "All", count: c?.total },
  ];

  const quickStatus = async (item, next) => {
    try {
      await adminApi(`/admin/inquiries/${item.id}`, { method: "PUT", body: { ...item, status: next } });
      toast(`${item.ref}: ${INQUIRY_STATUSES[next]}`);
      list.reload();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  return (
    <>
      <PageHead
        title="Pre-orders and requests"
        sub="Keep track of what customers asked you to source. Add an entry after a WhatsApp or Facebook chat. An entry is not a confirmed order."
        actions={
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditing("new")}>
            <Icon name="plus" size={17} /> Add request
          </button>
        }
      />
      <FilterTabs items={tabs} value={status} onChange={(v) => update({ status: v })} label="Show requests" />
      <div className="a-toolbar">
        <label className="a-search">
          <Icon name="search" size={17} />
          <span className="sr-only">Search requests</span>
          <input className="input" type="search" placeholder="Reference, product, customer name or contact" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      {list.error && !list.data ? (
        <LoadError error={list.error} onRetry={list.reload} />
      ) : list.loading && !list.data ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : list.data?.items?.length ? (
        <section className="a-card" style={{ opacity: list.loading ? 0.6 : 1 }}>
          <ul className="a-list" role="list">
            {list.data.items.map((item) => {
              const wa = toWaNumber(item.customerContact);
              return (
                <li key={item.id} className="a-item" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
                  <span className="a-item__main">
                    <button type="button" className="a-item__title text-left" onClick={() => setEditing(item)} style={{ background: "none", border: 0, padding: 0, textAlign: "left" }}>
                      {item.productName}
                    </button>
                    <span className="a-item__meta">
                      <span className="a-code">{item.ref}</span>
                      {item.customerName ? <span>{item.customerName}</span> : null}
                      {item.customerContact ? <span>{item.customerContact}</span> : null}
                      <span>Asked {dateShort(item.inquiryDate)}</span>
                      {item.expectedPrice !== null ? <span>{taka(item.expectedPrice)}</span> : null}
                      {item.eta ? <span>Expected {dateShort(item.eta)}</span> : null}
                    </span>
                    {item.notes ? <span className="a-muted-row">{item.notes.length > 140 ? `${item.notes.slice(0, 140)}...` : item.notes}</span> : null}
                  </span>
                  <span className="a-pcontrols">
                    <label>
                      <span className="sr-only">Status of {item.ref}</span>
                      <select className="select" value={item.status} onChange={(e) => quickStatus(item, e.target.value)}>
                        {Object.entries(INQUIRY_STATUSES).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {wa ? (
                      <a className="a-iconbtn" href={whatsappLink(wa, `Hello ${item.customerName || ""}, this is HyperByte about your request for ${item.productName} (${item.ref}).`.replace("Hello ,", "Hello,"))} target="_blank" rel="noopener noreferrer" aria-label={`Message ${item.customerName || "customer"} on WhatsApp`}>
                        <Icon name="whatsapp" size={16} />
                      </a>
                    ) : null}
                    <button type="button" className="a-iconbtn" onClick={() => setEditing(item)} aria-label={`Edit ${item.ref}`}>
                      <Icon name="pencil" size={16} />
                    </button>
                    <button type="button" className="a-iconbtn a-iconbtn--danger" onClick={() => setDeleting(item)} aria-label={`Delete ${item.ref}`}>
                      <Icon name="trash" size={16} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          <Pager page={list.data.page} pages={list.data.pages} onPage={(n) => update({ page: n })} />
        </section>
      ) : (
        <Empty icon="clipboardCheck" title={q || (status && status !== "open") ? "No requests match" : "No open requests"} text="When a customer asks you to source something, add it here so nothing is forgotten.">
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditing("new")}>
            <Icon name="plus" size={17} /> Add request
          </button>
        </Empty>
      )}

      {editing ? (
        <InquiryDialog
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(item, isNew) => {
            setEditing(null);
            toast(isNew ? `Added ${item.ref}` : `Saved ${item.ref}`);
            list.reload();
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.ref}?`}
          message="The request is removed from this list for good. To keep it for later, set it to Cancelled or Completed instead."
          confirmLabel="Delete request"
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await adminApi(`/admin/inquiries/${deleting.id}`, { method: "DELETE" });
              toast(`Deleted ${deleting.ref}`);
              setDeleting(null);
              list.reload();
            } catch (err) {
              toast(err.message, "error");
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
    </>
  );
}

function InquiryDialog({ initial, onClose, onSaved }) {
  const toast = useToast();
  const [product, setProduct] = useState(initial?.productId ? { dbId: initial.productId, name: initial.productName, sku: initial.productSku } : null);
  const [form, setForm] = useState({
    productName: initial && !initial.productId ? initial.productName : "",
    customerName: initial?.customerName || "",
    customerContact: initial?.customerContact || "",
    inquiryDate: initial?.inquiryDate || dhakaDateInput(),
    expectedPrice: initial?.expectedPrice ?? "",
    eta: initial?.eta || "",
    status: initial?.status || "inquiry",
    notes: initial?.notes || "",
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    setBusy(true);
    setErrors({});
    const body = { ...form, productId: product?.dbId || null, productName: product ? "" : form.productName, expectedPrice: form.expectedPrice === "" ? null : String(form.expectedPrice) };
    try {
      const res = initial ? await adminApi(`/admin/inquiries/${initial.id}`, { method: "PUT", body }) : await adminApi("/admin/inquiries", { method: "POST", body });
      onSaved(res.inquiry, !initial);
    } catch (err) {
      setErrors(err.errors || {});
      if (err.status !== 422) toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      wide
      title={initial ? `Request ${initial.ref}` : "Add a request"}
      onClose={onClose}
      initialFocus={false}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={save} disabled={busy}>
            {busy ? <Busy /> : <Icon name="save" size={17} />} {initial ? "Save" : "Add request"}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="field">
          <span className="field__label">Product</span>
          <ProductPicker value={product} onPick={setProduct} onClear={() => setProduct(null)} placeholder="Pick a listed product (optional)" />
        </div>
        {!product ? (
          <Field label="Or describe what they want" error={errors.productName}>
            {(p) => <input {...p} className="input" value={form.productName} onChange={set("productName")} maxLength={160} placeholder="e.g. RTX 4070 Super, any brand" />}
          </Field>
        ) : null}
        <div className="a-grid a-grid--2">
          <Field label="Customer name" optional>
            {(p) => <input {...p} className="input" value={form.customerName} onChange={set("customerName")} maxLength={80} autoComplete="off" />}
          </Field>
          <Field label="Phone or Facebook name" optional hint="Private. Only shown here.">
            {(p) => <input {...p} className="input" value={form.customerContact} onChange={set("customerContact")} maxLength={120} autoComplete="off" />}
          </Field>
          <Field label="Asked on" error={errors.inquiryDate}>
            {(p) => <input {...p} className="input" type="date" value={form.inquiryDate} onChange={set("inquiryDate")} />}
          </Field>
          <Field label="Status" error={errors.status}>
            {(p) => (
              <select {...p} className="select" value={form.status} onChange={set("status")}>
                {Object.entries(INQUIRY_STATUSES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Expected price (taka)" optional error={errors.expectedPrice}>
            {(p) => <input {...p} className="input num" inputMode="numeric" value={form.expectedPrice} onChange={set("expectedPrice")} />}
          </Field>
          <Field label="Expected arrival" optional error={errors.eta}>
            {(p) => <input {...p} className="input" type="date" value={form.eta} onChange={set("eta")} />}
          </Field>
        </div>
        <Field label="Notes" optional>
          {(p) => <textarea {...p} className="textarea" rows={3} value={form.notes} onChange={set("notes")} />}
        </Field>
        {OPEN.includes(form.status) ? null : <p className="field__hint">Completed and cancelled requests leave the Open list but stay searchable.</p>}
      </div>
    </Modal>
  );
}
