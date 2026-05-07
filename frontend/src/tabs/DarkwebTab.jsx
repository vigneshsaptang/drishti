import EntityBadge from '../components/EntityBadge';
import OnionLink from '../components/OnionLink';
import { getDarkwebAuthor } from '../lib/api';
import { useState } from 'react';

export default function DarkwebTab({ data, onPivot, darkmonResults = [], darkmonMeta = null }) {
  const dw = data?.darkweb || {};
  const threads = dw.entity_matches?.threads || [];
  const posts = dw.entity_matches?.posts || [];
  const uMatches = dw.username_matches || [];

  const streamedMatches = darkmonResults.filter(r => r.found);

  const [authorQuery, setAuthorQuery] = useState('');
  const [authorResult, setAuthorResult] = useState(null);
  const [searching, setSearching] = useState(false);

  const handleAuthorSearch = async (e) => {
    e?.preventDefault();
    if (!authorQuery.trim()) return;
    setSearching(true);
    try { setAuthorResult(await getDarkwebAuthor(authorQuery.trim())); }
    catch { setAuthorResult(null); }
    setSearching(false);
  };

  const hasSearchData = streamedMatches.length > 0 || threads.length > 0 || posts.length > 0 || uMatches.length > 0;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Author Lookup ── */}
      <form onSubmit={handleAuthorSearch} className="flex gap-2 max-w-lg">
        <input type="text" value={authorQuery} onChange={e => setAuthorQuery(e.target.value)}
          placeholder="Lookup dark web author..."
          className="flex-1 bg-sap-panel border border-sap-border rounded-lg px-3 py-2.5 text-sm font-mono text-sap-text outline-none focus:border-entity-darkweb placeholder:text-sap-muted" />
        <button type="submit" disabled={searching}
          className="bg-entity-darkweb/10 hover:bg-entity-darkweb/20 text-entity-darkweb border border-entity-darkweb/30 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40">
          {searching ? 'Searching...' : 'Lookup Author'}
        </button>
      </form>

      {/* ── Author lookup result ── */}
      {authorResult?.author_profile && (
        <AuthorCard data={{ username: authorQuery, ...authorResult }} onPivot={onPivot} />
      )}

      {/* ── Search-Linked Dark Web Intelligence ── */}
      {(streamedMatches.length > 0 || (darkmonMeta && darkmonResults.length > 0)) && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-entity-darkweb">Search-Linked Dark Web Intelligence</h3>
            {darkmonMeta && (
              <span className="text-xs text-sap-muted font-mono">
                {darkmonMeta.total_matches} match{darkmonMeta.total_matches !== 1 ? 'es' : ''} from {darkmonMeta.total_usernames_searched} username{darkmonMeta.total_usernames_searched !== 1 ? 's' : ''} in {darkmonMeta.total_time_ms}ms
              </span>
            )}
            {!darkmonMeta && darkmonResults.length > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-entity-darkweb animate-pulse" />
                <span className="text-xs text-entity-darkweb font-mono">Scanning dark web forums...</span>
              </div>
            )}
          </div>
          {streamedMatches.length === 0 && darkmonMeta && (
            <p className="text-sm text-sap-muted">No dark web forum activity found for discovered usernames.</p>
          )}
          {streamedMatches.map((uh, i) => (
            <AuthorCard key={`streamed-${i}`} data={uh} onPivot={onPivot} />
          ))}
        </div>
      )}

      {/* ── Search entity matches ── */}
      {(threads.length > 0 || posts.length > 0) && (
        <div>
          <h3 className="text-sm font-bold text-entity-darkweb mb-3">Entity Matches in Dark Web Forums</h3>
          {[...threads, ...posts].map((item, i) => <DwItem key={i} item={item} onPivot={onPivot} />)}
        </div>
      )}
      {uMatches.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-entity-darkweb mb-3">Dark Web Author Profiles</h3>
          {uMatches.map((uh, i) => <AuthorCard key={i} data={uh} onPivot={onPivot} />)}
        </div>
      )}

      {/* ── Empty state ── */}
      {!hasSearchData && !authorResult && !darkmonMeta && darkmonResults.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-sap-muted">Run a search to surface dark web forum activity linked to the subject.</p>
          <p className="text-xs text-sap-dim mt-1">Usernames discovered in breach data are automatically checked against forum databases.</p>
        </div>
      )}
    </div>
  );
}

function DwItem({ item, onPivot }) {
  const isThread = item.type === 'thread';
  const categories = item.categories || [];
  const tags = item.tags || [];
  const urls = item.extracted_urls || [];

  return (
    <div className="bg-sap-panel border border-sap-border rounded-lg px-4 py-3 mb-2 hover:border-entity-darkweb/30 transition-colors">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 px-1.5 py-0.5 text-[10px] font-mono font-bold rounded uppercase flex-shrink-0 ${isThread ? 'bg-entity-darkweb/20 text-entity-darkweb' : 'bg-sap-accent/20 text-sap-accent'}`}>
          {isThread ? 'thread' : 'post'}
        </span>
        <div className="min-w-0 flex-1">
          {item.title && <p className="text-sm font-medium">{item.title}</p>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sap-dim font-mono mt-1">
            {item.forum && <span className="text-entity-darkweb font-semibold">{item.forum}</span>}
            <span>by {item.author || '?'}</span>
            {item.date && item.date !== 'None' && <span>{String(item.date).slice(0, 10)}</span>}
            {item.views != null && <span>{item.views} views</span>}
            {item.replies != null && <span>{item.replies} replies</span>}
            {item.wallet_balance && item.wallet_balance !== 'None' && item.wallet_balance !== 'null' && (
              <span className="text-entity-crypto">{item.wallet_balance} BTC</span>
            )}
          </div>

          {/* Categories + Tags */}
          {(categories.length > 0 || tags.length > 0) && (
            <div className="flex flex-wrap gap-1 mt-2">
              {categories.map((c, i) => (
                <span key={`c${i}`} className="px-1.5 py-0.5 bg-entity-darkweb/10 text-entity-darkweb text-[10px] font-mono rounded">{c}</span>
              ))}
              {tags.map((t, i) => (
                <span key={`t${i}`} className="px-1.5 py-0.5 bg-sap-accent/10 text-sap-accent text-[10px] font-mono rounded">#{t}</span>
              ))}
            </div>
          )}

          {/* Extracted entities */}
          <div className="flex flex-wrap gap-1 mt-2">
            {(item.extracted_emails || []).map(e => <EntityBadge key={e} type="email" value={e} onClick={onPivot} />)}
            {(item.extracted_phones || []).map(p => <EntityBadge key={p} type="phone" value={p} onClick={onPivot} />)}
          </div>

          {/* URLs + onions */}
          {(urls.length > 0 || (item.extracted_onions || []).length > 0) && (
            <div className="mt-2 space-y-0.5">
              {urls.slice(0, 5).map((u, i) => (
                <span key={i} className="block text-[11px] font-mono text-sap-dim">{u}</span>
              ))}
              {(item.extracted_onions || []).slice(0, 3).map((o, i) => (
                <OnionLink key={i} url={o} />
              ))}
            </div>
          )}
        </div>
        {item.screenshot && (
          <a href={item.screenshot} target="_blank" rel="noopener"
            className="text-[10px] text-sap-accent hover:underline flex-shrink-0 border border-sap-border rounded px-2 py-1">
            Screenshot
          </a>
        )}
      </div>
    </div>
  );
}

function AuthorCard({ data: uh, onPivot }) {
  const ap = uh.author_profile || {};
  const breachSources = uh.breach_sources || [];
  const allThreads = uh.threads || [];
  const allPosts = uh.posts || [];
  const totalActivity = allThreads.length + allPosts.length;

  const allForums = [...new Set([
    ...(ap.forum ? [ap.forum] : []),
    ...allThreads.map(t => t.forum).filter(Boolean),
    ...allPosts.map(p => p.forum).filter(Boolean),
  ])];

  const categories = ap.categories || {};
  const categoryEntries = Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <div className="rounded-lg border border-entity-darkweb/25 overflow-hidden">
      {/* Header */}
      <div className="bg-entity-darkweb/5 border-b border-entity-darkweb/15 px-5 py-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-entity-darkweb/20 flex items-center justify-center text-entity-darkweb font-bold font-mono text-sm">
              {(uh.username || '?')[0].toUpperCase()}
            </div>
            <div>
              <span className="font-bold font-mono text-base text-sap-text">{uh.username}</span>
              {allForums.length > 0 && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  {allForums.map(f => (
                    <span key={f} className="px-1.5 py-0.5 bg-entity-darkweb/15 text-entity-darkweb text-[10px] font-mono font-bold rounded">{f}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono">
            {ap.total_posts != null && (
              <div className="text-center">
                <div className="text-lg font-bold text-sap-text">{ap.total_posts}</div>
                <div className="text-sap-muted">posts</div>
              </div>
            )}
            {ap.active_days != null && (
              <div className="text-center">
                <div className="text-lg font-bold text-sap-text">{ap.active_days}</div>
                <div className="text-sap-muted">active days</div>
              </div>
            )}
            {totalActivity > 0 && !ap.total_posts && (
              <div className="text-center">
                <div className="text-lg font-bold text-sap-text">{totalActivity}</div>
                <div className="text-sap-muted">results</div>
              </div>
            )}
          </div>
        </div>

        {/* Breach source attribution */}
        {breachSources.length > 0 && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-sap-muted font-semibold">Found in:</span>
            {breachSources.map((src, i) => (
              <span key={i} className="px-2 py-0.5 bg-sap-panel border border-sap-border rounded text-xs font-mono text-sap-text">{src}</span>
            ))}
          </div>
        )}

        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-sap-dim">
          {ap.last_active && ap.last_active !== 'None' && (
            <span>Last active: <span className="text-sap-text font-mono">{String(ap.last_active).slice(0, 10)}</span></span>
          )}
          {ap.target_countries?.length > 0 && (
            <span>Targets: <span className="text-sap-text">{ap.target_countries.slice(0, 6).join(', ')}{ap.target_countries.length > 6 ? ` +${ap.target_countries.length - 6}` : ''}</span></span>
          )}
          {ap.source && (
            <span className="text-sap-muted">{ap.source === 'author_aggregation' ? 'Aggregated profile' : 'From forum posts'}</span>
          )}
        </div>

        {/* Categories */}
        {categoryEntries.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {categoryEntries.map(([cat, count]) => (
              <span key={cat} className="px-2 py-0.5 bg-entity-darkweb/10 text-entity-darkweb text-[10px] font-mono rounded-full border border-entity-darkweb/15">
                {cat} ({count})
              </span>
            ))}
          </div>
        )}

        {ap.last_post && (
          <p className="text-xs text-sap-muted mt-3 italic truncate">Last post: {ap.last_post}</p>
        )}
      </div>

      {/* Activity feed */}
      {totalActivity > 0 && (
        <div className="p-4 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-sap-muted font-semibold mb-2">Forum Activity ({totalActivity})</p>
          {allThreads.slice(0, 5).map((t, i) => <DwItem key={`t${i}`} item={t} onPivot={onPivot} />)}
          {allPosts.slice(0, 5).map((p, i) => <DwItem key={`p${i}`} item={p} onPivot={onPivot} />)}
        </div>
      )}
    </div>
  );
}
