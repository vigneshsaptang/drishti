import { useState, useEffect, useCallback } from 'react';
import { postLogin } from '../lib/auth';

export default function LoginPage({ onSuccess }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaImg, setCaptchaImg] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const fetchCaptcha = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/captcha');
      if (!r.ok) return;
      const data = await r.json();
      setCaptchaToken(data.captcha_token || '');
      setCaptchaImg(data.image || '');
      setCaptchaAnswer('');
    } catch { /* silent */ }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- data-fetching effect, setState in async callback is intentional
  useEffect(() => { fetchCaptcha(); }, [fetchCaptcha]);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const data = await postLogin(user, pass, captchaToken, captchaAnswer);
      onSuccess(data);
    } catch (error_) {
      setErr(error_ instanceof Error ? error_.message : 'Sign-in failed');
      fetchCaptcha();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-sap-bg text-sap-text relative overflow-hidden flex items-center justify-center px-6 antialiased">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-48 -right-32 h-[560px] w-[720px] rounded-full"
        style={{
          background:
            'radial-gradient(closest-side, color-mix(in srgb, var(--color-sap-accent) 14%, transparent), color-mix(in srgb, var(--color-sap-accent) 6%, transparent) 40%, transparent 70%)',
          filter: 'blur(8px)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--color-sap-text) 5%, transparent) 1px, transparent 0)',
          backgroundSize: '22px 22px',
        }}
      />

      <div className="w-full max-w-[360px] relative z-10">
        <div className="mb-10 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <img src="/saptang-logo.svg" alt="" className="h-5 w-auto" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-[14.5px] font-semibold tracking-tight text-sap-text">Auracle</span>
            <span className="mt-1 text-[11.5px] text-sap-dim">Saptang Intelligence</span>
          </div>
        </div>

        <div className="mb-7">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] leading-[1.15] text-sap-text">
            Sign in to your workspace
          </h1>
          <p className="mt-1.5 text-[13.5px] text-sap-dim">
            Continue to the intelligence console.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3.5">
          {err && (
            <div
              role="alert"
              className="rounded-md border border-rose-200 bg-rose-50/70 px-3 py-2 text-[12.5px] text-rose-700"
            >
              {err}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="sap-user" className="block text-[12px] font-medium text-sap-text">
              Username
            </label>
            <input
              id="sap-user"
              value={user}
              onChange={e => setUser(e.target.value)}
              autoComplete="username"
              className="w-full h-9 rounded-md border border-sap-border-light bg-sap-surface px-3 text-[13.5px] text-sap-text placeholder:text-sap-muted outline-none transition-[border-color,box-shadow] duration-150 focus:border-sap-accent focus:ring-4 focus:ring-sap-accent/10"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="sap-pass" className="block text-[12px] font-medium text-sap-text">
              Password
            </label>
            <input
              id="sap-pass"
              type="password"
              value={pass}
              onChange={e => setPass(e.target.value)}
              autoComplete="current-password"
              className="w-full h-9 rounded-md border border-sap-border-light bg-sap-surface px-3 text-[13.5px] text-sap-text placeholder:text-sap-muted outline-none transition-[border-color,box-shadow] duration-150 focus:border-sap-accent focus:ring-4 focus:ring-sap-accent/10"
            />
          </div>

          {captchaImg && (
            <div className="space-y-1.5 pt-0.5">
              <div className="flex items-center justify-between">
                <label htmlFor="sap-captcha" className="block text-[12px] font-medium text-sap-text">
                  Verification
                </label>
                <button
                  type="button"
                  onClick={fetchCaptcha}
                  className="text-[11.5px] text-sap-dim hover:text-sap-text transition-colors"
                >
                  Refresh
                </button>
              </div>
              <div className="flex items-center gap-2.5">
                <img
                  src={captchaImg}
                  alt="CAPTCHA"
                  className="h-9 rounded-md border border-sap-border-light bg-sap-surface"
                />
                <input
                  id="sap-captcha"
                  type="text"
                  value={captchaAnswer}
                  onChange={e => setCaptchaAnswer(e.target.value)}
                  autoComplete="off"
                  placeholder="Enter code"
                  className="flex-1 h-9 rounded-md border border-sap-border-light bg-sap-surface px-3 text-[13.5px] text-sap-text placeholder:text-sap-muted outline-none transition-[border-color,box-shadow] duration-150 focus:border-sap-accent focus:ring-4 focus:ring-sap-accent/10"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="group relative w-full h-9 mt-1 rounded-md bg-sap-accent text-[13px] font-medium text-white transition-[background-color,box-shadow,opacity] duration-150 hover:bg-sap-accent-glow focus:outline-none focus:ring-4 focus:ring-sap-accent/25 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            style={{
              boxShadow:
                'inset 0 -1px 0 rgba(0,0,0,0.16), 0 1px 2px color-mix(in srgb, var(--color-sap-accent) 25%, transparent)',
            }}
          >
            <span>{busy ? 'Signing in…' : 'Access'}</span>
            {!busy && (
              <kbd className="hidden sm:inline-flex items-center justify-center h-[15px] min-w-[15px] px-1 rounded-[3px] border border-white/25 bg-white/10 text-[10px] font-mono text-white/85 leading-none">
                ↵
              </kbd>
            )}
          </button>
        </form>

        <div className="mt-9 flex items-center justify-center gap-1.5 text-[11px] text-sap-muted">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500/40 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          <span>secure session · saptanglabs.com</span>
        </div>
      </div>
    </div>
  );
}
