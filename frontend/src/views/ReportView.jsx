import { useMemo } from 'react';
import SubjectProfile from '../components/SubjectProfile';
import FtiScreening from '../components/FtiScreening';
import ErrorBoundary from '../components/ErrorBoundary';
import OverviewTab from '../tabs/OverviewTab';
import { extractIdentifiers } from '../lib/identifierExtract';

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

function deriveAlerts({ results, ftiResults, ftiMeta, darkmonResults, darkmonMeta, seedType }) {
  const alerts = [];

  const ftiSkipped = ftiMeta?.skipped === true;
  const darkmonSkipped = darkmonMeta?.skipped === true;

  if (!ftiSkipped && ftiResults?.length > 0) {
    const wcHits = ftiResults.filter(r => r.query_type === 'worldcheck' && r.found);
    const cdHits = ftiResults.filter(r => r.query_type === 'crimedata' && r.found);

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

function RiskBadge({ riskScore }) {
  if (!riskScore) return null;
  const styles = {
    CRITICAL: { pill: 'bg-sap-danger-filled text-white',          label: 'Critical' },
    HIGH:     { pill: 'bg-sap-warning-filled text-white',         label: 'High' },
    MEDIUM:   { pill: 'bg-sap-warning-soft text-sap-warning',     label: 'Medium' },
    LOW:      { pill: 'bg-sap-success-soft text-sap-success',     label: 'Low' },
  };
  const s = styles[riskScore.level] || styles.LOW;
  return (
    <div className="flex items-center gap-2.5">
      <span className={`inline-flex items-center px-2 h-6 rounded-md text-11 font-semibold tracking-tight ${s.pill}`}>
        {s.label} risk
      </span>
      <span className="text-12 text-sap-dim">
        <span className="tabular-nums text-sap-text">{riskScore.composite.toFixed(1)}</span>
        <span className="text-sap-muted"> / 10</span>
      </span>
    </div>
  );
}

function DomainBreakdown({ riskScore }) {
  if (!riskScore?.domains?.length) return null;
  const tone = {
    CRITICAL: 'text-sap-danger',
    HIGH:     'text-sap-warning',
    MEDIUM:   'text-sap-warning/65',
    LOW:      'text-sap-success',
  };
  const fmtLevel = (lvl) => lvl ? lvl.charAt(0) + lvl.slice(1).toLowerCase() : '';
  return (
    <Card>
      <CardHeader title="Risk domains" />
      <div className="px-4 py-3 flex flex-wrap gap-x-4 gap-y-2">
        {riskScore.domains.map(d => (
          <div key={d.name} className="flex items-center gap-1.5">
            <span className={`text-11 font-semibold tracking-tight ${tone[d.level] || 'text-sap-dim'}`}>
              {fmtLevel(d.level)}
            </span>
            <span className="text-12 text-sap-dim">{d.name}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function LinkedIdentifiers({ results, onPivot }) {
  const ids = useMemo(() => extractIdentifiers(results || []), [results]);

  const groups = [
    { type: 'phone',    label: 'phones',    values: ids.phones },
    { type: 'email',    label: 'emails',    values: ids.emails },
    { type: 'username', label: 'usernames', values: ids.usernames },
  ].filter(g => g.values.length > 0);

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
              {g.values.slice(0, 15).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onPivot(g.type, v)}
                  className="text-12 font-mono px-2 py-0.5 rounded border bg-sap-bg border-sap-border-light text-sap-text hover:bg-sap-surface hover:border-sap-border transition-colors cursor-pointer"
                >
                  {v}
                </button>
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

export default function ReportView({
  results, data, loading, aiSummary, riskScore, canonical, watchlistFilterTokens,
  ftiResults, ftiMeta, darkmonResults, darkmonMeta, financialResults,
  onPivot, onFocusEntity, onSwitchTab,
}) {
  const seedType = data?.seed?.type || 'email';

  const alerts = useMemo(
    () => deriveAlerts({ results, ftiResults, ftiMeta, darkmonResults, darkmonMeta, seedType }),
    [results, ftiResults, ftiMeta, darkmonResults, darkmonMeta, seedType],
  );

  const hasBreachData = results?.some(r => r.found && !r.skipped);
  const hasFtiData = ftiResults?.length > 0 || ftiMeta;
  const isTier1 = seedType === 'phone' || seedType === 'email';

  return (
    <div className="animate-fade-in space-y-4">
      {/* A. Subject Header + B. AI Summary — via SubjectProfile */}
      <ErrorBoundary name="SubjectProfile">
        <SubjectProfile
          results={results}
          loading={loading}
          onFocusEntity={onFocusEntity}
          onSwitchTab={onSwitchTab}
          aiSummary={aiSummary}
          canonical={canonical}
        />
      </ErrorBoundary>

      {/* Risk Badge */}
      <RiskBadge riskScore={riskScore} />

      {/* C. Alerts */}
      <AlertsSection alerts={alerts} />

      {/* Risk Domain Breakdown */}
      <DomainBreakdown riskScore={riskScore} />

      {/* D. Digital Footprint */}
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
            canonicalName={canonical?.canonical || null}
          />
        </ErrorBoundary>
      )}

      {/* F. Linked Identifiers */}
      {isTier1 && hasBreachData && (
        <LinkedIdentifiers results={results} onPivot={onPivot} />
      )}

      {/* G. Dark Web Summary */}
      <DarkWebSummary darkmonResults={darkmonResults} onSwitchView={onSwitchTab} />

      {/* H. Financial Summary */}
      <FinancialSummary financialResults={financialResults} onSwitchView={onSwitchTab} />
    </div>
  );
}
