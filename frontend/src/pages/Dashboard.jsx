import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, LogOut, Image as ImageIcon, Lock, User, X, Save, BarChart3, HardDrive, Clock, Eye, Key, CreditCard, Crown, Zap, Star, Upload, CheckCircle, AlertCircle, Download, ExternalLink, ShoppingCart, AlertTriangle, QrCode, Menu } from 'lucide-react';
import useBrandConfig from '../hooks/useBrandConfig';
import PaymentMethodsModal from '../components/PaymentMethodsModal';
import NotificationBell from '../components/NotificationBell';
import PaymentDisputeModal from '../components/PaymentDisputeModal';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Helper to get the correct image URL (handles both CDN and local URLs)
const getImageUrl = (url) => {
  if (!url) return '';
  // If URL already starts with http(s), it's a CDN URL - use as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  // Otherwise, it's a local URL - prepend backend URL
  return `${BACKEND_URL}${url}`;
};

// Plan labels and colors
const PLAN_CONFIG = {
  free: { label: 'Free', color: 'zinc', icon: Star },
  standard: { label: 'Standard', color: 'blue', icon: Zap },
  pro: { label: 'Pro', color: 'purple', icon: Crown }
};

const MODE_LABELS = {
  founders_circle: 'Founders Circle',
  early_partner_beta: 'Early Partner Beta',
  comped_pro: 'Comped Pro',
  comped_standard: 'Comped Standard',
  enterprise_access: 'Enterprise Access'
};

// Helper to format bytes
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const Dashboard = ({ user, setUser }) => {
  const navigate = useNavigate();
  const brandConfig = useBrandConfig();
  const [galleries, setGalleries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    business_name: user?.business_name || ''
  });
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  
  // Subscription state
  const [subscription, setSubscription] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showBuyCreditsModal, setShowBuyCreditsModal] = useState(false);
  const [pricing, setPricing] = useState({ extra_credit: 500 });
  const [paymentProof, setPaymentProof] = useState(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const paymentFileRef = useRef(null);
  
  // Payment status and dispute state
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  
  // Mobile menu state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    fetchGalleries();
    fetchAnalytics();
    fetchSubscription();
    fetchPricing();
    fetchPaymentStatus();
  }, []);

  useEffect(() => {
    if (user) {
      setProfileData({
        name: user.name || '',
        business_name: user.business_name || ''
      });
    }
  }, [user]);

  const fetchPricing = async () => {
    try {
      const response = await axios.get(`${API}/billing/pricing`);
      setPricing(response.data);
    } catch (error) {
      console.error('Failed to fetch pricing');
    }
  };

  const fetchSubscription = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/user/subscription`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSubscription(response.data);
    } catch (error) {
      console.error('Failed to fetch subscription');
    }
  };

  const fetchPaymentStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/user/payment-status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPaymentStatus(response.data);
    } catch (error) {
      console.error('Failed to fetch payment status');
    }
  };

  const handleBuyCredits = async (proofUrl) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/user/extra-credits-request`, {
        quantity: 1,
        proof_url: proofUrl
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Extra credit request submitted! Admin will approve shortly.');
      setShowBuyCreditsModal(false);
      fetchSubscription();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit request');
    }
  };

  const handlePaymentProofUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    
    // Check file size (max 10MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      toast.error('File too large. Maximum size is 10MB');
      return;
    }
    
    setUploadingProof(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const token = localStorage.getItem('token');
      const uploadResponse = await axios.post(`${API}/upload-payment-proof`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        },
        timeout: 60000 // 60 second timeout
      });
      
      if (!uploadResponse.data.url) {
        throw new Error('No URL returned from upload');
      }
      
      // Submit payment proof
      await axios.post(`${API}/user/payment-proof`, {
        proof_url: uploadResponse.data.url
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success('Payment proof submitted! Awaiting admin approval.');
      setShowPaymentModal(false);
      fetchSubscription();
    } catch (error) {
      console.error('Upload error:', error);
      if (error.response?.data?.detail) {
        toast.error(error.response.data.detail);
      } else if (error.code === 'ECONNABORTED') {
        toast.error('Upload timed out. Please try with a smaller image.');
      } else {
        toast.error('Failed to upload payment proof. Please try again.');
      }
    } finally {
      setUploadingProof(false);
    }
  };

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

  const fetchAnalytics = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/analytics/photographer`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAnalytics(response.data);
    } catch (error) {
      console.error('Failed to load analytics');
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

  const handleChangePassword = async () => {
    // Validate passwords match
    if (passwordData.new_password !== passwordData.confirm_password) {
      toast.error('New passwords do not match');
      return;
    }
    
    // Validate password length
    if (passwordData.new_password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    
    setChangingPassword(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/auth/change-password`, {
        current_password: passwordData.current_password,
        new_password: passwordData.new_password
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success('Password changed successfully');
      setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50/30">
      <nav className="border-b border-zinc-200 bg-white sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 md:px-12 py-4 sm:py-6 flex justify-between items-center">
          <h1
            className="text-xl sm:text-2xl font-medium cursor-pointer"
            style={{ fontFamily: 'Playfair Display, serif' }}
            onClick={() => navigate('/')}
          >
            {brandConfig.brand_name || 'PhotoShare'}
          </h1>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-4">
            <span className="text-sm text-zinc-600">
              Welcome, {user?.business_name || user?.name}
            </span>
            <NotificationBell />
            <button
              data-testid="analytics-button"
              onClick={() => setShowAnalyticsModal(true)}
              className="hover:bg-zinc-100 text-foreground h-10 px-4 rounded-sm font-medium transition-all duration-300 flex items-center gap-2"
              title="View Analytics"
            >
              <BarChart3 className="w-4 h-4" strokeWidth={1.5} />
              Analytics
            </button>
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

          {/* Mobile Navigation Icons */}
          <div className="flex md:hidden items-center gap-2">
            <NotificationBell />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 hover:bg-zinc-100 rounded-sm transition-colors"
              data-testid="mobile-menu-button"
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-zinc-200 bg-white px-4 py-3 space-y-1">
            <div className="py-2 px-3 text-sm text-zinc-600 border-b border-zinc-100 mb-2">
              Welcome, {user?.business_name || user?.name}
            </div>
            <button
              onClick={() => {
                setShowAnalyticsModal(true);
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 py-3 px-3 text-zinc-700 hover:bg-zinc-50 rounded-sm transition-colors"
            >
              <BarChart3 className="w-5 h-5" strokeWidth={1.5} />
              Analytics
            </button>
            <button
              onClick={() => {
                setShowProfileModal(true);
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 py-3 px-3 text-zinc-700 hover:bg-zinc-50 rounded-sm transition-colors"
            >
              <User className="w-5 h-5" strokeWidth={1.5} />
              Profile
            </button>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 py-3 px-3 text-red-600 hover:bg-red-50 rounded-sm transition-colors"
            >
              <LogOut className="w-5 h-5" strokeWidth={1.5} />
              Logout
            </button>
          </div>
        )}
      </nav>

      {/* Storage Quota Bar */}
      {analytics && (
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 md:px-12 pt-4 sm:pt-6">
          <div className="bg-white border border-zinc-200 rounded-sm p-3 sm:p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs sm:text-sm text-zinc-600">
                <HardDrive className="w-4 h-4" strokeWidth={1.5} />
                <span className="hidden sm:inline">Storage Used</span>
                <span className="sm:hidden">Storage</span>
              </div>
              <span className="text-xs sm:text-sm font-medium">
                {formatBytes(analytics.storage_used)} / {formatBytes(analytics.storage_quota)}
              </span>
            </div>
            <div className="w-full bg-zinc-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all ${
                  (analytics.storage_used / analytics.storage_quota) > 0.9 
                    ? 'bg-red-500' 
                    : (analytics.storage_used / analytics.storage_quota) > 0.7 
                      ? 'bg-amber-500' 
                      : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(100, (analytics.storage_used / analytics.storage_quota) * 100)}%` }}
              />
            </div>
            {(analytics.storage_used / analytics.storage_quota) > 0.9 && (
              <p className="text-xs text-red-600 mt-2">
                Storage almost full! Contact admin to increase your quota.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Subscription Card */}
      {subscription && (
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 md:px-12 pt-3 sm:pt-4">
          <div className="bg-white border border-zinc-200 rounded-sm p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              {/* Plan Info */}
              <div className="flex items-center gap-3 sm:gap-4">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center ${
                  subscription.effective_plan === 'pro' ? 'bg-purple-100' :
                  subscription.effective_plan === 'standard' ? 'bg-blue-100' : 'bg-zinc-100'
                }`}>
                  {subscription.effective_plan === 'pro' ? (
                    <Crown className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
                  ) : subscription.effective_plan === 'standard' ? (
                    <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                  ) : (
                    <Star className="w-5 h-5 sm:w-6 sm:h-6 text-zinc-600" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-base sm:text-lg">
                      {PLAN_CONFIG[subscription.effective_plan]?.label || 'Free'} Plan
                    </span>
                    {subscription.override_mode && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                        {MODE_LABELS[subscription.override_mode]}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-zinc-500 flex flex-col gap-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      {subscription.total_credits === 999 ? (
                        <span className="text-green-600 font-medium">Unlimited Credits</span>
                      ) : (
                        <>
                          <span>{subscription.event_credits} event credits + {subscription.extra_credits || 0} extra</span>
                          {subscription.effective_plan !== 'free' && subscription.payment_status !== 'pending' && (
                            <button
                              onClick={() => setShowBuyCreditsModal(true)}
                              className="text-xs text-purple-600 hover:text-purple-700 hover:underline flex items-center gap-1"
                            >
                              <ShoppingCart className="w-3 h-3" />
                              Buy more (₱{pricing?.extra_credit || 500})
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    {/* Subscription & Credit Expiration Info */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      {subscription.subscription_expires && !subscription.is_unlimited_credits && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Renews: {new Date(subscription.subscription_expires).toLocaleDateString()}
                        </span>
                      )}
                      {subscription.extra_credits > 0 && subscription.extra_credits_expires_at && (
                        <span className="flex items-center gap-1 text-amber-600">
                          <AlertCircle className="w-3 h-3" />
                          Extra credits expire: {new Date(subscription.extra_credits_expires_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment Status */}
              <div className="flex items-center gap-4">
                {subscription.payment_status === 'pending' && (
                  <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">Payment Pending</span>
                  </div>
                )}
                {subscription.payment_status === 'approved' && (
                  <div className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-2 rounded-lg">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">Active</span>
                  </div>
                )}
                {subscription.payment_status === 'none' && subscription.effective_plan !== 'free' && !subscription.override_mode && (
                  <button
                    onClick={() => setShowPaymentModal(true)}
                    className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-500 flex items-center gap-2 text-sm font-medium"
                  >
                    <Upload className="w-4 h-4" />
                    Submit Payment
                  </button>
                )}
                <a
                  href="/pricing"
                  className="text-sm text-purple-600 hover:underline flex items-center gap-1"
                >
                  View Plans
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* Download Warning */}
            {subscription.payment_status === 'pending' && (
              <div className="mt-3 pt-3 border-t border-zinc-100">
                <p className="text-sm text-amber-700 flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  Downloads are temporarily locked while payment is being verified.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payment Rejected Banner */}
      {paymentStatus?.payment_rejected_at && (
        <div className="max-w-screen-2xl mx-auto px-6 md:px-12 pt-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-red-900">Payment Rejected</h4>
                <p className="text-sm text-red-700 mt-1">
                  <strong>Reason:</strong> {paymentStatus.payment_rejected_reason || 'No reason provided'}
                </p>
                {paymentStatus.can_dispute ? (
                  <div className="mt-3">
                    <button
                      onClick={() => setShowDisputeModal(true)}
                      className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm font-medium"
                      data-testid="dispute-payment-btn"
                    >
                      Dispute & Resubmit (1 attempt remaining)
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-red-800">
                    You have used your dispute attempt. Please contact customer service at{' '}
                    <a href="mailto:lessrealmoments@gmail.com" className="underline">lessrealmoments@gmail.com</a> or{' '}
                    <a href="tel:09952568450" className="underline">09952568450</a>.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
                      src={getImageUrl(gallery.cover_photo_url)}
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
                  <div className="flex justify-between items-center text-sm text-zinc-500 mb-2">
                    <span>{gallery.photo_count} photos</span>
                    <span className="text-xs uppercase tracking-wider">
                      {new Date(gallery.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {/* Days until deletion indicator */}
                  {gallery.days_until_deletion !== null && gallery.days_until_deletion !== undefined && (
                    <div className={`flex items-center gap-1 text-xs ${
                      gallery.days_until_deletion > 36000
                        ? 'text-green-600'
                        : gallery.days_until_deletion <= 30 
                          ? 'text-red-600' 
                          : gallery.days_until_deletion <= 60 
                            ? 'text-amber-600' 
                            : 'text-zinc-400'
                    }`}>
                      <Clock className="w-3 h-3" strokeWidth={1.5} />
                      {gallery.days_until_deletion > 36000
                        ? 'Never expires'
                        : gallery.days_until_deletion <= 0 
                          ? 'Expires today' 
                          : `${gallery.days_until_deletion} days remaining`}
                    </div>
                  )}
                  {/* Edit lock indicator */}
                  {gallery.is_edit_locked && (
                    <div className="flex items-center gap-1 text-xs text-amber-600">
                      <Lock className="w-3 h-3" strokeWidth={1.5} />
                      Editing locked
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payment Proof Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full" data-testid="payment-modal">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-medium">Submit Payment Proof</h3>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="p-2 hover:bg-zinc-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">Payment Instructions</h4>
                <ol className="text-sm text-blue-800 space-y-2">
                  <li>1. Send payment via GCash or PayMaya</li>
                  <li>2. Take a screenshot of the confirmation</li>
                  <li>3. Upload the screenshot below</li>
                </ol>
                <div className="mt-3 pt-3 border-t border-blue-200">
                  <p className="text-sm font-medium text-blue-900">GCash/PayMaya Number:</p>
                  <p className="text-lg font-bold text-blue-900">09952568450</p>
                  <p className="text-xs text-blue-700 mt-1">Less Real Moments</p>
                </div>
              </div>
              
              <div
                onClick={() => paymentFileRef.current?.click()}
                className="border-2 border-dashed border-zinc-300 rounded-lg p-8 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50/50 transition-colors"
              >
                <input
                  ref={paymentFileRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePaymentProofUpload}
                  className="hidden"
                />
                {uploadingProof ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-zinc-600">Uploading...</span>
                  </div>
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-zinc-400 mx-auto mb-3" />
                    <p className="text-sm font-medium text-zinc-700">Click to upload payment screenshot</p>
                    <p className="text-xs text-zinc-500 mt-1">PNG, JPG up to 5MB</p>
                  </>
                )}
              </div>
              
              <p className="text-xs text-zinc-500 text-center">
                Your payment will be verified within 24 hours. Downloads will be unlocked once approved.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm p-8 max-w-md w-full max-h-[90vh] overflow-y-auto" data-testid="profile-modal">
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

              {/* Change Password Section */}
              <div className="border-t border-zinc-200 pt-6 mt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Key className="w-5 h-5 text-zinc-600" strokeWidth={1.5} />
                  <h4 className="text-lg font-medium">Change Password</h4>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Current Password</label>
                    <input
                      type="password"
                      value={passwordData.current_password}
                      onChange={(e) => setPasswordData({ ...passwordData, current_password: e.target.value })}
                      className="w-full border border-zinc-300 rounded-sm px-4 py-3 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                      placeholder="Enter current password"
                      data-testid="current-password-input"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">New Password</label>
                    <input
                      type="password"
                      value={passwordData.new_password}
                      onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
                      className="w-full border border-zinc-300 rounded-sm px-4 py-3 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                      placeholder="Enter new password"
                      data-testid="new-password-input"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Confirm New Password</label>
                    <input
                      type="password"
                      value={passwordData.confirm_password}
                      onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })}
                      className="w-full border border-zinc-300 rounded-sm px-4 py-3 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                      placeholder="Confirm new password"
                      data-testid="confirm-password-input"
                    />
                  </div>

                  <button
                    onClick={handleChangePassword}
                    disabled={changingPassword || !passwordData.current_password || !passwordData.new_password || !passwordData.confirm_password}
                    className="w-full bg-zinc-800 text-white hover:bg-zinc-700 h-10 rounded-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid="change-password-btn"
                  >
                    <Key className="w-4 h-4" strokeWidth={1.5} />
                    {changingPassword ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Analytics Modal */}
      {showAnalyticsModal && analytics && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm p-8 max-w-3xl w-full max-h-[90vh] overflow-y-auto" data-testid="analytics-modal">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-medium" style={{ fontFamily: 'Playfair Display, serif' }}>
                Your Analytics
              </h3>
              <button
                onClick={() => setShowAnalyticsModal(false)}
                className="p-2 hover:bg-zinc-100 rounded-sm transition-colors"
              >
                <X className="w-5 h-5" strokeWidth={1.5} />
              </button>
            </div>

            {/* Summary Stats - Row 1 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-zinc-50 rounded-sm p-4 text-center">
                <div className="text-3xl font-bold text-zinc-900">{analytics.total_galleries}</div>
                <div className="text-sm text-zinc-500">Galleries</div>
              </div>
              <div className="bg-zinc-50 rounded-sm p-4 text-center">
                <div className="text-3xl font-bold text-zinc-900">{analytics.total_photos}</div>
                <div className="text-sm text-zinc-500">Photos</div>
              </div>
              <div className="bg-zinc-50 rounded-sm p-4 text-center">
                <div className="text-3xl font-bold text-zinc-900">{analytics.total_views}</div>
                <div className="text-sm text-zinc-500">Total Views</div>
              </div>
              <div className="bg-zinc-50 rounded-sm p-4 text-center">
                <div className="text-3xl font-bold text-zinc-900">{formatBytes(analytics.storage_used)}</div>
                <div className="text-sm text-zinc-500">Storage Used</div>
              </div>
            </div>

            {/* Summary Stats - Row 2 (New metrics) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-purple-50 rounded-sm p-4 text-center border border-purple-100">
                <div className="text-3xl font-bold text-purple-700">{analytics.total_qr_scans || 0}</div>
                <div className="text-sm text-purple-600">QR Scans</div>
              </div>
              <div className="bg-blue-50 rounded-sm p-4 text-center border border-blue-100">
                <div className="text-3xl font-bold text-blue-700">{analytics.total_downloads || 0}</div>
                <div className="text-sm text-blue-600">Downloads</div>
              </div>
              <div className="bg-green-50 rounded-sm p-4 text-center border border-green-100">
                <div className="text-3xl font-bold text-green-700">{analytics.views_today || 0}</div>
                <div className="text-sm text-green-600">Views Today</div>
              </div>
              <div className="bg-amber-50 rounded-sm p-4 text-center border border-amber-100">
                <div className="text-3xl font-bold text-amber-700">{analytics.views_this_week || 0}</div>
                <div className="text-sm text-amber-600">Views This Week</div>
              </div>
            </div>

            {/* Storage Progress */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Storage Quota</span>
                <span className="text-sm text-zinc-500">
                  {formatBytes(analytics.storage_used)} / {formatBytes(analytics.storage_quota)}
                </span>
              </div>
              <div className="w-full bg-zinc-200 rounded-full h-3">
                <div 
                  className={`h-3 rounded-full transition-all ${
                    (analytics.storage_used / analytics.storage_quota) > 0.9 
                      ? 'bg-red-500' 
                      : (analytics.storage_used / analytics.storage_quota) > 0.7 
                        ? 'bg-amber-500' 
                        : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(100, (analytics.storage_used / analytics.storage_quota) * 100)}%` }}
                />
              </div>
            </div>

            {/* Gallery Breakdown */}
            <h4 className="text-lg font-medium mb-4">Gallery Performance</h4>
            <div className="space-y-3">
              {analytics.galleries.map((g) => (
                <div key={g.gallery_id} className="border border-zinc-200 rounded-sm p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h5 className="font-medium">{g.gallery_title}</h5>
                      <p className="text-xs text-zinc-500">Created {new Date(g.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="flex items-center gap-1 text-zinc-600">
                        <Eye className="w-4 h-4" strokeWidth={1.5} />
                        {g.view_count}
                      </span>
                      <span className="flex items-center gap-1 text-purple-600">
                        <QrCode className="w-4 h-4" strokeWidth={1.5} />
                        {g.qr_scans || 0}
                      </span>
                      <span className="flex items-center gap-1 text-blue-600">
                        <Download className="w-4 h-4" strokeWidth={1.5} />
                        {g.download_count || 0}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-4 text-sm text-zinc-600">
                    <span>{g.photographer_photos} photos (you)</span>
                    <span>{g.guest_photos} photos (guests)</span>
                  </div>
                  {g.days_until_deletion !== null && (
                    <div className={`text-xs mt-2 flex items-center gap-1 ${
                      g.days_until_deletion > 36000 
                        ? 'text-green-600' 
                        : g.days_until_deletion <= 30 
                          ? 'text-red-600' 
                          : 'text-zinc-400'
                    }`}>
                      <Clock className="w-3 h-3" />
                      {g.days_until_deletion > 36000 
                        ? 'Never expires' 
                        : `${g.days_until_deletion} days until auto-delete`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Buy Credits Modal */}
      <PaymentMethodsModal
        isOpen={showBuyCreditsModal}
        onClose={() => setShowBuyCreditsModal(false)}
        onPaymentProofUploaded={handleBuyCredits}
        title="Buy Extra Credits"
        subtitle="Purchase additional event credits to create more galleries"
        amount={pricing?.extra_credit || 500}
        itemDescription="1 extra event credit"
      />

      {/* Payment Dispute Modal */}
      <PaymentDisputeModal
        isOpen={showDisputeModal}
        onClose={() => setShowDisputeModal(false)}
        onDisputeSubmitted={() => {
          fetchPaymentStatus();
          fetchSubscription();
        }}
        rejectionReason={paymentStatus?.payment_rejected_reason}
        originalProofUrl={paymentStatus?.payment_proof_url}
      />
    </div>
  );
};

export default Dashboard;