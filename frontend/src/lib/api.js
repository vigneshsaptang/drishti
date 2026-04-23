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

export async function buildGraph(searchResults) {
  const res = await apiFetch(`${API}/graph/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ search_results: searchResults }),
  });
  return res.json();
}

export async function getDashboardIntel() {
  const res = await apiFetch(`${API}/dashboard/intel`);
  return res.json();
}
