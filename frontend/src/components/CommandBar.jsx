import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useCredits } from '../lib/creditContext';

const TYPE_META = {
  phone:    { label: 'phone',    color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
  email:    { label: 'email',    color: '#10b981', bg: '#f0fdf4', border: '#bbf7d0' },
  fullname: { label: 'name',     color: '#111827', bg: '#f3f4f6', border: '#d1d5db' },
  username: { label: 'username', color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe' },
};

const TYPES = ['phone', 'email', 'fullname', 'username'];

const ENGINE_META = [
  { key: 'breach',       label: 'Breaches',    icon: '⛊' },
  { key: 'threat_intel', label: 'Watchlist',   icon: '⚑' },
  { key: 'darkweb',      label: 'Dark Web',    icon: '◑' },
  { key: 'financial',    label: 'Financial',   icon: '₹' },
];

const ALL_ENGINE_KEYS = ENGINE_META.map(e => e.key);

const ENGINES_BY_TYPE = {
  phone:    ['breach', 'threat_intel', 'darkweb', 'financial'],
  email:    ['breach', 'threat_intel', 'darkweb', 'financial'],
  username: ['breach', 'darkweb'],
  fullname: ['threat_intel'],
};

const TYPE_HINTS = {
  phone:    'Breach records, watchlists, dark web, financial',
  email:    'Breach records, watchlists, dark web, financial',
  username: 'Breach records, dark web forums',
  fullname: 'Watchlist & sanctions screening',
};

function detectType(value) {
  const v = value.trim();
  if (!v) return 'username';
  if (/^\+?[\d\s\-() ]{7,15}$/.test(v)) return 'phone';
  if (v.includes('@')) return 'email';
  if (v.includes(' ') && v.length > 3) return 'fullname';
  return 'username';
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
    <kbd className={`inline-flex items-center justify-center h-[15px] min-w-[15px] px-1 rounded-[3px] border ${cls} text-[10px] font-mono leading-none`}>
      {children}
    </kbd>
  );
}

export default function CommandBar({ onSearch, loading, onCancel, onClear, collapsed, activeSeeds }) {
  const [value, setValue] = useState('');
  const [manualType, setManualType] = useState(null);
  const [selectedEngines, setSelectedEngines] = useState(new Set(ALL_ENGINE_KEYS));
  const inputRef = useRef(null);
  const { engineCosts, remaining, overage, isAdmin } = useCredits();

  const detectedType = manualType ?? detectType(value);
  const meta = TYPE_META[detectedType];
  const hasValue = value.trim().length > 0;

  const applicableEngines = useMemo(
    () => new Set(ENGINES_BY_TYPE[detectedType] || ALL_ENGINE_KEYS),
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

  const cycleType = useCallback(() => {
    const current = manualType ?? detectType(value);
    const idx = TYPES.indexOf(current);
    setManualType(TYPES[(idx + 1) % TYPES.length]);
  }, [manualType, value]);

  const handleSubmit = useCallback((e) => {
    e?.preventDefault();
    const v = value.trim();
    if (!v) return;
    const engines = effectiveEngines.size === ALL_ENGINE_KEYS.length ? null : [...effectiveEngines];
    onSearch([{ type: detectedType, value: v }], engines);
  }, [value, detectedType, onSearch, effectiveEngines]);

  const handleClear = useCallback(() => {
    setValue('');
    setManualType(null);
    onClear?.();
  }, [onClear]);

  const handleEdit = useCallback(() => {
    if (activeSeeds?.length) {
      const seed = activeSeeds[0];
      setValue(seed.value);
      setManualType(seed.type);
    }
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [activeSeeds]);

  useEffect(() => {
    CommandBar._setSearch = (type, val) => {
      setValue(val);
      setManualType(type);
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
          setManualType(null);
          inputRef.current?.blur();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  if (collapsed && (activeSeeds?.length > 0)) {
    const seed = activeSeeds[0];
    const seedMeta = TYPE_META[seed.type] ?? TYPE_META.username;
    return (
      <div className="flex items-center gap-2 h-9 px-2.5 rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-medium tracking-tight shrink-0"
          style={{ color: seedMeta.color, background: seedMeta.bg, border: `1px solid ${seedMeta.border}` }}
        >
          {seedMeta.label}
        </span>
        <span className="font-mono text-[13px] text-sap-text truncate flex-1 min-w-0">{seed.value}</span>
        {loading && (
          <span className="text-sap-accent"><Spinner /></span>
        )}
        {loading ? (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 h-7 px-2.5 rounded-md text-[12px] font-medium text-white bg-entity-drug hover:bg-entity-drug/80 transition-colors"
          >
            Cancel
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handleEdit}
              className="shrink-0 h-7 px-2.5 rounded-md text-[12px] font-medium text-sap-dim hover:text-sap-text border border-sap-border-light bg-sap-bg hover:bg-sap-surface transition-colors"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="shrink-0 h-7 px-2.5 rounded-md text-[12px] font-medium text-sap-dim hover:text-sap-text border border-sap-border-light bg-sap-bg hover:bg-sap-surface transition-colors"
            >
              Clear
            </button>
          </>
        )}
      </div>
    );
  }

  const showCostBar = hasValue && !loading && !isAdmin && Object.keys(engineCosts).length > 0;

  return (
    <div className="space-y-1.5">
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 h-11 pl-3 pr-1.5 rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus-within:border-sap-accent focus-within:ring-4 focus-within:ring-sap-accent/10 transition-[border-color,box-shadow] duration-150"
      >
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => { setValue(e.target.value); setManualType(null); }}
          onKeyDown={e => e.key === 'Escape' && (setValue(''), setManualType(null))}
          placeholder="Search phone, email, name, or username…"
          autoFocus
          className="flex-1 min-w-0 bg-transparent outline-none text-[14px] text-sap-text placeholder:text-sap-muted"
        />

        {!hasValue && (
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-sap-muted shrink-0 pr-1">
            <Kbd>/</Kbd>
            <span>to focus</span>
          </span>
        )}

        {hasValue && (
          <button
            type="button"
            onClick={cycleType}
            title="Click to change type"
            className="shrink-0 inline-flex items-center px-2 h-6 rounded-md cursor-pointer transition-colors hover:opacity-80 active:scale-95"
            style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}
          >
            <span className="text-[11px] font-medium tracking-tight">{meta.label}</span>
          </button>
        )}
        {loading ? (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 h-8 px-3 rounded-md bg-entity-drug hover:bg-entity-drug/80 text-white text-[13px] font-medium transition-colors flex items-center gap-1.5"
          >
            <Spinner />
            Cancel
          </button>
        ) : (
          <button
            type="submit"
            disabled={!hasValue || !canAfford}
            className="shrink-0 h-8 px-3 rounded-md bg-sap-accent hover:bg-sap-accent-glow disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-medium transition-colors inline-flex items-center gap-2"
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

      {hasValue && (
        <p className="text-[11.5px] text-sap-dim px-1">
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
                  inline-flex items-center gap-1 px-2 h-6 rounded-md text-[11px] font-medium tracking-tight
                  transition-colors duration-150 border select-none
                  ${!isApplicable
                    ? 'bg-sap-bg border-sap-border-light text-sap-muted/40 cursor-not-allowed opacity-50'
                    : active
                      ? 'bg-sap-accent/[0.08] border-sap-accent/25 text-sap-accent cursor-pointer hover:bg-sap-accent/[0.12]'
                      : 'bg-sap-bg border-sap-border-light text-sap-muted line-through decoration-sap-muted/40 cursor-pointer hover:text-sap-dim'
                  }
                `}
              >
                <span className="text-[10.5px] opacity-70">{eng.icon}</span>
                <span>{eng.label}</span>
                {cost > 0 && isApplicable && (
                  <span className={`font-mono tabular-nums ml-0.5 ${active ? 'text-sap-accent/70' : 'text-sap-muted/60'}`}>
                    {cost}
                  </span>
                )}
              </button>
            );
          })}

          <span className="ml-auto flex items-center gap-1">
            <span className={`text-[11px] font-medium tabular-nums px-1.5 py-0.5 rounded-md border ${
              canAfford
                ? 'text-sap-dim bg-sap-bg border-sap-border-light'
                : 'text-rose-700 bg-rose-50 border-rose-200'
            }`}>
              <span className="font-mono">{totalCost}</span>
              <span className="text-sap-muted ml-0.5">cr</span>
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
