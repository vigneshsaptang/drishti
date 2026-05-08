import { useState, useEffect, useCallback } from 'react';
import AdminNav from '../components/AdminNav';
import ActivityFeed from '../components/ActivityFeed';
import { adminGetAuditLog, getAuditEvents, auditExportCsvUrl, auditExportJsonUrl } from '../lib/api';

const CATEGORY_OPTIONS = ['search', 'auth', 'admin', 'data', 'export', 'system'];
const SEVERITY_OPTIONS = ['info', 'warn', 'error', 'critical'];

const PLATFORM_ACTIONS = [
  'login_success', 'login_failed', 'login_locked_out', 'logout',
  'token_refreshed', 'user_created', 'user_updated', 'user_deleted',
  'password_changed', 'password_reset', 'sessions_revoked',
  'api_key_created', 'api_key_revoked', 'config_updated',
];

function timeAgo(ts) {
  if (!ts) return '\u2014';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

function formatTs(ts) {
  if (!ts) return '\u2014';
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function ActionBadge({ action }) {
  const isFailure = action?.includes('fail') || action?.includes('locked') || action?.includes('error');
  const isCreate = action?.includes('creat') || action?.includes('success') || action?.includes('execute');
  const isDanger = action?.includes('delet') || action?.includes('revok');
  const isWarn = action?.includes('warn') || action?.includes('cancel');

  const cls = isFailure
    ? 'bg-rose-500/15 text-rose-600'
    : isDanger
    ? 'bg-amber-500/15 text-amber-600'
    : isWarn
    ? 'bg-yellow-500/15 text-yellow-600'
    : isCreate
    ? 'bg-emerald-500/15 text-emerald-600'
    : 'bg-blue-500/15 text-blue-600';

  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase font-mono ${cls}`}>
      {action || '\u2014'}
    </span>
  );
}

function SeverityDot({ severity }) {
  const colors = {
    info: 'bg-blue-400',
    warn: 'bg-yellow-400',
    error: 'bg-rose-400',
    critical: 'bg-rose-600 animate-pulse',
  };
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors[severity] || 'bg-sap-dim'}`} />;
}

function DetailCell({ detail }) {
  const [expanded, setExpanded] = useState(false);
  if (!detail || (typeof detail === 'object' && Object.keys(detail).length === 0))
    return <td className="px-3 py-2.5 border-b border-sap-border/50 text-sap-muted">\u2014</td>;

  const text = typeof detail === 'string' ? detail : JSON.stringify(detail);
  const truncated = text.length > 60 && !expanded;

  return (
    <td className="px-3 py-2.5 border-b border-sap-border/50 max-w-xs">
      <span
        className="text-sap-dim text-xs cursor-pointer hover:text-sap-text transition-colors"
        onClick={() => setExpanded(e => !e)}
        title={expanded ? 'Click to collapse' : 'Click to expand'}
      >
        {truncated ? `${text.slice(0, 60)}\u2026` : text}
      </span>
    </td>
  );
}

const TH = ({ children }) => (
  <th className="text-[10px] font-mono text-sap-dim uppercase tracking-wide text-left px-3 py-2 border-b border-sap-border">
    {children}
  </th>
);
const TD = ({ children, className = '' }) => (
  <td className={`px-3 py-2.5 border-b border-sap-border/50 ${className}`}>{children}</td>
);

function PlatformAuditTable({ action, actorQ, from, to }) {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const perPage = 50;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (p = page) => {
    setLoading(true); setError('');
    try {
      const params = { page: p, per_page: perPage };
      if (action) params.action = action;
      if (actorQ) params.actor_id = actorQ;
      if (from) params.from = from;
      if (to) params.to = to;
      const data = await adminGetAuditLog(params);
      setEntries(data.entries || []);
      setTotal(data.total || 0);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [page, action, actorQ, from, to]);

  useEffect(() => { setPage(1); load(1); }, [action, actorQ, from, to]);
  useEffect(() => { load(page); }, [page]);

  return (
    <div>
      {error && <p className="text-xs text-entity-drug mb-3">{error}</p>}
      <div className="rounded-lg border border-sap-border bg-sap-surface overflow-hidden">
        <table className="w-full text-xs">
          <thead><tr><TH>Time</TH><TH>Actor</TH><TH>Action</TH><TH>Target</TH><TH>IP</TH><TH>Detail</TH></tr></thead>
          <tbody>
            {entries.length === 0 && !loading && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-xs text-sap-muted">No entries.</td></tr>
            )}
            {entries.map((e, i) => (
              <tr key={e.id || e._id || i} className="hover:bg-sap-panel/40 transition-colors">
                <TD><span className="font-mono text-sap-dim text-[10px]" title={formatTs(e.timestamp)}>{timeAgo(e.timestamp)}</span></TD>
                <TD><span className="font-mono font-semibold text-sap-text">{e.actor_username || '\u2014'}</span></TD>
                <TD><ActionBadge action={e.action} /></TD>
                <TD><span className="text-sap-dim">{e.target_id || '\u2014'}</span></TD>
                <TD><span className="font-mono text-sap-muted text-[10px]">{e.ip_address || '\u2014'}</span></TD>
                <DetailCell detail={e.detail} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-sap-muted">{total} entries</span>
        <div className="flex items-center gap-3">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg border border-sap-border text-xs text-sap-dim hover:text-sap-text disabled:opacity-40 transition-colors">Prev</button>
          <span className="text-xs text-sap-dim">Page {page}/{totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg border border-sap-border text-xs text-sap-dim hover:text-sap-text disabled:opacity-40 transition-colors">Next</button>
        </div>
      </div>
    </div>
  );
}

function ComprehensiveAuditTable({ category, severity, userIdQ, from, to }) {
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (p = page) => {
    setLoading(true); setError('');
    try {
      const params = { page: p, page_size: pageSize };
      if (category) params.category = category;
      if (severity) params.severity = severity;
      if (userIdQ) params.user_id = userIdQ;
      if (from) params.date_from = from;
      if (to) params.date_to = to;
      const data = await getAuditEvents(params);
      setEvents(data.events || []);
      setTotal(data.total || 0);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [page, category, severity, userIdQ, from, to]);

  useEffect(() => { setPage(1); load(1); }, [category, severity, userIdQ, from, to]);
  useEffect(() => { load(page); }, [page]);

  return (
    <div>
      {error && <p className="text-xs text-entity-drug mb-3">{error}</p>}
      <div className="rounded-lg border border-sap-border bg-sap-surface overflow-hidden">
        <table className="w-full text-xs">
          <thead><tr><TH>Time</TH><TH>User</TH><TH>Category</TH><TH>Action</TH><TH>IP</TH><TH>Latency</TH><TH>Detail</TH></tr></thead>
          <tbody>
            {events.length === 0 && !loading && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-xs text-sap-muted">No audit events found. Audit logging may not be configured.</td></tr>
            )}
            {events.map((e, i) => (
              <tr key={e.event_id || i} className="hover:bg-sap-panel/40 transition-colors">
                <TD><span className="font-mono text-sap-dim text-[10px]" title={formatTs(e.timestamp)}>{timeAgo(e.timestamp)}</span></TD>
                <TD><span className="font-mono font-semibold text-sap-text">{e.username || '\u2014'}</span></TD>
                <TD><span className="px-1.5 py-0.5 rounded bg-sap-border text-[9px] font-mono text-sap-dim">{e.category}</span></TD>
                <TD><ActionBadge action={e.action} /></TD>
                <TD><span className="font-mono text-sap-muted text-[10px]">{e.client_ip || '\u2014'}</span></TD>
                <TD><span className="font-mono text-sap-muted text-[10px]">{e.response_time_ms != null ? `${e.response_time_ms}ms` : '\u2014'}</span></TD>
                <DetailCell detail={e.detail} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-sap-muted">{total} events</span>
        <div className="flex items-center gap-3">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg border border-sap-border text-xs text-sap-dim hover:text-sap-text disabled:opacity-40 transition-colors">Prev</button>
          <span className="text-xs text-sap-dim">Page {page}/{totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg border border-sap-border text-xs text-sap-dim hover:text-sap-text disabled:opacity-40 transition-colors">Next</button>
        </div>
      </div>
    </div>
  );
}

export default function AdminAuditLog({ onClose, onNavigate }) {
  const [view, setView] = useState('comprehensive');
  const [action, setAction] = useState('');
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('');
  const [userIdQ, setUserIdQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  function handleExportCsv() {
    const params = {};
    if (from) params.date_from = from;
    if (to) params.date_to = to;
    if (category) params.category = category;
    window.open(auditExportCsvUrl(params), '_blank');
  }

  function handleExportJson() {
    const params = {};
    if (from) params.date_from = from;
    if (to) params.date_to = to;
    if (category) params.category = category;
    window.open(auditExportJsonUrl(params), '_blank');
  }

  return (
    <div className="fixed inset-0 z-50 bg-sap-bg overflow-y-auto">
      <div className="sticky top-0 z-10 bg-sap-surface border-b border-sap-border px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="flex items-center gap-1.5 text-xs text-sap-dim hover:text-sap-accent transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Back
          </button>
          <span className="text-sm font-bold text-sap-text">Administration</span>
        </div>
        <div className="flex items-center gap-2">
          {view === 'comprehensive' && (
            <>
              <button onClick={handleExportCsv}
                className="px-3 py-1.5 rounded-lg border border-sap-border text-xs text-sap-dim font-semibold hover:text-sap-text transition-colors">
                Export CSV
              </button>
              <button onClick={handleExportJson}
                className="px-3 py-1.5 rounded-lg border border-sap-border text-xs text-sap-dim font-semibold hover:text-sap-text transition-colors">
                Export JSON
              </button>
            </>
          )}
        </div>
      </div>
      <AdminNav active="admin-audit" onNavigate={onNavigate} />

      <div className="max-w-7xl mx-auto px-5 py-5 flex gap-5">
        <aside className="w-64 shrink-0 hidden lg:block">
          <ActivityFeed />
        </aside>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setView('comprehensive')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                view === 'comprehensive'
                  ? 'bg-sap-accent text-white'
                  : 'border border-sap-border text-sap-dim hover:text-sap-text'
              }`}
            >
              Comprehensive Audit
            </button>
            <button
              onClick={() => setView('platform')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                view === 'platform'
                  ? 'bg-sap-accent text-white'
                  : 'border border-sap-border text-sap-dim hover:text-sap-text'
              }`}
            >
              Platform Events
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-4">
            {view === 'comprehensive' ? (
              <>
                <select value={category} onChange={e => setCategory(e.target.value)}
                  className="rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent">
                  <option value="">All Categories</option>
                  {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={severity} onChange={e => setSeverity(e.target.value)}
                  className="rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent">
                  <option value="">All Severities</option>
                  {SEVERITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input type="text" placeholder="User ID..." value={userIdQ} onChange={e => setUserIdQ(e.target.value)}
                  className="rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent w-48" />
              </>
            ) : (
              <>
                <select value={action} onChange={e => setAction(e.target.value)}
                  className="rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent">
                  <option value="">All Actions</option>
                  {PLATFORM_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </>
            )}
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-mono text-sap-dim uppercase tracking-wide">From</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent" />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-mono text-sap-dim uppercase tracking-wide">To</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                className="rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent" />
            </div>
            {(action || category || severity || userIdQ || from || to) && (
              <button
                onClick={() => { setAction(''); setCategory(''); setSeverity(''); setUserIdQ(''); setFrom(''); setTo(''); }}
                className="text-xs text-sap-muted hover:text-sap-accent transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {view === 'comprehensive' ? (
            <ComprehensiveAuditTable category={category} severity={severity} userIdQ={userIdQ} from={from} to={to} />
          ) : (
            <PlatformAuditTable action={action} actorQ={userIdQ} from={from} to={to} />
          )}
        </div>
      </div>
    </div>
  );
}
