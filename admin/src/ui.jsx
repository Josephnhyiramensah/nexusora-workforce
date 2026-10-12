import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Building2, Tag, ScrollText, LogOut } from 'lucide-react';
import { usePlatformAuth } from './auth';

export const C = {
  navy: '#012158', navy2: '#0a2c66', blue: '#3485E9', green: '#1f9d57', amber: '#c77700', red: '#e5484d',
  ink: '#16233b', muted: '#67728a', line: '#e3eaf5', canvas: '#eef3fa', card: '#fff',
};

const NAV = [
  { to: '/', label: 'Overview', Icon: LayoutDashboard },
  { to: '/tenants', label: 'Tenants', Icon: Building2 },
  { to: '/pricing', label: 'Pricing', Icon: Tag },
  { to: '/audit', label: 'Audit log', Icon: ScrollText },
];

export function Shell({ children }) {
  const loc = useLocation();
  const nav = useNavigate();
  const { user, logout } = usePlatformAuth();
  const active = (to) => (to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(to));
  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: C.canvas, fontFamily: 'Inter, system-ui, Arial, sans-serif' }}>
      <aside style={{ width: 232, background: `linear-gradient(180deg, ${C.navy}, ${C.navy2})`, color: '#fff', display: 'flex', flexDirection: 'column', padding: '22px 16px', position: 'sticky', top: 0, height: '100vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px 22px' }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: '#fff', display: 'grid', placeItems: 'center', color: C.navy, fontWeight: 800 }}>N</div>
          <div><div style={{ fontWeight: 800, fontSize: '.95rem', lineHeight: 1 }}>Nexusora</div><div style={{ fontSize: '.68rem', opacity: .7, letterSpacing: '.08em', textTransform: 'uppercase' }}>Admin Console</div></div>
        </div>
        <nav style={{ display: 'grid', gap: 4 }}>
          {NAV.map(({ to, label, Icon }) => (
            <Link key={to} to={to} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 9, textDecoration: 'none',
              color: active(to) ? '#fff' : 'rgba(255,255,255,.72)', background: active(to) ? 'rgba(255,255,255,.12)' : 'transparent', fontWeight: 600, fontSize: '.88rem' }}>
              <Icon size={17} /> {label}
            </Link>
          ))}
        </nav>
        <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,.12)', paddingTop: 14 }}>
          <div style={{ fontSize: '.78rem', opacity: .8, padding: '0 6px 8px' }}>{user?.name || user?.email || 'Platform admin'}</div>
          <button onClick={() => { logout(); nav('/login'); }} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 12px', borderRadius: 9, border: 'none', background: 'rgba(255,255,255,.1)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '.84rem' }}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <main style={{ flex: 1, padding: '28px 32px', maxWidth: 1100 }}>{children}</main>
    </div>
  );
}

export function PageTitle({ title, sub, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
      <div>
        <h1 style={{ margin: 0, color: C.navy, fontSize: '1.6rem', fontWeight: 800 }}>{title}</h1>
        {sub && <div style={{ color: C.muted, fontSize: '.9rem', marginTop: 4 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export function Card({ children, style }) {
  return <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, ...style }}>{children}</div>;
}

const STATUS_COLORS = {
  active: [C.green, '#e9f7ef'], trial: [C.blue, '#eaf2ff'], grace: [C.amber, '#fff5e6'], past_due: [C.amber, '#fff5e6'],
  expired: [C.red, '#fdecec'], suspended: [C.red, '#fdecec'], paid: [C.green, '#e9f7ef'], open: [C.amber, '#fff5e6'], void: [C.muted, '#eef1f6'],
};
export function Badge({ children }) {
  const [color, bg] = STATUS_COLORS[children] || [C.muted, '#eef1f6'];
  return <span style={{ color, background: bg, fontWeight: 700, fontSize: '.74rem', padding: '3px 10px', borderRadius: 999, textTransform: 'capitalize' }}>{String(children).replace('_', ' ')}</span>;
}

export function Btn({ children, onClick, tone = 'primary', disabled, small }) {
  const tones = {
    primary: { bg: `linear-gradient(90deg, ${C.navy}, ${C.blue})`, color: '#fff', border: 'none' },
    ghost: { bg: '#fff', color: C.navy, border: `1px solid ${C.line}` },
    danger: { bg: '#fff', color: C.red, border: `1px solid #f6c9cb` },
  };
  const t = tones[tone] || tones.primary;
  return (
    <button onClick={onClick} disabled={disabled} style={{ background: t.bg, color: t.color, border: t.border, borderRadius: 9,
      padding: small ? '7px 12px' : '10px 16px', fontWeight: 700, fontSize: small ? '.82rem' : '.9rem', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1 }}>
      {children}
    </button>
  );
}

export const money = (n, cur) => `${cur ? cur + ' ' : ''}${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
