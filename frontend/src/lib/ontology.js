/**
 * Punjab Narco-Terror Intelligence Ontology
 * Entity roles, edge types, street terminology, NLP classification
 */

// Person entity role sub-types
export const PERSON_ROLES = {
  'designated_terrorist': { label: 'DESIGNATED TERRORIST', color: 'bg-entity-watchlist text-white', weight: 'authoritative' },
  'proclaimed_offender': { label: 'PROCLAIMED OFFENDER', color: 'bg-entity-watchlist text-white', weight: 'authoritative' },
  'handler_overseas': { label: 'HANDLER — OVERSEAS', color: 'bg-entity-drug/80 text-white', weight: 'chargesheeted' },
  'handler_pakistan': { label: 'HANDLER — PAKISTAN', color: 'bg-entity-drug/80 text-white', weight: 'chargesheeted' },
  'ground_coordinator': { label: 'GROUND COORDINATOR', color: 'bg-entity-breach/80 text-white', weight: 'chargesheeted' },
  'drone_operator': { label: 'DRONE OPERATOR', color: 'bg-entity-telegram/80 text-white', weight: 'reported' },
  'courier': { label: 'COURIER', color: 'bg-sap-muted text-white', weight: 'chargesheeted' },
  'financier': { label: 'FINANCIER', color: 'bg-entity-crypto/80 text-white', weight: 'chargesheeted' },
  'crypto_converter': { label: 'CRYPTO CONVERTER', color: 'bg-entity-crypto/80 text-white', weight: 'reported' },
  'shooter': { label: 'SHOOTER', color: 'bg-entity-drug text-white', weight: 'chargesheeted' },
  'jailed_operative': { label: 'JAILED OPERATIVE', color: 'bg-sap-dim text-white', weight: 'chargesheeted' },
};

// Graph edge types from ontology
export const EDGE_TYPES = {
  'found_in': { label: 'FOUND IN', color: '#f59e0b', style: 'solid' },
  'discovered_in': { label: 'DISCOVERED', color: '#10b981', style: 'solid' },
  'mentioned_in': { label: 'MENTIONED', color: '#06b6d4', style: 'solid' },
  'authored': { label: 'AUTHORED', color: '#a855f7', style: 'solid' },
  'linked_upi': { label: 'LINKED UPI', color: '#eab308', style: 'solid' },
  'transacted': { label: 'TRANSACTED', color: '#f97316', style: 'solid' },
  'matches': { label: 'MATCHES', color: '#dc2626', style: 'solid' },
  // Ontology edges
  'FINANCES': { label: 'FINANCES', color: '#f97316', style: 'solid', weight: 2 },
  'HANDLES': { label: 'HANDLES', color: '#ef4444', style: 'solid', weight: 2 },
  'SUPPLIES': { label: 'SUPPLIES', color: '#ef4444', style: 'dashed', weight: 2 },
  'RECRUITS_FOR': { label: 'RECRUITS', color: '#a855f7', style: 'dashed', weight: 1 },
  'LAUNDERS_FOR': { label: 'LAUNDERS', color: '#f97316', style: 'dashed', weight: 1 },
  'OPERATES_FROM': { label: 'OPERATES FROM', color: '#3b82f6', style: 'solid', weight: 1 },
  'TRANSITS_THROUGH': { label: 'TRANSITS', color: '#06b6d4', style: 'dashed', weight: 1 },
  'AFFILIATED_WITH': { label: 'AFFILIATED', color: '#dc2626', style: 'solid', weight: 2 },
  'COMMUNICATES_WITH': { label: 'COMMUNICATES', color: '#3b82f6', style: 'solid', weight: 1 },
  'FAMILIAL_TIE': { label: 'FAMILY', color: '#f8fafc', style: 'dotted', weight: 1 },
  'PRISON_COORDINATION': { label: 'PRISON COORD', color: '#64748b', style: 'dashed', weight: 1 },
  'DIASPORA_LINK': { label: 'DIASPORA', color: '#a855f7', style: 'dashed', weight: 1 },
};

// Pre-loaded NIA chargesheet linkages for the graph
export const NIA_LINKAGES = [
  { source: 'Arsh Dalla', target: 'KTF', type: 'AFFILIATED_WITH', source_ref: 'NIA RC-22/2023' },
  { source: 'Arsh Dalla', target: 'Harry Maur', type: 'HANDLES', source_ref: 'NIA RC-22/2023' },
  { source: 'Arsh Dalla', target: 'Harry Rajpura', type: 'HANDLES', source_ref: 'NIA RC-22/2023' },
  { source: 'Arsh Dalla', target: 'Manpreet Peeta', type: 'HANDLES', source_ref: 'NIA 2024' },
  { source: 'Lawrence Bishnoi', target: 'Goldy Brar', type: 'COMMUNICATES_WITH', source_ref: 'NIA Mar 2023' },
  { source: 'Goldy Brar', target: 'Lakhbir Landa', type: 'COMMUNICATES_WITH', source_ref: 'NIA Mar 2023' },
  { source: 'Lakhbir Landa', target: 'Rinda', type: 'COMMUNICATES_WITH', source_ref: 'NIA Mar 2023' },
  { source: 'Rinda', target: 'Mohali RPG Attack', type: 'HANDLES', source_ref: 'NIA chargesheet' },
  { source: 'Lakhbir Landa', target: 'Sarhali RPG Attack', type: 'HANDLES', source_ref: 'NIA chargesheet' },
];

// Drug street terminology for content highlighting
export const STREET_TERMS = {
  'chitta': { substance: 'Heroin', severity: 'high' },
  'smack': { substance: 'Heroin', severity: 'high' },
  'mandakini': { substance: 'Heroin (coded)', severity: 'high' },
  'bhukki': { substance: 'Poppy husk', severity: 'medium' },
  'afeem': { substance: 'Opium', severity: 'medium' },
  'ice': { substance: 'Crystal meth', severity: 'high' },
  'goli': { substance: 'Pharma tablets', severity: 'medium' },
  'goliyan': { substance: 'Pharma tablets', severity: 'medium' },
  'capsule': { substance: 'Pharma opioids', severity: 'medium' },
  'kaipsool': { substance: 'Pharma opioids', severity: 'medium' },
  'sulfa': { substance: 'Synthetic powder', severity: 'medium' },
  'charas': { substance: 'Cannabis resin', severity: 'low' },
  'ganja': { substance: 'Cannabis herb', severity: 'low' },
  'peti': { substance: 'Consignment (trade term)', severity: 'high' },
  'patti': { substance: 'Packet (trade term)', severity: 'high' },
  'maal': { substance: 'Generic (drugs)', severity: 'medium' },
};

// NLP content classification categories
export const NLP_CATEGORIES = [
  { id: 'narco_commerce', label: 'Narcotics Commerce', color: 'bg-entity-drug/20 text-entity-drug' },
  { id: 'arms_commerce', label: 'Arms Commerce', color: 'bg-entity-watchlist/20 text-entity-watchlist' },
  { id: 'uav_chatter', label: 'UAV/Drone Chatter', color: 'bg-entity-telegram/20 text-entity-telegram' },
  { id: 'hawala_crypto', label: 'Hawala/Crypto', color: 'bg-entity-crypto/20 text-entity-crypto' },
  { id: 'recruitment', label: 'Recruitment', color: 'bg-entity-darkweb/20 text-entity-darkweb' },
  { id: 'threat_extortion', label: 'Threat/Extortion', color: 'bg-entity-drug/20 text-entity-drug' },
  { id: 'prison_coord', label: 'Prison Coordination', color: 'bg-sap-muted/20 text-sap-dim' },
  { id: 'counter_surv', label: 'Counter-Surveillance', color: 'bg-entity-breach/20 text-entity-breach' },
];

/**
 * Highlight street terminology in text content
 */
export function highlightStreetTerms(text) {
  if (!text) return text;
  let result = text;
  const termPattern = Object.keys(STREET_TERMS).join('|');
  const regex = new RegExp(`\\b(${termPattern})\\b`, 'gi');
  result = result.replace(regex, (match) => {
    const term = STREET_TERMS[match.toLowerCase()];
    if (!term) return match;
    const severityColor = term.severity === 'high' ? 'text-entity-drug font-bold' :
                          term.severity === 'medium' ? 'text-entity-breach font-medium' : 'text-entity-email';
    return `<span class="${severityColor}" title="${term.substance}">${match}</span>`;
  });
  return result;
}

/**
 * Simple NLP classification of text (keyword-based)
 */
export function classifyContent(text) {
  if (!text) return [];
  const t = text.toLowerCase();
  const tags = [];

  if (/heroin|cocaine|meth|fentanyl|chitta|smack|opium|cannabis|charas|ganja|drug|narcotic/i.test(t))
    tags.push('narco_commerce');
  if (/gun|pistol|rifle|weapon|arm|grenade|explosive|ied|rpg/i.test(t))
    tags.push('arms_commerce');
  if (/drone|uav|quadcopter|hexacopter|payload|drop/i.test(t))
    tags.push('uav_chatter');
  if (/hawala|crypto|bitcoin|usdt|trc.?20|wallet|monero|xmr/i.test(t))
    tags.push('hawala_crypto');
  if (/recruit|join|movement|cause|jihad|khalistan|martyr/i.test(t))
    tags.push('recruitment');
  if (/threat|kill|shoot|extort|ransom|supari|target/i.test(t))
    tags.push('threat_extortion');
  if (/jail|prison|custody|inmate|parole|bail/i.test(t))
    tags.push('prison_coord');
  if (/vpn|tor|pgp|encrypt|burner|opsec|security|anonymi/i.test(t))
    tags.push('counter_surv');

  return tags;
}
