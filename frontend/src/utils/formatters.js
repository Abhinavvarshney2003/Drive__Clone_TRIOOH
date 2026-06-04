const STORAGE_BASE = import.meta.env.VITE_STORAGE_BASE_URL || '/uploads';

/** Format file size bytes → human readable */
export const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

/** Format unix timestamp → human readable date */
export const formatDate = (ts) => {
  if (!ts) return '';
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** Format datetime */
export const formatDateTime = (ts) => {
  if (!ts) return '';
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** Relative time */
export const timeAgo = (ts) => {
  if (!ts) return '';
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  const diff = Date.now() - d.getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60)  return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
  return formatDate(ts);
};

/** Get initials from name */
export const getInitials = (name = '') =>
  name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';

/** Construct image URL from API response */
export const getImageUrl = (image) => {
  if (!image) return null;
  // If the API returns a full URL, use it
  if (image.url && image.url.startsWith('http')) return image.url;
  if (image.image_url && image.image_url.startsWith('http')) return image.image_url;
  // Construct from path
  if (image.path) {
    if (image.path.startsWith('http')) return image.path;
    return `${STORAGE_BASE}/${image.path}`;
  }
  if (image.file_path) {
    if (image.file_path.startsWith('http')) return image.file_path;
    return `${STORAGE_BASE}/${image.file_path}`;
  }
  return null;
};

/** Storage usage percentage */
export const storagePercent = (used, quota) => {
  if (!quota || quota === 0) return 0;
  return Math.min(100, Math.round((used / quota) * 100));
};

/** Role to badge class */
export const roleBadgeClass = (role = '') => {
  const r = role.toLowerCase();
  if (r.includes('super') || r.includes('admin')) return 'badge-admin';
  if (r.includes('editor')) return 'badge-editor';
  return 'badge-viewer';
};

/** Role display name */
export const roleLabel = (role = '') => {
  const r = role.toLowerCase();
  if (r.includes('super') || r.includes('admin')) return 'Super Admin';
  if (r.includes('editor')) return 'Editor';
  return 'Viewer';
};

/** Get file extension */
export const getExt = (name = '') => name.split('.').pop().toLowerCase();

/** Check if mime type is image */
export const isImageMime = (mime = '') => mime.startsWith('image/');

/** Generate avatar color from string */
export const avatarColor = (str = '') => {
  const colors = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};
