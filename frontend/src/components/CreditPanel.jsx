import { useState, useEffect } from 'react';
import { useCredits } from '../lib/creditContext';
import { getCreditUsage } from '../lib/api';

function BarChart({ data }) {
  if (!data || data.length === 0) return <p className="text-sap-dim text-xs">No usage data</p>;
  const max = Math.max(...data.map(d => d.credits), 1);

  return (
    <div className="space-y-1.5">
      {data.slice(0, 8).map(d => (
        <div key={d.action} className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-sap-dim w-28 truncate text-right">{d.action.replace(/_/g, ' ')}</span>
          <div className="flex-1 h-3 bg-sap-bg rounded overflow-hidden border border-sap-border">
            <div
              className="h-full bg-sap-accent/70 rounded transition-all"
              style={{ width: `${(d.credits / max) * 100}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-sap-muted w-10 text-right tabular-nums">{d.credits}</span>
        </div>
      ))}
    </div>
  );
}

function Sparkline({ data }) {
  if (!data || data.length < 2) return null;
  const W = 200;
  const H = 40;
  const max = Math.max(...data.map(d => d.credits), 1);
  const step = W / (data.length - 1);
  const points = data.map((d, i) => `${i * step},${H - (d.credits / max) * (H - 4) - 2}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-10" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke="var(--color-sap-accent, #d97706)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export default function CreditPanel({ onClose }) {
  const { remaining, monthly, used, dailyUsed, dailyLimit, overage } = useCredits();
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getCreditUsage(null, 30).then(data => {
      if (!cancelled) { setUsage(data); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const pct = monthly > 0 ? Math.max(0, (remaining / monthly) * 100) : 100;
  const burnRate = usage?.daily_trend?.length > 0
    ? Math.round(usage.daily_trend.reduce((s, d) => s + d.credits, 0) / usage.daily_trend.length)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-md bg-sap-surface border-l border-sap-border shadow-2xl overflow-y-auto animate-slide-in-right">
        <div className="sticky top-0 bg-sap-surface border-b border-sap-border px-5 py-3 flex items-center justify-between z-10">
          <h2 className="text-sm font-bold text-sap-text">Credit Usage</h2>
          <button onClick={onClose} className="text-sap-dim hover:text-sap-text transition-colors p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Balance summary */}
          <div className="rounded-lg border border-sap-border p-4 bg-sap-bg/50">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-2xl font-bold font-mono tabular-nums text-sap-text">{(remaining ?? 0).toLocaleString()}</span>
              <span className="text-xs text-sap-dim font-mono">/ {(monthly ?? 0).toLocaleString()}</span>
            </div>
            <div className="w-full h-2 rounded-full bg-sap-border overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${pct > 50 ? 'bg-emerald-500' : pct > 10 ? 'bg-amber-500' : 'bg-rose-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-[10px] font-mono text-sap-dim">
              <span>{used?.toLocaleString()} used</span>
              {dailyLimit && <span>Today: {dailyUsed}/{dailyLimit}</span>}
              {burnRate > 0 && <span>~{burnRate}/day avg</span>}
            </div>
            {overage === 'hard' && (
              <p className="mt-2 text-[10px] text-rose-600 font-mono">Hard limit &mdash; searches blocked when credits depleted</p>
            )}
          </div>

          {/* Usage by action */}
          <div>
            <h3 className="text-[10px] font-mono text-sap-dim uppercase tracking-widest mb-2">Usage by Action</h3>
            {loading ? <p className="text-xs text-sap-dim">Loading...</p> : <BarChart data={usage?.by_action} />}
          </div>

          {/* Daily trend */}
          {usage?.daily_trend?.length > 1 && (
            <div>
              <h3 className="text-[10px] font-mono text-sap-dim uppercase tracking-widest mb-2">Daily Trend (30d)</h3>
              <div className="rounded border border-sap-border p-2 bg-sap-bg/30">
                <Sparkline data={usage.daily_trend} />
              </div>
            </div>
          )}

          {/* Recent transactions */}
          <div>
            <h3 className="text-[10px] font-mono text-sap-dim uppercase tracking-widest mb-2">Recent Transactions</h3>
            {loading ? (
              <p className="text-xs text-sap-dim">Loading...</p>
            ) : !usage?.recent_transactions?.length ? (
              <p className="text-xs text-sap-dim">No transactions yet</p>
            ) : (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {usage.recent_transactions.slice(0, 30).map((tx, i) => (
                  <div key={tx._id || i} className="flex items-center justify-between py-1.5 px-2 rounded bg-sap-bg/30 border border-sap-border/50">
                    <div className="min-w-0">
                      <span className="text-[11px] font-mono text-sap-text">{tx.action?.replace(/_/g, ' ')}</span>
                      <span className="text-[10px] text-sap-dim ml-2">{formatTime(tx.created_at)}</span>
                    </div>
                    <span className={`text-[11px] font-mono font-semibold tabular-nums ${tx.type === 'credit' ? 'text-emerald-600' : 'text-sap-dim'}`}>
                      {tx.type === 'credit' ? '+' : '-'}{tx.amount}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
