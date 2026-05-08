import { useState, useEffect } from 'react';
import { getSystemStatus } from '../lib/api';

const ENGINE_LABELS = {
  credmon: 'Breach Intelligence',
  darkmon: 'Dark Web Intelligence',
  fti: 'Threat Intelligence',
};

const STATUS_STYLES = {
  operational: { dot: 'bg-emerald-500', bg: 'text-emerald-600', banner: 'bg-emerald-50 border-emerald-200 text-emerald-600' },
  degraded: { dot: 'bg-amber-500', bg: 'text-amber-600', banner: 'bg-amber-50 border-amber-200 text-amber-600' },
  down: { dot: 'bg-entity-drug', bg: 'text-entity-drug', banner: 'bg-red-50 border-red-200 text-entity-drug' },
};

const SEVERITY_STYLES = {
  info: 'border-l-sap-accent bg-sap-accent/5',
  warning: 'border-l-amber-500 bg-amber-50',
  critical: 'border-l-entity-drug bg-red-50',
};

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

export default function StatusPage({ isOpen, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = () => {
    setLoading(true);
    getSystemStatus().then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (isOpen) fetchStatus(); }, [isOpen]);

  if (!isOpen) return null;

  const overall = data?.overall_status || 'operational';
  const oStyles = STATUS_STYLES[overall] || STATUS_STYLES.operational;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[480px] max-w-full bg-sap-surface border-l border-sap-border shadow-2xl overflow-y-auto animate-slide-in-right">
        <div className="sticky top-0 bg-sap-surface border-b border-sap-border px-5 py-3 flex items-center justify-between z-10">
          <h2 className="text-sm font-bold text-sap-text">System Status</h2>
          <div className="flex items-center gap-2">
            <button onClick={fetchStatus} className="text-[10px] text-sap-accent hover:underline">Check now</button>
            <button onClick={onClose} className="text-sap-dim hover:text-sap-text p-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <p className="text-xs text-sap-dim text-center py-8">Checking systems...</p>
          ) : !data ? (
            <p className="text-xs text-sap-dim text-center py-8">Unable to check status</p>
          ) : (
            <>
              {/* Overall banner */}
              <div className={`rounded-lg border p-4 flex items-center gap-3 ${oStyles.banner}`}>
                <span className={`w-3 h-3 rounded-full ${STATUS_STYLES[overall].dot}`} />
                <span className="text-sm font-medium">
                  {overall === 'operational' ? 'All Systems Operational' : overall === 'degraded' ? 'Some Systems Degraded' : 'System Outage Detected'}
                </span>
              </div>

              {/* Engine cards */}
              {data.engines && Object.entries(data.engines).map(([key, eng]) => {
                const s = STATUS_STYLES[eng.status] || STATUS_STYLES.operational;
                return (
                  <div key={key} className="bg-sap-surface border border-sap-border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-sap-text">{eng.label || ENGINE_LABELS[key] || key}</span>
                      <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
                    </div>
                    <div className="text-xs text-sap-dim space-y-0.5">
                      {eng.latency_ms != null && <p>Latency: {eng.latency_ms.toLocaleString()}ms</p>}
                      {eng.last_checked && <p>Last checked: {formatTime(eng.last_checked)}</p>}
                      {eng.note && <p className={`${s.bg} font-medium`}>{eng.note}</p>}
                    </div>
                  </div>
                );
              })}

              {/* Status messages */}
              {data.messages?.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono text-sap-dim uppercase tracking-widest mb-2">Status Messages</p>
                  <div className="space-y-2">
                    {data.messages.map(m => (
                      <div key={String(m._id)} className={`border-l-4 rounded-r-lg p-3 ${SEVERITY_STYLES[m.severity] || SEVERITY_STYLES.info}`}>
                        <p className="text-xs text-sap-text">{m.message}</p>
                        <p className="text-[10px] text-sap-muted mt-1">Posted {formatTime(m.created_at)}{m.author_name ? ` by ${m.author_name}` : ''}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
