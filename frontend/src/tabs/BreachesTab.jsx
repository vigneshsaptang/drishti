import { useState } from 'react';
import EntityBadge from '../components/EntityBadge';
import { fieldClass, redactPassword } from '../lib/utils';
import { classifyBreach, getRecency, extractGeoIntel } from '../lib/breach';

export default function BreachesTab({ data, onPivot }) {
  if (!data) return null;
  const results = data.breach?.results || [];
  const byDepth = {};
  results.forEach(r => { (byDepth[r.depth] ??= []).push(r); });

  return (
    <div className="space-y-6 animate-fade-in">
      {Object.entries(byDepth).map(([depth, entities]) => (
        <DepthSection key={depth} depth={depth} entities={entities} onPivot={onPivot} />
      ))}
      {results.length === 0 && <p className="text-sap-dim text-sm py-8 text-center">No breach data found</p>}
    </div>
  );
}

function DepthSection({ depth, entities, onPivot }) {
  return (
    <div className="animate-slide-up">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs font-mono tracking-[3px] uppercase text-sap-accent">
          Depth {depth} {depth == 0 ? '(seed)' : '(discovered)'}
        </span>
        <div className="flex-1 h-px bg-sap-border" />
      </div>
      {entities.map((entity, i) => (
        <EntityCard key={`${entity.entity_type}:${entity.entity_value}:${i}`} entity={entity} depth={depth} onPivot={onPivot} />
      ))}
    </div>
  );
}

function EntityCard({ entity, depth, onPivot }) {
  const [open, setOpen] = useState(depth == 0);

  return (
    <div className={`bg-sap-surface border border-sap-border rounded-lg mb-3 shadow-sm ${entity.found ? '' : 'opacity-50'}`}>
      <div className="px-5 py-3.5 flex items-center justify-between cursor-pointer" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-3">
          <EntityBadge type={entity.entity_type} value={entity.entity_value} />
          {!entity.found
            ? <span className="text-xs text-entity-drug font-mono">NOT FOUND</span>
            : <span className="text-xs text-sap-dim font-mono">{entity.total_sources} sources</span>
          }
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-sap-dim font-mono">{entity.search_time_ms}ms</span>
          <svg className={`w-4 h-4 text-sap-dim transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </div>
      </div>

      {open && entity.found && (
        <div>
          {(entity.sources || []).map((src, si) => (
            <BreachSource key={si} source={src} onPivot={onPivot} />
          ))}
        </div>
      )}
    </div>
  );
}

function BreachSource({ source, onPivot }) {
  const breachType = classifyBreach(source.collection, source.leak_name);
  // Get recency from first record
  const firstRecFields = source.records?.[0]?.fields || {};
  const recency = getRecency(firstRecFields);

  return (
    <div className="border-t border-sap-border">
      <div className="px-4 py-2 bg-sap-panel/50 flex items-center justify-between text-xs font-mono flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className={`px-1.5 py-0.5 rounded text-xs font-bold border ${breachType.color}`} title={breachType.description}>
            {breachType.icon} {breachType.label}
          </span>
          <span className="text-entity-breach font-semibold">{source.leak_name || source.collection}</span>
        </div>
        <div className="flex items-center gap-3 text-sap-dim">
          <span>Breach: {source.breach_date}</span>
          {recency && (
            <span className={recency.color} title={`Record from ${recency.date}`}>
              ● {recency.label}
            </span>
          )}
          <span>{source.record_count_found} records</span>
        </div>
      </div>
      {source.description && (
        <div className="px-4 py-1.5 text-[11px] text-sap-dim border-t border-sap-border/50">{source.description}</div>
      )}
      {(source.records || []).map((rec, ri) => {
        const geo = extractGeoIntel(rec.fields);
        return (
          <div key={ri}>
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
                <span className={`text-xs font-mono px-2 py-0.5 rounded border ${geo.bgColor} ${geo.color}`}>{geo.badge}</span>
                <span className="text-xs text-sap-dim font-mono ml-auto">
                  {geo.lat.toFixed(4)}°N, {geo.lng.toFixed(4)}°E
                </span>
              </div>
            )}
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
            {(rec.extracted_emails?.length > 0 || rec.extracted_phones?.length > 0) && (
              <div className="px-4 py-2 border-t border-sap-border/30 flex flex-wrap gap-1.5">
                {rec.extracted_emails?.map(e => <EntityBadge key={e} type="email" value={e} onClick={onPivot} />)}
                {rec.extracted_phones?.map(p => <EntityBadge key={p} type="phone" value={p} onClick={onPivot} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
