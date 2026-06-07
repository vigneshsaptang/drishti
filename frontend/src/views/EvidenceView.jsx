import { lazy, Suspense } from 'react';
import ErrorBoundary from '../components/ErrorBoundary';

const GraphTab = lazy(() => import('../tabs/GraphTab'));

function LazyFallback() {
  return (
    <div className="flex items-center justify-center p-12">
      <div className="h-2 w-2 rounded-full bg-sap-accent animate-pulse" />
      <span className="ml-3 text-12 text-sap-dim">Loading module…</span>
    </div>
  );
}

export default function EvidenceView({ data, onPivot, focusedEntity, clearFocusedEntity, hasBreachData }) {
  if (!hasBreachData) {
    return (
      <div className="rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-8 text-center max-w-lg mx-auto">
        <p className="text-13 text-sap-dim">Name searches use watchlist screening only.</p>
        <p className="text-12 text-sap-muted mt-1">Breach investigation requires a phone or email.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
      <div className="p-4">
        <Suspense fallback={<LazyFallback />}>
          <ErrorBoundary name="GraphTab">
            <GraphTab data={data} onPivot={onPivot} focusedEntity={focusedEntity} onClearFocus={clearFocusedEntity} />
          </ErrorBoundary>
        </Suspense>
      </div>
    </div>
  );
}
