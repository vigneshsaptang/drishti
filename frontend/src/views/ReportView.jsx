import { useMemo, useState, useEffect } from 'react';
import SubjectProfile from '../components/SubjectProfile';
import FtiScreening from '../components/FtiScreening';
import ErrorBoundary from '../components/ErrorBoundary';
import OverviewTab from '../tabs/OverviewTab';
import { extractIdentifiers } from '../lib/identifierExtract';

const SEVERITY_COLORS = {
  red:   'border-l-sap-danger bg-sap-danger-filled/[0.04]',
  amber: 'border-l-sap-warning-filled bg-sap-warning-filled/[0.04]',
  green: 'border-l-sap-success-filled bg-sap-success-filled/[0.04]',
};
const SEVERITY_TEXT = {
  red:   'text-sap-danger',
  amber: 'text-sap-warning',
  green: 'text-sap-success',
};

// Shared card chrome — Linear-style: 1px hairline border, near-flat shadow.
const CARD_CLS =
  'rounded-lg border border-sap-border-light bg-sap-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden';

function Card({ children, className = '' }) {
  return <div className={`${CARD_CLS} ${className}`}>{children}</div>;
}

function CardHeader({ title, meta, action }) {
  return (
    <div className="px-4 py-2.5 border-b border-sap-border-light flex items-center justify-between gap-3">
      <h3 className="text-12 font-semibold tracking-tight text-sap-text">{title}</h3>
      <div className="flex items-center gap-3 min-w-0">
        {meta && <span className="text-11 text-sap-muted truncate">{meta}</span>}
        {action}
      </div>
    </div>
  );
}

function ViewDetailsLink({ onClick, label = 'View details' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-12 text-sap-dim hover:text-sap-text transition-colors"
    >
      {label}
      <span aria-hidden>→</span>
    </button>
  );
}

function deriveAlerts({ results, ftiResults, ftiMeta, darkmonResults, darkmonMeta, seedType, canonicalTokens }) {
  const alerts = [];

  const ftiSkipped = ftiMeta?.skipped === true;
  const darkmonSkipped = darkmonMeta?.skipped === true;

  const tokens = (canonicalTokens || []).filter(Boolean);
  const matchesCanonical = (r) => {
    if (tokens.length === 0) return true;  // no canonical → fall back to all hits
    const ev = (r.extracted_info || '').toLowerCase();
    if (tokens.every(t => ev.includes(t))) return true;
    const matchedName = (r.matched_name || '').toLowerCase();
    return tokens.every(t => matchedName.includes(t));
  };

  if (!ftiSkipped && ftiResults?.length > 0) {
    const wcHits = ftiResults.filter(r => r.query_type === 'worldcheck' && r.found && matchesCanonical(r));
    const cdHits = ftiResults.filter(r => r.query_type === 'crimedata' && r.found && matchesCanonical(r));

    if (wcHits.length > 0) {
      alerts.push({ severity: 'red', text: `Sanctions/PEP match — ${wcHits.length} watchlist hit${wcHits.length !== 1 ? 's' : ''}` });
    }
    if (cdHits.length > 0) {
      alerts.push({ severity: 'red', text: `Crime database match — ${cdHits.length} hit${cdHits.length !== 1 ? 's' : ''}` });
    }
  }

  if (seedType !== 'fullname' && results?.length > 0) {
    let plaintextCount = 0;
    let infostealerCount = 0;

    for (const entity of results) {
      if (!entity.found) continue;
      for (const src of (entity.sources || [])) {
        const colLower = (src.collection || '').toLowerCase();
        if (colLower.includes('malware_log')) {
          infostealerCount++;
        }
        for (const rec of (src.records || [])) {
          for (const [k, v] of Object.entries(rec.fields || {})) {
            if (/password/i.test(k) && v && typeof v === 'string' && v.length > 0) {
              const isHash = /^[a-f0-9]{32,}$/i.test(v) || /^\$2[aby]\$/.test(v) || /^pbkdf2/.test(v);
              if (!isHash) plaintextCount++;
            }
          }
        }
      }
    }

    if (plaintextCount > 0) {
      alerts.push({ severity: 'amber', text: `Plaintext password exposed in ${plaintextCount} record${plaintextCount !== 1 ? 's' : ''}` });
    }
    if (infostealerCount > 0) {
      alerts.push({ severity: 'amber', text: `Infostealer credentials found in ${infostealerCount} source${infostealerCount !== 1 ? 's' : ''}` });
    }
  }

  if (!darkmonSkipped && darkmonResults?.length > 0) {
    const dmMatches = darkmonResults.filter(r => r.found);
    if (dmMatches.length > 0) {
      alerts.push({ severity: 'amber', text: `Dark web forum activity — ${dmMatches.length} username${dmMatches.length !== 1 ? 's' : ''} with posts` });
    }
  }

  if (!ftiSkipped && ftiMeta && ftiMeta.crimedata_matches === 0 && ftiMeta.worldcheck_matches === 0) {
    alerts.push({ severity: 'green', text: 'No watchlist or sanctions hits' });
  }

  if (!darkmonSkipped && darkmonMeta && darkmonMeta.total_matches === 0) {
    alerts.push({ severity: 'green', text: 'No dark web forum presence detected' });
  }

  return alerts;
}

function AlertsSection({ alerts }) {
  if (alerts.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Alerts" meta={`${alerts.length} signal${alerts.length !== 1 ? 's' : ''}`} />
      <div className="divide-y divide-sap-border-light">
        {alerts.map((a, i) => (
          <div key={i} className={`px-4 py-2.5 border-l-[3px] ${SEVERITY_COLORS[a.severity]}`}>
            <p className={`text-13 font-medium ${SEVERITY_TEXT[a.severity]}`}>{a.text}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

// IP boundary: only riskScore.level, riskScore.composite, and
// riskScore.domains[].{name, level} are rendered. Factor IDs, weights,
// severities, and rationale never reach the browser.
function RiskOverview({ riskScore }) {
  if (!riskScore) return null;

  const verdictStyles = {
    CRITICAL: { pill: 'bg-sap-danger-filled text-white',        accent: 'border-l-sap-danger',          bar: 'bg-sap-danger-filled',  label: 'Critical' },
    HIGH:     { pill: 'bg-sap-warning-filled text-white',       accent: 'border-l-sap-warning-filled',  bar: 'bg-sap-warning-filled', label: 'High' },
    MEDIUM:   { pill: 'bg-sap-warning-soft text-sap-warning',   accent: 'border-l-sap-warning',         bar: 'bg-sap-warning',        label: 'Medium' },
    LOW:      { pill: 'bg-sap-success-soft text-sap-success',   accent: 'border-l-sap-success',         bar: 'bg-sap-success-filled', label: 'Low' },
  };
  const v = verdictStyles[riskScore.level] || verdictStyles.LOW;
  const compositePct = Math.min(100, Math.max(0, (riskScore.composite / 10) * 100));

  // Group domains by their level for compact display
  const domainsByLevel = {};
  for (const d of (riskScore.domains || [])) {
    const lvl = d.level || 'LOW';
    (domainsByLevel[lvl] ||= []).push(d.name);
  }
  const levelOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const levelTone = {
    CRITICAL: { dot: 'bg-sap-danger',          label: 'Critical', text: 'text-sap-danger' },
    HIGH:     { dot: 'bg-sap-warning-filled',  label: 'High',     text: 'text-sap-warning' },
    MEDIUM:   { dot: 'bg-sap-warning-soft border border-sap-warning/40', label: 'Medium', text: 'text-sap-dim' },
    LOW:      { dot: 'bg-sap-success-soft border border-sap-success/40', label: 'Low',    text: 'text-sap-dim' },
  };

  return (
    <Card className={`border-l-[3px] ${v.accent}`}>
      <CardHeader title="Risk verdict" />
      <div className="px-4 py-3.5">
        <div className="flex items-start gap-6">
          {/* Verdict + composite + bar */}
          <div className="flex flex-col gap-2 shrink-0">
            <span className={`inline-flex items-center justify-center px-2.5 h-7 rounded-md text-12 font-semibold tracking-tight w-fit ${v.pill}`}>
              {v.label} risk
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-26 font-semibold tracking-tight tabular-nums text-sap-text">
                {riskScore.composite.toFixed(1)}
              </span>
              <span className="text-12 text-sap-muted">/ 10</span>
            </div>
            <div className="h-1 w-32 rounded-full bg-sap-panel overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${v.bar}`}
                style={{ width: `${compositePct}%` }}
              />
            </div>
          </div>

          {/* Domains grouped by level */}
          {riskScore.domains?.length > 0 && (
            <div className="flex-1 min-w-0 space-y-1.5">
              <span className="text-11 text-sap-muted font-medium block mb-0.5">Risk by domain</span>
              {levelOrder
                .filter(lvl => domainsByLevel[lvl]?.length > 0)
                .map(lvl => {
                  const t = levelTone[lvl];
                  return (
                    <div key={lvl} className="flex items-baseline gap-2">
                      <span className="flex items-center gap-1.5 shrink-0 w-16">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${t.dot}`} />
                        <span className={`text-11 font-semibold tracking-tight ${t.text}`}>{t.label}</span>
                      </span>
                      <span className="text-12 text-sap-dim flex-1 min-w-0">
                        {domainsByLevel[lvl].join(' · ')}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function LinkedIdentifiers({ results, onPivot }) {
  const ids = useMemo(() => extractIdentifiers(results || []), [results]);

  const groups = [
    { type: 'phone',    label: 'phones',    values: ids.phones },
    { type: 'email',    label: 'emails',    values: ids.emails },
    { type: 'username', label: 'usernames', values: ids.usernames },
  ].filter(g => g.values.length > 0);

  if (groups.length === 0) return null;

  const summary = groups.map(g => `${g.values.length} ${g.label}`).join(' · ');

  return (
    <Card>
      <CardHeader title="Linked identifiers" meta={summary} />
      <div className="px-4 py-3 space-y-2.5">
        {groups.map(g => (
          <div key={g.type}>
            <span className="text-11 text-sap-muted font-medium">{g.label}</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {g.values.slice(0, 15).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onPivot(g.type, v)}
                  className="text-12 font-mono px-2 py-0.5 rounded border bg-sap-bg border-sap-border-light text-sap-text hover:bg-sap-surface hover:border-sap-border transition-colors cursor-pointer"
                >
                  {v}
                </button>
              ))}
              {g.values.length > 15 && (
                <span className="text-12 px-2 py-0.5 rounded border bg-sap-bg border-sap-border-light text-sap-muted">
                  +{g.values.length - 15} more
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DarkWebSummary({ darkmonResults, onSwitchView }) {
  const matches = (darkmonResults || []).filter(r => r.found);
  if (matches.length === 0) return null;

  const totalPosts = matches.reduce((s, r) => s + (r.threads?.length || 0) + (r.posts?.length || 0), 0);
  const usernames = matches.map(r => r.username).filter(Boolean);

  return (
    <Card>
      <CardHeader title="Dark web activity" action={<ViewDetailsLink onClick={() => onSwitchView('evidence')} />} />
      <div className="px-4 py-3">
        <p className="text-13 text-sap-dim">
          {totalPosts > 0 ? `${totalPosts} forum post${totalPosts !== 1 ? 's' : ''} found` : 'Activity detected'} for
          {usernames.length === 1 ? ` username "${usernames[0]}"` : ` ${usernames.length} usernames`}
        </p>
      </div>
    </Card>
  );
}

function FinancialSummary({ financialResults, onSwitchView }) {
  const hits = (financialResults || []).filter(r => r.found);
  if (hits.length === 0) return null;

  return (
    <Card>
      <CardHeader title="Financial flags" action={<ViewDetailsLink onClick={() => onSwitchView('tools')} />} />
      <div className="px-4 py-3">
        <p className="text-13 text-sap-dim">
          {hits.length} UPI fraud flag{hits.length !== 1 ? 's' : ''}
        </p>
      </div>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// NeuralLoader — sci-fi-style "subject resolving" indicator
//
// SVG constellation of nodes + connections. Nodes pulse on a stagger; the
// whole network gently floats. As each SSE phase lands, the connections tied
// to that phase brighten — so the "neural network" wires itself up live as
// the search streams in. Unmounts when loading flips to false; the actual
// subject identity then takes its place via SubjectProfile fade-in.
// ───────────────────────────────────────────────────────────────────────────

// Neural layout — generated from a single soma with 8 dendrites that branch
// fractally to depth 3. Deterministic (seeded) so the layout is stable across
// renders. viewBox is 400x150 (~2.67:1) to fill wide screens edge-to-edge.
const NEURAL_VIEWBOX = { w: 400, h: 150 };
const SOMA = { x: 200, y: 75 };

// Deterministic per-index pseudo-random in [0,1).
function _seededRand(i) {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// Asymmetric dendrite directions — hand-picked so it doesn't read as a ring.
const _DENDRITE_ANGLES = [
  -Math.PI * 0.92,
  -Math.PI * 0.62,
  -Math.PI * 0.34,
  -Math.PI * 0.06,
   Math.PI * 0.17,
   Math.PI * 0.43,
   Math.PI * 0.71,
   Math.PI * 0.96,
];

function _buildNeuron() {
  const nodes = [{ ...SOMA, r: 2.6, delay: 0, depth: 0, center: true }];
  const links = [];
  let nextDelay = 80;

  function grow(parentIdx, x, y, angle, length, depthRemaining, seedBase) {
    if (depthRemaining <= 0) return;

    const ex = x + Math.cos(angle) * length;
    const ey = y + Math.sin(angle) * length;
    const idx = nodes.length;
    const curDepth = 4 - depthRemaining; // 1, 2, 3

    nodes.push({
      x: ex, y: ey,
      r: 0.35 + depthRemaining * 0.28,
      delay: nextDelay,
      depth: curDepth,
    });
    nextDelay += 45;

    links.push({
      from: parentIdx,
      to: idx,
      phase: Math.min(curDepth - 1, 3), // depth 1 -> phase 0; depth 2 -> 1; depth 3 -> 2
      depth: curDepth,
    });

    if (depthRemaining > 1) {
      const subCount = 2 + (_seededRand(seedBase * 7) < 0.35 ? 1 : 0); // sometimes 3
      for (let i = 0; i < subCount; i++) {
        const spread = Math.PI / 2.8;
        const jitter = (_seededRand(seedBase * 13 + i * 17) - 0.5) * 0.55;
        const subAngle = angle + ((i - (subCount - 1) / 2) * spread / subCount) + jitter;
        const subLength = length * (0.55 + _seededRand(seedBase * 19 + i) * 0.28);
        grow(idx, ex, ey, subAngle, subLength, depthRemaining - 1, seedBase * 31 + i + 1);
      }
    }
  }

  _DENDRITE_ANGLES.forEach((angle, i) => {
    const jitter = (_seededRand(i * 41) - 0.5) * 0.28;
    const length = 78 + _seededRand(i * 53) * 22; // 78–100 viewBox units
    grow(0, SOMA.x, SOMA.y, angle + jitter, length, 3, i * 101 + 7);
  });

  // Phase 3 → phase 4: lateral cross-links between adjacent terminal tips so
  // the network closes into a mesh during the final phase.
  const terminals = nodes
    .map((n, i) => ({ n, i }))
    .filter(t => t.n.depth === 3)
    .sort((a, b) => Math.atan2(a.n.y - SOMA.y, a.n.x - SOMA.x) - Math.atan2(b.n.y - SOMA.y, b.n.x - SOMA.x));
  for (let i = 0; i < terminals.length; i++) {
    const next = terminals[(i + 2) % terminals.length];
    links.push({ from: terminals[i].i, to: next.i, phase: 4, depth: 4 });
  }

  return { nodes, links };
}

const { nodes: NEURAL_NODES, links: NEURAL_LINKS } = _buildNeuron();

// Convergence timing — kept in sync with the CSS transition durations below
// and with --animate-neural-flare in index.css.
const NEURAL_CONVERGE_MS = 700;

function NeuralLoader({ loading, results, ftiMeta, darkmonMeta, profile, riskScore }) {
  // 'streaming' while data arrives; 'converging' for the exit animation;
  // 'done' returns null. Distinct from `loading` so we control unmount timing.
  const [stage, setStage] = useState(loading ? 'streaming' : 'done');

  // React to the `loading` prop. Two effects split so the converge→done
  // timer in the second effect isn't torn down when the first effect
  // re-runs on stage changes.
  useEffect(() => {
    if (loading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state machine driven by `loading` prop transitions
      setStage('streaming');
    } else {
      // Only transition to converging if we were actually streaming —
      // ignore the initial mount-with-loading-false case.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state machine driven by `loading` prop transitions
      setStage(prev => (prev === 'streaming' ? 'converging' : prev));
    }
  }, [loading]);

  // Owns the converging → done timer. Only this effect controls the timeout,
  // so it isn't accidentally cancelled by transitions in the loading effect.
  useEffect(() => {
    if (stage !== 'converging') return undefined;
    const t = setTimeout(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- terminal of the converge timer
      setStage('done');
    }, NEURAL_CONVERGE_MS);
    return () => clearTimeout(t);
  }, [stage]);

  if (stage === 'done') return null;
  const converging = stage === 'converging';

  const phases = [
    { label: 'Searching breach data',  done: (results?.length || 0) > 0 },
    { label: 'Screening watchlists',   done: !!ftiMeta },
    { label: 'Scanning dark web',      done: !!darkmonMeta },
    { label: 'Building profile',       done: !!profile },
    { label: 'Computing risk',         done: !!riskScore },
  ];
  const doneCount = phases.filter(p => p.done).length;
  const current = phases.find(p => !p.done) || phases[phases.length - 1];
  const pct = Math.round((doneCount / phases.length) * 100);

  // Animatable transitions for SVG attributes — modern browsers support CSS
  // transitions on cx, cy, r, x1/y1/x2/y2, fill-opacity, stroke-opacity.
  const nodeTransition = converging
    ? 'cx 0.7s cubic-bezier(0.4, 0, 0.7, 0.4), cy 0.7s cubic-bezier(0.4, 0, 0.7, 0.4), r 0.7s ease-in, fill-opacity 0.6s ease-in'
    : '';
  const linkTransition = converging
    ? 'x1 0.7s cubic-bezier(0.4, 0, 0.7, 0.4), y1 0.7s cubic-bezier(0.4, 0, 0.7, 0.4), x2 0.7s cubic-bezier(0.4, 0, 0.7, 0.4), y2 0.7s cubic-bezier(0.4, 0, 0.7, 0.4), stroke-opacity 0.5s ease-in'
    : 'stroke-opacity 1.1s ease-out';

  return (
    <Card>
      <div className="relative h-[26rem] overflow-hidden bg-sap-bg">
        {/* Ambient accent glow at centre. Fades during convergence. */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none transition-opacity duration-500"
          style={{
            opacity: converging ? 0 : 1,
            background:
              'radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--color-sap-accent) 12%, transparent), transparent 60%)',
          }}
        />
        {/* Faint dot grid backdrop. Also fades during convergence. */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none transition-opacity duration-500"
          style={{
            opacity: converging ? 0 : 1,
            backgroundImage:
              'radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--color-sap-text) 4%, transparent) 1px, transparent 0)',
            backgroundSize: '22px 22px',
          }}
        />

        {/* The neuron. Full-width SVG (wider viewBox) so it reaches edge to
            edge; floats vertically while streaming, halts during convergence. */}
        <div className="absolute inset-0">
          <svg
            viewBox={`0 0 ${NEURAL_VIEWBOX.w} ${NEURAL_VIEWBOX.h}`}
            preserveAspectRatio="xMidYMid meet"
            className={`w-full h-full ${converging ? '' : 'animate-neural-float'}`}
          >
            {/* Dendrite connections. Stroke width tapers with depth (thick
                near the soma, thin at terminals). Active links carry a
                traveling signal pulse via stroke-dasharray animation. */}
            {NEURAL_LINKS.map((c, i) => {
              const a = NEURAL_NODES[c.from];
              const b = NEURAL_NODES[c.to];
              const active = phases[c.phase]?.done;
              // Depth 1 = thickest; depth 4 (cross-links) = thinnest
              const strokeW = c.depth === 4 ? 0.18 : Math.max(0.18, 0.55 - (c.depth - 1) * 0.13);
              return (
                <line
                  key={`link-${i}`}
                  x1={converging ? SOMA.x : a.x} y1={converging ? SOMA.y : a.y}
                  x2={converging ? SOMA.x : b.x} y2={converging ? SOMA.y : b.y}
                  stroke="var(--color-sap-accent)"
                  strokeWidth={strokeW}
                  strokeOpacity={converging ? 0 : (active ? 0.65 : 0.1)}
                  strokeDasharray={active && !converging ? '1 11' : 'none'}
                  strokeLinecap="round"
                  className={active && !converging ? 'animate-neural-signal' : ''}
                  style={{
                    transition: linkTransition,
                    animationDelay: `${(i % 7) * 170}ms`,
                  }}
                />
              );
            })}

            {/* Sonar rings at the soma — only while streaming. */}
            {!converging && (
              <>
                <circle cx={SOMA.x} cy={SOMA.y} r="3"
                  fill="none" stroke="var(--color-sap-accent)" strokeWidth="0.25"
                  className="animate-neural-ring"
                />
                <circle cx={SOMA.x} cy={SOMA.y} r="3"
                  fill="none" stroke="var(--color-sap-accent)" strokeWidth="0.25"
                  className="animate-neural-ring"
                  style={{ animationDelay: '0.8s' }}
                />
              </>
            )}

            {/* Nodes. Bright only when their depth's phase has fired,
                otherwise dim. Collapse to the soma during convergence. */}
            {NEURAL_NODES.map((n, i) => {
              // Soma is always bright; other nodes light up when the phase
              // that wired up their parent link has completed.
              const fired = n.depth === 0 || phases[Math.min(n.depth - 1, 3)]?.done;
              return (
                <circle
                  key={`node-${i}`}
                  cx={converging ? SOMA.x : n.x}
                  cy={converging ? SOMA.y : n.y}
                  r={converging ? 0.3 : n.r}
                  fill="var(--color-sap-accent)"
                  fillOpacity={converging ? 0 : (n.center ? 1 : (fired ? 0.85 : 0.25))}
                  className={converging ? '' : (fired ? 'animate-neural-blip' : '')}
                  style={{
                    transition: nodeTransition,
                    animationDelay: `${n.delay}ms`,
                  }}
                />
              );
            })}

            {/* Convergence flare at the soma. Bursts outward then dies. */}
            {converging && (
              <circle
                cx={SOMA.x} cy={SOMA.y} r="0"
                fill="var(--color-sap-accent)"
                fillOpacity="0"
                className="animate-neural-flare"
              />
            )}
          </svg>
        </div>

        {/* Phase + progress footer. Fades during convergence. */}
        <div
          className="absolute bottom-0 left-0 right-0 px-4 pt-8 pb-3 transition-opacity duration-300"
          style={{
            opacity: converging ? 0 : 1,
            background: 'linear-gradient(to top, var(--color-sap-bg) 40%, transparent)',
          }}
        >
          <div className="flex items-center gap-2.5 mb-2">
            <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
              <span className="absolute inline-flex h-full w-full rounded-full bg-sap-accent opacity-40 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-sap-accent" />
            </span>
            <p className="text-13 font-medium text-sap-text">
              {current.label}<span className="text-sap-dim">…</span>
            </p>
            <span className="ml-auto text-11 tabular-nums text-sap-muted">
              {doneCount}/{phases.length}
            </span>
          </div>
          <div className="h-1 rounded-full bg-sap-panel overflow-hidden">
            <div
              className="h-full bg-sap-accent rounded-full transition-all duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function ReportView({
  results, data, loading, aiSummary, riskScore, canonical, watchlistFilterTokens,
  profile, canonicalLocation,
  ftiResults, ftiMeta, darkmonResults, darkmonMeta, financialResults,
  onPivot, onFocusEntity, onSwitchTab,
}) {
  const seedType = data?.seed?.type || 'email';

  const alerts = useMemo(
    () => deriveAlerts({ results, ftiResults, ftiMeta, darkmonResults, darkmonMeta, seedType, canonicalTokens: watchlistFilterTokens }),
    [results, ftiResults, ftiMeta, darkmonResults, darkmonMeta, seedType, watchlistFilterTokens],
  );

  const hasBreachData = results?.some(r => r.found && !r.skipped);
  const hasFtiData = ftiResults?.length > 0 || ftiMeta;
  const isTier1 = seedType === 'phone' || seedType === 'email';

  return (
    <div className="animate-fade-in space-y-4">
      {/* Loading state — sci-fi neural-network animation while the SSE
          stream is in flight. Unmounts when loading flips false; the
          subject identity then materialises via SubjectProfile. */}
      <NeuralLoader
        loading={loading}
        results={results}
        ftiMeta={ftiMeta}
        darkmonMeta={darkmonMeta}
        profile={profile}
        riskScore={riskScore}
      />

      {/* A. Subject Header + B. AI Summary — via SubjectProfile */}
      <ErrorBoundary name="SubjectProfile">
        <SubjectProfile
          results={results}
          loading={loading}
          onFocusEntity={onFocusEntity}
          onSwitchTab={onSwitchTab}
          aiSummary={aiSummary}
          canonical={canonical}
          profile={profile}
          canonicalLocation={canonicalLocation}
        />
      </ErrorBoundary>

      {/* Risk verdict — hero panel (composite + level + per-domain) */}
      <RiskOverview riskScore={riskScore} />

      {/* Alerts — action-required signals */}
      <AlertsSection alerts={alerts} />

      {/* Digital Footprint */}
      {hasBreachData && (
        <ErrorBoundary name="DigitalFootprint">
          <OverviewTab data={data} results={results} onPivot={onPivot} ftiResults={ftiResults} />
        </ErrorBoundary>
      )}

      {/* E. Screening Results */}
      {hasFtiData && (
        <ErrorBoundary name="FtiScreening">
          <FtiScreening
            ftiResults={ftiResults}
            ftiMeta={ftiMeta}
            loading={loading}
            canonicalTokens={watchlistFilterTokens}
            canonicalName={canonical?.canonical || null}
          />
        </ErrorBoundary>
      )}

      {/* F. Linked Identifiers */}
      {isTier1 && hasBreachData && (
        <LinkedIdentifiers results={results} onPivot={onPivot} />
      )}

      {/* G. Dark Web Summary */}
      <DarkWebSummary darkmonResults={darkmonResults} onSwitchView={onSwitchTab} />

      {/* H. Financial Summary */}
      <FinancialSummary financialResults={financialResults} onSwitchView={onSwitchTab} />
    </div>
  );
}
