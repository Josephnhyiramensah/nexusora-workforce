import { useState, useEffect } from 'react';
import api from '../api/client';
import { useLocale } from '../context/LocaleContext';
import { useAuth } from '../context/AuthContext';
import {
  GENDERS, PAY_BASES, PAY_METHODS,
  sectionsForRecord, payFieldsFor, defaultPayBasisFor, defaultPaymentMethodFor, findByCode,
} from '../config/employeeProfiles';

const isoDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d) ? '' : d.toISOString().slice(0, 10);
};
const todayISO = () => new Date().toISOString().slice(0, 10);

function initialState(emp, baseCurrency) {
  const e = emp || {};
  const em = e.employment || {}; const comp = e.compensation || {};
  const pay = e.payment || {}; const bank = pay.bank || {}; const mm = pay.mobileMoney || {};
  const fw = e.fieldWork || {}; const mc = fw.medicalClearance || {};
  const nok = e.nextOfKin || {}; const st = e.statutory || {}; const ed = e.education || {};
  const pr = comp.pieceRate || {};
  return {
    // Effective-dated-history metadata (sent only on edit; never stored on the employee doc).
    effectiveDate: todayISO(),
    changeNote: '',
    firstName: e.firstName || '', lastName: e.lastName || '', gender: e.gender || '',
    dateOfBirth: isoDate(e.dateOfBirth), nationalId: e.nationalId || '',
    email: e.email || '', phone: e.phone || '', address: e.address || '',
    nextOfKin: { name: nok.name || '', relationship: nok.relationship || '', phone: nok.phone || '' },
    employment: {
      staffId: e.staffId || '', jobTitle: em.jobTitle || '',
      department: em.department || '', departmentId: em.departmentId || '',
      section: em.section || '', sectionId: em.sectionId || '',
      positionId: em.positionId || '',
      costCentre: em.costCentre || '', grade: em.grade || '', crew: em.crew || '',
      workerClass: em.workerClass || 'staff', employmentType: em.employmentType || 'permanent',
      startDate: isoDate(em.startDate), confirmationStatus: em.confirmationStatus || 'probation',
      probationEndDate: isoDate(em.probationEndDate),
      contractStart: isoDate(em.contractStart), contractEnd: isoDate(em.contractEnd),
    },
    statutory: { socialSecurityNumber: st.socialSecurityNumber || '', taxId: st.taxId || '' },
    compensation: {
      payBasis: comp.payBasis || 'salary', currency: comp.currency || baseCurrency || '',
      baseSalary: comp.baseSalary ?? '', dailyRate: comp.dailyRate ?? '', hourlyRate: comp.hourlyRate ?? '',
      pieceAmount: pr.amount ?? '', pieceUnit: pr.unit || 'kg',
    },
    payment: {
      method: pay.method || 'bank',
      bank: { bankName: bank.bankName || '', accountNumber: bank.accountNumber || '', accountName: bank.accountName || '' },
      mobileMoney: { provider: mm.provider || '', number: mm.number || '' },
    },
    fieldWork: { taskType: fw.taskType || '', quota: fw.quota ?? '', quotaUnit: fw.quotaUnit || 'trees', medicalStatus: mc.status || 'pending' },
    education: { level: ed.level || '', institution: ed.institution || '' },
  };
}

const numOrUndef = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));

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

  // Picklists (worker classes / employment types / grades) + org units + positions.
  const [workerClasses, setWorkerClasses] = useState([]);
  const [employmentTypes, setEmploymentTypes] = useState([]);
  const [grades, setGrades] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [sectionUnits, setSectionUnits] = useState([]);
  const [positions, setPositions] = useState([]);
  const [loadingLists, setLoadingLists] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [pl, orgRes, posRes] = await Promise.all([
          api.get('/picklists', { params: { active: 'true' } }),
          api.get('/org', { params: { active: 'true' } }),
          api.get('/positions', { params: { active: 'true' } }),
        ]);
        if (!alive) return;
        const items = pl.data.items || [];
        setWorkerClasses(items.filter((i) => i.type === 'worker_class'));
        setEmploymentTypes(items.filter((i) => i.type === 'employment_type'));
        setGrades(items.filter((i) => i.type === 'grade'));
        const units = orgRes.data.items || [];
        setDepartments(units.filter((u) => u.type === 'department'));
        setSectionUnits(units.filter((u) => u.type === 'section'));
        setPositions((posRes.data.items || []).filter((p) => p.active !== false));
      } catch { /* lists stay empty if fetch fails */ }
      finally { if (alive) setLoadingLists(false); }
    })();
    return () => { alive = false; };
  }, []);

  const setField = (path, value) => setF((prev) => {
    const next = structuredClone(prev);
    const keys = path.split('.'); let o = next;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys[keys.length - 1]] = value;
    return next;
  });

  const pickDepartment = (id) => setF((prev) => {
    const unit = departments.find((u) => u._id === id);
    return { ...prev, employment: { ...prev.employment, departmentId: id, department: unit ? unit.name : '' } };
  });
  const pickSection = (id) => setF((prev) => {
    const unit = sectionUnits.find((u) => u._id === id);
    return { ...prev, employment: { ...prev.employment, sectionId: id, section: unit ? unit.name : '' } };
  });

  // When worker class changes, read THAT record's flags to set pay/payment defaults.
  const onClassChange = (code) => setF((prev) => {
    const rec = findByCode(workerClasses, code);
    return {
      ...prev,
      employment: { ...prev.employment, workerClass: code },
      compensation: { ...prev.compensation, payBasis: defaultPayBasisFor(rec) },
      payment: { ...prev.payment, method: defaultPaymentMethodFor(rec) },
    };
  });

  // Current worker-class record (for section logic) + sections to show.
  const currentWC = findByCode(workerClasses, f.employment.workerClass);
  const sections = sectionsForRecord(currentWC, f.employment.employmentType);
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
          jobTitle: f.employment.jobTitle,
          department: f.employment.department, departmentId: f.employment.departmentId || undefined,
          section: f.employment.section, sectionId: f.employment.sectionId || undefined,
          positionId: f.employment.positionId || undefined,
          costCentre: f.employment.costCentre, grade: f.employment.grade, crew: f.employment.crew,
          workerClass: f.employment.workerClass, employmentType: f.employment.employmentType,
          startDate: f.employment.startDate, confirmationStatus: f.employment.confirmationStatus,
          probationEndDate: f.employment.probationEndDate,
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
      if (editing) {
        // effectiveDate / changeNote are history metadata read by the controller,
        // then stripped before the employee doc is written.
        await api.put(`/employees/${employee._id}`, {
          ...payload,
          effectiveDate: f.effectiveDate || undefined,
          changeNote: f.changeNote?.trim() || undefined,
        });
      } else {
        await api.post('/employees', payload);
      }
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

        {loadingLists && <div className="info-note">Loading lists…</div>}

        {editing && (<>
          <h3 className="form-section">Effective date of change</h3>
          <div className="grid2">
            <label className="field">Effective date
              <input type="date" value={f.effectiveDate} onChange={(e) => setField('effectiveDate', e.target.value)} />
            </label>
            <label className="field">Change note (optional)
              <input value={f.changeNote} onChange={(e) => setField('changeNote', e.target.value)}
                placeholder="e.g. Annual promotion, pay review" />
            </label>
          </div>
          <p style={{ fontSize: '.78rem', color: 'var(--muted)', margin: '-4px 0 4px' }}>
            Used to date any job or pay change on the History timeline. Defaults to today.
          </p>
        </>)}

        <h3 className="form-section">{t('employees.sec_role')}</h3>
        <div className="grid2">
          <label className="field">{t('employees.workerClass')}
            <select value={f.employment.workerClass} onChange={(e) => onClassChange(e.target.value)}>
              <option value="">—</option>
              {workerClasses.map((w) => <option key={w._id} value={w.code}>{w.name}</option>)}
            </select>
          </label>
          <label className="field">{t('employees.type')}
            <select value={f.employment.employmentType} onChange={(e) => setField('employment.employmentType', e.target.value)}>
              <option value="">—</option>
              {employmentTypes.map((et) => <option key={et._id} value={et.code}>{et.name}</option>)}
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
          <label className="field">Position
            <select value={f.employment.positionId || ''} onChange={(e) => setField('employment.positionId', e.target.value)}>
              <option value="">—</option>
              {positions.map((p) => <option key={p._id} value={p._id}>{p.title}{p.code ? ` (${p.code})` : ''}</option>)}
            </select>
          </label>
          <label className="field">{t('employees.department')}
            <select value={f.employment.departmentId || ''} onChange={(e) => pickDepartment(e.target.value)}>
              <option value="">—</option>
              {departments.map((u) => <option key={u._id} value={u._id}>{u.name}{u.code ? ` (${u.code})` : ''}</option>)}
            </select>
          </label>
          <label className="field">{t('employees.section')}
            <select value={f.employment.sectionId || ''} onChange={(e) => pickSection(e.target.value)}>
              <option value="">—</option>
              {sectionUnits.map((u) => <option key={u._id} value={u._id}>{u.name}{u.code ? ` (${u.code})` : ''}</option>)}
            </select>
          </label>
          <label className="field">{t('employees.grade') || 'Grade'}
            <select value={f.employment.grade} onChange={(e) => setField('employment.grade', e.target.value)}>
              <option value="">—</option>
              {grades.map((g) => <option key={g._id} value={g.code}>{g.name}</option>)}
            </select>
          </label>
          {F(t('employees.costCentre'), 'employment.costCentre')}
          {sections.has('fieldWork') && F(t('employees.crew'), 'employment.crew')}
          {F(t('employees.startDate'), 'employment.startDate', { type: 'date' })}
          <label className="field">Confirmation status
            <select value={f.employment.confirmationStatus} onChange={(e) => setField('employment.confirmationStatus', e.target.value)}>
              <option value="probation">Probation</option>
              <option value="confirmed">Confirmed</option>
              <option value="exited">Exited</option>
            </select>
          </label>
          {F('Probation end date', 'employment.probationEndDate', { type: 'date' })}
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