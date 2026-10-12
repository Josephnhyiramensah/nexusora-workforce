import { Routes, Route, Navigate } from 'react-router-dom';
import { usePlatformAuth } from './auth';
import { Shell } from './ui';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Tenants from './pages/Tenants';
import TenantDetail from './pages/TenantDetail';
import Pricing from './pages/Pricing';
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
      <Route path="/tenants/:id" element={<Guard><TenantDetail /></Guard>} />
      <Route path="/pricing" element={<Guard><Pricing /></Guard>} />
      <Route path="/audit" element={<Guard><Audit /></Guard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
