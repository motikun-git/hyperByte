// The printable sales memo, in the layout of HyperByte's memo template.
// Opened from a warranty memo; "Print" uses the browser's print dialog
// (choose "Save as PDF" there to get a PDF).
import { useEffect } from "react";
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
  const settings = useAdminApi("/admin/settings");
  const w = memo.data?.warranty;
  const s = settings.data?.settings;
  useDocTitle(w ? `Memo ${w.invoiceNo || w.code}` : "Memo");

  useEffect(() => {
    document.documentElement.classList.add("memo-mode");
    return () => document.documentElement.classList.remove("memo-mode");
  }, []);

  const error = memo.error || settings.error;
  if (error && (!w || !s)) {
    return (
      <div className="memo-page">
        <LoadError error={error} onRetry={() => (memo.reload(), settings.reload())} />
      </div>
    );
  }
  if (!w || !s) {
    return (
      <div className="memo-page">
        <div className="spinner" aria-label="Loading" />
      </div>
    );
  }

  const site = (s.memoSiteUrl || "https://yourhyperbyte.com").replace(/\/+$/, "");
  const checkUrl = `${site}/warranty?code=${w.code}`;
  const qr = qrPath(checkUrl);

  return (
    <div className="memo-page">
      <div className="memo-tools">
        <Link to={`/admin/warranties/${id}`} className="btn btn--ghost btn--sm">
          <Icon name="arrowLeft" size={16} /> Back
        </Link>
        <span className="memo-tools__hint">Tip: in the print window choose "Save as PDF" to send it as a file.</span>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => window.print()} autoFocus>
          <Icon name="printer" size={16} /> Print memo
        </button>
      </div>

      <article className="memo" aria-label={`Memo ${w.invoiceNo || w.code}`}>
        <header className="memo__top">
          <h1 className="memo__brand">hyperByte</h1>
          <div className="memo__meta">
            <span>{memoDate(w.startsAt)}</span>
            {w.invoiceNo ? <strong>Invoice No. {w.invoiceNo}</strong> : null}
          </div>
        </header>

        <section className="memo__billed">
          <h2>Billed to:</h2>
          <p>{w.customerName}</p>
          <p>{w.customerPhone}</p>
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
            {w.items.map((it) => {
              const lines = [it.warrantyNote, it.period ? `${it.period} Warranty` : ""].filter(Boolean).join(" | ");
              return (
                <tr key={it.id}>
                  <td>
                    <span className="memo__item">{it.productName}</span>
                    {lines ? <span className="memo__sub">{lines}</span> : null}
                    {it.serials.length ? <span className="memo__sub">SN: {it.serials.join(", ")}</span> : null}
                  </td>
                  <td className="c">{it.quantity}</td>
                  <td className="r">{it.unitPrice !== null ? tk(it.unitPrice) : ""}</td>
                  <td className="r">{it.amount !== null ? tk(it.amount) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="memo__bottom">
          <div className="memo__code">
            <span className="memo__code-label">Billing code</span>
            <strong className="memo__code-value">{w.code}</strong>
            <span className="memo__code-help">Check your warranty with this code at {site.replace(/^https?:\/\//, "")}/warranty</span>
          </div>
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
            <p>{w.paymentLabel}</p>
          </div>
          <div className="memo__seller">
            <h2>{s.memoName}</h2>
            <div className="memo__seller-row">
              <div>
                {s.memoAddress ? <p>{s.memoAddress}</p> : null}
                {s.memoPhone ? <p>{s.memoPhone}</p> : null}
                {s.memoFacebook ? <p>{s.memoFacebook}</p> : null}
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
