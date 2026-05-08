import { useState, useEffect, useRef } from 'react';
import { getAuditActivityFeed } from '../lib/api';

const ACTION_LABELS = {
  'search.execute': 'searched',
  'search.pivot': 'pivoted to',
  'auth.login_success': 'signed in',
  'auth.login_failure': 'failed sign-in',
  'export.report_json': 'exported report',
  'data.ecourts_search': 'searched eCourts',
  'data.mca_lookup': 'looked up MCA',
};

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

export default function ActivityFeed() {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(false);
  const lastRef = useRef(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const data = await getAuditActivityFeed(lastRef.current, lastRef.current ? 10 : 20);
        if (!active) return;
        if (data.events?.length) {
          setEvents(prev => [...data.events.reverse(), ...prev].slice(0, 50));
          lastRef.current = data.events[0].event_id;
        }
        setError(false);
      } catch {
        if (active) setError(true);
      }
    };
    poll();
    const id = setInterval(poll, 8000);
    return () => { active = false; clearInterval(id); };
  }, []);

  if (error && events.length === 0) {
    return (
      <div className="text-xs text-sap-muted py-4 text-center">
        Audit logging not configured
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-xs font-mono uppercase tracking-widest text-sap-dim mb-3">Live Activity</h3>
      {events.length === 0 && (
        <p className="text-xs text-sap-muted py-2">No recent activity</p>
      )}
      <div className="space-y-2">
        {events.map(e => (
          <div key={e.event_id} className="text-xs border-l-2 border-sap-accent/30 pl-2 py-1">
            <div className="flex items-baseline gap-1">
              <span className="font-medium text-sap-text">{e.username || 'anonymous'}</span>
              <span className="text-sap-dim">{ACTION_LABELS[e.action] || e.action}</span>
            </div>
            <div className="text-[10px] text-sap-muted mt-0.5 flex gap-2">
              <span>{timeAgo(e.timestamp)}</span>
              {e.response_time_ms != null && <span>{e.response_time_ms}ms</span>}
              {e.client_ip && <span>{e.client_ip}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
