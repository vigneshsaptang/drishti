import { useState, useCallback, useRef } from 'react';
import { getAuthHeaders, clearToken } from '../lib/auth';
import { notifyCreditUpdate } from '../lib/api';

function onUnauthorized(res) {
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new Event('saptang-auth-failed'));
  }
}

/**
 * Streaming search hook (POST /api/v2/search).
 * Accumulates per-entity breach results, threat intel, dark web, and financial
 * screening events via SSE.
 *
 * SSE results are batched via requestAnimationFrame to reduce re-renders:
 * incoming events are pushed into ref buffers and flushed once per animation
 * frame (~16ms), cutting re-renders ~20x during BFS bursts.
 */
export function useSearchV2() {
  const [results, setResults] = useState([]);
  const [ftiResults, setFtiResults] = useState([]);
  const [ftiMeta, setFtiMeta] = useState(null);
  const [variantsScreened, setVariantsScreened] = useState([]);
  const [dobEnforced, setDobEnforced] = useState(false);
  const [darkmonResults, setDarkmonResults] = useState([]);
  const [darkmonMeta, setDarkmonMeta] = useState(null);
  const [financialResults, setFinancialResults] = useState([]);
  const [financialMeta, setFinancialMeta] = useState(null);
  const [aiSummary, setAiSummary] = useState(null);
  const [profile, setProfile] = useState(null);
  const [canonicalLocation, setCanonicalLocation] = useState(null);
  const [canonicalName, setCanonicalName] = useState(null);
  const [canonicalSource, setCanonicalSource] = useState(null);
  const [riskScore, setRiskScore] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchMeta, setSearchMeta] = useState(null);
  const abortRef = useRef(null);

  // --- SSE batching buffers (ref-based to avoid render-per-push) ---
  const entityBufferRef = useRef([]);
  const ftiBufferRef = useRef([]);
  const darkmonBufferRef = useRef([]);
  const financialBufferRef = useRef([]);
  const rafRef = useRef(null);

  const flushAllBuffers = useCallback(() => {
    if (entityBufferRef.current.length > 0) {
      const batch = entityBufferRef.current;
      entityBufferRef.current = [];
      setResults(prev => [...prev, ...batch]);
    }
    if (ftiBufferRef.current.length > 0) {
      const batch = ftiBufferRef.current;
      ftiBufferRef.current = [];
      setFtiResults(prev => [...prev, ...batch]);
    }
    if (darkmonBufferRef.current.length > 0) {
      const batch = darkmonBufferRef.current;
      darkmonBufferRef.current = [];
      setDarkmonResults(prev => [...prev, ...batch]);
    }
    if (financialBufferRef.current.length > 0) {
      const batch = financialBufferRef.current;
      financialBufferRef.current = [];
      setFinancialResults(prev => [...prev, ...batch]);
    }
    rafRef.current = null;
  }, []);

  /** Schedule a rAF flush if one isn't already pending */
  const scheduleFlush = useCallback(() => {
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(flushAllBuffers);
    }
  }, [flushAllBuffers]);

  /** Cancel pending rAF and clear all buffers */
  const cancelBuffers = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    entityBufferRef.current = [];
    ftiBufferRef.current = [];
    darkmonBufferRef.current = [];
    financialBufferRef.current = [];
  }, []);

  const doSearch = useCallback(async (seeds, maxDepth = 2, engines = null, subject = null) => {
    if (!seeds || seeds.length === 0) return;

    // Abort any previous search and clear stale buffers
    if (abortRef.current) abortRef.current.abort();
    cancelBuffers();
    const controller = new AbortController();
    abortRef.current = controller;

    setResults([]);
    setFtiResults([]);
    setFtiMeta(null);
    setVariantsScreened([]);
    setDobEnforced(false);
    setDarkmonResults([]);
    setDarkmonMeta(null);
    setFinancialResults([]);
    setFinancialMeta(null);
    setAiSummary(null);
    setProfile(null);
    setCanonicalLocation(null);
    setCanonicalName(null);
    setCanonicalSource(null);
    setRiskScore(null);
    setLoading(true);
    setError(null);
    setSearchMeta(null);

    let searchCompleted = false;
    let authFailed = false;

    try {
      const res = await fetch('/api/v2/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          seeds,
          max_depth: maxDepth,
          ...(engines ? { engines } : {}),
          ...(subject ? { subject } : {}),
        }),
        signal: controller.signal,
      });

      onUnauthorized(res);
      if (!res.ok) {
        if (res.status === 401) { authFailed = true; return; }
        if (res.status === 402) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail?.error === 'insufficient_credits'
            ? `Insufficient credits: need ${body.detail.required}, have ${body.detail.available}`
            : 'Insufficient credits');
        }
        if (res.status === 429) {
          throw new Error('Daily credit limit exceeded');
        }
        throw new Error(`Search failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (controller.signal.aborted) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line in buffer

        let eventType = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const eventData = line.slice(6);
            try {
              const parsed = JSON.parse(eventData);

              switch (eventType) {
                case 'credits:update':
                  notifyCreditUpdate({
                    remaining: parsed.remaining,
                    deducted: parsed.deducted,
                    warning: parsed.warning,
                  });
                  break;

                case 'search:start':
                  setSearchMeta(prev => ({
                    ...(prev || {}),
                    seeds: parsed.seeds,
                    max_depth: parsed.max_depth,
                  }));
                  break;

                case 'entity:result':
                  entityBufferRef.current.push(parsed);
                  scheduleFlush();
                  break;

                case 'fti:result':
                  ftiBufferRef.current.push(parsed);
                  scheduleFlush();
                  break;

                case 'fti:complete':
                  setFtiMeta(parsed);
                  setVariantsScreened(Array.isArray(parsed.variants_screened) ? parsed.variants_screened : []);
                  setDobEnforced(!!parsed.dob_enforced);
                  break;

                case 'financial:result':
                  financialBufferRef.current.push(parsed);
                  scheduleFlush();
                  break;

                case 'financial:complete':
                  setFinancialMeta(parsed);
                  break;

                case 'darkmon:result':
                  darkmonBufferRef.current.push(parsed);
                  scheduleFlush();
                  break;

                case 'darkmon:complete':
                  setDarkmonMeta(parsed);
                  break;

                case 'risk:score':
                  setRiskScore(parsed);
                  break;

                case 'profile:ready':
                  // Early profile emit — backend ships this right after
                  // CREDMON, before screening engines run, so the report
                  // shows subject identity without waiting on screening.
                  if (parsed.profile) setProfile(parsed.profile);
                  if (parsed.canonical_location) setCanonicalLocation(parsed.canonical_location);
                  if (parsed.canonical_name) setCanonicalName(parsed.canonical_name);
                  if (parsed.canonical_source) setCanonicalSource(parsed.canonical_source);
                  break;

                case 'summary':
                  setAiSummary(parsed.text || null);
                  if (parsed.profile) setProfile(parsed.profile);
                  if (parsed.canonical_location) setCanonicalLocation(parsed.canonical_location);
                  if (parsed.canonical_name) setCanonicalName(parsed.canonical_name);
                  if (parsed.canonical_source) setCanonicalSource(parsed.canonical_source);
                  break;

                case 'search:complete':
                  // Flush all buffered results before finalizing
                  if (rafRef.current) {
                    cancelAnimationFrame(rafRef.current);
                    rafRef.current = null;
                  }
                  flushAllBuffers();
                  searchCompleted = true;
                  setSearchMeta(prev => ({
                    ...(prev || {}),
                    total_time_ms: parsed.total_time_ms,
                    total_entities_searched: parsed.total_entities_searched,
                    total_found: parsed.total_found,
                    max_depth_reached: parsed.max_depth_reached,
                    reason: parsed.reason,
                  }));
                  setLoading(false);
                  break;
              }
            } catch {
              // Ignore parse errors on partial/malformed data
            }
            eventType = '';
          }
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      setError(e.message);
    } finally {
      if (!searchCompleted && !controller.signal.aborted && !authFailed) {
        setError('Search stream ended unexpectedly — results may be incomplete');
      }
      setLoading(false);
    }
  }, [scheduleFlush, flushAllBuffers, cancelBuffers]);

  const cancelSearch = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    cancelBuffers();
    setLoading(false);
    setError(null);
  }, [cancelBuffers]);

  const clearResults = useCallback(() => {
    cancelSearch();
    setResults([]);
    setFtiResults([]);
    setFtiMeta(null);
    setVariantsScreened([]);
    setDobEnforced(false);
    setDarkmonResults([]);
    setDarkmonMeta(null);
    setFinancialResults([]);
    setFinancialMeta(null);
    setAiSummary(null);
    setProfile(null);
    setCanonicalLocation(null);
    setCanonicalName(null);
    setCanonicalSource(null);
    setRiskScore(null);
    setSearchMeta(null);
  }, [cancelSearch]);

  return { results, ftiResults, ftiMeta, variantsScreened, dobEnforced, darkmonResults, darkmonMeta, financialResults, financialMeta, aiSummary, profile, canonicalLocation, canonicalName, canonicalSource, riskScore, loading, error, searchMeta, doSearch, cancelSearch, clearResults };
}
