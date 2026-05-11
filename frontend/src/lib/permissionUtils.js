import { useContext } from 'react';
import { PermissionContext, ROLE_LEVELS } from './permissionContext';

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
