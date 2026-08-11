import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const { t } = useLocale();
  if (loading) return <div className="center-note">{t('common.loading')}</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
