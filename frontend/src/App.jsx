import { useState, useCallback, useMemo } from 'react';
import Header from './components/Header';
import CommandBar from './components/CommandBar';
import StatusLine from './components/StatusLine';
import SubjectProfile from './components/SubjectProfile';
import FtiScreening from './components/FtiScreening';
import ClassificationBanner from './components/ClassificationBanner';
import TabStrip from './components/TabStrip';
import DashboardIdle from './components/DashboardIdle';
import OverviewTab from './tabs/OverviewTab';
import BreachesV2Tab from './tabs/BreachesV2Tab';
import DarkwebTab from './tabs/DarkwebTab';
import DrugsTab from './tabs/DrugsTab';
import TelegramTab from './tabs/TelegramTab';
import FinancialTab from './tabs/FinancialTab';
import GraphTab from './tabs/GraphTab';
import EcourtsTab from './tabs/EcourtsTab';
import { useSearchV2 } from './hooks/useSearchV2';
import { chooseCanonicalIdentity } from './lib/canonicalIdentity';
import { extractIdentifiers } from './lib/identifierExtract';
import { openReport } from './lib/reportGenerator';


function v2ToLegacyData(results, searchMeta, darkmonResults) {
  const breach = {
    results: results,
    total_searched: searchMeta?.total_entities_searched ?? results.length,
    total_found: searchMeta?.total_found ?? results.filter(r => r.found).length,
  };
  return {
    seed: searchMeta?.seeds?.[0] ?? null,
    max_depth: searchMeta?.max_depth ?? 5,
    total_time_ms: searchMeta?.total_time_ms ?? 0,
    timings: { credmon_ms: searchMeta?.total_time_ms ?? 0, parallel_ms: 0 },
    breach,
    threat_intel: {},
    darkweb: { entity_matches: { threads: [], posts: [] }, username_matches: darkmonResults || [] },
    discovered_entities: { emails: [], phones: [], usernames: [] },
  };
}

function renderTab(activeTab, data, results, onPivot, loading, ftiResults, onFocusEntity, focusedEntity, clearFocusedEntity, darkmonResults, darkmonMeta) {
  switch (activeTab) {
    case 'graph': return <GraphTab data={data} onPivot={onPivot} focusedEntity={focusedEntity} onClearFocus={clearFocusedEntity} />;
    case 'financial': return <FinancialTab data={data} financialResults={financialResults} financialMeta={financialMeta} />;
    case 'telegram': return <TelegramTab data={data} />;
    case 'breaches': return <BreachesV2Tab results={results} onPivot={onPivot} loading={loading} onFocusEntity={onFocusEntity} />;
    case 'darkweb': return <DarkwebTab data={data} onPivot={onPivot} darkmonResults={darkmonResults} darkmonMeta={darkmonMeta} />;
    case 'drugs': return <DrugsTab />;
    case 'ecourts': return <EcourtsTab />;
    default: return <OverviewTab data={data} results={results} onPivot={onPivot} ftiResults={ftiResults} />;
  }
}

function ScannerWait() {
  return (
    <div className="rounded-lg border border-sap-accent/25 p-8 max-w-xl">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-2 w-2 rounded-full bg-sap-accent shadow-[0_0_8px_#4f46e5] animate-pulse" />
        <h2 className="text-sm font-mono uppercase tracking-widest text-sap-accent">Subscribing to stream</h2>
      </div>
      <p className="text-sm text-sap-dim">Engines are handshaking. Results will appear as they arrive...</p>
    </div>
  );
}

export default function App() {
  const { results, ftiResults, ftiMeta, darkmonResults, darkmonMeta, financialResults, financialMeta, aiSummary, loading, error, searchMeta, doSearch, cancelSearch, clearResults } = useSearchV2();
  const [activeTab, setActiveTab] = useState('overview');
  const [focusedEntity, setFocusedEntity] = useState(null);   // { type, value } | null

  const handleFocusEntity = useCallback((type, value) => {
    if (!type || !value) return;
    setFocusedEntity({ type, value });
    setActiveTab('graph');
  }, []);

  const clearFocusedEntity = useCallback(() => setFocusedEntity(null), []);

  const hasResults = results.length > 0;
  const data = useMemo(
    () => hasResults ? v2ToLegacyData(results, searchMeta, darkmonResults) : null,
    [results, searchMeta, darkmonResults, hasResults],
  );

  const canonical = useMemo(() => {
    const ids = extractIdentifiers(results || []);
    return chooseCanonicalIdentity({
      names: ids.names,
      usernames: ids.usernames,
      emails: ids.emails,
    });
  }, [results]);

  // Watchlist filter: every significant token of the canonical name (e.g.
  // ["saikrishna", "budamgunta"]) must appear in both the search term and
  // the matched record's name. Substring-on-first-name-only leaks namesakes
  // from the same regional community (DASARI, Saikrishna · MUMMALANENI,
  // Saikrishna · REDDY, Budamgunta Ravi Kumar). All-tokens-present is the
  // closest we get to exact-name-match without breaking on "LAST, FIRST"
  // ordering vs "First Last" ordering — order-independent intersection.
  const watchlistFilterTokens = useMemo(() => {
    const src = canonical?.canonical || canonical?.anchor || '';
    return String(src)
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(t => t.length >= 3 && !/^\d/.test(t));
  }, [canonical]);

  const handleSearch = useCallback((seeds) => {
    setActiveTab('overview');
    setFocusedEntity(null);
    doSearch(seeds, 5);
  }, [doSearch]);

  const handleExportReport = useCallback(() => {
    openReport({ results, searchMeta, ftiResults, darkmonResults, financialResults, aiSummary });
  }, [results, searchMeta, ftiResults, darkmonResults, financialResults, aiSummary]);

  const handlePivot = useCallback((type, value) => {
    CommandBar._setSearch?.(type, value);
    handleSearch([{ type, value: value.trim() }]);
  }, [handleSearch]);

  const renderBody = () => {
    if (error) {
      return (
        <div className="rounded-lg border border-entity-drug/40 p-8 text-center max-w-lg mx-auto">
          <p className="text-entity-drug font-mono text-sm">Error: {error}</p>
        </div>
      );
    }
    if (activeTab === 'drugs') return <DrugsTab />;
    if (activeTab === 'financial') return <FinancialTab data={data} financialResults={financialResults} financialMeta={financialMeta} />;
    if (activeTab === 'darkweb') return <DarkwebTab data={data} onPivot={handlePivot} darkmonResults={darkmonResults} darkmonMeta={darkmonMeta} />;
    if (activeTab === 'ecourts') return <EcourtsTab />;
    if (activeTab === 'graph') return <GraphTab data={data} onPivot={handlePivot} focusedEntity={focusedEntity} onClearFocus={clearFocusedEntity} />;
    if (loading && !hasResults) return <ScannerWait />;
    if (!hasResults && !loading) return <DashboardIdle />;
    if (hasResults) return renderTab(activeTab, data, results, handlePivot, loading, ftiResults, handleFocusEntity, focusedEntity, clearFocusedEntity, darkmonResults, darkmonMeta);
    return null;
  };

  return (
    <div className="h-screen min-h-0 flex flex-col overflow-hidden bg-sap-bg text-sap-text font-sans">
      <ClassificationBanner />
      <Header data={data} onExportPDF={hasResults && !loading ? handleExportReport : null} />
      <div className="shrink-0 px-4 sm:px-5 pt-3 pb-2 space-y-2">
        <CommandBar
          onSearch={handleSearch}
          loading={loading}
          onCancel={cancelSearch}
          onClear={clearResults}
          collapsed={hasResults}
          activeSeeds={searchMeta?.seeds ?? []}
        />
        <StatusLine visible={loading} results={results} searchMeta={searchMeta} />
      </div>
      <TabStrip
        activeTab={activeTab}
        onTabChange={setActiveTab}
        results={results}
        hasResults={hasResults}
      />
      <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
        {hasResults && activeTab === 'overview' && <SubjectProfile results={results} loading={loading} onFocusEntity={handleFocusEntity} onSwitchTab={setActiveTab} aiSummary={aiSummary} />}
        {(ftiResults.length > 0 || ftiMeta) && activeTab === 'overview' && <FtiScreening ftiResults={ftiResults} ftiMeta={ftiMeta} loading={loading} canonicalTokens={watchlistFilterTokens} canonicalName={canonical?.canonical || null} />}
        {renderBody()}
      </main>
    </div>
  );
}
