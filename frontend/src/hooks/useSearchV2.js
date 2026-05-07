import { useState, useCallback, useRef } from 'react';
import { getAuthHeaders, clearToken } from '../lib/auth';

function onUnauthorized(res) {
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new Event('saptang-auth-failed'));
  }
}

/**
 * Hook for the v2 CREDMON breach search endpoint (POST /api/v2/search).
 *
 * Streams per-entity results via SSE.  Each `entity:result` event is appended
 * to the `results` array so the UI updates progressively.
 *
 * Also handles FTI (threat intelligence) screening events:
 *   fti:result    – individual screening match, appended to ftiResults
 *   fti:complete  – summary metadata for the screening phase
 *
 * Also handles DARKMON (dark web intelligence) events:
 *   darkmon:result   – individual username match, appended to darkmonResults
 *   darkmon:complete – summary metadata for the dark web phase
 *
 * Returns:
 *   results          – entity:result objects accumulated as they stream in
 *   ftiResults       – fti:result objects accumulated as they stream in
 *   ftiMeta          – populated on fti:complete
 *   darkmonResults   – darkmon:result objects accumulated as they stream in
 *   darkmonMeta      – populated on darkmon:complete
 *   loading          – true while SSE connection is open
 *   error            – error message string, or null
 *   searchMeta       – populated on search:complete
 *   doSearch(seeds, maxDepth) – starts a new search
 *   cancelSearch     – aborts the in-flight SSE
 *   clearResults     – resets all state
 */
export function useSearchV2() {
  const [results, setResults] = useState([]);
  const [ftiResults, setFtiResults] = useState([]);
  const [ftiMeta, setFtiMeta] = useState(null);
  const [darkmonResults, setDarkmonResults] = useState([]);
  const [darkmonMeta, setDarkmonMeta] = useState(null);
  const [financialResults, setFinancialResults] = useState([]);
  const [financialMeta, setFinancialMeta] = useState(null);
  const [aiSummary, setAiSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchMeta, setSearchMeta] = useState(null);
  const abortRef = useRef(null);

  const doSearch = useCallback(async (seeds, maxDepth = 5) => {
    if (!seeds || seeds.length === 0) return;

    // Abort any previous search
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setResults([]);
    setFtiResults([]);
    setFtiMeta(null);
    setDarkmonResults([]);
    setDarkmonMeta(null);
    setFinancialResults([]);
    setFinancialMeta(null);
    setAiSummary(null);
    setLoading(true);
    setError(null);
    setSearchMeta(null);

    try {
      const res = await fetch('/api/v2/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ seeds, max_depth: maxDepth }),
        signal: controller.signal,
      });

      onUnauthorized(res);
      if (!res.ok) {
        if (res.status === 401) return;
        throw new Error(`Search failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

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
                case 'search:start':
                  // Store seeds/max_depth as initial meta
                  setSearchMeta(prev => ({
                    ...(prev || {}),
                    seeds: parsed.seeds,
                    max_depth: parsed.max_depth,
                  }));
                  break;

                case 'entity:result':
                  // Append progressively — each event triggers a re-render
                  setResults(prev => [...prev, parsed]);
                  break;

                case 'fti:result':
                  setFtiResults(prev => [...prev, parsed]);
                  break;

                case 'fti:complete':
                  setFtiMeta(parsed);
                  break;

                case 'financial:result':
                  setFinancialResults(prev => [...prev, parsed]);
                  break;

                case 'financial:complete':
                  setFinancialMeta(parsed);
                  break;

                case 'darkmon:result':
                  setDarkmonResults(prev => [...prev, parsed]);
                  break;

                case 'darkmon:complete':
                  setDarkmonMeta(parsed);
                  break;

                case 'summary':
                  setAiSummary(parsed.text || null);
                  break;

                case 'search:complete':
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
      setLoading(false);
    }
  }, []);

  const cancelSearch = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setLoading(false);
    setError(null);
  }, []);

  const clearResults = useCallback(() => {
    cancelSearch();
    setResults([]);
    setFtiResults([]);
    setFtiMeta(null);
    setDarkmonResults([]);
    setDarkmonMeta(null);
    setFinancialResults([]);
    setFinancialMeta(null);
    setAiSummary(null);
    setSearchMeta(null);
  }, [cancelSearch]);

  return { results, ftiResults, ftiMeta, darkmonResults, darkmonMeta, financialResults, financialMeta, aiSummary, loading, error, searchMeta, doSearch, cancelSearch, clearResults };
}
