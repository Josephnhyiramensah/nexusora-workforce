import { useEffect, useRef, useState } from 'react';

// Subtle count-up for KPI numbers; respects prefers-reduced-motion.
export function useCountUp(target, duration = 650) {
  const [val, setVal] = useState(0);
  const raf = useRef();
  useEffect(() => {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const end = Number(target) || 0;
    if (reduce) { setVal(end); return; }
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(end * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setVal(end);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  const isInt = Number.isInteger(Number(target));
  return isInt ? Math.round(val) : Math.round(val * 100) / 100;
}
