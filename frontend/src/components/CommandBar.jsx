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
  { key: 'threat_intel', label: 'Watchlist',    icon: '⚑' },
  { key: 'darkweb',      label: 'Dark Web',    icon: '◑' },
  { key: 'financial',    label: 'Financial',   icon: '₹' },
];

const ALL_ENGINE_KEYS = ENGINE_META.map(e => e.key);

function detectType(value) {
  const v = value.trim();
  if (!v) return 'username';
  if (/^\+?[\d\s\-()\u00A0]{7,15}$/.test(v)) return 'phone';
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

export default function CommandBar({ onSearch, loading, onCancel, onClear, collapsed, activeSeeds }) {
  const [value, setValue] = useState('');
  const [manualType, setManualType] = useState(null);
  const [selectedEngines, setSelectedEngines] = useState(new Set(ALL_ENGINE_KEYS));
  const inputRef = useRef(null);
  const { engineCosts, remaining, overage, isAdmin } = useCredits();

  const detectedType = manualType ?? detectType(value);
  const meta = TYPE_META[detectedType];
  const hasValue = value.trim().length > 0;

  const totalCost = useMemo(() => {
    if (!engineCosts || Object.keys(engineCosts).length === 0) return 0;
    return [...selectedEngines].reduce((sum, e) => sum + (engineCosts[e] || 0), 0);
  }, [selectedEngines, engineCosts]);

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
    const engines = selectedEngines.size === ALL_ENGINE_KEYS.length ? null : [...selectedEngines];
    onSearch([{ type: detectedType, value: v }], engines);
  }, [value, detectedType, onSearch, selectedEngines]);

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
      <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-sap-border bg-sap-surface shadow-sm">
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider shrink-0"
          style={{ color: seedMeta.color, background: seedMeta.bg, border: `1px solid ${seedMeta.border}` }}
        >
          {seedMeta.label}
        </span>
        <span className="font-mono text-sm text-sap-text truncate flex-1 min-w-0">{seed.value}</span>
        {loading && (
          <span style={{ color: '#4f46e5' }}><Spinner /></span>
        )}
        {loading ? (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 px-2.5 py-1 rounded text-xs font-semibold font-mono text-white bg-entity-drug hover:bg-entity-drug/80 transition-colors"
          >
            Cancel
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handleEdit}
              className="shrink-0 px-2.5 py-1 rounded text-xs font-medium text-sap-dim hover:text-sap-text border border-sap-border bg-sap-panel hover:bg-sap-surface transition-colors"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="shrink-0 px-2.5 py-1 rounded text-xs font-medium text-sap-dim hover:text-sap-text border border-sap-border bg-sap-panel hover:bg-sap-surface transition-colors"
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
      <form onSubmit={handleSubmit} className="flex items-center gap-2 h-12 px-2 rounded-lg border border-sap-border bg-sap-surface shadow-sm focus-within:border-sap-accent focus-within:ring-2 focus-within:ring-sap-accent/10 transition-all">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => { setValue(e.target.value); setManualType(null); }}
          onKeyDown={e => e.key === 'Escape' && (setValue(''), setManualType(null))}
          placeholder="Search phone, email, name, or username..."
          autoFocus
          className="flex-1 min-w-0 bg-transparent outline-none font-mono text-sm text-sap-text placeholder:text-sap-muted px-2"
        />
        {hasValue && (
          <button
            type="button"
            onClick={cycleType}
            title="Click to change type"
            className="shrink-0 inline-flex items-center px-2 py-1 rounded cursor-pointer transition-colors hover:opacity-80 active:scale-95"
            style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}
          >
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider">{meta.label}</span>
          </button>
        )}
        {loading ? (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 h-8 px-3.5 rounded-md bg-entity-drug hover:bg-entity-drug/80 text-white text-xs font-semibold font-mono uppercase tracking-wider transition-colors flex items-center gap-1.5"
          >
            <Spinner />
            Cancel
          </button>
        ) : (
          <button
            type="submit"
            disabled={!hasValue || !canAfford}
            className="shrink-0 h-8 px-4 rounded-md bg-sap-accent hover:bg-sap-accent-glow disabled:opacity-35 disabled:cursor-not-allowed text-white text-xs font-semibold font-mono uppercase tracking-wider transition-colors"
          >
            Search
          </button>
        )}
      </form>

      {showCostBar && (
        <div className="flex items-center gap-1.5 px-1">
          {ENGINE_META.map(eng => {
            const active = selectedEngines.has(eng.key);
            const cost = engineCosts[eng.key] || 0;
            return (
              <button
                key={eng.key}
                type="button"
                onClick={() => toggleEngine(eng.key)}
                className={`
                  inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium
                  transition-all duration-150 border cursor-pointer select-none
                  ${active
                    ? 'bg-sap-accent/10 border-sap-accent/30 text-sap-accent'
                    : 'bg-sap-bg border-sap-border text-sap-muted line-through decoration-sap-muted/40'
                  }
                `}
              >
                <span className="text-[11px]">{eng.icon}</span>
                <span>{eng.label}</span>
                {cost > 0 && (
                  <span className={`font-mono tabular-nums ${active ? 'text-sap-accent/70' : 'text-sap-muted/50'}`}>
                    {cost}
                  </span>
                )}
              </button>
            );
          })}

          <span className="ml-auto flex items-center gap-1">
            <span className={`text-[10px] font-mono font-semibold tabular-nums px-1.5 py-0.5 rounded ${
              canAfford
                ? 'text-sap-dim bg-sap-bg border border-sap-border'
                : 'text-rose-700 bg-rose-50 border border-rose-200'
            }`}>
              {totalCost} cr
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
