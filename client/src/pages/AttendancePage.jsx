import { useState, lazy, Suspense } from 'react';
import MusterBoard from '../components/MusterBoard';
import { CalendarClock, CalendarDays, Wallet, ShieldCheck } from 'lucide-react';
import { RouteShell, Hero, Segmented, Body } from '../ui/kit';
import { C } from '../ui/tokens';

const AbsenteeismPanel = lazy(() => import('../components/AbsenteeismPanel'));

export const TIMEPAY_RAIL = {
  brand: { title: 'Time & Pay', subtitle: 'Attendance to payroll', Icon: CalendarClock },
  groups: [
    { title: 'Time', items: [
      { label: 'Attendance', to: '/attendance', Icon: CalendarClock },
      { label: 'Leave', to: '/leave', Icon: CalendarDays },
    ] },
    { title: 'Pay', items: [
      { label: 'Payroll', to: '/payroll', Icon: Wallet },
      { label: 'Compliance', to: '/compliance', Icon: ShieldCheck },
    ] },
  ],
};

export default function AttendancePage() {
  const [tab, setTab] = useState('muster');
  return (
    <RouteShell brand={TIMEPAY_RAIL.brand} groups={TIMEPAY_RAIL.groups}>
      <Hero crumbs={['Time & Pay', 'Attendance']} title="Attendance & Absenteeism"
         />
      <Body>
        <div style={{ minWidth: 0 }}>
          <div style={{ marginBottom: 18 }}>
            <Segmented items={[['muster', 'Daily Muster'], ['absenteeism', 'Absenteeism']]} active={tab} onSelect={setTab} />
          </div>
          {tab === 'muster'
            ? <MusterBoard />
            : <Suspense fallback={<div style={{ color: C.muted, padding: 30 }}>Loading…</div>}><AbsenteeismPanel /></Suspense>}
        </div>
      </Body>
    </RouteShell>
  );
}