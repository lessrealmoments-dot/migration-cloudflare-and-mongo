import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Shield, Users, Settings, LogOut, Plus, Minus, Save, Image, Edit2, X, Upload, Loader2, BarChart3, HardDrive, Eye, FolderOpen, Search, UserX, UserCheck, Trash2, ExternalLink, Clock, Activity, ToggleLeft, ToggleRight, QrCode, Monitor, Link2, Trash, CreditCard, Crown, Star, Zap, DollarSign, CheckCircle, XCircle, AlertCircle, Sliders, LayoutGrid, RefreshCw, UserCog, ChevronDown, ChevronUp, Filter, Mail, Calendar, Wallet, Building2, Key } from 'lucide-react';
import FeatureTogglePage from './FeatureTogglePage';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Helper to get the correct URL for uploaded files
const getFileUrl = (path) => {
  if (!path) return null;
  // If it's already an absolute URL (http:// or https://), return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  if (path.startsWith('/api/files/')) {
    return `${BACKEND_URL}${path}`;
  }
  if (path.startsWith('/uploads/')) {
    const newPath = path.replace('/uploads/', '/api/files/');
    return `${BACKEND_URL}${newPath}`;
  }
  return `${BACKEND_URL}${path}`;
};

// Admin contact info for feature unavailable messages
const ADMIN_CONTACT = {
  phone: '09952568450',
  email: 'lessrealmoments@gmail.com'
};

// Plan and mode labels
const PLAN_LABELS = {
  free: 'Free',
  standard: 'Standard',
  pro: 'Pro'
};

const MODE_LABELS = {
  founders_circle: 'Founders Circle',
  early_partner_beta: 'Early Partner Beta',
  comped_pro: 'Comped Pro',
  comped_standard: 'Comped Standard',
  enterprise_access: 'Enterprise Access'
};

const PAYMENT_STATUS_LABELS = {
  none: 'None',
  pending: 'Pending',
  approved: 'Approved'
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
  
  // Billing & Subscription state
  const [billingSettings, setBillingSettings] = useState({
    billing_enforcement_enabled: false,
    pricing: { standard_monthly: 1000, pro_monthly: 1500, extra_credit: 500 },
    payment_methods: {
      gcash: { enabled: true, name: 'GCash', account_name: 'Less Real Moments', account_number: '09952568450', qr_code_url: null },
      maya: { enabled: true, name: 'Maya', account_name: 'Less Real Moments', account_number: '09952568450', qr_code_url: null },
      bank: { enabled: false, name: 'Bank Transfer', account_name: '', account_number: '', bank_name: '', qr_code_url: null }
    },
    paid_gallery_expiration_months: 6,
    paid_storage_limit_gb: -1  // -1 = unlimited
  });
  const [pendingPayments, setPendingPayments] = useState([]);
  const [savingBilling, setSavingBilling] = useState(false);
  const [uploadingQR, setUploadingQR] = useState(null); // Track which method is uploading QR
  // Override mode modal
  const [showOverrideModal, setShowOverrideModal] = useState(null); // User ID
  const [overrideMode, setOverrideMode] = useState('founders_circle');
  const [overrideDuration, setOverrideDuration] = useState(12);
  const [overrideReason, setOverrideReason] = useState('');
  const [assigningOverride, setAssigningOverride] = useState(false);
  
  // Transaction history
  const [transactions, setTransactions] = useState([]);
  const [selectedUserTransactions, setSelectedUserTransactions] = useState(null);
  const [userTransactions, setUserTransactions] = useState([]);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  
  // Client Management State
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientStats, setClientStats] = useState(null);
  const [clientSearch, setClientSearch] = useState('');
  const [clientFilters, setClientFilters] = useState({
    plan: '',
    status: '',
    has_pending: false,
    override_mode: ''
  });
  const [clientSort, setClientSort] = useState({ by: 'created_at', order: 'desc' });
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientDetails, setClientDetails] = useState(null);
  const [showClientModal, setShowClientModal] = useState(false);
  const [clientAction, setClientAction] = useState(null); // { type: 'add_credits' | 'extend' | 'change_plan' | 'reset_password', data: {} }

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
    fetchBillingSettings();
    fetchPendingPayments();
    fetchTransactions();
    
    // Auto-refresh pending payments every 30 seconds
    const pendingPaymentsInterval = setInterval(() => {
      fetchPendingPayments();
    }, 30000);
    
    return () => clearInterval(pendingPaymentsInterval);
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

  const fetchFeatureToggles = async () => {
    try {
      const response = await axios.get(`${API}/admin/feature-toggles`, getAuthHeader());
      setFeatureToggles({
        qr_share: response.data.qr_share ?? true,
        online_gallery: response.data.online_gallery ?? true,
        display_mode: response.data.display_mode ?? true,
        contributor_link: response.data.contributor_link ?? true,
        auto_delete_enabled: response.data.auto_delete_enabled ?? true
      });
    } catch (error) {
      console.error('Failed to load feature toggles');
    }
  };

  const handleSaveFeatureToggles = async () => {
    setSavingToggles(true);
    try {
      await axios.put(`${API}/admin/feature-toggles`, featureToggles, getAuthHeader());
      toast.success('Feature toggles saved');
    } catch (error) {
      toast.error('Failed to save feature toggles');
    } finally {
      setSavingToggles(false);
    }
  };

  // Billing & Subscription functions
  const fetchBillingSettings = async () => {
    try {
      const response = await axios.get(`${API}/billing/settings`, getAuthHeader());
      // Merge with defaults to ensure payment_methods exists
      setBillingSettings(prev => ({
        ...prev,
        ...response.data,
        payment_methods: response.data.payment_methods || prev.payment_methods
      }));
    } catch (error) {
      console.error('Failed to load billing settings');
    }
  };

  const fetchPendingPayments = async () => {
    try {
      const response = await axios.get(`${API}/admin/pending-payments`, getAuthHeader());
      setPendingPayments(response.data);
    } catch (error) {
      console.error('Failed to load pending payments');
    }
  };

  // Client Management Functions
  const fetchClients = async () => {
    setClientsLoading(true);
    try {
      const params = new URLSearchParams();
      if (clientSearch) params.append('search', clientSearch);
      if (clientFilters.plan) params.append('plan', clientFilters.plan);
      if (clientFilters.status) params.append('status', clientFilters.status);
      if (clientFilters.has_pending) params.append('has_pending', 'true');
      if (clientFilters.override_mode) params.append('override_mode', clientFilters.override_mode);
      params.append('sort_by', clientSort.by);
      params.append('sort_order', clientSort.order);
      
      const response = await axios.get(`${API}/admin/clients?${params.toString()}`, getAuthHeader());
      setClients(response.data);
    } catch (error) {
      toast.error('Failed to load clients');
    } finally {
      setClientsLoading(false);
    }
  };

  const fetchClientStats = async () => {
    try {
      const response = await axios.get(`${API}/admin/clients/stats`, getAuthHeader());
      setClientStats(response.data);
    } catch (error) {
      console.error('Failed to load client stats');
    }
  };

  const fetchClientDetails = async (userId) => {
    try {
      const response = await axios.get(`${API}/admin/clients/${userId}`, getAuthHeader());
      setClientDetails(response.data);
      setShowClientModal(true);
    } catch (error) {
      toast.error('Failed to load client details');
    }
  };

  const handleAddCredits = async (userId, credits, type, reason) => {
    try {
      await axios.post(`${API}/admin/clients/${userId}/add-credits`, 
        { credits, type, reason }, getAuthHeader());
      toast.success(`Added ${credits} ${type} credit(s)`);
      fetchClients();
      if (clientDetails) fetchClientDetails(userId);
    } catch (error) {
      toast.error('Failed to add credits');
    }
  };

  const handleExtendSubscription = async (userId, months, reason) => {
    try {
      const response = await axios.post(`${API}/admin/clients/${userId}/extend-subscription`, 
        { months, reason }, getAuthHeader());
      toast.success(response.data.message);
      fetchClients();
      if (clientDetails) fetchClientDetails(userId);
    } catch (error) {
      toast.error('Failed to extend subscription');
    }
  };

  const handleChangePlan = async (userId, plan, reason) => {
    try {
      const response = await axios.post(`${API}/admin/clients/${userId}/change-plan`, 
        { plan, reason }, getAuthHeader());
      toast.success(response.data.message);
      fetchClients();
      if (clientDetails) fetchClientDetails(userId);
    } catch (error) {
      toast.error('Failed to change plan');
    }
  };

  const handleResetPassword = async (userId, newPassword) => {
    try {
      await axios.post(`${API}/admin/clients/${userId}/reset-password`, 
        { new_password: newPassword }, getAuthHeader());
      toast.success('Password reset successfully');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to reset password');
    }
  };

  // Effect to fetch clients when tab changes or filters change
  useEffect(() => {
    if (activeTab === 'clients') {
      fetchClients();
      fetchClientStats();
    }
  }, [activeTab, clientFilters, clientSort]);

  const handleSaveBillingSettings = async () => {
    setSavingBilling(true);
    try {
      await axios.put(`${API}/billing/settings`, billingSettings, getAuthHeader());
      toast.success('Billing settings saved');
      // Refresh settings after save
      fetchBillingSettings();
    } catch (error) {
      toast.error('Failed to save billing settings');
    } finally {
      setSavingBilling(false);
    }
  };

  const handleUploadPaymentQR = async (method, file) => {
    if (!file) return;
    
    setUploadingQR(method);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('method', method);
      
      const response = await axios.post(`${API}/admin/upload-payment-qr`, formData, {
        headers: {
          ...getAuthHeader().headers,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      setBillingSettings(prev => ({
        ...prev,
        payment_methods: {
          ...prev.payment_methods,
          [method]: {
            ...prev.payment_methods[method],
            qr_code_url: response.data.url
          }
        }
      }));
      toast.success('QR code uploaded');
    } catch (error) {
      toast.error('Failed to upload QR code');
    } finally {
      setUploadingQR(null);
    }
  };

  const handleApprovePayment = async (userId) => {
    try {
      await axios.post(`${API}/admin/approve-payment`, { user_id: userId }, getAuthHeader());
      toast.success('Payment approved');
      fetchPendingPayments();
      fetchPhotographers();
    } catch (error) {
      toast.error('Failed to approve payment');
    }
  };

  const handleRejectPayment = async (userId, reason) => {
    try {
      await axios.post(`${API}/admin/reject-payment`, { user_id: userId, reason }, getAuthHeader());
      toast.success('Payment rejected');
      fetchPendingPayments();
      fetchPhotographers();
    } catch (error) {
      toast.error('Failed to reject payment');
    }
  };

  const handleAssignOverride = async () => {
    if (!overrideReason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    setAssigningOverride(true);
    try {
      await axios.post(`${API}/admin/assign-override`, {
        user_id: showOverrideModal,
        mode: overrideMode,
        duration_months: overrideDuration,
        reason: overrideReason
      }, getAuthHeader());
      toast.success(`Override mode assigned`);
      setShowOverrideModal(null);
      setOverrideReason('');
      fetchPhotographers();
    } catch (error) {
      toast.error('Failed to assign override');
    } finally {
      setAssigningOverride(false);
    }
  };

  const handleRemoveOverride = async (userId) => {
    try {
      await axios.post(`${API}/admin/remove-override`, {
        user_id: userId,
        reason: 'Admin removed override'
      }, getAuthHeader());
      toast.success('Override removed');
      fetchPhotographers();
    } catch (error) {
      toast.error('Failed to remove override');
    }
  };

  const fetchTransactions = async () => {
    try {
      const response = await axios.get(`${API}/admin/transactions?limit=100`, getAuthHeader());
      setTransactions(response.data);
    } catch (error) {
      console.error('Failed to load transactions');
    }
  };

  const fetchUserTransactions = async (userId, userName) => {
    try {
      const response = await axios.get(`${API}/admin/users/${userId}/transactions`, getAuthHeader());
      setUserTransactions(response.data);
      setSelectedUserTransactions({ id: userId, name: userName });
      setShowTransactionModal(true);
    } catch (error) {
      toast.error('Failed to load user transactions');
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
      
      const imageUrl = response.data.url;
      
      // Verify the uploaded image can be loaded with retry logic
      const fullImageUrl = imageUrl.startsWith('/api') ? `${BACKEND_URL}${imageUrl}` : imageUrl;
      
      // Retry image verification up to 3 times with delay (CDN propagation)
      let loaded = false;
      for (let attempt = 0; attempt < 3 && !loaded; attempt++) {
        if (attempt > 0) {
          await new Promise(r => setTimeout(r, 1500)); // Wait 1.5s between retries
        }
        try {
          await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = resolve;
            img.onerror = reject;
            img.src = `${fullImageUrl}?t=${Date.now()}`; // Cache bust
          });
          loaded = true;
        } catch (e) {
          console.log(`Image verification attempt ${attempt + 1} failed, retrying...`);
        }
      }
      
      // Update local state with new image URL regardless of verification
      // (The image was successfully uploaded, it just may take time to propagate)
      setLandingConfig(prev => ({
        ...prev,
        [slot]: imageUrl
      }));
      
      if (loaded) {
        toast.success('Image uploaded successfully');
      } else {
        toast.success('Image uploaded! It may take a few seconds to appear.');
      }
    } catch (error) {
      console.error('Image upload error:', error);
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

      {/* Pending Payments Alert Banner */}
      {pendingPayments.length > 0 && (
        <div className="bg-amber-600 text-white px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5" />
              <span className="font-medium">
                {pendingPayments.length} pending upgrade request{pendingPayments.length > 1 ? 's' : ''} with payment proof
              </span>
              <span className="text-amber-200">
                - {pendingPayments.map(p => p.name || p.email).join(', ')}
              </span>
            </div>
            <button
              onClick={() => setActiveTab('billing')}
              className="bg-amber-700 hover:bg-amber-800 px-4 py-1.5 rounded text-sm font-medium transition-colors"
            >
              Review Now
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex gap-4 mb-8 flex-wrap">
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
            onClick={() => setActiveTab('clients')}
            className={`flex items-center gap-2 px-4 py-2 rounded-sm transition-colors ${
              activeTab === 'clients'
                ? 'bg-white text-zinc-900'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
            data-testid="clients-tab"
          >
            <UserCog className="w-5 h-5" strokeWidth={1.5} />
            Clients
            {clientStats?.pending_payments > 0 && (
              <span className="bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">{clientStats.pending_payments}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('billing')}
            className={`flex items-center gap-2 px-4 py-2 rounded-sm transition-colors ${
              activeTab === 'billing'
                ? 'bg-white text-zinc-900'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
            data-testid="billing-tab"
          >
            <CreditCard className="w-5 h-5" strokeWidth={1.5} />
            Billing
            {pendingPayments.length > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{pendingPayments.length}</span>
            )}
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
            onClick={() => setActiveTab('features')}
            className={`flex items-center gap-2 px-4 py-2 rounded-sm transition-colors ${
              activeTab === 'features'
                ? 'bg-white text-zinc-900'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
            data-testid="features-tab"
          >
            <Sliders className="w-5 h-5" strokeWidth={1.5} />
            Feature Toggles
          </button>
          <button
            onClick={() => navigate('/admin/collage-presets')}
            className="flex items-center gap-2 px-4 py-2 rounded-sm transition-colors bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700"
          >
            <LayoutGrid className="w-5 h-5" strokeWidth={1.5} />
            Collage Presets
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
                    <th className="text-center px-6 py-3 text-sm font-medium text-zinc-400">Plan</th>
                    <th className="text-center px-6 py-3 text-sm font-medium text-zinc-400">Credits</th>
                    <th className="text-center px-6 py-3 text-sm font-medium text-zinc-400">Payment</th>
                    <th className="text-center px-6 py-3 text-sm font-medium text-zinc-400">Galleries</th>
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
                        {p.override_mode && (
                          <div className="text-xs text-amber-400 mt-0.5">
                            {MODE_LABELS[p.override_mode]}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          p.override_mode ? 'bg-amber-900/50 text-amber-300' :
                          p.plan === 'pro' ? 'bg-purple-900/50 text-purple-300' :
                          p.plan === 'standard' ? 'bg-blue-900/50 text-blue-300' :
                          'bg-zinc-700 text-zinc-400'
                        }`}>
                          {p.override_mode ? MODE_LABELS[p.override_mode]?.split(' ')[0] : 
                           PLAN_LABELS[p.plan] || 'Free'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {(p.override_mode === 'founders_circle' || p.event_credits === 999) ? (
                          <span className="text-green-400 text-sm font-medium">∞</span>
                        ) : (
                          <span className="text-white text-sm">
                            {(p.event_credits || 0) + (p.extra_credits || 0)}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          p.payment_status === 'approved' ? 'bg-green-900/50 text-green-300' :
                          p.payment_status === 'pending' ? 'bg-amber-900/50 text-amber-300' :
                          'bg-zinc-700 text-zinc-400'
                        }`}>
                          {PAYMENT_STATUS_LABELS[p.payment_status] || 'None'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-center">
                        <button
                          onClick={() => { setSelectedPhotographer(p); fetchPhotographerGalleries(p.id); }}
                          className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-200 hover:text-white transition-colors"
                          data-testid={`view-galleries-${p.id}`}
                        >
                          {p.active_galleries}/{p.galleries_created_total}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="text-sm">
                          <div className="text-zinc-300">{formatBytes(p.storage_used)}</div>
                          <div className="text-zinc-500 text-xs">/ {formatBytes(p.storage_quota)}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setShowOverrideModal(p.id)}
                            className={`p-2 rounded text-white hover:opacity-80 ${
                              p.override_mode ? 'bg-amber-600' : 'bg-zinc-600'
                            }`}
                            title={p.override_mode ? `Override: ${MODE_LABELS[p.override_mode]}` : 'Assign override mode'}
                          >
                            <Crown className="w-4 h-4" />
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
                            onClick={() => fetchUserTransactions(p.id, p.name)}
                            className="p-2 bg-blue-600 rounded text-white hover:bg-blue-500"
                            title="View Transaction History"
                            data-testid={`transactions-btn-${p.id}`}
                          >
                            <Activity className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(p.id)}
                            className="p-2 bg-red-600 rounded text-white hover:bg-red-500"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
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

        {/* Override Mode Modal */}
        {showOverrideModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-zinc-800 rounded-lg max-w-md w-full p-6" data-testid="override-modal">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-medium text-white">Assign Override Mode</h3>
                  <p className="text-sm text-zinc-400 mt-1">
                    {photographers.find(p => p.id === showOverrideModal)?.name || 'User'}
                  </p>
                </div>
                <button 
                  onClick={() => setShowOverrideModal(null)} 
                  className="p-2 hover:bg-zinc-700 rounded"
                >
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>
              
              <div className="space-y-4">
                {/* Current Override Status */}
                {photographers.find(p => p.id === showOverrideModal)?.override_mode && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                    <div className="text-amber-400 text-sm font-medium">
                      Current: {MODE_LABELS[photographers.find(p => p.id === showOverrideModal)?.override_mode]}
                    </div>
                    <button
                      onClick={() => { handleRemoveOverride(showOverrideModal); setShowOverrideModal(null); }}
                      className="text-xs text-red-400 hover:underline mt-1"
                    >
                      Remove Override
                    </button>
                  </div>
                )}
                
                {/* Mode Selection */}
                <div>
                  <label className="text-sm text-zinc-400 block mb-2">Override Mode</label>
                  <select
                    value={overrideMode}
                    onChange={(e) => setOverrideMode(e.target.value)}
                    className="w-full bg-zinc-700 text-white rounded-lg px-4 py-2"
                  >
                    <option value="founders_circle">🌟 Founders Circle (Unlimited, Free)</option>
                    <option value="early_partner_beta">🚀 Early Partner Beta (Pro, Free)</option>
                    <option value="comped_pro">💜 Comped Pro</option>
                    <option value="comped_standard">💙 Comped Standard</option>
                    <option value="enterprise_access">🏢 Enterprise Access (Trial for Major Clients)</option>
                  </select>
                </div>
                
                {/* Duration */}
                <div>
                  <label className="text-sm text-zinc-400 block mb-2">Duration (1-24 months)</label>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={overrideDuration}
                    onChange={(e) => setOverrideDuration(Math.min(24, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-full bg-zinc-700 text-white rounded-lg px-4 py-2"
                  />
                </div>
                
                {/* Reason */}
                <div>
                  <label className="text-sm text-zinc-400 block mb-2">Reason (Required)</label>
                  <textarea
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="e.g., Beta tester, VIP client, Partnership..."
                    className="w-full bg-zinc-700 text-white rounded-lg px-4 py-2 h-20 resize-none"
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-zinc-700">
                <button
                  onClick={() => setShowOverrideModal(null)}
                  className="px-4 py-2 bg-zinc-700 text-white rounded-lg hover:bg-zinc-600"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssignOverride}
                  disabled={assigningOverride || !overrideReason.trim()}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-500 disabled:opacity-50 flex items-center gap-2"
                  data-testid="assign-override"
                >
                  <Crown className="w-4 h-4" />
                  {assigningOverride ? 'Assigning...' : 'Assign Override'}
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

        {/* Billing Tab */}
        {activeTab === 'billing' && (
          <div className="space-y-6">
            {/* Billing Mode Toggle */}
            <div className="bg-zinc-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-medium text-white">Billing Mode</h3>
                  <p className="text-sm text-zinc-400 mt-1">
                    {billingSettings.billing_enforcement_enabled 
                      ? 'Live Billing - Automated payments enabled' 
                      : 'Manual Billing (Soft Launch) - Handle payments externally'}
                  </p>
                </div>
                <button
                  onClick={() => setBillingSettings(prev => ({
                    ...prev,
                    billing_enforcement_enabled: !prev.billing_enforcement_enabled
                  }))}
                  className={`p-2 rounded-lg transition-colors ${
                    billingSettings.billing_enforcement_enabled ? 'bg-green-600' : 'bg-zinc-600'
                  }`}
                >
                  {billingSettings.billing_enforcement_enabled ? (
                    <ToggleRight className="w-6 h-6 text-white" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-zinc-400" />
                  )}
                </button>
              </div>
              <div className="text-xs text-amber-400 bg-amber-400/10 px-3 py-2 rounded">
                Current Status: {billingSettings.billing_enforcement_enabled ? 'LIVE' : 'SOFT LAUNCH (Manual)'}
              </div>
            </div>

            {/* Pricing Configuration */}
            <div className="bg-zinc-800 rounded-lg p-6">
              <h3 className="text-lg font-medium text-white mb-4">Pricing Configuration</h3>
              <p className="text-sm text-zinc-400 mb-4">Changes apply to new subscriptions only. Existing subscriptions keep their current price.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm text-zinc-400 block mb-2">Standard Plan (₱/month)</label>
                  <input
                    type="number"
                    value={billingSettings.pricing?.standard_monthly || 1000}
                    onChange={(e) => setBillingSettings(prev => ({
                      ...prev,
                      pricing: { ...prev.pricing, standard_monthly: parseInt(e.target.value) || 0 }
                    }))}
                    className="w-full bg-zinc-700 text-white rounded-lg px-4 py-2"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 block mb-2">Pro Plan (₱/month)</label>
                  <input
                    type="number"
                    value={billingSettings.pricing?.pro_monthly || 1500}
                    onChange={(e) => setBillingSettings(prev => ({
                      ...prev,
                      pricing: { ...prev.pricing, pro_monthly: parseInt(e.target.value) || 0 }
                    }))}
                    className="w-full bg-zinc-700 text-white rounded-lg px-4 py-2"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 block mb-2">Extra Credit (₱/event)</label>
                  <input
                    type="number"
                    value={billingSettings.pricing?.extra_credit || 500}
                    onChange={(e) => setBillingSettings(prev => ({
                      ...prev,
                      pricing: { ...prev.pricing, extra_credit: parseInt(e.target.value) || 0 }
                    }))}
                    className="w-full bg-zinc-700 text-white rounded-lg px-4 py-2"
                  />
                </div>
              </div>
              
              <button
                onClick={handleSaveBillingSettings}
                disabled={savingBilling}
                className="mt-4 bg-white text-zinc-900 hover:bg-zinc-100 px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {savingBilling ? 'Saving...' : 'Save Billing Settings'}
              </button>
            </div>

            {/* Payment Methods Configuration */}
            <div className="bg-zinc-800 rounded-lg p-6">
              <h3 className="text-lg font-medium text-white mb-4">Payment Methods</h3>
              <p className="text-sm text-zinc-400 mb-6">Configure payment options for users (GCash, Maya, Bank Transfer)</p>
              
              <div className="space-y-6">
                {Object.entries(billingSettings.payment_methods || {}).map(([key, method]) => (
                  <div key={key} className={`border rounded-lg p-4 ${method.enabled ? 'border-green-500/50 bg-green-500/5' : 'border-zinc-700 bg-zinc-800/50'}`}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-white">{method.name || key}</span>
                        {method.enabled && <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">Enabled</span>}
                      </div>
                      <button
                        onClick={() => setBillingSettings(prev => ({
                          ...prev,
                          payment_methods: {
                            ...prev.payment_methods,
                            [key]: { ...method, enabled: !method.enabled }
                          }
                        }))}
                        className={`w-12 h-6 rounded-full relative transition-colors ${method.enabled ? 'bg-green-600' : 'bg-zinc-600'}`}
                      >
                        <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${method.enabled ? 'right-0.5' : 'left-0.5'}`} />
                      </button>
                    </div>
                    
                    {method.enabled && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-zinc-400 mb-1">Account Name</label>
                          <input
                            type="text"
                            value={method.account_name || ''}
                            onChange={(e) => setBillingSettings(prev => ({
                              ...prev,
                              payment_methods: {
                                ...prev.payment_methods,
                                [key]: { ...method, account_name: e.target.value }
                              }
                            }))}
                            className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-white text-sm"
                            placeholder="Account holder name"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-400 mb-1">Account Number</label>
                          <input
                            type="text"
                            value={method.account_number || ''}
                            onChange={(e) => setBillingSettings(prev => ({
                              ...prev,
                              payment_methods: {
                                ...prev.payment_methods,
                                [key]: { ...method, account_number: e.target.value }
                              }
                            }))}
                            className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-white text-sm"
                            placeholder="Account/Phone number"
                          />
                        </div>
                        {key === 'bank' && (
                          <div>
                            <label className="block text-xs text-zinc-400 mb-1">Bank Name</label>
                            <input
                              type="text"
                              value={method.bank_name || ''}
                              onChange={(e) => setBillingSettings(prev => ({
                                ...prev,
                                payment_methods: {
                                  ...prev.payment_methods,
                                  [key]: { ...method, bank_name: e.target.value }
                                }
                              }))}
                              className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-white text-sm"
                              placeholder="e.g., BDO, BPI"
                            />
                          </div>
                        )}
                        <div className={key === 'bank' ? '' : 'col-span-2'}>
                          <label className="block text-xs text-zinc-400 mb-1">QR Code Image</label>
                          <div className="flex items-center gap-3">
                            {method.qr_code_url ? (
                              <img 
                                src={getFileUrl(method.qr_code_url)}
                                alt={`${method.name} QR`}
                                className="w-16 h-16 object-contain bg-white rounded"
                              />
                            ) : (
                              <div className="w-16 h-16 bg-zinc-700 rounded flex items-center justify-center text-zinc-500 text-xs">
                                No QR
                              </div>
                            )}
                            <label className="cursor-pointer bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-2 rounded text-sm transition-colors">
                              {uploadingQR === key ? 'Uploading...' : 'Upload QR'}
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleUploadPaymentQR(key, e.target.files[0])}
                                className="hidden"
                                disabled={uploadingQR === key}
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              
              <button
                onClick={handleSaveBillingSettings}
                disabled={savingBilling}
                className="mt-6 bg-white text-zinc-900 hover:bg-zinc-100 px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {savingBilling ? 'Saving...' : 'Save Payment Methods'}
              </button>
            </div>

            {/* Pending Payments */}
            <div className="bg-zinc-800 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-700 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-white">Pending Payments</h3>
                  <p className="text-sm text-zinc-400 mt-1">Review and approve payment proofs • Auto-refreshes every 30s</p>
                </div>
                <button
                  onClick={fetchPendingPayments}
                  className="flex items-center gap-2 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm rounded-lg transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              </div>
              
              {pendingPayments.length === 0 ? (
                <div className="p-8 text-center text-zinc-500">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500/50" />
                  No pending payments
                </div>
              ) : (
                <div className="divide-y divide-zinc-700">
                  {pendingPayments.map(user => (
                    <div key={user.id} className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-amber-600/20 rounded-full flex items-center justify-center">
                          <AlertCircle className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                          <div className="text-white font-medium">{user.name}</div>
                          <div className="text-sm text-zinc-400">{user.email}</div>
                          {user.requested_plan && (
                            <div className="text-xs text-purple-400 mt-0.5">
                              Upgrading to: {PLAN_LABELS[user.requested_plan] || user.requested_plan}
                            </div>
                          )}
                          {user.requested_extra_credits && (
                            <div className="text-xs text-green-400 mt-0.5">
                              Buying: {user.requested_extra_credits} extra credit(s)
                            </div>
                          )}
                          <div className="text-xs text-zinc-500">
                            Submitted: {user.payment_submitted_at ? new Date(user.payment_submitted_at).toLocaleString() : 'N/A'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {user.payment_proof_url && (
                          <button
                            onClick={() => window.open(getFileUrl(user.payment_proof_url), '_blank')}
                            className="px-3 py-1.5 bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600 text-sm flex items-center gap-1"
                          >
                            <Eye className="w-4 h-4" />
                            View Proof
                          </button>
                        )}
                        <button
                          onClick={() => handleApprovePayment(user.id)}
                          className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-500 text-sm flex items-center gap-1"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            const reason = prompt('Reason for rejection:');
                            if (reason) handleRejectPayment(user.id, reason);
                          }}
                          className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-500 text-sm flex items-center gap-1"
                        >
                          <XCircle className="w-4 h-4" />
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Plan Reference */}
            <div className="bg-zinc-800 rounded-lg p-6">
              <h3 className="text-lg font-medium text-white mb-4">Plan Reference</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="border border-zinc-700 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-zinc-600 rounded-full flex items-center justify-center">
                      <Star className="w-4 h-4 text-zinc-400" />
                    </div>
                    <span className="text-white font-medium">Free</span>
                  </div>
                  <ul className="text-sm text-zinc-400 space-y-1">
                    <li>• 1 demo gallery</li>
                    <li>• 500MB storage</li>
                    <li>• Gallery expires in 6 hours</li>
                  </ul>
                </div>
                <div className="border border-blue-500/30 rounded-lg p-4 bg-blue-500/5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                      <Zap className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-white font-medium">Standard</span>
                  </div>
                  <ul className="text-sm text-zinc-400 space-y-1">
                    <li>• 2 credits/month</li>
                    <li>• 10GB storage</li>
                    <li>• QR Share, Online Gallery</li>
                    <li className="text-red-400">• No Display Mode</li>
                    <li className="text-red-400">• No Contributor Links</li>
                    <li>• ₱{billingSettings.pricing?.standard_monthly}/mo</li>
                  </ul>
                </div>
                <div className="border border-purple-500/30 rounded-lg p-4 bg-purple-500/5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center">
                      <Crown className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-white font-medium">Pro</span>
                  </div>
                  <ul className="text-sm text-zinc-400 space-y-1">
                    <li>• 2 credits/month</li>
                    <li>• 10GB storage</li>
                    <li className="text-green-400">• Display Mode (Slideshow + Collage)</li>
                    <li className="text-green-400">• Contributor Links</li>
                    <li>• ₱{billingSettings.pricing?.pro_monthly}/mo</li>
                  </ul>
                </div>
                <div className="border border-amber-500/30 rounded-lg p-4 bg-amber-500/5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-amber-600 rounded-full flex items-center justify-center">
                      <DollarSign className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-white font-medium">Extra Credit</span>
                  </div>
                  <ul className="text-sm text-zinc-400 space-y-1">
                    <li>• +1 event credit</li>
                    <li>• Current cycle only</li>
                    <li>• ₱{billingSettings.pricing?.extra_credit}/credit</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Transaction History */}
            <div className="bg-zinc-800 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-700">
                <h3 className="text-lg font-medium text-white">Transaction History</h3>
                <p className="text-sm text-zinc-400 mt-1">View all payment transactions and client history</p>
              </div>
              
              {transactions.length === 0 ? (
                <div className="p-8 text-center text-zinc-500">
                  <Activity className="w-12 h-12 mx-auto mb-3 text-zinc-600" />
                  No transactions yet
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-zinc-700/50">
                      <tr>
                        <th className="text-left px-4 py-3 text-sm font-medium text-zinc-400">Date</th>
                        <th className="text-left px-4 py-3 text-sm font-medium text-zinc-400">Client</th>
                        <th className="text-left px-4 py-3 text-sm font-medium text-zinc-400">Type</th>
                        <th className="text-center px-4 py-3 text-sm font-medium text-zinc-400">Amount</th>
                        <th className="text-center px-4 py-3 text-sm font-medium text-zinc-400">Status</th>
                        <th className="text-center px-4 py-3 text-sm font-medium text-zinc-400">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-700">
                      {transactions.slice(0, 20).map((tx) => (
                        <tr key={tx.id} className="hover:bg-zinc-700/30">
                          <td className="px-4 py-3 text-sm text-zinc-300">
                            {new Date(tx.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-white">{tx.user_name}</div>
                            <div className="text-xs text-zinc-500">{tx.user_email}</div>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              tx.type === 'upgrade' ? 'bg-purple-500/20 text-purple-300' :
                              tx.type === 'extra_credits' ? 'bg-blue-500/20 text-blue-300' :
                              'bg-zinc-600 text-zinc-300'
                            }`}>
                              {tx.type === 'upgrade' ? `Upgrade to ${tx.plan}` :
                               tx.type === 'extra_credits' ? `+${tx.extra_credits} Credit(s)` :
                               tx.type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-white font-medium">₱{tx.amount?.toLocaleString() || 0}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              tx.status === 'approved' ? 'bg-green-500/20 text-green-300' :
                              tx.status === 'rejected' ? 'bg-red-500/20 text-red-300' :
                              tx.status === 'disputed' ? 'bg-amber-500/20 text-amber-300' :
                              'bg-zinc-600 text-zinc-300'
                            }`}>
                              {tx.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {tx.payment_proof_url && (
                                <button
                                  onClick={() => window.open(getFileUrl(tx.payment_proof_url), '_blank')}
                                  className="px-2 py-1 bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600 text-xs flex items-center gap-1"
                                  title="View proof"
                                >
                                  <Eye className="w-3 h-3" />
                                </button>
                              )}
                              <button
                                onClick={() => fetchUserTransactions(tx.user_id, tx.user_name)}
                                className="px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-500 text-xs flex items-center gap-1"
                                title="View all transactions from this client"
                              >
                                <Activity className="w-3 h-3" />
                                History
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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

        {/* Features Tab */}
        {activeTab === 'features' && (
          <FeatureTogglePage />
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
                              onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = '';
                                e.target.className = 'hidden';
                                e.target.parentElement.classList.add('broken-image');
                                console.error(`Failed to load hero image ${num}:`, imageUrl);
                              }}
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

      {/* User Transaction History Modal */}
      {showTransactionModal && selectedUserTransactions && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-800 rounded-lg max-w-3xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-zinc-700 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-medium text-white">Transaction History</h3>
                <p className="text-sm text-zinc-400">{selectedUserTransactions.name}</p>
              </div>
              <button 
                onClick={() => setShowTransactionModal(false)} 
                className="p-2 hover:bg-zinc-700 rounded"
              >
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {userTransactions.length === 0 ? (
                <p className="text-zinc-500 text-center py-8">No transactions found</p>
              ) : (
                <div className="space-y-4">
                  {userTransactions.map((tx) => (
                    <div key={tx.id} className={`rounded-lg p-4 border ${
                      tx.status === 'approved' ? 'border-green-500/30 bg-green-500/5' :
                      tx.status === 'rejected' ? 'border-red-500/30 bg-red-500/5' :
                      'border-zinc-700 bg-zinc-700/30'
                    }`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              tx.type === 'upgrade' ? 'bg-purple-500/20 text-purple-300' :
                              tx.type === 'extra_credits' ? 'bg-blue-500/20 text-blue-300' :
                              'bg-zinc-600 text-zinc-300'
                            }`}>
                              {tx.type === 'upgrade' ? `Upgrade to ${tx.plan?.toUpperCase()}` :
                               tx.type === 'extra_credits' ? `+${tx.extra_credits} Credit(s)` :
                               tx.type}
                            </span>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              tx.status === 'approved' ? 'bg-green-500/20 text-green-300' :
                              tx.status === 'rejected' ? 'bg-red-500/20 text-red-300' :
                              'bg-zinc-600 text-zinc-300'
                            }`}>
                              {tx.status}
                            </span>
                          </div>
                          <div className="mt-2 text-sm text-zinc-400">
                            <span className="text-white font-medium">₱{tx.amount?.toLocaleString() || 0}</span>
                            <span className="mx-2">•</span>
                            <span>{new Date(tx.created_at).toLocaleString()}</span>
                          </div>
                          {tx.rejection_reason && (
                            <p className="mt-2 text-sm text-red-400">
                              Rejection reason: {tx.rejection_reason}
                            </p>
                          )}
                          {tx.admin_notes && (
                            <p className="mt-2 text-sm text-zinc-400">
                              Admin notes: {tx.admin_notes}
                            </p>
                          )}
                          {tx.dispute_message && (
                            <p className="mt-2 text-sm text-amber-400">
                              Dispute: {tx.dispute_message}
                            </p>
                          )}
                        </div>
                        {tx.payment_proof_url && (
                          <button
                            onClick={() => window.open(getFileUrl(tx.payment_proof_url), '_blank')}
                            className="px-3 py-1.5 bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600 text-sm flex items-center gap-1"
                          >
                            <Eye className="w-4 h-4" />
                            View Proof
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
