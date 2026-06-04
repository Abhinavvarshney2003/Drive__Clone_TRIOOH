import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function AdminGuard({ children }) {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAdmin()) navigate('/drive', { replace: true });
  }, [loading, isAdmin, navigate]);

  if (loading) return null;
  if (!isAdmin()) return null;
  return children;
}
