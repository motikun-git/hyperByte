import { useState } from "react";
import { Link, useSearchParams } from "../lib/router.jsx";
import { useApi } from "../lib/useApi.js";
import { usePageMeta } from "../lib/usePageMeta.js";
import { useSettings } from "../context/SettingsContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { CONDITIONS, STATUSES } from "../lib/constants.js";
import { dateShort, taka } from "../lib/format.js";
import { copyText } from "../lib/clipboard.js";
import { productDetails } from "../lib/contact.js";
import { Reveal, SectionHeading } from "../components/effects/Kinetic.jsx";
import Gallery from "../components/product/Gallery.jsx";
import InquiryButtons from "../components/product/InquiryButtons.jsx";
import ProductGrid from "../components/product/ProductGrid.jsx";
import { Price, StatusBadge } from "../components/product/ProductBits.jsx";
import Icon from "../components/ui/Icon.jsx";
import Modal from "../components/ui/Modal.jsx";
import { CollapsibleProse } from "../components/ui/Prose.jsx";
import NotFound from "./NotFound.jsx";

export default function ProductDetail({ slug }) {
  const { settings } = useSettings();
  const toast = useToast();
  const [params] = useSearchParams();
  const preview = params.get("preview") === "1";
  const { data, error, loading } = useApi(preview ? `/admin/preview/${encodeURIComponent(slug)}` : `/products/${encodeURIComponent(slug)}`);
  const p = data?.product;
  const [manualCopy, setManualCopy] = useState("");

  usePageMeta(
    p ? `${p.name} | ${settings.siteName}` : null,
    p ? `${p.price ? taka(p.price) : "Contact for price"}. ${STATUSES[p.status]?.label}. ${CONDITIONS[p.condition]?.label} condition. Product ID ${p.id}.` : undefined
  );

  if (error && (error.status === 404 || error.status === 401)) {
    return <NotFound title={preview ? "Log in to preview this product" : "This product is not available"} text="It may have been removed or hidden. Browse the products that are listed now." />;
  }
  if (error && !data) {
    return (
      <div className="container page">
        <p className="notice notice--error">
          <Icon name="alert" size={18} /> {error.message}
        </p>
      </div>
    );
  }
  if (loading && !p) {
    return (
      <div className="container page detail" aria-busy="true">
        <div className="detail__grid">
          <div className="skeleton" style={{ aspectRatio: "4 / 3" }} />
          <div className="stack">
            <div className="skeleton" style={{ height: 28, width: "40%" }} />
            <div className="skeleton" style={{ height: 52 }} />
            <div className="skeleton" style={{ height: 32, width: "50%" }} />
            <div className="skeleton" style={{ height: 120 }} />
          </div>
        </div>
      </div>
    );
  }

  const sold = p.status === "sold";
  const saving = p.originalPrice && p.price !== null && p.originalPrice > p.price ? p.originalPrice - p.price : 0;
  const condition = CONDITIONS[p.condition];
  const related = data.related || [];
  const url = `${window.location.origin}/product/${p.slug}`;

  const copyId = async () => {
    if (await copyText(p.id)) toast(`Product ID ${p.id} copied.`);
  };
  const copyDetails = async () => {
    const text = productDetails(p, settings, preview ? "" : url);
    if (await copyText(text)) toast("Product details copied. Paste them into WhatsApp or Messenger.");
    else setManualCopy(text);
  };
  const availabilityText = {
    sold: "This item has been sold. Ask us for something similar.",
    preorder: p.expectedAvailability ? `Not in stock yet. Expected: ${p.expectedAvailability}.` : "Not in stock yet. Message us to arrange a pre-order.",
    unavailable: "Not available right now. Ask us if it will be back.",
    available: "In stock now. Ask us to confirm before you visit.",
  }[p.status];

  return (
    <div className="container page detail">
      {preview ? (
        <p className="notice notice--warn">
          <Icon name="eye" size={18} />
          {p.isPublished ? "Admin preview. This product is published." : "Admin preview. This product is not published, so customers cannot see this page."}
        </p>
      ) : null}

      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/products">Products</Link>
        {p.category ? (
          <>
            <Icon name="chevronRight" size={14} />
            <Link to={`/products?category=${encodeURIComponent(p.category.slug)}`}>{p.category.name}</Link>
          </>
        ) : null}
        {p.category && p.subcategory ? (
          <>
            <Icon name="chevronRight" size={14} />
            <Link to={`/products?category=${encodeURIComponent(p.category.slug)}&sub=${encodeURIComponent(p.subcategory.slug)}`}>{p.subcategory.name}</Link>
          </>
        ) : null}
      </nav>

      <div className="detail__grid">
        <Gallery images={p.images || []} name={p.name} icon={p.category?.icon} sold={sold} />

        <div className="detail__info">
          <div className="row" style={{ "--gap": "8px" }}>
            <StatusBadge status={p.status} />
            {!sold && p.discountPct > 0 ? <span className="badge badge--discount">-{p.discountPct}%</span> : null}
            {p.isFeatured ? (
              <span className="badge">
                <Icon name="star" size={13} /> Featured
              </span>
            ) : null}
          </div>
          <h1 className="detail__title">{p.name}</h1>
          {p.brand || p.model ? <p className="muted">{[p.brand, p.model].filter(Boolean).join(" ")}</p> : null}

          <button type="button" className="detail__id" onClick={copyId} title="Copy product ID">
            Product ID <strong className="num">{p.id}</strong> <Icon name="copy" size={15} />
          </button>

          <div className="detail__price">
            <Price product={p} size="lg" />
            {saving ? <p className="detail__save">{taka(saving)} less than the original price</p> : null}
            {sold && p.soldAt ? <p className="faint small">Sold on {dateShort(p.soldAt)}</p> : null}
          </div>

          <dl className="detail__facts">
            <div>
              <dt>
                <Icon name="badgeCheck" size={18} /> Condition
              </dt>
              <dd>
                <strong>{condition?.label || p.conditionLabel}</strong>
                <span className="faint small">{p.conditionNote || condition?.hint}</span>
              </dd>
            </div>
            {p.warrantyInfo ? (
              <div>
                <dt>
                  <Icon name="shieldCheck" size={18} /> Warranty
                </dt>
                <dd>
                  <strong>{p.warrantyInfo}</strong>
                  <Link to="/warranty" className="link small">
                    How to check your warranty
                  </Link>
                </dd>
              </div>
            ) : null}
            <div>
              <dt>
                <Icon name="package" size={18} /> Availability
              </dt>
              <dd>
                <strong>{STATUSES[p.status]?.label}</strong>
                <span className="faint small">{availabilityText}</span>
              </dd>
            </div>
          </dl>

          <InquiryButtons product={p} />
          <div className="detail__tools">
            <button type="button" className="btn btn--ghost btn--sm" onClick={copyDetails}>
              <Icon name="clipboard" size={16} /> Copy product details
            </button>
            {p.status === "preorder" ? (
              <Link to="/pre-order" className="btn btn--ghost btn--sm">
                <Icon name="info" size={16} /> How pre-orders work
              </Link>
            ) : null}
          </div>
          <p className="faint small detail__note">
            A button only opens a chat. Price, availability and delivery are confirmed with us there.
          </p>
        </div>
      </div>

      {p.specs?.length ? (
        <Reveal as="section" className="detail__section" aria-labelledby="specs-title">
          <h2 id="specs-title" className="h3">
            Specifications
          </h2>
          <dl className="spec-table">
            {p.specs.map((s) => (
              <div key={`${s.key}-${s.value}`}>
                <dt>{s.key}</dt>
                <dd>{s.value}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      ) : null}

      {p.description?.trim() ? (
        <Reveal as="section" className="detail__section" aria-labelledby="desc-title">
          <h2 id="desc-title" className="h3">
            Description
          </h2>
          <CollapsibleProse text={p.description} />
        </Reveal>
      ) : null}

      {related.length ? (
        <section className="detail__section" aria-labelledby="related-title">
          <SectionHeading id="related-title" text={p.category ? `More ${p.category.name}` : "More products"} />
          <ProductGrid items={related} />
        </section>
      ) : null}

      {manualCopy ? (
        <Modal title="Copy product details" onClose={() => setManualCopy("")}>
          <p className="muted small" style={{ marginBottom: 10 }}>
            Your browser blocked automatic copying. Select the text below and copy it.
          </p>
          <textarea className="textarea copy-fallback" readOnly value={manualCopy} onFocus={(e) => e.target.select()} />
        </Modal>
      ) : null}
    </div>
  );
}
