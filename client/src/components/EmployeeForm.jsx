import { useState } from 'react';
import api from '../api/client';
import { useLocale } from '../context/LocaleContext';

const WORKER_CLASSES = ['staff', 'field_worker', 'tapper', 'operator'];
const EMPLOYMENT_TYPES = ['permanent', 'contract', 'casual', 'seasonal', 'probation'];
const PAY_BASES = ['salary', 'hourly', 'piece_rate', 'task'];

export default function EmployeeForm({ onClose, onCreated }) {
  const { t } = useLocale();
  const [f, setF] = useState({
    firstName: '', lastName: '', jobTitle: '', department: '',
    workerClass: 'staff', employmentType: 'permanent', payBasis: 'salary', baseSalary: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  async function submit() {
    setError(''); setBusy(true);
    try {
      await api.post('/employees', {
        firstName: f.firstName, lastName: f.lastName,
        employment: { jobTitle: f.jobTitle, department: f.department, workerClass: f.workerClass, employmentType: f.employmentType },
        compensation: { payBasis: f.payBasis, baseSalary: f.baseSalary ? Number(f.baseSalary) : undefined },
      });
      onCreated();
    } catch (e) { setError(e?.response?.data?.message || t('employees.saveFailed')); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal__title">{t('employees.add')}</h2>
        <div className="grid2">
          <label className="field">{t('employees.firstName')}<input value={f.firstName} onChange={(e) => set('firstName', e.target.value)} /></label>
          <label className="field">{t('employees.lastName')}<input value={f.lastName} onChange={(e) => set('lastName', e.target.value)} /></label>
          <label className="field">{t('employees.jobTitle')}<input value={f.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} /></label>
          <label className="field">{t('employees.department')}<input value={f.department} onChange={(e) => set('department', e.target.value)} /></label>
          <label className="field">{t('employees.workerClass')}
            <select value={f.workerClass} onChange={(e) => set('workerClass', e.target.value)}>
              {WORKER_CLASSES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="field">{t('employees.type')}
            <select value={f.employmentType} onChange={(e) => set('employmentType', e.target.value)}>
              {EMPLOYMENT_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="field">{t('employees.payBasis')}
            <select value={f.payBasis} onChange={(e) => set('payBasis', e.target.value)}>
              {PAY_BASES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="field">{t('employees.baseSalary')}<input type="number" value={f.baseSalary} onChange={(e) => set('baseSalary', e.target.value)} /></label>
        </div>
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
