import { useState, lazy, Suspense } from 'react';
import ErrorBoundary from '../components/ErrorBoundary';

const EcourtsTab = lazy(() => import('../tabs/EcourtsTab'));
const FinancialTab = lazy(() => import('../tabs/FinancialTab'));

const TOOL_TABS = [
  { id: 'courts',    label: 'Courts' },
  { id: 'financial', label: 'Financial' },
];

function LazyFallback() {
  return (
    <div className="flex items-center justify-center p-12">
      <div className="h-2 w-2 rounded-full bg-sap-accent animate-pulse" />
      <span className="ml-3 text-12 text-sap-dim">Loading module…</span>
    </div>
  );
}

export default function ToolsView({ financialResults, financialMeta }) {
  const [activeTool, setActiveTool] = useState('courts');

  return (
    <div className="space-y-3">
      {/* Sub-tab navigation */}
      <div className="flex items-stretch h-8 border-b border-sap-border-light overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {TOOL_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTool(tab.id)}
            className={`px-3 text-12 font-medium tracking-tight whitespace-nowrap outline-none transition-colors -mb-px border-b-2 ${
              activeTool === tab.id
                ? 'border-sap-accent text-sap-accent'
                : 'border-transparent text-sap-dim hover:text-sap-text cursor-pointer'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tool content */}
      <ErrorBoundary name={activeTool}>
        <Suspense fallback={<LazyFallback />}>
          {activeTool === 'courts' && <EcourtsTab />}
          {activeTool === 'financial' && <FinancialTab financialResults={financialResults} financialMeta={financialMeta} />}
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
