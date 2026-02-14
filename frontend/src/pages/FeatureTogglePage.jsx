import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { 
  Shield, Crown, Star, Users, Zap, Building2,
  Link2, QrCode, Eye, Layout, Share2, 
  Infinity, Save, RefreshCw, Info,
  ChevronDown, ChevronUp, Check, X,
  HardDrive, Clock
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Feature definitions
const FEATURE_INFO = {
  unlimited_token: {
    label: 'Unlimited Token',
    description: 'Unlimited event credits (no limit on galleries)',
    icon: Infinity
  },
  copy_share_link: {
    label: 'Copy Share Link',
    description: 'Allow copying shareable gallery links',
    icon: Link2
  },
  qr_code: {
    label: 'QR Code',
    description: 'Generate QR codes for gallery sharing',
    icon: QrCode
  },
  view_public_gallery: {
    label: 'View Public Gallery',
    description: 'Allow public gallery viewing without login',
    icon: Eye
  },
  display_mode: {
    label: 'Display Mode',
    description: 'Slideshow and Collage display modes',
    icon: Layout
  },
  collaboration_link: {
    label: 'Collaboration Link',
    description: 'Contributor upload links for external users',
    icon: Share2
  }
};

// Storage options in GB (per gallery)
const STORAGE_OPTIONS = [
  { value: -1, label: 'Unlimited' },
  { value: 1, label: '1 GB' },
  { value: 5, label: '5 GB' },
  { value: 10, label: '10 GB' },
  { value: 15, label: '15 GB' },
  { value: 20, label: '20 GB' },
  { value: 30, label: '30 GB' },
  { value: 50, label: '50 GB' }
];

// Gallery expiration options in days
const EXPIRATION_OPTIONS = [
  { value: 30, label: '1 Month' },
  { value: 60, label: '2 Months' },
  { value: 90, label: '3 Months' },
  { value: 120, label: '4 Months' },
  { value: 150, label: '5 Months' },
  { value: 180, label: '6 Months' },
  { value: 365, label: '1 Year' },
  { value: 36500, label: 'Never (100 years)' }
];

// Mode/Plan display info
const MODE_INFO = {
  founders_circle: {
    label: 'Founders Circle',
    description: 'Highest tier - Unlimited everything',
    icon: Crown,
    color: 'purple'
  },
  early_partner_beta: {
    label: 'Early Partner Beta',
    description: 'Beta partners with Pro features',
    icon: Star,
    color: 'amber'
  },
  comped_pro: {
    label: 'Comped Pro',
    description: 'Complimentary Pro access',
    icon: Zap,
    color: 'blue'
  },
  comped_standard: {
    label: 'Comped Standard',
    description: 'Complimentary Standard access',
    icon: Users,
    color: 'green'
  },
  enterprise_access: {
    label: 'Enterprise Access',
    description: 'Trial access for major clients (1-2 months)',
    icon: Building2,
    color: 'cyan'
  }
};

const PLAN_INFO = {
  free: {
    label: 'Free',
    description: 'Demo tier with limited features',
    icon: Users,
    color: 'zinc'
  },
  standard: {
    label: 'Standard',
    description: 'Basic paid plan',
    icon: Zap,
    color: 'blue'
  },
  pro: {
    label: 'Pro',
    description: 'Full featured plan',
    icon: Crown,
    color: 'purple'
  }
};

const FeatureTogglePage = () => {
  const [toggles, setToggles] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    global_settings: true,
    override_modes: true,
    payment_plans: true
  });
  
  // Global simple toggles (separate from per-plan toggles)
  const [globalToggles, setGlobalToggles] = useState({
    allow_guest_upload_never_expires: false
  });

  useEffect(() => {
    fetchToggles();
    fetchGlobalToggles();
  }, []);

  const fetchGlobalToggles = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await axios.get(`${API}/admin/feature-toggles`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setGlobalToggles({
        allow_guest_upload_never_expires: response.data.allow_guest_upload_never_expires ?? false
      });
    } catch (error) {
      console.error('Failed to fetch global toggles');
    }
  };

  const handleGlobalToggle = async (key) => {
    const newValue = !globalToggles[key];
    setGlobalToggles(prev => ({ ...prev, [key]: newValue }));
    
    try {
      const token = localStorage.getItem('adminToken');
      await axios.put(`${API}/admin/feature-toggles`, 
        { ...globalToggles, [key]: newValue },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Setting updated!');
    } catch (error) {
      toast.error('Failed to update setting');
      // Revert on error
      setGlobalToggles(prev => ({ ...prev, [key]: !newValue }));
    }
  };

  const fetchToggles = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('adminToken');
      const response = await axios.get(`${API}/admin/global-feature-toggles`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Merge with default storage/expiration values for override modes
      const defaultModeSettings = {
        founders_circle: { gallery_storage_limit_gb: -1, gallery_expiration_days: 36500 },
        early_partner_beta: { gallery_storage_limit_gb: 20, gallery_expiration_days: 180 },
        comped_pro: { gallery_storage_limit_gb: 20, gallery_expiration_days: 180 },
        comped_standard: { gallery_storage_limit_gb: 10, gallery_expiration_days: 90 },
        enterprise_access: { gallery_storage_limit_gb: -1, gallery_expiration_days: 36500 }
      };
      
      // Default settings for payment plans
      const defaultPlanSettings = {
        free: { gallery_storage_limit_gb: 1, gallery_expiration_days: 1 }, // 1GB per gallery, 1 day (demo)
        standard: { gallery_storage_limit_gb: 10, gallery_expiration_days: 180 }, // 10GB per gallery, 6 months
        pro: { gallery_storage_limit_gb: 20, gallery_expiration_days: 180 } // 20GB per gallery, 6 months
      };
      
      const data = response.data;
      
      // Merge override modes with defaults
      if (data.override_modes) {
        Object.keys(data.override_modes).forEach(mode => {
          if (defaultModeSettings[mode]) {
            data.override_modes[mode].features = {
              ...defaultModeSettings[mode],
              ...data.override_modes[mode].features
            };
          }
        });
      }
      
      // Merge payment plans with defaults
      if (data.payment_plans) {
        Object.keys(data.payment_plans).forEach(plan => {
          if (defaultPlanSettings[plan]) {
            data.payment_plans[plan].features = {
              ...defaultPlanSettings[plan],
              ...data.payment_plans[plan].features
            };
          }
        });
      }
      
      setToggles(data);
    } catch (error) {
      toast.error('Failed to load feature toggles');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (section, key, feature) => {
    setToggles(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: {
          ...prev[section][key],
          features: {
            ...prev[section][key].features,
            [feature]: !prev[section][key].features[feature]
          }
        }
      }
    }));
  };

  const handleStorageChange = (section, key, value) => {
    setToggles(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: {
          ...prev[section][key],
          features: {
            ...prev[section][key].features,
            gallery_storage_limit_gb: parseInt(value)
          }
        }
      }
    }));
  };

  const handleExpirationChange = (section, key, value) => {
    setToggles(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: {
          ...prev[section][key],
          features: {
            ...prev[section][key].features,
            gallery_expiration_days: parseInt(value)
          }
        }
      }
    }));
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('adminToken');
      
      // Build the payload
      const payload = {
        // Override Modes
        founders_circle: toggles.override_modes.founders_circle.features,
        early_partner_beta: toggles.override_modes.early_partner_beta.features,
        comped_pro: toggles.override_modes.comped_pro.features,
        comped_standard: toggles.override_modes.comped_standard.features,
        enterprise_access: toggles.override_modes.enterprise_access.features,
        // Payment Plans
        free: toggles.payment_plans.free.features,
        standard: toggles.payment_plans.standard.features,
        pro: toggles.payment_plans.pro.features
      };
      
      await axios.put(`${API}/admin/global-feature-toggles`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success('Feature toggles saved successfully!');
    } catch (error) {
      toast.error('Failed to save feature toggles');
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!toggles) {
    return (
      <div className="text-center text-zinc-500 py-12">
        Failed to load feature toggles
      </div>
    );
  }

  const renderFeatureRow = (section, modeKey, featureKey) => {
    const features = toggles[section][modeKey].features;
    const isEnabled = features[featureKey];
    const FeatureIcon = FEATURE_INFO[featureKey].icon;
    
    return (
      <div 
        key={featureKey}
        className="flex items-center justify-between py-2 px-3 hover:bg-zinc-700/30 rounded-lg"
      >
        <div className="flex items-center gap-3">
          <FeatureIcon className="w-4 h-4 text-zinc-400" />
          <div>
            <span className="text-sm text-white">{FEATURE_INFO[featureKey].label}</span>
            <p className="text-xs text-zinc-500">{FEATURE_INFO[featureKey].description}</p>
          </div>
        </div>
        <button
          onClick={() => handleToggle(section, modeKey, featureKey)}
          className={`w-12 h-6 rounded-full transition-colors relative ${
            isEnabled ? 'bg-green-500' : 'bg-zinc-600'
          }`}
          data-testid={`toggle-${section}-${modeKey}-${featureKey}`}
        >
          <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
            isEnabled ? 'right-1' : 'left-1'
          }`} />
        </button>
      </div>
    );
  };

  const renderModeCard = (section, modeKey, info) => {
    const ModeIcon = info.icon;
    const features = toggles[section][modeKey].features;
    const enabledCount = Object.entries(features).filter(([k, v]) => typeof v === 'boolean' && v).length;
    const totalCount = Object.keys(FEATURE_INFO).length;
    const isOverrideMode = section === 'override_modes';
    const isPaidPlan = section === 'payment_plans' && (modeKey === 'standard' || modeKey === 'pro');
    const showStorageControls = isOverrideMode || isPaidPlan;
    
    return (
      <div 
        key={modeKey}
        className={`bg-zinc-800 rounded-xl overflow-hidden border border-zinc-700`}
      >
        <div className={`px-4 py-3 flex items-center justify-between bg-${info.color}-500/10 border-b border-zinc-700`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg bg-${info.color}-500/20 flex items-center justify-center`}>
              <ModeIcon className={`w-5 h-5 text-${info.color}-400`} />
            </div>
            <div>
              <h4 className="font-medium text-white">{info.label}</h4>
              <p className="text-xs text-zinc-400">{info.description}</p>
            </div>
          </div>
          <div className="text-xs text-zinc-400">
            {enabledCount}/{totalCount} enabled
          </div>
        </div>
        <div className="p-3 space-y-1">
          {Object.keys(FEATURE_INFO).map(featureKey => 
            renderFeatureRow(section, modeKey, featureKey)
          )}
          
          {/* Storage and Expiration controls for Override Modes AND Paid Plans */}
          {showStorageControls && (
            <div className="mt-4 pt-4 border-t border-zinc-700 space-y-3">
              {isPaidPlan && (
                <div className="text-xs text-amber-400 bg-amber-400/10 px-3 py-2 rounded-lg mb-3">
                  <strong>Universal Settings:</strong> These apply to all {info.label} plan users
                </div>
              )}
              <div className="flex items-center justify-between py-2 px-3 bg-zinc-700/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <HardDrive className="w-4 h-4 text-zinc-400" />
                  <div>
                    <span className="text-sm text-white">Gallery Storage Limit</span>
                    <p className="text-xs text-zinc-500">Maximum storage per gallery</p>
                  </div>
                </div>
                <select
                  value={features.gallery_storage_limit_gb ?? -1}
                  onChange={(e) => handleStorageChange(section, modeKey, e.target.value)}
                  className="bg-zinc-600 text-white text-sm rounded-lg px-3 py-1.5 border border-zinc-500"
                >
                  {STORAGE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center justify-between py-2 px-3 bg-zinc-700/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-zinc-400" />
                  <div>
                    <span className="text-sm text-white">Gallery Expiration</span>
                    <p className="text-xs text-zinc-500">Days until auto-delete</p>
                  </div>
                </div>
                <select
                  value={features.gallery_expiration_days ?? 180}
                  onChange={(e) => handleExpirationChange(section, modeKey, e.target.value)}
                  className="bg-zinc-600 text-white text-sm rounded-lg px-3 py-1.5 border border-zinc-500"
                >
                  {EXPIRATION_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white flex items-center gap-3">
            <Shield className="w-7 h-7 text-purple-400" />
            Global Feature Toggles
          </h2>
          <p className="text-zinc-400 mt-1">
            Configure which features are available for each package and override mode
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchToggles}
            className="px-4 py-2 bg-zinc-700 text-zinc-200 rounded-lg hover:bg-zinc-600 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={handleSaveAll}
            disabled={saving}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 flex items-center gap-2 disabled:opacity-50"
            data-testid="save-feature-toggles"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save All Changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* Authority Hierarchy Info */}
      <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-purple-300">Authority Hierarchy (Strict Order)</h4>
            <p className="text-sm text-zinc-400 mt-1">
              The system resolves features using this priority:
            </p>
            <ol className="text-sm text-zinc-300 mt-2 space-y-1 list-decimal list-inside">
              <li><span className="text-purple-400 font-medium">Admin Override Mode</span> (highest authority) - Always takes precedence if active</li>
              <li><span className="text-blue-400 font-medium">Normal Payment/Subscription Plan</span> - Applies when no override is active</li>
              <li><span className="text-zinc-400 font-medium">Payment Status</span> - Only affects downloads if billing enforcement enabled</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Override Modes Section */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 overflow-hidden">
        <button
          onClick={() => toggleSection('override_modes')}
          className="w-full px-6 py-4 flex items-center justify-between bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Crown className="w-5 h-5 text-purple-400" />
            <h3 className="text-lg font-medium text-white">Admin Override Modes</h3>
            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded-full">
              Highest Authority
            </span>
          </div>
          {expandedSections.override_modes ? (
            <ChevronUp className="w-5 h-5 text-zinc-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-zinc-400" />
          )}
        </button>
        
        {expandedSections.override_modes && (
          <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Object.entries(MODE_INFO).map(([key, info]) => 
              renderModeCard('override_modes', key, info)
            )}
          </div>
        )}
      </div>

      {/* Payment Plans Section */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 overflow-hidden">
        <button
          onClick={() => toggleSection('payment_plans')}
          className="w-full px-6 py-4 flex items-center justify-between bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-medium text-white">Normal Payment Plans</h3>
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-xs rounded-full">
              When No Override Active
            </span>
          </div>
          {expandedSections.payment_plans ? (
            <ChevronUp className="w-5 h-5 text-zinc-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-zinc-400" />
          )}
        </button>
        
        {expandedSections.payment_plans && (
          <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
            {Object.entries(PLAN_INFO).map(([key, info]) => 
              renderModeCard('payment_plans', key, info)
            )}
          </div>
        )}
      </div>

      {/* Feature Legend */}
      <div className="bg-zinc-800/50 rounded-xl p-6">
        <h4 className="text-sm font-medium text-zinc-400 mb-4">Feature Legend</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Object.entries(FEATURE_INFO).map(([key, info]) => {
            const Icon = info.icon;
            return (
              <div key={key} className="flex items-center gap-2 text-sm text-zinc-300">
                <Icon className="w-4 h-4 text-zinc-500" />
                {info.label}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default FeatureTogglePage;
