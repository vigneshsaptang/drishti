import { useState, useEffect } from 'react';
import { getMyTickets, getMyTicketDetail, getTicketAttachmentUrl } from '../lib/api';

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

const STATUS_COLORS = {
  new: 'bg-blue-500', acknowledged: 'bg-purple-500', in_progress: 'bg-amber-500',
  resolved: 'bg-emerald-500', closed: 'bg-gray-400',
};

export default function MyTickets({ isOpen, onClose }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const params = {};
    if (filter !== 'all') params.status = filter;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDetail(null);
    getMyTickets(params).then(d => { if (!cancelled) { setTickets(d.tickets || []); setLoading(false); } }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, filter]);

  const openDetail = (ticketId) => {
    setDetailLoading(true);
    getMyTicketDetail(ticketId).then(d => { setDetail(d); setDetailLoading(false); }).catch(() => setDetailLoading(false));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[480px] max-w-full bg-sap-surface border-l border-sap-border shadow-2xl overflow-y-auto animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 bg-sap-surface border-b border-sap-border px-5 py-3 z-10">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-sap-text">My Tickets</h2>
            <button onClick={onClose} className="text-sap-dim hover:text-sap-text p-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="flex gap-1.5">
            {['all', 'open', 'closed'].map(f => (
              <button key={f} onClick={() => { setFilter(f); setDetail(null); }}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${filter === f
                  ? 'bg-sap-accent text-white border-sap-accent'
                  : 'bg-sap-bg text-sap-dim border-sap-border hover:bg-sap-panel'}`}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4">
          {detail ? (
            <div>
              <button onClick={() => setDetail(null)} className="text-xs text-sap-accent hover:underline mb-3 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                Back
              </button>
              {detailLoading ? (
                <p className="text-xs text-sap-dim">Loading...</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[10px] text-sap-muted">{detail.ticket_id}</span>
                      <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[detail.status] || 'bg-gray-400'}`} />
                      <span className="text-[10px] text-sap-dim">{detail.status?.replace('_', ' ')}</span>
                    </div>
                    <p className="text-sm font-medium text-sap-text">{detail.subject}</p>
                    <p className="text-xs text-sap-dim mt-0.5">{detail.category?.replace(/_/g, ' ')} {detail.severity ? `\u2022 ${detail.severity}` : ''} &middot; {formatTime(detail.created_at)}</p>
                  </div>
                  <div className="rounded-lg border border-sap-border p-3">
                    <p className="text-xs text-sap-text whitespace-pre-wrap leading-relaxed">{detail.description}</p>
                  </div>
                  {detail.attachments?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-mono text-sap-dim uppercase mb-1">Attachments</p>
                      <div className="flex gap-2 flex-wrap">
                        {detail.attachments.map(a => (
                          <a key={String(a.file_id)} href={getTicketAttachmentUrl(detail.ticket_id, String(a.file_id))} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-sap-accent hover:underline">{a.filename}</a>
                        ))}
                      </div>
                    </div>
                  )}
                  {detail.replies?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-mono text-sap-dim uppercase">Replies</p>
                      {detail.replies.map((r, i) => (
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
                </div>
              )}
            </div>
          ) : loading ? (
            <p className="text-xs text-sap-dim text-center py-8">Loading...</p>
          ) : tickets.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-8 h-8 mx-auto text-sap-muted mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <p className="text-sm text-sap-muted">No tickets yet</p>
              <p className="text-xs text-sap-dim mt-1">When you submit feedback or support requests, they'll appear here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map(t => (
                <button key={t.ticket_id} onClick={() => openDetail(t.ticket_id)}
                  className="w-full text-left border border-sap-border rounded-lg p-3 hover:bg-sap-bg cursor-pointer transition-colors">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-mono text-[10px] text-sap-muted">{t.ticket_id}</span>
                    <span className={`px-1.5 py-0.5 text-[9px] rounded text-white ${STATUS_COLORS[t.status] || 'bg-gray-400'}`}>
                      {t.status?.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-sap-text truncate">{t.subject}</p>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-sap-dim">{t.category?.replace(/_/g, ' ')}{t.severity ? ` \u2022 ${t.severity}` : ''}</span>
                    <span className="text-[10px] text-sap-muted">{formatTime(t.created_at)}{t.reply_count > 0 ? ` \u2022 ${t.reply_count} reply` : ''}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
