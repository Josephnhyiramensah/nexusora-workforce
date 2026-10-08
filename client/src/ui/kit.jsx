/* =====================================================================
   Nexusora Workforce — shared UI components (design system).
   This file exports COMPONENTS ONLY. Tokens/helpers/style objects live
   in ./tokens.js and the data hook in ./hooks.js, so Fast Refresh works.
   ===================================================================== */
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, ChevronLeft, CheckCircle2, Menu } from 'lucide-react';
import {
  C, NUM, FONT, PILL, initials, fullName, cap, gradOf,
  inp, primaryBtn, ghostBtn, thBase,
} from './tokens';

/* --------------------------- GLOBAL CSS --------------------------- */
export function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      *{box-sizing:border-box}
      /* White-label brand tokens. Defaults match the stock palette; the
         BrandStyle component overrides these from the tenant's branding. */
      :root{--nx-brand:${C.navy};--nx-brand-2:#0b3f96;--nx-accent:${C.accent};}
      body{margin:0;font-family:${FONT};color:${C.ink};background:${C.ground}}
      .nx-scroll::-webkit-scrollbar{width:10px;height:10px}
      .nx-scroll::-webkit-scrollbar-thumb{background:#d3dbe6;border-radius:8px;border:2px solid #fff}
      button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid ${C.accent};outline-offset:1px}
      .nx-row:hover{background:#f7faff}
      .nx-kpi .nx-kpi-arrow{opacity:.4;transition:opacity .15s}
      .nx-kpi:hover{box-shadow:0 10px 26px rgba(1,33,88,.14);transform:translateY(-2px)}
      .nx-kpi:hover .nx-kpi-arrow{opacity:1}
      /* ---- responsive shell: rail becomes a slide-in drawer on mobile ---- */
      .nx-railbar{display:none}
      @media (max-width:900px){
        .nx-shell{flex-direction:column}
        .nx-railbar{display:flex}
        .nx-rail{position:fixed!important;top:0!important;left:0;bottom:0;height:100vh!important;width:272px!important;z-index:130;transform:translateX(-100%);transition:transform .22s ease;box-shadow:0 24px 60px rgba(1,33,88,.3)}
        .nx-rail.nx-open{transform:translateX(0)}
        .nx-rail-backdrop{position:fixed;inset:0;background:rgba(1,33,88,.42);z-index:125}
        .nx-primary-nav{display:none!important}
        .nx-topsearch{display:none!important}
      }
      @media (max-width:460px){ .nx-brand-text{display:none!important} }
    `}</style>
  );
}

/* ------------------------------ RAIL ------------------------------ */
/* Mobile-only bar with a hamburger that opens the rail drawer. */
function RailBar({ brand, onOpen }) {
  const BrandIcon = brand?.Icon;
  return (
    <div className="nx-railbar" style={{ position: 'sticky', top: 58, zIndex: 40, alignItems: 'center', gap: 12, padding: '10px 16px', background: '#fff', borderBottom: `1px solid ${C.line}` }}>
      <button onClick={onOpen} aria-label="Open menu" style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 9, border: `1px solid ${C.line}`, background: '#fff', color: C.navy, cursor: 'pointer' }}><Menu size={18} /></button>
      {brand && <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, flex: 'none', background: 'linear-gradient(135deg,#012158,#0b3f96)', display: 'grid', placeItems: 'center' }}>{BrandIcon && <BrandIcon size={16} color="#fff" />}</div>
        <div style={{ fontWeight: 800, color: C.navy, fontSize: '.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{brand.title}</div>
      </div>}
    </div>
  );
}

export function ModuleRail({ brand, groups, active, onSelect, open }) {
  const BrandIcon = brand?.Icon;
  return (
    <aside className={'nx-rail nx-scroll' + (open ? ' nx-open' : '')} style={{ width: 248, flexShrink: 0, background: '#fff', borderRight: `1px solid ${C.line}`, padding: '20px 14px', position: 'sticky', top: 58, height: 'calc(100vh - 58px)', overflow: 'auto' }}>
      {brand && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '4px 8px 16px' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, flex: 'none', background: 'linear-gradient(135deg,#012158,#0b3f96)', display: 'grid', placeItems: 'center' }}>{BrandIcon && <BrandIcon size={20} color="#fff" />}</div>
          <div style={{ lineHeight: 1.15 }}><div style={{ fontWeight: 800, color: C.navy, fontSize: '.92rem' }}>{brand.title}</div>{brand.subtitle && <div style={{ fontWeight: 600, color: C.muted2, fontSize: '.66rem', marginTop: 2 }}>{brand.subtitle}</div>}</div>
        </div>
      )}
      {groups.map((g) => (
        <div key={g.title}>
          <div style={{ fontSize: '.64rem', fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: C.muted2, padding: '16px 10px 7px' }}>{g.title}</div>
          {g.items.map((it) => { const on = active === it.key; const Icon = it.Icon; return (
            <button key={it.key} onClick={() => onSelect(it.key)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', borderRadius: 9, border: 'none', borderLeft: `3px solid ${on ? C.accent : 'transparent'}`, cursor: 'pointer', textAlign: 'left', marginBottom: 2, background: on ? '#eef4ff' : 'transparent', color: on ? C.navy : C.muted, fontWeight: on ? 700 : 600, fontSize: '.86rem' }}>
              {Icon && <Icon size={17} />} <span style={{ flex: 1 }}>{it.label}</span>
              {it.count ? <span style={{ ...NUM, fontSize: '.7rem', fontWeight: 700, color: C.muted2, background: C.greyBg, borderRadius: 999, padding: '1px 8px' }}>{it.count}</span> : null}
            </button>
          ); })}
        </div>
      ))}
    </aside>
  );
}

export function ModuleShell({ brand, groups, active, onSelect, children }) {
  const [open, setOpen] = useState(false);
  const pick = (k) => { onSelect(k); setOpen(false); };
  return (
    <div className="nx-shell" style={{ display: 'flex', alignItems: 'stretch', minHeight: 'calc(100vh - 58px)' }}>
      {open && <div className="nx-rail-backdrop" onClick={() => setOpen(false)} />}
      <ModuleRail brand={brand} groups={groups} active={active} onSelect={pick} open={open} />
      <main className="nx-main" style={{ flex: 1, minWidth: 0, background: C.ground, paddingBottom: 56 }}>
        <RailBar brand={brand} onOpen={() => setOpen(true)} />
        {children}
      </main>
    </div>
  );
}

/* Route-linked rail — items navigate between sibling pages (react-router).
   groups: [{ title, items:[{ label, to, Icon, count }] }] */
export function NavRail({ brand, groups, open, onNavigate }) {
  const loc = useLocation();
  const BrandIcon = brand?.Icon;
  const isOn = (to) => to === '/' ? loc.pathname === '/' : loc.pathname === to || loc.pathname.startsWith(to + '/');
  return (
    <aside className={'nx-rail nx-scroll' + (open ? ' nx-open' : '')} style={{ width: 248, flexShrink: 0, background: '#fff', borderRight: `1px solid ${C.line}`, padding: '20px 14px', position: 'sticky', top: 58, height: 'calc(100vh - 58px)', overflow: 'auto' }}>
      {brand && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '4px 8px 16px' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, flex: 'none', background: 'linear-gradient(135deg,#012158,#0b3f96)', display: 'grid', placeItems: 'center' }}>{BrandIcon && <BrandIcon size={20} color="#fff" />}</div>
          <div style={{ lineHeight: 1.15 }}><div style={{ fontWeight: 800, color: C.navy, fontSize: '.92rem' }}>{brand.title}</div>{brand.subtitle && <div style={{ fontWeight: 600, color: C.muted2, fontSize: '.66rem', marginTop: 2 }}>{brand.subtitle}</div>}</div>
        </div>
      )}
      {groups.map((g) => (
        <div key={g.title}>
          <div style={{ fontSize: '.64rem', fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: C.muted2, padding: '16px 10px 7px' }}>{g.title}</div>
          {g.items.map((it) => { const on = isOn(it.to); const Icon = it.Icon; return (
            <Link key={it.to} to={it.to} onClick={onNavigate} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', borderRadius: 9, textDecoration: 'none', borderLeft: `3px solid ${on ? C.accent : 'transparent'}`, marginBottom: 2, background: on ? '#eef4ff' : 'transparent', color: on ? C.navy : C.muted, fontWeight: on ? 700 : 600, fontSize: '.86rem' }}>
              {Icon && <Icon size={17} />} <span style={{ flex: 1 }}>{it.label}</span>
              {it.count ? <span style={{ ...NUM, fontSize: '.7rem', fontWeight: 700, color: C.muted2, background: C.greyBg, borderRadius: 999, padding: '1px 8px' }}>{it.count}</span> : null}
            </Link>
          ); })}
        </div>
      ))}
    </aside>
  );
}

export function RouteShell({ brand, groups, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="nx-shell" style={{ display: 'flex', alignItems: 'stretch', minHeight: 'calc(100vh - 58px)' }}>
      {open && <div className="nx-rail-backdrop" onClick={() => setOpen(false)} />}
      <NavRail brand={brand} groups={groups} open={open} onNavigate={() => setOpen(false)} />
      <main className="nx-main" style={{ flex: 1, minWidth: 0, background: C.ground, paddingBottom: 56 }}>
        <RailBar brand={brand} onOpen={() => setOpen(true)} />
        {children}
      </main>
    </div>
  );
}

/* ------------------------- HERO + KPI BAND ------------------------ */
export function Hero({ crumbs = [], title, subtitle, actions }) {
  return (
    <section style={{ background: 'radial-gradient(1200px 220px at 88% -40%, rgba(22,142,255,.18), transparent 60%), linear-gradient(120deg,' + C.hero1 + ' 0%,' + C.hero2 + ' 46%,' + C.hero3 + ' 100%)', padding: '24px 32px 74px', position: 'relative', overflow: 'hidden' }}>
      {crumbs.length > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#2b4a74', fontSize: '.76rem', fontWeight: 600 }}>{crumbs.map((c, i) => <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, opacity: i === crumbs.length - 1 ? 1 : .85 }}>{i > 0 && <ChevronRight size={13} />}{c}</span>)}</div>}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginTop: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.68rem', fontWeight: 800, color: '#062a55', letterSpacing: '-.02em', textWrap: 'balance' }}>{title}</h1>
          {subtitle && <p style={{ margin: '7px 0 0', color: '#28466f', fontSize: '.9rem', maxWidth: '58ch' }}>{subtitle}</p>}
        </div>
        {actions && <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>{actions}</div>}
      </div>
    </section>
  );
}
export function SubHero({ onBack, backLabel, crumbs = [], title, statusEl, meta }) {
  return (
    <section style={{ background: 'linear-gradient(120deg,' + C.hero1 + ' 0%,' + C.hero2 + ' 55%,' + C.hero3 + ' 100%)', padding: '20px 32px 66px', position: 'relative' }}>
      {onBack && <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.8)', border: '1px solid rgba(255,255,255,.9)', borderRadius: 9, padding: '7px 13px', fontWeight: 700, fontSize: '.8rem', color: C.navy, cursor: 'pointer', marginBottom: 12 }}><ChevronLeft size={15} /> {backLabel}</button>}
      {crumbs.length > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#2b4a74', fontSize: '.76rem', fontWeight: 600, marginBottom: 8 }}>{crumbs.map((c, i) => <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{i > 0 && <ChevronRight size={13} />}{c}</span>)}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ ...NUM, margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#062a55', letterSpacing: '-.02em' }}>{title}</h1>
        {statusEl}
        {meta && <span style={{ color: '#28466f', fontSize: '.86rem' }}>{meta}</span>}
      </div>
    </section>
  );
}
export function KpiBand({ children }) {
  return <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16, padding: '0 32px', marginTop: -50, position: 'relative', zIndex: 5 }}>{children}</section>;
}
export function Kpi({ Icon, iconColor = C.accentInk, iconBg = '#e6f1fd', pill, label, value, unit, foot, onClick }) {
  const inner = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: iconBg, color: iconColor, display: 'grid', placeItems: 'center' }}>{Icon && <Icon size={17} />}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{pill && <Pill tone={pill[1]}>{pill[0]}</Pill>}{onClick && <ChevronRight size={16} className="nx-kpi-arrow" style={{ color: C.muted2 }} />}</div>
      </div>
      <div style={{ fontSize: '.7rem', fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: C.muted, marginTop: 14 }}>{label}</div>
      <div style={{ ...NUM, fontSize: '1.6rem', fontWeight: 800, color: C.navy, marginTop: 3, letterSpacing: '-.02em' }}>{value}{unit && <span style={{ fontSize: '.86rem', fontWeight: 700, color: C.muted2 }}>{unit}</span>}</div>
      {foot && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9, fontSize: '.74rem', fontWeight: 600, color: C.muted }}>{foot}</div>}
    </>
  );
  const base = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '16px 18px', boxShadow: '0 6px 20px rgba(1,33,88,.09)' };
  if (onClick) return <button type="button" onClick={onClick} className="nx-kpi" style={{ ...base, textAlign: 'left', width: '100%', cursor: 'pointer', fontFamily: FONT, transition: 'box-shadow .15s, transform .15s' }}>{inner}</button>;
  return <div style={base}>{inner}</div>;
}
export function Body({ children, cols }) {
  return <section style={{ padding: '26px 32px 0', display: 'grid', gridTemplateColumns: cols || '1fr', gap: 22, alignItems: 'start' }}>{children}</section>;
}
/* Segmented control — in-page tabs. items: [[key,label], …] */
export function Segmented({ items, active, onSelect }) {
  return (
    <div style={{ display: 'inline-flex', gap: 2, background: '#e9eff8', borderRadius: 10, padding: 4, flexWrap: 'wrap' }}>
      {items.map(([k, l]) => { const on = active === k; return (
        <button key={k} onClick={() => onSelect(k)} style={{ border: 'none', cursor: 'pointer', background: on ? '#fff' : 'transparent', color: on ? C.navy : C.muted, fontWeight: on ? 700 : 600, fontSize: '.84rem', padding: '8px 15px', borderRadius: 7, boxShadow: on ? '0 1px 3px rgba(1,33,88,.14)' : 'none', fontFamily: FONT }}>{l}</button>
      ); })}
    </div>
  );
}

/* ------------------------------ ATOMS ----------------------------- */
export function Pill({ tone: tn = 'grey', children }) {
  const [fg, bg] = PILL[tn] || PILL.grey;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 999, color: fg, background: bg, whiteSpace: 'nowrap' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />{children}</span>;
}
export function StatusPill({ map, k }) { const t = map[k] || [cap(k), 'grey']; return <Pill tone={t[1]}>{t[0]}</Pill>; }
export function EmpCell({ e, fallback, size = 32 }) {
  const name = fullName(e) !== '—' ? fullName(e) : (fallback || '—');
  const role = e?.jobTitle || e?.position || e?.department?.name || e?.department || '';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
      <span style={{ width: size, height: size, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: '.72rem', background: gradOf(name) }}>{initials(name)}</span>
      <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, color: C.ink, lineHeight: 1.15, whiteSpace: 'nowrap' }}>{name}</div>{role ? <div style={{ fontSize: '.72rem', color: C.muted2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{role}</div> : null}</div>
    </div>
  );
}
export function Progress({ pct, note, width = 108 }) {
  return <div><div style={{ height: 6, borderRadius: 999, background: C.greyBg, overflow: 'hidden', width }}><span style={{ display: 'block', height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, borderRadius: 999, background: `linear-gradient(90deg,#2bb673,${C.green})` }} /></div>{note && <span style={{ ...NUM, fontSize: '.72rem', fontWeight: 600, color: C.muted, display: 'block', marginTop: 5 }}>{note}</span>}</div>;
}
export function HeroBtn({ children, Icon, ghost, onClick, type = 'button' }) {
  const base = { display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 10, fontWeight: 700, fontSize: '.83rem', padding: '10px 16px', cursor: 'pointer', border: '1px solid transparent', whiteSpace: 'nowrap', fontFamily: FONT };
  const style = ghost ? { ...base, background: 'rgba(255,255,255,.72)', color: C.navy, borderColor: 'rgba(255,255,255,.9)' } : { ...base, background: C.navy, color: '#fff', boxShadow: '0 4px 14px rgba(1,33,88,.28)' };
  return <button type={type} onClick={onClick} style={style}>{Icon && <Icon size={16} />}{children}</button>;
}
export function Card({ title, sub, right, children, pad }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: '0 1px 2px rgba(1,33,88,.05)' }}>
      {(title || right) && <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 20px', borderBottom: `1px solid ${C.lineSoft}` }}>
        {title && <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: C.navy }}>{title}</h2>}
        {sub && <span style={{ fontSize: '.78rem', color: C.muted2 }}>· {sub}</span>}
        {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
      </div>}
      <div style={{ padding: pad != null ? pad : (title || right ? '14px 20px 18px' : 18) }}>{children}</div>
    </div>
  );
}
export function Info({ label, value, strong }) { return <div><div style={{ fontSize: '.64rem', color: C.muted2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{label}</div><div style={{ ...NUM, fontSize: strong ? '1.02rem' : '.92rem', color: strong ? C.navy : C.ink, fontWeight: strong ? 800 : 600 }}>{value}</div></div>; }
export function MiniStat({ label, value, color }) { return <div style={{ flex: 1, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: '9px 11px' }}><div style={{ fontSize: '.6rem', color: C.muted2, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.04em' }}>{label}</div><div style={{ ...NUM, fontSize: '.95rem', fontWeight: 800, color, marginTop: 2 }}>{value}</div></div>; }
export function Empty({ children }) { return <div style={{ color: C.muted2, fontSize: '.85rem', padding: '18px 2px' }}>{children}</div>; }
export function Banner({ children, onClose, tone: tn = 'blue' }) {
  const map = { blue: ['#eaf5ff', '#cfe6fb', '#0b4a8f'], green: [C.greenBg, '#bfe6cf', '#12703f'], red: [C.redBg, '#f6c9cb', '#a8262a'] };
  const [bg, bd, fg] = map[tn] || map.blue;
  return <div style={{ background: bg, borderBottom: `1px solid ${bd}`, color: fg, padding: '11px 32px', fontSize: '.88rem', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><CheckCircle2 size={16} /> {children}</span>{onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', color: fg, cursor: 'pointer', fontWeight: 800, fontSize: '1.1rem', lineHeight: 1 }}>×</button>}</div>;
}

/* ------------------------------ TABLES ---------------------------- */
export function TableWrap({ head, children, flush = true }) {
  return <div className="nx-scroll" style={{ overflowX: 'auto', margin: flush ? '0 -20px -18px' : 0, borderTop: `1px solid ${C.lineSoft}` }}>
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr>{head.map((h, i) => <th key={i} style={{ ...thBase, textAlign: h[1] === 'r' ? 'right' : 'left' }}>{h[0]}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>;
}
export function MiniTable({ head, children }) {
  return <table style={{ width: '100%', borderCollapse: 'collapse' }}>
    <thead><tr>{head.map((h, i) => <th key={i} style={{ ...thBase, background: 'transparent', textAlign: h[1] === 'r' ? 'right' : 'left' }}>{h[0]}</th>)}</tr></thead>
    <tbody>{children}</tbody>
  </table>;
}

/* ------------------------------ FORMS ----------------------------- */
export function Overlay({ children, onClose, title, width = 520 }) {
  return <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(1,33,88,.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'start center', padding: '40px 20px', zIndex: 60, overflowY: 'auto' }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: width, background: '#fff', borderRadius: 16, boxShadow: '0 18px 44px rgba(1,33,88,.3)', overflow: 'hidden' }}>
      <div style={{ background: 'linear-gradient(120deg,' + C.hero1 + ',' + C.hero3 + ')', padding: '16px 24px' }}><h2 style={{ margin: 0, color: C.navy, fontSize: '1.12rem', fontWeight: 800 }}>{title}</h2></div>
      <div style={{ padding: 24 }}>{children}</div>
    </div>
  </div>;
}
export function Field({ label, value, onChange, type = 'text', placeholder }) { return <label style={{ display: 'block', marginBottom: 12 }}><Lbl>{label}</Lbl><input type={type} value={value ?? ''} placeholder={placeholder || ''} onChange={(e) => onChange(e.target.value)} style={inp} /></label>; }
export function Sel({ label, value, onChange, options }) { return <label style={{ display: 'block', marginBottom: 12 }}><Lbl>{label}</Lbl><select value={value} onChange={(e) => onChange(e.target.value)} style={inp}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>; }
export function Row2({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>; }
export function Lbl({ children }) { return <div style={{ fontSize: '.68rem', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>{children}</div>; }
export function Actions({ onClose, onSubmit, busy, label }) { return <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}><button onClick={onClose} style={ghostBtn}>Cancel</button><button onClick={onSubmit} disabled={busy} style={primaryBtn}>{busy ? 'Saving…' : label}</button></div>; }
export function ErrBox({ children }) { return <div style={{ background: C.redBg, border: '1px solid #f6c9cb', color: C.red, padding: '9px 12px', borderRadius: 9, fontSize: '.84rem', marginBottom: 12 }}>{children}</div>; }
export function Select({ value, onChange, children }) { return <select value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: '8px 11px', border: `1px solid ${C.line}`, borderRadius: 9, background: '#fff', color: C.ink, fontSize: '.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>{children}</select>; }