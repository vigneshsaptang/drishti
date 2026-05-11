import { createContext } from 'react';

export const PermissionContext = createContext({
  permissions: new Set(),
  limits: {},
  role: null,
  username: null,
});

export const ROLE_LEVELS = { viewer: 10, analyst: 50, admin: 80, super_admin: 100 };
