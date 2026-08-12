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
