import { useState } from 'react';

export default function OnionLink({ url, className = '' }) {
  const [copied, setCopied] = useState(false);

  if (!url) return null;
  const str = String(url);
  if (!str.includes('.onion')) return null;

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(str).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] text-sap-muted group ${className}`}>
      <span className="shrink-0">🧅</span>
      <span className="break-all select-all">{str}</span>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-0.5 rounded bg-sap-panel border border-sap-border text-[10px] text-sap-dim hover:text-sap-text"
        title="Copy onion link"
      >
        {copied ? '✓' : 'Copy'}
      </button>
    </span>
  );
}
