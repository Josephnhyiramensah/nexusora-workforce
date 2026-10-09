import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useLocale } from '../context/LocaleContext';
import { useAuth } from '../context/AuthContext';
import EmployeeForm from '../components/EmployeeForm';
import { exportTable } from '../utils/exporter';
import {
  Users, Building2, Briefcase, FileText, IdCard, UserPlus, Upload, Search,
  UserCheck, CalendarClock, Layers, ChevronRight, ChevronLeft,
} from 'lucide-react';
import {
  RouteShell, Hero, KpiBand, Kpi, Body, Card, EmpCell, Pill, Empty,
  HeroBtn, TableWrap,
} from '../ui/kit';
import {
  C, NUM, cap, fullName, ghostBtn, rowStyle, td,
} from '../ui/tokens';

const WRITE_ROLES = ['super_admin', 'hr_manager', 'hr_officer'];

const PEOPLE_RAIL = {
  brand: { title: 'People', subtitle: 'Workforce directory', Icon: Users, titleKey: 'nav.people', subtitleKey: 'employees.railSub' },
  groups: [
    { title: 'Directory', titleKey: 'employees.grp_directory', items: [
      { label: 'Employees', labelKey: 'home.tile.employees', to: '/employees', Icon: Users },
      { label: 'Organization', labelKey: 'home.tile.organization', to: '/organization', Icon: Building2 },
    ] },
    { title: 'Roles', titleKey: 'employees.grp_roles', items: [
      { label: 'Positions', labelKey: 'home.tile.positions', to: '/positions', Icon: Briefcase },
      { label: 'Job Descriptions', labelKey: 'home.tile.jd', to: '/job-descriptions', Icon: FileText },
    ] },
    { title: 'Access', titleKey: 'employees.grp_access', items: [
      { label: 'Self-Service', labelKey: 'home.tile.self', to: '/self-service', Icon: IdCard },
    ] },
  ],
};

const STATUS = { active: ['employees.st_active', 'green'], probation: ['employees.st_probation', 'amber'], on_leave: ['employees.st_on_leave', 'blue'], suspended: ['employees.st_suspended', 'amber'], terminated: ['employees.st_terminated', 'red'], inactive: ['employees.st_inactive', 'grey'] };
const statusPill = (s, t) => { const st = STATUS[String(s || '').toLowerCase()]; return <Pill tone={st ? st[1] : 'grey'}>{st ? t(st[0]) : (cap(s) || '—')}</Pill>; };
const deptOf = (e) => (e.employment?.departmentId && typeof e.employment.departmentId === 'object' ? e.employment.departmentId.name : e.employment?.department) || '';
const sectionOf = (e) => (e.employment?.sectionId && typeof e.employment.sectionId === 'object' ? e.employment.sectionId.name : e.employment?.section) || '';

export default function EmployeesPage() {
  const { t } = useLocale();
  const { user } = useAuth();
  const navigate = useNavigate();
  const canWrite = WRITE_ROLES.includes(user?.role);

  // People rail — translated at render time (falls back to the English literal).
  const rail = useMemo(() => ({
    brand: { ...PEOPLE_RAIL.brand, title: t(PEOPLE_RAIL.brand.titleKey), subtitle: t(PEOPLE_RAIL.brand.subtitleKey) },
    groups: PEOPLE_RAIL.groups.map((g) => ({ ...g, title: t(g.titleKey), items: g.items.map((it) => ({ ...it, label: t(it.labelKey) })) })),
  }), [t]);

  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [q, setQ] = useState('');
  const [empFilter, setEmpFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  // Picklist name maps (worker class / employment type), corrected like the profile page.
  const [wcMap, setWcMap] = useState({});
  const [etMap, setEtMap] = useState({});
  useEffect(() => { let a = true; (async () => { try { const { data } = await api.get('/picklists', { params: { active: 'true' } }); if (!a) return; const wc = {}, et = {}; (data.items || []).forEach((i) => { if (i.type === 'worker_class') wc[i.code] = i.name; if (i.type === 'employment_type') et[i.code] = i.name; }); setWcMap(wc); setEtMap(et); } catch { /* fall back to code */ } })(); return () => { a = false; }; }, []);

  // Directory (server-paginated)
  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try { const { data } = await api.get('/employees', { params: { q, page, limit: 10 } }); setData(data); }
    finally { setLoading(false); }
  }, [q]);
  useEffect(() => { (async () => { await load(1); })(); }, [load]);

  // Stats snapshot for KPIs + export (whole directory). Metrics are computed here,
  // when the data arrives, so no impure calls (Date.now) run during render.
  const [stats, setStats] = useState(null);
  const [statsReload, setStatsReload] = useState(0);
  useEffect(() => {
    let a = true;
    (async () => {
      try {
        const { data } = await api.get('/employees', { params: { limit: 1000 } });
        if (!a) return;
        const items = data.items || [];
        const total = data.total ?? items.length;
        const now = Date.now();
        const activeCount = items.filter((e) => String(e.status || 'active').toLowerCase() === 'active').length;
        const newHires = items.filter((e) => { const d = e.employment?.startDate ? new Date(e.employment.startDate).getTime() : 0; return d && (now - d) <= 90 * 864e5; }).length;
        const deptCount = new Set(items.map((e) => deptOf(e)).filter(Boolean)).size;
        setStats({ items, total, activeCount, newHires, deptCount });
      } catch { if (a) setStats({ items: [], total: 0, activeCount: 0, newHires: 0, deptCount: 0 }); }
    })();
    return () => { a = false; };
  }, [statsReload]);

  const refreshAll = () => { load(data.page || 1); setStatsReload((n) => n + 1); };
  const openProfile = (emp) => navigate(`/employees/${emp._id}`);
  const onSaved = () => { setFormOpen(false); setEditing(null); refreshAll(); };

  const wcLabel = (c) => wcMap[c] || cap(c) || '—';
  const etLabel = (c) => etMap[c] || cap(c) || '—';

  // KPI values (computed in the effect above, read here)
  const list = stats?.items || [];
  const headcount = stats?.total ?? data.total;
  const activeCount = stats?.activeCount ?? 0;
  const newHires = stats?.newHires ?? 0;
  const deptCount = stats?.deptCount ?? 0;

  // KPI drill: filter the directory client-side from the full stats snapshot.
  const nowMs = Date.now();
  const filteredList = empFilter === 'active' ? list.filter((e) => String(e.status || 'active').toLowerCase() === 'active')
    : empFilter === 'new_hires' ? list.filter((e) => { const d = e.employment?.startDate ? new Date(e.employment.startDate).getTime() : 0; return d && (nowMs - d) <= 90 * 864e5; })
    : null;
  const rows = filteredList || data.items;
  const EMP_LABEL = { active: t('employees.lbl_active'), new_hires: t('employees.lbl_newhires') };

  function exportDirectory() {
    exportTable({
      filename: 'Employee_Directory.xlsx', sheet: t('tiles.employees'), title: t('employees.exp_title'), subtitle: t('employees.exp_subtitle'),
      filters: { [t('common.search')]: q || t('employees.exp_all'), [t('employees.exp_total')]: String(headcount) },
      columns: [
        { label: t('employees.staffId'), key: 'staffId', width: 14 }, { label: t('employees.name'), key: 'name', width: 24 },
        { label: t('employees.jobTitle'), key: 'job', width: 22 }, { label: t('employees.department'), key: 'dept', width: 20 },
        { label: t('employees.workerClass'), key: 'wc', width: 16 }, { label: t('employees.type'), key: 'et', width: 16 },
        { label: t('employees.status'), key: 'stat', width: 14, align: 'center', color: (v) => (STATUS[String(v).toLowerCase()] ? ({ green: C.green, amber: C.amber, red: C.red, blue: C.accentInk, grey: C.muted }[STATUS[String(v).toLowerCase()][1]]) : C.muted) },
      ],
      rows: list.map((e) => ({ staffId: e.staffId || '', name: fullName(e), job: e.employment?.jobTitle || '', dept: deptOf(e), wc: wcLabel(e.employment?.workerClass), et: etLabel(e.employment?.employmentType), stat: e.status || 'active' })),
    });
  }

  return (
    <RouteShell brand={rail.brand} groups={rail.groups}>
      <Hero crumbs={[t('nav.people'), t('tiles.employees')]} title={t('tiles.employees')}
        subtitle={t('employees.heroSub')}
        actions={<>
          {list.length > 0 && <HeroBtn ghost Icon={Upload} onClick={exportDirectory}>{t('common.export')}</HeroBtn>}
          {canWrite && <HeroBtn ghost Icon={Upload} onClick={() => navigate('/ai-advisor?section=import')}>{t('common.import')}</HeroBtn>}
          {canWrite && <HeroBtn Icon={UserPlus} onClick={() => { setEditing(null); setFormOpen(true); }}>{t('employees.add')}</HeroBtn>}
        </>} />

      <KpiBand>
        <Kpi Icon={Users} label={t('employees.kpi_headcount')} value={headcount != null ? headcount : '—'} foot={<span>{t('employees.kpi_headcount_foot')}</span>} onClick={() => setEmpFilter('')} />
        <Kpi Icon={UserCheck} iconColor={C.green} iconBg={C.greenBg} label={t('employees.kpi_active')} value={stats ? activeCount : '—'} pill={stats && headcount ? [`${Math.round((activeCount / Math.max(headcount, 1)) * 100)}%`, 'green'] : null} foot={<span>{t('employees.kpi_active_foot')}</span>} onClick={() => setEmpFilter('active')} />
        <Kpi Icon={CalendarClock} iconColor={C.accentInk} iconBg="#e6f1fd" label={t('employees.kpi_newhires')} value={stats ? newHires : '—'} foot={<span>{t('employees.kpi_newhires_foot')}</span>} onClick={() => setEmpFilter('new_hires')} />
        <Kpi Icon={Layers} iconColor={C.navy} iconBg={C.greyBg} label={t('employees.kpi_depts')} value={stats ? deptCount : '—'} foot={<span>{t('employees.kpi_depts_foot')}</span>} />
      </KpiBand>

      <Body>
        <Card title={t('tiles.employees')} sub={empFilter ? `${rows.length} · ${EMP_LABEL[empFilter]}` : (headcount != null ? t('employees.totalCount', { n: headcount }) : '')} right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {empFilter && <button onClick={() => setEmpFilter('')} style={{ ...ghostBtn, padding: '8px 12px', fontSize: '.8rem', color: C.accentInk }}>{t('common.clearFilter')} ✕</button>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f2f5f8', border: `1px solid ${C.line}`, borderRadius: 9, padding: '7px 11px', width: 260 }}>
              <Search size={15} color={C.muted2} />
              <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { setEmpFilter(''); load(1); } }} placeholder={t('employees.search')}
                style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '.85rem', color: C.ink, width: '100%', fontFamily: 'inherit' }} />
            </div>
            <button onClick={() => { setEmpFilter(''); load(1); }} style={{ ...ghostBtn, padding: '8px 14px', fontSize: '.82rem' }}>{t('common.search')}</button>
          </div>
        }>
          {loading ? <Empty>{t('common.loading')}</Empty> : rows.length === 0 ? <Empty>{empFilter ? t('employees.noneFilter') : t('employees.none')}</Empty> : (
            <TableWrap head={[[t('employees.employee')], [t('employees.department')], [t('employees.workerClass')], [t('employees.type')], [t('employees.status')], ['', 'r']]}>
              {rows.map((e) => (
                <tr key={e._id} className="nx-row" onClick={() => openProfile(e)} style={rowStyle}>
                  <td style={td}><EmpCell e={{ firstName: e.firstName, lastName: e.lastName, jobTitle: e.employment?.jobTitle }} /></td>
                  <td style={td}>{deptOf(e) || '—'}{sectionOf(e) ? <div style={{ fontSize: '.72rem', color: C.muted2 }}>{sectionOf(e)}</div> : null}</td>
                  <td style={td}>{wcLabel(e.employment?.workerClass)}</td>
                  <td style={td}><Pill tone="grey">{etLabel(e.employment?.employmentType)}</Pill></td>
                  <td style={td}>{statusPill(e.status, t)}</td>
                  <td style={{ ...td, textAlign: 'right' }}><ChevronRight size={16} color={C.muted2} /></td>
                </tr>
              ))}
            </TableWrap>
          )}
          {!loading && !empFilter && data.pages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
              <span style={{ ...NUM, fontSize: '.8rem', color: C.muted2 }}>{t('employees.pageInfo', { page: data.page, pages: data.pages, total: data.total })}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button disabled={data.page <= 1} onClick={() => load(data.page - 1)} style={{ ...ghostBtn, padding: '7px 12px', fontSize: '.82rem', opacity: data.page <= 1 ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 4 }}><ChevronLeft size={14} /> {t('common.prev')}</button>
                <button disabled={data.page >= data.pages} onClick={() => load(data.page + 1)} style={{ ...ghostBtn, padding: '7px 12px', fontSize: '.82rem', opacity: data.page >= data.pages ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 4 }}>{t('common.next')} <ChevronRight size={14} /></button>
              </div>
            </div>
          )}
        </Card>
      </Body>

      {formOpen && <EmployeeForm employee={editing} onClose={() => { setFormOpen(false); setEditing(null); }} onSaved={onSaved} />}
    </RouteShell>
  );
}
