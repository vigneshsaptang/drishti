import { useMemo } from 'react';
import { PermissionContext } from './permissionContext';

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
