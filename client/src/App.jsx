import { lazy, Suspense, useEffect, useState } from "react";
import { matchPath, useLocation } from "./lib/router.jsx";
import { useMotion } from "./motion/MotionContext.jsx";
import CosmicCanvas from "./components/effects/CosmicCanvas.jsx";
import IntroSequence, { shouldPlayIntro } from "./components/effects/IntroSequence.jsx";
import Header from "./components/layout/Header.jsx";
import Footer from "./components/layout/Footer.jsx";
import Home from "./pages/Home.jsx";
import NotFound from "./pages/NotFound.jsx";

// The admin panel is a separate download, so visitors never load it.
const AdminApp = lazy(() => import("./admin/AdminApp.jsx"));

/**
 * A page that is downloaded separately, so the first visit loads less.
 * Once its file is loaded, the page renders straight away (no spinner).
 */
function splitPage(loader, name = "default") {
  let mod = null;
  const load = () => loader().then((m) => (mod = m));
  const Lazy = lazy(() => load().then((m) => ({ default: m[name] })));
  function Page(props) {
    const Comp = mod ? mod[name] : Lazy;
    return <Comp {...props} />;
  }
  Page.preload = load;
  return Page;
}

const loadInfo = () => import("./pages/InfoPages.jsx");
const Products = splitPage(() => import("./pages/Products.jsx"));
const ProductDetail = splitPage(() => import("./pages/ProductDetail.jsx"));
const Warranty = splitPage(() => import("./pages/Warranty.jsx"));
const PreorderRequest = splitPage(() => import("./pages/PreorderRequest.jsx"));
const About = splitPage(loadInfo, "About");
const CustomPc = splitPage(loadInfo, "CustomPc");
const WarrantyPolicy = splitPage(loadInfo, "WarrantyPolicy");
const SPLIT_PAGES = [Products, ProductDetail, Warranty, PreorderRequest, About];

// After the first page has loaded, the other pages download quietly in the background.
function usePreloadPages() {
  useEffect(() => {
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const id = idle(() => SPLIT_PAGES.forEach((p) => p.preload().catch(() => {})), { timeout: 4000 });
    return () => cancel(id);
  }, []);
}

export default function App() {
  const { pathname } = useLocation();
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return (
      <Suspense
        fallback={
          <div className="admin-boot">
            <span className="spinner" />
          </div>
        }
      >
        <AdminApp />
      </Suspense>
    );
  }
  return <Site pathname={pathname} />;
}

/**
 * Pauses the looping animations of page sections that are scrolled out of view,
 * so the browser does no work for things nobody can see. Visible ones run as before.
 */
function usePauseOffscreen(pathname) {
  useEffect(() => {
    const main = document.getElementById("main");
    if (!main || !("IntersectionObserver" in window)) return undefined;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.target.classList.toggle("is-offscreen", !e.isIntersecting)),
      { rootMargin: "120px 0px" }
    );
    const seen = new WeakSet();
    const scan = () =>
      main.querySelectorAll("section").forEach((el) => {
        if (!seen.has(el)) {
          seen.add(el);
          io.observe(el);
        }
      });
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(main, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [pathname]);
}

function Site({ pathname }) {
  const { reduced } = useMotion();
  // The opening sequence plays once per browser session, only when the visit starts on the home page.
  const [intro, setIntro] = useState(() => pathname === "/" && shouldPlayIntro(reduced));
  usePreloadPages();
  usePauseOffscreen(pathname);

  let page;
  let match;
  if (pathname === "/") page = <Home ready={!intro} />;
  else if (pathname === "/products") page = <Products />;
  else if ((match = matchPath("/product/:slug", pathname))) page = <ProductDetail key={match.slug} slug={match.slug} />;
  else if (pathname === "/warranty") page = <Warranty />;
  else if (pathname === "/warranty-policy") page = <WarrantyPolicy />;
  else if (pathname === "/pre-order") page = <PreorderRequest />;
  else if (pathname === "/custom-pc") page = <CustomPc />;
  else if (pathname === "/about") page = <About />;
  else page = <NotFound />;

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="cosmos-bg" aria-hidden="true">
        <span className="cosmos-bg__blob cosmos-bg__blob--a" />
        <span className="cosmos-bg__blob cosmos-bg__blob--b" />
        <span className="cosmos-bg__blob cosmos-bg__blob--c" />
      </div>
      <CosmicCanvas />
      <div className="site">
        <Header />
        <main id="main" className="page-in" key={pathname} tabIndex={-1}>
          <Suspense
            fallback={
              <div className="page-loading" role="status" aria-label="Loading">
                <span className="spinner" />
              </div>
            }
          >
            {page}
          </Suspense>
        </main>
        <Footer />
      </div>
      {intro ? <IntroSequence onDone={() => setIntro(false)} /> : null}
    </>
  );
}
