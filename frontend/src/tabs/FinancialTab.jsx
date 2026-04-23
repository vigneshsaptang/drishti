import { useState, useEffect, useRef } from 'react';
import { listFraudUpis, listBankAccounts, getCryptoTrace, getDashboardIntel } from '../lib/api';
import { EvidenceImage } from '../components/Lightbox';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// IFSC → Bank + Branch + State + City resolution
const IFSC_BANKS = {
  SBIN: 'State Bank of India', HDFC: 'HDFC Bank', ICIC: 'ICICI Bank', PUNB: 'Punjab National Bank',
  BARB: 'Bank of Baroda', CNRB: 'Canara Bank', UBIN: 'Union Bank', BKID: 'Bank of India',
  IOBA: 'Indian Overseas Bank', ALLA: 'Allahabad Bank', UCBA: 'UCO Bank', KVBL: 'Karur Vysya Bank',
  KKBK: 'Kotak Mahindra', YESB: 'Yes Bank', IDIB: 'Indian Bank', UTIB: 'Axis Bank',
  JAKA: 'J&K Bank', CSBK: 'City Union Bank', FDRL: 'Federal Bank', SIBL: 'South Indian Bank',
  PYTM: 'Paytm Payments Bank', AIRP: 'Airtel Payments Bank', RATN: 'RBL Bank',
};

function resolveIFSC(ifsc) {
  if (!ifsc || ifsc.length < 4) return null;
  const prefix = ifsc.slice(0, 4).toUpperCase();
  return IFSC_BANKS[prefix] || prefix;
}

// Known Indian city coordinates for map pins
const CITY_COORDS = {
  'MUMBAI': [19.076, 72.877], 'DELHI': [28.704, 77.102], 'BANGALORE': [12.971, 77.594],
  'CHENNAI': [13.082, 80.270], 'KOLKATA': [22.572, 88.363], 'HYDERABAD': [17.385, 78.486],
  'PUNE': [18.520, 73.856], 'AHMEDABAD': [23.022, 72.571], 'JAIPUR': [26.912, 75.787],
  'LUCKNOW': [26.846, 80.946], 'CHANDIGARH': [30.733, 76.779], 'LUDHIANA': [30.901, 75.857],
  'AMRITSAR': [31.634, 74.872], 'JALANDHAR': [31.326, 75.576], 'PATIALA': [30.340, 76.386],
  'SRINAGAR': [34.083, 74.797], 'JAMMU': [32.726, 74.857], 'GURGAON': [28.459, 77.026],
  'NOIDA': [28.535, 77.391], 'VARANASI': [25.317, 82.987], 'INDORE': [22.719, 75.857],
  'BHOPAL': [23.259, 77.412], 'NAGPUR': [21.145, 79.088], 'PATNA': [25.611, 85.144],
  'RANCHI': [23.344, 85.309], 'KOCHI': [9.931, 76.267], 'GUWAHATI': [26.144, 91.736],
  'MOHALI': [30.704, 76.717], 'BATHINDA': [30.210, 74.945], 'FEROZEPUR': [30.926, 74.613],
  'MOGA': [30.816, 75.174], 'GURDASPUR': [32.041, 75.403], 'PATHANKOT': [32.275, 75.638],
  'SANGRUR': [30.246, 75.841], 'BARNALA': [30.381, 75.547],
};

function getHeatColor(count, maxCount) {
  // low = yellow (#fbbf24), medium = orange (#f97316), high = red (#dc2626)
  const ratio = maxCount <= 1 ? 1 : Math.min(count / maxCount, 1);
  if (ratio < 0.4) return '#fbbf24';
  if (ratio < 0.7) return '#f97316';
  return '#dc2626';
}

function BankMap({ accounts }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const layerGroupRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current, { center: [22, 80], zoom: 5, attributionControl: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 18 }).addTo(map);
    layerGroupRef.current = L.layerGroup().addTo(map);
    mapInstance.current = map;
    return () => { map.remove(); mapInstance.current = null; layerGroupRef.current = null; };
  }, []);

  useEffect(() => {
    if (!mapInstance.current || !layerGroupRef.current || !accounts?.length) return;
    layerGroupRef.current.clearLayers();

    // Aggregate accounts by city — try multiple fields
    const pins = {};
    accounts.forEach(a => {
      // Try to find city from any available field
      const rawCity = a.city || a.CITY || a.branch_city || a.location || '';
      let city = rawCity.toUpperCase().trim();

      // If no city, try to extract from address
      if (!city && (a.address || a.ADDRESS_1 || a.site_url)) {
        const addr = (a.address || a.ADDRESS_1 || a.site_url || '').toUpperCase();
        for (const knownCity of Object.keys(CITY_COORDS)) {
          if (addr.includes(knownCity)) { city = knownCity; break; }
        }
      }

      // If still no city, try IFSC prefix for state-level guess
      if (!city) {
        const ifsc = a.ifsc_code || a.IFSC || '';
        // Map some known IFSC prefixes to cities
        if (ifsc.startsWith('SBIN')) city = 'MUMBAI';
        else if (ifsc.startsWith('HDFC')) city = 'MUMBAI';
        else if (ifsc.startsWith('JAKA') || ifsc.startsWith('JKB')) city = 'SRINAGAR';
        else if (ifsc.startsWith('PUNB')) city = 'DELHI';
        else if (ifsc.startsWith('CNRB')) city = 'BANGALORE';
      }

      const coord = CITY_COORDS[city];
      if (coord) {
        if (!pins[city]) pins[city] = { coord, count: 0, accounts: [] };
        pins[city].count++;
        pins[city].accounts.push(a);
      }
    });

    const maxCount = Math.max(...Object.values(pins).map(p => p.count), 1);

    Object.entries(pins).forEach(([city, info]) => {
      const color = getHeatColor(info.count, maxCount);
      const outerRadius = Math.min(30 + (info.count / maxCount) * 20, 50);

      // Outer glow ring — large, very transparent
      L.circleMarker(info.coord, {
        radius: outerRadius,
        fillColor: color,
        color: 'transparent',
        weight: 0,
        fillOpacity: 0.15,
      }).addTo(layerGroupRef.current);

      // Middle ring — medium size, moderate transparency
      L.circleMarker(info.coord, {
        radius: outerRadius * 0.65,
        fillColor: color,
        color: 'transparent',
        weight: 0,
        fillOpacity: 0.3,
      }).addTo(layerGroupRef.current);

      // Inner ring — builds the gradient center
      L.circleMarker(info.coord, {
        radius: outerRadius * 0.4,
        fillColor: color,
        color: 'transparent',
        weight: 0,
        fillOpacity: 0.5,
      }).addTo(layerGroupRef.current);

      // Build popup with bank names from IFSC
      const bankLines = info.accounts.slice(0, 8).map(a => {
        const ifsc = a.ifsc_code || a.IFSC || '';
        const bankName = resolveIFSC(ifsc);
        const holder = a.account_holder || a.ACCOUNT_HOLDER || 'Unknown';
        return `<span style="font-size:11px;color:#555">${holder}</span>` +
          (bankName ? ` <span style="font-size:10px;color:#888">(${bankName})</span>` : '');
      }).join('<br>');
      const extra = info.count > 8 ? `<br><span style="font-size:10px;color:#999">+${info.count - 8} more</span>` : '';

      // Center dot with count label
      L.circleMarker(info.coord, {
        radius: 10,
        fillColor: color,
        color: '#fff',
        weight: 1.5,
        fillOpacity: 0.9,
      }).addTo(layerGroupRef.current)
        .bindPopup(
          `<div style="min-width:160px">` +
          `<b style="font-size:13px">${city}</b>` +
          `<span style="margin-left:6px;font-size:11px;color:#dc2626;font-weight:600">${info.count} account(s)</span>` +
          `<hr style="margin:4px 0;border:0;border-top:1px solid #e5e7eb">` +
          `${bankLines}${extra}</div>`
        );

      // Count label using a DivIcon centered on the dot
      const label = L.marker(info.coord, {
        icon: L.divIcon({
          className: '',
          html: `<div style="width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;pointer-events:none">${info.count}</div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        }),
        interactive: false,
      });
      label.addTo(layerGroupRef.current);
    });
  }, [accounts]);

  return <div ref={mapRef} className="w-full h-full rounded-lg" style={{ minHeight: 300 }} />;
}

const PAGE_SIZE = 25;

const SUB_TABS = [
  { id: 'upi',       label: 'Fraud UPI' },
  { id: 'banks',     label: 'Bank Accounts' },
  { id: 'crypto',    label: 'Crypto Wallets' },
];

export default function FinancialTab({ data }) {
  const [upis, setUpis] = useState(null);
  const [banks, setBanks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [upiFilter, setUpiFilter] = useState('');
  const [walletQuery, setWalletQuery] = useState('');
  const [walletData, setWalletData] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [topWallets, setTopWallets] = useState([]);
  const [subTab, setSubTab] = useState('upi');
  const [upiPage, setUpiPage] = useState(1);
  const [bankPage, setBankPage] = useState(1);

  useEffect(() => {
    Promise.all([
      listFraudUpis(100).catch(() => []),
      listBankAccounts(100).catch(() => []),
    ]).then(([u, b]) => {
      setUpis(u);
      setBanks(b);
      setLoading(false);
    });
    getDashboardIntel().then(d => setTopWallets(d?.top_wallets || [])).catch(() => {});
  }, []);

  const handleWalletSearch = async (e, addressOverride) => {
    e?.preventDefault();
    const address = addressOverride || walletQuery.trim();
    if (!address) return;
    setWalletLoading(true);
    try { setWalletData(await getCryptoTrace(address)); }
    catch { setWalletData(null); }
    setWalletLoading(false);
  };

  const filteredUpis = (upis || []).filter(u => {
    if (!upiFilter) return true;
    const s = JSON.stringify(u).toLowerCase();
    return s.includes(upiFilter.toLowerCase());
  });

  // Reset page when filter changes
  const upiTotalPages = Math.max(1, Math.ceil(filteredUpis.length / PAGE_SIZE));
  const bankTotalPages = Math.max(1, Math.ceil((banks || []).length / PAGE_SIZE));
  const pagedUpis = filteredUpis.slice((upiPage - 1) * PAGE_SIZE, upiPage * PAGE_SIZE);
  const pagedBanks = (banks || []).slice((bankPage - 1) * PAGE_SIZE, bankPage * PAGE_SIZE);

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-6">
        <div className="w-2.5 h-2.5 rounded-full bg-sap-accent animate-pulse" />
        <p className="text-sm text-sap-accent font-mono">Loading financial intelligence...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Sub-tab navigation ── */}
      <div className="flex items-center gap-1 border-b border-sap-border">
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSubTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              subTab === tab.id
                ? 'text-sap-accent'
                : 'text-sap-dim hover:text-sap-text'
            }`}
          >
            {tab.label}
            {subTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-sap-accent rounded-t" />
            )}
          </button>
        ))}
      </div>

      {/* ── Fraud UPI Table ── */}
      {subTab === 'upi' && (
        <div className="bg-sap-surface rounded-lg border border-entity-drug/20 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h3 className="text-base font-bold text-entity-drug">Fraud UPI Identifiers</h3>
              <p className="text-sm text-sap-dim mt-0.5">{(upis || []).length} tracked payment accounts linked to betting, gambling, and fraud sites</p>
            </div>
            <input
              type="text"
              value={upiFilter}
              onChange={e => { setUpiFilter(e.target.value); setUpiPage(1); }}
              placeholder="Filter UPI, site, gateway..."
              className="bg-sap-panel border border-sap-border rounded-lg px-3 py-2 text-sm font-mono text-sap-text outline-none focus:border-sap-accent w-64 placeholder:text-sap-muted"
            />
          </div>
          {upis && upis.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-sap-border text-left">
                      <th className="px-3 py-2.5 text-xs font-semibold text-sap-dim uppercase tracking-wider">#</th>
                      <th className="px-3 py-2.5 text-xs font-semibold text-sap-dim uppercase tracking-wider">UPI ID</th>
                      <th className="px-3 py-2.5 text-xs font-semibold text-sap-dim uppercase tracking-wider">Classification</th>
                      <th className="px-3 py-2.5 text-xs font-semibold text-sap-dim uppercase tracking-wider">Linked Site</th>
                      <th className="px-3 py-2.5 text-xs font-semibold text-sap-dim uppercase tracking-wider">Payment Gateway</th>
                      <th className="px-3 py-2.5 text-xs font-semibold text-sap-dim uppercase tracking-wider">Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedUpis.map((u, i) => {
                      const pa = u.upi_details?.pa || '—';
                      const phoneMatch = pa.match(/(\d{10})/);
                      const rowNum = (upiPage - 1) * PAGE_SIZE + i + 1;
                      return (
                        <tr key={i} className="border-b border-sap-border/50 hover:bg-sap-panel/50">
                          <td className="px-3 py-3 text-xs text-sap-muted font-mono">{rowNum}</td>
                          <td className="px-3 py-3">
                            <span className="font-mono text-sm font-medium text-sap-text">{pa}</span>
                            {phoneMatch && (
                              <span className="ml-2 text-xs text-entity-phone font-mono bg-entity-phone/10 px-1.5 py-0.5 rounded">
                                Phone: {phoneMatch[1]}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <span className={`px-2 py-1 rounded-md text-xs font-semibold border ${
                              u.clasification === 'BETTING_SITE' ? 'bg-entity-drug/10 text-entity-drug border-entity-drug/20' :
                              u.clasification === 'CRYPTO_EXCHANGE' ? 'bg-entity-crypto/10 text-entity-crypto border-entity-crypto/20' :
                              'bg-entity-breach/10 text-entity-breach border-entity-breach/20'
                            }`}>
                              {u.clasification || 'UNKNOWN'}
                            </span>
                          </td>
                          <td className="px-3 py-3 max-w-[200px]">
                            {u.site ? (
                              <a href={u.site} target="_blank" rel="noopener" className="text-sap-accent hover:underline text-sm truncate block">{u.site}</a>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-3 font-mono text-xs text-entity-crypto">{u.payment_gateway || '—'}</td>
                          <td className="px-3 py-3">
                            <div className="flex gap-1.5">
                              <EvidenceImage src={u.home_page_screenshot} alt="Site" className="h-8 w-auto rounded" />
                              <EvidenceImage src={u.upi_screen_shot} alt="UPI" className="h-8 w-auto rounded" />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {upiTotalPages > 1 && (
                <div className="flex items-center justify-end gap-3 mt-4 pt-3 border-t border-sap-border/50">
                  <span className="text-xs font-mono text-sap-muted">Page {upiPage} of {upiTotalPages}</span>
                  <button
                    type="button"
                    onClick={() => setUpiPage(p => Math.max(1, p - 1))}
                    disabled={upiPage <= 1}
                    className="px-3 py-1.5 text-xs font-mono rounded-lg border border-sap-border text-sap-dim hover:text-sap-text hover:bg-sap-panel transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >Previous</button>
                  <button
                    type="button"
                    onClick={() => setUpiPage(p => Math.min(upiTotalPages, p + 1))}
                    disabled={upiPage >= upiTotalPages}
                    className="px-3 py-1.5 text-xs font-mono rounded-lg border border-sap-border text-sap-dim hover:text-sap-text hover:bg-sap-panel transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >Next</button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-sap-muted font-mono py-4">No fraud UPI records found.</p>
          )}
        </div>
      )}

      {/* ── Bank Accounts + India Map ── */}
      {subTab === 'banks' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-sap-surface rounded-lg border border-entity-breach/20 p-5 shadow-sm">
            <h3 className="text-base font-bold text-entity-breach mb-1">Flagged Bank Accounts</h3>
            <p className="text-sm text-sap-dim mb-4">{(banks || []).length} accounts linked to fraud / betting sites with IFSC resolution</p>
            {banks && banks.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-sap-border text-left">
                        <th className="px-3 py-2 text-xs font-semibold text-sap-dim uppercase tracking-wider">Account Holder</th>
                        <th className="px-3 py-2 text-xs font-semibold text-sap-dim uppercase tracking-wider">Account Number</th>
                        <th className="px-3 py-2 text-xs font-semibold text-sap-dim uppercase tracking-wider">Bank (IFSC)</th>
                        <th className="px-3 py-2 text-xs font-semibold text-sap-dim uppercase tracking-wider">Source</th>
                        <th className="px-3 py-2 text-xs font-semibold text-sap-dim uppercase tracking-wider">Evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedBanks.map((b, i) => {
                        const ifsc = b.ifsc_code || b.IFSC || '';
                        const bankName = resolveIFSC(ifsc);
                        return (
                          <tr key={i} className="border-b border-sap-border/50 hover:bg-sap-panel/50">
                            <td className="px-3 py-2.5 font-medium text-sap-text">{b.account_holder || b.ACCOUNT_HOLDER || '—'}</td>
                            <td className="px-3 py-2.5 font-mono text-xs text-sap-text">{b.account_number || b.ACCOUNT_NUMBER || '—'}</td>
                            <td className="px-3 py-2.5">
                              <div>
                                <span className="text-sm font-medium text-sap-text">{bankName || '—'}</span>
                                {ifsc && <span className="ml-2 text-xs font-mono text-sap-muted bg-sap-panel px-1.5 py-0.5 rounded">{ifsc}</span>}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-entity-drug/10 text-entity-drug">{b.source || b.SOURCE || 'FRAUD'}</span>
                            </td>
                            <td className="px-3 py-2.5">
                              <EvidenceImage src={b.account_number_screenshot} alt="Account" className="h-7 w-auto rounded" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {bankTotalPages > 1 && (
                  <div className="flex items-center justify-end gap-3 mt-4 pt-3 border-t border-sap-border/50">
                    <span className="text-xs font-mono text-sap-muted">Page {bankPage} of {bankTotalPages}</span>
                    <button
                      type="button"
                      onClick={() => setBankPage(p => Math.max(1, p - 1))}
                      disabled={bankPage <= 1}
                      className="px-3 py-1.5 text-xs font-mono rounded-lg border border-sap-border text-sap-dim hover:text-sap-text hover:bg-sap-panel transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >Previous</button>
                    <button
                      type="button"
                      onClick={() => setBankPage(p => Math.min(bankTotalPages, p + 1))}
                      disabled={bankPage >= bankTotalPages}
                      className="px-3 py-1.5 text-xs font-mono rounded-lg border border-sap-border text-sap-dim hover:text-sap-text hover:bg-sap-panel transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >Next</button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-sap-muted font-mono py-4">No flagged bank accounts found.</p>
            )}
          </div>

          {/* India map */}
          <div className="bg-sap-surface rounded-lg border border-sap-border p-5 shadow-sm">
            <h3 className="text-sm font-bold text-sap-text mb-3">Fraud Hotspot Map</h3>
            <div className="h-[320px] rounded-lg overflow-hidden border border-sap-border">
              <BankMap accounts={banks || []} />
            </div>
            <p className="text-xs text-sap-muted mt-2">Pins show cities with flagged bank accounts. Size = number of accounts.</p>
          </div>
        </div>
      )}

      {/* ── Crypto Wallet Trace ── */}
      {subTab === 'crypto' && (
        <div className="bg-sap-surface rounded-lg border border-entity-crypto/20 p-5 shadow-sm">
          <h3 className="text-base font-bold text-entity-crypto mb-1">Crypto Wallet Trace</h3>
          <p className="text-sm text-sap-dim mb-4">Enter a BTC or ETH wallet address to trace transaction history</p>
          <form onSubmit={handleWalletSearch} className="flex gap-3 items-center mb-4">
            <input type="text" value={walletQuery} onChange={e => setWalletQuery(e.target.value)}
              placeholder="Enter BTC/ETH wallet address..."
              className="flex-1 bg-sap-panel border border-sap-border rounded-lg px-4 py-3 text-base font-mono text-sap-text outline-none focus:border-entity-crypto placeholder:text-sap-muted" />
            <button type="submit" disabled={walletLoading}
              className="bg-entity-crypto/10 hover:bg-entity-crypto/20 text-entity-crypto border border-entity-crypto/30 px-5 py-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40">
              {walletLoading ? 'Tracing...' : 'Trace Wallet'}
            </button>
          </form>

          {topWallets.length > 0 && (
            <div className="rounded-lg border border-sap-border bg-sap-panel p-4 mb-4">
              <h4 className="text-sm font-semibold text-sap-dim mb-3">Notable Wallets</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-sap-border text-left">
                      <th className="px-3 py-2 text-xs font-semibold text-sap-dim uppercase tracking-wider">Blockchain</th>
                      <th className="px-3 py-2 text-xs font-semibold text-sap-dim uppercase tracking-wider">Address</th>
                      <th className="px-3 py-2 text-xs font-semibold text-sap-dim uppercase tracking-wider">Total Volume</th>
                      <th className="px-3 py-2 text-xs font-semibold text-sap-dim uppercase tracking-wider">Transactions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topWallets.map((w, i) => {
                      const addr = w.wallet_address || w.address || '';
                      const truncated = addr.length > 16 ? addr.slice(0, 8) + '...' + addr.slice(-8) : addr;
                      return (
                        <tr
                          key={i}
                          onClick={() => { setWalletQuery(addr); handleWalletSearch(null, addr); }}
                          className="border-b border-sap-border/50 hover:bg-sap-surface/50 cursor-pointer transition-colors"
                        >
                          <td className="px-3 py-2.5">
                            <span className="px-2 py-0.5 bg-entity-crypto/15 text-entity-crypto text-xs font-bold rounded-md">
                              {w.blockchain_type || w.blockchain || 'BTC'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs text-sap-text" title={addr}>{truncated}</td>
                          <td className="px-3 py-2.5 font-mono text-sm font-medium text-entity-crypto">
                            {w.total_volume?.fiat?.amount
                              ? `${w.total_volume.fiat.amount} ${w.total_volume.fiat.currency_type || ''}`
                              : typeof w.total_volume === 'string' ? w.total_volume : '---'}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-sm text-sap-text">
                            {typeof w.transactions_count === 'object' ? w.transactions_count?.total || '---' : w.transactions_count ?? '---'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {walletData?.wallet && (
            <div className="rounded-lg border border-entity-crypto/20 bg-sap-panel p-5 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2.5 py-1 bg-entity-crypto/15 text-entity-crypto text-xs font-bold rounded-md">
                  {walletData.wallet.blockchain_type || 'BTC'}
                </span>
                <span className="font-mono text-sm truncate text-sap-text">{walletData.wallet.wallet_address}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-sap-muted mb-0.5">Balance</p>
                  <p className="font-mono font-bold text-sap-text">{walletData.wallet.balance?.crypto?.amount} {walletData.wallet.balance?.crypto?.currency_type}</p>
                </div>
                <div>
                  <p className="text-xs text-sap-muted mb-0.5">Total Received</p>
                  <p className="font-mono font-bold text-entity-crypto">{walletData.wallet.total_received?.fiat?.amount} {walletData.wallet.total_received?.fiat?.currency_type}</p>
                </div>
                <div>
                  <p className="text-xs text-sap-muted mb-0.5">Total Sent</p>
                  <p className="font-mono font-bold text-entity-drug">{walletData.wallet.total_sent?.fiat?.amount} {walletData.wallet.total_sent?.fiat?.currency_type}</p>
                </div>
                <div>
                  <p className="text-xs text-sap-muted mb-0.5">Transactions</p>
                  <p className="font-mono font-bold text-sap-text">{walletData.wallet.transactions_count?.total}</p>
                </div>
              </div>
              {walletData.wallet.wallet_explorer_info?.wallet_link && (
                <a href={walletData.wallet.wallet_explorer_info.wallet_link} target="_blank" rel="noopener" className="text-sm text-sap-accent hover:underline mt-3 inline-block">
                  View on WalletExplorer →
                </a>
              )}
              <EvidenceImage src={walletData.wallet.screenshot} alt="Wallet" className="h-28 w-auto mt-3 rounded-lg" />
            </div>
          )}

          {walletData?.transactions_darkweb?.length > 0 && (
            <div className="rounded-lg border border-sap-border bg-sap-panel p-4">
              <h4 className="text-sm font-semibold text-sap-dim mb-3">Transactions ({walletData.transactions_darkweb.length})</h4>
              <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-sap-border text-left">
                      <th className="px-2 py-2 text-sap-muted">Date</th>
                      <th className="px-2 py-2 text-sap-muted">From</th>
                      <th className="px-2 py-2 text-sap-muted">To</th>
                      <th className="px-2 py-2 text-sap-muted text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {walletData.transactions_darkweb.map((tx, i) => (
                      <tr key={i} className="border-b border-sap-border/30 hover:bg-sap-surface/50">
                        <td className="px-2 py-1.5 text-sap-dim">{String(tx.date || '').slice(0, 10)}</td>
                        <td className="px-2 py-1.5 text-entity-crypto truncate max-w-[150px]">{tx.from_address || '?'}</td>
                        <td className="px-2 py-1.5 text-entity-email truncate max-w-[150px]">{tx.to_address || '?'}</td>
                        <td className="px-2 py-1.5 text-right text-sap-text">{tx.amount_crypto || '?'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
