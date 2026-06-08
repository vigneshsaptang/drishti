import { useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  getEcourtsCoverage,
  getEcourtsByState,
  getEcourtsCourts,
  getEcourtsCaseTypes,
  ecourtsSearch,
  getEcourtsCase,
  getEcourtsOrder,
  ecourtsOrderPdfUrl,
} from '../lib/api';
import Shimmer from '../components/Shimmer';
import SectionDivider from '../components/SectionDivider';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function fmtBigNum(n) {
  if (n == null) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtExact(n) { return n != null ? n.toLocaleString() : '—'; }

function usePanel(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  useEffect(() => {
    let cancelled = false;
    fetcher()
      .then(r => { if (!cancelled) setState({ data: r, loading: false, error: null }); })
      .catch(e => { if (!cancelled) setState({ data: null, loading: false, error: String(e?.message || e) }); });
    return () => { cancelled = true; };
  }, deps);  // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

// GeoJSON state-name → our state-code (from enums_stateCode)
const GEO_NAME_TO_CODE = {
  'Andaman & Nicobar': 'AN',
  'Andhra Pradesh': 'AP',
  'Arunachal Pradesh': 'AR',
  'Assam': 'AS',
  'Bihar': 'BR',
  'Chandigarh': 'CH',
  'Chhattisgarh': 'CG',
  'Dadra and Nagar Haveli and Daman and Diu': 'DD',
  'Delhi': 'DL',
  'Goa': 'GA',
  'Gujarat': 'GJ',
  'Haryana': 'HR',
  'Himachal Pradesh': 'HP',
  'Jammu & Kashmir': 'JK',
  'Jharkhand': 'JH',
  'Karnataka': 'KA',
  'Kerala': 'KL',
  'Ladakh': null,
  'Lakshadweep': 'LD',
  'Madhya Pradesh': 'MP',
  'Maharashtra': 'MH',
  'Manipur': 'MN',
  'Meghalaya': 'MG',
  'Mizoram': 'MZ',
  'Nagaland': 'NL',
  'Odisha': 'OD',
  'Puducherry': 'PY',
  'Punjab': 'PB',
  'Rajasthan': 'RJ',
  'Sikkim': 'SK',
  'Tamil Nadu': 'TN',
  'Telangana': 'TS',
  'Tripura': 'TR',
  'Uttar Pradesh': 'UP',
  'Uttarakhand': 'UK',
  'West Bengal': 'WB',
};

const ACCENT = '#4f46e5';      // sap-accent indigo
const ACCENT_DARK = '#3730a3';

// ────────────────────────────────────────────────────────────────────────────
// Visual primitives (mirror DashboardIdle's vocabulary)
// ────────────────────────────────────────────────────────────────────────────

function CornerMarks({ color = 'border-sap-text/25' }) {
  return (
    <>
      <span aria-hidden className={`pointer-events-none absolute top-0 left-0 w-3 h-3 border-l border-t ${color}`} />
      <span aria-hidden className={`pointer-events-none absolute top-0 right-0 w-3 h-3 border-r border-t ${color}`} />
      <span aria-hidden className={`pointer-events-none absolute bottom-0 left-0 w-3 h-3 border-l border-b ${color}`} />
      <span aria-hidden className={`pointer-events-none absolute bottom-0 right-0 w-3 h-3 border-r border-b ${color}`} />
    </>
  );
}

function DocStrip({ code, label, sublabel, accent = 'text-sap-text' }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-sap-border-light">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-11 font-mono font-semibold text-sap-muted shrink-0">{code}</span>
        <span aria-hidden className="h-3 w-px bg-sap-border" />
        <span className={`text-12 font-semibold tracking-tight truncate ${accent}`}>{label}</span>
      </div>
      {sublabel && (
        <span className="hidden sm:inline text-11 text-sap-muted truncate max-w-[300px] shrink-0">{sublabel}</span>
      )}
    </div>
  );
}

function Caption({ children, className = '' }) {
  return <div className={`text-11 font-medium text-sap-muted ${className}`}>{children}</div>;
}


// ────────────────────────────────────────────────────────────────────────────
// Coverage hero — 4 stat blocks
// ────────────────────────────────────────────────────────────────────────────

function CoverageHero({ data, loading }) {
  const tiles = [
    { label: 'Courts indexed',  value: data?.courts,     suffix: 'codes' },
    { label: 'States covered',  value: data?.states,     suffix: 'enum' },
    { label: 'HC benches',      value: data?.hc_benches, suffix: `${fmtBigNum(data?.hc_master)} master` },
    { label: 'Case types',      value: data?.case_types, suffix: 'tracked' },
  ];
  return (
    <article className="relative rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
      <CornerMarks color="border-sap-accent/40" />
      <DocStrip
        code="DOCKET · EC-001"
        label="Court coverage"
        sublabel="Pan-India court index"
        accent="text-sap-accent"
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-sap-border-light">
        {tiles.map(t => (
          <div key={t.label} className="px-4 py-4">
            <Caption>{t.label}</Caption>
            <div className="mt-2.5 mb-1">
              {loading ? <Shimmer className="h-9 w-28" /> : (
                <span className="font-mono font-semibold tabular-nums leading-none text-26 text-sap-accent">
                  {fmtBigNum(t.value)}
                </span>
              )}
            </div>
            <div className="text-11 text-sap-muted">{t.suffix}</div>
          </div>
        ))}
      </div>
    </article>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// India choropleth — Leaflet, no tile layer, polygons + bubbles
// ────────────────────────────────────────────────────────────────────────────

function IndiaChoropleth({ byState, loading, selected, onSelect }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef({ polygons: null, bubbles: null });
  const [geo, setGeo] = useState(null);
  const [loadErr, setLoadErr] = useState(null);

  // Lookup: state code → row
  const byCode = useMemo(() => {
    const m = {};
    (byState || []).forEach(r => { if (r.state_code) m[r.state_code] = r; });
    return m;
  }, [byState]);

  const max = useMemo(
    () => Math.max(1, ...(byState || []).map(r => r.count || 0)),
    [byState],
  );

  // 1. Load GeoJSON once
  useEffect(() => {
    let cancelled = false;
    fetch('/geo/india_states.geojson')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`geo ${r.status}`)))
      .then(j => { if (!cancelled) setGeo(j); })
      .catch(e => { if (!cancelled) setLoadErr(String(e?.message || e)); });
    return () => { cancelled = true; };
  }, []);

  // 2. Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: false,
      zoomSnap: 0.25,
      scrollWheelZoom: false,
      dragging: true,
      doubleClickZoom: false,
      preferCanvas: true,
    }).setView([22.9734, 78.6569], 4.5);
    map.getContainer().style.background = 'transparent';
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // 3. Render polygons + bubbles when geo + data ready
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geo) return;

    if (layersRef.current.polygons) layersRef.current.polygons.remove();
    if (layersRef.current.bubbles)  layersRef.current.bubbles.remove();

    const styleFor = (code) => {
      const row = byCode[code];
      const intensity = row ? Math.max(0.05, Math.min(0.6, row.count / max)) : 0.02;
      const isSelected = selected && code === selected;
      return {
        fillColor: ACCENT,
        fillOpacity: intensity,
        color: isSelected ? '#111827' : '#d1d5db',
        weight: isSelected ? 1.6 : 0.6,
      };
    };

    const polygons = L.geoJSON(geo, {
      style: (f) => styleFor(GEO_NAME_TO_CODE[f.properties?.ST_NM]),
      onEachFeature: (f, layer) => {
        const code = GEO_NAME_TO_CODE[f.properties?.ST_NM];
        const row = code ? byCode[code] : null;
        const tip = row
          ? `<div style="font-family:ui-monospace,SFMono-Regular,monospace;font-size:11px"><b>${f.properties.ST_NM}</b> · ${code}<br/>${row.count.toLocaleString()} courts<br/><span style="color:#9ca3af">${row.kind_breakdown.District} District · ${row.kind_breakdown.HighCourt} HC · ${row.kind_breakdown.NCLT} NCLT</span></div>`
          : `<div style="font-family:ui-monospace,monospace;font-size:11px;color:#9ca3af"><b>${f.properties.ST_NM}</b><br/>no court data</div>`;
        layer.bindTooltip(tip, { sticky: true, opacity: 1, className: 'ec-tt' });
        layer.on({
          mouseover: (e) => e.target.setStyle({ weight: 1.4, color: '#111827' }),
          mouseout:  (e) => polygons.resetStyle(e.target),
          click: () => onSelect && code && onSelect(selected === code ? null : code),
        });
      },
    }).addTo(map);

    // Bubble overlay at each state's polygon centroid
    const bubbles = L.layerGroup().addTo(map);
    polygons.eachLayer((layer) => {
      const code = GEO_NAME_TO_CODE[layer.feature?.properties?.ST_NM];
      const row = code ? byCode[code] : null;
      if (!row || !row.count) return;
      const c = layer.getBounds().getCenter();
      const r = Math.max(6, Math.min(34, Math.sqrt(row.count) * 0.7));
      const m = L.circleMarker([c.lat, c.lng], {
        radius: r,
        fillColor: ACCENT,
        fillOpacity: 0.85,
        color: '#ffffff',
        weight: 1.2,
        interactive: true,
      });
      if (r > 18) {
        m.bindTooltip(`<span style="font-family:ui-monospace,monospace;font-size:10px;color:#fff;font-weight:600">${fmtBigNum(row.count)}</span>`, {
          permanent: true, direction: 'center', className: 'ec-bubble-label', opacity: 1,
        });
      }
      m.on('click', () => onSelect && onSelect(selected === code ? null : code));
      m.addTo(bubbles);
    });

    layersRef.current = { polygons, bubbles };
  }, [geo, byState, byCode, max, selected, onSelect]);

  return (
    <article className="relative rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden h-full">
      <CornerMarks color="border-sap-accent/40" />
      <DocStrip
        code="MAP · EC-002"
        label="Jurisdiction coverage"
        sublabel="Court count per state · click to filter"
        accent="text-sap-accent"
      />
      <div className="relative" style={{ height: '520px' }}>
        {loadErr && (
          <div className="absolute inset-0 flex items-center justify-center text-12 font-mono text-sap-danger">
            geo load failed: {loadErr}
          </div>
        )}
        {(loading || !geo) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Shimmer className="h-full w-full" />
          </div>
        )}
        <div ref={containerRef} className="absolute inset-0" />
      </div>
    </article>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Top states bar — sortable horizontal bars
// ────────────────────────────────────────────────────────────────────────────

function TopStatesBar({ byState, loading, selected, onSelect, limit = 10 }) {
  const sorted = (byState || []).slice(0, limit);
  const max = Math.max(1, ...sorted.map(r => r.count || 0));
  return (
    <article className="relative rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
      <CornerMarks color="border-sap-accent/40" />
      <DocStrip code="EC-003" label="Top states by court count" sublabel={`top ${limit}`} accent="text-sap-accent" />
      <div className="px-4 py-3 space-y-2">
        {loading && Array.from({ length: limit }).map((_, i) => (
          <div key={i} className="flex items-center gap-3"><Shimmer className="h-3 w-12" /><Shimmer className="h-2 flex-1" /><Shimmer className="h-3 w-10" /></div>
        ))}
        {!loading && sorted.map(r => {
          const pct = Math.max(2, (r.count / max) * 100);
          const isSel = selected === r.state_code;
          return (
            <button
              key={r.state_code}
              type="button"
              onClick={() => onSelect && onSelect(isSel ? null : r.state_code)}
              className={`group w-full flex items-center gap-3 text-left rounded-sm px-1.5 py-1 transition-colors ${
                isSel ? 'bg-sap-accent/10' : 'hover:bg-sap-panel/60'
              }`}
            >
              <span className={`text-11 font-mono tabular-nums w-7 ${isSel ? 'text-sap-accent font-semibold' : 'text-sap-muted'}`}>{r.state_code}</span>
              <span className={`text-12 font-medium w-32 truncate ${isSel ? 'text-sap-accent' : 'text-sap-text'}`}>{r.state_name || r.state_code}</span>
              <div className="flex-1 h-2 bg-sap-panel rounded-sm overflow-hidden">
                <div
                  className="h-full origin-left animate-bar-grow"
                  style={{
                    width: `${pct}%`,
                    background: ACCENT,
                    opacity: isSel ? 1 : 0.75,
                  }}
                />
              </div>
              <span className="text-12 font-mono font-semibold tabular-nums w-14 text-right text-sap-text">{fmtBigNum(r.count)}</span>
            </button>
          );
        })}
      </div>
    </article>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Court-kind donut — pure SVG, three arcs
// ────────────────────────────────────────────────────────────────────────────

function polarToCart(cx, cy, r, deg) {
  const rad = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx, cy, r, startDeg, endDeg) {
  const [sx, sy] = polarToCart(cx, cy, r, endDeg);
  const [ex, ey] = polarToCart(cx, cy, r, startDeg);
  const large = endDeg - startDeg <= 180 ? 0 : 1;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${large} 0 ${ex} ${ey}`;
}

function CourtKindDonut({ breakdown, loading }) {
  const segments = [
    { key: 'SupremeCourt', label: 'Supreme Court', color: ACCENT_DARK },
    { key: 'HighCourt',    label: 'High Court',    color: '#6366f1' },
    { key: 'District',     label: 'District',      color: ACCENT },
    { key: 'NCLT',         label: 'NCLT',          color: '#a5b4fc' },
  ];
  const total = segments.reduce((a, s) => a + (breakdown?.[s.key] || 0), 0) || 1;
  let cursor = 0;
  const arcs = segments.map(s => {
    const value = breakdown?.[s.key] || 0;
    const sweep = (value / total) * 360;
    const start = cursor;
    const end = cursor + sweep;
    cursor = end;
    return { ...s, value, start, end, pct: (value / total) * 100 };
  });

  return (
    <article className="relative rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
      <CornerMarks color="border-sap-accent/40" />
      <DocStrip code="EC-004" label="Court kind mix" sublabel={`${total.toLocaleString()} total`} accent="text-sap-accent" />
      <div className="px-4 py-4 flex items-center gap-6">
        <div className="relative shrink-0" style={{ width: 132, height: 132 }}>
          {loading ? (
            <Shimmer className="absolute inset-0 rounded-full" />
          ) : (
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-0">
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-sap-panel)" strokeWidth="14" />
              {arcs.map(a => (
                a.end - a.start < 0.5 ? null : (
                  <path key={a.key} d={arcPath(50, 50, 42, a.start, a.end)} fill="none" stroke={a.color} strokeWidth="14" strokeLinecap="butt" />
                )
              ))}
              <text x="50" y="48" textAnchor="middle" className="font-mono font-semibold" style={{ fontSize: 11, fill: 'var(--color-sap-text)' }}>
                {fmtBigNum(total)}
              </text>
              <text x="50" y="60" textAnchor="middle" className="font-mono" style={{ fontSize: 6, fill: 'var(--color-sap-muted)', letterSpacing: '0.18em' }}>
                COURTS
              </text>
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          {arcs.map(a => (
            <div key={a.key} className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: a.color }} />
              <span className="text-12 font-medium text-sap-text w-20">{a.label}</span>
              <span className="flex-1 text-12 font-mono tabular-nums text-sap-muted">{a.pct.toFixed(1)}%</span>
              <span className="text-12 font-mono font-semibold tabular-nums text-sap-text">{fmtExact(a.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Court directory table — paginated + filterable
// ────────────────────────────────────────────────────────────────────────────

const KINDS = ['SupremeCourt', 'HighCourt', 'District', 'NCLT'];

function CourtDirectoryTable({ stateFilter, onStateChange, byState }) {
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const limit = 50;

  // Reset page on filter change
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPage(1); }, [stateFilter, kind, q]);

  const { data, loading } = usePanel(
    () => getEcourtsCourts({
      ...(stateFilter ? { state: stateFilter } : {}),
      ...(kind ? { kind } : {}),
      ...(q ? { q } : {}),
      page: String(page),
      limit: String(limit),
    }),
    [stateFilter, kind, q, page],
  );

  const rows = data?.data || [];
  const total = data?.total || 0;
  const hasNext = data?.has_next;

  const stateOpts = useMemo(
    () => (byState || []).map(s => ({ code: s.state_code, name: s.state_name || s.state_code })),
    [byState],
  );

  return (
    <article className="relative rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
      <CornerMarks color="border-sap-accent/40" />
      <DocStrip
        code="REGISTRY · EC-005"
        label="Court directory"
        sublabel={`${fmtExact(total)} matches · page ${page}`}
        accent="text-sap-accent"
      />

      <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-sap-bg/60 border-b border-sap-border-light">
        <select
          value={stateFilter || ''}
          onChange={e => onStateChange(e.target.value || null)}
          className="text-12 px-2 py-1.5 rounded-sm border border-sap-border bg-sap-surface text-sap-text"
        >
          <option value="">All states</option>
          {stateOpts.map(s => <option key={s.code} value={s.code}>{s.code} · {s.name}</option>)}
        </select>
        <select
          value={kind}
          onChange={e => setKind(e.target.value)}
          className="text-12 px-2 py-1.5 rounded-sm border border-sap-border bg-sap-surface text-sap-text"
        >
          <option value="">All kinds</option>
          {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search code or description…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="w-full text-12 px-3 py-1.5 rounded-sm border border-sap-border bg-sap-surface text-sap-text placeholder:text-sap-muted"
          />
        </div>
        {(stateFilter || kind || q) && (
          <button
            type="button"
            onClick={() => { onStateChange(null); setKind(''); setQ(''); }}
            className="text-11 px-2 py-1 rounded-sm border border-sap-border text-sap-muted hover:text-sap-text hover:border-sap-text/40"
          >
            Reset
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-12">
          <thead>
            <tr className="border-b border-sap-border-light bg-sap-bg/60 text-left">
              <th className="px-4 py-2.5 font-medium text-11 text-sap-muted w-24">Code</th>
              <th className="px-4 py-2.5 font-medium text-11 text-sap-muted">Description</th>
              <th className="px-4 py-2.5 font-medium text-11 text-sap-muted w-24">Kind</th>
              <th className="px-4 py-2.5 font-medium text-11 text-sap-muted w-44">State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sap-border-light">
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>
                <td className="px-4 py-2"><Shimmer className="h-3 w-16" /></td>
                <td className="px-4 py-2"><Shimmer className="h-3 w-72" /></td>
                <td className="px-4 py-2"><Shimmer className="h-3 w-12" /></td>
                <td className="px-4 py-2"><Shimmer className="h-3 w-24" /></td>
              </tr>
            ))}
            {!loading && rows.map(r => (
              <tr key={r.code} className="hover:bg-sap-panel/30">
                <td className="px-4 py-2 text-sap-text font-mono font-semibold tracking-tight">{r.code}</td>
                <td className="px-4 py-2 text-sap-dim">{r.description}</td>
                <td className="px-4 py-2">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-11 ${
                    r._court_kind === 'SupremeCourt' ? 'bg-sap-accent-glow text-sap-accent border border-sap-accent/40' :
                    r._court_kind === 'HighCourt'    ? 'bg-sap-accent/10 text-sap-accent border border-sap-accent/40' :
                    r._court_kind === 'NCLT'         ? 'bg-sap-accent/15 text-sap-accent border border-sap-accent/40' :
                                                       'bg-sap-accent/10 text-sap-accent border border-sap-accent/40'
                  }`}>{r._court_kind || 'Other'}</span>
                </td>
                <td className="px-4 py-2 text-sap-dim">
                  <span className="text-sap-muted">{r._state_prefix || '—'}</span> · {r._state_name || '—'}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sap-muted">No courts match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t border-sap-border-light text-11">
        <span className="text-sap-muted">Showing {((page - 1) * limit) + (rows.length ? 1 : 0)}–{(page - 1) * limit + rows.length} of {fmtExact(total)}</span>
        <div className="flex gap-2">
          <button type="button" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}
            className="px-3 py-1.5 rounded-lg border border-sap-border text-sap-text disabled:opacity-30 disabled:cursor-not-allowed hover:bg-sap-panel">Previous</button>
          <span className="px-3 py-1 text-sap-text">page {page}</span>
          <button type="button" disabled={!hasNext} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 rounded-lg border border-sap-border text-sap-text disabled:opacity-30 disabled:cursor-not-allowed hover:bg-sap-panel">Next</button>
        </div>
      </div>
    </article>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Case types — glossary panel with code + plain-English description
// ────────────────────────────────────────────────────────────────────────────

function CaseTypesPanel({ caseTypes, total, loading }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const list = caseTypes || [];
    if (!q) return list;
    const needle = q.toLowerCase();
    return list.filter(c =>
      (c.code || '').toLowerCase().includes(needle) ||
      (c.description || '').toLowerCase().includes(needle)
    );
  }, [caseTypes, q]);

  return (
    <article className="relative rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
      <CornerMarks color="border-sap-accent/30" />
      <DocStrip
        code="GLOSSARY · EC-006"
        label="Case types"
        sublabel={`${total} categories · standard filing classifications`}
        accent="text-sap-accent"
      />

      <div className="px-4 py-3 bg-sap-bg/60 border-b border-sap-border-light flex items-center gap-3">
        <span className="text-11 text-sap-muted shrink-0">Filter</span>
        <input
          type="text"
          placeholder="e.g. bail, writ, arbitration, NDPS…"
          value={q}
          onChange={e => setQ(e.target.value)}
          className="flex-1 text-12 px-3 py-1.5 rounded-sm border border-sap-border bg-sap-surface text-sap-text placeholder:text-sap-muted"
        />
        <span className="text-11 text-sap-muted tabular-nums">{filtered.length}/{total}</span>
      </div>

      <div className="px-4 py-3 max-h-[460px] overflow-y-auto">
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
            {Array.from({ length: 18 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2"><Shimmer className="h-3 w-16" /><Shimmer className="h-3 flex-1" /></div>
            ))}
          </div>
        )}
        {!loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
            {filtered.map(c => (
              <div
                key={c.code}
                className="group flex items-baseline gap-2.5 py-1 border-b border-sap-border-light last:border-0"
              >
                <span className="font-mono font-semibold text-11 text-sap-accent tracking-tight w-[88px] shrink-0 truncate">
                  {c.code}
                </span>
                <span className="text-12 text-sap-dim leading-tight flex-1 truncate" title={c.description}>
                  {c.description || '—'}
                </span>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full text-center text-12 text-sap-muted py-6">
                No case types match "{q}".
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-4 py-2.5 border-t border-sap-border-light bg-sap-bg/60 text-11 text-sap-muted leading-relaxed">
        <span className="font-semibold text-sap-dim">About:</span> these are the standard case-classification codes used across Indian court registries — every matter is filed under one of these categories. Hover any row for the full title.
      </div>
    </article>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Live screening — search live court records by litigant name
// ────────────────────────────────────────────────────────────────────────────

const KIND_OPTIONS = [
  { code: 'SupremeCourt', label: 'Supreme Court' },
  { code: 'HighCourt',    label: 'High Court' },
  { code: 'District',     label: 'District' },
  { code: 'NCLT',         label: 'NCLT' },
];

function PillToggle({ active, onClick, children, accent = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-sm text-11 font-medium transition-colors border ${
        active
          ? (accent ? 'bg-sap-accent text-white border-sap-accent' : 'bg-sap-text text-white border-sap-text')
          : 'bg-sap-surface text-sap-dim border-sap-border hover:text-sap-text hover:border-sap-text/40'
      }`}
    >{children}</button>
  );
}

// Search-scope presets — each one bounds the courtCodes that go to /search,
// so the operator can never accidentally trigger an India-wide all-courts sweep.
const SCOPES = [
  { id: 'hc',    label: 'All High Courts',  hint: '~40 codes · India-wide HC scan',  kinds: ['HighCourt'] },
  { id: 'sc',    label: 'Supreme Court',    hint: '1 court',                         kinds: ['SupremeCourt'] },
  { id: 'nclt',  label: 'All NCLT',         hint: '~15 codes · tribunals',           kinds: ['NCLT'] },
  { id: 'state', label: 'Within a state',   hint: 'pick state, optional narrowing',  kinds: null, requiresState: true },
];

function _estChunks(codes, chunkSize = 30) {
  return Math.max(1, Math.ceil(codes / chunkSize));
}

function SearchForm({ form, onChange, onSubmit, onReset, loading, byState, coverage }) {
  const stateOpts = (byState || []).map(s => ({ code: s.state_code, name: s.state_name || s.state_code, count: s.count }));
  const toggleArr = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];

  const scope = SCOPES.find(s => s.id === form.scope) || SCOPES[0];

  // Estimate court-code count and minimum paid-call count for the active scope.
  const estimate = useMemo(() => {
    if (scope.id === 'hc')   return { codes: coverage?.court_kinds?.HighCourt    ?? 40, calls: _estChunks(coverage?.court_kinds?.HighCourt    ?? 40) };
    if (scope.id === 'sc')   return { codes: coverage?.court_kinds?.SupremeCourt ?? 1,  calls: 1 };
    if (scope.id === 'nclt') return { codes: coverage?.court_kinds?.NCLT         ?? 15, calls: 1 };
    if (!form.state) return { codes: 0, calls: 0 };
    const row = stateOpts.find(s => s.code === form.state);
    if (!row) return { codes: 0, calls: 0 };
    let codes = row.count;
    if (form.kinds && form.kinds.length > 0) {
      const stateRow = (byState || []).find(s => s.state_code === form.state);
      const kb = stateRow?.kind_breakdown || {};
      codes = form.kinds.reduce((a, k) => a + (kb[k] || 0), 0);
    }
    return { codes, calls: _estChunks(codes) };
  }, [scope.id, form.state, form.kinds, byState, coverage, stateOpts]);

  const stateRequiredButMissing = scope.requiresState && !form.state;
  const stateNoCodes = scope.requiresState && form.state && estimate.codes === 0;
  const canSubmit =
    !loading &&
    form.name.trim().length >= 2 &&
    !stateRequiredButMissing &&
    !stateNoCodes &&
    estimate.codes > 0;

  return (
    <form onSubmit={onSubmit} className="px-4 py-4 space-y-4">
      {/* Name */}
      <div className="space-y-1.5">
        <label className="text-11 font-medium text-sap-muted">Litigant name</label>
        <input
          type="text"
          value={form.name}
          onChange={e => onChange({ ...form, name: e.target.value })}
          placeholder="e.g. Abhishek Kumar, Sitaram Sharma…"
          autoComplete="off"
          className="w-full text-13 px-3 py-2.5 rounded-sm border border-sap-border bg-sap-surface text-sap-text placeholder:text-sap-muted focus:outline-none focus:ring-1 focus:ring-sap-accent focus:border-sap-accent"
        />
      </div>

      {/* Scope selector */}
      <div className="space-y-1.5">
        <label className="text-11 font-medium text-sap-muted">Search scope</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {SCOPES.map(s => {
            const active = form.scope === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onChange({ ...form, scope: s.id, kinds: [] })}
                className={`text-left px-3 py-2.5 rounded-sm border transition-colors ${
                  active
                    ? 'border-sap-accent bg-sap-accent/10'
                    : 'border-sap-border bg-sap-surface hover:border-sap-text/40'
                }`}
              >
                <div className={`flex items-center gap-2 text-11 font-semibold ${active ? 'text-sap-accent' : 'text-sap-text'}`}>
                  <span className={`w-2.5 h-2.5 rounded-full border ${active ? 'bg-sap-accent border-sap-accent' : 'border-sap-border'}`} />
                  {s.label}
                </div>
                <div className="text-11 text-sap-muted mt-1 ml-[18px]">{s.hint}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* State + kind narrowing — only visible for state-scope */}
      {scope.requiresState && (
        <div className="space-y-3 px-3 py-3 rounded-sm border border-sap-accent/30 bg-sap-accent/5">
          <div className="space-y-1.5">
            <label className="text-11 font-medium text-sap-muted">
              State <span className="text-sap-danger">(required)</span>
            </label>
            <select
              value={form.state || ''}
              onChange={e => onChange({ ...form, state: e.target.value || null })}
              className={`w-full text-12 px-3 py-2 rounded-sm border bg-sap-surface text-sap-text ${
                stateRequiredButMissing ? 'border-sap-danger/60' : 'border-sap-border'
              }`}
            >
              <option value="">— select a state —</option>
              {stateOpts.map(s => (
                <option key={s.code} value={s.code}>{s.code} · {s.name} · {s.count.toLocaleString()} courts</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-11 font-medium text-sap-muted">Narrow by court type (optional)</label>
            <div className="flex flex-wrap gap-1.5">
              {KIND_OPTIONS.map(k => (
                <PillToggle
                  key={k.code}
                  active={(form.kinds || []).includes(k.code)}
                  onClick={() => onChange({ ...form, kinds: toggleArr(form.kinds || [], k.code) })}
                  accent
                >{k.label}</PillToggle>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Status */}
      <div className="space-y-1.5">
        <label className="text-11 font-medium text-sap-muted">Case status</label>
        <select
          value={form.case_status || ''}
          onChange={e => onChange({ ...form, case_status: e.target.value || null })}
          className="w-full sm:w-64 text-12 px-3 py-2 rounded-sm border border-sap-border bg-sap-surface text-sap-text"
        >
          <option value="">Any status</option>
          <option value="PENDING">Pending</option>
          <option value="DISPOSED">Disposed</option>
        </select>
      </div>

      {/* Cost estimate + actions */}
      <div className="flex items-center justify-between gap-3 pt-1 border-t border-sap-border-light mt-2 pt-3">
        <div className="text-11 leading-snug">
          {stateRequiredButMissing ? (
            <span className="text-sap-danger">⚠ Pick a state to scope the search.</span>
          ) : estimate.codes === 0 ? (
            <span className="text-sap-muted">Configure scope to see cost estimate.</span>
          ) : (
            <>
              <span className="text-sap-text font-semibold">~{estimate.calls}</span> <span className="text-sap-muted">paid call{estimate.calls === 1 ? '' : 's'}</span>
              <span className="text-sap-muted"> · {estimate.codes.toLocaleString()} courts in scope · cached 24h</span>
            </>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={onReset}
            disabled={loading}
            className="px-3 py-1.5 rounded-sm text-11 font-medium border border-sap-border text-sap-dim hover:text-sap-text hover:border-sap-text/40 disabled:opacity-40"
          >Reset</button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-5 py-2.5 rounded-lg text-13 font-semibold bg-sap-accent/10 hover:bg-sap-accent/20 text-sap-accent border border-sap-accent/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >{loading ? 'Searching…' : 'Run search'}</button>
        </div>
      </div>
    </form>
  );
}

function SearchSummary({ data }) {
  if (!data) return null;
  return (
    <div className="px-4 py-2.5 border-t border-sap-border-light bg-sap-bg/60 flex flex-wrap items-center gap-x-5 gap-y-1 text-11 text-sap-muted">
      <span><span className="text-sap-text font-semibold tabular-nums">{fmtExact(data.total_unique_cnrs)}</span> unique matters</span>
      <span><span className="text-sap-text font-semibold tabular-nums">{data.court_codes_searched}</span> codes screened</span>
      <span><span className="text-sap-text font-semibold tabular-nums">{data.chunks?.length ?? 0}</span> chunks</span>
      <span><span className="text-sap-text font-semibold tabular-nums">{data.total_paid_calls}</span> paid calls</span>
      {data._cached && <span className="text-sap-success">· served from cache</span>}
    </div>
  );
}

function StatusBadge({ status }) {
  const s = (status || '').toUpperCase();
  const tone =
    s === 'DISPOSED' ? 'bg-sap-panel text-sap-dim border-sap-border' :
    s === 'PENDING'  ? 'bg-sap-accent/15 text-sap-accent border-sap-accent/40' :
                       'bg-sap-panel text-sap-dim border-sap-border';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm border text-11 ${tone}`}>
      {s || '—'}
    </span>
  );
}

function SearchResults({ data, selectedCnr, onSelectCnr }) {
  if (!data || !data.results || data.results.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-13 text-sap-muted">
        No matters found for <span className="font-mono text-sap-dim">"{data?.name || ''}"</span> with these filters.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-12">
        <thead>
          <tr className="border-b border-sap-border-light bg-sap-bg/60 text-left">
            <th className="px-4 py-2.5 font-medium text-11 text-sap-muted w-44">CNR</th>
            <th className="px-4 py-2.5 font-medium text-11 text-sap-muted w-24">Type</th>
            <th className="px-4 py-2.5 font-medium text-11 text-sap-muted w-24">Status</th>
            <th className="px-4 py-2.5 font-medium text-11 text-sap-muted w-28">Filed</th>
            <th className="px-4 py-2.5 font-medium text-11 text-sap-muted">Parties</th>
            <th className="px-4 py-2.5 font-medium text-11 text-sap-muted w-44">Court</th>
            <th className="px-2 py-2.5 w-16" />
          </tr>
        </thead>
        <tbody className="divide-y divide-sap-border-light">
          {data.results.map(r => {
            const isSel = r.cnr === selectedCnr;
            return (
              <tr key={r.cnr} className={isSel ? 'bg-sap-accent/10' : 'hover:bg-sap-panel/30'}>
                <td className="px-4 py-2 text-sap-text font-mono font-semibold tracking-tight whitespace-nowrap">{r.cnr}</td>
                <td className="px-4 py-2 text-sap-dim">{r.caseType || '—'}</td>
                <td className="px-4 py-2"><StatusBadge status={r.caseStatus} /></td>
                <td className="px-4 py-2 text-sap-dim tabular-nums">{r.filingDate || '—'}</td>
                <td className="px-4 py-2 text-sap-dim">
                  <div className="truncate max-w-[280px]" title={(r.petitioners || []).join(' · ')}>
                    <span className="text-sap-muted">P:</span> {(r.petitioners || []).join(', ') || '—'}
                  </div>
                  <div className="truncate max-w-[280px] mt-0.5" title={(r.respondents || []).join(' · ')}>
                    <span className="text-sap-muted">R:</span> {(r.respondents || []).join(', ') || '—'}
                  </div>
                </td>
                <td className="px-4 py-2 text-sap-dim">
                  <div className="truncate max-w-[200px] font-mono" title={r.court?.courtComplexName || ''}>
                    {r.court?.courtComplexCode || '—'}
                  </div>
                  <div className="text-11 text-sap-muted truncate max-w-[200px]" title={r.court?.courtComplexName}>
                    {r.court?.courtComplexName || ''}
                  </div>
                </td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => onSelectCnr(isSel ? null : r.cnr)}
                    className={`text-11 font-medium px-2 py-1 rounded-sm border transition-colors ${
                      isSel
                        ? 'bg-sap-accent text-white border-sap-accent'
                        : 'border-sap-accent/50 text-sap-accent hover:bg-sap-accent/10'
                    }`}
                  >
                    {isSel ? 'Hide' : 'View'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Case detail viewer (lazy-fetched on CNR click) ──────────────────────────

function OrderViewer({ cnr, filename, onClose }) {
  const { data, loading, error } = usePanel(() => getEcourtsOrder(cnr, filename), [cnr, filename]);

  return (
    <div className="border-t border-sap-border-light bg-sap-bg/60">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-sap-border-light">
        <div className="flex items-center gap-3 min-w-0">
          <Caption>Order text</Caption>
          <span aria-hidden className="h-3 w-px bg-sap-border" />
          <span className="text-11 font-mono text-sap-text truncate">{filename}</span>
          {data?.source && (
            <span className="text-11 px-1.5 py-0.5 rounded-sm border border-sap-border text-sap-dim shrink-0">
              {data.source === 'embedded' ? 'free · embedded' : 'paid · order-md'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {data?.has_pdf && (
            <a
              href={ecourtsOrderPdfUrl(cnr, filename)}
              target="_blank"
              rel="noopener"
              className="text-11 font-medium px-2 py-1 rounded-sm border border-sap-accent/50 text-sap-accent hover:bg-sap-accent/10"
            >Open PDF</a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-11 font-medium px-2 py-1 rounded-sm border border-sap-border text-sap-dim hover:text-sap-text"
          >Close</button>
        </div>
      </div>
      <div className="px-4 py-3">
        {loading && <Shimmer className="h-32 w-full" />}
        {error && <p className="text-12 font-mono text-sap-danger">Error: {error}</p>}
        {data && !loading && (
          <pre className="text-12 font-mono whitespace-pre-wrap text-sap-text leading-relaxed max-h-[460px] overflow-y-auto">
            {data.markdown || '(no markdown content returned)'}
          </pre>
        )}
      </div>
    </div>
  );
}

function CaseDetailPanel({ cnr, onClose }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data: caseRes, loading, error } = usePanel(() => getEcourtsCase(cnr, refreshKey > 0), [cnr, refreshKey]);
  const [openOrder, setOpenOrder] = useState(null);

  const ccd = caseRes?.data?.courtCaseData || {};
  const filesArr = caseRes?.data?.files?.files || [];

  return (
    <div className="border-t border-sap-border-light bg-sap-bg/60">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-sap-border-light">
        <div className="flex items-center gap-3 min-w-0">
          <Caption>Case file</Caption>
          <span aria-hidden className="h-3 w-px bg-sap-border" />
          <span className="text-11 font-mono font-semibold text-sap-text truncate">{cnr}</span>
          {caseRes?._cached && (
            <span className="text-11 px-1.5 py-0.5 rounded-sm border border-sap-border text-sap-dim">cached</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setRefreshKey(k => k + 1)}
            disabled={loading}
            className="text-11 font-medium px-2 py-1 rounded-sm border border-sap-border text-sap-dim hover:text-sap-text disabled:opacity-40"
          >Refresh</button>
          <button
            type="button"
            onClick={onClose}
            className="text-11 font-medium px-2 py-1 rounded-sm border border-sap-border text-sap-dim hover:text-sap-text"
          >Close</button>
        </div>
      </div>

      {loading && (
        <div className="px-4 py-4 space-y-2">
          <Shimmer className="h-3 w-72" />
          <Shimmer className="h-3 w-96" />
          <Shimmer className="h-24 w-full mt-3" />
        </div>
      )}
      {error && <p className="px-4 py-3 text-12 font-mono text-sap-danger">Error: {error}</p>}

      {!loading && !error && caseRes && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-sap-border-light">
          {/* Left: parties + key dates */}
          <div className="lg:col-span-7 px-4 py-3 space-y-3">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <Caption>Type · Status</Caption>
                <p className="mt-1 text-13 text-sap-text">{ccd.caseType || '—'} · <StatusBadge status={ccd.caseStatus} /></p>
              </div>
              <div>
                <Caption>Court</Caption>
                <p className="mt-1 text-13 text-sap-text truncate" title={ccd.courtName}>{ccd.courtName || '—'}</p>
              </div>
              <div>
                <Caption>Filed</Caption>
                <p className="mt-1 text-13 font-mono tabular-nums text-sap-text">{ccd.filingDate || '—'}</p>
              </div>
              <div>
                <Caption>Decided</Caption>
                <p className="mt-1 text-13 font-mono tabular-nums text-sap-text">{ccd.decisionDate || '—'}</p>
              </div>
            </div>

            <div>
              <Caption>Petitioners</Caption>
              <ul className="mt-1.5 text-13 text-sap-text space-y-0.5">
                {(ccd.petitioners || []).map((p, i) => <li key={i}>· {p}</li>)}
                {(!ccd.petitioners || ccd.petitioners.length === 0) && <li className="text-sap-muted text-12">none</li>}
              </ul>
            </div>
            <div>
              <Caption>Respondents</Caption>
              <ul className="mt-1.5 text-13 text-sap-text space-y-0.5">
                {(ccd.respondents || []).map((r, i) => <li key={i}>· {r}</li>)}
                {(!ccd.respondents || ccd.respondents.length === 0) && <li className="text-sap-muted text-12">none</li>}
              </ul>
            </div>
            {(ccd.petitionerAdvocates?.length > 0 || ccd.respondentAdvocates?.length > 0) && (
              <div>
                <Caption>Advocates</Caption>
                <p className="mt-1 text-12 text-sap-dim">
                  P: {(ccd.petitionerAdvocates || []).join(', ') || '—'} <span className="text-sap-muted">|</span> R: {(ccd.respondentAdvocates || []).join(', ') || '—'}
                </p>
              </div>
            )}
          </div>

          {/* Right: orders list */}
          <div className="lg:col-span-5 px-4 py-3">
            <div className="flex items-baseline justify-between mb-2">
              <Caption>Orders &amp; Files</Caption>
              <span className="text-11 text-sap-muted tabular-nums">{filesArr.length} file(s)</span>
            </div>
            {filesArr.length === 0 && <p className="text-12 text-sap-muted">No order PDFs attached.</p>}
            <ul className="space-y-1.5">
              {filesArr.map(f => {
                const isOpen = openOrder === f.pdfFile;
                return (
                  <li key={f.pdfFile} className="rounded-sm border border-sap-border bg-sap-surface">
                    <button
                      type="button"
                      onClick={() => setOpenOrder(isOpen ? null : f.pdfFile)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-sap-panel/40"
                    >
                      <span className="font-mono text-11 text-sap-text truncate">{f.pdfFile}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        {f.markdownContent && (
                          <span className="text-11 font-medium text-sap-success">free</span>
                        )}
                        <span className={`text-11 transition-transform ${isOpen ? 'rotate-90 text-sap-accent' : 'text-sap-muted'}`}>▶</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {openOrder && <OrderViewer cnr={cnr} filename={openOrder} onClose={() => setOpenOrder(null)} />}
    </div>
  );
}

// ── Live screening top-level section ────────────────────────────────────────

function LiveScreeningSection({ byState, coverage }) {
  // Default scope is "All High Courts" — cheapest meaningful screen (~2 paid calls).
  const [form, setForm] = useState({ name: '', scope: 'hc', state: null, kinds: [], case_status: null });
  const [search, setSearch] = useState({ data: null, loading: false, error: null });
  const [selectedCnr, setSelectedCnr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (form.name.trim().length < 2) return;

    // Translate scope to backend filters
    let states; let kinds;
    if (form.scope === 'state') {
      if (!form.state) return;  // form already disables submit; defensive guard
      states = [form.state];
      kinds = form.kinds.length > 0 ? form.kinds : undefined;
    } else if (form.scope === 'hc')   { kinds = ['HighCourt']; }
    else if (form.scope === 'sc')     { kinds = ['SupremeCourt']; }
    else if (form.scope === 'nclt')   { kinds = ['NCLT']; }

    const body = {
      name: form.name.trim(),
      states,
      kinds,
      case_status: form.case_status || undefined,
    };

    setSearch({ data: null, loading: true, error: null });
    setSelectedCnr(null);
    try {
      const res = await ecourtsSearch(body);
      setSearch({ data: res, loading: false, error: null });
    } catch (err) {
      setSearch({ data: null, loading: false, error: String(err?.message || err) });
    }
  };

  const reset = () => {
    setForm({ name: '', scope: 'hc', state: null, kinds: [], case_status: null });
    setSearch({ data: null, loading: false, error: null });
    setSelectedCnr(null);
  };

  return (
    <article className="relative rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
      <CornerMarks color="border-sap-accent/40" />
      <DocStrip
        code="LIVE · EC-100"
        label="Litigation screening"
        sublabel="Bounded scope · pick High Courts / Supreme / NCLT / a state"
        accent="text-sap-accent"
      />
      <SearchForm form={form} onChange={setForm} onSubmit={submit} onReset={reset} loading={search.loading} byState={byState} coverage={coverage} />

      {search.error && (
        <div className="px-4 py-3 border-t border-sap-border-light bg-sap-danger-soft">
          <p className="text-12 font-mono text-sap-danger">Error: {search.error}</p>
        </div>
      )}

      {search.loading && (
        <div className="border-t border-sap-border-light px-4 py-5 space-y-2">
          <Shimmer className="h-3 w-80" />
          <Shimmer className="h-3 w-64" />
          <Shimmer className="h-3 w-72" />
        </div>
      )}

      {search.data && !search.loading && (
        <>
          <SearchSummary data={search.data} />
          <SearchResults data={search.data} selectedCnr={selectedCnr} onSelectCnr={setSelectedCnr} />
          {selectedCnr && <CaseDetailPanel cnr={selectedCnr} onClose={() => setSelectedCnr(null)} />}
        </>
      )}
    </article>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Top-level
// ────────────────────────────────────────────────────────────────────────────

export default function EcourtsTab() {
  const coverage = usePanel(getEcourtsCoverage, []);
  const byState  = usePanel(getEcourtsByState,  []);
  const caseTypes = usePanel(getEcourtsCaseTypes, []);

  const [selectedState, setSelectedState] = useState(null);

  const stateRows = byState.data?.data || [];
  const cov = coverage.data || {};

  return (
    <div className="space-y-5 animate-fade-in max-w-full">
      <SectionDivider label="Court directory" sub={`// EC · ${fmtBigNum(cov.courts || 0)} courts · ${fmtBigNum(cov.case_types || 0)} case types`} accent="text-sap-accent" />

      <CoverageHero data={cov} loading={coverage.loading} />

      <SectionDivider label="Live screening" sub="// EC-LIVE · Search court records by litigant name" accent="text-sap-accent" />
      <LiveScreeningSection byState={stateRows} coverage={cov} />

      <SectionDivider label="Reference / Coverage" sub="// EC-REF" accent="text-sap-accent" />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7">
          <IndiaChoropleth byState={stateRows} loading={byState.loading} selected={selectedState} onSelect={setSelectedState} />
        </div>
        <div className="lg:col-span-5 space-y-5">
          <TopStatesBar byState={stateRows} loading={byState.loading} selected={selectedState} onSelect={setSelectedState} limit={10} />
          <CourtKindDonut breakdown={cov.court_kinds} loading={coverage.loading} />
        </div>
      </div>

      <CourtDirectoryTable
        stateFilter={selectedState}
        onStateChange={setSelectedState}
        byState={stateRows}
      />

      <CaseTypesPanel caseTypes={caseTypes.data?.data} total={caseTypes.data?.total || 0} loading={caseTypes.loading} />
    </div>
  );
}
