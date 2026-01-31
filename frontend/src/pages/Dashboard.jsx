import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, LogOut, Image as ImageIcon, Lock, User, X, Save } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Dashboard = ({ user, setUser }) => {
  const navigate = useNavigate();
  const [galleries, setGalleries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    business_name: user?.business_name || ''
  });
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    fetchGalleries();
  }, []);

  useEffect(() => {
    if (user) {
      setProfileData({
        name: user.name || '',
        business_name: user.business_name || ''
      });
    }
  }, [user]);

  const fetchGalleries = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/galleries`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setGalleries(response.data);
    } catch (error) {
      toast.error('Failed to load galleries');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    navigate('/');
    toast.success('Logged out successfully');
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(`${API}/auth/profile`, profileData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Update local user data
      const updatedUser = { ...user, ...response.data };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      
      toast.success('Profile updated successfully');
      setShowProfileModal(false);
    } catch (error) {
      toast.error('Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50/30">
      <nav className="border-b border-zinc-200 bg-white">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-12 py-6 flex justify-between items-center">
          <h1
            className="text-2xl font-medium cursor-pointer"
            style={{ fontFamily: 'Playfair Display, serif' }}
            onClick={() => navigate('/')}
          >
            PhotoShare
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-600">
              Welcome, {user?.business_name || user?.name}
            </span>
            <button
              data-testid="profile-button"
              onClick={() => setShowProfileModal(true)}
              className="hover:bg-zinc-100 text-foreground h-10 px-4 rounded-sm font-medium transition-all duration-300 flex items-center gap-2"
              title="Edit Profile"
            >
              <User className="w-4 h-4" strokeWidth={1.5} />
              Profile
            </button>
            <button
              data-testid="logout-button"
              onClick={handleLogout}
              className="hover:bg-zinc-100 text-foreground h-10 px-4 rounded-sm font-medium transition-all duration-300 flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.5} />
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-screen-2xl mx-auto px-6 md:px-12 py-12">
        <div className="mb-12 flex justify-between items-center">
          <div>
            <h2
              className="text-4xl md:text-5xl font-normal tracking-tight mb-4"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              My Galleries
            </h2>
            <p className="text-base font-light text-zinc-600">
              Manage your photo galleries and share with clients
            </p>
          </div>
          <button
            data-testid="create-gallery-button"
            onClick={() => navigate('/gallery/create')}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-8 rounded-sm font-medium tracking-wide transition-all duration-300 flex items-center gap-2"
          >
            <Plus className="w-5 h-5" strokeWidth={1.5} />
            Create Gallery
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <p className="text-zinc-500">Loading galleries...</p>
          </div>
        ) : galleries.length === 0 ? (
          <div className="text-center py-20">
            <ImageIcon className="w-16 h-16 mx-auto mb-6 text-zinc-300" strokeWidth={1.5} />
            <h3
              className="text-2xl md:text-3xl font-normal mb-4"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              No galleries yet
            </h3>
            <p className="text-base font-light text-zinc-600 mb-8">
              Create your first gallery to get started
            </p>
            <button
              data-testid="empty-create-gallery-button"
              onClick={() => navigate('/gallery/create')}
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-8 rounded-sm font-medium tracking-wide transition-all duration-300"
            >
              Create Gallery
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {galleries.map((gallery) => (
              <div
                key={gallery.id}
                data-testid={`gallery-card-${gallery.id}`}
                onClick={() => navigate(`/gallery/${gallery.id}`)}
                className="rounded-sm border border-zinc-200 bg-white text-card-foreground shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-all duration-300"
              >
                {gallery.cover_photo_url ? (
                  <div className="w-full h-48 overflow-hidden">
                    <img
                      src={`${process.env.REACT_APP_BACKEND_URL}${gallery.cover_photo_url}`}
                      alt={gallery.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-full h-48 bg-zinc-100 flex items-center justify-center">
                    <ImageIcon className="w-16 h-16 text-zinc-300" strokeWidth={1.5} />
                  </div>
                )}
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h3
                      className="text-2xl md:text-3xl font-normal"
                      style={{ fontFamily: 'Playfair Display, serif' }}
                    >
                      {gallery.title}
                    </h3>
                    {gallery.has_password && (
                      <Lock className="w-5 h-5 text-zinc-400" strokeWidth={1.5} />
                    )}
                  </div>
                  {gallery.description && (
                    <p className="text-sm text-zinc-600 mb-4 line-clamp-2">{gallery.description}</p>
                  )}
                  <div className="flex justify-between items-center text-sm text-zinc-500">
                    <span>{gallery.photo_count} photos</span>
                    <span className="text-xs uppercase tracking-wider">
                      {new Date(gallery.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm p-8 max-w-md w-full" data-testid="profile-modal">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-medium" style={{ fontFamily: 'Playfair Display, serif' }}>
                Edit Profile
              </h3>
              <button
                onClick={() => setShowProfileModal(false)}
                className="p-2 hover:bg-zinc-100 rounded-sm transition-colors"
              >
                <X className="w-5 h-5" strokeWidth={1.5} />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Your Name</label>
                <input
                  type="text"
                  value={profileData.name}
                  onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                  className="w-full border border-zinc-300 rounded-sm px-4 py-3 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  placeholder="Your personal name"
                  data-testid="profile-name-input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Business Name</label>
                <input
                  type="text"
                  value={profileData.business_name}
                  onChange={(e) => setProfileData({ ...profileData, business_name: e.target.value })}
                  className="w-full border border-zinc-300 rounded-sm px-4 py-3 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  placeholder="Shown on public galleries"
                  data-testid="profile-business-name-input"
                />
                <p className="text-xs text-zinc-500 mt-2">
                  This will be displayed on your public galleries instead of your personal name.
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowProfileModal(false)}
                  className="flex-1 border border-zinc-300 h-10 rounded-sm font-medium hover:bg-zinc-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 h-10 rounded-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  data-testid="save-profile-btn"
                >
                  <Save className="w-4 h-4" strokeWidth={1.5} />
                  {savingProfile ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;