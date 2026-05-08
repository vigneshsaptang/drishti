import { useEffect, useState } from 'react';
import { getMe, updateMe, changePassword } from '../lib/api';

function PasswordStrengthBar({ password }) {
  const score = (() => {
    if (!password) return 0;
    let s = 0;
    if (password.length >= 8) s++;
    if (password.length >= 12) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  })();

  const label = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'][score];
  const colors = ['', 'bg-entity-drug', 'bg-yellow-500', 'bg-yellow-400', 'bg-green-500', 'bg-sap-accent'];

  if (!password) return null;

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i <= score ? colors[score] : 'bg-sap-border'}`}
          />
        ))}
      </div>
      <p className="text-[10px] text-sap-dim">{label}</p>
    </div>
  );
}

export default function ProfileDialog({ onClose }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const [pwExpanded, setPwExpanded] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState('');

  useEffect(() => {
    getMe()
      .then((data) => {
        setUser(data);
        setDisplayName(data.display_name || '');
        setEmail(data.email || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSaveProfile(e) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg('');
    try {
      await updateMe({ display_name: displayName, email });
      setSaveMsg('Saved.');
    } catch (err) {
      setSaveMsg(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setPwError('');
    setPwMsg('');
    if (newPw !== confirmPw) {
      setPwError('Passwords do not match.');
      return;
    }
    setPwSaving(true);
    try {
      await changePassword(currentPw, newPw);
      setPwMsg('Password changed.');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setPwExpanded(false);
    } catch (err) {
      setPwError(err.message);
    } finally {
      setPwSaving(false);
    }
  }

  const daysSincePasswordChange = user?.password_changed_at
    ? Math.floor((Date.now() - new Date(user.password_changed_at).getTime()) / 86400000)
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-sap-surface rounded-xl border border-sap-border shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-sap-border flex items-center justify-between">
          <span className="text-sm font-bold text-sap-text">Profile</span>
          <button onClick={onClose} className="text-sap-dim hover:text-sap-text transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="px-5 py-4">
          {loading ? (
            <p className="text-xs text-sap-dim">Loading…</p>
          ) : (
            <>
              <form onSubmit={handleSaveProfile} className="space-y-3">
                <div>
                  <label className="text-[10px] font-mono text-sap-dim uppercase tracking-wide">Display Name</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent focus:ring-1 focus:ring-sap-accent/30"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-sap-dim uppercase tracking-wide">Email</label>
                  <input
                    type="email"
                    className="mt-1 w-full rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent focus:ring-1 focus:ring-sap-accent/30"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-sap-dim uppercase tracking-wide">Username</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none opacity-60 cursor-not-allowed"
                    value={user?.username || ''}
                    readOnly
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-sap-dim uppercase tracking-wide">Role</label>
                  <div className="mt-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-sap-accent/15 text-sap-accent text-xs font-mono">
                      {user?.role || 'user'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-sap-accent text-white text-xs font-semibold hover:bg-sap-accent/90 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  {saveMsg && <span className="text-xs text-sap-dim">{saveMsg}</span>}
                </div>
              </form>

              <div className="my-4 border-t border-sap-border" />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-sap-text">Password</p>
                    {daysSincePasswordChange !== null ? (
                      <p className="text-[11px] text-sap-dim mt-0.5">
                        Last changed {daysSincePasswordChange} day{daysSincePasswordChange !== 1 ? 's' : ''} ago
                      </p>
                    ) : (
                      <p className="text-[11px] text-sap-dim mt-0.5">Never changed</p>
                    )}
                  </div>
                  {!pwExpanded && (
                    <button
                      onClick={() => setPwExpanded(true)}
                      className="px-4 py-2 rounded-lg bg-sap-accent text-white text-xs font-semibold hover:bg-sap-accent/90"
                    >
                      Change Password
                    </button>
                  )}
                </div>

                {pwExpanded && (
                  <form onSubmit={handleChangePassword} className="space-y-3 pt-1">
                    <div>
                      <label className="text-[10px] font-mono text-sap-dim uppercase tracking-wide">Current Password</label>
                      <input
                        type="password"
                        required
                        className="mt-1 w-full rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent focus:ring-1 focus:ring-sap-accent/30"
                        value={currentPw}
                        onChange={(e) => setCurrentPw(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono text-sap-dim uppercase tracking-wide">New Password</label>
                      <input
                        type="password"
                        required
                        className="mt-1 w-full rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent focus:ring-1 focus:ring-sap-accent/30"
                        value={newPw}
                        onChange={(e) => setNewPw(e.target.value)}
                      />
                      <PasswordStrengthBar password={newPw} />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono text-sap-dim uppercase tracking-wide">Confirm Password</label>
                      <input
                        type="password"
                        required
                        className="mt-1 w-full rounded-lg border border-sap-border bg-sap-bg px-3 py-2 text-sm text-sap-text outline-none focus:border-sap-accent focus:ring-1 focus:ring-sap-accent/30"
                        value={confirmPw}
                        onChange={(e) => setConfirmPw(e.target.value)}
                      />
                    </div>
                    {pwError && <p className="text-xs text-entity-drug">{pwError}</p>}
                    {pwMsg && <p className="text-xs text-green-400">{pwMsg}</p>}
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={pwSaving}
                        className="px-4 py-2 rounded-lg bg-sap-accent text-white text-xs font-semibold hover:bg-sap-accent/90 disabled:opacity-50"
                      >
                        {pwSaving ? 'Updating…' : 'Update Password'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPwExpanded(false);
                          setPwError('');
                          setCurrentPw('');
                          setNewPw('');
                          setConfirmPw('');
                        }}
                        className="px-4 py-2 rounded-lg bg-entity-drug/10 text-entity-drug text-xs font-semibold hover:bg-entity-drug/20"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
