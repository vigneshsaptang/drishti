import { useState } from 'react';
import EntityBadge from '../components/EntityBadge';
import { searchDread, getDarkwebAuthor } from '../lib/api';
import { highlightStreetTerms, classifyContent, NLP_CATEGORIES } from '../lib/ontology';

export default function DarkwebTab({ data, onPivot }) {
  if (!data) return null;
  const dw = data.darkweb || {};
  const threads = dw.entity_matches?.threads || [];
  const posts = dw.entity_matches?.posts || [];
  const uMatches = dw.username_matches || [];
  const hasContent = threads.length || posts.length || uMatches.length;

  const [dreadQuery, setDreadQuery] = useState('');
  const [dreadResults, setDreadResults] = useState(null);
  const [authorQuery, setAuthorQuery] = useState('');
  const [authorResult, setAuthorResult] = useState(null);
  const [searching, setSearching] = useState(false);

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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Search Forms */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <form onSubmit={handleDreadSearch} className="flex gap-2">
          <input type="text" value={dreadQuery} onChange={e => setDreadQuery(e.target.value)}
            placeholder="Search Dread forums..."
            className="flex-1 bg-sap-panel border border-sap-border rounded px-3 py-2 text-sm font-mono text-sap-text outline-none focus:border-entity-darkweb placeholder:text-sap-muted" />
          <button type="submit" disabled={searching}
            className="bg-entity-darkweb/20 hover:bg-entity-darkweb/30 text-entity-darkweb border border-entity-darkweb/30 px-3 py-2 rounded text-xs font-mono font-semibold transition-colors disabled:opacity-40">
            DREAD
          </button>
        </form>
        <form onSubmit={handleAuthorSearch} className="flex gap-2">
          <input type="text" value={authorQuery} onChange={e => setAuthorQuery(e.target.value)}
            placeholder="Lookup dark web author..."
            className="flex-1 bg-sap-panel border border-sap-border rounded px-3 py-2 text-sm font-mono text-sap-text outline-none focus:border-entity-darkweb placeholder:text-sap-muted" />
          <button type="submit" disabled={searching}
            className="bg-entity-darkweb/20 hover:bg-entity-darkweb/30 text-entity-darkweb border border-entity-darkweb/30 px-3 py-2 rounded text-xs font-mono font-semibold transition-colors disabled:opacity-40">
            AUTHOR
          </button>
        </form>
      </div>

      {/* Dread search results */}
      {dreadResults && (
        <Section title={`Dread Results (${(dreadResults.threads?.length || 0)} threads, ${(dreadResults.comments?.length || 0)} comments)`} color="text-entity-darkweb">
          {(dreadResults.threads || []).map((t, i) => {
            const tags = classifyContent((t.thread_title || '') + ' ' + (t.thread_content || ''));
            return (
              <div key={i} className="bg-sap-panel border border-sap-border rounded px-4 py-3 mb-2 text-xs">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="px-1.5 py-0.5 bg-entity-darkweb/20 text-entity-darkweb text-[9px] font-mono font-bold rounded uppercase">/{t.subreddit_name}/</span>
                  <span className="font-mono text-sap-dim">by {t.author_name}</span>
                  {t.total_comments && <span className="text-sap-dim">{t.total_comments} comments</span>}
                  {tags.map(tag => {
                    const cat = NLP_CATEGORIES.find(c => c.id === tag);
                    return cat ? <span key={tag} className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${cat.color}`}>{cat.label}</span> : null;
                  })}
                </div>
                <p className="text-sm font-medium">{t.thread_title}</p>
                {t.thread_content && <p className="text-sap-dim mt-1 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: highlightStreetTerms(t.thread_content) }} />}
              </div>
            );
          })}
          {(dreadResults.comments || []).map((c, i) => {
            const tags = classifyContent(c.comment_content || '');
            return (
              <div key={i} className="bg-sap-panel border border-sap-border rounded px-4 py-2 mb-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-entity-darkweb">{c.author_name}</span>
                  {tags.map(tag => {
                    const cat = NLP_CATEGORIES.find(ct => ct.id === tag);
                    return cat ? <span key={tag} className={`px-1 py-0 rounded text-[8px] font-bold ${cat.color}`}>{cat.label}</span> : null;
                  })}
                </div>
                <p className="text-sap-dim mt-1 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: highlightStreetTerms(c.comment_content || '') }} />
              </div>
            );
          })}
        </Section>
      )}

      {/* Author lookup result */}
      {authorResult?.author_profile && (
        <AuthorMatch data={{ username: authorQuery, ...authorResult }} onPivot={onPivot} />
      )}

      {/* Entity matches from search */}
      {(threads.length > 0 || posts.length > 0) && (
        <Section title="Entity Matches in Dark Web Forums" color="text-entity-darkweb">
          {[...threads, ...posts].map((item, i) => <DwItem key={i} item={item} onPivot={onPivot} />)}
        </Section>
      )}
      {uMatches.length > 0 && (
        <Section title="Dark Web Author Profiles" color="text-entity-darkweb">
          {uMatches.map((uh, i) => <AuthorMatch key={i} data={uh} onPivot={onPivot} />)}
        </Section>
      )}
    </div>
  );
}

function Section({ title, color, children }) {
  return (
    <div>
      <h3 className={`text-xs font-mono tracking-[3px] uppercase ${color} mb-3`}>{title}</h3>
      {children}
    </div>
  );
}

function DwItem({ item, onPivot }) {
  const isThread = item.type === 'thread';
  return (
    <div className="bg-sap-panel border border-sap-border rounded px-4 py-3 mb-2 flex gap-3 items-start hover:border-sap-border-light transition-colors">
      <span className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded uppercase flex-shrink-0 ${isThread ? 'bg-entity-darkweb/20 text-entity-darkweb' : 'bg-sap-accent/20 text-sap-accent'}`}>
        {isThread ? 'thread' : 'post'}
      </span>
      <div className="min-w-0 flex-1">
        {item.title && <p className="text-sm font-medium truncate">{item.title}</p>}
        <div className="flex flex-wrap gap-3 text-[11px] text-sap-dim font-mono mt-1">
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
          {(item.extracted_onions || []).slice(0, 2).map((o, i) => (
            <span key={i} className="text-[10px] text-entity-drug font-mono">{String(o).slice(0, 35)}...</span>
          ))}
        </div>
      </div>
      {item.screenshot && (
        <a href={item.screenshot} target="_blank" rel="noopener" className="text-[10px] text-sap-accent hover:underline flex-shrink-0">Screenshot</a>
      )}
    </div>
  );
}

function AuthorMatch({ data: uh, onPivot }) {
  const ap = uh.author_profile || {};
  return (
    <div className="mb-4">
      <div className="bg-sap-surface border border-entity-darkweb/30 rounded-lg p-4 mb-2">
        <div className="flex items-center gap-2 mb-3">
          <span className="px-2 py-0.5 bg-entity-darkweb/20 text-entity-darkweb text-[10px] font-mono font-bold rounded uppercase">dark web profile</span>
          <span className="font-semibold font-mono">{uh.username}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono">
          {ap.forum && <Field label="Forum" value={ap.forum} />}
          {ap.total_posts && <Field label="Posts" value={ap.total_posts} />}
          {ap.active_days && <Field label="Active" value={`${ap.active_days} days`} />}
          {ap.last_active && <Field label="Last seen" value={String(ap.last_active).slice(0, 10)} />}
        </div>
        {ap.target_countries?.length > 0 && (
          <div className="mt-2 text-[11px] text-sap-dim">
            Targets: {ap.target_countries.slice(0, 8).join(', ')}{ap.target_countries.length > 8 ? '...' : ''}
          </div>
        )}
      </div>
      {(uh.threads || []).slice(0, 5).map((t, i) => <DwItem key={`t${i}`} item={t} onPivot={onPivot} />)}
      {(uh.posts || []).slice(0, 5).map((p, i) => <DwItem key={`p${i}`} item={p} onPivot={onPivot} />)}
    </div>
  );
}

function Field({ label, value }) {
  return <div><span className="text-sap-dim">{label}:</span> <span className="text-sap-text">{value}</span></div>;
}
