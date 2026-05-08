import { useAnyPermission } from '../lib/permissions';

const SUBJECT_TABS = [
  { id: 'overview', label: 'Overview', perms: null },
  { id: 'breaches', label: 'Breaches', perms: ['engine.credmon.read'] },
  { id: 'darkweb', label: 'Dark Web', perms: ['engine.darkmon.read'] },
  { id: 'telegram', label: 'Social Intel', perms: ['feature.telegram.mentions', 'feature.telegram.search'] },
  { id: 'graph', label: 'Network', perms: ['feature.graph.view'] },
];

const TOOL_TABS = [
  { id: 'drugs', label: 'Drug Markets', perms: ['feature.drugs.view'] },
  { id: 'financial', label: 'Financial', perms: ['feature.financial.upi', 'feature.financial.bank', 'feature.financial.crypto', 'feature.financial.screen'] },
  { id: 'ecourts', label: 'Courts', perms: ['feature.ecourts.cached'] },
];

function Tab({ id, label, badge, active, disabled, muted, onClick }) {
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
            : muted
              ? 'border-transparent text-sap-muted hover:text-sap-dim cursor-pointer'
              : 'border-transparent text-sap-dim hover:text-sap-text cursor-pointer'
      }`}
    >
      {label}
      {badge && <span className="text-xs font-mono text-sap-muted">{badge}</span>}
    </button>
  );
}

function useTabVisible(perms) {
  const match = useAnyPermission(...(perms || []));
  if (perms === null) return true;
  return match;
}

function PermissionTab({ tab, active, disabled, muted, badge, onClick }) {
  const visible = useTabVisible(tab.perms);
  if (!visible) return null;
  return (
    <Tab
      id={tab.id}
      label={tab.label}
      badge={badge}
      active={active}
      disabled={disabled}
      muted={muted}
      onClick={onClick}
    />
  );
}

export default function TabStrip({ activeTab, onTabChange, results = [], hasResults = false }) {
  const breachCount = results.filter(r => r.found).length;

  return (
    <div className="flex items-stretch h-10 border-b border-sap-border overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      <div className="flex items-stretch shrink-0">
        {SUBJECT_TABS.map(tab => (
          <PermissionTab
            key={tab.id}
            tab={tab}
            badge={tab.id === 'breaches' && hasResults && breachCount > 0 ? `(${breachCount})` : null}
            active={activeTab === tab.id}
            disabled={tab.id !== 'overview' && !hasResults}
            onClick={onTabChange}
          />
        ))}
      </div>
      <div className="w-px bg-sap-border my-2 mx-1.5 shrink-0" />
      <div className="flex items-stretch shrink-0">
        {TOOL_TABS.map(tab => (
          <PermissionTab
            key={tab.id}
            tab={tab}
            active={activeTab === tab.id}
            muted
            onClick={onTabChange}
          />
        ))}
      </div>
    </div>
  );
}
