import { useState, useEffect } from 'react';
import EntityBadge from '../components/EntityBadge';
import OnionLink from '../components/OnionLink';
import { searchDread, getDarkwebAuthor, getDarkwebOverview } from '../lib/api';
import { highlightStreetTerms, classifyContent, NLP_CATEGORIES } from '../lib/ontology';

export default function DarkwebTab({ data, onPivot }) {
  const dw = data?.darkweb || {};
  const threads = dw.entity_matches?.threads || [];
  const posts = dw.entity_matches?.posts || [];
  const uMatches = dw.username_matches || [];

  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dreadQuery, setDreadQuery] = useState('');
  const [dreadResults, setDreadResults] = useState(null);
  const [authorQuery, setAuthorQuery] = useState('');
  const [authorResult, setAuthorResult] = useState(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    getDarkwebOverview()
      .then(setOverview)
      .catch(() => setOverview(null))
      .finally(() => setLoading(false));
  }, []);

  const handleDreadSearch = async (e) => {
    e?.preventDefault();
    if (!dreadQuery.trim()) return;
    setSearching(true);
    try { setDreadResults(await searchDread(dreadQuery.trim())); }
    catch { setDreadResults({ threads: [], comments: [] }); }
    setSearching(false);
  };

  const handleAuthorSearch = async (e) => {
    e?.preventDefault();
    if (!authorQuery.trim()) return;
    setSearching(true);
    try { setAuthorResult(await getDarkwebAuthor(authorQuery.trim())); }
    catch { setAuthorResult(null); }
    setSearching(false);
  };

  const actors = overview?.threat_actors || [];
  const recentDread = overview?.recent_dread || [];
  const forums = overview?.forums || [];
  const indiaVendors = overview?.india_vendors || [];
  const topWallets = overview?.top_wallets || [];
  const drugStats = overview?.drug_stats || {};

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Search Forms ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <form onSubmit={handleDreadSearch} className="flex gap-2">
          <input type="text" value={dreadQuery} onChange={e => setDreadQuery(e.target.value)}
            placeholder="Search Dread forums..."
            className="flex-1 bg-sap-panel border border-sap-border rounded-lg px-3 py-2.5 text-sm font-mono text-sap-text outline-none focus:border-entity-darkweb placeholder:text-sap-muted" />
          <button type="submit" disabled={searching}
            className="bg-entity-darkweb/10 hover:bg-entity-darkweb/20 text-entity-darkweb border border-entity-darkweb/30 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40">
            Search Dread
          </button>
        </form>
        <form onSubmit={handleAuthorSearch} className="flex gap-2">
          <input type="text" value={authorQuery} onChange={e => setAuthorQuery(e.target.value)}
            placeholder="Lookup dark web author..."
            className="flex-1 bg-sap-panel border border-sap-border rounded-lg px-3 py-2.5 text-sm font-mono text-sap-text outline-none focus:border-entity-darkweb placeholder:text-sap-muted" />
          <button type="submit" disabled={searching}
            className="bg-entity-darkweb/10 hover:bg-entity-darkweb/20 text-entity-darkweb border border-entity-darkweb/30 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40">
            Lookup Author
          </button>
        </form>
      </div>

      {/* ── Dread search results ── */}
      {dreadResults && (
        <Section title={`Dread Results (${(dreadResults.threads?.length || 0)} threads, ${(dreadResults.comments?.length || 0)} comments)`} color="text-entity-darkweb">
          {(dreadResults.threads || []).map((t, i) => {
            const tags = classifyContent((t.thread_title || '') + ' ' + (t.thread_content || ''));
            return (
              <div key={i} className="bg-sap-panel border border-sap-border rounded-lg px-4 py-3 mb-2">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="px-1.5 py-0.5 bg-entity-darkweb/20 text-entity-darkweb text-[10px] font-mono font-bold rounded uppercase">/{t.subreddit_name}/</span>
                  <span className="font-mono text-sap-dim text-xs">by {t.author_name}</span>
                  {t.total_comments && <span className="text-xs text-sap-dim">{t.total_comments} comments</span>}
                  {tags.map(tag => {
                    const cat = NLP_CATEGORIES.find(c => c.id === tag);
                    return cat ? <span key={tag} className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${cat.color}`}>{cat.label}</span> : null;
                  })}
                </div>
                <p className="text-sm font-medium">{t.thread_title}</p>
                {t.thread_content && <p className="text-sap-dim text-sm mt-1 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: highlightStreetTerms(t.thread_content) }} />}
              </div>
            );
          })}
          {(dreadResults.comments || []).map((c, i) => (
            <div key={i} className="bg-sap-panel border border-sap-border rounded-lg px-4 py-2 mb-2">
              <span className="font-mono text-entity-darkweb text-xs">{c.author_name}</span>
              <p className="text-sap-dim text-sm mt-1 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: highlightStreetTerms(c.comment_content || '') }} />
            </div>
          ))}
        </Section>
      )}

      {/* ── Author lookup result ── */}
      {authorResult?.author_profile && (
        <AuthorCard data={{ username: authorQuery, ...authorResult }} onPivot={onPivot} />
      )}

      {/* ── Search entity matches (if search was done) ── */}
      {(threads.length > 0 || posts.length > 0) && (
        <Section title="Entity Matches in Dark Web Forums" color="text-entity-darkweb">
          {[...threads, ...posts].map((item, i) => <DwItem key={i} item={item} onPivot={onPivot} />)}
        </Section>
      )}
      {uMatches.length > 0 && (
        <Section title="Dark Web Author Profiles" color="text-entity-darkweb">
          {uMatches.map((uh, i) => <AuthorCard key={i} data={uh} onPivot={onPivot} />)}
        </Section>
      )}

      {/* ── Loading state ── */}
      {loading && (
        <div className="flex items-center gap-3 p-6">
          <div className="w-2.5 h-2.5 rounded-full bg-entity-darkweb animate-pulse" />
          <p className="text-sm text-entity-darkweb">Loading dark web intelligence...</p>
        </div>
      )}

      {/* ── Standalone overview (always shows) ── */}
      {!loading && overview && (
        <>
          {/* Row 1: Forums + Threat Actors */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Forum breakdown */}
            {forums.length > 0 && (
              <div className="bg-sap-surface rounded-lg border border-sap-border p-5 shadow-sm">
                <h3 className="text-sm font-bold text-entity-darkweb mb-3">Active Forums</h3>
                <div className="space-y-1.5">
                  {forums.map((f, i) => {
                    const pct = Math.round((f.threads / (forums[0]?.threads || 1)) * 100);
                    return (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="w-28 truncate text-sap-dim text-xs font-mono">{f.name}</span>
                        <div className="flex-1 h-2 bg-sap-panel rounded-full overflow-hidden">
                          <div className="h-full bg-entity-darkweb/50 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-14 text-right text-sap-muted text-xs font-mono">{f.threads.toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Threat actors */}
            {actors.length > 0 && (
              <div className="lg:col-span-2 bg-sap-surface rounded-lg border border-sap-border p-5 shadow-sm">
                <h3 className="text-sm font-bold text-sap-text mb-3">Threat Actors — India Targeted</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-sap-border text-left">
                        <th className="px-3 py-2 text-xs font-semibold text-sap-dim uppercase">Username</th>
                        <th className="px-3 py-2 text-xs font-semibold text-sap-dim uppercase">Forum</th>
                        <th className="px-3 py-2 text-xs font-semibold text-sap-dim uppercase">Posts</th>
                        <th className="px-3 py-2 text-xs font-semibold text-sap-dim uppercase">Active Days</th>
                        <th className="px-3 py-2 text-xs font-semibold text-sap-dim uppercase">Last Post</th>
                      </tr>
                    </thead>
                    <tbody>
                      {actors.map((a, i) => (
                        <tr key={i} className="border-b border-sap-border/50 hover:bg-sap-panel/50 cursor-pointer"
                          onClick={() => { setAuthorQuery(a.username || ''); handleAuthorSearch(); }}>
                          <td className="px-3 py-2.5 font-mono font-semibold text-entity-darkweb">{a.username}</td>
                          <td className="px-3 py-2.5 text-sap-dim text-xs">{a.forum_name}</td>
                          <td className="px-3 py-2.5 font-mono text-xs">{a.no_of_posts}</td>
                          <td className="px-3 py-2.5 font-mono text-xs">{a.no_of_active_days}d</td>
                          <td className="px-3 py-2.5 text-sap-dim text-xs truncate max-w-[200px]">{a.last_post_title || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Row 2: Recent Dread + India Drug Vendors */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recent Dread threads */}
            {recentDread.length > 0 && (
              <div className="bg-sap-surface rounded-lg border border-sap-border p-5 shadow-sm">
                <h3 className="text-sm font-bold text-entity-darkweb mb-3">Recent Dread Threads</h3>
                <div className="space-y-2">
                  {recentDread.map((t, i) => (
                    <div key={i} className="rounded-lg border border-sap-border bg-sap-panel px-3 py-2.5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-1.5 py-0.5 bg-entity-darkweb/15 text-entity-darkweb text-[10px] font-mono font-bold rounded">/{t.subreddit_name}/</span>
                        <span className="text-xs text-sap-muted font-mono">{t.author_name}</span>
                        {t.total_comments && <span className="text-xs text-sap-muted">{t.total_comments} replies</span>}
                      </div>
                      <p className="text-sm text-sap-text font-medium">{t.thread_title}</p>
                      {t.posted_datetime && <p className="text-xs text-sap-muted mt-1">{String(t.posted_datetime).slice(0, 10)}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* India drug vendors */}
            {indiaVendors.length > 0 && (
              <div className="bg-sap-surface rounded-lg border border-entity-drug/20 p-5 shadow-sm">
                <h3 className="text-sm font-bold text-entity-drug mb-3">India-Origin Dark Web Vendors</h3>
                <div className="space-y-2">
                  {indiaVendors.map((d, i) => (
                    <div key={i} className="rounded-lg border border-sap-border bg-sap-panel px-3 py-2.5">
                      <p className="text-sm text-sap-text font-medium truncate">{d.listing_title}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-sap-dim">
                        <span className="text-entity-drug font-semibold">{d.vendor_name}</span>
                        <span>{d.marketplace}</span>
                        <span>{d.shipping_from} → {d.shipping_to}</span>
                      </div>
                      <OnionLink url={d.listing_link} className="mt-1" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Row 3: Crypto wallets */}
          {topWallets.length > 0 && (
            <div className="bg-sap-surface rounded-lg border border-entity-crypto/20 p-5 shadow-sm">
              <h3 className="text-sm font-bold text-entity-crypto mb-3">Notable Dark Web Crypto Wallets</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {topWallets.map((w, i) => (
                  <div key={i} className="rounded-lg border border-sap-border bg-sap-panel p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="px-1.5 py-0.5 bg-entity-crypto/10 text-entity-crypto text-[10px] font-bold rounded">{w.blockchain_type || 'BTC'}</span>
                      <span className="font-mono text-xs text-sap-text truncate">{w.wallet_address?.slice(0, 12)}...</span>
                    </div>
                    <p className="text-lg font-bold font-mono text-entity-crypto">{w.total_volume?.fiat?.amount || '?'} <span className="text-xs text-sap-muted">{w.total_volume?.fiat?.currency_type}</span></p>
                    <p className="text-xs text-sap-muted mt-0.5">{w.transactions_count?.total || '?'} transactions</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, color, children }) {
  return (
    <div>
      <h3 className={`text-sm font-bold ${color} mb-3`}>{title}</h3>
      {children}
    </div>
  );
}

function DwItem({ item, onPivot }) {
  const isThread = item.type === 'thread';
  return (
    <div className="bg-sap-panel border border-sap-border rounded-lg px-4 py-3 mb-2 flex gap-3 items-start hover:border-sap-border-light transition-colors">
      <span className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded uppercase flex-shrink-0 ${isThread ? 'bg-entity-darkweb/20 text-entity-darkweb' : 'bg-sap-accent/20 text-sap-accent'}`}>
        {isThread ? 'thread' : 'post'}
      </span>
      <div className="min-w-0 flex-1">
        {item.title && <p className="text-sm font-medium truncate">{item.title}</p>}
        <div className="flex flex-wrap gap-3 text-xs text-sap-dim font-mono mt-1">
          <span>{item.forum || '?'}</span>
          <span>by {item.author || '?'}</span>
          {item.date && item.date !== 'None' && <span>{String(item.date).slice(0, 10)}</span>}
          {item.views && <span>{item.views} views</span>}
          {item.wallet_balance && item.wallet_balance !== 'None' && item.wallet_balance !== 'null' && (
            <span className="text-entity-crypto">{item.wallet_balance} BTC</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {(item.extracted_emails || []).map(e => <EntityBadge key={e} type="email" value={e} onClick={onPivot} />)}
          {(item.extracted_phones || []).map(p => <EntityBadge key={p} type="phone" value={p} onClick={onPivot} />)}
        </div>
        {(item.extracted_onions || []).length > 0 && (
          <div className="mt-1.5 space-y-1">
            {(item.extracted_onions || []).slice(0, 3).map((o, i) => (
              <OnionLink key={i} url={o} />
            ))}
          </div>
        )}
      </div>
      {item.screenshot && (
        <a href={item.screenshot} target="_blank" rel="noopener" className="text-[10px] text-sap-accent hover:underline flex-shrink-0">Screenshot</a>
      )}
    </div>
  );
}

function AuthorCard({ data: uh, onPivot }) {
  const ap = uh.author_profile || {};
  return (
    <div className="mb-4">
      <div className="bg-sap-surface border border-entity-darkweb/30 rounded-lg p-5 mb-2">
        <div className="flex items-center gap-2 mb-3">
          <span className="px-2 py-0.5 bg-entity-darkweb/15 text-entity-darkweb text-xs font-mono font-bold rounded uppercase">Dark Web Profile</span>
          <span className="font-bold font-mono text-base">{uh.username}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {ap.forum && <Field label="Forum" value={ap.forum} />}
          {ap.total_posts && <Field label="Posts" value={ap.total_posts} />}
          {ap.active_days && <Field label="Active" value={`${ap.active_days} days`} />}
          {ap.last_active && <Field label="Last seen" value={String(ap.last_active).slice(0, 10)} />}
        </div>
        {ap.target_countries?.length > 0 && (
          <p className="text-xs text-sap-dim mt-2">Targets: {ap.target_countries.slice(0, 8).join(', ')}{ap.target_countries.length > 8 ? '...' : ''}</p>
        )}
        {ap.last_post && (
          <p className="text-xs text-sap-muted mt-2 italic border-t border-sap-border pt-2 truncate">Last post: {ap.last_post}</p>
        )}
      </div>
      {(uh.threads || []).slice(0, 5).map((t, i) => <DwItem key={`t${i}`} item={t} onPivot={onPivot} />)}
      {(uh.posts || []).slice(0, 5).map((p, i) => <DwItem key={`p${i}`} item={p} onPivot={onPivot} />)}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs text-sap-muted font-medium">{label}</p>
      <p className="text-sm text-sap-text font-semibold">{value}</p>
    </div>
  );
}
