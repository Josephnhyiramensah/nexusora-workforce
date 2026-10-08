import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { User, Building2, Users, Shield, Code, Palette, Pencil, Power, Star, List, Settings as SettingsIcon, Coins } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { CURRENCIES, currencyName } from '../config/currencies';
import PicklistsSettings from '../components/PicklistsSettings';
import ApiKeysSettings from '../components/settings/ApiKeysSettings';
import WhiteLabelSettings from '../components/settings/WhiteLabelSettings';
import SecuritySettings from '../components/settings/SecuritySettings';
import { ModuleShell, Hero, Body } from '../ui/kit';

const C = { navy: '#012158', blue: '#3485E9', gold: '#C9A227', green: '#1f9d57', red: '#e5484d',
  ink: '#16233b', muted: '#8b96a9', line: '#e6ebf3', canvas: '#f4f7fc' };

const ROLES = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'hr_manager', label: 'HR Manager' },
  { value: 'hr_officer', label: 'HR Officer' },
  { value: 'line_manager', label: 'Line Manager' },
  { value: 'payroll_officer', label: 'Payroll Officer' },
  { value: 'ir_officer', label: 'IR Officer' },
  { value: 'employee', label: 'Employee' },
  { value: 'viewer', label: 'Viewer' },
];
const roleLabel = (v) => ROLES.find((r) => r.value === v)?.label || v;

/* Settings sections — the rail groups (in-page navigation, SPA style) plus
   the Hero copy shown for each section. `pro` gates a section behind a plan. */
const SECTIONS = [
  { key: 'profile',    group: 'Account',    label: 'My Profile',       Icon: User,        title: 'My Profile',        sub: 'Your name, sign-in details and personal preferences.' },
  { key: 'company',    group: 'Workspace',  label: 'Company',          Icon: Building2,    title: 'Company & Letterhead', sub: 'Company details, branding and the base currency payroll runs in.' },
  { key: 'users',      group: 'Workspace',  label: 'Users & Roles',    Icon: Users,        title: 'Users & Roles',     sub: 'Manage logins, roles and the employee each login is linked to.' },
  { key: 'picklists',  group: 'Workspace',  label: 'Lists',            Icon: List,         title: 'Lists',             sub: 'The dropdown lists used across the workspace.' },
  { key: 'security',   group: 'Governance', label: 'Security',         Icon: Shield,       title: 'Security',          sub: 'How sign-in credentials and sessions are handled.' },
  { key: 'api',        group: 'Governance', label: 'API Keys',         Icon: Code,         title: 'API Keys',          sub: 'Connect Nexusora Workforce to external software.', pro: true },
  { key: 'whitelabel', group: 'Governance', label: 'White-label',      Icon: Palette,      title: 'White-label',       sub: 'Apply your own brand colours and logo across the workspace.', pro: true },
];
const sectionOf = (key) => SECTIONS.find((s) => s.key === key) || SECTIONS[0];

export default function SettingsPage() {
  const { user, tenant } = useAuth();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState('profile');
  const [msg, setMsg] = useState('');

  // Deep-link support: the profile menu can open a specific section via ?tab=…
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && SECTIONS.some((x) => x.key === t)) { setTab(t); setMsg(''); }
  }, [searchParams]);

  const isPro = ['professional', 'enterprise'].includes(String(tenant?.plan || '').toLowerCase());

  // Rail groups, grouped by the `group` field, in declaration order.
  const groups = useMemo(() => {
    const order = [];
    const byGroup = {};
    for (const s of SECTIONS) {
      if (!byGroup[s.group]) { byGroup[s.group] = []; order.push(s.group); }
      byGroup[s.group].push({ key: s.key, label: s.label, Icon: s.Icon });
    }
    return order.map((g) => ({ title: g, items: byGroup[g] }));
  }, []);

  const sec = sectionOf(tab);

  return (
    <ModuleShell
      brand={{ title: 'Settings', subtitle: 'Workspace & account', Icon: SettingsIcon }}
      groups={groups}
      active={tab}
      onSelect={(k) => { setTab(k); setMsg(''); }}
    >
      <Hero crumbs={['Settings', sec.label]} title={sec.title} subtitle={sec.sub} />
      <div style={{ marginTop: -46, position: 'relative', zIndex: 5 }}>
      <Body>
        {msg && <Note>{msg}</Note>}

        {tab === 'profile' && <ProfileTab user={user} setMsg={setMsg} />}
        {tab === 'company' && <CompanyTab setMsg={setMsg} />}
        {tab === 'users' && <UsersTab me={user} setMsg={setMsg} />}
        {tab === 'picklists' && <PicklistsSettings setMsg={setMsg} />}
        {tab === 'security' && <SecuritySettings setMsg={setMsg} />}
        {tab === 'api' && <ApiKeysSettings setMsg={setMsg} />}
        {tab === 'whitelabel' && <WhiteLabelSettings setMsg={setMsg} />}
      </Body>
      </div>
    </ModuleShell>
  );
}

/* ---------------- My Profile ---------------- */
function ProfileTab({ user, setMsg }) {
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });

  // Per-user display currency — SuccessFactors-style personal preference.
  // Payroll always runs in the company base currency; this only changes how
  // amounts are shown to this user.
  const { displayCurrency, setDisplayCurrency, baseCurrency } = useCurrency();
  const currencyCodes = Array.from(new Set([baseCurrency, ...CURRENCIES.map((c) => c.code)]));

  async function saveProfile() {
    setSaving(true);
    try { await api.put('/auth/profile', { name }); setMsg('Profile saved.'); }
    catch (e) { setMsg(e?.response?.data?.message || 'Could not save profile'); }
    finally { setSaving(false); }
  }
  async function changePassword() {
    if (pw.newPassword !== pw.confirm) { setMsg('New passwords do not match.'); return; }
    try {
      await api.post('/auth/change-password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      setMsg('Password changed.');
    } catch (e) { setMsg(e?.response?.data?.message || 'Could not change password'); }
  }

  return (
    <Grid>
      <Panel title="My Profile" sub="Your name and sign-in details.">
        <Field label="Full name" value={name} onChange={setName} />
        <Field label="Email" value={user?.email || ''} disabled />
        <Field label="Role" value={roleLabel(user?.role)} disabled />
        <PrimaryBtn onClick={saveProfile} disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</PrimaryBtn>
      </Panel>

      <Panel title="Preferences" sub="Personal settings that apply only to your account.">
        <label style={{ display: 'block', marginBottom: 8 }}>
          <div style={lbl()}>Display currency</div>
          <select value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value)} style={inp()}>
            {currencyCodes.map((code) => (
              <option key={code} value={code}>
                {code} — {currencyName(code)}{code === baseCurrency ? ' · company base' : ''}
              </option>
            ))}
          </select>
        </label>
        <div style={{ fontSize: '.78rem', color: C.muted, lineHeight: 1.6 }}>
          Amounts across the app are shown in this currency, converted at the latest exchange rate.
          Payroll is always calculated and paid in the company base currency
          (<strong>{baseCurrency}</strong>) — changing this never affects payroll.
        </div>
      </Panel>

      <Panel title="Change password" sub="Use at least 8 characters.">
        <Field label="Current password" type="password" value={pw.currentPassword} onChange={(v) => setPw((s) => ({ ...s, currentPassword: v }))} />
        <Field label="New password" type="password" value={pw.newPassword} onChange={(v) => setPw((s) => ({ ...s, newPassword: v }))} />
        <Field label="Confirm new password" type="password" value={pw.confirm} onChange={(v) => setPw((s) => ({ ...s, confirm: v }))} />
        <PrimaryBtn onClick={changePassword} disabled={!pw.currentPassword || !pw.newPassword}>Change password</PrimaryBtn>
      </Panel>
    </Grid>
  );
}

/* ---------------- Company & Letterhead ---------------- */
function CompanyTab({ setMsg }) {
  const { user, tenant } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  const [b, setB] = useState({ letterhead: '', logo: '', companyName: '', address: '', phone: '', email: '', website: '', footerNote: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Base currency (tenant-level). Comes from /settings/branding (which returns tenant),
  // falling back to the tenant in context.
  const [baseCurrency, setBaseCurrency] = useState(String(tenant?.baseCurrency || '').toUpperCase());
  const [savedBase, setSavedBase] = useState(String(tenant?.baseCurrency || '').toUpperCase());
  const [savingCur, setSavingCur] = useState(false);
  const baseCodes = Array.from(new Set([savedBase, ...CURRENCIES.map((c) => c.code)].filter(Boolean)));

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/settings/branding');
        setB((s) => ({ ...s, ...(data.branding || {}), companyName: data.branding?.companyName || data.tenant?.name || '' }));
        const cur = String(data.tenant?.baseCurrency || tenant?.baseCurrency || '').toUpperCase();
        if (cur) { setBaseCurrency(cur); setSavedBase(cur); }
      } catch { /* defaults */ }
      finally { setLoading(false); }
    })();
  }, []);

  function pickImage(field) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 1000000) { setMsg('Image is larger than 1MB — please compress it first.'); return; }
      const reader = new FileReader();
      reader.onload = () => setB((s) => ({ ...s, [field]: reader.result }));
      reader.readAsDataURL(file);
    };
    input.click();
  }
  async function save() {
    setSaving(true);
    try { await api.put('/settings/branding', b); setMsg('Company details and letterhead saved.'); }
    catch (e) { setMsg(e?.response?.data?.message || 'Could not save'); }
    finally { setSaving(false); }
  }
  async function saveBaseCurrency() {
    setSavingCur(true);
    try {
      await api.put('/settings/company', { baseCurrency });
      setSavedBase(baseCurrency);
      setMsg(`Base currency set to ${baseCurrency}. Reloading so it applies everywhere…`);
      setTimeout(() => window.location.reload(), 1300);
    } catch (e) {
      setMsg(e?.response?.data?.message || 'Could not save base currency');
    } finally { setSavingCur(false); }
  }

  if (loading) return <div style={{ color: C.muted, padding: 30 }}>Loading…</div>;

  return (
    <Grid>
      <Panel title="Company information" sub="Your logo and company details.">
        <Dropzone label="Company logo" hint="Square PNG or JPG, up to 1MB.">
          {b.logo
            ? <img src={b.logo} alt="Logo" style={{ height: 74, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, padding: 6 }} />
            : <Empty>No logo uploaded</Empty>}
          <BtnRow>
            <SmallBtn onClick={() => pickImage('logo')} solid>Choose logo file</SmallBtn>
            {b.logo && <SmallBtn onClick={() => setB((s) => ({ ...s, logo: '' }))} danger>Remove logo</SmallBtn>}
          </BtnRow>
        </Dropzone>
        <Field label="Company name" value={b.companyName} onChange={(v) => setB((s) => ({ ...s, companyName: v }))} />
        <Row>
          <Field label="Phone" value={b.phone} onChange={(v) => setB((s) => ({ ...s, phone: v }))} />
          <Field label="Email" value={b.email} onChange={(v) => setB((s) => ({ ...s, email: v }))} />
        </Row>
        <Row>
          <Field label="Website" value={b.website} onChange={(v) => setB((s) => ({ ...s, website: v }))} />
          <Field label="Address" value={b.address} onChange={(v) => setB((s) => ({ ...s, address: v }))} />
        </Row>
        <PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save company information'}</PrimaryBtn>
      </Panel>

      <Panel title="Base currency" sub="The currency payroll is calculated and paid in across this workspace.">
        <label style={{ display: 'block', marginBottom: 10 }}>
          <div style={lbl()}>Company base currency</div>
          <select value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)} disabled={!isSuperAdmin}
            style={{ ...inp(), background: isSuperAdmin ? '#fff' : '#f7f9fc' }}>
            {baseCodes.map((code) => <option key={code} value={code}>{code} — {currencyName(code)}</option>)}
          </select>
        </label>
        <div style={{ display: 'flex', gap: 10, fontSize: '.8rem', color: '#8a5a00', background: '#fff6e6', border: '1px solid #ffe0a3', borderRadius: 10, padding: '10px 12px', marginBottom: 14, lineHeight: 1.55 }}>
          <Coins size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Changing the base currency affects how <strong>new</strong> payroll runs are calculated. Existing, already-processed payroll keeps its original currency. Set this before your first live payroll run.</span>
        </div>
        {isSuperAdmin
          ? <PrimaryBtn onClick={saveBaseCurrency} disabled={savingCur || !baseCurrency || baseCurrency === savedBase}>
              {savingCur ? 'Saving…' : baseCurrency === savedBase ? 'Saved' : 'Save base currency'}
            </PrimaryBtn>
          : <div style={{ fontSize: '.82rem', color: C.muted }}>Only a Super Admin can change the base currency.</div>}
      </Panel>

      <Panel title="Letterhead & print settings" sub="These details appear on payslips, payroll sheets and reports.">
        <Dropzone label="Official letterhead image" hint="Wide banner (~1600×300px), PNG or JPG, up to 1MB. Appears at the top of every printed report.">
          {b.letterhead
            ? <img src={b.letterhead} alt="Letterhead" style={{ width: '100%', border: `1px solid ${C.line}`, borderRadius: 8 }} />
            : <Empty>No letterhead uploaded</Empty>}
          <BtnRow>
            <SmallBtn onClick={() => pickImage('letterhead')} solid>Upload letterhead</SmallBtn>
            {b.letterhead && <SmallBtn onClick={() => setB((s) => ({ ...s, letterhead: '' }))} danger>Remove</SmallBtn>}
          </BtnRow>
        </Dropzone>
        <Field label="Report footer note" value={b.footerNote} onChange={(v) => setB((s) => ({ ...s, footerNote: v }))} />
        <div style={{ fontSize: '.78rem', color: C.muted, lineHeight: 1.6, marginBottom: 12 }}>
          If no letterhead is uploaded, reports use your company details and logo above. If neither is set, the Nexusora mark is used.
        </div>
        <PrimaryBtn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save letterhead & print'}</PrimaryBtn>
      </Panel>
    </Grid>
  );
}

/* ---------------- Users & Roles ---------------- */
function UsersTab({ me, setMsg }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // {mode:'add'|'edit', user}

  const [reload, setReload] = useState(0);
  const load = () => setReload((n) => n + 1);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get('/auth/users');
        if (alive) setUsers(Array.isArray(data) ? data : []);
      } catch {
        if (alive) setUsers([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [reload]);

  async function toggleStatus(u) {
    try { await api.post(`/auth/users/${u.id}/status`, { isActive: !u.isActive }); await load(); setMsg(`${u.name} ${u.isActive ? 'deactivated' : 'activated'}.`); }
    catch (e) { setMsg(e?.response?.data?.message || 'Could not update user'); }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ color: C.muted, fontSize: '.9rem' }}>{users.length} user{users.length === 1 ? '' : 's'}</div>
        <button onClick={() => setModal({ mode: 'add' })}
          style={{ padding: '11px 20px', border: 'none', borderRadius: 10, background: C.navy, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
          + Add User
        </button>
      </div>

      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 2px rgba(1,33,88,.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Name', 'Email', 'Role', 'Linked employee', 'Status', 'Actions'].map((h) => (
            <th key={h} style={{ textAlign: h === 'Actions' ? 'right' : 'left', padding: '13px 18px', background: C.canvas, color: C.navy, fontWeight: 700, fontSize: '.74rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
          ))}</tr></thead>
          <tbody>
            {loading && <tr><td colSpan="6" style={{ textAlign: 'center', color: C.muted, padding: 30 }}>Loading…</td></tr>}
            {!loading && users.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', color: C.muted, padding: 30 }}>No users yet.</td></tr>}
            {users.map((u) => {
              const isMe = u.id === me?.id;
              return (
                <tr key={u.id} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={td()}>{u.name}</td>
                  <td style={{ ...td(), color: C.blue }}>{u.email}</td>
                  <td style={td()}>{roleLabel(u.role)}</td>
                  <td style={td()}>
                    {u.employeeName
                      ? <span>{u.employeeName}{u.employeeStaffId ? <span style={{ color: C.muted }}> · {u.employeeStaffId}</span> : null}</span>
                      : <span style={{ color: C.muted }}>— not linked —</span>}
                  </td>
                  <td style={td()}>
                    <span style={{ background: u.isActive ? '#e4f7ec' : '#fdecec', color: u.isActive ? C.green : C.red, fontWeight: 700, fontSize: '.72rem', padding: '4px 11px', borderRadius: 999 }}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                    {u.mustChangePassword && <span style={{ marginLeft: 8, background: '#fff2dc', color: '#b8760a', fontWeight: 700, fontSize: '.68rem', padding: '3px 9px', borderRadius: 999 }}>Must reset</span>}
                  </td>
                  <td style={{ ...td(), textAlign: 'right' }}>
                    {isMe ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#fff8e6', color: '#b8760a', fontWeight: 700, fontSize: '.72rem', padding: '5px 11px', borderRadius: 999 }}>
                        <Star size={13} /> You
                      </span>
                    ) : (
                      <div style={{ display: 'inline-flex', gap: 8 }}>
                        <IconBtn title="Edit user" onClick={() => setModal({ mode: 'edit', user: u })} color={C.blue}><Pencil size={15} /></IconBtn>
                        <IconBtn title={u.isActive ? 'Deactivate' : 'Activate'} onClick={() => toggleStatus(u)} color={u.isActive ? C.red : C.green}><Power size={15} /></IconBtn>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && <UserModal mode={modal.mode} user={modal.user} onClose={() => setModal(null)}
        onSaved={(m) => { setModal(null); setMsg(m); load(); }} />}
    </div>
  );
}

function UserModal({ mode, user, onClose, onSaved }) {
  const editing = mode === 'edit';
  const [f, setF] = useState({ name: user?.name || '', email: user?.email || '', password: '', role: user?.role || 'employee' });
  const [employees, setEmployees] = useState([]);
  // Current link comes straight from the user object (/auth/users now returns `employee`).
  const [emp, setEmp] = useState(user?.employee ? String(user.employee) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Load the employee list for the picker.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get('/employees', { params: { limit: 500 } });
        if (alive) setEmployees(data.items || []);
      } catch { /* picker stays empty if this fails */ }
    })();
    return () => { alive = false; };
  }, []);

  const empLabel = (x) => `${[x?.firstName, x?.lastName].filter(Boolean).join(' ')}${x?.staffId ? ` · ${x.staffId}` : ''}`;

  async function submit() {
    setBusy(true); setErr('');
    try {
      if (editing) {
        await api.put(`/auth/users/${user.id}`, { name: f.name, role: f.role, employee: emp || '' });
        if (f.password) await api.post(`/auth/users/${user.id}/reset-password`, { password: f.password });
        onSaved(`${f.name} updated.`);
      } else {
        await api.post('/auth/users', { name: f.name, email: f.email, password: f.password, role: f.role, employee: emp || undefined });
        onSaved(`${f.name} added. They must change the password at first login.`);
      }
    } catch (e) { setErr(e?.response?.data?.message || 'Could not save user'); }
    finally { setBusy(false); }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(1,33,88,.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, background: '#fff', borderRadius: 18, padding: 24, boxShadow: '0 18px 44px rgba(1,33,88,.3)', borderTop: `4px solid ${C.navy}` }}>
        <h2 style={{ color: C.navy, fontSize: '1.25rem', fontWeight: 800, margin: '0 0 16px' }}>{editing ? 'Edit user' : 'Add user'}</h2>
        <Field label="Full name" value={f.name} onChange={(v) => setF((s) => ({ ...s, name: v }))} />
        <Field label="Email" value={f.email} onChange={(v) => setF((s) => ({ ...s, email: v }))} disabled={editing} />
        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={lbl()}>Role</div>
          <select value={f.role} onChange={(e) => setF((s) => ({ ...s, role: e.target.value }))} style={inp()}>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
        <label style={{ display: 'block', marginBottom: 6 }}>
          <div style={lbl()}>Linked employee (for Self-Service)</div>
          <select value={emp} onChange={(e) => setEmp(e.target.value)} style={inp()}>
            <option value="">— Not linked —</option>
            {employees.map((x) => <option key={x._id} value={x._id}>{empLabel(x)}</option>)}
          </select>
        </label>
        <div style={{ fontSize: '.78rem', color: C.muted, marginBottom: 14 }}>
          Linking a login to an employee lets that person see their own profile, leave, payslips and attendance in Self-Service.
        </div>
        <Field label={editing ? 'New temporary password (optional)' : 'Temporary password'} type="password"
          value={f.password} onChange={(v) => setF((s) => ({ ...s, password: v }))} />
        <div style={{ fontSize: '.78rem', color: C.muted, marginBottom: 14 }}>
          The user will be required to set their own password at first login.
        </div>
        {err && <div style={{ color: C.red, background: '#fdecec', border: '1px solid #f6c9cb', padding: '9px 12px', borderRadius: 10, fontSize: '.85rem', marginBottom: 12 }}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <SmallBtn onClick={onClose}>Cancel</SmallBtn>
          <PrimaryBtn inline onClick={submit} disabled={busy || !f.name || (!editing && (!f.email || !f.password))}>
            {busy ? 'Saving…' : (editing ? 'Save changes' : 'Add user')}
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Security ---------------- */
function SecurityTab() {
  return (
    <Grid>
      <Panel title="Password policy" sub="How sign-in credentials are handled in this workspace.">
        <Bullet>Minimum password length: <strong>8 characters</strong>.</Bullet>
        <Bullet>Users created by an administrator receive a temporary password and <strong>must set their own at first login</strong>.</Bullet>
        <Bullet>An administrator resetting a password also forces a change at next login.</Bullet>
        <Bullet>Administrators cannot deactivate their own account.</Bullet>
      </Panel>
      <Panel title="Sessions" sub="Sign-in session handling.">
        <Bullet>Sessions are token-based and scoped to this workspace only.</Bullet>
        <Bullet>Signing out clears the session on this device.</Bullet>
        <div style={{ fontSize: '.82rem', color: C.muted, marginTop: 10 }}>
          Two-factor authentication is planned for a future release.
        </div>
      </Panel>
    </Grid>
  );
}

/* ---------------- Pro-gated tabs ---------------- */
function ProTab({ title, blurb, isPro }) {
  return (
    <Panel title={title} sub={blurb}>
      {isPro ? (
        <div style={{ color: C.muted, fontSize: '.9rem' }}>Coming soon on your plan.</div>
      ) : (
        <div style={{ background: '#eef4fd', border: `1px solid #cfe3fb`, borderRadius: 12, padding: 18 }}>
          <div style={{ display: 'inline-block', background: C.navy, color: '#fff', fontSize: '.66rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', padding: '3px 10px', borderRadius: 999, marginBottom: 10 }}>Professional & Enterprise</div>
          <div style={{ color: C.ink, fontSize: '.88rem', lineHeight: 1.6 }}>
            {title} is available on the Professional and Enterprise plans. Contact Nexusora Technologies to upgrade.
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ---------------- shared bits ---------------- */
function Grid({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 18, alignItems: 'start' }}>{children}</div>;
}
function Panel({ title, sub, children }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: '0 1px 2px rgba(1,33,88,.05)', padding: 20, marginBottom: 18 }}>
      <div style={{ fontWeight: 800, color: C.navy, fontSize: '1rem' }}>{title}</div>
      {sub && <div style={{ color: C.muted, fontSize: '.84rem', margin: '4px 0 16px', lineHeight: 1.5 }}>{sub}</div>}
      {children}
    </div>
  );
}
function Row({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>; }
function Field({ label, value, onChange, disabled, type = 'text' }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={lbl()}>{label}</div>
      <input type={type} value={value || ''} disabled={disabled}
        onChange={(e) => onChange && onChange(e.target.value)} style={{ ...inp(), background: disabled ? '#f7f9fc' : '#fff' }} />
    </label>
  );
}
function Dropzone({ label, hint, children }) {
  return (
    <div style={{ border: `1px dashed ${C.line}`, borderRadius: 12, padding: 16, marginBottom: 16, background: '#fcfdff' }}>
      <div style={{ fontWeight: 700, color: C.navy, fontSize: '.86rem', marginBottom: 4 }}>{label}</div>
      {hint && <div style={{ color: C.muted, fontSize: '.78rem', marginBottom: 12, lineHeight: 1.5 }}>{hint}</div>}
      {children}
    </div>
  );
}
function Empty({ children }) { return <div style={{ padding: 22, textAlign: 'center', color: C.muted, fontSize: '.85rem', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8 }}>{children}</div>; }
function BtnRow({ children }) { return <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>{children}</div>; }
function SmallBtn({ children, onClick, solid, danger }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontWeight: 700, fontSize: '.83rem',
      border: danger ? '1px solid #f6c9cb' : solid ? 'none' : `1px solid #d8e0ec`,
      background: solid ? C.navy : '#fff', color: solid ? '#fff' : danger ? C.red : C.ink,
    }}>{children}</button>
  );
}
function PrimaryBtn({ children, onClick, disabled, inline }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '11px 20px', border: 'none', borderRadius: 10, background: C.navy, color: '#fff',
      fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
      marginTop: inline ? 0 : 6,
    }}>{children}</button>
  );
}
function IconBtn({ children, onClick, color, title }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: 8,
      border: `1px solid ${C.line}`, background: '#fff', color, cursor: 'pointer',
    }}>{children}</button>
  );
}
function Bullet({ children }) {
  return <div style={{ display: 'flex', gap: 9, fontSize: '.88rem', color: C.ink, marginBottom: 9, lineHeight: 1.55 }}>
    <span style={{ color: C.blue, fontWeight: 800 }}>•</span><span>{children}</span>
  </div>;
}
function Note({ children }) {
  return <div style={{ background: '#eaf2fd', border: '1px solid #cfe3fb', color: '#0f3d78', padding: '10px 13px', borderRadius: 10, fontSize: '.88rem', marginBottom: 16 }}>{children}</div>;
}
function lbl() { return { fontSize: '.78rem', color: C.muted, fontWeight: 700, marginBottom: 6 }; }
function inp() { return { width: '100%', padding: '10px 12px', border: `1px solid #d8e0ec`, borderRadius: 10, fontSize: '.92rem', color: C.ink }; }
function td() { return { padding: '14px 18px', fontSize: '.9rem' }; }
