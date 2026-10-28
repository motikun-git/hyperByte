import { useEffect, useState } from "react";
import { useSearchParams } from "../lib/router.jsx";
import { useApi } from "../lib/useApi.js";
import { api, qs } from "../lib/api.js";
import { CONDITIONS, SORTS } from "../lib/constants.js";
import { usePageMeta } from "../lib/usePageMeta.js";
import { useSettings } from "../context/SettingsContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { useMotion } from "../motion/MotionContext.jsx";
import { generalMessage, whatsappLink, mainWhatsapp } from "../lib/contact.js";
import { SectionHeading } from "../components/effects/Kinetic.jsx";
import CategorySelector from "../components/product/CategorySelector.jsx";
import ProductGrid from "../components/product/ProductGrid.jsx";
import RecentlySold from "../components/product/RecentlySold.jsx";
import Icon from "../components/ui/Icon.jsx";
import { plural, taka } from "../lib/format.js";

const PAGE = 24;
// With no availability filter the list shows everything that can still be bought.
// Sold items get their own row underneath (and the "Sold out" filter).
const FOR_SALE = "available,preorder";

export default function Products() {
  const { settings } = useSettings();
  const toast = useToast();
  const { reduced } = useMotion();
  const [params, setParams] = useSearchParams();
  const category = params.get("category") || "";
  const sub = params.get("sub") || "";
  const status = params.get("status") || "";
  const q = params.get("q") || "";
  const sort = params.get("sort") || "newest";
  const condition = params.get("condition") || "";
  const min = params.get("min") || "";
  const max = params.get("max") || "";

  const [search, setSearch] = useState(q);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priceDraft, setPriceDraft] = useState({ min, max });
  const [more, setMore] = useState({ key: "", page: 1, items: [], loading: false });

  const filterKey = [category, sub, status, q, sort, condition, min, max].join("|");
  useEffect(() => setSearch(q), [q]);
  useEffect(() => setPriceDraft({ min, max }), [min, max]);

  const update = (changes) =>
    setParams((p) => {
      for (const [k, v] of Object.entries(changes)) {
        if (v === "" || v === null || v === undefined) p.delete(k);
        else p.set(k, v);
      }
      return p;
    });

  // Search as you type (after a short pause).
  useEffect(() => {
    if (search === q) return undefined;
    const id = window.setTimeout(() => update({ q: search.trim() }), 350);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const apiSort = sort === "newest" ? (status === "sold" ? "recently_sold" : "") : sort;
  const query = { category, sub, status: status || FOR_SALE, q, sort: apiSort, condition, min, max, limit: PAGE };
  const list = useApi(`/products${qs(query)}`);
  const cats = useApi("/categories");
  const showSoldRow = settings.showSoldProducts && status !== "sold";
  const sold = useApi(showSoldRow ? `/products${qs({ status: "sold", category, sub, q, sort: "recently_sold", limit: 4 })}` : null);

  const categories = cats.data?.categories || [];
  const current = categories.find((c) => c.slug === category);
  const currentSub = current?.children?.find((c) => c.slug === sub);
  // Subcategories that have something to show (the selected one always stays).
  const subs = (current?.children || []).filter((c) => c.total > 0 || c.slug === sub);
  const conditions = condition ? condition.split(",") : [];
  const activeCount = [status, condition, min, max].filter(Boolean).length;
  const data = list.data;
  const range = data?.priceRange;

  // "Show more" appends the next pages to the first one.
  const extra = more.key === filterKey ? more.items : [];
  const items = data?.items ? dedupe([...data.items, ...extra]) : [];
  const loadMore = async () => {
    const page = (more.key === filterKey ? more.page : 1) + 1;
    setMore((m) => ({ ...(m.key === filterKey ? m : { key: filterKey, page: 1, items: [] }), loading: true }));
    try {
      const res = await api(`/products${qs({ ...query, page })}`);
      setMore((m) => ({ key: filterKey, page, items: [...(m.key === filterKey ? m.items : []), ...res.items], loading: false }));
    } catch (err) {
      setMore((m) => ({ ...m, loading: false }));
      toast(err.message, "error");
    }
  };

  usePageMeta(
    `${currentSub ? `${currentSub.name} | ` : current ? `${current.name} | ` : ""}Products | ${settings.siteName}`,
    `Browse ${current ? current.name : "second-hand PC parts and laptops"} at ${settings.siteName}: real photos, condition and full specs.`
  );

  const statusOptions = [
    ["", "For sale"],
    ["available", "Available now"],
    ["preorder", "Pre-order"],
    ...(settings.showSoldProducts ? [["sold", "Sold out"]] : []),
  ];

  const toggleCondition = (key) => {
    const next = conditions.includes(key) ? conditions.filter((c) => c !== key) : [...conditions, key];
    update({ condition: next.join(",") });
  };

  const applyPrice = () => {
    const next = { min: priceDraft.min.replace(/\D/g, ""), max: priceDraft.max.replace(/\D/g, "") };
    if (next.min !== min || next.max !== max) update(next);
  };
  const clearAll = () => {
    setSearch("");
    setParams({});
  };
  const wa = whatsappLink(mainWhatsapp(settings), generalMessage);

  const countFor = (c) => {
    if (status === "available") return c.available;
    if (status === "preorder") return c.preorder;
    if (status === "sold") return Math.max(0, c.total - c.available - c.preorder);
    return c.available + c.preorder;
  };

  const resultsText = () => {
    if (!data) return list.loading ? "Loading products..." : "";
    if (!data.total) return "";
    const noun = status === "sold" ? "sold item" : status === "preorder" ? "pre-order item" : "product";
    return `${plural(data.total, noun)}${q ? ` for "${q}"` : ""}`;
  };

  return (
    <div className="container page products-page">
      <header className="page-head">
        <SectionHeading
          as="h1"
          text={status === "sold" ? `Sold${current ? `: ${current.name}` : " items"}` : currentSub ? currentSub.name : current ? current.name : status === "preorder" ? "Pre-order" : status === "available" ? "Available now" : "Products"}
        />
        <p className="lede">
          {status === "sold"
            ? "Items that already found new owners. Ask us if you want something similar."
            : status === "preorder" && !current
              ? "Not in stock yet, but we can try to get these for you. Send a pre-order inquiry; nothing is confirmed until you agree."
              : current?.description || "Every listing shows the real item: photos, condition, specs and price."}
        </p>
      </header>

      <div className="products-toolbar">
        <label className="searchbox">
          <Icon name="search" size={18} />
          <span className="sr-only">Search products</span>
          <input
            type="search"
            className="searchbox__input"
            placeholder="Search by name, model or spec"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") update({ q: search.trim() });
            }}
          />
        </label>
        <label className="sort">
          <span className="sr-only">Sort</span>
          <select className="select" value={sort} onChange={(e) => update({ sort: e.target.value === "newest" ? "" : e.target.value })}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.value === "newest" && status === "sold" ? "Recently sold" : s.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn--ghost filters-toggle" aria-expanded={filtersOpen} aria-controls="product-filters" onClick={() => setFiltersOpen((o) => !o)}>
          <Icon name="sliders" size={18} /> Filters{activeCount ? ` (${activeCount})` : ""}
        </button>
      </div>

      {categories.length ? <CategorySelector categories={categories} value={category} onChange={(slug) => update({ category: slug, sub: "" })} count={countFor} hide={(c) => c.total === 0} /> : null}
      {subs.length ? (
        <div className="subcat-row" role="group" aria-label={`${current.name} subcategories`}>
          <button type="button" className="chip" aria-pressed={!sub} onClick={() => update({ sub: "" })}>
            All {current.name}
          </button>
          {subs.map((c) => (
            <button key={c.slug} type="button" className="chip" aria-pressed={sub === c.slug} onClick={() => update({ sub: c.slug })}>
              {c.name}
              <span className="faint num">{countFor(c)}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div id="product-filters" className={`filters panel${filtersOpen ? " is-open" : ""}`}>
        <div className="filters__group">
          <span className="filters__label">Availability</span>
          <div className="row" style={{ "--gap": "8px" }}>
            {statusOptions.map(([value, label]) => (
              <button key={value || "all"} type="button" className="chip" aria-pressed={status === value} onClick={() => update({ status: value })}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="filters__group">
          <span className="filters__label">Condition</span>
          <div className="row" style={{ "--gap": "8px" }}>
            {Object.entries(CONDITIONS).map(([key, c]) => (
              <button key={key} type="button" className="chip" aria-pressed={conditions.includes(key)} onClick={() => toggleCondition(key)} title={c.hint}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="filters__group">
          <span className="filters__label">Price (taka)</span>
          <form
            className="price-range"
            onSubmit={(e) => {
              e.preventDefault();
              applyPrice();
            }}
          >
            <input
              className="input"
              inputMode="numeric"
              placeholder={range ? taka(range.min) : "Min"}
              aria-label="Minimum price"
              value={priceDraft.min}
              onChange={(e) => setPriceDraft((d) => ({ ...d, min: e.target.value }))}
              onBlur={applyPrice}
            />
            <span className="faint">to</span>
            <input
              className="input"
              inputMode="numeric"
              placeholder={range ? taka(range.max) : "Max"}
              aria-label="Maximum price"
              value={priceDraft.max}
              onChange={(e) => setPriceDraft((d) => ({ ...d, max: e.target.value }))}
              onBlur={applyPrice}
            />
            <button type="submit" className="btn btn--ghost btn--sm">
              Apply
            </button>
          </form>
        </div>
        {activeCount || q || category ? (
          <button type="button" className="text-btn filters__clear" onClick={clearAll}>
            Clear all filters
          </button>
        ) : null}
      </div>

      <p className="results-count faint small" aria-live="polite">
        {resultsText()}
      </p>

      {list.error && !data ? (
        <p className="notice notice--error">
          <Icon name="alert" size={18} /> {list.error.message}
        </p>
      ) : list.loading && !data ? (
        <ProductGrid items={[]} loading skeletons={8} />
      ) : items.length ? (
        <>
          <ProductGrid items={items} loading={list.loading} animKey={filterKey} />
          {items.length < data.total ? (
            <div className="more">
              <button type="button" className="btn btn--ghost" onClick={loadMore} disabled={more.loading || list.loading}>
                {more.loading ? <span className="spinner" /> : <Icon name="plus" size={18} />}
                Show more ({data.total - items.length} left)
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="empty">
          <Icon name="search" size={32} strokeWidth={1.5} />
          <p className="empty__title">{activeCount || q ? "No products match these filters" : `Nothing for sale${current ? ` in ${current.name}` : ""} right now`}</p>
          <p className="muted small">
            {activeCount || q ? "Try fewer filters, or ask us. We may have it coming in soon." : "New stock comes in regularly. Ask us what you are looking for."}
          </p>
          <div className="row" style={{ "--gap": "10px", justifyContent: "center" }}>
            {activeCount || q || category ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={clearAll}>
                Clear filters
              </button>
            ) : null}
            {wa ? (
              <a className="btn btn--whatsapp btn--sm" href={wa} target="_blank" rel="noopener noreferrer">
                <Icon name="whatsapp" size={17} /> Ask on WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      )}

      {showSoldRow ? (
        <RecentlySold
          items={sold.data?.items}
          categoryName={current?.name}
          title={q ? `Sold recently: matches for "${q}"` : undefined}
          action={
            sold.data?.total > (sold.data?.items?.length || 0) ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  update({ status: "sold", sort: "" });
                  window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
                }}
              >
                See all {sold.data.total} sold
              </button>
            ) : null
          }
        />
      ) : null}
    </div>
  );
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}
