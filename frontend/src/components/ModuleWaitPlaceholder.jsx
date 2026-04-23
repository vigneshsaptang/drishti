const TITLES = {
  overview: 'Overview',
  breaches: 'Breaches',
  darkweb: 'Dark web',
  drugs: 'Drugs',
  telegram: 'Telegram',
  financial: 'Financial',
  graph: 'Entity graph',
};

export default function ModuleWaitPlaceholder({ activeTab }) {
  if (activeTab === 'drugs') return null;
  return (
    <div className="tactical-surface rounded-lg border border-sap-border/90 p-8 max-w-lg mx-auto text-center">
      <p className="text-[10px] font-mono uppercase tracking-widest text-amber-200/80">No result set</p>
      <h2 className="text-base font-semibold text-sap-text mt-2">{TITLES[activeTab] || 'Module'}</h2>
      <p className="text-sm text-sap-dim mt-2">
        Run a case query in the command deck. Streaming intelligence will populate this panel when the first matching records arrive.
      </p>
    </div>
  );
}
