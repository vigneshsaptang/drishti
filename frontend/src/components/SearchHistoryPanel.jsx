import { useState, useEffect } from 'react';
import { getMySearchHistory } from '../lib/api';

const TYPE_ICONS = { phone: '\u260E', email: '\u2709', username: '\u263A', fullname: '\u263B' };

export default function SearchHistoryPanel({ onRerun, limit = 10 }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await getMySearchHistory(1, limit);
        setHistory(data.history || []);
      } catch {
        setError(true);
      }
      setLoading(false);
    })();
  }, [limit]);

  if (loading) return <div className="text-xs text-sap-dim p-2">Loading history...</div>;
  if (error) return <div className="text-xs text-sap-muted p-2">Search history not available</div>;
  if (!history.length) return <div className="text-xs text-sap-muted p-2">No recent searches</div>;

  return (
    <div className="space-y-1">
      <h3 className="text-xs font-mono uppercase tracking-widest text-sap-dim mb-2">Recent Searches</h3>
      {history.map((h, i) => (
        <button
          key={h._id?.$oid || h._id || i}
          onClick={() => onRerun?.(h.search_type, h.search_value)}
          className="w-full text-left p-2 rounded hover:bg-sap-accent/5 transition-colors group"
        >
          <div className="flex items-center gap-2">
            <span className="text-sap-accent text-xs">{TYPE_ICONS[h.search_type] || '?'}</span>
            <span className="text-sm font-mono truncate flex-1">{h.search_value}</span>
            <span className="text-[10px] text-sap-dim opacity-0 group-hover:opacity-100">re-run</span>
          </div>
          <div className="flex gap-3 mt-0.5 text-[10px] text-sap-muted">
            <span>{new Date(h.timestamp).toLocaleDateString()}</span>
            <span>{h.breach_sources_found ?? 0} breaches</span>
            <span>{h.total_time_ms ?? 0}ms</span>
          </div>
        </button>
      ))}
    </div>
  );
}
