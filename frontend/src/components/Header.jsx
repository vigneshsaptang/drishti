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

  const subject = data?.seed?.value || '— no case loaded —';
  const st = data?.seed?.type;
  const label = st ? st.toUpperCase() : '—';

  return (
    <header className="shrink-0 border-b border-sap-border bg-sap-surface px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
      <div className="min-w-0 flex items-center gap-4">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-10 h-10 rounded-lg border border-sap-accent/30 bg-sap-accent/10 flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-sap-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-4 4h2m-6-8h8a2 2 0 012 2v8a2 2 0 01-2 2H7a2 2 0 01-2-2v-8a2 2 0 012-2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-sap-text font-sans">Auracle</h1>
            <p className="text-[10px] font-mono text-sap-dim uppercase tracking-[0.18em]">by Saptang Labs</p>
          </div>
        </div>
        <div className="hidden sm:block h-8 w-px bg-sap-border" />
        <div className="min-w-0 hidden sm:block">
          <p className="text-[9px] font-mono text-sap-muted uppercase tracking-wider">Active target</p>
          <p className="text-xs font-mono text-sap-text truncate" title={subject === '— no case loaded —' ? undefined : String(subject)}>
            <span className="text-sap-dim mr-1.5">[{label}]</span>
            {subject}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        {data && (
          <button
            type="button"
            onClick={handleExport}
            className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-sap-dim hover:text-sap-text border border-sap-border rounded-md px-2.5 py-1.5 transition-colors uppercase tracking-wider"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Intel Report
          </button>
        )}
        <button
          type="button"
          onClick={signOut}
          className="text-[9px] font-mono text-sap-muted hover:text-rose-400/90 uppercase tracking-wider px-2 py-1.5"
        >
          Sign out
        </button>
        <div className="text-right font-mono text-[10px] sm:text-xs">
          <p className="text-sap-muted">UTC</p>
          <p className="text-sap-text tabular-nums">{formatTime(now)}</p>
        </div>
        <div className="flex items-center gap-1.5 pl-2 sm:pl-3 border-l border-sap-border">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
          <span className="text-[9px] sm:text-[10px] font-mono text-emerald-500/90 uppercase tracking-wider">Live</span>
        </div>
      </div>
    </header>
  );
}
