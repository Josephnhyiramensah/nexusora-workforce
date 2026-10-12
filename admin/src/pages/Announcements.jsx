import { useEffect, useState } from 'react';
import api from '../api';
import { C, PageHead, Card, Btn, Callout, inp, L, fmtDateTime } from '../ui';

const TYPES = [
  { key: 'info', label: 'Info', color: C.blue },
  { key: 'success', label: 'Success', color: C.green },
  { key: 'warning', label: 'Warning', color: C.amber },
  { key: 'danger', label: 'Critical', color: C.red },
];

export default function Announcements() {
  const [form, setForm] = useState({ title: '', message: '', type: 'info' });
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() { try { const { data } = await api.get('/announcements'); setItems(data.items || []); } catch {} }
  useEffect(() => { load(); }, []);

  async function send() {
    if (!form.title || !form.message) { setMsg('Title and message are required.'); return; }
    if (!window.confirm('Send this announcement to every tenant?')) return;
    setBusy(true); setMsg('');
    try {
      const { data } = await api.post('/announcements', form);
      setMsg(`Sent to ${data.sent} tenant${data.sent === 1 ? '' : 's'}${data.failed ? ` · ${data.failed} failed` : ''}.`);
      setForm({ title: '', message: '', type: 'info' });
      load();
    } catch (e) { setMsg(e?.response?.data?.message || 'Broadcast failed.'); } finally { setBusy(false); }
  }
  async function withdraw(bid) {
    if (!window.confirm('Withdraw this announcement from every tenant’s bell?')) return;
    try { await api.delete(`/announcements/${bid}`); load(); } catch {}
  }

  return (
    <>
      <PageHead title="Announcements" sub="Broadcast a message to every tenant’s notification bell." />
      {msg && <div style={{ marginBottom: 14 }}><Callout tone="ok">{msg}</Callout></div>}
      <Card style={{ marginBottom: 18 }}>
        <L label="Title"><input style={inp} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Scheduled maintenance" /></L>
        <div style={{ marginTop: 12 }}><L label="Message"><textarea rows={3} style={{ ...inp, resize: 'vertical' }} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></L></div>
        <div style={{ display: 'flex', gap: 14, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {TYPES.map((t) => (
              <button key={t.key} onClick={() => setForm({ ...form, type: t.key })} style={{ padding: '7px 13px', borderRadius: 8, border: `1.5px solid ${form.type === t.key ? t.color : C.line}`, background: form.type === t.key ? `${t.color}12` : '#fff', color: form.type === t.key ? t.color : C.muted, fontWeight: 700, fontSize: '.8rem', cursor: 'pointer' }}>{t.label}</button>
            ))}
          </div>
          <div style={{ marginLeft: 'auto' }}><Btn onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Broadcast to all tenants'}</Btn></div>
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', fontWeight: 800, color: C.navy }}>Recent broadcasts</div>
        {items.length === 0 ? <div style={{ padding: '0 18px 18px', color: C.faint, fontSize: '.88rem' }}>None yet.</div> : items.map((b) => (
          <div key={b.broadcastId} style={{ padding: '14px 18px', borderTop: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, color: C.navy }}>{b.title} <TypeChip type={b.type} /></div>
              <div style={{ color: C.muted, fontSize: '.85rem', margin: '3px 0 5px' }}>{b.message}</div>
              <div style={{ color: C.faint, fontSize: '.76rem' }}>{fmtDateTime(b.at)} · reached {b.sent} tenant{b.sent === 1 ? '' : 's'}{b.failed ? ` · ${b.failed} failed` : ''}</div>
            </div>
            <Btn small tone="danger" onClick={() => withdraw(b.broadcastId)}>Withdraw</Btn>
          </div>
        ))}
      </Card>
    </>
  );
}

function TypeChip({ type }) {
  const t = TYPES.find((x) => x.key === type) || TYPES[0];
  return <span style={{ color: t.color, background: `${t.color}14`, fontWeight: 700, fontSize: '.68rem', padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '.04em' }}>{t.label}</span>;
}
