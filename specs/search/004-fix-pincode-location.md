# SPEC: Fix canonicalLocation pincode mapping — Karnataka, Telangana, Haryana, Punjab all wrong

**Worktree**: wt-search
**Priority**: P1 (wrong state shown in profile, wrong court pre-selection)
**Protocol**: Read `/Users/vigneshe/Developer/Pinaca/claude-research/sigint/specs/SPEC_PROTOCOL.md` first
**Summary output**: `/Users/vigneshe/Developer/Pinaca/claude-research/sigint/specs/search/004-fix-pincode-location.summary.md`

## Problem

`canonicalLocation.js`'s `stateFromPincode` function uses a single leading-digit heuristic that produces wrong results for multiple states:

1. **All 5xx pincodes → "Andhra Pradesh"**: Karnataka (56x-58x), Telangana (50x-51x), and actual AP (52x-53x) are all lumped together. A Bangalore pincode (560001) shows as Andhra Pradesh.
2. **1xx range has dead/contradictory branches**: Haryana (12x-13x) and Punjab (14x-16x) return `null` because `prefix >= 10 && prefix <= 14` catches them before the specific state branches.
3. **Tier-2 cities dropped**: `area` and `location` field values are silently discarded if the city isn't in the hardcoded ~80-city `CITY_TO_STATE` lookup. A subject in Hosur, Tiruppur, or Bhilai contributes zero location signal.

## Changes

### File: `frontend/src/lib/canonicalLocation.js`

**Fix 1 — Replace `stateFromPincode` with a proper 2-digit prefix mapping**

Delete the existing `stateFromPincode` function and replace with a 2-digit prefix lookup table. India Post uses the first 2 digits of the pincode to identify the postal circle/state. Here is the correct mapping:

```js
const PINCODE_PREFIX_TO_STATE = {
  11: 'Delhi',
  12: 'Haryana', 13: 'Haryana',
  14: 'Punjab', 15: 'Punjab', 16: 'Punjab',
  17: 'Himachal Pradesh',
  18: 'Jammu & Kashmir', 19: 'Jammu & Kashmir',
  20: 'Uttar Pradesh', 21: 'Uttar Pradesh', 22: 'Uttar Pradesh',
  23: 'Uttar Pradesh', 24: 'Uttar Pradesh', 25: 'Uttar Pradesh',
  26: 'Uttar Pradesh', 27: 'Uttar Pradesh', 28: 'Uttar Pradesh',
  30: 'Rajasthan', 31: 'Rajasthan', 32: 'Rajasthan',
  33: 'Rajasthan', 34: 'Rajasthan',
  36: 'Gujarat', 37: 'Gujarat', 38: 'Gujarat', 39: 'Gujarat',
  40: 'Maharashtra', 41: 'Maharashtra', 42: 'Maharashtra',
  43: 'Maharashtra', 44: 'Maharashtra',
  45: 'Madhya Pradesh', 46: 'Madhya Pradesh', 47: 'Madhya Pradesh', 48: 'Madhya Pradesh',
  49: 'Chhattisgarh',
  50: 'Telangana', 51: 'Telangana',
  52: 'Andhra Pradesh', 53: 'Andhra Pradesh',
  56: 'Karnataka', 57: 'Karnataka', 58: 'Karnataka',
  59: 'Karnataka',
  60: 'Tamil Nadu', 61: 'Tamil Nadu', 62: 'Tamil Nadu', 63: 'Tamil Nadu', 64: 'Tamil Nadu',
  67: 'Kerala', 68: 'Kerala', 69: 'Kerala',
  70: 'West Bengal', 71: 'West Bengal', 72: 'West Bengal', 73: 'West Bengal', 74: 'West Bengal',
  75: 'Odisha', 76: 'Odisha', 77: 'Odisha',
  78: 'Assam', 79: 'Assam',
  80: 'Bihar', 81: 'Bihar', 82: 'Bihar', 83: 'Bihar', 84: 'Bihar', 85: 'Bihar',
  90: 'Manipur', 91: 'Mizoram', 92: 'Tripura',
  93: 'Meghalaya', 94: 'Nagaland', 95: 'Arunachal Pradesh',
  96: 'Sikkim',
  // Union Territories
  10: 'Delhi',
  35: 'Gujarat',  // Daman/Dadra
  65: 'Puducherry',
  66: 'Puducherry',
};

function stateFromPincode(pincode) {
  const n = parseInt(pincode, 10);
  if (isNaN(n) || n < 100000 || n > 999999) return null;
  const prefix = Math.floor(n / 10000);
  return PINCODE_PREFIX_TO_STATE[prefix] || null;
}
```

Note: Some prefix ranges (54-55, 86-89) are unused or military — returning `null` for those is correct.

**Fix 2 — Remove all the dead branches**

Delete the old cascading if/else logic (the `p1`, `prefix === 11`, `prefix >= 10 && prefix <= 14`, `n >= 110000 && n <= 110099` branches). Replace entirely with the clean lookup above.

**Fix 3 — Expand CITY_TO_STATE for tier-2 cities**

Find the `CITY_TO_STATE` object. Add at minimum these commonly-seen tier-2 cities:

```js
// South
'coimbatore': 'Tamil Nadu', 'madurai': 'Tamil Nadu', 'trichy': 'Tamil Nadu',
'tiruchirappalli': 'Tamil Nadu', 'salem': 'Tamil Nadu', 'tiruppur': 'Tamil Nadu',
'vellore': 'Tamil Nadu', 'erode': 'Tamil Nadu',
'mangalore': 'Karnataka', 'mysore': 'Karnataka', 'mysuru': 'Karnataka',
'hubli': 'Karnataka', 'belgaum': 'Karnataka', 'belagavi': 'Karnataka',
'hosur': 'Tamil Nadu', 'shimoga': 'Karnataka',
'thrissur': 'Kerala', 'kollam': 'Kerala', 'kozhikode': 'Kerala', 'calicut': 'Kerala',
'warangal': 'Telangana', 'karimnagar': 'Telangana',
'visakhapatnam': 'Andhra Pradesh', 'vizag': 'Andhra Pradesh',
'vijayawada': 'Andhra Pradesh', 'guntur': 'Andhra Pradesh', 'tirupati': 'Andhra Pradesh',

// North
'agra': 'Uttar Pradesh', 'varanasi': 'Uttar Pradesh', 'meerut': 'Uttar Pradesh',
'allahabad': 'Uttar Pradesh', 'prayagraj': 'Uttar Pradesh',
'bareilly': 'Uttar Pradesh', 'aligarh': 'Uttar Pradesh',
'jalandhar': 'Punjab', 'amritsar': 'Punjab', 'ludhiana': 'Punjab',
'faridabad': 'Haryana', 'gurgaon': 'Haryana', 'gurugram': 'Haryana',
'panipat': 'Haryana', 'karnal': 'Haryana',
'jodhpur': 'Rajasthan', 'udaipur': 'Rajasthan', 'kota': 'Rajasthan',
'ajmer': 'Rajasthan', 'bikaner': 'Rajasthan',
'dehradun': 'Uttarakhand', 'haridwar': 'Uttarakhand',
'shimla': 'Himachal Pradesh', 'dharamsala': 'Himachal Pradesh',

// East
'ranchi': 'Jharkhand', 'jamshedpur': 'Jharkhand', 'dhanbad': 'Jharkhand',
'bhubaneswar': 'Odisha', 'cuttack': 'Odisha', 'rourkela': 'Odisha',
'guwahati': 'Assam', 'siliguri': 'West Bengal', 'durgapur': 'West Bengal',
'patna': 'Bihar', 'muzaffarpur': 'Bihar', 'gaya': 'Bihar',

// Central/West
'indore': 'Madhya Pradesh', 'bhopal': 'Madhya Pradesh', 'gwalior': 'Madhya Pradesh',
'jabalpur': 'Madhya Pradesh', 'ujjain': 'Madhya Pradesh',
'raipur': 'Chhattisgarh', 'bhilai': 'Chhattisgarh', 'bilaspur': 'Chhattisgarh',
'nashik': 'Maharashtra', 'aurangabad': 'Maharashtra', 'nagpur': 'Maharashtra',
'solapur': 'Maharashtra', 'kolhapur': 'Maharashtra',
'surat': 'Gujarat', 'vadodara': 'Gujarat', 'rajkot': 'Gujarat',
'bhavnagar': 'Gujarat', 'gandhinagar': 'Gujarat',
```

Keep duplicates for alternate spellings (mysore/mysuru, gurgaon/gurugram, allahabad/prayagraj, calicut/kozhikode, vizag/visakhapatnam).

**Fix 4 — Stop silently dropping `area`/`location` values not in CITY_TO_STATE**

Find the section (around line 260-265) where `area` and `location` field values are skipped if not in `CITY_TO_STATE`:
```js
if ((key === 'area' || key === 'location') && !CITY_TO_STATE[normalized.toLowerCase()]) continue;
```

Change the logic: if the value is not in `CITY_TO_STATE`, still include it as a location signal but without the state resolution. Don't silently discard it:
```js
if (key === 'area' || key === 'location') {
  const state = CITY_TO_STATE[normalized.toLowerCase()];
  if (state) {
    // existing state-resolution logic
  }
  // But always fall through to include the value as a location data point
  // Don't `continue` here
}
```

## Must NOT touch

- `backend/app/*` — no backend changes
- `frontend/src/components/SubjectProfile.jsx` — the profile card consumes canonicalLocation, don't change how it reads the output
- `frontend/src/lib/canonicalIdentity.js` — separate spec (003)

## Acceptance criteria

1. `stateFromPincode(560001)` returns `'Karnataka'` (not Andhra Pradesh)
2. `stateFromPincode(500001)` returns `'Telangana'` (not Andhra Pradesh)
3. `stateFromPincode(520001)` returns `'Andhra Pradesh'`
4. `stateFromPincode(131001)` returns `'Haryana'` (not null)
5. `stateFromPincode(141001)` returns `'Punjab'` (not null)
6. `stateFromPincode(110001)` returns `'Delhi'`
7. No dead/unreachable branches remain in `stateFromPincode`
8. `CITY_TO_STATE` includes at minimum: Coimbatore, Mangalore, Mysore, Hosur, Warangal, Faridabad, Gurgaon, Ranchi, Indore, Raipur, Bhilai
9. `area`/`location` field values for tier-2 cities are no longer silently dropped
10. `npm run lint` passes
11. `npm run build` succeeds

## Report back

Write summary to the path in "Summary output" above.
