import { HIGHLIGHTS, RELEASE_NAME } from '../content/releases/v1_1_0';

/* global __APP_VERSION__ */
const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.1.0';

// Show the top three highlights — same ordering as the full page.
const TOP_THREE = HIGHLIGHTS.slice(0, 3);

export default function ReleaseTeaserModal({ onViewAll, onDismiss }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-sap-bg/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onDismiss}
      role="presentation"
    >
      <div
        className="relative w-full max-w-md rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_20px_50px_rgba(15,23,42,0.18)] overflow-hidden"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="release-teaser-title"
      >
        {/* Accent strip */}
        <div className="h-0.5 w-full bg-sap-accent" />

        <div className="px-5 py-4 border-b border-sap-border-light flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <img src="/saptang-logo.svg" alt="" className="h-5 w-auto opacity-80" onError={e => e.target.style.display='none'} />
            <h2 id="release-teaser-title" className="text-13 font-semibold tracking-tight text-sap-text">
              Auracle v{VERSION} is here
            </h2>
          </div>
          <span className="text-11 text-sap-muted tabular-nums">New</span>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-13 leading-relaxed text-sap-dim">
            <span className="text-sap-text font-medium">{RELEASE_NAME}.</span>{' '}
            Top three things to look for:
          </p>
          <ul className="space-y-2.5">
            {TOP_THREE.map(item => (
              <li key={item.id} className="flex gap-2.5">
                <span className="mt-0.5 inline-block w-1.5 h-1.5 rounded-full bg-sap-accent shrink-0" />
                <div className="space-y-0.5 min-w-0">
                  <div className="text-12 font-medium text-sap-text leading-snug">{item.title}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="px-5 py-3 border-t border-sap-border-light bg-sap-panel flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="text-12 font-medium text-sap-dim hover:text-sap-text border border-transparent px-2.5 py-1 rounded transition-colors"
          >
            Got it
          </button>
          <button
            type="button"
            onClick={onViewAll}
            className="text-12 font-medium text-white bg-sap-accent hover:bg-sap-accent-glow px-3 py-1 rounded transition-colors"
          >
            See what's new
          </button>
        </div>
      </div>
    </div>
  );
}
