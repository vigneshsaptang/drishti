# Changelog

All notable changes to Auracle by Saptang Labs are recorded here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-06-08

The first cohesive product release: Linear-style visual system, investigator-named
subject UX, branded provenance, and backend-owned classification. Graduates the
`design-experiment` line into a tagged release.

### Added
- **Linear-style design system** applied end-to-end (Login, CommandBar, TabStrip,
  Report, Evidence, Tools, Header) — disciplined type scale, sap-* palette, card
  chrome pattern.
- **Investigator-named subject (search v3)** — CommandBar opens a Name details
  panel (First / Middle / Last / Initials / DOB) that overrides canonical-name
  inference and screens only the named subject + spelling variants.
- **Saptang Labs Intelligence provenance** — backend now emits per-value source
  metadata; every identifier chip is wrapped in a `<Provenance>` tooltip; graph
  nodes carry the same branded capability sub-labels.
- **Smart name-variant screening** — tiered Levenshtein matcher + DOB ±2
  compatibility filter (`backend/app/engines/name_match.py`).
- **Anchor-based canonical name inference** — when no investigator subject is
  given, canonical is picked by token overlap with email local-parts and
  usernames (not by `names[0]` order).
- **Backend India geo dataset + pincode lookup** —
  `engines/data/india_geo_*.json` built by `scripts/build_india_geo.py`,
  resolves state / district / city / locality from pincode votes.
- **Backend identifier categorizer** — moves names / emails / phones / usernames /
  IPs / locations / accounts / financial / devices / dob classification from JS
  into `engines/identifier_categorizer.py`, with per-value source tracking.
- **Crypto wallet list** at Tools → Financial → Crypto (was just an input).
- **What's New page** at `/whats-new`; Header version chip with a first-session
  release modal.
- **v3 audit fields** on `audit_service.log_search`: `canonical_source`,
  `variants_screened`, `dob_enforced`, `noise_dropped`.
- **`/api/health` now reports `version`**, read from `sigint/VERSION` as the
  single source of truth.

### Changed
- Brand mark and chrome: "Auracle by Saptang Labs", `saptang-logo.svg` favicon,
  tab title aligned.
- **Subject panel split** into "Confirmed subject" and "Other names found in
  records" (chips rendered as a wrap-row, not stacked rows).
- AI summary lead sentence uses `canonical_name`; FTI counts are
  canonical-filtered.
- **Linked identifiers card removed** from the Report (redundant with the
  Subject profile grid).
- **Investigation summary removed** from the Evidence tab — Evidence is now
  graph-only.
- Report flow: risk promoted to the hero panel; subject profile emitted early
  (before screening engines run).
- Tools tab: dropped Dark Web Lookup, Social Intel, and Drug Markets sub-tabs.
- Loading state: NeuralLoader iterations → final simple progress card.
- **`_extract_fullnames` capped at top-3** (was 10) on the no-investigator path —
  mitigates the FTI Mongo `MaxTimeMSExpired` failure mode that silently zeroed
  out screening results on slow searches.
- `frontend/src/lib/breach.js` color tokens migrated from raw Tailwind shades to
  the `sap-*` palette.
- Dead `frontend/src/tabs/BreachesV2Tab.jsx` removed.

### Fixed
- "Subject confirmed" banner now correctly picks the investigator path
  (`canonical_source` threaded through the `summary` event).
- Risk scorer crash when the world-check field arrived as a list.
- Linked-identifiers extract: tighter username / name / email validators.
- Alerts: canonical-name token filter applied in `deriveAlerts`.
- AI summary: canonical location + canonical-filtered FTI counts.
- Subject chips: font mix on Financial / Accounts (per-value `font-mono` only on
  identifier values).
- Subject chip selected-state contrast (text was the same colour as background).
- Search stream: stream-ended error suppressed when the underlying failure was a
  401.
- NeuralLoader converge timer cancellation race.
- Stale `text-xs` / `text-sm` in `App.jsx` (LazyFallback + error panel) replaced
  with design-system tokens.
- Timeout-fallback `fti:complete` payload now defaults `variants_screened: []`
  and `dob_enforced: false` instead of leaking `null`.

## [1.0-alpha] — earlier

Pre-release snapshot of the Auracle platform — single-tenant auth, v1 + v2
search orchestrators, CREDMON / DARKMON / FTI engines, eCourts and MCA routes.
See `git log v1.0-alpha` for the full history.
