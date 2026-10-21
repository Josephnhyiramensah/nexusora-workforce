/* Shared data hooks (no components — keeps Fast Refresh happy). */
import { useEffect, useState } from 'react';
import api from '../api/client';

/* Responsive breakpoint hook. Returns true when the viewport is at/below `bp`
   (default 760px — the phone/tablet cutoff this app uses). SSR-safe and
   updates live on resize/rotate. */
export function useIsMobile(bp = 760) {
  const [mobile, setMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= bp : false));
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(`(max-width:${bp}px)`);
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
    return () => { mq.removeEventListener ? mq.removeEventListener('change', onChange) : mq.removeListener(onChange); };
  }, [bp]);
  return mobile;
}

export function useEmployees() {
  const [list, setList] = useState([]);
  useEffect(() => {
    let a = true;
    (async () => {
      try { const { data } = await api.get('/employees', { params: { limit: 1000 } }); if (a) setList(data.items || []); }
      catch { /* */ }
    })();
    return () => { a = false; };
  }, []);
  return list;
}