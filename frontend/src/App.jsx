import { useState, useCallback, useMemo, lazy, Suspense } from 'react';

// Keep static: shell components always visible
import Header from './components/Header';
import CommandBar from './components/CommandBar';
import StatusLine from './components/StatusLine';
import SubjectProfile from './components/SubjectProfile';
import FtiScreening from './components/FtiScreening';
import ClassificationBanner from './components/ClassificationBanner';
import TabStrip from './components/TabStrip';
import DashboardIdle from './components/DashboardIdle';
import FeedbackFab from './components/FeedbackFab';
import FeedbackModal from './components/FeedbackModal';
import ErrorBoundary from './components/ErrorBoundary';

// Keep static: OverviewTab is the default tab (always shown first)
import OverviewTab from './tabs/OverviewTab';

// Lazy: tabs loaded on demand
const BreachesV2Tab = lazy(() => import('./tabs/BreachesV2Tab'));
const DarkwebTab = lazy(() => import('./tabs/DarkwebTab'));
const DrugsTab = lazy(() => import('./tabs/DrugsTab'));
const TelegramTab = lazy(() => import('./tabs/TelegramTab'));
const FinancialTab = lazy(() => import('./tabs/FinancialTab'));
const GraphTab = lazy(() => import('./tabs/GraphTab'));
const EcourtsTab = lazy(() => import('./tabs/EcourtsTab'));

// Lazy: overlays/admin (rarely accessed)
const ProfileDialog = lazy(() => import('./components/ProfileDialog'));
const SessionList = lazy(() => import('./components/SessionList'));
const ApiKeyManager = lazy(() => import('./components/ApiKeyManager'));
const CreditPanel = lazy(() => import('./components/CreditPanel'));
const MyTickets = lazy(() => import('./components/MyTickets'));
const FaqPage = lazy(() => import('./components/FaqPage'));
const StatusPage = lazy(() => import('./components/StatusPage'));
const HealthDashboard = lazy(() => import('./components/HealthDashboard'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const AdminConfig = lazy(() => import('./pages/AdminConfig'));
const AdminAuditLog = lazy(() => import('./pages/AdminAuditLog'));
const AdminRoles = lazy(() => import('./pages/AdminRoles'));
const AdminCredits = lazy(() => import('./pages/AdminCredits'));
const TicketManager = lazy(() => import('./admin/TicketManager'));
const FaqManager = lazy(() => import('./admin/FaqManager'));
const StatusManager = lazy(() => import('./admin/StatusManager'));

import { PermissionProvider } from './lib/permissions';
import { getUser } from './lib/auth';
import { useSearchV2 } from './hooks/useSearchV2';
import { chooseCanonicalIdentity } from './lib/canonicalIdentity';
import { extractIdentifiers } from './lib/identifierExtract';
import { openReport } from './lib/reportGenerator';
import { useNotifications } from './hooks/useNotifications';


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

function LazyFallback() {
  return (
    <div className="flex items-center justify-center p-12">
      <div className="h-2 w-2 rounded-full bg-sap-accent animate-pulse" />
      <span className="ml-3 text-xs font-mono text-sap-dim">Loading module...</span>
    </div>
  );
}

function renderTab(activeTab, data, results, onPivot, loading, ftiResults, onFocusEntity, focusedEntity, clearFocusedEntity, darkmonResults, darkmonMeta, financialResults, financialMeta) {
  let tab;
  switch (activeTab) {
    case 'graph': tab = <ErrorBoundary name="GraphTab"><GraphTab data={data} onPivot={onPivot} focusedEntity={focusedEntity} onClearFocus={clearFocusedEntity} /></ErrorBoundary>; break;
    case 'financial': tab = <ErrorBoundary name="FinancialTab"><FinancialTab financialResults={financialResults} financialMeta={financialMeta} /></ErrorBoundary>; break;
    case 'telegram': tab = <ErrorBoundary name="TelegramTab"><TelegramTab data={data} /></ErrorBoundary>; break;
    case 'breaches': tab = <ErrorBoundary name="BreachesV2Tab"><BreachesV2Tab results={results} onPivot={onPivot} loading={loading} onFocusEntity={onFocusEntity} /></ErrorBoundary>; break;
    case 'darkweb': tab = <ErrorBoundary name="DarkwebTab"><DarkwebTab data={data} onPivot={onPivot} darkmonResults={darkmonResults} darkmonMeta={darkmonMeta} /></ErrorBoundary>; break;
    case 'drugs': tab = <ErrorBoundary name="DrugsTab"><DrugsTab /></ErrorBoundary>; break;
    case 'ecourts': tab = <ErrorBoundary name="EcourtsTab"><EcourtsTab /></ErrorBoundary>; break;
    default: tab = <ErrorBoundary name="OverviewTab"><OverviewTab data={data} results={results} onPivot={onPivot} ftiResults={ftiResults} /></ErrorBoundary>; break;
  }
  return <Suspense fallback={<LazyFallback />}>{tab}</Suspense>;
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
    if (activeTab === 'drugs') return <Suspense fallback={<LazyFallback />}><ErrorBoundary name="DrugsTab"><DrugsTab /></ErrorBoundary></Suspense>;
    if (activeTab === 'financial') return <Suspense fallback={<LazyFallback />}><ErrorBoundary name="FinancialTab"><FinancialTab financialResults={financialResults} financialMeta={financialMeta} /></ErrorBoundary></Suspense>;
    if (activeTab === 'darkweb') return <Suspense fallback={<LazyFallback />}><ErrorBoundary name="DarkwebTab"><DarkwebTab data={data} onPivot={handlePivot} darkmonResults={darkmonResults} darkmonMeta={darkmonMeta} /></ErrorBoundary></Suspense>;
    if (activeTab === 'ecourts') return <Suspense fallback={<LazyFallback />}><ErrorBoundary name="EcourtsTab"><EcourtsTab /></ErrorBoundary></Suspense>;
    if (activeTab === 'graph') return <Suspense fallback={<LazyFallback />}><ErrorBoundary name="GraphTab"><GraphTab data={data} onPivot={handlePivot} focusedEntity={focusedEntity} onClearFocus={clearFocusedEntity} /></ErrorBoundary></Suspense>;
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

      <Suspense fallback={<LazyFallback />}>
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
      </Suspense>

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
