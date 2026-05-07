const SUBJECT_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'breaches', label: 'Breaches' },
  { id: 'darkweb', label: 'Dark Web' },
  { id: 'telegram', label: 'Social Intel' },
  { id: 'graph', label: 'Network' },
];

const TOOL_TABS = [
  { id: 'drugs', label: 'Drug Markets' },
  { id: 'financial', label: 'Financial' },
  { id: 'ecourts', label: 'Courts' },
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

export default function TabStrip({ activeTab, onTabChange, results = [], hasResults = false }) {
  const breachCount = results.filter(r => r.found).length;

  return (
    <div className="flex items-stretch h-10 border-b border-sap-border overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      <div className="flex items-stretch shrink-0">
        {SUBJECT_TABS.map(tab => (
          <Tab
            key={tab.id}
            id={tab.id}
            label={tab.label}
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
          <Tab
            key={tab.id}
            id={tab.id}
            label={tab.label}
            active={activeTab === tab.id}
            muted
            onClick={onTabChange}
          />
        ))}
      </div>
    </div>
  );
}
