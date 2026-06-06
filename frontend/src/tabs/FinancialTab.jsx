import { useState, useEffect, useRef, useCallback } from 'react';
import { listFraudUpis, listBankAccounts, getCryptoTrace } from '../lib/api';
import { EvidenceImage } from '../components/Lightbox';
import Shimmer from '../components/Shimmer';
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

export default function FinancialTab({ financialResults = [], financialMeta = null }) {
  const [upis, setUpis] = useState(null);
  const [banks, setBanks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [upiFilter, setUpiFilter] = useState('');
  const [walletQuery, setWalletQuery] = useState('');
  const [walletData, setWalletData] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [subTab, setSubTab] = useState('upi');
  const [upiPage, setUpiPage] = useState(1);
  const [bankPage, setBankPage] = useState(1);
  const [error, setError] = useState(null);

  const loadInitialData = useCallback(() => {
    setError(null);
    Promise.all([
      listFraudUpis(100).catch(err => {
        setError(err.message || 'Failed to load UPI data');
        return [];
      }),
      listBankAccounts(100).catch(err => {
        setError(err.message || 'Failed to load bank account data');
        return [];
      }),
    ]).then(([u, b]) => {
      setUpis(u);
      setBanks(b);
      setLoading(false);
    });
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadInitialData(); }, [loadInitialData]);

  const handleWalletSearch = async (e, addressOverride) => {
    e?.preventDefault();
    const address = addressOverride || walletQuery.trim();
    if (!address) return;
    setWalletLoading(true);
    setError(null);
    try { setWalletData(await getCryptoTrace(address)); }
    catch (err) { setError(err.message || 'Failed to load crypto data'); }
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
      <div className="space-y-4 p-4 animate-fade-in">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <div key={i} className="bg-sap-surface border border-sap-border rounded-lg p-4 space-y-3">
              <Shimmer className="h-3 w-28" />
              <div className="space-y-2">
                {[1, 2, 3].map(j => <Shimmer key={j} className="h-10 w-full" />)}
              </div>
            </div>
          ))}
        </div>
        <div className="bg-sap-surface border border-sap-border rounded-lg p-4 space-y-3">
          <Shimmer className="h-3 w-32" />
          <Shimmer className="h-10 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {error && (
        <div className="rounded-lg border border-sap-danger/30 bg-sap-danger-soft p-4">
          <p className="text-sap-danger text-13">{error}</p>
          <button
            type="button"
            onClick={() => { setError(null); loadInitialData(); }}
            className="mt-2 text-12 text-sap-accent hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Sub-tab navigation ── */}
      <div className="flex items-stretch h-8 border-b border-sap-border overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSubTab(tab.id)}
            className={`px-3 text-12 font-medium whitespace-nowrap outline-none transition-colors -mb-px border-b-2 ${
              subTab === tab.id
                ? 'border-sap-accent text-sap-accent'
                : 'border-transparent text-sap-dim hover:text-sap-text cursor-pointer'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Search-linked UPI hits ── */}
      {subTab === 'upi' && (() => {
        const upiHits = financialResults.filter(r => r.found);
        if (upiHits.length === 0 && !financialMeta && financialResults.length === 0) return null;
        return (
          <div className="rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-sap-border-light flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h3 className="text-12 font-semibold tracking-tight text-sap-text">Subject-linked fraud UPIs</h3>
                {financialMeta && (
                  <span className="text-11 text-sap-muted">
                    {financialMeta.total_upi_hits} hit{financialMeta.total_upi_hits !== 1 ? 's' : ''} from {financialMeta.total_phones_screened} phone{financialMeta.total_phones_screened !== 1 ? 's' : ''} in {financialMeta.total_time_ms}ms
                  </span>
                )}
                {!financialMeta && financialResults.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-sap-danger-filled animate-pulse" />
                    <span className="text-11 text-sap-danger">Screening phones against fraud UPIs…</span>
                  </div>
                )}
              </div>
            </div>
            {upiHits.length > 0 ? (
              <div className="px-4 py-3 space-y-3">
                {upiHits.map((hit, hi) => (
                  <div key={hi}>
                    <p className="text-11 text-sap-muted mb-2">Phone: <span className="text-sap-text font-semibold font-mono">{hit.phone}</span></p>
                    {hit.upi_records.map((u, ui) => {
                      const pa = u.upi_details?.pa || '—';
                      return (
                        <div key={ui} className="bg-sap-bg border border-sap-border-light rounded-lg px-4 py-3 mb-2 flex items-start gap-4">
                          <div className="min-w-0 flex-1">
                            <span className="font-mono text-13 font-semibold text-sap-text">{pa}</span>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-11 text-sap-dim">
                              {u.clasification && (
                                <span className="px-2 py-0.5 rounded-md font-medium border bg-sap-bg border-sap-border-light text-sap-text">{u.clasification}</span>
                              )}
                              {u.site && <a href={u.site} target="_blank" rel="noopener" className="text-sap-accent hover:underline truncate max-w-[250px]">{u.site}</a>}
                              {u.payment_gateway && <span className="text-sap-dim">{u.payment_gateway}</span>}
                            </div>
                          </div>
                          <div className="flex gap-1.5 flex-shrink-0">
                            <EvidenceImage src={u.home_page_screenshot} alt="Site" className="h-10 w-auto rounded" />
                            <EvidenceImage src={u.upi_screen_shot} alt="UPI" className="h-10 w-auto rounded" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : financialMeta ? (
              <p className="text-13 text-sap-muted px-4 py-3">No fraud UPI links found for discovered phone numbers.</p>
            ) : null}
          </div>
        );
      })()}

      {/* ── Fraud UPI Table ── */}
      {subTab === 'upi' && (
        <div className="rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-sap-border-light flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-12 font-semibold tracking-tight text-sap-text">Fraud UPI identifiers</h3>
              <p className="text-11 text-sap-muted mt-0.5">{(upis || []).length} tracked payment accounts linked to betting, gambling, and fraud sites</p>
            </div>
            <input
              type="text"
              value={upiFilter}
              onChange={e => { setUpiFilter(e.target.value); setUpiPage(1); }}
              placeholder="Filter UPI, site, gateway..."
              className="bg-sap-bg border border-sap-border-light rounded-lg px-3 py-2 text-13 text-sap-text outline-none focus:border-sap-accent w-64 placeholder:text-sap-muted"
            />
          </div>
          {upis && upis.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-13">
                  <thead>
                    <tr className="bg-sap-bg/60 border-b border-sap-border-light text-left">
                      <th className="px-3 py-2 text-11 font-medium text-sap-muted">#</th>
                      <th className="px-3 py-2 text-11 font-medium text-sap-muted">UPI ID</th>
                      <th className="px-3 py-2 text-11 font-medium text-sap-muted">Classification</th>
                      <th className="px-3 py-2 text-11 font-medium text-sap-muted">Linked site</th>
                      <th className="px-3 py-2 text-11 font-medium text-sap-muted">Payment gateway</th>
                      <th className="px-3 py-2 text-11 font-medium text-sap-muted">Evidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sap-border-light">
                    {pagedUpis.map((u, i) => {
                      const pa = u.upi_details?.pa || '—';
                      const phoneMatch = pa.match(/(\d{10})/);
                      const rowNum = (upiPage - 1) * PAGE_SIZE + i + 1;
                      return (
                        <tr key={i} className="hover:bg-sap-bg/60">
                          <td className="px-3 py-3 text-11 text-sap-muted font-mono">{rowNum}</td>
                          <td className="px-3 py-3">
                            <span className="font-mono text-13 font-medium text-sap-text">{pa}</span>
                            {phoneMatch && (
                              <span className="ml-2 text-11 font-mono text-sap-text bg-sap-bg border border-sap-border-light px-1.5 py-0.5 rounded">
                                Phone: {phoneMatch[1]}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <span className="px-2 py-0.5 rounded-md text-11 font-medium border bg-sap-bg border-sap-border-light text-sap-text">
                              {u.clasification || 'UNKNOWN'}
                            </span>
                          </td>
                          <td className="px-3 py-3 max-w-[200px]">
                            {u.site ? (
                              <a href={u.site} target="_blank" rel="noopener" className="text-sap-accent hover:underline text-13 truncate block">{u.site}</a>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-3 text-12 text-sap-dim">{u.payment_gateway || '—'}</td>
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
                <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-sap-border-light">
                  <span className="text-11 text-sap-muted">Page {upiPage} of {upiTotalPages}</span>
                  <button
                    type="button"
                    onClick={() => setUpiPage(p => Math.max(1, p - 1))}
                    disabled={upiPage <= 1}
                    className="px-3 py-1.5 text-12 rounded-lg border border-sap-border-light text-sap-dim hover:text-sap-text hover:bg-sap-bg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >Previous</button>
                  <button
                    type="button"
                    onClick={() => setUpiPage(p => Math.min(upiTotalPages, p + 1))}
                    disabled={upiPage >= upiTotalPages}
                    className="px-3 py-1.5 text-12 rounded-lg border border-sap-border-light text-sap-dim hover:text-sap-text hover:bg-sap-bg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >Next</button>
                </div>
              )}
            </>
          ) : (
            <p className="text-13 text-sap-muted px-4 py-3">No fraud UPI records found.</p>
          )}
        </div>
      )}

      {/* ── Bank Accounts + India Map ── */}
      {subTab === 'banks' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-sap-border-light">
              <h3 className="text-12 font-semibold tracking-tight text-sap-text">Flagged bank accounts</h3>
              <p className="text-11 text-sap-muted mt-0.5">{(banks || []).length} accounts linked to fraud / betting sites with IFSC resolution</p>
            </div>
            {banks && banks.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-13">
                    <thead>
                      <tr className="bg-sap-bg/60 border-b border-sap-border-light text-left">
                        <th className="px-3 py-2 text-11 font-medium text-sap-muted">Account holder</th>
                        <th className="px-3 py-2 text-11 font-medium text-sap-muted">Account number</th>
                        <th className="px-3 py-2 text-11 font-medium text-sap-muted">Bank (IFSC)</th>
                        <th className="px-3 py-2 text-11 font-medium text-sap-muted">Source</th>
                        <th className="px-3 py-2 text-11 font-medium text-sap-muted">Evidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sap-border-light">
                      {pagedBanks.map((b, i) => {
                        const ifsc = b.ifsc_code || b.IFSC || '';
                        const bankName = resolveIFSC(ifsc);
                        return (
                          <tr key={i} className="hover:bg-sap-bg/60">
                            <td className="px-3 py-2.5 font-medium text-sap-text">{b.account_holder || b.ACCOUNT_HOLDER || '—'}</td>
                            <td className="px-3 py-2.5 font-mono text-12 text-sap-text">{b.account_number || b.ACCOUNT_NUMBER || '—'}</td>
                            <td className="px-3 py-2.5">
                              <div>
                                <span className="text-13 font-medium text-sap-text">{bankName || '—'}</span>
                                {ifsc && <span className="ml-2 text-11 font-mono text-sap-text bg-sap-bg border border-sap-border-light px-1.5 py-0.5 rounded">{ifsc}</span>}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="px-2 py-0.5 rounded text-11 font-medium bg-sap-danger-soft text-sap-danger">{b.source || b.SOURCE || 'FRAUD'}</span>
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
                  <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-sap-border-light">
                    <span className="text-11 text-sap-muted">Page {bankPage} of {bankTotalPages}</span>
                    <button
                      type="button"
                      onClick={() => setBankPage(p => Math.max(1, p - 1))}
                      disabled={bankPage <= 1}
                      className="px-3 py-1.5 text-12 rounded-lg border border-sap-border-light text-sap-dim hover:text-sap-text hover:bg-sap-bg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >Previous</button>
                    <button
                      type="button"
                      onClick={() => setBankPage(p => Math.min(bankTotalPages, p + 1))}
                      disabled={bankPage >= bankTotalPages}
                      className="px-3 py-1.5 text-12 rounded-lg border border-sap-border-light text-sap-dim hover:text-sap-text hover:bg-sap-bg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >Next</button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-13 text-sap-muted px-4 py-3">No flagged bank accounts found.</p>
            )}
          </div>

          {/* India map */}
          <div className="rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-sap-border-light">
              <h3 className="text-12 font-semibold tracking-tight text-sap-text">Fraud hotspot map</h3>
            </div>
            <div className="px-4 py-3">
              <div className="h-[320px] rounded-lg overflow-hidden border border-sap-border-light">
                <BankMap accounts={banks || []} />
              </div>
              <p className="text-11 text-sap-muted mt-2">Pins show cities with flagged bank accounts. Size = number of accounts.</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Crypto Wallet Trace ── */}
      {subTab === 'crypto' && (
        <div className="rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-sap-border-light">
            <h3 className="text-12 font-semibold tracking-tight text-sap-text">Crypto wallet trace</h3>
            <p className="text-11 text-sap-muted mt-0.5">Enter a BTC or ETH wallet address to trace transaction history</p>
          </div>
          <div className="px-4 py-3">
            <form onSubmit={handleWalletSearch} className="flex gap-3 items-center max-w-2xl mb-4">
              <input type="text" value={walletQuery} onChange={e => setWalletQuery(e.target.value)}
                placeholder="Enter BTC/ETH wallet address..."
                className="flex-1 bg-sap-bg border border-sap-border-light rounded-lg px-4 py-2.5 text-13 font-mono text-sap-text outline-none focus:border-sap-accent placeholder:text-sap-muted" />
              <button type="submit" disabled={walletLoading}
                className="bg-sap-accent-glow hover:bg-sap-accent text-sap-text hover:text-sap-bg border border-sap-accent px-5 py-2.5 rounded-lg text-13 font-semibold transition-colors disabled:opacity-40">
                {walletLoading ? 'Tracing…' : 'Trace wallet'}
              </button>
            </form>

            {walletData?.wallet && (
              <div className="rounded-lg border border-sap-border-light bg-sap-bg p-4 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 bg-sap-bg border border-sap-border-light text-sap-text text-11 font-semibold rounded-md">
                    {walletData.wallet.blockchain_type || 'BTC'}
                  </span>
                  <span className="font-mono text-13 truncate text-sap-text">{walletData.wallet.wallet_address}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-13">
                  <div>
                    <p className="text-11 text-sap-muted mb-0.5">Balance</p>
                    <p className="font-mono font-semibold text-sap-text">{walletData.wallet.balance?.crypto?.amount} {walletData.wallet.balance?.crypto?.currency_type}</p>
                  </div>
                  <div>
                    <p className="text-11 text-sap-muted mb-0.5">Total received</p>
                    <p className="font-mono font-semibold text-sap-success">{walletData.wallet.total_received?.fiat?.amount} {walletData.wallet.total_received?.fiat?.currency_type}</p>
                  </div>
                  <div>
                    <p className="text-11 text-sap-muted mb-0.5">Total sent</p>
                    <p className="font-mono font-semibold text-sap-danger">{walletData.wallet.total_sent?.fiat?.amount} {walletData.wallet.total_sent?.fiat?.currency_type}</p>
                  </div>
                  <div>
                    <p className="text-11 text-sap-muted mb-0.5">Transactions</p>
                    <p className="font-mono font-semibold text-sap-text">{walletData.wallet.transactions_count?.total}</p>
                  </div>
                </div>
                {walletData.wallet.wallet_explorer_info?.wallet_link && (
                  <a href={walletData.wallet.wallet_explorer_info.wallet_link} target="_blank" rel="noopener" className="text-13 text-sap-accent hover:underline mt-3 inline-block">
                    View on WalletExplorer →
                  </a>
                )}
                <EvidenceImage src={walletData.wallet.screenshot} alt="Wallet" className="h-28 w-auto mt-3 rounded-lg" />
              </div>
            )}

            {walletData?.transactions_darkweb?.length > 0 && (
              <div className="rounded-lg border border-sap-border-light bg-sap-bg p-4">
                <h4 className="text-12 font-semibold text-sap-text mb-3">Transactions ({walletData.transactions_darkweb.length})</h4>
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                  <table className="w-full text-12">
                    <thead>
                      <tr className="bg-sap-bg/60 border-b border-sap-border-light text-left">
                        <th className="px-2 py-2 text-11 font-medium text-sap-muted">Date</th>
                        <th className="px-2 py-2 text-11 font-medium text-sap-muted">From</th>
                        <th className="px-2 py-2 text-11 font-medium text-sap-muted">To</th>
                        <th className="px-2 py-2 text-11 font-medium text-sap-muted text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sap-border-light">
                      {walletData.transactions_darkweb.map((tx, i) => (
                        <tr key={i} className="hover:bg-sap-surface/50">
                          <td className="px-2 py-1.5 text-sap-dim">{String(tx.date || '').slice(0, 10)}</td>
                          <td className="px-2 py-1.5 font-mono text-sap-text truncate max-w-[150px]">{tx.from_address || '?'}</td>
                          <td className="px-2 py-1.5 font-mono text-sap-text truncate max-w-[150px]">{tx.to_address || '?'}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-sap-text">{tx.amount_crypto || '?'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
