// Shared identifier-extraction primitives.
//
// Both SubjectProfile (Overview) and InvestigationSummary (Breaches) need to
// agree on what counts as a phone/email/username/name. Trusting the backend's
// `new_identifiers[].type` lets through false positives — e.g. Hathway's
// 10-digit `ACCOUNT_OBJ_ID0` (looks like a phone, isn't). The fix is to
// extract from records' `fields[]` keyed on field-name regex, the same way
// SubjectProfile already does.
//
// Keep the regex match/validate rules here in sync with the equivalent entries
// in SubjectProfile's CATEGORIES.

const SKIP_VALUES = new Set(['', 'null', 'None', 'none', 'undefined', 'N/A', 'n/a', '-', '0', 'false']);

function isUseful(v) {
  if (!v || typeof v !== 'string') return false;
  const t = v.trim();
  if (SKIP_VALUES.has(t)) return false;
  if (t.length < 2 || t.length > 500) return false;
  return true;
}

// Validators mirror backend/app/engines/identifier_categorizer.py — keep in sync.
const RULES = {
  emails: {
    match:    k => /^(e-?mail|mail|email_?address)$/i.test(k),
    validate: v => {
      const s = v.trim();
      const at = s.lastIndexOf('@');
      return at > 0 && s.slice(at + 1).includes('.');
    },
  },
  phones: {
    match:    k => /phone|mobile|cell|telephone|contact_?number|contactnumber/i.test(k) && !/email/i.test(k),
    validate: v => /\d{7,}/.test(v.replace(/\D/g, '')),
  },
  usernames: {
    match:    k => /^(user_?name|username|nick(?:name)?|screen_?name|handle|login(?:name)?|user_?id|username_?2)$/i.test(k) && !/email/i.test(k),
    validate: v => {
      const s = v.trim();
      if (s.length < 3) return false;            // 2-char fragments
      if (s.includes('@')) return false;          // email leaked into username field
      if (/^\d{8,}$/.test(s)) return false;       // numeric account IDs
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return false;             // ISO date
      if (/^\d{2}-[A-Z]{3}-\d{2,4}$/i.test(s)) return false;      // 31-JAN-2024
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return false;          // DD/MM/YYYY
      return true;
    },
  },
  names: {
    match:    k => /^(name|fullname|full_name|first_?name|last_?name|middle_?name|display_?name|displayname|real_?name)$/i.test(k)
                  || k === 'Name' || k === 'name',
    validate: v => {
      const s = v.trim();
      if (s.length < 2) return false;
      if (/^\d+$/.test(s)) return false;          // pure-numeric "name"
      if (s.includes('@')) return false;          // email leaked in
      return true;
    },
  },
};

/**
 * Walk v2 search results and bucket discovered identifiers by type.
 * Returns { emails: [...], phones: [...], usernames: [...], names: [...] }.
 * Each bucket is deduped (lowercased key, original-case stored).
 *
 * Excludes values from non-matching field names — so a 10-digit account ID
 * stored in `ACCOUNT_OBJ_ID0` will NOT be classified as a phone, even if the
 * backend tagged it as one in `new_identifiers`.
 */
export function extractIdentifiers(results) {
  const buckets = {
    emails:    new Map(),
    phones:    new Map(),
    usernames: new Map(),
    names:     new Map(),
  };
  const add = (bucket, val) => {
    if (!isUseful(val)) return;
    const t = val.trim();
    if (!buckets[bucket].has(t.toLowerCase())) buckets[bucket].set(t.toLowerCase(), t);
  };

  for (const entity of (results || [])) {
    if (!entity.found) continue;
    for (const src of (entity.sources || [])) {
      for (const rec of (src.records || [])) {
        for (const [k, v] of Object.entries(rec.fields || {})) {
          if (!isUseful(v)) continue;
          for (const [bucketKey, rule] of Object.entries(RULES)) {
            if (rule.match(k)) {
              if (rule.validate && !rule.validate(v)) break;
              add(bucketKey, v);
              break;
            }
          }
        }
      }
    }
    // Seed-value fallback — when an entity was searched directly by type, count
    // the value itself (it's a confirmed identifier of its declared type).
    if (entity.entity_type === 'email'    && entity.entity_value) add('emails',    entity.entity_value);
    if (entity.entity_type === 'phone'    && entity.entity_value) add('phones',    entity.entity_value);
    if (entity.entity_type === 'username' && entity.entity_value) add('usernames', entity.entity_value);
    if (entity.entity_type === 'fullname' && entity.entity_value) add('names',     entity.entity_value);
  }

  return Object.fromEntries(
    Object.entries(buckets).map(([k, m]) => [k, [...m.values()]])
  );
}
