import { useMemo, useState, useEffect, useRef } from 'react';
import { chooseCanonicalIdentity } from '../lib/canonicalIdentity';
import { chooseCanonicalLocation, formatCanonicalLocation } from '../lib/canonicalLocation';
import { ecourtsSearch, getEcourtsByState } from '../lib/api';

const CATEGORIES = [
  {
    key: 'names',
    label: 'Identity',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    color: 'text-sap-text',
    match: k => /^(name|fullname|full_name|first_?name|last_?name|middle_?name|display_?name|displayname|real_?name)$/i.test(k),
  },
  {
    key: 'usernames',
    label: 'Usernames',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9" />
      </svg>
    ),
    color: 'text-entity-darkweb',
    match: k => /^(user_?name|username|nick(?:name)?|screen_?name|handle|loginname|user_?id|username_?2)$/i.test(k),
    validate: v => typeof v === 'string'
      && v.trim().length >= 3
      && !/^\d{8,}$/.test(v.trim())
      && !/^\d{4}[-/]\d{2}[-/]\d{2}/.test(v.trim())
      && !/^\d{2}-[A-Z]{3}-\d{2,4}$/i.test(v.trim())
      && !/^\d{2}\/\d{2}\/\d{4}$/.test(v.trim()),
  },
  {
    key: 'emails',
    label: 'Emails',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    color: 'text-entity-email',
    match: k => /^(e-?mail|mail|email_?address)$/i.test(k),
    validate: v => typeof v === 'string' && v.includes('@'),
  },
  {
    key: 'phones',
    label: 'Phone Numbers',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    ),
    color: 'text-entity-phone',
    match: k => /phone|mobile|cell|telephone|contact_?number|contactnumber/i.test(k)
      && !/email/i.test(k),
    validate: v => typeof v === 'string' && /\d{7,}/.test(v.replace(/\D/g, '')),
  },
  {
    key: 'ips',
    label: 'IP Addresses',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
      </svg>
    ),
    color: 'text-entity-telegram',
    match: k => /^(ip|ip_?address|last_?ip|signup_?ip|login_?ip|created_?ip|register_?ip|reg_?ip)$/i.test(k),
    validate: v => typeof v === 'string' && /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(v),
  },
  {
    key: 'locations',
    label: 'Locations',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    color: 'text-emerald-600',
    match: k => /city|state|country|region|zip|zipcode|postal|address|location|geo|pincode|district|area/i.test(k)
      && !/ip/i.test(k) && !/email/i.test(k),
  },
  {
    key: 'devices',
    label: 'Device / Browser',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    color: 'text-sap-dim',
    match: k => /device|browser|user_?agent|os|platform|device_?id|imei|mac_?address/i.test(k),
  },
  {
    key: 'accounts',
    label: 'Linked Accounts',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
    color: 'text-entity-darkweb',
    match: k => /facebook|linkedin|twitter|instagram|telegram|skype|discord|steam|truecaller|whatsapp|snapchat|tiktok|reddit|github|spotify|netflix|amazon|apple_?id|google|yahoo|outlook|profile_?url|website|url|homepage|social/i.test(k),
  },
  {
    key: 'financial',
    label: 'Financial',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
    color: 'text-entity-upi',
    match: k => /upi|bank|ifsc|account_?number|card|pan|aadhaar|aadhar|cibil|payment|wallet/i.test(k)
      && !/wallet_?balance/i.test(k),
  },
  {
    key: 'dob',
    label: 'Date of Birth',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    color: 'text-sap-dim',
    match: k => /dob|date_?of_?birth|birth_?date|birthday/i.test(k),
  },
];

const SKIP_VALUES = new Set(['', 'null', 'None', 'none', 'undefined', 'N/A', 'n/a', '-', '0', 'false']);

function isUseful(v) {
  if (!v || typeof v !== 'string') return false;
  const trimmed = v.trim();
  if (SKIP_VALUES.has(trimmed)) return false;
  if (trimmed.length < 2 || trimmed.length > 500) return false;
  return true;
}

const NAME_COMPOSITE_KEYS = new Set(['fullname', 'full_name', 'displayname', 'display_name', 'real_name', 'name']);
const NAME_COMPONENT_KEYS = new Set(['first_name', 'firstname', 'last_name', 'lastname', 'middle_name', 'middlename']);
const ADDR_PART_KEYS = ['address1', 'address2', 'building', 'area', 'street', 'landmark', 'city', 'district', 'state', 'zip', 'zipcode', 'postal', 'pincode', 'country'];
const ADDR_PART_SET = new Set(ADDR_PART_KEYS);
const COUNTRY_EXPAND = { IN: 'India', US: 'United States', UK: 'United Kingdom', AU: 'Australia', CA: 'Canada', SG: 'Singapore', AE: 'United Arab Emirates', NZ: 'New Zealand', DE: 'Germany', FR: 'France', GB: 'United Kingdom' };

function composeName(fields) {
  const consumed = new Set();
  for (const k of Object.keys(fields)) {
    if (NAME_COMPOSITE_KEYS.has(k.toLowerCase())) {
      const v = fields[k];
      if (isUseful(v)) {
        consumed.add(k.toLowerCase());
        [...NAME_COMPONENT_KEYS].forEach(ck => consumed.add(ck));
        return [v.trim(), consumed];
      }
    }
  }
  const parts = [];
  for (const partKey of ['first_name', 'firstname', 'middle_name', 'middlename', 'last_name', 'lastname']) {
    const v = fields[partKey] || fields[partKey.replace('_', '')];
    if (v && isUseful(v)) parts.push(v.trim());
  }
  if (parts.length > 0) {
    [...NAME_COMPOSITE_KEYS, ...NAME_COMPONENT_KEYS].forEach(ck => consumed.add(ck));
    return [parts.join(' '), consumed];
  }
  return [null, consumed];
}

function composeAddress(fields) {
  const consumed = new Set();
  const fieldsLower = {};
  for (const k of Object.keys(fields)) fieldsLower[k.toLowerCase()] = { key: k, val: fields[k] };

  const parts = [];
  const countryEntry = fieldsLower['country'];
  let countryVal = countryEntry && isUseful(countryEntry.val) ? countryEntry.val.trim() : null;
  if (countryVal && /^[A-Z]{2}$/i.test(countryVal)) {
    countryVal = COUNTRY_EXPAND[countryVal.toUpperCase()] || null;
  }

  for (const partKey of ADDR_PART_KEYS) {
    if (partKey === 'country') continue;
    const entry = fieldsLower[partKey];
    if (!entry || !isUseful(entry.val)) continue;
    const v = entry.val.trim();
    if (/^\d{1,6}$/.test(v)) { consumed.add(partKey); continue; }
    if (v.length < 4) { consumed.add(partKey); continue; }
    if (v === '#') { consumed.add(partKey); continue; }
    parts.push(v);
    consumed.add(partKey);
  }
  if (countryEntry) consumed.add('country');
  if (countryVal) parts.push(countryVal);

  if (parts.length === 0) return [null, consumed];
  const deduped = parts.filter((p, i) => i === 0 || p.toLowerCase() !== parts[i - 1].toLowerCase());
  return [deduped.join(', '), consumed];
}

function extractProfile(results) {
  const buckets = {};
  CATEGORIES.forEach(c => { buckets[c.key] = new Map(); });

  for (const entity of (results || [])) {
    if (!entity.found) continue;
    for (const src of (entity.sources || [])) {
      for (const rec of (src.records || [])) {
        const fields = rec.fields || {};

        const [composedName, nameConsumed] = composeName(fields);
        if (composedName && isUseful(composedName)) {
          const n = composedName.trim();
          if (!buckets.names.has(n.toLowerCase())) buckets.names.set(n.toLowerCase(), n);
        }

        const [composedAddr, addrConsumed] = composeAddress(fields);
        if (composedAddr && isUseful(composedAddr)) {
          const a = composedAddr.trim();
          if (!buckets.locations.has(a.toLowerCase())) buckets.locations.set(a.toLowerCase(), a);
        }

        for (const [key, val] of Object.entries(fields)) {
          if (!isUseful(val)) continue;
          const keyLower = key.toLowerCase();

          if (nameConsumed.has(keyLower)) continue;
          if (addrConsumed.has(keyLower) || ADDR_PART_SET.has(keyLower)) continue;

          for (const cat of CATEGORIES) {
            if (cat.key === 'names' || cat.key === 'locations') continue;
            if (cat.match(key)) {
              if (cat.validate && !cat.validate(val)) break;
              const normalized = val.trim();
              if (!buckets[cat.key].has(normalized.toLowerCase())) {
                buckets[cat.key].set(normalized.toLowerCase(), normalized);
              }
              break;
            }
          }
        }
      }
    }

    if (entity.entity_type === 'email' && entity.entity_value) {
      const v = entity.entity_value.trim();
      if (!buckets.emails.has(v.toLowerCase())) {
        buckets.emails.set(v.toLowerCase(), v);
      }
    }
    if (entity.entity_type === 'phone' && entity.entity_value) {
      const v = entity.entity_value.trim();
      if (!buckets.phones.has(v.toLowerCase())) {
        buckets.phones.set(v.toLowerCase(), v);
      }
    }
  }

  const profile = {};
  let totalCount = 0;
  CATEGORIES.forEach(cat => {
    const values = [...buckets[cat.key].values()];
    if (values.length > 0) {
      profile[cat.key] = values;
      totalCount += values.length;
    }
  });
  return { profile, totalCount };
}

const TAG_STAGGER_MS = 80;

export default function SubjectProfile({ results, loading, onFocusEntity, onSwitchTab, aiSummary }) {
  const { profile, totalCount } = useMemo(() => extractProfile(results), [results]);

  const canonical = useMemo(
    () => chooseCanonicalIdentity({
      names:     profile.names     || [],
      usernames: profile.usernames || [],
      emails:    profile.emails    || [],
    }),
    [profile.names, profile.usernames, profile.emails],
  );

  const location = useMemo(() => chooseCanonicalLocation(results), [results]);

  const allTags = useMemo(() => {
    const tags = [];
    CATEGORIES.filter(c => profile[c.key]).forEach(cat => {
      profile[cat.key].forEach(v => tags.push({ cat: cat.key, value: v }));
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
    <div className="rounded-lg border border-sap-border bg-sap-surface shadow-sm overflow-hidden mb-5 animate-fade-in">
      {/* AI Summary — shown when available */}
      {aiSummary && (
        <div className="px-5 py-3.5 bg-sap-accent/5 border-b border-sap-accent/15">
          <p className="text-sm text-sap-dim leading-relaxed">{aiSummary}</p>
        </div>
      )}

      {/* Header */}
      <div className="px-5 py-3.5 bg-sap-panel/50 border-b border-sap-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-sap-accent/10 border border-sap-accent/20 flex items-center justify-center">
            {(loading || isRevealing) ? (
              <div className="h-4 w-4 rounded-full border-2 border-sap-accent/30 border-t-sap-accent animate-spin" />
            ) : (
              <svg className="w-4.5 h-4.5 text-sap-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0" />
              </svg>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-sap-text">Subject Profile</h3>
            <p className="text-xs font-mono text-sap-muted">
              {(loading || isRevealing)
                ? <span className="animate-scan">{revealedTags}/{allTags.length} identifiers resolving...</span>
                : <span>{totalCount} identifiers extracted</span>
              }
            </p>
          </div>
        </div>
        {(loading || isRevealing) && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-24 rounded-full bg-sap-panel overflow-hidden">
              <div
                className="h-full bg-sap-accent rounded-full transition-all duration-300 ease-out"
                style={{ width: `${allTags.length ? (revealedTags / allTags.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Identified subject banner */}
      {canonical.canonical && canonical.confidence > 0 && !isRevealing && (
        <IdentifiedSubjectBanner canonical={canonical} location={location} />
      )}
      {/* Court search — always shown when location has a resolved state */}
      {location?.state && !isRevealing && (
        <CourtSearchSection
          name={canonical?.canonical || canonical?.anchor || null}
          location={location}
          onSwitchTab={onSwitchTab}
        />
      )}

      {/* Category grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-sap-border/50">
        {CATEGORIES.filter(cat => profile[cat.key]).map(cat => {
          const visibleValues = profile[cat.key].filter(
            v => revealedSet.has(`${cat.key}:${v}`)
          );
          return (
            <ProfileSection
              key={cat.key}
              catKey={cat.key}
              label={cat.label}
              icon={cat.icon}
              color={cat.color}
              values={visibleValues}
              totalValues={profile[cat.key].length}
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

function IdentifiedSubjectBanner({ canonical, location }) {
  const { canonical: name, anchor, confidence, alternates = [] } = canonical;
  const locString = formatCanonicalLocation(location);
  const pct = Math.round(confidence * 100);

  const tier =
    confidence >= 0.7 ? 'high' :
    confidence >= 0.4 ? 'medium' :
    'low';

  const palette = {
    high:   { dot: 'bg-emerald-500',  ring: 'shadow-[0_0_8px_#10b981]', text: 'text-emerald-700', bar: 'bg-emerald-500',  label: 'High Confidence' },
    medium: { dot: 'bg-amber-500',    ring: 'shadow-[0_0_8px_#f59e0b]', text: 'text-amber-700',   bar: 'bg-amber-500',    label: 'Probable Subject' },
    low:    { dot: 'bg-sap-muted',    ring: '',                          text: 'text-sap-dim',     bar: 'bg-sap-muted',    label: 'Best Guess'         },
  }[tier];

  return (
    <div className="px-5 py-3.5 bg-sap-bg/60 border-b border-sap-border">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-1.5">
        <div className="flex items-center gap-2">
          <span aria-hidden className="relative flex">
            <span className={`w-2 h-2 rounded-full ${palette.dot} relative ${palette.ring}`} />
            {tier === 'high' && (
              <span className={`absolute inset-0 w-2 h-2 rounded-full ${palette.dot} animate-ping opacity-50`} />
            )}
          </span>
          <span className={`text-[10px] font-mono font-bold uppercase tracking-[0.2em] ${palette.text}`}>
            Identified Subject
          </span>
          <span className="text-[10px] font-mono text-sap-muted">·</span>
          <span className={`text-[10px] font-mono font-semibold ${palette.text}`}>{palette.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-sap-muted tabular-nums">{pct}% confidence</span>
          <div className="h-1.5 w-20 rounded-full bg-sap-panel overflow-hidden">
            <div className={`h-full ${palette.bar} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <p className="text-base sm:text-lg font-semibold text-sap-text leading-tight tracking-tight">
        {name}
      </p>
      {locString && (
        <p className="text-xs font-mono text-sap-dim mt-0.5">{locString}</p>
      )}

      <div className="mt-1 flex items-baseline gap-2 flex-wrap text-[11px] font-mono">
        {anchor && (
          <span className="text-sap-muted">
            anchor: <span className="text-sap-dim">{anchor}</span>
          </span>
        )}
        {alternates.length > 0 && (
          <>
            <span className="text-sap-muted">·</span>
            <span className="text-sap-muted">also seen as:</span>
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

function ProfileSection({ catKey, label, icon, color, values, totalValues, onFocusEntity, locationData }) {
  if (values.length === 0 && !(catKey === 'locations' && locationData?.state)) return null;

  const isLocation = catKey === 'locations';
  const tagClasses = isLocation
    ? 'inline-block px-2 py-0.5 rounded text-xs font-mono bg-sap-panel border border-sap-border text-sap-text whitespace-normal break-words leading-snug max-w-full animate-slide-up'
    : 'inline-block px-2 py-0.5 rounded text-xs font-mono bg-sap-panel border border-sap-border text-sap-text truncate max-w-56 animate-slide-up';

  const entityType = CAT_TO_ENTITY_TYPE[catKey];
  const isNavigable = !!entityType && !!onFocusEntity;

  return (
    <div className="bg-sap-surface px-4 py-3 animate-fade-in">
      <div className={`flex items-center gap-1.5 mb-2 ${color}`}>
        {icon}
        <span className="text-xs font-mono uppercase tracking-wider font-semibold">{label}</span>
        <span className="text-xs font-mono text-sap-muted ml-1">
          ({values.length}{values.length < totalValues ? `/${totalValues}` : ''})
        </span>
      </div>

      {isLocation && locationData?.state && (
        <LocationIntel location={locationData} />
      )}

      <div className="flex flex-wrap gap-1.5">
        {values.slice(0, 15).map((v, i) => (
          isNavigable ? (
            <button
              key={v}
              type="button"
              onClick={() => onFocusEntity(entityType, v)}
              className={`${tagClasses} cursor-pointer hover:border-sap-accent/50 bg-transparent`}
              style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'both' }}
              title={`View ${v} in network map`}
            >
              {v}<span className="ml-1 opacity-60">&#x2197;</span>
            </button>
          ) : (
            <span
              key={v}
              className={tagClasses}
              style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'both' }}
              title={v}
            >
              {v}
            </span>
          )
        ))}
        {totalValues > 15 && (
          <span className="inline-block px-2 py-0.5 rounded text-xs font-mono bg-sap-panel border border-sap-border text-sap-muted">
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

  const courtCountsRef = useRef(false);
  useEffect(() => {
    if (courtCountsRef.current || courtStates.length === 0) return;
    courtCountsRef.current = true;
    getEcourtsByState()
      .then(res => setCourtCounts(res?.data || []))
      .catch(() => {});
  }, [courtStates.length]);

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
    <div className="px-5 py-3.5 bg-sap-bg/60 border-b border-sap-border">
      <div className="flex items-center flex-wrap gap-x-4 gap-y-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-sap-muted font-semibold shrink-0">Court search</span>
        <div className="flex flex-wrap gap-1.5">
          {courtStates.map(({ code, name: sName }) => {
            const on = courtChecked.has(code);
            return (
              <button key={code} type="button" onClick={() => toggleCourtState(code)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border transition-colors ${
                  on ? 'bg-sap-accent/10 border-sap-accent/30 text-sap-accent' : 'bg-sap-panel border-sap-border text-sap-dim'
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
                className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors ${
                  on ? 'bg-sap-accent/10 border-sap-accent/30 text-sap-accent' : 'bg-sap-panel border-sap-border text-sap-dim'
                }`}
              >{label}</button>
            );
          })}
        </div>
        <button type="button" onClick={handleCourtSearch} disabled={!canSearchCourt}
          className={`px-3 py-1 rounded text-[11px] font-mono font-semibold uppercase tracking-wider transition-colors ${
            canSearchCourt ? 'bg-sap-accent text-white hover:bg-sap-accent/90' : 'bg-sap-panel text-sap-muted cursor-not-allowed'
          }`}
        >
          {courtLoading ? (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Searching
            </span>
          ) : 'Search'}
        </button>
        {courtCountInfo != null && (
          <span className="text-[10px] font-mono text-sap-muted tabular-nums">
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
        <p className="mt-2 text-[11px] font-mono text-entity-drug">{courtError}</p>
      )}

      {courtResult && (
        <div className="mt-2 flex items-center gap-3 text-[11px] font-mono">
          <span className={`font-semibold ${courtCases.length > 0 ? 'text-entity-breach' : 'text-emerald-600'}`}>
            {courtCases.length > 0 ? `${courtCases.length} case${courtCases.length !== 1 ? 's' : ''} found` : 'No cases found'}
          </span>
          {courtCases.length > 0 && (
            <>
              {courtCases.filter(c => (c.caseStatus || c.case_status) === 'PENDING').length > 0 && (
                <span className="text-amber-600">
                  {courtCases.filter(c => (c.caseStatus || c.case_status) === 'PENDING').length} pending
                </span>
              )}
              {onSwitchTab && (
                <button type="button" onClick={() => onSwitchTab('ecourts')}
                  className="text-sap-accent hover:text-sap-accent/80 underline underline-offset-2"
                >View in eCourts</button>
              )}
            </>
          )}
          {courtResult._cached && <span className="text-sap-muted px-1 py-0.5 bg-sap-panel rounded text-[10px]">cached</span>}
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
          <span className="text-[10px] font-mono uppercase tracking-wider text-sap-muted font-semibold mr-2">States</span>
          <div className="inline-flex flex-wrap gap-1.5 mt-0.5">
            {sortedStates.map(([s, count], i) => (
              <span
                key={s}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono border ${
                  i === 0
                    ? 'bg-sap-accent/10 text-sap-accent border-sap-accent/20 font-medium'
                    : 'bg-sap-panel text-sap-dim border-sap-border'
                }`}
              >
                {s}
                <span className={`text-[10px] ${i === 0 ? 'text-sap-accent/60' : 'text-sap-muted'}`}>{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {sortedCities.length > 0 && (
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-sap-muted font-semibold mr-2">Cities</span>
          <div className="inline-flex flex-wrap gap-1.5 mt-0.5">
            {sortedCities.map(([c, count], i) => (
              <span
                key={c}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono border ${
                  i === 0
                    ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 font-medium'
                    : 'bg-sap-panel text-sap-dim border-sap-border'
                }`}
              >
                {c}
                <span className={`text-[10px] ${i === 0 ? 'text-emerald-600/60' : 'text-sap-muted'}`}>{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {pincode && (
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-sap-muted font-semibold mr-2">Pincode</span>
          <span className="px-2 py-0.5 rounded text-xs font-mono text-sap-dim bg-sap-panel border border-sap-border">{pincode}</span>
        </div>
      )}
    </div>
  );
}
