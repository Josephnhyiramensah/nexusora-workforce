/* =====================================================================
   API Keys settings — generate, scope, and revoke keys for external
   integrations that call the public /api/v1 surface. The raw key is shown
   once at creation; only its hash is stored server-side.
   ===================================================================== */
import { useEffect, useMemo, useState } from 'react';
import { Copy, Check, Trash2, KeyRound, Plus, ShieldAlert } from 'lucide-react';
import api from '../../api/client';

const C = { navy: '#012158', blue: '#3485E9', green: '#1f9d57', red: '#e5484d',
  ink: '#16233b', muted: '#8b96a9', muted2: '#67728a', line: '#e6ebf3' };

const SCOPES = [
  { key: 'read', label: 'Read (all)', hint: 'Read access to permitted resources' },
  { key: 'employees', label: 'Employees', hint: 'List & read employees' },
  { key: 'leave', label: 'Leave', hint: 'Read leave requests' },
  { key: 'attendance', label: 'Attendance', hint: 'Read attendance' },
  { key: 'payroll', label: 'Payroll', hint: 'Read payroll data' },
  { key: 'documents', label: 'Documents', hint: 'Read documents' },
  { key: 'write', label: 'Write', hint: 'Allow write operations' },
];

export default function ApiKeysSettings({ setMsg }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', permissions: ['read'], expiresInDays: '' });
  const [justCreated, setJustCreated] = useState(null); // { key, name }
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');

  const baseUrl = useMemo(() => `${window.location.origin.replace(/\/$/, '')}/api/v1`, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try { const { data } = await api.get('/settings/api-keys'); if (alive) setKeys(data?.data || []); }
      catch { if (alive) setKeys([]); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [reload]);

  const toggleScope = (k) => setForm((f) => ({
    ...f, permissions: f.permissions.includes(k) ? f.permissions.filter((x) => x !== k) : [...f.permissions, k],
  }));

  async function createKey() {
    setErr('');
    if (!form.name.trim()) { setErr('Give the key a name.'); return; }
    setCreating(true);
    try {
      const { data } = await api.post('/settings/api-keys', {
        name: form.name.trim(),
        permissions: form.permissions.length ? form.permissions : ['read'],
        expiresInDays: form.expiresInDays ? Number(form.expiresInDays) : undefined,
      });
      setJustCreated({ key: data?.data?.key, name: data?.data?.name });
      setForm({ name: '', permissions: ['read'], expiresInDays: '' });
      setReload((n) => n + 1);
      setMsg && setMsg('API key created. Copy it now — it will not be shown again.');
    } catch (e) { setErr(e?.response?.data?.message || 'Could not create key.'); }
    finally { setCreating(false); }
  }

  async function revoke(k) {
    if (!window.confirm(`Revoke "${k.name}"? Integrations using it will stop working immediately.`)) return;
    try { await api.delete(`/settings/api-keys/${k._id}`); setReload((n) => n + 1); setMsg && setMsg(`Key "${k.name}" revoked.`); }
    catch (e) { setMsg && setMsg(e?.response?.data?.message || 'Could not revoke key.'); }
  }

  function copyKey() {
    if (!justCreated?.key) return;
    try { navigator.clipboard.writeText(justCreated.key); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  }

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : '—';

  return (
    <Grid>
      <Panel title="Create API key" sub="Keys authenticate external systems that call your workspace API. Scope each key to only what it needs.">
        {justCreated && (
          <div style={{ background: '#eefaf1', border: '1px solid #bfe6cd', borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: C.green, fontSize: '.85rem', marginBottom: 8 }}>
              <Check size={16} /> Key “{justCreated.name}” created — copy it now
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <code style={{ flex: 1, minWidth: 0, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 9, padding: '10px 12px', fontSize: '.78rem', color: C.ink, wordBreak: 'break-all', fontFamily: 'ui-monospace, Menlo, monospace' }}>{justCreated.key}</code>
              <button onClick={copyKey} style={{ ...btn(C.navy, true), flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy'}</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.74rem', color: '#8a5a00', marginTop: 8 }}>
              <ShieldAlert size={13} /> This is the only time the full key is shown. Store it somewhere safe.
            </div>
          </div>
        )}

        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={lbl()}>Key name</div>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Payroll export integration" style={inp()} />
        </label>

        <div style={lbl()}>Scopes</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
          {SCOPES.map((s) => {
            const on = form.permissions.includes(s.key);
            return (
              <button key={s.key} onClick={() => toggleScope(s.key)} title={s.hint}
                style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', padding: '9px 11px', borderRadius: 9, cursor: 'pointer',
                  border: `1px solid ${on ? C.blue : C.line}`, background: on ? '#eef4ff' : '#fff', color: on ? C.navy : C.ink, fontWeight: on ? 700 : 500, fontSize: '.82rem' }}>
                <span style={{ width: 16, height: 16, borderRadius: 5, flexShrink: 0, display: 'grid', placeItems: 'center', background: on ? C.blue : '#fff', border: `1.5px solid ${on ? C.blue : C.muted}` }}>{on && <Check size={11} color="#fff" />}</span>
                {s.label}
              </button>
            );
          })}
        </div>

        <label style={{ display: 'block', marginBottom: 14 }}>
          <div style={lbl()}>Expires in (days, optional)</div>
          <input type="number" min="1" value={form.expiresInDays} onChange={(e) => setForm((f) => ({ ...f, expiresInDays: e.target.value }))} placeholder="Leave blank for no expiry" style={inp()} />
        </label>

        {err && <div style={{ color: C.red, background: '#fdecec', border: '1px solid #f6c9cb', padding: '9px 12px', borderRadius: 9, fontSize: '.84rem', marginBottom: 12 }}>{err}</div>}
        <button onClick={createKey} disabled={creating} style={{ ...btn(C.navy, true), display: 'inline-flex', alignItems: 'center', gap: 7, opacity: creating ? 0.6 : 1 }}><Plus size={16} /> {creating ? 'Creating…' : 'Create key'}</button>
      </Panel>

      <Panel title="Your API keys" sub={`${keys.filter((k) => k.isActive).length} active`}>
        {loading ? <div style={{ color: C.muted, padding: 16 }}>Loading…</div>
          : keys.length === 0 ? <Empty>No API keys yet. Create one to connect external software.</Empty>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {keys.map((k) => (
                <div key={k._id} style={{ border: `1px solid ${C.line}`, borderRadius: 11, padding: 13, background: k.isActive ? '#fff' : '#fbfcfe', opacity: k.isActive ? 1 : 0.7 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: C.navy, fontSize: '.9rem' }}>
                        <KeyRound size={15} color={C.muted2} /> {k.name}
                        <span style={{ fontSize: '.66rem', fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: k.isActive ? '#e4f7ec' : '#fdecec', color: k.isActive ? C.green : C.red }}>{k.isActive ? 'Active' : 'Revoked'}</span>
                      </div>
                      <code style={{ fontSize: '.74rem', color: C.muted2, fontFamily: 'ui-monospace, Menlo, monospace' }}>{k.keyPrefix}</code>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                        {(k.permissions || []).map((p) => <span key={p} style={{ fontSize: '.66rem', fontWeight: 700, color: C.blue, background: '#eef4ff', borderRadius: 6, padding: '2px 7px' }}>{p}</span>)}
                      </div>
                      <div style={{ fontSize: '.7rem', color: C.muted, marginTop: 7 }}>
                        Created {fmtDate(k.createdAt)} · {k.requestCount || 0} request{(k.requestCount || 0) === 1 ? '' : 's'} · last used {fmtDate(k.lastUsed)}{k.expiresAt ? ` · expires ${fmtDate(k.expiresAt)}` : ''}
                      </div>
                    </div>
                    {k.isActive && <button onClick={() => revoke(k)} title="Revoke" style={{ ...btn(C.red, false), flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, borderColor: '#f6c9cb', color: C.red }}><Trash2 size={14} /> Revoke</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
      </Panel>

      <Panel title="Using the API" sub="Authenticate every request with your key as a Bearer token.">
        <div style={lbl()}>Base URL</div>
        <code style={{ display: 'block', background: '#0d1b2e', color: '#cfe3ff', borderRadius: 9, padding: '10px 12px', fontSize: '.76rem', marginBottom: 12, wordBreak: 'break-all', fontFamily: 'ui-monospace, Menlo, monospace' }}>{baseUrl}</code>
        <div style={lbl()}>Example</div>
        <pre style={{ background: '#0d1b2e', color: '#cfe3ff', borderRadius: 9, padding: '12px', fontSize: '.74rem', overflowX: 'auto', margin: '0 0 12px', fontFamily: 'ui-monospace, Menlo, monospace' }}>{`curl ${baseUrl}/employees \\
  -H "Authorization: Bearer nxw_live_xxx"`}</pre>
        <div style={lbl()}>Endpoints</div>
        {[
          ['GET', '/ping', 'Verify the key & see its scopes'],
          ['GET', '/employees', 'List employees (scope: employees)'],
          ['GET', '/employees/:id', 'Get one employee (scope: employees)'],
          ['GET', '/leave/requests', 'List leave requests (scope: leave)'],
        ].map(([m, p, d]) => (
          <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0', borderBottom: `1px solid #f2f5f9`, fontSize: '.78rem' }}>
            <span style={{ fontSize: '.64rem', fontWeight: 800, color: '#065F46', background: '#D1FAE5', borderRadius: 5, padding: '2px 7px', fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>{m}</span>
            <code style={{ color: C.navy, fontFamily: 'ui-monospace, Menlo, monospace', flexShrink: 0 }}>{p}</code>
            <span style={{ color: C.muted, marginLeft: 'auto', textAlign: 'right' }}>{d}</span>
          </div>
        ))}
      </Panel>
    </Grid>
  );
}

/* --- local UI atoms (match the Settings look) --- */
function Grid({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 18, alignItems: 'start' }}>{children}</div>; }
function Panel({ title, sub, children }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: '0 1px 2px rgba(1,33,88,.05)', padding: 20, marginBottom: 18 }}>
      <div style={{ fontWeight: 800, color: C.navy, fontSize: '1rem' }}>{title}</div>
      {sub && <div style={{ color: C.muted, fontSize: '.84rem', margin: '4px 0 16px', lineHeight: 1.5 }}>{sub}</div>}
      {children}
    </div>
  );
}
function Empty({ children }) { return <div style={{ padding: 22, textAlign: 'center', color: C.muted, fontSize: '.85rem', background: '#fbfcfe', border: `1px dashed ${C.line}`, borderRadius: 10 }}>{children}</div>; }
function lbl() { return { fontSize: '.78rem', color: C.muted, fontWeight: 700, marginBottom: 6 }; }
function inp() { return { width: '100%', padding: '10px 12px', border: `1px solid #d8e0ec`, borderRadius: 10, fontSize: '.92rem', color: C.ink, fontFamily: 'inherit' }; }
function btn(color, solid) {
  return { padding: '10px 16px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '.84rem', fontFamily: 'inherit',
    border: solid ? 'none' : `1px solid ${C.line}`, background: solid ? color : '#fff', color: solid ? '#fff' : color };
}
