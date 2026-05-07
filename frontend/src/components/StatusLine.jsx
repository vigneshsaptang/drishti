import { useState, useEffect } from 'react';
import { STATUS_MESSAGES } from '../lib/utils';

export default function StatusLine({ visible, results, searchMeta }) {
  const [fallbackIdx, setFallbackIdx] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setFallbackIdx(0);
    const timer = setInterval(() => setFallbackIdx(i => (i + 1) % STATUS_MESSAGES.length), 1800);
    return () => clearInterval(timer);
  }, [visible]);

  const hasResults = results && results.length > 0;
  const done = hasResults && !visible;

  if (!visible && !done) return null;

  if (visible) {
    const progress = ((fallbackIdx + 1) / STATUS_MESSAGES.length) * 100;
    return (
      <div className="relative h-6 rounded-full overflow-hidden bg-sap-panel border border-sap-border/50">
        <div
          className="absolute inset-y-0 left-0 bg-sap-accent/10 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${progress}%` }}
        />
        <div className="absolute inset-y-0 left-0 w-full flex items-center px-3 gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-sap-accent shadow-[0_0_6px_#2563eb] animate-pulse shrink-0" />
          <span className="text-[11px] font-mono text-sap-dim truncate">{STATUS_MESSAGES[fallbackIdx]}</span>
        </div>
      </div>
    );
  }

  // Completion state
  const totalSearched = searchMeta?.total_entities_searched ?? results.length;
  const totalFound = searchMeta?.total_found ?? results.filter(r => r.found).length;
  const totalTime = searchMeta?.total_time_ms ?? null;
  let sourceCount = 0;
  results.forEach(r => { sourceCount += (r.sources || []).length; });

  return (
    <div className="relative h-6 rounded-full overflow-hidden bg-sap-panel border border-sap-border/50">
      <div className="absolute inset-y-0 left-0 bg-emerald-500/8 rounded-full w-full" />
      <div className="absolute inset-y-0 left-0 w-full flex items-center px-3 gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
        <span className="text-[11px] font-mono text-sap-dim truncate">
          Traced {totalSearched} entities across {sourceCount} breach sources — {totalFound} returned data{totalTime != null && <> in {(totalTime / 1000).toFixed(1)}s</>}
        </span>
      </div>
    </div>
  );
}
