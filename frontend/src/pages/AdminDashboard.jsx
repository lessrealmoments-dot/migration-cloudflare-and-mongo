import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Shield, Users, Settings, LogOut, Plus, Minus, Save, Image, Edit2, X, Upload, Loader2, BarChart3, HardDrive, Eye, FolderOpen, Search, UserX, UserCheck, Trash2, ExternalLink, Clock, Activity, ToggleLeft, ToggleRight, QrCode, Monitor, Link2, Trash } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Admin contact info for feature unavailable messages
const ADMIN_CONTACT = {
  phone: '09952568450',
  email: 'lessrealmoments@gmail.com'
};

// Helper to format bytes
const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// Storage quota options (in bytes)
const STORAGE_OPTIONS = [
  { label: '100 MB', value: 100 * 1024 * 1024 },
  { label: '250 MB', value: 250 * 1024 * 1024 },
  { label: '500 MB', value: 500 * 1024 * 1024 },
  { label: '1 GB', value: 1024 * 1024 * 1024 },
  { label: '2 GB', value: 2 * 1024 * 1024 * 1024 },
  { label: '5 GB', value: 5 * 1024 * 1024 * 1024 },
  { label: '10 GB', value: 10 * 1024 * 1024 * 1024 },
];

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [photographers, setPhotographers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingLimit, setEditingLimit] = useState(null);
  const [newLimit, setNewLimit] = useState(1);
  const [editingStorage, setEditingStorage] = useState(null);
  const [newStorageQuota, setNewStorageQuota] = useState(500 * 1024 * 1024);
  const [activeTab, setActiveTab] = useState('photographers');
  const [analytics, setAnalytics] = useState(null);
  const [landingConfig, setLandingConfig] = useState({
    hero_title: '',
    hero_subtitle: '',
    brand_name: 'PhotoShare',
    brand_tagline: '',
    favicon_url: '',
    hero_image_1: '',
    hero_image_2: '',
    hero_image_3: '',
    hero_image_4: '',
    hero_image_5: '',
    hero_image_6: '',
    hero_image_7: '',
    hero_image_8: '',
    hero_image_9: '',
    hero_image_10: ''
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(null);
  const fileInputRefs = useRef({});
  // New state for enhanced admin features
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedPhotographer, setSelectedPhotographer] = useState(null);
  const [photographerGalleries, setPhotographerGalleries] = useState([]);
  const [showGalleriesModal, setShowGalleriesModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [activityLogs, setActivityLogs] = useState([]);
  const [adminSettings, setAdminSettings] = useState(null);
  // Feature toggles state
  const [featureToggles, setFeatureToggles] = useState({
    qr_share: true,
    online_gallery: true,
    display_mode: true,
    contributor_link: true,
    auto_delete_enabled: true
  });
  const [savingToggles, setSavingToggles] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) {
      navigate('/admin');
      return;
    }
    fetchPhotographers();
    fetchLandingConfig();
    fetchAnalytics();
    fetchActivityLogs();
    fetchAdminSettings();
    fetchFeatureToggles();
  }, [navigate]);

  const getAuthHeader = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` }
  });

  const fetchPhotographers = async () => {
    try {
      const response = await axios.get(`${API}/admin/photographers`, getAuthHeader());
      setPhotographers(response.data);
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        localStorage.removeItem('adminToken');
        navigate('/admin');
      }
      toast.error('Failed to load photographers');
    } finally {
      setLoading(false);
    }
  };

  const fetchLandingConfig = async () => {
    try {
      const response = await axios.get(`${API}/admin/landing-config`, getAuthHeader());
      setLandingConfig(response.data);
    } catch (error) {
      console.error('Failed to load landing config');
    }
  };

  const fetchAnalytics = async () => {
    try {
      const response = await axios.get(`${API}/admin/analytics`, getAuthHeader());
      setAnalytics(response.data);
    } catch (error) {
      console.error('Failed to load analytics');
    }
  };

  const fetchActivityLogs = async () => {
    try {
      const response = await axios.get(`${API}/admin/activity-logs?limit=20`, getAuthHeader());
      setActivityLogs(response.data);
    } catch (error) {
      console.error('Failed to load activity logs');
    }
  };

  const fetchAdminSettings = async () => {
    try {
      const response = await axios.get(`${API}/admin/settings`, getAuthHeader());
      setAdminSettings(response.data);
    } catch (error) {
      console.error('Failed to load admin settings');
    }
  };

  const fetchPhotographerGalleries = async (userId) => {
    try {
      const response = await axios.get(`${API}/admin/photographers/${userId}/galleries`, getAuthHeader());
      setPhotographerGalleries(response.data);
      setShowGalleriesModal(true);
    } catch (error) {
      toast.error('Failed to load galleries');
    }
  };

  const handleSuspendUser = async (userId, currentStatus) => {
    const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
    try {
      await axios.put(
        `${API}/admin/photographers/${userId}/status`,
        { status: newStatus },
        getAuthHeader()
      );
      toast.success(`User ${newStatus === 'suspended' ? 'suspended' : 'activated'}`);
      fetchPhotographers();
      fetchActivityLogs();
    } catch (error) {
      toast.error('Failed to update user status');
    }
  };

  const handleDeletePhotographer = async (userId) => {
    try {
      await axios.delete(`${API}/admin/photographers/${userId}`, getAuthHeader());
      toast.success('Photographer deleted');
      setShowDeleteConfirm(null);
      fetchPhotographers();
      fetchActivityLogs();
    } catch (error) {
      toast.error('Failed to delete photographer');
    }
  };

  // Filter and sort photographers
  const filteredPhotographers = photographers
    .filter(p => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return p.name.toLowerCase().includes(query) || 
             p.email.toLowerCase().includes(query) ||
             (p.business_name && p.business_name.toLowerCase().includes(query));
    })
    .sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];
      if (sortBy === 'storage_used' || sortBy === 'storage_quota') {
        aVal = aVal || 0;
        bVal = bVal || 0;
      }
      if (sortOrder === 'asc') return aVal > bVal ? 1 : -1;
      return aVal < bVal ? 1 : -1;
    });

  const handleUpdateLimit = async (userId) => {
    try {
      await axios.put(
        `${API}/admin/photographers/${userId}/gallery-limit`,
        { max_galleries: newLimit },
        getAuthHeader()
      );
      toast.success('Gallery limit updated');
      setEditingLimit(null);
      fetchPhotographers();
    } catch (error) {
      toast.error('Failed to update limit');
    }
  };

  const handleUpdateStorageQuota = async (userId) => {
    try {
      await axios.put(
        `${API}/admin/photographers/${userId}/storage-quota`,
        { storage_quota: newStorageQuota },
        getAuthHeader()
      );
      toast.success('Storage quota updated');
      setEditingStorage(null);
      fetchPhotographers();
    } catch (error) {
      toast.error('Failed to update storage quota');
    }
  };

  const handleSaveLandingConfig = async () => {
    setSavingConfig(true);
    try {
      await axios.put(`${API}/admin/landing-config`, landingConfig, getAuthHeader());
      toast.success('Landing page updated');
    } catch (error) {
      toast.error('Failed to save changes');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleImageUpload = async (file, slot) => {
    if (!file) return;
    
    setUploadingImage(slot);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('image_slot', slot);
    
    try {
      const response = await axios.post(`${API}/admin/landing-image`, formData, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      // Update local state with new image URL
      setLandingConfig(prev => ({
        ...prev,
        [slot]: response.data.url
      }));
      
      toast.success('Image uploaded successfully');
    } catch (error) {
      toast.error('Failed to upload image');
    } finally {
      setUploadingImage(null);
    }
  };

  const handleFaviconUpload = async (file) => {
    if (!file) return;
    
    setUploadingImage('favicon');
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await axios.post(`${API}/admin/favicon`, formData, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      // Update local state with new favicon URL
      setLandingConfig(prev => ({
        ...prev,
        favicon_url: response.data.url
      }));
      
      // Also update the browser favicon immediately
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = `${BACKEND_URL}${response.data.url}`;
      
      toast.success('Favicon updated successfully! Refresh to see changes in browser tab.');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to upload favicon');
    } finally {
      setUploadingImage(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    navigate('/admin');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <div className="text-zinc-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-900">
      {/* Header */}
      <nav className="bg-zinc-800 border-b border-zinc-700">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-zinc-400" strokeWidth={1.5} />
            <h1 className="text-xl font-medium text-white">Admin Panel</h1>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
          >
            <LogOut className="w-5 h-5" strokeWidth={1.5} />
            Logout
          </button>
        </div>
      </nav>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex gap-4 mb-8">
          <button
            onClick={() => setActiveTab('photographers')}
            className={`flex items-center gap-2 px-4 py-2 rounded-sm transition-colors ${
              activeTab === 'photographers'
                ? 'bg-white text-zinc-900'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            <Users className="w-5 h-5" strokeWidth={1.5} />
            Photographers
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 px-4 py-2 rounded-sm transition-colors ${
              activeTab === 'analytics'
                ? 'bg-white text-zinc-900'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            <BarChart3 className="w-5 h-5" strokeWidth={1.5} />
            Analytics
          </button>
          <button
            onClick={() => setActiveTab('landing')}
            className={`flex items-center gap-2 px-4 py-2 rounded-sm transition-colors ${
              activeTab === 'landing'
                ? 'bg-white text-zinc-900'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            <Settings className="w-5 h-5" strokeWidth={1.5} />
            Landing Page
          </button>
        </div>

        {/* Photographers Tab */}
        {activeTab === 'photographers' && (
          <div className="bg-zinc-800 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-700">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-medium text-white">Manage Photographers</h2>
                  <p className="text-sm text-zinc-500 mt-1">
                    Adjust gallery limits, storage quotas, and manage accounts.
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Search by name or email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-zinc-700 text-white pl-10 pr-4 py-2 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  {/* Sort */}
                  <select
                    value={`${sortBy}-${sortOrder}`}
                    onChange={(e) => {
                      const [field, order] = e.target.value.split('-');
                      setSortBy(field);
                      setSortOrder(order);
                    }}
                    className="bg-zinc-700 text-white px-3 py-2 rounded-lg text-sm"
                  >
                    <option value="created_at-desc">Newest First</option>
                    <option value="created_at-asc">Oldest First</option>
                    <option value="storage_used-desc">Most Storage</option>
                    <option value="name-asc">Name A-Z</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-zinc-700/50">
                  <tr>
                    <th className="text-left px-6 py-3 text-sm font-medium text-zinc-400">User</th>
                    <th className="text-center px-6 py-3 text-sm font-medium text-zinc-400">Status</th>
                    <th className="text-center px-6 py-3 text-sm font-medium text-zinc-400">Galleries</th>
                    <th className="text-center px-6 py-3 text-sm font-medium text-zinc-400">Max</th>
                    <th className="text-center px-6 py-3 text-sm font-medium text-zinc-400">Storage</th>
                    <th className="text-center px-6 py-3 text-sm font-medium text-zinc-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-700">
                  {filteredPhotographers.map((p) => (
                    <tr key={p.id} className={`hover:bg-zinc-700/30 ${p.status === 'suspended' ? 'opacity-60' : ''}`}>
                      <td className="px-6 py-4">
                        <div className="text-sm text-white font-medium">{p.name}</div>
                        <div className="text-xs text-zinc-400">{p.email}</div>
                        {p.business_name && <div className="text-xs text-zinc-500">{p.business_name}</div>}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          p.status === 'suspended' 
                            ? 'bg-red-900/50 text-red-300' 
                            : 'bg-green-900/50 text-green-300'
                        }`}>
                          {p.status || 'active'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-center">
                        <button
                          onClick={() => { setSelectedPhotographer(p); fetchPhotographerGalleries(p.id); }}
                          className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-200 hover:text-white transition-colors"
                          data-testid={`view-galleries-${p.id}`}
                        >
                          {p.active_galleries}/{p.galleries_created_total} galleries
                        </button>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {editingLimit === p.id ? (
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => setNewLimit(Math.max(1, newLimit - 1))}
                              className="w-8 h-8 bg-zinc-600 rounded flex items-center justify-center text-white hover:bg-zinc-500"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-10 text-center text-white font-medium">{newLimit}</span>
                            <button
                              onClick={() => setNewLimit(newLimit + 1)}
                              className="w-8 h-8 bg-zinc-600 rounded flex items-center justify-center text-white hover:bg-zinc-500"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                            p.galleries_created_total >= p.max_galleries
                              ? 'bg-red-900/50 text-red-300'
                              : 'bg-zinc-700 text-zinc-300'
                          }`}>
                            {p.max_galleries}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {editingStorage === p.id ? (
                          <select
                            value={newStorageQuota}
                            onChange={(e) => setNewStorageQuota(parseInt(e.target.value))}
                            className="bg-zinc-600 text-white rounded px-2 py-1 text-sm"
                          >
                            {STORAGE_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="text-sm">
                            <div className="text-zinc-300">{formatBytes(p.storage_used)}</div>
                            <div className="text-zinc-500 text-xs">/ {formatBytes(p.storage_quota)}</div>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {editingLimit === p.id ? (
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => handleUpdateLimit(p.id)} className="p-2 bg-green-600 rounded text-white hover:bg-green-500" title="Save">
                              <Save className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditingLimit(null)} className="p-2 bg-zinc-600 rounded text-white hover:bg-zinc-500" title="Cancel">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : editingStorage === p.id ? (
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => handleUpdateStorageQuota(p.id)} className="p-2 bg-green-600 rounded text-white hover:bg-green-500" title="Save">
                              <Save className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditingStorage(null)} className="p-2 bg-zinc-600 rounded text-white hover:bg-zinc-500" title="Cancel">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => { setEditingLimit(p.id); setNewLimit(p.max_galleries); }}
                              className="p-2 bg-zinc-600 rounded text-white hover:bg-zinc-500"
                              title="Edit gallery limit"
                            >
                              <FolderOpen className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => { setEditingStorage(p.id); setNewStorageQuota(p.storage_quota || 500 * 1024 * 1024); }}
                              className="p-2 bg-zinc-600 rounded text-white hover:bg-zinc-500"
                              title="Edit storage quota"
                            >
                              <HardDrive className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleSuspendUser(p.id, p.status)}
                              className={`p-2 rounded text-white hover:opacity-80 ${
                                p.status === 'suspended' ? 'bg-green-600' : 'bg-yellow-600'
                              }`}
                              title={p.status === 'suspended' ? 'Activate' : 'Suspend'}
                            >
                              {p.status === 'suspended' ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => setShowDeleteConfirm(p.id)}
                              className="p-2 bg-red-600 rounded text-white hover:bg-red-500"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {filteredPhotographers.length === 0 && (
                <div className="text-center py-12 text-zinc-500">
                  {searchQuery ? 'No photographers match your search' : 'No photographers registered yet'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-zinc-800 rounded-lg max-w-md w-full p-6">
              <h3 className="text-xl font-medium text-white mb-4">Delete Photographer?</h3>
              <p className="text-zinc-400 mb-6">
                This will permanently delete the photographer account and all their galleries and photos. This cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="px-4 py-2 bg-zinc-700 text-white rounded-lg hover:bg-zinc-600"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeletePhotographer(showDeleteConfirm)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Photographer Galleries Modal */}
        {showGalleriesModal && selectedPhotographer && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-zinc-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
              <div className="p-6 border-b border-zinc-700 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-medium text-white">{selectedPhotographer.name}&apos;s Galleries</h3>
                  <p className="text-sm text-zinc-400">{photographerGalleries.length} galleries</p>
                </div>
                <button onClick={() => setShowGalleriesModal(false)} className="p-2 hover:bg-zinc-700 rounded">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto max-h-[60vh]">
                {photographerGalleries.length === 0 ? (
                  <p className="text-zinc-500 text-center py-8">No galleries created</p>
                ) : (
                  <div className="space-y-3">
                    {photographerGalleries.map(g => (
                      <div key={g.id} className="bg-zinc-700/50 rounded-lg p-4 flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="text-white font-medium">{g.title}</h4>
                          <p className="text-sm text-zinc-400">{g.photo_count} photos • {g.theme}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setShowGalleriesModal(false); navigate(`/admin/gallery/${g.id}`); }}
                            className="p-2 bg-primary rounded text-white hover:opacity-90"
                            title="Review & Flag Photos"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <a
                            href={`${BACKEND_URL}/g/${g.share_link}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 bg-zinc-600 rounded text-white hover:bg-zinc-500"
                            title="View Public Gallery"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && analytics && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-zinc-800 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-2">
                  <Users className="w-5 h-5 text-blue-400" />
                  <span className="text-zinc-400 text-sm">Photographers</span>
                </div>
                <div className="text-3xl font-bold text-white">{analytics.total_photographers}</div>
              </div>
              <div className="bg-zinc-800 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-2">
                  <FolderOpen className="w-5 h-5 text-green-400" />
                  <span className="text-zinc-400 text-sm">Total Galleries</span>
                </div>
                <div className="text-3xl font-bold text-white">{analytics.total_galleries}</div>
              </div>
              <div className="bg-zinc-800 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-2">
                  <Image className="w-5 h-5 text-purple-400" />
                  <span className="text-zinc-400 text-sm">Total Photos</span>
                </div>
                <div className="text-3xl font-bold text-white">{analytics.total_photos}</div>
              </div>
              <div className="bg-zinc-800 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-2">
                  <HardDrive className="w-5 h-5 text-amber-400" />
                  <span className="text-zinc-400 text-sm">Storage Used</span>
                </div>
                <div className="text-3xl font-bold text-white">{formatBytes(analytics.total_storage_used)}</div>
              </div>
            </div>

            {/* Top Galleries */}
            <div className="bg-zinc-800 rounded-lg">
              <div className="px-6 py-4 border-b border-zinc-700">
                <h2 className="text-lg font-medium text-white">Top Galleries by Views</h2>
              </div>
              <div className="p-6">
                {analytics.top_galleries.length > 0 ? (
                  <div className="space-y-4">
                    {analytics.top_galleries.map((g, index) => (
                      <div key={g.gallery_id} className="flex items-center gap-4 bg-zinc-700/30 rounded-lg p-4">
                        <div className="w-8 h-8 bg-zinc-600 rounded-full flex items-center justify-center text-white font-bold">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-white font-medium">{g.gallery_title}</h3>
                          <p className="text-zinc-400 text-sm">{g.total_photos} photos</p>
                        </div>
                        <div className="flex items-center gap-2 text-zinc-300">
                          <Eye className="w-4 h-4" />
                          {g.view_count} views
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-zinc-500 text-center py-8">No galleries yet</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Landing Page Tab */}
        {activeTab === 'landing' && (
          <div className="bg-zinc-800 rounded-lg">
            <div className="px-6 py-4 border-b border-zinc-700">
              <h2 className="text-lg font-medium text-white">Landing Page Settings</h2>
              <p className="text-sm text-zinc-500 mt-1">Customize the public landing page</p>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Brand Name</label>
                  <input
                    type="text"
                    value={landingConfig.brand_name}
                    onChange={(e) => setLandingConfig({ ...landingConfig, brand_name: e.target.value })}
                    className="w-full bg-zinc-700 border border-zinc-600 rounded-sm px-4 py-3 text-white focus:outline-none focus:border-zinc-500"
                    placeholder="PhotoShare"
                    data-testid="brand-name-input"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Brand Tagline (shown below brand name)</label>
                  <input
                    type="text"
                    value={landingConfig.brand_tagline || ''}
                    onChange={(e) => setLandingConfig({ ...landingConfig, brand_tagline: e.target.value })}
                    className="w-full bg-zinc-700 border border-zinc-600 rounded-sm px-4 py-3 text-white focus:outline-none focus:border-zinc-500"
                    placeholder="e.g., by Less Real Moments"
                    data-testid="brand-tagline-input"
                  />
                </div>
              </div>

              {/* Favicon Upload */}
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Site Favicon (Browser Tab Icon)</label>
                <p className="text-xs text-zinc-500 mb-3">Upload your logo to display in the browser tab. Recommended: 32x32 or 64x64 PNG/ICO file.</p>
                
                <div className="flex items-center gap-4">
                  {landingConfig.favicon_url ? (
                    <div className="relative">
                      <div className="w-16 h-16 bg-zinc-700 rounded-lg flex items-center justify-center border border-zinc-600 overflow-hidden">
                        <img 
                          src={`${BACKEND_URL}${landingConfig.favicon_url}`} 
                          alt="Current favicon" 
                          className="w-full h-full object-contain p-2"
                        />
                      </div>
                      <button
                        onClick={() => setLandingConfig({ ...landingConfig, favicon_url: '' })}
                        className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600"
                        title="Remove favicon"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-16 h-16 bg-zinc-700 rounded-lg flex items-center justify-center border-2 border-dashed border-zinc-600">
                      <Image className="w-6 h-6 text-zinc-500" />
                    </div>
                  )}
                  
                  <div className="flex-1">
                    <input
                      type="file"
                      id="favicon-upload"
                      accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,image/jpeg,image/gif,.ico"
                      className="hidden"
                      onChange={(e) => handleFaviconUpload(e.target.files[0])}
                      data-testid="favicon-upload-input"
                    />
                    <label
                      htmlFor="favicon-upload"
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-sm cursor-pointer transition-colors ${
                        uploadingImage === 'favicon' 
                          ? 'bg-zinc-600 text-zinc-400 cursor-not-allowed'
                          : 'bg-zinc-700 hover:bg-zinc-600 text-white'
                      }`}
                    >
                      {uploadingImage === 'favicon' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          {landingConfig.favicon_url ? 'Change Favicon' : 'Upload Favicon'}
                        </>
                      )}
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-2">Hero Title</label>
                <input
                  type="text"
                  value={landingConfig.hero_title}
                  onChange={(e) => setLandingConfig({ ...landingConfig, hero_title: e.target.value })}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded-sm px-4 py-3 text-white focus:outline-none focus:border-zinc-500"
                  placeholder="Share Your Photography, Beautifully"
                  data-testid="hero-title-input"
                />
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-2">Hero Subtitle</label>
                <textarea
                  value={landingConfig.hero_subtitle}
                  onChange={(e) => setLandingConfig({ ...landingConfig, hero_subtitle: e.target.value })}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded-sm px-4 py-3 text-white focus:outline-none focus:border-zinc-500 min-h-[100px]"
                  placeholder="Create stunning galleries..."
                  data-testid="hero-subtitle-input"
                />
              </div>

              {/* Hero Images Carousel (up to 10) */}
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Hero Images (Carousel - up to 10 images)</label>
                <p className="text-xs text-zinc-500 mb-4">Upload multiple images for a rotating carousel on the landing page</p>
                
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                    const imageKey = `hero_image_${num}`;
                    const imageUrl = landingConfig[imageKey];
                    
                    return (
                      <div key={num} className="space-y-2">
                        <input
                          type="file"
                          ref={(el) => fileInputRefs.current[imageKey] = el}
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleImageUpload(e.target.files[0], imageKey)}
                        />
                        {imageUrl ? (
                          <div className="relative group">
                            <img 
                              src={imageUrl.startsWith('/api') 
                                ? `${BACKEND_URL}${imageUrl}` 
                                : imageUrl
                              } 
                              alt={`Hero ${num}`} 
                              className="w-full h-24 object-cover rounded"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded">
                              <button
                                onClick={() => fileInputRefs.current[imageKey]?.click()}
                                disabled={uploadingImage === imageKey}
                                className="bg-white/20 hover:bg-white/30 p-2 rounded-full"
                                title="Replace"
                              >
                                {uploadingImage === imageKey ? (
                                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                                ) : (
                                  <Upload className="w-4 h-4 text-white" />
                                )}
                              </button>
                              <button
                                onClick={() => setLandingConfig({ ...landingConfig, [imageKey]: '' })}
                                className="bg-red-500/50 hover:bg-red-500/70 p-2 rounded-full"
                                title="Remove"
                              >
                                <X className="w-4 h-4 text-white" />
                              </button>
                            </div>
                            <span className="absolute bottom-1 left-1 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded">{num}</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => fileInputRefs.current[imageKey]?.click()}
                            disabled={uploadingImage === imageKey}
                            className="w-full h-24 border-2 border-dashed border-zinc-600 rounded flex flex-col items-center justify-center text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 transition-colors"
                          >
                            {uploadingImage === imageKey ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                              <>
                                <Upload className="w-5 h-5 mb-1" />
                                <span className="text-xs">{num}</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-700">
                <button
                  onClick={handleSaveLandingConfig}
                  disabled={savingConfig}
                  className="bg-white text-zinc-900 hover:bg-zinc-100 h-12 px-8 rounded-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  data-testid="save-landing-config"
                >
                  <Save className="w-5 h-5" />
                  {savingConfig ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
