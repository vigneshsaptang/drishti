import { useState, useEffect } from 'react';
import { getDashboardIntel } from '../lib/api';
import DrugRouteMap from './DrugRouteMap';
import HeroStats from './HeroStats';
import OnionLink from './OnionLink';

export default function DashboardIdle() {
  const [intel, setIntel] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardIntel()
      .then(setIntel)
      .catch(() => setIntel(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-3 bg-sap-surface rounded-lg border border-sap-border p-6 shadow-sm">
        <div className="h-2.5 w-2.5 rounded-full bg-sap-accent animate-pulse shadow-[0_0_8px_#2563eb]" />
        <p className="text-sm font-mono text-sap-accent animate-scan">Loading intelligence feeds...</p>
      </div>
    );
  }

  if (!intel) {
    return (
      <div className="bg-sap-surface rounded-lg border border-sap-border p-6 shadow-sm">
        <p className="text-sm text-sap-dim">Intelligence feed unavailable. Use the search bar above to investigate directly.</p>
      </div>
    );
  }

  const drugStats = intel.drug_stats || {};
  const indiaDrugs = intel.india_drugs || [];
  const fraudUpis = intel.fraud_upis || [];
  const threatActors = intel.threat_actors || [];
  const telegramGroups = intel.telegram_groups || [];
  const topWallets = intel.top_wallets || [];

  return (
    <div className="space-y-5 animate-fade-in max-w-full">

      {/* ── Hero: Platform-wide intelligence stats ── */}
      <HeroStats />

      {/* ── Row 1: Map + Threat Actors ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {indiaDrugs.length > 0 && (
          <div className="lg:col-span-2 bg-sap-surface rounded-lg border border-sap-border p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-sap-text mb-3">Location Intelligence — Drug Shipping Routes</h3>
            <div className="h-[300px] rounded-lg overflow-hidden border border-sap-border">
              <DrugRouteMap listings={indiaDrugs} />
            </div>
          </div>
        )}

        {threatActors.length > 0 && (
          <div className="bg-sap-surface rounded-lg border border-sap-border p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-sap-text mb-3">Threat Actor Profiling — India Targeted</h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {threatActors.map((a, i) => (
                <div key={i} className="rounded-lg border border-sap-border bg-sap-panel px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-entity-darkweb">{a.username || '?'}</span>
                    <span className="text-xs text-sap-muted font-mono">{a.no_of_posts} posts</span>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-xs text-sap-dim">
                    <span>Forum: {a.forum_name}</span>
                    <span>{a.no_of_active_days} days active</span>
                  </div>
                  {a.target_countries?.length > 0 && (
                    <p className="text-[11px] text-sap-muted mt-1 truncate">Targets: {a.target_countries.slice(0, 5).join(', ')}</p>
                  )}
                  {a.last_post && (
                    <p className="text-[11px] text-sap-dim mt-1.5 truncate italic border-t border-sap-border/30 pt-1" title={String(a.last_post)}>
                      Last: &ldquo;{String(a.last_post).slice(0, 80)}{String(a.last_post).length > 80 ? '...' : ''}&rdquo;
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Row 2: Fraud UPI Table (full width) ── */}
      {fraudUpis.length > 0 && (
        <div className="bg-sap-surface rounded-lg border border-entity-drug/20 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-entity-drug mb-4">Linked Financial Accounts — Fraud UPI Identifiers</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-sap-border text-left">
                  <th className="px-3 py-2.5 text-xs font-semibold text-sap-dim uppercase tracking-wider">UPI ID</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-sap-dim uppercase tracking-wider">Classification</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-sap-dim uppercase tracking-wider">Linked Site</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-sap-dim uppercase tracking-wider">Payment Gateway</th>
                </tr>
              </thead>
              <tbody>
                {fraudUpis.map((u, i) => (
                  <tr key={i} className="border-b border-sap-border/50 hover:bg-sap-panel/50">
                    <td className="px-3 py-3 font-mono text-sm font-medium text-sap-text">{u.upi_details?.pa || '—'}</td>
                    <td className="px-3 py-3">
                      <span className="px-2 py-1 rounded-md text-xs font-semibold bg-entity-drug/10 text-entity-drug border border-entity-drug/20">
                        {u.clasification || 'UNKNOWN'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm">
                      {u.site ? (
                        <a href={u.site} target="_blank" rel="noopener" className="text-sap-accent hover:underline truncate block max-w-[200px]">{u.site}</a>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-entity-crypto">{u.payment_gateway || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Row 3: Drug Markets + Categories + Crypto ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Drug Market Listings */}
        {indiaDrugs.length > 0 && (
          <div className="lg:col-span-2 bg-sap-surface rounded-lg border border-sap-border p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-entity-drug mb-4">Dark Web Marketplace Monitoring — India Origin</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-sap-border text-left">
                    <th className="px-3 py-2 text-xs font-semibold text-sap-dim uppercase tracking-wider">Product</th>
                    <th className="px-3 py-2 text-xs font-semibold text-sap-dim uppercase tracking-wider">Vendor</th>
                    <th className="px-3 py-2 text-xs font-semibold text-sap-dim uppercase tracking-wider">Market</th>
                    <th className="px-3 py-2 text-xs font-semibold text-sap-dim uppercase tracking-wider">Category</th>
                    <th className="px-3 py-2 text-xs font-semibold text-sap-dim uppercase tracking-wider">Ships</th>
                    <th className="px-3 py-2 text-xs font-semibold text-sap-dim uppercase tracking-wider">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {indiaDrugs.map((d, i) => (
                    <tr key={i} className="border-b border-sap-border/50 hover:bg-sap-panel/50">
                      <td className="px-3 py-2.5 font-medium text-sap-text max-w-[200px]" title={d.listing_title}>
                        <span className="block truncate">{d.listing_title}</span>
                        <OnionLink url={d.listing_link} className="mt-0.5" />
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-entity-drug">{d.vendor_name || '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-sap-dim">{d.marketplace}</td>
                      <td className="px-3 py-2.5 text-xs text-sap-dim max-w-[120px] truncate">{d.listing_category}</td>
                      <td className="px-3 py-2.5 text-xs text-sap-dim">{d.shipping_from} → {d.shipping_to}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-entity-crypto">{JSON.stringify(d.listing_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Drug Categories */}
        {drugStats.categories?.length > 0 && (
          <div className="bg-sap-surface rounded-lg border border-sap-border p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-sap-text mb-4">Drug Categories</h3>
            <div className="space-y-2">
              {drugStats.categories.slice(0, 12).map((c, ci) => {
                const pct = Math.round((c.count / (drugStats.categories[0]?.count || 1)) * 100);
                const nameStr = Array.isArray(c.name) ? c.name.join(', ') : String(c.name || '');
                const label = nameStr.includes(',') ? nameStr.split(',').pop().trim() : nameStr;
                return (
                  <div key={ci} className="flex items-center gap-2 text-sm">
                    <span className="w-28 truncate text-sap-dim text-xs" title={nameStr}>{label}</span>
                    <div className="flex-1 h-2 bg-sap-panel rounded-full overflow-hidden">
                      <div className="h-full bg-entity-drug/50 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-12 text-right text-sap-muted text-xs font-mono">{c.count.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Row 4: Telegram + Marketplaces + Crypto ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Telegram Groups */}
        {telegramGroups.length > 0 && (
          <div className="bg-sap-surface rounded-lg border border-entity-telegram/20 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-entity-telegram mb-3">Social Media Intelligence — Channel Monitoring</h3>
            <div className="space-y-2">
              {telegramGroups.map((g, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-sap-border bg-sap-panel px-3 py-2.5">
                  <div className="min-w-0">
                    <span className="font-mono text-sm text-entity-telegram block">{g._id}</span>
                    {g.group_id && (
                      <span className="text-[10px] text-sap-muted font-mono tracking-wide">ID: {g.group_id}</span>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-sm font-semibold text-sap-text">{g.total_phones?.toLocaleString()}</span>
                    <span className="text-xs text-sap-dim ml-1">mentions</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dark Web Marketplaces */}
        {drugStats.marketplaces?.length > 0 && (
          <div className="bg-sap-surface rounded-lg border border-entity-darkweb/20 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-entity-darkweb mb-3">Dark Web OSINT — Active Marketplaces</h3>
            <div className="space-y-2">
              {drugStats.marketplaces.slice(0, 10).map(m => {
                const pct = Math.round((m.count / (drugStats.marketplaces[0]?.count || 1)) * 100);
                return (
                  <div key={m.name} className="flex items-center gap-2 text-sm">
                    <span className="w-24 truncate text-sap-dim text-xs">{m.name}</span>
                    <div className="flex-1 h-2 bg-sap-panel rounded-full overflow-hidden">
                      <div className="h-full bg-entity-darkweb/50 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-12 text-right text-sap-muted text-xs font-mono">{m.count.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top Crypto Wallets */}
        {topWallets.length > 0 && (
          <div className="bg-sap-surface rounded-lg border border-entity-crypto/20 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-entity-crypto mb-3">Crypto Trail — Wallet Intelligence</h3>
            <div className="space-y-2">
              {topWallets.map((w, i) => (
                <div key={i} className="rounded-lg border border-sap-border bg-sap-panel px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 bg-entity-crypto/10 text-entity-crypto text-xs font-bold rounded">{w.blockchain_type || 'BTC'}</span>
                    <span className="font-mono text-xs text-sap-text truncate">{w.wallet_address?.slice(0, 20)}...</span>
                  </div>
                  <div className="flex justify-between mt-1.5 text-xs">
                    <span className="text-sap-dim">Volume: <span className="text-entity-crypto font-medium">{w.total_volume?.fiat?.amount || '?'} {w.total_volume?.fiat?.currency_type || ''}</span></span>
                    <span className="text-sap-dim font-mono">{w.transactions_count?.total || '?'} tx</span>
                  </div>
                  <div className="mt-1.5 pt-1 border-t border-sap-border/30 text-right">
                    <span className="text-[11px] text-entity-crypto/70 hover:text-entity-crypto cursor-pointer transition-colors font-mono">Investigate &rarr;</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
