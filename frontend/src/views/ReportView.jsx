import { useMemo } from 'react';
import SubjectProfile from '../components/SubjectProfile';
import FtiScreening from '../components/FtiScreening';
import ErrorBoundary from '../components/ErrorBoundary';
import OverviewTab from '../tabs/OverviewTab';
import { extractIdentifiers } from '../lib/identifierExtract';

const SEVERITY_COLORS = {
  red:   'border-l-entity-drug bg-entity-drug/5',
  amber: 'border-l-amber-500 bg-amber-500/5',
  green: 'border-l-emerald-500 bg-emerald-500/5',
};
const SEVERITY_TEXT = {
  red:   'text-entity-drug',
  amber: 'text-amber-700',
  green: 'text-emerald-600',
};

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
    <div className="rounded-lg border border-sap-border bg-sap-surface shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-sap-border">
        <h3 className="text-xs font-mono tracking-widest text-sap-dim uppercase font-semibold">Alerts</h3>
      </div>
      <div className="divide-y divide-sap-border/50">
        {alerts.map((a, i) => (
          <div key={i} className={`px-5 py-2.5 border-l-4 ${SEVERITY_COLORS[a.severity]}`}>
            <p className={`text-sm font-medium ${SEVERITY_TEXT[a.severity]}`}>{a.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RiskBadge({ riskScore }) {
  if (!riskScore) return null;
  const colors = {
    CRITICAL: 'bg-entity-drug text-white',
    HIGH: 'bg-amber-500 text-white',
    MEDIUM: 'bg-amber-200 text-amber-900',
    LOW: 'bg-emerald-100 text-emerald-800',
  };
  return (
    <div className="flex items-center gap-2">
      <span className={`px-2 py-1 rounded text-xs font-mono font-bold ${colors[riskScore.level]}`}>
        {riskScore.level} RISK
      </span>
      <span className="text-xs font-mono text-sap-muted">
        {riskScore.composite.toFixed(1)}/10
      </span>
    </div>
  );
}

function DomainBreakdown({ riskScore }) {
  if (!riskScore?.domains?.length) return null;
  const colors = {
    CRITICAL: 'text-entity-drug',
    HIGH: 'text-amber-600',
    MEDIUM: 'text-amber-500',
  };
  return (
    <div className="rounded-lg border border-sap-border bg-sap-surface shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-sap-border">
        <h3 className="text-xs font-mono tracking-widest text-sap-dim uppercase font-semibold">Risk Domains</h3>
      </div>
      <div className="px-5 py-4 flex flex-wrap gap-3">
        {riskScore.domains.map(d => (
          <div key={d.name} className="flex items-center gap-1.5">
            <span className={`text-xs font-mono font-semibold ${colors[d.level]}`}>{d.level}</span>
            <span className="text-xs text-sap-dim">{d.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LinkedIdentifiers({ results, onPivot }) {
  const ids = useMemo(() => extractIdentifiers(results || []), [results]);

  const groups = [
    { type: 'phone', label: 'phones', values: ids.phones, color: 'text-entity-phone bg-entity-phone/5 border-entity-phone/20' },
    { type: 'email', label: 'emails', values: ids.emails, color: 'text-entity-email bg-entity-email/5 border-entity-email/20' },
    { type: 'username', label: 'usernames', values: ids.usernames, color: 'text-entity-darkweb bg-entity-darkweb/5 border-entity-darkweb/20' },
  ].filter(g => g.values.length > 0);

  if (groups.length === 0) return null;

  const summary = groups.map(g => `${g.values.length} ${g.label}`).join(' · ');

  return (
    <div className="rounded-lg border border-sap-border bg-sap-surface shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-sap-border flex items-center justify-between">
        <h3 className="text-xs font-mono tracking-widest text-sap-dim uppercase font-semibold">Linked Identifiers</h3>
        <span className="text-xs font-mono text-sap-muted">{summary}</span>
      </div>
      <div className="px-5 py-4 space-y-3">
        {groups.map(g => (
          <div key={g.type}>
            <span className="text-[10px] font-mono uppercase tracking-wider text-sap-muted font-semibold">{g.label}</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {g.values.slice(0, 15).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onPivot(g.type, v)}
                  className={`text-xs font-mono px-2 py-0.5 rounded border ${g.color} hover:opacity-80 cursor-pointer`}
                >
                  {v}
                </button>
              ))}
              {g.values.length > 15 && (
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-sap-panel border border-sap-border text-sap-muted">
                  +{g.values.length - 15} more
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DarkWebSummary({ darkmonResults, onSwitchView }) {
  const matches = (darkmonResults || []).filter(r => r.found);
  if (matches.length === 0) return null;

  const totalPosts = matches.reduce((s, r) => s + (r.threads?.length || 0) + (r.posts?.length || 0), 0);
  const usernames = matches.map(r => r.username).filter(Boolean);

  return (
    <div className="rounded-lg border border-sap-border bg-sap-surface shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-sap-border">
        <h3 className="text-xs font-mono tracking-widest text-sap-dim uppercase font-semibold">Dark Web Activity</h3>
      </div>
      <div className="px-5 py-4 flex items-center justify-between">
        <p className="text-sm text-sap-dim">
          {totalPosts > 0 ? `${totalPosts} forum post${totalPosts !== 1 ? 's' : ''} found` : 'Activity detected'} for
          {usernames.length === 1 ? ` username "${usernames[0]}"` : ` ${usernames.length} usernames`}
        </p>
        <button
          type="button"
          onClick={() => onSwitchView('evidence')}
          className="text-xs font-mono text-sap-accent hover:underline"
        >
          View details &rarr;
        </button>
      </div>
    </div>
  );
}

function FinancialSummary({ financialResults, onSwitchView }) {
  const hits = (financialResults || []).filter(r => r.found);
  if (hits.length === 0) return null;

  return (
    <div className="rounded-lg border border-sap-border bg-sap-surface shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-sap-border">
        <h3 className="text-xs font-mono tracking-widest text-sap-dim uppercase font-semibold">Financial Flags</h3>
      </div>
      <div className="px-5 py-4 flex items-center justify-between">
        <p className="text-sm text-sap-dim">
          {hits.length} UPI fraud flag{hits.length !== 1 ? 's' : ''}
        </p>
        <button
          type="button"
          onClick={() => onSwitchView('tools')}
          className="text-xs font-mono text-sap-accent hover:underline"
        >
          View details &rarr;
        </button>
      </div>
    </div>
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
