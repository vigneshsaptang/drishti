export default function DashboardIdle() {
  return (
    <div className="flex justify-center pt-16 pb-8 px-4">
      <div className="flex flex-col items-center gap-4 w-full max-w-[500px]">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-sap-muted">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <circle cx="12" cy="11" r="3" />
        </svg>
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-lg font-medium text-sap-dim">
            Enter an identifier to begin
            <span aria-hidden className="inline-block ml-1 -mb-0.5 w-[2px] h-[1.05em] align-baseline bg-sap-accent animate-blink-cursor" />
          </p>
          <p className="text-sm text-sap-muted">Search across breach databases, watchlists, dark web forums, and court records</p>
        </div>
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
          {['Phone number', 'Email address', 'Full name', 'Username'].map((label, i, arr) => (
            <span key={label} className="flex items-center gap-3">
              <span className="text-xs font-mono text-sap-muted">{label}</span>
              {i < arr.length - 1 && <span className="text-xs text-sap-border">&middot;</span>}
            </span>
          ))}
        </div>
        <p className="text-xs font-mono text-sap-muted mt-2">
          Press{' '}
          <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-mono text-sap-dim border border-sap-border bg-sap-bg">/</kbd>
          {' '}to focus search
        </p>
      </div>
    </div>
  );
}
