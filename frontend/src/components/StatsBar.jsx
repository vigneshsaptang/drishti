export default function StatsBar({ data }) {
  if (!data) return null;

  const b = data.breach || {};
  const ti = data.threat_intel || {};
  const tg = ti.telegram || {};

  let breachCount = 0;
  (b.results || []).forEach(r => { if (r.sources) breachCount += r.sources.length; });

  const items = [
    { label: 'Entities searched', value: b.total_searched || 0, sub: 'Depth scan' },
    { label: 'Records found', value: b.total_found || 0, sub: 'Matches' },
    { label: 'Breach sources', value: breachCount, sub: 'Databases' },
    { label: 'Telegram mentions', value: (tg.total_mentions || 0).toLocaleString(), sub: 'Channels' },
    { label: 'Run time', value: `${data.total_time_ms || 0}ms`, sub: 'Total' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 px-1">
      {items.map(row => (
        <div
          key={row.label}
          className="rounded-lg border border-sap-border bg-sap-surface px-3.5 py-3 shadow-sm"
        >
          <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-sap-muted font-medium">{row.label}</p>
          <p className="text-xl font-mono font-bold text-sap-text tabular-nums mt-0.5">{row.value}</p>
          <p className="text-[10px] font-mono text-sap-dim">{row.sub}</p>
        </div>
      ))}
    </div>
  );
}
