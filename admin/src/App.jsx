import { Routes, Route, Navigate } from 'react-router-dom';
import { usePlatformAuth } from './auth';
import { Shell } from './ui';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Tenants from './pages/Tenants';
import Revenue from './pages/Revenue';
import Health from './pages/Health';
import Announcements from './pages/Announcements';
import Settings from './pages/Settings';
import Audit from './pages/Audit';

function Guard({ children }) {
  const { authed } = usePlatformAuth();
  return authed ? <Shell>{children}</Shell> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Guard><Overview /></Guard>} />
      <Route path="/tenants" element={<Guard><Tenants /></Guard>} />
      <Route path="/revenue" element={<Guard><Revenue /></Guard>} />
      <Route path="/health" element={<Guard><Health /></Guard>} />
      <Route path="/announcements" element={<Guard><Announcements /></Guard>} />
      <Route path="/settings" element={<Guard><Settings /></Guard>} />
      <Route path="/audit" element={<Guard><Audit /></Guard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
