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

// ── Geo-intelligence: extract location from breach record fields ──

const INDIA_CITIES = {
  // Punjab
  'amritsar': [31.634, 74.872], 'ludhiana': [30.901, 75.857], 'jalandhar': [31.326, 75.576],
  'patiala': [30.340, 76.386], 'bathinda': [30.210, 74.945], 'mohali': [30.704, 76.717],
  'chandigarh': [30.733, 76.779], 'ferozepur': [30.926, 74.613], 'pathankot': [32.275, 75.638],
  'gurdaspur': [32.041, 75.403], 'moga': [30.816, 75.174], 'sangrur': [30.246, 75.841],
  'tarn taran': [31.452, 74.928], 'fazilka': [30.404, 74.028], 'barnala': [30.381, 75.547],
  'hoshiarpur': [31.532, 75.911], 'kapurthala': [31.380, 75.382], 'nawanshahr': [31.125, 76.116],
  'rupnagar': [30.966, 76.533], 'muktsar': [30.474, 74.516],
  // Haryana
  'rohtak': [28.895, 76.607], 'sonipat': [28.994, 77.019], 'panipat': [29.387, 76.968],
  'karnal': [29.686, 76.990], 'hisar': [29.153, 75.723], 'gurgaon': [28.459, 77.026],
  'faridabad': [28.408, 77.317], 'ambala': [30.378, 76.776],
  // Major metros
  'delhi': [28.704, 77.102], 'new delhi': [28.613, 77.209], 'mumbai': [19.076, 72.877],
  'bangalore': [12.971, 77.594], 'bengaluru': [12.971, 77.594], 'chennai': [13.082, 80.270],
  'kolkata': [22.572, 88.363], 'hyderabad': [17.385, 78.486], 'pune': [18.520, 73.856],
  'ahmedabad': [23.022, 72.571], 'jaipur': [26.912, 75.787], 'lucknow': [26.846, 80.946],
  'indore': [22.719, 75.857], 'bhopal': [23.259, 77.412], 'nagpur': [21.145, 79.088],
  'varanasi': [25.317, 82.987], 'patna': [25.611, 85.144], 'surat': [21.170, 72.831],
  'noida': [28.535, 77.391], 'ghaziabad': [28.665, 77.438], 'agra': [27.176, 78.008],
  'ranchi': [23.344, 85.309], 'kochi': [9.931, 76.267], 'guwahati': [26.144, 91.736],
  'shimla': [31.105, 77.172], 'dehradun': [30.316, 78.032], 'srinagar': [34.083, 74.797],
  'jammu': [32.726, 74.857], 'thiruvananthapuram': [8.524, 76.936],
};

const INDIA_STATES = {
  'punjab': [30.79, 75.84], 'haryana': [29.06, 76.09], 'delhi': [28.70, 77.10],
  'maharashtra': [19.75, 75.71], 'karnataka': [15.31, 75.71], 'tamil nadu': [11.13, 78.66],
  'west bengal': [22.99, 87.75], 'telangana': [18.11, 79.02], 'uttar pradesh': [26.85, 80.91],
  'rajasthan': [27.02, 74.22], 'gujarat': [22.26, 71.19], 'madhya pradesh': [22.97, 78.66],
  'bihar': [25.10, 85.31], 'andhra pradesh': [15.91, 79.74], 'odisha': [20.94, 84.80],
  'kerala': [10.85, 76.27], 'jharkhand': [23.61, 85.28], 'assam': [26.20, 92.94],
  'uttarakhand': [30.07, 79.49], 'himachal pradesh': [31.10, 77.17], 'goa': [15.30, 74.08],
  'jammu and kashmir': [33.78, 76.58], 'j&k': [33.78, 76.58],
};

const INDIA_PINCODES = {
  // Punjab pincodes (first 3 digits → approximate center)
  '140': [30.71, 76.72], '141': [30.90, 75.85], '142': [30.80, 75.20], '143': [31.63, 74.87],
  '144': [31.33, 75.58], '145': [31.45, 74.93], '146': [30.34, 76.39], '147': [30.90, 75.86],
  '148': [29.95, 76.00], '149': [30.47, 74.52], '150': [30.73, 76.78], '151': [30.21, 74.95],
  '152': [30.38, 75.55],
  // Delhi
  '110': [28.65, 77.22],
  // Mumbai
  '400': [19.08, 72.88],
  // Haryana
  '121': [28.46, 77.03], '122': [28.46, 77.03], '124': [28.90, 76.61], '125': [29.15, 75.72],
  '126': [29.69, 76.99], '131': [28.99, 77.02], '132': [29.39, 76.97], '133': [30.38, 76.78],
  '134': [30.73, 76.78], '135': [30.32, 78.03],
};

/**
 * Extract geo-intelligence from breach record fields.
 * Scans for city, state, pincode, address, lat/lng fields.
 * Returns { lat, lng, label, confidence, source } or null.
 *
 * Confidence levels:
 *   'exact'  — lat/lng fields found directly
 *   'high'   — full address with city + pincode
 *   'medium' — city name resolved
 *   'low'    — only state name resolved
 */
export function extractGeoIntel(fields) {
  if (!fields) return null;

  let lat = null, lng = null, city = null, state = null, pincode = null, address = null;
  let source = '';

  for (const [key, value] of Object.entries(fields)) {
    if (!value || value === 'null' || value === 'None') continue;
    const kl = key.toLowerCase();
    const vl = String(value).toLowerCase().trim();

    // Direct lat/lng
    if ((kl === 'lat' || kl === 'latitude') && !isNaN(Number(value))) {
      lat = Number(value);
      source = key;
    }
    if ((kl === 'lng' || kl === 'lon' || kl === 'longitude') && !isNaN(Number(value))) {
      lng = Number(value);
    }

    // City
    if ((kl.includes('city') || kl === 'locationinfo.city') && vl.length > 1) {
      city = vl.replace(/[^a-z\s]/g, '').trim();
    }

    // State
    if ((kl.includes('state') || kl === 'locationinfo.state') && vl.length > 1) {
      state = vl.replace(/[^a-z\s&]/g, '').trim();
    }

    // Pincode / ZIP
    if ((kl.includes('pincode') || kl.includes('zipcode') || kl.includes('postal')) && /^\d{5,6}$/.test(vl)) {
      pincode = vl;
    }

    // Address
    if ((kl.includes('address') || kl === 'address_1') && vl.length > 5) {
      address = String(value).trim();
    }
  }

  // Priority 1: Exact lat/lng from data
  if (lat && lng && lat > 5 && lat < 40 && lng > 65 && lng < 100) {
    return {
      lat, lng,
      label: address || city || 'Coordinates from record',
      confidence: 'exact',
      badge: 'Exact coordinates',
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50 border-emerald-200',
      source: `Field: ${source}`,
    };
  }

  // Priority 2: City match
  if (city) {
    const coord = INDIA_CITIES[city];
    if (coord) {
      const hasPin = !!pincode;
      return {
        lat: coord[0], lng: coord[1],
        label: `${city.charAt(0).toUpperCase() + city.slice(1)}${state ? ', ' + state.charAt(0).toUpperCase() + state.slice(1) : ''}${pincode ? ' — ' + pincode : ''}`,
        confidence: hasPin ? 'high' : 'medium',
        badge: hasPin ? 'City + Pincode' : 'City-level',
        color: hasPin ? 'text-blue-600' : 'text-blue-500',
        bgColor: hasPin ? 'bg-blue-50 border-blue-200' : 'bg-blue-50 border-blue-200',
        source: `City: ${city}${pincode ? ', PIN: ' + pincode : ''}`,
      };
    }
  }

  // Priority 3: Pincode match
  if (pincode && pincode.length >= 3) {
    const prefix = pincode.slice(0, 3);
    const coord = INDIA_PINCODES[prefix];
    if (coord) {
      return {
        lat: coord[0], lng: coord[1],
        label: `Pincode area ${pincode}${state ? ', ' + state.charAt(0).toUpperCase() + state.slice(1) : ''}`,
        confidence: 'medium',
        badge: 'Pincode area',
        color: 'text-amber-600',
        bgColor: 'bg-amber-50 border-amber-200',
        source: `PIN: ${pincode}`,
      };
    }
  }

  // Priority 4: State only
  if (state) {
    const coord = INDIA_STATES[state];
    if (coord) {
      return {
        lat: coord[0], lng: coord[1],
        label: state.charAt(0).toUpperCase() + state.slice(1),
        confidence: 'low',
        badge: 'State-level only',
        color: 'text-orange-500',
        bgColor: 'bg-orange-50 border-orange-200',
        source: `State: ${state}`,
      };
    }
  }

  // Fallback: scan address string for known city names
  if (address) {
    const addrLower = address.toLowerCase();
    for (const [cityName, coord] of Object.entries(INDIA_CITIES)) {
      if (addrLower.includes(cityName)) {
        return {
          lat: coord[0], lng: coord[1],
          label: `${cityName.charAt(0).toUpperCase() + cityName.slice(1)} (from address)`,
          confidence: 'medium',
          badge: 'Address parsed',
          color: 'text-blue-500',
          bgColor: 'bg-blue-50 border-blue-200',
          source: `Address contains: ${cityName}`,
        };
      }
    }
  }

  return null;
}
