# Summary: Fix canonicalLocation pincode mapping — Karnataka, Telangana, Haryana, Punjab all wrong

## Status: DONE

## Changes made
- `frontend/src/lib/canonicalLocation.js`:
  - Replaced broken `stateFromPincode` (cascading if/else with dead branches) with a clean `PINCODE_PREFIX_TO_STATE` lookup table keyed by 2-digit prefix. Covers all Indian postal circles including union territories.
  - Added 13 missing tier-2 cities to `CITY_TO_STATE`: hosur, shimoga/shivamogga, kollam, aligarh, dharamsala, haridwar, rourkela, bhilai, bilaspur, kolhapur, bhavnagar.
  - Removed the `continue` that silently dropped `area`/`location` field values not in `CITY_TO_STATE`. All location-keyed values now contribute as district/city data points regardless of whether they're in the lookup table.
  - Updated `cross-state-city-conflict` test expectation: `district: 'Adyar'` (2 votes) is correct over `'Chennai'` (1 vote). The key assertion — state=Tamil Nadu, not Delhi — still holds.

## Acceptance criteria
- [x] criteria 1 — `stateFromPincode(560001)` returns `'Karnataka'` — passed
- [x] criteria 2 — `stateFromPincode(500001)` returns `'Telangana'` — passed
- [x] criteria 3 — `stateFromPincode(520001)` returns `'Andhra Pradesh'` — passed
- [x] criteria 4 — `stateFromPincode(131001)` returns `'Haryana'` — passed
- [x] criteria 5 — `stateFromPincode(141001)` returns `'Punjab'` — passed
- [x] criteria 6 — `stateFromPincode(110001)` returns `'Delhi'` — passed
- [x] criteria 7 — No dead/unreachable branches: the old cascading if/else is completely replaced by a single table lookup
- [x] criteria 8 — CITY_TO_STATE includes all specified cities: Coimbatore, Mangalore, Mysore, Hosur, Warangal, Faridabad, Gurgaon, Ranchi, Indore, Raipur, Bhilai (plus shimoga, kollam, aligarh, dharamsala, haridwar, rourkela, bilaspur, kolhapur, bhavnagar)
- [x] criteria 9 — area/location field values no longer silently dropped: verified `location: 'Adyar'` (not in CITY_TO_STATE) now resolves as district
- [x] criteria 10 — `npm run lint` passes: 0 errors
- [x] criteria 11 — `npm run build` succeeds: built in 198ms

## HANDOFF items (for orchestrator to apply)
None — all changes in owned files.

## Notes
- The old `cross-state-city-conflict` test expected `district: 'Chennai'` but Adyar appears in 2 records vs Chennai in 1, so Adyar correctly wins the vote. Updated expectation to `district: 'Adyar'`. The test's real purpose (state = Tamil Nadu, not Delhi) is preserved.
- Pincode prefixes 54-55 (unused), 86-89 (army/unassigned) correctly return `null`.
- Built-in test suite: 6/6 pass.
