import { useState, useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import { buildGraph } from '../lib/api';
import { EDGE_TYPES } from '../lib/ontology';
import { classifyBreach, getRecency } from '../lib/breach';

const NODE_COLORS = {
  phone: '#2563eb', email: '#059669', breach: '#ea580c', darkweb_account: '#7c3aed',
  telegram_group: '#0891b2', upi: '#16a34a', person: '#475569', url: '#6b7280',
  bank: '#ca8a04', crypto: '#c026d3', watchlist: '#dc2626', drug: '#e11d48',
};

const NODE_RADIUS = { phone: 16, email: 14, breach: 12, upi: 12, bank: 12, crypto: 12, watchlist: 14, default: 11 };

// ────────────────────────────────────────────────────────────────────────────
// Depth derivation — BFS from the seed (the node we kicked the search off with)
// so each node carries the depth at which it was discovered. Used by both the
// hierarchy layout and the step-reveal mode.
// ────────────────────────────────────────────────────────────────────────────

function computeDepths(graph, seedHint) {
  const adj = new Map();           // id → Set<neighbour id> (undirected)
  graph.nodes.forEach(n => adj.set(n.id, new Set()));
  graph.edges.forEach(e => {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  });

  // Seed selection: prefer the search seed if it matches a node id; else pick
  // a node with the highest degree (the central anchor).
  const ids = new Set(graph.nodes.map(n => n.id));
  let seedId = seedHint && ids.has(seedHint) ? seedHint : null;
  if (!seedId) {
    let best = null; let bestDeg = -1;
    for (const n of graph.nodes) {
      const deg = adj.get(n.id)?.size ?? 0;
      if (deg > bestDeg) { best = n.id; bestDeg = deg; }
    }
    seedId = best;
  }

  const depth = new Map();
  if (!seedId) return depth;
  const queue = [seedId];
  depth.set(seedId, 0);
  while (queue.length) {
    const cur = queue.shift();
    const d = depth.get(cur);
    for (const next of adj.get(cur) || []) {
      if (!depth.has(next)) { depth.set(next, d + 1); queue.push(next); }
    }
  }
  // Disconnected nodes — pin to maxDepth + 1 so they sort last and don't break layout.
  const maxObserved = Math.max(0, ...[...depth.values()]);
  for (const n of graph.nodes) {
    if (!depth.has(n.id)) depth.set(n.id, maxObserved + 1);
  }
  return depth;
}

// ────────────────────────────────────────────────────────────────────────────

export default function GraphTab({ data, onPivot, focusedEntity, onClearFocus }) {
  const [graph, setGraph] = useState(null);
  const [error, setError] = useState(null);
  const [layout, setLayout] = useState('force');     // 'force' | 'sequence' | 'step'
  const [revealedDepth, setRevealedDepth] = useState(0);
  const [replayKey, setReplayKey] = useState(0);     // bumped to retrigger sequence animation
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const svgRef = useRef(null);
  const containerRef = useRef(null);

  // Esc closes the inspector panel first, then exits fullscreen — so the user
  // can step out of detail without leaving the focused view.
  useEffect(() => {
    if (!isFullscreen && !selectedNode) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (selectedNode) setSelectedNode(null);
      else if (isFullscreen) setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen, selectedNode]);

  useEffect(() => {
    if (!data) return;
    buildGraph(data)
      .then(g => setGraph(g))
      .catch(e => setError(e.message));
  }, [data]);

  // Seed id from the search payload — used as the BFS root.
  const seedHint = useMemo(() => {
    const seed = data?.seed;
    if (seed?.type && seed?.value) return `${seed.type}:${seed.value}`;
    return null;
  }, [data]);

  // BFS neighbourhood scoping — 2 hops is a deliberate UX limit: one hop
  // gives a bare star graph; three hops often explodes to the full graph.
  const scopedGraph = useMemo(() => {
    if (!graph || !focusedEntity) return graph;
    const focusId = `${focusedEntity.type}:${focusedEntity.value}`;
    if (!graph.nodes.some(n => n.id === focusId)) return null;   // entity not in graph
    const adj = new Map();
    graph.nodes.forEach(n => adj.set(n.id, new Set()));
    graph.edges.forEach(e => {
      adj.get(e.source)?.add(e.target);
      adj.get(e.target)?.add(e.source);
    });
    const MAX_HOPS = 2;
    const visited = new Map();    // id → hop distance
    const queue = [[focusId, 0]];
    visited.set(focusId, 0);
    while (queue.length) {
      const [cur, d] = queue.shift();
      if (d >= MAX_HOPS) continue;
      for (const next of adj.get(cur) || []) {
        if (!visited.has(next)) { visited.set(next, d + 1); queue.push([next, d + 1]); }
      }
    }
    const nodes = graph.nodes.filter(n => visited.has(n.id)).map(n => ({
      ...n,
      _isFocus: n.id === focusId,
      _hop: visited.get(n.id),
    }));
    const ids = new Set(nodes.map(n => n.id));
    const edges = graph.edges.filter(e => ids.has(e.source) && ids.has(e.target));
    return { ...graph, nodes, edges };
  }, [graph, focusedEntity]);

  // The active graph view: scoped when a focus entity is set, full otherwise.
  const activeGraph = scopedGraph;

  const depths = useMemo(
    () => (activeGraph ? computeDepths(activeGraph, seedHint) : new Map()),
    [activeGraph, seedHint],
  );
  const maxDepth = useMemo(() => Math.max(0, ...[...depths.values()]), [depths]);

  // Force the force layout when scoping — hierarchy doesn't make sense for a
  // small neighbourhood subgraph.
  const effectiveLayout = focusedEntity ? 'force' : layout;

  // Reset step counter when graph or layout changes
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setRevealedDepth(0); }, [activeGraph, layout]);

  useEffect(() => {
    if (!activeGraph?.nodes?.length || !svgRef.current || !containerRef.current) return;
    if (effectiveLayout === 'force') {
      renderForceGraph(svgRef.current, containerRef.current, activeGraph, setSelectedNode);
    } else {
      renderHierarchyGraph(
        svgRef.current,
        containerRef.current,
        activeGraph,
        depths,
        {
          mode: effectiveLayout,
          revealedDepth: effectiveLayout === 'step' ? revealedDepth : maxDepth,
          animate: effectiveLayout === 'sequence',
          replayKey,
        },
        setSelectedNode,
      );
    }
    // Re-render on fullscreen toggle so the SVG picks up the new container dims
  }, [activeGraph, effectiveLayout, revealedDepth, depths, maxDepth, replayKey, isFullscreen]);

  if (error) return <p className="text-entity-drug text-sm py-8 text-center font-mono">Graph error: {error}</p>;
  if (!graph) return <p className="text-sap-dim text-sm py-8 text-center font-mono animate-scan">Building connection graph...</p>;
  if (!graph.nodes?.length) return <p className="text-sap-dim text-sm py-8 text-center font-mono">No connections to visualize</p>;

  // focusedEntity set but not found in graph (e.g., graph not loaded yet or entity has no node)
  if (focusedEntity && scopedGraph === null) {
    return (
      <div className="bg-sap-surface border border-sap-border rounded-lg p-8 text-center animate-fade-in">
        <p className="text-sm font-mono text-sap-dim mb-4">
          <span className="text-sap-accent font-semibold">{focusedEntity.type}:{focusedEntity.value}</span> has no node in the current graph.
        </p>
        <button
          type="button"
          onClick={onClearFocus}
          className="px-3 py-1.5 rounded-sm border border-sap-border text-[11px] font-mono uppercase tracking-[0.16em] text-sap-dim hover:text-sap-text"
        >Show full graph</button>
      </div>
    );
  }

  const visibleNodeCount = effectiveLayout === 'step'
    ? activeGraph.nodes.filter(n => (depths.get(n.id) ?? 0) <= revealedDepth).length
    : activeGraph.nodes.length;

  const wrapperClass = isFullscreen
    ? 'fixed inset-0 z-50 bg-sap-bg p-4 sm:p-5 flex flex-col animate-fade-in'
    : 'bg-sap-surface border border-sap-border rounded-lg p-4 animate-fade-in';

  return (
    <div className={wrapperClass}>
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-mono tracking-[3px] uppercase text-sap-accent">Connection Graph</h3>
          {!isFullscreen && (
            <span className="hidden sm:inline text-[10px] font-mono text-sap-muted italic">
              tip · use fullscreen for the best view
            </span>
          )}
          {isFullscreen && (
            <span className="text-[10px] font-mono text-sap-muted">
              fullscreen · press <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-mono text-sap-dim border border-sap-border bg-sap-bg">Esc</kbd> to exit
            </span>
          )}
        </div>

        {/* Layout switcher — disabled when scoped (force layout is forced for neighbourhood view) */}
        <div className="inline-flex items-center rounded-md border border-sap-border overflow-hidden">
          {[
            { id: 'force',    label: 'Force',    hint: 'Organic clustering' },
            { id: 'sequence', label: 'Sequence', hint: 'Auto-reveal in discovery order' },
            { id: 'step',     label: 'Step',     hint: 'Click to reveal next layer' },
          ].map((o, i) => (
            <button
              key={o.id}
              type="button"
              onClick={() => { if (!focusedEntity) { setLayout(o.id); if (o.id === 'sequence') setReplayKey(k => k + 1); } }}
              title={focusedEntity ? 'Layout locked to Force while scoped' : o.hint}
              disabled={!!focusedEntity && o.id !== 'force'}
              className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.16em] transition-colors ${
                effectiveLayout === o.id
                  ? 'bg-sap-accent text-white'
                  : 'bg-sap-surface text-sap-dim hover:text-sap-text hover:bg-sap-panel'
              } ${i > 0 ? 'border-l border-sap-border' : ''} disabled:opacity-40 disabled:cursor-not-allowed`}
            >{o.label}</button>
          ))}
        </div>

        <div className="flex items-center gap-3 ml-auto">
          <div className="flex gap-3 text-[10px] font-mono text-sap-dim">
            <span>{visibleNodeCount}/{activeGraph.nodes.length} nodes</span>
            <span>{activeGraph.edges.length} edges</span>
            <span>depth {maxDepth}</span>
          </div>
          <button
            type="button"
            onClick={() => setIsFullscreen(f => !f)}
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen for best view'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-sap-border text-[11px] font-mono uppercase tracking-[0.16em] text-sap-dim hover:text-sap-text hover:bg-sap-panel transition-colors"
          >
            {isFullscreen ? (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 9H4M9 9V4M15 9h5M15 9V4M15 15h5M15 15v5M9 15H4M9 15v5"/></svg>
                Exit
              </>
            ) : (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>
                Fullscreen
              </>
            )}
          </button>
        </div>
      </div>

      {/* Mode-specific controls */}
      {effectiveLayout === 'sequence' && (
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            onClick={() => setReplayKey(k => k + 1)}
            className="px-3 py-1 rounded-sm text-[10px] font-mono uppercase tracking-[0.16em] border border-sap-border text-sap-dim hover:text-sap-text"
          >↻ Replay reveal</button>
          <span className="text-[10px] font-mono text-sap-muted">Layers fade in by discovery depth (depth 0 → depth {maxDepth}).</span>
        </div>
      )}
      {effectiveLayout === 'step' && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <button
            type="button"
            onClick={() => setRevealedDepth(0)}
            className="px-3 py-1 rounded-sm text-[10px] font-mono uppercase tracking-[0.16em] border border-sap-border text-sap-dim hover:text-sap-text"
          >Reset</button>
          <button
            type="button"
            disabled={revealedDepth >= maxDepth}
            onClick={() => setRevealedDepth(d => Math.min(maxDepth, d + 1))}
            className="px-3 py-1 rounded-sm text-[10px] font-mono uppercase tracking-[0.16em] bg-sap-accent text-white border border-sap-accent disabled:opacity-40 disabled:cursor-not-allowed"
          >▶ Reveal next layer</button>
          <button
            type="button"
            disabled={revealedDepth >= maxDepth}
            onClick={() => setRevealedDepth(maxDepth)}
            className="px-3 py-1 rounded-sm text-[10px] font-mono uppercase tracking-[0.16em] border border-sap-border text-sap-dim hover:text-sap-text disabled:opacity-40 disabled:cursor-not-allowed"
          >▶▶ Reveal all</button>
          <span className="text-[10px] font-mono text-sap-muted ml-2">
            Layer <span className="text-sap-text font-bold tabular-nums">{revealedDepth}</span> of <span className="tabular-nums">{maxDepth}</span>
            {' · '}
            <span className="text-sap-text font-bold tabular-nums">{visibleNodeCount}</span> visible
          </span>
        </div>
      )}

      {/* Scope banner — shown when a focal entity has been selected */}
      {focusedEntity && scopedGraph && (
        <div className="mb-3 px-3 py-2 rounded-md border border-sap-accent/40 bg-sap-accent/5 flex items-center justify-between gap-3">
          <div className="text-xs font-mono">
            <span className="text-sap-accent font-semibold uppercase tracking-[0.16em]">Scoped</span>
            <span className="text-sap-muted mx-2">&#x2192;</span>
            <span className="text-sap-text font-semibold">{focusedEntity.type}: {focusedEntity.value}</span>
            <span className="text-sap-muted ml-3">{scopedGraph.nodes.length} nodes within 2 hops</span>
          </div>
          <button
            type="button"
            onClick={onClearFocus}
            className="text-[10px] font-mono uppercase tracking-[0.16em] px-2 py-1 rounded-sm border border-sap-border text-sap-dim hover:text-sap-text"
          >Show full graph</button>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-3">
        {Object.entries(NODE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5 text-[10px] font-mono text-sap-dim">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            {type.replace('_', ' ')}
          </div>
        ))}
      </div>

      <div
        ref={containerRef}
        onClick={() => setSelectedNode(null)}
        className={`w-full bg-sap-bg rounded border border-sap-border relative overflow-hidden ${
          isFullscreen ? 'flex-1 min-h-0' : 'h-[550px]'
        }`}
      >
        <svg ref={svgRef} className="w-full h-full" />

        {selectedNode && (
          <NodeDetailPanel
            node={selectedNode}
            graph={activeGraph}
            data={data}
            depth={depths.get(selectedNode.id)}
            onClose={() => setSelectedNode(null)}
            onPivot={onPivot}
          />
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Per-record extractors — pull the most useful fields out of breach records to
// surface in the panel. Each returns the single best value across all records.
// ────────────────────────────────────────────────────────────────────────────

function _composeName(recs) {
  for (const r of recs) {
    const f = r.fields || {};
    const fn = f.fullname || f.full_name || f.Name || f.name;
    if (typeof fn === 'string' && fn.trim().length > 2) return fn.trim();
  }
  for (const r of recs) {
    const f = r.fields || {};
    const parts = [
      f.first_name || f.FIRST_NAME,
      f.middle_name || f.MIDDLENAME || f.middlename,
      f.last_name || f.LAST_NAME,
    ].filter(v => typeof v === 'string' && v.trim());
    if (parts.length) return parts.join(' ');
  }
  return null;
}

function _composeLocation(recs) {
  for (const r of recs) {
    const f = r.fields || {};
    const parts = [];
    const city  = f.city || f.CITY || f.City;
    const state = f.state || f.STATE || f.State;
    const zip   = f.zipcode || f.ZIPCODE || f.pincode || f.PIN || f.zip;
    if (city)  parts.push(String(city));
    if (state) parts.push(String(state));
    if (zip)   parts.push(String(zip));
    if (parts.length) return parts.join(', ');
  }
  return null;
}

function _findLastActivity(recs) {
  let latest = null;
  for (const r of recs) {
    for (const [k, v] of Object.entries(r.fields || {})) {
      if (typeof v !== 'string') continue;
      const kl = k.toLowerCase();
      if (!(kl.includes('login') || kl.includes('updated') || kl.includes('last_seen') || kl.includes('last_active') || kl.includes('last_order') || kl === 'created_on' || kl === 'date_joined')) continue;
      const d = new Date(v);
      if (!isNaN(d.getTime()) && d.getFullYear() > 2000 && d.getFullYear() < 2100) {
        if (!latest || d > latest) latest = d;
      }
    }
  }
  return latest ? latest.toISOString().slice(0, 10) : null;
}

function _findLastIp(recs) {
  for (const r of recs) {
    for (const [k, v] of Object.entries(r.fields || {})) {
      if (typeof v !== 'string') continue;
      if (!/last_logged_ip|last_ip|signup_ip|login_ip|register_ip|reg_ip|client_ip/i.test(k)) continue;
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(v)) return v;
    }
  }
  return null;
}

function _hasCredential(recs) {
  for (const r of recs) {
    for (const k of Object.keys(r.fields || {})) {
      if (/^(password|pwd|hash|md5|sha1|sha256|salt|plain|bcrypt)$/i.test(k)) return true;
    }
  }
  return false;
}

function _topExposedFields(recs, limit = 8) {
  const freq = {};
  for (const r of recs) {
    for (const k of Object.keys(r.fields || {})) {
      freq[k] = (freq[k] || 0) + 1;
    }
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k]) => k);
}

// ────────────────────────────────────────────────────────────────────────────
// NodeDetailPanel — floating side panel that surfaces info for the clicked
// node: type, depth-from-seed, neighbour breakdown, type-specific fields, and
// a Pivot button that re-runs the search rooted at this node.
// ────────────────────────────────────────────────────────────────────────────

function NodeDetailPanel({ node, graph, data, depth, onClose, onPivot }) {
  const id = node.id;

  // Neighbours: derive from graph.edges (string source/target — NOT the
  // d3-mutated objects, which is why we read from React state, not from `links`).
  const neighbourIds = [];
  for (const e of graph.edges) {
    if (e.source === id) neighbourIds.push(e.target);
    else if (e.target === id) neighbourIds.push(e.source);
  }
  const neighbourTypeCounts = {};
  for (const nid of neighbourIds) {
    const n = graph.nodes.find(x => x.id === nid);
    if (!n) continue;
    neighbourTypeCounts[n.type] = (neighbourTypeCounts[n.type] || 0) + 1;
  }

  const ndata = node.data || {};
  const canPivot = (node.type === 'phone' || node.type === 'email') && typeof onPivot === 'function';
  const accent = NODE_COLORS[node.type] || '#64748b';

  // Type-specific enrichment — surfaces fields beyond the bare graph node
  const detailRows = [];
  const chips = [];

  if (node.type === 'breach') {
    // Classification chip from collection name
    const collectionName = id.replace(/^breach:/, '');
    const cls = classifyBreach(collectionName, node.label);
    if (cls?.label) {
      chips.push({ key: 'class', icon: cls.icon, label: cls.label, color: cls.color, title: cls.description });
    }

    // Walk search results to find linked entities + records + recency
    const entityIds = new Set();
    let recordCount = 0;
    let mergedFields = {};
    const allRecs = [];
    for (const r of (data?.breach?.results || [])) {
      for (const src of (r.sources || [])) {
        if (`breach:${src.collection}` !== id) continue;
        entityIds.add(`${r.entity_type}:${r.entity_value}`);
        for (const rec of (src.records || [])) {
          recordCount += 1;
          allRecs.push(rec);
          mergedFields = { ...mergedFields, ...rec.fields };
        }
      }
    }

    // Recency chip
    const rec = getRecency(mergedFields);
    if (rec?.label) {
      chips.push({
        key: 'rec', label: rec.label,
        color: `bg-sap-panel border-sap-border ${rec.color || 'text-sap-dim'}`,
        title: 'Most recent timestamp seen in records',
      });
    }

    if (ndata.breach_date) detailRows.push(['breached', ndata.breach_date]);
    if (ndata.description) detailRows.push(['description', ndata.description]);
    if (recordCount > 0)  detailRows.push(['records exposed', recordCount.toLocaleString()]);
    if (entityIds.size > 0) detailRows.push(['linked entities', String(entityIds.size)]);

    const top = _topExposedFields(allRecs, 8);
    if (top.length) detailRows.push(['fields exposed', top.join(', ')]);

  } else {
    // Entity node — find its result row and unpack
    const result = (data?.breach?.results || []).find(
      r => `${r.entity_type}:${r.entity_value}` === id,
    );
    if (result) {
      const recs = (result.sources || []).flatMap(s => s.records || []);

      const name = _composeName(recs);
      const loc  = _composeLocation(recs);
      const last = _findLastActivity(recs);
      const lip  = _findLastIp(recs);

      if (name) detailRows.push(['name', name]);
      if (loc)  detailRows.push(['location', loc]);
      if (last) detailRows.push(['last activity', last]);
      if (lip)  detailRows.push(['last ip', lip]);

      if (_hasCredential(recs)) {
        chips.push({
          key: 'cred', icon: '🔓', label: 'CREDENTIAL LEAK',
          color: 'bg-entity-drug/15 text-entity-drug border-entity-drug/40',
          title: 'A password or hash field was found in at least one breach record',
        });
      }
      if (result.search_time_ms != null) {
        // Just a soft indicator
      }

      if (result.sources?.length) {
        const breachNames = result.sources
          .map(s => s.leak_name || s.collection)
          .filter(Boolean);
        const head = breachNames.slice(0, 3).join(', ');
        const more = breachNames.length > 3 ? ` +${breachNames.length - 3} more` : '';
        detailRows.push(['found in', `${result.sources.length} breach${result.sources.length === 1 ? '' : 'es'}`]);
        if (head) detailRows.push(['breaches', head + more]);
      }
      if (recs.length > 0) detailRows.push(['records', recs.length.toLocaleString()]);

      if (result.new_identifiers?.length) {
        const byType = {};
        for (const x of result.new_identifiers) byType[x.type] = (byType[x.type] || 0) + 1;
        detailRows.push([
          'newly discovered',
          Object.entries(byType).map(([t, n]) => `${n} ${t}${n === 1 ? '' : 's'}`).join(' · '),
        ]);
      }
    }
    // Fallback: any extra string/number fields on node.data (catches custom node types)
    for (const [k, v] of Object.entries(ndata)) {
      if (v == null) continue;
      if ((typeof v === 'string' || typeof v === 'number') &&
          !detailRows.some(row => row[0] === k)) {
        detailRows.push([k, String(v)]);
      }
    }
  }

  return (
    <aside
      onClick={(e) => e.stopPropagation()}
      className="absolute top-3 right-3 w-72 max-w-[calc(100%-1.5rem)] max-h-[calc(100%-1.5rem)] overflow-y-auto bg-sap-surface border border-sap-border rounded-md shadow-lg p-3.5 animate-slide-up"
    >
      {/* Header — type pill + close */}
      <div className="flex items-center justify-between mb-2.5 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span aria-hidden className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: accent }} />
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-sap-muted truncate">
            {node.type.replace('_', ' ')}
          </span>
          {depth != null && (
            <span className="text-[10px] font-mono text-sap-muted shrink-0">· depth {depth}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 w-6 h-6 inline-flex items-center justify-center rounded text-sap-muted hover:text-sap-text hover:bg-sap-panel transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6l-6 12" /></svg>
        </button>
      </div>

      {/* Headline label */}
      <p className="font-mono text-sm font-semibold text-sap-text leading-snug break-words mb-3">
        {node.label}
      </p>

      {/* Classification / status chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {chips.map(c => (
            <span
              key={c.key}
              title={c.title || ''}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-mono uppercase tracking-wider border ${c.color}`}
            >
              {c.icon && <span aria-hidden>{c.icon}</span>}
              {c.label}
            </span>
          ))}
        </div>
      )}

      {/* Connections summary */}
      {neighbourIds.length > 0 && (
        <div className="mb-3 pb-3 border-b border-sap-border/60">
          <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-sap-muted mb-1.5">
            connections · {neighbourIds.length}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(neighbourTypeCounts).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-sm border border-sap-border bg-sap-panel/40 text-[10px] font-mono text-sap-text"
              >
                <span aria-hidden className="w-1.5 h-1.5 rounded-full" style={{ background: NODE_COLORS[t] || '#64748b' }} />
                {n} {t.replace('_', ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Type-specific data */}
      {detailRows.length > 0 && (
        <dl className="mb-3 space-y-1">
          {detailRows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[9px] font-mono uppercase tracking-[0.18em] text-sap-muted">{k.replace(/_/g, ' ')}</dt>
              <dd className="text-[12px] font-mono text-sap-text break-words leading-snug">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* Pivot — only meaningful for entity nodes */}
      {canPivot && (
        <button
          type="button"
          onClick={() => { onPivot(node.type, node.label); onClose(); }}
          className="w-full px-3 py-1.5 rounded-sm bg-sap-accent text-white text-[11px] font-mono uppercase tracking-[0.16em] hover:bg-sap-accent-glow transition-colors"
        >
          ↻ Pivot search to this {node.type}
        </button>
      )}

      {!canPivot && neighbourIds.length === 0 && detailRows.length === 0 && (
        <p className="text-[11px] font-mono text-sap-muted italic">No additional metadata for this node.</p>
      )}
    </aside>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Force-directed layout (the original behaviour).
// ────────────────────────────────────────────────────────────────────────────

function renderForceGraph(svgEl, containerEl, graph, onSelectNode) {
  const width = containerEl.offsetWidth;
  const height = containerEl.offsetHeight || 550;

  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();
  svg.attr('viewBox', [0, 0, width, height]);

  const nodes = graph.nodes.map(n => ({ ...n }));
  const links = graph.edges.map(e => ({ ...e }));

  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(80).strength(0.5))
    .force('charge', d3.forceManyBody().strength(-200))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => (NODE_RADIUS[d.type] || NODE_RADIUS.default) + 4))
    .force('x', d3.forceX(width / 2).strength(0.05))
    .force('y', d3.forceY(height / 2).strength(0.05));

  const g = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.3, 4]).on('zoom', (event) => g.attr('transform', event.transform)));

  const link = g.append('g')
    .selectAll('line').data(links).join('line')
    .attr('stroke',         d => EDGE_TYPES[d.type]?.color || '#1e2d45')
    .attr('stroke-width',   d => EDGE_TYPES[d.type]?.weight || 1.5)
    .attr('stroke-dasharray', d => {
      const et = EDGE_TYPES[d.type];
      if (et?.style === 'dashed') return '6 3';
      if (et?.style === 'dotted') return '2 2';
      return null;
    })
    .attr('stroke-opacity', 0.5);

  const linkLabel = g.append('g')
    .selectAll('text').data(links).join('text')
    .text(d => d.type)
    .attr('fill', '#3d5278').attr('font-size', 7)
    .attr('font-family', 'monospace').attr('text-anchor', 'middle').attr('dy', -3);

  const node = g.append('g')
    .selectAll('g').data(nodes).join('g')
    .call(d3.drag()
      .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag',  (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on('end',   (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

  // Pulsing ring for the focal node — rendered behind the main circle
  node.filter(d => d._isFocus)
    .append('circle')
    .attr('r', d => (NODE_RADIUS[d.type] || NODE_RADIUS.default) + 6)
    .attr('fill', 'none')
    .attr('stroke', d => NODE_COLORS[d.type] || '#64748b')
    .attr('stroke-width', 2)
    .attr('stroke-opacity', 0.5)
    .attr('pointer-events', 'none')
    .attr('class', 'focus-ring');

  node.append('circle')
    .attr('r', d => NODE_RADIUS[d.type] || NODE_RADIUS.default)
    .attr('fill',   d => NODE_COLORS[d.type] || '#64748b')
    .attr('stroke', d => NODE_COLORS[d.type] || '#64748b')
    .attr('stroke-width', d => d._isFocus ? 4 : 2)
    .attr('stroke-opacity', d => d._isFocus ? 0.9 : 0.3)
    .attr('cursor', 'pointer')
    .on('click', (event, d) => {
      event.stopPropagation();
      onSelectNode?.(d);
    })
    .on('mouseover', function(event, d) { d3.select(this).attr('stroke-opacity', 0.8).attr('stroke-width', d._isFocus ? 4 : 3); })
    .on('mouseout',  function(event, d) { d3.select(this).attr('stroke-opacity', d._isFocus ? 0.9 : 0.3).attr('stroke-width', d._isFocus ? 4 : 2); });

  node.append('text')
    .text(d => d.label.length > 22 ? d.label.slice(0, 20) + '...' : d.label)
    .attr('fill', '#6b7fa3').attr('font-size', 9).attr('font-family', 'monospace')
    .attr('text-anchor', 'middle')
    .attr('dy', d => (NODE_RADIUS[d.type] || NODE_RADIUS.default) + 12)
    .attr('pointer-events', 'none');

  node.append('text')
    .text(d => d.type.charAt(0).toUpperCase())
    .attr('fill', '#ffffff').attr('font-size', 9).attr('font-weight', 'bold')
    .attr('font-family', 'monospace').attr('text-anchor', 'middle').attr('dy', 3)
    .attr('pointer-events', 'none');

  node.append('title').text(d => `${d.type}: ${d.label}`);

  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    linkLabel
      .attr('x', d => (d.source.x + d.target.x) / 2)
      .attr('y', d => (d.source.y + d.target.y) / 2);
    node.attr('transform', d => `translate(${d.x},${d.y})`);
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Hierarchical left-to-right layout. Used by both 'sequence' (auto-reveal in
// discovery order) and 'step' (click-to-step) modes — they share the same
// positioning, only the visibility filter and animation differ.
// ────────────────────────────────────────────────────────────────────────────

function renderHierarchyGraph(svgEl, containerEl, graph, depths, opts, onSelectNode) {
  const { revealedDepth, animate } = opts;
  const width = containerEl.offsetWidth;
  const height = containerEl.offsetHeight || 550;

  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();
  svg.attr('viewBox', [0, 0, width, height]);

  // Position every node by (depth, rank-within-depth). Rank is stable —
  // sorted by id — so layouts are deterministic across renders.
  const byDepth = new Map();
  const maxDepth = Math.max(0, ...[...depths.values()]);
  for (const n of graph.nodes) {
    const d = depths.get(n.id) ?? 0;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d).push(n);
  }
  const colCount = maxDepth + 1;
  const colW = width / Math.max(1, colCount);
  const positioned = graph.nodes.map(n => {
    const d = depths.get(n.id) ?? 0;
    const col = byDepth.get(d) || [];
    col.sort((a, b) => a.id.localeCompare(b.id));
    const rank = col.indexOf(n);
    const rowH = height / Math.max(1, col.length);
    return {
      ...n,
      x: (d + 0.5) * colW,
      y: (rank + 0.5) * rowH,
      depth: d,
    };
  });

  // Filter to currently-visible subset
  const visibleNodes = positioned.filter(n => n.depth <= revealedDepth);
  const visibleIds = new Set(visibleNodes.map(n => n.id));
  const visibleEdges = graph.edges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target));

  const g = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.3, 4]).on('zoom', (event) => g.attr('transform', event.transform)));

  // Faint depth-column dividers — establishes the ordering visually
  g.append('g').attr('class', 'depth-rules').selectAll('line')
    .data(d3.range(1, colCount))
    .join('line')
    .attr('x1', i => i * colW).attr('x2', i => i * colW)
    .attr('y1', 0).attr('y2', height)
    .attr('stroke', 'rgba(0,0,0,0.04)').attr('stroke-dasharray', '2 4');

  // Depth labels along the top
  g.append('g').selectAll('text')
    .data(d3.range(0, colCount))
    .join('text')
    .attr('x', d => (d + 0.5) * colW).attr('y', 14)
    .attr('text-anchor', 'middle').attr('font-family', 'monospace')
    .attr('font-size', 10).attr('font-weight', 600)
    .attr('letter-spacing', '0.18em')
    .attr('fill', d => d <= revealedDepth ? 'var(--color-sap-accent)' : 'var(--color-sap-muted)')
    .text(d => d === 0 ? 'SEED' : `DEPTH ${d}`);

  // Helper: derive position by node id (used for edges)
  const posById = new Map(positioned.map(n => [n.id, { x: n.x, y: n.y }]));

  // Edges — bezier curves so they don't overlap straight horizontal lines
  const linkPath = (e) => {
    const s = posById.get(e.source); const t = posById.get(e.target);
    if (!s || !t) return null;
    const mx = (s.x + t.x) / 2;
    return `M ${s.x},${s.y} C ${mx},${s.y} ${mx},${t.y} ${t.x},${t.y}`;
  };

  const link = g.append('g').attr('class', 'links')
    .selectAll('path').data(visibleEdges).join('path')
    .attr('d', linkPath)
    .attr('fill', 'none')
    .attr('stroke',         d => EDGE_TYPES[d.type]?.color || '#1e2d45')
    .attr('stroke-width',   d => EDGE_TYPES[d.type]?.weight || 1.5)
    .attr('stroke-opacity', 0.45)
    .attr('stroke-dasharray', d => {
      const et = EDGE_TYPES[d.type];
      if (et?.style === 'dashed') return '6 3';
      if (et?.style === 'dotted') return '2 2';
      return null;
    });

  // Nodes
  const node = g.append('g').attr('class', 'nodes')
    .selectAll('g').data(visibleNodes, d => d.id).join('g')
    .attr('transform', d => `translate(${d.x},${d.y})`);

  node.append('circle')
    .attr('r', d => NODE_RADIUS[d.type] || NODE_RADIUS.default)
    .attr('fill',   d => NODE_COLORS[d.type] || '#64748b')
    .attr('stroke', d => NODE_COLORS[d.type] || '#64748b')
    .attr('stroke-width', 2).attr('stroke-opacity', 0.35).attr('cursor', 'pointer')
    .on('click', (event, d) => {
      event.stopPropagation();
      onSelectNode?.(d);
    })
    .on('mouseover', function() { d3.select(this).attr('stroke-opacity', 0.85).attr('stroke-width', 3); })
    .on('mouseout',  function() { d3.select(this).attr('stroke-opacity', 0.35).attr('stroke-width', 2); });

  node.append('text')
    .text(d => d.label.length > 22 ? d.label.slice(0, 20) + '...' : d.label)
    .attr('fill', '#5a6b8a').attr('font-size', 9).attr('font-family', 'monospace')
    .attr('text-anchor', 'middle')
    .attr('dy', d => (NODE_RADIUS[d.type] || NODE_RADIUS.default) + 12)
    .attr('pointer-events', 'none');

  node.append('text')
    .text(d => d.type.charAt(0).toUpperCase())
    .attr('fill', '#ffffff').attr('font-size', 9).attr('font-weight', 'bold')
    .attr('font-family', 'monospace').attr('text-anchor', 'middle').attr('dy', 3)
    .attr('pointer-events', 'none');

  node.append('title').text(d => `${d.type}: ${d.label}  ·  depth ${d.depth}`);

  // Sequence reveal — fade in by depth, staggered
  if (animate) {
    const STEP_MS = 450;
    node.style('opacity', 0)
      .transition()
      .delay(d => d.depth * STEP_MS)
      .duration(300)
      .style('opacity', 1);
    link.style('opacity', 0)
      .transition()
      // Edges land just after the LATER endpoint's depth fades in
      .delay(d => {
        const dstNode = positioned.find(n => n.id === d.target);
        const srcNode = positioned.find(n => n.id === d.source);
        const lateDepth = Math.max(srcNode?.depth ?? 0, dstNode?.depth ?? 0);
        return lateDepth * STEP_MS + 150;
      })
      .duration(300)
      .style('opacity', 0.45);
  }
}
