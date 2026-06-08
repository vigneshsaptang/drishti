import {
  RELEASE_VERSION,
  RELEASE_NAME,
  RELEASE_DATE,
  RELEASE_TAGLINE,
  HIGHLIGHTS,
  CategoryChip,
} from '../content/releases/v1_1_0';

/* global __APP_VERSION__ */
const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : RELEASE_VERSION;

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

function HighlightCard({ item }) {
  return (
    <article className="rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-sap-border-light flex items-center justify-between gap-3">
        <h3 className="text-13 font-semibold tracking-tight text-sap-text">{item.title}</h3>
        <CategoryChip name={item.category} />
      </div>
      <div className="px-4 py-3 space-y-3">
        <p className="text-13 leading-relaxed text-sap-dim">{item.body}</p>
        {item.metric && (
          <dl className="grid grid-cols-2 gap-2 rounded border border-sap-border-light bg-sap-panel px-3 py-2">
            <div>
              <dt className="text-11 text-sap-muted">{item.metric.label} — before</dt>
              <dd className="text-13 text-sap-danger tabular-nums">{item.metric.before}</dd>
            </div>
            <div>
              <dt className="text-11 text-sap-muted">{item.metric.label} — after</dt>
              <dd className="text-13 text-sap-success tabular-nums">{item.metric.after}</dd>
            </div>
          </dl>
        )}
      </div>
    </article>
  );
}

export default function WhatsNewView({ onClose }) {
  return (
    <div className="fixed inset-0 z-40 bg-sap-bg/95 backdrop-blur-sm overflow-y-auto">
      <div className="min-h-full flex flex-col">
        {/* Header bar */}
        <div className="shrink-0 border-b border-sap-border bg-sap-surface px-5 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/saptang-logo.svg" alt="" className="h-5 w-auto opacity-80" onError={e => e.target.style.display='none'} />
            <div className="h-4 w-px bg-sap-border" />
            <h1 className="flex items-baseline gap-1.5">
              <span className="text-13 font-semibold tracking-tight text-sap-text">What's new</span>
              <span className="text-11 text-sap-muted">Auracle by Saptang Labs</span>
            </h1>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sap-dim hover:text-sap-accent text-12 font-medium border border-sap-border rounded px-2.5 py-1 transition-colors"
          >
            Close
          </button>
        </div>

        {/* Hero */}
        <section className="px-5 sm:px-8 pt-8 pb-6 max-w-5xl mx-auto w-full">
          <div className="rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
            <div className="px-6 py-6 sm:px-8 sm:py-8 space-y-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-sap-accent text-white text-11 font-semibold tracking-tight tabular-nums">
                  v{VERSION}
                </span>
                <span className="text-11 text-sap-muted">{formatDate(RELEASE_DATE)}</span>
              </div>
              <h2 className="text-26 font-semibold tracking-tight text-sap-text leading-tight">
                {RELEASE_NAME}
              </h2>
              <p className="text-14 leading-relaxed text-sap-dim max-w-3xl">
                {RELEASE_TAGLINE}
              </p>
            </div>
          </div>
        </section>

        {/* Highlights grid */}
        <section className="px-5 sm:px-8 pb-12 max-w-5xl mx-auto w-full">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-12 font-semibold tracking-tight text-sap-text">
              Highlights
            </h3>
            <span className="text-11 text-sap-muted">
              {HIGHLIGHTS.length} changes worth knowing about
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {HIGHLIGHTS.map(item => (
              <HighlightCard key={item.id} item={item} />
            ))}
          </div>

          <p className="mt-8 text-11 text-sap-muted">
            For the full list of every commit in this release, see{' '}
            <span className="text-sap-dim">CHANGELOG.md</span> at the repository root.
          </p>
        </section>
      </div>
    </div>
  );
}
