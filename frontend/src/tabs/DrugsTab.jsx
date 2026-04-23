import { useState, useEffect } from 'react';
import { getDrugStats, getIndiaVendors, searchDrugs } from '../lib/api';
import DrugRouteMap from '../components/DrugRouteMap';

export default function DrugsTab() {
  const [stats, setStats] = useState(null);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  const handleDrugSearch = async (e) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchDrugs(searchQuery.trim());
      setSearchResults(results);
    } catch { setSearchResults([]); }
    setSearching(false);
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getDrugStats().catch(() => ({ categories: [], marketplaces: [] })),
      getIndiaVendors().catch(() => []),
    ]).then(([s, l]) => {
      setStats(s);
      setListings(l);
      setLoading(false);
    });
  }, []);

  if (loading) return <p className="text-xs text-sap-dim font-mono py-8 text-center animate-scan">Loading drug intelligence...</p>;

  // Group listings by vendor
  const vendors = {};
  listings.forEach(l => {
    const v = l.vendor_name || 'Unknown';
    if (!vendors[v]) vendors[v] = { listings: [], markets: new Set(), categories: new Set() };
    vendors[v].listings.push(l);
    if (l.marketplace) vendors[v].markets.add(l.marketplace);
    if (l.listing_category) vendors[v].categories.add(l.listing_category);
  });

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Drug Search */}
      <form onSubmit={handleDrugSearch} className="flex gap-3 items-center">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search drugs, vendors, categories..."
          className="flex-1 bg-sap-panel border border-sap-border rounded px-4 py-2 text-sm font-mono text-sap-text outline-none focus:border-entity-drug placeholder:text-sap-muted"
        />
        <button
          type="submit"
          disabled={searching}
          className="bg-entity-drug/20 hover:bg-entity-drug/30 text-entity-drug border border-entity-drug/30 px-4 py-2 rounded text-sm font-mono font-semibold transition-colors disabled:opacity-40"
        >
          {searching ? 'SEARCHING...' : 'SEARCH DRUGS'}
        </button>
      </form>

      {/* Search results */}
      {searchResults && (
        <div className="bg-sap-surface border border-entity-drug/20 rounded-lg p-4">
          <h4 className="text-xs font-mono tracking-widest text-entity-drug mb-3 uppercase">Search Results ({searchResults.length})</h4>
          {searchResults.length === 0 && <p className="text-sm text-sap-dim">No results found</p>}
          {searchResults.slice(0, 20).map((l, i) => (
            <div key={i} className="flex items-start gap-3 py-2 border-b border-sap-border/30 last:border-0 text-xs">
              {l.listing_images && (
                <img
                  src={Array.isArray(l.listing_images) ? l.listing_images[0] : l.listing_images}
                  className="w-10 h-10 rounded object-cover flex-shrink-0 border border-sap-border"
                  onError={e => e.target.style.display = 'none'}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm truncate">{l.listing_title}</p>
                <div className="flex gap-3 mt-1 text-sap-dim font-mono">
                  <span className="text-entity-drug">{l.vendor_name}</span>
                  <span>{l.marketplace}</span>
                  <span>{l.shipping_from} → {l.shipping_to}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats Dashboard */}
      {stats && (stats.categories?.length > 0 || stats.marketplaces?.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {stats.categories?.length > 0 && (
            <div className="bg-sap-surface border border-sap-border rounded-lg p-4">
              <h4 className="text-xs font-mono tracking-widest text-entity-drug mb-3 uppercase">Drug Categories</h4>
              <div className="space-y-1.5">
                {stats.categories.slice(0, 15).map((c, ci) => {
                  const pct = Math.round((c.count / (stats.categories[0]?.count || 1)) * 100);
                  const nameStr = Array.isArray(c.name) ? c.name.join(', ') : String(c.name || '');
                  const label = nameStr.includes(',') ? nameStr.split(',').pop().trim() : nameStr;
                  return (
                    <div key={ci} className="flex items-center gap-2 text-xs font-mono">
                      <span className="w-40 truncate text-sap-dim" title={nameStr}>{label}</span>
                      <div className="flex-1 h-1.5 bg-sap-panel rounded-full overflow-hidden">
                        <div className="h-full bg-entity-drug/60 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-12 text-right text-sap-dim">{c.count.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {stats.marketplaces?.length > 0 && (
            <div className="bg-sap-surface border border-sap-border rounded-lg p-4">
              <h4 className="text-xs font-mono tracking-widest text-entity-darkweb mb-3 uppercase">Marketplaces</h4>
              <div className="space-y-1.5">
                {stats.marketplaces.slice(0, 15).map(m => {
                  const pct = Math.round((m.count / (stats.marketplaces[0]?.count || 1)) * 100);
                  return (
                    <div key={m.name} className="flex items-center gap-2 text-xs font-mono">
                      <span className="w-32 truncate text-sap-dim">{m.name}</span>
                      <div className="flex-1 h-1.5 bg-sap-panel rounded-full overflow-hidden">
                        <div className="h-full bg-entity-darkweb/60 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-12 text-right text-sap-dim">{m.count.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Drug Route Map */}
      {listings.length > 0 && (
        <div className="bg-sap-surface border border-sap-border rounded-lg p-4">
          <h4 className="text-xs font-mono tracking-widest text-entity-drug mb-3 uppercase">Shipping Route Map</h4>
          <div className="h-[400px] rounded overflow-hidden">
            <DrugRouteMap listings={listings} />
          </div>
        </div>
      )}

      {/* India Vendors */}
      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-xs font-mono tracking-[3px] uppercase text-entity-drug">India-Origin Dark Web Drug Vendors</h3>
        <div className="flex-1 h-px bg-sap-border" />
        <span className="text-xs text-sap-dim font-mono">{listings.length} listings</span>
      </div>

      {Object.entries(vendors).map(([name, info]) => (
        <VendorCard key={name} name={name} info={info} />
      ))}
    </div>
  );
}

function VendorCard({ name, info }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-sap-surface border border-entity-drug/20 rounded-lg overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between cursor-pointer" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-entity-drug" />
          <span className="font-mono font-semibold text-sm">{name}</span>
          <span className="text-[10px] text-sap-dim font-mono">{info.listings.length} listings</span>
        </div>
        <div className="flex gap-2">
          {[...info.markets].map(m => <span key={m} className="text-[10px] font-mono px-1.5 py-0.5 bg-sap-panel rounded text-sap-dim">{m}</span>)}
        </div>
      </div>
      {open && (
        <div className="border-t border-sap-border">
          {info.listings.slice(0, 10).map((l, i) => (
            <div key={i} className="px-4 py-2 border-b border-sap-border/30 flex items-start gap-3 text-xs">
              {l.listing_images && (
                <img
                  src={Array.isArray(l.listing_images) ? l.listing_images[0] : l.listing_images}
                  className="w-10 h-10 rounded object-cover flex-shrink-0 border border-sap-border"
                  onError={e => e.target.style.display = 'none'}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm truncate">{l.listing_title || ''}</p>
                <div className="flex gap-3 mt-1 text-sap-dim font-mono">
                  <span>{l.listing_category || ''}</span>
                  <span>{l.shipping_from || '?'} → {l.shipping_to || '?'}</span>
                  <span className="text-entity-crypto">{JSON.stringify(l.listing_price || '')}</span>
                </div>
              </div>
              {l.screenshot_s3link && (
                <a href={l.screenshot_s3link} target="_blank" rel="noopener" className="text-[10px] text-sap-accent hover:underline flex-shrink-0">View</a>
              )}
            </div>
          ))}
          {info.listings.length > 10 && <div className="px-4 py-2 text-[10px] text-sap-dim font-mono">+{info.listings.length - 10} more</div>}
        </div>
      )}
    </div>
  );
}
