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
