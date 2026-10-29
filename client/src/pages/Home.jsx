import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "../lib/router.jsx";
import { useApi } from "../lib/useApi.js";
import { qs } from "../lib/api.js";
import { usePageMeta } from "../lib/usePageMeta.js";
import { useSettings } from "../context/SettingsContext.jsx";
import { useMotion } from "../motion/MotionContext.jsx";
import { facebookChat, generalMessage, mapLink, whatsappLink, mainWhatsapp } from "../lib/contact.js";
import HeroScene from "../components/effects/HeroScene.jsx";
import { BigWord, Reveal, RotatingText, SectionHeading, Separator, SplitChars } from "../components/effects/Kinetic.jsx";
import CategorySelector from "../components/product/CategorySelector.jsx";
import ProductCard from "../components/product/ProductCard.jsx";
import ProductGrid from "../components/product/ProductGrid.jsx";
import RecentlySold from "../components/product/RecentlySold.jsx";
import { StatusBadge } from "../components/product/ProductBits.jsx";
import Icon, { CategoryIcon } from "../components/ui/Icon.jsx";
import { taka, timeAgo } from "../lib/format.js";

export default function Home({ ready }) {
  const { settings } = useSettings();
  const home = useApi("/home");
  usePageMeta(`${settings.siteName} | ${settings.tagline}`, settings.metaDescription);
  const data = home.data;

  return (
    <>
      <Hero ready={ready} counts={data?.counts} />
      <PreorderPromo />
      <Featured items={data?.featured} gpus={data?.gpus} />
      <Recent items={data?.recent} />
      <Available data={data} loading={home.loading} failed={Boolean(home.error && !data)} />
      {data?.preorder?.length ? <Preorder items={data.preorder} /> : null}
      <BrowseCategories categories={data?.categories} />
      <CustomBuild />
      <WarrantyTeaser />
      <Separator />
      <Why />
      <Contact />
    </>
  );
}

// ------------------------------------------------------------------ hero

function Hero({ ready, counts }) {
  const { settings } = useSettings();
  const wa = whatsappLink(mainWhatsapp(settings), generalMessage);
  return (
    <section className={`hero${ready ? " is-ready" : ""}`} aria-labelledby="hero-title">
      <HeroScene />
      <div className="container hero__inner">
        <div className="hero__copy">
          <h1 id="hero-title" className="display hero__title">
            <SplitChars text={settings.heroTitle} play={ready} baseDelay={80} />
          </h1>
          {settings.heroPhrases?.length ? (
            <p className="hero__phrase hero__fade">
              <RotatingText items={settings.heroPhrases} />
            </p>
          ) : null}
          <p className="hero__text hero__fade">{settings.heroText}</p>
          <div className="hero__actions hero__fade">
            <Link to="/products?status=available" className="btn btn--primary btn--lg" data-pulse>
              Browse available products <Icon name="arrowRight" size={18} className="icon-arrow" />
            </Link>
            <Link to="/pre-order" className="btn btn--glass btn--lg" data-pulse>
              Pre-order a part
            </Link>
            {wa ? (
              <a href={wa} className="btn btn--whatsapp btn--lg" target="_blank" rel="noopener noreferrer" data-pulse>
                <Icon name="whatsapp" size={19} /> Ask on WhatsApp
              </a>
            ) : null}
          </div>
          {counts && counts.available + counts.preorder > 0 ? (
            <ul className="hero__stats hero__fade" role="list">
              <li>
                <strong className="num">{counts.available}</strong> available now
              </li>
              {counts.preorder > 0 ? (
                <li>
                  <strong className="num">{counts.preorder}</strong> on pre-order
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      </div>
      <BigWord className="hero__bigword">Hardware</BigWord>
      <a className="hero__scroll" href="#available" aria-label="Scroll to the products">
        <span />
      </a>
    </section>
  );
}

// ------------------------------------------------------------------ pre-order (main offer)

const PROMO_PARTS = [
  ["ram", "RAM"],
  ["cpu", "CPU"],
  ["gpu", "GPU"],
  ["fan", "Cooler"],
  ["psu", "PSU"],
  ["motherboard", "Mother\u00ADboard"],
  ["laptop", "Laptop"],
  ["other", "Others"],
];

function PreorderPromo() {
  return (
    <section className="section section--promo" aria-labelledby="promo-title">
      <div className="container">
        <Reveal className="pre-promo">
          <div className="pre-promo__copy">
            <SectionHeading id="promo-title" text="Pre-order any part, pre-owned or new" />
            <p className="muted">
              Not in stock? List the parts you want, choose pre-owned or new for each, and send the ready message to us on Facebook or WhatsApp.
            </p>
            <Link to="/pre-order" className="btn btn--primary btn--lg" data-pulse>
              Start a pre-order <Icon name="arrowRight" size={18} className="icon-arrow" />
            </Link>
          </div>
          <ul className="pre-promo__parts" role="list" aria-label="Parts you can pre-order">
            {PROMO_PARTS.map(([icon, label]) => (
              <li key={label}>
                <Link to="/pre-order">
                  <CategoryIcon type={icon} size={22} strokeWidth={1.6} />
                  <span>{label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ featured

function Featured({ items, gpus }) {
  const row = useRef(null);
  const { reduced } = useMotion();
  // Featured items (graphics cards first). Without any, the newest graphics cards.
  const list = items?.length ? items : gpus || [];
  if (!list.length) return null;
  const allGpus = list.every((p) => p.category?.slug === "gpu");
  const title = items?.length ? (allGpus ? "Featured GPUs" : "Featured hardware") : "Graphics cards";
  const scroll = (dir) => row.current?.scrollBy({ left: dir * row.current.clientWidth * 0.85, behavior: reduced ? "auto" : "smooth" });
  return (
    <section className="section" aria-labelledby="featured-title">
      <div className="container">
        <div className="section-head">
          <SectionHeading id="featured-title" text={title} />
          {list.length > 3 ? (
            <div className="row showcase-nav" style={{ "--gap": "8px" }}>
              <button type="button" className="icon-btn" onClick={() => scroll(-1)} aria-label="Show previous featured products">
                <Icon name="chevronLeft" />
              </button>
              <button type="button" className="icon-btn" onClick={() => scroll(1)} aria-label="Show more featured products">
                <Icon name="chevronRight" />
              </button>
            </div>
          ) : null}
        </div>
        <div className="showcase" ref={row}>
          {list.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ available now (+ recently sold)

function Available({ data, loading, failed }) {
  const { settings } = useSettings();
  const [category, setCategory] = useState("");
  const available = useApi(category ? `/products${qs({ status: "available", category, limit: 8 })}` : null);
  const sold = useApi(category && settings.showSoldProducts ? `/products${qs({ status: "sold", category, sort: "recently_sold", limit: 4 })}` : null);

  const categories = data?.categories || [];
  const current = categories.find((c) => c.slug === category);
  const items = category ? available.data?.items : data?.available?.slice(0, 8);
  const soldItems = category ? sold.data?.items : data?.sold?.slice(0, 4);
  const total = category ? available.data?.total : data?.counts?.available;
  const busy = category ? available.loading && !available.data : loading && !data;

  return (
    <section id="available" className="section" aria-labelledby="available-title">
      <div className="container">
        <div className="section-head">
          <div className="stack" style={{ "--gap": "10px" }}>
            <SectionHeading id="available-title" text="Available now" />
            <p className="lede">
              Checked, photographed and ready to go:{" "}
              <RotatingText className="keyword" items={["GPUs", "CPUs", "Gaming laptops", "PC components"]} />
            </p>
          </div>
          <Link className="btn btn--ghost" to={`/products${qs({ status: "available", category })}`}>
            View all{total ? ` ${total}` : ""} <Icon name="arrowRight" size={17} />
          </Link>
        </div>

        {categories.length ? (
          <CategorySelector categories={categories} value={category} onChange={setCategory} count={(c) => c.available} total={data?.counts?.available} hide={(c) => c.available === 0} />
        ) : null}

        {failed ? (
          <p className="notice notice--error">
            <Icon name="alert" size={18} /> Products could not be loaded. Please refresh the page.
          </p>
        ) : busy ? (
          <ProductGrid items={[]} loading skeletons={4} />
        ) : items?.length ? (
          <ProductGrid items={items} loading={category ? available.loading : false} animKey={category || "all"} />
        ) : (
          <EmptyStock category={current} />
        )}

        {settings.showSoldProducts ? <RecentlySold items={soldItems} categoryName={current?.name} /> : null}
      </div>
    </section>
  );
}

function EmptyStock({ category }) {
  const { settings } = useSettings();
  const wa = whatsappLink(mainWhatsapp(settings), `Hello hyperByte, I am looking for ${category ? `a ${category.name}` : "a PC part"}. What do you have?`);
  return (
    <div className="empty">
      <Icon name="package" size={34} strokeWidth={1.5} />
      <p className="empty__title">{category ? `No ${category.name} available right now` : "New stock is being listed"}</p>
      <p className="muted small">New parts arrive regularly. Tell us what you need and we will let you know when it comes in.</p>
      {wa ? (
        <a className="btn btn--whatsapp btn--sm" href={wa} target="_blank" rel="noopener noreferrer">
          <Icon name="whatsapp" size={17} /> Ask on WhatsApp
        </a>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ pre-order and recent

function Preorder({ items }) {
  return (
    <section className="section section--preorder" aria-labelledby="preorder-title">
      <div className="container">
        <div className="section-head">
          <div className="stack" style={{ "--gap": "10px" }}>
            <SectionHeading id="preorder-title" text="Pre-order" />
            <p className="lede">Not in stock yet, but we can get these for you. Message us to discuss the price and timing.</p>
          </div>
          <Link className="btn btn--ghost" to="/pre-order">
            Pre-order something else <Icon name="arrowRight" size={17} />
          </Link>
        </div>
        <ProductGrid items={items} />
      </div>
    </section>
  );
}

/** The newest listings as a compact, time-stamped list (the big cards are above). */
function Recent({ items }) {
  if (!items?.length) return null;
  return (
    <section className="section" aria-labelledby="recent-title">
      <div className="container">
        <div className="section-head">
          <SectionHeading id="recent-title" text="Recently added" />
          <Link className="btn btn--ghost" to="/products">
            Browse everything <Icon name="arrowRight" size={17} />
          </Link>
        </div>
        <ol className="arrivals" role="list">
          {items.map((p) => (
            <li key={p.id} className="arrival">
              <Link to={`/product/${p.slug}`} className="arrival__link" data-pulse>
                <span className="arrival__thumb">
                  {p.image ? (
                    <img src={p.image.thumb || p.image.url} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <CategoryIcon type={p.category?.icon} size={26} strokeWidth={1.4} />
                  )}
                </span>
                <span className="arrival__body">
                  <span className="arrival__name">{p.name}</span>
                  <span className="arrival__meta">
                    <StatusBadge status={p.status} />
                    {p.category ? <span>{p.category.name}</span> : null}
                    {p.publishedAt ? <span>Added {timeAgo(p.publishedAt)}</span> : null}
                  </span>
                </span>
                <span className={`arrival__price num${p.price === null || p.price === undefined ? " arrival__price--ask" : ""}`}>
                  {p.price === null || p.price === undefined ? "Contact for price" : taka(p.price)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ browse by category

function BrowseCategories({ categories }) {
  const strip = useRef(null);
  const { reduced } = useMotion();
  const paused = useRef(false);

  // Every 3 seconds the row moves one tile to the left (and starts again at the end).
  // It stops while the visitor touches, hovers or focuses it, and when motion is off.
  useEffect(() => {
    const el = strip.current;
    if (!el || reduced) return undefined;
    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(el);
    const timer = window.setInterval(() => {
      if (paused.current || !visible || document.hidden) return;
      const tile = el.querySelector(".ctile");
      if (!tile) return;
      const step = tile.getBoundingClientRect().width + parseFloat(getComputedStyle(el).columnGap || "10");
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      el.scrollTo({ left: atEnd ? 0 : el.scrollLeft + step, behavior: "smooth" });
    }, 3000);
    return () => {
      window.clearInterval(timer);
      io.disconnect();
    };
  }, [reduced, categories]);

  if (!categories?.length) return null;
  const hold = () => {
    paused.current = true;
  };
  const release = () => {
    paused.current = false;
  };
  return (
    <section className="section" aria-labelledby="browse-title">
      <div className="container">
        <div className="section-head">
          <SectionHeading id="browse-title" text="Browse by category" />
          <Link className="btn btn--ghost" to="/products">
            All products <Icon name="arrowRight" size={17} />
          </Link>
        </div>
        <ul
          ref={strip}
          className="cat-strip"
          role="list"
          onPointerEnter={hold}
          onPointerLeave={release}
          onTouchStart={hold}
          onTouchEnd={() => window.setTimeout(release, 4000)}
          onFocus={hold}
          onBlur={release}
        >
          {categories.map((c) => {
            const n = c.available + c.preorder;
            return (
              <li key={c.slug} className="ctile">
                <Link to={`/products?category=${encodeURIComponent(c.slug)}`} data-pulse>
                  <span className="ctile__icon">
                    <CategoryIcon type={c.icon} size={22} strokeWidth={1.6} />
                  </span>
                  <span className="ctile__name" lang="en">
                    {c.name}
                  </span>
                  {n ? <span className="ctile__count num">{n} for sale</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ custom PC build

function CustomBuild() {
  const { settings } = useSettings();
  const wa = whatsappLink(mainWhatsapp(settings), settings.customBuildMessage);
  return (
    <section className="section" aria-labelledby="build-title">
      <div className="container">
        <Reveal className="build-teaser">
          <div className="build-teaser__copy">
            <SectionHeading id="build-title" text="Build your PC with us" />
            <p className="muted">
              Choose your components, pre-owned or new, add your budget and send the list to us. Custom builds are available for AM5 or DDR5 builds only.
            </p>
          </div>
          <div className="build-teaser__actions">
            {wa ? (
              <a className="btn btn--whatsapp btn--lg" href={wa} target="_blank" rel="noopener noreferrer" data-pulse>
                <Icon name="whatsapp" size={20} /> Discuss on WhatsApp
              </a>
            ) : null}
            <Link to="/custom-pc" className="btn btn--ghost btn--lg" data-pulse>
              Plan your build <Icon name="arrowRight" size={18} />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ why hyperByte

const REASONS = [
  { icon: "clipboardCheck", title: "Checked before listing", text: "We test parts before they go online and write down what was checked." },
  { icon: "eye", title: "Honest condition", text: "Every listing has a condition grade and notes about marks or wear." },
  { icon: "sliders", title: "Clear specifications", text: "Model, specs and real photos of the actual item, not catalogue pictures." },
  { icon: "shieldCheck", title: "Warranty you can check", text: "When a part has warranty, you get a code to see the time left on this site." },
  { icon: "messageCircle", title: "Talk to the seller", text: "Ask anything on WhatsApp or Facebook before you decide. No forms, no bots." },
];

function Why() {
  return (
    <section className="section section--why" aria-labelledby="why-title">
      <BigWord className="why__bigword" speed={0.18}>
        Performance
      </BigWord>
      <div className="container why">
        <div className="why__intro">
          <SectionHeading id="why-title" text="Why hyperByte" />
          <p className="lede">Buying used hardware should not feel like a gamble. This is how we keep it simple and honest.</p>
        </div>
        <ul className="why-list" role="list">
          {REASONS.map((r, i) => (
            <Reveal as="li" key={r.title} className="why-item" delay={i * 70}>
              <span className="why-item__icon">
                <Icon name={r.icon} size={22} strokeWidth={1.7} />
              </span>
              <div>
                <h3 className="why-item__title">{r.title}</h3>
                <p className="muted">{r.text}</p>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ warranty teaser

function WarrantyTeaser() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  return (
    <section className="section" aria-labelledby="warranty-title">
      <div className="container">
        <Reveal className="warranty-teaser panel">
          <div className="warranty-teaser__copy">
            <SectionHeading id="warranty-title" text="Check your warranty" />
            <p className="muted">Bought from us with warranty? Enter the code from your receipt to see how much time is left, down to the hour.</p>
          </div>
          <form
            className="warranty-teaser__form"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/warranty${qs({ code: code.trim() })}`);
            }}
          >
            <label className="sr-only" htmlFor="home-warranty-code">
              Warranty code
            </label>
            <input
              id="home-warranty-code"
              className="input"
              placeholder="HBW-XXXX-XXXX"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck="false"
            />
            <button type="submit" className="btn btn--primary" data-pulse>
              <Icon name="shieldCheck" size={18} /> Check warranty
            </button>
          </form>
        </Reveal>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ contact

function Contact() {
  const { settings } = useSettings();
  const wa = whatsappLink(mainWhatsapp(settings), generalMessage);
  const fb = facebookChat(settings);
  const map = mapLink(settings);
  return (
    <section id="contact" className="section section--contact" aria-labelledby="contact-title">
      <div className="container contact">
        <div className="contact__copy">
          <SectionHeading id="contact-title" text="Ask before you buy" />
          <p className="lede">Message us about any product, price or pre-order. We answer on WhatsApp and Facebook, and you can see the item before paying.</p>
          <div className="contact__buttons">
            {wa ? (
              <a className="btn btn--whatsapp btn--lg" href={wa} target="_blank" rel="noopener noreferrer" data-pulse>
                <Icon name="whatsapp" size={20} /> Chat on WhatsApp
              </a>
            ) : null}
            {fb ? (
              <a className="btn btn--facebook btn--lg" href={fb} target="_blank" rel="noopener noreferrer" data-pulse>
                <Icon name="facebook" size={20} /> Message on Facebook
              </a>
            ) : null}
            {!wa && !fb ? <p className="faint small">Contact links will appear here soon.</p> : null}
          </div>
        </div>
        <Reveal className="contact__card panel">
          <div className="contact__line">
            <Icon name="mapPin" size={20} />
            <div>
              <p className="contact__label">Location</p>
              <p>{settings.address}</p>
              {map ? (
                <a className="link small" href={map} target="_blank" rel="noopener noreferrer">
                  Open in Google Maps
                </a>
              ) : null}
            </div>
          </div>
          {settings.hours ? (
            <div className="contact__line">
              <Icon name="clock" size={20} />
              <div>
                <p className="contact__label">Hours</p>
                <p>{settings.hours}</p>
              </div>
            </div>
          ) : null}
          {settings.phone ? (
            <div className="contact__line">
              <Icon name="phone" size={20} />
              <div>
                <p className="contact__label">Phone</p>
                <a href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`}>{settings.phone}</a>
              </div>
            </div>
          ) : null}
          {settings.facebookUrl ? (
            <div className="contact__line">
              <Icon name="facebook" size={20} />
              <div>
                <p className="contact__label">Facebook Page</p>
                <a href={settings.facebookUrl} target="_blank" rel="noopener noreferrer">
                  Follow for new stock
                </a>
              </div>
            </div>
          ) : null}
        </Reveal>
      </div>
    </section>
  );
}
