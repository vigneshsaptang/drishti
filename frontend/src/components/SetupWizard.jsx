import { useState } from 'react';
import { postSetup } from '../lib/auth';

function getStrength(password) {
  if (!password) return null;
  const len = password.length;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const classes = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;

  if (len < 8) return { level: 0, label: 'Weak', color: 'bg-rose-500', text: 'text-rose-600' };
  if (len >= 12 && classes === 4) return { level: 4, label: 'Strong', color: 'bg-green-400', text: 'text-green-500' };
  if (len >= 12 && classes >= 3) return { level: 3, label: 'Good', color: 'bg-green-600', text: 'text-green-700' };
  return { level: 2, label: 'Fair', color: 'bg-amber-500', text: 'text-amber-600' };
}

export default function SetupWizard({ onComplete }) {
  const [username, setUsername] = useState('admin');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const strength = getStrength(password);
  const mismatch = confirm.length > 0 && password !== confirm;

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setErr('Passwords do not match.');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await postSetup({ username, email, display_name: displayName, password });
      onComplete();
    } catch (error_) {
      setErr(error_ instanceof Error ? error_.message : 'Setup failed');
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
        <div className="w-full max-w-[480px]">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center rounded-2xl border border-amber-700/15 bg-white/70 p-4 shadow-[0_20px_60px_rgba(2,6,23,0.10)] backdrop-blur-sm">
              <img src="/saptang-logo.svg" alt="Saptang Labs" className="h-10 w-auto" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight mt-5">Auracle</h1>
            <p className="text-[11px] font-mono text-slate-600 uppercase tracking-[0.28em] mt-1">First-Time Setup</p>
          </div>

          <form
            onSubmit={submit}
            className="relative rounded-2xl border border-slate-200/80 bg-white/80 backdrop-blur-sm p-7 shadow-[0_28px_70px_rgba(2,6,23,0.14)] overflow-hidden"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85), 0 28px 70px rgba(2,6,23,0.14)' }}
          >
            {/* Corner accents */}
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              <div className="absolute left-0 top-0 w-10 h-10 border-l border-t border-amber-500/35 rounded-tl-2xl" />
              <div className="absolute right-0 top-0 w-10 h-10 border-r border-t border-blue-500/25 rounded-tr-2xl" />
              <div className="absolute left-0 bottom-0 w-10 h-10 border-l border-b border-blue-500/25 rounded-bl-2xl" />
              <div className="absolute right-0 bottom-0 w-10 h-10 border-r border-b border-amber-500/35 rounded-br-2xl" />
            </div>

            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.18em] mb-5">
              Create your administrator account to begin.
            </p>

            {err && (
              <p className="text-xs font-mono text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 mb-4" role="alert">
                {err}
              </p>
            )}

            {/* Username */}
            <div className="space-y-1.5 mb-4">
              <label htmlFor="sw-username" className="text-[10px] font-mono text-slate-600 uppercase tracking-[0.18em]">
                Username
              </label>
              <input
                id="sw-username"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-mono text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5 mb-4">
              <label htmlFor="sw-email" className="text-[10px] font-mono text-slate-600 uppercase tracking-[0.18em]">
                Email
              </label>
              <input
                id="sw-email"
                type="email"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-mono text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            {/* Display name */}
            <div className="space-y-1.5 mb-4">
              <label htmlFor="sw-display" className="text-[10px] font-mono text-slate-600 uppercase tracking-[0.18em]">
                Display Name
              </label>
              <input
                id="sw-display"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-mono text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                autoComplete="name"
                required
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5 mb-2">
              <label htmlFor="sw-pass" className="text-[10px] font-mono text-slate-600 uppercase tracking-[0.18em]">
                Password
              </label>
              <input
                id="sw-pass"
                type="password"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-mono text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            {/* Strength indicator */}
            {strength !== null && (
              <div className="mb-4 space-y-1">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map(i => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
                        i <= strength.level ? strength.color : 'bg-slate-200'
                      }`}
                    />
                  ))}
                </div>
                <p className={`text-[10px] font-mono uppercase tracking-[0.15em] ${strength.text}`}>
                  {strength.label}
                </p>
              </div>
            )}

            {/* Confirm password */}
            <div className="space-y-1.5 mb-6">
              <label htmlFor="sw-confirm" className="text-[10px] font-mono text-slate-600 uppercase tracking-[0.18em]">
                Confirm Password
              </label>
              <input
                id="sw-confirm"
                type="password"
                className={`w-full rounded-xl border bg-white px-4 py-3 text-sm font-mono text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 transition-colors ${
                  mismatch
                    ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-400/15'
                    : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500/15'
                }`}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
              {mismatch && (
                <p className="text-[10px] font-mono text-rose-600">Passwords do not match.</p>
              )}
            </div>

            <button
              type="submit"
              disabled={busy || mismatch}
              className="w-full h-11 rounded-xl font-mono text-xs font-semibold uppercase tracking-[0.22em] text-white border border-amber-600/30 bg-gradient-to-b from-amber-600 to-amber-800 hover:from-amber-500 hover:to-amber-700 disabled:opacity-50 transition-colors shadow-[0_16px_40px_rgba(217,119,6,0.22)]"
            >
              {busy ? 'Setting up…' : 'Create Admin & Launch Auracle'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
