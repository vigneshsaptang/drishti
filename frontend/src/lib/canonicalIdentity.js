// canonicalIdentity.js — dominant-token identity resolution, no dependencies

const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sri', 'smt', 'shri']);
// Single-letter connectors from s/o, d/o, w/o and other noise
const CONNECTORS = new Set(['and', 'or', 'the', 's', 'd', 'w', 'of', 'o']);

function stripDiacritics(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Split on whitespace and separators; return structured token objects. */
export function tokenize(s) {
  const parts = s.trim().split(/[\s.,_\-/\\|]+/).filter(Boolean);
  return parts.map(raw => {
    const lower = stripDiacritics(raw.toLowerCase());
    // isInitial: single char OR 2-3 all-uppercase letters (e.g. BVS, EE)
    const isInitial = raw.length === 1 || (raw.length >= 2 && raw.length <= 3 && /^[A-Z]+$/.test(raw));
    // isProperCased: first letter uppercase, rest lowercase
    const isProperCased = /^[A-Z][a-z]/.test(raw);
    return { raw, token: lower, isInitial, isProperCased };
  });
}

function isJunk(token) {
  if (HONORIFICS.has(token)) return true;
  if (CONNECTORS.has(token)) return true;
  if (/^\d+$/.test(token)) return true;
  // Reject ID-shaped tokens: passports / national IDs / etc. that get
  // concatenated into name fields (e.g. "Abhishek Kumar B8110417" → the
  // "B8110417" should not score as a third name token). Heuristic: any
  // token whose digits outnumber its letters is treated as an identifier,
  // not a name. This still keeps user-style tokens like "saikrishna1234"
  // (10 letters / 4 digits → letters majority).
  const digits  = (token.match(/\d/g) || []).length;
  const letters = (token.match(/[a-z]/gi) || []).length;
  if (digits > 0 && digits >= letters) return true;
  return false;
}

/** Preserve best casing: proper-cased > mixed > lower. */
function bestCasing(existing, candidate) {
  const score = s => (/[A-Z][a-z]/.test(s) ? 2 : /[A-Z]/.test(s) ? 1 : 0);
  return score(candidate) >= score(existing) ? candidate : existing;
}

export function chooseCanonicalIdentity({ names = [], usernames = [], emails = [] }) {
  const empty = { canonical: null, anchor: null, confidence: 0, source: 'inferred',
    evidence: { anchor_count: 0, total_inputs: 0, candidates_considered: 0, token_freq: {} },
    alternates: [] };

  // 1. Collect + dedup inputs — real names strongly preferred
  const nameInputs = names.filter(n => n && typeof n === 'string' && n.trim().length > 1);
  const fallbackInputs = [
    ...usernames.filter(u => u && typeof u === 'string' && u.trim().length > 1),
    ...emails.map(e => (e || '').split('@')[0]).filter(lp => lp && typeof lp === 'string' && lp.trim().length > 1),
  ];
  const rawInputs = nameInputs.length > 0 ? nameInputs : fallbackInputs;

  // dedup case-insensitively, keep best casing
  const seen = new Map(); // lower → best-cased original
  for (const r of rawInputs) {
    if (!r || typeof r !== 'string') continue;
    const trimmed = r.trim();
    if (trimmed.length < 2) continue;
    const key = stripDiacritics(trimmed.toLowerCase());
    seen.set(key, seen.has(key) ? bestCasing(seen.get(key), trimmed) : trimmed);
  }
  const inputs = [...seen.values()];
  if (inputs.length === 0) return empty;

  // 2. Tokenize each input; build per-input token sets
  const parsedInputs = inputs.map(s => {
    const toks = tokenize(s);
    const tokenSet = new Set(toks.map(t => t.token));
    return { original: s, toks, tokenSet };
  });

  // 3 & 4. Token frequency — each input votes at most once per token
  const freq = new Map();
  for (const { toks } of parsedInputs) {
    const voted = new Set();
    for (const { token, isInitial } of toks) {
      if (isJunk(token) || token.length < 2 || voted.has(token)) continue;
      // initials still counted but flagged
      if (!isInitial) {
        voted.add(token);
        freq.set(token, (freq.get(token) || 0) + 1);
      }
    }
  }

  // 5. Pick anchor: most-frequent non-junk non-initial token
  let anchor = null;
  let anchorFreq = 0;
  for (const [tok, count] of freq) {
    if (count > anchorFreq ||
        (count === anchorFreq && anchor !== null &&
          (tok.length > anchor.length || (tok.length === anchor.length && tok < anchor)))) {
      anchor = tok;
      anchorFreq = count;
    }
  }

  // 6. Early exit: anchor found in only 1 input
  if (!anchor || anchorFreq <= 1) {
    const nameFallback = nameInputs.length > 0
      ? nameInputs.reduce((a, b) => (b.length > a.length ? b : a), nameInputs[0])
      : null;
    const fallback = nameFallback || inputs.reduce((a, b) => (b.length > a.length ? b : a), inputs[0]);
    return { ...empty, canonical: fallback,
      source: nameInputs.length > 0 ? 'name' : 'inferred',
      evidence: { anchor_count: anchorFreq, total_inputs: inputs.length,
        candidates_considered: 0, token_freq: Object.fromEntries(freq) } };
  }

  // 7. Find candidates: inputs that contain the anchor token
  const candidates = parsedInputs.filter(p => p.tokenSet.has(anchor));

  // 8. Score each candidate
  function scoreCandidate(p) {
    const { original, toks, tokenSet } = p;

    // distinct non-junk tokens in this input
    const distinctFull = new Set();
    const distinctInitials = new Set();
    for (const { token, isInitial } of toks) {
      if (isJunk(token) || token.length < 2) continue;
      if (isInitial) distinctInitials.add(token);
      else if (token !== anchor) distinctFull.add(token);
    }

    let score = 10; // anchor always present
    score += distinctFull.size * 20;
    score += distinctInitials.size * 5;

    // Casing signals
    const hasProperWord = toks.some(t => t.isProperCased);
    const allLower = original === original.toLowerCase();
    if (hasProperWord) score += 3;
    if (allLower) score -= 3;

    // Degenerate: only the anchor repeated
    if (tokenSet.size === 1 && tokenSet.has(anchor)) score -= 5;

    // Specificity bonus for longer strings
    if (original.length > 12) score += 2;

    return { score, distinctFull, distinctInitials, hasProperWord, original };
  }

  const scored = candidates.map(p => ({ p, ...scoreCandidate(p) }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // prefer proper-cased
    if (b.hasProperWord !== a.hasProperWord) return b.hasProperWord ? 1 : -1;
    return b.original.length - a.original.length;
  });

  // If winning original is all-lowercase (e.g. email local-part), reconstruct
  // a title-cased form from its non-junk tokens so the output reads like a name.
  const winnerOriginal = scored[0].original;
  const winnerAllLower = winnerOriginal === winnerOriginal.toLowerCase();
  const canonical = winnerAllLower
    ? scored[0].p.toks
        .filter(t => !isJunk(t.token) && t.token.length >= 2)
        .map(t => t.token.charAt(0).toUpperCase() + t.token.slice(1))
        .join(' ') || winnerOriginal
    : winnerOriginal;
  const canonicalDistinctFull = scored[0].distinctFull;

  // 10. Confidence
  let confidence = anchorFreq / inputs.length;
  if (canonicalDistinctFull.size >= 3) confidence *= 1.10;
  if (inputs.length < 3) confidence *= 0.70;
  confidence = Math.min(1, Math.max(0, confidence));

  // 11. Alternates: top 5 by score, excluding canonical, deduped case-insensitively
  const altSeen = new Set([canonical.toLowerCase()]);
  const alternates = [];
  for (const { original } of scored.slice(1)) {
    if (alternates.length >= 5) break;
    const key = original.toLowerCase();
    if (!altSeen.has(key)) { altSeen.add(key); alternates.push(original); }
  }

  // Build token_freq for evidence (top tokens)
  const token_freq = Object.fromEntries(
    [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
  );

  return {
    canonical,
    anchor,
    confidence,
    source: nameInputs.length > 0 ? 'name' : 'inferred',
    evidence: {
      anchor_count: anchorFreq,
      total_inputs: inputs.length,
      candidates_considered: candidates.length,
      token_freq,
    },
    alternates,
  };
}

// ---------------------------------------------------------------------------
// Self-contained sanity tests — call __run_tests__() manually to inspect
// ---------------------------------------------------------------------------

export const __test_cases__ = [
  {
    name: 'vignesh-pattern-canonical',
    input: {
      names: ['Vignesh', 'Vignesh Vignesh', 'Vignesh Elumalai', 'Vignesh Ettippan Elumalai', 'Vignesh EE', 'Vignesh E'],
      usernames: ['vignesh'],
      emails: ['vignesh.elumalai@example.com'],
    },
    expect: { anchor: 'vignesh', canonicalContains: ['Vignesh', 'Ettippan', 'Elumalai'], confidenceGTE: 0.6 },
  },
  {
    name: 'saikrishna-multi-surname',
    input: {
      names: ['Saikrishna BVS', 'Saikrishna Budamgunta', 'B V S Saikrishna', 'Saikrishna'],
      usernames: ['saikrishna1234', 'Budamgunta.Venkata'],
      emails: ['saikrishnabvs@gmail.com'],
    },
    expect: { anchor: 'saikrishna', canonicalContains: ['Saikrishna'], confidenceGTE: 0.5 },
  },
  {
    name: 'no-clear-anchor',
    input: { names: ['John Doe', 'Jane Smith'], usernames: ['jdoe'], emails: [] },
    expect: { anchorOptional: true, confidenceLTE: 0.5 },
  },
  {
    name: 'empty',
    input: { names: [], usernames: [], emails: [] },
    expect: { canonical: null, confidence: 0 },
  },
  {
    name: 'email-only',
    input: { names: [], usernames: [], emails: ['vignesh.ettippan@gmail.com', 'vignesh.e@gmail.com'] },
    expect: { anchor: 'vignesh', canonicalContains: ['Vignesh', 'Ettippan'] },
  },
];

export function __run_tests__() {
  const results = [];
  let passed = 0, failed = 0;

  for (const tc of __test_cases__) {
    const result = chooseCanonicalIdentity(tc.input);
    const errors = [];
    const { expect: ex } = tc;

    if ('canonical' in ex && result.canonical !== ex.canonical) {
      errors.push(`canonical: got ${JSON.stringify(result.canonical)}, want ${JSON.stringify(ex.canonical)}`);
    }
    if ('confidence' in ex && result.confidence !== ex.confidence) {
      errors.push(`confidence: got ${result.confidence}, want ${ex.confidence}`);
    }
    if ('anchor' in ex && result.anchor !== ex.anchor) {
      errors.push(`anchor: got ${JSON.stringify(result.anchor)}, want ${JSON.stringify(ex.anchor)}`);
    }
    if ('confidenceGTE' in ex && result.confidence < ex.confidenceGTE) {
      errors.push(`confidence ${result.confidence.toFixed(3)} < expected GTE ${ex.confidenceGTE}`);
    }
    if ('confidenceLTE' in ex && result.confidence > ex.confidenceLTE) {
      errors.push(`confidence ${result.confidence.toFixed(3)} > expected LTE ${ex.confidenceLTE}`);
    }
    if ('canonicalContains' in ex) {
      for (const word of ex.canonicalContains) {
        if (!result.canonical || !result.canonical.includes(word)) {
          errors.push(`canonical "${result.canonical}" missing word "${word}"`);
        }
      }
    }
    // anchorOptional: we only fail if anchor IS set and doesn't match
    // (no assertion needed when anchorOptional is the only key for anchor)

    const ok = errors.length === 0;
    if (ok) passed++; else failed++;
    results.push({ name: tc.name, pass: ok, errors, result });
  }

  return { passed, failed, results };
}
