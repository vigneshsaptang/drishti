import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useCredits } from '../lib/creditContext';

const TYPE_META = {
  phone:    { label: 'phone',    color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
  email:    { label: 'email',    color: '#10b981', bg: '#f0fdf4', border: '#bbf7d0' },
};

const TYPES = ['phone', 'email'];

const ENGINE_META = [
  { key: 'breach',       label: 'Breaches',    icon: '⛊' },
  { key: 'threat_intel', label: 'Watchlist',   icon: '⚑' },
  { key: 'darkweb',      label: 'Dark Web',    icon: '◑' },
  { key: 'financial',    label: 'Financial',   icon: '₹' },
];

const ALL_ENGINE_KEYS = ENGINE_META.map(e => e.key);

const ENGINES_BY_TYPE = {
  phone: ['breach', 'threat_intel', 'darkweb', 'financial'],
  email: ['breach', 'threat_intel', 'darkweb', 'financial'],
};

const TYPE_HINTS = {
  phone: 'Breach records, watchlists, dark web, financial',
  email: 'Breach records, watchlists, dark web, financial',
};

function detectPrimaryType(value) {
  const v = value.trim();
  if (!v) return null;
  if (v.includes('@')) return 'email';
  if (/^\+?[\d\s\-()]{7,15}$/.test(v)) return 'phone';
  return null;
}

function Spinner() {
  return (
    <svg className="w-3.5 h-3.5 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function Kbd({ children, tone = 'light' }) {
  const cls = tone === 'dark'
    ? 'border-white/25 bg-white/10 text-white/85'
    : 'border-sap-border-light bg-sap-bg text-sap-muted';
  return (
    <kbd className={`inline-flex items-center justify-center h-[15px] min-w-[15px] px-1 rounded-[3px] border ${cls} text-11 font-mono leading-none`}>
      {children}
    </kbd>
  );
}

function Chevron({ open }) {
  return (
    <svg
      className={`w-3 h-3 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 2.5 L8 6 L4 9.5" />
    </svg>
  );
}

export default function CommandBar({ onSearch, loading, onCancel, onClear, collapsed, activeSeeds }) {
  const [value, setValue] = useState('');
  const [selectedEngines, setSelectedEngines] = useState(new Set(ALL_ENGINE_KEYS));
  const [nameOpen, setNameOpen] = useState(false);
  const [nameFirst, setNameFirst] = useState('');
  const [nameMiddle, setNameMiddle] = useState('');
  const [nameLast, setNameLast] = useState('');
  const [nameInitials, setNameInitials] = useState('');
  const [nameDob, setNameDob] = useState('');
  const inputRef = useRef(null);
  const { engineCosts, remaining, overage, isAdmin } = useCredits();

  const trimmed = value.trim();
  const detectedType = detectPrimaryType(value);
  const hasValue = trimmed.length > 0;
  const isInvalid = hasValue && detectedType === null;

  const applicableEngines = useMemo(
    () => new Set(detectedType ? (ENGINES_BY_TYPE[detectedType] || ALL_ENGINE_KEYS) : ALL_ENGINE_KEYS),
    [detectedType]
  );

  const effectiveEngines = useMemo(() => {
    const filtered = new Set([...selectedEngines].filter(e => applicableEngines.has(e)));
    return filtered.size > 0 ? filtered : new Set(applicableEngines);
  }, [selectedEngines, applicableEngines]);

  const totalCost = useMemo(() => {
    if (!engineCosts || Object.keys(engineCosts).length === 0) return 0;
    return [...effectiveEngines].reduce((sum, e) => sum + (engineCosts[e] || 0), 0);
  }, [effectiveEngines, engineCosts]);

  const canAfford = isAdmin || remaining === null || remaining >= totalCost || overage !== 'hard';

  const hasName = !!(nameFirst.trim() || nameLast.trim() || nameInitials.trim());

  const filledNameCount = [nameFirst, nameMiddle, nameLast, nameInitials].filter(s => s.trim()).length;

  const toggleEngine = useCallback((key) => {
    setSelectedEngines(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleSubmit = useCallback((e) => {
    e?.preventDefault();
    const v = value.trim();
    if (!v) return;
    const primaryType = detectPrimaryType(v);
    if (primaryType === null) return;
    const engines = effectiveEngines.size === ALL_ENGINE_KEYS.length ? null : [...effectiveEngines];
    const subject = hasName ? {
      first:    nameFirst.trim()    || null,
      middle:   nameMiddle.trim()   || null,
      last:     nameLast.trim()     || null,
      initials: nameInitials.trim() || null,
      dob:      nameDob.trim()      || null,
    } : null;
    onSearch(
      [{ type: primaryType, value: v }],
      engines,
      subject,
    );
  }, [value, onSearch, effectiveEngines, hasName, nameFirst, nameMiddle, nameLast, nameInitials, nameDob]);

  const handleClear = useCallback(() => {
    setValue('');
    onClear?.();
  }, [onClear]);

  const handleEdit = useCallback(() => {
    if (activeSeeds?.length) {
      const seed = activeSeeds[0];
      setValue(seed.value);
    }
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [activeSeeds]);

  useEffect(() => {
    CommandBar._setSearch = (_type, val) => {
      setValue(val);
    };
    return () => { CommandBar._setSearch = null; };
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === '/') {
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea') {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }
      if (e.key === 'Escape') {
        if (document.activeElement === inputRef.current) {
          setValue('');
          inputRef.current?.blur();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  if (collapsed && (activeSeeds?.length > 0)) {
    const seed = activeSeeds[0];
    const seedMeta = TYPE_META[seed.type] ?? TYPE_META.email;
    return (
      <div className="flex items-center gap-2 h-9 px-2.5 rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded text-11 font-medium tracking-tight shrink-0"
          style={{ color: seedMeta.color, background: seedMeta.bg, border: `1px solid ${seedMeta.border}` }}
        >
          {seedMeta.label}
        </span>
        <span className="font-mono text-13 text-sap-text truncate flex-1 min-w-0">{seed.value}</span>
        {loading && (
          <span className="text-sap-accent"><Spinner /></span>
        )}
        {loading ? (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 h-7 px-2.5 rounded-md text-12 font-medium text-white bg-sap-danger-filled hover:bg-sap-danger transition-colors"
          >
            Cancel
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handleEdit}
              className="shrink-0 h-7 px-2.5 rounded-md text-12 font-medium text-sap-dim hover:text-sap-text border border-sap-border-light bg-sap-bg hover:bg-sap-surface transition-colors"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="shrink-0 h-7 px-2.5 rounded-md text-12 font-medium text-sap-dim hover:text-sap-text border border-sap-border-light bg-sap-bg hover:bg-sap-surface transition-colors"
            >
              Clear
            </button>
          </>
        )}
      </div>
    );
  }

  const showCostBar = hasValue && !isInvalid && !loading && !isAdmin && Object.keys(engineCosts).length > 0;

  const formBorderCls = isInvalid
    ? 'border-sap-danger/40 focus-within:border-sap-danger focus-within:ring-4 focus-within:ring-sap-danger/10'
    : 'border-sap-border-light focus-within:border-sap-accent focus-within:ring-4 focus-within:ring-sap-accent/10';

  const searchDisabled = !hasValue || isInvalid || !canAfford;

  return (
    <div className="space-y-1.5">
      <div className="rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <form
          onSubmit={handleSubmit}
          className={`flex items-center gap-2 h-11 pl-3 pr-1.5 rounded-lg bg-sap-surface border transition-[border-color,box-shadow] duration-150 ${formBorderCls}`}
        >
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && setValue('')}
            placeholder="Search phone or email…"
            autoFocus
            className="flex-1 min-w-0 bg-transparent outline-none text-14 text-sap-text placeholder:text-sap-muted"
          />

          {!hasValue && (
            <span className="hidden sm:inline-flex items-center gap-1 text-11 text-sap-muted shrink-0 pr-1">
              <Kbd>/</Kbd>
              <span>to focus</span>
            </span>
          )}

          {loading ? (
            <button
              type="button"
              onClick={onCancel}
              className="shrink-0 h-8 px-3 rounded-md bg-sap-danger-filled hover:bg-sap-danger text-white text-13 font-medium transition-colors flex items-center gap-1.5"
            >
              <Spinner />
              Cancel
            </button>
          ) : (
            <button
              type="submit"
              disabled={searchDisabled}
              className="shrink-0 h-8 px-3 rounded-md bg-sap-accent hover:bg-sap-accent-glow disabled:opacity-40 disabled:cursor-not-allowed text-white text-13 font-medium transition-colors inline-flex items-center gap-2"
              style={{
                boxShadow:
                  'inset 0 -1px 0 rgba(0,0,0,0.16), 0 1px 2px color-mix(in srgb, var(--color-sap-accent) 25%, transparent)',
              }}
            >
              <span>Search</span>
              <Kbd tone="dark">↵</Kbd>
            </button>
          )}
        </form>

        <div className="border-t border-sap-border-light">
          <button
            type="button"
            onClick={() => setNameOpen(o => !o)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-12 text-sap-dim hover:text-sap-text transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Chevron open={nameOpen} />
              Add name details
              <span className="text-sap-muted">(recommended for screening accuracy)</span>
            </span>
            {hasName && (
              <span className="text-11 text-sap-accent tabular-nums">
                {filledNameCount} fields
              </span>
            )}
          </button>

          {nameOpen && (
            <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2">
              <div className="flex flex-col gap-1">
                <label className="text-11 text-sap-dim" htmlFor="cb-name-first">First name</label>
                <input
                  id="cb-name-first"
                  type="text"
                  value={nameFirst}
                  onChange={e => setNameFirst(e.target.value)}
                  placeholder="e.g. Saikrishna"
                  className="h-8 rounded-md border border-sap-border-light bg-sap-surface px-2.5 text-12 text-sap-text placeholder:text-sap-muted outline-none focus:border-sap-accent focus:ring-4 focus:ring-sap-accent/10"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-11 text-sap-dim" htmlFor="cb-name-initials">Initials</label>
                <input
                  id="cb-name-initials"
                  type="text"
                  value={nameInitials}
                  onChange={e => setNameInitials(e.target.value)}
                  placeholder="e.g. BVS"
                  className="h-8 rounded-md border border-sap-border-light bg-sap-surface px-2.5 text-12 text-sap-text placeholder:text-sap-muted outline-none focus:border-sap-accent focus:ring-4 focus:ring-sap-accent/10"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-11 text-sap-dim" htmlFor="cb-name-last">Last name</label>
                <input
                  id="cb-name-last"
                  type="text"
                  value={nameLast}
                  onChange={e => setNameLast(e.target.value)}
                  placeholder="e.g. Budamgunta"
                  className="h-8 rounded-md border border-sap-border-light bg-sap-surface px-2.5 text-12 text-sap-text placeholder:text-sap-muted outline-none focus:border-sap-accent focus:ring-4 focus:ring-sap-accent/10"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-11 text-sap-dim" htmlFor="cb-name-dob">Date of birth</label>
                <input
                  id="cb-name-dob"
                  type="text"
                  value={nameDob}
                  onChange={e => setNameDob(e.target.value)}
                  placeholder="YYYY-MM-DD"
                  className="h-8 rounded-md border border-sap-border-light bg-sap-surface px-2.5 text-12 text-sap-text placeholder:text-sap-muted outline-none focus:border-sap-accent focus:ring-4 focus:ring-sap-accent/10"
                />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-11 text-sap-dim" htmlFor="cb-name-middle">Middle name</label>
                <input
                  id="cb-name-middle"
                  type="text"
                  value={nameMiddle}
                  onChange={e => setNameMiddle(e.target.value)}
                  placeholder="Optional"
                  className="h-8 rounded-md border border-sap-border-light bg-sap-surface px-2.5 text-12 text-sap-text placeholder:text-sap-muted outline-none focus:border-sap-accent focus:ring-4 focus:ring-sap-accent/10"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {isInvalid && (
        <p className="text-12 text-sap-danger px-1">
          Primary input must be a phone number or email. Use Name details below for screening by name.
        </p>
      )}

      {hasValue && !isInvalid && (
        <p className="text-11 text-sap-dim px-1">
          {TYPE_HINTS[detectedType]}
        </p>
      )}

      {showCostBar && (
        <div className="flex items-center gap-1.5 px-1">
          {ENGINE_META.map(eng => {
            const isApplicable = applicableEngines.has(eng.key);
            const active = isApplicable && effectiveEngines.has(eng.key);
            const cost = engineCosts[eng.key] || 0;
            return (
              <button
                key={eng.key}
                type="button"
                onClick={() => isApplicable && toggleEngine(eng.key)}
                disabled={!isApplicable}
                className={`
                  inline-flex items-center gap-1 px-2 h-6 rounded-md text-11 font-medium tracking-tight
                  transition-colors duration-150 border select-none
                  ${!isApplicable
                    ? 'bg-sap-bg border-sap-border-light text-sap-muted/40 cursor-not-allowed opacity-50'
                    : active
                      ? 'bg-sap-accent/[0.08] border-sap-accent/25 text-sap-accent cursor-pointer hover:bg-sap-accent/[0.12]'
                      : 'bg-sap-bg border-sap-border-light text-sap-muted line-through decoration-sap-muted/40 cursor-pointer hover:text-sap-dim'
                  }
                `}
              >
                <span className="text-11 opacity-70">{eng.icon}</span>
                <span>{eng.label}</span>
                {cost > 0 && isApplicable && (
                  <span className={`tabular-nums ml-0.5 ${active ? 'text-sap-accent/70' : 'text-sap-muted/60'}`}>
                    {cost}
                  </span>
                )}
              </button>
            );
          })}

          <span className="ml-auto flex items-center gap-1">
            <span className={`text-11 font-medium tabular-nums px-1.5 py-0.5 rounded-md border ${
              canAfford
                ? 'text-sap-dim bg-sap-bg border-sap-border-light'
                : 'text-sap-danger bg-sap-danger-soft border-sap-danger/30'
            }`}>
              <span>{totalCost}</span>
              <span className="text-sap-muted ml-0.5">cr</span>
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
