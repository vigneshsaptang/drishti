import { useState } from 'react';
import { getCryptoTrace } from '../lib/api';
import { EvidenceImage } from '../components/Lightbox';

export default function FinancialTab({ data }) {
  if (!data) return null;
  const ti = data.threat_intel || {};
  const [walletQuery, setWalletQuery] = useState('');
  const [walletData, setWalletData] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);

  const handleWalletSearch = async (e) => {
    e?.preventDefault();
    if (!walletQuery.trim()) return;
    setWalletLoading(true);
    try { setWalletData(await getCryptoTrace(walletQuery.trim())); }
    catch { setWalletData(null); }
    setWalletLoading(false);
  };
  const upis = ti.upi_ids || [];
  const crime = ti.crimedata_matches || [];
  const wc = ti.worldcheck_matches || [];
  const hasContent = upis.length || crime.length || wc.length || true; // Always show crypto search

  return (
    <div className="space-y-6 animate-fade-in">
      {/* UPI */}
      {upis.length > 0 && (
        <div>
          <h3 className="text-xs font-mono tracking-[3px] uppercase text-entity-upi mb-3">UPI Payment Trail</h3>
          {upis.map((u, i) => <UpiCard key={i} data={u} />)}
        </div>
      )}

      {/* Watchlist */}
      {(crime.length > 0 || wc.length > 0) && (
        <div>
          <h3 className="text-xs font-mono tracking-[3px] uppercase text-entity-watchlist mb-3">Watchlist Screening</h3>
          {crime.map((c, i) => <CrimeCard key={`c${i}`} data={c} />)}
          {wc.map((w, i) => <WatchlistCard key={`w${i}`} data={w} />)}
        </div>
      )}

      {/* Crypto Wallet Trace */}
      <div>
        <h3 className="text-xs font-mono tracking-[3px] uppercase text-entity-crypto mb-3">Crypto Wallet Trace</h3>
        <form onSubmit={handleWalletSearch} className="flex gap-3 items-center mb-4">
          <input type="text" value={walletQuery} onChange={e => setWalletQuery(e.target.value)}
            placeholder="Enter BTC/ETH wallet address..."
            className="flex-1 bg-sap-panel border border-sap-border rounded px-4 py-2 text-sm font-mono text-sap-text outline-none focus:border-entity-crypto placeholder:text-sap-muted" />
          <button type="submit" disabled={walletLoading}
            className="bg-entity-crypto/20 hover:bg-entity-crypto/30 text-entity-crypto border border-entity-crypto/30 px-4 py-2 rounded text-sm font-mono font-semibold transition-colors disabled:opacity-40">
            {walletLoading ? 'TRACING...' : 'TRACE WALLET'}
          </button>
        </form>

        {walletData?.wallet && (
          <div className="bg-sap-surface border border-entity-crypto/20 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-0.5 bg-entity-crypto/20 text-entity-crypto text-[10px] font-mono font-bold rounded uppercase">
                {walletData.wallet.blockchain_type || 'BTC'}
              </span>
              <span className="font-mono text-sm truncate">{walletData.wallet.wallet_address}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
              <div><span className="text-sap-dim">Balance:</span> <span className="text-sap-text">{walletData.wallet.balance?.crypto?.amount} {walletData.wallet.balance?.crypto?.currency_type}</span></div>
              <div><span className="text-sap-dim">Received:</span> <span className="text-entity-crypto">{walletData.wallet.total_received?.fiat?.amount} {walletData.wallet.total_received?.fiat?.currency_type}</span></div>
              <div><span className="text-sap-dim">Sent:</span> <span className="text-entity-drug">{walletData.wallet.total_sent?.fiat?.amount} {walletData.wallet.total_sent?.fiat?.currency_type}</span></div>
              <div><span className="text-sap-dim">Transactions:</span> <span className="text-sap-text">{walletData.wallet.transactions_count?.total}</span></div>
            </div>
            {walletData.wallet.wallet_explorer_info?.wallet_link && (
              <a href={walletData.wallet.wallet_explorer_info.wallet_link} target="_blank" rel="noopener" className="text-xs text-sap-accent hover:underline mt-2 inline-block">
                View on WalletExplorer
              </a>
            )}
            <EvidenceImage src={walletData.wallet.screenshot} alt="Wallet screenshot" className="h-24 w-auto mt-3" />
          </div>
        )}

        {walletData?.transactions_darkweb?.length > 0 && (
          <div className="bg-sap-surface border border-sap-border rounded-lg p-4">
            <h4 className="text-xs font-mono tracking-widest text-sap-dim mb-3 uppercase">Transactions ({walletData.transactions_darkweb.length})</h4>
            <div className="max-h-[300px] overflow-y-auto space-y-1">
              {walletData.transactions_darkweb.map((tx, i) => (
                <div key={i} className="flex items-center gap-3 text-[11px] font-mono py-1 border-b border-sap-border/20">
                  <span className="text-sap-dim w-20">{String(tx.date || '').slice(0, 10)}</span>
                  <span className="text-entity-crypto truncate flex-1">{tx.from_address || '?'}</span>
                  <span className="text-sap-dim">→</span>
                  <span className="text-entity-email truncate flex-1">{tx.to_address || '?'}</span>
                  <span className="text-sap-text w-24 text-right">{tx.amount_crypto || '?'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function UpiCard({ data: u }) {
  const pa = u.upi_details?.pa || '?';
  const isBetting = u.clasification === 'BETTING_SITE';
  return (
    <div className="bg-sap-surface border border-entity-upi/20 rounded-lg p-4 mb-3">
      <div className="flex items-center gap-3 mb-2">
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${isBetting ? 'bg-entity-drug/20 text-entity-drug' : 'bg-entity-upi/20 text-entity-upi'}`}>
          {u.clasification || 'UNKNOWN'}
        </span>
        <span className="font-mono text-sm">{pa}</span>
      </div>
      <div className="text-xs font-mono space-y-1 text-sap-dim">
        {u.site && <p>Site: <a href={u.site} target="_blank" rel="noopener" className="text-sap-accent hover:underline">{u.site}</a></p>}
        {u.payment_gateway && <p>Gateway: <span className="text-entity-crypto">{u.payment_gateway}</span></p>}
      </div>
      <div className="flex gap-2 mt-3">
        <EvidenceImage src={u.home_page_screenshot} alt="Site screenshot" className="h-20 w-auto" />
        <EvidenceImage src={u.upi_screen_shot} alt="UPI screenshot" className="h-20 w-auto" />
      </div>
    </div>
  );
}

function CrimeCard({ data: c }) {
  const src = c._source || {};
  return (
    <div className="bg-sap-surface border border-entity-watchlist/30 rounded-lg p-4 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="bg-entity-watchlist text-white px-2 py-0.5 rounded text-[10px] font-bold">CRIME DATA</span>
        <span className="font-mono text-sm">{src.name || ''}</span>
      </div>
      <div className="text-xs font-mono text-sap-dim space-y-1">
        <p>Category: {src.category || ''}</p>
        <p>Country: {src.country_name || ''}</p>
        <p>Entity Type: {src.entity_type || ''}</p>
      </div>
    </div>
  );
}

function WatchlistCard({ data: w }) {
  return (
    <div className="bg-sap-surface border border-entity-watchlist/30 rounded-lg p-4 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="bg-entity-watchlist text-white px-2 py-0.5 rounded text-[10px] font-bold">WORLD CHECK</span>
        <span className="font-mono text-sm">{w.primary_name || ''}</span>
      </div>
      <div className="text-xs font-mono text-sap-dim space-y-1">
        <p>Category: {w.EXTRA_DATA?.category || ''}</p>
        <p>Country: {w.country || ''}</p>
        {w.EXTRA_DATA?.further_info && <p className="mt-2 text-sap-text/80">{w.EXTRA_DATA.further_info}</p>}
      </div>
    </div>
  );
}
