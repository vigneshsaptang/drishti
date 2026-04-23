import { useState } from 'react';
import { searchTelegramMessages } from '../lib/api';

export default function TelegramTab({ data }) {
  if (!data) return null;
  const tg = data.threat_intel?.telegram || {};
  const [msgQuery, setMsgQuery] = useState('');
  const [messages, setMessages] = useState(null);
  const [searching, setSearching] = useState(false);

  const handleMsgSearch = async (e) => {
    e?.preventDefault();
    if (!msgQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchTelegramMessages(msgQuery.trim());
      setMessages(results);
    } catch { setMessages([]); }
    setSearching(false);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Message Search */}
      <form onSubmit={handleMsgSearch} className="flex gap-3 items-center">
        <input
          type="text"
          value={msgQuery}
          onChange={e => setMsgQuery(e.target.value)}
          placeholder="Search Telegram messages..."
          className="flex-1 bg-sap-panel border border-sap-border rounded px-4 py-2 text-sm font-mono text-sap-text outline-none focus:border-entity-telegram placeholder:text-sap-muted"
        />
        <button
          type="submit"
          disabled={searching}
          className="bg-entity-telegram/20 hover:bg-entity-telegram/30 text-entity-telegram border border-entity-telegram/30 px-4 py-2 rounded text-sm font-mono font-semibold transition-colors disabled:opacity-40"
        >
          {searching ? 'SEARCHING...' : 'SEARCH MESSAGES'}
        </button>
      </form>

      {/* Message results */}
      {messages && (
        <div className="bg-sap-surface border border-entity-telegram/20 rounded-lg p-4">
          <h4 className="text-xs font-mono tracking-widest text-entity-telegram mb-3 uppercase">Message Results ({Array.isArray(messages) ? messages.length : 0})</h4>
          {(Array.isArray(messages) ? messages : []).slice(0, 20).map((m, i) => (
            <div key={i} className="py-2 border-b border-sap-border/30 last:border-0">
              <div className="flex items-center gap-3 text-[11px] font-mono text-sap-dim mb-1">
                <span className="text-entity-telegram">{m.sender_username || `user:${m.sender_id}`}</span>
                {m.group_title && <span>{m.group_title}</span>}
                {m.date && <span>{String(m.date).slice(0, 10)}</span>}
                {m.views && <span>{m.views} views</span>}
              </div>
              <p className="text-xs font-mono text-sap-text/80 whitespace-pre-wrap">{m.message_text}</p>
            </div>
          ))}
          {(!messages || (Array.isArray(messages) && messages.length === 0)) && (
            <p className="text-sm text-sap-dim">No messages found</p>
          )}
        </div>
      )}

      {/* Mention stats below search */}
      {!tg.found && !messages && (
        <p className="text-sap-dim text-sm py-4 text-center">No Telegram activity detected for this entity. Use the search above to query the message corpus directly.</p>
      )}

      {tg.found && <>
      {/* Headline stats */}
      <div className="bg-sap-surface border border-entity-telegram/30 rounded-lg p-5">
        <h3 className="text-xs font-mono tracking-[3px] uppercase text-entity-telegram mb-4">Telegram Intelligence</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <BigStat value={tg.total_mentions?.toLocaleString()} label="Mentions" color="text-entity-telegram" />
          <BigStat value={tg.unique_groups} label="Groups" color="text-entity-telegram" />
          <BigStat value={tg.unique_senders} label="Senders" color="text-entity-telegram" />
        </div>
      </div>

      {/* Group list */}
      {tg.group_ids?.length > 0 && (
        <div className="bg-sap-surface border border-sap-border rounded-lg p-4">
          <h4 className="text-xs font-mono tracking-widest text-sap-dim mb-3 uppercase">Telegram Groups</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {tg.group_ids.map(g => (
              <div key={g} className="bg-sap-panel rounded px-3 py-2 font-mono text-xs">
                <span className="text-sap-dim">Group:</span> <span className="text-entity-telegram">{g}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sender list */}
      {tg.sender_ids?.length > 0 && (
        <div className="bg-sap-surface border border-sap-border rounded-lg p-4">
          <h4 className="text-xs font-mono tracking-widest text-sap-dim mb-3 uppercase">Unique Senders ({tg.sender_ids.length})</h4>
          <div className="flex flex-wrap gap-1.5">
            {tg.sender_ids.slice(0, 30).map(s => (
              <span key={s} className="text-[10px] font-mono px-1.5 py-0.5 bg-entity-telegram/10 text-entity-telegram rounded">{s}</span>
            ))}
            {tg.sender_ids.length > 30 && <span className="text-[10px] text-sap-dim font-mono">+{tg.sender_ids.length - 30} more</span>}
          </div>
        </div>
      )}
      </>}
    </div>
  );
}

function BigStat({ value, label, color }) {
  return (
    <div>
      <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
      <p className="text-[10px] text-sap-dim uppercase tracking-wider">{label}</p>
    </div>
  );
}
