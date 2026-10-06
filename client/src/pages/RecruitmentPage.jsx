import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { UserPlus, ClipboardCheck, Briefcase, Users, Award, Clock, Plus, FileDown, ChevronRight } from 'lucide-react';
import { RouteShell, Hero, SubHero, KpiBand, Kpi, Body, HeroBtn } from '../ui/kit';

const C = { navy: '#012158', blue: '#3485E9', orange: '#FD9C09', green: '#1f9d57', red: '#e5484d',
  purple: '#7c5cdf', teal: '#17a2b8', ink: '#16233b', muted: '#8a94a6', muted2: '#8a94a6', line: '#e5e8ec', ground: '#eef1f4', panel: '#f7f9fc' };

const HIRE_RAIL = {
  brand: { title: 'Hire & Onboard', subtitle: 'Recruit to day one', Icon: UserPlus },
  groups: [{ title: 'Pipeline', items: [
    { label: 'Recruitment', to: '/recruitment', Icon: UserPlus },
    { label: 'Onboarding', to: '/onboarding', Icon: ClipboardCheck },
  ] }],
};

const STAGES = [
  { key: 'applied', label: 'Applied', color: C.muted },
  { key: 'screening', label: 'Screening', color: C.blue },
  { key: 'shortlisted', label: 'Shortlisted', color: C.purple },
  { key: 'interview', label: 'Interview', color: C.orange },
  { key: 'offer', label: 'Offer', color: C.teal },
  { key: 'hired', label: 'Hired', color: C.green },
];
const stageMeta = (k) => STAGES.find((s) => s.key === k) || { label: k, color: C.muted };
const EMP_TYPES = ['permanent', 'contract', 'casual', 'seasonal', 'probation'];
const WORKER_CLASSES = ['staff', 'field_worker', 'tapper', 'operator'];
const VAC_STATUS = ['draft', 'pending_approval', 'open', 'on_hold', 'closed', 'filled'];
const money = (n, c) => (n == null || n === '') ? '—' : `${c || ''} ${Number(n).toLocaleString()}`.trim();
const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const daysSince = (d) => { if (!d) return null; const ms = Date.now() - new Date(d).getTime(); return ms > 0 ? Math.floor(ms / 864e5) : 0; };

export default function RecruitmentPage() {
  const { user, tenant } = useAuth();
  const canWrite = ['super_admin', 'hr_manager', 'hr_officer'].includes(user?.role);
  const canHire = ['super_admin', 'hr_manager'].includes(user?.role);

  const [vacancies, setVacancies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [depts, setDepts] = useState([]);
  const [positions, setPositions] = useState([]);
  const [vacModal, setVacModal] = useState(null);
  const [msg, setMsg] = useState('');
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try { const { data } = await api.get('/recruitment/vacancies'); if (alive) setVacancies(data.items || []); }
      catch { if (alive) setVacancies([]); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [reload]);

  useEffect(() => {
    (async () => {
      try { const { data } = await api.get('/org'); setDepts(data.items || []); } catch { /* optional */ }
      try { const { data } = await api.get('/positions'); setPositions(data.items || []); } catch { /* optional */ }
    })();
  }, []);

  if (selected) {
    return <VacancyDetail vacancyId={selected} onBack={() => { setSelected(null); refresh(); }}
      canWrite={canWrite} canHire={canHire} positions={positions} tenant={tenant} setMsg={setMsg} msg={msg} />;
  }

  const openCount = vacancies.filter((v) => v.status === 'open').length;
  const totalApplicants = vacancies.reduce((a, v) => a + (v.applicants?.total || 0), 0);
  const totalShortlisted = vacancies.reduce((a, v) => a + (v.applicants?.shortlisted || 0), 0);
  const totalHired = vacancies.reduce((a, v) => a + (v.applicants?.hired || 0), 0);
  const totalOpenings = vacancies.reduce((a, v) => a + (v.openings || 1), 0);

  return (
    <RouteShell brand={HIRE_RAIL.brand} groups={HIRE_RAIL.groups}>
      <style>{STYLES}</style>
      <Hero crumbs={['Hire & Onboard', 'Recruitment']} title="Recruitment"
       
        actions={canWrite && <HeroBtn Icon={Plus} onClick={() => setVacModal({ mode: 'add' })}>New vacancy</HeroBtn>} />
      <KpiBand>
        <Kpi Icon={Briefcase} label="Open vacancies" value={loading ? '—' : openCount} pill={!loading ? [`${totalOpenings} openings`, 'blue'] : null} foot={<span>actively hiring</span>} />
        <Kpi Icon={Users} iconColor={C.accentInk || '#0b6fd6'} iconBg="#e6f1fd" label="Applicants" value={loading ? '—' : totalApplicants} foot={<span>across all vacancies</span>} />
        <Kpi Icon={Award} iconColor={C.purple} iconBg="#f3eefe" label="Shortlisted" value={loading ? '—' : totalShortlisted} foot={<span>advancing</span>} />
        <Kpi Icon={ClipboardCheck} iconColor={C.green} iconBg="#e7f6ee" label="Hired" value={loading ? '—' : totalHired} foot={<span>this cycle</span>} />
        <Kpi Icon={Clock} iconColor={C.amber || '#c77700'} iconBg="#fdf0dc" label="Avg time to fill" value="—" pill={['soon', 'amber']} foot={<span>activates with hire-date tracking</span>} />
      </KpiBand>
      <Body cols="minmax(0,1fr) 320px">
        <div style={{ minWidth: 0 }}>
          {msg && <Note onClose={() => setMsg('')}>{msg}</Note>}
          <div style={cardHead}>Open requisitions <span style={{ color: C.muted, fontWeight: 500, fontSize: '.8rem' }}>· {vacancies.length}</span></div>
          {loading ? <div style={{ color: C.muted, padding: 20 }}>Loading…</div>
            : vacancies.length === 0 ? <div style={emptyBox}>No vacancies yet. {canWrite && 'Click “New vacancy” to post your first opening.'}</div>
              : (
                <div className="rec-grid">
                  {vacancies.map((v) => (
                    <div key={v._id} className="rec-card" onClick={() => setSelected(v._id)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ fontWeight: 800, color: C.navy, fontSize: '1rem', lineHeight: 1.3 }}>{v.title}</div>
                        <StatusPill status={v.status} />
                      </div>
                      <div style={{ color: C.muted, fontSize: '.78rem', margin: '4px 0 12px' }}>{v.code}{v.department?.name ? ` · ${v.department.name}` : ''}{v.grade ? ` · ${v.grade}` : ''}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <MiniStat label="Openings" value={v.openings || 1} />
                        <MiniStat label="Applicants" value={v.applicants?.total || 0} />
                        <MiniStat label="Shortlisted" value={v.applicants?.shortlisted || 0} />
                        <MiniStat label="Hired" value={v.applicants?.hired || 0} accent={C.green} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={panelCard}>
            <div style={cardHead}>Pipeline snapshot</div>
            <FunnelBars data={[['Applied', totalApplicants], ['Shortlisted', totalShortlisted], ['Hired', totalHired]]} />
            <div style={{ fontSize: '.72rem', color: C.muted, marginTop: 10 }}>Aggregate across open vacancies. Full six-stage funnel is inside each vacancy.</div>
          </div>
          <div style={panelCard}>
            <div style={cardHead}>Source of hire <Sample /></div>
            <FunnelBars data={[['Referral', 8], ['Website', 5], ['Agency', 3], ['Walk-in', 2]]} color={C.teal} />
            <div style={{ fontSize: '.72rem', color: C.muted, marginTop: 10 }}>Sample layout — populates once candidate sources are tracked.</div>
          </div>
        </div>
      </Body>

      {vacModal && (
        <VacancyModal mode={vacModal.mode} vacancy={vacModal.vacancy} depts={depts} positions={positions} tenant={tenant}
          onClose={() => setVacModal(null)} onSaved={(m) => { setVacModal(null); setMsg(m); refresh(); }} />
      )}
    </RouteShell>
  );
}

/* ============================ VACANCY DETAIL / PIPELINE ============================ */
function VacancyDetail({ vacancyId, onBack, canWrite, canHire, positions, tenant, setMsg, msg }) {
  const [vacancy, setVacancy] = useState(null);
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [appModal, setAppModal] = useState(null);
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try { const { data } = await api.get(`/recruitment/vacancies/${vacancyId}`); if (alive) setVacancy(data.vacancy); } catch { /* handled below */ }
      try { const { data } = await api.get('/recruitment/applications', { params: { vacancy: vacancyId } }); if (alive) setApps(data.items || []); } catch { if (alive) setApps([]); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [vacancyId, reload]);

  const byStage = (k) => apps.filter((a) => a.stage === k);
  const rejected = apps.filter((a) => a.stage === 'rejected' || a.stage === 'withdrawn');
  const inPipeline = apps.filter((a) => !['rejected', 'withdrawn', 'hired'].includes(a.stage)).length;
  const ratings = apps.map((a) => a.rating).filter((r) => r > 0);
  const avgRating = ratings.length ? (ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1) : '—';
  const daysOpen = daysSince(vacancy?.createdAt || vacancy?.postedAt);
  const funnel = STAGES.map((st) => ({ ...st, n: byStage(st.key).length }));
  const sources = {}; apps.forEach((a) => { const s = a.source || 'Unknown'; sources[s] = (sources[s] || 0) + 1; });
  const sourceRows = Object.entries(sources).sort((a, b) => b[1] - a[1]);

  return (
    <RouteShell brand={HIRE_RAIL.brand} groups={HIRE_RAIL.groups}>
      <style>{STYLES}</style>
      <SubHero onBack={onBack} backLabel="All vacancies" crumbs={['Recruitment', vacancy ? vacancy.title : '…']}
        title={vacancy ? vacancy.title : 'Loading…'} statusEl={vacancy && <StatusPill status={vacancy.status} />}
        meta={vacancy && [vacancy.code, vacancy.department?.name, vacancy.grade ? `Grade ${vacancy.grade}` : '', vacancy.location].filter(Boolean).join(' · ')} />
      {vacancy && (
        <KpiBand>
          <Kpi Icon={Briefcase} label="Openings" value={vacancy.openings || 1} foot={<span>to fill</span>} />
          <Kpi Icon={Users} iconColor="#0b6fd6" iconBg="#e6f1fd" label="Applicants" value={apps.length} foot={<span>{inPipeline} in pipeline</span>} />
          <Kpi Icon={Award} iconColor={C.orange} iconBg="#fdf0dc" label="Avg rating" value={avgRating} unit={avgRating !== '—' ? '★' : ''} foot={<span>candidate quality</span>} />
          <Kpi Icon={Clock} iconColor={C.navy} iconBg="#eef1f6" label="Days open" value={daysOpen == null ? '—' : daysOpen} foot={<span>since posted</span>} />
        </KpiBand>
      )}
      <Body>
        <div style={{ minWidth: 0 }}>
          {msg && <Note onClose={() => setMsg('')}>{msg}</Note>}
          {loading ? <div style={{ color: C.muted, padding: 20 }}>Loading…</div> : !vacancy ? <div style={{ color: C.red, padding: 20 }}>Could not load this vacancy.</div> : (
            <>
              {(vacancy.salaryRange?.min || vacancy.salaryRange?.max) && (
                <div style={{ color: C.ink, fontSize: '.85rem', marginBottom: 14 }}>Salary band: <strong>{money(vacancy.salaryRange.min, vacancy.salaryRange.currency)} – {money(vacancy.salaryRange.max, vacancy.salaryRange.currency)}</strong></div>
              )}

              {/* funnel + source analytics */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 18, marginBottom: 20 }} className="rec-analytics">
                <div style={panelCard}>
                  <div style={cardHead}>Hiring funnel</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 4 }}>
                    {(() => { const max = Math.max(...funnel.map((f) => f.n), 1); return funnel.map((f) => (
                      <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 92, fontSize: '.78rem', color: C.ink, fontWeight: 500 }}>{f.label}</span>
                        <div style={{ flex: 1, height: 22, background: '#eef2f8', borderRadius: 6, overflow: 'hidden' }}><div style={{ width: `${(f.n / max) * 100}%`, height: '100%', background: f.color, borderRadius: 6, minWidth: f.n ? 3 : 0 }} /></div>
                        <span style={{ width: 26, textAlign: 'right', fontWeight: 800, color: C.navy, fontSize: '.82rem', fontVariantNumeric: 'tabular-nums' }}>{f.n}</span>
                      </div>
                    )); })()}
                  </div>
                </div>
                <div style={panelCard}>
                  <div style={cardHead}>Source of hire</div>
                  {sourceRows.length ? <FunnelBars data={sourceRows.map(([s, n]) => [s, n])} color={C.teal} /> : <div style={{ color: C.muted, fontSize: '.8rem', padding: '10px 0' }}>Sources appear as candidates are added with a source.</div>}
                </div>
              </div>

              {canWrite && <div style={{ marginBottom: 14 }}><button onClick={() => setAppModal('add')} style={{ ...primaryBtn(), background: C.blue }}>+ Add applicant</button></div>}

              {/* pipeline board */}
              <div className="rec-board">
                {STAGES.map((st) => {
                  const list = byStage(st.key);
                  return (
                    <div key={st.key} className="rec-col">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '2px 4px' }}>
                        <span style={{ fontWeight: 800, fontSize: '.74rem', textTransform: 'uppercase', letterSpacing: '.04em', color: st.color }}>{st.label}</span>
                        <span style={{ background: '#fff', color: C.muted, fontWeight: 700, fontSize: '.72rem', borderRadius: 999, padding: '1px 8px', border: `1px solid ${C.line}` }}>{list.length}</span>
                      </div>
                      {list.map((a) => (
                        <div key={a._id} className="rec-appcard" onClick={() => setAppModal(a._id)}>
                          <div style={{ fontWeight: 700, color: C.ink, fontSize: '.88rem' }}>{a.firstName} {a.lastName}</div>
                          {a.currentTitle && <div style={{ color: C.muted, fontSize: '.72rem', marginTop: 2 }}>{a.currentTitle}</div>}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                            <Stars value={a.rating} />
                            {a.resume?.url && <span title="Résumé attached" style={{ fontSize: '.7rem', color: C.blue }}>📎</span>}
                            {a.interviews?.length > 0 && <span title="Interviews" style={{ fontSize: '.7rem', color: C.orange }}>🎤 {a.interviews.length}</span>}
                            {daysSince(a.stageChangedAt) != null && daysSince(a.stageChangedAt) >= 7 && <span title="Aging in stage" style={{ fontSize: '.66rem', color: C.red, fontWeight: 700 }}>{daysSince(a.stageChangedAt)}d</span>}
                          </div>
                        </div>
                      ))}
                      {list.length === 0 && <div style={{ color: C.muted, fontSize: '.74rem', textAlign: 'center', padding: '14px 0' }}>—</div>}
                    </div>
                  );
                })}
              </div>

              {rejected.length > 0 && (
                <div style={{ marginTop: 18, ...panelCard }}>
                  <div style={cardHead}>Talent pool <span style={{ color: C.muted, fontWeight: 500, fontSize: '.8rem' }}>· not proceeding, {rejected.length}</span></div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                    {rejected.map((a) => (
                      <button key={a._id} onClick={() => setAppModal(a._id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f2f5f8', border: `1px solid ${C.line}`, borderRadius: 999, padding: '5px 12px', cursor: 'pointer', fontSize: '.8rem', color: C.ink, fontWeight: 600 }}>
                        {a.firstName} {a.lastName} <ChevronRight size={13} color={C.muted} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Body>

      {appModal === 'add' && <ApplicantModal mode="add" vacancyId={vacancyId} tenant={tenant} onClose={() => setAppModal(null)} onSaved={(m) => { setAppModal(null); setMsg(m); refresh(); }} />}
      {appModal && appModal !== 'add' && <ApplicantDrawer appId={appModal} vacancy={vacancy} canWrite={canWrite} canHire={canHire} positions={positions} tenant={tenant} onClose={() => { setAppModal(null); refresh(); }} onChanged={(m) => { if (m) setMsg(m); }} />}
    </RouteShell>
  );
}

/* ============================ APPLICANT DRAWER ============================ */
function ApplicantDrawer({ appId, vacancy, canWrite, canHire, positions, tenant, onClose, onChanged }) {
  const [a, setA] = useState(null);
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [iv, setIv] = useState({ round: '', date: '', mode: 'in_person', panel: '', location: '', notes: '', scoreTechnical: '', scoreCulture: '', scoreCommunication: '', recommendation: '' });
  const [offer, setOffer] = useState({ salary: '', currency: tenant?.baseCurrency || '', startDate: '', note: '' });
  const [hireForm, setHireForm] = useState({ staffId: '', positionId: '', startDate: '', salary: '' });

  const load = useCallback(async () => {
    const { data } = await api.get(`/recruitment/applications/${appId}`);
    setA(data);
    setOffer((o) => ({ ...o, salary: data.offer?.salary ?? '', currency: data.offer?.currency || tenant?.baseCurrency || '', startDate: data.offer?.startDate ? data.offer.startDate.slice(0, 10) : '', note: data.offer?.note || '' }));
    setHireForm((h) => ({ ...h, positionId: vacancy?.position || '', salary: data.offer?.salary ?? '', startDate: data.offer?.startDate ? data.offer.startDate.slice(0, 10) : '' }));
  }, [appId, tenant, vacancy]);

  useEffect(() => { let alive = true; (async () => { try { await load(); } catch { if (alive) setErr('Could not load applicant.'); } })(); return () => { alive = false; }; }, [load]);

  async function call(fn, okMsg) { setBusy(true); setErr(''); try { await fn(); await load(); if (okMsg) onChanged(okMsg); else onChanged(''); } catch (e) { setErr(e?.response?.data?.message || 'Action failed.'); } finally { setBusy(false); } }
  const moveStage = (stage) => call(() => api.post(`/recruitment/applications/${appId}/stage`, { stage }), null);
  const reject = () => { const reason = window.prompt('Reason for rejection (optional):') ?? ''; call(() => api.post(`/recruitment/applications/${appId}/stage`, { stage: 'rejected', note: reason }), 'Candidate moved to talent pool.'); };
  const addNote = () => { if (!note.trim()) return; call(() => api.post(`/recruitment/applications/${appId}/notes`, { text: note }).then(() => setNote('')), null); };
  const addInterview = () => call(() => api.post(`/recruitment/applications/${appId}/interviews`, iv).then(() => setIv({ round: '', date: '', mode: 'in_person', panel: '', location: '', notes: '', scoreTechnical: '', scoreCulture: '', scoreCommunication: '', recommendation: '' })), 'Interview added.');
  const makeOffer = () => call(() => api.post(`/recruitment/applications/${appId}/offer`, offer), 'Offer saved.');
  const doHire = () => { if (!hireForm.staffId.trim()) { setErr('A staff ID is required to hire.'); return; } call(() => api.post(`/recruitment/applications/${appId}/hire`, hireForm), 'Candidate hired and added to employee records.'); };
  async function uploadResume(e) { const file = e.target.files?.[0]; if (!file) return; const fd = new FormData(); fd.append('file', file); call(() => api.post(`/recruitment/applications/${appId}/resume`, fd), 'Résumé uploaded.'); }

  function printOffer() {
    if (!a) return;
    const b = tenant?.branding || {};
    const coName = esc(b.companyName || tenant?.name || 'Company');
    const contact = [b.address, b.phone, b.email, b.website].filter(Boolean).map(esc).join(' &middot; ');
    const header = b.letterhead
      ? `<div class="lh"><img src="${b.letterhead}"/><div class="accent"></div></div>`
      : `<div class="hd"><div class="co-row">${b.logo ? `<img class="logo" src="${b.logo}"/>` : ''}<div><div class="co">${coName}</div>${contact ? `<div class="contact">${contact}</div>` : ''}</div></div></div>`;
    const sal = offer.salary ? `${esc(offer.currency)} ${Number(offer.salary).toLocaleString()}` : '____________';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Offer — ${esc(a.firstName)} ${esc(a.lastName)}</title>
      <style>*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#1f2733;margin:0;padding:38px 46px;line-height:1.7;font-size:13px}.hd{border-bottom:3px solid #012158;padding-bottom:12px;margin-bottom:6px;display:flex;justify-content:space-between}.co-row{display:flex;gap:14px;align-items:center}.logo{height:52px}.co{font-size:20px;font-weight:800;color:#012158}.contact{font-size:11px;color:#5b6b7f}.lh img{width:100%;display:block}.accent{height:3px;background:linear-gradient(90deg,#012158 50%,#FD9C09 50%);margin-top:6px}.doc{text-align:right;font-size:11px;color:#5b6b7f;text-transform:uppercase;letter-spacing:.08em;margin:8px 0 22px}h1{font-size:17px;color:#012158;margin:18px 0 8px}.sig{margin-top:46px;display:flex;justify-content:space-between}.sig div{width:44%;border-top:1px solid #1f2733;padding-top:6px;font-size:12px;color:#5b6b7f}.ft{margin-top:34px;border-top:1px solid #e5e8ec;padding-top:8px;font-size:10px;color:#9aa4b2}</style></head><body>
      ${header}<div class="doc">Letter of Offer &middot; ${fmtDate(new Date())}</div>
      <p>Dear ${esc(a.firstName)} ${esc(a.lastName)},</p>
      <h1>Offer of Employment — ${esc(vacancy?.title || 'Position')}</h1>
      <p>We are pleased to offer you the position of <strong>${esc(vacancy?.title || '')}</strong>${vacancy?.department?.name ? ` in the ${esc(vacancy.department.name)} department` : ''}, on the following principal terms:</p>
      <p><strong>Commencement date:</strong> ${offer.startDate ? fmtDate(offer.startDate) : '____________'}<br/>
         <strong>Remuneration:</strong> ${sal} per month<br/>
         <strong>Employment type:</strong> ${esc((vacancy?.employmentType || 'Permanent'))}${vacancy?.grade ? `<br/><strong>Grade:</strong> ${esc(vacancy.grade)}` : ''}</p>
      ${offer.note ? `<p>${esc(offer.note)}</p>` : ''}
      <p>This offer is subject to the satisfactory completion of any pre-employment checks and the terms set out in your contract of employment. Please indicate your acceptance by signing below.</p>
      <div class="sig"><div>Authorised signatory<br/>${coName}</div><div>Accepted — ${esc(a.firstName)} ${esc(a.lastName)}<br/>Date</div></div>
      <div class="ft">${b.footerNote ? esc(b.footerNote) + ' &middot; ' : ''}Generated by Nexusora Workforce</div></body></html>`;
    const w = window.open('', '_blank'); if (!w) { setErr('Allow pop-ups to print the offer letter.'); return; }
    w.document.write(html); w.document.close(); w.focus(); setTimeout(() => { try { w.print(); } catch { /* manual */ } }, 350);
  }

  const hired = a?.stage === 'hired';

  return (
    <Overlay onClose={onClose} wide>
      {!a ? <div style={{ padding: 40, color: C.muted }}>Loading…</div> : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ color: C.navy, fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>{a.firstName} {a.lastName}</h2>
                <span style={{ background: stageMeta(a.stage).color + '22', color: stageMeta(a.stage).color, fontWeight: 800, fontSize: '.7rem', padding: '3px 10px', borderRadius: 999, textTransform: 'uppercase' }}>{stageMeta(a.stage).label}</span>
              </div>
              <div style={{ color: C.muted, fontSize: '.8rem', marginTop: 4 }}>{[a.currentTitle, a.email, a.phone].filter(Boolean).join(' · ') || '—'}</div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: C.muted, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>

          {err && <div style={{ margin: '12px 0 0', background: '#fdecec', border: '1px solid #f6c9cb', color: C.red, padding: '9px 12px', borderRadius: 9, fontSize: '.84rem' }}>{err}</div>}

          {canWrite && !hired && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '14px 0', padding: '12px', background: C.panel, borderRadius: 10 }}>
              <span style={{ fontSize: '.76rem', color: C.muted, fontWeight: 700 }}>Move to:</span>
              {['applied', 'screening', 'shortlisted', 'interview', 'offer'].map((s) => (
                <button key={s} disabled={busy || a.stage === s} onClick={() => moveStage(s)} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${a.stage === s ? stageMeta(s).color : C.line}`, background: a.stage === s ? stageMeta(s).color : '#fff', color: a.stage === s ? '#fff' : C.ink, fontWeight: 700, fontSize: '.76rem', cursor: a.stage === s ? 'default' : 'pointer' }}>{stageMeta(s).label}</button>
              ))}
              <button disabled={busy} onClick={reject} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.red, fontWeight: 700, fontSize: '.76rem', cursor: 'pointer' }}>Reject</button>
            </div>
          )}
          {hired && a.hiredEmployee && <div style={{ margin: '14px 0', padding: '12px', background: '#e4f7ec', borderRadius: 10, color: C.green, fontWeight: 700, fontSize: '.85rem' }}>✓ Hired — added to employee records{a.hiredEmployee?.staffId ? ` as ${a.hiredEmployee.staffId}` : ''}.</div>}

          <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.line}`, margin: '6px 0 16px', flexWrap: 'wrap' }}>
            {['overview', 'interviews', 'offer', 'hire', 'notes'].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: '9px 14px', fontWeight: 700, fontSize: '.84rem', textTransform: 'capitalize', color: tab === t ? C.navy : C.muted }}>
                {t}{tab === t && <span style={{ position: 'absolute', left: 8, right: 8, bottom: -1, height: 3, background: C.blue, borderRadius: 3 }} />}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
              <Info label="Full name" value={`${a.firstName} ${a.lastName}`.trim()} />
              <Info label="Email" value={a.email || '—'} />
              <Info label="Phone" value={a.phone || '—'} />
              <Info label="Gender" value={a.gender || '—'} />
              <Info label="Source" value={a.source || '—'} />
              <Info label="Current title" value={a.currentTitle || '—'} />
              <Info label="Applied" value={fmtDate(a.appliedAt)} />
              <Info label="Rating" value={<Stars value={a.rating} />} />
              <div style={{ gridColumn: '1 / -1' }}>
                <Lbl>Résumé</Lbl>
                {a.resume?.url ? <a href={a.resume.url} target="_blank" rel="noreferrer" style={{ color: C.blue, fontWeight: 700, fontSize: '.86rem' }}>📎 {a.resume.name || 'View résumé'}</a> : <span style={{ color: C.muted, fontSize: '.85rem' }}>None uploaded</span>}
                {canWrite && <label style={{ marginLeft: 12, color: C.blue, fontWeight: 700, fontSize: '.82rem', cursor: 'pointer' }}>{a.resume?.url ? 'Replace' : 'Upload'} <input type="file" onChange={uploadResume} style={{ display: 'none' }} /></label>}
              </div>
              {a.coverNote && <div style={{ gridColumn: '1 / -1' }}><Lbl>Cover note</Lbl><div style={{ fontSize: '.86rem', color: C.ink, lineHeight: 1.6 }}>{a.coverNote}</div></div>}
            </div>
          )}

          {tab === 'interviews' && (
            <div>
              {(a.interviews || []).length === 0 && <div style={{ color: C.muted, fontSize: '.85rem', marginBottom: 14 }}>No interviews scheduled yet.</div>}
              {(a.interviews || []).map((v) => (
                <div key={v._id} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong style={{ color: C.navy }}>{v.round || 'Interview'}</strong><span style={{ fontSize: '.74rem', fontWeight: 700, color: v.outcome === 'pass' ? C.green : v.outcome === 'fail' ? C.red : C.muted, textTransform: 'uppercase' }}>{v.outcome}</span></div>
                  <div style={{ color: C.muted, fontSize: '.78rem', marginTop: 3 }}>{fmtDate(v.date)} · {v.mode?.replace('_', ' ')}{v.location ? ` · ${v.location}` : ''}{v.panel?.length ? ` · Panel: ${Array.isArray(v.panel) ? v.panel.join(', ') : v.panel}` : ''}</div>
                  {(v.scoreTechnical || v.scoreCulture || v.scoreCommunication) && (
                    <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
                      {[['Technical', v.scoreTechnical], ['Culture', v.scoreCulture], ['Communication', v.scoreCommunication]].map(([l, s]) => s ? <span key={l} style={{ fontSize: '.74rem', color: C.ink }}>{l}: <Stars value={Number(s)} /></span> : null)}
                    </div>
                  )}
                  {v.notes && <div style={{ fontSize: '.82rem', color: C.ink, marginTop: 6 }}>{v.notes}</div>}
                  {canWrite && v.outcome === 'pending' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button disabled={busy} onClick={() => call(() => api.put(`/recruitment/applications/${appId}/interviews/${v._id}`, { outcome: 'pass' }), null)} style={miniBtn(C.green)}>Mark pass</button>
                      <button disabled={busy} onClick={() => call(() => api.put(`/recruitment/applications/${appId}/interviews/${v._id}`, { outcome: 'fail' }), null)} style={miniBtn(C.red)}>Mark fail</button>
                    </div>
                  )}
                </div>
              ))}
              {canWrite && !hired && (
                <div style={{ background: C.panel, borderRadius: 10, padding: 14, marginTop: 8 }}>
                  <div style={{ fontWeight: 800, color: C.navy, fontSize: '.86rem', marginBottom: 10 }}>Schedule an interview</div>
                  <Row2><Fld label="Round" value={iv.round} onChange={(v) => setIv({ ...iv, round: v })} placeholder="e.g. Panel interview" /><Fld label="Date" type="date" value={iv.date} onChange={(v) => setIv({ ...iv, date: v })} /></Row2>
                  <Row2><Sel label="Mode" value={iv.mode} onChange={(v) => setIv({ ...iv, mode: v })} options={[['in_person', 'In person'], ['phone', 'Phone'], ['video', 'Video']]} /><Fld label="Location / link" value={iv.location} onChange={(v) => setIv({ ...iv, location: v })} /></Row2>
                  <Fld label="Panel (comma-separated)" value={iv.panel} onChange={(v) => setIv({ ...iv, panel: v })} />
                  <div style={{ fontWeight: 800, color: C.navy, fontSize: '.78rem', margin: '6px 0 8px', textTransform: 'uppercase', letterSpacing: '.04em' }}>Scorecard</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <Sel label="Technical" value={iv.scoreTechnical} onChange={(v) => setIv({ ...iv, scoreTechnical: v })} options={SCORE_OPTS} />
                    <Sel label="Culture fit" value={iv.scoreCulture} onChange={(v) => setIv({ ...iv, scoreCulture: v })} options={SCORE_OPTS} />
                    <Sel label="Communication" value={iv.scoreCommunication} onChange={(v) => setIv({ ...iv, scoreCommunication: v })} options={SCORE_OPTS} />
                  </div>
                  <Sel label="Recommendation" value={iv.recommendation} onChange={(v) => setIv({ ...iv, recommendation: v })} options={[['', '—'], ['strong_yes', 'Strong yes'], ['yes', 'Yes'], ['maybe', 'Maybe'], ['no', 'No']]} />
                  <Fld label="Notes" value={iv.notes} onChange={(v) => setIv({ ...iv, notes: v })} />
                  <button disabled={busy} onClick={addInterview} style={primaryBtn()}>Add interview</button>
                </div>
              )}
            </div>
          )}

          {tab === 'offer' && (
            <div>
              {a.offer?.status && a.offer.status !== 'none' && <div style={{ background: '#eef4fd', border: `1px solid #cfe3fb`, borderRadius: 10, padding: 12, marginBottom: 14, fontSize: '.85rem', color: C.ink }}>Current offer: <strong>{money(a.offer.salary, a.offer.currency)}</strong> · start {fmtDate(a.offer.startDate)} · status <strong style={{ textTransform: 'capitalize' }}>{a.offer.status}</strong></div>}
              {canWrite && !hired ? (
                <div style={{ background: C.panel, borderRadius: 10, padding: 14 }}>
                  <Row2><Fld label="Salary" type="number" value={offer.salary} onChange={(v) => setOffer({ ...offer, salary: v })} /><Fld label="Currency" value={offer.currency} onChange={(v) => setOffer({ ...offer, currency: v })} /></Row2>
                  <Fld label="Proposed start date" type="date" value={offer.startDate} onChange={(v) => setOffer({ ...offer, startDate: v })} />
                  <Fld label="Note" value={offer.note} onChange={(v) => setOffer({ ...offer, note: v })} />
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button disabled={busy} onClick={makeOffer} style={primaryBtn()}>Save / extend offer</button>
                    <button onClick={printOffer} style={{ ...ghostBtn(), display: 'inline-flex', alignItems: 'center', gap: 7 }}><FileDown size={15} /> Generate offer letter</button>
                  </div>
                </div>
              ) : !canWrite ? <div style={{ color: C.muted, fontSize: '.85rem' }}>You don’t have permission to manage offers.</div> : null}
            </div>
          )}

          {tab === 'hire' && (
            <div>
              {hired ? <div style={{ color: C.green, fontWeight: 700 }}>This candidate has been hired.</div>
                : !canHire ? <div style={{ color: C.muted, fontSize: '.85rem' }}>Only an HR Manager or Super Admin can hire a candidate.</div>
                  : (
                    <div style={{ background: C.panel, borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: '.82rem', color: C.muted, marginBottom: 12, lineHeight: 1.6 }}>Hiring creates a new employee record from this candidate, on probation, linked to this vacancy.</div>
                      <Fld label="Staff ID (required)" value={hireForm.staffId} onChange={(v) => setHireForm({ ...hireForm, staffId: v })} placeholder="e.g. EMP-0142" />
                      <Sel label="Position (seat)" value={hireForm.positionId} onChange={(v) => setHireForm({ ...hireForm, positionId: v })} options={[['', '— None —'], ...positions.map((p) => [p._id, `${p.title}${p.code ? ` · ${p.code}` : ''}`])]} />
                      <Row2><Fld label="Start date" type="date" value={hireForm.startDate} onChange={(v) => setHireForm({ ...hireForm, startDate: v })} /><Fld label="Salary" type="number" value={hireForm.salary} onChange={(v) => setHireForm({ ...hireForm, salary: v })} /></Row2>
                      <button disabled={busy} onClick={doHire} style={{ ...primaryBtn(), background: C.green }}>✓ Hire candidate</button>
                    </div>
                  )}
            </div>
          )}

          {tab === 'notes' && (
            <div>
              {(a.notes || []).length === 0 && <div style={{ color: C.muted, fontSize: '.85rem', marginBottom: 12 }}>No notes yet.</div>}
              {(a.notes || []).slice().reverse().map((n) => (<div key={n._id} style={{ borderLeft: `3px solid ${C.line}`, padding: '4px 0 4px 12px', marginBottom: 10 }}><div style={{ fontSize: '.85rem', color: C.ink }}>{n.text}</div><div style={{ fontSize: '.72rem', color: C.muted, marginTop: 2 }}>{fmtDate(n.at)}</div></div>))}
              {canWrite && <div style={{ marginTop: 10 }}><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add a note…" style={{ width: '100%', padding: '10px 12px', border: `1px solid #d8e0ec`, borderRadius: 10, fontSize: '.88rem', resize: 'vertical', fontFamily: 'inherit' }} /><button disabled={busy || !note.trim()} onClick={addNote} style={{ ...primaryBtn(), marginTop: 8 }}>Add note</button></div>}
            </div>
          )}
        </>
      )}
    </Overlay>
  );
}

/* ============================ VACANCY MODAL ============================ */
function VacancyModal({ mode, vacancy, depts, positions, tenant, onClose, onSaved }) {
  const editing = mode === 'edit';
  const [f, setF] = useState({
    title: vacancy?.title || '', department: vacancy?.department?._id || vacancy?.department || '', position: vacancy?.position?._id || vacancy?.position || '', grade: vacancy?.grade || '',
    employmentType: vacancy?.employmentType || 'permanent', workerClass: vacancy?.workerClass || 'staff', location: vacancy?.location || '', openings: vacancy?.openings || 1, status: vacancy?.status || 'open', description: vacancy?.description || '',
    salMin: vacancy?.salaryRange?.min ?? '', salMax: vacancy?.salaryRange?.max ?? '', salCur: vacancy?.salaryRange?.currency || tenant?.baseCurrency || '',
  });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function submit() {
    if (!f.title.trim()) { setErr('A job title is required.'); return; }
    setBusy(true); setErr('');
    const payload = { title: f.title, department: f.department || null, position: f.position || null, grade: f.grade, employmentType: f.employmentType, workerClass: f.workerClass, location: f.location, openings: Number(f.openings) || 1, status: f.status, description: f.description, salaryRange: { min: f.salMin === '' ? null : Number(f.salMin), max: f.salMax === '' ? null : Number(f.salMax), currency: f.salCur } };
    try { if (editing) await api.put(`/recruitment/vacancies/${vacancy._id}`, payload); else await api.post('/recruitment/vacancies', payload); onSaved(editing ? 'Vacancy updated.' : 'Vacancy created.'); }
    catch (e) { setErr(e?.response?.data?.message || 'Could not save vacancy.'); } finally { setBusy(false); }
  }
  return (
    <Overlay onClose={onClose}>
      <h2 style={{ color: C.navy, fontSize: '1.2rem', fontWeight: 800, margin: '0 0 16px' }}>{editing ? 'Edit vacancy' : 'New vacancy'}</h2>
      {err && <div style={{ background: '#fdecec', border: '1px solid #f6c9cb', color: C.red, padding: '9px 12px', borderRadius: 9, fontSize: '.84rem', marginBottom: 12 }}>{err}</div>}
      <Fld label="Job title" value={f.title} onChange={(v) => setF({ ...f, title: v })} placeholder="e.g. IT Officer" />
      <Row2><Sel label="Department" value={f.department} onChange={(v) => setF({ ...f, department: v })} options={[['', '— None —'], ...depts.map((d) => [d._id, d.name])]} /><Sel label="Link to position (optional)" value={f.position} onChange={(v) => setF({ ...f, position: v })} options={[['', '— None —'], ...positions.map((p) => [p._id, p.title])]} /></Row2>
      <Row2><Fld label="Grade" value={f.grade} onChange={(v) => setF({ ...f, grade: v })} /><Fld label="Openings" type="number" value={f.openings} onChange={(v) => setF({ ...f, openings: v })} /></Row2>
      <Row2><Sel label="Employment type" value={f.employmentType} onChange={(v) => setF({ ...f, employmentType: v })} options={EMP_TYPES.map((t) => [t, t])} /><Sel label="Worker class" value={f.workerClass} onChange={(v) => setF({ ...f, workerClass: v })} options={WORKER_CLASSES.map((t) => [t, t.replace('_', ' ')])} /></Row2>
      <Row2><Fld label="Location" value={f.location} onChange={(v) => setF({ ...f, location: v })} /><Sel label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={VAC_STATUS.map((s) => [s, s.replace('_', ' ')])} /></Row2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}><Fld label="Salary min" type="number" value={f.salMin} onChange={(v) => setF({ ...f, salMin: v })} /><Fld label="Salary max" type="number" value={f.salMax} onChange={(v) => setF({ ...f, salMax: v })} /><Fld label="Currency" value={f.salCur} onChange={(v) => setF({ ...f, salCur: v })} /></div>
      <Lbl>Description</Lbl>
      <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} style={{ width: '100%', padding: '10px 12px', border: `1px solid #d8e0ec`, borderRadius: 10, fontSize: '.9rem', resize: 'vertical', fontFamily: 'inherit', marginBottom: 14 }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}><button onClick={onClose} style={ghostBtn()}>Cancel</button><button onClick={submit} disabled={busy} style={primaryBtn()}>{busy ? 'Saving…' : (editing ? 'Save changes' : 'Create vacancy')}</button></div>
    </Overlay>
  );
}

/* ============================ APPLICANT (ADD) MODAL ============================ */
function ApplicantModal({ vacancyId, onClose, onSaved }) {
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', gender: '', source: '', currentTitle: '', coverNote: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function submit() {
    if (!f.firstName.trim()) { setErr('Candidate first name is required.'); return; }
    setBusy(true); setErr('');
    try { await api.post('/recruitment/applications', { ...f, vacancy: vacancyId }); onSaved('Applicant added.'); }
    catch (e) { setErr(e?.response?.data?.message || 'Could not add applicant.'); } finally { setBusy(false); }
  }
  return (
    <Overlay onClose={onClose}>
      <h2 style={{ color: C.navy, fontSize: '1.2rem', fontWeight: 800, margin: '0 0 16px' }}>Add applicant</h2>
      {err && <div style={{ background: '#fdecec', border: '1px solid #f6c9cb', color: C.red, padding: '9px 12px', borderRadius: 9, fontSize: '.84rem', marginBottom: 12 }}>{err}</div>}
      <Row2><Fld label="First name" value={f.firstName} onChange={(v) => setF({ ...f, firstName: v })} /><Fld label="Last name" value={f.lastName} onChange={(v) => setF({ ...f, lastName: v })} /></Row2>
      <Row2><Fld label="Email" value={f.email} onChange={(v) => setF({ ...f, email: v })} /><Fld label="Phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} /></Row2>
      <Row2><Sel label="Gender" value={f.gender} onChange={(v) => setF({ ...f, gender: v })} options={[['', '—'], ['male', 'Male'], ['female', 'Female'], ['other', 'Other']]} /><Fld label="Source" value={f.source} onChange={(v) => setF({ ...f, source: v })} placeholder="referral / website / agency" /></Row2>
      <Fld label="Current title" value={f.currentTitle} onChange={(v) => setF({ ...f, currentTitle: v })} />
      <Lbl>Cover note</Lbl>
      <textarea value={f.coverNote} onChange={(e) => setF({ ...f, coverNote: e.target.value })} rows={2} style={{ width: '100%', padding: '10px 12px', border: `1px solid #d8e0ec`, borderRadius: 10, fontSize: '.9rem', resize: 'vertical', fontFamily: 'inherit', marginBottom: 14 }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}><button onClick={onClose} style={ghostBtn()}>Cancel</button><button onClick={submit} disabled={busy} style={primaryBtn()}>{busy ? 'Adding…' : 'Add applicant'}</button></div>
    </Overlay>
  );
}

/* ============================ shared bits ============================ */
const SCORE_OPTS = [['', '—'], ['1', '1 ★'], ['2', '2 ★'], ['3', '3 ★'], ['4', '4 ★'], ['5', '5 ★']];
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function Sample() { return <span style={{ marginLeft: 8, fontSize: '.6rem', fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: C.amber || '#c77700', background: '#fdf0dc', padding: '2px 7px', borderRadius: 5 }}>Sample</span>; }
function FunnelBars({ data, color = C.blue }) {
  const max = Math.max(...data.map((d) => d[1]), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
      {data.map(([label, n]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 84, fontSize: '.78rem', color: C.ink, fontWeight: 500, textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
          <div style={{ flex: 1, height: 18, background: '#eef2f8', borderRadius: 6, overflow: 'hidden' }}><div style={{ width: `${(n / max) * 100}%`, height: '100%', background: color, borderRadius: 6, minWidth: n ? 3 : 0 }} /></div>
          <span style={{ width: 24, textAlign: 'right', fontWeight: 800, color: C.navy, fontSize: '.8rem', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
        </div>
      ))}
    </div>
  );
}
function Overlay({ children, onClose, wide }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(1,33,88,.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'start center', padding: '40px 20px', zIndex: 60, overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: wide ? 640 : 500, background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 18px 44px rgba(1,33,88,.3)', borderTop: `4px solid ${C.navy}` }}>{children}</div>
    </div>
  );
}
function StatusPill({ status }) {
  const map = { draft: ['#eef1f6', '#8a94a6'], pending_approval: ['#fff2dc', '#b8760a'], open: ['#e4f7ec', '#1f9d57'], on_hold: ['#fff2dc', '#b8760a'], closed: ['#fdecec', '#e5484d'], filled: ['#eaf2fd', '#1f6fd6'] };
  const [bg, col] = map[status] || ['#eef1f6', '#8a94a6'];
  return <span style={{ background: bg, color: col, fontWeight: 700, fontSize: '.68rem', padding: '3px 10px', borderRadius: 999, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{(status || '').replace('_', ' ')}</span>;
}
function MiniStat({ label, value, accent }) {
  return <div style={{ background: '#f2f5f8', borderRadius: 8, padding: '6px 10px', minWidth: 66 }}><div style={{ fontWeight: 800, fontSize: '.95rem', color: accent || C.navy, fontVariantNumeric: 'tabular-nums' }}>{value}</div><div style={{ fontSize: '.6rem', color: C.muted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.03em' }}>{label}</div></div>;
}
function Stars({ value = 0 }) { return <span style={{ color: C.orange, fontSize: '.8rem', letterSpacing: 1 }}>{'★'.repeat(value)}<span style={{ color: C.line }}>{'★'.repeat(Math.max(0, 5 - value))}</span></span>; }
function Info({ label, value }) { return <div><Lbl>{label}</Lbl><div style={{ fontSize: '.9rem', color: C.ink, fontWeight: 600 }}>{value}</div></div>; }
function Lbl({ children }) { return <div style={{ fontSize: '.68rem', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>{children}</div>; }
function Row2({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>; }
function Fld({ label, value, onChange, type = 'text', placeholder }) { return <label style={{ display: 'block', marginBottom: 12 }}><Lbl>{label}</Lbl><input type={type} value={value ?? ''} placeholder={placeholder || ''} onChange={(e) => onChange(e.target.value)} style={{ width: '100%', padding: '9px 11px', border: `1px solid #d8e0ec`, borderRadius: 9, fontSize: '.9rem', color: C.ink, fontFamily: 'inherit' }} /></label>; }
function Sel({ label, value, onChange, options }) { return <label style={{ display: 'block', marginBottom: 12 }}><Lbl>{label}</Lbl><select value={value ?? ''} onChange={(e) => onChange(e.target.value)} style={{ width: '100%', padding: '9px 11px', border: `1px solid #d8e0ec`, borderRadius: 9, fontSize: '.9rem', color: C.ink, background: '#fff', textTransform: 'capitalize', fontFamily: 'inherit' }}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>; }
function Note({ children, onClose }) { return <div style={{ background: '#eaf5ff', border: '1px solid #cfe6fb', color: '#0b4a8f', padding: '10px 13px', borderRadius: 10, fontSize: '.88rem', marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>{children}</span>{onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#0b4a8f', cursor: 'pointer', fontWeight: 800 }}>×</button>}</div>; }
function primaryBtn() { return { padding: '10px 18px', border: 'none', borderRadius: 10, background: C.navy, color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }; }
function ghostBtn() { return { padding: '10px 18px', border: '1px solid #d8e0ec', borderRadius: 10, background: '#fff', color: C.ink, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }; }
function miniBtn(color) { return { padding: '5px 11px', border: `1px solid ${color}`, borderRadius: 7, background: '#fff', color, fontWeight: 700, fontSize: '.74rem', cursor: 'pointer' }; }

const cardHead = { fontWeight: 800, color: C.navy, fontSize: '.95rem', marginBottom: 12 };
const panelCard = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: '0 1px 2px rgba(1,33,88,.05)', padding: 18 };
const emptyBox = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 44, textAlign: 'center', color: C.muted };
const STYLES = `
.rec-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
.rec-card{background:#fff;border:1px solid ${C.line};border-radius:14px;padding:18px;box-shadow:0 1px 2px rgba(1,33,88,.05);cursor:pointer;transition:box-shadow .15s,transform .15s}
.rec-card:hover{box-shadow:0 8px 22px rgba(1,33,88,.12);transform:translateY(-2px)}
.rec-board{display:flex;gap:14px;overflow-x:auto;padding-bottom:12px}
.rec-col{flex:0 0 240px;background:#eef2f8;border:1px solid ${C.line};border-radius:12px;padding:10px;min-height:120px}
.rec-appcard{background:#fff;border:1px solid ${C.line};border-radius:10px;padding:11px 12px;margin-bottom:9px;cursor:pointer;box-shadow:0 1px 2px rgba(1,33,88,.05)}
.rec-appcard:hover{border-color:${C.blue}}
@media(max-width:900px){.rec-analytics{grid-template-columns:1fr !important}}
`;  