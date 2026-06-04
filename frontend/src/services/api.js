import { getCookie } from '../utils/cookies';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

class ApiClient {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  getAuthHeader() {
    const token = getCookie('access_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = { ...this.getAuthHeader(), ...options.headers };
    
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await fetch(url, { ...options, headers });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'API Error');
      return data;
    } catch (error) {
      throw error;
    }
  }

  // Auth
  login(email, password) { return this.request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); }
  logout() { return this.request('/auth/logout', { method: 'POST' }); }
  getMe() { return this.request('/auth/me'); }
  getRolesPermissions() { return this.request('/auth/roles-permissions'); }

  // Admin - Users
  getUsers() { return this.request('/users'); }
  updateUserRole(id, role) { return this.request(`/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }); }
  createUser(name, email, password, role) { return this.request('/users', { method: 'POST', body: JSON.stringify({ name, email, password, role }) }); }

  // Locations (Admin + Drive)
  getCountries() { return this.request('/locations/countries'); }
  getStates(countryId) { return this.request(`/locations/states${countryId ? `?country_id=${countryId}` : ''}`); }
  getCities(stateId) { return this.request(`/locations/cities${stateId ? `?state_id=${stateId}` : ''}`); }
  getVillages(cityId) { return this.request(`/locations/villages${cityId ? `?city_id=${cityId}` : ''}`); }
  
  createLocation(type, data) { return this.request(`/locations/${type}`, { method: 'POST', body: JSON.stringify(data) }); }
  deleteLocation(type, id) { return this.request(`/locations/${type}/${id}`, { method: 'DELETE' }); }

  // Drive
  getFolders(page, limit, villageId, search) {
    let q = `?page=${page || 1}&limit=${limit || 50}`;
    if (villageId) q += `&village_id=${villageId}`;
    if (search) q += `&search=${search}`;
    return this.request(`/folders${q}`);
  }
  createFolder(name, villageId, parentId) { return this.request('/folders', { method: 'POST', body: JSON.stringify({ name, village_id: villageId, parent_id: parentId }) }); }
  updateFolder(id, name) { return this.request(`/folders/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }); }
  deleteFolder(id) { return this.request(`/folders/${id}`, { method: 'DELETE' }); }

  getImages(page, limit, folderId, villageId, search) {
    let q = `?page=${page || 1}&limit=${limit || 50}`;
    if (folderId) q += `&folder_id=${folderId}`;
    if (villageId) q += `&village_id=${villageId}`;
    if (search) q += `&search=${search}`;
    return this.request(`/images${q}`);
  }
  uploadImages(files, folderId, villageId) {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) formData.append('images[]', files[i]);
    if (folderId) formData.append('folder_id', folderId);
    if (villageId) formData.append('village_id', villageId);
    return this.request('/images/upload', { method: 'POST', body: formData });
  }
  uploadBulkImage(formData) {
    return this.request('/images/upload-bulk', { method: 'POST', body: formData });
  }
  deleteImage(id) { return this.request(`/images/${id}`, { method: 'DELETE' }); }
}

const api = new ApiClient();
export default api;
