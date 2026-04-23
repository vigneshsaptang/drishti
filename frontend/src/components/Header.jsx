import { useState, useEffect } from 'react';
import { signOut } from '../lib/auth';

function formatTime(d) {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export default function Header({ data }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleExport = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auracle-report-${data.seed?.value || 'export'}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasTarget = data?.seed?.value;

  return (
    <header className="shrink-0 border-b border-sap-border bg-sap-surface px-5 h-12 flex items-center justify-between gap-4">
      {/* Left: Logo + active target */}
      <div className="flex items-center gap-3 min-w-0">
        <img src="/saptang-logo.svg" alt="" className="h-6 w-auto opacity-80" onError={e => e.target.style.display='none'} />
        <div className="h-4 w-px bg-sap-border" />
        <h1 className="text-sm font-bold tracking-tight text-sap-text">Auracle</h1>

        {hasTarget && (
          <>
            <div className="h-4 w-px bg-sap-border hidden sm:block" />
            <div className="hidden sm:flex items-center gap-2 min-w-0">
              <span className="px-1.5 py-0.5 rounded bg-sap-accent/10 text-sap-accent text-[10px] font-mono font-bold uppercase">{data.seed.type}</span>
              <span className="text-sm font-mono text-sap-text truncate max-w-[220px]">{data.seed.value}</span>
            </div>
          </>
        )}
      </div>

      {/* Right: Actions — compact single row */}
      <div className="flex items-center gap-2.5 shrink-0 text-xs">
        {data && (
          <button type="button" onClick={handleExport}
            className="hidden sm:flex items-center gap-1.5 text-sap-dim hover:text-sap-accent border border-sap-border rounded px-2.5 py-1 transition-colors font-medium">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
        )}
        <div className="flex items-center gap-1.5 text-sap-muted font-mono">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="tabular-nums">{formatTime(now)}</span>
        </div>
        <div className="h-4 w-px bg-sap-border" />
        <button type="button" onClick={signOut} className="text-sap-muted hover:text-entity-drug transition-colors font-medium">
          Sign out
        </button>
      </div>
    </header>
  );
}
