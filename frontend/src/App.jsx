import { useState, useCallback, useMemo } from 'react';
import Header from './components/Header';
import CommandBar from './components/CommandBar';
import StatusLine from './components/StatusLine';
import SubjectProfile from './components/SubjectProfile';
import FtiScreening from './components/FtiScreening';
import ClassificationBanner from './components/ClassificationBanner';
import TabStrip from './components/TabStrip';
import DashboardIdle from './components/DashboardIdle';
import ProfileDialog from './components/ProfileDialog';
import SessionList from './components/SessionList';
import ApiKeyManager from './components/ApiKeyManager';
import CreditPanel from './components/CreditPanel';
import FeedbackFab from './components/FeedbackFab';
import FeedbackModal from './components/FeedbackModal';
import MyTickets from './components/MyTickets';
import FaqPage from './components/FaqPage';
import StatusPage from './components/StatusPage';
import HealthDashboard from './components/HealthDashboard';
import AdminUsers from './pages/AdminUsers';
import AdminConfig from './pages/AdminConfig';
import AdminAuditLog from './pages/AdminAuditLog';
import AdminRoles from './pages/AdminRoles';
import AdminCredits from './pages/AdminCredits';
import TicketManager from './admin/TicketManager';
import FaqManager from './admin/FaqManager';
import StatusManager from './admin/StatusManager';
import { PermissionProvider } from './lib/permissions';
import { getUser } from './lib/auth';
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
import { useNotifications } from './hooks/useNotifications';
import ErrorBoundary from './components/ErrorBoundary';


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

function renderTab(activeTab, data, results, onPivot, loading, ftiResults, onFocusEntity, focusedEntity, clearFocusedEntity, darkmonResults, darkmonMeta, financialResults, financialMeta) {
  switch (activeTab) {
    case 'graph': return <ErrorBoundary name="GraphTab"><GraphTab data={data} onPivot={onPivot} focusedEntity={focusedEntity} onClearFocus={clearFocusedEntity} /></ErrorBoundary>;
    case 'financial': return <ErrorBoundary name="FinancialTab"><FinancialTab financialResults={financialResults} financialMeta={financialMeta} /></ErrorBoundary>;
    case 'telegram': return <ErrorBoundary name="TelegramTab"><TelegramTab data={data} /></ErrorBoundary>;
    case 'breaches': return <ErrorBoundary name="BreachesV2Tab"><BreachesV2Tab results={results} onPivot={onPivot} loading={loading} onFocusEntity={onFocusEntity} /></ErrorBoundary>;
    case 'darkweb': return <ErrorBoundary name="DarkwebTab"><DarkwebTab data={data} onPivot={onPivot} darkmonResults={darkmonResults} darkmonMeta={darkmonMeta} /></ErrorBoundary>;
    case 'drugs': return <ErrorBoundary name="DrugsTab"><DrugsTab /></ErrorBoundary>;
    case 'ecourts': return <ErrorBoundary name="EcourtsTab"><EcourtsTab /></ErrorBoundary>;
    default: return <ErrorBoundary name="OverviewTab"><OverviewTab data={data} results={results} onPivot={onPivot} ftiResults={ftiResults} /></ErrorBoundary>;
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
  const [overlay, setOverlay] = useState(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const { unreadCount, notifications: notifList, loading: notifLoading, fetchNotifications, markRead, markAllRead } = useNotifications();

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

  const [currentEngines, setCurrentEngines] = useState(null);

  const handleSearch = useCallback((seeds, engines = null) => {
    setCurrentEngines(engines);
    setActiveTab('overview');
    setFocusedEntity(null);
    doSearch(seeds, 2, engines);
  }, [doSearch]);

  const handleExportReport = useCallback(() => {
    openReport({ results, searchMeta, ftiResults, darkmonResults, financialResults, aiSummary });
  }, [results, searchMeta, ftiResults, darkmonResults, financialResults, aiSummary]);

  const handlePivot = useCallback((type, value) => {
    CommandBar._setSearch?.(type, value);
    handleSearch([{ type, value: value.trim() }], currentEngines);
  }, [handleSearch, currentEngines]);

  const renderBody = () => {
    if (error) {
      return (
        <div className="rounded-lg border border-entity-drug/40 p-8 text-center max-w-lg mx-auto">
          <p className="text-entity-drug font-mono text-sm">Error: {error}</p>
        </div>
      );
    }
    if (activeTab === 'drugs') return <ErrorBoundary name="DrugsTab"><DrugsTab /></ErrorBoundary>;
    if (activeTab === 'financial') return <ErrorBoundary name="FinancialTab"><FinancialTab financialResults={financialResults} financialMeta={financialMeta} /></ErrorBoundary>;
    if (activeTab === 'darkweb') return <ErrorBoundary name="DarkwebTab"><DarkwebTab data={data} onPivot={handlePivot} darkmonResults={darkmonResults} darkmonMeta={darkmonMeta} /></ErrorBoundary>;
    if (activeTab === 'ecourts') return <ErrorBoundary name="EcourtsTab"><EcourtsTab /></ErrorBoundary>;
    if (activeTab === 'graph') return <ErrorBoundary name="GraphTab"><GraphTab data={data} onPivot={handlePivot} focusedEntity={focusedEntity} onClearFocus={clearFocusedEntity} /></ErrorBoundary>;
    if (loading && !hasResults) return <ScannerWait />;
    if (!hasResults && !loading) return <DashboardIdle />;
    if (hasResults) return renderTab(activeTab, data, results, handlePivot, loading, ftiResults, handleFocusEntity, focusedEntity, clearFocusedEntity, darkmonResults, darkmonMeta, financialResults, financialMeta);
    return null;
  };

  const currentUser = useMemo(() => getUser(), []);

  return (
    <PermissionProvider user={currentUser}>
    <div className="h-screen min-h-0 flex flex-col overflow-hidden bg-sap-bg text-sap-text font-sans">
      <ClassificationBanner />
      <Header
        data={data}
        onExportPDF={hasResults && !loading ? handleExportReport : null}
        onShowProfile={() => setOverlay('profile')}
        onShowSessions={() => setOverlay('sessions')}
        onShowApiKeys={() => setOverlay('apikeys')}
        onShowAdmin={() => setOverlay('admin-users')}
        onShowCredits={() => setOverlay('credits')}
        notifications={{
          unreadCount, notifList, notifLoading, fetchNotifications, markRead, markAllRead,
          onNotificationClick: (n) => { if (n.link?.target === 'ticket_detail') setOverlay('my-tickets'); },
          onViewAllTickets: () => setOverlay('my-tickets'),
        }}
      />
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
        {hasResults && activeTab === 'overview' && <ErrorBoundary name="SubjectProfile"><SubjectProfile results={results} loading={loading} onFocusEntity={handleFocusEntity} onSwitchTab={setActiveTab} aiSummary={aiSummary} canonical={canonical} /></ErrorBoundary>}
        {(ftiResults.length > 0 || ftiMeta) && activeTab === 'overview' && <ErrorBoundary name="FtiScreening"><FtiScreening ftiResults={ftiResults} ftiMeta={ftiMeta} loading={loading} canonicalTokens={watchlistFilterTokens} canonicalName={canonical?.canonical || null} /></ErrorBoundary>}
        {renderBody()}
      </main>

      {overlay === 'profile' && <ProfileDialog onClose={() => setOverlay(null)} />}
      {overlay === 'sessions' && <SessionList onClose={() => setOverlay(null)} />}
      {overlay === 'apikeys' && <ApiKeyManager onClose={() => setOverlay(null)} />}
      {overlay === 'admin-users' && <AdminUsers onClose={() => setOverlay(null)} onNavigate={setOverlay} />}
      {overlay === 'admin-config' && <AdminConfig onClose={() => setOverlay(null)} onNavigate={setOverlay} />}
      {overlay === 'admin-audit' && <AdminAuditLog onClose={() => setOverlay(null)} onNavigate={setOverlay} />}
      {overlay === 'admin-roles' && <AdminRoles onClose={() => setOverlay(null)} onNavigate={setOverlay} />}
      {overlay === 'admin-credits' && <AdminCredits onClose={() => setOverlay(null)} onNavigate={setOverlay} />}
      {overlay === 'credits' && <CreditPanel onClose={() => setOverlay(null)} />}
      {overlay === 'my-tickets' && <MyTickets isOpen onClose={() => setOverlay(null)} />}
      {overlay === 'faq' && <FaqPage isOpen onClose={() => setOverlay(null)} onOpenFeedback={() => { setOverlay(null); setFeedbackOpen(true); }} />}
      {overlay === 'status' && <StatusPage isOpen onClose={() => setOverlay(null)} />}
      {overlay === 'admin-tickets' && <TicketManager />}
      {overlay === 'admin-faq' && <FaqManager />}
      {overlay === 'admin-status' && <StatusManager />}
      {overlay === 'health' && <ErrorBoundary name="HealthDashboard"><HealthDashboard onClose={() => setOverlay(null)} /></ErrorBoundary>}

      <FeedbackFab onClick={() => setFeedbackOpen(true)} unreadCount={unreadCount} />
      <FeedbackModal
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        activeTab={activeTab}
        onOpenTickets={() => { setFeedbackOpen(false); setOverlay('my-tickets'); }}
      />
    </div>
    </PermissionProvider>
  );
}
