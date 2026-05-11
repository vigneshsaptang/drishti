import { useState, useEffect, useCallback } from 'react';
import AdminNav from '../components/AdminNav';
import {
  adminCreditOverview,
  adminTopupCredits,
  adminAdjustCredits,
  adminGetCreditTransactions,
  adminUpdateCreditConfig,
  getCostMatrix,
} from '../lib/api';

const ROLE_COLORS = {
  super_admin: 'bg-rose-500/15 text-rose-600',
  admin: 'bg-amber-500/15 text-amber-600',
  analyst: 'bg-blue-500/15 text-blue-600',
  viewer: 'bg-emerald-500/15 text-emerald-600',
};

function RoleBadge({ role }) {
  const cls = ROLE_COLORS[role] || 'bg-sap-border text-sap-dim';
  return <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${cls}`}>{role}</span>;
}

const TH = ({ children }) => (
  <th className="text-[10px] font-mono text-sap-dim uppercase tracking-wide text-left px-3 py-2 border-b border-sap-border">
    {children}
  </th>
);

const TD = ({ children, className = '' }) => (
  <td className={`px-3 py-2.5 border-b border-sap-border/50 ${className}`}>
    {children}
  </td>
);

const ACTION_LABELS = {
  combined_search: 'Combined Search',
  credmon_search: 'Breach Search',
  darkmon_search: 'Darkweb Search',
  fti_screening: 'Threat Screening',
  ecourts_search: 'eCourts Search',
  ecourts_case: 'eCourts Case',
  ecourts_order_md: 'eCourts Order',
  ecourts_order_ai: 'eCourts AI Analysis',
  mca_lookup: 'MCA Lookup',
  mca_batch: 'MCA Batch',
  report_export: 'Report Export',
};

function formatAction(key) {
  return ACTION_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function TopUpModal({ user, onClose, onSuccess }) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const num = parseInt(amount, 10);
    if (!num || num <= 0) { setError('Enter a positive number'); return; }
    setSaving(true);
    setError('');
    try {
      await adminTopupCredits(user.user_id, num);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-sap-surface rounded-xl border border-sap-border shadow-2xl p-5">
        <h2 className="text-sm font-bold text-sap-text mb-4">Top Up Credits — {user.username}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[10px] font-mono text-sap-dim uppercase tracking-wide mb-1">Amount</label>
            <input
              type="number"
              min="1"
              required
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="e.g. 500"
              className="w-full rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent"
            />
          </div>
          {error && <p className="text-xs text-entity-drug">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-sap-border text-xs text-sap-dim hover:text-sap-text transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-3 py-1.5 rounded-lg bg-sap-accent text-white text-xs font-semibold hover:bg-sap-accent/90 disabled:opacity-50">
              {saving ? 'Adding…' : 'Add Credits'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AdjustLimitsModal({ user, onClose, onSuccess }) {
  const [form, setForm] = useState({
    monthly_allocation: '',
    daily_limit: '',
    overage_policy: 'soft',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { overage_policy: form.overage_policy };
      if (form.monthly_allocation !== '') payload.monthly_allocation = parseInt(form.monthly_allocation, 10) || null;
      if (form.daily_limit !== '') payload.daily_limit = parseInt(form.daily_limit, 10) || null;
      await adminAdjustCredits(user.user_id, payload);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-sap-surface rounded-xl border border-sap-border shadow-2xl p-5">
        <h2 className="text-sm font-bold text-sap-text mb-4">Adjust Limits — {user.username}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[10px] font-mono text-sap-dim uppercase tracking-wide mb-1">Monthly Allocation</label>
            <input
              type="number"
              min="0"
              value={form.monthly_allocation}
              onChange={e => set('monthly_allocation', e.target.value)}
              placeholder="Leave empty for no change"
              className="w-full rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent"
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono text-sap-dim uppercase tracking-wide mb-1">Daily Limit</label>
            <input
              type="number"
              min="0"
              value={form.daily_limit}
              onChange={e => set('daily_limit', e.target.value)}
              placeholder="Leave empty for no change"
              className="w-full rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent"
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono text-sap-dim uppercase tracking-wide mb-1">Overage Policy</label>
            <select
              value={form.overage_policy}
              onChange={e => set('overage_policy', e.target.value)}
              className="w-full rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent"
            >
              <option value="soft">Soft (warn but allow)</option>
              <option value="hard">Hard (block at limit)</option>
            </select>
          </div>
          {error && <p className="text-xs text-entity-drug">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-sap-border text-xs text-sap-dim hover:text-sap-text transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-3 py-1.5 rounded-lg bg-sap-accent text-white text-xs font-semibold hover:bg-sap-accent/90 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OverviewSection() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await adminCreditOverview());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- data-fetching effect, setState in async callback is intentional
  useEffect(() => { load(); }, [load]);

  function refresh() {
    setModal(null);
    load();
  }

  if (loading) return <p className="text-xs text-sap-muted py-8 text-center">Loading overview…</p>;
  if (error) return <p className="text-xs text-entity-drug py-4">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-6">
        <div className="rounded-lg border border-sap-border bg-sap-surface px-4 py-3">
          <p className="text-[10px] font-mono text-sap-dim uppercase tracking-wide mb-0.5">Period</p>
          <p className="text-sm font-semibold text-sap-text">{data.period}</p>
        </div>
        <div className="rounded-lg border border-sap-border bg-sap-surface px-4 py-3">
          <p className="text-[10px] font-mono text-sap-dim uppercase tracking-wide mb-0.5">Total Consumed</p>
          <p className="text-sm font-semibold text-sap-accent">{(data.total_credits_consumed ?? 0).toLocaleString()}</p>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-bold text-sap-text mb-2">Users</h3>
        <div className="rounded-lg border border-sap-border bg-sap-surface overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <TH>Username</TH>
                <TH>Role</TH>
                <TH>Credits Used</TH>
                <TH>Searches</TH>
                <TH>Actions</TH>
              </tr>
            </thead>
            <tbody>
              {(!data.users || data.users.length === 0) && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-xs text-sap-muted">No users found.</td></tr>
              )}
              {(data.users || []).map(u => (
                <tr key={u.user_id} className="hover:bg-sap-panel/40 transition-colors">
                  <TD><span className="font-mono font-semibold text-sap-text">{u.username}</span></TD>
                  <TD><RoleBadge role={u.role} /></TD>
                  <TD><span className="text-sap-text">{(u.credits_used ?? 0).toLocaleString()}</span></TD>
                  <TD><span className="text-sap-dim">{(u.searches ?? 0).toLocaleString()}</span></TD>
                  <TD>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setModal({ type: 'topup', user: u })}
                        className="px-2 py-1 rounded text-[10px] font-semibold border border-sap-border text-sap-dim hover:text-sap-text hover:border-sap-accent/50 transition-colors"
                      >
                        Top Up
                      </button>
                      <button
                        onClick={() => setModal({ type: 'adjust', user: u })}
                        className="px-2 py-1 rounded text-[10px] font-semibold border border-sap-border text-sap-dim hover:text-sap-text hover:border-sap-accent/50 transition-colors"
                      >
                        Adjust Limits
                      </button>
                    </div>
                  </TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {data.top_actions && data.top_actions.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-sap-text mb-2">Top Actions</h3>
          <div className="rounded-lg border border-sap-border bg-sap-surface overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <TH>Action</TH>
                  <TH>Total Credits</TH>
                  <TH>Count</TH>
                </tr>
              </thead>
              <tbody>
                {data.top_actions.map(a => (
                  <tr key={a.action} className="hover:bg-sap-panel/40 transition-colors">
                    <TD><span className="text-sap-text">{formatAction(a.action)}</span></TD>
                    <TD><span className="text-sap-text">{(a.total ?? 0).toLocaleString()}</span></TD>
                    <TD><span className="text-sap-dim">{(a.count ?? 0).toLocaleString()}</span></TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal?.type === 'topup' && (
        <TopUpModal user={modal.user} onClose={() => setModal(null)} onSuccess={refresh} />
      )}
      {modal?.type === 'adjust' && (
        <AdjustLimitsModal user={modal.user} onClose={() => setModal(null)} onSuccess={refresh} />
      )}
    </div>
  );
}

function TransactionsSection() {
  const [txns, setTxns] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');
  const [actionKeys, setActionKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  useEffect(() => {
    getCostMatrix().then(m => {
      if (m && typeof m === 'object') setActionKeys(Object.keys(m));
    }).catch(() => {});
  }, []);

  const load = useCallback(async (p) => {
    setLoading(true);
    setError('');
    try {
      const params = { page: String(p), per_page: String(perPage) };
      if (filterUser) params.user_id = filterUser;
      if (filterAction) params.action = filterAction;
      if (filterPeriod) params.period = filterPeriod;
      const data = await adminGetCreditTransactions(params);
      setTxns(data.transactions || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [perPage, filterUser, filterAction, filterPeriod]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- data-fetching effect, setState in async callback is intentional
  useEffect(() => { load(1); setPage(1); }, [load]);
  // page-only effect: intentionally omits `load` to avoid re-fetch loops when filters change
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { load(page); }, [page]);

  function typeColor(type) {
    if (type === 'credit' || type === 'bonus') return 'text-emerald-600';
    if (type === 'debit') return 'text-entity-drug';
    return 'text-sap-dim';
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Filter by user ID…"
          value={filterUser}
          onChange={e => setFilterUser(e.target.value)}
          className="rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent w-48"
        />
        <select
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
          className="rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent"
        >
          <option value="">All Actions</option>
          {actionKeys.map(k => (
            <option key={k} value={k}>{formatAction(k)}</option>
          ))}
        </select>
        <input
          type="month"
          value={filterPeriod}
          onChange={e => setFilterPeriod(e.target.value)}
          className="rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent"
        />
        {loading && <span className="text-xs text-sap-muted">Loading…</span>}
      </div>

      {error && <p className="text-xs text-entity-drug">{error}</p>}

      <div className="rounded-lg border border-sap-border bg-sap-surface overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <TH>Timestamp</TH>
              <TH>User</TH>
              <TH>Action</TH>
              <TH>Type</TH>
              <TH>Amount</TH>
              <TH>Balance After</TH>
            </tr>
          </thead>
          <tbody>
            {txns.length === 0 && !loading && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-sap-muted">No transactions found.</td></tr>
            )}
            {txns.map((tx, i) => (
              <tr key={tx._id || tx.id || i} className="hover:bg-sap-panel/40 transition-colors">
                <TD>
                  <span className="text-sap-muted font-mono">
                    {tx.timestamp ? new Date(tx.timestamp).toLocaleString() : '—'}
                  </span>
                </TD>
                <TD><span className="font-mono text-sap-text">{tx.username || tx.user_id || '—'}</span></TD>
                <TD><span className="text-sap-text">{formatAction(tx.action || '')}</span></TD>
                <TD>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${typeColor(tx.type)}`}>
                    {tx.type || '—'}
                  </span>
                </TD>
                <TD>
                  <span className={typeColor(tx.type)}>
                    {tx.type === 'debit' ? '-' : '+'}{Math.abs(tx.amount ?? 0).toLocaleString()}
                  </span>
                </TD>
                <TD><span className="text-sap-dim">{(tx.balance_after ?? 0).toLocaleString()}</span></TD>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-sap-muted">{total.toLocaleString()} total transactions</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg border border-sap-border text-xs text-sap-dim hover:text-sap-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-xs text-sap-dim">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg border border-sap-border text-xs text-sap-dim hover:text-sap-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function CostMatrixSection() {
  const [matrix, setMatrix] = useState({});
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    getCostMatrix()
      .then(m => {
        const data = (m && typeof m === 'object') ? m : {};
        setMatrix(data);
        setDraft(data);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function handleChange(key, val) {
    setDraft(d => ({ ...d, [key]: parseInt(val, 10) || 0 }));
  }

  const hasChanges = JSON.stringify(matrix) !== JSON.stringify(draft);

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await adminUpdateCreditConfig({ cost_matrix: draft });
      setMatrix({ ...draft });
      setSuccess('Cost matrix updated successfully.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-xs text-sap-muted py-8 text-center">Loading cost matrix…</p>;

  const keys = Object.keys(draft);

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-entity-drug">{error}</p>}
      {success && <p className="text-xs text-emerald-600">{success}</p>}

      <div className="rounded-lg border border-sap-border bg-sap-surface overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <TH>Action</TH>
              <TH>Cost (credits)</TH>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 && (
              <tr><td colSpan={2} className="px-3 py-6 text-center text-xs text-sap-muted">No cost matrix configured.</td></tr>
            )}
            {keys.map(key => (
              <tr key={key} className="hover:bg-sap-panel/40 transition-colors">
                <TD><span className="text-sap-text">{formatAction(key)}</span></TD>
                <TD>
                  <input
                    type="number"
                    min="0"
                    value={draft[key]}
                    onChange={e => handleChange(key, e.target.value)}
                    className="w-24 rounded-lg border border-sap-border bg-sap-bg px-2 py-1 text-sm text-sap-text outline-none focus:border-sap-accent"
                  />
                </TD>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="px-3 py-1.5 rounded-lg bg-sap-accent text-white text-xs font-semibold hover:bg-sap-accent/90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

const SECTIONS = [
  { key: 'overview', label: 'Usage Overview' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'cost-matrix', label: 'Cost Matrix' },
];

export default function AdminCredits({ onClose, onNavigate }) {
  const [section, setSection] = useState('overview');

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
      </div>
      <AdminNav active="admin-credits" onNavigate={onNavigate} />

      <div className="max-w-6xl mx-auto px-5 py-5">
        <div className="flex items-center gap-1 mb-5">
          {SECTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                section === s.key
                  ? 'bg-sap-accent/10 text-sap-accent'
                  : 'text-sap-dim hover:text-sap-text'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {section === 'overview' && <OverviewSection />}
        {section === 'transactions' && <TransactionsSection />}
        {section === 'cost-matrix' && <CostMatrixSection />}
      </div>
    </div>
  );
}
