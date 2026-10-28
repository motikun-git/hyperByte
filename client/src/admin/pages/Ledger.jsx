// Sales ledger: the private profit sheet, kept by month like spreadsheet tabs.
// Not connected to the products on the website (offline sales go here too),
// and never shown publicly.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "../../lib/router.jsx";
import { qs } from "../../lib/api.js";
import { useToast } from "../../context/ToastContext.jsx";
import Icon from "../../components/ui/Icon.jsx";
import Modal, { ConfirmDialog } from "../../components/ui/Modal.jsx";
import { adminApi } from "../adminApi.js";
import { Busy, Empty, Field, FilterTabs, LoadError, PageHead, Switch, useAdminApi, useDocTitle } from "../ui.jsx";

const moneyFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
/** 15270 -> "৳15,270", -806.25 -> "−৳806.25" */
export const money = (n) => (n === null || n === undefined ? "" : `${n < 0 ? "−" : ""}৳${moneyFormat.format(Math.abs(Number(n)))}`);
const plain = (n) => (n === null || n === undefined ? "" : moneyFormat.format(Number(n)));

export const monthName = (ym) => {
  if (!ym) return "";
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
};

/** "1,50,000" -> 150000; "" -> null; anything else -> NaN */
const toNumber = (v) => {
  const t = String(v ?? "").replace(/[\s,৳¥]/g, "");
  if (t === "") return null;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
};
const round2 = (n) => Math.round(n * 100) / 100;

export default function Ledger() {
  useDocTitle("Sales ledger");
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const month = params.get("month") || "";
  const [show, setShow] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | entry
  const [selling, setSelling] = useState(null); // entry being marked sold
  const [deleting, setDeleting] = useState(null);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);

  const view = useAdminApi(`/admin/ledger${qs({ month })}`);
  const d = view.data;
  const isOpen = d?.month?.status === "open";
  const entries = d?.entries || [];
  const shown = entries.filter((e) => (show === "sold" ? e.sold : show === "unsold" ? !e.sold : true));

  const goMonth = (ym) =>
    setParams((p) => {
      if (!ym || ym === d?.openYm) p.delete("month");
      else p.set("month", ym);
      return p;
    });

  const months = d?.months || [];
  const idx = months.findIndex((m) => m.ym === d?.month?.ym);
  const older = idx >= 0 ? months[idx + 1] : null;
  const newer = idx > 0 ? months[idx - 1] : null;

  const reloadAll = () => view.reload();

  return (
    <>
      <PageHead
        title="Sales ledger"
        sub="Your private profit sheet. Add every sale here, online or offline. Nothing on this page is shown on the website."
        actions={
          <>
            {isOpen ? (
              <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditing("new")}>
                <Icon name="plus" size={17} /> Add entry
              </button>
            ) : null}
            {d ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => downloadCsv(d)} disabled={!entries.length}>
                <Icon name="arrowDown" size={17} /> Download CSV
              </button>
            ) : null}
          </>
        }
      />

      {view.error && !d ? <LoadError error={view.error} onRetry={view.reload} /> : null}
      {view.loading && !d ? <div className="skeleton" style={{ height: 260 }} /> : null}

      {d ? (
        <div className="l-page" style={{ opacity: view.loading ? 0.65 : 1 }}>
          <div className="l-bar">
            <div className="l-month" role="group" aria-label="Month">
              <button type="button" className="a-iconbtn" onClick={() => goMonth(older?.ym)} disabled={!older} aria-label="Previous month">
                <Icon name="chevronLeft" size={17} />
              </button>
              <label className="l-month__pick">
                <span className="sr-only">Choose a month</span>
                <select className="select" value={d.month.ym} onChange={(e) => goMonth(e.target.value)}>
                  {months.map((m) => (
                    <option key={m.ym} value={m.ym}>
                      {monthName(m.ym)}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="a-iconbtn" onClick={() => goMonth(newer?.ym)} disabled={!newer} aria-label="Next month">
                <Icon name="chevronRight" size={17} />
              </button>
              <span className={`l-state${isOpen ? " is-open" : ""}`}>{isOpen ? "Open" : "Closed"}</span>
            </div>
            <RateBox rate={d.rate} onSaved={reloadAll} />
          </div>

          {isOpen && d.currentYm > d.month.ym ? (
            <div className="notice notice--warn">
              <Icon name="calendar" size={18} />
              <span>
                It is {monthName(d.currentYm)} now. When the sales of {monthName(d.month.ym)} are finished, press <strong>Close month</strong>.
              </span>
            </div>
          ) : null}
          {!isOpen ? (
            <div className="notice">
              <Icon name="lock" size={18} />
              <span>
                {monthName(d.month.ym)} is closed. Its sold items are kept here and cannot be changed. Unsold items were moved to the next month.
              </span>
            </div>
          ) : null}

          <Summary s={d.summary} />

          <section className="a-card l-sheet" aria-label={`Entries for ${monthName(d.month.ym)}`}>
            <div className="l-sheet__head">
              <FilterTabs
                label="Show entries"
                value={show}
                onChange={setShow}
                items={[
                  { value: "", label: "All", count: entries.length },
                  { value: "sold", label: "Sold", count: d.summary.soldCount },
                  { value: "unsold", label: "Unsold", count: d.summary.unsoldCount },
                ]}
              />
              {isOpen ? (
                <button type="button" className="btn btn--ghost btn--sm l-close" onClick={() => setClosing(true)}>
                  <Icon name="archive" size={16} /> Close month
                </button>
              ) : null}
            </div>

            {shown.length ? (
              <>
                <LedgerTable rows={shown} openMonth={d.month.ym} editable={isOpen} onEdit={setEditing} onSell={setSelling} onDelete={setDeleting} summary={show === "unsold" ? null : d.summary} />
                <LedgerCards rows={shown} openMonth={d.month.ym} editable={isOpen} onEdit={setEditing} onSell={setSelling} onDelete={setDeleting} />
              </>
            ) : (
              <Empty
                icon="receipt"
                title={entries.length ? "Nothing here" : "No entries yet"}
                text={isOpen ? "Add what you bought: the buy price in yuan (or taka), shipping and extra costs. Add the selling price when it sells." : "This month has no entries."}
              >
                {isOpen && !entries.length ? (
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditing("new")}>
                    <Icon name="plus" size={17} /> Add entry
                  </button>
                ) : null}
              </Empty>
            )}
          </section>

          <MonthNote key={d.month.ym} ym={d.month.ym} initial={d.month.note} />
        </div>
      ) : null}

      {editing ? (
        <EntryDialog
          initial={editing === "new" ? null : editing}
          rate={d?.rate}
          onClose={() => setEditing(null)}
          onSaved={(entry, isNew) => {
            setEditing(null);
            toast(isNew ? `Added ${entry.name}` : `Saved ${entry.name}`);
            reloadAll();
          }}
        />
      ) : null}
      {selling ? (
        <SellDialog
          entry={selling}
          onClose={() => setSelling(null)}
          onSaved={(entry) => {
            setSelling(null);
            toast(`${entry.name} marked sold. Profit ${money(entry.profit)}`);
            reloadAll();
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          message="This entry is removed from the ledger for good."
          confirmLabel="Delete entry"
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await adminApi(`/admin/ledger/entries/${deleting.id}`, { method: "DELETE" });
              toast(`Deleted ${deleting.name}`);
              setDeleting(null);
              reloadAll();
            } catch (err) {
              toast(err.message, "error");
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
      {closing && d ? (
        <CloseDialog
          d={d}
          onClose={() => setClosing(false)}
          onDone={(r) => {
            setClosing(false);
            toast(`${monthName(r.closed)} closed. ${r.moved} unsold item${r.moved === 1 ? "" : "s"} moved to ${monthName(r.open)}.`);
            goMonth(null);
            reloadAll();
          }}
        />
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------ pieces

function Summary({ s }) {
  return (
    <div className="l-summary">
      <div className={`l-stat l-stat--main${s.profit < 0 ? " is-loss" : ""}`}>
        <span className="l-stat__label">Total profit</span>
        <span className="l-stat__n num">{money(s.profit)}</span>
        <span className="l-stat__sub">from {s.soldCount} sold item{s.soldCount === 1 ? "" : "s"}</span>
      </div>
      <div className="l-stat">
        <span className="l-stat__label">Turnover</span>
        <span className="l-stat__n num">{money(s.turnover)}</span>
        <span className="l-stat__sub">total selling price</span>
      </div>
      <div className="l-stat">
        <span className="l-stat__label">Cost of sold items</span>
        <span className="l-stat__n num">{money(s.soldCost)}</span>
        <span className="l-stat__sub">buy + shipping + extra</span>
      </div>
      <div className="l-stat">
        <span className="l-stat__label">Unsold stock</span>
        <span className="l-stat__n num">{money(s.unsoldCost)}</span>
        <span className="l-stat__sub">
          {s.unsoldCount} item{s.unsoldCount === 1 ? "" : "s"}, not counted in profit
        </span>
      </div>
    </div>
  );
}

function RateBox({ rate, onSaved }) {
  const toast = useToast();
  const [value, setValue] = useState(String(rate ?? ""));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(rate === null || rate === undefined ? "" : Number(rate).toFixed(2)), [rate]);
  const changed = toNumber(value.replace(/^(\d+),(\d+)$/, "$1.$2")) !== Number(rate);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await adminApi("/admin/ledger/rate", { method: "PUT", body: { rate: value } });
      toast(`Rate saved: 1 yuan = ৳${Number(res.rate).toFixed(2)}. New entries use it.`);
      onSaved();
    } catch (err) {
      setError(err.errors?.rate || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="l-rate" onSubmit={save}>
      <label className="l-rate__row">
        <span className="l-rate__label">Yuan rate</span>
        <span className="l-rate__eq num">1 ¥ =</span>
        <input className="input num l-rate__input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} aria-describedby="rate-help" aria-invalid={error ? true : undefined} />
        <span className="l-rate__eq">৳</span>
      </label>
      <button type="submit" className="btn btn--primary btn--sm" disabled={busy || !changed}>
        {busy ? <Busy /> : <Icon name="save" size={16} />} Save rate
      </button>
      <p id="rate-help" className={error ? "field__error" : "l-rate__help"} role={error ? "alert" : undefined}>
        {error || "Used for new entries. Saved entries keep their own rate."}
      </p>
    </form>
  );
}

const costLine = (e) => (e.costCurrency === "CNY" ? `¥${plain(e.costAmount)} × ${Number(e.rate).toFixed(2)}` : "Bought in taka");

function Since({ e, openMonth }) {
  return e.firstYm !== openMonth ? <span className="l-since">From {monthName(e.firstYm)}</span> : null;
}

function Profit({ e }) {
  if (!e.sold) return <span className="l-notsold">Not sold</span>;
  return <span className={`num l-profit${e.profit < 0 ? " is-loss" : ""}`}>{money(e.profit)}</span>;
}

function RowActions({ e, editable, onEdit, onSell, onDelete }) {
  if (!editable) return null;
  return (
    <span className="l-actions">
      {!e.sold ? (
        <button type="button" className="btn btn--primary btn--sm l-sell" onClick={() => onSell(e)}>
          <Icon name="check" size={15} /> Sold
        </button>
      ) : null}
      <button type="button" className="a-iconbtn" onClick={() => onEdit(e)} aria-label={`Edit ${e.name}`}>
        <Icon name="pencil" size={16} />
      </button>
      <button type="button" className="a-iconbtn a-iconbtn--danger" onClick={() => onDelete(e)} aria-label={`Delete ${e.name}`}>
        <Icon name="trash" size={16} />
      </button>
    </span>
  );
}

function LedgerTable({ rows, openMonth, editable, onEdit, onSell, onDelete, summary }) {
  return (
    <div className="l-tablewrap">
      <table className="l-table">
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col" className="r">Buy price</th>
            <th scope="col" className="r">Buy (৳)</th>
            <th scope="col" className="r">Shipping</th>
            <th scope="col" className="r">Extra</th>
            <th scope="col" className="r">Total cost</th>
            <th scope="col" className="r">Selling</th>
            <th scope="col" className="r">Profit</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className={e.sold ? "is-sold" : "is-unsold"}>
              <th scope="row">
                <span className="l-name">{e.name}</span>
                <span className="l-meta">
                  <span className={`l-chip${e.sold ? " is-sold" : ""}`}>{e.sold ? "Sold" : "Unsold"}</span>
                  <Since e={e} openMonth={openMonth} />
                  {e.note ? <span className="l-note" title={e.note}>{e.note}</span> : null}
                </span>
              </th>
              <td className="r num">
                {e.costCurrency === "CNY" ? `¥${plain(e.costAmount)}` : "—"}
                {e.costCurrency === "CNY" ? <span className="l-small">× {Number(e.rate).toFixed(2)}</span> : null}
              </td>
              <td className="r num">{money(e.costBdt)}</td>
              <td className="r num">{e.shipping ? money(e.shipping) : <span className="faint">0</span>}</td>
              <td className="r num">{e.extra ? money(e.extra) : <span className="faint">0</span>}</td>
              <td className="r num l-strong">{money(e.totalCost)}</td>
              <td className="r num">{e.selling !== null ? money(e.selling) : <span className="faint">—</span>}</td>
              <td className="r">
                <Profit e={e} />
              </td>
              <td className="l-actcell">
                <RowActions e={e} editable={editable} onEdit={onEdit} onSell={onSell} onDelete={onDelete} />
              </td>
            </tr>
          ))}
        </tbody>
        {summary ? (
          <tfoot>
            <tr>
              <th scope="row">Total (sold items)</th>
              <td colSpan={4} />
              <td className="r num">{money(summary.soldCost)}</td>
              <td className="r num">{money(summary.turnover)}</td>
              <td className="r">
                <span className={`num l-profit l-profit--total${summary.profit < 0 ? " is-loss" : ""}`}>{money(summary.profit)}</span>
              </td>
              <td />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

function LedgerCards({ rows, openMonth, editable, onEdit, onSell, onDelete }) {
  return (
    <ul className="l-cards" role="list">
      {rows.map((e) => (
        <li key={e.id} className={`l-card${e.sold ? " is-sold" : ""}`}>
          <div className="l-card__top">
            <span className="l-name">{e.name}</span>
            <span className={`l-chip${e.sold ? " is-sold" : ""}`}>{e.sold ? "Sold" : "Unsold"}</span>
          </div>
          <dl className="l-card__facts">
            <div>
              <dt>Buy</dt>
              <dd className="num">
                {money(e.costBdt)} <span className="l-small">{costLine(e)}</span>
              </dd>
            </div>
            <div>
              <dt>Shipping + extra</dt>
              <dd className="num">{money(e.shipping + e.extra)}</dd>
            </div>
            <div>
              <dt>Total cost</dt>
              <dd className="num l-strong">{money(e.totalCost)}</dd>
            </div>
            <div>
              <dt>Selling</dt>
              <dd className="num">{e.selling !== null ? money(e.selling) : "—"}</dd>
            </div>
            <div className="l-card__profit">
              <dt>Profit</dt>
              <dd>
                <Profit e={e} />
              </dd>
            </div>
          </dl>
          {e.note || e.firstYm !== openMonth ? (
            <p className="l-card__note">
              <Since e={e} openMonth={openMonth} /> {e.note}
            </p>
          ) : null}
          <RowActions e={e} editable={editable} onEdit={onEdit} onSell={onSell} onDelete={onDelete} />
        </li>
      ))}
    </ul>
  );
}

function MonthNote({ ym, initial }) {
  const toast = useToast();
  const [note, setNote] = useState(initial || "");
  const [saved, setSaved] = useState(initial || "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const res = await adminApi(`/admin/ledger/months/${ym}/note`, { method: "PUT", body: { note } });
      setSaved(res.month.note);
      toast("Note saved");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="a-card">
      <div className="a-card__head">
        <h2 className="a-card__title">Notes for {monthName(ym)}</h2>
        <span className="a-card__note">Payments, who owes what, reminders</span>
      </div>
      <textarea className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Total 20k paid, 19,600 still due" aria-label={`Notes for ${monthName(ym)}`} />
      <div className="row" style={{ "--gap": "10px", marginTop: 10 }}>
        <button type="button" className="btn btn--ghost btn--sm" onClick={save} disabled={busy || note === saved}>
          {busy ? <Busy /> : <Icon name="save" size={16} />} Save note
        </button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ dialogs

function EntryDialog({ initial, rate, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: initial?.name || "",
    costCurrency: initial?.costCurrency || "CNY",
    costAmount: initial ? String(initial.costAmount) : "",
    rate: initial?.rate ? String(initial.rate) : rate ? Number(rate).toFixed(2) : "",
    shipping: initial?.shipping ? String(initial.shipping) : "",
    extra: initial?.extra ? String(initial.extra) : "",
    selling: initial?.selling !== null && initial?.selling !== undefined ? String(initial.selling) : "",
    sold: initial?.sold || false,
    note: initial?.note || "",
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  const calc = useMemo(() => {
    const amount = toNumber(form.costAmount);
    const r = toNumber(String(form.rate).replace(/^(\d+),(\d+)$/, "$1.$2"));
    const ship = toNumber(form.shipping) ?? 0;
    const extra = toNumber(form.extra) ?? 0;
    const sell = toNumber(form.selling);
    const buy = form.costCurrency === "CNY" ? (amount !== null && r ? round2(amount * r) : null) : amount;
    const valid = (n) => n !== null && !Number.isNaN(n);
    const total = valid(buy) && !Number.isNaN(ship) && !Number.isNaN(extra) ? round2(buy + ship + extra) : null;
    const profit = form.sold && total !== null && valid(sell) ? round2(sell - total) : null;
    return { buy: valid(buy) ? buy : null, total, profit };
  }, [form]);

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      const body = { ...form };
      const res = initial ? await adminApi(`/admin/ledger/entries/${initial.id}`, { method: "PUT", body }) : await adminApi("/admin/ledger/entries", { method: "POST", body });
      onSaved(res.entry, !initial);
    } catch (err) {
      setErrors(err.errors || {});
      if (err.status !== 422) toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const yuan = form.costCurrency === "CNY";
  return (
    <Modal
      wide
      title={initial ? `Edit ${initial.name}` : "Add an entry"}
      onClose={onClose}
      initialFocus={false}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={save} disabled={busy}>
            {busy ? <Busy /> : <Icon name="save" size={17} />} {initial ? "Save" : "Add entry"}
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label="Product" error={errors.name}>
          {(p) => <input {...p} className="input" value={form.name} onChange={set("name")} maxLength={160} placeholder="e.g. Asus TUF 2060" autoComplete="off" />}
        </Field>

        <div className="field">
          <span className="field__label" id="bought-in">
            Bought in
          </span>
          <div className="a-segment" role="group" aria-labelledby="bought-in">
            <button type="button" aria-pressed={yuan} onClick={() => setForm((f) => ({ ...f, costCurrency: "CNY" }))}>
              Yuan (¥), from China
            </button>
            <button type="button" aria-pressed={!yuan} onClick={() => setForm((f) => ({ ...f, costCurrency: "BDT" }))}>
              Taka (৳), local
            </button>
          </div>
        </div>

        <div className="a-grid a-grid--2">
          <Field label={yuan ? "Buy price (¥)" : "Buy price (৳)"} error={errors.costAmount}>
            {(p) => <input {...p} className="input num" inputMode="decimal" value={form.costAmount} onChange={set("costAmount")} placeholder={yuan ? "e.g. 2200" : "e.g. 32447"} />}
          </Field>
          {yuan ? (
            <Field label="Rate for this entry: 1 ¥ = ? ৳" error={errors.rate}>
              {(p) => <input {...p} className="input num" inputMode="decimal" value={form.rate} onChange={set("rate")} />}
            </Field>
          ) : null}
          <Field label="Shipping (৳)" optional error={errors.shipping}>
            {(p) => <input {...p} className="input num" inputMode="decimal" value={form.shipping} onChange={set("shipping")} placeholder="0" />}
          </Field>
          <Field label="Extra / misc cost (৳)" optional error={errors.extra}>
            {(p) => <input {...p} className="input num" inputMode="decimal" value={form.extra} onChange={set("extra")} placeholder="0" />}
          </Field>
          <Field label="Selling price (৳)" optional={!form.sold} error={errors.selling} hint={form.sold ? undefined : "You can add it now or when it sells."}>
            {(p) => <input {...p} className="input num" inputMode="decimal" value={form.selling} onChange={set("selling")} placeholder="e.g. 52000" />}
          </Field>
          <div className="field" style={{ alignContent: "end" }}>
            <Switch checked={form.sold} onChange={(v) => setForm((f) => ({ ...f, sold: v }))} label="Sold" />
          </div>
        </div>

        <Field label="Note" optional>
          {(p) => <input {...p} className="input" value={form.note} onChange={set("note")} maxLength={500} placeholder="e.g. Sold offline, paid half" />}
        </Field>

        <div className="l-calc" aria-live="polite">
          <div>
            <span>Buy in taka</span>
            <strong className="num">{calc.buy !== null ? money(calc.buy) : "—"}</strong>
          </div>
          <div>
            <span>Total cost</span>
            <strong className="num">{calc.total !== null ? money(calc.total) : "—"}</strong>
          </div>
          <div>
            <span>Profit</span>
            {form.sold ? (
              <strong className={`num l-profit${calc.profit !== null && calc.profit < 0 ? " is-loss" : ""}`}>{calc.profit !== null ? money(calc.profit) : "—"}</strong>
            ) : (
              <strong className="l-notsold">Counted when sold</strong>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function SellDialog({ entry, onClose, onSaved }) {
  const toast = useToast();
  const [price, setPrice] = useState(entry.selling !== null ? String(entry.selling) : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sell = toNumber(price);
  const profit = sell !== null && !Number.isNaN(sell) ? round2(sell - entry.totalCost) : null;

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await adminApi(`/admin/ledger/entries/${entry.id}`, { method: "PUT", body: { ...entry, selling: price, sold: true } });
      onSaved(res.entry);
    } catch (err) {
      setError(err.errors?.selling || err.message);
      if (err.status !== 422) toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Mark ${entry.name} as sold`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={save} disabled={busy}>
            {busy ? <Busy /> : <Icon name="check" size={17} />} Mark sold
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label="Selling price (৳)" error={error}>
          {(p) => (
            <input
              {...p}
              className="input num"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              data-autofocus
            />
          )}
        </Field>
        <div className="l-calc">
          <div>
            <span>Total cost</span>
            <strong className="num">{money(entry.totalCost)}</strong>
          </div>
          <div>
            <span>Profit</span>
            <strong className={`num l-profit${profit !== null && profit < 0 ? " is-loss" : ""}`}>{profit !== null ? money(profit) : "—"}</strong>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function CloseDialog({ d, onClose, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const next = (() => {
    const [y, m] = d.month.ym.split("-").map(Number);
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  })();
  const s = d.summary;
  const close = async () => {
    setBusy(true);
    try {
      onDone(await adminApi("/admin/ledger/close", { method: "POST", body: { month: d.month.ym } }));
    } catch (err) {
      toast(err.message, "error");
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`Close ${monthName(d.month.ym)}?`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} data-autofocus>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={close} disabled={busy}>
            {busy ? <Busy /> : <Icon name="archive" size={17} />} Close month
          </button>
        </>
      }
    >
      <ul className="l-closelist">
        <li>
          <strong>{s.soldCount}</strong> sold item{s.soldCount === 1 ? "" : "s"} stay in {monthName(d.month.ym)}, with a total profit of <strong className={s.profit < 0 ? "l-loss-text" : ""}>{money(s.profit)}</strong>.
        </li>
        <li>
          <strong>{s.unsoldCount}</strong> unsold item{s.unsoldCount === 1 ? "" : "s"} move to {monthName(next)}.
        </li>
        <li>{monthName(d.month.ym)} becomes read-only. This cannot be undone.</li>
      </ul>
    </Modal>
  );
}

// ------------------------------------------------------------------ CSV

function downloadCsv(d) {
  const cell = (v) => {
    const t = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const head = ["Product", "Status", "Bought in", "Buy price", "Rate (1 CNY in BDT)", "Buy (BDT)", "Shipping (BDT)", "Extra (BDT)", "Total cost (BDT)", "Selling (BDT)", "Profit (BDT)", "First month", "Note"];
  const rows = d.entries.map((e) => [
    e.name,
    e.sold ? "Sold" : "Unsold",
    e.costCurrency,
    e.costAmount,
    e.rate ?? "",
    e.costBdt,
    e.shipping,
    e.extra,
    e.totalCost,
    e.selling ?? "",
    e.profit ?? "",
    e.firstYm,
    e.note,
  ]);
  const s = d.summary;
  rows.push([], ["Total profit (sold items)", "", "", "", "", "", "", "", s.soldCost, s.turnover, s.profit], ["Unsold stock", s.unsoldCount, "", "", "", "", "", "", s.unsoldCost]);
  if (d.month.note) rows.push([], ["Note", d.month.note]);
  const csv = "﻿" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `hyperbyte-ledger-${d.month.ym}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
