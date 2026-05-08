import { usePermission, usePermissions, useAnyPermission } from '../lib/permissions';

function CanSingle({ permission, fallback, children }) {
  const allowed = usePermission(permission);
  return allowed ? children : fallback;
}

function CanAll({ all, fallback, children }) {
  const allowed = usePermissions(...all);
  return allowed ? children : fallback;
}

function CanAny({ any: anyPerm, fallback, children }) {
  const allowed = useAnyPermission(...anyPerm);
  return allowed ? children : fallback;
}

export default function Can({ permission, all, any: anyPerm, fallback = null, children }) {
  if (permission) return <CanSingle permission={permission} fallback={fallback}>{children}</CanSingle>;
  if (all) return <CanAll all={all} fallback={fallback}>{children}</CanAll>;
  if (anyPerm) return <CanAny any={anyPerm} fallback={fallback}>{children}</CanAny>;
  return fallback;
}
