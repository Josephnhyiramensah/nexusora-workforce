import { useState } from 'react';
import { useLocale } from '../context/LocaleContext';
import MusterBoard from '../components/MusterBoard';
import AbsenteeismPanel from '../components/AbsenteeismPanel';

export default function AttendancePage() {
  const { t } = useLocale();
  const [tab, setTab] = useState('muster');
  return (
    <div className="page">
      <div className="page__head"><h1 className="page__title">{t('tiles.attendance')}</h1></div>
      <div className="tabs">
        <button className={`tab ${tab === 'muster' ? 'tab--on' : ''}`} onClick={() => setTab('muster')}>{t('attendance.muster')}</button>
        <button className={`tab ${tab === 'absenteeism' ? 'tab--on' : ''}`} onClick={() => setTab('absenteeism')}>{t('attendance.absenteeism')}</button>
      </div>
      {tab === 'muster' ? <MusterBoard /> : <AbsenteeismPanel />}
    </div>
  );
}
