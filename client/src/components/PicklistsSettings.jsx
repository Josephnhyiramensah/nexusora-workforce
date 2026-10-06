import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';

const C = { navy: '#012158', blue: '#3485E9', gold: '#C9A227', green: '#1f9d57', red: '#e5484d',
  ink: '#16233b', muted: '#8b96a9', line: '#e6ebf3', canvas: '#f4f7fc' };

const PAY_BASES = [
  { value: 'salary', label: 'Salary (monthly)' },
  { value: 'daily', label: 'Daily rate' },
  { value: 'hourly', label: 'Hourly rate' },
  { value: 'piece_rate', label: 'Piece rate' },
  { value: 'task', label: 'Per task' },
];
const PAY_METHODS = [
  { value: 'bank', label: 'Bank transfer' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'cash', label: 'Cash' },
];
const payBasisLabel = (v) => PAY_BASES.find((p) => p.value === v)?.label || v;
const payMethodLabel = (v) => PAY_METHODS.find((p) => p.value === v)?.label || v;

const TYPES = [
  { key: 'worker_class', label: 'Worker Classes', singular: 'Worker Class' },
  { key: 'employment_type', label: 'Employment Types', singular: 'Employment Type' },
  { key: 'grade', label: 'Grades', singular: 'Grade' },
];

const emptyForm = {
  name: '', code: '', order: 0,
  defaultPayBasis: 'salary', defaultPaymentMethod: 'bank', showsFieldWork: false,
};

export default function PicklistsSettings({ setMsg }) {
  const [activeType, setActiveType] = useState('worker_class');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // {editing?: item}
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  const typeMeta = TYPES.find((tp) => tp.key === activeType) || TYPES[0];
  const isWorkerClass = activeType === 'worker_class';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/picklists', { params: { type: activeType } });
      setItems(data.items || []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [activeType]);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm({ ...emptyForm, order: items.length + 1 }); setFormErr(''); setModal({}); };
  const openEdit = (it) => {
    setForm({
      name: it.name || '', code: it.code || '', order: it.order ?? 0,
      defaultPayBasis: it.defaultPayBasis || 'salary',
      defaultPaymentMethod: it.defaultPaymentMethod || 'bank',
      showsFieldWork: !!it.showsFieldWork,
    });
    setFormErr(''); setModal({ editing: it });
  };

  const save = async () => {
    if (!form.name.trim()) { setFormErr('Name is required.'); return; }
    setSaving(true); setFormErr('');
    const payload = {
      type: activeType, name: form.name.trim(), code: form.code.trim(), order: Number(form.order) || 0,
    };
    if (isWorkerClass) {
      payload.defaultPayBasis = form.defaultPayBasis;
      payload.defaultPaymentMethod = form.defaultPaymentMethod;
      payload.showsFieldWork = form.showsFieldWork;
    }
    try {
      if (modal.editing) await api.put(`/picklists/${modal.editing._id}`, payload);
      else await api.post('/picklists', payload);
      setModal(null); setMsg?.(`${typeMeta.singular} saved.`); load();
    } catch (err) {
      setFormErr(err?.response?.data?.message || 'Could not save. Check the code isn’t already used.');
    } finally { setSaving(false); }
  };

  const deactivate = async (it) => {
    if (!window.confirm(`Deactivate "${it.name}"? It stays on existing employees but won’t appear for new ones.`)) return;
    try { await api.delete(`/picklists/${it._id}`); setMsg?.(`${it.name} deactivated.`); load(); }
    catch (err) { setMsg?.(err?.response?.data?.message || 'Could not deactivate.'); }
  };

  return (
    <div>
      {/* sub-switcher */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {TYPES.map((tp) => {
          const on = activeType === tp.key;
          return (
            <button key={tp.key} onClick={() => setActiveType(tp.key)}
              style={{ padding: '9px 16px', borderRadius: 10, border: on ? 'none' : `1px solid ${C.line}`,
                background: on ? C.navy : '#fff', color: on ? '#fff' : C.ink, fontWeight: 700, fontSize: '.85rem', cursor: 'pointer' }}>
              {tp.label}
            </button>
          );
        })}
      </div>

      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: '0 1px 2px rgba(1,33,88,.05)', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <div style={{ fontWeight: 800, color: C.navy, fontSize: '1rem' }}>{typeMeta.label}</div>
            <div style={{ color: C.muted, fontSize: '.84rem', margin: '4px 0 0', lineHeight: 1.5 }}>
              {isWorkerClass
                ? 'Types of worker in your organization, and how each is usually paid.'
                : `Manage the ${typeMeta.label.toLowerCase()} available across the workspace.`}
            </div>
          </div>
          <button onClick={openCreate}
            style={{ padding: '10px 18px', border: 'none', borderRadius: 10, background: C.gold, color: '#3a2400', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Add {typeMeta.singular}
          </button>
        </div>

        {isWorkerClass && (
          <div style={{ background: '#eaf2fd', border: '1px solid #cfe3fb', color: '#0f3d78', padding: '9px 12px', borderRadius: 10, fontSize: '.82rem', margin: '14px 0 4px' }}>
            Changing a worker class’s defaults only affects <strong>new</strong> employees assigned to it — existing employees keep their current pay setup.
          </div>
        )}

        <div style={{ marginTop: 16, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Name', 'Code', ...(isWorkerClass ? ['Behavior'] : []), 'Status', ''].map((h, i) => (
                <th key={i} style={{ textAlign: h === '' ? 'right' : 'left', padding: '12px 14px', background: C.canvas, color: C.navy, fontWeight: 700, fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {loading && <tr><td colSpan={isWorkerClass ? 5 : 4} style={{ textAlign: 'center', color: C.muted, padding: 26 }}>Loading…</td></tr>}
              {!loading && items.length === 0 && <tr><td colSpan={isWorkerClass ? 5 : 4} style={{ textAlign: 'center', color: C.muted, padding: 26 }}>None yet.</td></tr>}
              {items.map((it) => (
                <tr key={it._id} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={{ padding: '13px 14px', fontSize: '.9rem', fontWeight: 600 }}>{it.name}</td>
                  <td style={{ padding: '13px 14px', fontSize: '.85rem', color: C.muted }}>{it.code || '—'}</td>
                  {isWorkerClass && (
                    <td style={{ padding: '13px 14px', fontSize: '.8rem', color: C.ink }}>
                      <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                        {it.showsFieldWork && <Badge>Field work</Badge>}
                        <Badge>{payBasisLabel(it.defaultPayBasis)}</Badge>
                        <Badge>{payMethodLabel(it.defaultPaymentMethod)}</Badge>
                      </span>
                    </td>
                  )}
                  <td style={{ padding: '13px 14px' }}>
                    <span style={{ background: it.active !== false ? '#e4f7ec' : '#fdecec', color: it.active !== false ? C.green : C.red, fontWeight: 700, fontSize: '.72rem', padding: '4px 11px', borderRadius: 999 }}>
                      {it.active !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '13px 14px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 8 }}>
                      <button onClick={() => openEdit(it)} style={miniBtn(C.blue)}>Edit</button>
                      {it.active !== false && <button onClick={() => deactivate(it)} style={miniBtn(C.red)}>Deactivate</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(1,33,88,.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 60 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 18, padding: 24, boxShadow: '0 18px 44px rgba(1,33,88,.3)', borderTop: `4px solid ${C.gold}` }}>
            <h2 style={{ color: C.navy, fontSize: '1.2rem', fontWeight: 800, margin: '0 0 16px' }}>
              {modal.editing ? `Edit ${typeMeta.singular}` : `New ${typeMeta.singular}`}
            </h2>
            {formErr && <div style={{ color: C.red, background: '#fdecec', border: '1px solid #f6c9cb', padding: '9px 12px', borderRadius: 10, fontSize: '.85rem', marginBottom: 12 }}>{formErr}</div>}

            <L label="Name"><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inp()} placeholder="e.g. Nurse" /></L>
            <L label="Code" hint="Short unique key, e.g. nurse. Leave blank to auto-omit.">
              <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} style={inp()} placeholder="e.g. nurse" />
            </L>

            {isWorkerClass && (
              <>
                <L label="Usually paid by" hint="New employees of this type default to this pay basis — changeable per person.">
                  <select value={form.defaultPayBasis} onChange={(e) => setForm((f) => ({ ...f, defaultPayBasis: e.target.value }))} style={inp()}>
                    {PAY_BASES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </L>
                <L label="Usually paid via" hint="Default payment method for new employees of this type.">
                  <select value={form.defaultPaymentMethod} onChange={(e) => setForm((f) => ({ ...f, defaultPaymentMethod: e.target.value }))} style={inp()}>
                    {PAY_METHODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </L>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.showsFieldWork} onChange={(e) => setForm((f) => ({ ...f, showsFieldWork: e.target.checked }))} style={{ marginTop: 3 }} />
                  <span>
                    <span style={{ fontWeight: 700, color: C.ink, fontSize: '.9rem' }}>This worker type does field work</span>
                    <span style={{ display: 'block', color: C.muted, fontSize: '.78rem', marginTop: 2, lineHeight: 1.5 }}>
                      Shows field-work fields (task, quota, medical clearance) on their record. For office roles, leave unchecked.
                    </span>
                  </span>
                </label>
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
              <button onClick={() => setModal(null)} style={{ padding: '10px 16px', border: `1px solid #d8e0ec`, borderRadius: 10, background: '#fff', color: C.ink, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ padding: '10px 18px', border: 'none', borderRadius: 10, background: C.gold, color: '#3a2400', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Badge({ children }) {
  return <span style={{ background: '#eef2f8', color: '#46536b', fontWeight: 600, fontSize: '.72rem', padding: '3px 9px', borderRadius: 999 }}>{children}</span>;
}
function L({ label, hint, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{ fontSize: '.78rem', color: '#8b96a9', fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: '.75rem', color: '#8b96a9', marginTop: 5, lineHeight: 1.5 }}>{hint}</div>}
    </label>
  );
}
function inp() { return { width: '100%', padding: '10px 12px', border: `1px solid #d8e0ec`, borderRadius: 10, fontSize: '.92rem', color: '#16233b' }; }
function miniBtn(color) { return { padding: '6px 12px', borderRadius: 8, border: `1px solid ${color}`, background: '#fff', color, fontWeight: 700, fontSize: '.8rem', cursor: 'pointer' }; }