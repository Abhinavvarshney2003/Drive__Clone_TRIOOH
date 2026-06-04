import { Routes, Route, Navigate } from 'react-router-dom';
import AuthGuard from './components/auth/AuthGuard';
import AdminGuard from './components/auth/AdminGuard';

import LoginPage from './pages/LoginPage';
import DrivePage from './pages/DrivePage';
import AdminPage from './pages/AdminPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/drive" element={
        <AuthGuard>
          <DrivePage />
        </AuthGuard>
      } />
      <Route path="/admin" element={
        <AuthGuard>
          <AdminGuard>
            <AdminPage />
          </AdminGuard>
        </AuthGuard>
      } />
      <Route path="/" element={<Navigate to="/drive" replace />} />
      <Route path="*" element={
        <div className="empty" style={{minHeight:'100vh'}}>
          <div className="empty-icon">404</div>
          <h2 className="empty-title">Page Not Found</h2>
          <p className="empty-desc">The page you're looking for doesn't exist.</p>
          <a href="/drive" className="btn btn-primary mt-4">Go to Drive</a>
        </div>
      } />
    </Routes>
  );
}
