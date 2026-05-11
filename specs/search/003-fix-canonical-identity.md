# SPEC: Fix canonical identity — stop usernames/email-parts corrupting the profile name

**Worktree**: wt-search
**Priority**: P0 (critical — wrong name displayed as confirmed identity)
**Protocol**: Read `/Users/vigneshe/Developer/Pinaca/claude-research/sigint/specs/SPEC_PROTOCOL.md` first
**Summary output**: `/Users/vigneshe/Developer/Pinaca/claude-research/sigint/specs/search/003-fix-canonical-identity.summary.md`

## Problem

The canonical identity system has two critical flaws:

1. **Username/email pollution**: `canonicalIdentity.js` merges real names, breach usernames, and email local-parts into one flat pool with equal weight. A breach username like `"saikrishna1234"` seen in 10 records beats a real name seen in 5 records and becomes the "Identified Subject" banner. Email-only searches manufacture a title-cased name from the local-part (e.g., `"john.doe123"` → `"John Doe123"`) and present it as confirmed.

2. **Triple computation divergence**: The canonical identity is computed independently in three places — `App.jsx` (for FTI filter tokens), `SubjectProfile.jsx` (for the banner), and `reportGenerator.js` (for exports). Each uses slightly different input extraction, so the profile banner and FTI filter can show different names for the same search.

## Changes

### File: `frontend/src/lib/canonicalIdentity.js`

**Fix 1 — Prioritize real names over usernames and email-parts**

Find the section where `rawInputs` is built (around line 52-56):
```js
rawInputs = [...names, ...usernames, ...emails.map(e => e.split('@')[0])]
```

Replace with a tiered approach. Real names should be strongly preferred:

```js
// Tier 1: real names from breach records (highest priority)
const nameInputs = names.filter(n => n && n.length > 1);

// Tier 2: usernames and email local-parts (only used if no real names found)
const fallbackInputs = [
  ...usernames.filter(u => u && u.length > 1),
  ...emails.map(e => e.split('@')[0]).filter(lp => lp && lp.length > 1),
];

// Use names if we have any; fall back to usernames/emails only if zero names
const rawInputs = nameInputs.length > 0 ? nameInputs : fallbackInputs;
```

**Fix 2 — Don't title-case manufactured names from email local-parts**

Find the fallback path (around line 104-109 and 158-163) where single-input or low-frequency results are title-cased. When the winning canonical came from the fallback pool (usernames/email-parts, not real names), mark it clearly:

In the return object, add a `source` field:
```js
return {
  canonical: ...,
  anchor: ...,
  confidence: ...,
  source: nameInputs.length > 0 ? 'name' : 'inferred',  // ← ADD THIS
};
```

This lets SubjectProfile show a visual indicator when the identity is inferred rather than confirmed.

**Fix 3 — Longest-string fallback should prefer names pool**

Find the fallback at around line 104-109:
```js
const fallback = inputs.reduce((a, b) => (b.length > a.length ? b : a), inputs[0]);
```

Change to prefer names over other inputs:
```js
const nameFallback = nameInputs.length > 0
  ? nameInputs.reduce((a, b) => (b.length > a.length ? b : a), nameInputs[0])
  : null;
const fallback = nameFallback || inputs.reduce((a, b) => (b.length > a.length ? b : a), inputs[0]);
```

### File: `frontend/src/lib/identifierExtract.js`

**Fix 4 — Align username regex with SubjectProfile**

Find the username field pattern (around line 33):
```js
/username|user_?name|login|nickname|screen_?name|handle/i
```

This is unanchored and matches substrings like `login_timestamp`. Add anchoring and include `user_id` and `username_2` to match SubjectProfile's pattern:
```js
/^(user_?name|username|nick(?:name)?|screen_?name|handle|login(?:name)?|user_?id|username_?2)$/i
```

### File: `frontend/src/App.jsx`

**Fix 5 — Single canonical computation, passed as prop**

Find where `chooseCanonicalIdentity` is called (around line 109-116). This computation should be the SINGLE source of truth. The result should be passed as a prop to `SubjectProfile`:

Find where `SubjectProfile` is rendered (around line 205-206) and add the canonical as a prop:
```jsx
<SubjectProfile
  results={results}
  canonical={canonical}          // ← ADD THIS PROP
  onPivot={handlePivot}
  // ... other existing props
/>
```

### File: `frontend/src/components/SubjectProfile.jsx`

**Fix 6 — Use the canonical prop instead of recomputing**

Find where SubjectProfile internally calls `chooseCanonicalIdentity` (around line 278-285). Remove that internal call and use the `canonical` prop passed from App.jsx instead:

```js
// REMOVE: const canonical = chooseCanonicalIdentity({ names: profile.names, ... });
// USE: const canonical = props.canonical;
```

Keep the `extractProfile()` call for building the profile grid (locations, emails, phones display) — just stop using it for identity resolution.

If the `canonical.source === 'inferred'`, show a subtle indicator in the banner (e.g., lighter text, italic, or a small "(inferred)" label) so the operator knows the identity wasn't confirmed by name records.

## Must NOT touch

- `backend/app/*` — no backend changes needed
- `frontend/src/lib/reportGenerator.js` — update it to use the same canonical prop pattern in a future spec. For now it's only used for exports and can tolerate the old behavior
- `frontend/src/tabs/*` — no tab changes needed

## Acceptance criteria

1. Search for an email address where breach records contain usernames but no real names → banner shows the email (or "(inferred)"), NOT a title-cased local-part
2. Search for a phone number where breach records contain both usernames and real names → banner shows the real name, NOT a username
3. `SubjectProfile` uses the canonical prop from App.jsx, not its own computation
4. `identifierExtract.js` username regex is anchored and aligned with SubjectProfile's pattern
5. The `source` field is present in the canonical identity return value ('name' or 'inferred')
6. `npm run lint` passes
7. `npm run build` succeeds

## Report back

Write summary to the path in "Summary output" above.
