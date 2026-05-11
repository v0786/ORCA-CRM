import { Navigate, Outlet } from "react-router-dom";
import type { PermissionKey } from "../firebase/types";
import { usePermissions } from "../hooks/usePermissions";

export default function ProtectedRoute(props: {
  requiredPermissions?: PermissionKey[];
  fallbackPath?: string;
}) {
  const { status, hasAllPermissions } = usePermissions();
  const fallbackPath = props.fallbackPath ?? "/";

  if (status === "loading") return <div className="p-4">Loading...</div>;
  if (status === "unauthenticated") return <Navigate to="/login" replace />;

  const required = props.requiredPermissions ?? [];
  if (required.length && !hasAllPermissions(required)) {
    return <Navigate to={fallbackPath} replace />;
  }

  return <Outlet />;
}

