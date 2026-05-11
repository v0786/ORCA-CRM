import { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import ProtectedRoute from "../../../shared/components/ProtectedRoute";
import ICSLayout from "./layouts/ICSLayout";

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const MenuPage = lazy(() => import("./pages/MenuPage"));
const POSPage = lazy(() => import("./pages/POSPage"));
const TablesPage = lazy(() => import("./pages/TablesPage"));
const StaffPage = lazy(() => import("./pages/StaffPage"));

function AppLoading() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center p-6">
      <div className="text-sm text-white/70">Loading…</div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Suspense fallback={<AppLoading />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<ICSLayout />}>
              <Route index element={<DashboardPage />} />

              <Route element={<ProtectedRoute requiredPermissions={["pos:use"]} />}>
                <Route path="pos" element={<POSPage />} />
              </Route>

              <Route element={<ProtectedRoute requiredPermissions={["tables:manage"]} />}>
                <Route path="tables" element={<TablesPage />} />
              </Route>

              <Route element={<ProtectedRoute requiredPermissions={["menu:edit"]} />}>
                <Route path="menu" element={<MenuPage />} />
              </Route>

              <Route element={<ProtectedRoute requiredPermissions={["staff:manage"]} />}>
                <Route path="staff" element={<StaffPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
