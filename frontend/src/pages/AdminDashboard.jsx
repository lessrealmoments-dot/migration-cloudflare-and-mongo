import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Shield, Users, Settings, LogOut, Plus, Minus, Save, Image, Edit2, X } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [photographers, setPhotographers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingLimit, setEditingLimit] = useState(null);
  const [newLimit, setNewLimit] = useState(1);
  const [activeTab, setActiveTab] = useState('photographers');
  const [landingConfig, setLandingConfig] = useState({
    hero_title: '',
    hero_subtitle: '',
    brand_name: 'PhotoShare',
    hero_image_1: '',
    hero_image_2: ''
  });
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) {
      navigate('/admin');
      return;
    }
    fetchPhotographers();
    fetchLandingConfig();
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
              <h2 className="text-lg font-medium text-white">Manage Photographers</h2>
              <p className="text-sm text-zinc-500 mt-1">
                Adjust gallery limits for each photographer. Total Created counts all galleries ever made (prevents recycling).
              </p>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-zinc-700/50">
                  <tr>
                    <th className="text-left px-6 py-3 text-sm font-medium text-zinc-400">Email</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-zinc-400">Name</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-zinc-400">Business</th>
                    <th className="text-center px-6 py-3 text-sm font-medium text-zinc-400">Active</th>
                    <th className="text-center px-6 py-3 text-sm font-medium text-zinc-400">Total Created</th>
                    <th className="text-center px-6 py-3 text-sm font-medium text-zinc-400">Max Allowed</th>
                    <th className="text-center px-6 py-3 text-sm font-medium text-zinc-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-700">
                  {photographers.map((p) => (
                    <tr key={p.id} className="hover:bg-zinc-700/30">
                      <td className="px-6 py-4 text-sm text-zinc-300">{p.email}</td>
                      <td className="px-6 py-4 text-sm text-white">{p.name}</td>
                      <td className="px-6 py-4 text-sm text-zinc-400">{p.business_name || '-'}</td>
                      <td className="px-6 py-4 text-sm text-center text-zinc-300">{p.active_galleries}</td>
                      <td className="px-6 py-4 text-sm text-center text-zinc-300">{p.galleries_created_total}</td>
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
                              : 'bg-green-900/50 text-green-300'
                          }`}>
                            {p.max_galleries}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {editingLimit === p.id ? (
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleUpdateLimit(p.id)}
                              className="p-2 bg-green-600 rounded text-white hover:bg-green-500"
                              title="Save"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingLimit(null)}
                              className="p-2 bg-zinc-600 rounded text-white hover:bg-zinc-500"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingLimit(p.id);
                              setNewLimit(p.max_galleries);
                            }}
                            className="p-2 bg-zinc-600 rounded text-white hover:bg-zinc-500"
                            title="Edit limit"
                            data-testid={`edit-limit-${p.id}`}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {photographers.length === 0 && (
                <div className="text-center py-12 text-zinc-500">
                  No photographers registered yet
                </div>
              )}
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Hero Image 1 URL</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={landingConfig.hero_image_1 || ''}
                      onChange={(e) => setLandingConfig({ ...landingConfig, hero_image_1: e.target.value })}
                      className="flex-1 bg-zinc-700 border border-zinc-600 rounded-sm px-4 py-3 text-white focus:outline-none focus:border-zinc-500"
                      placeholder="https://..."
                      data-testid="hero-image-1-input"
                    />
                  </div>
                  {landingConfig.hero_image_1 && (
                    <img 
                      src={landingConfig.hero_image_1} 
                      alt="Preview" 
                      className="mt-2 h-32 object-cover rounded"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Hero Image 2 URL</label>
                  <input
                    type="text"
                    value={landingConfig.hero_image_2 || ''}
                    onChange={(e) => setLandingConfig({ ...landingConfig, hero_image_2: e.target.value })}
                    className="w-full bg-zinc-700 border border-zinc-600 rounded-sm px-4 py-3 text-white focus:outline-none focus:border-zinc-500"
                    placeholder="https://..."
                    data-testid="hero-image-2-input"
                  />
                  {landingConfig.hero_image_2 && (
                    <img 
                      src={landingConfig.hero_image_2} 
                      alt="Preview" 
                      className="mt-2 h-32 object-cover rounded"
                    />
                  )}
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
