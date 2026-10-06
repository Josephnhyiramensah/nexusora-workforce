import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { CalendarClock, CalendarDays, Wallet, ShieldCheck, Landmark, Percent, CalendarRange, Baby } from 'lucide-react';
import { RouteShell, Hero, KpiBand, Kpi, Body } from '../ui/kit';

const C = { navy: '#012158', blue: '#3485E9', orange: '#FD9C09', green: '#1f9d57', red: '#e5484d',
  ink: '#16233b', muted: '#8b96a9', line: '#e6ebf3', card: '#fff', ground: '#eef1f4' };

const TIMEPAY_RAIL = {
  brand: { title: 'Time & Pay', subtitle: 'Attendance to payroll', Icon: CalendarClock },
  groups: [
    { title: 'Time', items: [{ label: 'Attendance', to: '/attendance', Icon: CalendarClock }, { label: 'Leave', to: '/leave', Icon: CalendarDays }] },
    { title: 'Pay', items: [{ label: 'Payroll', to: '/payroll', Icon: Wallet }, { label: 'Compliance', to: '/compliance', Icon: ShieldCheck }] },
  ],
};

const pct = (v) => `${(Number(v || 0) * 100).toFixed(2).replace(/\.00$/, '')}%`;
const money = (v, c) => `${c || ''} ${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();

export default function CompliancePage() {
  const { user } = useAuth();
  const { t } = useLocale();
  const canEdit = user?.role === 'super_admin';

  const rail = useMemo(() => ({
    brand: { ...TIMEPAY_RAIL.brand, title: t('compliance.rail_brand'), subtitle: t('compliance.rail_sub') },
    groups: [
      { title: t('compliance.grp_time'), items: [{ label: t('home.tile.attendance'), to: '/attendance', Icon: CalendarClock }, { label: t('home.tile.leave'), to: '/leave', Icon: CalendarDays }] },
      { title: t('compliance.grp_pay'), items: [{ label: t('home.tile.payroll'), to: '/payroll', Icon: Wallet }, { label: t('home.tile.compliance'), to: '/compliance', Icon: ShieldCheck }] },
    ],
  }), [t]);

  const [pack, setPack] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try { const { data } = await api.get('/compliance'); if (alive) setPack(data); }
      catch (e) { if (alive) setMsg(e?.response?.data?.message || t('compliance.errLoad')); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  function startEdit() {
    setDraft({
      brackets: (pack?.incomeTax?.brackets || []).map((b) => ({ upTo: b.upTo ?? '', rate: (Number(b.rate) * 100).toString() })),
      contributions: (pack?.socialSecurity?.contributions || []).map((s) => ({ name: s.name || '', base: s.base || 'basic', employeeRate: (Number(s.employeeRate) * 100).toString(), employerRate: (Number(s.employerRate) * 100).toString(), ceiling: s.ceiling ?? '' })),
      minWage: pack?.minimumWage?.amount ?? '', minWagePeriod: pack?.minimumWage?.period || 'day',
      annualLeaveDays: pack?.leave?.annual?.[0]?.days ?? '', maternityWeeks: pack?.leave?.maternityWeeks ?? '', note: '',
    });
    setEditing(true); setMsg('');
  }

  async function save() {
    setSaving(true); setMsg('');
    try {
      const overrides = {
        incomeTax: { brackets: draft.brackets.map((b) => ({ upTo: b.upTo === '' || b.upTo === null ? null : Number(b.upTo), rate: Number(b.rate) / 100 })) },
        socialSecurity: { contributions: draft.contributions.map((s) => ({ name: s.name, base: s.base, employeeRate: Number(s.employeeRate) / 100, employerRate: Number(s.employerRate) / 100, ceiling: s.ceiling === '' ? null : Number(s.ceiling) })) },
        minimumWage: { amount: Number(draft.minWage), period: draft.minWagePeriod, currency: pack?.currency },
        leave: { annual: [{ minMonths: 12, days: Number(draft.annualLeaveDays) }], maternityWeeks: Number(draft.maternityWeeks) },
      };
      const { data } = await api.put('/compliance', { overrides, note: draft.note || 'Updated via Compliance screen' });
      setPack(data.pack); setEditing(false); setMsg(t('compliance.savedMsg'));
    } catch (e) { setMsg(e?.response?.data?.message || t('compliance.errSave')); }
    finally { setSaving(false); }
  }

  if (loading) return <RouteShell brand={rail.brand} groups={rail.groups}><Body><div style={{ color: C.muted, padding: 8 }}>{t('common.loading')}</div></Body></RouteShell>;
  if (!pack) return <RouteShell brand={rail.brand} groups={rail.groups}><Body><div style={{ color: C.red, padding: 8 }}>{msg || t('compliance.noPack')}</div></Body></RouteShell>;

  const topRate = Math.max(0, ...(pack.incomeTax?.brackets || []).map((b) => Number(b.rate) || 0));

  return (
    <RouteShell brand={rail.brand} groups={rail.groups}>
      <Hero crumbs={[t('compliance.rail_brand'), t('compliance.crumb')]} title={t('compliance.title')}
        actions={<>
          {canEdit && !editing && <button onClick={startEdit} style={heroBtn(C.navy)}>{t('compliance.editRates')}</button>}
          {editing && <><button onClick={() => setEditing(false)} style={heroGhost()}>{t('common.cancel')}</button><button onClick={save} disabled={saving} style={{ ...heroBtn(C.green), opacity: saving ? 0.6 : 1 }}>{saving ? t('common.saving') : t('compliance.saveChanges')}</button></>}
        </>} />
      <KpiBand>
        <Kpi Icon={Landmark} label={t('compliance.kpi_minWage')} value={money(pack.minimumWage?.amount, pack.currency)} foot={<span>{t('compliance.perPeriod', { period: pack.minimumWage?.period || 'day' })}</span>} />
        <Kpi Icon={Percent} iconColor={C.orange} iconBg="#fdf0dc" label={t('compliance.kpi_topPaye')} value={pct(topRate)} foot={<span>{t('compliance.kpi_topPaye_foot')}</span>} />
        <Kpi Icon={CalendarRange} iconColor={C.green} iconBg="#e7f6ee" label={t('compliance.kpi_annualLeave')} value={pack.leave?.annual?.[0]?.days ?? '—'} unit={t('compliance.unit_days')} foot={<span>{t('compliance.kpi_annual_foot')}</span>} />
        <Kpi Icon={Baby} iconColor={C.navy} iconBg="#eef1f6" label={t('compliance.kpi_maternity')} value={pack.leave?.maternityWeeks ?? '—'} unit={t('compliance.unit_wks')} foot={<span>{t('compliance.kpi_maternity_foot')}</span>} />
      </KpiBand>
      <Body>
        <div style={{ minWidth: 0 }}>
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {pack._source === 'db-override'
              ? <span style={{ background: '#fdf0dc', color: '#b8760a', padding: '4px 12px', borderRadius: 999, fontSize: '.74rem', fontWeight: 700 }}>{t('compliance.customised')}</span>
              : <span style={{ background: '#e6f1fd', color: '#1f6fd6', padding: '4px 12px', borderRadius: 999, fontSize: '.74rem', fontWeight: 700 }}>{t('compliance.defaultPack')}</span>}
            {pack.verifiedAgainst && <span style={{ color: C.muted, fontSize: '.8rem' }}>{t('compliance.source', { source: pack.verifiedAgainst })}{pack.verifiedOn ? ` ${t('compliance.checked', { date: pack.verifiedOn })}` : ''}</span>}
          </div>

          {msg && <div style={{ background: '#eaf5ff', border: '1px solid #cfe6fb', color: '#0b4a8f', padding: '10px 13px', borderRadius: 10, fontSize: '.88rem', marginBottom: 16 }}>{msg}</div>}

          {pack.isTemplate && (
            <div style={{ background: '#fdecec', border: '1px solid #f6c9cb', color: '#8f1d18', padding: '12px 15px', borderRadius: 10, fontSize: '.9rem', marginBottom: 16, fontWeight: 600 }}>
              {t('compliance.notConfigured', { country: pack.countryName })}{canEdit ? '' : t('compliance.blockedByAdmin')}
            </div>
          )}
          {!canEdit && <div style={{ background: '#f7f9fc', border: `1px solid ${C.line}`, color: C.muted, padding: '10px 13px', borderRadius: 10, fontSize: '.86rem', marginBottom: 16 }}>{t('compliance.viewOnly')}</div>}

          <Section title={t('compliance.sec_paye')}>
            <table style={tbl()}>
              <thead><tr><Th>{t('compliance.th_upTo')}</Th><Th>{t('compliance.th_rate')}</Th></tr></thead>
              <tbody>
                {(editing ? draft.brackets : pack.incomeTax?.brackets || []).map((b, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${C.line}` }}>
                    <Td>{editing ? <input value={b.upTo} placeholder={t('compliance.ph_noLimit')} onChange={(e) => updArr(setDraft, 'brackets', i, 'upTo', e.target.value)} style={inp()} /> : (b.upTo === null ? t('compliance.abovePrevious') : money(b.upTo, pack.currency))}</Td>
                    <Td>{editing ? <input value={b.rate} onChange={(e) => updArr(setDraft, 'brackets', i, 'rate', e.target.value)} style={{ ...inp(), width: 90 }} /> : pct(b.rate)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title={t('compliance.sec_social')}>
            <table style={tbl()}>
              <thead><tr><Th>{t('compliance.th_scheme')}</Th><Th>{t('compliance.th_employee')}</Th><Th>{t('compliance.th_employer')}</Th><Th>{t('compliance.th_ceiling')}</Th></tr></thead>
              <tbody>
                {(editing ? draft.contributions : pack.socialSecurity?.contributions || []).map((s, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${C.line}` }}>
                    <Td>{editing ? <input value={s.name} onChange={(e) => updArr(setDraft, 'contributions', i, 'name', e.target.value)} style={inp()} /> : s.name}</Td>
                    <Td>{editing ? <input value={s.employeeRate} onChange={(e) => updArr(setDraft, 'contributions', i, 'employeeRate', e.target.value)} style={{ ...inp(), width: 90 }} /> : pct(s.employeeRate)}</Td>
                    <Td>{editing ? <input value={s.employerRate} onChange={(e) => updArr(setDraft, 'contributions', i, 'employerRate', e.target.value)} style={{ ...inp(), width: 90 }} /> : pct(s.employerRate)}</Td>
                    <Td>{editing ? <input value={s.ceiling} placeholder={t('compliance.ph_none')} onChange={(e) => updArr(setDraft, 'contributions', i, 'ceiling', e.target.value)} style={inp()} /> : (s.ceiling ? money(s.ceiling, pack.currency) : '—')}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {editing && <div style={{ color: C.muted, fontSize: '.8rem', marginTop: 8 }}>{t('compliance.ratesHint')}</div>}
          </Section>

          <Section title={t('compliance.sec_minwage')}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16 }}>
              <Field label={t('compliance.f_minWage', { period: editing ? draft.minWagePeriod : pack.minimumWage?.period || 'day' })}>{editing ? <input value={draft.minWage} onChange={(e) => setDraft((d) => ({ ...d, minWage: e.target.value }))} style={inp()} /> : money(pack.minimumWage?.amount, pack.currency)}</Field>
              <Field label={t('compliance.f_annualLeave')}>{editing ? <input value={draft.annualLeaveDays} onChange={(e) => setDraft((d) => ({ ...d, annualLeaveDays: e.target.value }))} style={inp()} /> : (pack.leave?.annual?.[0]?.days ?? '—')}</Field>
              <Field label={t('compliance.f_maternity')}>{editing ? <input value={draft.maternityWeeks} onChange={(e) => setDraft((d) => ({ ...d, maternityWeeks: e.target.value }))} style={inp()} /> : (pack.leave?.maternityWeeks ?? '—')}</Field>
            </div>
            {editing && <div style={{ marginTop: 14 }}><Field label={t('compliance.f_note')}><input value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} placeholder={t('compliance.ph_note')} style={{ ...inp(), width: '100%' }} /></Field></div>}
          </Section>

          <div style={{ color: C.muted, fontSize: '.8rem', marginTop: 20, lineHeight: 1.6 }}>{t('compliance.footerNote')}</div>
        </div>
      </Body>
    </RouteShell>
  );
}

function updArr(setDraft, key, idx, field, value) { setDraft((d) => ({ ...d, [key]: d[key].map((row, i) => (i === idx ? { ...row, [field]: value } : row)) })); }
function Section({ title, children }) {
  return <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: '0 1px 2px rgba(1,33,88,.05)', padding: 18, marginBottom: 18, overflowX: 'auto' }}>
    <div style={{ fontSize: '.74rem', textTransform: 'uppercase', letterSpacing: '.09em', color: C.blue, fontWeight: 700, marginBottom: 12 }}>{title}</div>{children}
  </div>;
}
function Field({ label, children }) { return <div><div style={{ fontSize: '.72rem', color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700, marginBottom: 6 }}>{label}</div><div style={{ fontSize: '1.05rem', fontWeight: 700, color: C.navy }}>{children}</div></div>; }
function Th({ children }) { return <th style={{ textAlign: 'left', padding: '11px 14px', background: '#fafbfd', color: C.navy, fontWeight: 700, fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>{children}</th>; }
function Td({ children }) { return <td style={{ padding: '11px 14px', fontSize: '.9rem' }}>{children}</td>; }
function tbl() { return { width: '100%', borderCollapse: 'collapse' }; }
function inp() { return { padding: '7px 10px', border: '1px solid #d8e0ec', borderRadius: 8, fontSize: '.88rem', width: 140, fontFamily: 'inherit' }; }
function heroBtn(bg) { return { padding: '10px 16px', border: 'none', borderRadius: 10, background: bg, color: '#fff', fontWeight: 700, fontSize: '.83rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(1,33,88,.2)' }; }
function heroGhost() { return { padding: '10px 16px', border: '1px solid rgba(255,255,255,.9)', borderRadius: 10, background: 'rgba(255,255,255,.72)', color: C.navy, fontWeight: 700, fontSize: '.83rem', cursor: 'pointer' }; }