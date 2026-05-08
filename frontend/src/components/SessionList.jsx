import { useEffect, useState } from 'react';
import { getSessions, revokeSession, revokeAllSessions } from '../lib/api';

function timeAgo(dateStr) {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SessionList({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revoking, setRevoking] = useState(null);
  const [revokingAll, setRevokingAll] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const d = await getSessions();
      setData(d);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleRevoke(id) {
    setRevoking(id);
    try {
      await revokeSession(id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setRevoking(null);
    }
  }

  async function handleRevokeAll() {
    setRevokingAll(true);
    try {
      await revokeAllSessions(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setRevokingAll(false);
    }
  }

  const sessions = data?.sessions ?? [];
  const maxConcurrent = data?.max_concurrent;
  const otherSessions = sessions.filter((s) => !s.is_current);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-sap-surface rounded-xl border border-sap-border shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-sap-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-sap-text">Active Sessions</span>
            {maxConcurrent != null && (
              <span className="px-1.5 py-0.5 rounded bg-sap-border text-[10px] font-mono text-sap-dim">
                max {maxConcurrent} concurrent
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-sap-dim hover:text-sap-text transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="px-5 py-4">
          {loading && <p className="text-xs text-sap-dim">Loading…</p>}
          {error && <p className="text-xs text-entity-drug">{error}</p>}

          {!loading && sessions.length === 0 && (
            <p className="text-xs text-sap-dim">No active sessions.</p>
          )}

          <div className="space-y-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-sap-border bg-sap-bg px-4 py-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <svg className="mt-0.5 shrink-0 text-sap-dim w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" strokeWidth="2"/><line x1="8" y1="21" x2="16" y2="21" strokeWidth="2"/><line x1="12" y1="17" x2="12" y2="21" strokeWidth="2"/></svg>
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-sap-text truncate">
                        {session.device_label || 'Unknown device'}
                      </span>
                      {session.is_current && (
                        <span className="px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 text-[10px] font-mono">
                          Current
                        </span>
                      )}
                    </div>
                    {session.ip_address && (
                      <p className="text-[11px] text-sap-dim font-mono">{session.ip_address}</p>
                    )}
                    <div className="flex gap-3 pt-0.5 flex-wrap">
                      <span className="text-[10px] text-sap-dim">
                        Created {formatDate(session.created_at)}
                      </span>
                      <span className="text-[10px] text-sap-dim">
                        Active {timeAgo(session.last_refreshed_at)}
                      </span>
                    </div>
                  </div>
                </div>

                {!session.is_current && (
                  <button
                    onClick={() => handleRevoke(session.id)}
                    disabled={revoking === session.id}
                    className="shrink-0 px-4 py-2 rounded-lg bg-entity-drug/10 text-entity-drug text-xs font-semibold hover:bg-entity-drug/20 disabled:opacity-50"
                  >
                    {revoking === session.id ? 'Revoking…' : 'Revoke'}
                  </button>
                )}
              </div>
            ))}
          </div>

          {otherSessions.length > 0 && (
            <>
              <div className="my-4 border-t border-sap-border" />
              <div className="flex justify-end">
                <button
                  onClick={handleRevokeAll}
                  disabled={revokingAll}
                  className="px-4 py-2 rounded-lg bg-entity-drug/10 text-entity-drug text-xs font-semibold hover:bg-entity-drug/20 disabled:opacity-50"
                >
                  {revokingAll ? 'Revoking…' : 'Revoke All Other Sessions'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
