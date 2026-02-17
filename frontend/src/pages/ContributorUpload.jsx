import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import { Upload, CheckCircle, AlertCircle, Loader2, Camera, Building2, ChevronRight, Wifi, Zap, Sparkles, Users, Music, Scissors, Cake, PartyPopper, Plane, Monitor, Video, Check } from 'lucide-react';
import useBrandConfig from '../hooks/useBrandConfig';
import { useSmartUploader } from '../hooks/useSmartUploader';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

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

// Format speed for display
const formatSpeed = (bytesPerSecond) => {
  if (!bytesPerSecond || bytesPerSecond === 0) return '-- Mbps';
  const mbps = (bytesPerSecond * 8) / (1024 * 1024);
  return `${mbps.toFixed(1)} Mbps`;
};

const ContributorUpload = () => {
  const { contributorLink } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hubLink = searchParams.get('hub');
  const brandConfig = useBrandConfig();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  
  // Password protection state
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [sectionPassword, setSectionPassword] = useState('');
  const [passwordVerified, setPasswordVerified] = useState(false);
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  
  // Multi-step form flow
  const [step, setStep] = useState('password'); // 'password', 'company', 'role', 'confirm', 'upload'
  const [companyName, setCompanyName] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [useCustomRole, setUseCustomRole] = useState(false);
  
  // Autocomplete state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredContributors, setFilteredContributors] = useState([]);
  
  // Upload state
  const [uploadedPhotos, setUploadedPhotos] = useState([]);
  
  // Get the final role value
  const getFinalRole = () => {
    if (useCustomRole && customRole.trim()) {
      return customRole.trim();
    }
    return selectedRole || info?.section_name || 'Contributor';
  };
  
  // Filter contributors for autocomplete
  const handleCompanyNameChange = (value) => {
    setCompanyName(value);
    
    if (value.trim() && info?.existing_contributors?.length > 0) {
      const filtered = info.existing_contributors.filter(c => 
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
  
  // Smart uploader hook
  const {
    uploading,
    progress: uploadProgress,
    stats: uploadStats,
    startUpload,
    cancelUpload,
    clearProgress,
  } = useSmartUploader({
    uploadEndpoint: `${API}/contributor/${contributorLink}/upload`,
    formDataBuilder: (file) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('company_name', companyName);
      return formData;
    },
    onFileSuccess: (file, data) => {
      setUploadedPhotos(prev => [...prev, {
        id: data.id,
        url: data.url,
        filename: file.name
      }]);
    },
    onFileError: (file, error, errorMsg) => {
      toast.error(`${file.name}: ${errorMsg}`);
    },
    onAllComplete: (results, completed, failed) => {
      if (completed > 0) {
        toast.success(`${completed} photo(s) uploaded successfully!`);
      }
      setTimeout(() => clearProgress(), 3000);
    },
  });
  
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
    const fetchInfo = async () => {
      try {
        const response = await axios.get(`${API}/contributor/${contributorLink}`);
        
        // If this is a video section, redirect to videographer upload page
        if (response.data.section_type === 'video') {
          navigate(`/v/${contributorLink}`, { replace: true });
          return;
        }
        
        setInfo(response.data);
        
        // If contributor info already exists, pre-fill and skip to upload
        if (response.data.existing_contributor_name) {
          setCompanyName(response.data.existing_contributor_name);
          if (response.data.existing_contributor_role) {
            setSelectedRole(response.data.existing_contributor_role);
          }
          setStep('upload');
        }
      } catch (err) {
        setError(err.response?.data?.detail || 'Invalid or expired contributor link');
      } finally {
        setLoading(false);
      }
    };
    
    fetchInfo();
  }, [contributorLink, navigate]);

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
      toast.success('Profile saved! You can now upload your photos.');
      setStep('upload');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save profile');
    }
  };

  // File upload handler
  const onDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return;

    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    const validFiles = [];
    const invalidFiles = [];

    for (const file of acceptedFiles) {
      if (file.size > MAX_FILE_SIZE) {
        invalidFiles.push({ name: file.name, reason: 'File too large (max 50MB)' });
      } else if (!file.type.startsWith('image/')) {
        invalidFiles.push({ name: file.name, reason: 'Not an image file' });
      } else {
        validFiles.push(file);
      }
    }

    if (invalidFiles.length > 0) {
      invalidFiles.forEach(f => toast.error(`${f.name}: ${f.reason}`));
    }

    if (validFiles.length === 0) return;

    toast.info(`Starting upload of ${validFiles.length} photos...`, { duration: 2000 });
    await startUpload(validFiles);
  }, [startUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp', '.heic', '.heif']
    },
    disabled: uploading
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-zinc-800 mb-2">Link Unavailable</h1>
          <p className="text-zinc-600">{error}</p>
        </div>
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
              <Camera className="w-8 h-8 text-zinc-700" />
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
          <p className="text-sm text-zinc-500 uppercase tracking-wider mb-2">Contributing to</p>
          <h1 className="text-3xl font-light text-zinc-800 mb-1">{info?.gallery_title}</h1>
          <p className="text-lg text-zinc-600">{info?.section_name}</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {['company', 'role', 'confirm', 'upload'].map((s, i) => (
            <React.Fragment key={s}>
              <div 
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                  step === s 
                    ? 'bg-zinc-800 text-white' 
                    : ['company', 'role', 'confirm', 'upload'].indexOf(step) > i 
                      ? 'bg-green-500 text-white' 
                      : 'bg-zinc-200 text-zinc-500'
                }`}
              >
                {['company', 'role', 'confirm', 'upload'].indexOf(step) > i ? (
                  <Check className="w-4 h-4" />
                ) : (
                  i + 1
                )}
              </div>
              {i < 3 && (
                <div className={`w-12 h-0.5 ${['company', 'role', 'confirm', 'upload'].indexOf(step) > i ? 'bg-green-500' : 'bg-zinc-200'}`} />
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
              <div className="relative">
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  Company / Business Name
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => handleCompanyNameChange(e.target.value)}
                  onFocus={() => {
                    if (companyName.trim() && filteredContributors.length > 0) {
                      setShowSuggestions(true);
                    }
                  }}
                  onBlur={() => {
                    // Delay hiding to allow click on suggestion
                    setTimeout(() => setShowSuggestions(false), 200);
                  }}
                  placeholder="e.g., ABC Photography Studio"
                  className="w-full px-4 py-3 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-zinc-500 focus:border-transparent transition-all text-lg"
                  autoFocus
                  autoComplete="off"
                />
                
                {/* Autocomplete Suggestions */}
                {showSuggestions && filteredContributors.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border border-zinc-200 rounded-xl shadow-lg overflow-hidden">
                    <div className="px-3 py-2 text-xs font-medium text-zinc-500 bg-zinc-50 border-b border-zinc-100">
                      Existing contributors in this gallery
                    </div>
                    {filteredContributors.map((contributor, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => selectContributor(contributor)}
                        className="w-full px-4 py-3 text-left hover:bg-zinc-50 transition-colors flex items-center justify-between group"
                      >
                        <div>
                          <p className="font-medium text-zinc-800">{contributor.name}</p>
                          <p className="text-sm text-zinc-500">{contributor.role}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-600" />
                      </button>
                    ))}
                  </div>
                )}
                
                {/* Show hint if there are existing contributors */}
                {info?.existing_contributors?.length > 0 && !companyName && (
                  <p className="text-xs text-zinc-500 mt-2">
                    💡 Start typing to see existing contributors in this gallery
                  </p>
                )}
              </div>
              
              <button
                type="submit"
                className="w-full py-3 bg-zinc-800 text-white rounded-xl font-medium hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2"
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
                              ? 'border-zinc-800 bg-zinc-50'
                              : 'border-zinc-200 hover:border-zinc-300'
                          }`}
                        >
                          <Icon className={`w-5 h-5 ${isSelected ? 'text-zinc-800' : 'text-zinc-400'}`} />
                          <span className={`font-medium ${isSelected ? 'text-zinc-800' : 'text-zinc-600'}`}>
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
                    useCustomRole ? 'border-zinc-800 bg-zinc-50' : 'border-zinc-200'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setUseCustomRole(true)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  >
                    <Sparkles className={`w-5 h-5 ${useCustomRole ? 'text-zinc-800' : 'text-zinc-400'}`} />
                    <span className={`font-medium ${useCustomRole ? 'text-zinc-800' : 'text-zinc-600'}`}>
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
                        className="w-full px-4 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-500 focus:border-transparent"
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
                className="flex-1 py-3 bg-zinc-800 text-white rounded-xl font-medium hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2"
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
            <div className="bg-gradient-to-br from-zinc-800 to-zinc-900 rounded-xl p-6 text-white mb-8">
              <p className="text-xs uppercase tracking-wider text-zinc-400 mb-1">Credit Preview</p>
              <div className="border-l-2 border-white/30 pl-4 mt-4">
                <p className="text-lg font-semibold">{companyName}</p>
                <p className="text-sm text-zinc-400">{getFinalRole()}</p>
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
                <span className="font-medium text-zinc-800">{info?.section_name}</span>
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
                className="flex-1 py-3 bg-zinc-800 text-white rounded-xl font-medium hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2"
              >
                Confirm & Upload <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Upload */}
        {step === 'upload' && (
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-8">
            <div className="text-center mb-6">
              <h2 className="text-xl font-semibold text-zinc-800 mb-1">Upload Your Photos</h2>
              <p className="text-zinc-600">
                Contributing as <span className="font-medium">{companyName}</span>
                {selectedRole && <span className="text-zinc-400"> • {getFinalRole()}</span>}
              </p>
            </div>

            {/* Edit Profile Banner */}
            <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-zinc-200 rounded-full flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-zinc-600" />
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
            
            {/* Dropzone */}
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
                isDragActive
                  ? 'border-zinc-500 bg-zinc-50'
                  : uploading
                    ? 'border-zinc-200 bg-zinc-50 cursor-not-allowed'
                    : 'border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50'
              }`}
            >
              <input {...getInputProps()} />
              {uploading ? (
                <div className="space-y-4">
                  <Loader2 className="w-12 h-12 mx-auto text-zinc-400 animate-spin" />
                  <p className="text-zinc-600">Uploading photos...</p>
                </div>
              ) : isDragActive ? (
                <div className="space-y-4">
                  <Upload className="w-12 h-12 mx-auto text-zinc-500" />
                  <p className="text-zinc-600">Drop your photos here</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <Upload className="w-12 h-12 mx-auto text-zinc-400" />
                  <div>
                    <p className="text-zinc-700 font-medium">Drag & drop photos here</p>
                    <p className="text-zinc-500 text-sm mt-1">or click to browse</p>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Supports JPG, PNG, GIF, WebP, HEIC • Max 50MB per file
                  </p>
                </div>
              )}
            </div>

            {/* Upload Progress with Speed Indicator */}
            {uploadProgress.length > 0 && (
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-zinc-700">
                    Upload Progress ({uploadStats.completed + uploadStats.failed}/{uploadStats.totalFiles})
                  </h4>
                  <div className="flex items-center gap-3 text-xs text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Wifi className="w-3.5 h-3.5" />
                      {formatSpeed(uploadStats.currentSpeed)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5" />
                      {uploadStats.concurrency} concurrent
                    </span>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {uploadProgress.map((file, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-zinc-50 rounded-lg">
                      {file.status === 'pending' && (
                        <div className="w-5 h-5 rounded-full border-2 border-zinc-300" />
                      )}
                      {(file.status === 'uploading' || file.status === 'retrying') && (
                        <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
                      )}
                      {file.status === 'success' && (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      )}
                      {file.status === 'error' && (
                        <AlertCircle className="w-5 h-5 text-red-500" />
                      )}
                      <span className="flex-1 text-sm truncate">{file.name}</span>
                      {(file.status === 'uploading' || file.status === 'retrying') && (
                        <span className="text-sm text-zinc-500">{file.progress}%</span>
                      )}
                      {file.status === 'retrying' && (
                        <span className="text-xs text-amber-500">Retrying...</span>
                      )}
                      {file.status === 'error' && (
                        <span className="text-sm text-red-500">{file.errorMsg || file.error}</span>
                      )}
                    </div>
                  ))}
                </div>
                {uploading && (
                  <button
                    onClick={cancelUpload}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Cancel uploads
                  </button>
                )}
              </div>
            )}

            {/* Uploaded Photos Count */}
            {uploadedPhotos.length > 0 && (
              <div className="mt-6 p-4 bg-green-50 rounded-xl border border-green-200">
                <p className="text-green-800 font-medium flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  {uploadedPhotos.length} photo{uploadedPhotos.length !== 1 ? 's' : ''} uploaded successfully
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-200 py-8 mt-12 bg-white">
        <div className="max-w-screen-xl mx-auto px-6 text-center text-sm text-zinc-500">
          <p>© {new Date().getFullYear()} {brandConfig.brand_name || 'PhotoShare'}. Contributor Upload Portal.</p>
        </div>
      </footer>
    </div>
  );
};

export default ContributorUpload;
