import { useState, useEffect, useRef } from 'react';
import { getUser, signOut } from '../lib/auth';
import { useAnyPermission } from '../lib/permissionUtils';

function getInitials(displayName) {
  if (!displayName) return '?';
  const parts = displayName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const ROLE_LABELS = {
  super_admin: { text: 'Super Admin', cls: 'bg-rose-500/15 text-rose-600' },
  admin: { text: 'Admin', cls: 'bg-amber-500/15 text-amber-600' },
  analyst: { text: 'Analyst', cls: 'bg-blue-500/15 text-blue-600' },
  viewer: { text: 'Viewer', cls: 'bg-emerald-500/15 text-emerald-600' },
};

export default function UserMenu({ onShowProfile, onShowSessions, onShowApiKeys, onShowAdmin }) {
  const [open, setOpen] = useState(false);
  const user = getUser();
  const ref = useRef(null);
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const hasAdminAccess = useAnyPermission(
    'admin.users.list', 'admin.roles.list', 'admin.audit.read', 'admin.settings.read',
  );

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const initials = getInitials(user?.display_name || user?.username);
  const roleMeta = ROLE_LABELS[user?.role] || { text: user?.role || 'User', cls: 'bg-sap-border text-sap-dim' };

  function handle(fn) {
    return () => {
      setOpen(false);
      fn?.();
    };
  }

  return (
    <div className="relative" ref={ref}>
      {/* Avatar trigger */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setOpen(v => !v)}
        className="w-7 h-7 rounded-full bg-sap-accent/15 text-sap-accent text-[10px] font-bold flex items-center justify-center cursor-pointer select-none"
      >
        {initials}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-56 rounded-lg border border-sap-border bg-sap-surface shadow-lg z-50 py-1.5">
          {/* Identity header */}
          <div className="px-3 py-2 flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-sap-accent/15 text-sap-accent text-[10px] font-bold flex items-center justify-center shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-sap-text truncate">{user?.display_name || user?.username || 'Unknown'}</div>
              <div className="mt-0.5">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${roleMeta.cls}`}>{roleMeta.text}</span>
              </div>
            </div>
          </div>

          <div className="my-1 border-t border-sap-border" />

          {/* Core menu items */}
          <div
            role="menuitem"
            tabIndex={0}
            onClick={handle(onShowProfile)}
            onKeyDown={e => e.key === 'Enter' && handle(onShowProfile)()}
            className="px-3 py-2 text-xs text-sap-text hover:bg-sap-accent/5 cursor-pointer flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5 shrink-0 text-sap-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Profile
          </div>

          {isAdmin && (
            <div
              role="menuitem"
              tabIndex={0}
              onClick={handle(onShowSessions)}
              onKeyDown={e => e.key === 'Enter' && handle(onShowSessions)()}
              className="px-3 py-2 text-xs text-sap-text hover:bg-sap-accent/5 cursor-pointer flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5 shrink-0 text-sap-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Active Sessions
            </div>
          )}

          {isAdmin && (
            <div
              role="menuitem"
              tabIndex={0}
              onClick={handle(onShowApiKeys)}
              onKeyDown={e => e.key === 'Enter' && handle(onShowApiKeys)()}
              className="px-3 py-2 text-xs text-sap-text hover:bg-sap-accent/5 cursor-pointer flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5 shrink-0 text-sap-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              API Keys
            </div>
          )}

          {/* Admin section */}
          {hasAdminAccess && (
            <>
              <div className="my-1 border-t border-sap-border" />
              <div
                role="menuitem"
                tabIndex={0}
                onClick={handle(onShowAdmin)}
                onKeyDown={e => e.key === 'Enter' && handle(onShowAdmin)()}
                className="px-3 py-2 text-xs text-sap-text hover:bg-sap-accent/5 cursor-pointer flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5 shrink-0 text-sap-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Administration
              </div>
            </>
          )}

          <div className="my-1 border-t border-sap-border" />

          {/* Sign out */}
          <div
            role="menuitem"
            tabIndex={0}
            onClick={handle(signOut)}
            onKeyDown={e => e.key === 'Enter' && handle(signOut)()}
            className="px-3 py-2 text-xs text-sap-text hover:bg-sap-accent/5 cursor-pointer flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5 shrink-0 text-sap-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </div>
        </div>
      )}
    </div>
  );
}
