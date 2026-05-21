import { useState, useEffect, useCallback } from 'react';
import AdminNav from '../components/AdminNav';
import {
  adminGetUsers,
  adminCreateUser,
  adminUpdateUser,
  adminDeleteUser,
  adminResetPassword,
  adminRevokeUserSessions,
} from '../lib/api';

function timeAgo(ts) {
  if (!ts) return 'Never';
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

function StatusBadge({ status }) {
  if (status === 'active')
    return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-500/15 text-emerald-600">active</span>;
  return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-rose-500/15 text-rose-600">disabled</span>;
}

function CreateUserModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    username: '',
    email: '',
    display_name: '',
    role: 'analyst',
    password: '',
    force_password_change: true,
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
      await adminCreateUser(form);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-sap-surface rounded-xl border border-sap-border shadow-2xl p-5">
        <h2 className="text-sm font-bold text-sap-text mb-4">Create User</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-mono text-sap-dim uppercase tracking-wide mb-1">Username</label>
              <input
                required
                value={form.username}
                onChange={e => set('username', e.target.value)}
                className="w-full rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-sap-dim uppercase tracking-wide mb-1">Role</label>
              <select
                value={form.role}
                onChange={e => set('role', e.target.value)}
                className="w-full rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent"
              >
                <option value="viewer">Viewer</option>
                <option value="analyst">Analyst</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-mono text-sap-dim uppercase tracking-wide mb-1">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={e => set('email', e.target.value)}
              className="w-full rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent"
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono text-sap-dim uppercase tracking-wide mb-1">Display Name</label>
            <input
              value={form.display_name}
              onChange={e => set('display_name', e.target.value)}
              className="w-full rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent"
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono text-sap-dim uppercase tracking-wide mb-1">Temporary Password</label>
            <input
              type="password"
              required
              value={form.password}
              onChange={e => set('password', e.target.value)}
              className="w-full rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-sap-dim cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.force_password_change}
              onChange={e => set('force_password_change', e.target.checked)}
              className="rounded"
            />
            Require password change on first login
          </label>
          {error && <p className="text-xs text-entity-drug">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-sap-border text-xs text-sap-dim hover:text-sap-text transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-3 py-1.5 rounded-lg bg-sap-accent text-white text-xs font-semibold hover:bg-sap-accent/90 disabled:opacity-50">
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditUserModal({ user, onClose, onSuccess }) {
  const [form, setForm] = useState({
    display_name: user.display_name || '',
    email: user.email || '',
    role: user.role || 'analyst',
    status: user.status || 'active',
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
      await adminUpdateUser(user.id || user._id, form);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-sap-surface rounded-xl border border-sap-border shadow-2xl p-5">
        <h2 className="text-sm font-bold text-sap-text mb-4">Edit User — {user.username}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[10px] font-mono text-sap-dim uppercase tracking-wide mb-1">Display Name</label>
            <input
              value={form.display_name}
              onChange={e => set('display_name', e.target.value)}
              className="w-full rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent"
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono text-sap-dim uppercase tracking-wide mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              className="w-full rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-mono text-sap-dim uppercase tracking-wide mb-1">Role</label>
              <select
                value={form.role}
                onChange={e => set('role', e.target.value)}
                className="w-full rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent"
              >
                <option value="viewer">Viewer</option>
                <option value="analyst">Analyst</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-mono text-sap-dim uppercase tracking-wide mb-1">Status</label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value)}
                className="w-full rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent"
              >
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
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

function ResetPasswordModal({ user, onClose }) {
  const [tempPassword, setTempPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    adminResetPassword(user.id || user._id)
      .then(data => setTempPassword(data.temp_password || ''))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [user]);

  function handleCopy() {
    navigator.clipboard.writeText(tempPassword).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-sap-surface rounded-xl border border-sap-border shadow-2xl p-5">
        <h2 className="text-sm font-bold text-sap-text mb-1">Password Reset — {user.username}</h2>
        <p className="text-xs text-sap-dim mb-4">A temporary password has been generated. Share it securely with the user.</p>
        {loading && <p className="text-xs text-sap-muted">Generating…</p>}
        {error && <p className="text-xs text-entity-drug">{error}</p>}
        {tempPassword && (
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm font-mono text-sap-text select-all">
              {tempPassword}
            </code>
            <button
              onClick={handleCopy}
              className="px-3 py-2 rounded-lg bg-sap-accent text-white text-xs font-semibold hover:bg-sap-accent/90 whitespace-nowrap"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-sap-border text-xs text-sap-dim hover:text-sap-text transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ user, onClose, onSuccess }) {
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    setError('');
    try {
      await adminDeleteUser(user.id || user._id);
      onSuccess();
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-sap-surface rounded-xl border border-sap-border shadow-2xl p-5">
        <h2 className="text-sm font-bold text-sap-text mb-2">Delete User</h2>
        <p className="text-xs text-sap-dim mb-1">
          You are about to delete <span className="font-semibold text-sap-text">{user.username}</span>.
        </p>
        <p className="text-xs text-entity-drug mb-4">This action cannot be undone.</p>
        {error && <p className="text-xs text-entity-drug mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-sap-border text-xs text-sap-dim hover:text-sap-text transition-colors">
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-3 py-1.5 rounded-lg bg-entity-drug/10 text-entity-drug text-xs font-semibold hover:bg-entity-drug/20 disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
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

export default function AdminUsers({ onClose, onNavigate }) {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [modal, setModal] = useState(null);
  const [actionError, setActionError] = useState('');

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const load = useCallback(async (p) => {
    setLoading(true);
    setError('');
    try {
      const params = { page: p, per_page: perPage };
      if (q) params.q = q;
      if (status) params.status = status;
      const data = await adminGetUsers(params);
      setUsers(data.users || data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [perPage, q, status]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- data-fetching effect, setState in async callback is intentional
  useEffect(() => { load(1); setPage(1); }, [load]);
  // page-only effect: intentionally omits `load` to avoid re-fetch loops when filters change
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { load(page); }, [page]);

  function refresh() {
    setModal(null);
    load(page);
  }

  async function handleToggleStatus(user) {
    setActionError('');
    const newStatus = user.status === 'active' ? 'disabled' : 'active';
    try {
      await adminUpdateUser(user.id || user._id, { status: newStatus });
      load(page);
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function handleRevokeSessions(user) {
    setActionError('');
    try {
      await adminRevokeUserSessions(user.id || user._id);
    } catch (err) {
      setActionError(err.message);
    }
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
        <button
          onClick={() => setModal({ type: 'create' })}
          className="px-3 py-1.5 rounded-lg bg-sap-accent text-white text-xs font-semibold hover:bg-sap-accent/90"
        >
          Create User
        </button>
      </div>
      <AdminNav active="admin-users" onNavigate={onNavigate} />

      <div className="max-w-6xl mx-auto px-5 py-5">
        <div className="flex items-center gap-3 mb-4">
          <input
            type="search"
            placeholder="Search by username, email, or name…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent w-72"
          />
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
          {loading && <span className="text-xs text-sap-muted">Loading…</span>}
        </div>

        {error && <p className="text-xs text-entity-drug mb-3">{error}</p>}
        {actionError && <p className="text-xs text-entity-drug mb-3">{actionError}</p>}

        <div className="rounded-lg border border-sap-border bg-sap-surface overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <TH>Username</TH>
                <TH>Display Name</TH>
                <TH>Email</TH>
                <TH>Role</TH>
                <TH>Status</TH>
                <TH>Last Login</TH>
                <TH>Actions</TH>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-xs text-sap-muted">No users found.</td>
                </tr>
              )}
              {users.map(user => (
                <tr key={user.id || user._id} className="hover:bg-sap-panel/40 transition-colors">
                  <TD><span className="font-mono font-semibold text-sap-text">{user.username}</span></TD>
                  <TD>{user.display_name || <span className="text-sap-muted">—</span>}</TD>
                  <TD><span className="text-sap-dim">{user.email}</span></TD>
                  <TD><RoleBadge role={user.role} /></TD>
                  <TD><StatusBadge status={user.status} /></TD>
                  <TD><span className="text-sap-muted">{timeAgo(user.last_login)}</span></TD>
                  <TD>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setModal({ type: 'edit', user })}
                        className="px-2 py-1 rounded text-[10px] font-semibold border border-sap-border text-sap-dim hover:text-sap-text hover:border-sap-accent/50 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setModal({ type: 'reset', user })}
                        className="px-2 py-1 rounded text-[10px] font-semibold border border-sap-border text-sap-dim hover:text-sap-text hover:border-sap-accent/50 transition-colors"
                      >
                        Reset PW
                      </button>
                      <button
                        onClick={() => handleToggleStatus(user)}
                        className={`px-2 py-1 rounded text-[10px] font-semibold border transition-colors ${
                          user.status === 'active'
                            ? 'border-rose-200 text-rose-500 hover:bg-rose-50'
                            : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                        }`}
                      >
                        {user.status === 'active' ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => handleRevokeSessions(user)}
                        className="px-2 py-1 rounded text-[10px] font-semibold border border-sap-border text-sap-dim hover:text-sap-text transition-colors"
                      >
                        Revoke
                      </button>
                      <button
                        onClick={() => setModal({ type: 'delete', user })}
                        className="px-2 py-1 rounded text-[10px] font-semibold border border-rose-200 text-entity-drug hover:bg-rose-50 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-sap-muted">{total} total users</span>
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

      {modal?.type === 'create' && (
        <CreateUserModal onClose={() => setModal(null)} onSuccess={refresh} />
      )}
      {modal?.type === 'edit' && (
        <EditUserModal user={modal.user} onClose={() => setModal(null)} onSuccess={refresh} />
      )}
      {modal?.type === 'reset' && (
        <ResetPasswordModal user={modal.user} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'delete' && (
        <DeleteConfirmModal user={modal.user} onClose={() => setModal(null)} onSuccess={refresh} />
      )}
    </div>
  );
}
