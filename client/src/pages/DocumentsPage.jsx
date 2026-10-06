import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { ModuleShell } from '../ui/kit';
import { FileText, FolderOpen, Users } from 'lucide-react';

const C = { navy: '#012158', blue: '#3485E9', orange: '#FD9C09', green: '#1f9d57', red: '#e5484d',
  purple: '#7c5cdf', teal: '#17a2b8', ink: '#16233b', muted: '#8a94a6', line: '#e5e8ec', canvas: '#eef1f4' };
const MODULE = 'Documents';

const CATS = [
  ['policy', 'documents.cat_policy'], ['handbook', 'documents.cat_handbook'], ['form', 'documents.cat_form'], ['notice', 'documents.cat_notice'],
  ['contract_template', 'documents.cat_contract_template'], ['certificate', 'documents.cat_certificate'], ['report', 'documents.cat_report'], ['other', 'documents.cat_other'],
];
const catLabel = (k, t) => { const raw = (CATS.find((c) => c[0] === k) || [k, k])[1]; return t ? t(raw) : raw; };
const ROLES = [
  ['super_admin', 'documents.role_superAdmin'], ['hr_manager', 'documents.role_hrManager'], ['hr_officer', 'documents.role_hrOfficer'], ['line_manager', 'documents.role_lineManager'],
  ['payroll_officer', 'documents.role_payrollOfficer'], ['ir_officer', 'documents.role_irOfficer'], ['employee', 'documents.role_employee'], ['viewer', 'documents.role_viewer'],
];
const STATUS = { draft: ['documents.st_draft', C.muted, '#eef1f5'], published: ['documents.st_published', C.green, '#e7f6ee'], archived: ['documents.st_archived', '#8a6d3b', '#f3ede0'] };
const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const extOf = (s) => (String(s || '').split('.').pop() || '').toLowerCase().split('?')[0];
const kb = (b) => b ? (b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB') : '';

export default function DocumentsPage() {
  const { t } = useLocale();
  const { user } = useAuth();
  const canWrite = ['super_admin', 'hr_manager', 'hr_officer'].includes(user?.role);
  const canSeeEmp = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager'].includes(user?.role);
  const [tab, setTab] = useState('company');
  const [preview, setPreview] = useState(null);

  const groups = [{ title: t('documents.group_library'), items: [
    { key: 'company', label: t('documents.head_company_title'), Icon: FolderOpen },
    ...(canSeeEmp ? [{ key: 'employees', label: t('documents.head_emp_title'), Icon: Users }] : []),
  ] }];
  const HEAD = {
    company: ['documents.head_company_title', 'documents.head_company_sub'],
    employees: ['documents.head_emp_title', 'documents.head_emp_sub'],
  };

  return (
    <ModuleShell brand={{ title: t('documents.module'), subtitle: t('documents.brand_subtitle'), Icon: FileText }} groups={groups} active={tab} onSelect={setTab}>
      <div style={{ padding: '0 30px 48px', minWidth: 0 }}>
        <Hero crumbs={t(HEAD[tab][0])} title={t(HEAD[tab][0])} subtitle={t(HEAD[tab][1])} />
        {tab === 'company' && <CompanyTab canWrite={canWrite} onPreview={setPreview} />}
        {tab === 'employees' && canSeeEmp && <EmployeeDocsTab onPreview={setPreview} />}
        {preview && <FilePreview file={preview} onClose={() => setPreview(null)} />}
      </div>
    </ModuleShell>
  );
}

/* ---- light-blue hero (kit-consistent) ---- */
function Hero({ crumbs, title, subtitle, action }) {
  const { t } = useLocale();
  return (
    <section style={{ margin: '0 -30px 22px', background: 'radial-gradient(1200px 200px at 88% -40%, rgba(22,142,255,.16), transparent 60%), linear-gradient(120deg,#aed9f3 0%,#dff0fa 46%,#eef7fd 100%)', padding: '24px 30px 26px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#2b4a74', fontSize: '.76rem', fontWeight: 600, marginBottom: 8 }}>{t('documents.module')} <span style={{ opacity: .6 }}>›</span> <span>{crumbs}</span></div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#062a55', letterSpacing: '-.02em', lineHeight: 1.1 }}>{title}</div>
          {subtitle && <div style={{ fontSize: '.9rem', color: '#28466f', marginTop: 6 }}>{subtitle}</div>}
        </div>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>
    </section>
  );
}

/* ============================ COMPANY LIBRARY ============================ */
function CompanyTab({ canWrite, onPreview }) {
  const { t } = useLocale();
  const [items, setItems] = useState([]);
  const [expiring, setExpiring] = useState([]);
  const [cat, setCat] = useState('all');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);       // { mode:'add'|'edit', doc }
  const [detail, setDetail] = useState(null);      // doc id opened in the detail drawer
  const [msg, setMsg] = useState('');
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => {
    let alive = true; setLoading(true);
    (async () => {
      try { const { data } = await api.get('/documents/company', { params: { category: cat, q, status: canWrite ? status : undefined } }); if (alive) setItems(data.items || []); }
      catch { if (alive) setItems([]); }
      finally { if (alive) setLoading(false); }
      if (canWrite) { try { const { data } = await api.get('/documents/company/expiring', { params: { days: 30 } }); if (alive) setExpiring(data.items || []); } catch { /* */ } }
    })();
    return () => { alive = false; };
  }, [cat, q, status, reload, canWrite]);

  async function del(d) {
    if (!window.confirm(`Delete "${d.title}" and all its versions?`)) return;
    try { await api.delete(`/documents/company/${d._id}`); setMsg(t('documents.msgDeleted')); refresh(); }
    catch (e) { setMsg(e?.response?.data?.message || t('documents.msgCouldNotDelete')); }
  }
  async function quickStatus(d, s) {
    try { await api.patch(`/documents/company/${d._id}/status`, { status: s }); setMsg(t('documents.movedTo', { status: t(STATUS[s][0]) })); refresh(); }
    catch (e) { setMsg(e?.response?.data?.message || t('documents.msgCouldNotUpdate')); }
  }
  async function acknowledge(d) {
    try { await api.post(`/documents/company/${d._id}/acknowledge`); setMsg(t('documents.msgAcknowledged', { title: d.title })); refresh(); }
    catch (e) { setMsg(e?.response?.data?.message || t('documents.msgCouldNotAck')); }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={cat} onChange={(e) => setCat(e.target.value)} style={ctrl()}>
          <option value="all">{t('documents.allCategories')}</option>
          {CATS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
        </select>
        {canWrite && (
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={ctrl()}>
            <option value="all">{t('documents.allStatuses')}</option>
            <option value="published">{t('documents.st_published')}</option>
            <option value="draft">{t('documents.st_draft')}</option>
            <option value="archived">{t('documents.st_archived')}</option>
          </select>
        )}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('documents.searchTitleTag')} style={{ ...ctrl(), minWidth: 200 }} />
        <div style={{ flex: 1 }} />
        {canWrite && <button onClick={() => setModal({ mode: 'add' })} style={{ padding: '10px 18px', border: 'none', borderRadius: 10, background: C.navy, color: '#fff', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(1,33,88,.22)' }}>{t('documents.newDocument')}</button>}
      </div>

      {msg && <Note onClose={() => setMsg('')}>{msg}</Note>}

      {canWrite && expiring.length > 0 && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <div style={{ fontWeight: 800, color: '#b8760a', fontSize: '.85rem', marginBottom: 6 }}>⏰ {t('documents.expiringBanner', { n: expiring.length })}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {expiring.map((d) => <button key={d._id} onClick={() => setDetail(d._id)} style={{ background: '#fff', border: '1px solid #fed7aa', borderRadius: 8, padding: '4px 10px', fontSize: '.78rem', color: C.ink, cursor: 'pointer' }}>{d.title} · {fmtDate(d.expiryDate || d.reviewDate)}</button>)}
          </div>
        </div>
      )}

      {loading ? <div style={{ color: C.muted, padding: 40 }}>{t('common.loading')}</div>
        : items.length === 0 ? <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 44, textAlign: 'center', color: C.muted }}>{cat !== 'all' ? t('documents.noDocsInCategory') : t('documents.noDocs')}</div>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {items.map((d) => (
                <DocCard key={d._id} d={d} canWrite={canWrite}
                  onPreview={onPreview} onDetail={() => setDetail(d._id)} onEdit={() => setModal({ mode: 'edit', doc: d })}
                  onDelete={() => del(d)} onStatus={quickStatus} onAck={() => acknowledge(d)} />
              ))}
            </div>
          )}

      {modal && <DocModal mode={modal.mode} doc={modal.doc} onClose={() => setModal(null)} onSaved={(m) => { setModal(null); setMsg(m); refresh(); }} />}
      {detail && <DetailDrawer id={detail} canWrite={canWrite} onPreview={onPreview} onClose={() => setDetail(null)} onChanged={() => { refresh(); }} />}
    </div>
  );
}

function DocCard({ d, canWrite, onPreview, onDetail, onEdit, onDelete, onStatus, onAck }) {
  const { t } = useLocale();
  const exp = d.expiryDate ? new Date(d.expiryDate) : null;
  const expired = exp && exp < new Date();
  const soon = exp && !expired && (exp - new Date()) / 864e5 < 30;
  const [sl, sc, sb] = STATUS[d.status] || STATUS.published;
  const s = d.ackSummary || {};
  const needsMyAck = d.requireAcknowledgement && d.status === 'published' && (!s.acknowledgedByMe || s.myAckStale);
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, boxShadow: '0 1px 2px rgba(1,33,88,.05)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ background: C.navy + '12', color: C.navy, fontWeight: 700, fontSize: '.66rem', padding: '3px 9px', borderRadius: 999, textTransform: 'uppercase' }}>{catLabel(d.category, t)}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {canWrite && <span style={{ background: sb, color: sc, fontWeight: 700, fontSize: '.66rem', padding: '3px 9px', borderRadius: 999 }}>{t(sl)}</span>}
          {exp && <span style={{ background: expired ? '#fdecec' : soon ? '#fff2dc' : '#eef2f8', color: expired ? C.red : soon ? '#b8760a' : C.muted, fontWeight: 700, fontSize: '.66rem', padding: '3px 9px', borderRadius: 999 }}>{expired ? t('documents.expired') : t('documents.expShort', { date: fmtDate(exp) })}</span>}
        </div>
      </div>
      <div style={{ fontWeight: 800, color: C.navy, fontSize: '1rem', margin: '10px 0 4px' }}>{d.title}</div>
      {d.description && <div style={{ color: C.muted, fontSize: '.8rem', lineHeight: 1.5, marginBottom: 8 }}>{d.description}</div>}
      <div style={{ color: C.muted, fontSize: '.72rem', marginBottom: 8 }}>
        {d.version ? `${t('documents.versionShort', { n: d.version })} · ` : ''}{d.versionCount > 0 ? `${t('documents.versionCount', { n: d.versionCount })} · ` : ''}
        {d.effectiveDate ? `${t('documents.effective', { date: fmtDate(d.effectiveDate) })} · ` : ''}
        {d.visibility?.includes('all') ? t('documents.everyone') : t('documents.roleCount', { n: d.visibility?.length || 0 })}
      </div>

      {/* Acknowledgement status line */}
      {d.requireAcknowledgement && (
        canWrite
          ? <div style={{ fontSize: '.72rem', color: C.ink, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: C.orange, display: 'inline-block' }} /> {t('documents.ackRequiredSigned', { n: s.currentVersion || 0 })}
            </div>
          : <div style={{ fontSize: '.72rem', marginBottom: 10, color: needsMyAck ? '#b8760a' : C.green, fontWeight: 700 }}>
              {needsMyAck ? (s.myAckStale ? t('documents.ackNewVersion') : t('documents.ackRequired')) : t('documents.ackDone')}
            </div>
      )}

      <div style={{ marginTop: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {d.file?.url
          ? <>
            <button onClick={() => onPreview(d.file)} style={miniBtn(C.blue)}>{t('common.preview')}</button>
            <a href={d.file.url} target="_blank" rel="noreferrer" style={{ ...miniBtn(C.navy), textDecoration: 'none' }}>{t('common.download')}</a>
          </>
          : <span style={{ color: C.muted, fontSize: '.78rem', alignSelf: 'center' }}>{t('documents.noFileUploaded')}</span>}
        <button onClick={onDetail} style={miniBtn(C.muted)}>{t('documents.details')}</button>
        {needsMyAck && !canWrite && <button onClick={onAck} style={{ ...miniBtn(C.green), background: C.green, color: '#fff' }}>{t('documents.acknowledge')}</button>}
        {canWrite && <>
          <button onClick={onEdit} style={miniBtn(C.muted)}>{t('common.edit')}</button>
          {d.status !== 'published' && <button onClick={() => onStatus(d, 'published')} style={miniBtn(C.green)}>{t('common.publish')}</button>}
          {d.status === 'published' && <button onClick={() => onStatus(d, 'archived')} style={miniBtn('#8a6d3b')}>{t('common.archive')}</button>}
          <button onClick={onDelete} style={{ ...miniBtn(C.red), border: 'none' }}>✕</button>
        </>}
      </div>
    </div>
  );
}

/* ============================ DETAIL DRAWER (versions + acknowledgements) ============================ */
function DetailDrawer({ id, canWrite, onPreview, onClose, onChanged }) {
  const { t } = useLocale();
  const [doc, setDoc] = useState(null);
  const [report, setReport] = useState(null);
  const [pane, setPane] = useState('versions');
  const [err, setErr] = useState('');
  const [reload, setReload] = useState(0);
  // new-version upload
  const [file, setFile] = useState(null);
  const [vnote, setVnote] = useState('');
  const [vlabel, setVlabel] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true; setErr('');
    (async () => {
      try { const { data } = await api.get(`/documents/company/${id}`); if (alive) setDoc(data); }
      catch (e) { if (alive) setErr(e?.response?.data?.message || t('documents.msgCouldNotLoad')); }
      if (canWrite) { try { const { data } = await api.get(`/documents/company/${id}/acknowledgements`); if (alive) setReport(data); } catch { /* */ } }
    })();
    return () => { alive = false; };
  }, [id, canWrite, reload]);

  async function uploadVersion() {
    if (!file) { setErr(t('documents.msgChooseFile')); return; }
    setBusy(true); setErr('');
    try {
      const fd = new FormData(); fd.append('file', file); if (vnote) fd.append('note', vnote); if (vlabel) fd.append('version', vlabel);
      await api.post(`/documents/company/${id}/file`, fd);
      setFile(null); setVnote(''); setVlabel(''); setReload((n) => n + 1); onChanged();
    } catch (e) { setErr(e?.response?.data?.message || t('documents.msgUploadFailed')); }
    finally { setBusy(false); }
  }

  const versions = (doc?.versions || []).slice().reverse();
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(1,33,88,.5)', backdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'flex-end', zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, height: '100%', background: '#fff', boxShadow: '-14px 0 40px rgba(1,33,88,.25)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 800, color: C.navy, fontSize: '1.05rem' }}>{doc?.title || t('common.document')}</div>
            {doc && <div style={{ color: C.muted, fontSize: '.76rem', marginTop: 3 }}>{catLabel(doc.category, t)} · v{doc.version || '—'} · {t((STATUS[doc.status] || [])[0])}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, color: C.muted, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 4, padding: '0 20px', borderBottom: `1px solid ${C.line}` }}>
          <SubTab on={pane === 'versions'} onClick={() => setPane('versions')}>{t('documents.versionHistory')}</SubTab>
          {canWrite && <SubTab on={pane === 'acks'} onClick={() => setPane('acks')}>{t('documents.acknowledgements')}</SubTab>}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {err && <div style={{ background: '#fdecec', border: '1px solid #f6c9cb', color: C.red, padding: '9px 12px', borderRadius: 9, fontSize: '.82rem', marginBottom: 12 }}>{err}</div>}

          {pane === 'versions' && (
            <>
              {canWrite && (
                <div style={{ background: C.canvas, border: `1px dashed #cbd6e6`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
                  <div style={{ fontWeight: 800, color: C.navy, fontSize: '.82rem', marginBottom: 8 }}>{t('documents.uploadNewVersion')}</div>
                  <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ fontSize: '.82rem', marginBottom: 8, display: 'block' }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 8, marginBottom: 8 }}>
                    <input value={vlabel} onChange={(e) => setVlabel(e.target.value)} placeholder={t('documents.versionAuto')} style={inp()} />
                    <input value={vnote} onChange={(e) => setVnote(e.target.value)} placeholder={t('documents.whatChanged')} style={inp()} />
                  </div>
                  <button onClick={uploadVersion} disabled={busy || !file} style={{ ...primaryBtn(), opacity: busy || !file ? 0.6 : 1 }}>{busy ? t('common.uploading') : t('documents.addVersion')}</button>
                </div>
              )}
              {versions.length === 0 && <div style={{ color: C.muted, fontSize: '.85rem' }}>{t('documents.noVersions')}</div>}
              <div style={{ position: 'relative' }}>
                {versions.map((v, i) => (
                  <div key={v._id || i} style={{ display: 'flex', gap: 12, paddingBottom: 16 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: 30, height: 30, borderRadius: 999, background: i === 0 ? C.navy : '#eef2f8', color: i === 0 ? '#fff' : C.navy, fontWeight: 800, fontSize: '.72rem', display: 'grid', placeItems: 'center' }}>v{v.version || (versions.length - i)}</div>
                      {i < versions.length - 1 && <div style={{ flex: 1, width: 2, background: C.line, marginTop: 2 }} />}
                    </div>
                    <div style={{ flex: 1, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: C.ink, fontSize: '.85rem' }}>{v.file?.name || t('documents.file')} <span style={{ color: C.muted, fontWeight: 500 }}>{kb(v.file?.bytes)}</span></span>
                        {i === 0 && <span style={{ background: '#e7f6ee', color: C.green, fontWeight: 700, fontSize: '.64rem', padding: '2px 8px', borderRadius: 999 }}>{t('documents.current')}</span>}
                      </div>
                      {v.note && <div style={{ color: C.ink, fontSize: '.78rem', margin: '5px 0' }}>{v.note}</div>}
                      <div style={{ color: C.muted, fontSize: '.72rem', marginBottom: 8 }}>{v.uploadedByName || '—'} · {fmtDateTime(v.uploadedAt)}</div>
                      {v.file?.url && <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => onPreview(v.file)} style={miniBtn(C.blue)}>{t('common.preview')}</button>
                        <a href={v.file.url} target="_blank" rel="noreferrer" style={{ ...miniBtn(C.navy), textDecoration: 'none' }}>{t('common.download')}</a>
                      </div>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {pane === 'acks' && canWrite && (
            report ? <AckReport report={report} /> : <div style={{ color: C.muted, fontSize: '.85rem' }}>{t('documents.loadingAcks')}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function AckReport({ report }) {
  const { t } = useLocale();
  const s = report.summary || {};
  const [filter, setFilter] = useState('all');
  const rows = (report.roster || []).filter((r) => filter === 'all' ? true : filter === 'pending' ? !r.acknowledged : filter === 'stale' ? r.stale : r.acknowledged && !r.stale);
  return (
    <div>
      {!report.requireAcknowledgement && <div style={{ background: '#eef2f8', color: C.muted, fontSize: '.78rem', padding: '8px 11px', borderRadius: 9, marginBottom: 12 }}>{t('documents.ackNotRequired')}</div>}
      {/* Progress bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.78rem', color: C.ink, marginBottom: 5 }}>
          <span style={{ fontWeight: 700 }}>{t('documents.staffAcknowledged', { done: s.acknowledged || 0, total: s.total || 0 })}</span>
          <span style={{ fontWeight: 800, color: C.navy }}>{s.pct || 0}%</span>
        </div>
        <div style={{ height: 9, background: '#eef2f8', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${s.pct || 0}%`, height: '100%', background: (s.pct || 0) >= 100 ? C.green : C.blue }} /></div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <KTile label="documents.acknowledged" value={s.acknowledged || 0} color={C.green} />
        <KTile label="documents.pending" value={s.pending || 0} color={C.orange} />
        <KTile label="documents.onOldVersion" value={s.stale || 0} color={C.red} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {[['all', 'common.all'], ['done', 'documents.acknowledged'], ['pending', 'documents.pending'], ['stale', 'documents.oldVersion']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)} style={{ padding: '4px 10px', borderRadius: 8, border: `1px solid ${filter === v ? C.navy : C.line}`, background: filter === v ? C.navy : '#fff', color: filter === v ? '#fff' : C.ink, fontSize: '.74rem', fontWeight: 700, cursor: 'pointer' }}>{t(l)}</button>
        ))}
      </div>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['documents.staff', 'common.status', 'documents.when'].map((h) => <th key={h} style={{ ...th(), padding: '9px 12px' }}>{t(h)}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="3" style={{ textAlign: 'center', color: C.muted, padding: 20, fontSize: '.82rem' }}>{t('documents.nobodyInView')}</td></tr>}
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${C.line}` }}>
                <td style={{ padding: '9px 12px', fontSize: '.82rem' }}>{r.name}{r.staffId ? <span style={{ color: C.muted }}> · {r.staffId}</span> : ''}{r.department ? <div style={{ color: C.muted, fontSize: '.7rem' }}>{r.department}</div> : null}</td>
                <td style={{ padding: '9px 12px', fontSize: '.78rem' }}>
                  {r.stale ? <span style={{ color: C.red, fontWeight: 700 }}>{t('documents.oldVersionN', { n: r.version })}</span>
                    : r.acknowledged ? <span style={{ color: C.green, fontWeight: 700 }}>{t('documents.ackOkVersion', { v: r.version })}</span>
                      : <span style={{ color: C.orange, fontWeight: 700 }}>{t('documents.pending')}</span>}
                </td>
                <td style={{ padding: '9px 12px', fontSize: '.76rem', color: C.muted }}>{r.acknowledgedAt ? fmtDateTime(r.acknowledgedAt) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function KTile({ label, value, color }) {
  const { t } = useLocale();
  return <div style={{ flex: 1, minWidth: 90, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 10px' }}>
    <div style={{ fontSize: '1.2rem', fontWeight: 800, color }}>{value}</div>
    <div style={{ fontSize: '.66rem', color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 700 }}>{t(label)}</div>
  </div>;
}

/* ============================ DOC MODAL (create / edit metadata) ============================ */
function DocModal({ mode, doc, onClose, onSaved }) {
  const { t } = useLocale();
  const editing = mode === 'edit';
  const [f, setF] = useState({
    title: doc?.title || '', category: doc?.category || 'policy', description: doc?.description || '',
    version: doc?.version || '', status: doc?.status || 'published',
    requireAcknowledgement: !!doc?.requireAcknowledgement,
    effectiveDate: doc?.effectiveDate ? doc.effectiveDate.slice(0, 10) : '',
    reviewDate: doc?.reviewDate ? doc.reviewDate.slice(0, 10) : '',
    expiryDate: doc?.expiryDate ? doc.expiryDate.slice(0, 10) : '',
    everyone: doc ? (doc.visibility || ['all']).includes('all') : true,
    roles: doc ? (doc.visibility || []).filter((v) => v !== 'all') : [],
  });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');

  function toggleRole(r) { setF((s) => ({ ...s, roles: s.roles.includes(r) ? s.roles.filter((x) => x !== r) : [...s.roles, r] })); }

  async function submit() {
    if (!f.title.trim()) { setErr(t('documents.msgTitleRequired')); return; }
    setBusy(true); setErr('');
    const payload = {
      title: f.title, category: f.category, description: f.description, status: f.status,
      requireAcknowledgement: f.requireAcknowledgement,
      effectiveDate: f.effectiveDate || null, reviewDate: f.reviewDate || null, expiryDate: f.expiryDate || null,
      visibility: f.everyone ? ['all'] : (f.roles.length ? f.roles : ['all']),
    };
    if (!editing && f.version) payload.version = f.version;
    try {
      let id = doc?._id;
      if (editing) await api.put(`/documents/company/${id}`, payload);
      else { const { data } = await api.post('/documents/company', payload); id = data._id; }
      if (file) { const fd = new FormData(); fd.append('file', file); await api.post(`/documents/company/${id}/file`, fd); }
      onSaved(editing ? t('documents.msgUpdated') : t('documents.msgAdded'));
    } catch (e) { setErr(e?.response?.data?.message || t('documents.msgCouldNotSave')); }
    finally { setBusy(false); }
  }

  return (
    <Overlay onClose={onClose}>
      <h2 style={{ color: C.navy, fontSize: '1.2rem', fontWeight: 800, margin: '0 0 16px' }}>{editing ? t('documents.editDocument') : t('documents.newDocHeading')}</h2>
      {err && <div style={{ background: '#fdecec', border: '1px solid #f6c9cb', color: C.red, padding: '9px 12px', borderRadius: 9, fontSize: '.84rem', marginBottom: 12 }}>{err}</div>}
      <Field label={t('documents.title')} value={f.title} onChange={(v) => setF({ ...f, title: v })} />
      <Row2>
        <div><Lbl>{t('documents.category')}</Lbl><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={inp()}>{CATS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select></div>
        <div><Lbl>{t('common.status')}</Lbl><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} style={inp()}><option value="draft">{t('documents.st_draft')}</option><option value="published">{t('documents.st_published')}</option><option value="archived">{t('documents.st_archived')}</option></select></div>
      </Row2>
      <Lbl>{t('documents.description')}</Lbl>
      <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={2} style={{ ...inp(), resize: 'vertical', fontFamily: 'inherit', marginBottom: 12 }} />
      <Row2>
        <Field label={t('documents.effectiveDate')} type="date" value={f.effectiveDate} onChange={(v) => setF({ ...f, effectiveDate: v })} />
        <Field label={t('documents.nextReview')} type="date" value={f.reviewDate} onChange={(v) => setF({ ...f, reviewDate: v })} />
      </Row2>
      <Row2>
        <Field label={t('documents.expiryDate')} type="date" value={f.expiryDate} onChange={(v) => setF({ ...f, expiryDate: v })} />
        {!editing && <Field label={t('documents.version')} value={f.version} onChange={(v) => setF({ ...f, version: v })} placeholder={t('documents.egOne')} />}
      </Row2>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', color: C.ink, margin: '2px 0 14px', background: '#fff8ee', border: '1px solid #fde4bf', borderRadius: 9, padding: '9px 11px' }}>
        <input type="checkbox" checked={f.requireAcknowledgement} onChange={(e) => setF({ ...f, requireAcknowledgement: e.target.checked })} />
        <span><strong>{t('documents.requireAck')}</strong>{t('documents.requireAckDesc')}</span>
      </label>
      <Lbl>{t('documents.visibility')}</Lbl>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', color: C.ink, marginBottom: 8 }}>
        <input type="checkbox" checked={f.everyone} onChange={(e) => setF({ ...f, everyone: e.target.checked })} /> {t('documents.everyone')}
      </label>
      {!f.everyone && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {ROLES.map(([v, l]) => (
            <button key={v} type="button" onClick={() => toggleRole(v)} style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${f.roles.includes(v) ? C.navy : C.line}`, background: f.roles.includes(v) ? C.navy : '#fff', color: f.roles.includes(v) ? '#fff' : C.ink, fontWeight: 600, fontSize: '.76rem', cursor: 'pointer' }}>{t(l)}</button>
          ))}
        </div>
      )}
      <Lbl>{doc?.file?.url ? t('documents.replaceFile') : t('documents.file')}</Lbl>
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ marginBottom: 8, fontSize: '.85rem' }} />
      {doc?.file?.url && !file && <div style={{ fontSize: '.78rem', color: C.muted, marginBottom: 12 }}>{t('documents.currentFile', { name: doc.file.name, v: doc.version })}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
        <button onClick={onClose} style={ghostBtn()}>{t('common.cancel')}</button>
        <button onClick={submit} disabled={busy} style={primaryBtn()}>{busy ? t('common.saving') : (editing ? t('common.save') : t('documents.addDocument'))}</button>
      </div>
    </Overlay>
  );
}

/* ============================ EMPLOYEE DOCUMENTS ============================ */
function EmployeeDocsTab({ onPreview }) {
  const { t } = useLocale();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

    useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true);
      try { const { data } = await api.get('/documents/employees', { params: { q } }); if (alive) setItems(data.items || []); }
      catch { if (alive) setItems([]); }
      finally { if (alive) setLoading(false); }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('documents.searchEmpDoc')} style={{ ...ctrl(), minWidth: 260, marginBottom: 16 }} />
      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'auto', boxShadow: '0 1px 2px rgba(1,33,88,.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['documents.employee', 'common.document', 'common.type', 'documents.uploaded', ''].map((h) => <th key={h} style={th()}>{h ? t(h) : ''}</th>)}</tr></thead>
          <tbody>
            {loading && <tr><td colSpan="5" style={{ textAlign: 'center', color: C.muted, padding: 30 }}>{t('common.loading')}</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center', color: C.muted, padding: 30 }}>{t('documents.noEmpDocs')}</td></tr>}
            {items.map((r, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${C.line}`, background: i % 2 ? '#fafbfe' : '#fff' }}>
                <td style={td()}>{r.employeeName || '—'}{r.staffId ? <span style={{ color: C.muted }}> · {r.staffId}</span> : ''}</td>
                <td style={td()}>{r.name || '—'} <span style={{ color: C.muted, fontSize: '.72rem' }}>{kb(r.bytes)}</span></td>
                <td style={{ ...td(), textTransform: 'capitalize' }}>{r.type || '—'}</td>
                <td style={td()}>{fmtDate(r.uploadedAt)}</td>
                <td style={{ ...td(), textAlign: 'right' }}>
                  {r.url ? <><button onClick={() => onPreview({ url: r.url, name: r.name, format: r.format })} style={miniBtn(C.blue)}>{t('common.preview')}</button> <a href={r.url} target="_blank" rel="noreferrer" style={{ ...miniBtn(C.navy), textDecoration: 'none' }}>{t('documents.open')}</a></> : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================ FILE PREVIEW ============================ */
function FilePreview({ file, onClose }) {
  const { t } = useLocale();
  const url = file?.url || '';
  const ext = extOf(file?.format || file?.name || url);
  const enc = encodeURIComponent(url);
  const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
  const isPdf = ext === 'pdf';
  const isOffice = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext);
  let body;
  if (isImg) body = <img src={url} alt={file?.name} style={{ maxWidth: '100%', maxHeight: '78vh', display: 'block', margin: '0 auto', borderRadius: 6 }} />;
  else if (isPdf) body = <iframe title="pdf" src={url} style={{ width: '100%', height: '80vh', border: 'none', borderRadius: 6 }} />;
  else if (isOffice) body = <iframe title="office" src={`https://view.officeapps.live.com/op/embed.aspx?src=${enc}`} style={{ width: '100%', height: '80vh', border: 'none', borderRadius: 6 }} />;
  else body = <iframe title="doc" src={`https://docs.google.com/gview?url=${enc}&embedded=true`} style={{ width: '100%', height: '80vh', border: 'none', borderRadius: 6 }} />;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(1,33,88,.6)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 80 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 920, background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 18px 44px rgba(1,33,88,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${C.line}` }}>
          <div style={{ fontWeight: 700, color: C.navy, fontSize: '.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file?.name || t('common.document')}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={url} target="_blank" rel="noreferrer" style={{ ...miniBtn(C.navy), textDecoration: 'none' }}>{t('common.openNewTab')}</a>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: C.muted, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        </div>
        <div style={{ padding: 14, background: '#f4f6f9' }}>{body}</div>
      </div>
    </div>
  );
}

/* ============================ shared ============================ */
function SubTab({ on, onClick, children }) {
  return <button onClick={onClick} style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: '10px 4px', marginRight: 14, fontWeight: 700, fontSize: '.82rem', color: on ? C.navy : C.muted }}>{children}{on && <span style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 3, background: C.blue, borderRadius: 3 }} />}</button>;
}
function Overlay({ children, onClose }) {
  return <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(1,33,88,.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'start center', padding: '40px 20px', zIndex: 60, overflowY: 'auto' }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 500, background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 18px 44px rgba(1,33,88,.3)', borderTop: `4px solid ${C.navy}` }}>{children}</div>
  </div>;
}
function Note({ children, onClose }) {
  return <div style={{ background: '#eaf2fd', border: '1px solid #cfe3fb', color: '#0f3d78', padding: '10px 13px', borderRadius: 10, fontSize: '.88rem', marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>{children}</span>{onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#0f3d78', cursor: 'pointer', fontWeight: 800 }}>×</button>}</div>;
}
function Field({ label, value, onChange, type = 'text', placeholder }) {
  return <label style={{ display: 'block', marginBottom: 12 }}><Lbl>{label}</Lbl><input type={type} value={value ?? ''} placeholder={placeholder || ''} onChange={(e) => onChange(e.target.value)} style={inp()} /></label>;
}
function Row2({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>; }
function Lbl({ children }) { return <div style={{ fontSize: '.68rem', color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>{children}</div>; }
function inp() { return { width: '100%', padding: '9px 11px', border: `1px solid #d8e0ec`, borderRadius: 9, fontSize: '.9rem', color: C.ink, background: '#fff', fontFamily: 'inherit' }; }
function ctrl() { return { padding: '9px 12px', border: `1px solid #d8e0ec`, borderRadius: 9, background: '#fff', color: C.ink, fontSize: '.85rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }; }
function primaryBtn() { return { padding: '10px 18px', border: 'none', borderRadius: 10, background: C.navy, color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }; }
function ghostBtn() { return { padding: '10px 18px', border: '1px solid #d8e0ec', borderRadius: 10, background: '#fff', color: C.ink, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }; }
function miniBtn(color) { return { padding: '5px 11px', border: `1px solid ${color}`, borderRadius: 7, background: '#fff', color, fontWeight: 700, fontSize: '.76rem', cursor: 'pointer', display: 'inline-block', fontFamily: 'inherit' }; }
function th() { return { textAlign: 'left', padding: '12px 16px', background: '#f4f7fc', color: C.navy, fontWeight: 700, fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.04em' }; }
function td() { return { padding: '12px 16px', fontSize: '.88rem', color: C.ink }; }