import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { 
  Video, Trash2, Play, Star, Plus, 
  Loader2, Film, Building2, Users, ChevronRight,
  CheckCircle, Camera, Sparkles, Check
} from 'lucide-react';
import useBrandConfig from '../hooks/useBrandConfig';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

// Common video tags
const SUGGESTED_TAGS = [
  'Same Day Edit (SDE)',
  'Preparation',
  'Ceremony', 
  'Reception',
  'Highlights',
  'Full Film',
  'Trailer'
];

// Predefined videographer roles
const VIDEOGRAPHER_ROLES = {
  'Video Production': [
    { value: 'Videographer', icon: Video },
    { value: 'Cinematographer', icon: Film },
    { value: 'Director of Photography', icon: Camera },
    { value: 'Video Editor', icon: Film },
  ],
  'Specialized': [
    { value: 'Same Day Edit (SDE) Specialist', icon: Sparkles },
    { value: 'Drone Operator', icon: Video },
    { value: 'Live Streaming Operator', icon: Video },
    { value: 'Documentary Filmmaker', icon: Film },
  ],
};

const VideographerUpload = () => {
  const { contributorLink } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hubLink = searchParams.get('hub');
  const brandConfig = useBrandConfig();
  
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [galleryInfo, setGalleryInfo] = useState(null);
  const [videos, setVideos] = useState([]);
  
  // Multi-step flow
  const [step, setStep] = useState('company'); // 'company', 'role', 'confirm', 'upload'
  const [companyName, setCompanyName] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [useCustomRole, setUseCustomRole] = useState(false);
  
  // Autocomplete state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredContributors, setFilteredContributors] = useState([]);
  
  // Video form state
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [tag, setTag] = useState('');
  const [customTag, setCustomTag] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [previewVideoId, setPreviewVideoId] = useState(null);
  
  // Get the final role value
  const getFinalRole = () => {
    if (useCustomRole && customRole.trim()) {
      return customRole.trim();
    }
    return selectedRole || 'Videographer';
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
      
      if (response.data.section_type !== 'video') {
        toast.error('This link is for photo uploads, not videos');
        navigate('/');
        return;
      }
      
      setGalleryInfo(response.data);
      setVideos(response.data.existing_videos || []);
      
      // If contributor info already exists, pre-fill and skip to upload
      if (response.data.existing_contributor_name) {
        setCompanyName(response.data.existing_contributor_name);
        if (response.data.existing_contributor_role) {
          setSelectedRole(response.data.existing_contributor_role);
        }
        setStep('upload');
      }
    } catch (error) {
      toast.error('Invalid or expired upload link');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };
  
  const extractVideoId = (url) => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };
  
  const handleUrlChange = (url) => {
    setYoutubeUrl(url);
    const videoId = extractVideoId(url);
    setPreviewVideoId(videoId);
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
      toast.success('Profile saved! You can now add your videos.');
      setStep('upload');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save profile');
    }
  };
  
  const handleVideoSubmit = async (e) => {
    e.preventDefault();
    
    if (!youtubeUrl.trim()) {
      toast.error('Please enter a YouTube URL');
      return;
    }
    
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      toast.error('Invalid YouTube URL. Please enter a valid YouTube video link.');
      return;
    }
    
    const finalTag = tag === 'custom' ? customTag.trim() : tag;
    if (!finalTag) {
      toast.error('Please select or enter a video tag');
      return;
    }
    
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('youtube_url', youtubeUrl);
      formData.append('tag', finalTag);
      formData.append('company_name', companyName);
      formData.append('title', title || '');
      formData.append('description', description || '');
      
      const response = await axios.post(
        `${API}/contributor/${contributorLink}/video`,
        formData
      );
      
      toast.success('Video added successfully!');
      
      // Add to local videos list
      setVideos([...videos, {
        id: response.data.video.id,
        tag: finalTag,
        title: title || finalTag,
        youtube_thumbnail_url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        is_featured: response.data.video.is_featured
      }]);
      
      // Reset form
      setYoutubeUrl('');
      setTag('');
      setCustomTag('');
      setTitle('');
      setDescription('');
      setPreviewVideoId(null);
      
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add video');
    } finally {
      setUploading(false);
    }
  };
  
  const handleDeleteVideo = async (videoId) => {
    if (!window.confirm('Are you sure you want to remove this video?')) return;
    
    try {
      await axios.delete(`${API}/contributor/${contributorLink}/video/${videoId}`);
      setVideos(videos.filter(v => v.id !== videoId));
      toast.success('Video removed');
    } catch (error) {
      toast.error('Failed to remove video');
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
              <Film className="w-8 h-8 text-zinc-700" />
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
          <p className="text-sm text-zinc-500 uppercase tracking-wider mb-2">Video Contribution for</p>
          <h1 className="text-3xl font-light text-zinc-800 mb-1">{galleryInfo?.gallery_title}</h1>
          <p className="text-lg text-zinc-600">{galleryInfo?.section_name}</p>
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
                    setTimeout(() => setShowSuggestions(false), 200);
                  }}
                  placeholder="e.g., Juan Films"
                  className="w-full px-4 py-3 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-zinc-500 focus:border-transparent transition-all text-lg"
                  autoFocus
                  autoComplete="off"
                  data-testid="videographer-company-input"
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
                
                {galleryInfo?.existing_contributors?.length > 0 && !companyName && (
                  <p className="text-xs text-zinc-500 mt-2">
                    💡 Start typing to see existing contributors in this gallery
                  </p>
                )}
              </div>
              
              <button
                type="submit"
                className="w-full py-3 bg-zinc-800 text-white rounded-xl font-medium hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2"
                data-testid="company-continue-btn"
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
              <p className="text-zinc-600">Select your video production category</p>
            </div>
            
            <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2">
              {Object.entries(VIDEOGRAPHER_ROLES).map(([category, roles]) => (
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
                        placeholder="Enter your role (e.g., Highlight Editor)"
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
                data-testid="role-continue-btn"
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
                className="flex-1 py-3 bg-zinc-800 text-white rounded-xl font-medium hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2"
                data-testid="confirm-and-upload-btn"
              >
                Confirm & Add Videos <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Video Upload */}
        {step === 'upload' && (
          <div className="space-y-8">
            {/* Edit Profile Banner */}
            <div className="bg-white rounded-xl border border-zinc-200 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-zinc-100 rounded-full flex items-center justify-center">
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

            <div className="grid md:grid-cols-2 gap-8">
              {/* Upload Form */}
              <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
                <h2 className="text-lg font-semibold text-zinc-800 mb-6 flex items-center gap-2">
                  <Plus className="w-5 h-5" />
                  Add Video
                </h2>
                
                <form onSubmit={handleVideoSubmit} className="space-y-5">
                  {/* YouTube URL */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">
                      YouTube Video URL *
                    </label>
                    <input
                      type="url"
                      value={youtubeUrl}
                      onChange={(e) => handleUrlChange(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      className="w-full px-4 py-3 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-zinc-500 focus:border-transparent"
                      data-testid="youtube-url-input"
                    />
                    
                    {/* Preview */}
                    {previewVideoId && (
                      <div className="mt-3 rounded-xl overflow-hidden aspect-video bg-zinc-100 relative">
                        <img 
                          src={`https://img.youtube.com/vi/${previewVideoId}/maxresdefault.jpg`}
                          alt="Video thumbnail"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.src = `https://img.youtube.com/vi/${previewVideoId}/hqdefault.jpg`;
                          }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center">
                            <Play className="w-8 h-8 text-white ml-1" fill="white" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Video Tag */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">
                      Video Type / Tag *
                    </label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {SUGGESTED_TAGS.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => { setTag(t); setCustomTag(''); }}
                          className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                            tag === t
                              ? 'bg-zinc-800 text-white'
                              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setTag('custom')}
                        className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                          tag === 'custom'
                            ? 'bg-zinc-800 text-white'
                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                        }`}
                      >
                        + Custom
                      </button>
                    </div>
                    
                    {tag === 'custom' && (
                      <input
                        type="text"
                        value={customTag}
                        onChange={(e) => setCustomTag(e.target.value)}
                        placeholder="Enter custom tag..."
                        className="w-full px-4 py-3 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-zinc-500 focus:border-transparent"
                      />
                    )}
                  </div>
                  
                  {/* Title (optional) */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">
                      Video Title <span className="text-zinc-400">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g., Our Perfect Day"
                      className="w-full px-4 py-3 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-zinc-500 focus:border-transparent"
                      data-testid="video-title-input"
                    />
                  </div>
                  
                  {/* Description (optional) */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">
                      Description <span className="text-zinc-400">(optional)</span>
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Short description of the video..."
                      rows={3}
                      className="w-full px-4 py-3 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-zinc-500 focus:border-transparent resize-none"
                      data-testid="video-description-input"
                    />
                  </div>
                  
                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={uploading}
                    className="w-full py-4 bg-zinc-800 text-white font-semibold rounded-xl hover:bg-zinc-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    data-testid="add-video-button"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Adding Video...
                      </>
                    ) : (
                      <>
                        <Plus className="w-5 h-5" />
                        Add Video
                      </>
                    )}
                  </button>
                </form>
              </div>
              
              {/* Uploaded Videos */}
              <div>
                <h2 className="text-lg font-semibold text-zinc-800 mb-4 flex items-center gap-2">
                  <Video className="w-5 h-5" />
                  Your Videos ({videos.length})
                </h2>
                
                {videos.length === 0 ? (
                  <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-8 text-center">
                    <Film className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
                    <p className="text-zinc-500">No videos uploaded yet</p>
                    <p className="text-zinc-400 text-sm mt-1">Add your first video using the form</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {videos.map((video) => (
                      <div 
                        key={video.id}
                        className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden group"
                      >
                        <div className="flex">
                          {/* Thumbnail */}
                          <div className="w-32 h-20 relative flex-shrink-0">
                            <img 
                              src={video.thumbnail_url || video.youtube_thumbnail_url}
                              alt={video.title || video.tag}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.target.src = 'https://via.placeholder.com/320x180?text=Video';
                              }}
                            />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <Play className="w-8 h-8 text-white" fill="white" />
                            </div>
                            {video.is_featured && (
                              <div className="absolute top-1 left-1 bg-yellow-500 text-black text-xs px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                                <Star className="w-3 h-3" fill="currentColor" />
                                Featured
                              </div>
                            )}
                          </div>
                          
                          {/* Info */}
                          <div className="flex-1 p-3 flex flex-col justify-between">
                            <div>
                              <span className="inline-block px-2 py-0.5 bg-zinc-100 text-zinc-600 text-xs rounded-full mb-1">
                                {video.tag}
                              </span>
                              <h3 className="text-zinc-800 text-sm font-medium truncate">
                                {video.title || video.tag}
                              </h3>
                            </div>
                            
                            <button
                              onClick={() => handleDeleteVideo(video.id)}
                              className="self-end p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Tips */}
                <div className="mt-6 bg-zinc-50 border border-zinc-200 rounded-xl p-4">
                  <h3 className="text-zinc-700 font-medium text-sm mb-2">Tips for best results:</h3>
                  <ul className="text-zinc-500 text-sm space-y-1">
                    <li>• Use unlisted or public YouTube videos</li>
                    <li>• Label videos with appropriate tags (SDE, Ceremony, etc.)</li>
                    <li>• The first video added will be featured prominently</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-200 py-8 mt-12 bg-white">
        <div className="max-w-screen-xl mx-auto px-6 text-center text-sm text-zinc-500">
          <p>© {new Date().getFullYear()} {brandConfig.brand_name || 'PhotoShare'}. Video Contributor Portal.</p>
        </div>
      </footer>
    </div>
  );
};

export default VideographerUpload;
