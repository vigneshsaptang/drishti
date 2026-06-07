import { useMemo } from 'react';
import SubjectProfile from '../components/SubjectProfile';
import FtiScreening from '../components/FtiScreening';
import ErrorBoundary from '../components/ErrorBoundary';
import OverviewTab from '../tabs/OverviewTab';
import { extractIdentifiers } from '../lib/identifierExtract';
import Provenance from '../components/Provenance';

const SEVERITY_COLORS = {
  red:   'border-l-sap-danger bg-sap-danger-filled/[0.04]',
  amber: 'border-l-sap-warning-filled bg-sap-warning-filled/[0.04]',
  green: 'border-l-sap-success-filled bg-sap-success-filled/[0.04]',
};
const SEVERITY_TEXT = {
  red:   'text-sap-danger',
  amber: 'text-sap-warning',
  green: 'text-sap-success',
};

// Shared card chrome — Linear-style: 1px hairline border, near-flat shadow.
const CARD_CLS =
  'rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden';

function Card({ children, className = '' }) {
  return <div className={`${CARD_CLS} ${className}`}>{children}</div>;
}

function CardHeader({ title, meta, action }) {
  return (
    <div className="px-4 py-2.5 border-b border-sap-border-light flex items-center justify-between gap-3">
      <h3 className="text-12 font-semibold tracking-tight text-sap-text">{title}</h3>
      <div className="flex items-center gap-3 min-w-0">
        {meta && <span className="text-11 text-sap-muted truncate">{meta}</span>}
        {action}
      </div>
    </div>
  );
}

function ViewDetailsLink({ onClick, label = 'View details' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-12 text-sap-dim hover:text-sap-text transition-colors"
    >
      {label}
      <span aria-hidden>→</span>
    </button>
  );
}

function deriveAlerts({ results, ftiResults, ftiMeta, darkmonResults, darkmonMeta, seedType, canonicalTokens }) {
  const alerts = [];

  const ftiSkipped = ftiMeta?.skipped === true;
  const darkmonSkipped = darkmonMeta?.skipped === true;

  const tokens = (canonicalTokens || []).filter(Boolean);
  const matchesCanonical = (r) => {
    if (tokens.length === 0) return true;  // no canonical → fall back to all hits
    const ev = (r.extracted_info || '').toLowerCase();
    if (tokens.every(t => ev.includes(t))) return true;
    const matchedName = (r.matched_name || '').toLowerCase();
    return tokens.every(t => matchedName.includes(t));
  };

  if (!ftiSkipped && ftiResults?.length > 0) {
    const wcHits = ftiResults.filter(r => r.query_type === 'worldcheck' && r.found && matchesCanonical(r));
    const cdHits = ftiResults.filter(r => r.query_type === 'crimedata' && r.found && matchesCanonical(r));

    if (wcHits.length > 0) {
      alerts.push({ severity: 'red', text: `Sanctions/PEP match — ${wcHits.length} watchlist hit${wcHits.length !== 1 ? 's' : ''}` });
    }
    if (cdHits.length > 0) {
      alerts.push({ severity: 'red', text: `Crime database match — ${cdHits.length} hit${cdHits.length !== 1 ? 's' : ''}` });
    }
  }

  if (seedType !== 'fullname' && results?.length > 0) {
    let plaintextCount = 0;
    let infostealerCount = 0;

    for (const entity of results) {
      if (!entity.found) continue;
      for (const src of (entity.sources || [])) {
        const colLower = (src.collection || '').toLowerCase();
        if (colLower.includes('malware_log')) {
          infostealerCount++;
        }
        for (const rec of (src.records || [])) {
          for (const [k, v] of Object.entries(rec.fields || {})) {
            if (/password/i.test(k) && v && typeof v === 'string' && v.length > 0) {
              const isHash = /^[a-f0-9]{32,}$/i.test(v) || /^\$2[aby]\$/.test(v) || /^pbkdf2/.test(v);
              if (!isHash) plaintextCount++;
            }
          }
        }
      }
    }

    if (plaintextCount > 0) {
      alerts.push({ severity: 'amber', text: `Plaintext password exposed in ${plaintextCount} record${plaintextCount !== 1 ? 's' : ''}` });
    }
    if (infostealerCount > 0) {
      alerts.push({ severity: 'amber', text: `Infostealer credentials found in ${infostealerCount} source${infostealerCount !== 1 ? 's' : ''}` });
    }
  }

  if (!darkmonSkipped && darkmonResults?.length > 0) {
    const dmMatches = darkmonResults.filter(r => r.found);
    if (dmMatches.length > 0) {
      alerts.push({ severity: 'amber', text: `Dark web forum activity — ${dmMatches.length} username${dmMatches.length !== 1 ? 's' : ''} with posts` });
    }
  }

  if (!ftiSkipped && ftiMeta && ftiMeta.crimedata_matches === 0 && ftiMeta.worldcheck_matches === 0) {
    alerts.push({ severity: 'green', text: 'No watchlist or sanctions hits' });
  }

  if (!darkmonSkipped && darkmonMeta && darkmonMeta.total_matches === 0) {
    alerts.push({ severity: 'green', text: 'No dark web forum presence detected' });
  }

  return alerts;
}

function AlertsSection({ alerts }) {
  if (alerts.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Alerts" meta={`${alerts.length} signal${alerts.length !== 1 ? 's' : ''}`} />
      <div className="divide-y divide-sap-border-light">
        {alerts.map((a, i) => (
          <div key={i} className={`px-4 py-2.5 border-l-[3px] ${SEVERITY_COLORS[a.severity]}`}>
            <p className={`text-13 font-medium ${SEVERITY_TEXT[a.severity]}`}>{a.text}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

// IP boundary: only riskScore.level, riskScore.composite, and
// riskScore.domains[].{name, level} are rendered. Factor IDs, weights,
// severities, and rationale never reach the browser.
function RiskOverview({ riskScore }) {
  if (!riskScore) return null;

  const verdictStyles = {
    CRITICAL: { pill: 'bg-sap-danger-filled text-white',        accent: 'border-l-sap-danger',          bar: 'bg-sap-danger-filled',  label: 'Critical' },
    HIGH:     { pill: 'bg-sap-warning-filled text-white',       accent: 'border-l-sap-warning-filled',  bar: 'bg-sap-warning-filled', label: 'High' },
    MEDIUM:   { pill: 'bg-sap-warning-soft text-sap-warning',   accent: 'border-l-sap-warning',         bar: 'bg-sap-warning',        label: 'Medium' },
    LOW:      { pill: 'bg-sap-success-soft text-sap-success',   accent: 'border-l-sap-success',         bar: 'bg-sap-success-filled', label: 'Low' },
  };
  const v = verdictStyles[riskScore.level] || verdictStyles.LOW;
  const compositePct = Math.min(100, Math.max(0, (riskScore.composite / 10) * 100));

  // Group domains by their level for compact display
  const domainsByLevel = {};
  for (const d of (riskScore.domains || [])) {
    const lvl = d.level || 'LOW';
    (domainsByLevel[lvl] ||= []).push(d.name);
  }
  const levelOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const levelTone = {
    CRITICAL: { dot: 'bg-sap-danger',          label: 'Critical', text: 'text-sap-danger' },
    HIGH:     { dot: 'bg-sap-warning-filled',  label: 'High',     text: 'text-sap-warning' },
    MEDIUM:   { dot: 'bg-sap-warning-soft border border-sap-warning/40', label: 'Medium', text: 'text-sap-dim' },
    LOW:      { dot: 'bg-sap-success-soft border border-sap-success/40', label: 'Low',    text: 'text-sap-dim' },
  };

  return (
    <Card className={`border-l-[3px] ${v.accent}`}>
      <CardHeader title="Risk verdict" />
      <div className="px-4 py-3.5">
        <div className="flex items-start gap-6">
          {/* Verdict + composite + bar */}
          <div className="flex flex-col gap-2 shrink-0">
            <span className={`inline-flex items-center justify-center px-2.5 h-7 rounded-md text-12 font-semibold tracking-tight w-fit ${v.pill}`}>
              {v.label} risk
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-26 font-semibold tracking-tight tabular-nums text-sap-text">
                {riskScore.composite.toFixed(1)}
              </span>
              <span className="text-12 text-sap-muted">/ 10</span>
            </div>
            <div className="h-1 w-32 rounded-full bg-sap-panel overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${v.bar}`}
                style={{ width: `${compositePct}%` }}
              />
            </div>
          </div>

          {/* Domains grouped by level */}
          {riskScore.domains?.length > 0 && (
            <div className="flex-1 min-w-0 space-y-1.5">
              <span className="text-11 text-sap-muted font-medium block mb-0.5">Risk by domain</span>
              {levelOrder
                .filter(lvl => domainsByLevel[lvl]?.length > 0)
                .map(lvl => {
                  const t = levelTone[lvl];
                  return (
                    <div key={lvl} className="flex items-baseline gap-2">
                      <span className="flex items-center gap-1.5 shrink-0 w-16">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${t.dot}`} />
                        <span className={`text-11 font-semibold tracking-tight ${t.text}`}>{t.label}</span>
                      </span>
                      <span className="text-12 text-sap-dim flex-1 min-w-0">
                        {domainsByLevel[lvl].join(' · ')}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// Normalise a profile bucket whose entries may arrive as `{value, sources}`
// (spec B1) or as bare strings (legacy fallback). Filters out empties.
function bucketEntries(bucket) {
  if (!Array.isArray(bucket)) return [];
  const out = [];
  for (const e of bucket) {
    if (e && typeof e === 'object' && 'value' in e) {
      if (e.value === null || e.value === undefined || e.value === '') continue;
      out.push({ value: e.value, sources: Array.isArray(e.sources) ? e.sources : [] });
    } else if (e !== null && e !== undefined && e !== '') {
      out.push({ value: e, sources: [] });
    }
  }
  return out;
}

function LinkedIdentifiers({ results, profile, onPivot }) {
  // Prefer the per-value entries on `profile` (they carry provenance sources
  // after spec B1). Fall back to extractIdentifiers when a category is empty,
  // so we still surface identifiers found purely via raw breach records.
  const groups = useMemo(() => {
    const fallback = extractIdentifiers(results || []);
    const fromFallback = (type) => (fallback[`${type}s`] || []).map(v => ({ value: v, sources: [] }));
    const build = (type, key) => {
      const fromProfile = bucketEntries(profile?.[key]);
      const values = fromProfile.length > 0 ? fromProfile : fromFallback(type);
      return { type, label: key, values };
    };
    return [
      build('phone',    'phones'),
      build('email',    'emails'),
      build('username', 'usernames'),
    ].filter((g) => g.values.length > 0);
  }, [results, profile]);

  if (groups.length === 0) return null;

  const summary = groups.map(g => `${g.values.length} ${g.label}`).join(' · ');

  return (
    <Card>
      <CardHeader title="Linked identifiers" meta={summary} />
      <div className="px-4 py-3 space-y-2.5">
        {groups.map(g => (
          <div key={g.type}>
            <span className="text-11 text-sap-muted font-medium">{g.label}</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {g.values.slice(0, 15).map(entry => (
                <Provenance key={entry.value} value={entry.value} sources={entry.sources}>
                  <button
                    type="button"
                    onClick={() => onPivot(g.type, entry.value)}
                    className="text-12 font-mono px-2 py-0.5 rounded border bg-sap-bg border-sap-border-light text-sap-text hover:bg-sap-surface hover:border-sap-border transition-colors cursor-pointer"
                  >
                    {entry.value}
                  </button>
                </Provenance>
              ))}
              {g.values.length > 15 && (
                <span className="text-12 px-2 py-0.5 rounded border bg-sap-bg border-sap-border-light text-sap-muted">
                  +{g.values.length - 15} more
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DarkWebSummary({ darkmonResults, onSwitchView }) {
  const matches = (darkmonResults || []).filter(r => r.found);
  if (matches.length === 0) return null;

  const totalPosts = matches.reduce((s, r) => s + (r.threads?.length || 0) + (r.posts?.length || 0), 0);
  const usernames = matches.map(r => r.username).filter(Boolean);

  return (
    <Card>
      <CardHeader title="Dark web activity" action={<ViewDetailsLink onClick={() => onSwitchView('evidence')} />} />
      <div className="px-4 py-3">
        <p className="text-13 text-sap-dim">
          {totalPosts > 0 ? `${totalPosts} forum post${totalPosts !== 1 ? 's' : ''} found` : 'Activity detected'} for
          {usernames.length === 1 ? ` username "${usernames[0]}"` : ` ${usernames.length} usernames`}
        </p>
      </div>
    </Card>
  );
}

function FinancialSummary({ financialResults, onSwitchView }) {
  const hits = (financialResults || []).filter(r => r.found);
  if (hits.length === 0) return null;

  return (
    <Card>
      <CardHeader title="Financial flags" action={<ViewDetailsLink onClick={() => onSwitchView('tools')} />} />
      <div className="px-4 py-3">
        <p className="text-13 text-sap-dim">
          {hits.length} UPI fraud flag{hits.length !== 1 ? 's' : ''}
        </p>
      </div>
    </Card>
  );
}

// ReportProgress — slim card at the top of the report while the SSE stream
// is in flight. Phase label + pulsing dot + progress bar derived from which
// SSE events have landed. Unmounts when loading flips false.

function ReportProgress({ loading, results, ftiMeta, darkmonMeta, profile, riskScore }) {
  if (!loading) return null;

  const phases = [
    { label: 'Searching breach data',  done: (results?.length || 0) > 0 },
    { label: 'Screening watchlists',   done: !!ftiMeta },
    { label: 'Scanning dark web',      done: !!darkmonMeta },
    { label: 'Building profile',       done: !!profile },
    { label: 'Computing risk',         done: !!riskScore },
  ];
  const doneCount = phases.filter(p => p.done).length;
  const current = phases.find(p => !p.done) || phases[phases.length - 1];
  const pct = Math.round((doneCount / phases.length) * 100);

  return (
    <Card>
      <div className="px-4 py-3">
        <div className="flex items-center gap-2.5 mb-2.5">
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
            <span className="absolute inline-flex h-full w-full rounded-full bg-sap-accent opacity-40 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-sap-accent" />
          </span>
          <p className="text-13 font-medium text-sap-text">
            {current.label}<span className="text-sap-dim">…</span>
          </p>
          <span className="ml-auto text-11 tabular-nums text-sap-muted">
            {doneCount}/{phases.length}
          </span>
        </div>
        <div className="h-1 rounded-full bg-sap-panel overflow-hidden">
          <div
            className="h-full bg-sap-accent rounded-full transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </Card>
  );
}

export default function ReportView({
  results, data, loading, aiSummary, riskScore, canonical, canonicalName, canonicalSource, watchlistFilterTokens,
  profile, canonicalLocation,
  ftiResults, ftiMeta, darkmonResults, darkmonMeta, financialResults,
  onPivot, onFocusEntity, onSwitchTab,
}) {
  const seedType = data?.seed?.type || 'email';

  const alerts = useMemo(
    () => deriveAlerts({ results, ftiResults, ftiMeta, darkmonResults, darkmonMeta, seedType, canonicalTokens: watchlistFilterTokens }),
    [results, ftiResults, ftiMeta, darkmonResults, darkmonMeta, seedType, watchlistFilterTokens],
  );

  const hasBreachData = results?.some(r => r.found && !r.skipped);
  const hasFtiData = ftiResults?.length > 0 || ftiMeta;
  const isTier1 = seedType === 'phone' || seedType === 'email';

  return (
    <div className="animate-fade-in space-y-4">
      {/* Loading state — slim progress card with phase label + bar. */}
      <ReportProgress
        loading={loading}
        results={results}
        ftiMeta={ftiMeta}
        darkmonMeta={darkmonMeta}
        profile={profile}
        riskScore={riskScore}
      />

      {/* A. Subject Header + B. AI Summary — via SubjectProfile */}
      <ErrorBoundary name="SubjectProfile">
        <SubjectProfile
          results={results}
          loading={loading}
          onFocusEntity={onFocusEntity}
          onSwitchTab={onSwitchTab}
          aiSummary={aiSummary}
          canonical={canonical}
          canonicalName={canonicalName}
          canonicalSource={canonicalSource}
          profile={profile}
          canonicalLocation={canonicalLocation}
        />
      </ErrorBoundary>

      {/* Risk verdict — hero panel (composite + level + per-domain) */}
      <RiskOverview riskScore={riskScore} />

      {/* Alerts — action-required signals */}
      <AlertsSection alerts={alerts} />

      {/* Digital Footprint */}
      {hasBreachData && (
        <ErrorBoundary name="DigitalFootprint">
          <OverviewTab data={data} results={results} onPivot={onPivot} ftiResults={ftiResults} />
        </ErrorBoundary>
      )}

      {/* E. Screening Results */}
      {hasFtiData && (
        <ErrorBoundary name="FtiScreening">
          <FtiScreening
            ftiResults={ftiResults}
            ftiMeta={ftiMeta}
            loading={loading}
            canonicalTokens={watchlistFilterTokens}
            canonicalName={canonicalName || canonical?.canonical || null}
            canonicalSource={canonicalSource}
          />
        </ErrorBoundary>
      )}

      {/* F. Linked Identifiers */}
      {isTier1 && hasBreachData && (
        <LinkedIdentifiers results={results} profile={profile} onPivot={onPivot} />
      )}

      {/* G. Dark Web Summary */}
      <DarkWebSummary darkmonResults={darkmonResults} onSwitchView={onSwitchTab} />

      {/* H. Financial Summary */}
      <FinancialSummary financialResults={financialResults} onSwitchView={onSwitchTab} />
    </div>
  );
}
