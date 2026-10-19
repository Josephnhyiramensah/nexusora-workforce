/* =====================================================================
   AuditLogPage — the tenant's own activity trail (C1). A filterable,
   paginated view of every change made in this workspace, with a detail
   tray per entry. Admin / HR-manager only (route + API both gate it).
   ===================================================================== */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { exportTable, ExportButton } from '../utils/exporter';
import AuditDetailTray from '../components/AuditDetailTray';
import { describe, verbTone, resourceLabel, VERB_OF } from '../utils/audit';
import { ScrollText, Search, Filter, X, ChevronLeft, ChevronRight, ShieldAlert, RotateCcw } from 'lucide-react';
import { Hero, KpiBand, Kpi, Body, Card, Empty, TableWrap } from '../ui/kit';
import { C, NUM, FONT, cap, initials, gradOf, inp, ghostBtn, td, rowStyle } from '../ui/tokens';

const PAGE_SIZE = 50;
const VIEW_ROLES = ['super_admin', 'hr_manager'];

function relTime(d) {
  if (!d) return '—';
  const ms = Date.now() - new Date(d).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24); if (days < 30) return `${days}d ago`;
  try { return new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return '—'; }
}
function fmtTime(d) { try { return new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch { return '—'; } }

const EMPTY_FILTERS = { q: '', actor: '', resource: '', verb: '', from: '', to: '', impersonated: false };

export default function AuditLogPage() {
  const { user } = useAuth();
  const allowed = VIEW_ROLES.includes(user?.role);
  const [params, setParams] = useSearchParams();

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [q, setQ] = useState('');                 // debounced search mirror
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [facets, setFacets] = useState({ actors: [], resources: [], verbs: ['create', 'update', 'delete'] });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [active, setActive] = useState(null);     // entry open in the tray
  const debounce = useRef();

  // Debounce the free-text box into `filters.q`.
  const onSearch = (val) => {
    setQ(val);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { setFilters((f) => ({ ...f, q: val })); setPage(1); }, 350);
  };

  const setFilter = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };
  const reset = () => { setFilters(EMPTY_FILTERS); setQ(''); setPage(1); };

  // Load facets once (for the dropdowns).
  useEffect(() => {
    if (!allowed) return;
    let a = true;
    (async () => {
      try { const { data } = await api.get('/audit/facets'); if (a) setFacets({ actors: data.actors || [], resources: data.resources || [], verbs: data.verbs || ['create', 'update', 'delete'] }); }
      catch { /* dropdowns just stay empty */ }
    })();
    return () => { a = false; };
  }, [allowed]);

  const query = useCallback(() => {
    const p = { page, limit: PAGE_SIZE };
    if (filters.q) p.q = filters.q;
    if (filters.actor) p.actor = filters.actor;
    if (filters.resource) p.resource = filters.resource;
    if (filters.verb) p.verb = filters.verb;
    if (filters.from) p.from = filters.from;
    if (filters.to) p.to = filters.to;
    if (filters.impersonated) p.impersonated = 'true';
    return p;
  }, [page, filters]);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true); setErr('');
    try { const { data } = await api.get('/audit', { params: query() }); setData(data); }
    catch (e) { setErr(e?.response?.data?.message || 'Could not load the audit log.'); }
    finally { setLoading(false); }
  }, [allowed, query]);
  useEffect(() => { load(); }, [load]);

  // Deep-link: ?entry=<id> opens the tray (works on a fresh page load / shared link).
  useEffect(() => {
    const id = params.get('entry');
    if (!id) { setActive(null); return; }
    if (active && active._id === id) return;
    let a = true;
    (async () => {
      try { const { data } = await api.get(`/audit/${id}`); if (a) setActive(data); }
      catch { if (a) closeTray(); }
    })();
    return () => { a = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  function openTray(entry) { setActive(entry); const next = new URLSearchParams(params); next.set('entry', entry._id); setParams(next, { replace: true }); }
  function closeTray() { setActive(null); const next = new URLSearchParams(params); next.delete('entry'); setParams(next, { replace: true }); }

  async function doExport() {
    // Export the current filter result set (up to 2000 rows) — a real export,
    // not just the visible page.
    const { data } = await api.get('/audit', { params: { ...query(), page: 1, limit: 2000 } });
    const rows = (data.items || []).map((e) => ({
      when: fmtTime(e.at),
      actor: (e.actor && (e.actor.name || e.actor.email)) || cap(e.actor?.type) || '—',
      role: cap(e.actor?.role) || '—',
      action: describe(e.action, e.method),
      code: e.action || '—',
      request: `${e.method || ''} ${e.path || ''}`.trim(),
      status: e.statusCode ?? '—',
      ip: e.ip || '—',
      flag: e.meta && e.meta.impersonated ? 'Impersonated' : '',
    }));
    const applied = {};
    if (filters.q) applied.Search = filters.q;
    if (filters.resource) applied.Resource = resourceLabel(filters.resource);
    if (filters.verb) applied.Action = cap(filters.verb);
    if (filters.from) applied.From = filters.from;
    if (filters.to) applied.To = filters.to;
    if (filters.impersonated) applied.Impersonated = 'yes';
    await exportTable({
      filename: `audit-log-${new Date().toISOString().slice(0, 10)}`,
      sheet: 'Audit Log', title: 'Audit Log', subtitle: `${data.total} event${data.total === 1 ? '' : 's'}`,
      filters: applied,
      columns: [
        { key: 'when', label: 'When' }, { key: 'actor', label: 'Actor' }, { key: 'role', label: 'Role' },
        { key: 'action', label: 'Action' }, { key: 'code', label: 'Code' }, { key: 'request', label: 'Request' },
        { key: 'status', label: 'Status', align: 'center' }, { key: 'ip', label: 'IP' }, { key: 'flag', label: 'Flag' },
      ],
      rows,
    });
  }

  if (!allowed) {
    return (
      <>
        <Hero crumbs={['Admin', 'Audit Log']} title="Audit Log" subtitle="Who did what, and when." />
        <Body><Card><Empty>You don’t have access to the audit log. Ask a workspace administrator.</Empty></Card></Body>
      </>
    );
  }

  const items = data.items || [];
  const total = data.total || 0;
  const pages = data.pages || 1;
  const impersonatedCount = items.filter((i) => i.meta && i.meta.impersonated).length;
  const activeFilters = Object.entries(filters).filter(([k, v]) => v && v !== '' && !(k === 'impersonated' && v === false)).length;

  return (
    <>
      <Hero
        crumbs={['Admin', 'Audit Log']}
        title="Audit Log"
        actions={<ExportButton onClick={doExport} label="Export" />}
      />

      <KpiBand>
        <Kpi Icon={ScrollText} iconColor={C.navy} iconBg={C.greyBg} label="Events" value={loading ? '—' : total.toLocaleString()} foot={<span>{activeFilters ? 'matching filters' : 'all time'}</span>} />
        <Kpi Icon={Filter} iconColor={C.accentInk} iconBg="#e6f1fd" label="Active filters" value={activeFilters} foot={<span>{activeFilters ? 'narrowing results' : 'none applied'}</span>} onClick={activeFilters ? reset : undefined} />
        <Kpi Icon={ShieldAlert} iconColor={C.amber} iconBg={C.amberBg} label="Impersonated (page)" value={loading ? '—' : impersonatedCount} pill={impersonatedCount ? ['review', 'amber'] : null} foot={<span>platform login-as</span>} onClick={() => setFilter('impersonated', !filters.impersonated)} />
        <Kpi Icon={RotateCcw} iconColor={C.green} iconBg={C.greenBg} label="Page" value={`${page} / ${pages}`} foot={<span>{PAGE_SIZE} per page</span>} />
      </KpiBand>

      <Body>
        <div style={{ minWidth: 0 }}>
          {/* ---- Filter bar ---- */}
          <Card pad="14px 16px">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
                <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: C.muted2 }} />
                <input value={q} onChange={(e) => onSearch(e.target.value)} placeholder="Search action, path, person…" style={{ ...inp, paddingLeft: 32 }} />
              </div>
              <FilterSelect label="Everyone" value={filters.actor} onChange={(v) => setFilter('actor', v)}
                options={facets.actors.map((a) => [a.id, a.name || a.email || a.id])} />
              <FilterSelect label="All resources" value={filters.resource} onChange={(v) => setFilter('resource', v)}
                options={facets.resources.map((r) => [r, resourceLabel(r)])} />
              <FilterSelect label="All actions" value={filters.verb} onChange={(v) => setFilter('verb', v)}
                options={facets.verbs.map((v) => [v, cap(v)])} />
              <input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} aria-label="From date" style={{ ...inp, width: 150 }} />
              <input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} aria-label="To date" style={{ ...inp, width: 150 }} />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: '.82rem', fontWeight: 600, color: C.ink, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={filters.impersonated} onChange={(e) => setFilter('impersonated', e.target.checked)} /> Impersonated only
              </label>
              {activeFilters > 0 && (
                <button onClick={reset} style={{ ...ghostBtn, padding: '8px 12px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.82rem' }}><X size={14} /> Clear</button>
              )}
            </div>
          </Card>

          {/* ---- Table ---- */}
          <div style={{ marginTop: 16 }}>
            <Card title="Activity" sub={loading ? '' : `${total.toLocaleString()} event${total === 1 ? '' : 's'}`}>
              {err ? <Empty>{err}</Empty> : loading ? <Empty>Loading…</Empty> : items.length === 0 ? (
                <Empty>{activeFilters ? 'No events match these filters.' : 'No activity recorded yet. Changes made in this workspace will appear here.'}</Empty>
              ) : (
                <>
                  <TableWrap head={[['When'], ['Actor'], ['Action'], ['Details'], ['']]}>
                    {items.map((e) => {
                      const who = (e.actor && (e.actor.name || e.actor.email)) || (e.actor?.type === 'system' ? 'System' : 'Unknown');
                      const [, vtone] = verbTone(VERB_OF(e.action, e.method));
                      const imp = e.meta && e.meta.impersonated;
                      return (
                        <tr key={e._id} className="nx-row" style={{ ...rowStyle }} onClick={() => openTray(e)}>
                          <td style={{ ...td, whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 600, color: C.ink }}>{relTime(e.at)}</div>
                            <div style={{ fontSize: '.72rem', color: C.muted2, ...NUM }}>{fmtTime(e.at)}</div>
                          </td>
                          <td style={td}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ width: 30, height: 30, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: '.68rem', background: gradOf(who) }}>{initials(who)}</span>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>{who}{imp ? <ShieldAlert size={13} style={{ color: C.amber }} /> : null}</div>
                                <div style={{ fontSize: '.72rem', color: C.muted2 }}>{cap(e.actor?.role) || cap(e.actor?.type) || '—'}</div>
                              </div>
                            </div>
                          </td>
                          <td style={td}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 999, color: vtone[0], background: vtone[1], whiteSpace: 'nowrap' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />{describe(e.action, e.method)}</span>
                          </td>
                          <td style={{ ...td, color: C.muted, ...NUM, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: '.78rem', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.method} {e.path}</td>
                          <td style={{ ...td, textAlign: 'right', color: C.muted2 }}><ChevronRight size={16} /></td>
                        </tr>
                      );
                    })}
                  </TableWrap>

                  {/* ---- Pagination ---- */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 16, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '.8rem', color: C.muted2, ...NUM }}>
                      {total === 0 ? '0' : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)}`} of {total.toLocaleString()}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={pgBtn(page <= 1)}><ChevronLeft size={15} /> Prev</button>
                      <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} style={pgBtn(page >= pages)}>Next <ChevronRight size={15} /></button>
                    </div>
                  </div>
                </>
              )}
            </Card>
          </div>
        </div>
      </Body>

      {active && <AuditDetailTray entry={active} onClose={closeTray} />}
      <div style={{ height: 40 }} />
    </>
  );
}

/* A compact filter dropdown with a neutral "all" first option. */
function FilterSelect({ label, value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: '9px 11px', border: '1px solid #d8e0ec', borderRadius: 9, background: '#fff', color: value ? C.ink : C.muted2, fontSize: '.84rem', fontWeight: 600, cursor: 'pointer', fontFamily: FONT, maxWidth: 190 }}>
      <option value="">{label}</option>
      {options.map(([v, l]) => <option key={v} value={v} style={{ color: C.ink }}>{l}</option>)}
    </select>
  );
}

function pgBtn(disabled) {
  return { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 13px', border: `1px solid ${C.line}`, borderRadius: 9, background: disabled ? '#f4f6f9' : '#fff', color: disabled ? C.muted2 : C.ink, fontWeight: 600, fontSize: '.82rem', cursor: disabled ? 'default' : 'pointer', fontFamily: FONT, opacity: disabled ? 0.7 : 1 };
}
