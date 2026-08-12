#!/usr/bin/env bash
# Nexusora Workforce - Phase 2 client: Attendance & Absenteeism (muster + lost-man-day dashboard).
# Run ONCE from project root:  bash phase2_client.sh
set -e
mkdir -p client/src/components client/src/pages client/src/config client/src client/src/i18n

echo "  writing client/src/components/MusterBoard.jsx"
cat > client/src/components/MusterBoard.jsx << 'NEXUSORA_EOF'
import { useState } from 'react';
import api from '../api/client';
import { useLocale } from '../context/LocaleContext';

const STATUSES = ['present', 'absent', 'late', 'half_day', 'leave', 'rest_day', 'holiday'];
const today = () => new Date().toISOString().slice(0, 10);

export default function MusterBoard() {
  const { t } = useLocale();
  const [date, setDate] = useState(today());
  const [department, setDepartment] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  async function loadCrew() {
    setLoading(true); setMsg('');
    try {
      const { data } = await api.get('/employees', { params: { department: department || undefined, status: 'active', limit: 200 } });
      setRows(data.items.map((e) => ({
        employee: e._id,
        name: `${e.firstName} ${e.lastName}`,
        piece: e.compensation?.payBasis === 'piece_rate' || e.employment?.workerClass === 'tapper',
        status: 'present',
        output: '',
      })));
      if (data.items.length === 0) setMsg(t('attendance.noCrew'));
    } finally { setLoading(false); }
  }
  const setRow = (i, k, v) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));

  async function save() {
    setSaving(true); setMsg('');
    try {
      const entries = rows.map((r) => ({
        employee: r.employee, status: r.status,
        output: r.piece && r.output ? { quantity: Number(r.output), unit: 'kg' } : undefined,
      }));
      const { data } = await api.post('/attendance/muster', { date, department: department || undefined, entries });
      setMsg(t('attendance.musterSaved', { n: data.count }));
    } catch (e) { setMsg(e?.response?.data?.message || t('attendance.saveFailed')); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div className="toolbar">
        <label className="field-inline">{t('attendance.date')}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <input className="toolbar__search" placeholder={t('attendance.departmentFilter')} value={department} onChange={(e) => setDepartment(e.target.value)} />
        <button className="btn" onClick={loadCrew} disabled={loading}>{loading ? t('common.loading') : t('attendance.loadCrew')}</button>
        {rows.length > 0 && <button className="btn-primary" onClick={save} disabled={saving}>{saving ? t('common.loading') : t('attendance.saveMuster')}</button>}
      </div>
      {msg && <p className="info-note">{msg}</p>}
      {rows.length > 0 ? (
        <table className="table">
          <thead><tr><th>{t('employees.name')}</th><th>{t('attendance.status')}</th><th>{t('attendance.output')}</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.employee}>
                <td>{r.name}</td>
                <td>
                  <select value={r.status} onChange={(e) => setRow(i, 'status', e.target.value)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{t('attendance.status_' + s)}</option>)}
                  </select>
                </td>
                <td>{r.piece
                  ? <input type="number" placeholder="kg" value={r.output} onChange={(e) => setRow(i, 'output', e.target.value)} className="cell-input" />
                  : <span className="muted-inline">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (!loading && <p className="center-note">{t('attendance.loadHint')}</p>)}
    </div>
  );
}
NEXUSORA_EOF

echo "  writing client/src/components/AbsenteeismPanel.jsx"
cat > client/src/components/AbsenteeismPanel.jsx << 'NEXUSORA_EOF'
import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { useLocale } from '../context/LocaleContext';

const iso = (d) => d.toISOString().slice(0, 10);
const today = () => iso(new Date());
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

export default function AbsenteeismPanel() {
  const { t } = useLocale();
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [department, setDepartment] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get('/attendance/absenteeism', { params: { from, to, department: department || undefined } }); setData(data); }
    finally { setLoading(false); }
  }, [from, to, department]);
  useEffect(() => { load(); }, [load]);

  const s = data?.summary;
  return (
    <div>
      <div className="toolbar">
        <label className="field-inline">{t('attendance.from')}<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="field-inline">{t('attendance.to')}<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <input className="toolbar__search" placeholder={t('attendance.departmentFilter')} value={department} onChange={(e) => setDepartment(e.target.value)} />
        <button className="btn" onClick={load} disabled={loading}>{loading ? t('common.loading') : t('common.search')}</button>
      </div>
      {s && (
        <>
          <div className="kpi-grid">
            <div className="kpi kpi--gold"><span className="kpi__value">{s.lostManDays}</span><span className="kpi__label">{t('attendance.lostManDays')}</span></div>
            <div className="kpi"><span className="kpi__value">{s.absenteeismRate}%</span><span className="kpi__label">{t('attendance.absenteeismRate')}</span></div>
            <div className="kpi"><span className="kpi__value">{s.scheduledManDays}</span><span className="kpi__label">{t('attendance.scheduledManDays')}</span></div>
            <div className="kpi"><span className="kpi__value">{s.absentCount}</span><span className="kpi__label">{t('attendance.absences')}</span></div>
          </div>
          <h3 className="subhead">{t('attendance.byDepartment')}</h3>
          <table className="table">
            <thead><tr><th>{t('employees.department')}</th><th>{t('attendance.scheduledManDays')}</th><th>{t('attendance.lostManDays')}</th><th>{t('attendance.rate')}</th></tr></thead>
            <tbody>
              {data.byDepartment.length === 0 && <tr><td colSpan="4" className="muted">{t('attendance.noData')}</td></tr>}
              {data.byDepartment.map((d, i) => (
                <tr key={i}><td>{d.department}</td><td>{d.scheduled}</td><td>{d.lostManDays}</td><td>{d.rate.toFixed(1)}%</td></tr>
              ))}
            </tbody>
          </table>
          <h3 className="subhead">{t('attendance.chronic')}</h3>
          <table className="table">
            <thead><tr><th>{t('employees.name')}</th><th>{t('attendance.absences')}</th></tr></thead>
            <tbody>
              {data.chronic.length === 0 && <tr><td colSpan="2" className="muted">{t('attendance.noData')}</td></tr>}
              {data.chronic.map((c, i) => (<tr key={i}><td>{c.name}</td><td>{c.absences}</td></tr>))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
NEXUSORA_EOF

echo "  writing client/src/pages/AttendancePage.jsx"
cat > client/src/pages/AttendancePage.jsx << 'NEXUSORA_EOF'
import { useState } from 'react';
import { useLocale } from '../context/LocaleContext';
import MusterBoard from '../components/MusterBoard';
import AbsenteeismPanel from '../components/AbsenteeismPanel';

export default function AttendancePage() {
  const { t } = useLocale();
  const [tab, setTab] = useState('muster');
  return (
    <div className="page">
      <div className="page__head"><h1 className="page__title">{t('tiles.attendance')}</h1></div>
      <div className="tabs">
        <button className={`tab ${tab === 'muster' ? 'tab--on' : ''}`} onClick={() => setTab('muster')}>{t('attendance.muster')}</button>
        <button className={`tab ${tab === 'absenteeism' ? 'tab--on' : ''}`} onClick={() => setTab('absenteeism')}>{t('attendance.absenteeism')}</button>
      </div>
      {tab === 'muster' ? <MusterBoard /> : <AbsenteeismPanel />}
    </div>
  );
}
NEXUSORA_EOF

echo "  writing client/src/config/modules.js"
cat > client/src/config/modules.js << 'NEXUSORA_EOF'
// Home Screen tile map — the 17 modules grouped into sections.
// `enabled:false` tiles render as "Soon". Role visibility: a tile shows if the user's role
// is listed, or the tile is 'all', or the user is super_admin (who sees everything).
export const SECTIONS = [
  { key: 'workforce', tiles: [
    { key: 'workforcePlanning', roles: ['hr_manager'], enabled: false },
    { key: 'employees', route: '/employees', roles: ['hr_manager', 'hr_officer', 'line_manager', 'payroll_officer', 'viewer'], enabled: true },
    { key: 'jobDescriptions', roles: ['hr_manager'], enabled: false },
  ]},
  { key: 'talent', tiles: [
    { key: 'recruitment', roles: ['hr_manager', 'hr_officer'], enabled: false },
    { key: 'onboarding', roles: ['hr_manager', 'hr_officer'], enabled: false },
    { key: 'learning', roles: ['hr_manager', 'hr_officer'], enabled: false },
    { key: 'succession', roles: ['hr_manager'], enabled: false },
  ]},
  { key: 'operations', tiles: [
    { key: 'attendance', route: '/attendance', roles: ['hr_manager', 'hr_officer', 'line_manager'], enabled: true },
    { key: 'leave', roles: ['hr_manager', 'hr_officer', 'line_manager', 'employee'], enabled: false },
  ]},
  { key: 'payBenefits', tiles: [
    { key: 'payroll', roles: ['payroll_officer', 'hr_manager'], enabled: false },
    { key: 'welfare', roles: ['hr_manager'], enabled: false },
  ]},
  { key: 'performanceCulture', tiles: [
    { key: 'performance', roles: ['hr_manager', 'line_manager'], enabled: false },
    { key: 'relations', roles: ['hr_manager', 'ir_officer'], enabled: false },
    { key: 'engagement', roles: ['hr_manager'], enabled: false },
  ]},
  { key: 'selfService', tiles: [
    { key: 'selfService', roles: ['all'], enabled: false },
  ]},
  { key: 'adminAnalytics', tiles: [
    { key: 'documents', roles: ['hr_manager', 'hr_officer'], enabled: false },
    { key: 'analytics', roles: ['hr_manager'], enabled: false },
  ]},
];

export function visibleTiles(tiles, role) {
  return tiles.filter((t) => t.roles.includes('all') || role === 'super_admin' || t.roles.includes(role));
}
NEXUSORA_EOF

echo "  writing client/src/App.jsx"
cat > client/src/App.jsx << 'NEXUSORA_EOF'
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import HomeScreen from './pages/HomeScreen';
import EmployeesPage from './pages/EmployeesPage';
import AttendancePage from './pages/AttendancePage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><Layout><HomeScreen /></Layout></ProtectedRoute>} />
      <Route path="/employees" element={<ProtectedRoute><Layout><EmployeesPage /></Layout></ProtectedRoute>} />
      <Route path="/attendance" element={<ProtectedRoute><Layout><AttendancePage /></Layout></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
NEXUSORA_EOF

echo "  writing client/src/index.css"
cat > client/src/index.css << 'NEXUSORA_EOF'
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap');

:root {
  --navy: #1A3560;
  --navy-700: #142a4d;
  --gold: #C9A227;
  --tech-blue: #2E75B6;
  --ink: #1f2430;
  --muted: #6b7280;
  --line: #e4e8f0;
  --bg: #f5f7fb;
  --card: #ffffff;
  --radius: 12px;
  --shadow: 0 1px 3px rgba(20,42,77,.08), 0 1px 2px rgba(20,42,77,.04);
  font-family: Inter, system-ui, Arial, sans-serif;
  color: var(--ink);
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); }
h1, h2, h3 { font-family: 'Space Grotesk', Inter, sans-serif; color: var(--navy); }
a { color: inherit; text-decoration: none; }
input, select, button { font: inherit; }

/* ---- buttons ---- */
.btn, .btn-primary { padding: 9px 16px; border-radius: 9px; border: 1px solid var(--line); background: #fff; cursor: pointer; transition: .15s; }
.btn:hover { background: #f0f3f9; }
.btn-primary { background: var(--navy); color: #fff; border-color: var(--navy); font-weight: 600; }
.btn-primary:hover { background: var(--navy-700); }
.btn-primary:disabled { opacity: .55; cursor: not-allowed; }
.btn-block { width: 100%; margin-top: 6px; }
.btn-link { background: none; border: none; color: #fff; cursor: pointer; opacity: .9; }
.btn-link:hover { opacity: 1; text-decoration: underline; }

/* ---- shell / topbar ---- */
.shell { min-height: 100vh; }
.topbar { display: flex; align-items: center; justify-content: space-between; padding: 12px 24px; background: var(--navy); color: #fff; border-bottom: 3px solid var(--gold); }
.topbar__brand { font-family: 'Space Grotesk'; font-weight: 700; letter-spacing: .3px; color: #fff; }
.topbar__right { display: flex; align-items: center; gap: 16px; }
.topbar__tenant { font-size: .85rem; opacity: .85; padding-right: 4px; border-right: 1px solid #ffffff33; }
.content { max-width: 1080px; margin: 28px auto; padding: 0 24px; }
.center-note { text-align: center; color: var(--muted); padding: 60px 0; }

/* ---- language switcher ---- */
.lang-switcher { display: inline-flex; align-items: center; gap: 6px; }
.lang-switcher__label { font-size: .8rem; opacity: .85; }
.lang-switcher select { padding: 5px 8px; border-radius: 8px; border: 1px solid #ffffff44; background: #fff; color: var(--ink); font-size: .85rem; }

/* ---- auth ---- */
.auth-wrap { min-height: 100vh; display: grid; place-items: center; background:
  radial-gradient(1200px 500px at 50% -10%, #eaf0fb 0%, var(--bg) 60%); padding: 20px; }
.auth-card { width: 100%; max-width: 400px; background: var(--card); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow); padding: 26px; border-top: 4px solid var(--gold); }
.auth-card__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.auth-card__brand { font-family: 'Space Grotesk'; font-weight: 700; color: var(--navy); }
.auth-card__head .lang-switcher__label { color: var(--muted); }
.auth-card__head .lang-switcher select { border-color: var(--line); }
.auth-card__title { margin: 2px 0 2px; font-size: 1.4rem; }
.auth-card__sub { margin: 0 0 16px; color: var(--muted); font-size: .9rem; }

/* ---- fields ---- */
.field { display: flex; flex-direction: column; gap: 5px; font-size: .85rem; color: #374151; margin-bottom: 12px; }
.field input, .field select { padding: 9px 11px; border: 1px solid var(--line); border-radius: 9px; background: #fff; }
.field input:focus, .field select:focus { outline: 2px solid var(--tech-blue); outline-offset: 0; border-color: var(--tech-blue); }
.form-error { color: #b42318; background: #fef3f2; border: 1px solid #fecdca; padding: 8px 10px; border-radius: 8px; font-size: .85rem; margin: 4px 0 10px; }

/* ---- home / tiles ---- */
.home__hello { margin: 0 0 2px; font-size: 1.6rem; }
.home__role { margin: 0 0 22px; color: var(--muted); font-size: .9rem; }
.tile-section { margin-bottom: 26px; }
.tile-section__title { font-size: .8rem; text-transform: uppercase; letter-spacing: .12em; color: var(--tech-blue); margin: 0 0 12px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
.tile-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; }
.tile { position: relative; display: flex; align-items: center; min-height: 84px; padding: 16px; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); transition: .15s; }
.tile--live { cursor: pointer; }
.tile--live:hover { transform: translateY(-2px); border-color: var(--gold); box-shadow: 0 6px 18px rgba(20,42,77,.12); }
.tile--live::before { content: ''; position: absolute; left: 0; top: 12px; bottom: 12px; width: 4px; border-radius: 4px; background: var(--gold); }
.tile--soon { opacity: .6; }
.tile__label { font-weight: 600; color: var(--navy); }
.tile__badge { position: absolute; top: 10px; right: 10px; font-size: .62rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); background: #eef1f6; padding: 2px 7px; border-radius: 999px; }

/* ---- page / table ---- */
.page__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.page__title { margin: 0; font-size: 1.5rem; }
.toolbar { display: flex; gap: 8px; margin-bottom: 16px; }
.toolbar__search { flex: 1; padding: 9px 12px; border: 1px solid var(--line); border-radius: 9px; }
.table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow); }
.table th, .table td { text-align: left; padding: 11px 14px; border-bottom: 1px solid var(--line); font-size: .9rem; }
.table th { background: #f0f3f9; color: var(--navy); font-family: 'Space Grotesk'; font-size: .78rem; text-transform: uppercase; letter-spacing: .05em; }
.table tr:last-child td { border-bottom: none; }
.muted { color: var(--muted); text-align: center; padding: 26px; }
.pager { color: var(--muted); font-size: .85rem; margin-top: 12px; }
.pill { font-size: .72rem; padding: 3px 9px; border-radius: 999px; text-transform: capitalize; }
.pill--active { background: #e7f6ec; color: #1a6b3c; }
.pill--suspended { background: #fef7e6; color: #9a6b00; }
.pill--terminated { background: #fdecea; color: #b42318; }

/* ---- modal ---- */
.modal-overlay { position: fixed; inset: 0; background: rgba(20,42,77,.45); display: grid; place-items: center; padding: 20px; z-index: 50; }
.modal { width: 100%; max-width: 560px; background: #fff; border-radius: 16px; padding: 22px; box-shadow: 0 20px 60px rgba(0,0,0,.25); border-top: 4px solid var(--gold); }
.modal__title { margin: 0 0 16px; font-size: 1.25rem; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.modal__actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }

/* RTL awareness (Arabic): mirror bar + tile accent */
[dir="rtl"] .topbar { flex-direction: row-reverse; }
[dir="rtl"] .tile--live::before { left: auto; right: 0; }
[dir="rtl"] .topbar__tenant { border-right: none; border-left: 1px solid #ffffff33; padding-right: 0; padding-left: 4px; }

@media (max-width: 560px) { .grid2 { grid-template-columns: 1fr; } .content { padding: 0 16px; } }

/* ---- Phase 2: tabs, KPI cards, inline fields (attendance) ---- */
.tabs { display: flex; gap: 6px; margin-bottom: 18px; border-bottom: 1px solid var(--line); }
.tab { background: none; border: none; padding: 10px 16px; cursor: pointer; color: var(--muted); font-weight: 600; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tab--on { color: var(--navy); border-bottom-color: var(--gold); }

.field-inline { display: inline-flex; align-items: center; gap: 8px; font-size: .85rem; color: #374151; }
.field-inline input { padding: 8px 10px; border: 1px solid var(--line); border-radius: 9px; }
.cell-input { width: 90px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 8px; }
.muted-inline { color: var(--muted); }
.info-note { background: #eef4ff; border: 1px solid #d5e3ff; color: #1e3a67; padding: 9px 12px; border-radius: 9px; font-size: .88rem; margin: 4px 0 14px; }
.subhead { font-size: .82rem; text-transform: uppercase; letter-spacing: .1em; color: var(--tech-blue); margin: 24px 0 10px; }

.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; margin-bottom: 8px; }
.kpi { display: flex; flex-direction: column; gap: 4px; padding: 18px; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); }
.kpi--gold { border-top: 3px solid var(--gold); }
.kpi__value { font-family: 'Space Grotesk'; font-size: 1.9rem; font-weight: 700; color: var(--navy); line-height: 1; }
.kpi__label { font-size: .78rem; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
NEXUSORA_EOF

echo "  writing client/src/i18n/en.json"
cat > client/src/i18n/en.json << 'NEXUSORA_EOF'
{
  "app": {
    "name": "Nexusora Workforce",
    "tagline": "Intelligent HR for African industry & agribusiness"
  },
  "common": {
    "language": "Language",
    "loading": "Loading…",
    "save": "Save",
    "cancel": "Cancel",
    "search": "Search",
    "soon": "Soon"
  },
  "auth": {
    "signIn": "Sign in",
    "workspace": "Workspace",
    "email": "Email",
    "password": "Password",
    "logout": "Log out",
    "failed": "Sign in failed"
  },
  "home": {
    "hello": "Hello, {name}",
    "roleLabel": "Signed in as"
  },
  "sections": {
    "workforce": "Workforce",
    "talent": "Talent",
    "operations": "Operations",
    "payBenefits": "Pay & Benefits",
    "performanceCulture": "Performance & Culture",
    "selfService": "Self-Service",
    "adminAnalytics": "Admin & Analytics"
  },
  "tiles": {
    "workforcePlanning": "Workforce Planning",
    "employees": "Employee Records",
    "jobDescriptions": "Job Descriptions",
    "recruitment": "Recruitment",
    "onboarding": "Onboarding",
    "learning": "Learning & Competency",
    "succession": "Talent & Succession",
    "attendance": "Attendance & Absenteeism",
    "leave": "Leave",
    "payroll": "Compensation & Payroll",
    "welfare": "Welfare & Social Services",
    "performance": "Performance",
    "relations": "Employee Relations",
    "engagement": "Engagement",
    "selfService": "Self-Service",
    "documents": "Documents & Policies",
    "analytics": "Analytics & Dashboards"
  },
  "employees": {
    "add": "Add employee",
    "search": "Search employees…",
    "name": "Name",
    "jobTitle": "Job title",
    "workerClass": "Worker class",
    "type": "Type",
    "status": "Status",
    "firstName": "First name",
    "lastName": "Last name",
    "department": "Department",
    "payBasis": "Pay basis",
    "baseSalary": "Base salary",
    "none": "No employees yet",
    "total": "{n} employee(s)",
    "saveFailed": "Could not save employee"
  },
  "attendance": {
    "muster": "Daily Muster",
    "absenteeism": "Absenteeism",
    "date": "Date",
    "from": "From",
    "to": "To",
    "departmentFilter": "Department (optional)",
    "loadCrew": "Load crew",
    "saveMuster": "Save muster",
    "loadHint": "Pick a date and load the crew to mark attendance.",
    "noCrew": "No active employees found for that filter.",
    "status": "Status",
    "output": "Output (kg)",
    "musterSaved": "Muster saved for {n} worker(s)",
    "saveFailed": "Could not save muster",
    "lostManDays": "Lost man-days",
    "absenteeismRate": "Absenteeism rate",
    "scheduledManDays": "Scheduled man-days",
    "absences": "Absences",
    "byDepartment": "By department",
    "rate": "Rate",
    "chronic": "Chronic absentees",
    "noData": "No data for this range",
    "status_present": "Present",
    "status_absent": "Absent",
    "status_late": "Late",
    "status_half_day": "Half day",
    "status_leave": "Leave",
    "status_rest_day": "Rest day",
    "status_holiday": "Holiday"
  }
}
NEXUSORA_EOF

echo "  writing client/src/i18n/fr.json"
cat > client/src/i18n/fr.json << 'NEXUSORA_EOF'
{
  "app": {
    "tagline": "RH intelligentes pour l'industrie et l'agro-industrie africaines"
  },
  "common": {
    "language": "Langue",
    "loading": "Chargement…",
    "save": "Enregistrer",
    "cancel": "Annuler",
    "search": "Rechercher",
    "soon": "Bientôt"
  },
  "auth": {
    "signIn": "Se connecter",
    "workspace": "Espace de travail",
    "email": "E-mail",
    "password": "Mot de passe",
    "logout": "Se déconnecter",
    "failed": "Échec de la connexion"
  },
  "home": {
    "hello": "Bonjour, {name}",
    "roleLabel": "Connecté en tant que"
  },
  "sections": {
    "workforce": "Effectifs",
    "talent": "Talents",
    "operations": "Opérations",
    "payBenefits": "Paie & Avantages",
    "performanceCulture": "Performance & Culture",
    "selfService": "Libre-service",
    "adminAnalytics": "Administration & Analyses"
  },
  "tiles": {
    "workforcePlanning": "Planification des effectifs",
    "employees": "Dossiers du personnel",
    "jobDescriptions": "Descriptions de poste",
    "recruitment": "Recrutement",
    "onboarding": "Intégration",
    "learning": "Formation & Compétences",
    "succession": "Talents & Succession",
    "attendance": "Présence & Absentéisme",
    "leave": "Congés",
    "payroll": "Rémunération & Paie",
    "welfare": "Bien-être & Services sociaux",
    "performance": "Performance",
    "relations": "Relations sociales",
    "engagement": "Engagement",
    "selfService": "Libre-service",
    "documents": "Documents & Politiques",
    "analytics": "Analyses & Tableaux de bord"
  },
  "employees": {
    "add": "Ajouter un employé",
    "search": "Rechercher des employés…",
    "name": "Nom",
    "jobTitle": "Intitulé du poste",
    "workerClass": "Catégorie",
    "type": "Type",
    "status": "Statut",
    "firstName": "Prénom",
    "lastName": "Nom",
    "department": "Département",
    "payBasis": "Base de paie",
    "baseSalary": "Salaire de base",
    "none": "Aucun employé pour l'instant",
    "total": "{n} employé(s)",
    "saveFailed": "Enregistrement impossible"
  },
  "attendance": {
    "muster": "Appel journalier",
    "absenteeism": "Absentéisme",
    "date": "Date",
    "from": "Du",
    "to": "Au",
    "departmentFilter": "Département (facultatif)",
    "loadCrew": "Charger l’équipe",
    "saveMuster": "Enregistrer l’appel",
    "loadHint": "Choisissez une date et chargez l’équipe pour saisir les présences.",
    "noCrew": "Aucun employé actif pour ce filtre.",
    "status": "Statut",
    "output": "Production (kg)",
    "musterSaved": "Appel enregistré pour {n} travailleur(s)",
    "saveFailed": "Enregistrement impossible",
    "lostManDays": "Jours-homme perdus",
    "absenteeismRate": "Taux d’absentéisme",
    "scheduledManDays": "Jours-homme prévus",
    "absences": "Absences",
    "byDepartment": "Par département",
    "rate": "Taux",
    "chronic": "Absentéistes chroniques",
    "noData": "Aucune donnée pour cette période",
    "status_present": "Présent",
    "status_absent": "Absent",
    "status_late": "En retard",
    "status_half_day": "Demi-journée",
    "status_leave": "Congé",
    "status_rest_day": "Repos",
    "status_holiday": "Jour férié"
  }
}
NEXUSORA_EOF

echo
echo "Phase 2 client written (8 files). Then: cd client && npm run dev"
