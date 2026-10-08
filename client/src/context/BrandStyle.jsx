/* =====================================================================
   BrandStyle — applies the tenant's white-label colours to the app.
   Reads branding (already delivered with the auth tenant) and sets the
   --nx-brand / --nx-brand-2 / --nx-accent CSS variables that the chrome,
   primary buttons and brand mark consume. Renders nothing.
   ===================================================================== */
import { useEffect } from 'react';
import { useAuth } from './AuthContext';

// Darken a #rgb / #rrggbb hex by `pct` percent (negative = darker).
function shade(hex, pct) {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return hex;
  const num = parseInt(h, 16);
  const amt = Math.round(2.55 * pct);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp((num >> 16) + amt);
  const g = clamp(((num >> 8) & 0xff) + amt);
  const b = clamp((num & 0xff) + amt);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

export default function BrandStyle() {
  const { tenant } = useAuth();
  const primary = tenant?.branding?.primaryColor || '';
  const accent = tenant?.branding?.accentColor || '';

  useEffect(() => {
    const root = document.documentElement;
    if (primary) {
      root.style.setProperty('--nx-brand', primary);
      root.style.setProperty('--nx-brand-2', shade(primary, -16));
    } else {
      root.style.removeProperty('--nx-brand');
      root.style.removeProperty('--nx-brand-2');
    }
    if (accent) root.style.setProperty('--nx-accent', accent);
    else root.style.removeProperty('--nx-accent');
  }, [primary, accent]);

  return null;
}
