// canonicalLocation.js — dominant-vote location resolution from messy breach records, no dependencies

const STATE_ABBREV = {
  tn: 'Tamil Nadu', ap: 'Andhra Pradesh', ts: 'Telangana', pb: 'Punjab',
  ka: 'Karnataka', mh: 'Maharashtra', dl: 'Delhi', up: 'Uttar Pradesh',
  rj: 'Rajasthan', gj: 'Gujarat', mp: 'Madhya Pradesh', wb: 'West Bengal',
  kl: 'Kerala', hr: 'Haryana', br: 'Bihar', jh: 'Jharkhand',
  or: 'Odisha', od: 'Odisha', as: 'Assam', uk: 'Uttarakhand',
  hp: 'Himachal Pradesh', ga: 'Goa', jk: 'Jammu and Kashmir',
  cg: 'Chhattisgarh', tr: 'Tripura', mn: 'Manipur', ml: 'Meghalaya',
  mz: 'Mizoram', nl: 'Nagaland', sk: 'Sikkim', ar: 'Arunachal Pradesh',
};

// Lowercase full-name variants → canonical
const STATE_FULL = {
  'tamil nadu': 'Tamil Nadu', 'tamilnadu': 'Tamil Nadu', 'tamil-nadu': 'Tamil Nadu',
  'andhra pradesh': 'Andhra Pradesh', 'andhrapradesh': 'Andhra Pradesh',
  'telangana': 'Telangana',
  'punjab': 'Punjab',
  'karnataka': 'Karnataka',
  'maharashtra': 'Maharashtra',
  'delhi': 'Delhi', 'new delhi': 'Delhi',
  'uttar pradesh': 'Uttar Pradesh', 'uttarpradesh': 'Uttar Pradesh',
  'rajasthan': 'Rajasthan',
  'gujarat': 'Gujarat',
  'madhya pradesh': 'Madhya Pradesh', 'madhyapradesh': 'Madhya Pradesh',
  'west bengal': 'West Bengal', 'westbengal': 'West Bengal',
  'kerala': 'Kerala',
  'haryana': 'Haryana',
  'bihar': 'Bihar',
  'jharkhand': 'Jharkhand',
  'odisha': 'Odisha', 'orissa': 'Odisha',
  'assam': 'Assam',
  'uttarakhand': 'Uttarakhand', 'uttaranchal': 'Uttarakhand',
  'himachal pradesh': 'Himachal Pradesh', 'himachalpradesh': 'Himachal Pradesh',
  'goa': 'Goa',
  'jammu and kashmir': 'Jammu and Kashmir', 'jammu & kashmir': 'Jammu and Kashmir',
  'chhattisgarh': 'Chhattisgarh', 'chattisgarh': 'Chhattisgarh',
  'tripura': 'Tripura',
  'manipur': 'Manipur',
  'meghalaya': 'Meghalaya',
  'mizoram': 'Mizoram',
  'nagaland': 'Nagaland',
  'sikkim': 'Sikkim',
  'arunachal pradesh': 'Arunachal Pradesh', 'arunachalpradesh': 'Arunachal Pradesh',
};

const PINCODE_PREFIX_TO_STATE = {
  10: 'Delhi', 11: 'Delhi',
  12: 'Haryana', 13: 'Haryana',
  14: 'Punjab', 15: 'Punjab', 16: 'Punjab',
  17: 'Himachal Pradesh',
  18: 'Jammu and Kashmir', 19: 'Jammu and Kashmir',
  20: 'Uttar Pradesh', 21: 'Uttar Pradesh', 22: 'Uttar Pradesh',
  23: 'Uttar Pradesh', 24: 'Uttar Pradesh', 25: 'Uttar Pradesh',
  26: 'Uttar Pradesh', 27: 'Uttar Pradesh', 28: 'Uttar Pradesh',
  30: 'Rajasthan', 31: 'Rajasthan', 32: 'Rajasthan',
  33: 'Rajasthan', 34: 'Rajasthan',
  35: 'Gujarat',
  36: 'Gujarat', 37: 'Gujarat', 38: 'Gujarat', 39: 'Gujarat',
  40: 'Maharashtra', 41: 'Maharashtra', 42: 'Maharashtra',
  43: 'Maharashtra', 44: 'Maharashtra',
  45: 'Madhya Pradesh', 46: 'Madhya Pradesh', 47: 'Madhya Pradesh', 48: 'Madhya Pradesh',
  49: 'Chhattisgarh',
  50: 'Telangana', 51: 'Telangana',
  52: 'Andhra Pradesh', 53: 'Andhra Pradesh',
  56: 'Karnataka', 57: 'Karnataka', 58: 'Karnataka', 59: 'Karnataka',
  60: 'Tamil Nadu', 61: 'Tamil Nadu', 62: 'Tamil Nadu', 63: 'Tamil Nadu', 64: 'Tamil Nadu',
  65: 'Puducherry', 66: 'Puducherry',
  67: 'Kerala', 68: 'Kerala', 69: 'Kerala',
  70: 'West Bengal', 71: 'West Bengal', 72: 'West Bengal', 73: 'West Bengal', 74: 'West Bengal',
  75: 'Odisha', 76: 'Odisha', 77: 'Odisha',
  78: 'Assam', 79: 'Assam',
  80: 'Bihar', 81: 'Bihar', 82: 'Bihar', 83: 'Bihar', 84: 'Bihar', 85: 'Bihar',
  90: 'Manipur', 91: 'Mizoram', 92: 'Tripura',
  93: 'Meghalaya', 94: 'Nagaland', 95: 'Arunachal Pradesh',
  96: 'Sikkim',
};

function stateFromPincode(pin) {
  const n = parseInt(pin, 10);
  if (isNaN(n) || n < 100000 || n > 999999) return null;
  const prefix = Math.floor(n / 10000);
  return PINCODE_PREFIX_TO_STATE[prefix] || null;
}

const CITY_TO_STATE = {
  'mumbai': 'Maharashtra', 'thane': 'Maharashtra', 'pune': 'Maharashtra', 'nagpur': 'Maharashtra',
  'nashik': 'Maharashtra', 'aurangabad': 'Maharashtra', 'solapur': 'Maharashtra', 'kalyan': 'Maharashtra',
  'vasai': 'Maharashtra', 'pimpri': 'Maharashtra', 'bhiwandi': 'Maharashtra', 'amravati': 'Maharashtra',
  'navi mumbai': 'Maharashtra',
  'delhi': 'Delhi', 'new delhi': 'Delhi',
  'bangalore': 'Karnataka', 'bengaluru': 'Karnataka', 'mysore': 'Karnataka', 'mysuru': 'Karnataka',
  'hubballi': 'Karnataka', 'hubli': 'Karnataka', 'mangalore': 'Karnataka', 'mangaluru': 'Karnataka',
  'belgaum': 'Karnataka', 'belagavi': 'Karnataka', 'shimoga': 'Karnataka', 'shivamogga': 'Karnataka',
  'chennai': 'Tamil Nadu', 'coimbatore': 'Tamil Nadu', 'madurai': 'Tamil Nadu', 'salem': 'Tamil Nadu',
  'tiruchirappalli': 'Tamil Nadu', 'trichy': 'Tamil Nadu',
  'tambaram': 'Tamil Nadu', 'vellore': 'Tamil Nadu', 'erode': 'Tamil Nadu', 'tirunelveli': 'Tamil Nadu',
  'tiruppur': 'Tamil Nadu', 'dindigul': 'Tamil Nadu', 'thanjavur': 'Tamil Nadu', 'hosur': 'Tamil Nadu',
  'hyderabad': 'Telangana', 'warangal': 'Telangana', 'secunderabad': 'Telangana',
  'karimnagar': 'Telangana', 'nizamabad': 'Telangana', 'khammam': 'Telangana',
  'kolkata': 'West Bengal', 'howrah': 'West Bengal', 'siliguri': 'West Bengal',
  'durgapur': 'West Bengal', 'asansol': 'West Bengal',
  'ahmedabad': 'Gujarat', 'surat': 'Gujarat', 'vadodara': 'Gujarat', 'rajkot': 'Gujarat',
  'gandhinagar': 'Gujarat',
  'jaipur': 'Rajasthan', 'jodhpur': 'Rajasthan', 'udaipur': 'Rajasthan', 'kota': 'Rajasthan',
  'bikaner': 'Rajasthan', 'ajmer': 'Rajasthan',
  'lucknow': 'Uttar Pradesh', 'kanpur': 'Uttar Pradesh', 'agra': 'Uttar Pradesh',
  'varanasi': 'Uttar Pradesh', 'allahabad': 'Uttar Pradesh', 'prayagraj': 'Uttar Pradesh',
  'meerut': 'Uttar Pradesh', 'bareilly': 'Uttar Pradesh', 'moradabad': 'Uttar Pradesh',
  'saharanpur': 'Uttar Pradesh', 'gorakhpur': 'Uttar Pradesh', 'ghaziabad': 'Uttar Pradesh',
  'noida': 'Uttar Pradesh', 'greater noida': 'Uttar Pradesh', 'aligarh': 'Uttar Pradesh',
  'bhopal': 'Madhya Pradesh', 'indore': 'Madhya Pradesh', 'jabalpur': 'Madhya Pradesh',
  'gwalior': 'Madhya Pradesh', 'ujjain': 'Madhya Pradesh',
  'patna': 'Bihar', 'gaya': 'Bihar', 'muzaffarpur': 'Bihar',
  'ranchi': 'Jharkhand', 'dhanbad': 'Jharkhand', 'jamshedpur': 'Jharkhand',
  'chandigarh': 'Punjab', 'ludhiana': 'Punjab', 'amritsar': 'Punjab', 'jalandhar': 'Punjab',
  'patiala': 'Punjab', 'bathinda': 'Punjab', 'mohali': 'Punjab',
  'gurgaon': 'Haryana', 'gurugram': 'Haryana', 'faridabad': 'Haryana',
  'rohtak': 'Haryana', 'panipat': 'Haryana', 'karnal': 'Haryana', 'hisar': 'Haryana',
  'vijayawada': 'Andhra Pradesh', 'visakhapatnam': 'Andhra Pradesh', 'vizag': 'Andhra Pradesh',
  'guntur': 'Andhra Pradesh', 'nellore': 'Andhra Pradesh', 'tirupati': 'Andhra Pradesh',
  'kurnool': 'Andhra Pradesh', 'kakinada': 'Andhra Pradesh', 'rajahmundry': 'Andhra Pradesh',
  'thiruvananthapuram': 'Kerala', 'trivandrum': 'Kerala', 'kochi': 'Kerala', 'cochin': 'Kerala',
  'ernakulam': 'Kerala', 'kozhikode': 'Kerala', 'calicut': 'Kerala', 'thrissur': 'Kerala',
  'kollam': 'Kerala',
  'bhubaneswar': 'Odisha', 'cuttack': 'Odisha', 'rourkela': 'Odisha',
  'guwahati': 'Assam', 'dehradun': 'Uttarakhand', 'haridwar': 'Uttarakhand',
  'shimla': 'Himachal Pradesh', 'dharamsala': 'Himachal Pradesh',
  'srinagar': 'Jammu and Kashmir', 'jammu': 'Jammu and Kashmir',
  'raipur': 'Chhattisgarh', 'bhilai': 'Chhattisgarh', 'bilaspur': 'Chhattisgarh',
  'panaji': 'Goa', 'margao': 'Goa',
  'kolhapur': 'Maharashtra', 'bhavnagar': 'Gujarat',
};
const MAJOR_CITIES = new Set(Object.keys(CITY_TO_STATE));

// Junk values that add no signal
const JUNK_RE = /^(null|none|n\/a|na|nil|undefined|0|-)$/i;

function isJunkValue(v) {
  if (!v || typeof v !== 'string') return true;
  const t = v.trim();
  if (t.length <= 1) return true;
  if (JUNK_RE.test(t)) return true;
  if (/^\d{1,3}$/.test(t)) return true; // single to 3-digit numbers are noise
  return false;
}

function normalizeState(raw) {
  const t = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (STATE_ABBREV[t]) return STATE_ABBREV[t];
  if (STATE_FULL[t]) return STATE_FULL[t];
  // partial title-case lookup: "Tamil Nadu" → already handled, but try stripped
  const stripped = t.replace(/[^a-z ]/g, '').trim();
  if (STATE_FULL[stripped]) return STATE_FULL[stripped];
  return null;
}

const CITY_ALIASES = {
  'newdelhi': 'New Delhi', 'new delhi': 'New Delhi',
  'bengaluru': 'Bangalore', 'bengalore': 'Bangalore',
  'mysuru': 'Mysore', 'mangaluru': 'Mangalore', 'belagavi': 'Belgaum',
  'gurugram': 'Gurgaon', 'prayagraj': 'Allahabad',
  'trivandrum': 'Thiruvananthapuram', 'cochin': 'Kochi', 'calicut': 'Kozhikode',
  'vizag': 'Visakhapatnam',
};

function normalizeCity(raw) {
  const t = raw.trim().replace(/\s+/g, ' ');
  if (t.length < 2) return null;
  const alias = CITY_ALIASES[t.toLowerCase()];
  if (alias) return alias;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function isPincode(s) {
  return /^\d{6}$/.test(s.trim());
}

// Extract a 6-digit pincode from an address string
function extractPincodeFromAddress(addr) {
  const m = addr.match(/\b(\d{6})\b/);
  return m ? m[1] : null;
}

// Scan address string for known state names (longest match wins)
function extractStateFromAddress(addr) {
  const lower = addr.toLowerCase();
  let best = null;
  let bestLen = 0;
  for (const [variant, canonical] of Object.entries(STATE_FULL)) {
    if (lower.includes(variant) && variant.length > bestLen) {
      best = canonical;
      bestLen = variant.length;
    }
  }
  // Also check 2-letter abbreviations as whole words
  if (!best) {
    for (const [abbr, canonical] of Object.entries(STATE_ABBREV)) {
      const re = new RegExp(`\\b${abbr}\\b`, 'i');
      if (re.test(addr)) { best = canonical; break; }
    }
  }
  return best;
}

// Scan address string for a known major city
function extractCityFromAddress(addr) {
  const lower = addr.toLowerCase();
  for (const city of MAJOR_CITIES) {
    const re = new RegExp(`\\b${city}\\b`);
    if (re.test(lower)) {
      return city.charAt(0).toUpperCase() + city.slice(1);
    }
  }
  return null;
}

const LOCATION_KEYS = new Set([
  'city', 'locationinfo.city', 'state', 'locationinfo.state',
  'district', 'pincode', 'zipcode', 'postal', 'postal_code',
  'address', 'address_1', 'address1', 'address2', 'area', 'region', 'location', 'country',
]);

function extractFieldsFromRecord(fields) {
  const out = { cities: [], states: [], pincodes: [], addresses: [] };

  for (const [rawKey, rawVal] of Object.entries(fields || {})) {
    const key = rawKey.toLowerCase().replace(/\s/g, '');
    const val = typeof rawVal === 'string' ? rawVal : String(rawVal ?? '');
    if (isJunkValue(val)) continue;

    if (!LOCATION_KEYS.has(key) &&
        !key.includes('city') && !key.includes('state') && !key.includes('district') &&
        !key.includes('pin') && !key.includes('zip') && !key.includes('postal') &&
        !key.includes('address') && !key.includes('area') && !key.includes('region') &&
        !key.includes('location') && !key.includes('district')) {
      continue;
    }

    // country: skip non-India values silently, we only process India
    if (key === 'country' || key.endsWith('_country') || key.endsWith('.country')) {
      const cl = val.toLowerCase();
      if (cl !== 'india' && cl !== 'in' && cl !== 'ind') continue;
      continue;
    }

    if (key.includes('pin') || key.includes('zip') || key === 'postal' || key === 'postal_code') {
      if (isPincode(val)) out.pincodes.push(val.trim());
      continue;
    }

    if (key.includes('address')) {
      out.addresses.push(val);
      continue;
    }

    const clean = val.trim();
    if (clean.length < 2) continue;

    const isStateKey = key === 'state' || key === 'locationinfo.state' ||
      key === 'region' || key.endsWith('_state') || key.endsWith('_region') ||
      key.endsWith('.state') || key.endsWith('.region');

    if (isStateKey) {
      const ns = normalizeState(clean);
      if (ns) { out.states.push(ns); continue; }
      // state field sometimes holds a city name in messy data
      const impliedState = CITY_TO_STATE[clean.toLowerCase()];
      if (impliedState) { out.states.push(impliedState); out.cities.push(normalizeCity(clean)); }
      continue;
    }

    const isCityKey = key === 'city' || key === 'locationinfo.city' || key === 'district' ||
      key === 'area' || key === 'location' ||
      key.endsWith('_city') || key.endsWith('.city') ||
      key.endsWith('_district') || key.endsWith('.district');

    if (isCityKey) {
      const ns = normalizeState(clean);
      if (ns) { out.states.push(ns); continue; }
      if (!isJunkValue(clean) && clean.length >= 2 && !/^\d+$/.test(clean)) {
        const normalized = normalizeCity(clean);
        out.cities.push(normalized);
      }
      continue;
    }
  }

  return out;
}

function increment(map, key) {
  if (key == null) return;
  map.set(key, (map.get(key) || 0) + 1);
}

function topEntry(map) {
  let best = null, bestCount = 0;
  for (const [k, v] of map) {
    if (v > bestCount || (v === bestCount && best !== null && k < best)) {
      best = k; bestCount = v;
    }
  }
  return best ? [best, bestCount] : [null, 0];
}

export function chooseCanonicalLocation(results) {
  const empty = {
    state: null, stateCode: null, district: null, pincode: null,
    confidence: 0,
    evidence: { state_votes: {}, district_votes: {}, pincode_votes: {}, total_records: 0, records_with_location: 0 },
    alternates: [],
  };

  if (!Array.isArray(results) || results.length === 0) return empty;

  const stateVotes = new Map();
  const districtVotes = new Map();
  const pincodeVotes = new Map();
  const stateCityPairs = new Map();
  let totalRecords = 0;
  let recordsWithLocation = 0;

  for (const entity of results) {
    for (const source of entity?.sources ?? []) {
      for (const record of source?.records ?? []) {
        totalRecords++;
        const { cities, states, pincodes, addresses } = extractFieldsFromRecord(record?.fields ?? {});

        // Address fallback: mine pincode/state/city from raw address strings when direct fields are empty
        if (states.length === 0 && cities.length === 0 && pincodes.length === 0) {
          for (const addr of addresses) {
            const ap = extractPincodeFromAddress(addr);
            if (ap) pincodes.push(ap);
            const as_ = extractStateFromAddress(addr);
            if (as_) states.push(as_);
            const ac = extractCityFromAddress(addr);
            if (ac) cities.push(ac);
          }
        }

        // Pincode → state fallback when explicit state is absent
        for (const pin of pincodes) {
          if (states.length === 0) {
            const ps = stateFromPincode(pin);
            if (ps) states.push(ps);
          }
        }

        const hasAny = states.length > 0 || cities.length > 0 || pincodes.length > 0;
        if (!hasAny) continue;
        recordsWithLocation++;

        const votedStates = new Set(states);
        const votedCities = new Set(cities);
        const votedPins = new Set(pincodes);

        // Known cities contribute state votes
        for (const c of votedCities) {
          const impliedState = CITY_TO_STATE[c.toLowerCase()];
          if (impliedState) votedStates.add(impliedState);
        }

        for (const s of votedStates) increment(stateVotes, s);
        for (const c of votedCities) increment(districtVotes, c);
        for (const p of votedPins) increment(pincodeVotes, p);

        // Track which cities appear with which states for cross-validation
        for (const c of votedCities) {
          for (const s of votedStates) {
            const pairKey = `${s}|||${c}`;
            increment(stateCityPairs, pairKey);
          }
        }
      }
    }
  }

  if (recordsWithLocation === 0) return { ...empty, evidence: { state_votes: {}, district_votes: {}, pincode_votes: {}, total_records: totalRecords, records_with_location: 0 } };

  const [winState, winStateCount] = topEntry(stateVotes);
  const [winPincode] = topEntry(pincodeVotes);

  // Pick district: prefer cities that belong to the winning state
  let winDistrict = null;
  if (winState) {
    // Filter to cities consistent with winning state (known mapping or co-occurred)
    const compatibleDistricts = new Map();
    for (const [city, count] of districtVotes) {
      const cityState = CITY_TO_STATE[city.toLowerCase()];
      const pairCount = stateCityPairs.get(`${winState}|||${city}`) || 0;
      if (cityState === winState || pairCount > 0 || !cityState) {
        compatibleDistricts.set(city, count);
      }
    }
    [winDistrict] = topEntry(compatibleDistricts);
  }
  if (!winDistrict) [winDistrict] = topEntry(districtVotes);

  let confidence = winState ? winStateCount / recordsWithLocation : 0;

  if (winState && winDistrict) {
    const cityState = CITY_TO_STATE[winDistrict.toLowerCase()];
    if (cityState === winState) confidence *= 1.15;
  }

  if (recordsWithLocation < 3) confidence *= 0.70;
  confidence = Math.min(1, Math.max(0, confidence));

  const stateToCode = Object.fromEntries(
    Object.entries(STATE_ABBREV).map(([code, name]) => [name, code.toUpperCase()])
  );
  const stateCode = winState ? (stateToCode[winState] ?? null) : null;

  const altCandidates = [];
  for (const [d, dv] of districtVotes) {
    if (d === winDistrict) continue;
    const ds = CITY_TO_STATE[d.toLowerCase()] || winState;
    altCandidates.push({ label: ds ? `${d}, ${ds}` : d, score: dv });
  }
  for (const [s, sv] of stateVotes) {
    if (s === winState) continue;
    altCandidates.push({ label: s, score: sv });
  }
  altCandidates.sort((a, b) => b.score - a.score);
  const altSeen = new Set();
  const alternates = [];
  for (const { label } of altCandidates) {
    if (alternates.length >= 3) break;
    const k = label.toLowerCase();
    if (!altSeen.has(k)) { altSeen.add(k); alternates.push(label); }
  }

  return {
    state: winState,
    stateCode,
    district: winDistrict,
    pincode: winPincode,
    confidence,
    evidence: {
      state_votes: Object.fromEntries(stateVotes),
      district_votes: Object.fromEntries(districtVotes),
      pincode_votes: Object.fromEntries(pincodeVotes),
      total_records: totalRecords,
      records_with_location: recordsWithLocation,
    },
    alternates,
  };
}

export function formatCanonicalLocation(loc) {
  if (!loc || !loc.state) return null;
  const parts = [];
  if (loc.district && loc.district.toLowerCase() !== loc.state.toLowerCase()) {
    parts.push(loc.district);
  }
  parts.push(loc.state);
  if (loc.pincode) parts.push(loc.pincode);
  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Self-contained test cases — call __run_tests__() to verify
// ---------------------------------------------------------------------------

function makeResults(recordFieldSets) {
  return [{ sources: [{ records: recordFieldSets.map(f => ({ fields: f })) }] }];
}

export const __test_cases__ = [
  {
    name: 'clear-single-state',
    description: 'All records point to Tamil Nadu / Chennai',
    input: makeResults([
      { state: 'Tamil Nadu', city: 'Chennai', pincode: '600001' },
      { state: 'TN', city: 'Chennai' },
      { locationinfo_state: 'Tamil Nadu', locationinfo_city: 'Chennai', pincode: '600095' },
      { state: 'tamilnadu', district: 'Chennai' },
    ]),
    expect: { state: 'Tamil Nadu', stateCode: 'TN', district: 'Chennai', confidenceGTE: 0.7 },
  },
  {
    name: 'mixed-states-majority-wins',
    description: 'Majority Tamil Nadu, minority Telangana',
    input: makeResults([
      { state: 'Tamil Nadu', city: 'Coimbatore' },
      { state: 'TN', city: 'Chennai' },
      { state: 'TN', city: 'Chennai' },
      { state: 'Tamil Nadu', city: 'Coimbatore' },
      { state: 'Telangana', city: 'Hyderabad' },
      { state: 'TS', city: 'Hyderabad' },
    ]),
    expect: { state: 'Tamil Nadu', stateCode: 'TN', confidenceGTE: 0.5 },
  },
  {
    name: 'pincode-only-resolution',
    description: 'No explicit state, 6xx pincodes imply Tamil Nadu',
    input: makeResults([
      { pincode: '600001' },
      { pincode: '600095' },
      { zipcode: '641001' },
    ]),
    expect: { state: 'Tamil Nadu', confidenceGTE: 0.4 },
  },
  {
    name: 'cross-state-city-conflict',
    description: 'City Adyar (TN) must not pair with Delhi pincode',
    input: makeResults([
      { city: 'Adyar', pincode: '600020' },
      { city: 'Adyar', state: 'Tamil Nadu' },
      { city: 'Chennai', state: 'TN' },
      { pincode: '110021' },
    ]),
    expect: { state: 'Tamil Nadu', district: 'Adyar', stateCode: 'TN' },
  },
  {
    name: 'address-string-parsing',
    description: 'State and city embedded in raw address strings only',
    input: makeResults([
      { address: '42, Anna Nagar, Chennai, Tamil Nadu 600040, India' },
      { address1: 'Flat 5B Koramangala Bangalore Karnataka 560034' },
      { address: 'Indiranagar Bangalore Karnataka' },
    ]),
    expect: { confidenceGTE: 0.3 },
  },
  {
    name: 'no-data-empty-result',
    description: 'Records with no location fields return null state and zero confidence',
    input: makeResults([
      { name: 'John Doe', email: 'john@example.com' },
      { phone: '9999999999', dob: '1990-01-01' },
    ]),
    expect: { state: null, confidence: 0 },
  },
];

export function __run_tests__() {
  const results = [];
  let passed = 0, failed = 0;

  for (const tc of __test_cases__) {
    const result = chooseCanonicalLocation(tc.input);
    const errors = [];
    const ex = tc.expect;

    if ('state' in ex && result.state !== ex.state) {
      errors.push(`state: got ${JSON.stringify(result.state)}, want ${JSON.stringify(ex.state)}`);
    }
    if ('stateCode' in ex && result.stateCode !== ex.stateCode) {
      errors.push(`stateCode: got ${JSON.stringify(result.stateCode)}, want ${JSON.stringify(ex.stateCode)}`);
    }
    if ('district' in ex && result.district !== ex.district) {
      errors.push(`district: got ${JSON.stringify(result.district)}, want ${JSON.stringify(ex.district)}`);
    }
    if ('confidence' in ex && result.confidence !== ex.confidence) {
      errors.push(`confidence: got ${result.confidence}, want ${ex.confidence}`);
    }
    if ('confidenceGTE' in ex && result.confidence < ex.confidenceGTE) {
      errors.push(`confidence ${result.confidence.toFixed(3)} < expected GTE ${ex.confidenceGTE}`);
    }

    const ok = errors.length === 0;
    if (ok) passed++; else failed++;
    results.push({ name: tc.name, pass: ok, errors, result });
  }

  return { passed, failed, results };
}
