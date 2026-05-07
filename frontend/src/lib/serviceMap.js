const KNOWN_SERVICES = {
  facebook: { name: 'Facebook', category: 'social' },
  linkedin: { name: 'LinkedIn', category: 'social' },
  instagram: { name: 'Instagram', category: 'social' },
  twitter: { name: 'Twitter', category: 'social' },
  dubsmash: { name: 'Dubsmash', category: 'social' },
  snapchat: { name: 'Snapchat', category: 'social' },
  tiktok: { name: 'TikTok', category: 'social' },
  reddit: { name: 'Reddit', category: 'social' },
  discord: { name: 'Discord', category: 'social' },
  telegram: { name: 'Telegram', category: 'social' },
  whatsapp: { name: 'WhatsApp', category: 'social' },

  paytm: { name: 'Paytm', category: 'financial' },
  phonepe: { name: 'PhonePe', category: 'financial' },
  mobikwik: { name: 'MobiKwik', category: 'financial' },
  hdfc: { name: 'HDFC Bank', category: 'financial' },
  lenden_club_india: { name: 'LenDen Club', category: 'financial' },
  indiabulls: { name: 'Indiabulls', category: 'financial' },
  cibil: { name: 'CIBIL', category: 'financial' },
  cc_cards1: { name: 'Credit Cards DB', category: 'financial' },

  bigbasket: { name: 'BigBasket', category: 'ecommerce' },
  flipkart: { name: 'Flipkart', category: 'ecommerce' },
  amazon: { name: 'Amazon', category: 'ecommerce' },
  zomato: { name: 'Zomato', category: 'ecommerce' },
  swiggy: { name: 'Swiggy', category: 'ecommerce' },
  dunzo: { name: 'Dunzo', category: 'ecommerce' },
  indiamart: { name: 'IndiaMART', category: 'ecommerce' },
  minted: { name: 'Minted', category: 'ecommerce' },
  jpoint: { name: 'JPoint', category: 'ecommerce' },
  tokopedia: { name: 'Tokopedia', category: 'ecommerce' },

  railyatri: { name: 'RailYatri', category: 'travel' },
  ixigo: { name: 'Ixigo', category: 'travel' },
  yatra: { name: 'Yatra', category: 'travel' },
  makemytrip: { name: 'MakeMyTrip', category: 'travel' },
  red_doorz: { name: 'RedDoorz', category: 'travel' },
  zoomcar: { name: 'Zoomcar', category: 'travel' },
  ola: { name: 'Ola', category: 'travel' },
  uber: { name: 'Uber', category: 'travel' },

  hathway: { name: 'Hathway', category: 'telecom' },
  jio: { name: 'Jio', category: 'telecom' },
  airtel: { name: 'Airtel', category: 'telecom' },
  bsnl: { name: 'BSNL', category: 'telecom' },
  indihome: { name: 'IndiHome', category: 'telecom' },

  truecaller: { name: 'Truecaller', category: 'identity' },
  abfrl: { name: 'ABFRL', category: 'retail' },
  turtle_mint: { name: 'Turtlemint', category: 'insurance' },
  apollo: { name: 'Apollo', category: 'health' },
  hhs_gov: { name: 'HHS.gov', category: 'government' },
  neverskip: { name: 'NeverSkip', category: 'education' },
  vedantu: { name: 'Vedantu', category: 'education' },
  vedantu_2: { name: 'Vedantu', category: 'education' },
  byjus: { name: 'Byjus', category: 'education' },
  infinity_learn: { name: 'Infinity Learn', category: 'education' },
  peopledatalabs: { name: 'People Data Labs', category: 'databroker' },

  '1win': { name: '1Win', category: 'gambling' },
};

const CATEGORY_META = {
  social:     { label: 'Social',      color: 'text-entity-darkweb' },
  financial:  { label: 'Financial',   color: 'text-entity-crypto' },
  ecommerce:  { label: 'Shopping',    color: 'text-entity-breach' },
  travel:     { label: 'Travel',      color: 'text-entity-telegram' },
  telecom:    { label: 'Telecom',     color: 'text-entity-email' },
  identity:   { label: 'Identity',    color: 'text-entity-phone' },
  insurance:  { label: 'Insurance',   color: 'text-entity-breach' },
  health:     { label: 'Health',      color: 'text-emerald-600' },
  government: { label: 'Govt',        color: 'text-entity-watchlist' },
  education:  { label: 'Education',   color: 'text-sap-accent' },
  retail:     { label: 'Retail',      color: 'text-entity-breach' },
  gambling:   { label: 'Gambling',    color: 'text-entity-drug' },
  databroker: { label: 'Data Broker', color: 'text-entity-darkweb' },
  other:      { label: 'Other',       color: 'text-sap-dim' },
};

const CRITICAL_FIELDS = /^(pan|pan_?card|pan_?number|aadhaar|aadhar|aadhar_?number|aadhaar_?number|card_?number|credit_?card|debit_?card|cvv|cvv2|bank_?account|account_?number|cibil|cibil_?score|ssn|passport|passport_?number|ifsc|routing_?number)$/i;
const PASSWORD_FIELDS = /^(password|passwd|pass|hash|pwd|password_?hash|hashed_?password|bcrypt|md5|sha1|sha256)$/i;
const PII_BUCKETS = {
  name:    k => /^(name|fullname|full_?name|first_?name|last_?name|display_?name)$/i.test(k),
  email:   k => /^(e-?mail|mail|email_?address)$/i.test(k),
  phone:   k => /phone|mobile|cell|contact_?number/i.test(k) && !/email/i.test(k),
  address: k => /address|city|state|zip|pincode|postal/i.test(k) && !/ip|email/i.test(k),
  dob:     k => /dob|date_?of_?birth|birth_?date|birthday/i.test(k),
};

export function classifySeverity(source) {
  const fieldKeys = new Set();
  for (const rec of (source.records || [])) {
    for (const k of Object.keys(rec.fields || {})) fieldKeys.add(k);
  }

  let hasPassword = false;
  let hasCriticalField = false;
  const piiBuckets = new Set();

  for (const k of fieldKeys) {
    if (PASSWORD_FIELDS.test(k)) hasPassword = true;
    if (CRITICAL_FIELDS.test(k)) hasCriticalField = true;
    for (const [bucket, test] of Object.entries(PII_BUCKETS)) {
      if (test(k)) piiBuckets.add(bucket);
    }
  }

  if (hasCriticalField) return 'CRITICAL';
  if (hasPassword && piiBuckets.size >= 3) return 'HIGH';
  if (hasPassword && piiBuckets.size >= 1) return 'MEDIUM';
  if (piiBuckets.size >= 3) return 'MEDIUM';
  return 'LOW';
}

const SEVERITY_META = {
  CRITICAL: { label: 'CRITICAL', color: 'text-white bg-entity-drug border-entity-drug', ring: 'ring-entity-drug/30' },
  HIGH:     { label: 'HIGH',     color: 'text-entity-drug bg-entity-drug/15 border-entity-drug/40', ring: 'ring-entity-drug/10' },
  MEDIUM:   { label: 'MED',      color: 'text-amber-600 bg-amber-500/10 border-amber-500/30', ring: '' },
  LOW:      { label: 'LOW',      color: 'text-sap-muted bg-sap-panel border-sap-border', ring: '' },
};

function normalizeCollectionName(collection) {
  let key = (collection || '').toLowerCase().trim();
  key = key.replace(/_\d{4}(_\d+)?$/, '');
  key = key.replace(/_?part_?\d+$/i, '');
  key = key.replace(/^\d+_/, '');
  return key;
}

function isSkippable(collection) {
  const c = (collection || '').toLowerCase();
  return c.startsWith('combo_list') || c.startsWith('malware_log') || c === '';
}

export function extractDigitalFootprint(results) {
  const serviceMap = new Map();

  for (const entity of (results || [])) {
    if (!entity.found) continue;
    for (const src of (entity.sources || [])) {
      const raw = src.leak_name || src.collection || '';
      if (isSkippable(raw)) continue;

      const key = normalizeCollectionName(raw);
      if (serviceMap.has(key)) {
        const existing = serviceMap.get(key);
        const sev = classifySeverity(src);
        if (severityRank(sev) > severityRank(existing.severity)) {
          existing.severity = sev;
        }
        existing.recordCount += src.records?.length || 0;
        continue;
      }

      const known = KNOWN_SERVICES[key];
      const severity = classifySeverity(src);

      serviceMap.set(key, {
        name: known?.name || toDisplayName(raw),
        category: known?.category || 'other',
        severity,
        collection: raw,
        recordCount: src.records?.length || 0,
      });
    }
  }

  const services = [...serviceMap.values()];
  services.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  return services;
}

function severityRank(s) {
  return { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[s] || 0;
}

function toDisplayName(raw) {
  return raw
    .replace(/_\d{4}.*$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim() || raw;
}

export { CATEGORY_META, SEVERITY_META };
