const TITLES = {
  overview: 'Subject Profiling',
  breaches: 'Digital Footprint',
  darkweb: 'Dark Web Monitoring',
  drugs: 'Drug Markets',
  telegram: 'Social Media Intelligence',
  financial: 'Financial Trail Analysis',
  graph: 'Network Mapping',
};

export default function ModuleWaitPlaceholder({ activeTab }) {
  if (activeTab === 'drugs') return null;
  return (
    <div className="tactical-surface rounded-lg border border-sap-border/90 p-8 max-w-lg mx-auto text-center">
      <p className="text-[10px] font-mono uppercase tracking-widest text-amber-200/80">No result set</p>
      <h2 className="text-base font-semibold text-sap-text mt-2">{TITLES[activeTab] || 'Module'}</h2>
      <p className="text-sm text-sap-dim mt-2">
        Enter a contact number or email above to begin profiling. The platform will automatically trace linked accounts, digital footprint, and related identifiers.
      </p>
    </div>
  );
}
