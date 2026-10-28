import ProductCard from "./ProductCard.jsx";

export function CardSkeletons({ count = 4 }) {
  return Array.from({ length: count }, (_, i) => (
    <div key={i} className="pcard-skeleton" aria-hidden="true">
      <div className="skeleton pcard-skeleton__img" />
      <div className="skeleton pcard-skeleton__line" />
      <div className="skeleton pcard-skeleton__line pcard-skeleton__line--short" />
    </div>
  ));
}

/** Product cards in a responsive grid. `animKey` replays the entrance when it changes. */
export default function ProductGrid({ items, loading = false, skeletons = 4, animKey = "", className = "" }) {
  const empty = !loading && (!items || items.length === 0);
  if (empty) return null;
  return (
    <div className={`product-grid${loading && items?.length ? " is-loading" : ""} ${className}`} aria-busy={loading || undefined}>
      {!items?.length && loading ? (
        <CardSkeletons count={skeletons} />
      ) : (
        items.map((p, i) => <ProductCard key={`${animKey}-${p.id}`} product={p} index={i} />)
      )}
    </div>
  );
}
