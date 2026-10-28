import { useEffect, useState } from "react";
import { Link, useSearchParams } from "../../lib/router.jsx";
import { qs } from "../../lib/api.js";
import Icon from "../../components/ui/Icon.jsx";
import { dateShort } from "../../lib/format.js";
import { Empty, FilterTabs, LoadError, PageHead, Pager, useAdminApi, useDocTitle } from "../ui.jsx";

export const WARRANTY_LABELS = { active: "Active", expired: "Expired", void: "Void", none: "No warranty" };

/** "12 days left", "5 hours left", "Ended 3 days ago", "Void" */
export function remainingText(w, seconds = w.remainingSeconds) {
  if (w.status === "void") return "Void";
  if (w.status === "expired" || seconds <= 0) {
    const ago = Math.max(0, Math.round((Date.now() - new Date(w.expiresAt).getTime()) / 86400000));
    return ago < 1 ? "Ended today" : `Ended ${ago} day${ago === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(seconds / 86400);
  if (days >= 2) return `${days} days left`;
  const hours = Math.floor(seconds / 3600);
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"} left`;
  return `${Math.max(1, Math.floor(seconds / 60))} min left`;
}

export default function WarrantiesList() {
  useDocTitle("Warranties");
  const [params, setParams] = useSearchParams();
  const view = params.get("view") || "";
  const q = params.get("q") || "";
  const page = Number(params.get("page") || 1);
  const [search, setSearch] = useState(q);

  const update = (changes) =>
    setParams((p) => {
      for (const [k, v] of Object.entries(changes)) {
        if (v === "" || v === null || v === undefined || (k === "page" && Number(v) === 1)) p.delete(k);
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

  const list = useAdminApi(`/admin/warranties${qs({ view, q, page: page > 1 ? page : "" })}`);
  const c = list.data?.counts;
  const tabs = [
    { value: "", label: "All", count: c?.total },
    { value: "active", label: "Active", count: c?.active },
    { value: "expiring", label: "Ending in 7 days", count: c?.expiring },
    { value: "expired", label: "Expired", count: c?.expired },
    { value: "void", label: "Void", count: c?.void },
  ];

  return (
    <>
      <PageHead
        title="Warranties and memos"
        sub="One memo can hold several products, each with its serial number and own warranty. The customer checks everything with one code. Lost code? Search the phone number here."
        actions={
          <Link to="/admin/warranties/new" className="btn btn--primary btn--sm">
            <Icon name="plus" size={17} /> New memo
          </Link>
        }
      />
      <FilterTabs items={tabs} value={view} onChange={(v) => update({ view: v })} label="Show warranties" />
      <div className="a-toolbar">
        <label className="a-search">
          <Icon name="search" size={17} />
          <span className="sr-only">Search warranties</span>
          <input className="input" type="search" placeholder="Phone number, code, memo number, serial number, product or name" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      {list.error && !list.data ? (
        <LoadError error={list.error} onRetry={list.reload} />
      ) : list.loading && !list.data ? (
        <div className="stack" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton" style={{ height: 64 }} />
          ))}
        </div>
      ) : list.data?.items?.length ? (
        <section className="a-card" style={{ opacity: list.loading ? 0.6 : 1 }}>
          <ul className="a-list" role="list">
            {list.data.items.map((w) => (
              <li key={w.id} className="a-item" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
                <span className="a-item__main">
                  <Link to={`/admin/warranties/${w.id}`} className="a-item__title">
                    {w.customerName || w.productName}
                  </Link>
                  <span className="a-item__meta">
                    <span className="a-code">{w.code}</span>
                    {w.customerPhone ? <span>{w.customerPhone}</span> : null}
                    <span>{w.productName}</span>
                    {w.invoiceNo ? <span>Memo {w.invoiceNo}</span> : null}
                    <span>{dateShort(w.startsAt)}</span>
                  </span>
                </span>
                <span className="a-item__side">
                  <span className={`badge badge--${w.status}`}>{WARRANTY_LABELS[w.status]}</span>
                  <span className="small hide-narrow">{w.status === "active" ? remainingText(w) : ""}</span>
                  <Link to={`/admin/warranties/${w.id}`} className="a-iconbtn" aria-label={`Open warranty ${w.code}`}>
                    <Icon name="chevronRight" size={17} />
                  </Link>
                </span>
              </li>
            ))}
          </ul>
          <Pager page={list.data.page} pages={list.data.pages} onPage={(n) => update({ page: n })} />
        </section>
      ) : (
        <Empty icon="shieldCheck" title={q || view ? "No memos match" : "No memos yet"} text={q || view ? "Try another search or tab." : "Create a memo when you sell something. It gives one warranty code for all the products."}>
          <Link to="/admin/warranties/new" className="btn btn--primary btn--sm">
            <Icon name="plus" size={17} /> New memo
          </Link>
        </Empty>
      )}
    </>
  );
}
