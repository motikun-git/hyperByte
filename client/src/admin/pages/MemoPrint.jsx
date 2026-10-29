// The sales memo, in the layout of hyperByte's memo template: a preview on
// screen and a "Download PDF" button that saves it as a PDF file.
import { useEffect, useState } from "react";
import { useToast } from "../../context/ToastContext.jsx";
import { downloadMemoPdf } from "../lib/memoPdf.js";
import { Link } from "../../lib/router.jsx";
import Icon from "../../components/ui/Icon.jsx";
import { qrPath } from "../../lib/qr.js";
import { tk } from "../components/WarrantyForm.jsx";
import { LoadError, useAdminApi, useDocTitle } from "../ui.jsx";
import "./memo.css";

const memoDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric" }).replace(/ (\d{4})$/, ", $1") : "";

export default function MemoPrint({ id }) {
  const memo = useAdminApi(`/admin/warranties/${id}`);
  // The memo as it was issued; it does not change when settings change later.
  const w = memo.data?.warranty?.memo;
  const s = w?.seller || {};
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  useDocTitle(w ? `Memo ${w.invoiceNo || w.code}` : "Memo");

  useEffect(() => {
    document.documentElement.classList.add("memo-mode");
    return () => document.documentElement.classList.remove("memo-mode");
  }, []);

  if (memo.error && !w) {
    return (
      <div className="memo-page">
        <LoadError error={memo.error} onRetry={memo.reload} />
      </div>
    );
  }
  if (!w) {
    return (
      <div className="memo-page">
        <div className="spinner" aria-label="Loading" />
      </div>
    );
  }

  const site = (s.site || "https://yourhyperbyte.com").replace(/\/+$/, "");
  const checkUrl = `${site}/warranty?code=${w.code}`;
  const qr = qrPath(checkUrl);

  return (
    <div className="memo-page">
      <div className="memo-tools">
        <Link to={`/admin/warranties/${id}`} className="btn btn--ghost btn--sm">
          <Icon name="arrowLeft" size={16} /> Back
        </Link>
        <span className="memo-tools__hint">The PDF looks the same as this preview.</span>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          autoFocus
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await downloadMemoPdf(w);
              toast("Memo downloaded as PDF");
            } catch (err) {
              toast(err.message || "Could not create the PDF.", "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <span className="spinner spinner--sm" aria-hidden="true" /> : <Icon name="arrowDown" size={16} />} Download PDF
        </button>
      </div>

      <article className="memo" aria-label={`Memo ${w.invoiceNo || w.code}`}>
        <header className="memo__top">
          <h1 className="memo__brand">hyperByte</h1>
          <div className="memo__meta">
            <span>Date: {memoDate(w.date)}</span>
            {w.invoiceNo ? <strong>Invoice No. {w.invoiceNo}</strong> : null}
          </div>
        </header>

        <section className="memo__billed">
          <div>
            <h2>Billed to:</h2>
            <p>{w.customerName}</p>
            <p>{w.customerPhone}</p>
          </div>
          <div className="memo__code">
            <h2>Warranty code</h2>
            <p className="memo__code-value">{w.code}</p>
          </div>
        </section>

        <table className="memo__table">
          <thead>
            <tr>
              <th scope="col">Description</th>
              <th scope="col" className="c">Unit</th>
              <th scope="col" className="r">Price</th>
              <th scope="col" className="r">Amount</th>
            </tr>
          </thead>
          <tbody>
            {w.items.map((it, i) => {
              return (
                <tr key={i}>
                  <td>
                    <span className="memo__item">{it.name}</span>
                    {it.serials.length ? <span className="memo__sn">SN: {it.serials.join(", ")}</span> : null}
                    {it.line ? <span className="memo__sub">{it.line}</span> : null}
                  </td>
                  <td className="c">{it.quantity}</td>
                  <td className="r">{it.unitPrice !== null ? tk(it.unitPrice) : ""}</td>
                  <td className="r">{it.amount !== null ? tk(it.amount) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="memo__bottom memo__bottom--end">
          <dl className="memo__totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{tk(w.subtotal)}</dd>
            </div>
            {w.discount > 0 ? (
              <div>
                <dt>Discount</dt>
                <dd>−{tk(w.discount)}</dd>
              </div>
            ) : null}
            <div className="memo__total">
              <dt>Total</dt>
              <dd>{tk(w.total)}</dd>
            </div>
          </dl>
        </div>

        <footer className="memo__foot">
          <div>
            <h2>Payment Information</h2>
            <p>{w.payment}</p>
          </div>
          <div className="memo__seller">
            <h2>{s.name}</h2>
            <div className="memo__seller-row">
              <div>
                {s.address ? <p>{s.address}</p> : null}
                {s.phone ? <p>{s.phone}</p> : null}
                {s.facebook ? <p>{s.facebook}</p> : null}
              </div>
              <svg className="memo__qr" viewBox={`0 0 ${qr.view} ${qr.view}`} role="img" aria-label={`QR code: ${checkUrl}`} shapeRendering="crispEdges">
                <rect width={qr.view} height={qr.view} fill="#fff" />
                <path d={qr.d} fill="#111" />
              </svg>
            </div>
          </div>
        </footer>
      </article>
    </div>
  );
}
