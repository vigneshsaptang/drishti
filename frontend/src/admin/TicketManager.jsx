import { useState, useEffect, useCallback } from 'react';
import { getAdminTickets, getAdminTicketDetail, updateTicketStatus, assignTicket, addTicketNote, replyToTicket, adminGetUsers } from '../lib/api';

const STATUS_COLORS = {
  new: 'bg-blue-500', acknowledged: 'bg-purple-500', in_progress: 'bg-amber-500',
  resolved: 'bg-emerald-500', closed: 'bg-gray-400',
};

const TRANSITIONS = {
  new: ['acknowledged', 'in_progress', 'closed'],
  acknowledged: ['in_progress', 'closed'],
  in_progress: ['resolved', 'closed'],
  resolved: ['closed', 'in_progress'],
  closed: ['in_progress'],
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

function TicketDetail({ ticketId, onBack, smtpEnabled }) {
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newStatus, setNewStatus] = useState('');
  const [replyText, setReplyText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [saving, setSaving] = useState(false);
  const [admins, setAdmins] = useState([]);

  const fetch = useCallback(() => {
    setLoading(true);
    getAdminTicketDetail(ticketId).then(t => { setTicket(t); setNewStatus(t.status); setLoading(false); }).catch(() => setLoading(false));
  }, [ticketId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => { adminGetUsers({ role: 'admin' }).then(d => setAdmins(d.users || [])).catch(() => {}); }, []);

  const handleStatusUpdate = async () => {
    if (!newStatus || newStatus === ticket.status) return;
    setSaving(true);
    try { await updateTicketStatus(ticketId, newStatus); fetch(); } catch { /* */ }
    setSaving(false);
  };

  const handleAssign = async (userId) => {
    setSaving(true);
    try { await assignTicket(ticketId, userId || null); fetch(); } catch { /* */ }
    setSaving(false);
  };

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSaving(true);
    try { await replyToTicket(ticketId, replyText.trim(), sendEmail); setReplyText(''); fetch(); } catch { /* */ }
    setSaving(false);
  };

  const handleNote = async () => {
    if (!noteText.trim()) return;
    setSaving(true);
    try { await addTicketNote(ticketId, noteText.trim()); setNoteText(''); fetch(); } catch { /* */ }
    setSaving(false);
  };

  if (loading) return <p className="text-xs text-sap-dim p-4">Loading...</p>;
  if (!ticket) return <p className="text-xs text-sap-dim p-4">Ticket not found</p>;

  const validTransitions = TRANSITIONS[ticket.status] || [];

  return (
    <div className="p-4">
      <button onClick={onBack} className="text-xs text-sap-accent hover:underline mb-3 flex items-center gap-1">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to list
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
        {/* Left: content */}
        <div className="space-y-4">
          <div>
            <p className="font-mono text-[10px] text-sap-muted">{ticket.ticket_id}</p>
            <p className="text-sm font-bold text-sap-text mt-1">{ticket.subject}</p>
            <p className="text-xs text-sap-dim mt-0.5">
              {ticket.category?.replace(/_/g, ' ')} {ticket.severity ? `\u2022 ${ticket.severity}` : ''}
              {' '}&middot; by {ticket.username} ({ticket.user_role}) &middot; {formatTime(ticket.created_at)}
            </p>
          </div>

          <div className="rounded-lg border border-sap-border p-4">
            <p className="text-xs text-sap-text whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
          </div>

          {ticket.steps_to_reproduce && (
            <div className="rounded-lg border border-sap-border p-4">
              <p className="text-[10px] font-mono text-sap-dim uppercase mb-2">Steps to Reproduce</p>
              <p className="text-xs text-sap-text whitespace-pre-wrap">{ticket.steps_to_reproduce}</p>
            </div>
          )}

          {ticket.context && (
            <details className="text-xs">
              <summary className="text-sap-muted cursor-pointer hover:text-sap-dim">Technical Context</summary>
              <div className="mt-1 p-2 rounded bg-sap-bg border border-sap-border font-mono text-[10px] text-sap-muted space-y-0.5">
                {Object.entries(ticket.context).map(([k, v]) => v ? <p key={k}>{k}: {typeof v === 'string' ? v : JSON.stringify(v)}</p> : null)}
              </div>
            </details>
          )}

          {/* Replies */}
          {ticket.replies?.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-mono text-sap-dim uppercase">Replies</p>
              {ticket.replies.map((r, i) => (
                <div key={String(r.reply_id || i)} className="bg-sap-panel rounded-lg p-3">
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] font-medium text-sap-text">{r.author_name}</span>
                    <span className="text-[10px] text-sap-muted">{formatTime(r.created_at)}</span>
                  </div>
                  <p className="text-xs text-sap-text whitespace-pre-wrap">{r.content}</p>
                </div>
              ))}
            </div>
          )}

          {/* Reply composer */}
          <div className="space-y-2">
            <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={3}
              className="w-full bg-sap-bg border border-sap-border rounded-lg px-3 py-2 text-xs text-sap-text resize-none"
              placeholder="Write a reply..." />
            <div className="flex items-center justify-between">
              {smtpEnabled && (
                <label className="flex items-center gap-1.5 text-[10px] text-sap-dim">
                  <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} className="rounded" />
                  Send email notification
                </label>
              )}
              <button onClick={handleReply} disabled={!replyText.trim() || saving}
                className="bg-sap-accent text-white rounded-lg px-4 py-1.5 text-xs font-medium disabled:opacity-40">
                Reply
              </button>
            </div>
          </div>
        </div>

        {/* Right: sidebar */}
        <div className="space-y-3">
          {/* Status */}
          <div className="border border-sap-border rounded-lg p-3">
            <p className="text-[10px] font-mono text-sap-dim uppercase mb-2">Status</p>
            <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
              className="w-full bg-sap-bg border border-sap-border rounded-lg px-2 py-1.5 text-xs text-sap-text mb-2">
              <option value={ticket.status}>{ticket.status.replace('_', ' ')}</option>
              {validTransitions.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
            <button onClick={handleStatusUpdate} disabled={newStatus === ticket.status || saving}
              className="w-full bg-sap-accent text-white rounded px-3 py-1.5 text-xs disabled:opacity-40">
              Update Status
            </button>
          </div>

          {/* Assignment */}
          <div className="border border-sap-border rounded-lg p-3">
            <p className="text-[10px] font-mono text-sap-dim uppercase mb-2">Assigned To</p>
            <select onChange={e => handleAssign(e.target.value)}
              defaultValue={ticket.assigned_to ? String(ticket.assigned_to) : ''}
              className="w-full bg-sap-bg border border-sap-border rounded-lg px-2 py-1.5 text-xs text-sap-text">
              <option value="">Unassigned</option>
              {admins.map(a => <option key={String(a._id)} value={String(a._id)}>{a.username}</option>)}
            </select>
          </div>

          {/* Details */}
          <div className="border border-sap-border rounded-lg p-3 text-xs space-y-1">
            <p className="text-[10px] font-mono text-sap-dim uppercase mb-1">Details</p>
            <p><span className="text-sap-muted">Type:</span> <span className="text-sap-text">{ticket.type}</span></p>
            <p><span className="text-sap-muted">Category:</span> <span className="text-sap-text">{ticket.category?.replace(/_/g, ' ')}</span></p>
            {ticket.severity && <p><span className="text-sap-muted">Severity:</span> <span className="text-sap-text">{ticket.severity}</span></p>}
            <p><span className="text-sap-muted">Email:</span> <span className="text-sap-text">{ticket.email_status}</span></p>
            {ticket.email_error && <p className="text-entity-drug text-[10px]">{ticket.email_error}</p>}
          </div>

          {/* Submitter */}
          <div className="border border-sap-border rounded-lg p-3 text-xs space-y-1">
            <p className="text-[10px] font-mono text-sap-dim uppercase mb-1">Submitter</p>
            <p><span className="text-sap-muted">Username:</span> <span className="text-sap-text">{ticket.username}</span></p>
            <p><span className="text-sap-muted">Role:</span> <span className="text-sap-text">{ticket.user_role}</span></p>
            {ticket.user_email && <p><span className="text-sap-muted">Email:</span> <span className="text-sap-text">{ticket.user_email}</span></p>}
          </div>

          {/* Internal notes */}
          <div className="border border-sap-border rounded-lg p-3">
            <p className="text-[10px] font-mono text-sap-dim uppercase mb-2">Internal Notes ({ticket.internal_notes?.length || 0})</p>
            {ticket.internal_notes?.length > 0 && (
              <div className="space-y-2 mb-2 max-h-48 overflow-y-auto">
                {[...ticket.internal_notes].reverse().map((n, i) => (
                  <div key={String(n.note_id || i)} className="bg-sap-bg rounded p-2 text-[10px] text-sap-dim">
                    <p className="font-medium text-sap-text">{n.author_name} &middot; {formatTime(n.created_at)}</p>
                    <p className="mt-0.5">{n.content}</p>
                  </div>
                ))}
              </div>
            )}
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={2}
              className="w-full bg-sap-bg border border-sap-border rounded px-2 py-1.5 text-[10px] text-sap-text resize-none mb-1"
              placeholder="Add internal note..." />
            <button onClick={handleNote} disabled={!noteText.trim() || saving}
              className="w-full bg-sap-panel text-sap-text rounded px-2 py-1 text-[10px] disabled:opacity-40 border border-sap-border">
              Add Note
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TicketManager() {
  const [tickets, setTickets] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: '', type: '', search: '' });
  const [selectedTicket, setSelectedTicket] = useState(null);
  const perPage = 30;

  const fetchTickets = useCallback(() => {
    setLoading(true);
    const params = { page: String(page), per_page: String(perPage) };
    if (filters.status) params.status = filters.status;
    if (filters.type) params.type = filters.type;
    if (filters.search) params.search = filters.search;
    getAdminTickets(params).then(d => {
      setTickets(d.tickets || []);
      setTotal(d.total || 0);
      setCounts(d.counts || {});
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [page, filters]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  if (selectedTicket) {
    return (
      <div className="h-full overflow-y-auto">
        <TicketDetail ticketId={selectedTicket} onBack={() => { setSelectedTicket(null); fetchTickets(); }} smtpEnabled={true} />
      </div>
    );
  }

  const totalPages = Math.ceil(total / perPage);
  const statuses = ['', 'new', 'acknowledged', 'in_progress', 'resolved', 'closed'];

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-sap-text">Support Tickets</h2>
      </div>

      {/* Status pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {statuses.map(s => {
          const label = s || 'All';
          const count = s ? (counts[s] || 0) : total;
          return (
            <button key={label} onClick={() => { setFilters(f => ({ ...f, status: s })); setPage(1); }}
              className={`px-3 py-1 text-xs rounded-full whitespace-nowrap border transition-colors ${filters.status === s
                ? 'bg-sap-accent text-white border-sap-accent'
                : 'bg-sap-bg text-sap-dim border-sap-border hover:bg-sap-panel'}`}>
              {label.replace('_', ' ')} ({count})
            </button>
          );
        })}
      </div>

      {/* Filters row */}
      <div className="flex gap-2 flex-wrap">
        <select value={filters.type} onChange={e => { setFilters(f => ({ ...f, type: e.target.value })); setPage(1); }}
          className="bg-sap-bg border border-sap-border rounded-lg px-3 py-1.5 text-xs text-sap-text">
          <option value="">All Types</option>
          <option value="feedback">Feedback</option>
          <option value="support">Support</option>
        </select>
        <input value={filters.search} onChange={e => { setFilters(f => ({ ...f, search: e.target.value })); setPage(1); }}
          className="bg-sap-bg border border-sap-border rounded-lg px-3 py-1.5 text-xs text-sap-text flex-1 min-w-[120px]"
          placeholder="Search tickets..." />
        {(filters.status || filters.type || filters.search) && (
          <button onClick={() => { setFilters({ status: '', type: '', search: '' }); setPage(1); }}
            className="text-xs text-sap-accent hover:underline">Clear</button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-xs text-sap-dim text-center py-8">Loading...</p>
      ) : tickets.length === 0 ? (
        <p className="text-xs text-sap-dim text-center py-8">No tickets found</p>
      ) : (
        <div className="border border-sap-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-sap-panel text-sap-dim uppercase tracking-wider text-[10px]">
                <th className="text-left px-3 py-2 font-medium">ID</th>
                <th className="text-left px-3 py-2 font-medium">Subject</th>
                <th className="text-left px-3 py-2 font-medium">User</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map(t => (
                <tr key={t.ticket_id} onClick={() => setSelectedTicket(t.ticket_id)}
                  className="border-t border-sap-border hover:bg-sap-bg/50 cursor-pointer">
                  <td className="px-3 py-2 font-mono text-sap-muted whitespace-nowrap">{t.ticket_id}</td>
                  <td className="px-3 py-2 text-sap-text truncate max-w-[200px]">{t.subject}</td>
                  <td className="px-3 py-2 text-sap-dim">{t.username}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] text-white ${STATUS_COLORS[t.status] || 'bg-gray-400'}`}>
                      {t.status?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sap-muted whitespace-nowrap">{formatTime(t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-sap-dim">
          <span>Showing {(page - 1) * perPage + 1}-{Math.min(page * perPage, total)} of {total}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="border border-sap-border rounded px-3 py-1 disabled:opacity-40">Prev</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="border border-sap-border rounded px-3 py-1 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
