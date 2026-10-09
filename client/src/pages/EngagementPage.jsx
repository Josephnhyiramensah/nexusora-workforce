import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  ModuleShell, Hero, KpiBand, Kpi, Body, Card, TableWrap, StatusPill, Pill,
  HeroBtn, Overlay, Field, Sel, Empty, ErrBox, Banner, Lbl,
} from '../ui/kit';
import { C, NUM, cap, rowStyle, td, primaryBtn, ghostBtn } from '../ui/tokens';
import {
  Smile, ClipboardList, BarChart3, MessageSquare, Plus, Trash2, Play, Square,
  Send, RefreshCw, Users, PieChart, Inbox,
} from 'lucide-react';

const WRITE_ROLES = ['super_admin', 'hr_manager', 'hr_officer'];
const KINDS = [['scale', 'Scale 1–5'], ['nps', 'Recommend 0–10 (eNPS)'], ['choice', 'Multiple choice'], ['text', 'Free text']];
const STATUS_MAP = { draft: ['Draft', 'grey'], open: ['Open', 'green'], closed: ['Closed', 'red'] };
const TYPE_LABEL = { pulse: 'Pulse', enps: 'eNPS', custom: 'Custom' };

/* ================================ ROOT ================================ */
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
      {section === 'surveys' && isHR && <Surveys />}
      {section === 'results' && isHR && <Results />}
      {section === 'answer' && <AnswerSurveys />}
    </ModuleShell>
  );
}

/* small distribution bar row, consistent with the kit */
function Bars({ data }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const palette = [C.accentInk, C.navy, '#1f9d57', '#c77700', '#7c5cdf'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 96, fontSize: '.8rem', color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.label}>{d.label}</span>
          <div style={{ flex: 1, height: 16, background: '#eef2f8', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: `${(d.value / max) * 100}%`, height: '100%', background: palette[i % palette.length], borderRadius: 6 }} />
          </div>
          <span style={{ ...NUM, width: 40, textAlign: 'right', fontWeight: 700, color: C.navy, fontSize: '.82rem' }}>{d.value}</span>
        </div>
      ))}
    </div>
  );
}

/* =============================== SURVEYS =============================== */
function Surveys() {
  const [surveys, setSurveys] = useState(null);
  const [err, setErr] = useState('');
  const [banner, setBanner] = useState('');
  const [modal, setModal] = useState(false);

  async function load() { setErr(''); try { const { data } = await api.get('/engagement/surveys'); setSurveys(data.surveys || []); } catch (e) { setErr(e?.response?.data?.message || 'Could not load surveys.'); } }
  useEffect(() => { load(); }, []);

  async function setStatus(id, status) { setErr(''); try { await api.patch(`/engagement/surveys/${id}`, { status }); setBanner(status === 'open' ? 'Survey opened for responses.' : 'Survey closed.'); load(); } catch (e) { setErr(e?.response?.data?.message || 'Could not update the survey.'); } }
  async function del(id) { setErr(''); try { await api.delete(`/engagement/surveys/${id}`); setBanner('Survey deleted.'); load(); } catch (e) { setErr(e?.response?.data?.message || 'Could not delete the survey.'); } }

  const total = surveys?.length || 0;
  const open = (surveys || []).filter((s) => s.status === 'open').length;
  const drafts = (surveys || []).filter((s) => s.status === 'draft').length;
  const responses = (surveys || []).reduce((n, s) => n + (s.responseCount || 0), 0);

  return (
    <>
      <Hero crumbs={['Engagement', 'Surveys']} title="Surveys"
        actions={<HeroBtn Icon={Plus} onClick={() => setModal(true)}>New survey</HeroBtn>} />
      <KpiBand>
        <Kpi Icon={ClipboardList} label="Surveys" value={total} />
        <Kpi Icon={Play} iconBg="#e7f7ee" iconColor="#1f9d57" label="Open" value={open} />
        <Kpi Icon={Square} iconBg="#f2f4f8" iconColor={C.muted} label="Drafts" value={drafts} />
        <Kpi Icon={Inbox} iconBg="#eaf2ff" iconColor={C.accentInk} label="Responses" value={responses} />
      </KpiBand>
      <Body>
        {banner && <Banner tone="green" onClose={() => setBanner('')}>{banner}</Banner>}
        {err && <ErrBox>{err}</ErrBox>}
        <Card title="All surveys" right={<HeroBtn ghost Icon={RefreshCw} onClick={load}>Refresh</HeroBtn>}>
          {!surveys ? <Empty>Loading…</Empty>
            : surveys.length === 0 ? <Empty>No surveys yet. Create your first one with “New survey”.</Empty>
              : (
                <TableWrap head={[['Survey'], ['Type'], ['Audience'], ['Responses', 'r'], ['Status'], ['', 'r']]}>
                  {surveys.map((s) => (
                    <tr key={s._id} style={rowStyle}>
                      <td style={td}><div style={{ fontWeight: 700, color: C.navy }}>{s.title}</div><div style={{ fontSize: '.74rem', color: C.muted2 }}>{s.questions} question(s){s.anonymous ? ' · anonymous' : ''}</div></td>
                      <td style={td}><Pill tone={s.type === 'enps' ? 'blue' : 'grey'}>{TYPE_LABEL[s.type] || cap(s.type)}</Pill></td>
                      <td style={td}>{s.audience?.scope === 'department' ? (s.audience.department || 'Department') : 'Everyone'}</td>
                      <td style={{ ...td, textAlign: 'right', ...NUM, fontWeight: 700 }}>{s.responseCount}</td>
                      <td style={td}><StatusPill map={STATUS_MAP} k={s.status} /></td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          {s.status === 'draft' && <button onClick={() => setStatus(s._id, 'open')} style={miniBtn('#1f9d57')}><Play size={13} /> Open</button>}
                          {s.status === 'open' && <button onClick={() => setStatus(s._id, 'closed')} style={miniBtn('#c77700')}><Square size={13} /> Close</button>}
                          <button onClick={() => del(s._id)} title="Delete" style={miniBtn(C.red, true)}><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </TableWrap>
              )}
        </Card>
      </Body>
      {modal && <CreateSurvey onClose={() => setModal(false)} onCreated={() => { setModal(false); setBanner('Survey created as a draft.'); load(); }} />}
    </>
  );
}

const miniBtn = (color, outline) => ({ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, fontSize: '.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: outline ? `1px solid #f6c9cb` : 'none', background: outline ? '#fff' : color, color: outline ? color : '#fff' });

function CreateSurvey({ onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('pulse');
  const [anonymous, setAnonymous] = useState(true);
  const [scope, setScope] = useState('all');
  const [department, setDepartment] = useState('');
  const [questions, setQuestions] = useState([{ text: '', kind: 'scale', options: [] }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const addQ = () => setQuestions((q) => [...q, { text: '', kind: 'scale', options: [] }]);
  const updQ = (i, patch) => setQuestions((q) => q.map((x, j) => j === i ? { ...x, ...patch } : x));
  const delQ = (i) => setQuestions((q) => q.filter((_, j) => j !== i));

  async function save() {
    if (!title.trim()) { setErr('A survey title is required.'); return; }
    setBusy(true); setErr('');
    try {
      await api.post('/engagement/surveys', {
        title, type, anonymous,
        audience: { scope, department: scope === 'department' ? department : '' },
        questions: questions.filter((q) => q.text.trim()).map((q) => ({ text: q.text, kind: q.kind, options: q.kind === 'choice' ? (q.options || []) : [] })),
      });
      onCreated();
    } catch (e) { setErr(e?.response?.data?.message || 'Could not create the survey.'); setBusy(false); }
  }

  return (
    <Overlay onClose={onClose} title="New survey" width={640}>
      {err && <ErrBox>{err}</ErrBox>}
      <Field label="Title" value={title} onChange={setTitle} placeholder="e.g. Q3 pulse check" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Sel label="Type" value={type} onChange={setType} options={[['pulse', 'Pulse'], ['enps', 'eNPS'], ['custom', 'Custom']]} />
        <Sel label="Audience" value={scope} onChange={setScope} options={[['all', 'Everyone'], ['department', 'One department']]} />
      </div>
      {scope === 'department' && <Field label="Department" value={department} onChange={setDepartment} placeholder="Department name" />}
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '.85rem', color: C.ink, margin: '2px 0 14px' }}>
        <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> Anonymous responses
      </label>
      {type === 'enps' && <div style={{ fontSize: '.78rem', color: C.muted2, marginBottom: 12 }}>The 0–10 recommend question is added automatically.</div>}

      <Lbl>Questions</Lbl>
      {questions.map((q, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <input value={q.text} onChange={(e) => updQ(i, { text: e.target.value })} placeholder={`Question ${i + 1}`} style={{ ...qInp, flex: '1 1 240px' }} />
          <select value={q.kind} onChange={(e) => updQ(i, { kind: e.target.value })} style={qSel}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          {q.kind === 'choice' && <input value={(q.options || []).join(', ')} onChange={(e) => updQ(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })} placeholder="options, comma-separated" style={{ ...qInp, flex: '1 1 180px' }} />}
          <button onClick={() => delQ(i)} title="Remove" style={miniBtn(C.red, true)}><Trash2 size={13} /></button>
        </div>
      ))}
      <button onClick={addQ} style={{ ...ghostBtn, padding: '8px 13px', fontSize: '.82rem', display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4 }}><Plus size={14} /> Add question</button>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button onClick={onClose} style={ghostBtn}>Cancel</button>
        <button onClick={save} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Create draft'}</button>
      </div>
    </Overlay>
  );
}

const qInp = { padding: '9px 11px', border: `1px solid ${C.line}`, borderRadius: 9, fontSize: '.85rem', fontFamily: 'inherit', color: C.ink, boxSizing: 'border-box' };
const qSel = { padding: '9px 10px', border: `1px solid ${C.line}`, borderRadius: 9, fontSize: '.82rem', fontFamily: 'inherit', color: C.ink, background: '#fff' };

/* =============================== RESULTS =============================== */
function Results() {
  const [surveys, setSurveys] = useState([]);
  const [sel, setSel] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { (async () => { try { const { data } = await api.get('/engagement/surveys'); setSurveys(data.surveys || []); } catch { setErr('Could not load surveys.'); } })(); }, []);
  useEffect(() => { if (!sel) { setData(null); return; } (async () => { setErr(''); try { const { data } = await api.get(`/engagement/surveys/${sel}/results`); setData(data); } catch (e) { setErr(e?.response?.data?.message || 'Could not load results.'); } })(); }, [sel]);

  const npsQ = data?.results?.questions?.find((q) => q.kind === 'nps');

  return (
    <>
      <Hero crumbs={['Engagement', 'Results']} title="Results" />
      {data && (
        <KpiBand>
          <Kpi Icon={Inbox} label="Responses" value={data.results.responseCount} />
          {npsQ && <Kpi Icon={PieChart} iconBg={npsQ.enps >= 0 ? '#e7f7ee' : '#fdecec'} iconColor={npsQ.enps >= 0 ? '#1f9d57' : C.red} label="eNPS" value={npsQ.enps == null ? '—' : npsQ.enps} />}
          {npsQ && <Kpi Icon={Users} iconBg="#e7f7ee" iconColor="#1f9d57" label="Promoters" value={npsQ.promoters} />}
          {npsQ && <Kpi Icon={Users} iconBg="#fdecec" iconColor={C.red} label="Detractors" value={npsQ.detractors} />}
        </KpiBand>
      )}
      <Body>
        {err && <ErrBox>{err}</ErrBox>}
        <Card title="Choose a survey">
          <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ ...qSel, minWidth: 280 }}>
            <option value="">— choose —</option>
            {surveys.map((s) => <option key={s._id} value={s._id}>{s.title} ({s.responseCount} response{s.responseCount === 1 ? '' : 's'})</option>)}
          </select>
        </Card>

        {data && data.results.questions.map((q) => (
          <Card key={q.questionId} title={q.text} sub={`${q.answered} answered`}>
            {q.kind === 'nps' ? (
              <div style={{ display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '.64rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em' }}>eNPS</div>
                  <div style={{ ...NUM, fontSize: '2.6rem', fontWeight: 800, color: q.enps == null ? C.muted : (q.enps >= 0 ? '#1f9d57' : C.red) }}>{q.enps == null ? '—' : q.enps}</div>
                </div>
                <div style={{ flex: 1, minWidth: 240 }}><Bars data={[{ label: 'Promoters', value: q.promoters }, { label: 'Passives', value: q.passives }, { label: 'Detractors', value: q.detractors }]} /></div>
              </div>
            ) : q.kind === 'scale' ? (
              <div>
                <div style={{ fontSize: '.84rem', color: C.ink, marginBottom: 12 }}>Average <strong style={{ ...NUM, color: C.navy }}>{q.average == null ? '—' : q.average}</strong> / 5</div>
                <Bars data={q.distribution} />
              </div>
            ) : q.kind === 'choice' ? (
              (q.distribution || []).length ? <Bars data={q.distribution} /> : <Empty>No answers.</Empty>
            ) : (
              <div style={{ maxHeight: 240, overflow: 'auto' }}>
                {(q.texts || []).length === 0 ? <Empty>No answers.</Empty>
                  : (q.texts || []).map((t, i) => <div key={i} style={{ fontSize: '.86rem', color: C.ink, padding: '9px 0', borderBottom: `1px solid ${C.lineSoft}` }}>“{t}”</div>)}
              </div>
            )}
          </Card>
        ))}
      </Body>
    </>
  );
}

/* =============================== ANSWER =============================== */
function AnswerSurveys() {
  const [surveys, setSurveys] = useState(null);
  const [err, setErr] = useState('');
  const [banner, setBanner] = useState('');

  async function load() { setErr(''); try { const { data } = await api.get('/engagement/me/surveys'); setSurveys(data.surveys || []); } catch (e) { setErr(e?.response?.data?.message || 'Could not load your surveys.'); } }
  useEffect(() => { load(); }, []);

  return (
    <>
      <Hero crumbs={['Engagement', 'My surveys']} title="My surveys" />
      <Body>
        {banner && <Banner tone="green" onClose={() => setBanner('')}>{banner}</Banner>}
        {err && <ErrBox>{err}</ErrBox>}
        {!surveys ? <Empty>Loading…</Empty>
          : surveys.length === 0 ? <Card><Empty>Nothing to answer right now.</Empty></Card>
            : surveys.map((s) => <AnswerCard key={s._id} survey={s} onDone={() => { setBanner('Thanks — your response was recorded.'); load(); }} onError={setErr} />)}
      </Body>
    </>
  );
}

function AnswerCard({ survey, onDone, onError }) {
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (qid, value) => setAnswers((a) => ({ ...a, [qid]: value }));

  async function submit() {
    setBusy(true);
    try {
      await api.post(`/engagement/surveys/${survey._id}/respond`, { answers: Object.entries(answers).map(([questionId, value]) => ({ questionId, value })) });
      onDone();
    } catch (e) { onError(e?.response?.data?.message || 'Could not submit your response.'); setBusy(false); }
  }

  return (
    <Card title={survey.title} sub={survey.anonymous ? 'anonymous' : null}>
      {survey.description && <div style={{ fontSize: '.86rem', color: C.ink, marginBottom: 14 }}>{survey.description}</div>}
      {(survey.questions || []).map((q) => {
        const qid = String(q._id);
        return (
          <div key={qid} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: '.88rem', fontWeight: 600, color: C.navy, marginBottom: 9 }}>{q.text}</div>
            {q.kind === 'scale' && <ScaleRow start={1} max={5} value={answers[qid]} onPick={(v) => set(qid, v)} />}
            {q.kind === 'nps' && <ScaleRow start={0} max={10} value={answers[qid]} onPick={(v) => set(qid, v)} />}
            {q.kind === 'choice' && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{(q.options || []).map((o) => (
              <button key={o} onClick={() => set(qid, o)} style={{ padding: '8px 14px', borderRadius: 9, border: `1px solid ${answers[qid] === o ? C.navy : C.line}`, background: answers[qid] === o ? C.navy : '#fff', color: answers[qid] === o ? '#fff' : C.ink, fontWeight: 700, fontSize: '.84rem', cursor: 'pointer', fontFamily: 'inherit' }}>{o}</button>
            ))}</div>}
            {q.kind === 'text' && <textarea value={answers[qid] || ''} onChange={(e) => set(qid, e.target.value)} rows={3} placeholder="Your answer…" style={{ ...qInp, width: '100%', resize: 'vertical' }} />}
          </div>
        );
      })}
      <button onClick={submit} disabled={busy} style={{ ...primaryBtn, display: 'inline-flex', alignItems: 'center', gap: 7, opacity: busy ? 0.6 : 1 }}><Send size={15} /> {busy ? 'Submitting…' : 'Submit'}</button>
    </Card>
  );
}

function ScaleRow({ start, max, value, onPick }) {
  const nums = [];
  for (let i = start; i <= max; i++) nums.push(i);
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {nums.map((n) => (
        <button key={n} onClick={() => onPick(n)} style={{ width: 38, height: 38, borderRadius: 10, border: `1px solid ${value === n ? C.navy : C.line}`, background: value === n ? C.navy : '#fff', color: value === n ? '#fff' : C.ink, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', ...NUM }}>{n}</button>
      ))}
    </div>
  );
}
