import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ModuleShell } from '../ui/kit';
import {
  ClipboardList, BarChart3, MessageSquare, Smile, Trash2, RefreshCw, Send,
  Play, Square, Plus, PlusCircle,
} from 'lucide-react';

const C = { navy: '#012158', blue: '#3485E9', green: '#1f9d57', red: '#e5484d', orange: '#c77700',
  purple: '#7c5cdf', ink: '#16233b', muted: '#8a94a6', line: '#e5e8ec', panel: '#f7f9fc' };
const WRITE_ROLES = ['super_admin', 'hr_manager', 'hr_officer'];
const KINDS = [['scale', 'Scale 1–5'], ['nps', 'Recommend 0–10 (eNPS)'], ['choice', 'Multiple choice'], ['text', 'Free text']];

/* ============================ ROOT ============================ */
export default function EngagementPage() {
  const { user } = useAuth();
  const isHR = WRITE_ROLES.includes(user?.role);
  const [section, setSection] = useState(isHR ? 'surveys' : 'answer');

  const groups = [{
    title: 'Engagement',
    items: [
      ...(isHR ? [
        { key: 'surveys', label: 'Surveys', Icon: ClipboardList },
        { key: 'results', label: 'Results', Icon: BarChart3 },
      ] : []),
      { key: 'answer', label: 'My surveys', Icon: MessageSquare },
    ],
  }];

  return (
    <ModuleShell brand={{ title: 'Engagement', subtitle: 'Listen & act', Icon: Smile }} groups={groups} active={section} onSelect={setSection}>
      <div style={{ padding: '0 30px 48px', minWidth: 0 }}>
        {section === 'surveys' && isHR && <Surveys />}
        {section === 'results' && isHR && <Results />}
        {section === 'answer' && <AnswerSurveys />}
      </div>
    </ModuleShell>
  );
}

/* ============================ shared bits ============================ */
function PageHead({ title, action }) {
  return (
    <section style={{ margin: '0 -30px 22px', background: 'linear-gradient(120deg,#aed9f3 0%,#dff0fa 46%,#eef7fd 100%)', padding: '24px 30px 26px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ fontSize: '1.9rem', fontWeight: 800, color: C.navy }}>{title}</div>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>
    </section>
  );
}
function Card({ title, right, children }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, boxShadow: '0 1px 2px rgba(1,33,88,.05)', marginBottom: 14 }}>
      {(title || right) && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 800, color: C.navy, fontSize: '.92rem' }}>{title}</div>{right}</div>}
      {children}
    </div>
  );
}
function Err({ children }) { return <div style={{ background: '#fdecec', border: '1px solid #f6c9cb', color: C.red, padding: '10px 13px', borderRadius: 9, fontSize: '.85rem', marginBottom: 14 }}>{children}</div>; }
function Ok({ children }) { return <div style={{ background: '#eafaf0', border: '1px solid #bfe6cd', color: '#12703f', padding: '10px 13px', borderRadius: 9, fontSize: '.85rem', marginBottom: 14 }}>{children}</div>; }
const pill = (s) => ({ draft: ['#eef2f8', C.muted], open: ['#eafaf0', C.green], closed: ['#fdecec', C.red] }[s] || ['#eef2f8', C.muted]);
function StatusPill({ status }) { const [bg, col] = pill(status); return <span style={{ fontSize: '.66rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: col, background: bg, borderRadius: 999, padding: '3px 9px' }}>{status}</span>; }
const btn = (bg, fg = '#fff', bd) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', border: bd || 'none', borderRadius: 9, background: bg, color: fg, fontWeight: 700, fontSize: '.82rem', cursor: 'pointer', fontFamily: 'inherit' });
const inp = { width: '100%', padding: '9px 11px', border: `1px solid ${C.line}`, borderRadius: 9, fontSize: '.86rem', fontFamily: 'inherit', color: C.ink, marginBottom: 10, boxSizing: 'border-box' };
const sel = { padding: '7px 9px', border: `1px solid ${C.line}`, borderRadius: 8, fontSize: '.82rem', fontFamily: 'inherit', color: C.ink, background: '#fff' };

function Bars({ data, money }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const palette = [C.blue, C.navy, C.green, C.orange, C.purple];
  return <div>{data.map((d, i) => (
    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <span style={{ width: 90, fontSize: '.76rem', color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.label}>{d.label}</span>
      <div style={{ flex: 1, height: 14, background: '#eef2f8', borderRadius: 5, overflow: 'hidden' }}><div style={{ width: `${(d.value / max) * 100}%`, height: '100%', background: palette[i % palette.length] }} /></div>
      <span style={{ width: 34, textAlign: 'right', fontWeight: 700, color: C.navy, fontSize: '.78rem' }}>{d.value}</span>
    </div>
  ))}</div>;
}

/* ============================ SURVEYS (HR) ============================ */
function Surveys() {
  const [surveys, setSurveys] = useState(null);
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const [creating, setCreating] = useState(false);

  async function load() { setErr(''); try { const { data } = await api.get('/engagement/surveys'); setSurveys(data.surveys || []); } catch (e) { setErr(e?.response?.data?.message || 'Could not load surveys.'); } }
  useEffect(() => { load(); }, []);

  async function setStatus(id, status) { setErr(''); setOk(''); try { await api.patch(`/engagement/surveys/${id}`, { status }); setOk(status === 'open' ? 'Survey opened.' : 'Survey closed.'); load(); } catch (e) { setErr(e?.response?.data?.message || 'Could not update.'); } }
  async function del(id) { setErr(''); setOk(''); try { await api.delete(`/engagement/surveys/${id}`); setOk('Survey deleted.'); load(); } catch (e) { setErr(e?.response?.data?.message || 'Could not delete.'); } }

  return (
    <div>
      <PageHead title="Surveys" action={<button onClick={() => setCreating((v) => !v)} style={btn(creating ? '#fff' : C.navy, creating ? C.navy : '#fff', creating ? `1px solid ${C.navy}` : undefined)}><PlusCircle size={15} /> {creating ? 'Close' : 'New survey'}</button>} />
      {err && <Err>{err}</Err>}{ok && <Ok>{ok}</Ok>}
      {creating && <CreateSurvey onCreated={() => { setCreating(false); setOk('Survey created as a draft.'); load(); }} onError={setErr} />}

      <Card title="All surveys" right={<button onClick={load} style={btn('#fff', C.navy, `1px solid ${C.line}`)}><RefreshCw size={14} /> Refresh</button>}>
        {!surveys ? <div style={{ color: C.muted }}>Loading…</div>
          : surveys.length === 0 ? <div style={{ color: C.muted, fontSize: '.86rem' }}>No surveys yet. Create your first one above.</div>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {surveys.map((s) => (
                  <div key={s._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: C.navy, fontSize: '.9rem' }}>{s.title}</div>
                      <div style={{ fontSize: '.72rem', color: C.muted }}>{s.type} · {s.questions} question(s) · {s.responseCount} response(s){s.anonymous ? ' · anonymous' : ''}</div>
                    </div>
                    <StatusPill status={s.status} />
                    <div style={{ display: 'flex', gap: 6 }}>
                      {s.status === 'draft' && <button onClick={() => setStatus(s._id, 'open')} style={btn(C.green)}><Play size={13} /> Open</button>}
                      {s.status === 'open' && <button onClick={() => setStatus(s._id, 'closed')} style={btn(C.orange)}><Square size={13} /> Close</button>}
                      <button onClick={() => del(s._id)} title="Delete" style={btn('#fff', C.red, `1px solid #f6c9cb`)}><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
      </Card>
    </div>
  );
}

function CreateSurvey({ onCreated, onError }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('pulse');
  const [anonymous, setAnonymous] = useState(true);
  const [scope, setScope] = useState('all');
  const [department, setDepartment] = useState('');
  const [questions, setQuestions] = useState([{ text: '', kind: 'scale', options: [] }]);
  const [busy, setBusy] = useState(false);

  const addQ = () => setQuestions((q) => [...q, { text: '', kind: 'scale', options: [] }]);
  const updQ = (i, patch) => setQuestions((q) => q.map((x, j) => j === i ? { ...x, ...patch } : x));
  const delQ = (i) => setQuestions((q) => q.filter((_, j) => j !== i));

  async function save() {
    setBusy(true);
    try {
      const payload = {
        title, type, anonymous,
        audience: { scope, department: scope === 'department' ? department : '' },
        questions: questions.filter((q) => q.text.trim()).map((q) => ({ text: q.text, kind: q.kind, options: q.kind === 'choice' ? (q.options || []) : [] })),
      };
      await api.post('/engagement/surveys', payload);
      onCreated();
    } catch (e) { onError(e?.response?.data?.message || 'Could not create the survey.'); }
    finally { setBusy(false); }
  }

  return (
    <Card title="New survey">
      <label style={{ fontSize: '.72rem', fontWeight: 700, color: C.muted }}>Title</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Q3 pulse check" style={inp} />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <label style={{ fontSize: '.78rem', color: C.ink }}>Type&nbsp;
          <select value={type} onChange={(e) => setType(e.target.value)} style={sel}><option value="pulse">Pulse</option><option value="enps">eNPS</option><option value="custom">Custom</option></select>
        </label>
        <label style={{ fontSize: '.78rem', color: C.ink }}>Audience&nbsp;
          <select value={scope} onChange={(e) => setScope(e.target.value)} style={sel}><option value="all">Everyone</option><option value="department">One department</option></select>
        </label>
        {scope === 'department' && <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department name" style={{ ...inp, width: 180, marginBottom: 0 }} />}
        <label style={{ fontSize: '.78rem', color: C.ink, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> Anonymous
        </label>
      </div>
      {type === 'enps' && <div style={{ fontSize: '.74rem', color: C.muted, marginBottom: 10 }}>The 0–10 recommend question is added automatically.</div>}

      <div style={{ fontSize: '.72rem', fontWeight: 700, color: C.muted, marginBottom: 6 }}>QUESTIONS</div>
      {questions.map((q, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <input value={q.text} onChange={(e) => updQ(i, { text: e.target.value })} placeholder={`Question ${i + 1}`} style={{ ...inp, flex: '1 1 260px', marginBottom: 0 }} />
          <select value={q.kind} onChange={(e) => updQ(i, { kind: e.target.value })} style={sel}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          {q.kind === 'choice' && <input value={(q.options || []).join(', ')} onChange={(e) => updQ(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })} placeholder="options, comma-separated" style={{ ...inp, flex: '1 1 200px', marginBottom: 0 }} />}
          <button onClick={() => delQ(i)} title="Remove" style={btn('#fff', C.red, `1px solid #f6c9cb`)}><Trash2 size={13} /></button>
        </div>
      ))}
      <button onClick={addQ} style={{ ...btn('#f7fbff', '#0b6fd6', '1px dashed #cfe3fb'), marginBottom: 12 }}><Plus size={14} /> Add question</button>
      <div><button onClick={save} disabled={busy || !title.trim()} style={{ ...btn(C.navy), opacity: busy || !title.trim() ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Create draft'}</button></div>
    </Card>
  );
}

/* ============================ RESULTS (HR) ============================ */
function Results() {
  const [surveys, setSurveys] = useState([]);
  const [sel, setSel] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { (async () => { try { const { data } = await api.get('/engagement/surveys'); setSurveys(data.surveys || []); } catch (e) { setErr('Could not load surveys.'); } })(); }, []);
  useEffect(() => { if (!sel) { setData(null); return; } (async () => { setErr(''); try { const { data } = await api.get(`/engagement/surveys/${sel}/results`); setData(data); } catch (e) { setErr(e?.response?.data?.message || 'Could not load results.'); } })(); }, [sel]);

  return (
    <div>
      <PageHead title="Results" />
      {err && <Err>{err}</Err>}
      <Card>
        <label style={{ fontSize: '.78rem', color: C.ink }}>Survey&nbsp;
          <select value={sel} onChange={(e) => setSel(e.target.value)} style={sel}>
            <option value="">— choose —</option>
            {surveys.map((s) => <option key={s._id} value={s._id}>{s.title} ({s.responseCount})</option>)}
          </select>
        </label>
      </Card>

      {data && (
        <>
          <div style={{ color: C.muted, fontSize: '.82rem', marginBottom: 12 }}>{data.results.responseCount} response(s){data.survey.anonymous ? ' · anonymous' : ''}</div>
          {data.results.questions.map((q) => (
            <Card key={q.questionId} title={q.text}>
              {q.kind === 'nps' ? (
                <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '.64rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase' }}>eNPS</div>
                    <div style={{ fontSize: '2.4rem', fontWeight: 800, color: q.enps == null ? C.muted : (q.enps >= 0 ? C.green : C.red) }}>{q.enps == null ? '—' : q.enps}</div>
                  </div>
                  <Bars data={[{ label: 'Promoters', value: q.promoters }, { label: 'Passives', value: q.passives }, { label: 'Detractors', value: q.detractors }]} />
                </div>
              ) : q.kind === 'scale' ? (
                <div>
                  <div style={{ fontSize: '.82rem', color: C.ink, marginBottom: 8 }}>Average: <strong style={{ color: C.navy }}>{q.average == null ? '—' : q.average}</strong> / 5 · {q.answered} answered</div>
                  <Bars data={q.distribution} />
                </div>
              ) : q.kind === 'choice' ? (
                <Bars data={q.distribution || []} />
              ) : (
                <div style={{ maxHeight: 220, overflow: 'auto' }}>
                  {(q.texts || []).length === 0 ? <div style={{ color: C.muted, fontSize: '.84rem' }}>No answers.</div>
                    : (q.texts || []).map((t, i) => <div key={i} style={{ fontSize: '.84rem', color: C.ink, padding: '6px 0', borderBottom: `1px solid ${C.line}` }}>{t}</div>)}
                </div>
              )}
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

/* ============================ ANSWER (everyone) ============================ */
function AnswerSurveys() {
  const [surveys, setSurveys] = useState(null);
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');

  async function load() { setErr(''); try { const { data } = await api.get('/engagement/me/surveys'); setSurveys(data.surveys || []); } catch (e) { setErr(e?.response?.data?.message || 'Could not load your surveys.'); } }
  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHead title="My surveys" />
      {err && <Err>{err}</Err>}{ok && <Ok>{ok}</Ok>}
      {!surveys ? <div style={{ color: C.muted, padding: 20 }}>Loading…</div>
        : surveys.length === 0 ? <Card><div style={{ color: C.muted, fontSize: '.88rem' }}>Nothing to answer right now.</div></Card>
          : surveys.map((s) => <AnswerCard key={s._id} survey={s} onDone={() => { setOk('Thanks — your response was recorded.'); load(); }} onError={setErr} />)}
    </div>
  );
}

function AnswerCard({ survey, onDone, onError }) {
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (qid, value) => setAnswers((a) => ({ ...a, [qid]: value }));

  async function submit() {
    setBusy(true);
    try {
      const payload = { answers: Object.entries(answers).map(([questionId, value]) => ({ questionId, value })) };
      await api.post(`/engagement/surveys/${survey._id}/respond`, payload);
      onDone();
    } catch (e) { onError(e?.response?.data?.message || 'Could not submit.'); }
    finally { setBusy(false); }
  }

  return (
    <Card title={survey.title}>
      {survey.description && <div style={{ fontSize: '.84rem', color: C.ink, marginBottom: 12 }}>{survey.description}</div>}
      {(survey.questions || []).map((q) => {
        const qid = String(q._id);
        return (
          <div key={qid} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '.86rem', fontWeight: 600, color: C.navy, marginBottom: 8 }}>{q.text}</div>
            {q.kind === 'scale' && <ScaleRow max={5} start={1} value={answers[qid]} onPick={(v) => set(qid, v)} />}
            {q.kind === 'nps' && <ScaleRow max={10} start={0} value={answers[qid]} onPick={(v) => set(qid, v)} />}
            {q.kind === 'choice' && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{(q.options || []).map((o) => (
              <button key={o} onClick={() => set(qid, o)} style={btn(answers[qid] === o ? C.navy : '#fff', answers[qid] === o ? '#fff' : C.navy, `1px solid ${C.navy}`)}>{o}</button>
            ))}</div>}
            {q.kind === 'text' && <textarea value={answers[qid] || ''} onChange={(e) => set(qid, e.target.value)} rows={3} placeholder="Your answer…" style={{ ...inp, resize: 'vertical' }} />}
          </div>
        );
      })}
      <button onClick={submit} disabled={busy} style={{ ...btn(C.navy), opacity: busy ? 0.6 : 1 }}><Send size={15} /> {busy ? 'Submitting…' : 'Submit'}</button>
    </Card>
  );
}

function ScaleRow({ max, start, value, onPick }) {
  const nums = [];
  for (let i = start; i <= max; i++) nums.push(i);
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {nums.map((n) => (
        <button key={n} onClick={() => onPick(n)} style={{ width: 36, height: 36, borderRadius: 9, border: `1px solid ${value === n ? C.navy : C.line}`, background: value === n ? C.navy : '#fff', color: value === n ? '#fff' : C.ink, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{n}</button>
      ))}
    </div>
  );
}
