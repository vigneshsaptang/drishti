import { useState, useCallback, useRef } from 'react';
import { getAuthHeaders, clearToken } from '../lib/auth';

function onUnauthorized(res) {
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new Event('saptang-auth-failed'));
  }
}

export function useSearch() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('');
  const abortRef = useRef(null);

  const doSearch = useCallback(async (type, value, maxDepth = 2) => {
    if (!value?.trim()) return;

    // Abort any previous search
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setStatus('Initializing search engines...');

    // Build partial data as SSE events arrive
    const partial = {
      seed: { type, value: value.trim() },
      max_depth: maxDepth,
      total_time_ms: 0,
      timings: { credmon_ms: 0, parallel_ms: 0 },
      breach: { results: [], total_searched: 0, total_found: 0 },
      threat_intel: {},
      darkweb: { entity_matches: { threads: [], posts: [] }, username_matches: [] },
      discovered_entities: { emails: [], phones: [], usernames: [] },
    };

    try {
      const res = await fetch('/api/stream/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ type, value: value.trim(), max_depth: maxDepth }),
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
        const { done, value: chunk } = await reader.read();
        if (done) break;

        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line

        let eventType = '';
        let eventData = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6);
            // Process event
            try {
              const parsed = JSON.parse(eventData);
              switch (eventType) {
                case 'status':
                  setStatus(parsed.message || '');
                  break;
                case 'breach':
                  partial.breach = {
                    results: parsed.results,
                    total_searched: parsed.total_searched,
                    total_found: parsed.total_found,
                  };
                  partial.timings.credmon_ms = parsed.time_ms;
                  partial.discovered_entities = parsed.discovered || partial.discovered_entities;
                  setData({ ...partial });
                  break;
                case 'threat_intel':
                  partial.threat_intel = parsed;
                  setData({ ...partial });
                  break;
                case 'darkweb':
                  partial.darkweb = parsed;
                  setData({ ...partial });
                  break;
                case 'complete':
                  partial.total_time_ms = parsed.total_time_ms;
                  partial.timings.credmon_ms = parsed.credmon_ms;
                  setData({ ...partial });
                  break;
              }
            } catch {
              // Ignore parse errors on partial data
            }
            eventType = '';
            eventData = '';
          }
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      // Fallback to non-streaming search
      console.warn('SSE failed, falling back to POST /api/search:', e.message);
      setStatus('Searching (fallback mode)...');
      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ type, value: value.trim(), max_depth: maxDepth }),
          signal: controller.signal,
        });
        onUnauthorized(res);
        if (!res.ok) {
          if (res.status === 401) return;
          throw new Error(`Search failed: ${res.status}`);
        }
        const result = await res.json();
        setData(result);
      } catch (e2) {
        if (e2.name !== 'AbortError') setError(e2.message);
      }
    } finally {
      setLoading(false);
      setStatus('');
    }
  }, []);

  const cancelSearch = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setLoading(false);
    setStatus('');
    setError(null);
  }, []);

  const clearResults = useCallback(() => {
    cancelSearch();
    setData(null);
  }, [cancelSearch]);

  return { data, loading, error, status, doSearch, cancelSearch, clearResults };
}
