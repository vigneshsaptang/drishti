import { useState } from 'react';

export default function CommandBar({ onSearch, loading }) {
  const [type, setType] = useState('phone');
  const [value, setValue] = useState('');
  const [depth, setDepth] = useState(2);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (value.trim()) onSearch(type, value.trim(), depth);
  };

  CommandBar._setSearch = (t, v) => {
    setType(t);
    setValue(v);
  };

  return (
    <div className="rounded-xl border border-sap-border bg-sap-surface shadow-sm overflow-hidden">
      <div className="flex items-stretch">
        <div className="w-1.5 bg-gradient-to-b from-sap-accent to-blue-700 shrink-0" aria-hidden />
        <div className="flex-1 min-w-0 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <div>
              <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-sap-accent font-semibold">Investigation Query</h2>
              <p className="text-sm text-sap-dim mt-0.5">Enter an identifier to search breach, threat intel, and dark web engines</p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col lg:flex-row lg:items-end gap-3">
            <div className="space-y-1.5 shrink-0">
              <label htmlFor="cmd-type" className="block text-[10px] font-mono text-sap-dim uppercase tracking-wider font-medium">Type</label>
              <select
                id="cmd-type"
                value={type}
                onChange={e => setType(e.target.value)}
                className="w-full lg:w-40 bg-sap-panel border border-sap-border rounded-lg px-3 py-3 text-sm font-mono text-sap-text outline-none focus:border-sap-accent focus:ring-2 focus:ring-sap-accent/20"
              >
                <option value="phone">Phone</option>
                <option value="email">Email</option>
              </select>
            </div>
            <div className="space-y-1.5 flex-1 min-w-0 max-w-2xl">
              <label htmlFor="cmd-value" className="block text-[10px] font-mono text-sap-dim uppercase tracking-wider font-medium">Value</label>
              <div className="relative">
                <input
                  id="cmd-value"
                  type="text"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  placeholder="+91… or user@domain"
                  autoFocus
                  className="w-full bg-sap-panel border border-sap-border rounded-lg pl-4 pr-10 py-3 text-base font-mono text-sap-text outline-none focus:border-sap-accent focus:ring-2 focus:ring-sap-accent/20 placeholder:text-sap-muted"
                />
                {loading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <svg className="w-5 h-5 text-sap-accent animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5 w-20">
                <label htmlFor="cmd-depth" className="block text-[10px] font-mono text-sap-dim uppercase tracking-wider font-medium">Depth</label>
                <input
                  id="cmd-depth"
                  type="number"
                  value={depth}
                  onChange={e => setDepth(Number(e.target.value))}
                  min={1}
                  max={5}
                  className="w-full bg-sap-panel border border-sap-border rounded-lg px-2 py-3 text-base font-mono text-sap-text text-center outline-none focus:border-sap-accent"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !value.trim()}
                className="h-[48px] px-6 rounded-lg bg-sap-accent hover:bg-sap-accent-glow disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold tracking-wider font-mono uppercase shadow-md transition-colors"
              >
                {loading ? 'Running...' : 'Execute'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
