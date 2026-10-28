import { CONDITIONS, STATUSES } from "../../lib/constants.js";
import { taka } from "../../lib/format.js";
import { CategoryIcon } from "../ui/Icon.jsx";

export function StatusBadge({ status }) {
  const meta = STATUSES[status];
  if (!meta) return null;
  return <span className={`badge badge--${status}`}>{meta.label}</span>;
}

export function Price({ product, size = "md" }) {
  if (product.price === null || product.price === undefined) {
    return <p className={`price price--${size} price--ask`}>Contact for price</p>;
  }
  return (
    <p className={`price price--${size}`}>
      <span className="price__now num">{taka(product.price)}</span>
      {product.originalPrice && product.originalPrice > product.price ? (
        <s className="price__was num" aria-label={`was ${taka(product.originalPrice)}`}>
          {taka(product.originalPrice)}
        </s>
      ) : null}
    </p>
  );
}

export function conditionLabel(key, fallback) {
  return CONDITIONS[key]?.label || fallback || key;
}

/** Shown when a product has no photo yet. Never pretends to be a real photo. */
export function NoPhoto({ icon, large = false }) {
  return (
    <div className={`no-photo${large ? " no-photo--lg" : ""}`}>
      <CategoryIcon type={icon} size={large ? 64 : 40} strokeWidth={1.3} />
      <span>No photo yet</span>
    </div>
  );
}

export function SoldStamp({ large = false }) {
  return (
    <span className={`sold-stamp${large ? " sold-stamp--lg" : ""}`} aria-hidden="true">
      SOLD
    </span>
  );
}
