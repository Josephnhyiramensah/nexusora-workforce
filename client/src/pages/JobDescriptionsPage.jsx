import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Users, Building2, Briefcase, FileText, IdCard, CheckCircle2, AlertCircle, Paperclip } from 'lucide-react';
import { RouteShell, Hero, KpiBand, Kpi, Body } from '../ui/kit';
import { C } from '../ui/tokens';

/* Job Descriptions — edits Position.jobDescription. Type a JD, upload a soft copy,
   or download/print a branded PDF. Kit shell (People rail + hero); editor keeps its scoped "jd-" skin. */

const WRITE_ROLES = ['super_admin', 'hr_manager', 'hr_officer'];
const linesToArr = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
const arrToLines = (a) => (Array.isArray(a) ? a.join('\n') : '');
const fmtBytes = (b) => {
  if (!b && b !== 0) return '';
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
};
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const IMG = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'];
const isImage = (fmt, url = '') => IMG.includes(String(fmt || '').toLowerCase()) || /\.(png|jpe?g|webp|gif|bmp|svg)(\?|$)/i.test(url);
const gviewUrl = (f) => `https://docs.google.com/gview?url=${encodeURIComponent(f.url)}&embedded=true`;
const officeUrl = (f) => `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(f.url)}`;
const OFFICE = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
const extOf = (f) => {
  const fromFmt = String(f.format || '').toLowerCase();
  if (fromFmt && fromFmt.length <= 5) return fromFmt;
  const m = String(f.name || f.url || '').match(/\.([a-z0-9]+)(\?|$)/i);
  return m ? m[1].toLowerCase() : '';
};

const PEOPLE_RAIL = {
  brand: { title: 'People', subtitle: 'Workforce directory', Icon: Users },
  groups: [
    { title: 'Directory', items: [{ label: 'Employees', to: '/employees', Icon: Users }, { label: 'Organization', to: '/organization', Icon: Building2 }] },
    { title: 'Roles', items: [{ label: 'Positions', to: '/positions', Icon: Briefcase }, { label: 'Job Descriptions', to: '/job-descriptions', Icon: FileText }] },
    { title: 'Access', items: [{ label: 'Self-Service', to: '/self-service', Icon: IdCard }] },
  ],
};

const hasJD = (p) => {
  const jd = p.jobDescription || {};
  return !!(jd.summary || (jd.responsibilities || []).length || (jd.requirements || []).length || (jd.competencies || []).length || jd.file);
};

export default function JobDescriptionsPage() {
  const { user, tenant } = useAuth();
  const canWrite = WRITE_ROLES.includes(user?.role);

  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [jdFilter, setJdFilter] = useState('all');
  const [selId, setSelId] = useState(null);
  const [form, setForm] = useState({ summary: '', responsibilities: '', requirements: '', competencies: '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const { data } = await api.get('/positions'); setPositions(data.items || []); }
    catch (err) { setError(err?.response?.data?.message || 'Could not load positions.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const selected = positions.find((p) => p._id === selId) || null;

  const select = (p) => {
    setSelId(p._id); setMsg('');
    const jd = p.jobDescription || {};
    setForm({ summary: jd.summary || '', responsibilities: arrToLines(jd.responsibilities), requirements: arrToLines(jd.requirements), competencies: arrToLines(jd.competencies) });
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true); setMsg('');
    try {
      const jobDescription = { summary: form.summary.trim(), responsibilities: linesToArr(form.responsibilities), requirements: linesToArr(form.requirements), competencies: linesToArr(form.competencies), file: selected.jobDescription?.file, updatedAt: new Date().toISOString() };
      await api.put(`/positions/${selected._id}`, { jobDescription });
      setPositions((list) => list.map((p) => (p._id === selected._id ? { ...p, jobDescription } : p)));
      setMsg('Saved.');
    } catch (err) { setMsg(err?.response?.data?.message || 'Could not save.'); }
    finally { setSaving(false); }
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f || !selected) return;
    setUploading(true); setMsg('');
    try {
      const fd = new FormData(); fd.append('file', f); fd.append('name', f.name);
      const { data } = await api.post(`/positions/${selected._id}/jd-file`, fd);
      const file = data.jobDescription?.file || null;
      setPositions((list) => list.map((p) => (p._id === selected._id ? { ...p, jobDescription: { ...(p.jobDescription || {}), file } } : p)));
      setMsg('Soft copy uploaded.');
    } catch (err) { setMsg(err?.response?.data?.message || 'Upload failed.'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const removeFile = async () => {
    if (!selected || !window.confirm('Remove the attached soft copy?')) return;
    setMsg('');
    try {
      const { data } = await api.delete(`/positions/${selected._id}/jd-file`);
      const file = data.jobDescription?.file || null;
      setPositions((list) => list.map((p) => (p._id === selected._id ? { ...p, jobDescription: { ...(p.jobDescription || {}), file } } : p)));
      setMsg('Soft copy removed.');
    } catch (err) { setMsg(err?.response?.data?.message || 'Could not remove.'); }
  };

  const printJD = () => {
    if (!selected) return;
    const listHtml = (text) => { const arr = linesToArr(text); return arr.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="none">—</p>'; };
    const meta = [selected.code, selected.grade ? `Grade ${selected.grade}` : '', selected.department?.name].filter(Boolean).map(esc).join(' &middot; ');
    const b = tenant?.branding || {};
    const coName = esc(b.companyName || tenant?.name || 'Company');
    const contact = [b.address, b.phone, b.email, b.website].filter(Boolean).map(esc).join(' &middot; ');
    const headerHtml = b.letterhead
      ? `<div class="lh"><img src="${b.letterhead}" alt=""/><div class="accent"></div><div class="doc" style="margin-top:8px">Job Description</div></div>`
      : `<div class="hd"><div class="co-row">${b.logo ? `<img class="logo" src="${b.logo}" alt=""/>` : ''}<div><div class="co">${coName}</div>${contact ? `<div class="contact">${contact}</div>` : ''}</div></div><div class="doc">Job Description</div></div>`;
    const footer = b.footerNote ? `${esc(b.footerNote)} &middot; Generated by Nexusora Workforce` : 'Generated by Nexusora Workforce';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(selected.title)} — Job Description</title>
      <style>*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#1f2733;margin:0;padding:34px 42px}.hd{border-bottom:3px solid #012158;padding-bottom:12px;margin-bottom:20px;display:flex;align-items:flex-end;justify-content:space-between;gap:16px}.co-row{display:flex;align-items:center;gap:14px}.logo{height:52px;width:auto}.co{font-size:20px;font-weight:800;color:#012158}.contact{font-size:11px;color:#5b6b7f;margin-top:2px}.lh{margin-bottom:20px}.lh img{width:100%;display:block}.accent{height:3px;background:linear-gradient(90deg,#012158 50%,#FD9C09 50%);margin-top:6px}.doc{font-size:12px;color:#5b6b7f;letter-spacing:.08em;text-transform:uppercase;margin-top:2px}h1{font-size:22px;color:#012158;margin:14px 0 2px}.meta{font-size:12px;color:#5b6b7f;margin-bottom:14px}h2{font-size:13px;color:#012158;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e8ec;padding-bottom:4px;margin:20px 0 8px}p{font-size:13px;line-height:1.6;margin:0 0 8px}ul{margin:0;padding-left:20px}li{font-size:13px;line-height:1.6;margin-bottom:4px}.none{color:#9aa4b2}.ft{margin-top:30px;border-top:1px solid #e5e8ec;padding-top:8px;font-size:10px;color:#9aa4b2}@media print{body{padding:0 8px}}</style></head><body>
      ${headerHtml}<h1>${esc(selected.title)}</h1><div class="meta">${meta}</div>
      <h2>Role Summary</h2>${form.summary.trim() ? `<p>${esc(form.summary)}</p>` : '<p class="none">—</p>'}
      <h2>Key Responsibilities</h2>${listHtml(form.responsibilities)}<h2>Requirements</h2>${listHtml(form.requirements)}<h2>Competencies</h2>${listHtml(form.competencies)}
      <div class="ft">${footer}</div></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { setMsg('Allow pop-ups to print/download.'); return; }
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => { try { w.print(); } catch { /* user can print manually */ } }, 350);
  };

  const matchQ = (p) => { if (!q.trim()) return true; const s = q.trim().toLowerCase(); return (p.title || '').toLowerCase().includes(s) || (p.code || '').toLowerCase().includes(s); };
  const matchJd = (p) => jdFilter === 'withjd' ? hasJD(p) : jdFilter === 'missing' ? !hasJD(p) : jdFilter === 'file' ? !!p.jobDescription?.file : true;
  const filtered = positions.filter((p) => matchQ(p) && matchJd(p));
  const file = selected?.jobDescription?.file;

  const total = positions.length;
  const withJD = positions.filter(hasJD).length;
  const withFile = positions.filter((p) => p.jobDescription?.file).length;
  const JD_LABEL = { all: '', withjd: 'With a JD', missing: 'Missing a JD', file: 'With soft copy' };

  return (
    <RouteShell brand={PEOPLE_RAIL.brand} groups={PEOPLE_RAIL.groups}>
      <style>{STYLES}</style>
      <Hero crumbs={['People', 'Job Descriptions']} title="Job Descriptions"
 />
      <KpiBand>
        <Kpi Icon={Briefcase} label="Positions" value={loading ? '—' : total} foot={<span>defined seats</span>} onClick={() => setJdFilter('all')} />
        <Kpi Icon={CheckCircle2} iconColor={C.green} iconBg={C.greenBg} label="With a JD" value={loading ? '—' : withJD} pill={!loading && total ? [`${Math.round((withJD / total) * 100)}%`, 'green'] : null} foot={<span>documented</span>} onClick={() => setJdFilter('withjd')} />
        <Kpi Icon={AlertCircle} iconColor={C.amber} iconBg={C.amberBg} label="Missing" value={loading ? '—' : total - withJD} pill={!loading && total - withJD ? ['to write', 'amber'] : null} foot={<span>no description yet</span>} onClick={() => setJdFilter('missing')} />
        <Kpi Icon={Paperclip} iconColor={C.navy} iconBg={C.greyBg} label="Soft copies" value={loading ? '—' : withFile} foot={<span>files attached</span>} onClick={() => setJdFilter('file')} />
      </KpiBand>
      <Body>
        <div>
          {error && <div className="jd-err">{error}</div>}
          {loading ? <p className="jd-muted">Loading positions…</p> : (
            <div className="jd-grid">
              <div className="jd-list">
                <input className="jd-search" placeholder="Search positions…" value={q} onChange={(e) => setQ(e.target.value)} />
                {jdFilter !== 'all' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 4px 8px', fontSize: '.78rem', fontWeight: 700, color: C.navy }}><span>{JD_LABEL[jdFilter]} · {filtered.length}</span><button onClick={() => setJdFilter('all')} style={{ border: `1px solid ${C.line}`, background: '#fff', color: C.accentInk, fontWeight: 700, fontSize: '.74rem', borderRadius: 7, padding: '3px 9px', cursor: 'pointer', fontFamily: 'inherit' }}>Clear ✕</button></div>}
                <div className="jd-list-scroll">
                  {filtered.length ? filtered.map((p) => (
                    <button key={p._id} className={'jd-item' + (p._id === selId ? ' on' : '')} onClick={() => select(p)}>
                      <span className="jd-item-title">{p.title}</span>
                      <span className="jd-item-meta">{p.code || '—'}{hasJD(p) ? <span className="jd-badge">JD</span> : null}</span>
                    </button>
                  )) : <p className="jd-muted" style={{ padding: 12 }}>No positions match.</p>}
                </div>
              </div>

              <div className="jd-editor">
                {!selected ? (
                  <div className="jd-empty">
                    <div className="jd-empty-mark">📋</div>
                    <div className="jd-empty-title">Select a position</div>
                    <div className="jd-empty-note">Pick a position on the left to view, edit, upload or download its job description.</div>
                  </div>
                ) : (
                  <div className="jd-card">
                    <div className="jd-card-head">
                      <div>
                        <div className="jd-pos-title">{selected.title}</div>
                        <div className="jd-pos-meta">{selected.code || '—'}{selected.grade ? ` · Grade ${selected.grade}` : ''}{selected.department?.name ? ` · ${selected.department.name}` : ''}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        {msg && <span className={'jd-msg' + (/saved|uploaded|removed/i.test(msg) ? ' ok' : ' err')}>{msg}</span>}
                        <button className="jd-btn" onClick={printJD}>⤓ Download / Print</button>
                      </div>
                    </div>

                    <div className="jd-attach">
                      <div className="jd-attach-label">Existing soft copy</div>
                      {file ? (
                        <div className="jd-file">
                          <span className="jd-file-ico">📎</span>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="jd-file-name">{file.name}</div>
                            <div className="jd-file-meta">{(file.format || '').toUpperCase()}{file.bytes ? ` · ${fmtBytes(file.bytes)}` : ''}</div>
                          </div>
                          <button className="jd-mini" onClick={() => setPreview(file)}>Preview</button>
                          <a className="jd-mini" href={file.url} target="_blank" rel="noreferrer">Download</a>
                          {canWrite && <button className="jd-mini no" onClick={removeFile}>Remove</button>}
                        </div>
                      ) : (
                        <div className="jd-file empty">
                          <span style={{ color: '#8a94a6', fontSize: '.86rem' }}>No soft copy attached.</span>
                          {canWrite && (<>
                            <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={onFile} accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp" />
                            <button className="jd-mini" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? 'Uploading…' : 'Upload soft copy'}</button>
                          </>)}
                        </div>
                      )}
                    </div>

                    <label className="jd-field">Role summary
                      <textarea rows={3} value={form.summary} disabled={!canWrite} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} placeholder="A short statement of the position’s purpose." />
                    </label>
                    <label className="jd-field">Key responsibilities <span className="jd-hint">one per line</span>
                      <textarea rows={6} value={form.responsibilities} disabled={!canWrite} onChange={(e) => setForm((f) => ({ ...f, responsibilities: e.target.value }))} placeholder={'Manage the IT team\nOwn system uptime\n…'} />
                    </label>
                    <label className="jd-field">Requirements <span className="jd-hint">one per line</span>
                      <textarea rows={5} value={form.requirements} disabled={!canWrite} onChange={(e) => setForm((f) => ({ ...f, requirements: e.target.value }))} placeholder={'Degree in Computer Science\n5+ years experience\n…'} />
                    </label>
                    <label className="jd-field">Competencies <span className="jd-hint">one per line</span>
                      <textarea rows={4} value={form.competencies} disabled={!canWrite} onChange={(e) => setForm((f) => ({ ...f, competencies: e.target.value }))} placeholder={'Leadership\nProblem solving\n…'} />
                    </label>

                    {canWrite && <div style={{ marginTop: 6 }}><button className="jd-btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save job description'}</button></div>}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Body>

      {preview && (
        <div className="jd-overlay" onClick={() => setPreview(null)}>
          <div className="jd-modal" onClick={(e) => e.stopPropagation()}>
            <div className="jd-modal-head">
              <span className="jd-modal-name">{preview.name}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <a className="jd-mini" href={preview.url} target="_blank" rel="noreferrer">Download</a>
                <button className="jd-mini" onClick={() => setPreview(null)}>Close</button>
              </div>
            </div>
            <div className="jd-modal-body">
              {(() => {
                const iframeStyle = { width: '100%', height: '100%', border: 'none' };
                const ext = extOf(preview);
                if (isImage(preview.format, preview.url)) return <img src={preview.url} alt={preview.name} style={{ maxWidth: '100%', display: 'block', margin: '0 auto' }} />;
                if (ext === 'pdf') return <iframe title="preview" src={preview.url} style={iframeStyle} />;
                if (OFFICE.includes(ext)) return <iframe title="preview" src={officeUrl(preview)} style={iframeStyle} />;
                return <iframe title="preview" src={gviewUrl(preview)} style={iframeStyle} />;
              })()}
            </div>
          </div>
        </div>
      )}
    </RouteShell>
  );
}

const STYLES = `
.jd-muted{color:#8a94a6;font-size:.9rem;padding:16px 4px}
.jd-err{background:#fdeaea;color:#b3261e;border:1px solid #f5c6c6;padding:10px 14px;border-radius:8px;font-size:.85rem;margin-bottom:12px}
.jd-grid{display:grid;grid-template-columns:300px 1fr;gap:18px;align-items:start}
.jd-list{background:#fff;border:1px solid #e5e8ec;border-radius:14px;box-shadow:0 1px 2px rgba(1,33,88,.05);padding:12px;position:sticky;top:74px}
.jd-search{width:100%;box-sizing:border-box;font-family:inherit;font-size:.88rem;padding:9px 11px;border:1px solid #d8e0ec;border-radius:9px;margin-bottom:10px;color:#1f2733}
.jd-list-scroll{max-height:60vh;overflow-y:auto;display:flex;flex-direction:column;gap:4px}
.jd-item{display:flex;flex-direction:column;gap:2px;text-align:left;appearance:none;border:none;background:none;cursor:pointer;padding:10px 12px;border-radius:9px;font-family:inherit}
.jd-item:hover{background:#f7faff}
.jd-item.on{background:#eef4ff;box-shadow:inset 3px 0 0 #168eff}
.jd-item-title{font-size:.9rem;font-weight:700;color:#012158}
.jd-item-meta{font-size:.74rem;color:#8a94a6;display:flex;align-items:center;gap:8px}
.jd-badge{background:#e7f6ee;color:#1a7f47;font-weight:800;font-size:.6rem;padding:1px 6px;border-radius:5px;letter-spacing:.04em}
.jd-editor{min-width:0}
.jd-card{background:#fff;border:1px solid #e5e8ec;border-radius:14px;box-shadow:0 1px 2px rgba(1,33,88,.05);padding:20px 22px}
.jd-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.jd-pos-title{font-size:1.2rem;font-weight:800;color:#012158}
.jd-pos-meta{font-size:.8rem;color:#8a94a6;margin-top:2px}
.jd-msg{font-size:.8rem;font-weight:700;padding:4px 10px;border-radius:999px}
.jd-msg.ok{background:#e7f6ee;color:#1a7f47}
.jd-msg.err{background:#fdeaea;color:#b3261e}
.jd-attach{border:1px solid #eef1f5;background:#f7f9fc;border-radius:10px;padding:12px 14px;margin-bottom:18px}
.jd-attach-label{font-size:.66rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#8a94a6;margin-bottom:8px}
.jd-file{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.jd-file.empty{justify-content:space-between}
.jd-file-ico{font-size:1.2rem}
.jd-file-name{font-size:.9rem;font-weight:700;color:#012158;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.jd-file-meta{font-size:.74rem;color:#8a94a6}
.jd-field{display:block;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#5b6b7f;margin-bottom:16px}
.jd-hint{text-transform:none;letter-spacing:normal;font-weight:600;color:#a3adbb;margin-left:6px}
.jd-field textarea{display:block;width:100%;box-sizing:border-box;margin-top:6px;font-family:inherit;font-size:.9rem;font-weight:500;text-transform:none;letter-spacing:normal;color:#1f2733;padding:10px 12px;border:1px solid #d8e0ec;border-radius:9px;resize:vertical;line-height:1.5}
.jd-field textarea:disabled{background:#f7f9fc;color:#5b6b7f}
.jd-btn{appearance:none;border:1px solid #d8e0ec;background:#fff;color:#012158;font-weight:700;font-size:.85rem;padding:9px 16px;border-radius:9px;cursor:pointer;font-family:inherit}
.jd-btn.primary{background:#012158;color:#fff;border-color:#012158;padding:10px 20px}
.jd-btn:disabled{opacity:.55;cursor:default}
.jd-mini{appearance:none;border:1px solid #d8e0ec;background:#fff;color:#012158;font-weight:700;font-size:.76rem;padding:6px 12px;border-radius:8px;cursor:pointer;font-family:inherit;text-decoration:none;display:inline-block}
.jd-mini.no{border-color:#f0c4c4;color:#b3261e}
.jd-mini:disabled{opacity:.55;cursor:default}
.jd-empty{background:#fff;border:1px dashed #cfd8e3;border-radius:14px;padding:52px 24px;text-align:center}
.jd-empty-mark{font-size:2rem;margin-bottom:10px}
.jd-empty-title{font-size:1.05rem;font-weight:800;color:#012158}
.jd-empty-note{font-size:.86rem;color:#5b6b7f;margin-top:4px}
.jd-overlay{position:fixed;inset:0;background:rgba(1,20,50,.55);display:flex;align-items:center;justify-content:center;padding:24px;z-index:1000}
.jd-modal{background:#fff;border-radius:14px;width:100%;max-width:900px;height:82vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(1,33,88,.35)}
.jd-modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid #e5e8ec}
.jd-modal-name{font-weight:800;color:#012158;font-size:.95rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.jd-modal-body{flex:1;background:#f4f6f9;overflow:auto;padding:12px}
@media(max-width:820px){.jd-grid{grid-template-columns:1fr}.jd-list{position:static}}
`;