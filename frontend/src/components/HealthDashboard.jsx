import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';

const ENGINE_META = {
  credmon:        { label: 'Breach Engine',      icon: '\u{1F6E1}' },
  darkmon:        { label: 'Darkweb Engine',     icon: '\u{1F578}' },
  fti:            { label: 'Threat Intel Engine', icon: '\u{26A0}' },
  platform:       { label: 'Platform DB',        icon: '\u{1F5C4}' },
  audit:          { label: 'Audit DB',           icon: '\u{1F4DC}' },
  client_errors:  { label: 'Client Errors',      icon: '\u{1F6A8}' },
};

const STATUS_DOT = {
  ok:             'bg-emerald-500',
  healthy:        'bg-emerald-500',
  degraded:       'bg-amber-500',
  error:          'bg-entity-drug',
  not_configured: 'bg-sap-muted',
};

const OVERALL_BANNER = {
  healthy:  { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', label: 'All systems operational' },
  degraded: { bg: 'bg-amber-50 border-amber-200',     text: 'text-amber-700',   label: 'Some systems degraded' },
};

function fmtCount(n) {
  if (n == null) return '--';
  return Number(n).toLocaleString();
}

function StatusDot({ status }) {
  const cls = STATUS_DOT[status] || STATUS_DOT.error;
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${cls}`} />;
}

function SkeletonCard() {
  return (
    <div className="bg-sap-surface border border-sap-border rounded-lg p-4 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-3 w-28 bg-sap-panel rounded" />
        <div className="h-2.5 w-2.5 bg-sap-panel rounded-full" />
      </div>
      <div className="space-y-2">
        <div className="h-2.5 w-20 bg-sap-panel rounded" />
        <div className="h-2.5 w-16 bg-sap-panel rounded" />
      </div>
    </div>
  );
}

function EngineCard({ engineKey, data }) {
  const meta = ENGINE_META[engineKey] || { label: engineKey, icon: '' };
  const status = data?.status || 'error';
  const isError = status === 'error';

  return (
    <div className={`bg-sap-surface border rounded-lg p-4 ${isError ? 'border-entity-drug/30' : 'border-sap-border'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-sap-text">{meta.label}</span>
        <StatusDot status={status} />
      </div>

      <div className="text-xs text-sap-dim space-y-1">
        {/* Engine checks: latency + canary count */}
        {data?.latency_ms != null && (
          <p>Latency: <span className="font-mono text-sap-text">{data.latency_ms}ms</span></p>
        )}
        {data?.canary_count != null && (
          <p>Documents: <span className="font-mono text-sap-text">{fmtCount(data.canary_count)}</span></p>
        )}

        {/* Platform check: user count */}
        {data?.user_count != null && (
          <p>Users: <span className="font-mono text-sap-text">{fmtCount(data.user_count)}</span></p>
        )}

        {/* Audit check */}
        {status === 'not_configured' && (
          <p className="text-sap-muted italic">Not configured</p>
        )}
        {data?.events_last_hour != null && (
          <p>Events (1h): <span className="font-mono text-sap-text">{fmtCount(data.events_last_hour)}</span></p>
        )}

        {/* Client errors */}
        {engineKey === 'client_errors' && (
          <>
            <p>
              Last hour:{' '}
              <span className={`font-mono ${data?.count_last_hour > 0 ? 'text-entity-drug font-semibold' : 'text-sap-text'}`}>
                {fmtCount(data?.count_last_hour)}
              </span>
            </p>
            <p>
              Last 24h:{' '}
              <span className="font-mono text-sap-text">{fmtCount(data?.count_last_24h)}</span>
            </p>
          </>
        )}

        {/* Error message */}
        {data?.error && (
          <p className="text-entity-drug truncate" title={data.error}>{data.error}</p>
        )}
      </div>
    </div>
  );
}

export default function HealthDashboard({ onClose }) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch('/api/health/deep');
      if (res.status === 403) {
        setError('Admin access required');
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError(`Request failed: ${res.status}`);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setHealth(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch health data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth(); // eslint-disable-line react-hooks/set-state-in-effect
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const overall = health?.status || 'healthy';
  const banner = OVERALL_BANNER[overall] || OVERALL_BANNER.degraded;
  const engines = health?.engines || {};
  const engineOrder = ['credmon', 'darkmon', 'fti', 'platform', 'audit', 'client_errors'];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-[520px] max-w-full bg-sap-surface border-l border-sap-border shadow-2xl overflow-y-auto animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 bg-sap-surface border-b border-sap-border px-5 py-3 flex items-center justify-between z-10">
          <h2 className="text-sm font-bold text-sap-text">Infrastructure Health</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchHealth}
              className="text-[10px] text-sap-accent hover:underline"
            >
              Check now
            </button>
            <button onClick={onClose} className="text-sap-dim hover:text-sap-text p-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Error state */}
          {error && !health && (
            <div className="rounded-lg border border-entity-drug/30 bg-red-50 p-4 text-center">
              <p className="text-xs text-entity-drug">{error}</p>
            </div>
          )}

          {/* Loading skeleton */}
          {loading && !health && (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          )}

          {/* Loaded state */}
          {health && (
            <>
              {/* Overall banner */}
              <div className={`rounded-lg border p-4 flex items-center gap-3 ${banner.bg}`}>
                <StatusDot status={overall === 'healthy' ? 'ok' : 'degraded'} />
                <span className={`text-sm font-medium ${banner.text}`}>{banner.label}</span>
                {health._cached && (
                  <span className="ml-auto text-[10px] text-sap-muted">
                    cached {health._age_s}s ago
                  </span>
                )}
              </div>

              {/* 6-card grid */}
              <div className="grid grid-cols-2 gap-3">
                {engineOrder.map(key => (
                  <EngineCard key={key} engineKey={key} data={engines[key]} />
                ))}
              </div>

              {/* Timestamp */}
              {health.timestamp && (
                <p className="text-[10px] text-sap-muted text-center">
                  Last probe: {new Date(health.timestamp).toLocaleTimeString()}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
