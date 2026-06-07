import { useMemo, useState, useEffect, useRef } from 'react';
import { chooseCanonicalIdentity } from '../lib/canonicalIdentity';
import { formatCanonicalLocation } from '../lib/canonicalLocation';
import { ecourtsSearch, getEcourtsByState } from '../lib/api';
import Provenance from './Provenance';

// Backend (spec B1) ships each value in `profile.{names,emails,phones,...}`
// as `{ value, sources: [...] }`. Some callers / legacy fallback paths still
// emit bare strings — normalise so the rest of this file can read .value and
// .sources uniformly, and wrap chips in <Provenance> with no special casing.
function toEntry(v) {
  if (v && typeof v === 'object' && 'value' in v) {
    return { value: v.value, sources: Array.isArray(v.sources) ? v.sources : [] };
  }
  return { value: v, sources: [] };
}

function entryValue(v) {
  if (v && typeof v === 'object' && 'value' in v) return v.value;
  return v;
}

// Render-only metadata. Classification + value validation happens in the
// backend (app.engines.identifier_categorizer). The render order here also
// drives the category grid order.
const CATEGORIES = [
  {
    key: 'names',
    label: 'Identity',
    color: 'text-sap-text',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    key: 'usernames',
    label: 'Usernames',
    color: 'text-entity-darkweb',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9" />
      </svg>
    ),
  },
  {
    key: 'emails',
    label: 'Emails',
    color: 'text-entity-email',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    key: 'phones',
    label: 'Phone numbers',
    color: 'text-entity-phone',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    ),
  },
  {
    key: 'ips',
    label: 'IP addresses',
    color: 'text-entity-telegram',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
      </svg>
    ),
  },
  {
    key: 'locations',
    label: 'Locations',
    color: 'text-sap-dim',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    key: 'devices',
    label: 'Device / browser',
    color: 'text-sap-dim',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    key: 'accounts',
    label: 'Linked accounts',
    color: 'text-entity-darkweb',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
  },
  {
    key: 'financial',
    label: 'Financial',
    color: 'text-entity-upi',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    key: 'dob',
    label: 'Date of birth',
    color: 'text-sap-dim',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
];

const TAG_STAGGER_MS = 80;

// Tokenise a name for canonical-equivalence comparison: lowercase, split on
// whitespace, drop tokens shorter than 2 chars (initials etc.). Empty/null
// inputs yield an empty set so they never match the canonical.
function nameTokenSet(value) {
  if (typeof value !== 'string') return new Set();
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return new Set();
  return new Set(
    trimmed.split(/\s+/).filter(tok => tok.length >= 2),
  );
}

// True when one token set is a (non-empty) subset of the other — used to
// decide whether a discovered name is just a variant/substring of the
// canonical and should therefore be excluded from "Other names".
function isCanonicalVariant(nameTokens, canonicalTokens) {
  if (nameTokens.size === 0 || canonicalTokens.size === 0) return false;
  const [small, large] = nameTokens.size <= canonicalTokens.size
    ? [nameTokens, canonicalTokens]
    : [canonicalTokens, nameTokens];
  for (const tok of small) {
    if (!large.has(tok)) return false;
  }
  return true;
}

// Decode common URI schemes seen in Linked accounts so the rendered chip
// shows something a human can read. The raw value remains available via the
// chip's title attribute.
function decodeAccountValue(raw) {
  if (typeof raw !== 'string') return { label: String(raw ?? ''), mono: false };
  const v = raw.trim();
  if (!v) return { label: v, mono: false };
  if (v.startsWith('android://')) {
    return { label: 'Google Ad ID: ', mono: true, suffix: v.slice('android://'.length) };
  }
  if (v.startsWith('mailto:')) {
    return { label: v.slice('mailto:'.length), mono: true };
  }
  if (v.startsWith('tel:')) {
    return { label: v.slice('tel:'.length), mono: true };
  }
  const m = v.match(/^https?:\/\/([^/?#]+)/i);
  if (m) {
    return { label: m[1], mono: true };
  }
  return { label: v, mono: true };
}

export default function SubjectProfile({
  loading, onFocusEntity, onSwitchTab, aiSummary,
  canonical: canonicalProp, canonicalName, canonicalSource, profile: profileProp, canonicalLocation,
}) {
  // Backend ships the categorized profile (see app.engines.identifier_categorizer).
  // Each entry is `{ value, sources }`; legacy callers may still pass bare
  // strings, so we normalise via `toEntry` and drop empties.
  const profile = useMemo(() => {
    const src = profileProp || {};
    const out = {};
    for (const cat of CATEGORIES) {
      const raw = Array.isArray(src[cat.key]) ? src[cat.key] : [];
      const entries = raw
        .map(toEntry)
        .filter((e) => e.value !== null && e.value !== undefined && e.value !== '');
      if (entries.length > 0) out[cat.key] = entries;
    }
    return out;
  }, [profileProp]);

  const totalCount = useMemo(
    () => CATEGORIES.reduce((sum, c) => sum + (profile[c.key]?.length || 0), 0),
    [profile],
  );

  // chooseCanonicalIdentity expects plain string arrays — strip per-entry
  // sources before handing in.
  const canonicalLocal = useMemo(
    () => chooseCanonicalIdentity({
      names:     (profile.names     || []).map(entryValue),
      usernames: (profile.usernames || []).map(entryValue),
      emails:    (profile.emails    || []).map(entryValue),
    }),
    [profile.names, profile.usernames, profile.emails],
  );

  const canonical = canonicalProp || canonicalLocal;
  const location = canonicalLocation || null;

  // Investigator-confirmed path only: split `profile.names` into the
  // canonical (variants/subsets of the investigator-provided name) and the
  // "other" names that need vetting. When source !== 'investigator' we keep
  // today's flat Identity category, so this memo evaluates to an empty list.
  const otherNames = useMemo(() => {
    if (canonicalSource !== 'investigator') return [];
    if (!canonicalName) return [];
    const all = Array.isArray(profile.names) ? profile.names : [];
    if (all.length === 0) return [];
    const canonicalTokens = nameTokenSet(canonicalName);
    const seen = new Set();
    const extras = [];
    for (const entry of all) {
      const raw = entry?.value;
      if (typeof raw !== 'string') continue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const tokens = nameTokenSet(trimmed);
      if (isCanonicalVariant(tokens, canonicalTokens)) continue;
      extras.push({ value: trimmed, sources: entry.sources || [] });
    }
    extras.sort((a, b) => a.value.localeCompare(b.value));
    return extras;
  }, [canonicalSource, canonicalName, profile.names]);

  // When the new section is active, drop any name it (or the canonical)
  // already represents from the Identity category so the grid below doesn't
  // duplicate them. Inferred path passes through unchanged.
  const gridProfile = useMemo(() => {
    if (canonicalSource !== 'investigator') return profile;
    const names = Array.isArray(profile.names) ? profile.names : [];
    if (names.length === 0) return profile;
    const canonicalTokens = nameTokenSet(canonicalName);
    const otherKeys = new Set(otherNames.map((n) => n.value.toLowerCase()));
    const filtered = names.filter((entry) => {
      const raw = entry?.value;
      if (typeof raw !== 'string') return false;
      const trimmed = raw.trim();
      if (!trimmed) return false;
      if (otherKeys.has(trimmed.toLowerCase())) return false;
      const tokens = nameTokenSet(trimmed);
      if (isCanonicalVariant(tokens, canonicalTokens)) return false;
      return true;
    });
    if (filtered.length === names.length) return profile;
    const next = { ...profile };
    if (filtered.length === 0) {
      delete next.names;
    } else {
      next.names = filtered;
    }
    return next;
  }, [profile, otherNames, canonicalSource, canonicalName]);

  const allTags = useMemo(() => {
    const tags = [];
    CATEGORIES.filter(c => profile[c.key]).forEach(cat => {
      profile[cat.key].forEach((entry) => tags.push({ cat: cat.key, value: entry.value }));
    });
    return tags;
  }, [profile]);

  const [revealedTags, setRevealedTags] = useState(0);
  const timerRef = useRef(null);
  const [prevTotal, setPrevTotal] = useState(0);

  if (totalCount !== prevTotal) {
    setPrevTotal(totalCount);
    if (totalCount === 0 && revealedTags !== 0) {
      setRevealedTags(0);
    }
  }

  useEffect(() => {
    if (revealedTags < allTags.length) {
      timerRef.current = setTimeout(() => {
        setRevealedTags(c => c + 1);
      }, TAG_STAGGER_MS);
      return () => clearTimeout(timerRef.current);
    }
  }, [revealedTags, allTags.length]);

  const revealedSet = useMemo(() => {
    const set = new Set();
    allTags.slice(0, revealedTags).forEach(t => set.add(`${t.cat}:${t.value}`));
    return set;
  }, [allTags, revealedTags]);

  if (totalCount === 0) return null;

  const isRevealing = revealedTags < allTags.length;

  return (
    <div className="rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden animate-fade-in">
      {/* AI Summary — shown when available */}
      {aiSummary && (
        <div className="px-4 py-3 bg-sap-accent-glow/40 border-b border-sap-border-light">
          <p className="text-13 text-sap-dim leading-relaxed">{aiSummary}</p>
        </div>
      )}

      {/* Header */}
      <div className="px-4 py-2.5 border-b border-sap-border-light flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-7 w-7 rounded-full bg-sap-accent-glow border border-sap-accent/20 flex items-center justify-center shrink-0">
            {(loading || isRevealing) ? (
              <div className="h-3.5 w-3.5 rounded-full border-2 border-sap-accent/30 border-t-sap-accent animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5 text-sap-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0" />
              </svg>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-12 font-semibold tracking-tight text-sap-text">Subject profile</h3>
            <p className="text-11 text-sap-muted">
              {(loading || isRevealing)
                ? <span className="animate-scan tabular-nums">{revealedTags}/{allTags.length} identifiers resolving…</span>
                : <span className="tabular-nums">{totalCount} identifiers extracted</span>
              }
            </p>
          </div>
        </div>
        {(loading || isRevealing) && (
          <div className="flex items-center gap-2">
            <div className="h-1 w-24 rounded-full bg-sap-panel overflow-hidden">
              <div
                className="h-full bg-sap-accent rounded-full transition-all duration-300 ease-out"
                style={{ width: `${allTags.length ? (revealedTags / allTags.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Identified subject banner.

          When the investigator named the subject explicitly (canonicalSource
          === 'investigator'), the inferred confidence percentage is
          meaningless — we know who this is. Show a "Confirmed by
          investigator" treatment instead. Otherwise fall back to the
          inferred banner using canonical from chooseCanonicalIdentity.
      */}
      {canonicalSource === 'investigator' && canonicalName && !isRevealing ? (
        <IdentifiedSubjectBanner
          canonical={{ canonical: canonicalName, anchor: null, alternates: [], source: 'investigator', confidence: 1 }}
          location={location}
          investigatorProvided
        />
      ) : canonical.canonical && canonical.confidence > 0 && !isRevealing ? (
        <IdentifiedSubjectBanner canonical={canonical} location={location} />
      ) : null}

      {/* Other names found in records — only on the investigator-confirmed
          path, when extras exist. Inferred path leaves this branch dormant. */}
      {canonicalSource === 'investigator' && !isRevealing && otherNames.length > 0 && (
        <OtherNamesSection names={otherNames} />
      )}

      {/* Court search — always shown when location has a resolved state */}
      {location?.state && !isRevealing && (
        <CourtSearchSection
          name={canonicalName || canonical?.canonical || canonical?.anchor || null}
          location={location}
          onSwitchTab={onSwitchTab}
        />
      )}

      {/* Category grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-sap-border-light">
        {CATEGORIES.filter(cat => gridProfile[cat.key]).map(cat => {
          const visibleEntries = gridProfile[cat.key].filter(
            (entry) => revealedSet.has(`${cat.key}:${entry.value}`)
          );
          return (
            <ProfileSection
              key={cat.key}
              catKey={cat.key}
              label={cat.label}
              icon={cat.icon}
              color={cat.color}
              entries={visibleEntries}
              totalValues={gridProfile[cat.key].length}
              onFocusEntity={onFocusEntity}
              locationData={cat.key === 'locations' ? location : null}
            />
          );
        })}
      </div>
    </div>
  );
}

const STATE_CODE_TO_NAME = {
  DL: 'Delhi', MH: 'Maharashtra', KA: 'Karnataka', TN: 'Tamil Nadu',
  TS: 'Telangana', AP: 'Andhra Pradesh', UP: 'Uttar Pradesh', GJ: 'Gujarat',
  RJ: 'Rajasthan', WB: 'West Bengal', KL: 'Kerala', HR: 'Haryana',
  PB: 'Punjab', MP: 'Madhya Pradesh', BR: 'Bihar', JH: 'Jharkhand',
  OR: 'Odisha', OD: 'Odisha', AS: 'Assam', UK: 'Uttarakhand',
  HP: 'Himachal Pradesh', GA: 'Goa', JK: 'Jammu & Kashmir',
  CG: 'Chhattisgarh',
};

function buildCourtStates(location) {
  const votes = location?.evidence?.state_votes || {};
  const entries = Object.entries(votes)
    .sort((a, b) => b[1] - a[1])
    .map(([stateName]) => {
      const code = Object.entries(STATE_CODE_TO_NAME)
        .find(([, n]) => n === stateName)?.[0]
        || stateName.toUpperCase().slice(0, 2);
      return { code, name: stateName };
    });
  if (entries.length === 0 && location?.stateCode) {
    entries.push({ code: location.stateCode, name: STATE_CODE_TO_NAME[location.stateCode] || location.stateCode });
  }
  return entries;
}

// Investigator-provided subject path only: render names discovered in records
// that don't match the canonical, so the investigator can vet or dismiss them
// at a glance. Each row carries a <Provenance> tooltip sourced from the
// per-entry payload shipped by spec B1.
function OtherNamesSection({ names }) {
  if (!names || names.length === 0) return null;
  return (
    <div className="px-4 py-3 bg-sap-warning-soft/40 border-b border-sap-border-light">
      <div className="flex items-center gap-2 mb-2">
        <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-sap-warning-filled" />
        <span className="text-11 font-semibold tracking-tight text-sap-warning">
          Other names found in records
        </span>
        <span className="text-11 text-sap-muted">
          · {names.length} additional name{names.length !== 1 ? 's' : ''} appeared — investigate or dismiss
        </span>
      </div>
      <div className="space-y-0.5">
        {names.map((n) => (
          <div key={n.value} className="flex items-center gap-2 py-1 group cursor-default">
            <Provenance value={n.value} sources={n.sources}>
              <span className="text-13 text-sap-text">{n.value}</span>
            </Provenance>
            <span className="text-11 text-sap-muted ml-auto" aria-hidden />
            <span aria-hidden className="text-sap-muted group-hover:text-sap-text transition-colors">&#x25B8;</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IdentifiedSubjectBanner({ canonical, location, investigatorProvided = false }) {
  const { canonical: name, anchor, confidence, alternates = [], source } = canonical;
  const isInferred = source === 'inferred';
  const locString = formatCanonicalLocation(location);

  // Investigator-provided: no probability, no "tier", no progress bar.
  // The investigator told us who this is; the report just confirms it.
  if (investigatorProvided) {
    return (
      <div className="px-4 py-3 bg-sap-bg border-b border-sap-border-light">
        <div className="flex items-center gap-2 mb-1.5">
          <span aria-hidden className="relative flex">
            <span className="w-2 h-2 rounded-full bg-sap-accent" />
            <span className="absolute inset-0 w-2 h-2 rounded-full bg-sap-accent animate-ping opacity-50" />
          </span>
          <span className="text-11 font-semibold tracking-tight text-sap-accent">
            Subject confirmed
          </span>
          <span className="text-11 text-sap-muted">·</span>
          <span className="text-11 font-medium text-sap-dim">Provided by investigator</span>
        </div>

        <p className="text-17 leading-tight tracking-tight font-semibold text-sap-text">{name}</p>
        {locString && (
          <p className="text-12 text-sap-dim mt-0.5">{locString}</p>
        )}
      </div>
    );
  }

  const pct = Math.round(confidence * 100);
  const tier =
    confidence >= 0.7 ? 'high' :
    confidence >= 0.4 ? 'medium' :
    'low';

  const palette = {
    high:   { dot: 'bg-sap-success-filled', text: 'text-sap-success', bar: 'bg-sap-success-filled', label: 'High confidence' },
    medium: { dot: 'bg-sap-warning-filled', text: 'text-sap-warning', bar: 'bg-sap-warning-filled', label: 'Probable subject' },
    low:    { dot: 'bg-sap-muted',          text: 'text-sap-dim',     bar: 'bg-sap-muted',          label: 'Best guess' },
  }[tier];

  return (
    <div className="px-4 py-3 bg-sap-bg border-b border-sap-border-light">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-1.5">
        <div className="flex items-center gap-2">
          <span aria-hidden className="relative flex">
            <span className={`w-2 h-2 rounded-full ${palette.dot}`} />
            {tier === 'high' && (
              <span className={`absolute inset-0 w-2 h-2 rounded-full ${palette.dot} animate-ping opacity-50`} />
            )}
          </span>
          <span className={`text-11 font-semibold tracking-tight ${palette.text}`}>
            Identified subject
          </span>
          <span className="text-11 text-sap-muted">·</span>
          <span className={`text-11 font-medium ${palette.text}`}>{palette.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-11 text-sap-muted tabular-nums">{pct}% confidence</span>
          <div className="h-1 w-20 rounded-full bg-sap-panel overflow-hidden">
            <div className={`h-full ${palette.bar} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <p className={`text-17 leading-tight tracking-tight ${isInferred ? 'font-medium italic text-sap-dim' : 'font-semibold text-sap-text'}`}>
        {name}
        {isInferred && <span className="ml-2 text-11 not-italic text-sap-muted font-normal">(inferred)</span>}
      </p>
      {locString && (
        <p className="text-12 text-sap-dim mt-0.5">{locString}</p>
      )}

      <div className="mt-1 flex items-baseline gap-2 flex-wrap text-11">
        {anchor && (
          <span className="text-sap-muted">
            Anchor: <span className="text-sap-dim font-mono">{anchor}</span>
          </span>
        )}
        {alternates.length > 0 && (
          <>
            <span className="text-sap-muted">·</span>
            <span className="text-sap-muted">Also seen as:</span>
            <span className="text-sap-dim truncate">{alternates.slice(0, 4).join(' · ')}</span>
            {alternates.length > 4 && (
              <span className="text-sap-muted">+{alternates.length - 4} more</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const CAT_TO_ENTITY_TYPE = { phones: 'phone', emails: 'email' };

// Categories whose values *may* contain identifiers — mono is only allowed inside these.
// Within them, per-value heuristic decides; descriptive text like "Active" stays in sans.
const IDENTIFIER_CATS = new Set(['usernames', 'emails', 'phones', 'ips', 'accounts', 'financial']);

// Returns true if the value reads as a machine identifier (mono-worthy) rather than
// human-readable description. Heuristic — errs on the side of sans for ambiguous cases.
function isIdentifierValue(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (!s) return false;
  if (s.includes('@')) return true;              // email
  if (s.includes('://')) return true;            // URI / account scheme
  if (/^[\d\s\-+()]{6,}$/.test(s)) return true;  // phone / numeric id
  if (!s.includes(' ')) {                        // single token
    if (/[._\-+/]/.test(s)) return true;         // has separators → handle / id
    if (/\d/.test(s)) return true;               // contains a digit → id-ish
    if (s === s.toLowerCase() && s.length >= 4) return true; // lowercase handle
    return false;                                // single TitleCase / UPPER word → description
  }
  return false;                                  // multi-word phrase → description
}

function ProfileSection({ catKey, label, icon, color, entries, totalValues, onFocusEntity, locationData }) {
  if (entries.length === 0 && !(catKey === 'locations' && locationData?.state)) return null;

  const isLocation = catKey === 'locations';
  const catAllowsIdentifier = IDENTIFIER_CATS.has(catKey);
  const tagClassesBase = isLocation
    ? 'inline-block px-2 py-0.5 rounded text-12 bg-sap-panel border border-sap-border-light text-sap-text whitespace-normal break-words leading-snug max-w-full animate-slide-up'
    : 'inline-block px-2 py-0.5 rounded text-12 bg-sap-panel border border-sap-border-light text-sap-text truncate max-w-56 animate-slide-up';

  const entityType = CAT_TO_ENTITY_TYPE[catKey];
  const isNavigable = !!entityType && !!onFocusEntity;

  return (
    <div className="bg-sap-surface px-4 py-3 animate-fade-in">
      <div className={`flex items-center gap-1.5 mb-2 ${color}`}>
        {icon}
        <span className="text-12 font-semibold tracking-tight">{label}</span>
        <span className="text-11 text-sap-muted ml-1 tabular-nums">
          ({entries.length}{entries.length < totalValues ? `/${totalValues}` : ''})
        </span>
      </div>

      {isLocation && locationData?.state && (
        <LocationIntel location={locationData} />
      )}

      <div className="flex flex-wrap gap-1.5">
        {entries.slice(0, 15).map((entry, i) => {
          const v = entry.value;
          const sources = entry.sources;
          const fontCls = catAllowsIdentifier && isIdentifierValue(v) ? 'font-mono' : '';
          const tagClasses = `${tagClassesBase} ${fontCls}`;
          // Linked accounts: decode common URI schemes at render-time so the
          // chip shows something human-readable instead of `android://…`.
          let content;
          if (catKey === 'accounts') {
            const decoded = decodeAccountValue(v);
            content = decoded.suffix !== undefined ? (
              <>
                <span className="font-sans">{decoded.label}</span>
                <span className="font-mono">{decoded.suffix}</span>
              </>
            ) : (
              <span className={decoded.mono ? 'font-mono' : ''}>{decoded.label}</span>
            );
          } else {
            content = v;
          }
          const chip = isNavigable ? (
            <button
              type="button"
              onClick={() => onFocusEntity(entityType, v)}
              className={`${tagClasses} cursor-pointer hover:border-sap-accent hover:bg-sap-surface transition-colors`}
              style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'both' }}
              title={`View ${v} in network map`}
            >
              {content}<span className="ml-1 opacity-60">&#x2197;</span>
            </button>
          ) : (
            <span
              className={tagClasses}
              style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'both' }}
              title={typeof v === 'string' ? v : undefined}
            >
              {content}
            </span>
          );
          return (
            <Provenance key={v} value={v} sources={sources}>
              {chip}
            </Provenance>
          );
        })}
        {totalValues > 15 && (
          <span className="inline-block px-2 py-0.5 rounded text-12 bg-sap-panel border border-sap-border-light text-sap-muted">
            +{totalValues - 15} more
          </span>
        )}
      </div>
    </div>
  );
}

function CourtSearchSection({ name, location, onSwitchTab }) {
  const courtStates = useMemo(() => buildCourtStates(location), [location]);
  const [courtChecked, setCourtChecked] = useState(() => new Set(courtStates.map(s => s.code)));
  const [courtKinds, setCourtKinds] = useState(() => new Set(['HighCourt', 'District']));
  const [courtLoading, setCourtLoading] = useState(false);
  const [courtResult, setCourtResult] = useState(null);
  const [courtError, setCourtError] = useState(null);
  const [courtCounts, setCourtCounts] = useState(null);

  const courtCountsRef = useRef(null);
  useEffect(() => {
    if (courtStates.length === 0) return;
    const key = courtStates.map(s => s.code).sort().join(',');
    if (courtCountsRef.current === key) return;
    courtCountsRef.current = key;
    setCourtCounts(null);
    getEcourtsByState()
      .then(res => setCourtCounts(res?.data || []))
      .catch(() => {});
  }, [courtStates]);

  const courtCountInfo = useMemo(() => {
    if (!courtCounts) return null;
    let total = 0;
    const perState = [];
    for (const row of courtCounts) {
      if (!courtChecked.has(row.state_code)) continue;
      const kb = row.kind_breakdown || {};
      let stateTotal = 0;
      if (courtKinds.has('HighCourt')) stateTotal += kb.HighCourt || 0;
      if (courtKinds.has('District')) stateTotal += kb.District || 0;
      total += stateTotal;
      perState.push({ code: row.state_code, count: stateTotal });
    }
    return { total, perState };
  }, [courtCounts, courtChecked, courtKinds]);

  const toggleCourtState = (code) => setCourtChecked(prev => {
    const next = new Set(prev);
    next.has(code) ? next.delete(code) : next.add(code);
    return next;
  });
  const toggleCourtKind = (kind) => setCourtKinds(prev => {
    const next = new Set(prev);
    next.has(kind) ? next.delete(kind) : next.add(kind);
    return next;
  });

  const canSearchCourt = name && courtChecked.size > 0 && courtKinds.size > 0 && !courtLoading;

  const handleCourtSearch = async () => {
    if (!canSearchCourt) return;
    setCourtLoading(true);
    setCourtError(null);
    setCourtResult(null);
    try {
      const res = await ecourtsSearch({ name, states: [...courtChecked], kinds: [...courtKinds] });
      setCourtResult(res);
    } catch (e) {
      setCourtError(e.message || 'Search failed');
    } finally {
      setCourtLoading(false);
    }
  };

  const courtCases = courtResult?.results || [];

  if (courtStates.length === 0) return null;

  return (
    <div className="px-4 py-3 bg-sap-bg border-b border-sap-border-light">
      <div className="flex items-center flex-wrap gap-x-3 gap-y-2">
        <span className="text-11 text-sap-muted font-semibold shrink-0">Court search</span>
        <div className="flex flex-wrap gap-1.5">
          {courtStates.map(({ code, name: sName }) => {
            const on = courtChecked.has(code);
            return (
              <button key={code} type="button" onClick={() => toggleCourtState(code)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-11 border transition-colors duration-150 ${
                  on ? 'bg-sap-accent/[0.10] border-sap-accent/30 text-sap-text' : 'bg-sap-panel border-sap-border-light text-sap-dim hover:text-sap-text'
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-sm border flex items-center justify-center ${on ? 'bg-sap-accent border-sap-accent' : 'border-sap-border bg-sap-bg'}`}>
                  {on && <svg className="w-1.5 h-1.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={4}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </span>
                {sName}
              </button>
            );
          })}
        </div>
        <div className="flex gap-1.5">
          {[['HighCourt', 'HC'], ['District', 'Dist']].map(([kind, label]) => {
            const on = courtKinds.has(kind);
            return (
              <button key={kind} type="button" onClick={() => toggleCourtKind(kind)}
                className={`px-2 py-0.5 rounded text-11 border transition-colors duration-150 ${
                  on ? 'bg-sap-accent/[0.10] border-sap-accent/30 text-sap-text' : 'bg-sap-panel border-sap-border-light text-sap-dim hover:text-sap-text'
                }`}
              >{label}</button>
            );
          })}
        </div>
        <button type="button" onClick={handleCourtSearch} disabled={!canSearchCourt}
          className={`px-3 h-6 rounded text-11 font-semibold transition-colors duration-150 ${
            canSearchCourt ? 'bg-sap-accent text-white hover:bg-sap-accent/90' : 'bg-sap-panel text-sap-muted cursor-not-allowed'
          }`}
        >
          {courtLoading ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Searching
            </span>
          ) : 'Search'}
        </button>
        {courtCountInfo != null && (
          <span className="text-11 text-sap-muted tabular-nums">
            {courtCountInfo.total} court{courtCountInfo.total !== 1 ? 's' : ''}
            {courtCountInfo.perState.length > 1 && (
              <span className="ml-1 text-sap-muted/70">
                ({courtCountInfo.perState.map(s => `${s.code}:${s.count}`).join(' ')})
              </span>
            )}
          </span>
        )}
      </div>

      {courtError && (
        <p className="mt-2 text-11 text-sap-danger">{courtError}</p>
      )}

      {courtResult && (
        <div className="mt-2 flex items-center gap-3 text-11">
          <span className={`font-semibold ${courtCases.length > 0 ? 'text-sap-warning' : 'text-sap-success'}`}>
            {courtCases.length > 0 ? `${courtCases.length} case${courtCases.length !== 1 ? 's' : ''} found` : 'No cases found'}
          </span>
          {courtCases.length > 0 && (
            <>
              {courtCases.filter(c => (c.caseStatus || c.case_status) === 'PENDING').length > 0 && (
                <span className="text-sap-warning">
                  {courtCases.filter(c => (c.caseStatus || c.case_status) === 'PENDING').length} pending
                </span>
              )}
              {onSwitchTab && (
                <button type="button" onClick={() => onSwitchTab('ecourts')}
                  className="text-sap-accent hover:text-sap-text underline underline-offset-2 transition-colors"
                >View in courts</button>
              )}
            </>
          )}
          {courtResult._cached && <span className="text-sap-muted px-1 py-0.5 bg-sap-panel rounded text-11">cached</span>}
        </div>
      )}
    </div>
  );
}

function LocationIntel({ location }) {
  const { pincode, evidence } = location;
  const stateVotes = evidence?.state_votes || {};
  const districtVotes = evidence?.district_votes || {};
  const sortedStates = Object.entries(stateVotes).sort((a, b) => b[1] - a[1]);
  const sortedCities = Object.entries(districtVotes).sort((a, b) => b[1] - a[1]);

  return (
    <div className="mb-2.5 space-y-2">
      {sortedStates.length > 0 && (
        <div>
          <span className="text-11 text-sap-muted font-semibold mr-2">States</span>
          <div className="inline-flex flex-wrap gap-1.5 mt-0.5">
            {sortedStates.map(([s, count], i) => (
              <span
                key={s}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-12 border ${
                  i === 0
                    ? 'bg-sap-accent/[0.10] text-sap-text border-sap-accent/30 font-medium'
                    : 'bg-sap-panel text-sap-dim border-sap-border-light'
                }`}
              >
                {s}
                <span className={`text-11 tabular-nums ${i === 0 ? 'text-sap-accent' : 'text-sap-muted'}`}>{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {sortedCities.length > 0 && (
        <div>
          <span className="text-11 text-sap-muted font-semibold mr-2">Cities</span>
          <div className="inline-flex flex-wrap gap-1.5 mt-0.5">
            {sortedCities.map(([c, count], i) => (
              <span
                key={c}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-12 border ${
                  i === 0
                    ? 'bg-sap-success-soft text-sap-text border-sap-success/30 font-medium'
                    : 'bg-sap-panel text-sap-dim border-sap-border-light'
                }`}
              >
                {c}
                <span className={`text-11 tabular-nums ${i === 0 ? 'text-sap-success' : 'text-sap-muted'}`}>{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {pincode && (
        <div>
          <span className="text-11 text-sap-muted font-semibold mr-2">Pincode</span>
          <span className="px-2 py-0.5 rounded text-12 font-mono text-sap-dim bg-sap-panel border border-sap-border-light">{pincode}</span>
        </div>
      )}
    </div>
  );
}
