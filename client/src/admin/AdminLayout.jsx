import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "../lib/router.jsx";
import Icon from "../components/ui/Icon.jsx";
import { LogoMark } from "../components/layout/Logo.jsx";
import { useAdmin } from "./AdminContext.js";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: "dashboard", end: true },
  { to: "/admin/products", label: "Products", icon: "package" },
  { to: "/admin/ledger", label: "Sales ledger", icon: "receipt" },
  { to: "/admin/warranties", label: "Warranties", icon: "shieldCheck" },
  { to: "/admin/inquiries", label: "Pre-orders", icon: "clipboardCheck" },
  { to: "/admin/categories", label: "Categories", icon: "tags" },
  { to: "/admin/settings", label: "Settings", icon: "settings" },
  { to: "/admin/activity", label: "Activity log", icon: "history" },
];

export default function AdminLayout({ children }) {
  const { admin, logout } = useAdmin();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useRef(null);

  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    document.documentElement.classList.add("is-admin");
    return () => document.documentElement.classList.remove("is-admin");
  }, []);
  useEffect(() => {
    if (!moreOpen) return undefined;
    sheetRef.current?.querySelector("a, button")?.focus();
    const onKey = (e) => e.key === "Escape" && setMoreOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const navLink = (item, cls) => (
    <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `${cls}${isActive ? " is-active" : ""}`}>
      <Icon name={item.icon} size={19} strokeWidth={1.8} />
      <span>{item.label}</span>
    </NavLink>
  );

  return (
    <div className="admin">
      <a className="skip-link" href="#admin-main">
        Skip to content
      </a>

      <aside className="a-side" aria-label="Admin menu">
        <Link to="/admin" className="a-brand">
          <LogoMark size={30} />
          <span>
            hyperByte <span className="a-brand__tag">admin</span>
          </span>
        </Link>
        <nav className="a-nav">{NAV.map((item) => navLink(item, "a-nav__link"))}</nav>
        <div className="a-side__foot">
          <a className="a-nav__link" href="/" target="_blank" rel="noopener noreferrer">
            <Icon name="external" size={19} strokeWidth={1.8} />
            <span>View website</span>
          </a>
          <NavLink to="/admin/account" className={({ isActive }) => `a-nav__link${isActive ? " is-active" : ""}`}>
            <Icon name="user" size={19} strokeWidth={1.8} />
            <span className="a-who">
              <span>{admin?.name}</span>
              <span className="a-who__mail">{admin?.email}</span>
            </span>
          </NavLink>
          <button type="button" className="a-nav__link" onClick={logout}>
            <Icon name="logOut" size={19} strokeWidth={1.8} />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <header className="a-topbar">
        <Link to="/admin" className="a-brand">
          <LogoMark size={28} />
          <span>
            hyperByte <span className="a-brand__tag">admin</span>
          </span>
        </Link>
        <a className="icon-btn" href="/" target="_blank" rel="noopener noreferrer" aria-label="View website">
          <Icon name="external" size={18} />
        </a>
      </header>

      <main id="admin-main" className="a-main" tabIndex={-1}>
        <div className="a-content">{children}</div>
      </main>

      <nav className="a-tabbar" aria-label="Admin menu">
        {navLink(NAV[0], "a-tabbar__link")}
        {navLink(NAV[1], "a-tabbar__link")}
        <Link to="/admin/products/new" className="a-tabbar__add" aria-label="Add a product">
          <Icon name="plus" size={24} />
        </Link>
        {navLink(NAV[2], "a-tabbar__link")}
        <button type="button" className={`a-tabbar__link${moreOpen ? " is-active" : ""}`} aria-expanded={moreOpen} aria-controls="admin-more" onClick={() => setMoreOpen((o) => !o)}>
          <Icon name="menu" size={19} strokeWidth={1.8} />
          <span>More</span>
        </button>
      </nav>

      {moreOpen ? (
        <div className="a-sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setMoreOpen(false)}>
          <div id="admin-more" ref={sheetRef} className="a-sheet" role="dialog" aria-modal="true" aria-label="More">
            <nav className="a-nav">
              {NAV.slice(3).map((item) => navLink(item, "a-nav__link"))}
              <NavLink to="/admin/account" className={({ isActive }) => `a-nav__link${isActive ? " is-active" : ""}`}>
                <Icon name="keyRound" size={19} strokeWidth={1.8} />
                <span>Account and password</span>
              </NavLink>
              <a className="a-nav__link" href="/" target="_blank" rel="noopener noreferrer">
                <Icon name="external" size={19} strokeWidth={1.8} />
                <span>View website</span>
              </a>
              <button type="button" className="a-nav__link" onClick={logout}>
                <Icon name="logOut" size={19} strokeWidth={1.8} />
                <span>Log out ({admin?.name})</span>
              </button>
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}
