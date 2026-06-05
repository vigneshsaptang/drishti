import { useState, lazy, Suspense } from 'react';
import ErrorBoundary from '../components/ErrorBoundary';

const BreachesV2Tab = lazy(() => import('../tabs/BreachesV2Tab'));
const GraphTab = lazy(() => import('../tabs/GraphTab'));

function LazyFallback() {
  return (
    <div className="flex items-center justify-center p-12">
      <div className="h-2 w-2 rounded-full bg-sap-accent animate-pulse" />
      <span className="ml-3 text-xs font-mono text-sap-dim">Loading module...</span>
    </div>
  );
}

export default function EvidenceView({ results, data, loading, onPivot, onFocusEntity, focusedEntity, clearFocusedEntity, hasBreachData }) {
  const [graphExpanded, setGraphExpanded] = useState(false);

  if (!hasBreachData) {
    return (
      <div className="rounded-lg border border-sap-border bg-sap-surface p-8 text-center max-w-lg mx-auto">
        <p className="text-sm text-sap-dim">Name searches use watchlist screening only.</p>
        <p className="text-xs text-sap-muted mt-1">Breach investigation requires a phone or email.</p>
      </div>
    );
  }

  return (
    <div className={`grid gap-px bg-sap-border/50 rounded-lg overflow-hidden border border-sap-border ${
      graphExpanded ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-[3fr_2fr]'
    }`}>
      {/* Left panel: Breach investigation */}
      {!graphExpanded && (
        <div className="bg-sap-surface p-4 overflow-y-auto max-h-[calc(100vh-14rem)]">
          <Suspense fallback={<LazyFallback />}>
            <ErrorBoundary name="BreachesV2Tab">
              <BreachesV2Tab results={results} onPivot={onPivot} loading={loading} onFocusEntity={onFocusEntity} />
            </ErrorBoundary>
          </Suspense>
        </div>
      )}

      {/* Right panel: Relationship graph */}
      <div className="bg-sap-surface p-4 overflow-hidden relative">
        <div className="absolute top-2 right-2 z-10">
          <button
            type="button"
            onClick={() => setGraphExpanded(e => !e)}
            className="px-2 py-1 rounded text-[10px] font-mono border border-sap-border bg-sap-surface text-sap-dim hover:text-sap-text transition-colors"
          >
            {graphExpanded ? 'Split view' : 'Expand graph'}
          </button>
        </div>
        <Suspense fallback={<LazyFallback />}>
          <ErrorBoundary name="GraphTab">
            <GraphTab data={data} onPivot={onPivot} focusedEntity={focusedEntity} onClearFocus={clearFocusedEntity} />
          </ErrorBoundary>
        </Suspense>
      </div>
    </div>
  );
}
