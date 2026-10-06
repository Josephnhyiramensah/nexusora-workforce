import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Users, CalendarDays, TriangleAlert, UserCheck, Globe, X, Bell, Settings, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import api from '../api/client';
import { MODULE_GROUPS } from '../config/moduleList';

const C = { navy: '#012158', blue: '#3485E9', canvas: '#eef1f4', card: '#fff',
  ink: '#16233b', muted: '#8b96a9', muted2: '#67728a', line: '#e6ebf3' };

const cap = (s) => s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).replace(/_/g, ' ') : '';
const initialsOf = (n) => String(n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';

export default function HomeScreen() {
  const { user, tenant, logout } = useAuth();
  const { t, locale, setLocale, locales } = useLocale();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ employees: '—', pending: '—', lost: '—' });
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const out = {};
      try { const r = await api.get('/employees', { params: { limit: 1 } }); out.employees = r?.data?.total ?? '—'; } catch { out.employees = '—'; }
      try { const r = await api.get('/leave/requests', { params: { status: 'pending' } }); out.pending = Array.isArray(r?.data) ? r.data.length : (r?.data?.items?.length ?? '—'); } catch { out.pending = '—'; }
      try {
        const to = new Date().toISOString().slice(0, 10);
        const from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
        const r = await api.get('/attendance/absenteeism', { params: { from, to } });
        out.lost = r?.data?.summary?.lostManDays ?? '—';
      } catch { out.lost = '—'; }
      if (alive) setStats((s) => ({ ...s, ...out }));
    })();
    return () => { alive = false; };
  }, []);

  const name = user?.name || user?.email || 'User';
  const firstName = String(name).split(/\s+/)[0] || 'there';
  const hr = new Date().getHours();
  const greetKey = hr < 12 ? 'home.greeting_morning' : hr < 17 ? 'home.greeting_afternoon' : 'home.greeting_evening';
  const today = new Date().toLocaleDateString(locale || undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const companyName = tenant?.name || tenant?.displayName || 'Nexusora Workforce';
  const companySub = (tenant?.name || tenant?.displayName) ? 'Nexusora Workforce' : 'People · Performance · Progress';
  const logoSrc = tenant?.logo || tenant?.logoUrl || '/logo-mark.png';

  const q = query.trim().toLowerCase();
  const groups = q
    ? MODULE_GROUPS.map((g) => ({ ...g, items: g.items.filter((it) => { const lbl = it.labelKey ? t(it.labelKey) : (it.label || ''); return String(lbl).toLowerCase().includes(q); }) })).filter((g) => g.items.length)
    : MODULE_GROUPS;

  function doLogout() { setMenu(false); if (typeof logout === 'function') logout(); else navigate('/login'); }

  return (
    <div style={{ minHeight: '100vh', background: C.canvas, fontFamily: 'Inter, system-ui, Arial, sans-serif' }}>
      <style>{`
        .nx-home-masonry { column-count: 3; column-gap: 18px; }
        @media (max-width: 1080px) { .nx-home-masonry { column-count: 2; } }
        @media (max-width: 620px)  { .nx-home-masonry { column-count: 1; } }
        .nx-home-panel {
          break-inside: avoid; -webkit-column-break-inside: avoid; page-break-inside: avoid;
          background: #fff; border: 1px solid ${C.line}; border-radius: 16px;
          padding: 16px 16px 6px; margin: 0 0 18px; box-shadow: 0 1px 2px rgba(1,33,88,.04);
        }
        .nx-home-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; }
        .nx-hb-searchicon { display: none; }
        @media (max-width: 860px) {
          .nx-hb-search { display: none !important; }
          .nx-hb-searchicon { display: grid !important; }
          .nx-hb-company { display: none !important; }
          .nx-hb-role { display: none !important; }
        }
        @media (max-width: 620px) {
          .nx-home-content { padding: 20px 16px 52px !important; }
          .nx-home-stats { grid-template-columns: 1fr 1fr !important; gap: 12px; }
        }
      `}</style>

      {/* ================= TOP BAR ================= */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, height: 60, background: '#fff', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 16, padding: '0 22px', boxShadow: '0 1px 0 rgba(1,33,88,.03)' }}>
        {/* brand: company logo + company name + product */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0, flexShrink: 0 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, flex: 'none', overflow: 'hidden', border: `1px solid ${C.line}`, background: '#fff', display: 'grid', placeItems: 'center' }}>
            <img src={logoSrc} alt="" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/logo-mark.png'; }} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div className="nx-hb-company" style={{ lineHeight: 1.15, minWidth: 0 }}>
            <div style={{ fontWeight: 800, color: C.navy, fontSize: '.98rem', letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>{companyName}</div>
            <div style={{ fontSize: '.66rem', color: C.muted2, fontWeight: 700 }}>{companySub}</div>
          </div>
        </div>

        {/* search modules (center) */}
        <div className="nx-hb-search" style={{ flex: 1, maxWidth: 560, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 9, background: '#f2f5f8', border: `1px solid ${C.line}`, borderRadius: 11, padding: '9px 13px', color: C.muted2 }}>
          <Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('home.search')} style={{ border: 'none', outline: 'none', flex: 1, minWidth: 0, background: 'none', color: C.ink, fontFamily: 'inherit', fontSize: '.88rem' }} />
        </div>
        <div style={{ flex: 1 }} className="nx-hb-search" />

        {/* right cluster */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <button className="nx-hb-searchicon" onClick={() => setSearchOpen((v) => !v)} aria-label="Search" style={{ placeItems: 'center', width: 40, height: 40, borderRadius: 10, border: `1px solid ${C.line}`, background: searchOpen ? C.navy : '#fff', color: searchOpen ? '#fff' : C.navy, cursor: 'pointer' }}>{searchOpen ? <X size={17} /> : <Search size={17} />}</button>

          {/* language switcher (multi-national) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#f2f5f8', border: `1px solid ${C.line}`, borderRadius: 10, padding: '0 6px 0 10px', color: C.navy, height: 40 }}>
            <Globe size={15} />
            <select value={locale} onChange={(e) => setLocale(e.target.value)} aria-label="Language" style={{ border: 'none', outline: 'none', background: 'none', color: C.navy, fontSize: '.84rem', fontWeight: 700, cursor: 'pointer', padding: '0 4px', fontFamily: 'inherit', height: '100%' }}>
              {locales.map((l) => <option key={l.code} value={l.code}>{(l.nativeName || l.name) + (l.status && l.status !== 'ready' ? ' •' : '')}</option>)}
            </select>
          </div>

          <button title={t('common.notifications')} style={{ position: 'relative', width: 40, height: 40, borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', display: 'grid', placeItems: 'center', color: C.muted2, cursor: 'pointer' }}><Bell size={17} /></button>

          {/* profile */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setMenu((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', padding: '3px 4px 3px 3px', borderRadius: 10 }}>
              <span style={{ width: 38, height: 38, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: '.82rem', background: 'linear-gradient(135deg,#3485E9,#012158)' }}>{initialsOf(name)}</span>
              <span className="nx-hb-role" style={{ lineHeight: 1.15, textAlign: 'left' }}>
                <span style={{ display: 'block', fontWeight: 700, color: C.ink, fontSize: '.84rem', whiteSpace: 'nowrap' }}>{name}</span>
                <span style={{ display: 'block', fontSize: '.7rem', color: C.muted2 }}>{cap(user?.role) || 'Signed in'}</span>
              </span>
              <ChevronDown className="nx-hb-role" size={15} color={C.muted2} />
            </button>
            {menu && (
              <>
                <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{ position: 'absolute', right: 0, top: 50, width: 230, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: '0 14px 40px rgba(1,33,88,.16)', zIndex: 41, overflow: 'hidden' }}>
                  <div style={{ padding: '13px 15px', borderBottom: `1px solid #eef2f8` }}>
                    <div style={{ fontWeight: 700, color: C.navy, fontSize: '.9rem' }}>{name}</div>
                    <div style={{ fontSize: '.75rem', color: C.muted2 }}>{cap(user?.role) || 'Signed in'}</div>
                  </div>
                  <button onClick={() => { setMenu(false); navigate('/self-service'); }} style={menuItem}><Users size={15} /> {t('common.myProfile')}</button>
                  <button onClick={() => { setMenu(false); navigate('/settings'); }} style={menuItem}><Settings size={15} /> {t('common.settings')}</button>
                  <button onClick={doLogout} style={{ ...menuItem, color: '#e5484d', borderTop: `1px solid #eef2f8` }}><LogOut size={15} /> {t('common.signOut')}</button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* mobile expanded search */}
      {searchOpen && (
        <div className="nx-hb-searchicon" style={{ display: 'block', padding: '10px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 11, padding: '10px 13px', color: C.muted2 }}>
            <Search size={16} /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('home.search')} style={{ border: 'none', outline: 'none', flex: 1, minWidth: 0, background: 'none', color: C.ink, fontFamily: 'inherit', fontSize: '.9rem' }} />
            {query && <button onClick={() => setQuery('')} aria-label="Clear" style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', display: 'grid', placeItems: 'center' }}><X size={16} /></button>}
          </div>
        </div>
      )}

      {/* ================= CONTENT ================= */}
      <div className="nx-home-content" style={{ maxWidth: 1320, margin: '0 auto', padding: '28px 34px 60px' }}>
        <h1 style={{ color: C.navy, fontSize: '1.75rem', fontWeight: 800, margin: 0, letterSpacing: '-.02em', lineHeight: 1.1 }}>{t(greetKey, { name: firstName })} 👋</h1>
        <div style={{ color: C.muted2, fontSize: '.9rem', marginTop: 5, marginBottom: 24 }}>{today}</div>

        <div className="nx-home-stats" style={{ marginBottom: 28 }}>
          <Stat label={t('home.stat_employees')} value={stats.employees} grad="linear-gradient(135deg,#123a7e,#012158)" Icon={Users} />
          <Stat label={t('home.stat_pending')} value={stats.pending} grad="linear-gradient(135deg,#ffb43e,#f08a00)" Icon={CalendarDays} />
          <Stat label={t('home.stat_lost')} value={stats.lost} grad="linear-gradient(135deg,#ff6b6f,#d63a3f)" Icon={TriangleAlert} />
          <Stat label={t('home.stat_active')} value={stats.employees} grad="linear-gradient(135deg,#35c07b,#159152)" Icon={UserCheck} />
        </div>

        {groups.length > 0 && (
          <div className="nx-home-masonry">
            {groups.map((g) => (
              <div key={g.title} className="nx-home-panel">
                <div style={{ fontSize: '.7rem', letterSpacing: '.14em', textTransform: 'uppercase', color: C.muted, fontWeight: 700, marginBottom: 12 }}>{g.titleKey ? t(g.titleKey) : g.title}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(122px, 1fr))', gap: 12 }}>
                  {g.items.map((it) => <Tile key={it.key} item={it} tr={t} />)}
                </div>
              </div>
            ))}
          </div>
        )}
        {q && groups.length === 0 && (
          <div style={{ color: C.muted, fontSize: '.9rem', padding: '20px 0' }}>{t('home.noMatch', { q: query })}</div>
        )}
      </div>
    </div>
  );
}

const menuItem = { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 15px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '.85rem', fontWeight: 600, color: '#16233b', fontFamily: 'inherit' };

function Tile({ item, tr }) {
  const Icon = item.Icon || item.icon || (() => null);
  const accent = item.accent || '#3485E9';
  const live = item.live !== false && !!item.to;
  const label = item.labelKey ? tr(item.labelKey) : item.label;
  const subtitle = item.subtitleKey ? tr(item.subtitleKey) : item.subtitle;
  const body = (
    <>
      <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: accent, borderRadius: '13px 13px 0 0' }} />
      <div style={{ width: 42, height: 42, borderRadius: 11, display: 'grid', placeItems: 'center', marginBottom: 10, background: hexA(accent, 0.12), color: accent }}>
        <Icon size={20} strokeWidth={1.9} />
      </div>
      <div style={{ fontWeight: 700, color: '#012158', fontSize: '.86rem', lineHeight: 1.25 }}>{label}</div>
      {subtitle && <div style={{ fontSize: '.7rem', color: '#8b96a9', marginTop: 3, lineHeight: 1.3 }}>{subtitle}</div>}
      {!live && <span style={{ position: 'absolute', top: 10, right: 10, fontSize: '.54rem', textTransform: 'uppercase', letterSpacing: '.06em', color: '#8b96a9', background: '#eef1f6', padding: '2px 7px', borderRadius: 999, fontWeight: 700 }}>{tr('common.soon')}</span>}
    </>
  );
  const base = { position: 'relative', display: 'block', background: '#fff', border: '1px solid #e6ebf3', borderRadius: 13,
    padding: '18px 14px 14px', boxShadow: '0 1px 2px rgba(1,33,88,.04)', overflow: 'hidden', opacity: live ? 1 : 0.6, textDecoration: 'none',
    transition: 'transform .14s, box-shadow .14s, border-color .14s' };
  const hover = (e, on) => { if (!live) return; e.currentTarget.style.transform = on ? 'translateY(-2px)' : 'none'; e.currentTarget.style.boxShadow = on ? '0 6px 18px rgba(1,33,88,.10)' : '0 1px 2px rgba(1,33,88,.04)'; e.currentTarget.style.borderColor = on ? '#cfdaea' : '#e6ebf3'; };
  return live
    ? <Link to={item.to} style={base} onMouseEnter={(e) => hover(e, true)} onMouseLeave={(e) => hover(e, false)}>{body}</Link>
    : <div style={base}>{body}</div>;
}
function Stat({ label, value, grad, Icon }) {
  return (
    <div style={{ position: 'relative', borderRadius: 15, padding: '15px 17px', color: '#fff', background: grad, boxShadow: '0 6px 16px rgba(1,33,88,.10)', overflow: 'hidden' }}>
      {Icon && <div style={{ position: 'absolute', top: 14, right: 14, opacity: 0.85 }}><Icon size={19} /></div>}
      <div style={{ fontSize: '.63rem', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 700, opacity: 0.92, paddingRight: 22, lineHeight: 1.3 }}>{label}</div>
      <div style={{ fontSize: '1.7rem', fontWeight: 800, marginTop: 7, lineHeight: 1 }}>{value}</div>
    </div>
  );
}
function hexA(hex, a) {
  const h = String(hex || '#3485E9').replace('#', '');
  if (h.length < 6) return `rgba(52,133,233,${a})`;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}