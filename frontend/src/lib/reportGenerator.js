import { chooseCanonicalIdentity } from './canonicalIdentity';
import { chooseCanonicalLocation, formatCanonicalLocation } from './canonicalLocation';
import { extractIdentifiers } from './identifierExtract';

const SAPTANG_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="26" viewBox="0 0 100 92" fill="none">
  <path d="M11.8691 25.0751C11.8691 23.7769 12.9231 22.7246 14.2232 22.7246C15.5234 22.7246 16.5773 23.7769 16.5773 25.0751V63.4676C16.5773 64.7656 15.5234 65.8181 14.2232 65.8181C12.9231 65.8181 11.8691 64.7656 11.8691 63.4676V25.0751Z" fill="currentColor"/>
  <path d="M11.8691 11.7568C11.8691 10.4586 12.9231 9.40625 14.2232 9.40625C15.5234 9.40625 16.5773 10.4586 16.5773 11.7568V18.8085C16.5773 20.1066 15.5234 21.159 14.2232 21.159C12.9231 21.159 11.8691 20.1066 11.8691 18.8085V11.7568Z" fill="currentColor"/>
  <path d="M23.6387 8.61227C23.6387 7.31408 24.6926 6.26172 25.9928 6.26172C27.2929 6.26172 28.3469 7.31408 28.3469 8.61227V17.2309C28.3469 18.5291 27.2929 19.5815 25.9928 19.5815C24.6926 19.5815 23.6387 18.5291 23.6387 17.2309V8.61227Z" fill="currentColor"/>
  <path d="M35.4082 4.69821C35.4082 3.40005 36.4621 2.34766 37.7623 2.34766C39.0625 2.34766 40.1164 3.40005 40.1164 4.69821V14.8839C40.1164 16.1821 39.0625 17.2345 37.7623 17.2345C36.4621 17.2345 35.4082 16.1821 35.4082 14.8839V4.69821Z" fill="currentColor"/>
  <path d="M23.6387 32.1279C23.6387 30.8297 24.6926 29.7773 25.9928 29.7773C27.2929 29.7773 28.3469 30.8297 28.3469 32.1279V70.5202C28.3469 71.8184 27.2929 72.8707 25.9928 72.8707C24.6926 72.8707 23.6387 71.8184 23.6387 70.5202V32.1279Z" fill="currentColor"/>
  <path d="M35.4082 36.8232C35.4082 35.525 36.4621 34.4727 37.7623 34.4727C39.0625 34.4727 40.1164 35.525 40.1164 36.8232V76.7826C40.1164 78.0808 39.0625 79.1331 37.7623 79.1331C36.4621 79.1331 35.4082 78.0808 35.4082 76.7826V36.8232Z" fill="currentColor"/>
  <path d="M47.1777 2.35055C47.1777 1.05237 48.2317 0 49.5318 0C50.832 0 51.8859 1.05238 51.8859 2.35055V85.4033C51.8859 86.7015 50.832 87.7538 49.5318 87.7538C48.2317 87.7538 47.1777 86.7015 47.1777 85.4033V2.35055Z" fill="currentColor"/>
  <path d="M58.9473 4.69821C58.9473 3.40002 60.0012 2.34766 61.3014 2.34766C62.6015 2.34766 63.6554 3.40005 63.6554 4.69821V43.8741C63.6554 45.1724 62.6015 46.2247 61.3014 46.2247C60.0012 46.2247 58.9473 45.1724 58.9473 43.8741V4.69821Z" fill="currentColor"/>
  <path d="M70.7168 7.83688C70.7168 6.53872 71.7707 5.48633 73.0709 5.48633C74.3711 5.48633 75.425 6.53872 75.425 7.83688V47.0127C75.425 48.3109 74.3711 49.3632 73.0709 49.3632C71.7707 49.3632 70.7168 48.3109 70.7168 47.0127V7.83688Z" fill="currentColor"/>
  <path d="M82.4927 11.7568C82.4927 10.4586 83.5466 9.40625 84.8468 9.40625C86.1469 9.40625 87.2009 10.4586 87.2009 11.7568V50.1491C87.2009 51.4473 86.1469 52.4996 84.8468 52.4996C83.5466 52.4996 82.4927 51.4473 82.4927 50.1491V11.7568Z" fill="currentColor"/>
  <path d="M58.9473 66.6006C58.9473 65.3023 60.0012 64.25 61.3014 64.25C62.6015 64.25 63.6554 65.3023 63.6554 66.6006V76.7862C63.6554 78.0844 62.6015 79.1367 61.3014 79.1367C60.0012 79.1367 58.9473 78.0844 58.9473 76.7862V66.6006Z" fill="currentColor"/>
  <path d="M69.9426 61.8935C69.9426 60.5953 70.9966 59.543 72.2967 59.543C73.5969 59.543 74.6508 60.5953 74.6508 61.8935V71.2957C74.6508 72.5939 73.5969 73.6463 72.2967 73.6463C70.9966 73.6463 69.9426 72.5939 69.9426 71.2957V61.8935Z" fill="currentColor"/>
  <path d="M81.7058 57.1943C81.7058 55.8961 82.7597 54.8438 84.0599 54.8438C85.3601 54.8438 86.414 55.8961 86.414 57.1943V64.246C86.414 65.5442 85.3601 66.5965 84.0599 66.5965C82.7597 66.5965 81.7058 65.5442 81.7058 64.246V57.1943Z" fill="currentColor"/>
</svg>`;

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generateReportId() {
  const hex = Math.random().toString(16).slice(2, 6).toUpperCase();
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `SIG-${y}-${m}${d}-${hex}`;
}

function formatTimestamp() {
  const now = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = String(now.getDate()).padStart(2, '0');
  const mon = months[now.getMonth()];
  const y = now.getFullYear();
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${d} ${mon} ${y}, ${h}:${min} IST`;
}

function badge(text, color) {
  return `<span class="badge badge-${color}">${esc(text)}</span>`;
}

function typeBadge(type) {
  const map = { email: 'blue', phone: 'green', username: 'gray', fullname: 'amber' };
  return badge(type, map[type] || 'gray');
}

function profileItem(label, values, max = 5) {
  if (!values || values.length === 0) return '';
  const shown = values.slice(0, max);
  const rest = values.length - max;
  let html = shown.map(v => esc(v)).join('<br>');
  if (rest > 0) html += `<br><span style="color:#999">+${rest} more</span>`;
  return `<div class="profile-item">
  <span class="profile-label">${esc(label)}</span>
  <span class="profile-value">${html}</span>
</div>`;
}

function statBox(num, label) {
  return `<div class="stat-box">
  <div class="stat-num">${esc(String(num))}</div>
  <div class="stat-label">${esc(label)}</div>
</div>`;
}

// Extract IPs, DOBs, accounts from breach records
const IP_RE = /^(ip|ip_?address|last_?ip|signup_?ip|login_?ip|created_?ip|register_?ip|reg_?ip)$/i;
const DOB_RE = /^(dob|date_?of_?birth|birth_?date|birthday)$/i;
const ACCOUNT_RE = /facebook|linkedin|twitter|instagram|telegram|skype|discord|steam|truecaller|whatsapp|snapchat|tiktok|reddit|github|spotify|netflix|profile_?url|website|social/i;
const SKIP = new Set(['', 'null', 'None', 'none', 'undefined', 'N/A', 'n/a', '-', '0', 'false']);

function extractExtras(results) {
  const ips = new Map();
  const dobs = new Map();
  const accounts = new Map();
  for (const entity of (results || [])) {
    if (!entity.found) continue;
    for (const src of (entity.sources || [])) {
      for (const rec of (src.records || [])) {
        for (const [k, v] of Object.entries(rec.fields || {})) {
          if (!v || typeof v !== 'string' || SKIP.has(v.trim())) continue;
          const val = v.trim();
          if (IP_RE.test(k) && /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(val)) {
            if (!ips.has(val)) ips.set(val, val);
          } else if (DOB_RE.test(k)) {
            if (!dobs.has(val.toLowerCase())) dobs.set(val.toLowerCase(), val);
          } else if (ACCOUNT_RE.test(k) && val.length > 2) {
            if (!accounts.has(val.toLowerCase())) accounts.set(val.toLowerCase(), val);
          }
        }
      }
    }
  }
  return {
    ips: [...ips.values()],
    dobs: [...dobs.values()],
    accounts: [...accounts.values()],
  };
}

function computeRisk(ftiResults, darkmonResults, financialResults) {
  const hasCrime = ftiResults.some(r => r.query_type === 'crimedata' && r.found);
  const hasWatchlist = ftiResults.some(r => r.query_type === 'worldcheck' && r.found);
  const hasDarkweb = darkmonResults.some(r => r.found);
  const hasFraud = financialResults.some(r => r.found);

  const signals = [hasCrime, hasWatchlist, hasDarkweb, hasFraud].filter(Boolean).length;

  if (signals >= 2 || hasCrime) {
    const reasons = [];
    if (hasCrime) reasons.push('crime database hits');
    if (hasWatchlist) reasons.push('watchlist matches');
    if (hasDarkweb) reasons.push('dark web forum activity');
    if (hasFraud) reasons.push('fraud-linked financial instruments');
    return { level: 'high', reason: `Subject has ${reasons.join(', ')}.` };
  }
  if (signals === 1) {
    if (hasWatchlist) return { level: 'medium', reason: 'Subject has watchlist matches requiring further review.' };
    if (hasDarkweb) return { level: 'medium', reason: 'Dark web forum activity detected for associated usernames.' };
    if (hasFraud) return { level: 'medium', reason: 'Financial instruments linked to fraud reports.' };
  }
  return { level: 'low', reason: 'No adverse screening results detected.' };
}

function buildSummaryText(ids, locString, sourceCount, ftiResults, darkmonResults, financialResults) {
  const parts = [];
  const name = ids.names?.[0];
  if (name) {
    let lead = `Subject identified as ${name}`;
    if (locString) lead += `, located in ${locString}`;
    lead += '.';
    parts.push(lead);
  }

  const fp = [];
  if (ids.emails.length) fp.push(`${ids.emails.length} email${ids.emails.length !== 1 ? 's' : ''}`);
  if (ids.phones.length) fp.push(`${ids.phones.length} phone number${ids.phones.length !== 1 ? 's' : ''}`);
  if (ids.usernames.length) fp.push(`${ids.usernames.length} username${ids.usernames.length !== 1 ? 's' : ''}`);
  if (fp.length) {
    let s = `Digital footprint spans ${fp.join(', ')}`;
    if (sourceCount) s += ` across ${sourceCount} breach source${sourceCount !== 1 ? 's' : ''}`;
    s += '.';
    parts.push(s);
  }

  const cd = ftiResults.filter(r => r.query_type === 'crimedata' && r.found).length;
  const wc = ftiResults.filter(r => r.query_type === 'worldcheck' && r.found).length;
  if (cd || wc) {
    const h = [];
    if (cd) h.push(`${cd} crime database hit${cd !== 1 ? 's' : ''}`);
    if (wc) h.push(`${wc} watchlist match${wc !== 1 ? 'es' : ''}`);
    parts.push(`Screening flagged ${h.join(' and ')}.`);
  }

  const dm = darkmonResults.filter(r => r.found).length;
  if (dm) parts.push(`Dark web forum activity detected for ${dm} username${dm !== 1 ? 's' : ''}.`);

  const upi = financialResults.filter(r => r.found).length;
  if (upi) parts.push(`Financial screening linked ${upi} phone number${upi !== 1 ? 's' : ''} to fraud-flagged UPI IDs.`);

  return parts.join(' ');
}

// Build FTI screening rows for crime data
function crimedataDetailText(record) {
  const src = record?._source || {};
  const parts = [];
  if (src.name) parts.push(src.name);
  if (src.category) parts.push(`Category: ${src.category}`);
  if (src.entity_type) parts.push(`Type: ${src.entity_type}`);
  const detail = src.detail_info || {};
  if (detail.linked_to) parts.push(`Linked to: ${detail.linked_to}`);
  if (detail.address) parts.push(`Address: ${detail.address}`);
  if (src.country_name) parts.push(`Country: ${src.country_name}`);
  return parts.join(' — ') || 'Match found';
}

function worldcheckDetailText(record) {
  const parts = [];
  if (record.primary_name) parts.push(record.primary_name);
  const extra = record.EXTRA_DATA || {};
  if (extra.category) parts.push(`Category: ${extra.category}`);
  if (extra.entity_type) parts.push(`Type: ${extra.entity_type}`);
  if (extra.keywords) parts.push(`Keywords: ${extra.keywords}`);
  if (record.country) parts.push(`Country: ${record.country}`);
  if (extra.further_info) parts.push(extra.further_info.slice(0, 120));
  return parts.join(' — ') || 'Match found';
}


export function generateReport({ results, searchMeta, ftiResults, darkmonResults, financialResults, aiSummary }) {
  const ids = extractIdentifiers(results || []);
  const canonical = chooseCanonicalIdentity({
    names: ids.names, usernames: ids.usernames, emails: ids.emails,
  });
  const location = chooseCanonicalLocation(results || []);
  const locString = formatCanonicalLocation(location);
  const extras = extractExtras(results);

  const totalSearched = searchMeta?.total_entities_searched ?? results.length;
  const totalFound = searchMeta?.total_found ?? results.filter(r => r.found).length;
  const totalTime = searchMeta?.total_time_ms;
  let sourceCount = 0;
  results.forEach(r => { sourceCount += (r.sources || []).length; });

  const risk = computeRisk(ftiResults || [], darkmonResults || [], financialResults || []);
  const summaryText = aiSummary || buildSummaryText(ids, locString, sourceCount, ftiResults || [], darkmonResults || [], financialResults || []);
  const subjectName = canonical?.canonical || ids.names?.[0] || searchMeta?.seeds?.[0]?.value || 'Unknown Subject';

  // Breach exposure: group by entity
  const breachRows = (results || []).filter(r => r.found).map(r => {
    const collections = (r.sources || []).map(s => s.collection).filter(Boolean);
    const recordCount = (r.sources || []).reduce((sum, s) => sum + (s.records || []).length, 0);
    return {
      entity: r.entity_value,
      type: r.entity_type,
      sources: collections,
      records: recordCount,
    };
  }).sort((a, b) => b.records - a.records);

  // FTI screening rows
  const ftiRows = [];
  for (const fr of (ftiResults || [])) {
    if (!fr.found) continue;
    for (const rec of (fr.results || [])) {
      ftiRows.push({
        name: fr.entity_value,
        source: fr.query_type,
        detail: fr.query_type === 'crimedata' ? crimedataDetailText(rec) : worldcheckDetailText(rec),
      });
    }
  }

  // Financial rows
  const finRows = [];
  for (const fr of (financialResults || [])) {
    if (!fr.found) continue;
    for (const rec of (fr.upi_records || [])) {
      const details = rec.upi_details || {};
      const upiId = details.pa || details.upi_id || 'Unknown';
      const cls = rec.clasification || rec.classification || '';
      const site = rec.site || '';
      finRows.push({ phone: fr.phone, upi: upiId, classification: cls, site });
    }
  }

  // Dark web rows
  const dwRows = [];
  const dwThreads = [];
  for (const dr of (darkmonResults || [])) {
    if (!dr.found) continue;
    const threadCount = (dr.threads || []).length;
    const postCount = (dr.posts || []).length;
    const forum = dr.author_profile?.forum || (dr.threads?.[0]?.forum) || 'Unknown';
    const categories = new Set();
    (dr.threads || []).forEach(t => (t.categories || []).forEach(c => categories.add(c)));
    (dr.posts || []).forEach(p => (p.categories || []).forEach(c => categories.add(c)));

    dwRows.push({
      username: dr.username,
      forum,
      threads: threadCount,
      posts: postCount,
      categories: [...categories],
    });

    for (const t of (dr.threads || []).slice(0, 5)) {
      dwThreads.push({
        title: t.title || t.subject || 'Untitled',
        username: dr.username,
        forum: t.forum || forum,
        subforum: t.subforum || t.board || '',
        date: t.date || t.created_at || '',
        replies: t.reply_count ?? t.replies ?? 0,
      });
    }
  }

  const reportId = generateReportId();
  const timestamp = formatTimestamp();

  // ── Assemble HTML ──────────────────────────────────────

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Intelligence Report — ${esc(subjectName)}</title>
<style>
  @page { size: A4; margin: 20mm 18mm 25mm 18mm; }
  @media print {
    body { padding: 0; }
    .no-print { display: none !important; }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 10px; color: #1a1a2e; line-height: 1.5;
    background: #fff; padding: 40px; max-width: 210mm; margin: 0 auto;
  }
  .report-header {
    display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 2px solid #1a1a2e; padding-bottom: 12px; margin-bottom: 20px;
  }
  .report-header .brand { display: flex; align-items: center; gap: 10px; }
  .report-header .brand svg { height: 28px; width: auto; }
  .report-header .brand-text { font-size: 14px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
  .report-header .meta { text-align: right; font-size: 9px; color: #555; }
  .report-header .meta .classification { font-size: 10px; font-weight: 700; color: #b91c1c; letter-spacing: 1px; text-transform: uppercase; }
  .title-block { margin-bottom: 24px; }
  .title-block h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
  .title-block .subtitle { font-size: 11px; color: #555; }
  .summary-box {
    background: #f8f9fc; border: 1px solid #e2e5f0; border-left: 3px solid #4f46e5;
    padding: 12px 16px; margin-bottom: 24px; border-radius: 2px;
  }
  .summary-box h3 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #4f46e5; margin-bottom: 6px; }
  .summary-box p { font-size: 10.5px; line-height: 1.6; color: #333; }
  .section { margin-bottom: 20px; page-break-inside: avoid; }
  .section-title {
    font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;
    color: #1a1a2e; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 10px;
  }
  .profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
  .profile-item { display: flex; gap: 6px; align-items: baseline; }
  .profile-label { font-size: 9px; font-weight: 600; color: #777; text-transform: uppercase; letter-spacing: 0.5px; min-width: 80px; flex-shrink: 0; }
  .profile-value { font-size: 10px; font-family: 'SF Mono', 'Fira Code', monospace; color: #1a1a2e; word-break: break-all; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5px; margin-top: 6px; }
  th { text-align: left; font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #555; padding: 5px 8px; border-bottom: 1.5px solid #ccc; background: #fafafa; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .badge { display: inline-block; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 2px 6px; border-radius: 2px; white-space: nowrap; }
  .badge-red { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
  .badge-amber { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
  .badge-blue { background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; }
  .badge-green { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
  .badge-gray { background: #f9fafb; color: #374151; border: 1px solid #e5e7eb; }
  .risk-strip { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; padding: 8px 14px; border-radius: 3px; }
  .risk-high { background: #fef2f2; border: 1px solid #fecaca; }
  .risk-medium { background: #fffbeb; border: 1px solid #fde68a; }
  .risk-low { background: #f0fdf4; border: 1px solid #bbf7d0; }
  .risk-strip .risk-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
  .risk-high .risk-label { color: #b91c1c; }
  .risk-medium .risk-label { color: #92400e; }
  .risk-low .risk-label { color: #166534; }
  .risk-strip .risk-reason { font-size: 9.5px; color: #555; }
  .stats-row { display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
  .stat-box { flex: 1; min-width: 100px; background: #fafafa; border: 1px solid #eee; padding: 8px 12px; border-radius: 3px; text-align: center; }
  .stat-box .stat-num { font-size: 18px; font-weight: 700; color: #1a1a2e; font-family: 'SF Mono', monospace; }
  .stat-box .stat-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.5px; color: #777; margin-top: 2px; }
  .report-footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; font-size: 8px; color: #999; }
  .mono { font-family: 'SF Mono', 'Fira Code', monospace; }
  .thread-card { background: #fafafa; border: 1px solid #eee; padding: 8px 10px; border-radius: 3px; margin-bottom: 6px; }
  .thread-card .thread-title { font-size: 10px; font-weight: 600; color: #1a1a2e; }
  .thread-card .thread-meta { font-size: 8.5px; color: #777; margin-top: 2px; }
  .page-break { page-break-before: always; }
  .print-btn {
    position: fixed; top: 16px; right: 16px; z-index: 100;
    background: #4f46e5; color: #fff; border: none; padding: 10px 20px;
    border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;
    font-family: inherit; letter-spacing: 0.5px;
  }
  .print-btn:hover { background: #4338ca; }
</style>
</head>
<body>

<button class="print-btn no-print" onclick="window.print()">Save as PDF</button>

<div class="report-header">
  <div class="brand">
    ${SAPTANG_LOGO_SVG}
    <div>
      <div class="brand-text">Auracle</div>
      <div style="font-size: 7.5px; text-transform: uppercase; letter-spacing: 2px; color: #777; margin-top: -1px;">by Saptang Labs</div>
    </div>
  </div>
  <div class="meta">
    <div class="classification">CONFIDENTIAL</div>
    <div>Report ID: ${esc(reportId)}</div>
    <div>Generated: ${esc(timestamp)}</div>
  </div>
</div>

<div class="title-block">
  <h1>Subject Intelligence Report</h1>
  <div class="subtitle">Automated open-source intelligence compilation from breach, watchlist, financial, and dark web data sources.</div>
</div>

<div class="risk-strip risk-${risk.level}">
  <span class="risk-label">${risk.level === 'high' ? 'High Risk' : risk.level === 'medium' ? 'Medium Risk' : 'Low Risk'}</span>
  <span class="risk-reason">${esc(risk.reason)}</span>
</div>

<div class="summary-box">
  <h3>Executive Summary</h3>
  <p>${esc(summaryText)}</p>
</div>

<div class="stats-row">
  ${statBox(totalSearched, 'Entities Traced')}
  ${statBox(totalFound, 'With Data')}
  ${statBox(sourceCount, 'Breach Sources')}
  ${statBox(totalTime != null ? (totalTime / 1000).toFixed(1) + 's' : '—', 'Search Time')}
</div>`;

  // ── Subject Profile ──
  const profileItems = [
    profileItem('Name', canonical?.canonical ? [canonical.canonical, ...(canonical.alternates || []).slice(0, 2)] : ids.names?.slice(0, 3)),
    profileItem('Location', locString ? [locString] : []),
    profileItem('Emails', ids.emails, 5),
    profileItem('Phones', ids.phones, 5),
    profileItem('Usernames', ids.usernames, 5),
    profileItem('IPs', extras.ips, 5),
    profileItem('DOB', extras.dobs, 2),
    profileItem('Linked Accounts', extras.accounts, 5),
  ].filter(Boolean);

  if (profileItems.length > 0) {
    html += `
<div class="section">
  <div class="section-title">Subject Profile</div>
  <div class="profile-grid">
    ${profileItems.join('\n    ')}
  </div>
</div>`;
  }

  // ── Breach Exposure ──
  if (breachRows.length > 0) {
    const shown = breachRows.slice(0, 15);
    html += `
<div class="section">
  <div class="section-title">Breach Exposure</div>
  <table>
    <thead><tr><th>Entity</th><th>Type</th><th>Breach Sources</th><th>Records</th></tr></thead>
    <tbody>`;
    for (const row of shown) {
      html += `
      <tr>
        <td class="mono">${esc(row.entity)}</td>
        <td>${typeBadge(row.type)}</td>
        <td>${esc(row.sources.join(', '))}</td>
        <td>${row.records}</td>
      </tr>`;
    }
    html += `
    </tbody>
  </table>`;
    if (breachRows.length > 15) {
      html += `\n  <p style="font-size: 8.5px; color: #777; margin-top: 6px; font-style: italic;">Showing top 15 of ${breachRows.length} entities with data. Full breach detail available in platform.</p>`;
    }
    html += `\n</div>`;
  }

  // ── Watchlist Screening ──
  if (ftiRows.length > 0) {
    html += `
<div class="section">
  <div class="section-title">Watchlist &amp; Crime Database Screening</div>
  <table>
    <thead><tr><th>Name Screened</th><th>Source</th><th>Details</th></tr></thead>
    <tbody>`;
    for (const row of ftiRows) {
      const srcBadge = row.source === 'crimedata' ? badge('CrimeData', 'red') : badge('World-Check', 'amber');
      html += `
      <tr>
        <td>${esc(row.name)}</td>
        <td>${srcBadge}</td>
        <td>${esc(row.detail)}</td>
      </tr>`;
    }
    html += `
    </tbody>
  </table>
</div>`;
  }

  // ── Financial Intelligence ──
  if (finRows.length > 0) {
    html += `
<div class="section">
  <div class="section-title">Financial Intelligence</div>
  <table>
    <thead><tr><th>Phone</th><th>Linked UPI ID</th><th>Classification</th><th>Linked Site</th></tr></thead>
    <tbody>`;
    for (const row of finRows) {
      const cls = row.classification.toLowerCase();
      const clsBadge = cls.includes('confirmed') || cls.includes('fraud')
        ? badge(row.classification, 'red')
        : cls.includes('suspect')
          ? badge(row.classification, 'amber')
          : badge(row.classification || 'Unknown', 'gray');
      html += `
      <tr>
        <td class="mono">${esc(row.phone)}</td>
        <td class="mono">${esc(row.upi)}</td>
        <td>${clsBadge}</td>
        <td>${esc(row.site)}</td>
      </tr>`;
    }
    html += `
    </tbody>
  </table>
</div>`;
  }

  // ── Dark Web Activity ──
  if (dwRows.length > 0) {
    html += `
<div class="section">
  <div class="section-title">Dark Web Forum Activity</div>
  <p style="font-size: 9.5px; color: #555; margin-bottom: 8px;">Usernames discovered in breach data were cross-referenced against indexed dark web forum archives.</p>
  <table>
    <thead><tr><th>Username</th><th>Forum</th><th>Threads</th><th>Posts</th><th>Categories</th></tr></thead>
    <tbody>`;
    for (const row of dwRows) {
      const catBadges = row.categories.slice(0, 4).map(c => {
        const cl = c.toLowerCase();
        const color = (cl.includes('card') || cl.includes('fraud') || cl.includes('hack')) ? 'red'
          : (cl.includes('market') || cl.includes('sell')) ? 'amber' : 'gray';
        return badge(c, color);
      }).join(' ');
      html += `
      <tr>
        <td class="mono">${esc(row.username)}</td>
        <td>${esc(row.forum)}</td>
        <td>${row.threads}</td>
        <td>${row.posts}</td>
        <td>${catBadges || '—'}</td>
      </tr>`;
    }
    html += `
    </tbody>
  </table>`;

    if (dwThreads.length > 0) {
      html += `\n  <div style="margin-top: 10px;">`;
      for (const t of dwThreads.slice(0, 8)) {
        const metaParts = [esc(t.username)];
        if (t.forum) metaParts.push(esc(t.forum) + (t.subforum ? '/' + esc(t.subforum) : ''));
        if (t.date) metaParts.push(esc(t.date));
        if (t.replies != null) metaParts.push(`${t.replies} replies`);
        html += `
    <div class="thread-card">
      <div class="thread-title">${esc(t.title)}</div>
      <div class="thread-meta">${metaParts.join(' &bull; ')}</div>
    </div>`;
      }
      html += `\n  </div>`;
    }
    html += `\n</div>`;
  }

  // ── Entity Network Summary ──
  html += `
<div class="section">
  <div class="section-title">Entity Network Summary</div>
  <p style="font-size: 9.5px; color: #555; margin-bottom: 8px;">Relationships between seed identifiers and discovered entities across breach datasets. Network graph available in platform.</p>
  <div class="stats-row">
    ${statBox(ids.emails.length, 'Emails')}
    ${statBox(ids.phones.length, 'Phones')}
    ${statBox(ids.usernames.length, 'Usernames')}
    ${statBox(extras.ips.length, 'IPs')}
    ${statBox(sourceCount, 'Breach Sources')}
  </div>
</div>`;

  // ── Footer ──
  html += `
<div class="report-footer">
  <span>Auracle by Saptang Labs Pvt. Ltd. — For authorized use only. Do not distribute.</span>
  <span>${esc(reportId)}</span>
</div>

</body>
</html>`;

  return html;
}


export function openReport(data) {
  const html = generateReport(data);
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
