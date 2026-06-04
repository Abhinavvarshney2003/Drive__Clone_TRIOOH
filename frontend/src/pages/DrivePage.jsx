import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import { getImageUrl, formatBytes, getInitials, avatarColor, timeAgo } from '../utils/formatters';
import styles from './DrivePage.module.css';

// Lazy loading Image Component
function LazyImage({ src, alt, className }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: 'var(--bg-raised)' }}>
      {!loaded && !error && <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}><div className="spinner" style={{color:'var(--brand)'}} /></div>}
      {error && <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'2rem'}} title={src}>⚠️</div>}
      {src && !error && (
        <img
          src={src}
          alt={alt}
          className={className}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => { setError(true); setLoaded(true); }}
          style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.3s', width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
    </div>
  );
}

// Recursively scan dropped items and resolve files with relative paths
const scanEntry = async (entry, path = '') => {
  if (entry.isFile) {
    const file = await new Promise((resolve) => entry.file(resolve));
    Object.defineProperty(file, 'relativePath', {
      value: path + entry.name,
      writable: false,
    });
    return [file];
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    const readAllEntries = async () => {
      let allEntries = [];
      const readBatch = () => {
        return new Promise((resolve, reject) => {
          reader.readEntries((entries) => {
            resolve(entries);
          }, reject);
        });
      };
      while (true) {
        const batch = await readBatch();
        if (batch.length === 0) break;
        allEntries = allEntries.concat(batch);
      }
      return allEntries;
    };
    try {
      const entries = await readAllEntries();
      const results = await Promise.all(
        entries.map((child) => scanEntry(child, path + entry.name + '/'))
      );
      return results.flat();
    } catch (err) {
      console.error('Error scanning directory entry:', err);
      return [];
    }
  }
  return [];
};

export default function DrivePage() {
  const { user, isAdmin, canUpload, canDelete, canCreate, canRenameOrMove, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [tehsils, setTehsils] = useState([]);
  const [villages, setVillages] = useState([]);
  const [expandedState, setExpandedState] = useState(null);
  const [expandedCity, setExpandedCity] = useState(null);
  const [expandedTehsil, setExpandedTehsil] = useState(null);
  
  const [selectedVillage, setSelectedVillage] = useState(null);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [folders, setFolders] = useState([]);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [lightbox, setLightbox] = useState({ open: false, images: [], index: 0 });
  const [ctxMenu, setCtxMenu] = useState({ open: false, x: 0, y: 0, item: null, type: null });
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameItem, setRenameItem] = useState(null);
  const [newName, setNewName] = useState('');

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveItem, setMoveItem] = useState(null);
  const [moveTargetFolderId, setMoveTargetFolderId] = useState('');
  const [allVillageFolders, setAllVillageFolders] = useState([]);
  const [folderName, setFolderName] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [imgPage, setImgPage] = useState(1);
  const [imgTotal, setImgTotal] = useState(0);

  // Bulk Import States
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [bulkImportFiles, setBulkImportFiles] = useState([]);
  const [bulkStateId, setBulkStateId] = useState('');
  const [bulkCitySource, setBulkCitySource] = useState('detect');
  const [bulkTehsilSource, setBulkTehsilSource] = useState('detect');
  const [bulkVillageSource, setBulkVillageSource] = useState('detect');
  const [bulkImportRunning, setBulkImportRunning] = useState(false);
  const [bulkProgressIndex, setBulkProgressIndex] = useState(0);
  const [bulkUploadLogs, setBulkUploadLogs] = useState([]);
  const bulkCancelRef = useRef(false);
  const folderInputRef = useRef(null);

  useEffect(() => {
    if (bulkImportOpen && states.length > 0) {
      if (selectedVillage) {
        const parentTehsil = tehsils.find(t => String(t.id) === String(selectedVillage.tehsil_id));
        const parentCity = parentTehsil ? cities.find(c => String(c.id) === String(parentTehsil.city_id)) : null;
        const parentState = parentCity ? states.find(s => String(s.id) === String(parentCity.state_id)) : null;
        setBulkStateId(parentState ? parentState.id : states[0]?.id || '');
        setBulkCitySource(parentCity ? parentCity.id : 'detect');
        setBulkTehsilSource(parentTehsil ? parentTehsil.id : 'detect');
        setBulkVillageSource(selectedVillage.id);
      } else if (expandedTehsil) {
        const activeTehsil = tehsils.find(t => String(t.id) === String(expandedTehsil));
        const parentCity = activeTehsil ? cities.find(c => String(c.id) === String(activeTehsil.city_id)) : null;
        const parentState = parentCity ? states.find(s => String(s.id) === String(parentCity.state_id)) : null;
        setBulkStateId(parentState ? parentState.id : states[0]?.id || '');
        setBulkCitySource(parentCity ? parentCity.id : 'detect');
        setBulkTehsilSource(expandedTehsil);
        setBulkVillageSource('detect');
      } else if (expandedCity) {
        const activeCity = cities.find(c => String(c.id) === String(expandedCity));
        const parentState = activeCity ? states.find(s => String(s.id) === String(activeCity.state_id)) : null;
        setBulkStateId(parentState ? parentState.id : states[0]?.id || '');
        setBulkCitySource(expandedCity);
        setBulkTehsilSource('detect');
        setBulkVillageSource('detect');
      } else if (expandedState) {
        setBulkStateId(expandedState);
        setBulkCitySource('detect');
        setBulkTehsilSource('detect');
        setBulkVillageSource('detect');
      } else {
        setBulkStateId(states[0]?.id || '');
        setBulkCitySource('detect');
        setBulkTehsilSource('detect');
        setBulkVillageSource('detect');
      }
      setBulkImportRunning(false);
      setBulkProgressIndex(0);
      setBulkUploadLogs([]);
      bulkCancelRef.current = false;
    }
  }, [bulkImportOpen, selectedVillage, expandedTehsil, expandedCity, expandedState, states, cities, tehsils, villages]);

  const loadLocations = useCallback(async () => {
    try {
      const [sRes, cRes, tRes, vRes] = await Promise.all([api.getStates(), api.getCities(), api.getTehsils(), api.getVillages()]);
      setStates(sRes?.data || []);
      setCities(cRes?.data || []);
      setTehsils(tRes?.data || []);
      setVillages(vRes?.data || []);
    } catch (e) {}
  }, []);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  const loadContent = useCallback(async (villageId, folderId, page = 1, search = '') => {
    if (!villageId) return;
    setLoading(true);
    try {
      const [fRes, iRes] = await Promise.all([
        api.getFolders(1, 50, villageId, search || undefined),
        api.getImages(page, 24, folderId || undefined, villageId, search || undefined),
      ]);
      const rawFolders = fRes?.data?.data || fRes?.data || fRes?.folders || [];
      const rawImages  = iRes?.data?.data || iRes?.data || iRes?.images  || [];
      const total      = iRes?.data?.total || rawImages.length;
      
      const filtered = Array.isArray(rawFolders)
        ? rawFolders.filter(f => folderId ? String(f.parent_id) === String(folderId) : !f.parent_id)
        : [];
      setFolders(filtered);
      setImages(Array.isArray(rawImages) ? rawImages : []);
      setImgTotal(total);
      setImgPage(page);
    } catch (e) {
      toast.error(e.message || 'Failed to load content');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (selectedVillage) loadContent(selectedVillage.id, currentFolder?.id, 1, searchQuery);
  }, [selectedVillage, currentFolder, loadContent]);

  const selectVillage = (v) => {
    setSelectedVillage(v); setCurrentFolder(null);
    setBreadcrumb([]); setSearchQuery('');
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const openFolder = (folder) => {
    setCurrentFolder(folder);
    setBreadcrumb(prev => [...prev, folder]);
  };

  const navigateBreadcrumb = (idx) => {
    if (idx === -1) { setCurrentFolder(null); setBreadcrumb([]); }
    else { setCurrentFolder(breadcrumb[idx]); setBreadcrumb(prev => prev.slice(0, idx + 1)); }
  };

  const handleSearch = (e) => {
    const q = e.target.value; setSearchQuery(q);
    if (selectedVillage) loadContent(selectedVillage.id, currentFolder?.id, 1, q);
  };

  const handleFiles = async (files) => {
    if (!canUpload()) { toast.error("You don't have permission to upload"); return; }
    if (!selectedVillage) { toast.error('Select a village first'); return; }
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!arr.length) { toast.warning('Only images supported'); return; }
    
    setUploadProgress({ files: arr.map(f => ({ name: f.name, status: 'uploading' })) });
    try {
      await api.uploadImages(arr, currentFolder?.id, selectedVillage.id);
      setUploadProgress(prev => ({ files: prev.files.map(f => ({ ...f, status: 'done' })) }));
      toast.success(`${arr.length} image(s) uploaded!`);
      setTimeout(() => setUploadProgress(null), 2000);
      loadContent(selectedVillage.id, currentFolder?.id, imgPage, searchQuery);
    } catch (e) {
      setUploadProgress(null); toast.error(e.message || 'Upload failed');
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (!canUpload()) { toast.error("You don't have permission to upload"); return; }

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      let hasDirectory = false;
      const scanPromises = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            if (entry.isDirectory) hasDirectory = true;
            scanPromises.push(scanEntry(entry));
          }
        }
      }

      if (hasDirectory) {
        setLoading(true);
        try {
          const filesArray = await Promise.all(scanPromises);
          const flatFiles = filesArray.flat().filter(f => f.type.startsWith('image/'));
          if (flatFiles.length === 0) {
            toast.warning('No image files found in the dropped folder.');
          } else {
            setBulkImportFiles(flatFiles);
            setBulkImportOpen(true);
          }
        } catch (err) {
          toast.error('Failed to parse folders: ' + err.message);
        } finally {
          setLoading(false);
        }
        return;
      }
    }
    
    handleFiles(e.dataTransfer.files);
  };

  const handleFolderSelect = (e) => {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) {
      toast.warning('No image files found in the selected folder.');
      return;
    }
    setBulkImportFiles(files);
    setBulkImportOpen(true);
    e.target.value = '';
  };

  const handleBulkUploadStart = async (customFiles = null) => {
    if (!bulkStateId) {
      toast.error('Please select a Target State first.');
      return;
    }
    
    const filesToUpload = customFiles || bulkImportFiles;
    if (filesToUpload.length === 0) return;

    setBulkImportRunning(true);
    bulkCancelRef.current = false;

    // Build or reset log list
    let initialLogs = [];
    if (customFiles) {
      initialLogs = bulkUploadLogs.map(log => {
        const matchingFile = filesToUpload.find(f => (f.relativePath || f.webkitRelativePath || f.name) === log.name);
        return matchingFile ? { ...log, status: 'pending', error: null } : log;
      });
    } else {
      initialLogs = filesToUpload.map(f => ({
        name: f.relativePath || f.webkitRelativePath || f.name,
        size: f.size,
        status: 'pending',
        error: null
      }));
    }
    setBulkUploadLogs(initialLogs);

    // Client-side cache to bypass redundant DB checks
    // Client-side cache to bypass redundant DB checks
    const cache = { cities: {}, tehsils: {}, villages: {}, folders: {} };
    if (bulkCitySource !== 'detect') {
      cache.cities['selected'] = parseInt(bulkCitySource, 10);
    }
    if (bulkTehsilSource !== 'detect') {
      cache.tehsils['selected'] = parseInt(bulkTehsilSource, 10);
    }
    if (bulkVillageSource !== 'detect') {
      cache.villages['selected'] = parseInt(bulkVillageSource, 10);
    }

    // Group files by relative folder path to prevent concurrent directory creation race conditions
    const groups = {};
    filesToUpload.forEach(file => {
      const relPath = file.relativePath || file.webkitRelativePath || file.name;
      const segments = relPath.split('/');
      const folderSegments = segments.slice(0, -1);
      const folderKey = folderSegments.join('/');
      if (!groups[folderKey]) {
        groups[folderKey] = [];
      }
      groups[folderKey].push(file);
    });

    const firstFiles = Object.values(groups).map(g => g[0]);
    const remainingFiles = Object.values(groups).flatMap(g => g.slice(1));

    let overallCompleted = 0;
    setBulkProgressIndex(0);

    const uploadSingleFile = async (file) => {
      const logName = file.relativePath || file.webkitRelativePath || file.name;
      setBulkUploadLogs(prev => prev.map(log => log.name === logName ? { ...log, status: 'uploading' } : log));

      try {
        const segments = logName.split('/');
        let folderSegments = segments.slice(0, -1);

        let cityName = null;
        let tehsilName = null;
        let villageName = null;
        let folderChain = [];

        if (bulkCitySource === 'detect') {
          cityName = folderSegments[0] || 'Unknown City';
          folderSegments = folderSegments.slice(1);
        }

        if (bulkTehsilSource === 'detect') {
          tehsilName = folderSegments[0] || 'Unknown Tehsil';
          folderSegments = folderSegments.slice(1);
        }

        if (bulkVillageSource === 'detect') {
          villageName = folderSegments[0] || 'Unknown Village';
          folderSegments = folderSegments.slice(1);
        }

        folderChain = folderSegments;

        const formData = new FormData();
        formData.append('image', file);
        formData.append('state_id', bulkStateId);

        if (bulkCitySource === 'detect') {
          const cityCacheKey = cityName;
          if (cache.cities[cityCacheKey]) {
            formData.append('city_id', cache.cities[cityCacheKey]);
          } else {
            formData.append('city_name', cityName);
          }
        } else {
          formData.append('city_id', bulkCitySource);
        }

        if (bulkTehsilSource === 'detect') {
          const tehsilCacheKey = (bulkCitySource === 'detect' ? cityName : 'fixed') + ' > ' + tehsilName;
          if (cache.tehsils[tehsilCacheKey]) {
            formData.append('tehsil_id', cache.tehsils[tehsilCacheKey]);
          } else {
            formData.append('tehsil_name', tehsilName);
          }
        } else {
          formData.append('tehsil_id', bulkTehsilSource);
        }

        if (bulkVillageSource === 'detect') {
          const villageCacheKey = (bulkTehsilSource === 'detect' ? tehsilName : 'fixed') + ' > ' + villageName;
          if (cache.villages[villageCacheKey]) {
            formData.append('village_id', cache.villages[villageCacheKey]);
          } else {
            formData.append('village_name', villageName);
          }
        } else {
          formData.append('village_id', bulkVillageSource);
        }

        const folderChainKey = (bulkVillageSource === 'detect' ? villageName : 'fixed') + ' > ' + folderChain.join('/');
        if (folderChain.length > 0 && cache.folders[folderChainKey]) {
          formData.append('folder_id', cache.folders[folderChainKey]);
        } else if (folderChain.length > 0) {
          formData.append('folder_names', JSON.stringify(folderChain));
        }

        const res = await api.uploadBulkImage(formData);

        // Update cache with resolved IDs
        if (res.success && res.data) {
          const { resolvedCityId, resolvedTehsilId, resolvedVillageId, resolvedFolderId } = res.data;
          if (bulkCitySource === 'detect' && resolvedCityId && cityName) {
            cache.cities[cityName] = resolvedCityId;
          }
          if (bulkTehsilSource === 'detect' && resolvedTehsilId && tehsilName) {
            const tehsilCacheKey = (bulkCitySource === 'detect' ? cityName : 'fixed') + ' > ' + tehsilName;
            cache.tehsils[tehsilCacheKey] = resolvedTehsilId;
          }
          if (bulkVillageSource === 'detect' && resolvedVillageId && villageName) {
            const villageCacheKey = (bulkTehsilSource === 'detect' ? tehsilName : 'fixed') + ' > ' + villageName;
            cache.villages[villageCacheKey] = resolvedVillageId;
          }
          if (resolvedFolderId && folderChain.length > 0) {
            cache.folders[folderChainKey] = resolvedFolderId;
          }
        }

        setBulkUploadLogs(prev => prev.map(log => log.name === logName ? { ...log, status: 'success' } : log));
      } catch (err) {
        console.error('Error uploading file in bulk queue:', file.name, err);
        setBulkUploadLogs(prev => prev.map(log => log.name === logName ? { ...log, status: 'error', error: err.message || 'Upload failed' } : log));
      } finally {
        overallCompleted++;
        setBulkProgressIndex(overallCompleted);
      }
    };

    // Phase 1: Upload firstFiles sequentially (to create folders safely)
    for (const file of firstFiles) {
      if (bulkCancelRef.current) break;
      await uploadSingleFile(file);
    }

    // Phase 2: Upload remainingFiles in parallel (with concurrency limit)
    if (remainingFiles.length > 0 && !bulkCancelRef.current) {
      const CONCURRENCY = 3;
      let nextIndex = 0;
      const totalRemaining = remainingFiles.length;

      const uploadWorker = async () => {
        while (nextIndex < totalRemaining && !bulkCancelRef.current) {
          const file = remainingFiles[nextIndex++];
          await uploadSingleFile(file);
        }
      };

      const workers = [];
      for (let i = 0; i < Math.min(CONCURRENCY, totalRemaining); i++) {
        workers.push(uploadWorker());
      }
      await Promise.all(workers);
    }

    setBulkImportRunning(false);

    if (bulkCancelRef.current) {
      toast.warning('Upload stopped by user.');
    } else {
      setBulkUploadLogs(latestLogs => {
        const failed = latestLogs.filter(l => l.status === 'error').length;
        if (failed > 0) {
          toast.warning(`Bulk import completed with ${failed} errors.`);
        } else {
          toast.success(`Successfully imported all ${filesToUpload.length} images!`);
          setBulkImportOpen(false);
        }
        return latestLogs;
      });
    }

    // Refresh DB sidebar & content
    Promise.all([api.getStates(), api.getCities(), api.getVillages()])
      .then(([sRes, cRes, vRes]) => {
        setStates(sRes?.data || []);
        setCities(cRes?.data || []);
        setVillages(vRes?.data || []);
        if (selectedVillage) {
          loadContent(selectedVillage.id, currentFolder?.id, 1, searchQuery);
        }
      }).catch(() => {});
  };

  const handleRetryFailed = () => {
    const failedFiles = bulkImportFiles.filter(f => {
      const logName = f.relativePath || f.webkitRelativePath || f.name;
      const log = bulkUploadLogs.find(l => l.name === logName);
      return log && log.status === 'error';
    });
    if (failedFiles.length === 0) return;
    handleBulkUploadStart(failedFiles);
  };

  const getBulkTreeStats = () => {
    const citySet = new Set();
    const villageSet = new Set();
    const folderSet = new Set();
    const imageCount = bulkImportFiles.length;

    const state = states.find(s => String(s.id) === String(bulkStateId));
    const stateName = state ? state.name : 'Target State';

    bulkImportFiles.forEach(file => {
      const relPath = file.relativePath || file.webkitRelativePath || file.name;
      const segments = relPath.split('/');
      const folderSegments = segments.slice(0, -1);

      let cityName = '';
      let villageName = '';
      let folderChain = [];

      if (bulkCitySource === 'detect') {
        cityName = folderSegments[0] || 'Unknown City';
        if (bulkVillageSource === 'detect') {
          if (folderSegments.length >= 3) {
            villageName = folderSegments[1] || 'Unknown Village';
            folderChain = folderSegments.slice(2);
          } else if (folderSegments.length === 2) {
            villageName = folderSegments[0] + ' (Town)';
            folderChain = [folderSegments[1]];
          } else {
            cityName = 'Default City';
            villageName = 'Default Village';
            folderChain = folderSegments;
          }
        } else {
          const v = villages.find(vil => String(vil.id) === String(bulkVillageSource));
          villageName = v ? v.name : 'Unknown Village';
          folderChain = folderSegments.slice(1);
        }
      } else {
        const c = cities.find(cit => String(cit.id) === String(bulkCitySource));
        cityName = c ? c.name : 'Unknown City';
        if (bulkVillageSource === 'detect') {
          if (folderSegments.length >= 2) {
            villageName = folderSegments[0] || 'Unknown Village';
            folderChain = folderSegments.slice(1);
          } else {
            villageName = cityName + ' (Town)';
            folderChain = folderSegments;
          }
        } else {
          const v = villages.find(vil => String(vil.id) === String(bulkVillageSource));
          villageName = v ? v.name : 'Unknown Village';
          folderChain = folderSegments;
        }
      }

      citySet.add(cityName);
      villageSet.add(cityName + ' > ' + villageName);
      let currentPath = cityName + ' > ' + villageName;
      folderChain.forEach(f => {
        currentPath += ' > ' + f;
        folderSet.add(currentPath);
      });
    });

    return {
      stateName,
      citiesCount: citySet.size,
      villagesCount: villageSet.size,
      foldersCount: folderSet.size,
      imagesCount: imageCount
    };
  };

  const createFolder = async (e) => {
    e.preventDefault();
    if (!folderName.trim()) return;
    if (!selectedVillage) { toast.error('Select a village first'); return; }
    
    setModalLoading(true);
    try {
      await api.createFolder(folderName.trim(), selectedVillage.id, currentFolder?.id);
      toast.success('Folder created!');
      setCreateFolderOpen(false); setFolderName('');
      loadContent(selectedVillage.id, currentFolder?.id, imgPage, searchQuery);
    } catch (e) { toast.error(e.message || 'Failed'); }
    finally { setModalLoading(false); }
  };

  const openRename = (item, type) => {
    setRenameItem({ ...item, type }); setNewName(item.name);
    setRenameOpen(true); setCtxMenu(c => ({ ...c, open: false }));
  };

  const handleRename = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !renameItem) return;
    setModalLoading(true);
    try {
      if (['states', 'cities', 'tehsils', 'villages'].includes(renameItem.type)) {
        await api.updateLocation(renameItem.type, renameItem.id, { name: newName.trim() });
        loadLocations();
      } else if (renameItem.type === 'folder') {
        await api.updateFolder(renameItem.id, { name: newName.trim() });
        loadContent(selectedVillage.id, currentFolder?.id, imgPage, searchQuery);
      }
      setRenameOpen(false); toast.success('Renamed!');
    } catch (e) { toast.error(e.message || 'Failed'); }
    finally { setModalLoading(false); }
  };

  const openMove = async (item, type) => {
    setMoveItem({ ...item, type });
    if (['states', 'cities', 'tehsils', 'villages'].includes(type)) {
       setMoveTargetFolderId(item.country_id || item.state_id || item.city_id || item.tehsil_id || '');
       if (type === 'states') setAllVillageFolders([{ id: 1, name: 'India' }]);
       else if (type === 'cities') setAllVillageFolders(states);
       else if (type === 'tehsils') setAllVillageFolders(cities);
       else if (type === 'villages') setAllVillageFolders(tehsils);
    } else {
       setMoveTargetFolderId(item.parent_id || item.folder_id || '');
       try {
         const res = await api.getFolders(1, 10000, null, selectedVillage.id);
         if (res.success) setAllVillageFolders(res.data);
       } catch (e) {
         console.error('Failed to load folders for move', e);
       }
    }
    setMoveOpen(true);
    setCtxMenu(c => ({ ...c, open: false }));
  };

  const handleMove = async (e) => {
    e.preventDefault();
    if (!moveItem) return;
    setModalLoading(true);
    try {
      const targetId = moveTargetFolderId === '' ? null : parseInt(moveTargetFolderId, 10);
      if (['states', 'cities', 'tehsils', 'villages'].includes(moveItem.type)) {
        await api.updateLocation(moveItem.type, moveItem.id, { parent_id: targetId });
        loadLocations();
      } else if (moveItem.type === 'folder') {
        await api.updateFolder(moveItem.id, { parent_id: targetId });
        loadContent(selectedVillage.id, currentFolder?.id, imgPage, searchQuery);
      } else {
        await api.updateImage(moveItem.id, { folder_id: targetId });
        loadContent(selectedVillage.id, currentFolder?.id, imgPage, searchQuery);
      }
      setMoveOpen(false);
      toast.success('Moved successfully!');
    } catch (e) {
      toast.error(e.message || 'Failed to move');
    } finally {
      setModalLoading(false);
    }
  };

  const handleDelete = async (item, type) => {
    if (!canDelete()) { toast.error('No permission to delete'); return; }
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    setCtxMenu(c => ({ ...c, open: false }));
    try {
      if (type === 'folder') await api.deleteFolder(item.id);
      else await api.deleteImage(item.id);
      toast.success('Deleted!');
      loadContent(selectedVillage.id, currentFolder?.id, imgPage, searchQuery);
    } catch (e) { toast.error(e.message || 'Failed'); }
  };

  const openLightbox = (imgs, idx) => setLightbox({ open: true, images: imgs, index: idx });
  const closeLightbox = () => setLightbox({ open: false, images: [], index: 0 });
  const lightboxNav = (dir) => setLightbox(lb => ({
    ...lb, index: (lb.index + dir + lb.images.length) % lb.images.length
  }));

  const openCtx = (e, item, type) => {
    e.preventDefault(); e.stopPropagation();
    setCtxMenu({ open: true, x: Math.min(e.clientX, window.innerWidth - 180), y: Math.min(e.clientY, window.innerHeight - 150), item, type });
  };

  useEffect(() => {
    const close = () => setCtxMenu(c => ({ ...c, open: false }));
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const handleLogout = async () => { await logout(); navigate('/login', { replace: true }); };

  const initials = getInitials(user?.name || '');
  const avatarBg = avatarColor(user?.name || '');

  return (
    <div className={styles.layout}
      onDragOver={e => { e.preventDefault(); if (canUpload()) setIsDragging(true); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false); }}
      onDrop={handleDrop}>

      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.open : ''}`}>
        <div className={styles.sidebarHead}>
          <div className={styles.sidebarLogo}>
            <img src="/logo.png" alt="DGDrive Logo" style={{ height: '48px', width: 'auto' }} />
          </div>
          <button className="btn btn-icon btn-ghost" onClick={() => setSidebarOpen(false)}><XIcon /></button>
        </div>

        <div className={styles.sidebarBody}>
          <p className={styles.sidebarSectionTitle}>Locations</p>
          {states.map(state => {
            const stateCities = cities.filter(c => c.state_id === state.id);
            const isStateExpanded = expandedState === state.id;
            return (
              <div key={state.id} style={{marginBottom:'6px'}}>
                <button className={styles.stateBtn} onClick={() => setExpandedState(isStateExpanded ? null : state.id)} onContextMenu={e => openCtx(e, state, 'states')}>
                  <span>🗺️</span> <span className="truncate" style={{flex:1}}>{state.name}</span>
                  <span style={{transform: isStateExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display:'flex'}}><ChevronDownIcon/></span>
                </button>
                {isStateExpanded && (
                  <div style={{paddingLeft:'12px', marginTop:'4px', display:'flex', flexDirection:'column', gap:'4px'}}>
                    {stateCities.map(city => {
                      const cityTehsils = tehsils.filter(t => t.city_id === city.id);
                      const isCityExpanded = expandedCity === city.id;
                      return (
                        <div key={city.id}>
                          <button className={styles.cityBtn} onClick={() => setExpandedCity(isCityExpanded ? null : city.id)} onContextMenu={e => openCtx(e, city, 'cities')}>
                            <span>🏢</span> <span className="truncate" style={{flex:1}}>{city.name}</span>
                            <span style={{transform: isCityExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display:'flex'}}><ChevronDownIcon/></span>
                          </button>
                          {isCityExpanded && (
                            <div style={{paddingLeft:'12px', marginTop:'4px', display:'flex', flexDirection:'column', gap:'4px'}}>
                              {cityTehsils.map(tehsil => {
                                const tehsilVillages = villages.filter(v => v.tehsil_id === tehsil.id);
                                const isTehsilExpanded = expandedTehsil === tehsil.id;
                                return (
                                  <div key={tehsil.id}>
                                    <button className={styles.cityBtn} style={{fontSize: '0.8rem'}} onClick={() => setExpandedTehsil(isTehsilExpanded ? null : tehsil.id)} onContextMenu={e => openCtx(e, tehsil, 'tehsils')}>
                                      <span>📍</span> <span className="truncate" style={{flex:1}}>{tehsil.name}</span>
                                      <span style={{transform: isTehsilExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display:'flex'}}><ChevronDownIcon/></span>
                                    </button>
                                    {isTehsilExpanded && (
                                      <div style={{paddingLeft:'14px', marginTop:'4px', display:'flex', flexDirection:'column', gap:'2px'}}>
                                        {tehsilVillages.map(v => (
                                          <button key={v.id} className={`${styles.villageBtn} ${selectedVillage?.id === v.id ? styles.villageActive : ''}`}
                                            onClick={() => selectVillage(v)} onContextMenu={e => openCtx(e, v, 'villages')}>
                                            <span className={styles.villageDot} />
                                            <span className="truncate">{v.name}</span>
                                          </button>
                                        ))}
                                        {tehsilVillages.length === 0 && <span style={{fontSize:'0.75rem',color:'var(--txt-3)',padding:'4px 10px'}}>No villages mapped</span>}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              {cityTehsils.length === 0 && <span style={{fontSize:'0.75rem',color:'var(--txt-3)',padding:'4px 10px'}}>No tehsils mapped</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {stateCities.length === 0 && <span style={{fontSize:'0.75rem',color:'var(--txt-3)',padding:'4px 10px'}}>No cities mapped</span>}
                  </div>
                )}
              </div>
            );
          })}
          {states.length === 0 && <p style={{fontSize:'0.8rem',color:'var(--txt-3)',padding:'8px 10px'}}>No locations found.</p>}
        </div>

        <div className={styles.sidebarFoot}>
          <div className={styles.sidebarUser}>
            <div style={{width:30,height:30,borderRadius:'50%',background:avatarBg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.7rem',fontWeight:800,color:'#fff',flexShrink:0}}>{initials}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:'0.82rem',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user?.name}</div>
              <div style={{fontSize:'0.72rem',color:'var(--txt-3)'}}>{user?.role || 'viewer'}</div>
            </div>
          </div>
        </div>
      </aside>

      {sidebarOpen && <div className={styles.backdrop} onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <main className={styles.main}>
        {/* Topbar */}
        <header className={styles.topbar}>
          <button className="btn btn-icon btn-ghost" onClick={() => setSidebarOpen(v => !v)} aria-label="Menu"><MenuIcon /></button>
          <div className={styles.searchBox}>
            <SearchIcon />
            <input type="search" className="form-input" placeholder="Search…" value={searchQuery} onChange={handleSearch}
              style={{paddingLeft:'36px',height:'38px',fontSize:'0.875rem'}} />
          </div>
          <div className={styles.topbarActions}>
            {canUpload() && (
              <>
                <button className="btn btn-primary btn-sm" onClick={() => folderInputRef.current?.click()} style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', border: 'none', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
                  <FolderUploadIcon /><span>Bulk Import</span>
                </button>
                <input ref={folderInputRef} type="file" webkitdirectory="true" directory="true" multiple className="hidden" onChange={handleFolderSelect} />
              </>
            )}
            {canUpload() && selectedVillage && (
              <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>
                <UpIcon /><span className={styles.hideXs}>Upload</span>
              </button>
            )}
            {canCreate() && selectedVillage && (
              <button className="btn btn-secondary btn-sm" onClick={() => setCreateFolderOpen(true)}>
                <FolderAddIcon /><span className={styles.hideSm}>New Folder</span>
              </button>
            )}
            <div className="dd-wrap">
              <button className={styles.userBtn} onClick={() => setUserMenuOpen(v => !v)}>
                <div style={{width:28,height:28,borderRadius:'50%',background:avatarBg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.7rem',fontWeight:800,color:'#fff'}}>{initials}</div>
                <span className={styles.hideSm} style={{fontSize:'0.84rem',fontWeight:600,maxWidth:100,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user?.name?.split(' ')[0]}</span>
                <ChevronDownIcon />
              </button>
              <div className={`dd-menu ${userMenuOpen ? 'open' : ''}`}>
                {isAdmin() && <button className="dd-item" onClick={() => navigate('/admin')}><ShieldIcon />Admin Panel</button>}
                <div className="dd-sep" />
                <button className="dd-item danger" onClick={handleLogout}><LogoutIcon />Sign Out</button>
              </div>
            </div>
          </div>
        </header>

        {/* Drive Content */}
        <div className={styles.driveContent}>
          {!selectedVillage ? (
            <div className="empty" style={{minHeight:'60vh'}}>
              <div className="empty-icon" style={{fontSize:'3rem'}}>🗂️</div>
              <p className="empty-title">Select a Village</p>
              <p className="empty-desc">Choose a city and village from the sidebar to browse its content</p>
              <button className="btn btn-secondary mt-4" onClick={() => setSidebarOpen(true)}>Open Sidebar</button>
            </div>
          ) : (
            <>
              {/* Breadcrumb */}
              <nav className={styles.breadcrumb}>
                <button className={styles.bcItem} onClick={() => navigateBreadcrumb(-1)}>{selectedVillage.name}</button>
                {breadcrumb.map((item, i) => (
                  <span key={item.id} style={{display:'flex',alignItems:'center',gap:'4px'}}>
                    <span style={{color:'var(--txt-3)'}}/>/
                    <button className={`${styles.bcItem} ${i === breadcrumb.length-1 ? styles.bcActive : ''}`}
                      onClick={() => navigateBreadcrumb(i)}>{item.name}</button>
                  </span>
                ))}
              </nav>

              {/* Toolbar */}
              <div className={styles.toolbar}>
                <h1 className={styles.toolbarTitle}>{currentFolder?.name || selectedVillage.name}</h1>
                <div style={{marginLeft:'auto',display:'flex',gap:'6px'}}>
                  <div className={styles.viewToggle}>
                    <button className={`${styles.vBtn} ${viewMode==='grid'?styles.vActive:''}`} onClick={() => setViewMode('grid')} title="Grid"><GridIcon /></button>
                    <button className={`${styles.vBtn} ${viewMode==='list'?styles.vActive:''}`} onClick={() => setViewMode('list')} title="List"><ListIcon /></button>
                  </div>
                </div>
              </div>

              {loading ? (
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'200px',gap:'12px',color:'var(--txt-3)'}}>
                  <div className="spinner spinner-lg" /><p>Loading…</p>
                </div>
              ) : (
                <>
                  {/* Folders */}
                  {folders.length > 0 && (
                    <>
                      <div className={styles.sectionHead}><span>Folders</span><span className={styles.sectionBadge}>{folders.length}</span></div>
                      <div className={viewMode==='grid' ? styles.grid : styles.list}>
                        {folders.map(f => viewMode === 'grid' ? (
                          <div key={f.id} className={styles.folderCard} onClick={() => openFolder(f)} onContextMenu={e => openCtx(e,f,'folder')}>
                            <button className={styles.cardDots} onClick={e => {e.stopPropagation();openCtx(e,f,'folder')}}><DotsIcon /></button>
                            <div className={styles.folderIconBox}><FolderBigIcon /></div>
                            <span className={`${styles.folderLabel} truncate`}>{f.name}</span>
                          </div>
                        ) : (
                          <div key={f.id} className={styles.listRow} onClick={() => openFolder(f)} onContextMenu={e => openCtx(e,f,'folder')}>
                            <div className={`${styles.listThumb} ${styles.listThumbFolder}`}><FolderBigIcon /></div>
                            <div style={{flex:1,minWidth:0}}>
                              <div className="truncate" style={{fontSize:'0.875rem',fontWeight:600}}>{f.name}</div>
                              <div style={{fontSize:'0.75rem',color:'var(--txt-3)'}}>Folder</div>
                            </div>
                            {canDelete() && <button className="btn btn-icon btn-ghost btn-sm" onClick={e=>{e.stopPropagation();handleDelete(f,'folder')}}><TrashIcon /></button>}
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Images */}
                  {images.length > 0 && (
                    <>
                      <div className={styles.sectionHead}><span>Images</span><span className={styles.sectionBadge}>{imgTotal}</span></div>
                      <div className={viewMode==='grid' ? styles.imgGrid : styles.list}>
                        {images.map((img, idx) => {
                          const src = getImageUrl(img);
                          return viewMode === 'grid' ? (
                            <div key={img.id} className={styles.imgCard} onClick={() => openLightbox(images,idx)} onContextMenu={e => openCtx(e,img,'image')}>
                              <button className={styles.cardDots} onClick={e=>{e.stopPropagation();openCtx(e,img,'image')}}><DotsIcon /></button>
                              {src
                                ? <LazyImage src={src} alt={img.name||''} className={styles.imgThumb} />
                                : <div className={styles.imgPlaceholder}>🖼️</div>}
                              <div className={styles.imgOverlay}>
                                <span className="truncate" style={{fontSize:'0.72rem',fontWeight:600,color:'#fff'}}>{img.name||img.original_name}</span>
                              </div>
                            </div>
                          ) : (
                            <div key={img.id} className={styles.listRow} onClick={() => openLightbox(images,idx)} onContextMenu={e => openCtx(e,img,'image')}>
                              <div className={`${styles.listThumb} ${styles.listThumbImg}`}>
                                {src ? <LazyImage src={src} alt="" /> : '🖼️'}
                              </div>
                              <div style={{flex:1,minWidth:0}}>
                                <div className="truncate" style={{fontSize:'0.875rem',fontWeight:600}}>{img.name||img.original_name}</div>
                                <div style={{fontSize:'0.75rem',color:'var(--txt-3)'}}>{img.size?formatBytes(img.size):''} · {timeAgo(img.created_at)}</div>
                              </div>
                              {canDelete() && <button className="btn btn-icon btn-ghost btn-sm" onClick={e=>{e.stopPropagation();handleDelete(img,'image')}}><TrashIcon /></button>}
                            </div>
                          );
                        })}
                      </div>
                      {imgTotal > 24 && (
                        <div className="pagination">
                          <span className="page-info">Showing {(imgPage-1)*24+1}–{Math.min(imgPage*24,imgTotal)} of {imgTotal}</span>
                          <div className="page-controls">
                            <button className="page-btn" disabled={imgPage===1} onClick={() => loadContent(selectedVillage.id,currentFolder?.id,imgPage-1,searchQuery)}><ChevLeftIcon /></button>
                            <button className="page-btn" disabled={imgPage*24>=imgTotal} onClick={() => loadContent(selectedVillage.id,currentFolder?.id,imgPage+1,searchQuery)}><ChevRightIcon /></button>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {folders.length===0 && images.length===0 && !loading && (
                    <div className="empty">
                      <div className="empty-icon">📂</div>
                      <p className="empty-title">{searchQuery ? 'No results' : 'Empty'}</p>
                      <p className="empty-desc">{searchQuery ? `No results for "${searchQuery}"` : canUpload() ? 'Upload images or create a folder.' : 'Nothing here yet.'}</p>
                      {canUpload() && !searchQuery && (
                        <button className="btn btn-primary mt-4" onClick={() => fileInputRef.current?.click()}><UpIcon /> Upload Images</button>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>

      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={e => { handleFiles(e.target.files); e.target.value=''; }} />

      {/* Drop Overlay */}
      {isDragging && (
        <div className={styles.dropOverlay}>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:'4rem',marginBottom:'12px'}}>☁️</div>
            <div style={{fontSize:'1.5rem',fontWeight:800,color:'var(--brand)'}}>Drop to Upload</div>
            <div style={{fontSize:'0.9rem',color:'var(--txt-2)',marginTop:'6px'}}>Release to upload images</div>
          </div>
        </div>
      )}

      {/* Upload Progress */}
      {uploadProgress && (
        <div className={styles.uploadBox}>
          <div style={{fontSize:'0.875rem',fontWeight:700,marginBottom:'10px'}}>⬆ Uploading…</div>
          {uploadProgress.files.map((f,i) => (
            <div key={i} style={{display:'flex',gap:'8px',marginBottom:'4px'}}>
              <span className="truncate" style={{fontSize:'0.78rem',color:'var(--txt-2)',flex:1}}>{f.name}</span>
              <span style={{fontSize:'0.72rem',color:f.status==='done'?'var(--green)':'var(--txt-3)'}}>{f.status==='done'?'✅':'…'}</span>
            </div>
          ))}
        </div>
      )}

      {/* Context Menu */}
      <div className={`${styles.ctxMenu} ${ctxMenu.open?styles.ctxOpen:''}`} style={{top:ctxMenu.y,left:ctxMenu.x}}>
        {ctxMenu.type==='image' && (
          <button className={styles.ctxItem} onClick={() => { openLightbox(images, images.findIndex(i=>i.id===ctxMenu.item?.id)); setCtxMenu(c=>({...c,open:false})); }}>
            <EyeIcon /> Preview
          </button>
        )}
        {(ctxMenu.type==='folder' || ['states','cities','tehsils','villages'].includes(ctxMenu.type)) && canRenameOrMove() && (
          <button className={styles.ctxItem} onClick={() => openRename(ctxMenu.item, ctxMenu.type)}><PencilIcon /> Rename</button>
        )}
        {canRenameOrMove() && (
          <button className={styles.ctxItem} onClick={() => openMove(ctxMenu.item, ctxMenu.type)}>📁 Move To...</button>
        )}
        {canDelete() && <>
          <div className={styles.ctxSep} />
          <button className={`${styles.ctxItem} ${styles.ctxDanger}`} onClick={() => handleDelete(ctxMenu.item,ctxMenu.type)}><TrashIcon /> Delete</button>
        </>}
      </div>

      {/* Create Folder Modal */}
      {createFolderOpen && (
        <div className="modal-mask open" onClick={e=>e.target===e.currentTarget&&setCreateFolderOpen(false)}>
          <div className="modal-box">
            <div className="modal-head"><span className="modal-title">New Folder</span><button className="modal-close" onClick={() => setCreateFolderOpen(false)}><XIcon /></button></div>
            <form onSubmit={createFolder}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Folder Name</label>
                  <input className="form-input" placeholder="My Folder" autoFocus value={folderName} onChange={e=>setFolderName(e.target.value)} required />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-secondary" onClick={() => setCreateFolderOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={modalLoading||!folderName.trim()}>
                  {modalLoading?<span className="spinner"/>:null} Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameOpen && (
        <div className="modal-mask open" onClick={e=>e.target===e.currentTarget&&setRenameOpen(false)}>
          <div className="modal-box">
            <div className="modal-head"><span className="modal-title">Rename {renameItem?.type}</span><button className="modal-close" onClick={() => setRenameOpen(false)}><XIcon /></button></div>
            <form onSubmit={renameFolder}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">New Name</label>
                  <input className="form-input" autoFocus value={newName} onChange={e=>setNewName(e.target.value)} required />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-secondary" onClick={() => setRenameOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={modalLoading||!newName.trim()}>
                  {modalLoading?<span className="spinner"/>:null} Rename
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Move Modal */}
      {moveOpen && (
        <div className="modal-mask open" onClick={e=>e.target===e.currentTarget&&setMoveOpen(false)}>
          <div className="modal-box">
            <div className="modal-head"><span className="modal-title">Move {moveItem?.type === 'folder' ? 'Folder' : 'Image'}</span><button className="modal-close" onClick={() => setMoveOpen(false)}><XIcon /></button></div>
            <form onSubmit={handleMove}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Destination Folder</label>
                  <select className="form-select" value={moveTargetFolderId} onChange={e => setMoveTargetFolderId(e.target.value)}>
                    <option value="">Root (No Folder)</option>
                    {allVillageFolders.filter(f => f.id !== moveItem?.id).map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-secondary" onClick={() => setMoveOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={modalLoading}>
                  {modalLoading?<span className="spinner"/>:null} Move
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox.open && (
        <div className={styles.lightbox} onClick={closeLightbox}>
          <div className={styles.lbHead} onClick={e=>e.stopPropagation()}>
            <span className="truncate" style={{flex:1,fontSize:'0.9rem',fontWeight:600}}>
              {lightbox.images[lightbox.index]?.name||lightbox.images[lightbox.index]?.original_name}
            </span>
            <div style={{display:'flex',gap:'8px'}}>
              {canDelete() && (
                <button className="btn btn-danger btn-sm" onClick={() => { handleDelete(lightbox.images[lightbox.index],'image'); closeLightbox(); }}>
                  <TrashIcon /> Delete
                </button>
              )}
              <button className={styles.lbClose} onClick={closeLightbox}><XIcon /></button>
            </div>
          </div>
          <img src={getImageUrl(lightbox.images[lightbox.index])} alt="" className={styles.lbImg} onClick={e => e.stopPropagation()} />
          {lightbox.images.length > 1 && (
            <>
              <button className={`${styles.lbNav} ${styles.lbNavPrev}`} onClick={e=>{e.stopPropagation();lightboxNav(-1)}}><ChevLeftIcon /></button>
              <button className={`${styles.lbNav} ${styles.lbNavNext}`} onClick={e=>{e.stopPropagation();lightboxNav(1)}}><ChevRightIcon /></button>
            </>
          )}
          <div className={styles.lbCounter}>{lightbox.index+1} / {lightbox.images.length}</div>
        </div>
      )}

      {/* Bulk Folder Importer Modal */}
      {bulkImportOpen && (
        <div className="modal-mask open" onClick={e => e.target === e.currentTarget && !bulkImportRunning && setBulkImportOpen(false)}>
          <div className="modal-box" style={{ maxWidth: '720px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '24px' }}>
            <div className="modal-head" style={{ marginBottom: '16px', flexShrink: 0 }}>
              <span className="modal-title" style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📦</span> Bulk Folder Importer
              </span>
              {!bulkImportRunning && (
                <button className="modal-close" onClick={() => setBulkImportOpen(false)}><XIcon /></button>
              )}
            </div>
            
            <div className="modal-body" style={{ overflowY: 'auto', flex: 1, paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Form Config */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', flexShrink: 0 }}>
                {/* State Selection */}
                <div className="form-group">
                  <label className="form-label">Target State</label>
                  <select 
                    className="form-select" 
                    value={bulkStateId} 
                    onChange={(e) => {
                      setBulkStateId(e.target.value);
                      setBulkCitySource('detect');
                      setBulkVillageSource('detect');
                    }}
                    disabled={bulkImportRunning}
                  >
                    <option value="">-- Select State --</option>
                    {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                {/* District Mapping */}
                <div className="form-group">
                  <label className="form-label">District Mapping</label>
                  <select 
                    className="form-select" 
                    value={bulkCitySource} 
                    onChange={(e) => {
                      setBulkCitySource(e.target.value);
                      setBulkTehsilSource('detect');
                      setBulkVillageSource('detect');
                    }}
                    disabled={bulkImportRunning || !bulkStateId}
                  >
                    <option value="detect">🔍 Detect from 1st folder name</option>
                    {cities.filter(c => String(c.state_id) === String(bulkStateId)).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Tehsil Mapping */}
                <div className="form-group">
                  <label className="form-label">Tehsil Mapping</label>
                  <select 
                    className="form-select" 
                    value={bulkTehsilSource} 
                    onChange={(e) => {
                      setBulkTehsilSource(e.target.value);
                      setBulkVillageSource('detect');
                    }}
                    disabled={bulkImportRunning || !bulkStateId || bulkCitySource === 'detect'}
                  >
                    <option value="detect">🔍 Detect from 2nd folder name</option>
                    {bulkCitySource !== 'detect' && cities.find(c => String(c.id) === String(bulkCitySource)) &&
                      tehsils.filter(t => String(t.city_id) === String(bulkCitySource)).map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))
                    }
                  </select>
                </div>

                {/* Village Mapping */}
                <div className="form-group">
                  <label className="form-label">Village Mapping</label>
                  <select 
                    className="form-select" 
                    value={bulkVillageSource} 
                    onChange={(e) => setBulkVillageSource(e.target.value)}
                    disabled={bulkImportRunning || !bulkStateId || bulkTehsilSource === 'detect'}
                  >
                    <option value="detect">🔍 Detect from folder name</option>
                    {bulkTehsilSource !== 'detect' && tehsils.find(t => String(t.id) === String(bulkTehsilSource)) &&
                      villages.filter(v => String(v.tehsil_id) === String(bulkTehsilSource)).map(v => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))
                    }
                  </select>
                </div>
              </div>

              {/* Summary Stats */}
              <div style={{ background: 'var(--bg-raised)', padding: '12px 16px', borderRadius: 'var(--r)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px', fontSize: '0.85rem', border: '1px solid var(--border)', flexShrink: 0 }}>
                <div>State: <strong style={{ color: 'var(--brand)' }}>{getBulkTreeStats().stateName}</strong></div>
                <div>Cities: <strong>{getBulkTreeStats().citiesCount}</strong></div>
                <div>Villages: <strong>{getBulkTreeStats().villagesCount}</strong></div>
                <div>Folders: <strong>{getBulkTreeStats().foldersCount}</strong></div>
                <div>Images: <strong>{getBulkTreeStats().imagesCount}</strong></div>
              </div>

              {/* Upload Progress */}
              {bulkImportRunning ? (
                <div style={{ padding: '4px 0', flexShrink: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '6px' }}>
                    <span>Uploading... <strong>{bulkProgressIndex + 1} / {bulkImportFiles.length}</strong></span>
                    <span>{Math.round((bulkProgressIndex / bulkImportFiles.length) * 100)}%</span>
                  </div>
                  <div style={{ height: '8px', background: 'var(--bg-raised)', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <div style={{ width: `${(bulkProgressIndex / bulkImportFiles.length) * 100}%`, height: '100%', background: 'linear-gradient(90deg, var(--brand) 0%, #818cf8 100%)', transition: 'width 0.2s' }} />
                  </div>
                  <div className="truncate" style={{ fontSize: '0.72rem', color: 'var(--txt-3)', marginTop: '6px' }}>
                    Uploading: {bulkImportFiles[bulkProgressIndex]?.relativePath || bulkImportFiles[bulkProgressIndex]?.webkitRelativePath || bulkImportFiles[bulkProgressIndex]?.name}
                  </div>
                </div>
              ) : bulkUploadLogs.length > 0 && (
                <div style={{ flexShrink: 0, padding: '4px 0' }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: bulkUploadLogs.some(l => l.status === 'error') ? 'var(--amber)' : 'var(--green)' }}>
                    Import finished: {bulkUploadLogs.filter(l => l.status === 'success').length} uploaded successfully, {bulkUploadLogs.filter(l => l.status === 'error').length} failed.
                  </div>
                </div>
              )}

              {/* Tree/Logs Scroll Container */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', background: 'var(--bg-card)', flex: 1, minHeight: '180px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--txt-3)', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
                  <span>{bulkUploadLogs.length > 0 ? 'Upload Log' : 'Import Structure Preview'}</span>
                  <span>{bulkImportFiles.length} files</span>
                </div>
                
                <div style={{ padding: '8px 12px', overflowY: 'auto', flex: 1, fontSize: '0.8rem', fontFamily: 'monospace' }}>
                  {bulkUploadLogs.length > 0 ? (
                    bulkUploadLogs.map((log, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.01)', gap: '10px' }}>
                        <span className="truncate" style={{ color: 'var(--txt-2)' }}>{log.name}</span>
                        <span style={{ 
                          color: log.status === 'success' ? 'var(--green)' : 
                                 log.status === 'error' ? 'var(--red)' : 
                                 log.status === 'uploading' ? 'var(--brand)' : 'var(--txt-3)',
                          fontWeight: 600,
                          flexShrink: 0
                        }}>
                          {log.status === 'success' && '✅ Done'}
                          {log.status === 'error' && `❌ ${log.error}`}
                          {log.status === 'uploading' && '⏳ Uploading...'}
                          {log.status === 'pending' && '⏳ Pending'}
                        </span>
                      </div>
                    ))
                  ) : (
                    bulkImportFiles.slice(0, 100).map((file, idx) => {
                      const relPath = file.relativePath || file.webkitRelativePath || file.name;
                      return (
                        <div key={idx} style={{ padding: '3px 0', color: 'var(--txt-3)' }} className="truncate">
                          📁 {relPath} <span style={{ fontSize: '0.7rem', color: 'var(--txt-3)', marginLeft: '6px' }}>({formatBytes(file.size)})</span>
                        </div>
                      );
                    })
                  )}
                  {bulkImportFiles.length > 100 && bulkUploadLogs.length === 0 && (
                    <div style={{ color: 'var(--txt-3)', fontStyle: 'italic', padding: '6px 0' }}>
                      ... and {bulkImportFiles.length - 100} more files
                    </div>
                  )}
                </div>
              </div>

            </div>

            <div className="modal-foot" style={{ padding: '12px 0 0', marginTop: '16px', flexShrink: 0, display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              {bulkImportRunning ? (
                <button type="button" className="btn btn-danger" onClick={() => { bulkCancelRef.current = true; }}>
                  Stop Import
                </button>
              ) : (
                <>
                  <button type="button" className="btn btn-secondary" onClick={() => setBulkImportOpen(false)}>
                    Close
                  </button>
                  
                  {bulkUploadLogs.some(l => l.status === 'error') && (
                    <button type="button" className="btn" style={{ background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.2)' }} onClick={handleRetryFailed}>
                      🔄 Retry Failed ({bulkUploadLogs.filter(l => l.status === 'error').length})
                    </button>
                  )}

                  <button 
                    type="button" 
                    className="btn btn-primary" 
                    disabled={!bulkStateId || bulkImportFiles.length === 0}
                    onClick={() => handleBulkUploadStart()}
                  >
                    🚀 Start Import
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Icons
const XIcon         = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width={16} height={16}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>;
const MenuIcon      = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width={20} height={20}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>;
const SearchIcon    = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width={16} height={16} style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',color:'var(--txt-3)',pointerEvents:'none'}}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>;
const UpIcon        = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width={15} height={15}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>;
const FolderAddIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width={15} height={15}><path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>;
const FolderBigIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width={26} height={26}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>;
const DotsIcon      = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width={14} height={14}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/></svg>;
const TrashIcon     = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width={14} height={14}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>;
const PencilIcon    = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width={14} height={14}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>;
const EyeIcon       = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width={14} height={14}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>;
const GridIcon      = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width={15} height={15}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>;
const ListIcon      = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width={15} height={15}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>;
const ChevronDownIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width={13} height={13}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>;
const ChevLeftIcon  = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width={15} height={15}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>;
const ChevRightIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width={15} height={15}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>;
const ShieldIcon    = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width={15} height={15}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>;
const LogoutIcon    = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width={15} height={15}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>;
const FolderUploadIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width={15} height={15}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>;
