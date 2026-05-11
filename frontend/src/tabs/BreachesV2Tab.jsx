import { useState, useMemo, useEffect, useRef } from 'react';
import EntityBadge from '../components/EntityBadge';
import { fieldClass, redactPassword } from '../lib/utils';
import { classifyBreach, getRecency, recencyScore, extractGeoIntel } from '../lib/breach';
import { extractIdentifiers } from '../lib/identifierExtract';

const DEPTH_LABELS = {
  0: 'Seed Entities',
  1: 'Discovered',
  2: 'Second Degree',
  3: 'Third Degree',
  4: 'Fourth Degree',
  5: 'Fifth Degree',
};

function depthLabel(depth) {
  return DEPTH_LABELS[depth] ?? `Degree ${depth}`;
}

const REVEAL_DELAY_MS = 80;

/**
 * BreachesV2Tab — renders streaming v2 entity:result events grouped by depth
 * with staggered reveal animation and a live activity feed.
 */
export default function BreachesV2Tab({ results, onPivot, loading, onFocusEntity }) {
  const [revealedCount, setRevealedCount] = useState(0);
  const timerRef = useRef(null);
  const prevResultsRef = useRef(results);

  // Reset when a new search starts (results array identity changes to a fresh [])
  useEffect(() => {
    if (results !== prevResultsRef.current && (!results || results.length === 0)) {
      setRevealedCount(0);
    }
    prevResultsRef.current = results;
  }, [results]);

  // Staggered reveal: release results one at a time on a timer
  useEffect(() => {
    if (revealedCount < (results?.length ?? 0)) {
      timerRef.current = setTimeout(() => {
        setRevealedCount(c => c + 1);
      }, REVEAL_DELAY_MS);
      return () => clearTimeout(timerRef.current);
    }
  }, [revealedCount, results?.length]);

  const revealed = useMemo(() => (results || []).slice(0, revealedCount), [results, revealedCount]);

  // Group revealed results by depth
  const byDepth = useMemo(() => {
    const groups = {};
    revealed.forEach(r => {
      const d = r.depth ?? 0;
      (groups[d] ??= []).push(r);
    });
    return groups;
  }, [revealed]);

  const depthKeys = Object.keys(byDepth).map(Number).sort((a, b) => a - b);

  // The next entity about to be revealed (for the activity feed)
  const pendingEntity = revealedCount < (results?.length ?? 0) ? results[revealedCount] : null;
  const isRevealing = revealedCount < (results?.length ?? 0);

  if (!results || results.length === 0) {
    return (
      <p className="text-sap-dim text-sm py-8 text-center">
        {loading ? 'Waiting for breach results...' : 'No breach data found'}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Live activity feed */}
      {(loading || isRevealing) && (
        <ActivityFeed
          lastRevealed={revealedCount > 0 ? revealed[revealedCount - 1] : null}
          pending={pendingEntity}
          loading={loading}
          totalResults={results.length}
          revealedCount={revealedCount}
        />
      )}

      {!loading && !isRevealing && <InvestigationSummary results={results} onFocusEntity={onFocusEntity} />}

      {depthKeys.map(depth => (
        <DepthSection
          key={depth}
          depth={depth}
          entities={byDepth[depth]}
          onPivot={onPivot}
          onFocusEntity={onFocusEntity}
        />
      ))}
    </div>
  );
}

function ActivityFeed({ lastRevealed, pending, loading, totalResults, revealedCount }) {
  return (
    <div className="rounded-lg border border-sap-accent/20 bg-sap-surface overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 bg-sap-accent/5 border-b border-sap-accent/10 flex items-center gap-2.5">
        <div className="h-2 w-2 rounded-full bg-sap-accent shadow-[0_0_8px_#4f46e5] animate-pulse" />
        <span className="text-xs font-mono uppercase tracking-[2px] text-sap-accent font-semibold">Live Trace</span>
        <span className="text-xs font-mono text-sap-muted ml-auto">{revealedCount}/{totalResults} entities</span>
      </div>
      <div className="px-4 py-3 space-y-1.5 max-h-28 overflow-hidden">
        {/* Last revealed entity */}
        {lastRevealed && (
          <div className="flex items-center gap-2 text-xs font-mono animate-fade-in">
            <span className={lastRevealed.found ? 'text-entity-email' : 'text-sap-muted'}>
              {lastRevealed.found ? '\u2713' : '\u2717'}
            </span>
            <span className="text-sap-dim">
              {lastRevealed.entity_type}:<span className="text-sap-text font-semibold">{lastRevealed.entity_value}</span>
            </span>
            {lastRevealed.found ? (
              <span className="text-entity-breach">
                {lastRevealed.sources?.length} source{lastRevealed.sources?.length !== 1 ? 's' : ''}
                {lastRevealed.new_identifiers?.length > 0 && (
                  <span className="text-sap-accent ml-1.5">+{lastRevealed.new_identifiers.length} new</span>
                )}
              </span>
            ) : (
              <span className="text-sap-muted">no match</span>
            )}
            <span className="text-sap-muted ml-auto">{lastRevealed.search_time_ms}ms</span>
          </div>
        )}
        {/* Currently processing */}
        {pending && (
          <div className="flex items-center gap-2 text-xs font-mono animate-scan">
            <span className="text-sap-accent">&gt;</span>
            <span className="text-sap-dim">
              Searching {pending.entity_type}:<span className="text-sap-text font-semibold">{pending.entity_value}</span>
            </span>
          </div>
        )}
        {!pending && loading && (
          <div className="flex items-center gap-2 text-xs font-mono animate-scan">
            <span className="text-sap-accent">&gt;</span>
            <span className="text-sap-dim">Waiting for next entity...</span>
          </div>
        )}
        {!pending && !loading && (
          <div className="flex items-center gap-2 text-xs font-mono text-sap-muted">
            <span>\u2501</span>
            <span>Trace complete</span>
          </div>
        )}
      </div>
    </div>
  );
}

function InvestigationSummary({ results, onFocusEntity }) {
  const all = results || [];
  const found = all.filter(e => e.found);
  const totalSearched = all.length;
  const totalFound = found.length;
  const totalRecords = found.reduce((s, e) => (e.sources || []).reduce((rs, src) => rs + (src.records?.length || 0), s), 0);
  const maxDepth = Math.max(0, ...all.map(r => r.depth ?? 0));

  const seedEntities = all.filter(e => e.depth === 0);
  const seedFound = seedEntities.filter(e => e.found);

  // Use the shared extractor so this matches SubjectProfile's counts on the
  // overview tab. Trusting `new_identifiers[].type` from the backend leaks
  // false positives (10-digit account/POID IDs misclassified as phones), so
  // we re-derive from the records' field-name keys here.
  const ids = extractIdentifiers(all);
  const typeLabels = { email: 'email addresses', phone: 'phone numbers', username: 'usernames', fullname: 'full names' };

  const uniqueLeaks = new Set();
  found.forEach(e => (e.sources || []).forEach(s => uniqueLeaks.add(s.leak_name || s.collection)));

  const sentences = [];

  if (seedEntities.length === 1) {
    const seed = seedEntities[0];
    if (seed.found) {
      sentences.push(`The search began with a ${seed.entity_type} (${seed.entity_value}) which was found in ${seed.sources?.length || 0} breach ${(seed.sources?.length || 0) === 1 ? 'database' : 'databases'}.`);
    } else {
      sentences.push(`The search began with a ${seed.entity_type} (${seed.entity_value}) but it was not found in any breach database.`);
    }
  } else {
    sentences.push(`The search began with ${seedEntities.length} identifiers, of which ${seedFound.length} ${seedFound.length === 1 ? 'was' : 'were'} found in breach databases.`);
  }

  if (totalFound > seedFound.length) {
    const discovered = totalFound - seedFound.length;
    sentences.push(`Through ${maxDepth} ${maxDepth === 1 ? 'layer' : 'layers'} of recursive expansion, ${discovered} additional linked ${discovered === 1 ? 'identifier was' : 'identifiers were'} discovered and confirmed in breach data.`);
  }

  if (totalFound > 0) {
    sentences.push(`In total, ${totalFound} of ${totalSearched} identifiers traced were found across ${uniqueLeaks.size} unique breach ${uniqueLeaks.size === 1 ? 'source' : 'sources'}, exposing ${totalRecords} ${totalRecords === 1 ? 'record' : 'records'}.`);
  }

  const identifierSections = [
    { type: 'email',    label: typeLabels.email,    values: ids.emails },
    { type: 'phone',    label: typeLabels.phone,    values: ids.phones },
    { type: 'username', label: typeLabels.username, values: ids.usernames },
    { type: 'fullname', label: typeLabels.fullname, values: ids.names },
  ].filter(s => s.values.length > 0);

  if (identifierSections.length > 0) {
    sentences.push('The following identifiers are linked to the subject:');
  }

  if (totalFound === 0) {
    sentences.push('No breach exposure was detected for any of the identifiers searched.');
  }

  return (
    <div className="rounded-lg border border-sap-border bg-sap-surface p-5 mb-6">
      <h3 className="text-xs font-mono tracking-[3px] uppercase text-sap-accent font-semibold mb-3">Investigation Summary</h3>
      <p className="text-sm text-sap-dim leading-relaxed">{sentences.join(' ')}</p>
      {identifierSections.length > 0 && (
        <div className="mt-3 space-y-2">
          {identifierSections.map(({ type, label, values }) => {
            const isNavigable = (type === 'phone' || type === 'email') && !!onFocusEntity;
            return (
              <div key={type}>
                <span className="text-xs font-mono text-sap-muted uppercase tracking-wider">{label} ({values.length})</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {values.map(v => (
                    isNavigable ? (
                      <button
                        key={v}
                        type="button"
                        onClick={() => onFocusEntity(type, v)}
                        className="text-xs font-mono px-2 py-0.5 rounded bg-sap-panel border border-sap-border text-sap-text hover:border-sap-accent/50 cursor-pointer"
                        title={`View ${v} in network map`}
                      >
                        {v}<span className="ml-1 opacity-60">&#x2197;</span>
                      </button>
                    ) : (
                      <span key={v} className="text-xs font-mono px-2 py-0.5 rounded bg-sap-panel border border-sap-border text-sap-text">{v}</span>
                    )
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DepthSection({ depth, entities, onPivot, onFocusEntity }) {
  const foundCount = entities.filter(e => e.found).length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 animate-fade-in">
        <span className="text-xs font-mono tracking-[3px] uppercase text-sap-accent font-semibold">
          Layer {depth} — {depthLabel(depth)}
        </span>
        <span className="text-xs font-mono text-sap-dim">
          {foundCount}/{entities.length} found
        </span>
        <div className="flex-1 h-px bg-sap-border" />
      </div>
      {entities.map((entity, i) => (
        <EntityCard
          key={`${entity.entity_type}:${entity.entity_value}:${i}`}
          entity={entity}
          depth={depth}
          onPivot={onPivot}
          onFocusEntity={onFocusEntity}
        />
      ))}
    </div>
  );
}

function EntityCard({ entity, depth, onPivot, onFocusEntity }) {
  const [open, setOpen] = useState(depth === 0);
  const sourceCount = (entity.sources || []).length;

  return (
    <div
      className={`bg-sap-surface border border-sap-border rounded-lg mb-3 shadow-sm animate-slide-up ${entity.found ? '' : 'opacity-50'}`}
    >
      {/* Header row */}
      <div
        className="px-5 py-3.5 flex items-center justify-between cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-3">
          <EntityBadge type={entity.entity_type} value={entity.entity_value} />
          {!entity.found ? (
            <span className="text-xs text-entity-drug font-mono font-semibold">NOT FOUND</span>
          ) : (
            <span className="text-xs text-sap-dim font-mono">{sourceCount} source{sourceCount !== 1 ? 's' : ''}</span>
          )}
          {(entity.entity_type === 'phone' || entity.entity_type === 'email') && onFocusEntity && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onFocusEntity(entity.entity_type, entity.entity_value); }}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-sap-border text-sap-dim hover:text-sap-accent hover:border-sap-accent/50 transition-colors"
              title="View in network map"
            >
              &#x2197; graph
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-sap-dim font-mono">{entity.search_time_ms}ms</span>
          {entity.new_identifiers?.length > 0 && (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-sap-accent/10 text-sap-accent border border-sap-accent/20">
              +{entity.new_identifiers.length} new
            </span>
          )}
          <svg
            className={`w-4 h-4 text-sap-dim transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded content */}
      {open && entity.found && (
        <div>
          {[...(entity.sources || [])]
            .sort((a, b) => {
              const scoreA = recencyScore(a.records?.[0]?.fields || {});
              const scoreB = recencyScore(b.records?.[0]?.fields || {});
              return scoreB - scoreA;
            })
            .map((src, si) => (
              <BreachSource key={si} source={src} />
            ))}

          {/* New identifiers discovered */}
          {entity.new_identifiers?.length > 0 && (
            <div className="border-t border-sap-border px-5 py-3 bg-sap-panel/30">
              <p className="text-xs font-mono text-sap-dim uppercase tracking-wider mb-2 font-medium">
                Queued for next layer
              </p>
              <div className="flex flex-wrap gap-1.5">
                {entity.new_identifiers.map((id, i) => (
                  <EntityBadge
                    key={`${id.type}:${id.value}:${i}`}
                    type={id.type}
                    value={id.value}
                    onClick={onPivot}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Not-found but has new_identifiers (edge case) */}
      {open && !entity.found && entity.new_identifiers?.length > 0 && (
        <div className="border-t border-sap-border px-5 py-3 bg-sap-panel/30">
          <p className="text-xs font-mono text-sap-dim uppercase tracking-wider mb-2 font-medium">
            Queued for next layer
          </p>
          <div className="flex flex-wrap gap-1.5">
            {entity.new_identifiers.map((id, i) => (
              <EntityBadge
                key={`${id.type}:${id.value}:${i}`}
                type={id.type}
                value={id.value}
                onClick={onPivot}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BreachSource({ source }) {
  const breachType = classifyBreach(source.collection, source.leak_name);
  const firstRecFields = source.records?.[0]?.fields || {};
  const recency = getRecency(firstRecFields);
  const score = recencyScore(source.records?.[0]?.fields || {});
  const recordCount = source.records?.length ?? 0;
  const relativeTime = (() => {
    if (!recency) return null;
    const ay = recency.ageYears;
    if (ay < 1 / 12) return `${Math.floor(ay * 365)}d ago`;
    if (ay < 1) return `${Math.floor(ay * 12)}mo ago`;
    const years = Math.floor(ay);
    const months = Math.floor((ay - years) * 12);
    return months > 0 ? `${years}y ${months}mo ago` : `${years}y ago`;
  })();

  return (
    <div className="border-t border-sap-border" style={{ opacity: score }}>
      {/* Source header */}
      <div className="px-4 py-2 bg-sap-panel/50 flex items-center justify-between text-xs font-mono flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`px-1.5 py-0.5 rounded text-xs font-bold border ${breachType.color}`}
            title={breachType.description}
          >
            {breachType.icon} {breachType.label}
          </span>
          <span className="text-entity-breach font-semibold">
            {source.leak_name || source.collection}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sap-dim">
          {source.breach_date && <span>Breach: {source.breach_date}</span>}
          {recency && (
            <span className={recency.color} title={`Record from ${recency.date}`}>
              {relativeTime || recency.label}
            </span>
          )}
          <span>{recordCount} record{recordCount !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Records */}
      {(source.records || []).map((rec, ri) => {
        const geo = extractGeoIntel(rec.fields);
        return (
          <div key={rec.record_id || ri}>
            {/* Geo-intelligence badge */}
            {geo && (
              <div className={`mx-4 mt-2 px-3 py-2 rounded-lg border flex items-center gap-3 ${geo.bgColor}`}>
                <div className="flex items-center gap-2">
                  <svg className={`w-4 h-4 ${geo.color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className={`text-sm font-semibold ${geo.color}`}>{geo.label}</span>
                </div>
                <span className={`text-xs font-mono px-2 py-0.5 rounded border ${geo.bgColor} ${geo.color}`}>
                  {geo.badge}
                </span>
                <span className="text-xs text-sap-dim font-mono ml-auto">
                  {geo.lat.toFixed(4)}N, {geo.lng.toFixed(4)}E
                </span>
              </div>
            )}

            {/* Field table */}
            <table className="w-full text-xs font-mono">
              <tbody>
                {Object.entries(rec.fields || {}).map(([k, v]) => {
                  const cls = fieldClass(k);
                  return (
                    <tr key={k} className="border-t border-sap-border/30 hover:bg-sap-panel/30">
                      <td className="px-4 py-1.5 text-sap-dim w-48 whitespace-nowrap">{k}</td>
                      <td className={`px-4 py-1.5 ${cls} break-all`}>{redactPassword(k, v)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
