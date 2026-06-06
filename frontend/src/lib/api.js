import { clearTokens, getAuthHeaders, refreshAccessToken } from './auth';

const API = '/api';

let _creditUpdateCallback = null;

export function setCreditUpdateCallback(fn) {
  _creditUpdateCallback = fn;
}

export function notifyCreditUpdate({ remaining, deducted, warning }) {
  if (_creditUpdateCallback) {
    _creditUpdateCallback({ remaining, deducted, warning });
  }
}

async function apiFetch(path, options = {}, _retried = false) {
  const res = await fetch(path, {
    ...options,
    headers: { ...getAuthHeaders(), ...options.headers },
  });

  if (res.status === 401 && !_retried) {
    try {
      await refreshAccessToken();
      return apiFetch(path, options, true);
    } catch {
      clearTokens();
      window.dispatchEvent(new Event('saptang-auth-failed'));
    }
  }

  if (_creditUpdateCallback) {
    const remaining = res.headers.get('X-Credits-Remaining');
    const deducted = res.headers.get('X-Credits-Deducted');
    const warning = res.headers.get('X-Credits-Warning');
    if (remaining !== null) {
      _creditUpdateCallback({ remaining: parseInt(remaining, 10), deducted: deducted ? parseInt(deducted, 10) : 0, warning });
    }
  }

  return res;
}

export async function search(type, value, maxDepth = 2) {
  const res = await apiFetch(`${API}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, value, max_depth: maxDepth }),
  });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

export async function getDrugStats() {
  const res = await apiFetch(`${API}/drugs/stats`);
  return res.json();
}

export async function getIndiaVendors() {
  const res = await apiFetch(`${API}/drugs/india`);
  return res.json();
}

export async function searchDrugs(q, shippingFrom) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (shippingFrom) params.set('shipping_from', shippingFrom);
  const res = await apiFetch(`${API}/drugs/search?${params}`);
  return res.json();
}

export async function getTelegramMentions(phone) {
  const res = await apiFetch(`${API}/telegram/mentions/${phone}`);
  return res.json();
}

export async function searchTelegramMessages(q) {
  const res = await apiFetch(`${API}/telegram/search?q=${encodeURIComponent(q)}`);
  return res.json();
}

export async function getDarkwebAuthor(username) {
  const res = await apiFetch(`${API}/darkweb/author/${encodeURIComponent(username)}`);
  return res.json();
}

export async function searchDread(q) {
  const res = await apiFetch(`${API}/darkweb/dread?q=${encodeURIComponent(q)}`);
  return res.json();
}

export async function getDarkwebOverview() {
  const res = await apiFetch(`${API}/darkweb/overview`);
  return res.json();
}

export async function getWallet(address) {
  const res = await apiFetch(`${API}/darkweb/wallet/${address}`);
  return res.json();
}

export async function getUpiByPhone(phone) {
  const res = await apiFetch(`${API}/financial/upi/${phone}`);
  return res.json();
}

export async function screenWatchlist(name) {
  const res = await apiFetch(`${API}/financial/screen/${encodeURIComponent(name)}`);
  return res.json();
}

export async function getCryptoTrace(address) {
  const res = await apiFetch(`${API}/financial/crypto/${address}`);
  return res.json();
}

export async function listFraudUpis(limit = 50, classification = '') {
  const params = new URLSearchParams({ limit: String(limit) });
  if (classification) params.set('classification', classification);
  const res = await apiFetch(`${API}/financial/fraud-upis?${params}`);
  return res.json();
}

export async function listBankAccounts(limit = 50) {
  const res = await apiFetch(`${API}/financial/bank-accounts?limit=${limit}`);
  return res.json();
}

export async function listCryptoWallets(limit = 50, search = '') {
  const params = new URLSearchParams({ limit: String(limit) });
  if (search) params.set('search', search);
  const res = await apiFetch(`${API}/financial/crypto-wallets?${params}`);
  return res.json();
}

export async function buildGraph(searchResults) {
  const res = await apiFetch(`${API}/graph/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ search_results: searchResults }),
  });
  return res.json();
}

// ── Dashboard panels ───────────────────────────────────────
async function dashboardPanel(slug) {
  const res = await apiFetch(`${API}/dashboard/${slug}`);
  if (!res.ok) throw new Error(`dashboard/${slug} failed: ${res.status}`);
  return res.json();
}

export const getPanelTotalInfo = () => dashboardPanel('total-info');
export const getPanelWorldCheck = () => dashboardPanel('world-check');
export const getPanelDwForums  = () => dashboardPanel('dw/forums');
export const getPanelDwDread   = () => dashboardPanel('dw/dread');
export const getPanelDwMarkets = () => dashboardPanel('dw/markets');
export const getPanelDwCrypto  = () => dashboardPanel('dw/crypto');
export const getPanelDwHealth  = () => dashboardPanel('dw/health');

// ── eCourts cached corpus ──────────────────────────────────────
async function ecourtsGet(path, params) {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  const res = await apiFetch(`${API}/ecourts/${path}${qs}`);
  if (!res.ok) throw new Error(`ecourts/${path} failed: ${res.status}`);
  return res.json();
}

export const getEcourtsCoverage  = () => ecourtsGet('coverage');
export const getEcourtsByState   = () => ecourtsGet('by-state');
export const getEcourtsCaseTypes = () => ecourtsGet('case-types');
export const getEcourtsCourts    = (filters = {}) => ecourtsGet('courts', filters);

// ── eCourts live (paid, cached) ────────────────────────────────
async function _readErrorDetail(res) {
  try {
    const j = await res.json();
    return j?.detail || j?.error?.message || j?.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}
export async function ecourtsSearch(body) {
  const res = await apiFetch(`${API}/ecourts/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await _readErrorDetail(res));
  return res.json();
}
export const getEcourtsCase   = (cnr, refresh = false) => ecourtsGet(`case/${cnr}`, refresh ? { refresh: 'true' } : null);
export const getEcourtsOrders = (cnr) => ecourtsGet(`case/${cnr}/orders`);
export const getEcourtsOrder  = (cnr, filename) => ecourtsGet(`case/${cnr}/order/${encodeURIComponent(filename)}`);
export const getEcourtsOrderAi = (cnr, filename) => ecourtsGet(`case/${cnr}/order/${encodeURIComponent(filename)}/ai`);
export const ecourtsOrderPdfUrl = (cnr, filename) => `${API}/ecourts/case/${cnr}/order/${encodeURIComponent(filename)}/pdf`;
export const getEcourtsUsage = (days = 7) => ecourtsGet('usage', { days: String(days) });

// ── MCA company enrichment ─────────────────────────────────────────────────
export async function getMcaCompany(q, limit = 3) {
  try {
    const params = new URLSearchParams({ q, limit: String(limit) });
    const res = await apiFetch(`${API}/mca/company?${params}`);
    if (!res.ok) return { query: q, matched_count: 0, results: [], _error: `HTTP ${res.status}` };
    return res.json();
  } catch (err) {
    return { query: q, matched_count: 0, results: [], _error: String(err) };
  }
}

// ── Admin API ──────────────────────────────────────────────────────────────
export async function adminGetUsers(params = {}) {
  const qs = new URLSearchParams(params);
  const res = await apiFetch(`${API}/admin/users?${qs}`);
  if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`);
  return res.json();
}

export async function adminCreateUser(body) {
  const res = await apiFetch(`${API}/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to create user');
  return data;
}

export async function adminGetUser(userId) {
  const res = await apiFetch(`${API}/admin/users/${userId}`);
  if (!res.ok) throw new Error(`Failed to fetch user: ${res.status}`);
  return res.json();
}

export async function adminUpdateUser(userId, body) {
  const res = await apiFetch(`${API}/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to update user');
  return data;
}

export async function adminDeleteUser(userId) {
  const res = await apiFetch(`${API}/admin/users/${userId}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to delete user');
  return data;
}

export async function adminResetPassword(userId) {
  const res = await apiFetch(`${API}/admin/users/${userId}/reset-password`, { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to reset password');
  return data;
}

export async function adminUnlockUser(userId) {
  const res = await apiFetch(`${API}/admin/users/${userId}/unlock`, { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to unlock user');
  return data;
}

export async function adminRevokeUserSessions(userId) {
  const res = await apiFetch(`${API}/admin/users/${userId}/sessions`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to revoke sessions');
  return data;
}

export async function adminGetConfig() {
  const res = await apiFetch(`${API}/admin/config`);
  if (!res.ok) throw new Error(`Failed to fetch config: ${res.status}`);
  return res.json();
}

export async function adminUpdateConfig(body) {
  const res = await apiFetch(`${API}/admin/config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to update config');
  return data;
}

export { apiFetch };

export async function adminGetRoles() {
  const res = await apiFetch(`${API}/admin/roles`);
  if (!res.ok) throw new Error(`Failed to fetch roles: ${res.status}`);
  return res.json();
}

export async function adminGetRole(roleId) {
  const res = await apiFetch(`${API}/admin/roles/${roleId}`);
  if (!res.ok) throw new Error(`Failed to fetch role: ${res.status}`);
  return res.json();
}

export async function adminCreateRole(body) {
  const res = await apiFetch(`${API}/admin/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to create role');
  return data;
}

export async function adminUpdateRole(roleId, body) {
  const res = await apiFetch(`${API}/admin/roles/${roleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to update role');
  return data;
}

export async function adminDeleteRole(roleId) {
  const res = await apiFetch(`${API}/admin/roles/${roleId}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to delete role');
  return data;
}

export async function adminGetAuditLog(params = {}) {
  const qs = new URLSearchParams(params);
  const res = await apiFetch(`${API}/admin/audit-log?${qs}`);
  if (!res.ok) throw new Error(`Failed to fetch audit log: ${res.status}`);
  return res.json();
}

// ── User self-service API ─────────────────────────────────────────────────
export async function getMe() {
  const res = await apiFetch(`${API}/auth/me`);
  if (!res.ok) throw new Error(`Failed to fetch profile: ${res.status}`);
  return res.json();
}

export async function updateMe(body) {
  const res = await apiFetch(`${API}/auth/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to update profile');
  return data;
}

export async function changePassword(currentPassword, newPassword) {
  const res = await apiFetch(`${API}/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to change password');
  return data;
}

export async function getSessions() {
  const res = await apiFetch(`${API}/auth/sessions`);
  if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`);
  return res.json();
}

export async function revokeSession(sessionId) {
  const res = await apiFetch(`${API}/auth/sessions/${sessionId}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to revoke session');
  return data;
}

export async function revokeAllSessions(includeCurrent = false) {
  const res = await apiFetch(`${API}/auth/sessions`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ include_current: includeCurrent }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to revoke sessions');
  return data;
}

export async function getApiKeys() {
  const res = await apiFetch(`${API}/auth/api-keys`);
  if (!res.ok) throw new Error(`Failed to fetch API keys: ${res.status}`);
  return res.json();
}

export async function createApiKey(name, expiresInDays = null) {
  const res = await apiFetch(`${API}/auth/api-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, expires_in_days: expiresInDays }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to create API key');
  return data;
}

export async function revokeApiKey(keyId) {
  const res = await apiFetch(`${API}/auth/api-keys/${keyId}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to revoke API key');
  return data;
}

// ── Audit endpoints ──────────────────────────────────────
export async function getAuditEvents(params = {}) {
  const qs = new URLSearchParams(params);
  const res = await apiFetch(`${API}/audit/events?${qs}`);
  if (!res.ok) return { events: [], total: 0, page: 1, page_size: 50, total_pages: 0 };
  return res.json();
}

export async function getAuditActivityFeed(since = null, limit = 20) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (since) params.set('since', since);
  const res = await apiFetch(`${API}/audit/activity/feed?${params}`);
  if (!res.ok) return { events: [] };
  return res.json();
}

export async function getAuditActiveUsers(minutes = 15) {
  const res = await apiFetch(`${API}/audit/activity/active-users?minutes=${minutes}`);
  if (!res.ok) return [];
  return res.json();
}

export async function getMySearchHistory(page = 1, pageSize = 20) {
  const res = await apiFetch(`${API}/my/search-history?page=${page}&page_size=${pageSize}`);
  if (!res.ok) return { history: [], total: 0 };
  return res.json();
}

export async function getAuditAnalytics(endpoint, params = {}) {
  const qs = new URLSearchParams(params);
  const res = await apiFetch(`${API}/audit/analytics/${endpoint}?${qs}`);
  if (!res.ok) return [];
  return res.json();
}

export const auditExportCsvUrl = (params = {}) => {
  const qs = new URLSearchParams(params);
  return `${API}/audit/export/csv?${qs}`;
};

export const auditExportJsonUrl = (params = {}) => {
  const qs = new URLSearchParams(params);
  return `${API}/audit/export/json?${qs}`;
};

// ── Credits API ──────────────────────────────────────────────
export async function getCreditBalance() {
  const res = await apiFetch(`${API}/credits/balance`);
  if (!res.ok) return null;
  return res.json();
}

export async function getCreditUsage(period = null, days = 30) {
  const params = new URLSearchParams({ days: String(days) });
  if (period) params.set('period', period);
  const res = await apiFetch(`${API}/credits/usage?${params}`);
  if (!res.ok) return null;
  return res.json();
}

export async function getCreditPreview(action) {
  const res = await apiFetch(`${API}/credits/preview?action=${encodeURIComponent(action)}`);
  if (!res.ok) return null;
  return res.json();
}

export async function getCostMatrix() {
  const res = await apiFetch(`${API}/credits/cost-matrix`);
  if (!res.ok) return {};
  return res.json();
}

export async function getEngineCosts() {
  const res = await apiFetch(`${API}/credits/engine-costs`);
  if (!res.ok) return {};
  return res.json();
}

export async function adminCreditOverview() {
  const res = await apiFetch(`${API}/admin/credits/overview`);
  if (!res.ok) throw new Error(`Failed to fetch credit overview: ${res.status}`);
  return res.json();
}

export async function adminTopupCredits(userId, amount) {
  const res = await apiFetch(`${API}/admin/credits/topup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, amount }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to top up credits');
  return data;
}

export async function adminAdjustCredits(userId, limits) {
  const res = await apiFetch(`${API}/admin/credits/adjust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, ...limits }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to adjust credits');
  return data;
}

export async function adminGetCreditTransactions(params = {}) {
  const qs = new URLSearchParams(params);
  const res = await apiFetch(`${API}/admin/credits/transactions?${qs}`);
  if (!res.ok) throw new Error(`Failed to fetch transactions: ${res.status}`);
  return res.json();
}

export async function adminUpdateCreditConfig(body) {
  const res = await apiFetch(`${API}/admin/credits/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to update credit config');
  return data;
}

// ── Support & Feedback ──────────────────────────────────────

export async function getSupportConfig() {
  const res = await apiFetch(`${API}/support/config`);
  if (!res.ok) return null;
  return res.json();
}

export async function submitTicket(body) {
  const res = await apiFetch(`${API}/support/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Submit failed: ${res.status}`);
  return data;
}

export async function uploadAttachment(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await apiFetch(`${API}/support/upload`, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Upload failed');
  return data;
}

export async function getMyTickets(params = {}) {
  const qs = new URLSearchParams(params);
  const res = await apiFetch(`${API}/support/tickets/mine?${qs}`);
  if (!res.ok) return { tickets: [], total: 0 };
  return res.json();
}

export async function getMyTicketDetail(ticketId) {
  const res = await apiFetch(`${API}/support/tickets/mine/${ticketId}`);
  if (!res.ok) return null;
  return res.json();
}

export function getTicketAttachmentUrl(ticketId, fileId) {
  return `${API}/support/tickets/${ticketId}/attachment/${fileId}`;
}

// ── FAQ ─────────────────────────────────────────────────────

export async function getFaqEntries(params = {}) {
  const qs = new URLSearchParams(params);
  const res = await apiFetch(`${API}/support/faq?${qs}`);
  if (!res.ok) return { entries: [], total: 0 };
  return res.json();
}

export async function getFaqEntry(slug) {
  const res = await apiFetch(`${API}/support/faq/${slug}`);
  if (!res.ok) return null;
  return res.json();
}

export async function getFaqSuggestions(q) {
  const res = await apiFetch(`${API}/support/faq/suggest?q=${encodeURIComponent(q)}`);
  if (!res.ok) return { suggestions: [] };
  return res.json();
}

// ── Status ──────────────────────────────────────────────────

export async function getSystemStatus() {
  const res = await apiFetch(`${API}/support/status`);
  if (!res.ok) return null;
  return res.json();
}

// ── Notifications ───────────────────────────────────────────

export async function getNotifications(params = {}) {
  const qs = new URLSearchParams(params);
  const res = await apiFetch(`${API}/support/notifications?${qs}`);
  if (!res.ok) return { notifications: [], total: 0, unread_count: 0 };
  return res.json();
}

export async function getUnreadCount() {
  const res = await apiFetch(`${API}/support/notifications/unread-count`);
  if (!res.ok) return { unread_count: 0 };
  return res.json();
}

export async function markNotificationRead(id) {
  const res = await apiFetch(`${API}/support/notifications/${id}/read`, { method: 'PATCH' });
  return res.ok;
}

export async function markAllNotificationsRead() {
  const res = await apiFetch(`${API}/support/notifications/mark-all-read`, { method: 'POST' });
  if (!res.ok) return { marked: 0 };
  return res.json();
}

// ── Admin: Tickets ──────────────────────────────────────────

export async function getAdminTickets(params = {}) {
  const qs = new URLSearchParams(params);
  const res = await apiFetch(`${API}/support/admin/tickets?${qs}`);
  if (!res.ok) throw new Error(`Failed to fetch tickets: ${res.status}`);
  return res.json();
}

export async function getAdminTicketDetail(ticketId) {
  const res = await apiFetch(`${API}/support/admin/tickets/${ticketId}`);
  if (!res.ok) throw new Error(`Failed to fetch ticket: ${res.status}`);
  return res.json();
}

export async function updateTicketStatus(ticketId, status) {
  const res = await apiFetch(`${API}/support/admin/tickets/${ticketId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to update status');
  return data;
}

export async function assignTicket(ticketId, userId) {
  const res = await apiFetch(`${API}/support/admin/tickets/${ticketId}/assign`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to assign ticket');
  return data;
}

export async function addTicketNote(ticketId, content) {
  const res = await apiFetch(`${API}/support/admin/tickets/${ticketId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to add note');
  return data;
}

export async function replyToTicket(ticketId, content, sendEmail = true) {
  const res = await apiFetch(`${API}/support/admin/tickets/${ticketId}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, send_email: sendEmail }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to reply');
  return data;
}

// ── Admin: FAQ ──────────────────────────────────────────────

export async function createFaqEntry(body) {
  const res = await apiFetch(`${API}/support/admin/faq`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to create FAQ entry');
  return data;
}

export async function updateFaqEntry(slug, body) {
  const res = await apiFetch(`${API}/support/admin/faq/${slug}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to update FAQ entry');
  return data;
}

export async function deleteFaqEntry(slug) {
  const res = await apiFetch(`${API}/support/admin/faq/${slug}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to delete FAQ entry');
  return data;
}

// ── Admin: Status ───────────────────────────────────────────

export async function postStatusMessage(body) {
  const res = await apiFetch(`${API}/support/admin/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to post status');
  return data;
}

export async function updateStatusMessage(messageId, body) {
  const res = await apiFetch(`${API}/support/admin/status/${messageId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Failed to update status');
  return data;
}

export async function getAdminStatusMessages() {
  const res = await apiFetch(`${API}/support/admin/status`);
  if (!res.ok) return { messages: [], total: 0 };
  return res.json();
}
