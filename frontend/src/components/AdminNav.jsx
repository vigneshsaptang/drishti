const tabs = [
  { key: 'admin-users', label: 'Users' },
  { key: 'admin-roles', label: 'Roles' },
  { key: 'admin-credits', label: 'Credits' },
  { key: 'admin-config', label: 'Settings' },
  { key: 'admin-audit', label: 'Audit Log' },
  { key: 'admin-tickets', label: 'Tickets' },
  { key: 'health', label: 'Health' },
];

export default function AdminNav({ active, onNavigate }) {
  if (!onNavigate) return null;
  return (
    <div className="flex items-center gap-1 border-b border-sap-border bg-sap-surface px-5">
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onNavigate(t.key)}
          className={`px-3 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
            active === t.key
              ? 'border-sap-accent text-sap-accent'
              : 'border-transparent text-sap-dim hover:text-sap-text'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
