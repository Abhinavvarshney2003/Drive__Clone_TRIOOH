import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import styles from './AdminPage.module.css';

export default function AdminPage() {
  const { user, isAdmin, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [locTab, setLocTab] = useState('countries');
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  // Multi-Select State
  const [selectedUsers, setSelectedUsers] = useState(new Set());
  const [selectedLocations, setSelectedLocations] = useState(new Set());
  const [createModal, setCreateModal] = useState({ open: false, type: null });
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'viewer', code: '', parent_id: '' });

  // For location dropdowns when creating cities/villages
  const [parentOptions, setParentOptions] = useState([]);

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const res = await api.importExcel(file);
      toast.success(res.message || 'Import successful!');
      loadData();
    } catch (err) {
      toast.error(err.message || 'Import failed');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    if (!isAdmin()) {
      navigate('/drive', { replace: true });
      return;
    }
    setSelectedUsers(new Set());
    setSelectedLocations(new Set());
    loadData();
  }, [activeTab, locTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'users') {
        const res = await api.getUsers();
        setUsers(res.data);
      } else if (activeTab === 'locations') {
        let res;
        if (locTab === 'countries') res = await api.getCountries();
        else if (locTab === 'states') res = await api.getStates();
        else if (locTab === 'cities') res = await api.getCities();
        else if (locTab === 'villages') res = await api.getVillages();
        setLocations(res?.data || []);
      }
    } catch (e) {
      toast.error(e.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.updateUserRole(userId, newRole);
      toast.success('Role updated');
      loadData();
    } catch (e) { toast.error('Failed to update role'); }
  };

  const openCreateModal = async (type) => {
    setFormData({ name: '', email: '', password: '', role: 'viewer', code: '', parent_id: '' });
    setCreateModal({ open: true, type });

    try {
      if (type === 'states') setParentOptions((await api.getCountries()).data);
      else if (type === 'cities') setParentOptions((await api.getStates()).data);
      else if (type === 'villages') setParentOptions((await api.getCities()).data);
    } catch (e) { toast.error('Failed to load parents'); }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    try {
      if (createModal.type === 'users') {
        await api.createUser(formData.name, formData.email, formData.password, formData.role);
        toast.success('User created');
      } else {
        await api.createLocation(createModal.type, formData);
        toast.success('Location created');
      }
      setCreateModal({ open: false, type: null });
      loadData();
    } catch (e) { toast.error(e.message || 'Creation failed'); }
  };

  const handleDeleteLocation = async (id) => {
    if (!window.confirm('Delete this location? This will delete all child locations and folders/images inside it!')) return;
    try {
      await api.deleteLocation(locTab, id);
      toast.success('Deleted successfully');
      loadData();
    } catch (e) { toast.error('Failed to delete'); }
  };

  const handleBulkDeleteUsers = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedUsers.size} users?`)) return;
    try {
      await api.bulkDelete({ users: Array.from(selectedUsers) });
      toast.success('Users deleted successfully');
      setSelectedUsers(new Set());
      loadData();
    } catch (e) { toast.error('Bulk delete failed'); }
  };

  const handleBulkDeleteLocations = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedLocations.size} locations? This is permanent!`)) return;
    try {
      await api.bulkDelete({ locations: { type: locTab, ids: Array.from(selectedLocations) } });
      toast.success('Locations deleted successfully');
      setSelectedLocations(new Set());
      loadData();
    } catch (e) { toast.error('Bulk delete failed'); }
  };

  const handleRenameLocation = async (l) => {
    const newName = window.prompt(`Rename ${locTab.replace(/s$/, '')}:`, l.name);
    if (!newName || !newName.trim() || newName.trim() === l.name) return;
    try {
      await api.updateLocation(locTab, l.id, { name: newName.trim() });
      toast.success('Renamed successfully');
      loadData();
    } catch (e) { toast.error('Failed to rename'); }
  };

  const renderUsers = () => (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>User Management</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          {selectedUsers.size > 0 && (
            <button className="btn btn-danger btn-sm" onClick={handleBulkDeleteUsers}>
              Trash {selectedUsers.size} Selected
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => openCreateModal('users')}>+ New User</button>
        </div>
      </div>
      <div style={{overflowX:'auto'}}>
        <table className={styles.table}>
          <thead><tr>
            <th style={{ width: '40px' }}>
              <input type="checkbox" 
                checked={users.length > 0 && selectedUsers.size === users.length} 
                onChange={(e) => setSelectedUsers(e.target.checked ? new Set(users.map(u => u.id)) : new Set())} 
              />
            </th>
            <th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ background: selectedUsers.has(u.id) ? 'rgba(99,102,241,0.05)' : '' }}>
                <td>
                  <input type="checkbox" 
                    checked={selectedUsers.has(u.id)} 
                    onChange={(e) => {
                      const newSet = new Set(selectedUsers);
                      if (e.target.checked) newSet.add(u.id); else newSet.delete(u.id);
                      setSelectedUsers(newSet);
                    }} 
                  />
                </td>
                <td style={{fontWeight:600}}>{u.name}</td>
                <td>{u.email}</td>
                <td><span className={`${styles.badge} ${styles['badge-'+u.role]}`}>{u.role.replace('_', ' ')}</span></td>
                <td style={{color:'var(--txt-3)'}}>{new Date(u.created_at).toLocaleDateString()}</td>
                <td>
                  <select className="form-input" style={{padding:'4px 8px',height:'auto',fontSize:'0.8rem',width:'120px'}}
                    value={u.role} onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    disabled={u.email === 'admin@drive.local'}>
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </td>
              </tr>
            ))}
            {users.length===0 && <tr><td colSpan="5" style={{textAlign:'center'}}>No users found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderLocations = () => (
    <div>
      <div className={styles.locTabs}>
        {['countries', 'states', 'cities', 'villages'].map(t => (
          <button key={t} className={`${styles.locTab} ${locTab===t ? styles.locTabActive : ''}`} onClick={() => setLocTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>{locTab.charAt(0).toUpperCase() + locTab.slice(1)}</h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            {selectedLocations.size > 0 && (
              <button className="btn btn-danger btn-sm" onClick={handleBulkDeleteLocations}>
                Trash {selectedLocations.size} Selected
              </button>
            )}
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".xlsx, .xls" onChange={handleImport} />
            <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={importing}>
              {importing ? 'Importing...' : '📥 Import Excel'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => openCreateModal(locTab)}>+ Add New</button>
          </div>
        </div>
        <div style={{overflowX:'auto'}}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input type="checkbox" 
                    checked={locations.length > 0 && selectedLocations.size === locations.length} 
                    onChange={(e) => setSelectedLocations(e.target.checked ? new Set(locations.map(l => l.id)) : new Set())} 
                  />
                </th>
                <th>ID</th><th>Name</th>
                {locTab === 'countries' && <th>Code</th>}
                {locTab === 'states' && <th>Country ID</th>}
                {locTab === 'cities' && <th>State ID</th>}
                {locTab === 'villages' && <th>City ID</th>}
                <th style={{textAlign:'right'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {locations.map(l => (
                <tr key={l.id} style={{ background: selectedLocations.has(l.id) ? 'rgba(99,102,241,0.05)' : '' }}>
                  <td>
                    <input type="checkbox" 
                      checked={selectedLocations.has(l.id)} 
                      onChange={(e) => {
                        const newSet = new Set(selectedLocations);
                        if (e.target.checked) newSet.add(l.id); else newSet.delete(l.id);
                        setSelectedLocations(newSet);
                      }} 
                    />
                  </td>
                  <td>{l.id}</td>
                  <td style={{fontWeight:600}}>{l.name}</td>
                  {locTab === 'countries' && <td>{l.code}</td>}
                  {locTab === 'states' && <td>{l.country_id}</td>}
                  {locTab === 'cities' && <td>{l.state_id}</td>}
                  {locTab === 'villages' && <td>{l.city_id}</td>}
                  <td style={{textAlign:'right'}}>
                    <button className="btn btn-secondary btn-sm" style={{marginRight: '8px'}} onClick={() => handleRenameLocation(l)}>Rename</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteLocation(l.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {locations.length===0 && <tr><td colSpan="4" style={{textAlign:'center'}}>No records found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHead}>
          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
             <span style={{fontSize:'1.3rem'}}>🛡️</span>
             <span className="text-gradient" style={{fontWeight:800,fontSize:'1rem'}}>Admin</span>
          </div>
        </div>
        <div className={styles.sidebarBody}>
          <button className={`${styles.tabBtn} ${activeTab==='users'?styles.tabActive:''}`} onClick={() => setActiveTab('users')}>👥 Users</button>
          <button className={`${styles.tabBtn} ${activeTab==='locations'?styles.tabActive:''}`} onClick={() => setActiveTab('locations')}>📍 Locations</button>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.topbar}>
          <h1 style={{fontSize:'1.1rem',fontWeight:700}}>Dashboard</h1>
          <div style={{display:'flex',gap:'10px'}}>
             <button className="btn btn-secondary btn-sm" onClick={() => navigate('/drive')}>Go to Drive</button>
          </div>
        </header>
        <div className={styles.content}>
          {loading ? <div className="spinner spinner-lg" style={{margin:'40px auto'}}/> : (
            activeTab === 'users' ? renderUsers() : renderLocations()
          )}
        </div>
      </main>

      {createModal.open && (
        <div className="modal-mask open" onClick={e=>e.target===e.currentTarget&&setCreateModal({open:false})}>
          <div className="modal-box">
            <div className="modal-head">
              <span className="modal-title">Create New {createModal.type.replace(/s$/,'')}</span>
            </div>
            <form onSubmit={handleCreateSubmit}>
              <div className="modal-body">
                {createModal.type === 'users' ? (
                  <>
                    <div className="form-group"><label className="form-label">Name</label><input className="form-input" required value={formData.name} onChange={e=>setFormData({...formData,name:e.target.value})}/></div>
                    <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-input" required value={formData.email} onChange={e=>setFormData({...formData,email:e.target.value})}/></div>
                    <div className="form-group"><label className="form-label">Password</label><input type="password" className="form-input" required value={formData.password} onChange={e=>setFormData({...formData,password:e.target.value})}/></div>
                    <div className="form-group"><label className="form-label">Role</label>
                      <select className="form-input" value={formData.role} onChange={e=>setFormData({...formData,role:e.target.value})}>
                        <option value="viewer">Viewer</option><option value="editor">Editor</option><option value="super_admin">Super Admin</option>
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="form-group"><label className="form-label">Name</label><input className="form-input" required value={formData.name} onChange={e=>setFormData({...formData,name:e.target.value})}/></div>
                    {createModal.type === 'countries' && <div className="form-group"><label className="form-label">Code (Optional)</label><input className="form-input" value={formData.code} onChange={e=>setFormData({...formData,code:e.target.value})}/></div>}
                    {createModal.type !== 'countries' && (
                      <div className="form-group"><label className="form-label">Parent Location</label>
                        <select className="form-input" required value={formData.parent_id} onChange={e=>setFormData({...formData,parent_id:e.target.value})}>
                          <option value="">Select Parent...</option>
                          {parentOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-secondary" onClick={()=>setCreateModal({open:false})}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
