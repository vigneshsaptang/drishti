import { useMemo, useState, useCallback, useEffect } from 'react';
import { getMcaCompany } from '../lib/api';
import Provenance from './Provenance';

/**
 * Coerce any value to a render-safe string.
 * - null/undefined → ''
 * - primitive → String(v)
 * - Array → comma-joined elements (recursively coerced)
 * - object → tries common name fields (full_name, name, label, value); falls back to JSON
 *
 * Without this guard, objects render as "[object Object]" and React still ships them
 * to the DOM (which then complains in dev mode).
 */
function asText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(', ');
  if (typeof v === 'object') {
    // Probe common scalar fields, in order of likelihood for the data we see in the wild.
    for (const k of ['full_name', 'name', 'displayName', 'label', 'value', 'text', 'title', 'keyword']) {
      if (typeof v[k] === 'string' && v[k]) return v[k];
    }
    // Object has no obvious text field; only JSON-stringify if it has any keys.
    if (Object.keys(v).length === 0) return '';
    try { return JSON.stringify(v); } catch { return '[object]'; }
  }
  return String(v);
}

/**
 * Parse worldcheck `further_info` text into typed sections.
 * The format is fixed: "[BIOGRAPHY] ... [IDENTIFICATION] ... [REPORTS] ..."
 * Returns [{label, body}, …] in the order they appear.
 */
function parseFurtherInfo(s) {
  if (!s || typeof s !== 'string') return [];
  const parts = [];
  // Split on bracketed labels like [BIOGRAPHY] or [REPORTS] — keep delimiters via lookahead.
  const re = /\[([A-Z][A-Z0-9 _-]+)\]\s*/g;
  let m; const indices = [];
  while ((m = re.exec(s)) !== null) {
    indices.push({ label: m[1].trim(), start: m.index, headerEnd: m.index + m[0].length });
  }
  for (let i = 0; i < indices.length; i++) {
    const { label, headerEnd } = indices[i];
    const end = i + 1 < indices.length ? indices[i + 1].start : s.length;
    const body = s.slice(headerEnd, end).trim();
    if (body) parts.push({ label, body });
  }
  // If no bracketed labels were found, treat the whole thing as one section.
  if (parts.length === 0 && s.trim()) parts.push({ label: 'Detail', body: s.trim() });
  return parts;
}

/**
 * Render worldcheck keywords (array of {keyword, source_name, keyword_type} objects)
 * as compact neutral pills. Tooltip carries source_name and type for analyst inspection.
 */
function KeywordPills({ keywords }) {
  const list = (Array.isArray(keywords) ? keywords : []).filter(
    k => k && typeof k === 'object' && k.keyword && Object.keys(k).length > 0
  );
  if (list.length === 0) return null;

  const toneFor = (kt) => {
    const t = (kt || '').toUpperCase();
    if (t.includes('SANCTION'))        return 'bg-sap-danger-soft text-sap-danger border-sap-danger/30';
    if (t.includes('LAW ENFORCEMENT')) return 'bg-sap-danger-soft text-sap-danger border-sap-danger/30';
    if (t.includes('REGULATORY'))      return 'bg-sap-warning-soft text-sap-warning border-sap-warning-filled/30';
    if (t.includes('PEP'))             return 'bg-sap-warning-soft text-sap-warning border-sap-warning-filled/30';
    if (t.includes('ADVERSE'))         return 'bg-sap-danger-soft text-sap-danger border-sap-danger/30';
    return 'bg-sap-panel text-sap-dim border-sap-border-light';
  };

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {list.slice(0, 8).map((k, i) => (
        <span
          key={i}
          title={`${asText(k.source_name) || asText(k.keyword)} · ${asText(k.keyword_type) || 'flag'}`}
          className={`inline-flex items-center px-1.5 h-5 rounded text-11 font-medium border ${toneFor(k.keyword_type)}`}
        >
          <span className="font-mono">{asText(k.keyword)}</span>
        </span>
      ))}
      {list.length > 8 && (
        <span className="text-11 text-sap-muted self-center">+{list.length - 8} more</span>
      )}
    </div>
  );
}

/**
 * Render the parsed [BIOGRAPHY] [IDENTIFICATION] [REPORTS] sections as a small
 * structured block. Truncates very long bodies but keeps a "show more" toggle.
 */
function FurtherInfoSection({ text }) {
  const sections = useMemo(() => parseFurtherInfo(text), [text]);
  const [expanded, setExpanded] = useState(false);
  if (sections.length === 0) return null;

  const tone = {
    BIOGRAPHY:      'text-sap-dim',
    IDENTIFICATION: 'text-sap-warning',
    REPORTS:        'text-sap-danger',
  };

  return (
    <div className="mt-2 space-y-1.5">
      {sections.map((s, i) => {
        const long = s.body.length > 220 && !expanded;
        return (
          <div key={i} className="text-12 leading-relaxed">
            <span className={`text-11 font-semibold tracking-tight ${tone[s.label] || 'text-sap-muted'}`}>
              {s.label.charAt(0) + s.label.slice(1).toLowerCase()}
            </span>
            <span className="text-sap-text ml-2">
              {long ? s.body.slice(0, 220) + '…' : s.body}
            </span>
          </div>
        );
      })}
      {sections.some(s => s.body.length > 220) && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="text-11 text-sap-dim hover:text-sap-text transition-colors"
        >{expanded ? 'Show less' : 'Show more'}</button>
      )}
    </div>
  );
}

/**
 * Collapsible block showing the raw record JSON. Useful for debugging when fields
 * arrive in unexpected shapes (e.g. objects where strings were expected).
 */
function RawRecord({ record }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 border-t border-sap-border-light pt-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-11 text-sap-dim hover:text-sap-text transition-colors"
      >
        {open ? 'Hide raw record' : 'Show raw record'}
      </button>
      {open && (
        <pre className="mt-1.5 px-2 py-1.5 rounded bg-sap-panel border border-sap-border-light text-11 font-mono text-sap-dim leading-relaxed whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
          {JSON.stringify(record, null, 2)}
        </pre>
      )}
    </div>
  );
}

/**
 * Shield icon SVG for the card header.
 */
function ShieldIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

/**
 * Badge showing Match (danger) or Clear (success).
 */
function StatusBadge({ found }) {
  if (found) {
    return (
      <span className="inline-flex items-center px-2 h-5 rounded text-11 font-semibold bg-sap-danger-filled text-white">
        Match
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 h-5 rounded text-11 font-semibold bg-sap-success-soft text-sap-success">
      Clear
    </span>
  );
}

/**
 * Score indicator — higher scores get warmer colors.
 */
function ScoreChip({ score }) {
  if (score == null) return null;
  const s = Number(score);
  let color = 'text-sap-dim bg-sap-panel';
  if (s >= 7) color = 'text-sap-danger bg-sap-danger-soft';
  else if (s >= 4) color = 'text-sap-warning bg-sap-warning-soft';
  return (
    <span className={`inline-flex items-center px-1.5 h-5 rounded text-11 font-semibold tabular-nums ${color}`}>
      {s.toFixed(1)}
    </span>
  );
}

/**
 * Extract company name(s) from a crimedata or worldcheck hit that references
 * the MCA Disqualified Directors registry.
 *
 * Crimedata: category === 'MCA Disqualified Directors', companies come from
 *   result._source.detail_info.linked_to (may be comma-separated).
 *
 * Worldcheck: keyword INMCA-DD2 OR source_name contains 'Ministry of Corporate Affairs'.
 *   Companies extracted from BIOGRAPHY section of EXTRA_DATA.further_info:
 *     "Director of Foo Pvt Ltd (Jan 2000 - Dec 2010), Bar Ltd (Feb 2011 - Mar 2015). ..."
 *   Parse: take text after "Director of " up to the next "[" section header, then
 *   split on ", " but reassemble tokens that look like a continuation of the previous
 *   company name (heuristic: token contains no " of " and no date-only pattern).
 *
 * Returns a deduped, trimmed string[] — empty array if not an MCA hit.
 */
function extractMcaCompanies(result) {
  const src = result._source || {};
  const extra = result.EXTRA_DATA || {};

  // ── crimedata path ─────────────────────────────────────────────────────────
  if (src.category === 'MCA Disqualified Directors') {
    const raw = src.detail_info?.linked_to;
    if (!raw || typeof raw !== 'string') return [];
    return [...new Set(raw.split(',').map(s => s.trim()).filter(Boolean))];
  }

  // ── worldcheck path ────────────────────────────────────────────────────────
  const keywords = Array.isArray(extra.keywords) ? extra.keywords : [];
  const isMcaKeyword = keywords.some(
    k => k?.keyword === 'INMCA-DD2' ||
         (typeof k?.source_name === 'string' && k.source_name.includes('Ministry of Corporate Affairs'))
  );
  if (!isMcaKeyword) return [];

  const furtherInfo = typeof extra.further_info === 'string' ? extra.further_info : '';
  if (!furtherInfo) return [];

  // Find the BIOGRAPHY section body
  const bioMatch = furtherInfo.match(/\[BIOGRAPHY\]\s*([\s\S]*?)(?=\[[A-Z]|$)/i);
  if (!bioMatch) return [];
  const bioText = bioMatch[1].trim();

  // Extract the "Director of ..." clause — everything from "Director of " to the next "."
  // that ends a sentence (or end of text). Multiple companies are comma-separated.
  const directorMatch = bioText.match(/Director of\s+([\s\S]+?)(?:\.\s|$)/i);
  if (!directorMatch) return [];

  // The captured group: "Foo Ltd (Jan 2000 - Sep 2010), Bar Ltd (Feb 2011 - Sep 2017), ..."
  // Strip trailing date ranges: "(Mmm YYYY - Mmm YYYY)"
  const companiesRaw = directorMatch[1];

  // Split on ", " but a naive split breaks names that contain " & " already handled.
  // Strategy: split on the pattern ", " followed by an uppercase letter (new company start),
  // OR on " ), " — the closing paren of a date range then comma.
  const parts = companiesRaw.split(/\s*\((?:[^)]*)\)\s*,?\s*/);

  const companies = parts
    .map(p => p.trim())
    .filter(Boolean)
    // Drop residual date-like strings accidentally captured
    .filter(p => !/^\d{4}$/.test(p) && p.length > 3);

  return [...new Set(companies)];
}

// ── Date formatting helper ─────────────────────────────────────────────────
function fmtDate(s) {
  if (!s) return '—';
  // Already ISO-like or human-readable — just return as-is.
  return String(s);
}

/**
 * MCA registry enrichment block — fired for each company name extracted from
 * an MCA Disqualified Directors hit. Fetches /api/mca/company and renders
 * a compact inline block with registry details (or a "not found" notice).
 */
function McaCompanyBlock({ name }) {
  const [state, setState] = useState('loading'); // 'loading' | 'found' | 'notfound' | 'error'
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getMcaCompany(name, 3).then(resp => {
      if (cancelled) return;
      if (resp._error && resp.matched_count === 0) {
        setState('error');
      } else if (resp.matched_count > 0 && resp.results?.length > 0) {
        setData(resp.results[0]);
        setState('found');
      } else {
        setState('notfound');
      }
    });
    return () => { cancelled = true; };
  }, [name]);

  return (
    <div className="mt-2 border border-sap-border-light rounded bg-sap-bg px-2.5 py-2 text-12">
      {/* Company label row */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-11 text-sap-muted font-medium">Company</span>
        <span className="text-sap-text font-semibold truncate">{name}</span>
      </div>

      {state === 'loading' && (
        <div className="flex items-center gap-1.5 py-1">
          {/* Shimmer row */}
          <div className="h-2 bg-sap-border-light rounded animate-pulse w-32" />
          <div className="h-2 bg-sap-border-light rounded animate-pulse w-20" />
        </div>
      )}

      {state === 'found' && data && (
        <>
          <div className="text-sap-accent text-11 font-semibold mb-1">
            Matched in MCA registry
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-12">
            <div><span className="text-sap-muted">CIN</span> <span className="text-sap-text font-mono">{data.cin || '—'}</span></div>
            <div><span className="text-sap-muted">Status</span> <span className="text-sap-text">{data.company_status || '—'}</span></div>
            <div><span className="text-sap-muted">Incorporated</span> <span className="text-sap-text tabular-nums">{fmtDate(data.incorporation_date)}</span></div>
            <div><span className="text-sap-muted">Industry</span> <span className="text-sap-text">{data.industry || '—'}</span></div>
            {data.address && (
              <div className="col-span-2"><span className="text-sap-muted">Address</span> <span className="text-sap-dim">{data.address}</span></div>
            )}
          </div>
        </>
      )}

      {state === 'notfound' && (
        <div className="text-sap-warning text-11">
          Not found in MCA registry &mdash; may be deregistered or a naming variant
        </div>
      )}

      {state === 'error' && (
        <div className="text-sap-muted text-11">MCA registry lookup unavailable</div>
      )}
    </div>
  );
}

/**
 * Renders MCA registry enrichment blocks for each extracted company name.
 * Only renders when companies array is non-empty.
 */
function McaEnrichment({ companies }) {
  if (!companies || companies.length === 0) return null;
  return (
    <div className="mt-3 border-t border-sap-border-light pt-2.5">
      <div className="text-11 text-sap-muted font-semibold mb-1.5">
        MCA registry enrichment
      </div>
      <div className="space-y-1.5">
        {companies.map((name, i) => (
          <McaCompanyBlock key={i} name={name} />
        ))}
      </div>
    </div>
  );
}

/**
 * A single crimedata match row.
 */
function CrimedataCard({ result, index }) {
  const src = result._source || {};
  const detail = src.detail_info || {};
  const entityText = asText(result.entity_value);   // the term we searched
  const recordName = asText(src.name);               // canonical record name(s)
  const mcaCompanies = useMemo(() => extractMcaCompanies(result), [result]);

  // Inline-emit the provenance source dict at the render layer. dataset uses
  // the public category label (e.g. "MCA Disqualified Directors") so the
  // tooltip stays branded as Saptang Labs Intelligence + Watchlist + dataset.
  const provSources = [{
    capability: 'watchlist',
    dataset: asText(src.category) || 'Crime database',
    field_key: 'name',
    via_seed: entityText || null,
    via_seed_type: 'name',
    depth: 1,
  }];

  return (
    <div
      className="bg-sap-panel/60 border border-sap-border-light rounded-md p-3 animate-slide-up"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'both' }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusBadge found={true} />
          <Provenance value={recordName || entityText} sources={provSources}>
            <span className="text-13 font-semibold text-sap-text truncate" title={recordName || entityText}>
              {recordName || entityText || '—'}
            </span>
          </Provenance>
        </div>
        <ScoreChip score={result.score} />
      </div>
      {entityText && recordName && entityText.toLowerCase() !== recordName.toLowerCase() && (
        <p className="text-12 text-sap-dim mb-1.5">
          <span className="text-sap-muted">Matched search term:</span> <span className="text-sap-text font-mono">{entityText}</span>
        </p>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-1 text-12">
        {src.category != null && (
          <div><span className="text-sap-muted">Category</span> <span className="text-sap-text font-medium">{asText(src.category)}</span></div>
        )}
        {src.entity_type != null && (
          <div><span className="text-sap-muted">Type</span> <span className="text-sap-text font-medium">{asText(src.entity_type)}</span></div>
        )}
        {src.country_name != null && (
          <div><span className="text-sap-muted">Country</span> <span className="text-sap-text font-medium">{asText(src.country_name)}</span></div>
        )}
        {detail.dob && (
          <div><span className="text-sap-muted">DOB</span> <span className="text-sap-text font-medium tabular-nums">{asText(detail.dob)}</span></div>
        )}
      </div>
      {(detail.linked_to || detail.address || detail.passport_id || detail.national_id) && (
        <div className="mt-2 grid grid-cols-1 gap-y-0.5 text-12">
          {detail.linked_to && (
            <div><span className="text-sap-muted mr-2">Linked to</span><span className="text-sap-text">{asText(detail.linked_to)}</span></div>
          )}
          {detail.address && (
            <div><span className="text-sap-muted mr-2">Address</span><span className="text-sap-text">{asText(detail.address)}</span></div>
          )}
          {detail.passport_id && (
            <div><span className="text-sap-muted mr-2">Passport</span><span className="text-sap-text font-mono">{asText(detail.passport_id)}</span></div>
          )}
          {detail.national_id && (
            <div><span className="text-sap-muted mr-2">National ID</span><span className="text-sap-text font-mono">{asText(detail.national_id)}</span></div>
          )}
        </div>
      )}
      <McaEnrichment companies={mcaCompanies} />
      <RawRecord record={result} />
    </div>
  );
}

/**
 * A single worldcheck match row.
 */
function WorldcheckCard({ result, index }) {
  const extra = result.EXTRA_DATA || {};
  const entityText  = asText(result.entity_value);     // what we searched
  const primaryText = asText(result.primary_name);     // what matched
  const headlineName = primaryText || entityText;       // prefer the canonical record name

  // Aliases — strip empty strings.
  const aliases = (Array.isArray(result.alternative_names) ? result.alternative_names : [])
    .map(asText).filter(Boolean);

  // Linked individuals (family / associates) when present on EXTRA_DATA.
  const linkedTo = (Array.isArray(extra.linked_to) ? extra.linked_to : [])
    .map(asText).filter(Boolean);

  const mcaCompanies = useMemo(() => extractMcaCompanies(result), [result]);

  // Pick a representative dataset for the provenance tooltip: prefer the
  // first keyword source_name when present (public list label like
  // "Ministry of Corporate Affairs"); fall back to category or the generic
  // "Sanctions & PEP" label.
  const firstKeyword = (Array.isArray(extra.keywords) ? extra.keywords : [])
    .find((k) => k && typeof k.source_name === 'string' && k.source_name.trim());
  const provDataset = (firstKeyword && firstKeyword.source_name)
    || asText(extra.category)
    || 'Sanctions & PEP';
  const provSources = [{
    capability: 'watchlist',
    dataset: provDataset,
    field_key: 'name',
    via_seed: entityText || null,
    via_seed_type: 'name',
    depth: 1,
  }];

  return (
    <div
      className="bg-sap-panel/60 border border-sap-border-light rounded-md p-3 animate-slide-up"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'both' }}
    >
      {/* Header: name + score */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusBadge found={true} />
          <Provenance value={headlineName} sources={provSources}>
            <span className="text-13 font-semibold text-sap-text truncate" title={headlineName}>
              {headlineName || '—'}
            </span>
          </Provenance>
        </div>
        <ScoreChip score={result.score} />
      </div>

      {/* "Matched against your search term" indicator */}
      {entityText && primaryText && entityText !== primaryText && (
        <p className="text-12 text-sap-dim mb-1.5">
          <span className="text-sap-muted">Matched search term:</span> <span className="text-sap-text font-mono">{entityText}</span>
        </p>
      )}

      {/* Compact metadata grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-1 text-12">
        {extra.category != null && (
          <div><span className="text-sap-muted">Category</span> <span className="text-sap-text font-medium">{asText(extra.category)}</span></div>
        )}
        {extra.entity_type != null && (
          <div><span className="text-sap-muted">Type</span> <span className="text-sap-text font-medium">{asText(extra.entity_type)}</span></div>
        )}
        {result.country != null && (
          <div><span className="text-sap-muted">Country</span> <span className="text-sap-text font-medium">{asText(result.country)}</span></div>
        )}
        {result.date_of_birth && (
          <div><span className="text-sap-muted">DOB</span> <span className="text-sap-text font-medium tabular-nums">{asText(result.date_of_birth)}</span></div>
        )}
      </div>

      {/* Aliases */}
      {aliases.length > 0 && (
        <p className="mt-2 text-12">
          <span className="text-sap-muted mr-2">Aliases</span>
          <span className="text-sap-text">{aliases.join(' · ')}</span>
        </p>
      )}

      {/* Linked entities */}
      {linkedTo.length > 0 && (
        <p className="mt-1 text-12">
          <span className="text-sap-muted mr-2">Linked</span>
          <span className="text-sap-text">{linkedTo.join(' · ')}</span>
        </p>
      )}

      {/* Sanction / regulatory keywords */}
      <KeywordPills keywords={extra.keywords} />

      {/* Biography / identification / reports */}
      <FurtherInfoSection text={asText(extra.further_info)} />

      <McaEnrichment companies={mcaCompanies} />

      <RawRecord record={result} />
    </div>
  );
}

/**
 * Empty state when a section has no matches.
 */
function ClearSection({ label, muted }) {
  if (muted) {
    return (
      <div className="flex items-center gap-2 py-3 px-3 bg-sap-panel/40 border border-sap-border-light rounded-md">
        <span className="text-12 text-sap-muted">No {label} matches</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 py-3 px-3 bg-sap-success-soft border border-sap-success/20 rounded-md">
      <span className="inline-flex items-center px-2 h-5 rounded text-11 font-semibold bg-sap-success-filled text-white">Clear</span>
      <span className="text-12 text-sap-success">No {label} matches found</span>
    </div>
  );
}

export default function FtiScreening({ ftiResults, ftiMeta, loading, canonicalTokens, canonicalName, canonicalSource }) {
  const [filterToCanonical, setFilterToCanonical] = useState(true);   // default ON
  const [prevFtiResults, setPrevFtiResults] = useState(ftiResults);
  if (ftiResults !== prevFtiResults) {
    setPrevFtiResults(ftiResults);
    if (!filterToCanonical) setFilterToCanonical(true);
  }

  // Split results by query_type; track raw totals AND filtered sets separately.
  const {
    crimedataResults,
    worldcheckResults,
    allCrimedataMatches,
    allWorldcheckMatches,
  } = useMemo(() => {
    const cd = [];
    const wc = [];
    const cdMatches = [];
    const wcMatches = [];

    for (const r of ftiResults) {
      if (r.query_type === 'crimedata') {
        cd.push(r);
        if (r.found && r.results?.length) {
          for (const hit of r.results) {
            cdMatches.push({ ...hit, entity_value: r.entity_value, score: hit.score });
          }
        }
      } else if (r.query_type === 'worldcheck') {
        wc.push(r);
        if (r.found && r.results?.length) {
          for (const hit of r.results) {
            wcMatches.push({ ...hit, entity_value: r.entity_value, score: hit.score });
          }
        }
      }
    }
    return {
      crimedataResults: cd,
      worldcheckResults: wc,
      allCrimedataMatches: cdMatches,
      allWorldcheckMatches: wcMatches,
    };
  }, [ftiResults]);

  // Predicate: every significant token of the canonical name must appear in
  // BOTH the parent search term AND the matched record's name. Single-token
  // (substring-on-first-name) match leaks namesakes — e.g. "DASARI, Saikrishna"
  // and "MUMMALANENI, Saikrishna" share the first name with the subject but
  // are different people. Requiring both "saikrishna" AND "budamgunta" filters
  // those out while still tolerating "LAST, FIRST" vs "First Last" ordering
  // (it's an order-independent set intersection, not a literal substring).
  const tokens = useMemo(() => canonicalTokens || [], [canonicalTokens]);
  const matchesCanonical = useCallback((result) => {
    if (tokens.length === 0) return true;
    const ev = String(result.entity_value || '').toLowerCase();
    if (!tokens.every(t => ev.includes(t))) return false;
    const matchedName = String(
      result.primary_name || result._source?.name || '',
    ).toLowerCase();
    if (!matchedName) return true;
    return tokens.every(t => matchedName.includes(t));
  }, [tokens]);

  // Apply filter (or not) to produce visible match arrays
  const crimedataMatches = filterToCanonical
    ? allCrimedataMatches.filter(matchesCanonical)
    : allCrimedataMatches;
  const worldcheckMatches = filterToCanonical
    ? allWorldcheckMatches.filter(matchesCanonical)
    : allWorldcheckMatches;

  const totalAllMatches = allCrimedataMatches.length + allWorldcheckMatches.length;
  const hiddenCount = filterToCanonical
    ? totalAllMatches - (crimedataMatches.length + worldcheckMatches.length)
    : 0;

  const totalScreened = ftiMeta?.total_names_screened ?? ftiResults.length;
  const isComplete = !!ftiMeta;

  // Header progress text
  const progressText = isComplete
    ? `${totalScreened} name${totalScreened !== 1 ? 's' : ''} screened`
    : loading
      ? `${ftiResults.length} name${ftiResults.length !== 1 ? 's' : ''} screened…`
      : `${ftiResults.length} name${ftiResults.length !== 1 ? 's' : ''} screened`;

  // Visible total for the summary badge (after filtering)
  const visibleTotal = crimedataMatches.length + worldcheckMatches.length;

  return (
    <div className="rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-sap-border-light flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-7 w-7 rounded-full bg-sap-danger-soft border border-sap-danger/20 flex items-center justify-center shrink-0">
            {loading && !isComplete ? (
              <div className="h-3.5 w-3.5 rounded-full border-2 border-sap-danger/30 border-t-sap-danger animate-spin" />
            ) : (
              <ShieldIcon className="w-3.5 h-3.5 text-sap-danger" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-12 font-semibold tracking-tight text-sap-text">Watchlist screening</h3>
            <p className="text-11 text-sap-muted">
              {loading && !isComplete
                ? <span className="animate-scan">{progressText}</span>
                : <span>{progressText}</span>
              }
            </p>
          </div>
        </div>
        {/* Summary badges when complete */}
        {isComplete && (
          <div className="flex items-center gap-2">
            {visibleTotal > 0 ? (
              <span className="inline-flex items-center px-2 h-6 rounded-md text-11 font-semibold bg-sap-danger-filled text-white tabular-nums">
                {visibleTotal} match{visibleTotal !== 1 ? 'es' : ''}
              </span>
            ) : (
              <span className="inline-flex items-center px-2 h-6 rounded-md text-11 font-semibold bg-sap-success-soft text-sap-success">
                All clear
              </span>
            )}
          </div>
        )}
      </div>

      {/* Filter status. When the investigator named the subject explicitly,
          the backend already screened only that name — no namesakes are
          possible, so the toggle + namesake copy are removed in favour of
          a single confirmation strip. Otherwise three states based on
          inferred-canonical + operator toggle. */}
      {canonicalSource === 'investigator' ? (
        totalAllMatches > 0 && (
          <div className="px-4 py-2 border-b border-sap-border-light flex items-center gap-2 text-12 bg-sap-bg">
            <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-sap-accent" />
            <span className="text-sap-muted">Screened against</span>
            <span className="text-sap-text font-semibold">&ldquo;{canonicalName}&rdquo;</span>
            <span className="text-sap-muted">· investigator-provided</span>
          </div>
        )
      ) : totalAllMatches > 0 ? (
        <div className={`px-4 py-2 border-b border-sap-border-light flex items-center gap-2 text-12 ${
          tokens.length === 0 || !filterToCanonical ? 'bg-sap-warning-soft' : 'bg-sap-bg'
        }`}>
          {tokens.length === 0 ? (
            <>
              <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-sap-warning-filled" />
              <span className="text-sap-warning font-semibold">No subject identified</span>
              <span className="text-sap-muted">· filter inactive — every namesake hit is shown ({totalAllMatches} total)</span>
            </>
          ) : filterToCanonical ? (
            <>
              <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-sap-success-filled" />
              <span className="text-sap-muted">Filtered to subject</span>
              <span className="text-sap-text font-semibold">&ldquo;{canonicalName || tokens.join(' ')}&rdquo;</span>
              <span className="text-sap-muted">
                · {hiddenCount > 0 ? `${hiddenCount} namesake hit${hiddenCount === 1 ? '' : 's'} hidden` : 'all results match subject'}
              </span>
              <button
                type="button"
                onClick={() => setFilterToCanonical(false)}
                className="ml-auto text-11 text-sap-accent hover:underline"
              >Show all</button>
            </>
          ) : (
            <>
              <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-sap-warning-filled" />
              <span className="text-sap-warning font-semibold">Showing namesake matches too</span>
              <span className="text-sap-muted">· filter disabled by operator</span>
              <button
                type="button"
                onClick={() => setFilterToCanonical(true)}
                className="ml-auto text-11 text-sap-accent hover:underline"
              >Filter to &ldquo;{canonicalName || tokens.join(' ')}&rdquo;</button>
            </>
          )}
        </div>
      ) : null}

      {/* Two-column body */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-sap-border-light">
        {/* Crime Database section */}
        <div className="bg-sap-surface p-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-3.5 h-3.5 text-sap-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <h4 className="text-12 font-semibold tracking-tight text-sap-text">Crime database</h4>
            <span className="text-11 text-sap-muted ml-auto tabular-nums">
              {crimedataMatches.length} hit{crimedataMatches.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2">
            {crimedataMatches.length > 0
              ? crimedataMatches.map((m, i) => <CrimedataCard key={`cd-${m._id}-${i}`} result={m} index={i} />)
              : (isComplete || crimedataResults.length > 0)
                ? <ClearSection label="crime database" muted={worldcheckMatches.length > 0} />
                : loading
                  ? <ScanningPlaceholder />
                  : null
            }
          </div>
        </div>

        {/* Sanctions & PEP section */}
        <div className="bg-sap-surface p-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-3.5 h-3.5 text-sap-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
            </svg>
            <h4 className="text-12 font-semibold tracking-tight text-sap-text">Sanctions &amp; PEP</h4>
            <span className="text-11 text-sap-muted ml-auto tabular-nums">
              {worldcheckMatches.length} hit{worldcheckMatches.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2">
            {worldcheckMatches.length > 0
              ? worldcheckMatches.map((m, i) => <WorldcheckCard key={`wc-${m._id}-${i}`} result={m} index={i} />)
              : (isComplete || worldcheckResults.length > 0)
                ? <ClearSection label="sanctions/PEP" muted={crimedataMatches.length > 0} />
                : loading
                  ? <ScanningPlaceholder />
                  : null
            }
          </div>
        </div>
      </div>

      {/* Footer timing */}
      {ftiMeta?.total_time_ms != null && (
        <div className="px-4 py-2 bg-sap-panel/40 border-t border-sap-border-light text-11 text-sap-muted text-right tabular-nums">
          Screening completed in {ftiMeta.total_time_ms}ms
        </div>
      )}
    </div>
  );
}

/**
 * Placeholder shown while screening is in progress but no results yet for a section.
 */
function ScanningPlaceholder() {
  return (
    <div className="flex items-center gap-2 py-3 px-3 bg-sap-panel/40 border border-sap-border-light rounded-md">
      <div className="h-3 w-3 rounded-full border-2 border-sap-muted/30 border-t-sap-muted animate-spin" />
      <span className="text-12 text-sap-muted animate-scan">Scanning watchlists…</span>
    </div>
  );
}
