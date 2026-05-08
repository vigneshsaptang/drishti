import { useState, useEffect } from 'react';
import AdminNav from '../components/AdminNav';
import { adminGetRoles, adminCreateRole } from '../lib/api';

const ROLE_COLORS = {
  super_admin: 'bg-rose-500/15 text-rose-600',
  admin: 'bg-amber-500/15 text-amber-600',
  analyst: 'bg-blue-500/15 text-blue-600',
  viewer: 'bg-emerald-500/15 text-emerald-600',
};

function RoleBadge({ role }) {
  const cls = ROLE_COLORS[role] || 'bg-sap-border text-sap-dim';
  return <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase font-mono ${cls}`}>{role}</span>;
}

function PermissionTag({ perm }) {
  const domain = perm.split('.')[0];
  const colors = {
    engine: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    feature: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    admin: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };
  const cls = colors[domain] || 'bg-sap-border text-sap-dim border-sap-border';
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded border text-[9px] font-mono ${cls}`}>
      {perm}
    </span>
  );
}

function RoleCard({ role, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  const permCount = role.permissions?.length ?? 0;

  return (
    <div className="rounded-lg border border-sap-border bg-sap-surface overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <RoleBadge role={role._id} />
            <span className="text-sm font-semibold text-sap-text">{role.display_name || role._id}</span>
            {role.is_builtin && (
              <span className="px-1.5 py-0.5 rounded bg-sap-border text-[9px] font-mono text-sap-dim">Built-in</span>
            )}
            <span className="text-[10px] text-sap-muted font-mono">Level {role.level}</span>
          </div>
          {role.description && (
            <p className="text-xs text-sap-dim mt-1">{role.description}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-[10px] text-sap-muted">{permCount} permission{permCount !== 1 ? 's' : ''}</span>
            <span className="text-[10px] text-sap-muted">{role.user_count ?? 0} user{(role.user_count ?? 0) !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setExpanded(e => !e)}
            className="px-3 py-1.5 rounded-lg border border-sap-border text-xs text-sap-dim font-semibold hover:text-sap-text transition-colors"
          >
            {expanded ? 'Collapse' : 'Permissions'}
          </button>
          {onEdit && (
            <button
              onClick={() => onEdit(role)}
              className="px-3 py-1.5 rounded-lg bg-sap-accent text-white text-xs font-semibold hover:bg-sap-accent/90"
            >
              Edit
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="px-5 pb-4 border-t border-sap-border pt-3">
          <div className="flex flex-wrap gap-1">
            {(role.permissions || []).map(p => <PermissionTag key={p} perm={p} />)}
          </div>
          {role.limits && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {role.limits.max_search_depth != null && (
                <div className="text-[10px] text-sap-dim">
                  <span className="font-mono">max_depth</span>
                  <span className="ml-1 text-sap-text font-semibold">{role.limits.max_search_depth}</span>
                </div>
              )}
              {role.limits.rate && Object.entries(role.limits.rate).map(([k, v]) => (
                <div key={k} className="text-[10px] text-sap-dim">
                  <span className="font-mono">{k}</span>
                  <span className="ml-1 text-sap-text font-semibold">{v === -1 ? '∞' : v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CreateRoleModal({ groups, onClose, onCreated }) {
  const [id, setId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState(50);
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function toggleGroup(g) {
    setSelectedGroups(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    if (!id.trim()) { setError('Role ID is required'); return; }
    setSaving(true);
    try {
      await adminCreateRole({
        id: id.trim().toLowerCase(),
        display_name: displayName.trim() || undefined,
        description: description.trim() || undefined,
        level,
        permissions: selectedGroups,
      });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-sap-surface rounded-xl border border-sap-border shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-sap-border flex items-center justify-between">
          <span className="text-sm font-bold text-sap-text">Create Custom Role</span>
          <button onClick={onClose} className="text-sap-dim hover:text-sap-text">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <form onSubmit={handleCreate} className="px-5 py-4 space-y-3">
          <div>
            <label className="text-[10px] font-mono text-sap-dim uppercase tracking-wide">Role ID</label>
            <input
              className="mt-1 w-full rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent"
              placeholder="e.g. senior_analyst"
              value={id}
              onChange={e => setId(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[10px] font-mono text-sap-dim uppercase tracking-wide">Display Name</label>
            <input
              className="mt-1 w-full rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent"
              placeholder="e.g. Senior Analyst"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[10px] font-mono text-sap-dim uppercase tracking-wide">Description</label>
            <input
              className="mt-1 w-full rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[10px] font-mono text-sap-dim uppercase tracking-wide">Level (1-99)</label>
            <input
              type="number"
              min={1}
              max={99}
              className="mt-1 w-20 rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent"
              value={level}
              onChange={e => setLevel(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="text-[10px] font-mono text-sap-dim uppercase tracking-wide">Permission Groups</label>
            <div className="mt-1.5 space-y-1">
              {Object.keys(groups || {}).map(g => (
                <label key={g} className="flex items-center gap-2 text-xs text-sap-text cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedGroups.includes(g)}
                    onChange={() => toggleGroup(g)}
                    className="rounded border-sap-border"
                  />
                  <span className="font-mono text-[11px]">{g}</span>
                  <span className="text-sap-muted text-[10px]">({(groups[g] || []).length} perms)</span>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-entity-drug">{error}</p>}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-sap-accent text-white text-xs font-semibold hover:bg-sap-accent/90 disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Role'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-entity-drug/10 text-entity-drug text-xs font-semibold hover:bg-entity-drug/20"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminRoles({ onClose, onNavigate }) {
  const [roles, setRoles] = useState([]);
  const [groups, setGroups] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await adminGetRoles();
      setRoles(data.roles || []);
      setGroups(data.groups || {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

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
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 rounded-lg bg-sap-accent text-white text-xs font-semibold hover:bg-sap-accent/90"
        >
          Create Role
        </button>
      </div>
      <AdminNav active="admin-roles" onNavigate={onNavigate} />

      <div className="max-w-3xl mx-auto px-5 py-5 space-y-3">
        {loading && <p className="text-xs text-sap-dim text-center py-10">Loading roles...</p>}
        {error && <p className="text-xs text-entity-drug">{error}</p>}

        {roles.map(role => (
          <RoleCard key={role._id} role={role} />
        ))}
      </div>

      {showCreate && (
        <CreateRoleModal
          groups={groups}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}
