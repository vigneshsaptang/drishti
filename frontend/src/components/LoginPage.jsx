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
    } catch (error_) {
      setErr(error_ instanceof Error ? error_.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f4ef] text-slate-900 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-100"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 120% 80% at 50% -20%, rgba(217, 119, 6, 0.18), transparent 55%), radial-gradient(ellipse 90% 60% at 100% 35%, rgba(59, 130, 246, 0.12), transparent 48%), radial-gradient(ellipse 90% 70% at 0% 100%, rgba(15, 23, 42, 0.06), transparent 52%)',
        }}
        aria-hidden
      />
      <div
        className="absolute inset-0 opacity-[0.35] [background-size:30px_30px] [background-image:linear-gradient(rgba(15,23,42,0.10)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.10)_1px,transparent_1px)]"
        aria-hidden
      />

      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-[440px]">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center rounded-2xl border border-amber-700/15 bg-white/70 p-4 shadow-[0_20px_60px_rgba(2,6,23,0.10)] backdrop-blur-sm">
              <img src="/saptang-logo.svg" alt="Saptang Labs" className="h-10 w-auto" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight mt-5">Auracle</h1>
            <p className="text-[11px] font-mono text-slate-600 uppercase tracking-[0.28em] mt-1">Saptang Intelligence</p>
          </div>

          <form
            onSubmit={submit}
            className="relative rounded-2xl border border-slate-200/80 bg-white/80 backdrop-blur-sm p-7 shadow-[0_28px_70px_rgba(2,6,23,0.14)] overflow-hidden"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85), 0 28px 70px rgba(2,6,23,0.14)' }}
          >
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              <div className="absolute left-0 top-0 w-10 h-10 border-l border-t border-amber-500/35 rounded-tl-2xl" />
              <div className="absolute right-0 top-0 w-10 h-10 border-r border-t border-blue-500/25 rounded-tr-2xl" />
              <div className="absolute left-0 bottom-0 w-10 h-10 border-l border-b border-blue-500/25 rounded-bl-2xl" />
              <div className="absolute right-0 bottom-0 w-10 h-10 border-r border-b border-amber-500/35 rounded-br-2xl" />
            </div>

            {err && (
              <p className="text-xs font-mono text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 mb-4" role="alert">
                {err}
              </p>
            )}
            <div className="space-y-1.5 mb-4">
              <label htmlFor="sap-user" className="text-[10px] font-mono text-slate-600 uppercase tracking-[0.18em]">User</label>
              <input
                id="sap-user"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-mono text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                value={user}
                onChange={e => setUser(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="space-y-1.5 mb-6">
              <label htmlFor="sap-pass" className="text-[10px] font-mono text-slate-600 uppercase tracking-[0.18em]">Password</label>
              <input
                id="sap-pass"
                type="password"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-mono text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                value={pass}
                onChange={e => setPass(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full h-11 rounded-xl font-mono text-xs font-semibold uppercase tracking-[0.22em] text-white border border-amber-600/30 bg-gradient-to-b from-amber-600 to-amber-800 hover:from-amber-500 hover:to-amber-700 disabled:opacity-50 transition-colors shadow-[0_16px_40px_rgba(217,119,6,0.22)]"
            >
              {busy ? '…' : 'Access'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
