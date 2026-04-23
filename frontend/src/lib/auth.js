const KEY = 'saptang_token';

export function getToken() {
  return sessionStorage.getItem(KEY);
}

export function setToken(t) {
  if (t) sessionStorage.setItem(KEY, t);
  else sessionStorage.removeItem(KEY);
}

export function clearToken() {
  sessionStorage.removeItem(KEY);
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

export async function postLogin(username, password) {
  const r = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    let msg = 'Sign-in failed';
    if (typeof data.detail === 'string') msg = data.detail;
    else if (Array.isArray(data.detail) && data.detail[0]?.msg) msg = data.detail[0].msg;
    throw new Error(msg);
  }
  if (data.access_token) setToken(data.access_token);
  return data;
}

export function signOut() {
  clearToken();
  window.location.reload();
}
