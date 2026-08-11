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
  const [showForm, setShowForm] = useState(false);
  const canWrite = WRITE_ROLES.includes(user?.role);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try { const { data } = await api.get('/employees', { params: { q, page, limit: 10 } }); setData(data); }
    catch (e) { /* surfaced elsewhere */ }
    finally { setLoading(false); }
  }, [q]);

  useEffect(() => { load(1); }, [load]);

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page__title">{t('tiles.employees')}</h1>
        {canWrite && <button className="btn-primary" onClick={() => setShowForm(true)}>{t('employees.add')}</button>}
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
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 && <tr><td colSpan="5" className="muted">{t('employees.none')}</td></tr>}
            {data.items.map((e) => (
              <tr key={e._id}>
                <td>{e.firstName} {e.lastName}</td>
                <td>{e.employment?.jobTitle || '—'}</td>
                <td>{e.employment?.workerClass || '—'}</td>
                <td>{e.employment?.employmentType || '—'}</td>
                <td><span className={`pill pill--${e.status}`}>{e.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="pager">{t('employees.total', { n: data.total })}</p>

      {showForm && <EmployeeForm onClose={() => setShowForm(false)} onCreated={() => { setShowForm(false); load(1); }} />}
    </div>
  );
}
