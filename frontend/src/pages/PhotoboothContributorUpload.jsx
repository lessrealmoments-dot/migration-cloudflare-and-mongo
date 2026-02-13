import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { 
  Camera, Loader2, CheckCircle, ExternalLink, 
  RefreshCw, Sparkles, AlertTriangle, Building2,
  Users, ChevronRight, Check, Video, Music,
  Scissors, Cake, Monitor, Plane, PartyPopper,
  Images
} from 'lucide-react';
import useBrandConfig from '../hooks/useBrandConfig';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

// Predefined contributor roles for Photobooth providers
const CONTRIBUTOR_ROLES = {
  'Core Team': [
    { value: 'Photographer', icon: Camera },
    { value: 'Videographer', icon: Video },
    { value: 'Event Coordinator / Planner', icon: Users },
    { value: 'Caterer', icon: Cake },
    { value: 'Event Stylist / Designer', icon: Sparkles },
    { value: 'Host / DJ / Emcee', icon: Music },
  ],
  'Additional Services': [
    { value: 'Live Band / Musicians', icon: Music },
    { value: 'Hair & Makeup Artist (HMUA)', icon: Scissors },
    { value: 'Cake Designer', icon: Cake },
    { value: 'Photobooth Provider', icon: Images },
    { value: 'Lights & Sounds / Technical Team', icon: Monitor },
  ],
  'Premium Enhancements': [
    { value: 'Drone / Aerial Coverage', icon: Plane },
    { value: 'LED Wall / Visual Display', icon: Monitor },
    { value: 'Special Effects (confetti, CO₂, fireworks, cold sparks)', icon: PartyPopper },
    { value: 'Content Creators / Social Media Team', icon: Video },
    { value: 'Live Streaming / Broadcast Team', icon: Video },
  ],
};

const PhotoboothContributorUpload = () => {
  const { contributorLink } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hubLink = searchParams.get('hub');
  const brandConfig = useBrandConfig();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [galleryInfo, setGalleryInfo] = useState(null);
  const [existingSessions, setExistingSessions] = useState([]);
  const [submitResult, setSubmitResult] = useState(null);
  
  // Multi-step form
  const [step, setStep] = useState('company'); // 'company', 'role', 'confirm', 'sync'
  const [companyName, setCompanyName] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [useCustomRole, setUseCustomRole] = useState(false);
  const [fotoshareUrl, setFotoshareUrl] = useState('');
  
  // Autocomplete state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredContributors, setFilteredContributors] = useState([]);
  
  // Get the final role value
  const getFinalRole = () => {
    if (useCustomRole && customRole.trim()) {
      return customRole.trim();
    }
    return selectedRole || 'Photobooth Provider';
  };
  
  // Filter contributors for autocomplete
  const handleCompanyNameChange = (value) => {
    setCompanyName(value);
    
    if (value.trim() && galleryInfo?.existing_contributors?.length > 0) {
      const filtered = galleryInfo.existing_contributors.filter(c => 
        c.name.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredContributors(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setFilteredContributors([]);
      setShowSuggestions(false);
    }
  };
  
  const selectContributor = (contributor) => {
    setCompanyName(contributor.name);
    setSelectedRole(contributor.role);
    setShowSuggestions(false);
  };
  
  useEffect(() => {
    const fetchGalleryInfo = async () => {
      try {
        const response = await axios.get(`${API}/contributor/${contributorLink}`);
        setGalleryInfo(response.data);
        
        // Pre-fill name if exists
        if (response.data.existing_contributor_name) {
          setCompanyName(response.data.existing_contributor_name);
        }
        if (response.data.existing_contributor_role) {
          const predefinedRoles = Object.values(CONTRIBUTOR_ROLES).flat().map(r => r.value);
          if (predefinedRoles.includes(response.data.existing_contributor_role)) {
            setSelectedRole(response.data.existing_contributor_role);
          } else {
            setCustomRole(response.data.existing_contributor_role);
            setUseCustomRole(true);
          }
        }
        
        // If already synced, show results
        if (response.data.fotoshare_url) {
          setFotoshareUrl(response.data.fotoshare_url);
          setStep('sync');
        }
      } catch (err) {
        toast.error('Invalid or expired contributor link');
      } finally {
        setLoading(false);
      }
    };
    
    fetchGalleryInfo();
  }, [contributorLink]);

  // Fetch existing sessions after setting contributor name
  const fetchExistingSessions = async () => {
    if (!galleryInfo) return;
    try {
      const response = await axios.get(
        `${API}/galleries/${galleryInfo.gallery_id}/photobooth-sessions?section_id=${galleryInfo.section_id}`
      );
      setExistingSessions(response.data || []);
    } catch (err) {
      console.error('Failed to fetch sessions');
    }
  };

  useEffect(() => {
    if (galleryInfo && step === 'sync') {
      fetchExistingSessions();
    }
  }, [galleryInfo, step]);

  const handleSetContributorName = async () => {
    if (!companyName.trim()) {
      toast.error('Please enter your company name');
      return;
    }
    
    try {
      await axios.post(`${API}/contributor/${contributorLink}/set-name`, {
        company_name: companyName.trim(),
        contributor_role: getFinalRole()
      });
      setStep('role');
    } catch (err) {
      toast.error('Failed to set name');
    }
  };

  const handleSubmitUrl = async () => {
    if (!fotoshareUrl.trim()) {
      toast.error('Please enter your Fotoshare.co link');
      return;
    }
    
    // Basic validation
    if (!fotoshareUrl.includes('fotoshare.co')) {
      toast.error('Please enter a valid Fotoshare.co URL');
      return;
    }
    
    setSubmitting(true);
    try {
      const response = await axios.post(`${API}/contributor/${contributorLink}/submit-photobooth`, {
        fotoshare_url: fotoshareUrl.trim()
      });
      
      setSubmitResult(response.data);
      toast.success(`Successfully synced ${response.data.sessions_count} sessions!`);
      setStep('sync');
      fetchExistingSessions();
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Failed to sync Photobooth';
      toast.error(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefresh = async () => {
    setSubmitting(true);
    try {
      const response = await axios.post(`${API}/contributor/${contributorLink}/refresh-photobooth`);
      setSubmitResult(response.data);
      toast.success(`Refreshed! ${response.data.new_sessions_added || 0} new sessions found.`);
      fetchExistingSessions();
    } catch (err) {
      toast.error('Failed to refresh');
    } finally {
      setSubmitting(false);
    }
  };

  // Navigate back to coordinator hub
  const handleBackToHub = () => {
    if (hubLink) {
      navigate(`/coordinator/${hubLink}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 via-white to-purple-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-violet-500 mx-auto mb-4" />
          <p className="text-zinc-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!galleryInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 via-white to-purple-50">
        <div className="text-center p-8 bg-white rounded-2xl shadow-lg">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-zinc-800 mb-2">Invalid Link</h2>
          <p className="text-zinc-500">This contributor link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-500">Contributing to</p>
              <h1 className="text-xl font-bold text-zinc-800">{galleryInfo.gallery_title}</h1>
            </div>
            {hubLink && (
              <button
                onClick={handleBackToHub}
                className="text-sm text-violet-600 hover:text-violet-700 flex items-center gap-1"
              >
                Back to Hub
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {['company', 'role', 'confirm', 'sync'].map((s, i) => (
            <React.Fragment key={s}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s ? 'bg-violet-500 text-white' : 
                ['company', 'role', 'confirm', 'sync'].indexOf(step) > i ? 'bg-violet-200 text-violet-700' : 
                'bg-zinc-200 text-zinc-500'
              }`}>
                {['company', 'role', 'confirm', 'sync'].indexOf(step) > i ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              {i < 3 && <div className={`w-12 h-0.5 ${['company', 'role', 'confirm', 'sync'].indexOf(step) > i ? 'bg-violet-300' : 'bg-zinc-200'}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* Section info */}
        <div className="bg-gradient-to-r from-violet-500 to-purple-600 rounded-2xl p-6 mb-8 text-white">
          <div className="flex items-center gap-3 mb-2">
            <Images className="w-6 h-6" />
            <span className="font-medium">{galleryInfo.section_name}</span>
          </div>
          <p className="text-violet-100 text-sm">
            Share your Fotoshare.co Photobooth link to sync photos to this gallery
          </p>
        </div>

        {/* Step 1: Company Name */}
        {step === 'company' && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-zinc-800 mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-violet-500" />
              What's your company name?
            </h2>
            <div className="relative">
              <input
                type="text"
                value={companyName}
                onChange={(e) => handleCompanyNameChange(e.target.value)}
                onFocus={() => {
                  if (filteredContributors.length > 0) setShowSuggestions(true);
                }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder="Enter your business/company name"
                className="w-full px-4 py-3 border border-zinc-300 rounded-xl focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none"
                data-testid="company-name-input"
              />
              
              {/* Autocomplete suggestions */}
              {showSuggestions && filteredContributors.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-zinc-200 rounded-xl shadow-lg overflow-hidden">
                  {filteredContributors.map((c, idx) => (
                    <button
                      key={idx}
                      onClick={() => selectContributor(c)}
                      className="w-full px-4 py-3 text-left hover:bg-violet-50 flex items-center justify-between"
                    >
                      <span className="font-medium text-zinc-800">{c.name}</span>
                      <span className="text-sm text-zinc-500">{c.role}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleSetContributorName}
              disabled={!companyName.trim()}
              className="mt-4 w-full py-3 bg-violet-500 hover:bg-violet-600 disabled:bg-zinc-300 text-white rounded-xl font-medium flex items-center justify-center gap-2"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step 2: Role Selection */}
        {step === 'role' && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-zinc-800 mb-4">What's your role?</h2>
            <div className="space-y-4 max-h-[400px] overflow-y-auto">
              {Object.entries(CONTRIBUTOR_ROLES).map(([category, roles]) => (
                <div key={category}>
                  <p className="text-sm font-medium text-zinc-500 mb-2">{category}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {roles.map((role) => {
                      const Icon = role.icon;
                      return (
                        <button
                          key={role.value}
                          onClick={() => { setSelectedRole(role.value); setUseCustomRole(false); }}
                          className={`p-3 rounded-xl border text-left flex items-center gap-2 text-sm ${
                            selectedRole === role.value && !useCustomRole
                              ? 'border-violet-500 bg-violet-50 text-violet-700'
                              : 'border-zinc-200 hover:border-violet-300'
                          }`}
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          <span className="truncate">{role.value}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              
              {/* Custom role */}
              <div>
                <p className="text-sm font-medium text-zinc-500 mb-2">Or enter custom role</p>
                <input
                  type="text"
                  value={customRole}
                  onChange={(e) => { setCustomRole(e.target.value); setUseCustomRole(true); }}
                  onFocus={() => setUseCustomRole(true)}
                  placeholder="Enter your role..."
                  className={`w-full px-4 py-3 border rounded-xl outline-none ${
                    useCustomRole ? 'border-violet-500 ring-2 ring-violet-200' : 'border-zinc-300'
                  }`}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setStep('company')}
                className="flex-1 py-3 border border-zinc-300 text-zinc-700 rounded-xl"
              >
                Back
              </button>
              <button
                onClick={() => setStep('confirm')}
                className="flex-1 py-3 bg-violet-500 hover:bg-violet-600 text-white rounded-xl font-medium"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm & Enter URL */}
        {step === 'confirm' && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-zinc-800 mb-4 flex items-center gap-2">
              <Images className="w-5 h-5 text-violet-500" />
              Enter your Fotoshare.co Photobooth link
            </h2>
            
            {/* Summary */}
            <div className="bg-violet-50 rounded-xl p-4 mb-4">
              <p className="text-sm text-zinc-600">
                <span className="font-medium">{companyName}</span> · {getFinalRole()}
              </p>
            </div>
            
            <div className="space-y-4">
              <input
                type="url"
                value={fotoshareUrl}
                onChange={(e) => setFotoshareUrl(e.target.value)}
                placeholder="https://fotoshare.co/e/your-event-id"
                className="w-full px-4 py-3 border border-zinc-300 rounded-xl focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none"
                data-testid="fotoshare-url-input"
              />
              
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium mb-1">How to get your Fotoshare link:</p>
                    <ol className="list-decimal list-inside space-y-1 text-amber-700">
                      <li>Open your Fotoshare.co event dashboard</li>
                      <li>Copy the share link (starts with fotoshare.co/e/)</li>
                      <li>Paste it above</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setStep('role')}
                className="flex-1 py-3 border border-zinc-300 text-zinc-700 rounded-xl"
              >
                Back
              </button>
              <button
                onClick={handleSubmitUrl}
                disabled={submitting || !fotoshareUrl.trim()}
                className="flex-1 py-3 bg-violet-500 hover:bg-violet-600 disabled:bg-zinc-300 text-white rounded-xl font-medium flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    Sync Photos <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Synced Successfully */}
        {step === 'sync' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="text-xl font-bold text-zinc-800 mb-2">Photobooth Synced!</h2>
              <p className="text-zinc-500 mb-4">
                {existingSessions.length} session{existingSessions.length !== 1 ? 's' : ''} synced to the gallery
              </p>
              
              {/* Sessions preview */}
              {existingSessions.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {existingSessions.slice(0, 8).map((session) => (
                    <div key={session.id} className="aspect-square rounded-lg overflow-hidden relative">
                      <img
                        src={session.cover_thumbnail}
                        alt="Session"
                        className="w-full h-full object-cover"
                      />
                      {session.has_multiple && (
                        <div className="absolute top-1 right-1 bg-black/50 rounded p-0.5">
                          <Images className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              <div className="flex gap-3">
                <button
                  onClick={handleRefresh}
                  disabled={submitting}
                  className="flex-1 py-3 border border-violet-300 text-violet-600 hover:bg-violet-50 rounded-xl font-medium flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Refresh
                </button>
                {hubLink && (
                  <button
                    onClick={handleBackToHub}
                    className="flex-1 py-3 bg-violet-500 hover:bg-violet-600 text-white rounded-xl font-medium"
                  >
                    Back to Hub
                  </button>
                )}
              </div>
            </div>

            {/* View in Fotoshare */}
            {fotoshareUrl && (
              <a
                href={fotoshareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-white rounded-2xl shadow-lg p-4 hover:bg-zinc-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center">
                      <ExternalLink className="w-5 h-5 text-violet-500" />
                    </div>
                    <div>
                      <p className="font-medium text-zinc-800">View on Fotoshare</p>
                      <p className="text-sm text-zinc-500 truncate max-w-[200px]">{fotoshareUrl}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-zinc-400" />
                </div>
              </a>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-sm text-zinc-400">
            Powered by {brandConfig?.brandName || 'EventsGallery'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default PhotoboothContributorUpload;
