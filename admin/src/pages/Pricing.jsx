import { useEffect, useState } from 'react';
import api from '../api';
import { C, PageTitle, Card, Btn } from '../ui';
import { inp, L } from './Tenants';

export default function Pricing() {
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');

  async function load() {
    const { data } = await api.get('/pricing');
    setRows((data.pricing || []).map((p) => ({ ...p, overridesText: JSON.stringify(p.prices || {}, null, 0) })));
  }
  useEffect(() => { load(); }, []);

  async function save(row) {
    setMsg('');
    let prices = {};
    try { prices = row.overridesText ? JSON.parse(row.overridesText) : {}; }
    catch { setMsg(`Overrides for ${row.plan} must be valid JSON, e.g. {"USD":20}`); return; }
    try {
      await api.put(`/pricing/${row.plan}`, {
        baseCurrency: String(row.baseCurrency || 'GHS').toUpperCase(),
        basePrice: Number(row.basePrice) || 0,
        seatPrice: Number(row.seatPrice) || 0,
        interval: row.interval || 'month',
        prices,
      });
      setMsg(`Saved ${row.plan} pricing.`);
      await load();
    } catch (e) { setMsg(e?.response?.data?.message || 'Save failed.'); }
  }

  const upd = (i, k, v) => setRows(rows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));

  return (
    <>
      <PageTitle title="Pricing" sub="Base price per plan in one currency — tenants are billed in their own currency via FX. Overrides pin an exact amount per currency." />
      {msg && <Card style={{ marginBottom: 14, background: '#f4f8ff', borderColor: '#cfe0ff', color: C.navy }}>{msg}</Card>}
      <div style={{ display: 'grid', gap: 14 }}>
        {rows.map((r, i) => (
          <Card key={r.plan}>
            <div style={{ fontWeight: 800, color: C.navy, textTransform: 'capitalize', marginBottom: 12, fontSize: '1.05rem' }}>{r.plan}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <L label="Base currency"><input style={inp} value={r.baseCurrency || ''} onChange={(e) => upd(i, 'baseCurrency', e.target.value)} /></L>
              <L label="Base price / interval"><input style={inp} type="number" value={r.basePrice} onChange={(e) => upd(i, 'basePrice', e.target.value)} /></L>
              <L label="Seat price (optional)"><input style={inp} type="number" value={r.seatPrice} onChange={(e) => upd(i, 'seatPrice', e.target.value)} /></L>
              <L label="Interval"><select style={inp} value={r.interval} onChange={(e) => upd(i, 'interval', e.target.value)}><option value="month">month</option><option value="year">year</option></select></L>
            </div>
            <div style={{ marginTop: 12 }}>
              <L label='Per-currency overrides (JSON, e.g. {"USD":20,"NGN":15000})'>
                <input style={inp} value={r.overridesText} onChange={(e) => upd(i, 'overridesText', e.target.value)} placeholder="{}" />
              </L>
            </div>
            <div style={{ marginTop: 14, textAlign: 'right' }}><Btn onClick={() => save(r)}>Save {r.plan}</Btn></div>
          </Card>
        ))}
      </div>
    </>
  );
}
