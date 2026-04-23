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
    <div className="min-h-screen flex flex-col bg-[#04070f] text-sap-text relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: 'radial-gradient(ellipse 120% 80% at 50% -20%, rgba(201, 168, 98, 0.15), transparent 50%), radial-gradient(ellipse 80% 50% at 100% 50%, rgba(30, 58, 95, 0.25), transparent 45%)',
        }}
        aria-hidden
      />
      <div
        className="absolute inset-0 opacity-20 [background-size:32px_32px] [background-image:linear-gradient(rgba(46,64,100,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(46,64,100,0.2)_1px,transparent_1px)]"
        aria-hidden
      />
      <div
        className="absolute right-0 top-1/2 -translate-y-1/2 w-1/2 h-[120%] pointer-events-none opacity-30"
        style={{
          background: 'conic-gradient(from 180deg at 50% 50%, transparent 0deg, rgba(201, 168, 98, 0.06) 120deg, transparent 200deg)',
        }}
        aria-hidden
      />
      <header className="relative z-10 px-6 py-4 border-b border-sap-border/60 bg-[#0a0f1a]/80 backdrop-blur-md">
        <p className="text-[9px] font-mono text-amber-200/70 tracking-[0.3em] uppercase">Restricted system</p>
      </header>
      <div className="relative z-10 flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[420px]">
          <div className="text-center mb-10">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-sap-gold/50 bg-gradient-to-br from-slate-900/90 to-slate-950 shadow-[0_0_40px_rgba(201,168,98,0.12)] mb-5">
              <svg className="w-8 h-8 text-sap-gold" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.1">
                <path d="M16 4L6 9v7c0 5.5 3.5 10.2 8 12 4.5-1.8 8-6.5 8-12V9l-10-5z" />
                <path d="M16 10v6M12 12h8" />
              </svg>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Saptang</h1>
            <p className="text-sm text-sap-gold/90 mt-1 font-mono tracking-[0.12em] uppercase">Intelligence</p>
            <p className="text-xs text-sap-dim mt-4 max-w-sm mx-auto leading-relaxed">
              Law-enforcement case workspace. Authenticate to open breach, threat, and dark web modules.
            </p>
          </div>
          <form
            onSubmit={submit}
            className="rounded-2xl border border-sap-border/90 bg-sap-surface/80 backdrop-blur-sm p-7 shadow-[0_20px_50px_rgba(0,0,0,0.4)]"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}
          >
            {err && (
              <p className="text-xs font-mono text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-md px-3 py-2 mb-4" role="alert">
                {err}
              </p>
            )}
            <div className="space-y-1.5 mb-4">
              <label htmlFor="sap-user" className="text-[10px] font-mono uppercase text-sap-muted tracking-wider">User ID</label>
              <input
                id="sap-user"
                className="w-full rounded-md border border-sap-border bg-[#0a1020] px-3.5 py-2.5 text-sm font-mono text-sap-text placeholder:text-sap-muted/70 outline-none focus:border-sap-accent focus:ring-1 focus:ring-sap-accent/30"
                value={user}
                onChange={e => setUser(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="space-y-1.5 mb-5">
              <label htmlFor="sap-pass" className="text-[10px] font-mono uppercase text-sap-muted tracking-wider">Password</label>
              <input
                id="sap-pass"
                type="password"
                className="w-full rounded-md border border-sap-border bg-[#0a1020] px-3.5 py-2.5 text-sm font-mono text-sap-text placeholder:text-sap-muted/70 outline-none focus:border-sap-accent focus:ring-1 focus:ring-sap-accent/30"
                value={pass}
                onChange={e => setPass(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full h-11 rounded-md font-mono text-xs font-semibold uppercase tracking-[0.2em] text-white border border-amber-600/40 bg-gradient-to-b from-amber-800/80 to-amber-950/90 hover:from-amber-700 hover:to-amber-900/90 disabled:opacity-50 transition-all shadow-lg shadow-amber-950/40"
            >
              {busy ? '…' : 'Access workspace'}
            </button>
            <p className="text-[10px] text-sap-muted/90 font-mono text-center mt-5">Operations are logged. Misuse is prohibited.</p>
          </form>
        </div>
      </div>
    </div>
  );
}
