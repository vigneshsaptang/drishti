// canonicalLocation.js — backend ships canonical location now (see
// `backend/app/engines/geo.py` -> `resolve_canonical_location()`). What remains
// here is a tiny render-helper plus a no-op stub for any straggling import of
// chooseCanonicalLocation.

export function chooseCanonicalLocation() {
  return {
    state: null,
    stateCode: null,
    district: null,
    city: null,
    locality: null,
    pincode: null,
    confidence: 0,
    evidence: {
      state_votes: {},
      city_votes: {},
      district_votes: {},
      locality_votes: {},
      pincode_votes: {},
      total_records: 0,
      records_with_location: 0,
    },
    alternates: [],
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
