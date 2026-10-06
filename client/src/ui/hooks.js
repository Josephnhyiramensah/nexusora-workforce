/* Shared data hooks (no components — keeps Fast Refresh happy). */
import { useEffect, useState } from 'react';
import api from '../api/client';

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