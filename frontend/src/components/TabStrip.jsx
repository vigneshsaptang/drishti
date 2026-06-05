import { useAnyPermission } from '../lib/permissionUtils';

const TABS = [
  { id: 'report',   label: 'Report',   perms: null },
  { id: 'evidence', label: 'Evidence',  perms: ['engine.credmon.read'] },
  { id: 'tools',    label: 'Tools',     perms: null },
];

function Tab({ id, label, active, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onClick(id)}
      disabled={disabled}
      className={`relative flex items-center gap-1 px-3.5 h-full text-sm font-medium whitespace-nowrap outline-none transition-colors -mb-px border-b-2 ${
        active
          ? 'border-sap-accent text-sap-accent'
          : disabled
            ? 'border-transparent text-sap-muted cursor-default'
            : 'border-transparent text-sap-dim hover:text-sap-text cursor-pointer'
      }`}
    >
      {label}
    </button>
  );
}

function useTabVisible(perms) {
  const match = useAnyPermission(...(perms || []));
  if (perms === null) return true;
  return match;
}

function PermissionTab({ tab, active, disabled, onClick }) {
  const visible = useTabVisible(tab.perms);
  if (!visible) return null;
  return (
    <Tab
      id={tab.id}
      label={tab.label}
      active={active}
      disabled={disabled}
      onClick={onClick}
    />
  );
}

export default function TabStrip({ activeTab, onTabChange, results = [], darkmonResults = [] }) {
  const hasBreachOrDarkmon = results.some(r => r.found && !r.skipped) || darkmonResults.some(r => r.found);

  return (
    <div className="flex items-stretch h-10 border-b border-sap-border overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      <div className="flex items-stretch shrink-0">
        {TABS.map(tab => (
          <PermissionTab
            key={tab.id}
            tab={tab}
            active={activeTab === tab.id}
            disabled={tab.id === 'evidence' && !hasBreachOrDarkmon}
            onClick={onTabChange}
          />
        ))}
      </div>
    </div>
  );
}
