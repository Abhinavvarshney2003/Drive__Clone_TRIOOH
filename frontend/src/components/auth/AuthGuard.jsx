import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function AuthGuard({ children }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate('/login', { replace: true });
  }, [user, loading, navigate]);

  if (loading) return (
    <div className="page-loading">
      <div className="spinner spinner-lg" />
      <p>Loading DGDrive…</p>
    </div>
  );

  if (!user) return null;
  return children;
}
