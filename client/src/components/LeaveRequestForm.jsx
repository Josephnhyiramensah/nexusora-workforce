import { useState, useEffect } from 'react';
import api from '../api/client';
import { useLocale } from '../context/LocaleContext';

export default function LeaveRequestForm({ onClose, onSaved }) {
  const { t } = useLocale();
  const [employees, setEmployees] = useState([]);
  const [types, setTypes] = useState([]);
  const [f, setF] = useState({ employee: '', leaveType: '', startDate: '', endDate: '', reason: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    (async () => {
      const [emp, typ] = await Promise.all([
        api.get('/employees', { params: { status: 'active', limit: 200 } }),
        api.get('/leave/types'),
      ]);
      setEmployees(emp.data.items); setTypes(typ.data);
    })().catch(() => {});
  }, []);

  async function submit() {
    setError(''); setBusy(true);
    try { await api.post('/leave/requests', f); onSaved(); }
    catch (e) { setError(e?.response?.data?.message || t('leave.saveFailed')); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal__title">{t('leave.newRequest')}</h2>
        {types.length === 0 && <p className="info-note">{t('leave.noTypesHint')}</p>}
        <div className="grid2">
          <label className="field">{t('leave.employee')}
            <select value={f.employee} onChange={(e) => set('employee', e.target.value)}>
              <option value="">—</option>
              {employees.map((e) => <option key={e._id} value={e._id}>{e.firstName} {e.lastName}</option>)}
            </select>
          </label>
          <label className="field">{t('leave.type')}
            <select value={f.leaveType} onChange={(e) => set('leaveType', e.target.value)}>
              <option value="">—</option>
              {types.map((tp) => <option key={tp._id} value={tp._id}>{tp.name}</option>)}
            </select>
          </label>
          <label className="field">{t('leave.start')}<input type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></label>
          <label className="field">{t('leave.end')}<input type="date" value={f.endDate} onChange={(e) => set('endDate', e.target.value)} /></label>
        </div>
        <label className="field">{t('leave.reason')}<input value={f.reason} onChange={(e) => set('reason', e.target.value)} /></label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal__actions">
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary" disabled={busy || !f.employee || !f.leaveType || !f.startDate || !f.endDate} onClick={submit}>
            {busy ? t('common.loading') : t('leave.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
