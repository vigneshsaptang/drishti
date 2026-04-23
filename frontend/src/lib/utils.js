export function fieldClass(key) {
  const k = key.toLowerCase();
  if (k.includes('password') || k.includes('hash') || k.includes('cred')) return 'field-password';
  if (k.includes('location') || k.includes('address') || k.includes('city') || k.includes('state') || k.includes('pincode') || k.includes('country') || k.includes('lat') || k.includes('lng')) return 'field-location';
  if (k.includes('phone') || k.includes('contact') || k.includes('mobile')) return 'field-phone';
  if (k.includes('email')) return 'field-email';
  if (k.includes('upi') || k.includes('bank') || k.includes('account') || k.includes('ifsc') || k.includes('cibil')) return 'field-financial';
  if (k.includes('facebook') || k.includes('linkedin') || k.includes('social') || k.includes('profile')) return 'field-social';
  return '';
}

export function redactPassword(key, value) {
  if (fieldClass(key) === 'field-password' && value?.length > 8) {
    return value.slice(0, 8) + '•••';
  }
  return value;
}

export const entityColors = {
  phone: { bg: 'bg-entity-phone/20', text: 'text-entity-phone', border: 'border-entity-phone/30' },
  email: { bg: 'bg-entity-email/20', text: 'text-entity-email', border: 'border-entity-email/30' },
  breach: { bg: 'bg-entity-breach/20', text: 'text-entity-breach', border: 'border-entity-breach/30' },
  darkweb: { bg: 'bg-entity-darkweb/20', text: 'text-entity-darkweb', border: 'border-entity-darkweb/30' },
  drug: { bg: 'bg-entity-drug/20', text: 'text-entity-drug', border: 'border-entity-drug/30' },
  telegram: { bg: 'bg-entity-telegram/20', text: 'text-entity-telegram', border: 'border-entity-telegram/30' },
  upi: { bg: 'bg-entity-upi/20', text: 'text-entity-upi', border: 'border-entity-upi/30' },
  crypto: { bg: 'bg-entity-crypto/20', text: 'text-entity-crypto', border: 'border-entity-crypto/30' },
  watchlist: { bg: 'bg-entity-watchlist/20', text: 'text-entity-watchlist', border: 'border-entity-watchlist/30' },
};

export const STATUS_MESSAGES = [
  'Initializing breach intelligence engine...',
  'Searching phone records across breach databases...',
  'Fetching exposed credentials via secure pipeline...',
  'Extracting linked identifiers from breach records...',
  'Expanding entity graph to next depth level...',
  'Scanning dark web marketplace listings...',
  'Querying threat actor profiles...',
  'Checking Telegram intelligence corpus...',
  'Screening against global crime and sanctions databases...',
  'Tracing cryptocurrency wallet connections...',
  'Building connection graph...',
  'Compiling intelligence report...',
];
