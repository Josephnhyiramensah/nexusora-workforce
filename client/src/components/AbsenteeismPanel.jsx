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
