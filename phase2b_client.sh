#!/usr/bin/env bash
# Nexusora Workforce - Phase 2b client: class-aware employee form (create + EDIT).
# Run ONCE from project root:  bash phase2b_client.sh
set -e
mkdir -p client/src/config client/src/components client/src/pages client/src client/src/i18n

echo "  writing client/src/config/employeeProfiles.js"
cat > client/src/config/employeeProfiles.js << 'NEXUSORA_EOF'
// Which form sections/fields apply to each worker class + employment type.
// The Employee model is a superset; this drives the UI so you only capture relevant data.

export const WORKER_CLASSES = ['staff', 'field_worker', 'tapper', 'operator'];
export const EMPLOYMENT_TYPES = ['permanent', 'contract', 'casual', 'seasonal', 'probation'];
export const GENDERS = ['male', 'female', 'other'];
export const PAY_BASES = ['salary', 'daily', 'hourly', 'piece_rate', 'task'];
export const PAY_METHODS = ['bank', 'mobile_money', 'cash'];

// Sections to render for a given class + type.
export function sectionsFor(workerClass, employmentType) {
  const s = new Set(['identity', 'contact', 'employment', 'compensation', 'payment']);
  if (['staff', 'operator'].includes(workerClass)) { s.add('statutory'); s.add('education'); s.add('nextOfKin'); }
  if (['tapper', 'field_worker'].includes(workerClass)) { s.add('fieldWork'); s.add('nextOfKin'); }
  if (employmentType === 'contract') s.add('contract');
  if (employmentType === 'casual') { s.delete('statutory'); s.delete('education'); s.delete('nextOfKin'); }
  return s;
}

// Which pay-amount fields to show for a pay basis.
export function payFieldsFor(payBasis) {
  switch (payBasis) {
    case 'salary': return ['baseSalary'];
    case 'daily': return ['dailyRate'];
    case 'hourly': return ['hourlyRate'];
    case 'piece_rate': return ['pieceAmount', 'pieceUnit'];
    case 'task': return ['pieceAmount'];
    default: return ['baseSalary'];
  }
}

// Sensible defaults when a worker class is chosen.
export function defaultPayBasis(workerClass) {
  if (workerClass === 'tapper') return 'piece_rate';
  if (workerClass === 'field_worker') return 'daily';
  if (workerClass === 'operator') return 'hourly';
  return 'salary';
}
export function defaultPaymentMethod(workerClass) {
  return ['tapper', 'field_worker'].includes(workerClass) ? 'mobile_money' : 'bank';
}
NEXUSORA_EOF

echo "  writing client/src/components/EmployeeForm.jsx"
cat > client/src/components/EmployeeForm.jsx << 'NEXUSORA_EOF'
import { useState } from 'react';
import api from '../api/client';
import { useLocale } from '../context/LocaleContext';
import { useAuth } from '../context/AuthContext';
import {
  WORKER_CLASSES, EMPLOYMENT_TYPES, GENDERS, PAY_BASES, PAY_METHODS,
  sectionsFor, payFieldsFor, defaultPayBasis, defaultPaymentMethod,
} from '../config/employeeProfiles';

const isoDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d) ? '' : d.toISOString().slice(0, 10);
};

function initialState(emp, baseCurrency) {
  const e = emp || {};
  const em = e.employment || {}; const comp = e.compensation || {};
  const pay = e.payment || {}; const bank = pay.bank || {}; const mm = pay.mobileMoney || {};
  const fw = e.fieldWork || {}; const mc = fw.medicalClearance || {};
  const nok = e.nextOfKin || {}; const st = e.statutory || {}; const ed = e.education || {};
  const pr = comp.pieceRate || {};
  return {
    firstName: e.firstName || '', lastName: e.lastName || '', gender: e.gender || '',
    dateOfBirth: isoDate(e.dateOfBirth), nationalId: e.nationalId || '',
    email: e.email || '', phone: e.phone || '', address: e.address || '',
    nextOfKin: { name: nok.name || '', relationship: nok.relationship || '', phone: nok.phone || '' },
    employment: {
      staffId: e.staffId || '', jobTitle: em.jobTitle || '', department: em.department || '', section: em.section || '',
      costCentre: em.costCentre || '', grade: em.grade || '', crew: em.crew || '',
      workerClass: em.workerClass || 'staff', employmentType: em.employmentType || 'permanent',
      startDate: isoDate(em.startDate), confirmationStatus: em.confirmationStatus || 'probation',
      contractStart: isoDate(em.contractStart), contractEnd: isoDate(em.contractEnd),
    },
    statutory: { socialSecurityNumber: st.socialSecurityNumber || '', taxId: st.taxId || '' },
    compensation: {
      payBasis: comp.payBasis || defaultPayBasis(em.workerClass || 'staff'), currency: comp.currency || baseCurrency || '',
      baseSalary: comp.baseSalary ?? '', dailyRate: comp.dailyRate ?? '', hourlyRate: comp.hourlyRate ?? '',
      pieceAmount: pr.amount ?? '', pieceUnit: pr.unit || 'kg',
    },
    payment: {
      method: pay.method || defaultPaymentMethod(em.workerClass || 'staff'),
      bank: { bankName: bank.bankName || '', accountNumber: bank.accountNumber || '', accountName: bank.accountName || '' },
      mobileMoney: { provider: mm.provider || '', number: mm.number || '' },
    },
    fieldWork: { taskType: fw.taskType || '', quota: fw.quota ?? '', quotaUnit: fw.quotaUnit || 'trees', medicalStatus: mc.status || 'pending' },
    education: { level: ed.level || '', institution: ed.institution || '' },
  };
}

const numOrUndef = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));

// Deep-remove empty strings / null / empty objects so enum + date casts never see ''.
function clean(obj) {
  if (obj === '' || obj === null || obj === undefined) return undefined;
  if (typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const cv = clean(v);
    if (cv === undefined) continue;
    if (typeof cv === 'object' && !Array.isArray(cv) && Object.keys(cv).length === 0) continue;
    out[k] = cv;
  }
  return out;
}

export default function EmployeeForm({ employee, onClose, onSaved }) {
  const { t } = useLocale();
  const { tenant } = useAuth();
  const editing = Boolean(employee && employee._id);
  const [f, setF] = useState(() => initialState(employee, tenant?.baseCurrency));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const setField = (path, value) => setF((prev) => {
    const next = structuredClone(prev);
    const keys = path.split('.'); let o = next;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys[keys.length - 1]] = value;
    return next;
  });

  // When class changes, refresh sensible pay/payment defaults.
  const onClassChange = (wc) => setF((prev) => ({
    ...prev,
    employment: { ...prev.employment, workerClass: wc },
    compensation: { ...prev.compensation, payBasis: defaultPayBasis(wc) },
    payment: { ...prev.payment, method: defaultPaymentMethod(wc) },
  }));

  const sections = sectionsFor(f.employment.workerClass, f.employment.employmentType);
  const payFields = payFieldsFor(f.compensation.payBasis);

  async function submit() {
    setError(''); setBusy(true);
    try {
      const payload = clean({
        staffId: f.employment.staffId,
        firstName: f.firstName, lastName: f.lastName, gender: f.gender,
        dateOfBirth: f.dateOfBirth, nationalId: f.nationalId, email: f.email, phone: f.phone, address: f.address,
        nextOfKin: sections.has('nextOfKin') ? f.nextOfKin : undefined,
        employment: {
          jobTitle: f.employment.jobTitle, department: f.employment.department, section: f.employment.section,
          costCentre: f.employment.costCentre, grade: f.employment.grade, crew: f.employment.crew,
          workerClass: f.employment.workerClass, employmentType: f.employment.employmentType,
          startDate: f.employment.startDate, confirmationStatus: f.employment.confirmationStatus,
          contractStart: sections.has('contract') ? f.employment.contractStart : undefined,
          contractEnd: sections.has('contract') ? f.employment.contractEnd : undefined,
        },
        statutory: sections.has('statutory') ? f.statutory : undefined,
        compensation: {
          payBasis: f.compensation.payBasis, currency: f.compensation.currency,
          baseSalary: numOrUndef(f.compensation.baseSalary), dailyRate: numOrUndef(f.compensation.dailyRate),
          hourlyRate: numOrUndef(f.compensation.hourlyRate),
          pieceRate: (f.compensation.payBasis === 'piece_rate' || f.compensation.payBasis === 'task')
            ? { amount: numOrUndef(f.compensation.pieceAmount), unit: f.compensation.pieceUnit } : undefined,
        },
        payment: {
          method: f.payment.method,
          bank: f.payment.method === 'bank' ? f.payment.bank : undefined,
          mobileMoney: f.payment.method === 'mobile_money' ? f.payment.mobileMoney : undefined,
        },
        fieldWork: sections.has('fieldWork') ? {
          taskType: f.fieldWork.taskType, quota: numOrUndef(f.fieldWork.quota), quotaUnit: f.fieldWork.quotaUnit,
          medicalClearance: { status: f.fieldWork.medicalStatus },
        } : undefined,
        education: sections.has('education') ? f.education : undefined,
      });
      if (editing) await api.put(`/employees/${employee._id}`, payload);
      else await api.post('/employees', payload);
      onSaved();
    } catch (e) { setError(e?.response?.data?.message || t('employees.saveFailed')); }
    finally { setBusy(false); }
  }

  const F = (label, path, opts = {}) => (
    <label className="field">{label}
      <input type={opts.type || 'text'} value={path.split('.').reduce((o, k) => o[k], f)}
        onChange={(e) => setField(path, e.target.value)} />
    </label>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal__title">{editing ? t('employees.edit') : t('employees.add')}</h2>

        <h3 className="form-section">{t('employees.sec_role')}</h3>
        <div className="grid2">
          <label className="field">{t('employees.workerClass')}
            <select value={f.employment.workerClass} onChange={(e) => onClassChange(e.target.value)}>
              {WORKER_CLASSES.map((v) => <option key={v} value={v}>{t('wc_' + v)}</option>)}
            </select>
          </label>
          <label className="field">{t('employees.type')}
            <select value={f.employment.employmentType} onChange={(e) => setField('employment.employmentType', e.target.value)}>
              {EMPLOYMENT_TYPES.map((v) => <option key={v} value={v}>{t('et_' + v)}</option>)}
            </select>
          </label>
        </div>

        <h3 className="form-section">{t('employees.sec_identity')}</h3>
        <div className="grid2">
          {F(t('employees.firstName'), 'firstName')}
          {F(t('employees.lastName'), 'lastName')}
          <label className="field">{t('employees.gender')}
            <select value={f.gender} onChange={(e) => setField('gender', e.target.value)}>
              <option value="">—</option>{GENDERS.map((g) => <option key={g} value={g}>{t('g_' + g)}</option>)}
            </select>
          </label>
          {F(t('employees.dob'), 'dateOfBirth', { type: 'date' })}
          {F(t('employees.nationalId'), 'nationalId')}
          {F(t('employees.staffId'), 'employment.staffId')}
        </div>

        <h3 className="form-section">{t('employees.sec_contact')}</h3>
        <div className="grid2">
          {F(t('employees.phone'), 'phone')}
          {F('Email', 'email', { type: 'email' })}
          {F(t('employees.address'), 'address')}
        </div>

        <h3 className="form-section">{t('employees.sec_employment')}</h3>
        <div className="grid2">
          {F(t('employees.jobTitle'), 'employment.jobTitle')}
          {F(t('employees.department'), 'employment.department')}
          {F(t('employees.section'), 'employment.section')}
          {F(t('employees.costCentre'), 'employment.costCentre')}
          {sections.has('fieldWork') && F(t('employees.crew'), 'employment.crew')}
          {F(t('employees.startDate'), 'employment.startDate', { type: 'date' })}
        </div>

        {sections.has('contract') && (<>
          <h3 className="form-section">{t('employees.sec_contract')}</h3>
          <div className="grid2">
            {F(t('employees.contractStart'), 'employment.contractStart', { type: 'date' })}
            {F(t('employees.contractEnd'), 'employment.contractEnd', { type: 'date' })}
          </div>
        </>)}

        {sections.has('statutory') && (<>
          <h3 className="form-section">{t('employees.sec_statutory')}</h3>
          <div className="grid2">
            {F(t('employees.ssn'), 'statutory.socialSecurityNumber')}
            {F(t('employees.tin'), 'statutory.taxId')}
          </div>
        </>)}

        <h3 className="form-section">{t('employees.sec_pay')}</h3>
        <div className="grid2">
          <label className="field">{t('employees.payBasis')}
            <select value={f.compensation.payBasis} onChange={(e) => setField('compensation.payBasis', e.target.value)}>
              {PAY_BASES.map((v) => <option key={v} value={v}>{t('pb_' + v)}</option>)}
            </select>
          </label>
          {F(t('employees.currency'), 'compensation.currency')}
          {payFields.includes('baseSalary') && F(t('employees.baseSalary'), 'compensation.baseSalary', { type: 'number' })}
          {payFields.includes('dailyRate') && F(t('employees.dailyRate'), 'compensation.dailyRate', { type: 'number' })}
          {payFields.includes('hourlyRate') && F(t('employees.hourlyRate'), 'compensation.hourlyRate', { type: 'number' })}
          {payFields.includes('pieceAmount') && F(t('employees.pieceAmount'), 'compensation.pieceAmount', { type: 'number' })}
          {payFields.includes('pieceUnit') && F(t('employees.pieceUnit'), 'compensation.pieceUnit')}
        </div>

        <h3 className="form-section">{t('employees.sec_payment')}</h3>
        <div className="grid2">
          <label className="field">{t('employees.payMethod')}
            <select value={f.payment.method} onChange={(e) => setField('payment.method', e.target.value)}>
              {PAY_METHODS.map((v) => <option key={v} value={v}>{t('pm_' + v)}</option>)}
            </select>
          </label>
          {f.payment.method === 'bank' && <>
            {F(t('employees.bankName'), 'payment.bank.bankName')}
            {F(t('employees.accountNumber'), 'payment.bank.accountNumber')}
            {F(t('employees.accountName'), 'payment.bank.accountName')}
          </>}
          {f.payment.method === 'mobile_money' && <>
            {F(t('employees.mmProvider'), 'payment.mobileMoney.provider')}
            {F(t('employees.mmNumber'), 'payment.mobileMoney.number')}
          </>}
        </div>

        {sections.has('fieldWork') && (<>
          <h3 className="form-section">{t('employees.sec_field')}</h3>
          <div className="grid2">
            {F(t('employees.taskType'), 'fieldWork.taskType')}
            {F(t('employees.quota'), 'fieldWork.quota', { type: 'number' })}
            {F(t('employees.quotaUnit'), 'fieldWork.quotaUnit')}
            <label className="field">{t('employees.medical')}
              <select value={f.fieldWork.medicalStatus} onChange={(e) => setField('fieldWork.medicalStatus', e.target.value)}>
                <option value="pending">{t('mc_pending')}</option>
                <option value="cleared">{t('mc_cleared')}</option>
                <option value="expired">{t('mc_expired')}</option>
              </select>
            </label>
          </div>
        </>)}

        {sections.has('education') && (<>
          <h3 className="form-section">{t('employees.sec_education')}</h3>
          <div className="grid2">
            {F(t('employees.eduLevel'), 'education.level')}
            {F(t('employees.institution'), 'education.institution')}
          </div>
        </>)}

        {sections.has('nextOfKin') && (<>
          <h3 className="form-section">{t('employees.sec_nok')}</h3>
          <div className="grid2">
            {F(t('employees.nokName'), 'nextOfKin.name')}
            {F(t('employees.nokRelationship'), 'nextOfKin.relationship')}
            {F(t('employees.nokPhone'), 'nextOfKin.phone')}
          </div>
        </>)}

        {error && <p className="form-error">{error}</p>}
        <div className="modal__actions">
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary" disabled={busy || !f.firstName || !f.lastName} onClick={submit}>
            {busy ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
NEXUSORA_EOF

echo "  writing client/src/pages/EmployeesPage.jsx"
cat > client/src/pages/EmployeesPage.jsx << 'NEXUSORA_EOF'
import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import { useLocale } from '../context/LocaleContext';
import { useAuth } from '../context/AuthContext';
import EmployeeForm from '../components/EmployeeForm';

const WRITE_ROLES = ['super_admin', 'hr_manager', 'hr_officer'];

export default function EmployeesPage() {
  const { t } = useLocale();
  const { user } = useAuth();
  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);   // null = create, object = edit
  const canWrite = WRITE_ROLES.includes(user?.role);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try { const { data } = await api.get('/employees', { params: { q, page, limit: 10 } }); setData(data); }
    finally { setLoading(false); }
  }, [q]);
  useEffect(() => { load(1); }, [load]);

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (emp) => { if (canWrite) { setEditing(emp); setFormOpen(true); } };
  const onSaved = () => { setFormOpen(false); setEditing(null); load(data.page || 1); };

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page__title">{t('tiles.employees')}</h1>
        {canWrite && <button className="btn-primary" onClick={openCreate}>{t('employees.add')}</button>}
      </div>

      <div className="toolbar">
        <input className="toolbar__search" placeholder={t('employees.search')} value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') load(1); }} />
        <button className="btn" onClick={() => load(1)}>{t('common.search')}</button>
      </div>

      {loading ? (
        <p className="center-note">{t('common.loading')}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{t('employees.name')}</th><th>{t('employees.jobTitle')}</th>
              <th>{t('employees.workerClass')}</th><th>{t('employees.type')}</th><th>{t('employees.status')}</th>
              {canWrite && <th></th>}
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 && <tr><td colSpan={canWrite ? 6 : 5} className="muted">{t('employees.none')}</td></tr>}
            {data.items.map((e) => (
              <tr key={e._id} className={canWrite ? 'row-click' : ''} onClick={() => openEdit(e)}>
                <td>{e.firstName} {e.lastName}</td>
                <td>{e.employment?.jobTitle || '—'}</td>
                <td>{e.employment?.workerClass ? t('wc_' + e.employment.workerClass) : '—'}</td>
                <td>{e.employment?.employmentType ? t('et_' + e.employment.employmentType) : '—'}</td>
                <td><span className={`pill pill--${e.status}`}>{e.status}</span></td>
                {canWrite && <td className="row-edit">{t('common.edit')}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="pager">{t('employees.total', { n: data.total })}</p>

      {formOpen && <EmployeeForm employee={editing} onClose={() => { setFormOpen(false); setEditing(null); }} onSaved={onSaved} />}
    </div>
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

/* ---- Phase 2b: wide modal, form sections, editable rows ---- */
.modal--wide { max-width: 720px; max-height: 88vh; overflow-y: auto; }
.form-section { font-size: .72rem; text-transform: uppercase; letter-spacing: .1em; color: var(--tech-blue); margin: 18px 0 8px; padding-bottom: 5px; border-bottom: 1px solid var(--line); }
.row-click { cursor: pointer; }
.row-click:hover { background: #f7f9fc; }
.row-edit { color: var(--tech-blue); font-size: .82rem; font-weight: 600; text-align: right; }
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
    "soon": "Soon",
    "edit": "Edit"
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
    "saveFailed": "Could not save employee",
    "edit": "Edit employee",
    "gender": "Gender",
    "dob": "Date of birth",
    "staffId": "Staff ID",
    "address": "Address",
    "section": "Section/Estate",
    "costCentre": "Cost centre",
    "crew": "Crew",
    "startDate": "Start date",
    "contractStart": "Contract start",
    "contractEnd": "Contract end",
    "ssn": "Social security no.",
    "tin": "Tax ID (TIN)",
    "currency": "Currency",
    "dailyRate": "Daily rate",
    "hourlyRate": "Hourly rate",
    "pieceAmount": "Rate per unit",
    "pieceUnit": "Unit",
    "payMethod": "Payment method",
    "bankName": "Bank",
    "accountNumber": "Account no.",
    "accountName": "Account name",
    "mmProvider": "Mobile money provider",
    "mmNumber": "Mobile money no.",
    "taskType": "Task type",
    "quota": "Quota",
    "quotaUnit": "Quota unit",
    "medical": "Medical clearance",
    "eduLevel": "Education level",
    "institution": "Institution",
    "nokName": "Next of kin",
    "nokRelationship": "Relationship",
    "nokPhone": "Next of kin phone",
    "sec_role": "Role & type",
    "sec_identity": "Identity",
    "sec_contact": "Contact",
    "sec_employment": "Employment",
    "sec_contract": "Contract",
    "sec_statutory": "Statutory",
    "sec_pay": "Compensation",
    "sec_payment": "Payment",
    "sec_field": "Field work",
    "sec_education": "Education",
    "sec_nok": "Next of kin"
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
  },
  "wc_staff": "Staff",
  "wc_field_worker": "Field worker",
  "wc_tapper": "Tapper",
  "wc_operator": "Operator",
  "et_permanent": "Permanent",
  "et_contract": "Contract",
  "et_casual": "Casual",
  "et_seasonal": "Seasonal",
  "et_probation": "Probation",
  "g_male": "Male",
  "g_female": "Female",
  "g_other": "Other",
  "pb_salary": "Salary",
  "pb_daily": "Daily",
  "pb_hourly": "Hourly",
  "pb_piece_rate": "Piece rate",
  "pb_task": "Per task",
  "pm_bank": "Bank",
  "pm_mobile_money": "Mobile money",
  "pm_cash": "Cash",
  "mc_pending": "Pending",
  "mc_cleared": "Cleared",
  "mc_expired": "Expired"
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
    "soon": "Bientôt",
    "edit": "Modifier"
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
    "saveFailed": "Enregistrement impossible",
    "edit": "Modifier l’employé",
    "gender": "Genre",
    "dob": "Date de naissance",
    "staffId": "Matricule",
    "address": "Adresse",
    "section": "Section/Plantation",
    "costCentre": "Centre de coûts",
    "crew": "Équipe",
    "startDate": "Date d’embauche",
    "contractStart": "Début du contrat",
    "contractEnd": "Fin du contrat",
    "ssn": "N° sécurité sociale",
    "tin": "N° fiscal (TIN)",
    "currency": "Devise",
    "dailyRate": "Taux journalier",
    "hourlyRate": "Taux horaire",
    "pieceAmount": "Taux par unité",
    "pieceUnit": "Unité",
    "payMethod": "Mode de paiement",
    "bankName": "Banque",
    "accountNumber": "N° de compte",
    "accountName": "Titulaire du compte",
    "mmProvider": "Opérateur mobile money",
    "mmNumber": "N° mobile money",
    "taskType": "Type de tâche",
    "quota": "Quota",
    "quotaUnit": "Unité de quota",
    "medical": "Aptitude médicale",
    "eduLevel": "Niveau d’études",
    "institution": "Établissement",
    "nokName": "Personne à prévenir",
    "nokRelationship": "Lien",
    "nokPhone": "Téléphone à prévenir",
    "sec_role": "Rôle et type",
    "sec_identity": "Identité",
    "sec_contact": "Contact",
    "sec_employment": "Emploi",
    "sec_contract": "Contrat",
    "sec_statutory": "Obligations légales",
    "sec_pay": "Rémunération",
    "sec_payment": "Paiement",
    "sec_field": "Travail au champ",
    "sec_education": "Formation",
    "sec_nok": "Personne à prévenir"
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
  },
  "wc_staff": "Personnel",
  "wc_field_worker": "Ouvrier de champ",
  "wc_tapper": "Saigneur",
  "wc_operator": "Opérateur",
  "et_permanent": "Permanent",
  "et_contract": "Contrat",
  "et_casual": "Occasionnel",
  "et_seasonal": "Saisonnier",
  "et_probation": "Période d’essai",
  "g_male": "Homme",
  "g_female": "Femme",
  "g_other": "Autre",
  "pb_salary": "Salaire",
  "pb_daily": "Journalier",
  "pb_hourly": "Horaire",
  "pb_piece_rate": "À la pièce",
  "pb_task": "Par tâche",
  "pm_bank": "Banque",
  "pm_mobile_money": "Mobile money",
  "pm_cash": "Espèces",
  "mc_pending": "En attente",
  "mc_cleared": "Apte",
  "mc_expired": "Expiré"
}
NEXUSORA_EOF

echo
echo "Phase 2b client written. Then: cd client && npm run dev"
