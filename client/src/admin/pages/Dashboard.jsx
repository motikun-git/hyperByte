import { Link } from "../../lib/router.jsx";
import Icon, { CategoryIcon } from "../../components/ui/Icon.jsx";
import { StatusBadge } from "../../components/product/ProductBits.jsx";
import { dateShort, taka, timeAgo } from "../../lib/format.js";
import { useAdmin } from "../AdminContext.js";
import { Empty, LoadError, PageHead, useAdminApi, useDocTitle } from "../ui.jsx";
import { remainingText } from "./WarrantiesList.jsx";
import { money, monthName } from "./Ledger.jsx";

export default function Dashboard() {
  useDocTitle("Dashboard");
  const { admin } = useAdmin();
  const { data, error, loading, reload } = useAdminApi("/admin/dashboard");
  const p = data?.products;
  const w = data?.warranties;

  return (
    <>
      <PageHead
        title={`Hello, ${admin?.name?.split(" ")[0] || "there"}`}
        sub="What is on the website right now, and what needs attention."
        actions={
          <>
            <Link to="/admin/products/new" className="btn btn--primary btn--sm">
              <Icon name="plus" size={17} /> Add product
            </Link>
            <Link to="/admin/warranties/new" className="btn btn--ghost btn--sm">
              <Icon name="receipt" size={17} /> New memo
            </Link>
            <Link to="/admin/inquiries" className="btn btn--ghost btn--sm">
              <Icon name="clipboardCheck" size={17} /> Pre-orders
            </Link>
          </>
        }
      />

      {error && !data ? <LoadError error={error} onRetry={reload} /> : null}

      {data?.warnings?.length ? (
        <div className="a-warnings">
          {data.warnings.map((warning) => (
            <div key={warning.key} className="notice notice--warn">
              <Icon name="alert" size={18} />
              <span>
                {warning.text}{" "}
                {warning.key !== "setup" ? (
                  <Link to="/admin/settings" className="link">
                    Open Settings
                  </Link>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="a-counts" aria-busy="true">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="skeleton" style={{ height: 78 }} />
          ))}
        </div>
      ) : data ? (
        <>
          <h2 className="sr-only">Products</h2>
          <div className="a-counts">
            <Count to="/admin/products?view=available" n={p.available} label="Available now" />
            <Count to="/admin/products?view=preorder" n={p.preorder} label="Pre-order" />
            <Count to="/admin/products?view=sold" n={p.sold} label="Sold" />
            <Count to="/admin/products?view=unpublished" n={p.unpublished} label="Hidden drafts" />
            <Count to="/admin/warranties?view=active" n={w.active} label="Active warranties" />
            <Count to="/admin/warranties?view=expiring" n={w.expiring} label="Ending in 7 days" warn={w.expiring > 0} />
            <Count to="/admin/warranties?view=expired" n={w.expired} label="Expired warranties" />
            <Count to="/admin/inquiries" n={data.inquiries?.open} label="Open pre-order requests" />
            {data.ledger ? <Count to="/admin/ledger" n={money(data.ledger.profit)} label={`Profit in ${monthName(data.ledger.ym)}`} warn={data.ledger.profit < 0} /> : null}
          </div>

          <div className="a-dash">
            <section className="a-card" aria-labelledby="dash-recent">
              <div className="a-card__head">
                <h2 id="dash-recent" className="a-card__title">
                  Recently changed products
                </h2>
                <Link to="/admin/products" className="link small">
                  All products
                </Link>
              </div>
              {data.recentProducts.length ? (
                <ul className="a-list" role="list">
                  {data.recentProducts.map((item) => (
                    <li key={item.dbId} className="a-item">
                      <span className={`a-thumb${item.status === "sold" ? " a-thumb--sold" : ""}`}>
                        {item.image ? <img src={item.image.thumb || item.image.url} alt="" loading="lazy" /> : <CategoryIcon type={item.category?.icon} size={22} strokeWidth={1.5} />}
                      </span>
                      <span className="a-item__main">
                        <Link to={`/admin/products/${item.dbId}`} className="a-item__title">
                          {item.name}
                        </Link>
                        <span className="a-item__meta">
                          {item.isPublished ? <StatusBadge status={item.status} /> : <span className="badge">Hidden</span>}
                          <span>{item.sku}</span>
                          <span>Changed {timeAgo(item.updatedAt)}</span>
                        </span>
                      </span>
                      <span className="a-price num">{item.price === null ? "Ask" : taka(item.price)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty icon="package" title="No products yet" text="Add your first product with photos, condition and price.">
                  <Link to="/admin/products/new" className="btn btn--primary btn--sm">
                    <Icon name="plus" size={17} /> Add product
                  </Link>
                </Empty>
              )}
            </section>

            <section className="a-card" aria-labelledby="dash-expiring">
              <div className="a-card__head">
                <h2 id="dash-expiring" className="a-card__title">
                  Warranties ending soon
                </h2>
                <Link to="/admin/warranties" className="link small">
                  All warranties
                </Link>
              </div>
              {data.expiringWarranties.length ? (
                <ul className="a-list" role="list">
                  {data.expiringWarranties.map((item) => (
                    <li key={item.id} className="a-item" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
                      <span className="a-item__main">
                        <Link to={`/admin/warranties/${item.id}`} className="a-item__title">
                          {item.productName}
                        </Link>
                        <span className="a-item__meta">
                          <span className="a-code">{item.code}</span>
                          {item.customerName ? <span>{item.customerName}</span> : null}
                        </span>
                      </span>
                      <span className="small" title={dateShort(item.expiresAt)}>
                        {remainingText(item)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="faint small">No warranty ends in the next 7 days.</p>
              )}
            </section>
          </div>
        </>
      ) : null}
    </>
  );
}

function Count({ to, n, label, warn = false }) {
  return (
    <Link to={to} className={`a-count${warn ? " a-count--warn" : ""}`}>
      <span className="a-count__n num">{n ?? 0}</span>
      <span className="a-count__label">{label}</span>
    </Link>
  );
}
