import { useEffect, useState } from "react";
import { Link, useSearchParams } from "../../lib/router.jsx";
import { qs } from "../../lib/api.js";
import { useToast } from "../../context/ToastContext.jsx";
import Icon, { CategoryIcon } from "../../components/ui/Icon.jsx";
import { ConfirmDialog } from "../../components/ui/Modal.jsx";
import { taka, timeAgo } from "../../lib/format.js";
import { STATUSES } from "../../lib/constants.js";
import { adminApi } from "../adminApi.js";
import { Empty, FilterTabs, LoadError, PageHead, Pager, useAdminApi, useDocTitle } from "../ui.jsx";

const SORTS = [
  ["updated", "Recently changed"],
  ["newest", "Newest first"],
  ["price_asc", "Price: low to high"],
  ["price_desc", "Price: high to low"],
  ["name", "Name A to Z"],
];

export default function ProductsList() {
  useDocTitle("Products");
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") || "";
  const q = params.get("q") || "";
  const category = params.get("category") || "";
  const sort = params.get("sort") || "updated";
  const page = Number(params.get("page") || 1);
  const [search, setSearch] = useState(q);
  const [deleting, setDeleting] = useState(null);
  const [busyDelete, setBusyDelete] = useState(false);

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

  const list = useAdminApi(`/admin/products${qs({ view, q, category, sort: sort === "updated" ? "" : sort, page: page > 1 ? page : "", limit: 30 })}`);
  const cats = useAdminApi("/admin/categories");
  const counts = list.data?.counts;

  const replaceItem = (product) =>
    list.setData((d) => (d ? { ...d, items: d.items.map((it) => (it.dbId === product.dbId ? { ...it, ...toListItem(product) } : it)) } : d));

  const quick = async (item, changes, message) => {
    try {
      const res = await adminApi(`/admin/products/${item.dbId}`, { method: "PATCH", body: changes });
      replaceItem(res.product);
      toast(message(res.product));
      list.reload();
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const remove = async () => {
    setBusyDelete(true);
    try {
      await adminApi(`/admin/products/${deleting.dbId}`, { method: "DELETE" });
      toast(`Deleted ${deleting.name}`);
      setDeleting(null);
      list.reload();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusyDelete(false);
    }
  };

  const tabs = [
    { value: "", label: "All", count: counts?.total },
    { value: "available", label: "Available", count: counts?.available },
    { value: "preorder", label: "Pre-order", count: counts?.preorder },
    { value: "sold", label: "Sold", count: counts?.sold },
    { value: "unavailable", label: "Unavailable", count: counts?.unavailable },
    { value: "unpublished", label: "Hidden", count: counts?.unpublished },
    { value: "featured", label: "Featured", count: counts?.featured },
  ];

  return (
    <>
      <PageHead
        title="Products"
        sub="Everything you list. Change availability, hide or feature items right from this list."
        actions={
          <Link to="/admin/products/new" className="btn btn--primary btn--sm">
            <Icon name="plus" size={17} /> Add product
          </Link>
        }
      />

      <FilterTabs items={tabs} value={view} onChange={(v) => update({ view: v })} label="Show products" />

      <div className="a-toolbar">
        <label className="a-search">
          <Icon name="search" size={17} />
          <span className="sr-only">Search products</span>
          <input className="input" type="search" placeholder="Search name, model, ID or spec" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label>
          <span className="sr-only">Category</span>
          <select className="select" value={category} onChange={(e) => update({ category: e.target.value })}>
            <option value="">All categories</option>
            {(cats.data?.categories || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentId ? `\u00A0\u00A0\u00A0${c.name}` : c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Sort</span>
          <select className="select" value={sort} onChange={(e) => update({ sort: e.target.value === "updated" ? "" : e.target.value })}>
            {SORTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {list.error && !list.data ? (
        <LoadError error={list.error} onRetry={list.reload} />
      ) : list.loading && !list.data ? (
        <div className="stack" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="skeleton" style={{ height: 70 }} />
          ))}
        </div>
      ) : list.data?.items?.length ? (
        <section className="a-card a-products" style={{ opacity: list.loading ? 0.6 : 1 }}>
          <p className="a-muted-row" aria-live="polite">
            {list.data.total} product{list.data.total === 1 ? "" : "s"}
            {q ? ` matching "${q}"` : ""}
          </p>
          <ul className="a-list" role="list">
            {list.data.items.map((item) => (
              <ProductRow key={item.dbId} item={item} onQuick={quick} onDelete={() => setDeleting(item)} />
            ))}
          </ul>
          <Pager page={list.data.page} pages={list.data.pages} onPage={(n) => update({ page: n })} />
        </section>
      ) : (
        <Empty icon="package" title={q || view || category ? "No products match" : "No products yet"} text={q || view || category ? "Try another search or tab." : "Add your first product to show it on the website."}>
          <Link to="/admin/products/new" className="btn btn--primary btn--sm">
            <Icon name="plus" size={17} /> Add product
          </Link>
        </Empty>
      )}

      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          message="The product and all its photos are removed for good. Warranty records for it are kept. If it was sold, consider marking it Sold instead, so it still shows under Recently sold."
          confirmLabel="Delete product"
          busy={busyDelete}
          onConfirm={remove}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </>
  );
}

function toListItem(product) {
  return {
    status: product.status,
    isPublished: product.isPublished,
    isFeatured: product.isFeatured,
    updatedAt: product.updatedAt,
  };
}

function ProductRow({ item, onQuick, onDelete }) {
  const viewHref = item.isPublished ? `/product/${item.slug}` : `/product/${item.slug}?preview=1`;
  return (
    <li className="a-item">
      <Link to={`/admin/products/${item.dbId}`} className={`a-thumb${item.status === "sold" ? " a-thumb--sold" : ""}`} tabIndex={-1} aria-hidden="true">
        {item.image ? <img src={item.image.thumb || item.image.url} alt="" loading="lazy" /> : <CategoryIcon type={item.category?.icon} size={22} strokeWidth={1.5} />}
      </Link>
      <span className="a-item__main">
        <Link to={`/admin/products/${item.dbId}`} className="a-item__title">
          {item.name}
        </Link>
        <span className="a-item__meta">
          <span className="a-price num">{item.price === null ? "Contact for price" : taka(item.price)}</span>
          <span>{item.sku}</span>
          {item.category ? <span>{item.subcategory ? `${item.category.name} / ${item.subcategory.name}` : item.category.name}</span> : null}
          <span>{item.imageCount ? `${item.imageCount} photo${item.imageCount === 1 ? "" : "s"}` : "No photos"}</span>
          <span>Changed {timeAgo(item.updatedAt)}</span>
        </span>
      </span>
      <span className="a-pcontrols">
        <label>
          <span className="sr-only">Availability of {item.name}</span>
          <select
            className="select"
            value={item.status}
            onChange={(e) => onQuick(item, { status: e.target.value }, (p) => `${p.name}: ${STATUSES[p.status].label}`)}
          >
            {Object.entries(STATUSES).map(([value, s]) => (
              <option key={value} value={value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => onQuick(item, { isPublished: !item.isPublished }, (p) => (p.isPublished ? `${p.name} is on the website` : `${p.name} is hidden`))}
          title={item.isPublished ? "Shown on the website. Click to hide." : "Hidden. Click to show on the website."}
        >
          <span className={`a-dot${item.isPublished ? " a-dot--on" : ""}`} aria-hidden="true" />
          {item.isPublished ? "Shown" : "Hidden"}
        </button>
        <button
          type="button"
          className="a-iconbtn"
          aria-pressed={item.isFeatured}
          aria-label={item.isFeatured ? `Remove ${item.name} from featured` : `Feature ${item.name} on the home page`}
          title={item.isFeatured ? "Featured on the home page" : "Feature on the home page"}
          onClick={() => onQuick(item, { isFeatured: !item.isFeatured }, (p) => (p.isFeatured ? `${p.name} is featured` : `${p.name} is no longer featured`))}
        >
          <Icon name="star" size={17} fill={item.isFeatured ? "currentColor" : "none"} />
        </button>
        <a className="a-iconbtn" href={viewHref} target="_blank" rel="noopener noreferrer" aria-label={`View ${item.name} on the website`} title="View on the website">
          <Icon name="eye" size={17} />
        </a>
        <Link to={`/admin/products/${item.dbId}`} className="a-iconbtn" aria-label={`Edit ${item.name}`} title="Edit">
          <Icon name="pencil" size={17} />
        </Link>
        <button type="button" className="a-iconbtn a-iconbtn--danger" onClick={onDelete} aria-label={`Delete ${item.name}`} title="Delete">
          <Icon name="trash" size={17} />
        </button>
      </span>
    </li>
  );
}
