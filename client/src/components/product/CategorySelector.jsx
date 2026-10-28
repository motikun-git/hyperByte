import Icon, { CategoryIcon } from "../ui/Icon.jsx";

/**
 * Category picker used on the home page and the products page. Shows how
 * many products each category has (available + pre-order by default).
 */
export default function CategorySelector({ categories, value, onChange, label = "Categories", count = (c) => c.available + c.preorder, total, hide = null }) {
  // Categories with nothing to show are left out (the one selected always stays).
  const shown = hide ? categories.filter((c) => c.slug === value || !hide(c)) : categories;
  return (
    <div className="cat-select" role="group" aria-label={label}>
      <button type="button" className={`cat-tile${!value ? " is-active" : ""}`} aria-pressed={!value} onClick={() => onChange("")} data-pulse>
        <span className="cat-tile__orbit">
          <Icon name="boxes" size={22} strokeWidth={1.6} />
        </span>
        <span className="cat-tile__name">All</span>
        {total !== undefined ? <span className="cat-tile__count num">{total}</span> : null}
      </button>
      {shown.map((c) => {
        const n = count(c);
        return (
          <button
            key={c.slug}
            type="button"
            className={`cat-tile${value === c.slug ? " is-active" : ""}`}
            aria-pressed={value === c.slug}
            onClick={() => onChange(c.slug)}
            data-pulse
          >
            <span className="cat-tile__orbit">
              <CategoryIcon type={c.icon} size={22} strokeWidth={1.6} />
            </span>
            <span className="cat-tile__name">{c.name}</span>
            <span className="cat-tile__count num" aria-label={`${n} products`}>
              {n}
            </span>
          </button>
        );
      })}
    </div>
  );
}
