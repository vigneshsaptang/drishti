import { useState, useMemo } from 'react';
import { ecourtsSearch } from '../lib/api';

const STATE_CODE_TO_NAME = {
  DL: 'Delhi', MH: 'Maharashtra', KA: 'Karnataka', TN: 'Tamil Nadu',
  TS: 'Telangana', AP: 'Andhra Pradesh', UP: 'Uttar Pradesh', GJ: 'Gujarat',
  RJ: 'Rajasthan', WB: 'West Bengal', KL: 'Kerala', HR: 'Haryana',
  PB: 'Punjab', MP: 'Madhya Pradesh', BR: 'Bihar', JH: 'Jharkhand',
  OR: 'Odisha', OD: 'Odisha', AS: 'Assam', UK: 'Uttarakhand',
  HP: 'Himachal Pradesh', GA: 'Goa', JK: 'Jammu & Kashmir',
  CG: 'Chhattisgarh', TR: 'Tripura', MN: 'Manipur', ML: 'Meghalaya',
  MZ: 'Mizoram', NL: 'Nagaland', SK: 'Sikkim', AR: 'Arunachal Pradesh',
  CH: 'Chandigarh',
};

const COURT_KINDS = [
  { key: 'HighCourt', label: 'High Courts' },
  { key: 'District', label: 'District Courts' },
];

function buildStateOptions(location) {
  const votes = location?.evidence?.state_votes || {};
  const stateCode = location?.stateCode;
  const entries = Object.entries(votes)
    .sort((a, b) => b[1] - a[1])
    .map(([stateName, count]) => {
      const code = Object.entries(STATE_CODE_TO_NAME)
        .find(([, name]) => name === stateName)?.[0]
        || stateName.toUpperCase().slice(0, 2);
      return { code, name: stateName, votes: count };
    });

  if (entries.length === 0 && stateCode) {
    entries.push({
      code: stateCode,
      name: STATE_CODE_TO_NAME[stateCode] || stateCode,
      votes: 1,
    });
  }
  return entries;
}

function defaultSelectedStates(options) {
  if (options.length === 0) return new Set();
  const topVote = options[0].votes;
  return new Set(options.filter(s => s.votes >= topVote * 0.5).map(s => s.code));
}

export default function CourtSearchCard({ canonicalName, location, onViewResults }) {
  const stateOptions = useMemo(() => buildStateOptions(location), [location]);

  const [selectedStates, setSelectedStates] = useState(() => defaultSelectedStates(stateOptions));
  const [selectedKinds, setSelectedKinds] = useState(() => new Set(['HighCourt', 'District']));
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  if (!canonicalName || stateOptions.length === 0) return null;

  const toggleState = (code) => {
    setSelectedStates(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };

  const toggleKind = (kind) => {
    setSelectedKinds(prev => {
      const next = new Set(prev);
      next.has(kind) ? next.delete(kind) : next.add(kind);
      return next;
    });
  };

  const canSearch = selectedStates.size > 0 && selectedKinds.size > 0 && !searching;

  const handleSearch = async () => {
    if (!canSearch) return;
    setSearching(true);
    setError(null);
    setResults(null);
    try {
      const res = await ecourtsSearch({
        name: canonicalName,
        states: [...selectedStates],
        kinds: [...selectedKinds],
      });
      setResults(res);
    } catch (e) {
      setError(e.message || 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="rounded-lg border border-sap-border bg-sap-surface shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-sap-border flex items-center gap-3">
        <div className="h-7 w-7 rounded bg-sap-accent/10 border border-sap-accent/20 flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5 text-sap-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
          </svg>
        </div>
        <div>
          <h3 className="text-xs font-mono tracking-widest text-sap-dim uppercase font-semibold">Court Records Search</h3>
          <p className="text-xs text-sap-muted">Search eCourts for litigant records</p>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-sap-muted font-semibold">Subject</span>
          <p className="text-sm font-medium text-sap-text mt-0.5">{canonicalName}</p>
        </div>

        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-sap-muted font-semibold mb-1.5 block">States</span>
          <div className="flex flex-wrap gap-2">
            {stateOptions.map(({ code, name }) => {
              const checked = selectedStates.has(code);
              return (
                <label
                  key={code}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-mono cursor-pointer transition-colors ${
                    checked
                      ? 'bg-sap-accent/10 border-sap-accent/30 text-sap-accent'
                      : 'bg-sap-panel border-sap-border text-sap-dim hover:border-sap-accent/20'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleState(code)}
                    className="sr-only"
                  />
                  <span className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${
                    checked ? 'bg-sap-accent border-sap-accent' : 'border-sap-border bg-sap-bg'
                  }`}>
                    {checked && (
                      <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span>{name}</span>
                  <span className="text-[10px] text-sap-muted">{code}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-sap-muted font-semibold mb-1.5 block">Court Type</span>
          <div className="flex gap-2">
            {COURT_KINDS.map(({ key, label }) => {
              const checked = selectedKinds.has(key);
              return (
                <label
                  key={key}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-mono cursor-pointer transition-colors ${
                    checked
                      ? 'bg-sap-accent/10 border-sap-accent/30 text-sap-accent'
                      : 'bg-sap-panel border-sap-border text-sap-dim hover:border-sap-accent/20'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleKind(key)}
                    className="sr-only"
                  />
                  <span className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${
                    checked ? 'bg-sap-accent border-sap-accent' : 'border-sap-border bg-sap-bg'
                  }`}>
                    {checked && (
                      <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSearch}
            disabled={!canSearch}
            className={`px-4 py-2 rounded text-xs font-mono font-semibold uppercase tracking-wider transition-colors ${
              canSearch
                ? 'bg-sap-accent text-white hover:bg-sap-accent/90'
                : 'bg-sap-panel text-sap-muted cursor-not-allowed'
            }`}
          >
            {searching ? (
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Searching...
              </span>
            ) : (
              'Search Courts'
            )}
          </button>
          {selectedStates.size > 0 && (
            <span className="text-[10px] font-mono text-sap-muted">
              {selectedStates.size} {selectedStates.size === 1 ? 'state' : 'states'}, {selectedKinds.size} court {selectedKinds.size === 1 ? 'type' : 'types'}
            </span>
          )}
        </div>

        {error && (
          <div className="rounded border border-entity-drug/30 bg-entity-drug/5 px-3 py-2">
            <p className="text-xs font-mono text-entity-drug">{error}</p>
          </div>
        )}

        {results && <SearchResults results={results} onViewResults={onViewResults} />}
      </div>
    </div>
  );
}

function SearchResults({ results, onViewResults }) {
  const cases = results.results || [];
  const pending = cases.filter(c => c.caseStatus === 'PENDING' || c.case_status === 'PENDING');
  const disposed = cases.filter(c => c.caseStatus === 'DISPOSED' || c.case_status === 'DISPOSED');

  return (
    <div className="rounded border border-sap-border bg-sap-bg/50 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-sap-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${cases.length > 0 ? 'bg-entity-breach' : 'bg-emerald-500'}`} />
          <span className="text-xs font-mono font-semibold text-sap-text">
            {cases.length > 0 ? `${cases.length} case${cases.length !== 1 ? 's' : ''} found` : 'No cases found'}
          </span>
        </div>
        {results._cached && (
          <span className="text-[10px] font-mono text-sap-muted px-1.5 py-0.5 bg-sap-panel rounded">cached</span>
        )}
      </div>

      {cases.length > 0 && (
        <div className="px-4 py-3 space-y-2">
          <div className="flex gap-3 text-xs font-mono">
            {pending.length > 0 && (
              <span className="text-amber-600">{pending.length} pending</span>
            )}
            {disposed.length > 0 && (
              <span className="text-sap-dim">{disposed.length} disposed</span>
            )}
            {results.court_codes_searched && (
              <span className="text-sap-muted">{results.court_codes_searched} courts searched</span>
            )}
          </div>

          <div className="space-y-1">
            {cases.slice(0, 5).map((c, i) => (
              <div key={c.cnr || i} className="flex items-start gap-2 text-xs font-mono">
                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  (c.caseStatus || c.case_status) === 'PENDING'
                    ? 'bg-amber-500/15 text-amber-600'
                    : 'bg-sap-panel text-sap-dim'
                }`}>
                  {(c.caseStatus || c.case_status || 'N/A').slice(0, 4)}
                </span>
                <div className="min-w-0">
                  <span className="text-sap-text">{c.caseType || c.case_type || 'Case'}</span>
                  {c.cnr && <span className="text-sap-muted ml-1.5">{c.cnr}</span>}
                  {(c.courtName || c.court_name) && (
                    <span className="text-sap-muted block truncate">{c.courtName || c.court_name}</span>
                  )}
                </div>
              </div>
            ))}
            {cases.length > 5 && (
              <span className="text-[10px] font-mono text-sap-muted">+{cases.length - 5} more</span>
            )}
          </div>

          {onViewResults && (
            <button
              onClick={() => onViewResults(results)}
              className="mt-1 text-xs font-mono text-sap-accent hover:text-sap-accent/80 underline underline-offset-2 transition-colors"
            >
              View all in eCourts tab
            </button>
          )}
        </div>
      )}
    </div>
  );
}
