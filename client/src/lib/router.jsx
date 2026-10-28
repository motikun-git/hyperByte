// A small router for this site. It uses the same names as React Router
// (Link, NavLink, useNavigate, useLocation, useSearchParams) so the code
// reads the same way, without adding another package.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const RouterContext = createContext(null);

function readLocation() {
  const { pathname, search, hash } = window.location;
  return { pathname, search, hash, state: window.history.state, key: Math.random().toString(36).slice(2) };
}

function scrollToHash(hash) {
  if (!hash) return false;
  const el = document.getElementById(decodeURIComponent(hash.slice(1)));
  if (!el) return false;
  el.scrollIntoView({ behavior: document.documentElement.classList.contains("motion-off") ? "auto" : "smooth", block: "start" });
  return true;
}

export function Router({ children }) {
  const [location, setLocation] = useState(readLocation);

  useEffect(() => {
    const onPop = () => setLocation(readLocation());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to, { replace = false, state = null, scroll = true } = {}) => {
    if (typeof to === "number") {
      window.history.go(to);
      return;
    }
    const url = new URL(to, window.location.href);
    if (url.origin !== window.location.origin) {
      window.location.assign(url.href);
      return;
    }
    const next = url.pathname + url.search + url.hash;
    const current = window.location.pathname + window.location.search + window.location.hash;
    if (next !== current) {
      window.history[replace ? "replaceState" : "pushState"](state, "", next);
    }
    setLocation({ pathname: url.pathname, search: url.search, hash: url.hash, state, key: Math.random().toString(36).slice(2) });
    if (scroll) {
      requestAnimationFrame(() => {
        if (!scrollToHash(url.hash)) window.scrollTo({ top: 0, behavior: "auto" });
      });
    }
  }, []);

  const value = useMemo(() => ({ location, navigate }), [location, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useLocation() {
  return useContext(RouterContext).location;
}

export function useNavigate() {
  return useContext(RouterContext).navigate;
}

export function useSearchParams() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const setParams = useCallback(
    (next, { replace = true } = {}) => {
      const value = typeof next === "function" ? next(new URLSearchParams(location.search)) : next;
      const qs = new URLSearchParams(value).toString();
      navigate(location.pathname + (qs ? `?${qs}` : ""), { replace, scroll: false });
    },
    [location.pathname, location.search, navigate]
  );
  return [params, setParams];
}

/** matchPath("/product/:slug", "/product/abc") -> { slug: "abc" } or null */
export function matchPath(pattern, pathname) {
  const p = pattern.split("/").filter(Boolean);
  const a = pathname.split("/").filter(Boolean);
  if (p.length !== a.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i += 1) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

function isPlainLeftClick(e) {
  return e.button === 0 && !e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey && !e.defaultPrevented;
}

export function Link({ to, replace, state, scroll, onClick, target, children, ...rest }) {
  const navigate = useNavigate();
  const handle = (e) => {
    onClick?.(e);
    if (!isPlainLeftClick(e) || (target && target !== "_self")) return;
    const url = new URL(to, window.location.href);
    if (url.origin !== window.location.origin) return;
    e.preventDefault();
    navigate(to, { replace, state, scroll });
  };
  return (
    <a href={to} onClick={handle} target={target} {...rest}>
      {children}
    </a>
  );
}

export function NavLink({ to, end = false, className, children, ...rest }) {
  const { pathname } = useLocation();
  const path = new URL(to, window.location.href).pathname;
  const isActive = end ? pathname === path : pathname === path || pathname.startsWith(path.endsWith("/") ? path : `${path}/`);
  const cls = typeof className === "function" ? className({ isActive }) : className;
  return (
    <Link to={to} className={cls} aria-current={isActive ? "page" : undefined} {...rest}>
      {typeof children === "function" ? children({ isActive }) : children}
    </Link>
  );
}

export function Navigate({ to, replace = true }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace });
  }, [to, replace, navigate]);
  return null;
}
