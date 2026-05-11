import { useEffect, useState, useCallback } from 'react';
import { getApiKeys, createApiKey, revokeApiKey } from '../lib/api';

const XIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>;
const CopyIcon = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>;
const CheckIcon = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>;
const KeyIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.78 7.78 5.5 5.5 0 017.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>;

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
  if (!dateStr) return 'Never';
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const EXPIRY_OPTIONS = [
  { label: 'Never', value: null },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '1 year', value: 365 },
];

function CopyBox({ value }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="mt-3 rounded-lg border border-sap-border bg-sap-bg p-3 space-y-2">
      <p className="text-[10px] font-mono text-entity-drug uppercase tracking-wide">
        Store this key securely. It will not be shown again.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs font-mono text-sap-text break-all">{value}</code>
        <button
          onClick={handleCopy}
          className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sap-accent text-white text-xs font-semibold hover:bg-sap-accent/90"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export default function ApiKeyManager({ onClose }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revoking, setRevoking] = useState(null);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newExpiry, setNewExpiry] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getApiKeys();
      setKeys(data.keys ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- data-fetching effect, setState in async callback is intentional
  useEffect(() => { load(); }, [load]);

  async function handleRevoke(id) {
    setRevoking(id);
    try {
      await revokeApiKey(id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setRevoking(null);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError('');
    setNewKeyValue('');
    if (!newName.trim()) {
      setCreateError('Name is required.');
      return;
    }
    setSubmitting(true);
    try {
      const data = await createApiKey(newName.trim(), newExpiry);
      setNewKeyValue(data.key || data.api_key || '');
      setNewName('');
      setNewExpiry(null);
      await load();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-sap-surface rounded-xl border border-sap-border shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-sap-border flex items-center justify-between">
          <span className="text-sm font-bold text-sap-text">API Keys</span>
          <button onClick={onClose} className="text-sap-dim hover:text-sap-text transition-colors">
            <XIcon />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {loading && <p className="text-xs text-sap-dim">Loading…</p>}
          {error && <p className="text-xs text-entity-drug">{error}</p>}

          {!loading && keys.length === 0 && (
            <p className="text-xs text-sap-dim">No API keys yet.</p>
          )}

          {keys.map((key) => (
            <div
              key={key.id}
              className="rounded-lg border border-sap-border bg-sap-bg px-4 py-3 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 text-sap-dim"><KeyIcon /></span>
                  <span className="text-xs font-semibold text-sap-text truncate">{key.name}</span>
                  {key.status && key.status !== 'active' && (
                    <span className="px-1.5 py-0.5 rounded bg-entity-drug/15 text-entity-drug text-[10px] font-mono">
                      {key.status}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleRevoke(key.id)}
                  disabled={revoking === key.id}
                  className="shrink-0 px-4 py-2 rounded-lg bg-entity-drug/10 text-entity-drug text-xs font-semibold hover:bg-entity-drug/20 disabled:opacity-50"
                >
                  {revoking === key.id ? 'Revoking…' : 'Revoke'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                <div>
                  <span className="text-[10px] text-sap-dim font-mono">Prefix </span>
                  <code className="text-[11px] text-sap-text font-mono">{key.key_prefix}…</code>
                </div>
                <div>
                  <span className="text-[10px] text-sap-dim font-mono">Created </span>
                  <span className="text-[11px] text-sap-text">{formatDate(key.created_at)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-sap-dim font-mono">Last used </span>
                  <span className="text-[11px] text-sap-text">{timeAgo(key.last_used_at)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-sap-dim font-mono">Expires </span>
                  <span className="text-[11px] text-sap-text">{formatDate(key.expires_at)}</span>
                </div>
              </div>
            </div>
          ))}

          <div className="my-4 border-t border-sap-border" />

          {!creating ? (
            <button
              onClick={() => { setCreating(true); setNewKeyValue(''); setCreateError(''); }}
              className="px-4 py-2 rounded-lg bg-sap-accent text-white text-xs font-semibold hover:bg-sap-accent/90"
            >
              Create Key
            </button>
          ) : (
            <form onSubmit={handleCreate} className="space-y-3">
              <p className="text-xs font-semibold text-sap-text">New API Key</p>
              <div>
                <label className="text-[10px] font-mono text-sap-dim uppercase tracking-wide">Name</label>
                <input
                  autoFocus
                  placeholder="e.g. CI pipeline"
                  className="mt-1 w-full rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent focus:ring-1 focus:ring-sap-accent/30"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-sap-dim uppercase tracking-wide">Expiry</label>
                <select
                  className="mt-1 w-full rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent focus:ring-1 focus:ring-sap-accent/30"
                  value={newExpiry ?? ''}
                  onChange={(e) => setNewExpiry(e.target.value === '' ? null : Number(e.target.value))}
                >
                  {EXPIRY_OPTIONS.map((o) => (
                    <option key={String(o.value)} value={o.value ?? ''}>{o.label}</option>
                  ))}
                </select>
              </div>
              {createError && <p className="text-xs text-entity-drug">{createError}</p>}
              {newKeyValue && <CopyBox value={newKeyValue} />}
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-sap-accent text-white text-xs font-semibold hover:bg-sap-accent/90 disabled:opacity-50"
                >
                  {submitting ? 'Creating…' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => { setCreating(false); setNewKeyValue(''); setCreateError(''); }}
                  className="px-4 py-2 rounded-lg bg-entity-drug/10 text-entity-drug text-xs font-semibold hover:bg-entity-drug/20"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
