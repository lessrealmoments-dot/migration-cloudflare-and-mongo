import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { 
  Cloud, Loader2, CheckCircle, ExternalLink, 
  Image as ImageIcon, Upload, AlertTriangle, Building2,
  Users, ChevronRight, Check, Camera, Video, Music,
  Scissors, Cake, Monitor, Plane, PartyPopper, Sparkles,
  Link as LinkIcon, FolderOpen, RefreshCw
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

const PcloudContributorUpload = () => {
  const { contributorLink } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hubLink = searchParams.get('hub');
  const brandConfig = useBrandConfig();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [galleryInfo, setGalleryInfo] = useState(null);
  const [existingPhotos, setExistingPhotos] = useState([]);
  const [submitResult, setSubmitResult] = useState(null);
  
  // Multi-step form
  const [step, setStep] = useState('company'); // 'company', 'role', 'confirm', 'sync'
  const [companyName, setCompanyName] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [useCustomRole, setUseCustomRole] = useState(false);
  const [pcloudViewingUrl, setPcloudViewingUrl] = useState('');
  
  // Autocomplete state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredContributors, setFilteredContributors] = useState([]);
  
  // Get the final role value
  const getFinalRole = () => {
    if (useCustomRole && customRole.trim()) {
      return customRole.trim();
    }
    return selectedRole || galleryInfo?.section_name || 'Contributor';
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
      setShowSuggestions(false);
      setFilteredContributors([]);
    }
  };
  
  // Select a contributor from suggestions
  const selectContributor = (contributor) => {
    setCompanyName(contributor.name);
    setSelectedRole(contributor.role);
    setShowSuggestions(false);
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
      
      if (response.data.section_type !== 'pcloud') {
        toast.error('This link is not for pCloud uploads');
        navigate('/');
        return;
      }
      
      setGalleryInfo(response.data);
      setExistingPhotos(response.data.existing_pcloud_photos || []);
      
      // If contributor info already exists, pre-fill and skip to sync
      if (response.data.existing_contributor_name) {
        setCompanyName(response.data.existing_contributor_name);
        if (response.data.existing_contributor_role) {
          setSelectedRole(response.data.existing_contributor_role);
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
  
  const handleOpenUploadLink = () => {
    if (galleryInfo?.pcloud_upload_link) {
      window.open(galleryInfo.pcloud_upload_link, '_blank');
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
      toast.success('Profile saved! Now sync your pCloud folder.');
      setStep('sync');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save profile');
    }
  };
  
  const handleSubmitSync = async (e) => {
    e.preventDefault();
    
    if (!pcloudViewingUrl.trim()) {
      toast.error('Please enter your pCloud viewing URL');
      return;
    }
    
    // Basic URL validation
    if (!pcloudViewingUrl.includes('pcloud.com') && !pcloudViewingUrl.includes('u.pcloud.link')) {
      toast.error('Please enter a valid pCloud link');
      return;
    }
    
    setSubmitting(true);
    
    try {
      const response = await axios.post(`${API}/contributor/${contributorLink}/pcloud`, {
        company_name: companyName.trim(),
        contributor_role: getFinalRole(),
        pcloud_viewing_url: pcloudViewingUrl.trim()
      });
      
      setSubmitResult(response.data);
      toast.success(`Successfully synced ${response.data.photos_synced} photos!`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to sync pCloud folder');
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
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 to-zinc-100">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {brandConfig.logo_url ? (
              <img src={brandConfig.logo_url} alt={brandConfig.brand_name} className="h-8" />
            ) : (
              <Cloud className="w-8 h-8 text-blue-600" />
            )}
            <span className="font-semibold text-zinc-800">{brandConfig.brand_name || 'PhotoShare'}</span>
          </div>
          {hubLink && (
            <button
              onClick={goBackToHub}
              className="text-sm text-zinc-600 hover:text-zinc-800 flex items-center gap-1"
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
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-full mb-4">
            <Cloud className="w-4 h-4" />
            <span className="text-sm font-medium">pCloud Integration</span>
          </div>
          <p className="text-sm text-zinc-500 uppercase tracking-wider mb-2">Contributing to</p>
          <h1 className="text-3xl font-light text-zinc-800 mb-1">{galleryInfo?.gallery_title}</h1>
          <p className="text-lg text-zinc-600">{galleryInfo?.section_name}</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {['company', 'role', 'confirm', 'sync'].map((s, i) => (
            <React.Fragment key={s}>
              <div 
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                  step === s 
                    ? 'bg-blue-600 text-white' 
                    : ['company', 'role', 'confirm', 'sync'].indexOf(step) > i 
                      ? 'bg-green-500 text-white' 
                      : 'bg-zinc-200 text-zinc-500'
                }`}
              >
                {['company', 'role', 'confirm', 'sync'].indexOf(step) > i ? (
                  <Check className="w-4 h-4" />
                ) : (
                  i + 1
                )}
              </div>
              {i < 3 && (
                <div className={`w-12 h-0.5 ${['company', 'role', 'confirm', 'sync'].indexOf(step) > i ? 'bg-green-500' : 'bg-zinc-200'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: Company Name */}
        {step === 'company' && (
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-8">
            <div className="text-center mb-8">
              <Building2 className="w-12 h-12 text-zinc-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-zinc-800 mb-2">What's your company name?</h2>
              <p className="text-zinc-600">This will appear in the gallery credits</p>
            </div>
            
            <form onSubmit={handleCompanySubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  Company / Business Name
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g., ABC Photography Studio"
                  className="w-full px-4 py-3 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-lg"
                  autoFocus
                />
              </div>
              
              <button
                type="submit"
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                Continue <ChevronRight className="w-5 h-5" />
              </button>
            </form>
          </div>
        )}

        {/* Step 2: Role Selection */}
        {step === 'role' && (
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-8">
            <div className="text-center mb-8">
              <Users className="w-12 h-12 text-zinc-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-zinc-800 mb-2">What's your role?</h2>
              <p className="text-zinc-600">Select your service category for the credits</p>
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
                              ? 'border-blue-600 bg-blue-50'
                              : 'border-zinc-200 hover:border-zinc-300'
                          }`}
                        >
                          <Icon className={`w-5 h-5 ${isSelected ? 'text-blue-600' : 'text-zinc-400'}`} />
                          <span className={`font-medium ${isSelected ? 'text-blue-900' : 'text-zinc-600'}`}>
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
                    useCustomRole ? 'border-blue-600 bg-blue-50' : 'border-zinc-200'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setUseCustomRole(true)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  >
                    <Sparkles className={`w-5 h-5 ${useCustomRole ? 'text-blue-600' : 'text-zinc-400'}`} />
                    <span className={`font-medium ${useCustomRole ? 'text-blue-900' : 'text-zinc-600'}`}>
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
                        placeholder="Enter your role (e.g., Florist)"
                        className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="flex-1 py-3 border-2 border-zinc-300 text-zinc-700 rounded-xl font-medium hover:bg-zinc-50 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleRoleSubmit}
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                Continue <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Confirmation */}
        {step === 'confirm' && (
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-8">
            <div className="text-center mb-8">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-zinc-800 mb-2">Confirm your details</h2>
              <p className="text-zinc-600">This is how you'll appear in the gallery credits</p>
            </div>
            
            {/* Preview Card */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl p-6 text-white mb-8">
              <p className="text-xs uppercase tracking-wider text-blue-200 mb-1">Credit Preview</p>
              <div className="border-l-2 border-white/30 pl-4 mt-4">
                <p className="text-lg font-semibold">{companyName}</p>
                <p className="text-sm text-blue-200">{getFinalRole()}</p>
              </div>
            </div>
            
            <div className="space-y-4 mb-8">
              <div className="flex justify-between items-center py-3 border-b border-zinc-100">
                <span className="text-zinc-500">Company Name</span>
                <span className="font-medium text-zinc-800">{companyName}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-zinc-100">
                <span className="text-zinc-500">Role</span>
                <span className="font-medium text-zinc-800">{getFinalRole()}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-zinc-100">
                <span className="text-zinc-500">Section</span>
                <span className="font-medium text-zinc-800">{galleryInfo?.section_name}</span>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('role')}
                className="flex-1 py-3 border-2 border-zinc-300 text-zinc-700 rounded-xl font-medium hover:bg-zinc-50 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                Confirm & Continue <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 4: pCloud Sync */}
        {step === 'sync' && (
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-8">
            {!submitResult ? (
              <>
                <div className="text-center mb-6">
                  <Cloud className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                  <h2 className="text-xl font-semibold text-zinc-800 mb-2">Sync Your pCloud Folder</h2>
                </div>

                {/* Edit Profile Banner */}
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 mb-6 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-zinc-800">{companyName}</p>
                      <p className="text-sm text-zinc-500">{getFinalRole()}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setStep('company')}
                    className="px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-800 hover:bg-zinc-100 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    Edit
                  </button>
                </div>

                {/* Instructions */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
                  <h3 className="font-semibold text-blue-900 mb-4">How to share your pCloud folder:</h3>
                  <ol className="space-y-3 text-sm text-blue-800">
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center text-blue-900 font-medium">1</span>
                      <span>Upload your photos to a folder in pCloud</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center text-blue-900 font-medium">2</span>
                      <span>Right-click the folder and select "Get Link" → "Public folder"</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center text-blue-900 font-medium">3</span>
                      <span>Copy the viewing link and paste it below</span>
                    </li>
                  </ol>
                </div>

                {/* Upload Link Button (if provided by gallery owner) */}
                {galleryInfo?.pcloud_upload_link && (
                  <div className="mb-6">
                    <button
                      onClick={handleOpenUploadLink}
                      className="w-full py-3 bg-zinc-100 text-zinc-700 rounded-xl font-medium hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
                    >
                      <ExternalLink className="w-5 h-5" />
                      Open pCloud Upload Folder
                    </button>
                    <p className="text-xs text-zinc-500 text-center mt-2">
                      The gallery owner has provided an upload folder for you
                    </p>
                  </div>
                )}

                {/* Sync Form */}
                <form onSubmit={handleSubmitSync} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">
                      pCloud Folder Link (Public/Viewing URL)
                    </label>
                    <input
                      type="url"
                      value={pcloudViewingUrl}
                      onChange={(e) => setPcloudViewingUrl(e.target.value)}
                      placeholder="https://u.pcloud.link/publink/show?code=..."
                      className="w-full px-4 py-3 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                  
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Syncing Photos...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-5 h-5" />
                        Sync Photos from pCloud
                      </>
                    )}
                  </button>
                </form>

                {/* Existing Photos */}
                {existingPhotos.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-zinc-200">
                    <p className="text-sm text-zinc-600 mb-4">
                      <CheckCircle className="w-4 h-4 inline text-green-500 mr-1" />
                      {existingPhotos.length} photos already synced
                    </p>
                  </div>
                )}
              </>
            ) : (
              /* Success State */
              <div className="text-center py-8">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-zinc-800 mb-2">Photos Synced Successfully!</h3>
                <p className="text-zinc-600 mb-6">
                  {submitResult.photos_synced} photos have been added to the gallery
                </p>
                
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
                  <p className="text-green-800">
                    Your photos will appear in the <strong>{galleryInfo?.section_name}</strong> section
                  </p>
                </div>
                
                <button
                  onClick={() => {
                    setSubmitResult(null);
                    setPcloudViewingUrl('');
                    fetchGalleryInfo();
                  }}
                  className="px-6 py-3 bg-zinc-100 text-zinc-700 rounded-xl font-medium hover:bg-zinc-200 transition-colors"
                >
                  Sync More Photos
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-200 py-8 mt-12 bg-white">
        <div className="max-w-screen-xl mx-auto px-6 text-center text-sm text-zinc-500">
          <p>© {new Date().getFullYear()} {brandConfig.brand_name || 'PhotoShare'}. pCloud Contributor Portal.</p>
        </div>
      </footer>
    </div>
  );
};

export default PcloudContributorUpload;
