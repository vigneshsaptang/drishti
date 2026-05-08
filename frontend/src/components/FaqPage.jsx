import { useState, useEffect, useRef } from 'react';
import { getFaqEntries } from '../lib/api';

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'getting_started', label: 'Getting Started' },
  { value: 'searching', label: 'Searching' },
  { value: 'engines', label: 'Engines' },
  { value: 'account', label: 'Account' },
  { value: 'troubleshooting', label: 'Troubleshooting' },
];

export default function FaqPage({ isOpen, onClose, onOpenFeedback }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const params = {};
    if (category) params.category = category;
    if (search.length >= 3) params.q = search;
    getFaqEntries(params).then(d => { if (!cancelled) { setEntries(d.entries || []); setLoading(false); } }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, category]);

  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      const params = {};
      if (category) params.category = category;
      if (val.length >= 3) params.q = val;
      getFaqEntries(params).then(d => { setEntries(d.entries || []); setLoading(false); }).catch(() => setLoading(false));
    }, 300);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[560px] max-w-full bg-sap-surface border-l border-sap-border shadow-2xl overflow-y-auto animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 bg-sap-surface border-b border-sap-border px-5 py-3 z-10 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-sap-text">Help & FAQ</h2>
            <button onClick={onClose} className="text-sap-dim hover:text-sap-text p-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <input value={search} onChange={e => handleSearch(e.target.value)}
            className="w-full bg-sap-bg border border-sap-border rounded-lg px-4 py-2 text-sm text-sap-text placeholder:text-sap-dim/50"
            placeholder="Search FAQ..." />
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {CATEGORIES.map(c => (
              <button key={c.value} onClick={() => setCategory(c.value)}
                className={`px-2.5 py-1 text-[10px] rounded-full whitespace-nowrap transition-colors ${category === c.value
                  ? 'bg-sap-accent/10 text-sap-accent'
                  : 'text-sap-dim hover:text-sap-text'}`}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4">
          {loading ? (
            <p className="text-xs text-sap-dim text-center py-8">Loading...</p>
          ) : entries.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-sap-muted">No articles found{search ? ` for "${search}"` : ''}</p>
              <p className="text-xs text-sap-dim mt-1">Try different keywords or submit a support request.</p>
              {onOpenFeedback && (
                <button onClick={() => { onClose(); onOpenFeedback(); }} className="text-xs text-sap-accent hover:underline mt-2">
                  Submit a request &rarr;
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {entries.map(e => (
                <div key={e.slug} className="border border-sap-border rounded-lg overflow-hidden">
                  <button onClick={() => setExpanded(expanded === e.slug ? null : e.slug)}
                    className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-sap-bg/50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-sap-text">{e.title}</p>
                      <p className="text-[10px] text-sap-muted">{e.category?.replace(/_/g, ' ')}{e.view_count ? ` \u2022 ${e.view_count} views` : ''}</p>
                    </div>
                    <svg className={`w-4 h-4 text-sap-muted shrink-0 transition-transform ${expanded === e.slug ? 'rotate-90' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  {expanded === e.slug && (
                    <div className="px-4 pb-4 text-sm text-sap-text leading-relaxed whitespace-pre-wrap border-t border-sap-border/50">
                      {e.content}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
