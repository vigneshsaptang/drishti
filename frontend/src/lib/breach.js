/**
 * Breach intelligence utilities — type classification, recency, badges
 */

// Classify breach collection into a type with badge styling
export function classifyBreach(collectionName, leakName) {
  const name = (collectionName || '').toLowerCase();
  const leak = (leakName || '').toLowerCase();

  if (name.startsWith('malware_log') || name.includes('malware'))
    return { label: 'MALWARE LOG', color: 'bg-entity-drug/20 text-entity-drug border-entity-drug/30', icon: '⚠', description: 'Data from malware-infected device — contains saved credentials, browser history, autofill data' };

  if (name === 'truecaller')
    return { label: 'IDENTITY', color: 'bg-entity-phone/20 text-entity-phone border-entity-phone/30', icon: '👤', description: 'Identity verification service — name, carrier, spam score' };

  if (['ixigo', 'yatra', 'makemytrip', 'railyatri'].some(t => name.includes(t)))
    return { label: 'TRAVEL', color: 'bg-entity-telegram/20 text-entity-telegram border-entity-telegram/30', icon: '✈', description: 'Travel booking data — routes, dates, co-passengers' };

  if (['hathway', 'den', 'jio', 'airtel', 'bsnl'].some(t => name.includes(t)))
    return { label: 'ISP / TELECOM', color: 'bg-entity-email/20 text-entity-email border-entity-email/30', icon: '🌐', description: 'Internet/telecom provider — installation address, account details' };

  if (['paytm', 'phonepe', 'gpay', 'mobikwik'].some(t => name.includes(t)))
    return { label: 'PAYMENTS', color: 'bg-entity-upi/20 text-entity-upi border-entity-upi/30', icon: '💳', description: 'Payment platform — transaction patterns, linked bank accounts' };

  if (['bigbasket', 'flipkart', 'amazon', 'zomato', 'swiggy', 'dunzo'].some(t => name.includes(t)))
    return { label: 'E-COMMERCE', color: 'bg-entity-breach/20 text-entity-breach border-entity-breach/30', icon: '📦', description: 'E-commerce/delivery — delivery addresses, order history' };

  if (['zoomcar', 'ola', 'uber', 'megacab'].some(t => name.includes(t)))
    return { label: 'TRANSPORT', color: 'bg-entity-telegram/20 text-entity-telegram border-entity-telegram/30', icon: '🚗', description: 'Transport/rental — pickup/drop locations, movement tracking' };

  if (['facebook', 'dubsmash', 'linkedin', 'instagram'].some(t => name.includes(t)))
    return { label: 'SOCIAL MEDIA', color: 'bg-entity-darkweb/20 text-entity-darkweb border-entity-darkweb/30', icon: '📱', description: 'Social media platform — profile data, connections, activity' };

  if (['1win', 'bet', 'casino', 'lottery'].some(t => name.includes(t)))
    return { label: 'GAMBLING', color: 'bg-entity-drug/20 text-entity-drug border-entity-drug/30', icon: '🎰', description: 'Gambling/betting platform — money laundering indicator' };

  if (['lenden', 'indiabulls', 'hsbc', 'credit_card'].some(t => name.includes(t)))
    return { label: 'FINANCIAL', color: 'bg-entity-crypto/20 text-entity-crypto border-entity-crypto/30', icon: '🏦', description: 'Financial service — banking, lending, credit data' };

  if (['vedantu', 'infinity_learn', 'byjus'].some(t => name.includes(t)))
    return { label: 'EDUCATION', color: 'bg-sap-accent/20 text-sap-accent border-sap-accent/30', icon: '📚', description: 'Education platform — contact details, location' };

  if (['passport', 'icmr', 'government', 'pakistan_citizens', 'aadhar'].some(t => name.includes(t)))
    return { label: 'GOVERNMENT', color: 'bg-entity-watchlist/20 text-entity-watchlist border-entity-watchlist/30', icon: '🏛', description: 'Government/citizen database — high-confidence identity data' };

  if (name.includes('turtle_mint') || name.includes('insurance'))
    return { label: 'INSURANCE', color: 'bg-entity-breach/20 text-entity-breach border-entity-breach/30', icon: '🛡', description: 'Insurance platform — vehicle/health records' };

  if (name.startsWith('combo_list'))
    return { label: 'COMBO LIST', color: 'bg-sap-muted/20 text-sap-dim border-sap-border', icon: '📋', description: 'Credential combo list — email/password pairs' };

  if (name.includes('peopledatalabs'))
    return { label: 'DATA BROKER', color: 'bg-entity-darkweb/20 text-entity-darkweb border-entity-darkweb/30', icon: '🗃', description: 'Identity data aggregator — social media links, employment, addresses' };

  return { label: 'LEAKED DB', color: 'bg-sap-muted/20 text-sap-dim border-sap-border', icon: '🔓', description: 'Database breach' };
}

// Data recency from various timestamp fields
export function getRecency(fields) {
  const timestamps = [];

  for (const [key, value] of Object.entries(fields || {})) {
    const kl = key.toLowerCase();
    if (kl.includes('created') || kl.includes('updated') || kl.includes('lastlogin') || kl.includes('date') || kl.includes('timestamp')) {
      // Try epoch milliseconds
      const num = Number(value);
      if (num > 1000000000000 && num < 2000000000000) {
        timestamps.push(new Date(num));
      } else if (num > 1000000000 && num < 2000000000) {
        timestamps.push(new Date(num * 1000));
      }
      // Try ISO date string
      if (typeof value === 'string') {
        const d = new Date(value);
        if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
          timestamps.push(d);
        }
      }
    }
  }

  if (timestamps.length === 0) return null;

  const latest = new Date(Math.max(...timestamps.map(d => d.getTime())));
  const ageYears = (Date.now() - latest.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

  let color, label;
  if (ageYears < 1) { color = 'text-emerald-400'; label = 'Recent'; }
  else if (ageYears < 3) { color = 'text-yellow-400'; label = `${Math.floor(ageYears)}y ago`; }
  else if (ageYears < 5) { color = 'text-orange-400'; label = `${Math.floor(ageYears)}y ago`; }
  else { color = 'text-entity-drug'; label = `${Math.floor(ageYears)}y ago`; }

  return {
    date: latest.toISOString().slice(0, 10),
    ageYears: Math.floor(ageYears * 10) / 10,
    color,
    label,
  };
}
