import { useState, useEffect, useCallback, useRef } from 'react';
import { submitTicket, uploadAttachment, getSupportConfig, getFaqSuggestions } from '../lib/api';

const FEEDBACK_CATEGORIES = [
  { value: 'bug_report', label: 'Bug Report', icon: '!' },
  { value: 'feature_request', label: 'Feature', icon: '+' },
  { value: 'general_feedback', label: 'Feedback', icon: '\u2606' },
  { value: 'question', label: 'Question', icon: '?' },
];

const SUPPORT_CATEGORIES = [
  { value: 'cant_search', label: "Can't Search" },
  { value: 'wrong_results', label: 'Wrong Results' },
  { value: 'access_denied', label: 'Access Denied' },
  { value: 'performance', label: 'Performance' },
  { value: 'other', label: 'Other' },
];

const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const URGENCIES = ['urgent', 'high', 'normal', 'low'];

const SEV_COLORS = { critical: 'bg-red-600', high: 'bg-orange-500', medium: 'bg-amber-500', low: 'bg-gray-400' };
const URG_COLORS = { urgent: 'bg-entity-drug', high: 'bg-entity-breach', normal: 'bg-entity-phone', low: 'bg-sap-muted' };

export default function FeedbackModal({ isOpen, onClose, activeTab: appTab, onOpenTickets }) {
  const [tab, setTab] = useState('feedback');
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [urgency, setUrgency] = useState('normal');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState('');
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const [error, setError] = useState('');
  const [config, setConfig] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showContext, setShowContext] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    getSupportConfig().then(setConfig).catch(() => {});
    // Reset form state — these are synchronous resets intentionally placed
    // in an effect guarded by isOpen to clear the form when the modal opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubmitted(null); setError(''); setCategory(''); setSubject(''); setDescription(''); setSteps(''); setFiles([]);
  }, [isOpen]);

  const handleFileAdd = useCallback(async (fileList) => {
    if (!config) return;
    const maxFiles = config.max_attachments || 3;
    const maxSize = config.max_attachment_size_bytes || 5 * 1024 * 1024;
    const newFiles = Array.from(fileList).slice(0, maxFiles - files.length);

    for (const f of newFiles) {
      if (f.size > maxSize) {
        setError(`File ${f.name} exceeds ${Math.round(maxSize / 1024 / 1024)} MB limit`);
        return;
      }
    }

    setUploading(true);
    setError('');
    const uploaded = [];
    for (const f of newFiles) {
      try {
        const result = await uploadAttachment(f);
        uploaded.push({ ...result, localName: f.name });
      } catch (e) {
        setError(e.message);
        break;
      }
    }
    setFiles(prev => [...prev, ...uploaded]);
    setUploading(false);
  }, [config, files.length]);

  const removeFile = useCallback((idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSubjectChange = useCallback((val) => {
    setSubject(val);
    if (tab === 'support' && val.length >= 3) {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        getFaqSuggestions(val).then(d => setSuggestions(d.suggestions || [])).catch(() => {});
      }, 500);
    } else {
      setSuggestions([]);
    }
  }, [tab]);

  const handleSubmit = useCallback(async () => {
    setError('');
    if (!category) { setError('Please select a category'); return; }
    if (subject.length < 5) { setError('Subject must be at least 5 characters'); return; }
    if (description.length < 10) { setError('Description must be at least 10 characters'); return; }

    const context = {
      current_page: appTab || 'unknown',
      browser: navigator.userAgent.split(' ').slice(-2).join(' '),
      screen_resolution: `${screen.width}x${screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      session_duration_s: Math.floor(performance.now() / 1000),
      user_agent_raw: navigator.userAgent,
    };

    const body = {
      type: tab,
      category,
      subject: subject.trim(),
      description: description.trim(),
      context,
      attachment_ids: files.map(f => f.file_id),
    };
    if (tab === 'feedback' && category === 'bug_report') body.severity = severity;
    if (tab === 'support') body.urgency = urgency;
    if (steps.trim()) body.steps_to_reproduce = steps.trim();

    setSubmitting(true);
    try {
      const result = await submitTicket(body);
      setSubmitted(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }, [tab, category, severity, urgency, subject, description, steps, files, appTab]);

  if (!isOpen) return null;

  const remaining = config?.remaining_submissions_today ?? 10;
  const canSubmit = category && subject.length >= 5 && description.length >= 10 && !submitting && remaining > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-sap-surface rounded-xl border border-sap-border shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-sap-border shrink-0">
          <h2 className="text-sm font-bold text-sap-text">{submitted ? 'Submitted' : tab === 'feedback' ? 'Send Feedback' : 'Request Support'}</h2>
          <button onClick={onClose} className="text-sap-dim hover:text-sap-text p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {submitted ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <p className="text-sm font-medium text-sap-text">Feedback received</p>
            <p className="font-mono text-xs text-sap-muted">{submitted.ticket_id}</p>
            <p className="text-xs text-sap-dim">{submitted.message}</p>
            <div className="flex gap-2 justify-center pt-2">
              {onOpenTickets && (
                <button onClick={() => { onClose(); onOpenTickets(); }} className="text-xs text-sap-accent hover:underline">View my tickets</button>
              )}
              <button onClick={onClose} className="text-xs text-sap-dim hover:text-sap-text">Close</button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Tab toggle */}
            <div className="flex rounded-lg bg-sap-panel p-0.5">
              {['feedback', 'support'].map(t => (
                <button key={t} onClick={() => { setTab(t); setCategory(''); setSuggestions([]); }}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === t ? 'bg-sap-accent text-white' : 'text-sap-dim hover:text-sap-text'}`}>
                  {t === 'feedback' ? 'Feedback' : 'Support'}
                </button>
              ))}
            </div>

            {/* Category */}
            <div>
              <label className="text-[10px] font-mono text-sap-dim uppercase tracking-widest mb-1.5 block">Category</label>
              <div className={`grid gap-1.5 ${tab === 'feedback' ? 'grid-cols-4' : 'grid-cols-3'}`}>
                {(tab === 'feedback' ? FEEDBACK_CATEGORIES : SUPPORT_CATEGORIES).map(c => (
                  <button key={c.value} onClick={() => setCategory(c.value)}
                    className={`px-2 py-2 rounded-lg text-xs border transition-colors ${category === c.value
                      ? 'bg-sap-accent/10 border-sap-accent/30 text-sap-accent'
                      : 'bg-sap-bg border-sap-border text-sap-dim hover:border-sap-border'}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Severity (bug reports only) */}
            {tab === 'feedback' && category === 'bug_report' && (
              <div>
                <label className="text-[10px] font-mono text-sap-dim uppercase tracking-widest mb-1.5 block">Severity</label>
                <div className="flex gap-1.5">
                  {SEVERITIES.map(s => (
                    <button key={s} onClick={() => setSeverity(s)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${severity === s
                        ? 'bg-sap-accent/10 border-sap-accent/30 text-sap-accent'
                        : 'bg-sap-bg border-sap-border text-sap-dim'}`}>
                      <span className={`w-2 h-2 rounded-full ${SEV_COLORS[s]}`} />
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Urgency (support only) */}
            {tab === 'support' && (
              <div>
                <label className="text-[10px] font-mono text-sap-dim uppercase tracking-widest mb-1.5 block">Urgency</label>
                <div className="flex gap-1.5">
                  {URGENCIES.map(u => (
                    <button key={u} onClick={() => setUrgency(u)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${urgency === u
                        ? 'bg-sap-accent/10 border-sap-accent/30 text-sap-accent'
                        : 'bg-sap-bg border-sap-border text-sap-dim'}`}>
                      <span className={`w-2 h-2 rounded-full ${URG_COLORS[u]}`} />
                      {u.charAt(0).toUpperCase() + u.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Subject */}
            <div>
              <label className="text-[10px] font-mono text-sap-dim uppercase tracking-widest mb-1.5 block">Subject</label>
              <input value={subject} onChange={e => handleSubjectChange(e.target.value)} maxLength={200}
                className="w-full bg-sap-bg border border-sap-border rounded-lg px-3 py-2 text-sm text-sap-text placeholder:text-sap-dim/50"
                placeholder="Brief summary of the issue or suggestion" />
              <div className="text-right text-[10px] text-sap-muted mt-0.5">{subject.length}/200</div>
            </div>

            {/* FAQ suggestions */}
            {suggestions.length > 0 && (
              <div className="rounded-lg border border-sap-accent/20 bg-sap-accent/5 p-3">
                <p className="text-[10px] font-mono text-sap-accent uppercase mb-1.5">Related help articles</p>
                {suggestions.map(s => (
                  <p key={s.slug} className="text-xs text-sap-accent hover:underline cursor-pointer py-0.5">{s.title}</p>
                ))}
              </div>
            )}

            {/* Description */}
            <div>
              <label className="text-[10px] font-mono text-sap-dim uppercase tracking-widest mb-1.5 block">Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5} maxLength={5000}
                className="w-full bg-sap-bg border border-sap-border rounded-lg px-3 py-2 text-sm text-sap-text placeholder:text-sap-dim/50 resize-none"
                placeholder="Describe the issue or suggestion in detail..." />
              <div className="text-right text-[10px] text-sap-muted mt-0.5">{description.length}/5000</div>
            </div>

            {/* Steps (support only, certain categories) */}
            {tab === 'support' && ['cant_search', 'wrong_results', 'performance'].includes(category) && (
              <div>
                <label className="text-[10px] font-mono text-sap-dim uppercase tracking-widest mb-1.5 block">Steps to Reproduce (optional)</label>
                <textarea value={steps} onChange={e => setSteps(e.target.value)} rows={3} maxLength={3000}
                  className="w-full bg-sap-bg border border-sap-border rounded-lg px-3 py-2 text-sm text-sap-text placeholder:text-sap-dim/50 resize-none"
                  placeholder={"1. Go to...\n2. Click on...\n3. Observe..."} />
              </div>
            )}

            {/* File upload */}
            <div>
              <label className="text-[10px] font-mono text-sap-dim uppercase tracking-widest mb-1.5 block">Screenshots (optional)</label>
              {files.length < (config?.max_attachments || 3) && (
                <label className="block border border-dashed border-sap-border rounded-lg p-4 text-center cursor-pointer hover:border-sap-accent/40 transition-colors">
                  <input type="file" accept="image/*" multiple className="hidden"
                    onChange={e => handleFileAdd(e.target.files)} />
                  <p className="text-xs text-sap-dim">{uploading ? 'Uploading...' : 'Drag & drop screenshots or click to browse'}</p>
                </label>
              )}
              {files.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {files.map((f, i) => (
                    <div key={f.file_id} className="relative bg-sap-bg border border-sap-border rounded px-2 py-1 text-xs text-sap-dim flex items-center gap-1">
                      {f.localName || f.filename}
                      <button onClick={() => removeFile(i)} className="text-sap-muted hover:text-entity-drug ml-1">&times;</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Context disclosure */}
            <div>
              <button onClick={() => setShowContext(!showContext)} className="text-[10px] text-sap-muted hover:text-sap-dim flex items-center gap-1">
                <svg className={`w-3 h-3 transition-transform ${showContext ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                Technical details (auto-attached)
              </button>
              {showContext && (
                <div className="mt-1 p-2 rounded bg-sap-bg border border-sap-border text-[10px] font-mono text-sap-muted space-y-0.5">
                  <p>Page: {appTab || 'unknown'}</p>
                  <p>Screen: {typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : 'N/A'}</p>
                  <p>Viewport: {typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'N/A'}</p>
                  <p className="text-[9px] mt-1 text-sap-dim/60">This information helps us diagnose your issue.</p>
                </div>
              )}
            </div>

            {error && <p className="text-xs text-entity-drug">{error}</p>}

            {/* Submit */}
            <button onClick={handleSubmit} disabled={!canSubmit}
              className="w-full bg-sap-accent text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40 transition-opacity">
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
            {remaining <= 3 && remaining > 0 && (
              <p className="text-[10px] text-sap-muted text-center">{remaining} submissions remaining today</p>
            )}
            {remaining <= 0 && (
              <p className="text-[10px] text-entity-drug text-center">Daily submission limit reached. Try again tomorrow.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
