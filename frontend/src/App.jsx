import { useState, useCallback, useMemo, lazy, Suspense } from 'react';

// Keep static: shell components always visible
import Header from './components/Header';
import CommandBar from './components/CommandBar';
import ClassificationBanner from './components/ClassificationBanner';
import TabStrip from './components/TabStrip';
import DashboardIdle from './components/DashboardIdle';
import FeedbackFab from './components/FeedbackFab';
import FeedbackModal from './components/FeedbackModal';
import ErrorBoundary from './components/ErrorBoundary';

// Keep static: ReportView is the default view (always shown first)
import ReportView from './views/ReportView';

// Lazy: views loaded on demand
const EvidenceView = lazy(() => import('./views/EvidenceView'));
const ToolsView = lazy(() => import('./views/ToolsView'));

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

export default function App() {
  const { results, ftiResults, ftiMeta, variantsScreened, dobEnforced, darkmonResults, darkmonMeta, financialResults, financialMeta, aiSummary, profile, canonicalLocation, canonicalName, canonicalSource, riskScore, loading, error, searchMeta, doSearch, cancelSearch, clearResults } = useSearchV2();
  const [activeTab, setActiveTab] = useState('report');
  const [focusedEntity, setFocusedEntity] = useState(null);
  const [overlay, setOverlay] = useState(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const { unreadCount, notifications: notifList, loading: notifLoading, fetchNotifications, markRead, markAllRead } = useNotifications();

  const handleFocusEntity = useCallback((type, value) => {
    if (!type || !value) return;
    setFocusedEntity({ type, value });
    setActiveTab('evidence');
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

  const watchlistFilterTokens = useMemo(() => {
    const explicit = String(canonicalName || '').trim();
    if (explicit) {
      return explicit
        .toLowerCase()
        .split(/[\s,]+/)
        .filter(t => t.length >= 2 && !/^\d/.test(t));
    }
    const src = canonical?.canonical || canonical?.anchor || '';
    return String(src)
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(t => t.length >= 3 && !/^\d/.test(t));
  }, [canonical, canonicalName]);

  const [currentEngines, setCurrentEngines] = useState(null);

  const handleSearch = useCallback((seeds, engines = null, subject = null) => {
    setCurrentEngines(engines);
    setActiveTab('report');
    setFocusedEntity(null);
    doSearch(seeds, 2, engines, subject);
  }, [doSearch]);

  const handleExportReport = useCallback(() => {
    openReport({ results, searchMeta, ftiResults, darkmonResults, financialResults, aiSummary });
  }, [results, searchMeta, ftiResults, darkmonResults, financialResults, aiSummary]);

  const handlePivot = useCallback((type, value) => {
    CommandBar._setSearch?.(type, value);
    handleSearch([{ type, value: value.trim() }], currentEngines);
  }, [handleSearch, currentEngines]);

  const hasBreachData = results.some(r => r.found && !r.skipped);

  const renderBody = () => {
    if (error) {
      return (
        <div className="rounded-lg border border-entity-drug/40 p-8 text-center max-w-lg mx-auto">
          <p className="text-entity-drug font-mono text-sm">Error: {error}</p>
        </div>
      );
    }

    if (activeTab === 'tools') {
      return (
        <Suspense fallback={<LazyFallback />}>
          <ToolsView
            financialResults={financialResults}
            financialMeta={financialMeta}
          />
        </Suspense>
      );
    }

    // While loading without results: fall through to the active tab — the
    // ReportProgress card inside ReportView shows the streaming phase;
    // Evidence/Tools render with their own empty/loading states.
    if (!hasResults && !loading) return <DashboardIdle />;

    if (activeTab === 'evidence') {
      return (
        <Suspense fallback={<LazyFallback />}>
          <EvidenceView
            results={results}
            data={data}
            loading={loading}
            onPivot={handlePivot}
            onFocusEntity={handleFocusEntity}
            focusedEntity={focusedEntity}
            clearFocusedEntity={clearFocusedEntity}
            hasBreachData={hasBreachData}
          />
        </Suspense>
      );
    }

    // Default: Report view
    return (
      <ReportView
        results={results}
        data={data}
        loading={loading}
        aiSummary={aiSummary}
        riskScore={riskScore}
        canonical={canonical}
        canonicalName={canonicalName}
        canonicalSource={canonicalSource}
        watchlistFilterTokens={watchlistFilterTokens}
        profile={profile}
        canonicalLocation={canonicalLocation}
        ftiResults={ftiResults}
        ftiMeta={ftiMeta}
        variantsScreened={variantsScreened}
        dobEnforced={dobEnforced}
        darkmonResults={darkmonResults}
        darkmonMeta={darkmonMeta}
        financialResults={financialResults}
        onPivot={handlePivot}
        onFocusEntity={handleFocusEntity}
        onSwitchTab={setActiveTab}
      />
    );
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
      </div>
      <TabStrip
        activeTab={activeTab}
        onTabChange={setActiveTab}
        results={results}
        darkmonResults={darkmonResults}
      />
      <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
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
