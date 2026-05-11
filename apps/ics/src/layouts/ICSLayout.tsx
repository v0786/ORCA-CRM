import { useMemo, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../../../shared/hooks/useAuth";
import { usePermissions } from "../../../../shared/hooks/usePermissions";
import OrcaButton from "../../../../shared/components/OrcaButton";
import { logout } from "../../../../shared/firebase/auth";
import RestaurantLogo from "../../../../shared/components/RestaurantLogo";

export default function ICSLayout() {
  const auth = useAuth();
  const perms = usePermissions();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  async function onLogout() {
    await logout();
    navigate("/login");
  }

  const restaurantName = auth.status === "authenticated" ? auth.user.restaurant.name : "ORCA CRM";

  const canUsePOS = perms.status === "authenticated" && perms.hasPermission("pos:use");
  const canManageTables = perms.status === "authenticated" && perms.hasPermission("tables:manage");
  const canEditMenu = perms.status === "authenticated" && perms.hasPermission("menu:edit");
  const canManageStaff = perms.status === "authenticated" && perms.hasPermission("staff:manage");

  const navItems = useMemo(
    () => [
      { to: "/", label: "Dashboard", show: true },
      { to: "/pos", label: "POS", show: canUsePOS },
      { to: "/tables", label: "Tables", show: canManageTables },
      { to: "/menu", label: "Menu", show: canEditMenu },
      { to: "/staff", label: "Staff", show: canManageStaff },
    ],
    [canUsePOS, canManageTables, canEditMenu, canManageStaff]
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <RestaurantLogo size={36} className="hidden sm:inline-flex" />
            <Link to="/" className="text-lg font-semibold tracking-tight">
              ORCA CRM <span className="text-orange-500">ICS</span>
            </Link>
            <div className="hidden sm:block text-sm text-white/70">
              {restaurantName}
            </div>
          </div>
          <nav className="flex items-center gap-2">
            {perms.status === "authenticated" ? (
              <>
                <div className="hidden sm:flex items-center gap-2">
                  {navItems
                    .filter((i) => i.show)
                    .map((i) => (
                      <NavLink
                        key={i.to}
                        to={i.to}
                        className={({ isActive }) =>
                          `rounded-lg px-3 py-2 text-sm ${isActive ? "bg-white/10" : "hover:bg-white/5"}`
                        }
                      >
                        {i.label}
                      </NavLink>
                    ))}
                </div>

                <div className="relative sm:hidden">
                  <button
                    type="button"
                    className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
                    aria-haspopup="menu"
                    aria-expanded={mobileMenuOpen}
                    onClick={() => setMobileMenuOpen((v) => !v)}
                  >
                    Menu
                  </button>
                  {mobileMenuOpen ? (
                    <div
                      role="menu"
                      className="absolute right-0 mt-2 w-48 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 backdrop-blur-md shadow-lg"
                    >
                      {navItems
                        .filter((i) => i.show)
                        .map((i) => (
                          <NavLink
                            key={i.to}
                            to={i.to}
                            role="menuitem"
                            onClick={() => setMobileMenuOpen(false)}
                            className={({ isActive }) =>
                              `block px-4 py-3 text-sm ${isActive ? "bg-white/10" : "hover:bg-white/5"}`
                            }
                          >
                            {i.label}
                          </NavLink>
                        ))}
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
            <OrcaButton variant="secondary" onClick={onLogout}>
              Logout
            </OrcaButton>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
