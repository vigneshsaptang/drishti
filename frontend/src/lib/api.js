import { clearToken, getAuthHeaders } from './auth';

const API = '/api';

async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { ...getAuthHeaders(), ...options.headers },
  });
  if (res.status === 401) {
    clearToken();
    window.dispatchEvent(new Event('saptang-auth-failed'));
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

export async function buildGraph(searchResults) {
  const res = await apiFetch(`${API}/graph/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ search_results: searchResults }),
  });
  return res.json();
}

// ── Dashboard panels ───────────────────────────────────────
// Returns { data, _cached, _age_s, _stale?, _error? }. Frontend reads .data.
// DARKMON and Telegram-fed panels are disabled — those engines are too slow for the idle dashboard.
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
/**
 * Look up a company by name against the MCA registry.
 * Returns { query, matched_count, results: [{cin, company_name, company_status,
 *   incorporation_date, address, industry, state, _match_score}], _cached? }
 * On network error returns { matched_count: 0, results: [], _error }.
 */
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
