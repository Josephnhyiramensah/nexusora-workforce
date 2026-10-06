/* =====================================================================
   NotificationBell — the top-bar inbox, modelled on Nexusora Books.

   The bell is an INBOX, not an archive: it lists only UNREAD items. Once an
   item is read it leaves the bell. Two kinds of item are shown:
     • real     — notifications stored on the server (/notifications)
     • derived  — live, computed alerts (e.g. leave awaiting approval) that are
                  not stored; they disappear once the underlying work is done.
   Ages are measured against the SERVER clock (serverNow) so a device with a
   wrong timezone doesn't report a fresh item as hours old.
   ===================================================================== */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, X, ArrowRight } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';

const C = { navy: '#012158', line: '#e6ebf3', ink: '#16233b', muted: '#67728a', muted2: '#8b96a9', red: '#e5484d' };
const typeDot = { danger: '#DC2626', warning: '#D97706', info: '#2563EB', success: '#16A34A' };

// Roles that approve leave — they get the derived "awaiting approval" alert.
const APPROVER_ROLES = ['super_admin', 'hr_manager', 'hr_officer', 'line_manager'];

export default function NotificationBell({ compact = false }) {
  const [open, setOpen] = useState(false);
  const [real, setReal] = useState([]);
  const [derived, setDerived] = useState([]);
  const [unreadReal, setUnreadReal] = useState(0);
  const [skew, setSkew] = useState(0);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef(null);
  // Derived alerts the user dismissed this session; recomputed on every open, so
  // without this a dismissed alert would reappear immediately.
  const dismissedRef = useRef(new Set());
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLocale();

  // tr(key, fallback) — use a translation if present, else a safe English default,
  // so the bell works even before these keys are added to the locale files.
  const tr = (key, fallback, vars) => { const s = t(key, vars); return s === key ? fallback : s; };

  // close on outside click
  useEffect(() => {
    const handle = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const fetchUnread = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications/unread-count');
      if (data?.success) setUnreadReal(data.data?.count || 0);
    } catch { /* badge stays as-is */ }
  }, []);

  // poll the cheap count every 60s
  useEffect(() => {
    fetchUnread();
    const id = setInterval(fetchUnread, 60000);
    return () => clearInterval(id);
  }, [fetchUnread]);

  const fetchReal = async () => {
    try {
      const { data } = await api.get('/notifications?limit=50');
      if (data?.success) {
        setReal((data.data || []).filter((n) => !n.read));
        setUnreadReal(data.unread || 0);
        if (data.serverNow) setSkew(Date.now() - data.serverNow);
      }
    } catch { setReal([]); }
  };

  // Live, computed alerts. Each is wrapped in try/catch so a missing/other-shaped
  // endpoint simply yields no alert rather than breaking the bell.
  const fetchDerived = async () => {
    const items = [];
    if (APPROVER_ROLES.includes(user?.role)) {
      try {
        const { data } = await api.get('/leave/requests', { params: { status: 'pending' } });
        const list = Array.isArray(data) ? data : (data?.items || []);
        if (list.length > 0) {
          items.push({
            id: 'leave-pending',
            type: 'warning',
            title: tr('notif.leavePending', `${list.length} leave request${list.length > 1 ? 's' : ''} awaiting approval`, { count: list.length }),
            message: tr('notif.leavePendingMsg', 'Review and approve pending leave requests'),
            path: '/leave',
            time: tr('notif.approve', 'Approve'),
          });
        }
      } catch { /* no alert */ }
    }
    setDerived(items.filter((n) => !dismissedRef.current.has(n.id)));
  };

  const handleOpen = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      await Promise.all([fetchReal(), fetchDerived()]);
      setLoading(false);
    }
  };

  // Click a real item → mark it read (removes it from the bell on next open) then
  // follow its link if it has one.
  const openReal = async (n) => {
    setOpen(false);
    setReal((prev) => prev.filter((x) => x._id !== n._id));
    setUnreadReal((c) => Math.max(0, c - 1));
    try { await api.post(`/notifications/${n._id}/read`); } catch { /* ignore */ }
    if (n.link) navigate(n.link);
  };

  const markAllRead = async (e) => {
    e.stopPropagation();
    setReal([]);
    setUnreadReal(0);
    try { await api.post('/notifications/read-all'); } catch { /* ignore */ }
  };

  const handleDerivedClick = (n) => { setOpen(false); navigate(n.path); };
  const dismissDerived = (e, id) => { e.stopPropagation(); dismissedRef.current.add(id); setDerived((prev) => prev.filter((n) => n.id !== id)); };

  const ago = (d) => {
    const ms = (Date.now() - skew) - new Date(d).getTime();
    if (ms < 60000) return tr('notif.justNow', 'Just now');
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return days < 7 ? `${days}d` : new Date(d).toLocaleDateString();
  };

  const badge = unreadReal + derived.length;
  const total = real.length + derived.length;
  const sz = compact ? 37 : 40;

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button onClick={handleOpen} title={tr('common.notifications', 'Notifications')}
        style={{ position: 'relative', width: sz, height: sz, borderRadius: 10, border: `1px solid ${open ? C.navy : C.line}`, background: open ? '#eef4ff' : '#fff', display: 'grid', placeItems: 'center', color: open ? C.navy : C.muted, cursor: 'pointer' }}>
        <Bell size={17} />
        {badge > 0 && (
          <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, padding: '0 4px', borderRadius: 999, background: C.red, color: '#fff', fontSize: 10, fontWeight: 800, display: 'grid', placeItems: 'center', border: '2px solid #fff' }}>
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, width: 360, maxWidth: 'calc(100vw - 32px)', background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: '0 18px 44px rgba(1,33,88,.2)', zIndex: 500, overflow: 'hidden' }}>
          <div style={{ padding: '13px 16px', borderBottom: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '.92rem', fontWeight: 800, color: C.navy, margin: 0 }}>{tr('common.notifications', 'Notifications')}</h3>
            {real.length > 0
              ? <button onClick={markAllRead} style={{ fontSize: '.72rem', color: '#2563EB', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}>{tr('notif.markAllRead', 'Mark all read')}</button>
              : <span style={{ fontSize: '.74rem', color: C.muted2 }}>{tr('notif.itemCount', `${total} item${total === 1 ? '' : 's'}`, { count: total })}</span>}
          </div>

          <div style={{ maxHeight: 400, overflowY: 'auto' }} className="nx-scroll">
            {loading ? (
              <p style={{ padding: 20, textAlign: 'center', color: C.muted2, fontSize: '.84rem' }}>{tr('notif.checking', 'Checking…')}</p>
            ) : total === 0 ? (
              <div style={{ padding: '30px 20px', textAlign: 'center' }}>
                <Check size={28} color="#16A34A" style={{ marginBottom: 8 }} />
                <p style={{ fontSize: '.9rem', fontWeight: 700, color: C.ink, margin: 0 }}>{tr('notif.allCaughtUp', 'All caught up!')}</p>
                <p style={{ fontSize: '.78rem', color: C.muted2, marginTop: 4 }}>{tr('notif.nothingPending', 'No outstanding items need attention.')}</p>
              </div>
            ) : (
              <>
                {real.map((n) => {
                  const dot = typeDot[n.type] || typeDot.info;
                  return (
                    <div key={n._id} onClick={() => openReal(n)} style={{ padding: '12px 16px', borderBottom: `1px solid #f2f5f9`, cursor: 'pointer', display: 'flex', gap: 11, alignItems: 'flex-start', background: '#f8faff' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot, marginTop: 6, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '.82rem', fontWeight: 700, color: C.ink, margin: '0 0 2px' }}>{n.title}</p>
                        <p style={{ fontSize: '.78rem', color: C.muted, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.message}</p>
                        <p style={{ fontSize: '.68rem', color: C.muted2, marginTop: 4 }}>
                          {n.source === 'platform' ? 'Nexusora' : n.createdByLabel} · {ago(n.createdAt)}
                        </p>
                      </div>
                      {n.link && <ArrowRight size={13} color={C.muted2} style={{ marginTop: 6, flexShrink: 0 }} />}
                    </div>
                  );
                })}

                {derived.map((n) => {
                  const dot = typeDot[n.type] || typeDot.info;
                  return (
                    <div key={n.id} onClick={() => handleDerivedClick(n)} style={{ padding: '12px 16px', borderBottom: `1px solid #f2f5f9`, cursor: 'pointer', display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot, marginTop: 6, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '.82rem', fontWeight: 700, color: C.ink, margin: '0 0 2px' }}>{n.title}</p>
                        <p style={{ fontSize: '.78rem', color: C.muted, margin: 0 }}>{n.message}</p>
                        <p style={{ fontSize: '.68rem', color: '#D97706', fontWeight: 700, marginTop: 4 }}>{n.time}</p>
                      </div>
                      <button onClick={(e) => dismissDerived(e, n.id)} title="Dismiss" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted2, padding: 2, marginTop: 2, flexShrink: 0 }}><X size={14} /></button>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
