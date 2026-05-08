const TOKEN_KEY = 'saptang_token';
const REFRESH_KEY = 'saptang_refresh';
const USER_KEY = 'saptang_user';

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken() {
  return sessionStorage.getItem(REFRESH_KEY);
}

export function getUser() {
  const raw = sessionStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setTokens(access, refresh, user) {
  if (access) sessionStorage.setItem(TOKEN_KEY, access);
  if (refresh) sessionStorage.setItem(REFRESH_KEY, refresh);
  if (user) sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function setToken(t) {
  if (t) sessionStorage.setItem(TOKEN_KEY, t);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export function clearTokens() {
  clearToken();
}

export function getAuthHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function fetchAuthStatus() {
  const r = await fetch('/api/auth/status');
  if (!r.ok) throw new Error('auth status');
  return r.json();
}

export async function postLogin(username, password, captcha_token = '', captcha_answer = '') {
  const r = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, captcha_token, captcha_answer }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    let msg = 'Sign-in failed';
    if (r.status === 423) msg = data.detail || 'Account locked';
    else if (r.status === 403) msg = data.detail || 'Account disabled';
    else if (typeof data.detail === 'string') msg = data.detail;
    else if (Array.isArray(data.detail) && data.detail[0]?.msg) msg = data.detail[0].msg;
    throw new Error(msg);
  }
  if (data.access_token) {
    setTokens(data.access_token, data.refresh_token, data.user);
  }
  return data;
}

export async function postSetup(body) {
  const r = await fetch('/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data.detail || 'Setup failed');
  }
  if (data.access_token) {
    setTokens(data.access_token, data.refresh_token, data.user);
  }
  return data;
}

let _refreshPromise = null;

export async function refreshAccessToken() {
  if (_refreshPromise) return _refreshPromise;
  const rt = getRefreshToken();
  if (!rt) throw new Error('No refresh token');

  _refreshPromise = fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: rt }),
  }).then(async (res) => {
    _refreshPromise = null;
    if (!res.ok) {
      clearTokens();
      window.dispatchEvent(new Event('saptang-auth-failed'));
      throw new Error('Refresh failed');
    }
    const data = await res.json();
    setTokens(data.access_token, data.refresh_token, null);
    return data.access_token;
  }).catch((err) => {
    _refreshPromise = null;
    throw err;
  });

  return _refreshPromise;
}

export function signOut() {
  const rt = getRefreshToken();
  if (rt) {
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ refresh_token: rt }),
    }).catch(() => {});
  }
  clearTokens();
  window.dispatchEvent(new Event('saptang-auth-failed'));
}
