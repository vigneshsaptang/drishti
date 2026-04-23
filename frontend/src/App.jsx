import { useState, useCallback } from 'react';
import Header from './components/Header';
import CommandBar from './components/CommandBar';
import StatusLine from './components/StatusLine';
import StatsBar from './components/StatsBar';
import ClassificationBanner from './components/ClassificationBanner';
import SidebarNav from './components/SidebarNav';
import DashboardIdle from './components/DashboardIdle';
import ModuleWaitPlaceholder from './components/ModuleWaitPlaceholder';
import OverviewTab from './tabs/OverviewTab';
import BreachesTab from './tabs/BreachesTab';
import DarkwebTab from './tabs/DarkwebTab';
import DrugsTab from './tabs/DrugsTab';
import TelegramTab from './tabs/TelegramTab';
import FinancialTab from './tabs/FinancialTab';
import GraphTab from './tabs/GraphTab';
import { useSearch } from './hooks/useSearch';

function resultWithData(data, onPivot, activeTab) {
  if (activeTab === 'graph') return <GraphTab data={data} />;
  if (activeTab === 'financial') return <FinancialTab data={data} />;
  if (activeTab === 'telegram') return <TelegramTab data={data} />;
  if (activeTab === 'breaches') return <BreachesTab data={data} onPivot={onPivot} />;
  if (activeTab === 'darkweb') return <DarkwebTab data={data} onPivot={onPivot} />;
  return <OverviewTab data={data} onPivot={onPivot} />;
}

function ScannerWait() {
  return (
    <div className="tactical-surface rounded-lg border border-sap-accent/25 p-8 max-w-xl">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-2 w-2 rounded-full bg-sap-accent shadow-[0_0_8px_#3b82f6] animate-pulse" />
        <h2 className="text-sm font-mono uppercase tracking-widest text-sap-accent">Subscribing to stream</h2>
      </div>
      <p className="text-sm text-sap-dim">Engines are handshaking. Partial breach and FTI results will materialize in place as they arrive…</p>
    </div>
  );
}

export default function App() {
  const { data, loading, error, status, doSearch } = useSearch();
  const [activeTab, setActiveTab] = useState('overview');

  const handleSearch = useCallback((type, value, depth) => {
    setActiveTab('overview');
    doSearch(type, value, depth);
  }, [doSearch]);

  const handlePivot = useCallback((type, value) => {
    CommandBar._setSearch?.(type, value);
    handleSearch(type, value, 2);
  }, [handleSearch]);

  const renderBody = () => {
    if (error) {
      return (
        <div className="tactical-surface rounded-lg border border-entity-drug/40 p-8 text-center max-w-lg mx-auto">
          <p className="text-entity-drug font-mono text-sm">Error: {error}</p>
        </div>
      );
    }
    // Standalone tabs — work without a search
    if (activeTab === 'drugs') {
      return <DrugsTab />;
    }
    if (loading && !data) {
      return <ScannerWait />;
    }
    if (!data && !loading) {
      return activeTab === 'overview' ? <DashboardIdle /> : <ModuleWaitPlaceholder activeTab={activeTab} />;
    }
    if (data) {
      return resultWithData(data, handlePivot, activeTab);
    }
    return null;
  };

  return (
    <div className="h-screen min-h-0 flex flex-col bg-sap-bg text-sap-text font-sans">
      <ClassificationBanner />
      <div className="flex flex-1 min-h-0">
        <SidebarNav activeTab={activeTab} onTabChange={setActiveTab} />
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <Header data={data} />
          <div className="shrink-0 px-4 sm:px-5 pt-4 space-y-3">
            <CommandBar onSearch={handleSearch} loading={loading} />
            <StatusLine visible={loading} message={status} />
            {data && <StatsBar data={data} />}
          </div>
          <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 tactical-surface border-t border-sap-border/50">
            {renderBody()}
          </main>
        </div>
      </div>
    </div>
  );
}
