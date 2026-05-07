export default function V2StatsBar({ results, searchMeta, loading }) {
  if (!results || results.length === 0) return null;

  const totalSearched = searchMeta?.total_entities_searched ?? results.length;
  const totalFound = searchMeta?.total_found ?? results.filter(r => r.found).length;

  let sourceCount = 0;
  results.forEach(r => { sourceCount += (r.sources || []).length; });

  const totalTime = searchMeta?.total_time_ms ?? null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-sap-accent animate-pulse" />
        <p className="text-sm text-sap-dim">
          Traced <span className="font-mono font-semibold text-sap-text">{totalSearched}</span> entities so far, found matches for <span className="font-mono font-semibold text-sap-text">{totalFound}</span> across <span className="font-mono font-semibold text-sap-text">{sourceCount}</span> breach sources...
        </p>
      </div>
    );
  }

  return (
    <p className="text-sm text-sap-dim px-1 py-1.5">
      Traced <span className="font-mono font-semibold text-sap-text">{totalSearched}</span> entities across <span className="font-mono font-semibold text-sap-text">{sourceCount}</span> breach sources — <span className="font-mono font-semibold text-sap-text">{totalFound}</span> returned data{totalTime != null && <> in <span className="font-mono font-semibold text-sap-text">{(totalTime / 1000).toFixed(1)}s</span></>}.
    </p>
  );
}
