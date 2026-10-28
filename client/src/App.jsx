import { lazy, Suspense, useState } from "react";
import { matchPath, useLocation } from "./lib/router.jsx";
import { useMotion } from "./motion/MotionContext.jsx";
import CosmicCanvas from "./components/effects/CosmicCanvas.jsx";
import IntroSequence, { shouldPlayIntro } from "./components/effects/IntroSequence.jsx";
import Header from "./components/layout/Header.jsx";
import Footer from "./components/layout/Footer.jsx";
import Home from "./pages/Home.jsx";
import Products from "./pages/Products.jsx";
import ProductDetail from "./pages/ProductDetail.jsx";
import Warranty from "./pages/Warranty.jsx";
import { About, CustomPc, WarrantyPolicy } from "./pages/InfoPages.jsx";
import PreorderRequest from "./pages/PreorderRequest.jsx";
import NotFound from "./pages/NotFound.jsx";

// The admin panel is a separate download, so visitors never load it.
const AdminApp = lazy(() => import("./admin/AdminApp.jsx"));

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

function Site({ pathname }) {
  const { reduced } = useMotion();
  // The opening sequence plays once per browser session, only when the visit starts on the home page.
  const [intro, setIntro] = useState(() => pathname === "/" && shouldPlayIntro(reduced));

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
          {page}
        </main>
        <Footer />
      </div>
      {intro ? <IntroSequence onDone={() => setIntro(false)} /> : null}
    </>
  );
}
