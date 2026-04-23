const TABS = [
  { id: 'overview', label: 'Overview', sub: 'Summary' },
  { id: 'breaches', label: 'Breaches', sub: 'CREDMON' },
  { id: 'darkweb', label: 'Dark web', sub: 'DARKMON' },
  { id: 'drugs', label: 'Drugs', sub: 'Markets' },
  { id: 'telegram', label: 'Telegram', sub: 'TELEMON' },
  { id: 'financial', label: 'Financial', sub: 'UPI & banks' },
  { id: 'graph', label: 'Graph', sub: 'Entity web' },
];

const icons = {
  overview: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
  ),
  breaches: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />,
  darkweb: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />,
  drugs: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />,
  telegram: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />,
  financial: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
  graph: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />,
};

export default function SidebarNav({ activeTab, onTabChange }) {
  return (
    <aside className="w-60 shrink-0 border-r border-sap-border bg-sap-surface flex flex-col">
      <div className="p-4 border-b border-sap-border">
        <p className="text-[10px] font-mono text-sap-accent uppercase tracking-[0.25em] font-semibold">Workspace</p>
        <p className="text-sm font-bold text-sap-text mt-0.5 truncate">Saptang</p>
      </div>
      <nav className="flex-1 p-2.5 space-y-1 overflow-y-auto" aria-label="Module navigation">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all ${
                isActive
                  ? 'bg-sap-accent/10 text-sap-accent border border-sap-accent/30 shadow-sm'
                  : 'text-sap-dim hover:text-sap-text hover:bg-sap-panel border border-transparent'
              }`}
            >
              <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-sap-accent/20' : 'bg-sap-panel'}`}>
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {icons[tab.id]}
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium leading-tight">{tab.label}</span>
                <span className="block text-[10px] font-mono text-sap-muted leading-tight">{tab.sub}</span>
              </span>
            </button>
          );
        })}
      </nav>
      <div className="p-3.5 border-t border-sap-border text-[10px] font-mono text-sap-muted space-y-1.5">
        <div className="flex justify-between">
          <span>Engines</span>
          <span className="text-emerald-600 font-medium">3 online</span>
        </div>
        <div className="h-px bg-sap-border" />
        <p className="text-sap-dim">Saptang API · v1</p>
      </div>
    </aside>
  );
}
