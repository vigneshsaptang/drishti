# Summary: Fix canonical identity — stop usernames/email-parts corrupting the profile name

## Status: PARTIAL

## Changes made
- `frontend/src/lib/canonicalIdentity.js`: Tiered input selection — real names from breach records are strongly preferred; usernames and email local-parts only used when zero names found. Added `source` field (`'name'` or `'inferred'`) to all return paths (empty, early-exit, and main). Early-exit fallback now prefers the names pool via `nameFallback` before falling back to longest input.
- `frontend/src/lib/identifierExtract.js`: Username regex anchored with `^...$` and aligned with SubjectProfile's CATEGORIES pattern — now matches `user_?name`, `nick(?:name)?`, `screen_?name`, `handle`, `login(?:name)?`, `user_?id`, `username_?2`. No longer matches substrings like `login_timestamp`.
- `frontend/src/components/SubjectProfile.jsx`: Accepts optional `canonical` prop from App.jsx (falls back to internal computation until HANDOFF applied). When `canonical.source === 'inferred'`, the banner renders with italic medium-weight text in `text-sap-dim` and a `(inferred)` label, clearly distinguishing it from confirmed name identities.

## Acceptance criteria
- [x] criteria 1 — Email-only search: banner shows raw email local-part with "(inferred)" label, not a title-cased manufactured name. Verified: `john.doe123@gmail.com` → canonical `"john.doe123"` with `source: 'inferred'`
- [x] criteria 2 — Phone search with names + usernames: banner shows real name. Verified: names `["Saikrishna BVS", "Saikrishna Budamgunta", ...]` with usernames `["saikrishna1234", ...]` → canonical `"Saikrishna Budamgunta"` with `source: 'name'`
- [ ] criteria 3 — SubjectProfile uses canonical prop from App.jsx: **PARTIAL** — SubjectProfile accepts and prefers the `canonical` prop, but falls back to internal computation until App.jsx HANDOFF is applied
- [x] criteria 4 — identifierExtract.js username regex anchored and aligned: `^(user_?name|username|nick(?:name)?|screen_?name|handle|login(?:name)?|user_?id|username_?2)$/i`
- [x] criteria 5 — `source` field present in canonical identity return value: all three return paths include `source: 'name' | 'inferred'`
- [x] criteria 6 — `npm run lint` passes: 0 errors in changed files
- [x] criteria 7 — `npm run build` succeeds: built in 184ms

## HANDOFF items (for orchestrator to apply)

### App.jsx

**Fix 5 — Pass canonical as prop to SubjectProfile (line ~205)**

```jsx
// BEFORE:
<SubjectProfile results={results} loading={loading} onFocusEntity={handleFocusEntity} onSwitchTab={setActiveTab} aiSummary={aiSummary} />

// AFTER:
<SubjectProfile results={results} loading={loading} onFocusEntity={handleFocusEntity} onSwitchTab={setActiveTab} aiSummary={aiSummary} canonical={canonical} />
```

Once this prop is wired, SubjectProfile will use the same canonical computation as the FTI watchlist filter, eliminating the divergence. The internal fallback computation in SubjectProfile can then be removed in a follow-up.

## Notes
- All 5 built-in `__test_cases__` in canonicalIdentity.js pass after the change.
- The tiered approach means usernames like `"saikrishna1234"` can never outrank a real name like `"Saikrishna Budamgunta"` regardless of frequency — they're in separate pools and the names pool always wins when non-empty.
- The `(inferred)` indicator uses italic + lighter text (`text-sap-dim`) plus a mono-font label, making it visually distinct without being alarming.
- `reportGenerator.js` still computes canonical independently (spec notes this is intentional — future spec will align it).
