import { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import ProtectedRoute from "../../../shared/components/ProtectedRoute";
import KDSLayout from "./layouts/KDSLayout";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const KitchenPage = lazy(() => import("./pages/KitchenPage"));

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

          <Route
            element={<ProtectedRoute requiredPermissions={["kds:view"]} fallbackPath="/login" />}
          >
            <Route element={<KDSLayout />}>
              <Route index element={<KitchenPage />} />
              <Route path="kitchen" element={<KitchenPage />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
