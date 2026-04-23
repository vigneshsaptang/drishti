import EntityBadge from '../components/EntityBadge';

export default function OverviewTab({ data, onPivot }) {
  if (!data) return null;
  const b = data.breach || {};
  const ti = data.threat_intel || {};
  const dw = data.darkweb || {};
  const de = data.discovered_entities || {};
  const tg = ti.telegram || {};

  // Extract profile from first breach record
  let name = '', phone = '', email = '', location = '', pic = '';
  for (const r of (b.results || [])) {
    if (!r.found) continue;
    for (const src of (r.sources || [])) {
      for (const rec of (src.records || [])) {
        const f = rec.fields || {};
        for (const [k, v] of Object.entries(f)) {
          const kl = k.toLowerCase();
          if (!name && (kl.includes('fullname') || kl.includes('full_name') || kl === 'name') && v.length > 2 && !v.includes('@')) name = v;
          if (!phone && (kl.includes('phone') || kl.includes('contact') || kl.includes('mobile')) && /\d{7,}/.test(v)) phone = v;
          if (!email && kl.includes('email') && v.includes('@')) email = v;
          if (!location && (kl.includes('city') || kl.includes('state'))) location = v;
          if (!pic && (kl.includes('facebook') || kl.includes('profilepic')) && v.includes('facebook')) pic = v;
        }
      }
    }
  }

  const breachSources = [];
  (b.results || []).forEach(r => (r.sources || []).forEach(s => breachSources.push(s)));
  const dwThreads = (dw.entity_matches?.threads?.length || 0) + (dw.entity_matches?.posts?.length || 0);
  const dwUsers = dw.username_matches?.length || 0;
  const upiCount = (ti.upi_ids || []).length;
  const crimeHits = (ti.crimedata_matches || []).length;
  const wcHits = (ti.worldcheck_matches || []).length;
  const watchlistTotal = crimeHits + wcHits;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-fade-in">
      {/* Profile Card */}
      <div className="bg-sap-surface border border-sap-border rounded-xl p-6 shadow-sm">
        <h3 className="text-xs font-mono tracking-widest text-sap-dim mb-4 uppercase font-semibold">Subject Profile</h3>
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 bg-sap-panel rounded-full flex items-center justify-center border border-sap-border flex-shrink-0 overflow-hidden">
            {pic ? <img src={pic} className="w-14 h-14 rounded-full object-cover" onError={e => e.target.style.display='none'} /> : null}
            <svg className="w-6 h-6 text-sap-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-lg truncate">{name || 'Unknown'}</p>
            {phone && <p className="text-sm font-mono text-entity-phone mt-1">{phone}</p>}
            {email && <p className="text-sm font-mono text-entity-email truncate">{email}</p>}
            {location && <p className="text-sm text-sap-dim mt-1">{location}</p>}
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-sap-border flex flex-wrap gap-1.5">
          {(de.emails || []).map(e => <EntityBadge key={e} type="email" value={e} onClick={onPivot} />)}
          {(de.phones || []).map(p => <EntityBadge key={p} type="phone" value={p} onClick={onPivot} />)}
        </div>
      </div>

      {/* Intel Modules */}
      <div className="lg:col-span-2 grid grid-cols-2 gap-3">
        <Module title="Breach Exposure" value={breachSources.length} color={breachSources.length ? 'text-entity-breach' : 'text-emerald-500'}>
          <p className="text-sm">{breachSources.length ? `Found in ${breachSources.length} breach databases` : 'Not found in breach databases'}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {breachSources.slice(0, 5).map(s => <span key={s.collection} className="text-[10px] font-mono px-1.5 py-0.5 bg-entity-breach/10 text-entity-breach rounded">{s.leak_name || s.collection}</span>)}
            {breachSources.length > 5 && <span className="text-[10px] font-mono text-sap-dim">+{breachSources.length - 5} more</span>}
          </div>
        </Module>

        <Module title="Dark Web" value={dwThreads + dwUsers} color={dwThreads + dwUsers ? 'text-entity-darkweb' : 'text-emerald-500'}>
          <p className="text-sm">{dwThreads + dwUsers ? `${dwThreads} mentions, ${dwUsers} author matches` : 'No dark web presence detected'}</p>
        </Module>

        <Module title="Telegram" value={(tg.total_mentions || 0).toLocaleString()} color={tg.found ? 'text-entity-telegram' : 'text-emerald-500'}>
          <p className="text-sm">{tg.found ? `${tg.total_mentions?.toLocaleString()} mentions across ${tg.unique_groups} groups` : 'No Telegram activity detected'}</p>
        </Module>

        <Module title="Financial" value={upiCount} color={upiCount ? 'text-entity-upi' : 'text-emerald-500'}>
          <p className="text-sm">{upiCount ? `${upiCount} UPI payment identifiers linked` : 'No financial trail detected'}</p>
        </Module>

        <Module title="Watchlist" badge={watchlistTotal ? 'MATCH' : 'CLEAR'} badgeColor={watchlistTotal ? 'bg-entity-watchlist text-white' : 'bg-emerald-500/20 text-emerald-400'}>
          <p className={`text-sm ${watchlistTotal ? 'text-entity-watchlist' : 'text-emerald-500'}`}>
            {watchlistTotal ? `${crimeHits} crime, ${wcHits} sanctions/PEP` : 'No watchlist matches'}
          </p>
        </Module>

        <Module title="Performance">
          <div className="space-y-1 text-xs font-mono">
            <div className="flex justify-between"><span className="text-sap-dim">Breach Engine</span><span className="text-sap-accent">{data.timings?.credmon_ms || 0}ms</span></div>
            <div className="flex justify-between"><span className="text-sap-dim">Parallel Engines</span><span className="text-sap-accent">{data.timings?.parallel_ms || 0}ms</span></div>
            <div className="flex justify-between"><span className="text-sap-dim">Total</span><span className="text-sap-accent font-bold">{data.total_time_ms || 0}ms</span></div>
          </div>
        </Module>
      </div>
    </div>
  );
}

function Module({ title, value, color, badge, badgeColor, children }) {
  return (
    <div className="bg-sap-surface border border-sap-border rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-mono tracking-widest text-sap-dim uppercase font-semibold">{title}</h4>
        {badge ? (
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badgeColor}`}>{badge}</span>
        ) : value !== undefined ? (
          <span className={`font-mono text-sm font-bold ${color}`}>{value}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
