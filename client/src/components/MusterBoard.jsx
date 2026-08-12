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
