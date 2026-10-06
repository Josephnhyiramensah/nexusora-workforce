import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Users, Building2, Briefcase, FileText, IdCard, Plus, MapPin, Landmark, GitBranch } from 'lucide-react';
import {
  RouteShell, Hero, KpiBand, Kpi, Body, Card, Empty, Segmented, Pill,
  Overlay, Field, Row2, Lbl, Actions, ErrBox, HeroBtn, TableWrap,
} from '../ui/kit';
import { C, rowStyle, td, inp, miniBtn } from '../ui/tokens';

const WRITE_ROLES = ['super_admin', 'hr_manager', 'hr_officer'];
const UNIT_TYPES = [
  { key: 'department', label: 'Departments', singular: 'Department', parentTypes: ['department'], Icon: Building2 },
  { key: 'section', label: 'Sections / Estates', singular: 'Section', parentTypes: ['department'], Icon: GitBranch },
  { key: 'cost_centre', label: 'Cost Centres', singular: 'Cost Centre', parentTypes: ['department'], Icon: Landmark },
  { key: 'location', label: 'Locations', singular: 'Location', parentTypes: ['location'], Icon: MapPin },
];
const TYPE_OPTS = UNIT_TYPES.map((u) => [u.key, u.singular]);
const emptyForm = { type: 'department', name: '', code: '', description: '', parent: '', active: true };

const PEOPLE_RAIL = {
  brand: { title: 'People', subtitle: 'Workforce directory', Icon: Users },
  groups: [
    { title: 'Directory', items: [{ label: 'Employees', to: '/employees', Icon: Users }, { label: 'Organization', to: '/organization', Icon: Building2 }] },
    { title: 'Roles', items: [{ label: 'Positions', to: '/positions', Icon: Briefcase }, { label: 'Job Descriptions', to: '/job-descriptions', Icon: FileText }] },
    { title: 'Access', items: [{ label: 'Self-Service', to: '/self-service', Icon: IdCard }] },
  ],
};

export default function OrganizationPage() {
  const { user } = useAuth();
  const canWrite = WRITE_ROLES.includes(user?.role);

  const [activeType, setActiveType] = useState('department');
  const [items, setItems] = useState([]);
  const [allUnits, setAllUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const typeMeta = UNIT_TYPES.find((u) => u.key === activeType) || UNIT_TYPES[0];

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [typed, all] = await Promise.all([api.get('/org', { params: { type: activeType } }), api.get('/org')]);
      setItems(typed.data.items || []);
      setAllUnits(all.data.items || []);
    } catch (err) { setError(err?.response?.data?.message || 'Could not load organization units.'); }
    finally { setLoading(false); }
  }, [activeType]);
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const counts = UNIT_TYPES.reduce((m, u) => { m[u.key] = allUnits.filter((x) => x.type === u.key).length; return m; }, {});

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm, type: activeType }); setFormError(''); setModalOpen(true); };
  const openEdit = (unit) => {
    if (!canWrite) return;
    setEditing(unit);
    setForm({ type: unit.type, name: unit.name || '', code: unit.code || '', description: unit.description || '', parent: unit.parent?._id || unit.parent || '', active: unit.active !== false });
    setFormError(''); setModalOpen(true);
  };
  const save = async () => {
    if (!form.name.trim()) { setFormError('Name is required.'); return; }
    setSaving(true); setFormError('');
    const payload = { type: form.type, name: form.name.trim(), code: form.code.trim(), description: form.description.trim(), parent: form.parent || null, active: form.active };
    try { if (editing) await api.put(`/org/${editing._id}`, payload); else await api.post('/org', payload); setModalOpen(false); setEditing(null); load(); }
    catch (err) { setFormError(err?.response?.data?.message || 'Could not save. Check the code isn’t already used.'); }
    finally { setSaving(false); }
  };
  const deactivate = async (e, unit) => {
    e.stopPropagation();
    if (!window.confirm(`Deactivate "${unit.name}"? It will no longer appear in pickers.`)) return;
    try { await api.delete(`/org/${unit._id}`); load(); }
    catch (err) { setError(err?.response?.data?.message || 'Could not deactivate.'); }
  };

  const meta = UNIT_TYPES.find((u) => u.key === form.type) || typeMeta;
  const parentOptions = allUnits.filter((u) => meta.parentTypes.includes(u.type) && (!editing || u._id !== editing._id));

  return (
    <RouteShell brand={PEOPLE_RAIL.brand} groups={PEOPLE_RAIL.groups}>
      <Hero crumbs={['People', 'Organization']} title="Organization"
        actions={canWrite && <HeroBtn Icon={Plus} onClick={openCreate}>Add {typeMeta.singular}</HeroBtn>} />
      <KpiBand>
        <Kpi Icon={Building2} label="Departments" value={counts.department ?? '—'} foot={<span>top-level units</span>} onClick={() => setActiveType('department')} />
        <Kpi Icon={GitBranch} iconColor={C.accentInk} iconBg="#e6f1fd" label="Sections / estates" value={counts.section ?? '—'} foot={<span>within departments</span>} onClick={() => setActiveType('section')} />
        <Kpi Icon={Landmark} iconColor={C.green} iconBg={C.greenBg} label="Cost centres" value={counts.cost_centre ?? '—'} foot={<span>for costing</span>} onClick={() => setActiveType('cost_centre')} />
        <Kpi Icon={MapPin} iconColor={C.navy} iconBg={C.greyBg} label="Locations" value={counts.location ?? '—'} foot={<span>sites &amp; offices</span>} onClick={() => setActiveType('location')} />
      </KpiBand>
      <Body>
        {error && <ErrBox>{error}</ErrBox>}
        <div style={{ marginBottom: 4 }}><Segmented items={UNIT_TYPES.map((u) => [u.key, u.label])} active={activeType} onSelect={setActiveType} /></div>
        <Card title={typeMeta.label} sub={`${items.length} in view`}>
          {loading ? <Empty>Loading…</Empty> : items.length === 0 ? <Empty>No {typeMeta.label.toLowerCase()} yet.</Empty> : (
            <TableWrap head={[['Name'], ['Code'], ['Parent'], ['Status'], canWrite ? ['', 'r'] : ['']]}>
              {items.map((u) => (
                <tr key={u._id} className="nx-row" onClick={() => openEdit(u)} style={canWrite ? rowStyle : { borderTop: `1px solid ${C.lineSoft}` }}>
                  <td style={{ ...td, fontWeight: 700, color: C.navy }}>{u.name}</td>
                  <td style={td}>{u.code || '—'}</td>
                  <td style={td}>{u.parent?.name || '—'}</td>
                  <td style={td}><Pill tone={u.active !== false ? 'green' : 'amber'}>{u.active !== false ? 'Active' : 'Inactive'}</Pill></td>
                  {canWrite && (
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => openEdit(u)} style={miniBtn(C.accent)}>Edit</button>
                      {u.active !== false && <button onClick={(e) => deactivate(e, u)} style={{ ...miniBtn(C.red), marginLeft: 6 }}>Deactivate</button>}
                    </td>
                  )}
                </tr>
              ))}
            </TableWrap>
          )}
        </Card>
      </Body>

      {modalOpen && (
        <Overlay onClose={() => setModalOpen(false)} title={editing ? `Edit ${meta.singular}` : `New ${meta.singular}`}>
          {formError && <ErrBox>{formError}</ErrBox>}
          <label style={{ display: 'block', marginBottom: 12 }}><Lbl>Type</Lbl>
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value, parent: '' }))} disabled={!!editing} style={inp}>
              {TYPE_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <Row2>
            <Field label="Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="e.g. Information Technology" />
            <Field label="Code" value={form.code} onChange={(v) => setForm((f) => ({ ...f, code: v }))} placeholder="e.g. IT" />
          </Row2>
          <label style={{ display: 'block', marginBottom: 12 }}><Lbl>Parent (optional)</Lbl>
            <select value={form.parent} onChange={(e) => setForm((f) => ({ ...f, parent: e.target.value }))} style={inp}>
              <option value="">— none —</option>
              {parentOptions.map((p) => <option key={p._id} value={p._id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}
            </select>
          </label>
          <Field label="Description (optional)" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', color: C.ink, marginBottom: 12 }}><input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} /> Active</label>
          <Actions onClose={() => setModalOpen(false)} onSubmit={save} busy={saving} label="Save" />
        </Overlay>
      )}
    </RouteShell>
  );
}