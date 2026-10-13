import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RefreshCw, LogOut } from 'lucide-react';
import { usePlatformAuth } from './auth';

export const C = {
  navy: '#012158', navy2: '#0a2c66', blue: '#3485E9', accent: '#168eff',
  green: '#1f9d57', amber: '#c77700', red: '#e5484d', purple: '#7c5cdf',
  ink: '#16233b', muted: '#67728a', faint: '#9aa6b8', line: '#e3eaf5', canvas: '#f1f5fb', card: '#fff',
};

const TABS = [
  { to: '/', label: 'Overview', emoji: '📊' },
  { to: '/tenants', label: 'Tenants', emoji: '🏢' },
  { to: '/revenue', label: 'Revenue', emoji: '💰' },
  { to: '/health', label: 'System Health', emoji: '🖥️' },
  { to: '/announcements', label: 'Announcements', emoji: '📢' },
  { to: '/settings', label: 'Platform Settings', emoji: '⚙️' },
  { to: '/audit', label: 'Activity Log', emoji: '📋' },
];

export function Shell({ children, onRefresh }) {
  const loc = useLocation();
  const nav = useNavigate();
  const { user, logout } = usePlatformAuth();
  const active = (to) => (to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(to));
  return (
    <div style={{ minHeight: '100vh', background: C.canvas, fontFamily: 'Inter, system-ui, Arial, sans-serif' }}>
      {/* Top bar */}
      <div style={{ background: `linear-gradient(90deg, ${C.navy}, ${C.navy2})`, padding: '0 28px', height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fff', color: C.navy, display: 'grid', placeItems: 'center', fontWeight: 800 }}>N</div>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Nexusora Workforce</span>
          <span style={{ fontSize: 11, color: C.accent, padding: '2px 9px', background: 'rgba(22,142,255,0.16)', borderRadius: 10, fontWeight: 600 }}>Developer Console</span>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)' }}>{user?.name || user?.email || 'Platform admin'}</span>
          {onRefresh && (
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }} onClick={onRefresh}
              style={{ padding: '6px 13px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.22)', background: 'transparent', color: '#fff', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <RefreshCw size={13} /> Refresh
            </motion.button>
          )}
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }} onClick={() => { logout(); nav('/login'); }}
            style={{ padding: '6px 13px', borderRadius: 8, border: '1px solid rgba(229,72,77,0.4)', background: 'rgba(229,72,77,0.12)', color: '#fca5a5', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <LogOut size={13} /> Sign out
          </motion.button>
        </div>
      </div>
      {/* Tabs */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${C.line}`, padding: '0 28px', display: 'flex', gap: 2, overflowX: 'auto' }}>
        {TABS.map((t) => (
          <Link key={t.to} to={t.to} style={{ padding: '13px 16px', fontSize: 13, fontWeight: active(t.to) ? 700 : 500, whiteSpace: 'nowrap',
            color: active(t.to) ? C.navy : C.faint, borderBottom: active(t.to) ? `2.5px solid ${C.accent}` : '2.5px solid transparent', textDecoration: 'none', marginBottom: -1 }}>
            <span style={{ marginRight: 7 }}>{t.emoji}</span>{t.label}
          </Link>
        ))}
      </div>
      <div style={{ padding: '26px 28px', maxWidth: 1180, margin: '0 auto' }}>{children}</div>
    </div>
  );
}

export function PageHead({ title, sub, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
      <div>
        <h1 style={{ margin: 0, color: C.navy, fontSize: '1.45rem', fontWeight: 800 }}>{title}</h1>
        {sub && <div style={{ color: C.muted, fontSize: '.9rem', marginTop: 3 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export function Card({ children, style }) {
  return <div style={{ background: C.card, borderRadius: 13, boxShadow: '0 1px 4px rgba(1,33,88,0.07)', padding: 20, ...style }}>{children}</div>;
}

export function StatCard({ label, value, color, Icon, i = 0 }) {
  // Slide-only entrance (opacity stays 1) so the card is never hidden if the
  // animation doesn't run — never gate content visibility on JS animation.
  return (
    <motion.div initial={{ y: 10 }} animate={{ y: 0 }} transition={{ delay: i * 0.06 }}
      style={{ background: '#fff', borderRadius: 12, padding: '17px 20px', borderLeft: `4px solid ${color || C.navy}`, boxShadow: '0 1px 4px rgba(1,33,88,0.07)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: 11, color: C.faint, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</p>
          <p style={{ fontSize: 25, fontWeight: 800, color: C.navy, margin: '6px 0 0' }}>{value}</p>
        </div>
        {Icon && <div style={{ width: 38, height: 38, borderRadius: 10, background: `${color || C.navy}14`, display: 'grid', placeItems: 'center' }}><Icon size={18} color={color || C.navy} /></div>}
      </div>
    </motion.div>
  );
}

const STATUS = {
  active: [C.green, '#e9f7ef'], trial: [C.blue, '#eaf2ff'], grace: [C.amber, '#fff5e6'], past_due: [C.amber, '#fff5e6'],
  expired: [C.red, '#fdecec'], suspended: [C.red, '#fdecec'], paid: [C.green, '#e9f7ef'], open: [C.amber, '#fff5e6'], void: [C.faint, '#eef1f6'],
};
export function Badge({ children }) {
  const [color, bg] = STATUS[children] || [C.muted, '#eef1f6'];
  return <span style={{ color, background: bg, fontWeight: 700, fontSize: '.73rem', padding: '3px 10px', borderRadius: 999, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{String(children).replace('_', ' ')}</span>;
}

export function Btn({ children, onClick, tone = 'primary', disabled, small, type }) {
  const tones = {
    primary: { bg: `linear-gradient(90deg, ${C.navy}, ${C.blue})`, color: '#fff', border: 'none' },
    ghost: { bg: '#fff', color: C.navy, border: `1px solid ${C.line}` },
    danger: { bg: '#fff', color: C.red, border: '1px solid #f6c9cb' },
    gold: { bg: `linear-gradient(135deg, ${C.accent}, ${C.blue})`, color: '#fff', border: 'none' },
  };
  const t = tones[tone] || tones.primary;
  return (
    <motion.button type={type} whileHover={disabled ? {} : { scale: 1.03 }} whileTap={disabled ? {} : { scale: 0.97 }} onClick={onClick} disabled={disabled}
      style={{ background: t.bg, color: t.color, border: t.border, borderRadius: 9, padding: small ? '7px 13px' : '10px 18px',
        fontWeight: 700, fontSize: small ? '.82rem' : '.9rem', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1 }}>
      {children}
    </motion.button>
  );
}

export function Modal({ title, subtitle, children, onClose, wide }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(1,33,88,0.5)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 20 }}>
      <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: wide ? 720 : 560, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <div>
            <div style={{ fontWeight: 800, color: C.navy, fontSize: '1.1rem' }}>{title}</div>
            {subtitle && <div style={{ color: C.faint, fontSize: '.78rem', fontFamily: 'monospace', marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ fontSize: 20, color: C.faint, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: 22 }}>{children}</div>
      </motion.div>
    </div>
  );
}

export function SubTabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.line}`, marginBottom: 18, flexWrap: 'wrap' }}>
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{ padding: '9px 15px', fontSize: 12.5, fontWeight: active === t.key ? 700 : 500,
          color: active === t.key ? C.navy : C.faint, borderBottom: active === t.key ? `2px solid ${C.accent}` : '2px solid transparent', background: 'none', border: 'none', cursor: 'pointer', marginBottom: -1, whiteSpace: 'nowrap' }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Callout({ children, tone = 'info' }) {
  const map = { info: ['#f0f7ff', '#cfe0ff', '#1d4ed8'], warn: ['#fff5e6', '#ffe0ad', '#8a5a00'], ok: ['#e9f7ef', '#bfe6cd', '#1f7a43'] };
  const [bg, border, color] = map[tone] || map.info;
  return <div style={{ background: bg, border: `1px solid ${border}`, color, borderRadius: 10, padding: '10px 14px', fontSize: '.84rem' }}>{children}</div>;
}

export const inp = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, border: `1px solid ${C.line}`, background: '#f7f9fc', fontSize: '.9rem', outline: 'none' };
export const lbl = { display: 'block', fontSize: 11.5, fontWeight: 700, color: C.muted, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' };
export const L = ({ label, children }) => <div><label style={lbl}>{label}</label>{children}</div>;
export const Grid = ({ children, cols = 2 }) => <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>{children}</div>;
export const th = { padding: '11px 14px', fontWeight: 700, fontSize: '.71rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: C.muted, textAlign: 'left' };
export const td = { padding: '12px 14px', color: C.ink, fontSize: '.88rem' };

export const money = (n, cur) => `${cur ? cur + ' ' : ''}${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
