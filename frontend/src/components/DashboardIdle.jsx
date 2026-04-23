import { useState, useEffect } from 'react';
import { getDashboardIntel } from '../lib/api';
import DrugRouteMap from './DrugRouteMap';

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
      <div className="space-y-3 animate-fade-in max-w-7xl">
        <div className="tactical-surface rounded-lg border border-sap-accent/25 p-6">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-sap-accent shadow-[0_0_8px_#3b82f6] animate-pulse" />
            <p className="text-sm font-mono text-sap-accent animate-scan">Loading intelligence feeds...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!intel) {
    return (
      <div className="tactical-surface rounded-lg border border-sap-border p-6 max-w-xl">
        <p className="text-sm text-sap-dim">Intelligence feed unavailable. Use the command bar above to search directly.</p>
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
    <div className="space-y-4 animate-fade-in max-w-7xl">
      {/* Top row: Drug route map + Threat actors */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Drug route map */}
        {indiaDrugs.length > 0 && (
          <div className="lg:col-span-2 tactical-surface rounded-lg border border-sap-border p-3">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-entity-drug mb-2">Drug shipping routes — India origin</h3>
            <div className="h-[280px] rounded overflow-hidden border border-sap-border/50">
              <DrugRouteMap listings={indiaDrugs} />
            </div>
          </div>
        )}

        {/* Threat actors targeting India */}
        {threatActors.length > 0 && (
          <div className="tactical-surface rounded-lg border border-sap-border p-3">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-entity-darkweb mb-2">Threat actors — India targeted</h3>
            <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
              {threatActors.map((a, i) => (
                <div key={i} className="rounded border border-sap-border/60 bg-sap-bg/50 px-2.5 py-2 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-entity-darkweb font-semibold truncate">{a.username || '?'}</span>
                    <span className="text-sap-muted text-[10px]">{a.no_of_posts} posts</span>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[10px] text-sap-dim">
                    <span>{a.forum_name}</span>
                    <span>{a.no_of_active_days}d active</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Second row: Fraud UPIs + Drug categories + Crypto wallets */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Fraud UPI handles */}
        {fraudUpis.length > 0 && (
          <div className="tactical-surface rounded-lg border border-entity-drug/20 p-3">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-entity-drug mb-2">Fraud UPI handles — betting sites</h3>
            <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
              {fraudUpis.map((u, i) => (
                <div key={i} className="rounded border border-sap-border/60 bg-sap-bg/50 px-2.5 py-1.5 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="px-1 py-0 bg-entity-drug/20 text-entity-drug text-[8px] font-bold rounded">{u.clasification}</span>
                    <span className="text-sap-text truncate">{u.upi_details?.pa || '?'}</span>
                  </div>
                  {u.site && <p className="text-[10px] text-sap-dim truncate mt-0.5">{u.site}</p>}
                  {u.payment_gateway && <p className="text-[10px] text-entity-crypto truncate">{u.payment_gateway}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Drug categories */}
        {drugStats.categories?.length > 0 && (
          <div className="tactical-surface rounded-lg border border-sap-border p-3">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-entity-drug mb-2">Dark web drug categories</h3>
            <div className="space-y-1">
              {drugStats.categories.slice(0, 10).map(c => {
                const pct = Math.round((c.count / (drugStats.categories[0]?.count || 1)) * 100);
                const label = (c.name || '').includes(',') ? c.name.split(',').pop().trim() : c.name;
                return (
                  <div key={c.name} className="flex items-center gap-2 text-[11px] font-mono">
                    <span className="w-28 truncate text-sap-dim" title={c.name}>{label}</span>
                    <div className="flex-1 h-1 bg-sap-panel rounded-full overflow-hidden">
                      <div className="h-full bg-entity-drug/50 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-10 text-right text-sap-muted text-[10px]">{c.count.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Crypto wallets */}
        {topWallets.length > 0 && (
          <div className="tactical-surface rounded-lg border border-entity-crypto/20 p-3">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-entity-crypto mb-2">Dark web crypto wallets</h3>
            <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
              {topWallets.map((w, i) => (
                <div key={i} className="rounded border border-sap-border/60 bg-sap-bg/50 px-2.5 py-1.5 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="px-1 py-0 bg-entity-crypto/20 text-entity-crypto text-[8px] font-bold rounded">{w.blockchain_type || 'BTC'}</span>
                    <span className="text-sap-text truncate text-[10px]">{w.wallet_address?.slice(0, 16)}...</span>
                  </div>
                  <div className="flex justify-between mt-1 text-[10px]">
                    <span className="text-sap-dim">Vol: <span className="text-entity-crypto">{w.total_volume?.fiat?.amount || '?'} {w.total_volume?.fiat?.currency_type || ''}</span></span>
                    <span className="text-sap-dim">Tx: {w.transactions_count?.total || '?'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Third row: Telegram groups + Marketplaces + India drug vendors */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Telegram groups with most phone sharing */}
        {telegramGroups.length > 0 && (
          <div className="tactical-surface rounded-lg border border-entity-telegram/20 p-3">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-entity-telegram mb-2">Telegram — phone distribution groups</h3>
            <div className="space-y-1.5">
              {telegramGroups.map((g, i) => (
                <div key={i} className="flex items-center justify-between text-xs font-mono rounded border border-sap-border/40 bg-sap-bg/50 px-2.5 py-1.5">
                  <span className="text-entity-telegram">{g._id}</span>
                  <div className="text-right text-[10px]">
                    <span className="text-sap-text">{g.total_phones?.toLocaleString()}</span>
                    <span className="text-sap-dim ml-1">mentions</span>
                    <span className="text-sap-muted ml-2">{g.unique_phone_count} phones</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dark web marketplaces */}
        {drugStats.marketplaces?.length > 0 && (
          <div className="tactical-surface rounded-lg border border-sap-border p-3">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-entity-darkweb mb-2">Dark web marketplaces</h3>
            <div className="space-y-1">
              {drugStats.marketplaces.slice(0, 10).map(m => {
                const pct = Math.round((m.count / (drugStats.marketplaces[0]?.count || 1)) * 100);
                return (
                  <div key={m.name} className="flex items-center gap-2 text-[11px] font-mono">
                    <span className="w-24 truncate text-sap-dim">{m.name}</span>
                    <div className="flex-1 h-1 bg-sap-panel rounded-full overflow-hidden">
                      <div className="h-full bg-entity-darkweb/50 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-10 text-right text-sap-muted text-[10px]">{m.count.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* India drug vendors */}
        {indiaDrugs.length > 0 && (
          <div className="tactical-surface rounded-lg border border-entity-drug/20 p-3">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-entity-drug mb-2">India-origin dark web vendors</h3>
            <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
              {indiaDrugs.map((d, i) => (
                <div key={i} className="rounded border border-sap-border/60 bg-sap-bg/50 px-2.5 py-1.5 text-xs font-mono">
                  <p className="text-sap-text truncate text-[11px]">{d.listing_title}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-sap-dim">
                    <span className="text-entity-drug">{d.vendor_name}</span>
                    <span>{d.marketplace}</span>
                    <span>{d.shipping_from} → {d.shipping_to}</span>
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
