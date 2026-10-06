import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Users, Building2, Briefcase, FileText, IdCard, Plus, UserCheck, UserX, Layers } from 'lucide-react';
import {
  RouteShell, Hero, KpiBand, Kpi, Body, Card, Empty, Pill,
  Overlay, Field, Lbl, Actions, ErrBox, HeroBtn, TableWrap,
} from '../ui/kit';
import { C, NUM, rowStyle, td, inp, miniBtn } from '../ui/tokens';

const WRITE_ROLES = ['super_admin', 'hr_manager', 'hr_officer'];
const emptyForm = { title: '', code: '', department: '', grade: '', workerClass: 'staff', employmentType: 'permanent', reportsTo: '', headcount: 1, active: true };

const PEOPLE_RAIL = {
  brand: { title: 'People', subtitle: 'Workforce directory', Icon: Users },
  groups: [
    { title: 'Directory', items: [{ label: 'Employees', to: '/employees', Icon: Users }, { label: 'Organization', to: '/organization', Icon: Building2 }] },
    { title: 'Roles', items: [{ label: 'Positions', to: '/positions', Icon: Briefcase }, { label: 'Job Descriptions', to: '/job-descriptions', Icon: FileText }] },
    { title: 'Access', items: [{ label: 'Self-Service', to: '/self-service', Icon: IdCard }] },
  ],
};

export default function PositionsPage() {
  const { user } = useAuth();
  const canWrite = WRITE_ROLES.includes(user?.role);

  const [items, setItems] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [workerClasses, setWorkerClasses] = useState([]);
  const [employmentTypes, setEmploymentTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [pos, org, pl] = await Promise.all([
        api.get('/positions'),
        api.get('/org', { params: { type: 'department', active: 'true' } }),
        api.get('/picklists', { params: { active: 'true' } }),
      ]);
      setItems(pos.data.items || []);
      setDepartments(org.data.items || []);
      const lists = pl.data.items || [];
      setWorkerClasses(lists.filter((i) => i.type === 'worker_class'));
      setEmploymentTypes(lists.filter((i) => i.type === 'employment_type'));
    } catch (err) { setError(err?.response?.data?.message || 'Could not load positions.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const totalHead = items.reduce((a, p) => a + (p.headcount ?? 1), 0);
  const totalFilled = items.reduce((a, p) => a + (p.filled ?? 0), 0);
  const totalVacant = items.reduce((a, p) => a + (p.vacant ?? 0), 0);
  const [posFilter, setPosFilter] = useState('all');
  const shown = posFilter === 'vacant' ? items.filter((p) => (p.vacant ?? 0) > 0) : posFilter === 'filled' ? items.filter((p) => (p.vacant ?? 0) === 0) : items;
  const FILTER_LABEL = { all: 'All positions', vacant: 'With vacancies', filled: 'Fully filled' };

  const openCreate = () => { setEditing(null); setForm(emptyForm); setFormError(''); setModalOpen(true); };
  const openEdit = (p) => {
    if (!canWrite) return;
    setEditing(p);
    setForm({ title: p.title || '', code: p.code || '', department: p.department?._id || p.department || '', grade: p.grade || '', workerClass: p.workerClass || 'staff', employmentType: p.employmentType || 'permanent', reportsTo: p.reportsTo?._id || p.reportsTo || '', headcount: p.headcount ?? 1, active: p.active !== false });
    setFormError(''); setModalOpen(true);
  };
  const save = async () => {
    if (!form.title.trim()) { setFormError('Title is required.'); return; }
    setSaving(true); setFormError('');
    const payload = { title: form.title.trim(), code: form.code.trim(), department: form.department || null, grade: form.grade.trim(), workerClass: form.workerClass, employmentType: form.employmentType, reportsTo: form.reportsTo || null, headcount: Number(form.headcount) || 1, active: form.active };
    try { if (editing) await api.put(`/positions/${editing._id}`, payload); else await api.post('/positions', payload); setModalOpen(false); setEditing(null); load(); }
    catch (err) { setFormError(err?.response?.data?.message || 'Could not save. Check the code isn’t already used.'); }
    finally { setSaving(false); }
  };
  const deactivate = async (e, p) => {
    e.stopPropagation();
    if (!window.confirm(`Deactivate "${p.title}"?`)) return;
    try { await api.delete(`/positions/${p._id}`); load(); }
    catch (err) { setError(err?.response?.data?.message || 'Could not deactivate.'); }
  };
  const reportsToOptions = items.filter((p) => !editing || p._id !== editing._id);

  return (
    <RouteShell brand={PEOPLE_RAIL.brand} groups={PEOPLE_RAIL.groups}>
      <Hero crumbs={['People', 'Positions']} title="Positions"
        actions={canWrite && <HeroBtn Icon={Plus} onClick={openCreate}>Add position</HeroBtn>} />
      <KpiBand>
        <Kpi Icon={Briefcase} label="Positions" value={loading ? '—' : items.length} foot={<span>defined seats</span>} onClick={() => setPosFilter('all')} />
        <Kpi Icon={Layers} iconColor={C.navy} iconBg={C.greyBg} label="Total headcount" value={loading ? '—' : totalHead} foot={<span>budgeted seats</span>} onClick={() => setPosFilter('all')} />
        <Kpi Icon={UserCheck} iconColor={C.green} iconBg={C.greenBg} label="Filled" value={loading ? '—' : totalFilled} pill={!loading && totalHead ? [`${Math.round((totalFilled / totalHead) * 100)}%`, 'green'] : null} foot={<span>occupied</span>} onClick={() => setPosFilter('filled')} />
        <Kpi Icon={UserX} iconColor={C.amber} iconBg={C.amberBg} label="Vacant" value={loading ? '—' : totalVacant} pill={!loading && totalVacant ? ['open', 'amber'] : null} foot={<span>to recruit</span>} onClick={() => setPosFilter('vacant')} />
      </KpiBand>
      <Body>
        {error && <ErrBox>{error}</ErrBox>}
        <Card title="Positions" sub={loading ? '' : `${shown.length} shown · ${FILTER_LABEL[posFilter]}`} right={posFilter !== 'all' ? <button onClick={() => setPosFilter('all')} style={{ border: `1px solid ${C.line}`, background: '#fff', color: C.accentInk, fontWeight: 700, fontSize: '.78rem', borderRadius: 8, padding: '5px 11px', cursor: 'pointer', fontFamily: 'inherit' }}>Clear filter ✕</button> : null}>
          {loading ? <Empty>Loading…</Empty> : shown.length === 0 ? <Empty>No positions match this filter.</Empty> : (
            <TableWrap head={[['Title'], ['Code'], ['Department'], ['Grade'], ['Reports to'], ['Head', 'r'], ['Filled', 'r'], ['Vacant', 'r'], ['Status'], canWrite ? ['', 'r'] : ['']]}>
              {shown.map((p) => (
                <tr key={p._id} className="nx-row" onClick={() => openEdit(p)} style={canWrite ? rowStyle : { borderTop: `1px solid ${C.lineSoft}` }}>
                  <td style={{ ...td, fontWeight: 700, color: C.navy }}>{p.title}</td>
                  <td style={td}>{p.code || '—'}</td>
                  <td style={td}>{p.department?.name || '—'}</td>
                  <td style={td}>{p.grade || '—'}</td>
                  <td style={td}>{p.reportsTo?.title || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', ...NUM }}>{p.headcount ?? 1}</td>
                  <td style={{ ...td, textAlign: 'right', ...NUM }}>{p.filled ?? 0}</td>
                  <td style={{ ...td, textAlign: 'right' }}><Pill tone={p.vacant > 0 ? 'amber' : 'green'}>{p.vacant ?? 0}</Pill></td>
                  <td style={td}><Pill tone={p.active !== false ? 'green' : 'amber'}>{p.active !== false ? 'Active' : 'Inactive'}</Pill></td>
                  {canWrite && (
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => openEdit(p)} style={miniBtn(C.accent)}>Edit</button>
                      {p.active !== false && <button onClick={(e) => deactivate(e, p)} style={{ ...miniBtn(C.red), marginLeft: 6 }}>Deactivate</button>}
                    </td>
                  )}
                </tr>
              ))}
            </TableWrap>
          )}
        </Card>
      </Body>

      {modalOpen && (
        <Overlay onClose={() => setModalOpen(false)} title={editing ? 'Edit Position' : 'New Position'} width={640}>
          {formError && <ErrBox>{formError}</ErrBox>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Title" value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} placeholder="e.g. IT Director" />
            <Field label="Code" value={form.code} onChange={(v) => setForm((f) => ({ ...f, code: v }))} placeholder="e.g. POS-IT-001" />
            <label style={{ display: 'block', marginBottom: 12 }}><Lbl>Department</Lbl><select value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} style={inp}><option value="">—</option>{departments.map((d) => <option key={d._id} value={d._id}>{d.name}{d.code ? ` (${d.code})` : ''}</option>)}</select></label>
            <Field label="Grade" value={form.grade} onChange={(v) => setForm((f) => ({ ...f, grade: v }))} placeholder="e.g. M3" />
            <label style={{ display: 'block', marginBottom: 12 }}><Lbl>Worker class</Lbl><select value={form.workerClass} onChange={(e) => setForm((f) => ({ ...f, workerClass: e.target.value }))} style={inp}><option value="">—</option>{workerClasses.map((w) => <option key={w._id} value={w.code}>{w.name}</option>)}</select></label>
            <label style={{ display: 'block', marginBottom: 12 }}><Lbl>Employment type</Lbl><select value={form.employmentType} onChange={(e) => setForm((f) => ({ ...f, employmentType: e.target.value }))} style={inp}><option value="">—</option>{employmentTypes.map((et) => <option key={et._id} value={et.code}>{et.name}</option>)}</select></label>
            <label style={{ display: 'block', marginBottom: 12 }}><Lbl>Reports to</Lbl><select value={form.reportsTo} onChange={(e) => setForm((f) => ({ ...f, reportsTo: e.target.value }))} style={inp}><option value="">— none —</option>{reportsToOptions.map((p) => <option key={p._id} value={p._id}>{p.title}{p.code ? ` (${p.code})` : ''}</option>)}</select></label>
            <Field label="Headcount" type="number" value={form.headcount} onChange={(v) => setForm((f) => ({ ...f, headcount: v }))} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', color: C.ink, margin: '4px 0 12px' }}><input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} /> Active</label>
          <Actions onClose={() => setModalOpen(false)} onSubmit={save} busy={saving} label="Save" />
        </Overlay>
      )}
    </RouteShell>
  );
}