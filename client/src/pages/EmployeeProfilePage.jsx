import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useLocale } from '../context/LocaleContext';
import { useAuth } from '../context/AuthContext';
import EmployeeForm from '../components/EmployeeForm';
import { sectionsForRecord, findByCode } from '../config/employeeProfiles';

/* ------------------------------------------------------------------ *
 *  Nexusora Workforce — Employee People Profile
 *  SAP SuccessFactors-style skin over the existing profile logic.
 *  Self-contained: one scoped <style> block (prefix "sfpp-") + inline.
 *  Brand: navy #012158 · blue #3485E9 · orange #FD9C09 · font Inter.
 *  Tabs: Personal · Job · Org Chart · Compensation · History ·
 *        Time & Attendance · Leave · Documents.
 *  History reads GET /employees/:id/history (effective-dated changes).
 * ------------------------------------------------------------------ */

const WRITE_ROLES = ['super_admin', 'hr_manager', 'hr_officer'];
const DOC_TYPES = ['contract', 'id', 'certificate', 'other'];

const humanize = (v) => (v ? String(v).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '');
const val = (x) => (x === 0 ? '0' : x || '—');
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const fmtMoney = (n, ccy) => (n || n === 0 ? `${ccy ? ccy + ' ' : ''}${Number(n).toLocaleString()}` : '—');
const fmtBytes = (b) => {
  if (!b && b !== 0) return '—';
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
};

/* file preview helpers (Office viewer for Word/Excel, direct for pdf/image) */
const OFFICE = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
const IMG_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'];
const extOf = (f) => {
  const fmt = String(f?.format || '').toLowerCase();
  if (fmt && fmt.length <= 5) return fmt;
  const m = String(f?.name || f?.url || '').match(/\.([a-z0-9]+)(\?|$)/i);
  return m ? m[1].toLowerCase() : '';
};
const isImageExt = (e) => IMG_EXT.includes(e);
const officeUrl = (f) => `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(f.url)}`;
const gviewUrl = (f) => `https://docs.google.com/gview?url=${encodeURIComponent(f.url)}&embedded=true`;

/* ---------- presentational primitives (SF skin) ---------- */

const PILL_TONES = {
  green: ['#e7f6ee', '#1a7f47'],
  red: ['#fdeaea', '#b3261e'],
  amber: ['#fff4e0', '#9a6400'],
  blue: ['#eaf1fb', '#1d5fbf'],
  gray: ['#eef1f5', '#5b6b7f'],
};
function Pill({ tone = 'gray', children }) {
  const [bg, fg] = PILL_TONES[tone] || PILL_TONES.gray;
  return <span className="sfpp-pill" style={{ background: bg, color: fg }}>{children}</span>;
}

const attTone = (s) => ({ present: 'green', late: 'amber', half_day: 'amber', absent: 'red', leave: 'blue', rest_day: 'gray', holiday: 'gray' }[s] || 'gray');
const reqTone = (s) => ({ approved: 'green', rejected: 'red', cancelled: 'red', pending: 'amber' }[s] || 'gray');
const statusTone = (s) => ({ active: 'green', suspended: 'amber', terminated: 'red' }[s] || 'gray');

function F({ label, children }) {
  const empty = children == null || children === '' || children === '—';
  return (
    <div className="sfpp-f">
      <span className="l">{label}</span>
      <span className={'v' + (empty ? ' empty' : '')}>{empty ? '—' : children}</span>
    </div>
  );
}
function G({ children }) { return <div className="sfpp-grid">{children}</div>; }

/* Left-label section row — the SuccessFactors signature layout */
function Section({ title, children }) {
  return (
    <div className="sfpp-section">
      <div className="sfpp-sec-title">{title}</div>
      <div className="sfpp-card">{children}</div>
    </div>
  );
}
/* Full-width card (for dashboard-style tabs: Org, History, Time, Leave, Documents) */
function Panel({ title, children }) {
  return (
    <div className="sfpp-card" style={{ marginBottom: 16 }}>
      {title && <h3 className="sfpp-blocktitle">{title}</h3>}
      {children}
    </div>
  );
}
function Stat({ value, label, gold }) {
  return (
    <div className={'sfpp-stat' + (gold ? ' gold' : '')}>
      <span className="num">{value}</span>
      <span className="lab">{label}</span>
    </div>
  );
}

/* ---------- Org chart node + tab ---------- */
function personTitle(p) { return (p && (p.employment?.jobTitle || p.title)) || ''; }
function personName(p) { return [p?.firstName, p?.lastName].filter(Boolean).join(' ') || '—'; }
function personInitials(p) { return ((p?.firstName?.[0] || '') + (p?.lastName?.[0] || '')).toUpperCase() || '?'; }

function OrgNode({ person, role, self, onClick }) {
  const { t } = useLocale();
  const clickable = !self && typeof onClick === 'function';
  return (
    <div
      className={'sfpp-node' + (self ? ' self' : '')}
      onClick={clickable ? onClick : undefined}
      role={clickable ? 'button' : undefined}
      title={clickable ? t('profile.openProfile') : undefined}
    >
      {person?.photo
        ? <img className="av" src={person.photo} alt={personName(person)} />
        : <div className="av">{personInitials(person)}</div>}
      <div style={{ minWidth: 0 }}>
        {role && <div className="rl">{role}</div>}
        <div className="nm">{personName(person)}</div>
        <div className="tt">{personTitle(person) || '—'}</div>
      </div>
    </div>
  );
}

function OrgChartTab({ self, manager, navigate }) {
  const { t } = useLocale();
  const [state, setState] = useState({ loading: true, error: '', reports: [] });
  useEffect(() => {
    let alive = true;
    (async () => {
      setState((s) => ({ ...s, loading: true, error: '' }));
      try {
        const { data } = await api.get('/employees', { params: { manager: self._id, limit: 100 } });
        const reports = Array.isArray(data) ? data : data.items || [];
        if (alive) setState({ loading: false, error: '', reports });
      } catch (err) {
        if (alive) setState({ loading: false, error: err?.response?.data?.message || t('profile.errOrg'), reports: [] });
      }
    })();
    return () => { alive = false; };
  }, [self._id]);

  const go = (empId) => { if (empId) navigate(`/employees/${empId}`); };

  return (
    <Panel title={t('profile.orgChart')}>
      <div className="sfpp-org-wrap">
        {manager && (
          <>
            <OrgNode person={manager} role={t('profile.lineManager')} onClick={() => go(manager._id)} />
            <div className="sfpp-conn" />
          </>
        )}
        <OrgNode person={self} role={t('profile.thisEmployee')} self />
        {state.reports.length > 0 && <div className="sfpp-conn" />}
      </div>

      {state.loading ? (
        <p className="sfpp-muted" style={{ textAlign: 'center' }}>{t('profile.loadingOrg')}</p>
      ) : state.error ? (
        <div className="sfpp-err">{state.error}</div>
      ) : state.reports.length ? (
        <>
          <div className="sfpp-reports-head">{t('profile.directReports', { n: state.reports.length })}</div>
          <div className="sfpp-reports">
            {state.reports.map((r) => (
              <OrgNode key={r._id} person={r} onClick={() => go(r._id)} />
            ))}
          </div>
        </>
      ) : (
        <p className="sfpp-muted" style={{ textAlign: 'center' }}>{t('profile.noDirectReports')}</p>
      )}
    </Panel>
  );
}

/* ---------- History tab (effective-dated changes) ---------- */
function HistoryTab({ employeeId }) {
  const { t } = useLocale();
  const [state, setState] = useState({ loading: true, error: '', items: [] });
  useEffect(() => {
    let alive = true;
    (async () => {
      setState((s) => ({ ...s, loading: true, error: '' }));
      try {
        const { data } = await api.get(`/employees/${employeeId}/history`);
        const items = Array.isArray(data) ? data : data.items || [];
        if (alive) setState({ loading: false, error: '', items });
      } catch (err) {
        if (alive) setState({ loading: false, error: err?.response?.data?.message || t('profile.errHistory'), items: [] });
      }
    })();
    return () => { alive = false; };
  }, [employeeId]);

  if (state.loading) return <Panel><p className="sfpp-muted">{t('profile.loadingHistory')}</p></Panel>;
  if (state.error) return <div className="sfpp-err">{state.error}</div>;

  const dash = (v) => (v === '' || v == null ? '—' : v);
  const catLabel = (c) => (c === 'compensation' ? t('profile.catComp') : t('profile.catJob'));

  return (
    <Panel title={t('profile.changeHistory')}>
      {state.items.length ? (
        <div className="sfpp-tl">
          {state.items.map((ev) => (
            <div className="sfpp-tl-item" key={ev._id}>
              <div className={'sfpp-tl-dot ' + (ev.category === 'compensation' ? 'comp' : 'job')} />
              <div className="sfpp-tl-body">
                <div className="sfpp-tl-head">
                  <span className="sfpp-tl-date">{t('profile.effective', { date: fmtDate(ev.effectiveDate) })}</span>
                  <Pill tone={ev.category === 'compensation' ? 'amber' : 'blue'}>{catLabel(ev.category)}</Pill>
                </div>
                <div className="sfpp-tl-changes">
                  {(ev.changes || []).map((c, i) => (
                    <div className="sfpp-chg" key={i}>
                      <span className="lbl">{c.label}</span>
                      <span className="from">{dash(c.from)}</span>
                      <span className="arrow">→</span>
                      <span className="to">{dash(c.to)}</span>
                    </div>
                  ))}
                </div>
                {ev.note && <div className="sfpp-tl-note">“{ev.note}”</div>}
                <div className="sfpp-tl-meta">{t('profile.recorded', { date: fmtDate(ev.changedAt) })}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="sfpp-muted" style={{ textAlign: 'center', padding: '18px 0' }}>
          {t('profile.noChanges')}
        </p>
      )}
    </Panel>
  );
}

/* ---------- Time & Attendance tab (logic unchanged) ---------- */
function TimeTab({ employeeId }) {
  const { t } = useLocale();
  const [state, setState] = useState({ loading: true, error: '', items: [], total: 0 });
  useEffect(() => {
    let alive = true;
    (async () => {
      setState((s) => ({ ...s, loading: true, error: '' }));
      try {
        const { data } = await api.get('/attendance', { params: { employee: employeeId, limit: 60 } });
        const items = Array.isArray(data) ? data : data.items || [];
        const total = data.total != null ? data.total : items.length;
        if (alive) setState({ loading: false, error: '', items, total });
      } catch (err) {
        if (alive) setState({ loading: false, error: err?.response?.data?.message || t('profile.errAttendance'), items: [], total: 0 });
      }
    })();
    return () => { alive = false; };
  }, [employeeId]);

  if (state.loading) return <Panel><p className="sfpp-muted">{t('profile.loadingAttendance')}</p></Panel>;
  if (state.error) return <div className="sfpp-err">{state.error}</div>;

  const { items } = state;
  const norm = (s) => String(s || '').toLowerCase();
  let attended = 0, absent = 0, onLeave = 0, nonWorking = 0;
  for (const r of items) {
    const s = norm(r.status);
    if (s === 'present' || s === 'late') attended += 1;
    else if (s === 'half_day') attended += 0.5;
    else if (s === 'absent') absent += 1;
    else if (s === 'leave') onLeave += 1;
    else if (s === 'rest_day' || s === 'holiday') nonWorking += 1;
  }
  const workingDays = attended + absent;
  const rate = workingDays ? Math.round((attended / workingDays) * 100) : null;
  const attendedDisplay = Number.isInteger(attended) ? attended : attended.toFixed(1);

  return (
    <>
      <div className="sfpp-statrow">
        <Stat value={attendedDisplay} label={t('profile.attended')} gold />
        <Stat value={absent} label={t('profile.absent')} />
        <Stat value={onLeave} label={t('profile.onLeave')} />
        <Stat value={nonWorking} label={t('profile.restHoliday')} />
        <Stat value={rate == null ? '—' : rate + '%'} label={t('profile.attendanceRate')} />
      </div>
      <Panel title={t('profile.recentAttendance')}>
        {items.length ? (
          <table className="sfpp-tbl">
            <thead><tr><th>{t('common.date')}</th><th>{t('common.status')}</th></tr></thead>
            <tbody>
              {items.slice(0, 30).map((r, i) => (
                <tr key={r._id || i}>
                  <td>{fmtDate(r.date)}</td>
                  <td><Pill tone={attTone(norm(r.status))}>{humanize(r.status) || '—'}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="sfpp-muted">{t('profile.noAttendance')}</p>
        )}
        <p className="sfpp-muted" style={{ marginTop: 10 }}>{t('profile.showingOf', { shown: Math.min(items.length, 30), total: state.total })}</p>
      </Panel>
    </>
  );
}

/* ---------- Leave tab (logic unchanged) ---------- */
function LeaveTab({ employeeId }) {
  const { t } = useLocale();
  const [state, setState] = useState({ loading: true, error: '', balance: null, requests: [] });
  useEffect(() => {
    let alive = true;
    (async () => {
      setState((s) => ({ ...s, loading: true, error: '' }));
      try {
        const [balRes, reqRes] = await Promise.all([
          api.get(`/leave/balance/${employeeId}`),
          api.get('/leave/requests', { params: { employee: employeeId } }),
        ]);
        const balance = balRes.data || null;
        const rd = reqRes.data;
        const requests = Array.isArray(rd) ? rd : rd.items || rd.requests || [];
        if (alive) setState({ loading: false, error: '', balance, requests });
      } catch (err) {
        if (alive) setState({ loading: false, error: err?.response?.data?.message || t('profile.errLeave'), balance: null, requests: [] });
      }
    })();
    return () => { alive = false; };
  }, [employeeId]);

  if (state.loading) return <Panel><p className="sfpp-muted">{t('profile.loadingLeave')}</p></Panel>;
  if (state.error) return <div className="sfpp-err">{state.error}</div>;

  const { balance, requests } = state;
  const annual = balance?.annual || {};
  const byType = balance?.byType || [];
  const tenureMonths = balance?.tenureMonths;
  const norm = (s) => String(s || '').toLowerCase();

  return (
    <>
      <div className="sfpp-statrow">
        <Stat value={annual.entitlement != null ? annual.entitlement : '—'} label={t('profile.annualEntitlement')} />
        <Stat value={annual.taken != null ? annual.taken : '—'} label={t('profile.annualTaken')} />
        <Stat value={annual.remaining != null ? annual.remaining : '—'} label={t('profile.annualRemaining')} gold />
        <Stat value={tenureMonths != null ? tenureMonths : '—'} label={t('profile.tenureMonths')} />
      </div>
      <Panel title={t('profile.takenByType')}>
        {byType.length ? (
          <table className="sfpp-tbl">
            <thead><tr><th>{t('profile.leaveType')}</th><th>{t('profile.daysTaken')}</th></tr></thead>
            <tbody>
              {byType.map((b, i) => (<tr key={i}><td>{val(b.type)}</td><td>{b.days != null ? b.days : '—'}</td></tr>))}
            </tbody>
          </table>
        ) : (
          <p className="sfpp-muted">{t('profile.noLeaveTaken')}</p>
        )}
      </Panel>
      <Panel title={t('profile.leaveRequests')}>
        {requests.length ? (
          <table className="sfpp-tbl">
            <thead><tr><th>{t('common.type')}</th><th>{t('profile.from')}</th><th>{t('profile.to')}</th><th>{t('profile.days')}</th><th>{t('common.status')}</th></tr></thead>
            <tbody>
              {requests.map((r, i) => (
                <tr key={r._id || i}>
                  <td>{r.leaveType?.name || '—'}</td>
                  <td>{fmtDate(r.startDate)}</td>
                  <td>{fmtDate(r.endDate)}</td>
                  <td>{r.days != null ? r.days : '—'}</td>
                  <td><Pill tone={reqTone(norm(r.status) || 'pending')}>{humanize(r.status) || '—'}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="sfpp-muted">{t('profile.noLeaveRequests')}</p>
        )}
      </Panel>
    </>
  );
}

/* ---------- Documents tab (logic unchanged) ---------- */
function DocumentsTab({ employeeId, canWrite, initialDocs, onDocsChange }) {
  const { t } = useLocale();
  const [docs, setDocs] = useState(initialDocs || []);
  const [name, setName] = useState('');
  const [type, setType] = useState('other');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const upload = async () => {
    if (!file) { setError(t('profile.chooseFile')); return; }
    setBusy(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', name || file.name);
      fd.append('type', type);
      const { data } = await api.post(`/employees/${employeeId}/documents`, fd);
      const next = data.documents || [];
      setDocs(next); onDocsChange?.(next);
      setName(''); setType('other'); setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setError(err?.response?.data?.message || t('profile.uploadFailed'));
    } finally { setBusy(false); }
  };

  const remove = async (docId) => {
    if (!window.confirm(t('profile.confirmRemoveDoc'))) return;
    setBusy(true); setError('');
    try {
      const { data } = await api.delete(`/employees/${employeeId}/documents/${docId}`);
      const next = data.documents || [];
      setDocs(next); onDocsChange?.(next);
    } catch (err) {
      setError(err?.response?.data?.message || t('profile.errRemoveDoc'));
    } finally { setBusy(false); }
  };

  return (
    <>
      {canWrite && (
        <Panel title={t('profile.uploadDocument')}>
          {error && <div className="sfpp-err">{error}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, alignItems: 'end' }}>
            <label className="sfpp-field">
              {t('profile.documentName')}
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('profile.docNamePlaceholder')} />
            </label>
            <label className="sfpp-field">
              {t('common.type')}
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {DOC_TYPES.map((tp) => <option key={tp} value={tp}>{humanize(tp)}</option>)}
              </select>
            </label>
            <label className="sfpp-field">
              {t('profile.file')}
              <input ref={fileRef} type="file" onChange={(e) => setFile(e.target.files?.[0] || null)}
                accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" />
            </label>
            <button className="sfpp-btn primary" onClick={upload} disabled={busy || !file}>
              {busy ? t('common.uploading') : t('common.upload')}
            </button>
          </div>
          <p className="sfpp-muted" style={{ marginTop: 10 }}>{t('profile.docHint')}</p>
        </Panel>
      )}
      <Panel title={t('profile.documents')}>
        {docs.length ? (
          <table className="sfpp-tbl">
            <thead><tr><th>{t('common.name')}</th><th>{t('common.type')}</th><th>{t('profile.format')}</th><th>{t('profile.size')}</th><th>{t('profile.uploaded')}</th><th></th></tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d._id || d.publicId}>
                  <td>{val(d.name)}</td>
                  <td>{humanize(d.type) || '—'}</td>
                  <td style={{ textTransform: 'uppercase', fontSize: '.78rem' }}>{val(d.format)}</td>
                  <td>{fmtBytes(d.bytes)}</td>
                  <td>{fmtDate(d.uploadedAt)}</td>
                  <td style={{ whiteSpace: 'nowrap', display: 'flex', gap: 8 }}>
                    <a className="sfpp-mini" href={d.url} target="_blank" rel="noreferrer">{t('profile.view')}</a>
                    {canWrite && (
                      <button className="sfpp-mini no" onClick={() => remove(d._id)} disabled={busy}>{t('common.delete')}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="sfpp-muted">{t('profile.noDocuments')}</p>
        )}
      </Panel>
    </>
  );
}

/* ---------- Account / login section (bridges employee record ↔ login) ---------- */
function AccountSection({ employeeId, employeeName, employeeEmail, canWrite }) {
  const { t } = useLocale();
  const [state, setState] = useState({ loading: true, error: '', user: null });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: employeeEmail || '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const load = useCallback(async () => {
    setState({ loading: true, error: '', user: null });
    try {
      const { data } = await api.get('/auth/users', { params: { employee: employeeId } });
      const users = Array.isArray(data) ? data : (data.items || []);
      setState({ loading: false, error: '', user: users[0] || null });
    } catch (e) {
      setState({ loading: false, error: e?.response?.data?.message || t('profile.errCheckLogin'), user: null });
    }
  }, [employeeId]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.email || !form.password) { setErr(t('profile.loginEmailPwRequired')); return; }
    if (form.password.length < 8) { setErr(t('profile.pwMinLength')); return; }
    setBusy(true); setErr(''); setOk('');
    try {
      await api.post('/auth/users', { name: employeeName, email: form.email, password: form.password, role: 'employee', employee: employeeId });
      setOk(t('profile.loginCreated'));
      setShowForm(false);
      setForm((f) => ({ ...f, password: '' }));
      await load();
    } catch (e) { setErr(e?.response?.data?.message || t('profile.errCreateLogin')); }
    finally { setBusy(false); }
  };

  const okStyle = { background: '#e7f6ee', color: '#1a7f47', border: '1px solid #b6e2c8', padding: '10px 14px', borderRadius: 8, fontSize: '.85rem', marginBottom: 12 };

  return (
    <div className="sfpp-section">
      <div className="sfpp-sec-title">{t('profile.loginAccount')}</div>
      <div className="sfpp-card">
        {state.loading ? (
          <p className="sfpp-muted">{t('profile.checkingLogin')}</p>
        ) : state.error ? (
          <div className="sfpp-err">{state.error}</div>
        ) : state.user ? (
          <>
            <G>
              <F label={t('profile.loginEmail')}>{state.user.email}</F>
              <F label={t('common.role')}>{humanize(state.user.role)}</F>
              <F label={t('common.status')}>{state.user.isActive ? t('profile.active') : t('profile.inactive')}</F>
            </G>
            <p className="sfpp-muted" style={{ marginTop: 8 }}>{t('profile.canSignIn')}</p>
          </>
        ) : (
          <>
            {ok && <div style={okStyle}>{ok}</div>}
            {!showForm ? (
              <>
                <p className="sfpp-muted" style={{ margin: 0 }}>{t('profile.noLoginYet')}</p>
                {canWrite && <button className="sfpp-btn primary" style={{ marginTop: 12 }} onClick={() => { setShowForm(true); setOk(''); }}>{t('profile.createLogin')}</button>}
              </>
            ) : (
              <>
                {err && <div className="sfpp-err">{err}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
                  <label className="sfpp-field">{t('profile.loginEmail')}
                    <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="name@company.com" />
                  </label>
                  <label className="sfpp-field">{t('profile.tempPassword')}
                    <input type="text" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder={t('profile.pwPlaceholder')} />
                  </label>
                </div>
                <p className="sfpp-muted" style={{ marginTop: 8 }}>{t('profile.createsLoginFor', { name: employeeName })}</p>
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button className="sfpp-btn primary" onClick={create} disabled={busy}>{busy ? t('profile.creating') : t('profile.createLogin')}</button>
                  <button className="sfpp-btn" onClick={() => { setShowForm(false); setErr(''); }} disabled={busy}>{t('common.cancel')}</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- File preview modal (Word/Excel/PDF/image) ---------- */
function FilePreview({ file, onClose }) {
  const { t } = useLocale();
  const ext = extOf(file);
  const img = isImageExt(ext);
  const src = ext === 'pdf' ? file.url : (OFFICE.includes(ext) ? officeUrl(file) : gviewUrl(file));
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(1,20,50,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 2000 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 900, height: '82vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(1,33,88,.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderBottom: '1px solid #e5e8ec' }}>
          <span style={{ fontWeight: 800, color: '#012158', fontSize: '.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <a className="sfpp-mini" href={file.url} target="_blank" rel="noreferrer">{t('common.download')}</a>
            <button className="sfpp-mini" onClick={onClose}>{t('common.close')}</button>
          </div>
        </div>
        <div style={{ flex: 1, background: '#f4f6f9', overflow: 'auto', padding: 12 }}>
          {img
            ? <img src={file.url} alt={file.name} style={{ maxWidth: '100%', display: 'block', margin: '0 auto' }} />
            : <iframe title={t('common.preview')} src={src} style={{ width: '100%', height: '100%', border: 'none' }} />}
        </div>
      </div>
    </div>
  );
}

/* ---------- Job Description on the profile (inherited from the position) ---------- */
function JobDescriptionView({ positionId }) {
  const { t } = useLocale();
  const [state, setState] = useState({ loading: !!positionId, error: '', pos: null });
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!positionId) { if (alive) setState({ loading: false, error: '', pos: null }); return; }
      if (alive) setState({ loading: true, error: '', pos: null });
      try {
        const { data } = await api.get(`/positions/${positionId}`);
        if (alive) setState({ loading: false, error: '', pos: data.item || data.position || data });
      } catch (e) {
        if (alive) setState({ loading: false, error: e?.response?.data?.message || t('profile.errJobDesc'), pos: null });
      }
    })();
    return () => { alive = false; };
  }, [positionId]);

  const H = { fontSize: '.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: '#8a94a6', margin: '0 0 6px' };

  if (!positionId) {
    return <Section title={t('profile.jobDescription')}><p className="sfpp-muted">{t('profile.noPositionAssigned')}</p></Section>;
  }
  if (state.loading) return <Section title={t('profile.jobDescription')}><p className="sfpp-muted">{t('profile.loadingJobDesc')}</p></Section>;
  if (state.error) return <Section title={t('profile.jobDescription')}><div className="sfpp-err">{state.error}</div></Section>;

  const jd = state.pos?.jobDescription || {};
  const list = (label, arr) => (arr && arr.length) ? (
    <div style={{ marginBottom: 14 }}>
      <div style={H}>{label}</div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>{arr.map((x, i) => <li key={i} style={{ fontSize: '.88rem', lineHeight: 1.5, marginBottom: 3 }}>{x}</li>)}</ul>
    </div>
  ) : null;
  const has = jd.summary || (jd.responsibilities || []).length || (jd.requirements || []).length || (jd.competencies || []).length || jd.file;
  const posLabel = `${state.pos?.title || ''}${state.pos?.code ? ` (${state.pos.code})` : ''}`;

  return (
    <div className="sfpp-section">
      <div className="sfpp-sec-title">{t('profile.jobDescription')}</div>
      <div className="sfpp-card">
        {!has ? (
          <p className="sfpp-muted">{t('profile.noJobDesc', { title: state.pos?.title })}</p>
        ) : (
          <>
            {jd.summary && <div style={{ marginBottom: 14 }}><div style={H}>{t('profile.summary')}</div><p style={{ fontSize: '.9rem', lineHeight: 1.55, margin: 0, color: '#1f2733' }}>{jd.summary}</p></div>}
            {list(t('profile.keyResponsibilities'), jd.responsibilities)}
            {list(t('profile.requirements'), jd.requirements)}
            {list(t('profile.competencies'), jd.competencies)}
            {jd.file && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderTop: '1px solid #eef1f5', paddingTop: 12, marginTop: 4 }}>
                <span style={{ fontSize: '.85rem', color: '#012158', fontWeight: 700 }}>📎 {jd.file.name}</span>
                <button className="sfpp-mini" onClick={() => setPreview(jd.file)}>{t('common.preview')}</button>
                <a className="sfpp-mini" href={jd.file.url} target="_blank" rel="noreferrer">{t('common.download')}</a>
              </div>
            )}
          </>
        )}
        <div style={{ marginTop: 12, fontSize: '.74rem', color: '#8a94a6' }}>{t('profile.fromPosition', { position: posLabel })}</div>
      </div>
      {preview && <FilePreview file={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

/* ================================================================== */

export default function EmployeeProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLocale();
  const { user } = useAuth();
  const [emp, setEmp] = useState(null);
  const [workerClasses, setWorkerClasses] = useState([]);
  const [employmentTypes, setEmploymentTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('personal');
  const [editOpen, setEditOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const photoRef = useRef(null);
  const canWrite = WRITE_ROLES.includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get(`/employees/${id}`);
      setEmp(data.employee || data);
    } catch (err) {
      setError(err?.response?.data?.message || t('profile.errLoadEmployee'));
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get('/picklists', { params: { active: 'true' } });
        if (!alive) return;
        const lists = data.items || [];
        setWorkerClasses(lists.filter((i) => i.type === 'worker_class'));
        setEmploymentTypes(lists.filter((i) => i.type === 'employment_type'));
      } catch { /* labels fall back to raw code if this fails */ }
    })();
    return () => { alive = false; };
  }, []);

  const onPickPhoto = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoBusy(true); setPhotoError('');
    try {
      const fd = new FormData();
      fd.append('file', f);
      const { data } = await api.post(`/employees/${id}/photo`, fd);
      setEmp((prev) => (prev ? { ...prev, photo: data.photo } : prev));
    } catch (err) {
      setPhotoError(err?.response?.data?.message || t('profile.errPhotoUpload'));
    } finally {
      setPhotoBusy(false);
      if (photoRef.current) photoRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <div style={{ fontFamily: "'Inter',sans-serif", background: '#f4f6f9', minHeight: '100%', padding: 24 }}>
        <p style={{ color: '#5b6b7f' }}>{t('common.loading')}</p>
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ fontFamily: "'Inter',sans-serif", background: '#f4f6f9', minHeight: '100%', padding: 24 }}>
        <div style={{ background: '#fdeaea', color: '#b3261e', border: '1px solid #f5c6c6', padding: '12px 16px', borderRadius: 8, marginBottom: 12 }}>{error}</div>
        <button onClick={load} style={{ appearance: 'none', border: '1px solid #cfd8e3', background: '#fff', color: '#012158', fontWeight: 700, padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>{t('common.retry')}</button>
      </div>
    );
  }
  if (!emp) return null;

  const employment = emp.employment || {};
  const comp = emp.compensation || {};
  const pay = emp.payment || {};
  const stat = emp.statutory || {};
  const fw = emp.fieldWork || {};
  const edu = emp.education || {};

  const fullName = [emp.firstName, emp.lastName].filter(Boolean).join(' ') || '—';
  const initials = ((emp.firstName?.[0] || '') + (emp.lastName?.[0] || '')).toUpperCase() || '?';
  const wc = employment.workerClass;
  const et = employment.employmentType;
  // Read picklist NAMES (fixes the old wc_/et_ i18n keys that broke after generalization).
  const wcRec = findByCode(workerClasses, wc);
  const etRec = findByCode(employmentTypes, et);
  const wcLabel = wcRec ? wcRec.name : (wc || '—');
  const etLabel = etRec ? etRec.name : (et || '—');
  const sections = sectionsForRecord(wcRec, et);

  // Populated refs (from getById) — show names; fall back to label strings.
  const mgr = employment.lineManager;
  const managerObj = mgr && typeof mgr === 'object' ? mgr : null;
  const managerName = managerObj ? [managerObj.firstName, managerObj.lastName].filter(Boolean).join(' ') : '';
  const positionTitle = employment.positionId && typeof employment.positionId === 'object'
    ? employment.positionId.title : '';
  const positionIdStr = employment.positionId && typeof employment.positionId === 'object'
    ? employment.positionId._id : (employment.positionId || null);
  const deptName = employment.departmentId && typeof employment.departmentId === 'object'
    ? employment.departmentId.name : employment.department;
  const sectionName = employment.sectionId && typeof employment.sectionId === 'object'
    ? employment.sectionId.name : employment.section;
  const orgPath = [deptName, sectionName].filter(Boolean).join(' • ');
  const pb = comp.payBasis;

  // Lightweight "self" node for the org chart.
  const selfNode = {
    _id: emp._id,
    firstName: emp.firstName,
    lastName: emp.lastName,
    photo: emp.photo,
    employment: { jobTitle: positionTitle || employment.jobTitle },
  };

  // Profile completeness (deterministic — presence of key fields).
  const checks = [
    emp.firstName, emp.lastName, emp.email, emp.phone, emp.dateOfBirth, emp.nationalId, emp.photo,
    employment.jobTitle || positionTitle, deptName, employment.startDate, pb,
    stat.taxId || stat.socialSecurityNumber, emp.address, emp.nextOfKin?.name,
  ];
  const completeness = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  const RING_R = 42, RING_C = 2 * Math.PI * RING_R;
  const ringOffset = RING_C * (1 - completeness / 100);

  const TABS = [
    ['personal', 'profile.tab_personal'],
    ['job', 'profile.tab_job'],
    ['org', 'profile.tab_org'],
    ['compensation', 'profile.tab_comp'],
    ['history', 'profile.tab_history'],
    ['time', 'profile.tab_time'],
    ['leave', 'profile.tab_leave'],
    ['documents', 'profile.tab_documents'],
  ];

  return (
    <div className="sfpp-wrap">
      <style>{STYLES}</style>

      <div className="sfpp-crumb">
        <Link to="/">{t('nav.home')}</Link>
        <span className="sep">/</span>
        <Link to="/employees">{t('nav.employees')}</Link>
        <span className="sep">/</span>
        <span className="cur">{fullName}</span>
      </div>

      {/* ---------- SuccessFactors-style banner ---------- */}
      <div className="sfpp-band">
        <div className="sfpp-band-inner">
          <div className="sfpp-ava">
            {emp.photo
              ? <img src={emp.photo} alt={fullName} />
              : <div className="ph">{initials}</div>}
            {canWrite && (
              <>
                <button type="button" className="sfpp-cam" onClick={() => photoRef.current?.click()} disabled={photoBusy} title={t('profile.changePhoto')}>
                  {photoBusy ? '…' : '✎'}
                </button>
                <input ref={photoRef} type="file" accept="image/*" onChange={onPickPhoto} style={{ display: 'none' }} />
              </>
            )}
          </div>

          <div className="sfpp-id">
            <h1 className="sfpp-name">
              {fullName}
              {emp.preferredName && <span style={{ fontWeight: 600, fontSize: '1rem', color: '#bcd0ee' }}>  (“{emp.preferredName}”)</span>}
            </h1>
            <div className="sfpp-role">{positionTitle || employment.jobTitle || '—'}</div>
            <div className="sfpp-org">{orgPath || '—'}{managerName ? t('profile.reportsTo', { name: managerName }) : ''}</div>

            <div className="sfpp-facts">
              <div className="sfpp-fact"><div className="l">{t('employees.staffId')}</div><div className="v" title={emp.staffId || ''}>{emp.staffId || '—'}</div></div>
              <div className="sfpp-fact"><div className="l">{t('employees.email')}</div><div className="v" title={emp.email || ''}>{emp.email || '—'}</div></div>
              <div className="sfpp-fact"><div className="l">{t('profile.phone')}</div><div className="v" title={emp.phone || ''}>{emp.phone || '—'}</div></div>
              <div className="sfpp-fact"><div className="l">{t('employees.department')}</div><div className="v" title={deptName || ''}>{deptName || '—'}</div></div>
              <div className="sfpp-fact"><div className="l">{t('profile.classType')}</div><div className="v">{wcLabel} · {etLabel}</div></div>
              <div className="sfpp-fact"><div className="l">{t('profile.hired')}</div><div className="v">{fmtDate(employment.startDate)}</div></div>
            </div>
            {photoError && <div className="sfpp-err" style={{ marginTop: 10 }}>{photoError}</div>}
          </div>

          <div className="sfpp-side">
            <div className="sfpp-ring">
              <svg width="92" height="92" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r={RING_R} fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="8" />
                <circle cx="48" cy="48" r={RING_R} fill="none" stroke="#FD9C09" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={RING_C} strokeDashoffset={ringOffset} transform="rotate(-90 48 48)" />
              </svg>
              <span className="pct">{completeness}%</span>
            </div>
            <span className="cap">{completeness >= 100 ? t('profile.profileComplete') : t('profile.profileCompleteness')}</span>
            <Pill tone={statusTone(emp.status)}>{humanize(emp.status) || t('profile.active')}</Pill>
            {canWrite && <button className="sfpp-edit" onClick={() => setEditOpen(true)}>{t('common.edit')}</button>}
          </div>
        </div>
      </div>

      {/* ---------- tab bar ---------- */}
      <div className="sfpp-tabs">
        {TABS.map(([k, lbl]) => (
          <button key={k} className={'sfpp-tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{t(lbl)}</button>
        ))}
      </div>

      {/* ---------- PERSONAL ---------- */}
      {tab === 'personal' && (
        <>
          <Section title={t('profile.sec_personal')}>
            <G>
              <F label={t('profile.f_preferredName')}>{val(emp.preferredName)}</F>
              <F label={t('employees.gender')}>{humanize(emp.gender) || '—'}</F>
              <F label={t('employees.dob')}>{fmtDate(emp.dateOfBirth)}</F>
              <F label={t('profile.f_maritalStatus')}>{humanize(emp.maritalStatus) || '—'}</F>
              <F label={t('profile.f_nationality')}>{val(emp.nationality)}</F>
              <F label={t('profile.f_nationalId')}>{val(emp.nationalId)}</F>
            </G>
          </Section>
          <Section title={t('profile.sec_contact')}>
            <G>
              <F label={t('employees.email')}>{val(emp.email)}</F>
              <F label={t('profile.phone')}>{val(emp.phone)}</F>
              <F label={t('employees.address')}>{val(emp.address)}</F>
            </G>
          </Section>
          {sections.has('nextOfKin') && (
            <Section title={t('profile.sec_nextOfKin')}>
              <G>
                <F label={t('common.name')}>{val(emp.nextOfKin?.name)}</F>
                <F label={t('profile.f_relationship')}>{val(emp.nextOfKin?.relationship)}</F>
                <F label={t('profile.phone')}>{val(emp.nextOfKin?.phone)}</F>
              </G>
            </Section>
          )}
          <Section title={t('profile.sec_emergency')}>
            <G>
              <F label={t('common.name')}>{val(emp.emergencyContact?.name)}</F>
              <F label={t('profile.f_relationship')}>{val(emp.emergencyContact?.relationship)}</F>
              <F label={t('profile.phone')}>{val(emp.emergencyContact?.phone)}</F>
            </G>
          </Section>
          <Section title={t('profile.sec_dependents')}>
            {emp.dependents?.length ? (
              <table className="sfpp-tbl">
                <thead><tr><th>{t('common.name')}</th><th>{t('profile.f_relationship')}</th><th>{t('employees.dob')}</th></tr></thead>
                <tbody>
                  {emp.dependents.map((d, i) => (
                    <tr key={i}>
                      <td>{val(d.name)}</td>
                      <td>{val(d.relationship)}</td>
                      <td>{fmtDate(d.dateOfBirth)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="sfpp-muted">{t('profile.noDependents')}</p>
            )}
          </Section>
          <AccountSection employeeId={emp._id} employeeName={fullName} employeeEmail={emp.email} canWrite={canWrite} />
        </>
      )}

      {/* ---------- JOB ---------- */}
      {tab === 'job' && (
        <>
          <Section title={t('profile.sec_position')}>
            <G>
              <F label={t('profile.f_position')}>{positionTitle || '—'}</F>
              <F label={t('profile.f_jobTitle')}>{val(employment.jobTitle)}</F>
              <F label={t('employees.department')}>{deptName || '—'}</F>
              <F label={t('profile.f_section')}>{sectionName || '—'}</F>
              <F label={t('profile.f_costCentre')}>{val(employment.costCentre)}</F>
              <F label={t('profile.f_grade')}>{val(employment.grade)}</F>
              <F label={t('profile.f_workerClass')}>{wcLabel}</F>
              <F label={t('profile.f_employmentType')}>{etLabel}</F>
            </G>
          </Section>
          <JobDescriptionView positionId={positionIdStr} />
          <Section title={t('profile.sec_assignment')}>
            <G>
              <F label={t('profile.f_lineManager')}>{managerName || '—'}</F>
              <F label={t('profile.f_crew')}>{val(employment.crew)}</F>
              <F label={t('profile.f_startDate')}>{fmtDate(employment.startDate)}</F>
              <F label={t('profile.f_confirmationStatus')}>{humanize(employment.confirmationStatus) || '—'}</F>
              <F label={t('profile.f_probationEnd')}>{fmtDate(employment.probationEndDate)}</F>
            </G>
          </Section>
          {sections.has('contract') && (
            <Section title={t('profile.sec_contract')}>
              <G>
                <F label={t('profile.f_contractType')}>{val(employment.contractType)}</F>
                <F label={t('profile.f_contractStart')}>{fmtDate(employment.contractStart)}</F>
                <F label={t('profile.f_contractEnd')}>{fmtDate(employment.contractEnd)}</F>
              </G>
            </Section>
          )}
          {sections.has('fieldWork') && (
            <Section title={t('profile.sec_fieldWork')}>
              <G>
                <F label={t('profile.f_taskType')}>{val(fw.taskType)}</F>
                <F label={t('profile.f_quota')}>{fw.quota != null ? `${fw.quota}${fw.quotaUnit ? ' ' + fw.quotaUnit : ''}` : '—'}</F>
                <F label={t('profile.f_medicalClearance')}>{humanize(fw.medicalClearance?.status) || '—'}</F>
                <F label={t('profile.f_clearanceDate')}>{fmtDate(fw.medicalClearance?.date)}</F>
                <F label={t('profile.f_clearanceNote')}>{val(fw.medicalClearance?.note)}</F>
              </G>
            </Section>
          )}
          {sections.has('education') && (
            <Section title={t('profile.sec_education')}>
              <G>
                <F label={t('profile.f_level')}>{val(edu.level)}</F>
                <F label={t('profile.f_field')}>{val(edu.field)}</F>
                <F label={t('employees.institution')}>{val(edu.institution)}</F>
                <F label={t('profile.f_year')}>{val(edu.year)}</F>
              </G>
            </Section>
          )}
        </>
      )}

      {/* ---------- COMPENSATION ---------- */}
      {tab === 'compensation' && (
        <>
          <Section title={t('profile.sec_pay')}>
            <G>
              <F label={t('profile.f_payBasis')}>{humanize(pb) || '—'}</F>
              <F label={t('profile.f_currency')}>{val(comp.currency)}</F>
              {pb === 'salary' && <F label={t('profile.f_monthlySalary')}>{fmtMoney(comp.baseSalary, comp.currency)}</F>}
              {pb === 'daily' && <F label={t('profile.f_dailyRate')}>{fmtMoney(comp.dailyRate, comp.currency)}</F>}
              {pb === 'hourly' && <F label={t('profile.f_hourlyRate')}>{fmtMoney(comp.hourlyRate, comp.currency)}</F>}
              {(pb === 'piece_rate' || pb === 'task') && (
                <F label={t('profile.f_pieceRate')}>
                  {comp.pieceRate?.amount != null
                    ? `${fmtMoney(comp.pieceRate.amount, comp.currency)}${comp.pieceRate?.unit ? ' / ' + comp.pieceRate.unit : ''}`
                    : '—'}
                </F>
              )}
              <F label={t('profile.f_grade')}>{val(comp.grade)}</F>
            </G>
          </Section>
          <Section title={t('profile.sec_payComponents')}>
            {comp.payComponents?.length ? (
              <table className="sfpp-tbl">
                <thead><tr><th>{t('common.type')}</th><th>{t('profile.amount')}</th><th>{t('profile.f_currency')}</th><th>{t('profile.frequency')}</th></tr></thead>
                <tbody>
                  {comp.payComponents.map((c, i) => (
                    <tr key={i}>
                      <td>{val(c.type)}</td>
                      <td>{c.amount != null ? Number(c.amount).toLocaleString() : '—'}</td>
                      <td>{val(c.currency)}</td>
                      <td>{humanize(c.frequency) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="sfpp-muted">{t('profile.noPayComponents')}</p>
            )}
          </Section>
          {sections.has('statutory') && (
            <Section title={t('profile.sec_statutory')}>
              <G>
                <F label={t('profile.f_ssn')}>{val(stat.socialSecurityNumber)}</F>
                <F label={t('profile.f_scheme')}>{val(stat.socialSecurityScheme)}</F>
                <F label={t('profile.f_taxId')}>{val(stat.taxId)}</F>
              </G>
            </Section>
          )}
          <Section title={t('profile.sec_paymentMethod')}>
            <G>
              <F label={t('profile.f_method')}>{humanize(pay.method) || '—'}</F>
              {pay.method === 'bank' && (
                <>
                  <F label={t('profile.f_bank')}>{val(pay.bank?.bankName)}</F>
                  <F label={t('profile.f_accountNumber')}>{val(pay.bank?.accountNumber)}</F>
                  <F label={t('profile.f_accountName')}>{val(pay.bank?.accountName)}</F>
                </>
              )}
              {pay.method === 'mobile_money' && (
                <>
                  <F label={t('profile.f_provider')}>{val(pay.mobileMoney?.provider)}</F>
                  <F label={t('profile.f_number')}>{val(pay.mobileMoney?.number)}</F>
                </>
              )}
            </G>
          </Section>
        </>
      )}

      {/* ---------- dashboard-style tabs ---------- */}
      <div style={{ marginTop: 4 }}>
        {tab === 'org' && <OrgChartTab self={selfNode} manager={managerObj} navigate={navigate} />}
        {tab === 'history' && <HistoryTab employeeId={emp._id} />}
        {tab === 'time' && <TimeTab employeeId={emp._id} />}
        {tab === 'leave' && <LeaveTab employeeId={emp._id} />}
        {tab === 'documents' && (
          <DocumentsTab
            employeeId={emp._id}
            canWrite={canWrite}
            initialDocs={emp.documents || []}
            onDocsChange={(next) => setEmp((prev) => (prev ? { ...prev, documents: next } : prev))}
          />
        )}
      </div>

      {editOpen && (
        <EmployeeForm employee={emp} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); load(); }} />
      )}
    </div>
  );
}

/* ---------- scoped stylesheet (self-contained, prefix sfpp-) ---------- */
const STYLES = `
.sfpp-wrap{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f6f9;min-height:100%;padding:18px 22px 48px;color:#1f2733}
.sfpp-crumb{display:flex;align-items:center;gap:8px;font-size:.82rem;margin-bottom:12px}
.sfpp-crumb a{color:#3485E9;font-weight:700;text-decoration:none}
.sfpp-crumb a:hover{text-decoration:underline}
.sfpp-crumb .sep{color:#8a94a6}
.sfpp-crumb .cur{color:#5b6b7f;font-weight:600}

.sfpp-band{position:relative;overflow:hidden;border-radius:12px;color:#fff;background:linear-gradient(120deg,#012158 0%,#032a66 50%,#0a3f8f 100%);box-shadow:0 3px 12px rgba(1,33,88,.20)}
.sfpp-band::after{content:'';position:absolute;inset:0;background:linear-gradient(115deg,transparent 52%,rgba(52,133,233,.38) 100%);pointer-events:none}
.sfpp-band-inner{position:relative;display:flex;gap:22px;align-items:flex-start;padding:24px 26px;flex-wrap:wrap}

.sfpp-ava{position:relative;flex-shrink:0}
.sfpp-ava img,.sfpp-ava .ph{width:96px;height:96px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,.9);box-shadow:0 2px 10px rgba(0,0,0,.28)}
.sfpp-ava .ph{display:grid;place-items:center;background:rgba(255,255,255,.14);font-size:2rem;font-weight:800;color:#fff}
.sfpp-cam{position:absolute;bottom:0;right:0;width:30px;height:30px;border-radius:50%;border:2px solid #fff;background:#FD9C09;color:#012158;cursor:pointer;display:grid;place-items:center;font-size:.85rem;font-weight:800;line-height:1}
.sfpp-cam:disabled{opacity:.6;cursor:default}

.sfpp-id{flex:1;min-width:250px}
.sfpp-name{font-size:1.55rem;font-weight:800;line-height:1.15;margin:0}
.sfpp-role{font-size:1rem;font-weight:600;color:#dbe6f7;margin-top:5px}
.sfpp-org{font-size:.85rem;color:#a9c0e4;margin-top:3px}
.sfpp-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px 22px;margin-top:16px}
.sfpp-fact .l{font-size:.62rem;letter-spacing:.06em;text-transform:uppercase;color:#8fb0de;font-weight:800;margin-bottom:2px}
.sfpp-fact .v{font-size:.84rem;color:#eef4fc;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.sfpp-side{display:flex;flex-direction:column;align-items:center;gap:10px;min-width:120px}
.sfpp-ring{position:relative;width:92px;height:92px}
.sfpp-ring .pct{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:800;color:#fff}
.sfpp-side .cap{font-size:.7rem;color:#bcd0ee;text-align:center;max-width:120px}
.sfpp-edit{appearance:none;border:none;cursor:pointer;background:#FD9C09;color:#012158;font-weight:800;font-size:.85rem;padding:8px 20px;border-radius:8px;font-family:inherit}
.sfpp-edit:hover{filter:brightness(1.05)}
.sfpp-pill{display:inline-flex;align-items:center;gap:6px;padding:3px 12px;border-radius:999px;font-size:.75rem;font-weight:700;text-transform:capitalize}

.sfpp-tabs{display:flex;gap:2px;margin:20px 0 6px;background:#e9eff8;border-radius:10px;padding:4px;overflow-x:auto}
.sfpp-tab{appearance:none;border:none;background:none;cursor:pointer;font-family:inherit;white-space:nowrap;padding:9px 16px;border-radius:7px;font-size:.9rem;font-weight:600;color:#5b6b7f}
.sfpp-tab:hover{color:#012158}
.sfpp-tab.on{background:#fff;color:#012158;box-shadow:0 1px 3px rgba(1,33,88,.14)}

.sfpp-section{display:grid;grid-template-columns:210px 1fr;gap:26px;align-items:start;padding:22px 0;border-top:1px solid #e5e8ec}
.sfpp-section:first-of-type{border-top:none;padding-top:18px}
.sfpp-sec-title{font-size:.98rem;font-weight:800;color:#012158;padding-top:4px}
.sfpp-card{background:#fff;border:1px solid #e5e8ec;border-radius:10px;box-shadow:0 1px 2px rgba(1,33,88,.04);padding:18px 20px}
.sfpp-blocktitle{font-size:.95rem;font-weight:800;color:#012158;margin:0 0 14px}
.sfpp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px 24px}
.sfpp-f .l{font-size:.66rem;letter-spacing:.05em;text-transform:uppercase;color:#8a94a6;font-weight:800;display:block;margin-bottom:3px}
.sfpp-f .v{font-size:.9rem;color:#1f2733;font-weight:600;word-break:break-word}
.sfpp-f .v.empty{color:#c3cad4}

.sfpp-tbl{width:100%;border-collapse:collapse;font-size:.86rem}
.sfpp-tbl th{text-align:left;padding:9px 12px;font-size:.66rem;letter-spacing:.05em;text-transform:uppercase;color:#8a94a6;font-weight:800;border-bottom:1px solid #e5e8ec;white-space:nowrap}
.sfpp-tbl td{padding:10px 12px;border-bottom:1px solid #f0f2f5;color:#1f2733;vertical-align:middle}
.sfpp-tbl tr:last-child td{border-bottom:none}

.sfpp-statrow{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:18px}
.sfpp-stat{position:relative;display:flex;flex-direction:column;gap:6px;padding:18px;background:#fff;border:1px solid #e5e8ec;border-radius:10px;box-shadow:0 1px 2px rgba(1,33,88,.04);overflow:hidden}
.sfpp-stat::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:#e5e8ec}
.sfpp-stat.gold::before{background:#FD9C09}
.sfpp-stat .num{font-size:1.9rem;font-weight:800;color:#012158;line-height:1}
.sfpp-stat .lab{font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;color:#8a94a6;font-weight:800}

.sfpp-org-wrap{display:flex;flex-direction:column;align-items:center;gap:0;margin-bottom:6px}
.sfpp-conn{width:2px;height:24px;background:#cfd8e3}
.sfpp-node{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #e5e8ec;border-radius:12px;box-shadow:0 1px 3px rgba(1,33,88,.06);padding:12px 16px;min-width:220px;max-width:320px}
.sfpp-node[role=button]{cursor:pointer}
.sfpp-node[role=button]:hover{border-color:#3485E9;box-shadow:0 3px 10px rgba(52,133,233,.20)}
.sfpp-node.self{border:2px solid #012158;background:#f5f9ff}
.sfpp-node .av{width:46px;height:46px;border-radius:50%;object-fit:cover;flex-shrink:0;display:grid;place-items:center;font-weight:800;color:#fff;background:linear-gradient(135deg,#012158,#3485E9);font-size:1rem}
.sfpp-node .rl{font-size:.62rem;color:#8a94a6;text-transform:uppercase;letter-spacing:.05em;font-weight:800;margin-bottom:2px}
.sfpp-node .nm{font-size:.92rem;font-weight:700;color:#012158;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sfpp-node .tt{font-size:.78rem;color:#5b6b7f;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sfpp-reports-head{font-size:.72rem;font-weight:800;color:#012158;text-transform:uppercase;letter-spacing:.06em;text-align:center;margin:6px 0 14px}
.sfpp-reports{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}

.sfpp-tl{position:relative;padding:2px 0}
.sfpp-tl-item{position:relative;display:flex;gap:14px;padding-bottom:20px}
.sfpp-tl-item:last-child{padding-bottom:0}
.sfpp-tl-item::before{content:'';position:absolute;left:5px;top:16px;bottom:-4px;width:2px;background:#e5e8ec}
.sfpp-tl-item:last-child::before{display:none}
.sfpp-tl-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0;margin-top:4px;border:2px solid #fff;box-shadow:0 0 0 1px #e5e8ec;z-index:1}
.sfpp-tl-dot.job{background:#3485E9}
.sfpp-tl-dot.comp{background:#FD9C09}
.sfpp-tl-body{flex:1;min-width:0;background:#fafbfc;border:1px solid #eef1f5;border-radius:10px;padding:12px 14px}
.sfpp-tl-head{display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap}
.sfpp-tl-date{font-size:.9rem;font-weight:800;color:#012158}
.sfpp-tl-changes{display:flex;flex-direction:column;gap:6px}
.sfpp-chg{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.85rem}
.sfpp-chg .lbl{min-width:130px;color:#8a94a6;font-weight:800;font-size:.66rem;text-transform:uppercase;letter-spacing:.04em}
.sfpp-chg .from{color:#8a94a6;text-decoration:line-through}
.sfpp-chg .arrow{color:#3485E9;font-weight:800}
.sfpp-chg .to{color:#1f2733;font-weight:700}
.sfpp-tl-note{font-size:.82rem;color:#5b6b7f;font-style:italic;margin-top:8px}
.sfpp-tl-meta{font-size:.72rem;color:#8a94a6;margin-top:8px}

.sfpp-muted{color:#8a94a6;font-size:.88rem;padding:6px 0}
.sfpp-err{background:#fdeaea;color:#b3261e;border:1px solid #f5c6c6;padding:10px 14px;border-radius:8px;font-size:.85rem;margin-bottom:12px}

.sfpp-btn{appearance:none;border:1px solid #cfd8e3;background:#fff;color:#012158;font-weight:700;font-size:.85rem;padding:9px 16px;border-radius:8px;cursor:pointer;font-family:inherit}
.sfpp-btn.primary{background:#012158;color:#fff;border-color:#012158}
.sfpp-btn:disabled{opacity:.55;cursor:default}
.sfpp-mini{appearance:none;border:1px solid #cfd8e3;background:#fff;color:#012158;font-weight:700;font-size:.75rem;padding:5px 11px;border-radius:6px;cursor:pointer;font-family:inherit;text-decoration:none;display:inline-block}
.sfpp-mini.no{border-color:#f0c4c4;color:#b3261e}
.sfpp-mini:disabled{opacity:.55;cursor:default}
.sfpp-field{display:flex;flex-direction:column;gap:5px;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#5b6b7f}
.sfpp-field input,.sfpp-field select{font-family:inherit;font-size:.9rem;font-weight:500;text-transform:none;letter-spacing:normal;padding:8px 10px;border:1px solid #cfd8e3;border-radius:8px;color:#1f2733;background:#fff}

@media(max-width:860px){
  .sfpp-section{grid-template-columns:1fr;gap:10px;padding:18px 0}
  .sfpp-band-inner{flex-direction:column}
  .sfpp-side{flex-direction:row;align-self:stretch;justify-content:space-between;flex-wrap:wrap}
}
`;