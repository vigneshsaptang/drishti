import { useState, useEffect } from 'react';
import AdminNav from '../components/AdminNav';
import { adminGetConfig, adminUpdateConfig } from '../lib/api';

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        checked ? 'bg-sap-accent' : 'bg-sap-border'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function NumberField({ label, value, onChange, min, hint }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-sap-border/50 last:border-0">
      <div>
        <span className="text-xs text-sap-text">{label}</span>
        {hint && <span className="ml-2 text-[10px] text-sap-muted">{hint}</span>}
      </div>
      <input
        type="number"
        min={min ?? 0}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-20 rounded-lg border border-sap-border bg-sap-bg px-3 py-1.5 text-sm text-sap-text outline-none focus:border-sap-accent text-right"
      />
    </div>
  );
}

function BoolField({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-sap-border/50 last:border-0">
      <span className="text-xs text-sap-text">{label}</span>
      <Toggle checked={!!value} onChange={onChange} />
    </div>
  );
}

function Section({ title, open, onToggle, children }) {
  return (
    <div className="rounded-lg border border-sap-border bg-sap-surface overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-sap-panel/30 transition-colors"
      >
        <span className="text-xs font-bold text-sap-text uppercase tracking-wide">{title}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-sap-dim transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && <div className="px-5 pb-4 border-t border-sap-border">{children}</div>}
    </div>
  );
}

function usePolicyForm(initial) {
  const [values, setValues] = useState(initial || {});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (initial) setValues(initial);
  }, [JSON.stringify(initial)]);

  function set(key, val) {
    setValues(v => ({ ...v, [key]: val }));
  }

  async function save(sectionKey) {
    setSaving(true);
    setFeedback(null);
    try {
      await adminUpdateConfig({ [sectionKey]: values });
      setFeedback({ ok: true, msg: 'Saved.' });
    } catch (err) {
      setFeedback({ ok: false, msg: err.message });
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 3000);
    }
  }

  return { values, set, saving, feedback, save };
}

export default function AdminConfig({ onClose, onNavigate }) {
  const [config, setConfig] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [open, setOpen] = useState({ password: true, session: false, lockout: false });

  const password = usePolicyForm(config?.password_policy);
  const session = usePolicyForm(config?.session_policy);
  const lockout = usePolicyForm(config?.lockout_policy);

  useEffect(() => {
    adminGetConfig()
      .then(setConfig)
      .catch(err => setLoadError(err.message));
  }, []);

  function toggle(key) {
    setOpen(o => ({ ...o, [key]: !o[key] }));
  }

  function FeedbackLine({ feedback }) {
    if (!feedback) return null;
    return (
      <p className={`text-xs mt-2 ${feedback.ok ? 'text-emerald-600' : 'text-entity-drug'}`}>
        {feedback.msg}
      </p>
    );
  }

  function SaveButton({ onSave, saving, feedback }) {
    return (
      <div className="flex items-center justify-end gap-3 mt-4">
        <FeedbackLine feedback={feedback} />
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg bg-sap-accent text-white text-xs font-semibold hover:bg-sap-accent/90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-sap-bg overflow-y-auto">
      <div className="sticky top-0 z-10 bg-sap-surface border-b border-sap-border px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="flex items-center gap-1.5 text-xs text-sap-dim hover:text-sap-accent transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Back
          </button>
          <span className="text-sm font-bold text-sap-text">Administration</span>
        </div>
      </div>
      <AdminNav active="admin-config" onNavigate={onNavigate} />

      <div className="max-w-2xl mx-auto px-5 py-6 space-y-3">
        {loadError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-entity-drug">
            {loadError}
          </div>
        )}

        {!config && !loadError && (
          <p className="text-xs text-sap-muted text-center py-10">Loading configuration…</p>
        )}

        {config && (
          <>
            <Section title="Password Policy" open={open.password} onToggle={() => toggle('password')}>
              <div className="mt-3">
                <NumberField
                  label="Minimum Length"
                  value={password.values.min_length ?? 12}
                  onChange={v => password.set('min_length', v)}
                  min={6}
                />
                <BoolField
                  label="Require Uppercase"
                  value={password.values.require_uppercase}
                  onChange={v => password.set('require_uppercase', v)}
                />
                <BoolField
                  label="Require Lowercase"
                  value={password.values.require_lowercase}
                  onChange={v => password.set('require_lowercase', v)}
                />
                <BoolField
                  label="Require Digit"
                  value={password.values.require_digit}
                  onChange={v => password.set('require_digit', v)}
                />
                <BoolField
                  label="Require Special Character"
                  value={password.values.require_special}
                  onChange={v => password.set('require_special', v)}
                />
                <NumberField
                  label="Max Age (Days)"
                  value={password.values.max_age_days ?? 0}
                  onChange={v => password.set('max_age_days', v)}
                  hint="0 = never expires"
                />
                <NumberField
                  label="History Count"
                  value={password.values.history_count ?? 0}
                  onChange={v => password.set('history_count', v)}
                  hint="Prevent reuse of last N passwords"
                />
                <SaveButton
                  onSave={() => password.save('password_policy')}
                  saving={password.saving}
                  feedback={password.feedback}
                />
              </div>
            </Section>

            <Section title="Session Policy" open={open.session} onToggle={() => toggle('session')}>
              <div className="mt-3">
                <NumberField
                  label="Max Concurrent Sessions"
                  value={session.values.max_concurrent_sessions ?? 5}
                  onChange={v => session.set('max_concurrent_sessions', v)}
                  hint="0 = unlimited"
                />
                <NumberField
                  label="Access Token TTL (Minutes)"
                  value={session.values.access_token_ttl_minutes ?? 30}
                  onChange={v => session.set('access_token_ttl_minutes', v)}
                  min={1}
                />
                <NumberField
                  label="Refresh Token TTL (Days)"
                  value={session.values.refresh_token_ttl_days ?? 7}
                  onChange={v => session.set('refresh_token_ttl_days', v)}
                  min={1}
                />
                <SaveButton
                  onSave={() => session.save('session_policy')}
                  saving={session.saving}
                  feedback={session.feedback}
                />
              </div>
            </Section>

            <Section title="Lockout Policy" open={open.lockout} onToggle={() => toggle('lockout')}>
              <div className="mt-3">
                <NumberField
                  label="Max Failed Attempts"
                  value={lockout.values.max_failed_attempts ?? 5}
                  onChange={v => lockout.set('max_failed_attempts', v)}
                  min={1}
                />
                <NumberField
                  label="Lockout Duration (Minutes)"
                  value={lockout.values.lockout_duration_minutes ?? 30}
                  onChange={v => lockout.set('lockout_duration_minutes', v)}
                  min={1}
                />
                <NumberField
                  label="Reset Attempts After (Minutes)"
                  value={lockout.values.reset_attempts_after_minutes ?? 60}
                  onChange={v => lockout.set('reset_attempts_after_minutes', v)}
                  min={1}
                />
                <SaveButton
                  onSave={() => lockout.save('lockout_policy')}
                  saving={lockout.saving}
                  feedback={lockout.feedback}
                />
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
