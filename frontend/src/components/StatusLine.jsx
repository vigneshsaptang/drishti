import { useState, useEffect } from 'react';
import { STATUS_MESSAGES } from '../lib/utils';

export default function StatusLine({ visible, message }) {
  const [fallbackIdx, setFallbackIdx] = useState(0);

  useEffect(() => {
    if (!visible || message) return;
    const timer = setInterval(() => setFallbackIdx(i => (i + 1) % STATUS_MESSAGES.length), 1800);
    return () => clearInterval(timer);
  }, [visible, message]);

  if (!visible) return null;

  const displayMessage = message || STATUS_MESSAGES[fallbackIdx];

  return (
    <div className="rounded-lg border border-sap-accent/20 bg-sap-accent/5 px-4 py-2.5">
      <p className="text-sm font-mono text-sap-accent animate-scan flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-full bg-sap-accent shrink-0 shadow-[0_0_6px_#2563eb] animate-pulse" />
        {displayMessage}
      </p>
    </div>
  );
}
