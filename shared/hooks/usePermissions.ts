import { useMemo } from "react";
import { useAuth } from "./useAuth";
import type { PermissionKey } from "../firebase/types";

export function usePermissions() {
  const auth = useAuth();

  const permissionSet = useMemo(() => {
    if (auth.status !== "authenticated") return new Set<PermissionKey>();
    const perms = auth.user.roles.flatMap((r) => r.permissions);
    return new Set<PermissionKey>(perms);
  }, [auth.status, auth.status === "authenticated" ? auth.user.roles : null]);

  function hasPermission(permission: PermissionKey) {
    return permissionSet.has(permission);
  }

  function hasAllPermissions(permissions: PermissionKey[]) {
    return permissions.every((p) => permissionSet.has(p));
  }

  return {
    status: auth.status,
    permissions: permissionSet,
    hasPermission,
    hasAllPermissions,
  };
}
