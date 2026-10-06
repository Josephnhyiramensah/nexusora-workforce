import { useState, useEffect, useCallback } from 'react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import api from '../api/client';
import { useLocale } from '../context/LocaleContext';
import { useCountUp } from '../hooks/useCountUp';
import { SkeletonKPIs } from './Skeleton';

const iso = (d) => d.toISOString().slice(0, 10);
const today = () => iso(new Date());
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

function KPI({ value, label, variant }) {
  const v = useCountUp(value);
  return <div className={`kpi ${variant || ''}`}><span className="kpi__value">{v}{typeof value === 'number' && String(value).includes('.') ? '' : ''}</span><span className="kpi__label">{label}</span></div>;
}

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
  const trend = (data?.trend || []).map((r) => ({ date: String(r.date).slice(5, 10), lost: r.lostManDays }));
  const dept = (data?.byDepartment || []).map((d) => ({ department: d.department, lost: d.lostManDays }));

  return (
    <div>
      <div className="toolbar">
        <label className="field-inline">{t('attendance.from')}<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="field-inline">{t('attendance.to')}<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <input className="toolbar__search" placeholder={t('attendance.departmentFilter')} value={department} onChange={(e) => setDepartment(e.target.value)} />
        <button className="btn" onClick={load} disabled={loading}>{loading ? t('common.loading') : t('common.search')}</button>
      </div>

      {loading && !s ? <SkeletonKPIs n={4} /> : s && (
        <>
          <div className="kpi-grid">
            <KPI value={s.lostManDays} label={t('attendance.lostManDays')} variant="kpi--gold" />
            <KPI value={s.absenteeismRate} label={t('attendance.absenteeismRate') + ' (%)'} variant="kpi--blue" />
            <KPI value={s.scheduledManDays} label={t('attendance.scheduledManDays')} />
            <KPI value={s.absentCount} label={t('attendance.absences')} />
          </div>

          <div className="chart-card">
            <div className="chart-card__title">{t('attendance.trendTitle')}</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trend} margin={{ top: 6, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#7a869c' }} />
                <YAxis tick={{ fontSize: 11, fill: '#7a869c' }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e7f0', fontSize: 12 }} />
                <Line type="monotone" dataKey="lost" stroke="#C9A227" strokeWidth={2.5} dot={{ r: 2.5 }} name={t('attendance.lostManDays')} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card">
            <div className="chart-card__title">{t('attendance.byDepartment')}</div>
            <ResponsiveContainer width="100%" height={Math.max(160, dept.length * 42)}>
              <BarChart data={dept} layout="vertical" margin={{ top: 6, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#7a869c' }} allowDecimals={false} />
                <YAxis type="category" dataKey="department" width={110} tick={{ fontSize: 11, fill: '#47526a' }} />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e7f0', fontSize: 12 }} cursor={{ fill: '#f5f8fc' }} />
                <Bar dataKey="lost" fill="#2E75B6" radius={[0, 6, 6, 0]} name={t('attendance.lostManDays')} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <h3 className="subhead">{t('attendance.chronic')}</h3>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('employees.name')}</th><th>{t('attendance.absences')}</th></tr></thead>
              <tbody>
                {data.chronic.length === 0 && <tr><td colSpan="2" className="muted">{t('attendance.noData')}</td></tr>}
                {data.chronic.map((c, i) => (<tr key={i}><td>{c.name}</td><td>{c.absences}</td></tr>))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
