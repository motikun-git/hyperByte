import ProductCard from "./ProductCard.jsx";

/** A row of recently sold items, so visitors see that stock moves regularly. */
export default function RecentlySold({ items, categoryName, title, action = null }) {
  if (!items?.length) return null;
  const heading = title || `Recently sold${categoryName ? ` in ${categoryName}` : ""}`;
  return (
    <section className="recent-sold" aria-label={heading}>
      <div className="recent-sold__head">
        <div className="recent-sold__copy">
          <h3 className="h3">{heading}</h3>
          <p className="faint small">These found new owners. New stock comes in regularly, so ask us if you want something similar.</p>
        </div>
        {action}
      </div>
      <div className="recent-sold__row">
        {items.map((p, i) => (
          <ProductCard key={p.id} product={p} index={i} />
        ))}
      </div>
    </section>
  );
}
