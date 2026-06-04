import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { getCookie, setCookie, deleteCookie } from '../utils/cookies';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const token = getCookie('access_token');
    if (!token) { setLoading(false); return; }
    try {
      const res = await api.getMe();
      const u = res?.data || res?.user || null;
      setUser(u);
      // Load roles/permissions
      try {
        const rp = await api.getRolesPermissions();
        setRoles(rp?.data?.roles || []);
        setPermissions(rp?.data?.permissions || []);
      } catch { /* non-critical */ }
    } catch {
      deleteCookie('access_token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const login = async (email, password) => {
    const res = await api.login(email, password);
    const token = res?.data?.access_token || res?.data?.token || res?.access_token;
    if (!token) throw new Error('No token received');
    setCookie('access_token', token);
    const u = res?.data?.user || res?.user || null;
    setUser(u);
    // Load roles
    try {
      const rp = await api.getRolesPermissions();
      setRoles(rp?.data?.roles || []);
      setPermissions(rp?.data?.permissions || []);
    } catch { /* non-critical */ }
    return res;
  };

  const logout = async () => {
    try { await api.logout(); } catch { /* ignore */ }
    deleteCookie('access_token');
    setUser(null); setRoles([]); setPermissions([]);
  };

  const refreshUser = () => loadUser();

  // Role helpers
  const isAdmin = () => {
    if (!user) return false;
    const userRoles = roles.map(r => (r.name || r).toLowerCase());
    return userRoles.some(r => r.includes('super') || r.includes('admin')) ||
           (user.role && (user.role.toLowerCase().includes('super') || user.role.toLowerCase().includes('admin')));
  };

  const isSuperAdmin = () => {
    if (!user) return false;
    return user.role === 'super_admin';
  };

  const isEditor = () => {
    if (!user) return false;
    if (isAdmin()) return true;
    const userRoles = roles.map(r => (r.name || r).toLowerCase());
    return userRoles.some(r => r.includes('editor')) ||
           (user.role && user.role.toLowerCase().includes('editor'));
  };

  const canUpload   = () => isEditor();
  const canDelete   = () => isEditor();
  const canCreate   = () => isEditor();
  const canManage   = () => isAdmin();
  const canRenameOrMove = () => isSuperAdmin();

  const hasPermission = (perm) =>
    isAdmin() || permissions.some(p => (p.name || p) === perm);

  return (
    <AuthContext.Provider value={{
      user, roles, permissions, loading,
      login, logout, refreshUser,
      isSuperAdmin, isAdmin, isEditor, canUpload, canDelete, canCreate, canManage, canRenameOrMove, hasPermission,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
