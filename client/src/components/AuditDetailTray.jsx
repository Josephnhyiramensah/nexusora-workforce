/* =====================================================================
   AuditDetailTray — right-side drawer showing one audit entry in full.
   Opens when a row in the Audit Log is clicked (or via ?entry=<id>).
   ===================================================================== */
import { useEffect } from 'react';
import { X, User, Globe, Clock, Hash, FileCode2, ShieldAlert } from 'lucide-react';
import { C, NUM, FONT, cap, initials, gradOf } from '../ui/tokens';
import { actionLabel, verbTone, VERB_OF } from '../utils/audit';

function fmtFull(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' }); }
  catch { return String(d); }
}

function Line({ Icon, label, children, mono }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 0', borderTop: `1px solid ${C.lineSoft}` }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, flex: 'none', background: C.greyBg, color: C.muted, display: 'grid', placeItems: 'center' }}><Icon size={15} /></div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '.64rem', color: C.muted2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: '.88rem', color: C.ink, fontWeight: 600, wordBreak: 'break-word', ...(mono ? { ...NUM, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: '.82rem', fontWeight: 500 } : {}) }}>{children}</div>
      </div>
    </div>
  );
}

export default function AuditDetailTray({ entry, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!entry) return null;
  const a = entry.actor || {};
  const who = a.name || a.email || (a.type === 'system' ? 'System' : 'Unknown');
  const [vlabel, vtone] = verbTone(VERB_OF(entry.action, entry.method));
  const impersonated = entry.meta && entry.meta.impersonated;
  const body = entry.meta && entry.meta.body;

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(1,33,88,.42)', backdropFilter: 'blur(2px)', zIndex: 70 }} />
      <aside role="dialog" aria-label="Audit entry detail" className="nx-scroll" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(440px, 94vw)', background: '#fff', zIndex: 71, boxShadow: '-18px 0 44px rgba(1,33,88,.22)', display: 'flex', flexDirection: 'column', fontFamily: FONT }}>
        {/* header */}
        <div style={{ background: 'linear-gradient(120deg,' + C.hero1 + ',' + C.hero3 + ')', padding: '18px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ fontSize: '.66rem', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#2b4a74' }}>Audit entry</div>
            <button onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,.9)', background: 'rgba(255,255,255,.75)', color: C.navy, cursor: 'pointer', display: 'grid', placeItems: 'center' }}><X size={16} /></button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ ...NUM, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: '1rem', fontWeight: 800, color: '#062a55' }}>{actionLabel(entry.action)}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.7rem', fontWeight: 700, padding: '3px 10px', borderRadius: 999, color: vtone[0], background: vtone[1] }}>{vlabel}</span>
          </div>
        </div>

        {/* body */}
        <div style={{ padding: '6px 22px 22px', overflow: 'auto', flex: 1 }}>
          {impersonated && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.amberBg, color: C.amber, border: `1px solid ${C.amber}33`, borderRadius: 10, padding: '10px 12px', fontSize: '.8rem', fontWeight: 700, margin: '14px 0 2px' }}>
              <ShieldAlert size={15} /> Performed by a platform admin impersonating this workspace.
            </div>
          )}

          <Line Icon={User} label="Actor">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 30, height: 30, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: '.7rem', background: gradOf(who) }}>{initials(who)}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: C.ink }}>{who}</div>
                <div style={{ fontSize: '.74rem', color: C.muted2, fontWeight: 500 }}>{[a.email, cap(a.role)].filter(Boolean).join(' · ') || cap(a.type) || '—'}</div>
              </div>
            </div>
          </Line>

          <Line Icon={Clock} label="When">{fmtFull(entry.at)}</Line>
          <Line Icon={FileCode2} label="Request" mono>{entry.method || '—'} {entry.path || '—'}{typeof entry.statusCode === 'number' ? `  → ${entry.statusCode}` : ''}</Line>
          {entry.entity || entry.entityId ? <Line Icon={Hash} label="Resource" mono>{[entry.entity, entry.entityId].filter(Boolean).join('  ') || '—'}</Line> : null}
          <Line Icon={Globe} label="IP address" mono>{entry.ip || '—'}</Line>

          {body && Object.keys(body).length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: '.64rem', color: C.muted2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 7 }}>Changed fields (redacted)</div>
              <pre className="nx-scroll" style={{ margin: 0, background: '#0b1b33', color: '#d6e4ff', borderRadius: 10, padding: '12px 14px', fontSize: '.76rem', lineHeight: 1.5, overflow: 'auto', fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}>{JSON.stringify(body, null, 2)}</pre>
              <div style={{ fontSize: '.7rem', color: C.muted2, marginTop: 6 }}>Passwords, tokens and secrets are never recorded.</div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
