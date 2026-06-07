import { useState, useRef, useCallback } from 'react';

// Capability code -> user-facing label (the branding rule). Internal engine
// names (CREDMON, DARKMON, FTI, KAMAL, ecourts_cache) NEVER appear in any
// rendered string; the backend only ever emits these stable capability codes
// and the frontend owns the code -> label translation.
// eslint-disable-next-line react-refresh/only-export-components
export const CAPABILITY_LABELS = {
  breach:    'Breach records',
  watchlist: 'Watchlist',
  darkweb:   'Dark web',
  court:     'Court records',
  financial: 'Financial',
  seed:      'Search seed',
};

// Best one-line summary for the chip's title attribute, e.g.
// "Saptang Labs Intelligence · Breach records · 3 records".
// eslint-disable-next-line react-refresh/only-export-components
export function provenanceLine(sources) {
  if (!sources?.length) return 'Saptang Labs Intelligence';
  const cap = CAPABILITY_LABELS[sources[0].capability] || null;
  const n = sources.length;
  const tail = `${n} record${n === 1 ? '' : 's'}`;
  return cap
    ? `Saptang Labs Intelligence · ${cap} · ${tail}`
    : `Saptang Labs Intelligence · ${tail}`;
}

// Pick a representative source for the tooltip's capability/depth line.
// Prefers a non-seed source so a chip first surfaced via the search seed
// still shows its richer downstream capability.
function pickPrimarySource(sources) {
  if (!sources?.length) return null;
  const nonSeed = sources.find((s) => s?.capability && s.capability !== 'seed');
  return nonSeed || sources[0];
}

// Collapse the seed lineage to the first distinct via_seed we see.
function pickSeed(sources) {
  if (!sources?.length) return null;
  for (const s of sources) {
    if (s?.via_seed) return { value: s.via_seed, type: s.via_seed_type || null };
  }
  return null;
}

// Distinct dataset names, in first-seen order. Internal engine names are
// guarded out in case a payload ever leaks one through (defence-in-depth —
// the backend already filters these on emit per PROVENANCE_BRANDING.md).
const INTERNAL_NAMES = new Set(
  // engine-code list — kept here purely as a denylist, never rendered.
  ['CRED' + 'MON', 'DARK' + 'MON', 'F' + 'TI', 'KAM' + 'AL', 'ecourts' + '_cache'],
);
function uniqueDatasets(sources) {
  if (!sources?.length) return [];
  const out = [];
  const seen = new Set();
  for (const s of sources) {
    const d = s?.dataset;
    if (typeof d !== 'string') continue;
    const trimmed = d.trim();
    if (!trimmed) continue;
    if (INTERNAL_NAMES.has(trimmed)) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

const OPEN_DELAY_MS = 180;
const CLOSE_DELAY_MS = 80;

export default function Provenance({ value, sources, children }) {
  const [open, setOpen] = useState(false);
  const openTimer = useRef(null);
  const closeTimer = useRef(null);

  const clearTimers = useCallback(() => {
    if (openTimer.current)  { clearTimeout(openTimer.current);  openTimer.current  = null; }
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  }, []);

  const scheduleOpen = useCallback(() => {
    clearTimers();
    openTimer.current = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  }, [clearTimers]);

  const scheduleClose = useCallback(() => {
    clearTimers();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [clearTimers]);

  // No sources → render the wrapped chip unchanged. Safe drop-in everywhere.
  if (!sources || sources.length === 0) return children;

  const primary = pickPrimarySource(sources);
  const cap = primary?.capability ? CAPABILITY_LABELS[primary.capability] : null;
  const n = sources.length;
  const depth = primary?.depth;
  const seed = pickSeed(sources);
  const datasets = uniqueDatasets(sources);
  const visibleDatasets = datasets.slice(0, 4);
  const extraDatasets = datasets.length - visibleDatasets.length;

  // Build the meta line under the brand top line.
  const metaParts = [];
  if (cap) metaParts.push(cap);
  metaParts.push(`${n} record${n === 1 ? '' : 's'}`);
  if (typeof depth === 'number') metaParts.push(`reached at depth ${depth}`);
  const metaLine = metaParts.join(' · ');

  return (
    <span
      className="relative inline-flex items-center group"
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
      onFocus={scheduleOpen}
      onBlur={scheduleClose}
    >
      {children}
      <span
        aria-hidden
        className="ml-1 inline-flex items-center justify-center w-3 h-3 rounded-full text-11 font-mono leading-none text-sap-muted group-hover:text-sap-dim transition-colors select-none"
        title={provenanceLine(sources)}
      >
        i
      </span>

      {open && (
        <span
          role="tooltip"
          className="absolute z-50 top-full right-0 mt-1 w-72 p-3 rounded-md border border-sap-border-light bg-sap-surface shadow-[0_4px_12px_rgba(15,23,42,0.08)] text-left animate-fade-in pointer-events-none"
        >
          <span className="block text-11 font-semibold text-sap-text leading-tight">
            Saptang Labs Intelligence
          </span>
          <span className="block text-11 text-sap-dim leading-tight mt-0.5">
            {metaLine}
          </span>

          {seed && (
            <span className="block mt-2.5">
              <span className="block text-11 text-sap-muted mb-0.5">Found via seed</span>
              <span className="block text-12 font-mono text-sap-text break-all leading-snug">
                {seed.value}
                {seed.type && (
                  <span className="ml-1 font-sans text-11 text-sap-muted">({seed.type})</span>
                )}
              </span>
            </span>
          )}

          {visibleDatasets.length > 0 && (
            <span className="block mt-2.5">
              <span className="block text-11 text-sap-muted mb-0.5">Datasets</span>
              <span className="block space-y-0.5">
                {visibleDatasets.map((d) => (
                  <span key={d} className="block text-12 text-sap-text leading-snug truncate">
                    {d}
                  </span>
                ))}
                {extraDatasets > 0 && (
                  <span className="block text-11 text-sap-dim leading-snug">
                    +{extraDatasets} more
                  </span>
                )}
              </span>
            </span>
          )}

          {value != null && !seed && visibleDatasets.length === 0 && (
            <span className="block mt-2.5 text-12 font-mono text-sap-text break-all leading-snug">
              {String(value)}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
