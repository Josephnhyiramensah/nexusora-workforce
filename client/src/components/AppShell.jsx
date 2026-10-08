/* =====================================================================
   AppShell — global chrome for Nexusora Workforce.
   SF-style top bar (brand · primary nav · app launcher · search · avatar)
   over a calm grey workspace. Wraps every page.
   ===================================================================== */
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { GlobalStyles } from '../ui/kit';
import { C, FONT, initials, fullName } from '../ui/tokens';
import {
  Home, Users, Wallet, Gauge, BarChart3, Grid3x3, Search, LogOut, Settings,
  Building2, Briefcase, FileText, UserPlus, ClipboardCheck, CalendarClock, CalendarDays,
  ShieldCheck, TrendingUp, GraduationCap, Network, HeartHandshake, Scale, Sparkles, IdCard,
} from 'lucide-react';
import NotificationBell from './NotificationBell';
import ErrorBoundary from './ErrorBoundary';

/* All modules, grouped — powers the launcher grid */
const MODULES = [
  { group: 'People', items: [
    { label: 'Employees', to: '/employees', Icon: Users, accent: '#3485E9' },
    { label: 'Organization', to: '/organization', Icon: Building2, accent: '#012158' },
    { label: 'Positions', to: '/positions', Icon: Briefcase, accent: '#0b6fd6' },
    { label: 'Job Descriptions', to: '/job-descriptions', Icon: FileText, accent: '#17a2b8' },
    { label: 'Self-Service', to: '/self-service', Icon: IdCard, accent: '#7c5cdf' },
  ] },
  { group: 'Hire & Onboard', items: [
    { label: 'Recruitment', to: '/recruitment', Icon: UserPlus, accent: '#1f9d57' },
    { label: 'Onboarding', to: '/onboarding', Icon: ClipboardCheck, accent: '#168eff' },
  ] },
  { group: 'Time & Pay', items: [
    { label: 'Attendance', to: '/attendance', Icon: CalendarClock, accent: '#0b6fd6' },
    { label: 'Leave', to: '/leave', Icon: CalendarDays, accent: '#17a2b8' },
    { label: 'Payroll', to: '/payroll', Icon: Wallet, accent: '#1f9d57' },
    { label: 'Compliance', to: '/compliance', Icon: ShieldCheck, accent: '#c77700' },
  ] },
  { group: 'Talent & Growth', items: [
    { label: 'Performance', to: '/performance', Icon: TrendingUp, accent: '#3485E9' },
    { label: 'Learning', to: '/learning', Icon: GraduationCap, accent: '#7c5cdf' },
    { label: 'Succession', to: '/succession', Icon: Network, accent: '#012158' },
  ] },
  { group: 'Care & Cases', items: [
    { label: 'Welfare & Social', to: '/welfare', Icon: HeartHandshake, accent: '#1f9d57' },
    { label: 'Employee Relations', to: '/relations', Icon: Scale, accent: '#e5484d' },
  ] },
  { group: 'Insight & Admin', items: [
    { label: 'Analytics', to: '/analytics', Icon: BarChart3, accent: '#168eff' },
    { label: 'Documents', to: '/documents', Icon: FileText, accent: '#0b6fd6' },
    { label: 'Workforce Planning', to: '/workforce-planning', Icon: Gauge, accent: '#17a2b8' },
    { label: 'AI Advisor', to: '/ai-advisor', Icon: Sparkles, accent: '#7c5cdf' },
  ] },
];

const PRIMARY = [
  { label: 'Home', tKey: 'nav.home', to: '/', Icon: Home, match: (p) => p === '/' },
  { label: 'People', tKey: 'nav.people', to: '/employees', Icon: Users, match: (p) => ['/employees', '/organization', '/positions', '/job-descriptions', '/self-service', '/recruitment', '/onboarding'].some((x) => p.startsWith(x)) },
  { label: 'Welfare', tKey: 'nav.welfare', to: '/welfare', Icon: HeartHandshake, match: (p) => ['/welfare', '/relations', '/learning', '/succession', '/performance'].some((x) => p.startsWith(x)) },
  { label: 'Analytics', tKey: 'nav.analytics', to: '/analytics', Icon: BarChart3, match: (p) => ['/analytics', '/documents', '/workforce-planning', '/ai-advisor', '/payroll', '/attendance', '/leave', '/compliance'].some((x) => p.startsWith(x)) },
];

export default function AppShell({ children }) {
  const loc = useLocation();
  const nav = useNavigate();
  const { user, tenant, logout } = useAuth();
  const brandLogo = tenant?.branding?.logo || '';
  const { t } = useLocale();
  const [launcher, setLauncher] = useState(false);
  const [menu, setMenu] = useState(false);
  const name = user?.name || fullName(user) || user?.email || 'User';
  const onHome = loc.pathname === '/';

  function go(to) { setLauncher(false); nav(to); }
  function doLogout() { setMenu(false); if (typeof logout === 'function') logout(); else nav('/login'); }

  return (
    <div style={{ fontFamily: FONT, minHeight: '100vh', background: C.ground }}>
      <GlobalStyles />

      {/* ---------- TOP BAR ---------- */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, height: 58, background: '#fff', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 20, padding: '0 22px', boxShadow: '0 1px 0 rgba(1,33,88,.03)' }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 11, textDecoration: 'none', minWidth: 200 }}>
          {brandLogo
            ? <div style={{ width: 34, height: 34, borderRadius: 9, flex: 'none', overflow: 'hidden', border: `1px solid ${C.line}`, background: '#fff', display: 'grid', placeItems: 'center' }}><img src={brandLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></div>
            : <div style={{ width: 34, height: 34, borderRadius: 9, flex: 'none', background: 'linear-gradient(135deg,var(--nx-brand,#012158),var(--nx-brand-2,#0b3f96))', display: 'grid', placeItems: 'center' }}><HeartHandshake size={19} color="#fff" /></div>}
          <div className="nx-brand-text">
            <div style={{ fontWeight: 800, color: C.navy, fontSize: '.95rem', letterSpacing: '-.01em', lineHeight: 1.05 }}>Nexusora Workforce</div>
            <div style={{ fontSize: '.62rem', color: C.muted2, fontWeight: 700, letterSpacing: '.04em' }}>People · Performance · Progress</div>
          </div>
        </Link>

        <nav className="nx-primary-nav" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {PRIMARY.map((n) => { const on = n.match(loc.pathname); const Icon = n.Icon; return (
            <Link key={n.label} to={n.to} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 13px', borderRadius: 9, textDecoration: 'none', fontWeight: 600, fontSize: '.83rem', color: on ? C.navy : C.muted, background: on ? '#eef4ff' : 'transparent' }}><Icon size={16} /> {t(n.tKey)}</Link>
          ); })}
        </nav>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="nx-topsearch" style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#f2f5f8', border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 12px', width: 262, color: C.muted2, fontSize: '.82rem' }}><Search size={15} /> {t('nav.searchPlaceholder')}</div>
          {!onHome && <button title={t('nav.allModules')} onClick={() => setLauncher((v) => !v)} style={iconBtn(launcher)}><Grid3x3 size={18} /></button>}
          <NotificationBell compact />
          <div style={{ position: 'relative' }}>
            <button onClick={() => setMenu((v) => !v)} title={name} style={{ width: 37, height: 37, borderRadius: '50%', flex: 'none', border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#3485E9,#012158)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: '.82rem' }}>{initials(name)}</button>
            {menu && (
              <>
                <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{ position: 'absolute', right: 0, top: 46, width: 220, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: '0 14px 40px rgba(1,33,88,.16)', zIndex: 41, overflow: 'hidden' }}>
                  <div style={{ padding: '13px 15px', borderBottom: `1px solid ${C.lineSoft}` }}><div style={{ fontWeight: 700, color: C.navy, fontSize: '.9rem' }}>{name}</div><div style={{ fontSize: '.75rem', color: C.muted2 }}>{cap(user?.role) || 'Signed in'}</div></div>
                  <button onClick={() => { setMenu(false); nav('/settings'); }} style={menuItem}><Settings size={15} /> {t('common.settings')}</button>
                  <button onClick={doLogout} style={{ ...menuItem, color: C.red }}><LogOut size={15} /> {t('common.signOut')}</button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ---------- APP LAUNCHER ---------- */}
      {launcher && (
        <>
          <div onClick={() => setLauncher(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(1,33,88,.35)', backdropFilter: 'blur(2px)', zIndex: 45 }} />
          <div style={{ position: 'fixed', top: 66, left: '50%', transform: 'translateX(-50%)', width: 'min(920px, 94vw)', maxHeight: '80vh', overflow: 'auto', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, boxShadow: '0 24px 60px rgba(1,33,88,.22)', zIndex: 46, padding: 22 }} className="nx-scroll">
            <div style={{ fontSize: '.7rem', fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: C.muted2, marginBottom: 14 }}>{t('nav.allModules')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px,1fr))', gap: 22 }}>
              {MODULES.map((g) => (
                <div key={g.group}>
                  <div style={{ fontSize: '.66rem', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted, marginBottom: 8 }}>{g.group}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {g.items.map((m) => { const on = loc.pathname.startsWith(m.to); const Icon = m.Icon; return (
                      <button key={m.to} onClick={() => go(m.to)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 10px', borderRadius: 10, border: 'none', cursor: 'pointer', textAlign: 'left', background: on ? '#eef4ff' : 'transparent', color: on ? C.navy : C.ink, fontWeight: on ? 700 : 500, fontSize: '.85rem' }}>
                        <span style={{ width: 30, height: 30, borderRadius: 8, flex: 'none', display: 'grid', placeItems: 'center', background: m.accent + '15', color: m.accent }}><Icon size={16} /></span>
                        {m.label}
                      </button>
                    ); })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ---------- PAGE ---------- */}
      <ErrorBoundary key={loc.pathname}>{children}</ErrorBoundary>
    </div>
  );
}

function cap(s) { return s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).replace(/_/g, ' ') : ''; }
function iconBtn(active) { return { position: 'relative', width: 37, height: 37, borderRadius: 10, border: `1px solid ${active ? C.accent : C.line}`, background: active ? '#eef4ff' : '#fff', display: 'grid', placeItems: 'center', color: active ? C.accentInk : C.muted, cursor: 'pointer' }; }
const menuItem = { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 15px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '.85rem', fontWeight: 600, color: C.ink, fontFamily: FONT };