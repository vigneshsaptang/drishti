import { useState, useEffect, useCallback } from 'react';
import { getFaqEntries, createFaqEntry, updateFaqEntry, deleteFaqEntry } from '../lib/api';

const CATEGORIES = ['getting_started', 'searching', 'engines', 'account', 'troubleshooting'];

function _refresh(setEntries, setLoading) {
  setLoading(true);
  getFaqEntries({ limit: '200' }).then(d => { setEntries(d.entries || []); setLoading(false); }).catch(() => setLoading(false));
}

export default function FaqManager() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: '', category: 'getting_started', content: '', tags: '', order: 0, published: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => _refresh(setEntries, setLoading), []);

  useEffect(() => { refresh(); }, [refresh]);

  const startEdit = (entry) => {
    setEditing(entry.slug);
    setForm({
      title: entry.title || '',
      category: entry.category || 'getting_started',
      content: entry.content || '',
      tags: (entry.tags || []).join(', '),
      order: entry.order || 0,
      published: entry.published ?? false,
    });
    setError('');
  };

  const startNew = () => {
    setEditing('__new__');
    setForm({ title: '', category: 'getting_started', content: '', tags: '', order: 0, published: false });
    setError('');
  };

  const handleSave = async () => {
    if (form.title.length < 5) { setError('Title must be at least 5 characters'); return; }
    if (form.content.length < 10) { setError('Content must be at least 10 characters'); return; }
    setSaving(true);
    setError('');
    const body = {
      ...form,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
    };
    try {
      if (editing === '__new__') {
        await createFaqEntry(body);
      } else {
        await updateFaqEntry(editing, body);
      }
      setEditing(null);
      refresh();
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  const handleDelete = async (slug) => {
    if (!confirm('Delete this FAQ entry?')) return;
    try { await deleteFaqEntry(slug); refresh(); } catch { /* */ }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-sap-text">FAQ Manager</h2>
        <button onClick={startNew} className="bg-sap-accent text-white rounded-lg px-3 py-1.5 text-xs">New Entry</button>
      </div>

      {editing ? (
        <div className="border border-sap-border rounded-lg p-4 space-y-3">
          <div>
            <label className="text-[10px] font-mono text-sap-dim uppercase block mb-1">Title</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full bg-sap-bg border border-sap-border rounded-lg px-3 py-2 text-sm text-sap-text" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono text-sap-dim uppercase block mb-1">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full bg-sap-bg border border-sap-border rounded-lg px-3 py-1.5 text-xs text-sap-text">
                {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-mono text-sap-dim uppercase block mb-1">Order</label>
              <input type="number" value={form.order} onChange={e => setForm(f => ({ ...f, order: parseInt(e.target.value) || 0 }))}
                className="w-full bg-sap-bg border border-sap-border rounded-lg px-3 py-1.5 text-xs text-sap-text" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-mono text-sap-dim uppercase block mb-1">Content (markdown)</label>
            <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={10}
              className="w-full bg-sap-bg border border-sap-border rounded-lg px-3 py-2 text-xs text-sap-text font-mono resize-none" />
          </div>
          <div>
            <label className="text-[10px] font-mono text-sap-dim uppercase block mb-1">Tags (comma-separated)</label>
            <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
              className="w-full bg-sap-bg border border-sap-border rounded-lg px-3 py-2 text-xs text-sap-text" />
          </div>
          <label className="flex items-center gap-2 text-xs text-sap-dim">
            <input type="checkbox" checked={form.published} onChange={e => setForm(f => ({ ...f, published: e.target.checked }))} className="rounded" />
            Published
          </label>
          {error && <p className="text-xs text-entity-drug">{error}</p>}
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="bg-sap-accent text-white rounded-lg px-4 py-1.5 text-xs disabled:opacity-40">
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => setEditing(null)} className="text-xs text-sap-dim hover:text-sap-text">Cancel</button>
          </div>
        </div>
      ) : loading ? (
        <p className="text-xs text-sap-dim text-center py-8">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-sap-dim text-center py-8">No FAQ entries yet</p>
      ) : (
        <div className="border border-sap-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-sap-panel text-sap-dim uppercase tracking-wider text-[10px]">
                <th className="text-left px-3 py-2 font-medium w-12">#</th>
                <th className="text-left px-3 py-2 font-medium">Title</th>
                <th className="text-left px-3 py-2 font-medium">Category</th>
                <th className="text-left px-3 py-2 font-medium w-16">Views</th>
                <th className="text-left px-3 py-2 font-medium w-16">Pub</th>
                <th className="text-left px-3 py-2 font-medium w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.slug} className="border-t border-sap-border hover:bg-sap-bg/50">
                  <td className="px-3 py-2 text-sap-muted">{e.order}</td>
                  <td className="px-3 py-2 text-sap-text">{e.title}</td>
                  <td className="px-3 py-2 text-sap-dim">{e.category?.replace(/_/g, ' ')}</td>
                  <td className="px-3 py-2 text-sap-muted tabular-nums">{e.view_count || 0}</td>
                  <td className="px-3 py-2">{e.published ? <span className="text-emerald-500">Yes</span> : <span className="text-sap-muted">No</span>}</td>
                  <td className="px-3 py-2 flex gap-2">
                    <button onClick={() => startEdit(e)} className="text-sap-accent hover:underline">Edit</button>
                    <button onClick={() => handleDelete(e.slug)} className="text-entity-drug hover:underline">Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
