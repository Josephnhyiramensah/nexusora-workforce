/* =====================================================================
   Security settings — real TOTP two-factor authentication (enrol with a QR
   code, save backup codes, disable), plus the workspace password/session
   policy. Mirrors the Nexusora Books flow.
   ===================================================================== */
import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldOff, Copy, Check, KeyRound, QrCode } from 'lucide-react';
import api from '../../api/client';

const C = { navy: '#012158', blue: '#3485E9', green: '#1f9d57', red: '#e5484d',
  ink: '#16233b', muted: '#8b96a9', muted2: '#67728a', line: '#e6ebf3' };

export default function SecuritySettings({ setMsg }) {
  const [status, setStatus] = useState(null);        // { enabled, backupCodesRemaining }
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  // Enrol flow
  const [enroll, setEnroll] = useState(null);        // { qrDataUrl, manualEntryKey }
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [backupCodes, setBackupCodes] = useState(null); // shown once after enable/regenerate
  const [copied, setCopied] = useState(false);

  // Disable flow
  const [disabling, setDisabling] = useState(false);
  const [disablePw, setDisablePw] = useState('');
  const [disableCode, setDisableCode] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try { const { data } = await api.get('/auth/2fa/status'); if (alive) setStatus(data?.data || { enabled: false }); }
      catch { if (alive) setStatus({ enabled: false }); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [reload]);

  async function startSetup() {
    setErr(''); setBusy(true); setBackupCodes(null);
    try { const { data } = await api.post('/auth/2fa/setup'); setEnroll(data?.data); setCode(''); }
    catch (e) { setErr(e?.response?.data?.message || 'Could not start setup.'); }
    finally { setBusy(false); }
  }

  async function confirmSetup() {
    setErr(''); setBusy(true);
    try {
      const { data } = await api.post('/auth/2fa/verify-setup', { token: code.trim() });
      setBackupCodes(data?.data?.backupCodes || []);
      setEnroll(null); setCode('');
      setReload((n) => n + 1);
      setMsg && setMsg('Two-factor authentication enabled.');
    } catch (e) { setErr(e?.response?.data?.message || 'Incorrect code.'); }
    finally { setBusy(false); }
  }

  async function regenerate() {
    const token = window.prompt('Enter a current authenticator code to regenerate backup codes:');
    if (!token) return;
    try {
      const { data } = await api.post('/auth/2fa/regenerate-backup-codes', { token: token.trim() });
      setBackupCodes(data?.data?.backupCodes || []);
      setReload((n) => n + 1);
      setMsg && setMsg('New backup codes generated.');
    } catch (e) { setMsg && setMsg(e?.response?.data?.message || 'Could not regenerate codes.'); }
  }

  async function doDisable() {
    setErr(''); setBusy(true);
    try {
      await api.post('/auth/2fa/disable', { password: disablePw, token: disableCode.trim() });
      setDisabling(false); setDisablePw(''); setDisableCode('');
      setReload((n) => n + 1);
      setMsg && setMsg('Two-factor authentication disabled.');
    } catch (e) { setErr(e?.response?.data?.message || 'Could not disable 2FA.'); }
    finally { setBusy(false); }
  }

  function copyCodes() {
    if (!backupCodes?.length) return;
    try { navigator.clipboard.writeText(backupCodes.join('\n')); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  }

  const on = status?.enabled;

  return (
    <Grid>
      <Panel
        title="Two-factor authentication"
        sub="Add a one-time code from an authenticator app on top of your password."
      >
        {loading ? <div style={{ color: C.muted, padding: 10 }}>Loading…</div> : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center', background: on ? '#e4f7ec' : '#f1f4f9', color: on ? C.green : C.muted2 }}>
                {on ? <ShieldCheck size={20} /> : <ShieldOff size={20} />}
              </span>
              <div>
                <div style={{ fontWeight: 800, color: on ? C.green : C.ink, fontSize: '.95rem' }}>{on ? 'Enabled' : 'Not enabled'}</div>
                {on && <div style={{ fontSize: '.78rem', color: C.muted2 }}>{status.backupCodesRemaining} backup code{status.backupCodesRemaining === 1 ? '' : 's'} remaining</div>}
              </div>
            </div>

            {/* Backup codes just issued — show once */}
            {backupCodes && (
              <div style={{ background: '#fff8e6', border: '1px solid #ffe0a3', borderRadius: 12, padding: 14, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 800, color: '#8a5a00', fontSize: '.85rem', marginBottom: 8 }}>
                  <KeyRound size={15} /> Save your backup codes
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '.84rem', color: C.ink, marginBottom: 10 }}>
                  {backupCodes.map((bc) => <div key={bc} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 7, padding: '6px 9px', textAlign: 'center' }}>{bc}</div>)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={copyCodes} style={{ ...btn(C.navy, true), display: 'inline-flex', alignItems: 'center', gap: 6 }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy all'}</button>
                  <span style={{ fontSize: '.74rem', color: '#8a5a00' }}>Each code works once. Store them somewhere safe — they won't be shown again.</span>
                </div>
              </div>
            )}

            {/* OFF → enrol */}
            {!on && !enroll && (
              <button onClick={startSetup} disabled={busy} style={{ ...btn(C.navy, true), display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <ShieldCheck size={16} /> {busy ? 'Starting…' : 'Enable two-factor authentication'}
              </button>
            )}

            {!on && enroll && (
              <div>
                <div style={{ fontSize: '.84rem', color: C.ink, lineHeight: 1.6, marginBottom: 12 }}>
                  <strong>1.</strong> Scan this QR code in Google Authenticator, Authy, 1Password, etc.
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 14 }}>
                  <img src={enroll.qrDataUrl} alt="2FA QR code" style={{ width: 160, height: 160, border: `1px solid ${C.line}`, borderRadius: 10, background: '#fff' }} />
                  <div style={{ minWidth: 180, flex: 1 }}>
                    <div style={{ fontSize: '.74rem', color: C.muted2, fontWeight: 700, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6 }}><QrCode size={13} /> Can't scan? Enter this key:</div>
                    <code style={{ display: 'block', background: '#f7f9fc', border: `1px solid ${C.line}`, borderRadius: 8, padding: '9px 11px', fontSize: '.76rem', wordBreak: 'break-all', fontFamily: 'ui-monospace, Menlo, monospace', color: C.ink }}>{enroll.manualEntryKey}</code>
                  </div>
                </div>
                <div style={{ fontSize: '.84rem', color: C.ink, marginBottom: 6 }}><strong>2.</strong> Enter the 6-digit code it shows:</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="123456"
                    style={{ width: 140, padding: '10px 12px', border: `1px solid #d8e0ec`, borderRadius: 10, fontSize: '1rem', letterSpacing: '.3em', fontWeight: 700, textAlign: 'center', fontFamily: 'inherit' }} />
                  <button onClick={confirmSetup} disabled={busy || code.trim().length < 6} style={{ ...btn(C.green, true), opacity: busy || code.trim().length < 6 ? 0.6 : 1 }}>{busy ? 'Verifying…' : 'Verify & enable'}</button>
                  <button onClick={() => { setEnroll(null); setErr(''); }} style={btn(C.ink, false)}>Cancel</button>
                </div>
              </div>
            )}

            {/* ON → manage */}
            {on && !disabling && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={regenerate} style={btn(C.navy, false)}>Regenerate backup codes</button>
                <button onClick={() => { setDisabling(true); setErr(''); }} style={{ ...btn(C.red, false), borderColor: '#f6c9cb' }}>Disable 2FA</button>
              </div>
            )}

            {on && disabling && (
              <div style={{ background: '#fdf2f2', border: '1px solid #f6c9cb', borderRadius: 12, padding: 14 }}>
                <div style={{ fontWeight: 700, color: C.red, fontSize: '.86rem', marginBottom: 10 }}>Disable two-factor authentication</div>
                <div style={{ display: 'grid', gap: 10, maxWidth: 320 }}>
                  <input type="password" value={disablePw} onChange={(e) => setDisablePw(e.target.value)} placeholder="Current password" style={inp()} />
                  <input value={disableCode} onChange={(e) => setDisableCode(e.target.value)} inputMode="numeric" placeholder="Authenticator code" style={inp()} />
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={doDisable} disabled={busy || !disablePw || !disableCode.trim()} style={{ ...btn(C.red, true), opacity: busy || !disablePw || !disableCode.trim() ? 0.6 : 1 }}>{busy ? 'Disabling…' : 'Confirm disable'}</button>
                    <button onClick={() => { setDisabling(false); setDisablePw(''); setDisableCode(''); setErr(''); }} style={btn(C.ink, false)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {err && <div style={{ color: C.red, background: '#fdecec', border: '1px solid #f6c9cb', padding: '9px 12px', borderRadius: 9, fontSize: '.84rem', marginTop: 12 }}>{err}</div>}
          </>
        )}
      </Panel>

      <Panel title="Password policy" sub="How sign-in credentials are handled in this workspace.">
        <Bullet>Minimum password length: <strong>8 characters</strong>.</Bullet>
        <Bullet>Users created by an administrator receive a temporary password and <strong>must set their own at first login</strong>.</Bullet>
        <Bullet>An administrator resetting a password also forces a change at next login.</Bullet>
        <Bullet>Administrators cannot deactivate their own account.</Bullet>
      </Panel>

      <Panel title="Sessions" sub="Sign-in session handling.">
        <Bullet>Sessions are token-based and scoped to this workspace only.</Bullet>
        <Bullet>Signing out clears the session on this device.</Bullet>
        <Bullet>With 2FA on, a second factor is required at every new sign-in.</Bullet>
      </Panel>
    </Grid>
  );
}

/* --- UI atoms (match the Settings look) --- */
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
function Bullet({ children }) {
  return <div style={{ display: 'flex', gap: 9, fontSize: '.88rem', color: C.ink, marginBottom: 9, lineHeight: 1.55 }}><span style={{ color: C.blue, fontWeight: 800 }}>•</span><span>{children}</span></div>;
}
function inp() { return { width: '100%', padding: '10px 12px', border: `1px solid #d8e0ec`, borderRadius: 10, fontSize: '.92rem', color: C.ink, fontFamily: 'inherit' }; }
function btn(color, solid) {
  return { padding: '10px 16px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '.84rem', fontFamily: 'inherit',
    border: solid ? 'none' : `1px solid ${C.line}`, background: solid ? color : '#fff', color: solid ? '#fff' : color };
}
