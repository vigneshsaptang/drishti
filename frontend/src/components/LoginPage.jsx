import { useState } from 'react';
import { postLogin } from '../lib/auth';

export default function LoginPage({ onSuccess }) {
  const [user, setUser] = useState('operator');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await postLogin(user, pass);
      onSuccess();
    } catch (ue) {
      setErr(ue instanceof Error ? ue.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-sap-bg">
      <header className="px-6 py-4 border-b border-sap-border bg-sap-surface">
        <p className="text-[10px] font-mono text-sap-accent tracking-[0.3em] uppercase font-semibold">Restricted System</p>
      </header>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[440px]">
          <div className="text-center mb-10">
            <img src="/saptang-logo.svg" alt="Saptang Labs" className="h-14 mx-auto mb-6" />
            <h1 className="text-3xl font-bold tracking-tight text-sap-text">Auracle</h1>
            <p className="text-sm text-sap-accent mt-1 font-medium">by Saptang Labs</p>
            <p className="text-sm text-sap-dim mt-4 max-w-sm mx-auto leading-relaxed">
              Intelligence investigation platform. Authenticate to access breach, threat, and dark web modules.
            </p>
          </div>

          <form
            onSubmit={submit}
            className="rounded-2xl border border-sap-border bg-sap-surface p-8 shadow-lg"
          >
            {err && (
              <p className="text-sm font-mono text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 mb-5" role="alert">
                {err}
              </p>
            )}
            <div className="space-y-2 mb-5">
              <label htmlFor="sap-user" className="text-xs font-medium text-sap-dim uppercase tracking-wider">User ID</label>
              <input
                id="sap-user"
                className="w-full rounded-lg border border-sap-border bg-sap-panel px-4 py-3 text-base font-mono text-sap-text placeholder:text-sap-muted outline-none focus:border-sap-accent focus:ring-2 focus:ring-sap-accent/20"
                value={user}
                onChange={e => setUser(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="space-y-2 mb-6">
              <label htmlFor="sap-pass" className="text-xs font-medium text-sap-dim uppercase tracking-wider">Password</label>
              <input
                id="sap-pass"
                type="password"
                className="w-full rounded-lg border border-sap-border bg-sap-panel px-4 py-3 text-base font-mono text-sap-text placeholder:text-sap-muted outline-none focus:border-sap-accent focus:ring-2 focus:ring-sap-accent/20"
                value={pass}
                onChange={e => setPass(e.target.value)}
                autoComplete="current-password"
                placeholder="Enter password"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full h-12 rounded-lg font-semibold text-sm uppercase tracking-wider text-white bg-sap-accent hover:bg-sap-accent-glow disabled:opacity-50 transition-colors shadow-md"
            >
              {busy ? 'Signing in...' : 'Sign In'}
            </button>
            <p className="text-xs text-sap-muted text-center mt-5">All operations are logged. Unauthorized access is prohibited.</p>
          </form>
        </div>
      </div>

      <footer className="px-6 py-3 border-t border-sap-border text-center">
        <p className="text-xs text-sap-muted">Auracle &middot; Saptang Labs Pvt. Ltd.</p>
      </footer>
    </div>
  );
}
