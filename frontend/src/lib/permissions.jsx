import { createContext, useContext, useMemo } from 'react';

const PermissionContext = createContext({
  permissions: new Set(),
  limits: {},
  role: null,
  username: null,
});

const ROLE_LEVELS = { viewer: 10, analyst: 50, admin: 80, super_admin: 100 };

export function PermissionProvider({ user, children }) {
  const value = useMemo(() => ({
    permissions: new Set(user?.permissions || []),
    limits: user?.limits || {},
    role: user?.role || null,
    username: user?.username || null,
  }), [user]);

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermission(permission) {
  const { permissions } = useContext(PermissionContext);
  return permissions.has(permission);
}

export function usePermissions(...perms) {
  const { permissions } = useContext(PermissionContext);
  return perms.every(p => permissions.has(p));
}

export function useAnyPermission(...perms) {
  const { permissions } = useContext(PermissionContext);
  return perms.some(p => permissions.has(p));
}

export function useLimit(key) {
  const { limits } = useContext(PermissionContext);
  return limits[key];
}

export function useRateLimit(key) {
  const { limits } = useContext(PermissionContext);
  return limits?.rate?.[key];
}

export function useRole() {
  const { role } = useContext(PermissionContext);
  return role;
}

export function useMinRole(minRole) {
  const { role } = useContext(PermissionContext);
  return (ROLE_LEVELS[role] || 0) >= (ROLE_LEVELS[minRole] || 0);
}

export function usePermissionContext() {
  return useContext(PermissionContext);
}
