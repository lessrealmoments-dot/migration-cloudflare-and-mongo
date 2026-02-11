import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { 
  Camera, Upload, Loader2, CheckCircle, ExternalLink, 
  Play, RefreshCw, Sparkles, AlertTriangle, Building2,
  Users, ChevronRight, Check, Video, Music,
  Scissors, Cake, Monitor, Plane, PartyPopper,
  RotateCcw
} from 'lucide-react';
import useBrandConfig from '../hooks/useBrandConfig';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

// Predefined contributor roles organized by category
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
    { value: 'Photobooth Provider', icon: Camera },
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

const FotoshareContributorUpload = () => {
  const { contributorLink } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hubLink = searchParams.get('hub');
  const brandConfig = useBrandConfig();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [galleryInfo, setGalleryInfo] = useState(null);
  const [existingVideos, setExistingVideos] = useState([]);
  const [submitResult, setSubmitResult] = useState(null);
  
  // Multi-step form
  const [step, setStep] = useState('company'); // 'company', 'role', 'confirm', 'sync'
  const [companyName, setCompanyName] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [useCustomRole, setUseCustomRole] = useState(false);
  const [fotoshareUrl, setFotoshareUrl] = useState('');
  
  // Get the final role value
  const getFinalRole = () => {
    if (useCustomRole && customRole.trim()) {
      return customRole.trim();
    }
    // Default to Photobooth Provider for 360 booth
    return selectedRole || 'Photobooth Provider';
  };
  
  // Navigate back to coordinator hub
  const goBackToHub = () => {
    if (hubLink) {
      navigate(`/coordinator/${hubLink}`);
    } else if (window.history.length > 1) {
      window.history.back();
    } else {
      window.close();
    }
  };
  
  useEffect(() => {
    fetchGalleryInfo();
  }, [contributorLink]);
  
  const fetchGalleryInfo = async () => {
    try {
      const response = await axios.get(`${API}/contributor/${contributorLink}`);
      
      if (response.data.section_type !== 'fotoshare') {
        toast.error('This link is not for 360 booth uploads');
        navigate('/');
        return;
      }
      
      setGalleryInfo(response.data);
      setExistingVideos(response.data.existing_fotoshare_videos || []);
      
      // If contributor info already exists, pre-fill and skip to sync
      if (response.data.existing_contributor_name) {
        setCompanyName(response.data.existing_contributor_name);
        if (response.data.existing_contributor_role) {
          setSelectedRole(response.data.existing_contributor_role);
        }
        // Pre-fill URL if exists
        if (response.data.fotoshare_url) {
          setFotoshareUrl(response.data.fotoshare_url);
        }
        setStep('sync');
      }
    } catch (error) {
      toast.error('Invalid or expired upload link');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };
  
  // Step 1: Company name submission
  const handleCompanySubmit = (e) => {
    e.preventDefault();
    if (!companyName.trim()) {
      toast.error('Please enter your company/business name');
      return;
    }
    setStep('role');
  };

  // Step 2: Role selection
  const handleRoleSubmit = () => {
    if (!selectedRole && !useCustomRole) {
      toast.error('Please select your role');
      return;
    }
    if (useCustomRole && !customRole.trim()) {
      toast.error('Please enter your custom role');
      return;
    }
    setStep('confirm');
  };

  // Step 3: Confirm and save
  const handleConfirm = async () => {
    try {
      await axios.post(`${API}/contributor/${contributorLink}/set-name`, {
        company_name: companyName.trim(),
        contributor_role: getFinalRole()
      });
      toast.success('Profile saved! Now sync your Fotoshare event.');
      setStep('sync');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save profile');
    }
  };
  
  const handleSubmitSync = async (e) => {
    e.preventDefault();
    
    if (!fotoshareUrl.trim()) {
      toast.error('Please enter a fotoshare.co URL');
      return;
    }
    
    if (!fotoshareUrl.startsWith('https://fotoshare.co/')) {
      toast.error('Please enter a valid fotoshare.co URL (e.g., https://fotoshare.co/e/...)');
      return;
    }
    
    setSubmitting(true);
    
    try {
      const response = await axios.post(`${API}/contributor/${contributorLink}/fotoshare`, {
        company_name: companyName.trim(),
        contributor_role: getFinalRole(),
        fotoshare_url: fotoshareUrl.trim()
      });
      
      setSubmitResult(response.data);
      toast.success(`Successfully synced ${response.data.videos_synced} videos!`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to sync Fotoshare event');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 to-zinc-800">
      {/* Header */}
      <header className="bg-black/30 backdrop-blur-sm border-b border-white/10 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {brandConfig.logo_url ? (
              <img src={brandConfig.logo_url} alt={brandConfig.brand_name} className="h-8" />
            ) : (
              <RotateCcw className="w-8 h-8 text-purple-400" />
            )}
            <span className="font-semibold text-white">{brandConfig.brand_name || 'PhotoShare'}</span>
          </div>
          {hubLink && (
            <button
              onClick={goBackToHub}
              className="text-sm text-zinc-400 hover:text-white flex items-center gap-1"
            >
              ← Back to Hub
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Gallery Info */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/20 text-purple-300 rounded-full mb-4 border border-purple-500/30">
            <RotateCcw className="w-4 h-4" />
            <span className="text-sm font-medium">360° Glam Booth</span>
          </div>
          <p className="text-sm text-zinc-500 uppercase tracking-wider mb-2">Contributing to</p>
          <h1 className="text-3xl font-light text-white mb-1">{galleryInfo?.gallery_title}</h1>
          <p className="text-lg text-zinc-400">{galleryInfo?.section_name}</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {['company', 'role', 'confirm', 'sync'].map((s, i) => (
            <React.Fragment key={s}>
              <div 
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                  step === s 
                    ? 'bg-purple-500 text-white' 
                    : ['company', 'role', 'confirm', 'sync'].indexOf(step) > i 
                      ? 'bg-green-500 text-white' 
                      : 'bg-zinc-700 text-zinc-500'
                }`}
              >
                {['company', 'role', 'confirm', 'sync'].indexOf(step) > i ? (
                  <Check className="w-4 h-4" />
                ) : (
                  i + 1
                )}
              </div>
              {i < 3 && (
                <div className={`w-12 h-0.5 ${['company', 'role', 'confirm', 'sync'].indexOf(step) > i ? 'bg-green-500' : 'bg-zinc-700'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: Company Name */}
        {step === 'company' && (
          <div className="bg-zinc-800/50 backdrop-blur-sm rounded-2xl border border-zinc-700 p-8">
            <div className="text-center mb-8">
              <Building2 className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-white mb-2">What's your company name?</h2>
              <p className="text-zinc-400">This will appear in the gallery credits</p>
            </div>
            
            <form onSubmit={handleCompanySubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Company / Business Name
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g., 360 Glam Booth Philippines"
                  className="w-full px-4 py-3 bg-zinc-900/50 border border-zinc-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-lg text-white placeholder-zinc-500"
                  autoFocus
                />
              </div>
              
              <button
                type="submit"
                className="w-full py-3 bg-purple-500 text-white rounded-xl font-medium hover:bg-purple-600 transition-colors flex items-center justify-center gap-2"
              >
                Continue <ChevronRight className="w-5 h-5" />
              </button>
            </form>
          </div>
        )}

        {/* Step 2: Role Selection */}
        {step === 'role' && (
          <div className="bg-zinc-800/50 backdrop-blur-sm rounded-2xl border border-zinc-700 p-8">
            <div className="text-center mb-8">
              <Users className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-white mb-2">What's your role?</h2>
              <p className="text-zinc-400">Select your service category for the credits</p>
            </div>
            
            <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2">
              {Object.entries(CONTRIBUTOR_ROLES).map(([category, roles]) => (
                <div key={category}>
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5" />
                    {category}
                  </h3>
                  <div className="grid grid-cols-1 gap-2">
                    {roles.map((role) => {
                      const Icon = role.icon;
                      const isSelected = selectedRole === role.value && !useCustomRole;
                      return (
                        <button
                          key={role.value}
                          type="button"
                          onClick={() => {
                            setSelectedRole(role.value);
                            setUseCustomRole(false);
                          }}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                            isSelected
                              ? 'border-purple-500 bg-purple-500/10'
                              : 'border-zinc-700 hover:border-zinc-600'
                          }`}
                        >
                          <Icon className={`w-5 h-5 ${isSelected ? 'text-purple-400' : 'text-zinc-500'}`} />
                          <span className={`font-medium ${isSelected ? 'text-white' : 'text-zinc-300'}`}>
                            {role.value}
                          </span>
                          {isSelected && (
                            <CheckCircle className="w-5 h-5 text-green-500 ml-auto" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              
              {/* Custom Role Option */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                  Or enter a custom role
                </h3>
                <div 
                  className={`border-2 rounded-xl transition-all ${
                    useCustomRole ? 'border-purple-500 bg-purple-500/10' : 'border-zinc-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setUseCustomRole(true)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  >
                    <Sparkles className={`w-5 h-5 ${useCustomRole ? 'text-purple-400' : 'text-zinc-500'}`} />
                    <span className={`font-medium ${useCustomRole ? 'text-white' : 'text-zinc-300'}`}>
                      Custom Role
                    </span>
                    {useCustomRole && (
                      <CheckCircle className="w-5 h-5 text-green-500 ml-auto" />
                    )}
                  </button>
                  {useCustomRole && (
                    <div className="px-4 pb-4">
                      <input
                        type="text"
                        value={customRole}
                        onChange={(e) => setCustomRole(e.target.value)}
                        placeholder="Enter your role (e.g., 360 Booth Operator)"
                        className="w-full px-4 py-2 bg-zinc-900/50 border border-zinc-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white placeholder-zinc-500"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 mt-8">
              <button
                type="button"
                onClick={() => setStep('company')}
                className="flex-1 py-3 border-2 border-zinc-600 text-zinc-300 rounded-xl font-medium hover:bg-zinc-700/50 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleRoleSubmit}
                className="flex-1 py-3 bg-purple-500 text-white rounded-xl font-medium hover:bg-purple-600 transition-colors flex items-center justify-center gap-2"
              >
                Continue <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Confirmation */}
        {step === 'confirm' && (
          <div className="bg-zinc-800/50 backdrop-blur-sm rounded-2xl border border-zinc-700 p-8">
            <div className="text-center mb-8">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-white mb-2">Confirm your details</h2>
              <p className="text-zinc-400">This is how you'll appear in the gallery credits</p>
            </div>
            
            {/* Preview Card */}
            <div className="bg-gradient-to-br from-purple-600 to-purple-900 rounded-xl p-6 text-white mb-8">
              <p className="text-xs uppercase tracking-wider text-purple-200 mb-1">Credit Preview</p>
              <div className="border-l-2 border-white/30 pl-4 mt-4">
                <p className="text-lg font-semibold">{companyName}</p>
                <p className="text-sm text-purple-200">{getFinalRole()}</p>
              </div>
            </div>
            
            <div className="space-y-4 mb-8">
              <div className="flex justify-between items-center py-3 border-b border-zinc-700">
                <span className="text-zinc-500">Company Name</span>
                <span className="font-medium text-white">{companyName}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-zinc-700">
                <span className="text-zinc-500">Role</span>
                <span className="font-medium text-white">{getFinalRole()}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-zinc-700">
                <span className="text-zinc-500">Section</span>
                <span className="font-medium text-white">{galleryInfo?.section_name}</span>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('role')}
                className="flex-1 py-3 border-2 border-zinc-600 text-zinc-300 rounded-xl font-medium hover:bg-zinc-700/50 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 py-3 bg-purple-500 text-white rounded-xl font-medium hover:bg-purple-600 transition-colors flex items-center justify-center gap-2"
              >
                Confirm & Continue <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Fotoshare Sync */}
        {step === 'sync' && (
          <div className="bg-zinc-800/50 backdrop-blur-sm rounded-2xl border border-zinc-700 p-8">
            {!submitResult ? (
              <>
                <div className="text-center mb-8">
                  <RotateCcw className="w-12 h-12 text-purple-400 mx-auto mb-4" />
                  <h2 className="text-xl font-semibold text-white mb-2">Sync Your Fotoshare Event</h2>
                  <p className="text-zinc-400">
                    Contributing as <span className="font-medium text-white">{companyName}</span>
                    <span className="text-zinc-500"> • {getFinalRole()}</span>
                  </p>
                </div>

                {/* Instructions */}
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-6 mb-6">
                  <h3 className="font-semibold text-purple-300 mb-4">How to share your 360 Booth videos:</h3>
                  <ol className="space-y-3 text-sm text-purple-200">
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-purple-500/30 rounded-full flex items-center justify-center text-purple-300 font-medium">1</span>
                      <span>Log in to your fotoshare.co account</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-purple-500/30 rounded-full flex items-center justify-center text-purple-300 font-medium">2</span>
                      <span>Open your event and copy the public event URL</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-purple-500/30 rounded-full flex items-center justify-center text-purple-300 font-medium">3</span>
                      <span>Paste the URL below (e.g., https://fotoshare.co/e/abc123)</span>
                    </li>
                  </ol>
                </div>

                {/* Sync Form */}
                <form onSubmit={handleSubmitSync} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Fotoshare Event URL
                    </label>
                    <input
                      type="url"
                      value={fotoshareUrl}
                      onChange={(e) => setFotoshareUrl(e.target.value)}
                      placeholder="https://fotoshare.co/e/your-event-id"
                      className="w-full px-4 py-3 bg-zinc-900/50 border border-zinc-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white placeholder-zinc-500"
                      required
                    />
                  </div>
                  
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 bg-purple-500 text-white rounded-xl font-medium hover:bg-purple-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Syncing Videos...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-5 h-5" />
                        Sync 360° Videos
                      </>
                    )}
                  </button>
                </form>

                {/* Existing Videos */}
                {existingVideos.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-zinc-700">
                    <p className="text-sm text-zinc-400 mb-4">
                      <CheckCircle className="w-4 h-4 inline text-green-500 mr-1" />
                      {existingVideos.length} videos already synced
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {existingVideos.slice(0, 6).map((video, index) => (
                        <div key={index} className="aspect-video bg-zinc-700 rounded-lg overflow-hidden relative">
                          {video.thumbnail_url ? (
                            <img src={video.thumbnail_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Play className="w-6 h-6 text-zinc-500" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {existingVideos.length > 6 && (
                      <p className="text-xs text-zinc-500 mt-2 text-center">
                        +{existingVideos.length - 6} more videos
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* Success State */
              <div className="text-center py-8">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">Videos Synced Successfully!</h3>
                <p className="text-zinc-400 mb-6">
                  {submitResult.videos_synced} videos have been added to the gallery
                </p>
                
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-6">
                  <p className="text-green-300">
                    Your 360° videos will appear in the <strong>{galleryInfo?.section_name}</strong> section
                  </p>
                </div>
                
                <button
                  onClick={() => {
                    setSubmitResult(null);
                    setFotoshareUrl('');
                    fetchGalleryInfo();
                  }}
                  className="px-6 py-3 bg-zinc-700 text-white rounded-xl font-medium hover:bg-zinc-600 transition-colors"
                >
                  Sync More Videos
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-8 mt-12">
        <div className="max-w-screen-xl mx-auto px-6 text-center text-sm text-zinc-500">
          <p>© {new Date().getFullYear()} {brandConfig.brand_name || 'PhotoShare'}. 360° Glam Booth Portal.</p>
        </div>
      </footer>
    </div>
  );
};

export default FotoshareContributorUpload;
