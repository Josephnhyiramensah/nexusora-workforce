import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { exportTable, ExportButton } from '../utils/exporter';
import { ModuleShell } from '../ui/kit';
import {
  LayoutDashboard, Scale, FileWarning, ShieldAlert, Plus, Gavel,
  Clock, FileText, ChevronLeft, ChevronRight, Paperclip, MessageSquare,
} from 'lucide-react';

const C = { navy: '#012158', blue: '#3485E9', orange: '#FD9C09', green: '#1f9d57', red: '#e5484d',
  purple: '#7c5cdf', teal: '#17a2b8', ink: '#16233b', muted: '#8a94a6', line: '#e5e8ec', canvas: '#eef1f4', panel: '#f7f9fc' };
const MODULE = 'Employee Relations';

const CASE_TYPES = [['disciplinary', 'relations.ct_disciplinary'], ['grievance', 'relations.ct_grievance'], ['dispute', 'relations.ct_dispute'], ['query', 'relations.ct_query']];
const SEVERITY = [['na', 'relations.sv_na'], ['minor', 'relations.sv_minor'], ['serious', 'relations.sv_serious'], ['gross_misconduct', 'relations.sv_gross_misconduct']];
const SEV_COLOR = { na: C.muted, minor: C.teal, serious: C.orange, gross_misconduct: C.red };
const PRIORITY = [['low', 'relations.pr_low'], ['medium', 'relations.pr_medium'], ['high', 'relations.pr_high']];
const STATUS = {
  open: ['relations.st_open', C.blue], investigation: ['relations.st_investigation', C.orange], hearing: ['relations.st_hearing', C.purple],
  awaiting_decision: ['relations.st_awaiting_decision', '#b8760a'], closed: ['relations.st_closed', C.green], appealed: ['relations.st_appealed', C.red], withdrawn: ['relations.st_withdrawn', C.muted],
};
const SANCTIONS = [
  ['none', 'relations.sn_none'], ['exonerated', 'relations.sn_exonerated'], ['counseling', 'relations.sn_counseling'], ['verbal_warning', 'relations.sn_verbal_warning'],
  ['written_warning', 'relations.sn_written_warning'], ['final_written_warning', 'relations.sn_final_written_warning'], ['suspension', 'relations.sn_suspension'], ['demotion', 'relations.sn_demotion'], ['dismissal', 'relations.sn_dismissal'],
];
const SANCTION_COLOR = { none: C.muted, exonerated: C.green, counseling: C.teal, verbal_warning: '#b8960a', written_warning: C.orange, final_written_warning: '#e0740a', suspension: C.red, demotion: C.red, dismissal: C.red };
const APPEAL_OUTCOME = [['', 'relations.ao_pending'], ['upheld', 'relations.ao_upheld'], ['dismissed', 'relations.ao_dismissed'], ['modified', 'relations.ao_modified']];
const DISC_CATS = ['Absenteeism', 'Lateness / Time-keeping', 'Insubordination', 'Misconduct', 'Negligence of duty', 'Theft / Fraud', 'Dishonesty', 'Harassment', 'Assault / Violence', 'Safety violation', 'Poor performance', 'Policy breach', 'Substance abuse', 'Absconding', 'Other'];
const GRIEV_CATS = ['Unfair treatment', 'Harassment / Bullying', 'Discrimination', 'Pay & benefits', 'Working conditions', 'Workload', 'Manager conduct', 'Wrongful sanction', 'Other'];
const CAT_LABEL = {
  'Absenteeism': 'relations.cat_absenteeism', 'Lateness / Time-keeping': 'relations.cat_lateness', 'Insubordination': 'relations.cat_insubordination',
  'Misconduct': 'relations.cat_misconduct', 'Negligence of duty': 'relations.cat_negligence', 'Theft / Fraud': 'relations.cat_theft_fraud',
  'Dishonesty': 'relations.cat_dishonesty', 'Harassment': 'relations.cat_harassment', 'Assault / Violence': 'relations.cat_assault_violence',
  'Safety violation': 'relations.cat_safety_violation', 'Poor performance': 'relations.cat_poor_performance', 'Policy breach': 'relations.cat_policy_breach',
  'Substance abuse': 'relations.cat_substance_abuse', 'Absconding': 'relations.cat_absconding', 'Other': 'relations.cat_other',
  'Unfair treatment': 'relations.cat_unfair_treatment', 'Harassment / Bullying': 'relations.cat_harassment_bullying', 'Discrimination': 'relations.cat_discrimination',
  'Pay & benefits': 'relations.cat_pay_benefits', 'Working conditions': 'relations.cat_working_conditions', 'Workload': 'relations.cat_workload',
  'Manager conduct': 'relations.cat_manager_conduct', 'Wrongful sanction': 'relations.cat_wrongful_sanction',
};

const label = (arr, k, t) => { const raw = (arr.find((x) => x[0] === k) || [k, k])[1]; return t ? t(raw) : raw; };
const statusTag = (k, t) => { const s = STATUS[k]; return s ? [t(s[0]), s[1]] : null; };
const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDT = (d) => d ? new Date(d).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fullName = (e) => e ? `${e.firstName || ''} ${e.lastName || ''}`.trim() || '—' : '—';
const cap = (s) => s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).replace(/_/g, ' ') : '';

function useEmployees() {
  const [list, setList] = useState([]);
  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get('/employees', { params: { limit: 1000 } }); if (a) setList(data.items || []); } catch { /* */ } })(); return () => { a = false; }; }, []);
  return list;
}

/* ============================ ROOT ============================ */
export default function EmployeeRelationsPage() {
  const { t } = useLocale();
  const { user } = useAuth();
  const canWrite = ['super_admin', 'hr_manager', 'hr_officer', 'ir_officer'].includes(user?.role);
  const [section, setSection] = useState('overview');
  const [openCase, setOpenCase] = useState(null);
  const [drill, setDrill] = useState(null);   // { type, status } for the case register
  const [msg, setMsg] = useState('');

  const groups = [
    { title: t('relations.module'), items: [
      { key: 'overview', label: t('relations.nav_overview'), Icon: LayoutDashboard },
      { key: 'cases', label: t('relations.nav_caseRegister'), Icon: Scale },
      { key: 'warnings', label: t('relations.nav_warningsRegister'), Icon: FileWarning },
    ] },
  ];

  function pick(k) { setSection(k); setOpenCase(null); setDrill(null); }
  function drillTo(sec, filter) { setDrill(filter || null); setOpenCase(null); setSection(sec); }

  return (
    <ModuleShell brand={{ title: t('relations.module'), subtitle: t('relations.brandSub'), Icon: Scale }} groups={groups} active={openCase ? 'cases' : section} onSelect={pick}>
      <div style={{ padding: '0 30px 48px', minWidth: 0 }}>
        {msg && <Note onClose={() => setMsg('')}>{msg}</Note>}
        {openCase ? <CaseFile id={openCase} canWrite={canWrite} onBack={() => setOpenCase(null)} setMsg={setMsg} />
          : <>
            {section === 'overview' && <Overview onDrill={drillTo} />}
            {section === 'cases' && <CaseRegister canWrite={canWrite} onOpen={setOpenCase} initial={drill} />}
            {section === 'warnings' && <WarningsRegister />}
          </>}
      </div>
    </ModuleShell>
  );
}

/* ---- light-blue hero (kit-consistent) ---- */
function Hero({ crumbs, title, subtitle, action, onBack, backLabel }) {
  const { t } = useLocale();
  return (
    <section style={{ margin: '0 -30px 22px', background: 'radial-gradient(1200px 200px at 88% -40%, rgba(22,142,255,.16), transparent 60%), linear-gradient(120deg,#aed9f3 0%,#dff0fa 46%,#eef7fd 100%)', padding: '20px 30px 26px', position: 'relative' }}>
      {onBack && <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,.6)', border: '1px solid rgba(255,255,255,.9)', borderRadius: 8, color: C.navy, fontWeight: 700, fontSize: '.78rem', padding: '5px 11px', cursor: 'pointer', marginBottom: 12 }}><ChevronLeft size={14} /> {backLabel || t('relations.back')}</button>}
      {crumbs && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#2b4a74', fontSize: '.76rem', fontWeight: 600, marginBottom: 8, flexWrap: 'wrap' }}>{t('relations.module')} <span style={{ opacity: .6 }}>›</span> <span>{crumbs}</span></div>}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#062a55', letterSpacing: '-.02em', lineHeight: 1.1 }}>{title}</div>
          {subtitle && <div style={{ fontSize: '.9rem', color: '#28466f', marginTop: 6 }}>{subtitle}</div>}
        </div>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>
    </section>
  );
}
function AddBtn({ onClick, children }) { return <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', border: 'none', borderRadius: 10, background: C.navy, color: '#fff', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(1,33,88,.22)' }}><Plus size={16} /> {children}</button>; }

/* ============================ OVERVIEW (KPI drill-downs) ============================ */
function Overview({ onDrill }) {
  const { t } = useLocale();
  const [o, setO] = useState(null);
  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get('/relations/overview'); if (a) setO(data); } catch { /* */ } })(); return () => { a = false; }; }, []);
  return (
    <div>
      <Hero crumbs={t('relations.nav_overview')} title={t('relations.overviewTitle')} subtitle={t('relations.overviewSub')} />
      {!o ? <div style={{ color: C.muted, padding: 40 }}>{t('common.loading')}</div> : <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
          <DrillKpi Icon={Scale} label={t('relations.kpiOpenCases')} value={o.totals.open} sub={t('relations.kpiTotal', { n: o.totals.all })} color={o.totals.open ? C.orange : C.green} onClick={() => onDrill('cases', { status: 'open' })} />
          <DrillKpi Icon={ShieldAlert} label={t('relations.ct_disciplinary')} value={o.totals.disciplinary} sub={t('relations.allTime')} color={C.navy} onClick={() => onDrill('cases', { type: 'disciplinary' })} />
          <DrillKpi Icon={MessageSquare} label={t('relations.kpiGrievances')} value={o.totals.grievance} sub={t('relations.allTime')} color={C.blue} onClick={() => onDrill('cases', { type: 'grievance' })} />
          <DrillKpi Icon={FileWarning} label={t('relations.kpiActiveWarnings')} value={o.totals.activeWarnings} sub={t('relations.notYetLapsed')} color={o.totals.activeWarnings ? C.orange : C.green} onClick={() => onDrill('warnings')} />
          <DrillKpi Icon={Clock} label={t('relations.kpiAgeing')} value={o.totals.ageingOpen} sub={t('relations.openOverdue')} color={o.totals.ageingOpen ? C.red : C.green} onClick={() => onDrill('cases', { status: 'open' })} />
          <DrillKpi Icon={Gavel} label={t('relations.kpiUnderAppeal')} value={o.totals.appealed} sub={t('relations.awaitingAppealOutcome')} color={o.totals.appealed ? C.red : C.green} onClick={() => onDrill('cases', { status: 'appealed' })} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <Card title={t('relations.casesByStatus')} sub={t('relations.clickRowStatus')}>
            {o.byStatus.length === 0 ? <Empty>{t('relations.noCasesYet')}</Empty> : o.byStatus.map((s) => { const st = STATUS[s.label]; const l = st ? t(st[0]) : s.label; const c = st ? st[1] : C.muted; const max = Math.max(...o.byStatus.map((x) => x.value), 1); return (
              <button key={s.label} onClick={() => onDrill('cases', { status: s.label })} className="nx-row" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', padding: '5px 6px', borderRadius: 8, textAlign: 'left' }}>
                <span style={{ width: 130, fontSize: '.8rem', color: C.ink }}>{l}</span>
                <div style={{ flex: 1, height: 10, background: '#eef2f8', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${(s.value / max) * 100}%`, height: '100%', background: c }} /></div>
                <span style={{ width: 28, textAlign: 'right', fontWeight: 800, color: C.navy, fontSize: '.82rem' }}>{s.value}</span>
                <ChevronRight size={14} color={C.muted} />
              </button>
            ); })}
          </Card>
          <Card title={t('relations.topDiscCategories')} sub={t('relations.clickViewDisc')}>
            {o.byCategory.length === 0 ? <Empty>{t('relations.noDiscCasesYet')}</Empty> : o.byCategory.map((s) => { const max = Math.max(...o.byCategory.map((x) => x.value), 1); return (
              <button key={s.label} onClick={() => onDrill('cases', { type: 'disciplinary' })} className="nx-row" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', padding: '5px 6px', borderRadius: 8, textAlign: 'left' }}>
                <span style={{ width: 150, fontSize: '.8rem', color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{CAT_LABEL[s.label] ? t(CAT_LABEL[s.label]) : s.label}</span>
                <div style={{ flex: 1, height: 10, background: '#eef2f8', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${(s.value / max) * 100}%`, height: '100%', background: C.navy }} /></div>
                <span style={{ width: 28, textAlign: 'right', fontWeight: 800, color: C.navy, fontSize: '.82rem' }}>{s.value}</span>
                <ChevronRight size={14} color={C.muted} />
              </button>
            ); })}
          </Card>
        </div>
      </>}
    </div>
  );
}

/* ============================ CASE REGISTER ============================ */
function CaseRegister({ canWrite, onOpen, initial }) {
  const { t } = useLocale();
  const [items, setItems] = useState(null);
  const [type, setType] = useState(initial?.type || 'all'); const [status, setStatus] = useState(initial?.status || 'all'); const [q, setQ] = useState('');
  const [modal, setModal] = useState(false); const [reload, setReload] = useState(0);

  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get('/relations/cases', { params: { type, status, q } }); if (a) setItems(data.items || []); } catch { if (a) setItems([]); } })(); return () => { a = false; }; }, [type, status, q, reload]);

  function exportCases() {
    exportTable({
      filename: 'ER_Case_Register.xlsx', sheet: 'Cases', title: t('relations.exportCaseRegTitle'), subtitle: t('relations.exportCaseRegSub'),
      filters: { [t('common.type')]: type === 'all' ? t('common.all') : label(CASE_TYPES, type, t), [t('common.status')]: status === 'all' ? t('common.all') : (STATUS[status] ? t(STATUS[status][0]) : status) },
      columns: [
        { label: t('relations.colCaseNo'), key: 'no', width: 16 }, { label: t('relations.employee'), key: 'emp', width: 24 }, { label: t('common.type'), key: 'type', width: 14 },
        { label: t('relations.category'), key: 'cat', width: 22 }, { label: t('relations.severity'), key: 'sev', width: 15, align: 'center', color: (v, r) => SEV_COLOR[r.sevKey] },
        { label: t('common.status'), key: 'stat', width: 16, align: 'center', color: (v, r) => (STATUS[r.statKey] || [null, C.muted])[1] },
        { label: t('relations.assignedTo'), key: 'assigned', width: 20 }, { label: t('relations.reported'), key: 'reported', width: 14 },
      ],
      rows: (items || []).map((c) => ({
        no: c.caseNumber, emp: fullName(c.employee), type: label(CASE_TYPES, c.type, t), cat: c.category,
        sev: label(SEVERITY, c.severity, t), sevKey: c.severity, stat: (STATUS[c.status] ? t(STATUS[c.status][0]) : c.status), statKey: c.status,
        assigned: fullName(c.assignedTo), reported: fmtDate(c.dateReported),
      })),
    });
  }

  return (
    <div>
      <Hero crumbs={t('relations.nav_caseRegister')} title={t('relations.nav_caseRegister')} subtitle={t('relations.caseRegisterSub')}
        action={<div style={{ display: 'flex', gap: 8 }}>{items && items.length > 0 && <ExportButton onClick={exportCases} />}{canWrite && <AddBtn onClick={() => setModal(true)}>{t('relations.newCase')}</AddBtn>}</div>} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={type} onChange={(e) => setType(e.target.value)} style={ctrl()}><option value="all">{t('relations.allTypes')}</option>{CASE_TYPES.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={ctrl()}><option value="all">{t('relations.allStatuses')}</option>{Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{t(l[0])}</option>)}</select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('relations.searchCasePlaceholder')} style={{ ...ctrl(), minWidth: 220 }} />
        {(type !== 'all' || status !== 'all') && <button onClick={() => { setType('all'); setStatus('all'); }} style={{ ...ctrl(), color: C.blue, fontWeight: 700 }}>{t('relations.clearFilters')}</button>}
      </div>
      {!items ? <div style={{ color: C.muted, padding: 40 }}>{t('common.loading')}</div> : items.length === 0 ? <Empty>{t('relations.noCasesFound')}</Empty> : (
        <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'auto', boxShadow: '0 1px 2px rgba(1,33,88,.05)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{[t('relations.colCaseNo'), t('relations.employee'), t('common.type'), t('relations.category'), t('relations.severity'), t('common.status'), t('relations.colAssigned'), t('relations.reported'), ''].map((h, i) => <th key={i} style={th()}>{h}</th>)}</tr></thead>
            <tbody>
              {items.map((c, i) => (
                <tr key={c._id} onClick={() => onOpen(c._id)} style={{ borderTop: `1px solid ${C.line}`, background: i % 2 ? '#fafbfe' : '#fff', cursor: 'pointer' }}>
                  <td style={{ ...td(), fontWeight: 700, color: C.navy }}>{c.caseNumber}{c.confidential && <span title={t('relations.confidential')} style={{ marginLeft: 6, color: C.red }}>●</span>}</td>
                  <td style={td()}>{fullName(c.employee)}{c.employee?.staffId ? <span style={{ color: C.muted }}> · {c.employee.staffId}</span> : ''}</td>
                  <td style={td()}>{label(CASE_TYPES, c.type, t)}</td>
                  <td style={td()}>{c.category}</td>
                  <td style={td()}><Tag t={[label(SEVERITY, c.severity, t), SEV_COLOR[c.severity]]} /></td>
                  <td style={td()}><Tag t={statusTag(c.status, t)} /></td>
                  <td style={td()}>{fullName(c.assignedTo)}</td>
                  <td style={td()}>{fmtDate(c.dateReported)}</td>
                  <td style={{ ...td(), textAlign: 'right' }}><ChevronRight size={15} color={C.muted} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && <NewCaseModal onClose={() => setModal(false)} onSaved={(id) => { setModal(false); setReload((n) => n + 1); onOpen(id); }} />}
    </div>
  );
}

function NewCaseModal({ onClose, onSaved }) {
  const { t } = useLocale();
  const employees = useEmployees();
  const [f, setF] = useState({ type: 'disciplinary', employee: '', against: '', category: '', customCat: '', severity: 'minor', priority: 'medium', dateOfIncident: '', location: '', description: '', assignedTo: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const cats = f.type === 'grievance' ? GRIEV_CATS : DISC_CATS;
  const CASE_TYPES_T = CASE_TYPES.map(([v, l]) => [v, t(l)]);
  const PRIORITY_T = PRIORITY.map(([v, l]) => [v, t(l)]);
  const SEVERITY_T = SEVERITY.map(([v, l]) => [v, t(l)]);
  async function submit() {
    const category = f.category === 'Other' ? f.customCat.trim() : f.category;
    if (!f.employee) { setErr(t('relations.errSelectEmployee')); return; }
    if (!category) { setErr(t('relations.errSelectCategory')); return; }
    setBusy(true); setErr('');
    const payload = { type: f.type, employee: f.employee, against: f.against || null, category, severity: f.severity, priority: f.priority, dateOfIncident: f.dateOfIncident || null, location: f.location, description: f.description, assignedTo: f.assignedTo || null };
    try { const { data } = await api.post('/relations/cases', payload); onSaved(data._id); }
    catch (e) { setErr(e?.response?.data?.message || t('relations.errCreateCase')); } finally { setBusy(false); }
  }
  return (
    <Overlay onClose={onClose} wide>
      <h2 style={h2()}>{t('relations.newCaseModalTitle')}</h2>
      {err && <ErrBox>{err}</ErrBox>}
      <Row2>
        <Sel label={t('relations.caseType')} value={f.type} onChange={(v) => setF({ ...f, type: v, category: '' })} options={CASE_TYPES_T} />
        <Sel label={t('relations.priority')} value={f.priority} onChange={(v) => setF({ ...f, priority: v })} options={PRIORITY_T} />
      </Row2>
      <Row2>
        <div><Lbl>{f.type === 'grievance' ? t('relations.complainant') : t('relations.employee')}</Lbl><select value={f.employee} onChange={(e) => setF({ ...f, employee: e.target.value })} style={inp()}><option value="">{t('relations.selectPlaceholder')}</option>{employees.map((e) => <option key={e._id} value={e._id}>{fullName(e)}{e.staffId ? ` · ${e.staffId}` : ''}</option>)}</select></div>
        {f.type === 'grievance'
          ? <div><Lbl>{t('relations.againstRespondent')}</Lbl><select value={f.against} onChange={(e) => setF({ ...f, against: e.target.value })} style={inp()}><option value="">—</option>{employees.map((e) => <option key={e._id} value={e._id}>{fullName(e)}</option>)}</select></div>
          : <Sel label={t('relations.severity')} value={f.severity} onChange={(v) => setF({ ...f, severity: v })} options={SEVERITY_T} />}
      </Row2>
      <Row2>
        <div><Lbl>{f.type === 'grievance' ? t('relations.categoryIssue') : t('relations.categoryOffence')}</Lbl><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={inp()}><option value="">{t('relations.selectPlaceholder')}</option>{cats.map((c) => <option key={c} value={c}>{CAT_LABEL[c] ? t(CAT_LABEL[c]) : c}</option>)}</select></div>
        <div><Lbl>{t('relations.assignedOfficer')}</Lbl><select value={f.assignedTo} onChange={(e) => setF({ ...f, assignedTo: e.target.value })} style={inp()}><option value="">—</option>{employees.map((e) => <option key={e._id} value={e._id}>{fullName(e)}</option>)}</select></div>
      </Row2>
      {f.category === 'Other' && <Field label={t('relations.specifyCategory')} value={f.customCat} onChange={(v) => setF({ ...f, customCat: v })} />}
      <Row2>
        <Field label={t('relations.dateOfIncident')} type="date" value={f.dateOfIncident} onChange={(v) => setF({ ...f, dateOfIncident: v })} />
        <Field label={t('relations.location')} value={f.location} onChange={(v) => setF({ ...f, location: v })} />
      </Row2>
      <Lbl>{t('relations.description')}</Lbl>
      <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} style={ta()} />
      <Actions onClose={onClose} onSubmit={submit} busy={busy} label={t('relations.openCase')} />
    </Overlay>
  );
}

/* ============================ CASE FILE ============================ */
function CaseFile({ id, canWrite, onBack, setMsg }) {
  const { t } = useLocale();
  const [c, setC] = useState(null);
  const [tab, setTab] = useState('details');
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((n) => n + 1), []);
  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get(`/relations/cases/${id}`); if (a) setC(data); } catch { /* */ } })(); return () => { a = false; }; }, [id, reload]);

  if (!c) return <div style={{ color: C.muted, padding: 40 }}>{t('common.loading')}</div>;
  const TABS = [['details', t('relations.tabDetails'), FileText], ['timeline', t('relations.tabTimeline'), Clock], ['hearing', t('relations.tabHearing'), Gavel], ['sanction', t('relations.tabSanction'), ShieldAlert], ['documents', t('relations.tabDocuments'), Paperclip]];
  const statusEl = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Tag t={[label(CASE_TYPES, c.type, t), C.navy]} /><Tag t={statusTag(c.status, t)} />
      {c.type === 'disciplinary' && <Tag t={[label(SEVERITY, c.severity, t), SEV_COLOR[c.severity]]} />}
      {c.confidential && <span style={{ background: '#fdecec', color: C.red, fontWeight: 700, fontSize: '.66rem', padding: '3px 9px', borderRadius: 999 }}>{t('relations.confidentialCaps')}</span>}
    </div>
  );

  return (
    <div>
      <Hero onBack={onBack} backLabel={t('relations.backToRegister')}
        crumbs={<>{t('relations.nav_caseRegister')} <span style={{ opacity: .6 }}>›</span> {c.caseNumber}</>}
        title={c.caseNumber}
        subtitle={`${fullName(c.employee)}${c.employee?.staffId ? ` · ${c.employee.staffId}` : ''} · ${c.category} · ${t('relations.reportedInline')} ${fmtDate(c.dateReported)}`}
        action={<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>{statusEl}{canWrite && <StatusChanger current={c.status} onChange={async (s) => { await api.put(`/relations/cases/${id}`, { status: s }); setMsg(t('relations.msgStatusUpdated')); refresh(); }} />}</div>} />

      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.line}`, marginBottom: 18, flexWrap: 'wrap' }}>
        {TABS.map(([k, l, I]) => <button key={k} onClick={() => setTab(k)} style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: '9px 14px', fontWeight: 700, fontSize: '.84rem', color: tab === k ? C.navy : C.muted, display: 'inline-flex', alignItems: 'center', gap: 6 }}><I size={15} /> {l}{tab === k && <span style={{ position: 'absolute', left: 8, right: 8, bottom: -1, height: 3, background: C.blue, borderRadius: 3 }} />}</button>)}
      </div>

      {tab === 'details' && <DetailsTab c={c} canWrite={canWrite} onSaved={() => { setMsg(t('relations.msgCaseUpdated')); refresh(); }} />}
      {tab === 'timeline' && <TimelineTab c={c} canWrite={canWrite} onSaved={refresh} />}
      {tab === 'hearing' && <HearingTab c={c} canWrite={canWrite} onSaved={() => { setMsg(t('relations.msgHearingSaved')); refresh(); }} />}
      {tab === 'sanction' && <SanctionTab c={c} canWrite={canWrite} onSaved={() => { setMsg(t('relations.msgSaved')); refresh(); }} />}
      {tab === 'documents' && <DocumentsTab c={c} canWrite={canWrite} onSaved={refresh} />}
    </div>
  );
}

function StatusChanger({ current, onChange }) {
  const { t } = useLocale();
  return <select value={current} onChange={(e) => onChange(e.target.value)} style={{ ...ctrl(), fontWeight: 700, color: C.navy, background: 'rgba(255,255,255,.85)' }}>
    {Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{t(l[0])}</option>)}
  </select>;
}

function DetailsTab({ c, canWrite, onSaved }) {
  const { t } = useLocale();
  const employees = useEmployees();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ category: c.category, severity: c.severity, priority: c.priority, dateOfIncident: c.dateOfIncident ? c.dateOfIncident.slice(0, 10) : '', location: c.location || '', description: c.description || '', assignedTo: c.assignedTo?._id || c.assignedTo || '', confidential: !!c.confidential, outcomeSummary: c.outcomeSummary || '' });
  const [busy, setBusy] = useState(false);
  const SEVERITY_T = SEVERITY.map(([v, l]) => [v, t(l)]);
  const PRIORITY_T = PRIORITY.map(([v, l]) => [v, t(l)]);
  async function save() { setBusy(true); try { await api.put(`/relations/cases/${c._id}`, { ...f, dateOfIncident: f.dateOfIncident || null, assignedTo: f.assignedTo || null }); setEdit(false); onSaved(); } catch { /* */ } finally { setBusy(false); } }
  if (edit) return (
    <Card title={t('relations.editCaseDetails')}>
      <Row2><div><Lbl>{t('relations.category')}</Lbl><input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={inp()} /></div><Sel label={t('relations.severity')} value={f.severity} onChange={(v) => setF({ ...f, severity: v })} options={SEVERITY_T} /></Row2>
      <Row2><Sel label={t('relations.priority')} value={f.priority} onChange={(v) => setF({ ...f, priority: v })} options={PRIORITY_T} /><Field label={t('relations.dateOfIncident')} type="date" value={f.dateOfIncident} onChange={(v) => setF({ ...f, dateOfIncident: v })} /></Row2>
      <Row2><Field label={t('relations.location')} value={f.location} onChange={(v) => setF({ ...f, location: v })} /><div><Lbl>{t('relations.assignedOfficer')}</Lbl><select value={f.assignedTo} onChange={(e) => setF({ ...f, assignedTo: e.target.value })} style={inp()}><option value="">—</option>{employees.map((e) => <option key={e._id} value={e._id}>{fullName(e)}</option>)}</select></div></Row2>
      <Lbl>{t('relations.description')}</Lbl><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} style={ta()} />
      <Lbl>{t('relations.outcomeSummary')}</Lbl><textarea value={f.outcomeSummary} onChange={(e) => setF({ ...f, outcomeSummary: e.target.value })} rows={2} style={ta()} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', color: C.ink, marginBottom: 12 }}><input type="checkbox" checked={f.confidential} onChange={(e) => setF({ ...f, confidential: e.target.checked })} /> {t('relations.markConfidential')}</label>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}><button onClick={() => setEdit(false)} style={ghostBtn()}>{t('common.cancel')}</button><button onClick={save} disabled={busy} style={primaryBtn()}>{busy ? t('common.saving') : t('common.save')}</button></div>
    </Card>
  );
  return (
    <Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        <Info label={t('relations.category')} value={c.category} /><Info label={t('relations.severity')} value={label(SEVERITY, c.severity, t)} /><Info label={t('relations.priority')} value={cap(c.priority)} />
        <Info label={t('relations.dateOfIncident')} value={fmtDate(c.dateOfIncident)} /><Info label={t('relations.location')} value={c.location || '—'} /><Info label={t('relations.assignedOfficer')} value={fullName(c.assignedTo)} />
        {c.against && <Info label={t('relations.respondent')} value={fullName(c.against)} />}
      </div>
      <div style={{ marginTop: 14 }}><Lbl>{t('relations.description')}</Lbl><div style={{ fontSize: '.88rem', color: C.ink, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{c.description || '—'}</div></div>
      {c.outcomeSummary && <div style={{ marginTop: 14 }}><Lbl>{t('relations.outcomeSummary')}</Lbl><div style={{ fontSize: '.88rem', color: C.ink, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{c.outcomeSummary}</div></div>}
      {canWrite && <div style={{ marginTop: 16, textAlign: 'right' }}><button onClick={() => setEdit(true)} style={ghostBtn()}>{t('relations.editDetails')}</button></div>}
    </Card>
  );
}

function TimelineTab({ c, canWrite, onSaved }) {
  const { t } = useLocale();
  const [note, setNote] = useState(''); const [action, setAction] = useState(''); const [busy, setBusy] = useState(false);
  const events = (c.timeline || []).slice().reverse();
  async function add() { if (!note.trim() && !action.trim()) return; setBusy(true); try { await api.post(`/relations/cases/${c._id}/timeline`, { action: action.trim() || 'Note', note: note.trim() }); setNote(''); setAction(''); onSaved(); } catch { /* */ } finally { setBusy(false); } }
  return (
    <div>
      {canWrite && <Card title={t('relations.addToCaseLog')}>
        <Row2><Field label={t('relations.action')} value={action} onChange={setAction} placeholder={t('relations.phStatementTaken')} /><div /></Row2>
        <Lbl>{t('relations.note')}</Lbl><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={ta()} />
        <div style={{ textAlign: 'right' }}><button onClick={add} disabled={busy} style={primaryBtn()}>{busy ? t('relations.adding') : t('relations.addEntry')}</button></div>
      </Card>}
      <div style={{ marginTop: 16 }}>
        {events.length === 0 ? <Empty>{t('relations.noTimelineEntries')}</Empty> : events.map((e, i) => (
          <div key={e._id || i} style={{ display: 'flex', gap: 12, paddingBottom: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 12, height: 12, borderRadius: 999, background: i === 0 ? C.blue : '#cbd6e6', marginTop: 4 }} />
              {i < events.length - 1 && <div style={{ flex: 1, width: 2, background: C.line, marginTop: 2 }} />}
            </div>
            <div style={{ flex: 1, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, marginBottom: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><span style={{ fontWeight: 700, color: C.navy, fontSize: '.85rem' }}>{e.action}</span><span style={{ color: C.muted, fontSize: '.72rem' }}>{fmtDT(e.at)}</span></div>
              {e.note && <div style={{ color: C.ink, fontSize: '.82rem', marginTop: 4 }}>{e.note}</div>}
              {e.byName && <div style={{ color: C.muted, fontSize: '.72rem', marginTop: 4 }}>{t('relations.byName', { name: e.byName })}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HearingTab({ c, canWrite, onSaved }) {
  const { t } = useLocale();
  const h = c.hearing || {};
  const [f, setF] = useState({ scheduled: h.scheduled ? h.scheduled.slice(0, 16) : '', venue: h.venue || '', panel: (h.panel || []).join(', '), heldOn: h.heldOn ? h.heldOn.slice(0, 16) : '', minutes: h.minutes || '', outcome: h.outcome || '' });
  const [busy, setBusy] = useState(false);
  async function save() { setBusy(true); try { await api.put(`/relations/cases/${c._id}/hearing`, { scheduled: f.scheduled || null, venue: f.venue, panel: f.panel, heldOn: f.heldOn || null, minutes: f.minutes, outcome: f.outcome }); onSaved(); } catch { /* */ } finally { setBusy(false); } }
  return (
    <Card title={t('relations.hearingTitle')}>
      <Row2><Field label={t('relations.scheduledFor')} type="datetime-local" value={f.scheduled} onChange={(v) => setF({ ...f, scheduled: v })} /><Field label={t('relations.venue')} value={f.venue} onChange={(v) => setF({ ...f, venue: v })} /></Row2>
      <Field label={t('relations.panelMembers')} value={f.panel} onChange={(v) => setF({ ...f, panel: v })} placeholder={t('relations.phPanel')} />
      <Row2><Field label={t('relations.heldOn')} type="datetime-local" value={f.heldOn} onChange={(v) => setF({ ...f, heldOn: v })} /><Field label={t('relations.outcome')} value={f.outcome} onChange={(v) => setF({ ...f, outcome: v })} placeholder={t('relations.phOutcome')} /></Row2>
      <Lbl>{t('relations.minutesNotes')}</Lbl><textarea value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} rows={4} style={ta()} />
      {canWrite && <div style={{ textAlign: 'right' }}><button onClick={save} disabled={busy} style={primaryBtn()}>{busy ? t('common.saving') : t('relations.saveHearing')}</button></div>}
    </Card>
  );
}

function SanctionTab({ c, canWrite, onSaved }) {
  const { t } = useLocale();
  const s = c.sanction || {}; const ap = c.appeal || {};
  const [f, setF] = useState({ outcome: s.outcome || 'none', issuedDate: s.issuedDate ? s.issuedDate.slice(0, 10) : '', effectiveDate: s.effectiveDate ? s.effectiveDate.slice(0, 10) : '', expiryDate: s.expiryDate ? s.expiryDate.slice(0, 10) : '', suspensionDays: s.suspensionDays || '', details: s.details || '' });
  const [a, setA] = useState({ grounds: ap.grounds || '', outcome: ap.outcome || '', notes: ap.notes || '' });
  const [busy, setBusy] = useState(false); const [busyA, setBusyA] = useState(false);
  const isWarning = ['verbal_warning', 'written_warning', 'final_written_warning'].includes(f.outcome);
  const SANCTIONS_T = SANCTIONS.map(([v, l]) => [v, t(l)]);
  const APPEAL_OUTCOME_T = APPEAL_OUTCOME.map(([v, l]) => [v, t(l)]);
  async function saveSanction() { setBusy(true); try { await api.put(`/relations/cases/${c._id}/sanction`, { ...f, suspensionDays: Number(f.suspensionDays) || 0, issuedDate: f.issuedDate || null, effectiveDate: f.effectiveDate || null, expiryDate: f.expiryDate || null }); onSaved(); } catch { /* */ } finally { setBusy(false); } }
  async function saveAppeal(withOutcome) { setBusyA(true); try { await api.put(`/relations/cases/${c._id}/appeal`, { lodged: true, grounds: a.grounds, outcome: withOutcome ? a.outcome : '', notes: a.notes }); onSaved(); } catch { /* */ } finally { setBusyA(false); } }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
      <Card title={t('relations.sanctionDecision')}>
        <div style={{ background: '#eef4ff', border: '1px solid #d5e3fb', borderRadius: 9, padding: '8px 11px', fontSize: '.76rem', color: '#0f3d78', marginBottom: 12 }}>{t('relations.progressiveHint')}</div>
        <Sel label={t('relations.outcome')} value={f.outcome} onChange={(v) => setF({ ...f, outcome: v })} options={SANCTIONS_T} />
        <Row2><Field label={t('relations.issuedDate')} type="date" value={f.issuedDate} onChange={(v) => setF({ ...f, issuedDate: v })} /><Field label={t('relations.effectiveDate')} type="date" value={f.effectiveDate} onChange={(v) => setF({ ...f, effectiveDate: v })} /></Row2>
        <Row2>
          {isWarning && <Field label={t('relations.expiryWarning')} type="date" value={f.expiryDate} onChange={(v) => setF({ ...f, expiryDate: v })} />}
          {f.outcome === 'suspension' && <Field label={t('relations.suspensionDays')} type="number" value={f.suspensionDays} onChange={(v) => setF({ ...f, suspensionDays: v })} />}
        </Row2>
        <Lbl>{t('relations.details')}</Lbl><textarea value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} rows={2} style={ta()} />
        {canWrite && <div style={{ textAlign: 'right' }}><button onClick={saveSanction} disabled={busy} style={primaryBtn()}>{busy ? t('common.saving') : t('relations.recordSanction')}</button></div>}
      </Card>
      <Card title={t('relations.appeal')}>
        {ap.lodged && <div style={{ marginBottom: 10 }}><Tag t={[ap.outcome ? t('relations.appealWith', { outcome: label(APPEAL_OUTCOME, ap.outcome, t) }) : t('relations.appealLodged'), ap.outcome === 'upheld' ? C.green : ap.outcome === 'dismissed' ? C.red : C.orange]} /> <span style={{ color: C.muted, fontSize: '.74rem' }}>{fmtDate(ap.lodgedDate)}</span></div>}
        <Lbl>{t('relations.groundsOfAppeal')}</Lbl><textarea value={a.grounds} onChange={(e) => setA({ ...a, grounds: e.target.value })} rows={2} style={ta()} />
        <Sel label={t('relations.appealOutcome')} value={a.outcome} onChange={(v) => setA({ ...a, outcome: v })} options={APPEAL_OUTCOME_T} />
        <Lbl>{t('relations.notes')}</Lbl><textarea value={a.notes} onChange={(e) => setA({ ...a, notes: e.target.value })} rows={2} style={ta()} />
        {canWrite && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={() => saveAppeal(false)} disabled={busyA} style={ghostBtn()}>{t('relations.lodgeAppeal')}</button>
          <button onClick={() => saveAppeal(true)} disabled={busyA || !a.outcome} style={primaryBtn()}>{t('relations.recordOutcome')}</button>
        </div>}
      </Card>
    </div>
  );
}

function DocumentsTab({ c, canWrite, onSaved }) {
  const { t } = useLocale();
  const [file, setFile] = useState(null); const [kind, setKind] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [preview, setPreview] = useState(null);
  async function upload() { if (!file) return; setBusy(true); setErr(''); try { const fd = new FormData(); fd.append('file', file); if (kind) fd.append('kind', kind); await api.post(`/relations/cases/${c._id}/documents`, fd); setFile(null); setKind(''); onSaved(); } catch (e) { setErr(e?.response?.data?.message || t('relations.errUploadFailed')); } finally { setBusy(false); } }
  async function del(d) { if (!window.confirm(t('relations.confirmDeleteDoc'))) return; try { await api.delete(`/relations/cases/${c._id}/documents/${d._id}`); onSaved(); } catch { /* */ } }
  return (
    <div>
      {canWrite && <Card title={t('relations.addDocument')}>
        {err && <ErrBox>{err}</ErrBox>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
          <div><Lbl>{t('relations.file')}</Lbl><input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ fontSize: '.82rem' }} /></div>
          <Field label={t('relations.kind')} value={kind} onChange={setKind} placeholder={t('relations.phKind')} />
          <button onClick={upload} disabled={busy || !file} style={{ ...primaryBtn(), opacity: busy || !file ? 0.6 : 1 }}>{busy ? t('common.uploading') : t('common.upload')}</button>
        </div>
      </Card>}
      <div style={{ marginTop: 16 }}>
        {(c.documents || []).length === 0 ? <Empty>{t('relations.noDocuments')}</Empty> : (
          <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{[t('relations.colDocument'), t('relations.kind'), t('relations.colAdded'), ''].map((h, i) => <th key={i} style={th()}>{h}</th>)}</tr></thead>
              <tbody>
                {(c.documents || []).map((d) => (
                  <tr key={d._id} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td style={td()}>{d.name}</td><td style={{ ...td(), textTransform: 'capitalize' }}>{d.kind || '—'}</td><td style={td()}>{fmtDate(d.uploadedAt)}</td>
                    <td style={{ ...td(), textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => setPreview(d)} style={miniBtn(C.blue)}>{t('common.preview')}</button>{' '}
                      <a href={d.url} target="_blank" rel="noreferrer" style={{ ...miniBtn(C.navy), textDecoration: 'none' }}>{t('common.download')}</a>{' '}
                      {canWrite && <button onClick={() => del(d)} style={{ ...miniBtn(C.red), border: 'none' }}>✕</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {preview && <FilePreview file={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

/* ============================ WARNINGS REGISTER ============================ */
function WarningsRegister() {
  const { t } = useLocale();
  const [items, setItems] = useState(null); const [showAll, setShowAll] = useState(false);
  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get('/relations/warnings', { params: { showAll } }); if (a) setItems(data.items || []); } catch { if (a) setItems([]); } })(); return () => { a = false; }; }, [showAll]);
  function exportWarnings() {
    exportTable({
      filename: 'Warnings_Register.xlsx', sheet: 'Warnings', title: t('relations.nav_warningsRegister'), subtitle: showAll ? t('relations.exportAllSanctions') : t('relations.exportActiveWarnings'),
      columns: [
        { label: t('relations.employee'), key: 'employee', width: 24 }, { label: t('relations.staffId'), key: 'staffId', width: 14 },
        { label: t('relations.colCaseNo'), key: 'caseNumber', width: 16 }, { label: t('relations.category'), key: 'category', width: 22 },
        { label: t('relations.sanction'), key: 'outcomeL', width: 20, align: 'center', color: (v, r) => SANCTION_COLOR[r.outcome] },
        { label: t('relations.issued'), key: 'issued', width: 14 }, { label: t('relations.expires'), key: 'expires', width: 14 },
        { label: t('common.status'), key: 'statusL', width: 12, align: 'center', color: { [t('relations.active')]: '#FD9C09', [t('relations.lapsed')]: '#8a94a6' } },
      ],
      rows: (items || []).map((w) => ({ employee: w.employee, staffId: w.staffId, caseNumber: w.caseNumber, category: w.category, outcomeL: label(SANCTIONS, w.outcome, t), outcome: w.outcome, issued: fmtDate(w.issuedDate), expires: fmtDate(w.expiryDate), statusL: w.active ? t('relations.active') : t('relations.lapsed') })),
    });
  }
  return (
    <div>
      <Hero crumbs={t('relations.nav_warningsRegister')} title={t('relations.nav_warningsRegister')} subtitle={t('relations.warningsRegisterSub')}
        action={items && items.length > 0 && <ExportButton onClick={exportWarnings} />} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.84rem', color: C.ink, marginBottom: 14 }}><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> {t('relations.includeLapsed')}</label>
      {!items ? <div style={{ color: C.muted, padding: 40 }}>{t('common.loading')}</div> : items.length === 0 ? <Empty>{showAll ? t('relations.noWarnings') : t('relations.noActiveWarnings')}</Empty> : (
        <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'auto', boxShadow: '0 1px 2px rgba(1,33,88,.05)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{[t('relations.employee'), t('relations.colCaseNo'), t('relations.category'), t('relations.sanction'), t('relations.issued'), t('relations.expires'), t('common.status')].map((h) => <th key={h} style={th()}>{h}</th>)}</tr></thead>
            <tbody>
              {items.map((w, i) => (
                <tr key={w.caseId} style={{ borderTop: `1px solid ${C.line}`, background: i % 2 ? '#fafbfe' : '#fff' }}>
                  <td style={td()}><b style={{ color: C.navy }}>{w.employee}</b>{w.staffId ? <span style={{ color: C.muted }}> · {w.staffId}</span> : ''}</td>
                  <td style={{ ...td(), color: C.navy, fontWeight: 700 }}>{w.caseNumber}</td><td style={td()}>{w.category}</td>
                  <td style={td()}><Tag t={[label(SANCTIONS, w.outcome, t), SANCTION_COLOR[w.outcome]]} /></td>
                  <td style={td()}>{fmtDate(w.issuedDate)}</td><td style={td()}>{fmtDate(w.expiryDate)}</td>
                  <td style={td()}><Tag t={w.active ? [t('relations.active'), C.orange] : [t('relations.lapsed'), C.muted]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============================ FILE PREVIEW ============================ */
function FilePreview({ file, onClose }) {
  const { t } = useLocale();
  const url = file?.url || '';
  const ext = (String(file?.format || file?.name || url).split('.').pop() || '').toLowerCase().split('?')[0];
  const enc = encodeURIComponent(url);
  const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
  const isPdf = ext === 'pdf';
  const isOffice = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext);
  let body;
  if (isImg) body = <img src={url} alt={file?.name} style={{ maxWidth: '100%', maxHeight: '78vh', display: 'block', margin: '0 auto', borderRadius: 6 }} />;
  else if (isPdf) body = <iframe title="pdf" src={url} style={{ width: '100%', height: '80vh', border: 'none', borderRadius: 6 }} />;
  else if (isOffice) body = <iframe title="office" src={`https://view.officeapps.live.com/op/embed.aspx?src=${enc}`} style={{ width: '100%', height: '80vh', border: 'none', borderRadius: 6 }} />;
  else body = <iframe title="doc" src={`https://docs.google.com/gview?url=${enc}&embedded=true`} style={{ width: '100%', height: '80vh', border: 'none', borderRadius: 6 }} />;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(1,33,88,.6)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 80 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 920, background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 18px 44px rgba(1,33,88,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${C.line}` }}>
          <div style={{ fontWeight: 700, color: C.navy, fontSize: '.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file?.name || t('relations.documentFallback')}</div>
          <div style={{ display: 'flex', gap: 8 }}><a href={url} target="_blank" rel="noreferrer" style={{ ...miniBtn(C.navy), textDecoration: 'none' }}>{t('common.openNewTab')}</a><button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: C.muted, cursor: 'pointer', lineHeight: 1 }}>×</button></div>
        </div>
        <div style={{ padding: 14, background: '#f4f6f9' }}>{body}</div>
      </div>
    </div>
  );
}

/* ============================ shared UI ============================ */
function DrillKpi({ Icon, label, value, sub, color, onClick }) {
  return (
    <button onClick={onClick} className="nx-kpi" style={{ textAlign: 'left', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, boxShadow: '0 1px 2px rgba(1,33,88,.05)', cursor: 'pointer', position: 'relative', transition: 'box-shadow .15s, transform .15s', fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>{Icon && <div style={{ width: 30, height: 30, borderRadius: 8, background: color + '15', display: 'grid', placeItems: 'center' }}><Icon size={16} color={color} /></div>}<div style={{ fontSize: '.68rem', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div><ChevronRight size={15} color={C.muted} style={{ marginLeft: 'auto' }} className="nx-kpi-arrow" /></div>
      <div style={{ fontSize: '1.7rem', fontWeight: 800, color, margin: '0 0 2px' }}>{value}</div><div style={{ fontSize: '.72rem', color: C.muted }}>{sub}</div>
      <style>{`.nx-kpi:hover{box-shadow:0 8px 22px rgba(1,33,88,.13);transform:translateY(-2px)}.nx-kpi .nx-kpi-arrow{opacity:.4}.nx-kpi:hover .nx-kpi-arrow{opacity:1}`}</style>
    </button>
  );
}
function Tag({ t }) { const [l, c] = t || ['—', C.muted]; return <span style={{ background: (c || C.muted) + '18', color: c || C.muted, fontWeight: 700, fontSize: '.72rem', padding: '2px 9px', borderRadius: 999 }}>{l}</span>; }
function Info({ label, value }) { return <div><div style={{ fontSize: '.66rem', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>{label}</div><div style={{ fontSize: '.9rem', color: C.ink, fontWeight: 600 }}>{value}</div></div>; }
function Card({ title, sub, children }) { return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, boxShadow: '0 1px 2px rgba(1,33,88,.05)', overflowX: 'auto' }}>{title && <div style={{ marginBottom: 12 }}><div style={{ fontWeight: 800, color: C.navy, fontSize: '.92rem' }}>{title}</div>{sub && <div style={{ color: C.muted, fontSize: '.76rem', marginTop: 2 }}>{sub}</div>}</div>}{children}</div>; }
function Empty({ children }) { return <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 40, textAlign: 'center', color: C.muted }}>{children}</div>; }
function Overlay({ children, onClose, wide }) { return <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(1,33,88,.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'start center', padding: '40px 20px', zIndex: 60, overflowY: 'auto' }}><div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: wide ? 640 : 500, background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 18px 44px rgba(1,33,88,.3)', borderTop: `4px solid ${C.navy}` }}>{children}</div></div>; }
function Note({ children, onClose }) { return <div style={{ background: '#eaf2fd', border: '1px solid #cfe3fb', color: '#0f3d78', padding: '10px 13px', borderRadius: 10, fontSize: '.88rem', marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>{children}</span>{onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#0f3d78', cursor: 'pointer', fontWeight: 800 }}>×</button>}</div>; }
function Field({ label, value, onChange, type = 'text', placeholder }) { return <label style={{ display: 'block', marginBottom: 12 }}><Lbl>{label}</Lbl><input type={type} value={value ?? ''} placeholder={placeholder || ''} onChange={(e) => onChange(e.target.value)} style={inp()} /></label>; }
function Sel({ label, value, onChange, options }) { return <label style={{ display: 'block', marginBottom: 12 }}><Lbl>{label}</Lbl><select value={value} onChange={(e) => onChange(e.target.value)} style={inp()}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>; }
function Row2({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>; }
function Lbl({ children }) { return <div style={{ fontSize: '.68rem', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>{children}</div>; }
function Actions({ onClose, onSubmit, busy, label }) { const { t } = useLocale(); return <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}><button onClick={onClose} style={ghostBtn()}>{t('common.cancel')}</button><button onClick={onSubmit} disabled={busy} style={primaryBtn()}>{busy ? t('common.saving') : label}</button></div>; }
function ErrBox({ children }) { return <div style={{ background: '#fdecec', border: '1px solid #f6c9cb', color: C.red, padding: '9px 12px', borderRadius: 9, fontSize: '.84rem', marginBottom: 12 }}>{children}</div>; }
function h2() { return { color: C.navy, fontSize: '1.2rem', fontWeight: 800, margin: '0 0 16px' }; }
function inp() { return { width: '100%', padding: '9px 11px', border: `1px solid #d8e0ec`, borderRadius: 9, fontSize: '.9rem', color: C.ink, background: '#fff', fontFamily: 'inherit' }; }
function ta() { return { ...inp(), resize: 'vertical', fontFamily: 'inherit', marginBottom: 12 }; }
function ctrl() { return { padding: '9px 12px', border: `1px solid #d8e0ec`, borderRadius: 9, background: '#fff', color: C.ink, fontSize: '.85rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }; }
function primaryBtn() { return { padding: '10px 18px', border: 'none', borderRadius: 10, background: C.navy, color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }; }
function ghostBtn() { return { padding: '10px 18px', border: '1px solid #d8e0ec', borderRadius: 10, background: '#fff', color: C.ink, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }; }
function miniBtn(color) { return { padding: '5px 11px', border: `1px solid ${color}`, borderRadius: 7, background: '#fff', color, fontWeight: 700, fontSize: '.76rem', cursor: 'pointer', display: 'inline-block', fontFamily: 'inherit' }; }
function th() { return { textAlign: 'left', padding: '10px 14px', background: '#f4f7fc', color: C.navy, fontWeight: 700, fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }; }
function td() { return { padding: '10px 14px', fontSize: '.85rem', color: C.ink }; }