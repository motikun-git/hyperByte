// The admin panel at /admin. It is loaded only when someone opens /admin,
// so website visitors never download it. There is no sign-up page: the first
// account is created once with the setup token from api/.env.
import { useCallback, useEffect, useState } from "react";
import { matchPath, Navigate, useLocation, useNavigate } from "../lib/router.jsx";
import { api, setCsrf } from "../lib/api.js";
import Icon from "../components/ui/Icon.jsx";
import { setSignedOutHandler } from "./adminApi.js";
import AdminLayout from "./AdminLayout.jsx";
import Login from "./pages/Login.jsx";
import Setup from "./pages/Setup.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import ProductsList from "./pages/ProductsList.jsx";
import ProductEdit from "./pages/ProductEdit.jsx";
import WarrantiesList from "./pages/WarrantiesList.jsx";
import WarrantyNew from "./pages/WarrantyNew.jsx";
import WarrantyDetail from "./pages/WarrantyDetail.jsx";
import Categories from "./pages/Categories.jsx";
import Inquiries from "./pages/Inquiries.jsx";
import Ledger from "./pages/Ledger.jsx";
import MemoPrint from "./pages/MemoPrint.jsx";
import SettingsPage from "./pages/Settings.jsx";
import Activity from "./pages/Activity.jsx";
import Account from "./pages/Account.jsx";
import { Empty } from "./ui.jsx";
import { AdminContext } from "./AdminContext.js";
import "./admin.css";

export default function AdminApp() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [auth, setAuth] = useState({ phase: "loading", admin: null, status: null, notice: "", error: null });

  const checkSession = useCallback(async () => {
    setAuth((a) => ({ ...a, phase: "loading", error: null }));
    try {
      const me = await api("/admin/me");
      setCsrf(me.csrf);
      setAuth({ phase: "ready", admin: me.admin, status: null, notice: "", error: null });
    } catch (err) {
      if (err.status !== 401) {
        setAuth({ phase: "error", admin: null, status: null, notice: "", error: err });
        return;
      }
      try {
        const status = await api("/admin/status");
        setAuth({ phase: status.hasAdmin ? "login" : "setup", admin: null, status, notice: "", error: null });
      } catch (err2) {
        setAuth({ phase: "error", admin: null, status: null, notice: "", error: err2 });
      }
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    setSignedOutHandler(() => {
      setCsrf("");
      setAuth((a) => (a.phase === "ready" ? { phase: "login", admin: null, status: a.status, notice: "Your session ended. Please log in again.", error: null } : a));
    });
    return () => setSignedOutHandler(null);
  }, []);

  const signedIn = useCallback((result) => {
    setCsrf(result.csrf);
    setAuth({ phase: "ready", admin: result.admin, status: null, notice: "", error: null });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/admin/logout", { method: "POST" });
    } catch {
      // Logged out locally either way.
    }
    setCsrf("");
    setAuth({ phase: "login", admin: null, status: null, notice: "You are logged out.", error: null });
    navigate("/admin", { replace: true });
  }, [navigate]);

  if (auth.phase === "loading") {
    return (
      <div className="admin admin-center">
        <span className="spinner" aria-label="Loading" />
      </div>
    );
  }
  if (auth.phase === "error") {
    return (
      <div className="admin admin-center">
        <div className="a-auth panel">
          <Icon name="alert" size={28} />
          <h1 className="a-title">The admin panel cannot reach the server</h1>
          <p className="muted">{auth.error?.message}</p>
          <button type="button" className="btn btn--primary" onClick={checkSession}>
            <Icon name="refresh" size={18} /> Try again
          </button>
        </div>
      </div>
    );
  }
  if (auth.phase === "setup") return <Setup status={auth.status} onDone={signedIn} onRecheck={checkSession} />;
  if (auth.phase === "login") return <Login notice={auth.notice} onDone={signedIn} />;

  // The printable memo has no admin menu around it.
  const memo = matchPath("/admin/warranties/:id/memo", pathname.replace(/\/+$/, ""));
  if (memo) {
    return (
      <AdminContext.Provider value={{ admin: auth.admin, logout }}>
        <MemoPrint id={Number(memo.id)} />
      </AdminContext.Provider>
    );
  }

  return (
    <AdminContext.Provider value={{ admin: auth.admin, logout }}>
      <AdminLayout>
        <AdminRoutes />
      </AdminLayout>
    </AdminContext.Provider>
  );
}

function AdminRoutes() {
  const { pathname } = useLocation();
  const path = pathname.replace(/\/+$/, "") || "/admin";
  let m;
  if (path === "/admin") return <Dashboard />;
  if (path === "/admin/login" || path === "/admin/setup") return <Navigate to="/admin" />;
  if (path === "/admin/products") return <ProductsList />;
  if (path === "/admin/products/new") return <ProductEdit key="new" id={null} />;
  if ((m = matchPath("/admin/products/:id", path))) return <ProductEdit key={m.id} id={Number(m.id)} />;
  if (path === "/admin/warranties") return <WarrantiesList />;
  if (path === "/admin/warranties/new") return <WarrantyNew />;
  if ((m = matchPath("/admin/warranties/:id", path))) return <WarrantyDetail key={m.id} id={Number(m.id)} />;
  if (path === "/admin/categories") return <Categories />;
  if (path === "/admin/inquiries") return <Inquiries />;
  if (path === "/admin/ledger") return <Ledger />;
  if (path === "/admin/settings") return <SettingsPage />;
  if (path === "/admin/activity") return <Activity />;
  if (path === "/admin/account") return <Account />;
  return <Empty icon="search" title="This admin page does not exist" text="Use the menu to find what you need." />;
}
