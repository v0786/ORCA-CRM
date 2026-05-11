import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../../../shared/hooks/useAuth";
import OrcaButton from "../../../../shared/components/OrcaButton";
import { logout } from "../../../../shared/firebase/auth";
import RestaurantLogo from "../../../../shared/components/RestaurantLogo";

export default function KDSLayout() {
  const auth = useAuth();
  const nav = useNavigate();

  async function onLogout() {
    await logout();
    nav("/login");
  }

  const restaurantName =
    auth.status === "authenticated" ? auth.user.restaurant.name : "ORCA CRM";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <RestaurantLogo size={36} className="hidden sm:inline-flex" editable={false} />
            <Link to="/" className="text-lg font-semibold tracking-tight">
              ORCA CRM <span className="text-orange-500">KDS</span>
            </Link>
            <div className="hidden sm:block text-sm text-white/70">
              {restaurantName}
            </div>
          </div>
          <OrcaButton variant="secondary" onClick={onLogout}>
            Logout
          </OrcaButton>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-4">
        <Outlet />
      </main>
    </div>
  );
}
