import { useRef } from "react";
import { Link } from "../../lib/router.jsx";
import { useSettings } from "../../context/SettingsContext.jsx";
import { useMotion } from "../../motion/MotionContext.jsx";
import { MOTION } from "../../motion/config.js";
import { productMessage, whatsappLink, mainWhatsapp } from "../../lib/contact.js";
import Icon from "../ui/Icon.jsx";
import { NoPhoto, Price, SoldStamp, StatusBadge, conditionLabel } from "./ProductBits.jsx";

export default function ProductCard({ product, index = 0 }) {
  const { settings } = useSettings();
  const { reduced } = useMotion();
  const ref = useRef(null);
  const sold = product.status === "sold";
  const href = `/product/${product.slug}`;
  const wa = sold ? "" : whatsappLink(mainWhatsapp(settings), productMessage(product));

  // Gentle 3D tilt and a light that follows the mouse (desktop only).
  const onMove = (e) => {
    if (reduced || e.pointerType !== "mouse") return;
    const el = ref.current;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
    el.style.setProperty("--rx", `${((0.5 - y) * MOTION.card.tilt).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${((x - 0.5) * MOTION.card.tilt).toFixed(2)}deg`);
  };
  const onLeave = () => {
    const el = ref.current;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };

  return (
    <article
      ref={ref}
      className={`pcard pcard--${product.status}`}
      style={{ "--i": index }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      data-pulse
    >
      <div className="pcard__frame">
        <Link to={href} className="pcard__media" tabIndex={-1} aria-hidden="true">
          {product.image ? (
            <img
              className="pcard__img"
              src={product.image.thumb || product.image.url}
              alt=""
              loading="lazy"
              decoding="async"
              width={product.image.width || undefined}
              height={product.image.height || undefined}
            />
          ) : (
            <NoPhoto icon={product.category?.icon} />
          )}
          {sold ? <SoldStamp /> : null}
          {!sold && product.specs?.length ? (
            <ul className="pcard__specs" role="list">
              {product.specs.map((s) => (
                <li key={s.key}>
                  <span>{s.key}</span> {s.value}
                </li>
              ))}
            </ul>
          ) : null}
        </Link>
        <div className="pcard__badges">
          <StatusBadge status={product.status} />
          {!sold && product.discountPct > 0 ? <span className="badge badge--discount">-{product.discountPct}%</span> : null}
        </div>

        <div className="pcard__body">
          <p className="pcard__meta">
            {product.category ? <span>{product.category.name}</span> : null}
            {product.brand ? <span>{product.brand}</span> : null}
          </p>
          <h3 className="pcard__title">
            <Link to={href}>{product.name}</Link>
          </h3>
          <p className="pcard__condition">{conditionLabel(product.condition, product.conditionLabel)} condition</p>
          <Price product={product} />
          <div className="pcard__actions">
            <Link to={href} className="btn btn--ghost btn--sm pcard__details">
              View details
            </Link>
            {wa ? (
              <a
                className="btn btn--whatsapp btn--sm pcard__wa"
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${product.status === "preorder" ? "Pre-order inquiry" : "Ask on WhatsApp"} about ${product.name}`}
              >
                <Icon name="whatsapp" size={17} />
                <span className="pcard__wa-text">{product.status === "preorder" ? "Pre-order" : "Ask"}</span>
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
