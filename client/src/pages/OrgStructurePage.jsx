import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

/* ------------------------------------------------------------------ *
 *  Nexusora Workforce — Org Structure (departments → sections tree)
 *  SuccessFactors-style skin. Self-contained (scoped <style> "osp-").
 *  Consumes existing endpoints:
 *    GET /org?type=&active=&q=   POST /org   PUT /org/:id
 *    DELETE /org/:id (soft)      DELETE /org/:id?hard=true
 * ------------------------------------------------------------------ */

const WRITE_ROLES = ['super_admin', 'hr_manager', 'hr_officer'];
const UNIT_TYPES = [
  { value: 'department', label: 'Department' },
  { value: 'section', label: 'Section / estate' },
];

const humanize = (v) => (v ? String(v).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '');
const empName = (e) => [e?.firstName, e?.lastName].filter(Boolean).join(' ') || '—';

export default function OrgStructurePage() {
  const { user } = useAuth();
  const canWrite = WRITE_ROLES.includes(user?.role);

  const [units, setUnits] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);   // null = create
  const [presetType, setPresetType] = useState('department');
  const [presetParent, setPresetParent] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = {};
      if (q.trim()) params.q = q.trim();
      if (!showInactive) params.active = 'true';
      const { data } = await api.get('/org', { params });
      setUnits(data.items || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load org structure.');
    } finally {
      setLoading(false);
    }
  }, [q, showInactive]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get('/employees', { params: { limit: 200 } });
        if (alive) setEmployees(data.items || []);
      } catch { /* head selector just falls back to empty */ }
    })();
    return () => { alive = false; };
  }, []);

  // ---- build tree from parent refs ----
  const byId = {};
  units.forEach((u) => { byId[u._id] = u; });
  const childrenOf = {};
  const roots = [];
  units.forEach((u) => {
    const pid = u.parent && u.parent._id ? u.parent._id : (typeof u.parent === 'string' ? u.parent : null);
    if (pid && byId[pid]) {
      (childrenOf[pid] = childrenOf[pid] || []).push(u);
    } else {
      roots.push(u); // top-level, or parent filtered out of the current view
    }
  });

  const openCreate = (type = 'department', parent = '') => {
    setEditing(null); setPresetType(type); setPresetParent(parent); setFormOpen(true);
  };
  const openEdit = (u) => { setEditing(u); setFormOpen(true); };

  const deactivate = async (u) => {
    if (!window.confirm(`Deactivate "${u.name}"? Employees keep their label; you can reactivate later.`)) return;
    try { await api.delete(`/org/${u._id}`); load(); }
    catch (err) { alert(err?.response?.data?.message || 'Could not deactivate.'); }
  };
  const reactivate = async (u) => {
    try { await api.put(`/org/${u._id}`, { active: true }); load(); }
    catch (err) { alert(err?.response?.data?.message || 'Could not reactivate.'); }
  };
  const hardDelete = async (u) => {
    if (!window.confirm(`Permanently delete "${u.name}"? This cannot be undone.`)) return;
    try { await api.delete(`/org/${u._id}`, { params: { hard: 'true' } }); load(); }
    catch (err) { alert(err?.response?.data?.message || 'Could not delete.'); }
  };

  const renderNode = (u, depth) => {
    const kids = childrenOf[u._id] || [];
    const head = u.head && typeof u.head === 'object' ? u.head : null;
    return (
      <div key={u._id} className="osp-branch" style={{ marginLeft: depth ? 22 : 0 }}>
        <div className={'osp-node' + (u.active === false ? ' off' : '')}>
          <span className={'osp-typedot ' + (u.type === 'department' ? 'dep' : 'sec')} />
          <div className="osp-node-main">
            <div className="osp-node-title">
              {u.name}
              {u.code && <span className="osp-code">{u.code}</span>}
              <span className="osp-badge">{humanize(u.type)}</span>
              {u.active === false && <span className="osp-badge off">Inactive</span>}
            </div>
            {head && <div className="osp-node-sub">Head: {empName(head)}</div>}
          </div>
          {canWrite && (
            <div className="osp-node-actions">
              {u.type === 'department' && (
                <button className="osp-mini" onClick={() => openCreate('section', u._id)} title="Add section under this department">+ Section</button>
              )}
              <button className="osp-mini" onClick={() => openEdit(u)}>Edit</button>
              {u.active === false
                ? <>
                    <button className="osp-mini" onClick={() => reactivate(u)}>Activate</button>
                    <button className="osp-mini no" onClick={() => hardDelete(u)}>Delete</button>
                  </>
                : <button className="osp-mini no" onClick={() => deactivate(u)}>Deactivate</button>}
            </div>
          )}
        </div>
        {kids.length > 0 && (
          <div className="osp-children">
            {kids.map((k) => renderNode(k, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="osp-wrap">
      <style>{STYLES}</style>

      <div className="osp-head">
        <div>
          <h1 className="osp-title">Org Structure</h1>
          <p className="osp-subtitle">Departments and sections. Assignments on the employee profile link here.</p>
        </div>
        {canWrite && <button className="osp-btn primary" onClick={() => openCreate('department', '')}>+ Add department</button>}
      </div>

      <div className="osp-toolbar">
        <input
          className="osp-search"
          placeholder="Search name or code…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
        />
        <button className="osp-btn" onClick={load}>Search</button>
        <label className="osp-check">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      {error && <div className="osp-err">{error}</div>}

      {loading ? (
        <p className="osp-muted">Loading org structure…</p>
      ) : roots.length === 0 ? (
        <div className="osp-empty">
          <div className="osp-empty-mark">🏢</div>
          <div className="osp-empty-title">No org units yet</div>
          <div className="osp-empty-note">Create your first department to start building the structure.</div>
          {canWrite && <button className="osp-btn primary" style={{ marginTop: 14 }} onClick={() => openCreate('department', '')}>+ Add department</button>}
        </div>
      ) : (
        <div className="osp-tree">
          {roots.map((r) => renderNode(r, 0))}
        </div>
      )}

      {formOpen && (
        <OrgUnitForm
          unit={editing}
          presetType={presetType}
          presetParent={presetParent}
          units={units}
          employees={employees}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={() => { setFormOpen(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

/* ---------- create / edit modal ---------- */
function OrgUnitForm({ unit, presetType, presetParent, units, employees, onClose, onSaved }) {
  const isEdit = !!unit;
  const [type, setType] = useState(unit?.type || presetType || 'department');
  const [name, setName] = useState(unit?.name || '');
  const [code, setCode] = useState(unit?.code || '');
  const [parent, setParent] = useState(
    unit?.parent?._id || (typeof unit?.parent === 'string' ? unit.parent : '') || presetParent || ''
  );
  const [head, setHead] = useState(unit?.head?._id || (typeof unit?.head === 'string' ? unit.head : '') || '');
  const [active, setActive] = useState(unit?.active !== false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Valid parents: any unit except self; sections normally sit under a department.
  const parentOptions = units.filter((u) => u._id !== unit?._id);

  const save = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    setBusy(true); setError('');
    const payload = { type, name: name.trim(), code: code.trim(), parent: parent || '', head: head || '', active };
    try {
      if (isEdit) await api.put(`/org/${unit._id}`, payload);
      else await api.post('/org', payload);
      onSaved();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not save this unit.');
    } finally { setBusy(false); }
  };

  return (
    <div className="osp-overlay" onClick={onClose}>
      <div className="osp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="osp-modal-head">
          <h3>{isEdit ? 'Edit org unit' : 'Add org unit'}</h3>
          <button className="osp-x" onClick={onClose}>×</button>
        </div>
        <div className="osp-modal-body">
          {error && <div className="osp-err">{error}</div>}
          <div className="osp-formgrid">
            <label className="osp-field">
              Type
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {UNIT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="osp-field">
              Name *
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Field Operations" />
            </label>
            <label className="osp-field">
              Code
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. FIELD-OPS" />
            </label>
            <label className="osp-field">
              Parent unit
              <select value={parent} onChange={(e) => setParent(e.target.value)}>
                <option value="">— None (top level) —</option>
                {parentOptions.map((u) => (
                  <option key={u._id} value={u._id}>{u.name} ({humanize(u.type)})</option>
                ))}
              </select>
            </label>
            <label className="osp-field">
              Head
              <select value={head} onChange={(e) => setHead(e.target.value)}>
                <option value="">— Unassigned —</option>
                {employees.map((e) => (
                  <option key={e._id} value={e._id}>{empName(e)}{e.staffId ? ` · ${e.staffId}` : ''}</option>
                ))}
              </select>
            </label>
            <label className="osp-field osp-check-field">
              <span>Status</span>
              <label className="osp-check">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                Active
              </label>
            </label>
          </div>
        </div>
        <div className="osp-modal-foot">
          <button className="osp-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="osp-btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : (isEdit ? 'Save changes' : 'Create unit')}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- scoped styles ---------- */
const STYLES = `
.osp-wrap{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f6f9;min-height:100%;padding:22px 24px 48px;color:#1f2733}
.osp-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
.osp-title{font-size:1.5rem;font-weight:800;color:#012158;margin:0}
.osp-subtitle{font-size:.86rem;color:#5b6b7f;margin:4px 0 0}

.osp-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px}
.osp-search{flex:1;min-width:200px;max-width:360px;font-family:inherit;font-size:.9rem;padding:9px 12px;border:1px solid #cfd8e3;border-radius:8px;background:#fff;color:#1f2733}
.osp-check{display:inline-flex;align-items:center;gap:7px;font-size:.85rem;color:#5b6b7f;font-weight:600;cursor:pointer}

.osp-tree{background:#fff;border:1px solid #e5e8ec;border-radius:12px;box-shadow:0 1px 2px rgba(1,33,88,.04);padding:14px 16px}
.osp-branch{position:relative}
.osp-children{border-left:2px solid #e9eef5;margin-left:9px;padding-left:6px}
.osp-node{display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:10px;margin:4px 0}
.osp-node:hover{background:#f6f9fe}
.osp-node.off{opacity:.6}
.osp-typedot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.osp-typedot.dep{background:#012158}
.osp-typedot.sec{background:#3485E9}
.osp-node-main{flex:1;min-width:0}
.osp-node-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.95rem;font-weight:700;color:#012158}
.osp-node-sub{font-size:.78rem;color:#8a94a6;margin-top:2px}
.osp-code{font-size:.68rem;font-weight:700;color:#5b6b7f;background:#eef1f5;border-radius:5px;padding:2px 7px;letter-spacing:.03em}
.osp-badge{font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#1d5fbf;background:#eaf1fb;border:1px solid #d6e4fa;border-radius:5px;padding:2px 7px}
.osp-badge.off{color:#9a6400;background:#fff4e0;border-color:#f3e0b8}
.osp-node-actions{display:flex;gap:6px;flex-wrap:wrap}

.osp-btn{appearance:none;border:1px solid #cfd8e3;background:#fff;color:#012158;font-weight:700;font-size:.85rem;padding:9px 16px;border-radius:8px;cursor:pointer;font-family:inherit}
.osp-btn.primary{background:#012158;color:#fff;border-color:#012158}
.osp-btn:disabled{opacity:.55;cursor:default}
.osp-mini{appearance:none;border:1px solid #cfd8e3;background:#fff;color:#012158;font-weight:700;font-size:.74rem;padding:5px 10px;border-radius:6px;cursor:pointer;font-family:inherit}
.osp-mini:hover{border-color:#3485E9}
.osp-mini.no{border-color:#f0c4c4;color:#b3261e}

.osp-muted{color:#8a94a6;font-size:.9rem;padding:20px 4px}
.osp-err{background:#fdeaea;color:#b3261e;border:1px solid #f5c6c6;padding:10px 14px;border-radius:8px;font-size:.85rem;margin-bottom:12px}

.osp-empty{background:#fff;border:1px dashed #cfd8e3;border-radius:12px;padding:44px 24px;text-align:center}
.osp-empty-mark{font-size:2rem;margin-bottom:10px}
.osp-empty-title{font-size:1.05rem;font-weight:800;color:#012158}
.osp-empty-note{font-size:.86rem;color:#5b6b7f;margin-top:4px}

.osp-overlay{position:fixed;inset:0;background:rgba(1,20,50,.45);display:flex;align-items:flex-start;justify-content:center;padding:60px 16px;z-index:1000}
.osp-modal{background:#fff;border-radius:14px;width:100%;max-width:620px;box-shadow:0 20px 60px rgba(1,33,88,.30);overflow:hidden}
.osp-modal-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #e5e8ec}
.osp-modal-head h3{margin:0;font-size:1.1rem;font-weight:800;color:#012158}
.osp-x{appearance:none;border:none;background:none;font-size:1.5rem;line-height:1;color:#8a94a6;cursor:pointer}
.osp-modal-body{padding:20px}
.osp-modal-foot{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid #e5e8ec;background:#fafbfc}
.osp-formgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.osp-field{display:flex;flex-direction:column;gap:6px;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#5b6b7f}
.osp-field input,.osp-field select{font-family:inherit;font-size:.9rem;font-weight:500;text-transform:none;letter-spacing:normal;padding:9px 11px;border:1px solid #cfd8e3;border-radius:8px;color:#1f2733;background:#fff}
.osp-check-field{gap:8px}
.osp-check-field .osp-check{text-transform:none;letter-spacing:normal;font-size:.9rem}

@media(max-width:640px){.osp-node{flex-wrap:wrap}.osp-node-actions{width:100%}}
`;