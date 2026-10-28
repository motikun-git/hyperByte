import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "../../lib/router.jsx";
import { useSettings } from "../../context/SettingsContext.jsx";
import { useApi } from "../../lib/useApi.js";
import { facebookChat, generalMessage, whatsappLink, mainWhatsapp } from "../../lib/contact.js";
import Icon, { CategoryIcon } from "../ui/Icon.jsx";
import Logo from "./Logo.jsx";
import MotionToggle from "./MotionToggle.jsx";

const TOP_LINKS = [
  { to: "/products", label: "Products" },
  { to: "/pre-order", label: "Pre-order" },
  { to: "/warranty", label: "Warranty check" },
  { to: "/#contact", label: "Contact" },
];

export default function Header() {
  const { settings } = useSettings();
  const { pathname, search } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname, search]);

  const wa = whatsappLink(mainWhatsapp(settings), generalMessage);
  const fb = facebookChat(settings);
  const isPreorder = false;

  return (
    <>
      <header className={`site-header${scrolled || open ? " is-solid" : ""}`}>
        <div className="container site-header__inner">
          <button
            ref={buttonRef}
            type="button"
            className="icon-btn menu-btn"
            aria-expanded={open}
            aria-controls="site-drawer"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            <Icon name={open ? "x" : "menu"} />
          </button>
          <Link to="/" className="brand" aria-label={`${settings.siteName} home`}>
            <Logo />
          </Link>

          <nav className="site-nav" aria-label="Main">
            {TOP_LINKS.map((l) =>
              l.to.includes("#") ? (
                <Link key={l.to} to={l.to} className="site-nav__link">
                  {l.label}
                </Link>
              ) : l.match === "preorder" ? (
                <Link key={l.to} to={l.to} className={`site-nav__link${isPreorder ? " is-active" : ""}`} aria-current={isPreorder ? "page" : undefined}>
                  {l.label}
                </Link>
              ) : (
                <NavLink key={l.to} to={l.to} className={({ isActive }) => `site-nav__link${isActive && !(l.to === "/products" && isPreorder) ? " is-active" : ""}`}>
                  {l.label}
                </NavLink>
              )
            )}
          </nav>

          <div className="site-header__actions">
            {fb ? (
              <a className="icon-btn hide-mobile" href={fb} target="_blank" rel="noopener noreferrer" aria-label="HyperByte on Facebook" data-pulse>
                <Icon name="facebook" size={18} />
              </a>
            ) : null}
            {settings.instagramUrl ? (
              <a className="icon-btn hide-mobile" href={settings.instagramUrl} target="_blank" rel="noopener noreferrer" aria-label="HyperByte on Instagram" data-pulse>
                <Icon name="instagram" size={17} />
              </a>
            ) : null}
            {wa ? (
              <a className="btn btn--whatsapp btn--sm header-wa" href={wa} target="_blank" rel="noopener noreferrer" data-pulse>
                <Icon name="whatsapp" size={18} />
                <span className="header-wa__text">WhatsApp</span>
              </a>
            ) : null}
          </div>
        </div>
      </header>
      <Drawer open={open} onClose={() => setOpen(false)} returnFocus={buttonRef} />
    </>
  );
}

/** The side menu (left), on every screen size. */
function Drawer({ open, onClose, returnFocus }) {
  const { settings } = useSettings();
  const panelRef = useRef(null);
  const [expanded, setExpanded] = useState(null);
  const [catsOpen, setCatsOpen] = useState(false);
  const cats = useApi(open || catsOpen ? "/categories" : null);
  const categories = cats.data?.categories || [];
  const wa = whatsappLink(mainWhatsapp(settings), generalMessage);
  const fb = facebookChat(settings);

  useEffect(() => {
    if (!open) return undefined;
    document.documentElement.classList.add("menu-open");
    const focusTimer = window.setTimeout(() => panelRef.current?.querySelector("a, button")?.focus(), 30);
    const onKey = (e) => {
      if (e.key === "Escape") {
        onClose();
        returnFocus.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusTimer);
      document.documentElement.classList.remove("menu-open");
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, returnFocus]);

  const item = (to, label, icon) => (
    <Link to={to} className="drawer__link" onClick={onClose}>
      <Icon name={icon} size={19} strokeWidth={1.8} />
      <span>{label}</span>
    </Link>
  );

  return (
    <div className={`drawer${open ? " is-open" : ""}`} aria-hidden={!open} inert={!open}>
      <div className="drawer__backdrop" onClick={onClose} />
      <nav id="site-drawer" ref={panelRef} className="drawer__panel" aria-label="Menu">
        <div className="drawer__head">
          <Logo />
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close menu">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="drawer__group">
          {item("/", "Home", "home")}
          <Link to="/pre-order" className="drawer__link drawer__link--hot" onClick={onClose}>
            <Icon name="clipboardCheck" size={19} strokeWidth={1.8} />
            <span>Pre-order</span>
            <span className="drawer__tag">Pre-owned / New</span>
          </Link>
          <button type="button" className="drawer__link" aria-expanded={catsOpen} aria-controls="drawer-cats" onClick={() => setCatsOpen((o) => !o)}>
            <Icon name="tags" size={19} strokeWidth={1.8} />
            <span>Product categories</span>
            <Icon name={catsOpen ? "chevronUp" : "chevronDown"} size={17} className="drawer__chev" />
          </button>
          {catsOpen ? (
            <ul id="drawer-cats" className="drawer__cats" role="list">
              {cats.loading && !categories.length ? <li className="faint small drawer__note">Loading...</li> : null}
              {categories.map((c) => (
                <li key={c.slug}>
                  <div className="drawer__cat">
                    <Link to={`/products?category=${encodeURIComponent(c.slug)}`} className="drawer__catlink" onClick={onClose}>
                      <CategoryIcon type={c.icon} size={17} strokeWidth={1.7} />
                      <span>{c.name}</span>
                      {c.available + c.preorder > 0 ? <span className="drawer__count num">{c.available + c.preorder}</span> : null}
                    </Link>
                    {c.children?.length ? (
                      <button
                        type="button"
                        className="drawer__sub-toggle"
                        aria-expanded={expanded === c.slug}
                        aria-label={`${expanded === c.slug ? "Hide" : "Show"} ${c.name} subcategories`}
                        onClick={() => setExpanded((e) => (e === c.slug ? null : c.slug))}
                      >
                        <Icon name={expanded === c.slug ? "minus" : "plus"} size={15} />
                      </button>
                    ) : null}
                  </div>
                  {expanded === c.slug ? (
                    <ul className="drawer__subs" role="list">
                      {c.children.map((s) => (
                        <li key={s.slug}>
                          <Link to={`/products?category=${encodeURIComponent(c.slug)}&sub=${encodeURIComponent(s.slug)}`} onClick={onClose}>
                            {s.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {item("/products?status=available", "Available products", "packageCheck")}
        </div>

        <div className="drawer__group">
          {item("/warranty", "Warranty check", "shieldCheck")}
          {item("/warranty-policy", "Warranty policy", "fileText")}
          {item("/custom-pc", "Custom PC build", "cpu")}
          {item("/about", "About HyperByte", "store")}
          {item("/#contact", "Contact us", "messageCircle")}
        </div>

        <div className="drawer__social">
          {wa ? (
            <a className="btn btn--whatsapp btn--block" href={wa} target="_blank" rel="noopener noreferrer">
              <Icon name="whatsapp" size={19} /> WhatsApp
            </a>
          ) : null}
          <div className="row" style={{ "--gap": "8px" }}>
            {fb ? (
              <a className="btn btn--facebook btn--sm drawer__half" href={fb} target="_blank" rel="noopener noreferrer">
                <Icon name="facebook" size={17} /> Facebook
              </a>
            ) : null}
            {settings.instagramUrl ? (
              <a className="btn btn--ghost btn--sm drawer__half" href={settings.instagramUrl} target="_blank" rel="noopener noreferrer">
                <Icon name="instagram" size={16} /> Instagram
              </a>
            ) : null}
          </div>
          <MotionToggle withLabel />
        </div>
      </nav>
    </div>
  );
}
