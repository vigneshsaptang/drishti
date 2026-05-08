import { useState, useEffect, useCallback } from 'react';
import { getAdminStatusMessages, postStatusMessage, updateStatusMessage } from '../lib/api';

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

const SEV_STYLES = {
  info: 'border-l-sap-accent bg-sap-accent/5',
  warning: 'border-l-amber-500 bg-amber-50',
  critical: 'border-l-entity-drug bg-red-50',
};

export default function StatusManager() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newMsg, setNewMsg] = useState('');
  const [severity, setSeverity] = useState('info');
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchMessages = useCallback(() => {
    setLoading(true);
    getAdminStatusMessages().then(d => { setMessages(d.messages || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  const handlePost = async () => {
    if (newMsg.trim().length < 5) { setError('Message must be at least 5 characters'); return; }
    setSaving(true);
    setError('');
    try {
      const body = { message: newMsg.trim(), severity };
      if (expiresAt) body.expires_at = new Date(expiresAt).toISOString();
      await postStatusMessage(body);
      setNewMsg('');
      setExpiresAt('');
      fetchMessages();
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  const handleDismiss = async (id) => {
    try { await updateStatusMessage(id, { active: false }); fetchMessages(); } catch { /* */ }
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-sm font-bold text-sap-text">System Status</h2>

      {/* New message form */}
      <div className="border border-sap-border rounded-lg p-4 space-y-3">
        <p className="text-[10px] font-mono text-sap-dim uppercase">Post New Status Message</p>
        <textarea value={newMsg} onChange={e => setNewMsg(e.target.value)} rows={2}
          className="w-full bg-sap-bg border border-sap-border rounded-lg px-3 py-2 text-xs text-sap-text resize-none"
          placeholder="Status message..." />
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="text-[10px] text-sap-dim block mb-1">Severity</label>
            <select value={severity} onChange={e => setSeverity(e.target.value)}
              className="bg-sap-bg border border-sap-border rounded-lg px-3 py-1.5 text-xs text-sap-text">
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-sap-dim block mb-1">Expires (optional)</label>
            <input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
              className="bg-sap-bg border border-sap-border rounded-lg px-3 py-1.5 text-xs text-sap-text" />
          </div>
          <button onClick={handlePost} disabled={saving || newMsg.trim().length < 5}
            className="bg-sap-accent text-white rounded-lg px-4 py-1.5 text-xs disabled:opacity-40">
            {saving ? 'Posting...' : 'Post'}
          </button>
        </div>
        {error && <p className="text-xs text-entity-drug">{error}</p>}
      </div>

      {/* Message list */}
      {loading ? (
        <p className="text-xs text-sap-dim text-center py-4">Loading...</p>
      ) : messages.length === 0 ? (
        <p className="text-xs text-sap-dim text-center py-4">No status messages</p>
      ) : (
        <div className="space-y-2">
          {messages.map(m => (
            <div key={String(m._id)} className={`border-l-4 rounded-r-lg p-3 flex items-start justify-between ${m.active ? (SEV_STYLES[m.severity] || SEV_STYLES.info) : 'bg-sap-bg/50 border-l-gray-300 opacity-60'}`}>
              <div>
                <p className="text-xs text-sap-text">{m.message}</p>
                <p className="text-[10px] text-sap-muted mt-0.5">
                  {m.severity} &middot; {formatTime(m.created_at)} by {m.author_name}
                  {!m.active && ' \u2022 dismissed'}
                  {m.expires_at && ` \u2022 expires ${formatTime(m.expires_at)}`}
                </p>
              </div>
              {m.active && (
                <button onClick={() => handleDismiss(String(m._id))} className="text-[10px] text-sap-muted hover:text-entity-drug shrink-0 ml-2">
                  Dismiss
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
