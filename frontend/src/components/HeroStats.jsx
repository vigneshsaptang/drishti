import { useState, useEffect, useRef } from 'react';
import { getPlatformStats } from '../lib/api';

function fmt(n) {
  if (!n) return '0';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

// Animated counter — counts up from 0 to target
function AnimNum({ value, duration = 1200 }) {
  const [display, setDisplay] = useState('0');
  const ref = useRef(null);

  useEffect(() => {
    if (!value) { setDisplay('0'); return; }
    const target = typeof value === 'string' ? value : fmt(value);
    // Extract the numeric part for animation
    const re = /[\d.]+/g;
    const numMatch = re.exec(String(target));
    if (!numMatch) { setDisplay(target); return; }
    const endNum = Number.parseFloat(numMatch[0]);
    const suffix = target.replace(numMatch[0], '');
    const startTime = performance.now();

    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = eased * endNum;

      if (endNum >= 100) setDisplay(Math.round(current).toLocaleString() + suffix);
      else setDisplay(current.toFixed(1) + suffix);

      if (progress < 1) ref.current = requestAnimationFrame(tick);
      else setDisplay(target);
    }
    ref.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current);
  }, [value, duration]);

  return <>{display}</>;
}

export default function HeroStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPlatformStats()
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-sap-accent/15 bg-gradient-to-br from-sap-surface to-sap-panel p-8">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-3 h-3 rounded-full bg-sap-accent/40 animate-ping absolute" />
            <div className="w-3 h-3 rounded-full bg-sap-accent relative" />
          </div>
          <p className="text-sm text-sap-accent font-medium">Connecting to intelligence engines...</p>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const hero = stats.hero || {};
  const dw = stats.darkweb || {};
  const ti = stats.threat_intel || {};

  const totalAll = hero.total_records || 0;

  return (
    <div className="rounded-lg border border-sap-border bg-sap-surface shadow-sm overflow-hidden">

      {/* ── Top: One massive number ── */}
      <div className="px-6 py-5">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
              <span className="text-xs font-mono font-semibold text-emerald-600 uppercase tracking-widest">Intelligence Active</span>
            </div>
            <h2 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-sap-text leading-none font-mono tracking-tight">
              <AnimNum value={fmt(totalAll)} duration={1400} />
            </h2>
            <p className="text-sm text-sap-dim mt-2">
              Intelligence records across exposed data, dark web, financial systems, and social channels
            </p>
          </div>
        </div>
      </div>

      {/* ── Bottom: Operational metrics strip ── */}
      <div className="border-t border-sap-border bg-sap-panel/50">
        <div className="grid grid-cols-3 sm:grid-cols-5 divide-x divide-sap-border">
          {[
            { v: ti.upi_ids_tracked, l: 'Fraud UPI IDs', c: 'text-entity-upi' },
            { v: dw.marketplace_listings, l: 'Drug Listings', c: 'text-entity-drug' },
            { v: ti.telegram_messages, l: 'Telegram Messages', c: 'text-entity-telegram' },
            { v: ti.telegram_channels, l: 'Channels Monitored', c: 'text-entity-telegram' },
            { v: dw.crypto_wallets, l: 'Crypto Wallets', c: 'text-entity-crypto' },
          ].map(m => (
            <div key={m.l} className="px-3 py-3 text-center">
              <p className={`text-lg font-bold font-mono ${m.c}`}>
                <AnimNum value={fmt(m.v)} duration={1800} />
              </p>
              <p className="text-[10px] text-sap-muted uppercase tracking-wider mt-0.5 font-medium">{m.l}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
