/* eslint-disable react-refresh/only-export-components */
// Release content for v1.1.0. Kept as a pure data + small JSX module so
// the WhatsNewView can render it and the ReleaseTeaserModal can pluck the top
// three highlights from the same source.

export const RELEASE_VERSION = '1.1.0';
export const RELEASE_NAME = 'Linear pass + investigator-named search';
export const RELEASE_DATE = '2026-06-08';
export const RELEASE_TAGLINE =
  'A disciplined design system, investigator-named subject screening, and ' +
  'classification moved server-side so the report is a single coherent view ' +
  'of one set of facts.';

// Ordered by "what we'd show a stakeholder first". The first three are also
// what the first-session teaser modal surfaces.
export const HIGHLIGHTS = [
  {
    id: 'investigator-subject',
    category: 'Search',
    title: 'Name the subject up-front, kill the namesake noise',
    body:
      'The Command Bar now has a Name details panel: First, Middle, Last, ' +
      'Initials / DOB. When filled, screening locks onto the named subject ' +
      'plus its spelling variants. Searches that previously screened ten ' +
      'unrelated namesakes and timed out now return one focused result in ' +
      'seconds.',
    metric: { label: 'FTI screen time on the test phone', before: '~60s (timeout)', after: '494ms' },
  },
  {
    id: 'design-system',
    category: 'Design',
    title: 'Linear-style system across every redesigned surface',
    body:
      'Login, CommandBar, TabStrip, Report, Evidence, Tools, and Header ' +
      'now share one type scale and the sap-* palette. No more eleven ' +
      'arbitrary text sizes, six amber shades, or monospace on prose.',
    metric: null,
  },
  {
    id: 'provenance',
    category: 'Trust',
    title: 'Saptang Labs Intelligence provenance on every chip',
    body:
      'Every identifier renders with a provenance tooltip naming the ' +
      'capability that surfaced it: "Breach records", "Watchlist", ' +
      '"Court records". Never the internal engine codename. Graph nodes ' +
      'carry the same branding.',
    metric: null,
  },
  {
    id: 'variant-screening',
    category: 'Search',
    title: 'Smart name-variant matcher with DOB compatibility',
    body:
      'Tiered Levenshtein + first-name rules catch "Anjali Mehta" / ' +
      '"A. Mehta" / "Anjalimehta" as the same person. DOB filtering ' +
      'enforces ±2-year compatibility when investigator provides a date.',
    metric: null,
  },
  {
    id: 'backend-classification',
    category: 'Architecture',
    title: 'Classification moved out of the browser',
    body:
      'Identifier categorization, India geo resolution (with pincode → ' +
      'locality), and canonical-name inference are now backend-owned. ' +
      'The report is a renderer of one source of truth rather than a ' +
      'set of components each re-deriving its own.',
    metric: null,
  },
  {
    id: 'anchor-canonical',
    category: 'Search',
    title: 'Anchor-based canonical name when no subject is provided',
    body:
      'When the investigator does not name a subject, canonical is picked ' +
      'by token overlap with email local-parts and usernames, not by ' +
      'whichever name happened to be first in the array.',
    metric: null,
  },
  {
    id: 'report-flow',
    category: 'Report',
    title: 'Risk promoted to the hero panel; profile arrives first',
    body:
      'Subject profile now ships the moment breach BFS finishes. The ' +
      'report no longer waits for FTI/financial/darkweb to draw an ' +
      'identity. Risk panel moved to the top of the report flow.',
    metric: null,
  },
  {
    id: 'audit',
    category: 'Operations',
    title: 'Audit log now records v3 search fields',
    body:
      'Every search records canonical_source (investigator vs inferred), ' +
      'variants_screened, dob_enforced, and noise_dropped, the measurement ' +
      'surface we needed to track how the investigator override is being ' +
      'used.',
    metric: null,
  },
  {
    id: 'quality',
    category: 'Quality',
    title: 'Top-3 cap on namesake screening prevents silent timeouts',
    body:
      'Without an investigator subject, the inferred path used to screen ' +
      'ten candidates and routinely bust the 60s wall, quietly returning ' +
      'zero. The cap is now three, ordered for stability, so the ' +
      'no-investigator path still produces real results.',
    metric: null,
  },
];

export const CATEGORY_TONE = {
  Search: 'text-sap-accent border-sap-accent/30 bg-sap-accent/10',
  Design: 'text-sap-success border-sap-success/30 bg-sap-success-soft',
  Trust: 'text-sap-warning border-sap-warning/30 bg-sap-warning-soft',
  Architecture: 'text-sap-dim border-sap-border bg-sap-panel',
  Report: 'text-sap-accent border-sap-accent/30 bg-sap-accent/10',
  Operations: 'text-sap-dim border-sap-border bg-sap-panel',
  Quality: 'text-sap-success border-sap-success/30 bg-sap-success-soft',
};

export function CategoryChip({ name }) {
  const tone = CATEGORY_TONE[name] || CATEGORY_TONE.Architecture;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-11 font-medium ${tone}`}>
      {name}
    </span>
  );
}
