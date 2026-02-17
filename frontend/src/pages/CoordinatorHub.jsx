import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Camera, Video, Film, HardDrive, Cloud, 
  CheckCircle, Clock, RefreshCw, Copy, 
  ExternalLink, AlertCircle, Calendar,
  User, ChevronDown, ChevronUp, Images,
  Plus, Lock, Trash2, Edit2, Eye, GripVertical,
  Key, X, Shield
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Section type icons and colors
const sectionConfig = {
  photo: { icon: Camera, color: 'bg-blue-500', label: 'Photos' },
  video: { icon: Video, color: 'bg-red-500', label: 'Video' },
  fotoshare: { icon: Film, color: 'bg-pink-500', label: '360 Booth' },
  fotoshare_photobooth: { icon: Images, color: 'bg-violet-500', label: 'Photobooth' },
  gdrive: { icon: HardDrive, color: 'bg-green-500', label: 'Google Drive' },
  pcloud: { icon: Cloud, color: 'bg-cyan-500', label: 'pCloud' }
};

// Recommended section names by type
const recommendedNames = {
  photo: ['Photos by Photographer', 'Same Day Edit', 'Highlights', 'Coverage'],
  video: ['Video Highlights', 'Same Day Edit Video', 'Full Coverage'],
  fotoshare: ['360 Booth', '360 Video', 'Spin Booth'],
  fotoshare_photobooth: ['Photobooth', 'Photo Corner', 'Selfie Station'],
  gdrive: ['Google Drive Photos', 'Raw Files', 'Full Album'],
  pcloud: ['pCloud Storage', 'Additional Photos', 'Extras']
};

// Status badges
const StatusBadge = ({ status, count }) => {
  const statusConfig = {
    pending: { 
      icon: Clock, 
      bg: 'bg-amber-100', 
      text: 'text-amber-700', 
      label: 'Pending' 
    },
    submitted: { 
      icon: CheckCircle, 
      bg: 'bg-green-100', 
      text: 'text-green-700', 
      label: 'Submitted' 
    },
    synced: { 
      icon: RefreshCw, 
      bg: 'bg-blue-100', 
      text: 'text-blue-700', 
      label: 'Synced' 
    }
  };
  
  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${config.bg} ${config.text}`}>
      <Icon className="w-4 h-4" />
      {config.label}
      {count > 0 && <span className="ml-1">({count})</span>}
    </span>
  );
};

// Old SectionCard component removed - now using inline version below

const CoordinatorHub = () => {
  const { hubLink } = useParams();
  const [hubData, setHubData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Access control state
  const [accessType, setAccessType] = useState(null); // 'coordinator' | 'contributor' | null
  const [showAccessModal, setShowAccessModal] = useState(true);
  const [coordinatorPassword, setCoordinatorPassword] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  
  // Section creation state
  const [showCreateSection, setShowCreateSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionType, setNewSectionType] = useState('photo');
  const [newSectionPassword, setNewSectionPassword] = useState('');
  const [newSectionPasswordConfirm, setNewSectionPasswordConfirm] = useState('');
  const [isCreatingSection, setIsCreatingSection] = useState(false);
  
  // Section management state
  const [sectionToDelete, setSectionToDelete] = useState(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [sectionToEdit, setSectionToEdit] = useState(null);
  const [editPassword, setEditPassword] = useState('');
  const [editName, setEditName] = useState('');
  
  // Section unlock state (for contributors)
  const [unlockedSections, setUnlockedSections] = useState({});
  const [sectionToUnlock, setSectionToUnlock] = useState(null);
  const [unlockPassword, setUnlockPassword] = useState('');
  
  const baseUrl = window.location.origin;
  
  useEffect(() => {
    fetchHubData();
  }, [hubLink]);
  
  const fetchHubData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/coordinator-hub/${hubLink}`);
      setHubData(response.data);
      
      // If no coordinator password is set, don't show access modal
      if (!response.data.has_coordinator_password) {
        setAccessType('contributor');
        setShowAccessModal(false);
      }
    } catch (err) {
      console.error('Failed to load coordinator hub:', err);
      setError(err.response?.data?.detail || 'Failed to load coordinator hub');
    } finally {
      setLoading(false);
    }
  };
  
  const handleAccessSubmit = async (type) => {
    if (type === 'coordinator') {
      if (!coordinatorPassword) {
        toast.error('Please enter the coordinator password');
        return;
      }
      setIsAuthenticating(true);
      try {
        await axios.post(`${API}/coordinator-hub/${hubLink}/auth`, {
          access_type: 'coordinator',
          password: coordinatorPassword
        });
        setAccessType('coordinator');
        setShowAccessModal(false);
        toast.success('Coordinator access granted');
      } catch (err) {
        toast.error(err.response?.data?.detail || 'Invalid password');
      } finally {
        setIsAuthenticating(false);
      }
    } else {
      setAccessType('contributor');
      setShowAccessModal(false);
    }
  };
  
  const handleCreateSection = async () => {
    if (!newSectionName.trim()) {
      toast.error('Please enter a section name');
      return;
    }
    if (!newSectionPassword || newSectionPassword.length < 4) {
      toast.error('Password must be at least 4 characters');
      return;
    }
    if (newSectionPassword !== newSectionPasswordConfirm) {
      toast.error('Passwords do not match');
      return;
    }
    
    setIsCreatingSection(true);
    try {
      const response = await axios.post(`${API}/coordinator-hub/${hubLink}/sections`, {
        name: newSectionName.trim(),
        type: newSectionType,
        password: newSectionPassword
      });
      toast.success('Section created! Your contributor link is ready.');
      setShowCreateSection(false);
      setNewSectionName('');
      setNewSectionPassword('');
      setNewSectionPasswordConfirm('');
      
      // Auto-unlock the section we just created
      setUnlockedSections(prev => ({
        ...prev,
        [response.data.section_id]: response.data.contributor_link
      }));
      
      fetchHubData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create section');
    } finally {
      setIsCreatingSection(false);
    }
  };
  
  const handleDeleteSection = async () => {
    if (!sectionToDelete) return;
    
    try {
      await axios.delete(`${API}/coordinator-hub/${hubLink}/sections/${sectionToDelete.id}`, {
        data: {
          access_type: accessType,
          password: accessType === 'coordinator' ? coordinatorPassword : deletePassword,
          confirm: true
        }
      });
      toast.success('Section deleted');
      setSectionToDelete(null);
      setDeletePassword('');
      fetchHubData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete section');
    }
  };
  
  const handleEditSection = async () => {
    if (!sectionToEdit || !editName.trim()) return;
    
    try {
      await axios.put(`${API}/coordinator-hub/${hubLink}/sections/${sectionToEdit.id}`, {
        access_type: accessType,
        password: accessType === 'coordinator' ? coordinatorPassword : editPassword,
        name: editName.trim()
      });
      toast.success('Section updated');
      setSectionToEdit(null);
      setEditName('');
      setEditPassword('');
      fetchHubData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update section');
    }
  };
  
  const handleUnlockSection = async () => {
    if (!sectionToUnlock) return;
    
    try {
      const response = await axios.post(`${API}/coordinator-hub/${hubLink}/sections/${sectionToUnlock.id}/verify-password`, {
        password: unlockPassword
      });
      if (response.data.verified) {
        setUnlockedSections(prev => ({
          ...prev,
          [sectionToUnlock.id]: response.data.contributor_link
        }));
        toast.success('Section unlocked!');
        setSectionToUnlock(null);
        setUnlockPassword('');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Invalid password');
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-zinc-400 animate-spin mx-auto mb-4" />
          <p className="text-zinc-500">Loading coordinator hub...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-zinc-800 mb-2">Link Not Found</h2>
          <p className="text-zinc-500">{error}</p>
        </div>
      </div>
    );
  }
  
  const formatEventDate = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };
  
  // Separate sections by status
  const pendingSections = hubData.sections.filter(s => s.status === 'pending');
  const submittedSections = hubData.sections.filter(s => s.status !== 'pending');
  
  // Section Card Component (inline for access to state)
  const SectionCard = ({ section }) => {
    const [showQR, setShowQR] = useState(false);
    const config = sectionConfig[section.type] || sectionConfig.photo;
    const Icon = config.icon;
    
    const isUnlocked = unlockedSections[section.id] || accessType === 'coordinator' || !section.section_password;
    const contributorLink = isUnlocked 
      ? (unlockedSections[section.id] || section.contributor_link)
      : null;
    
    const contributorUrl = contributorLink 
      ? `${baseUrl}${section.link_prefix || '/c/'}${contributorLink}?hub=${hubLink}`
      : null;
    
    const copyLink = () => {
      if (contributorUrl) {
        navigator.clipboard.writeText(contributorUrl);
        toast.success('Link copied to clipboard!');
      }
    };
    
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden"
      >
        {/* Header */}
        <div className={`${config.color} px-4 py-3 flex items-center gap-3`}>
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-white font-semibold">{section.name}</h3>
            <p className="text-white/80 text-sm">{config.label}</p>
          </div>
          <StatusBadge status={section.status} count={section.item_count} />
        </div>
        
        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Lock indicator for contributors */}
          {!isUnlocked && section.section_password && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-amber-700">
                <Lock className="w-4 h-4" />
                <span className="text-sm font-medium">This section is password protected</span>
              </div>
              <button
                onClick={() => setSectionToUnlock(section)}
                className="mt-2 w-full py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
              >
                Enter Password to Unlock
              </button>
            </div>
          )}
          
          {/* Contributor link actions (only if unlocked) */}
          {isUnlocked && section.contributor_enabled && contributorUrl && (
            <div className="space-y-3">
              <button
                onClick={copyLink}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-sm font-medium transition-colors"
              >
                <Copy className="w-4 h-4" />
                Copy Upload Link
              </button>
              
              <button
                onClick={() => setShowQR(!showQR)}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-zinc-200 hover:bg-zinc-50 rounded-lg text-sm font-medium transition-colors"
              >
                {showQR ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {showQR ? 'Hide' : 'Show'} QR Code
              </button>
              
              <AnimatePresence>
                {showQR && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex justify-center p-4 bg-white border border-zinc-200 rounded-lg"
                  >
                    <QRCodeSVG value={contributorUrl} size={150} level="H" />
                  </motion.div>
                )}
              </AnimatePresence>
              
              <a
                href={contributorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Go to Upload Page
              </a>
            </div>
          )}
          
          {/* Management buttons for coordinator or section owner */}
          {(accessType === 'coordinator' || section.created_by_supplier) && (
            <div className="flex gap-2 pt-2 border-t border-zinc-100">
              <button
                onClick={() => {
                  setSectionToEdit(section);
                  setEditName(section.name);
                }}
                className="flex-1 flex items-center justify-center gap-1 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg text-sm"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Rename
              </button>
              <button
                onClick={() => setSectionToDelete(section)}
                className="flex-1 flex items-center justify-center gap-1 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          )}
        </div>
      </motion.div>
    );
  };
  
  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Access Modal */}
      {showAccessModal && hubData?.has_coordinator_password && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-zinc-900">How are you accessing this hub?</h2>
              <p className="text-zinc-500 text-sm mt-1">Select your role to continue</p>
            </div>
            
            <div className="space-y-3">
              <button
                onClick={() => setAccessType('coordinator_pending')}
                className={`w-full p-4 border-2 rounded-xl text-left transition-all ${
                  accessType === 'coordinator_pending' 
                    ? 'border-orange-500 bg-orange-50' 
                    : 'border-zinc-200 hover:border-zinc-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Shield className="w-6 h-6 text-orange-600" />
                  <div>
                    <p className="font-semibold">I'm the Coordinator</p>
                    <p className="text-sm text-zinc-500">Full access to manage sections</p>
                  </div>
                </div>
              </button>
              
              <button
                onClick={() => handleAccessSubmit('contributor')}
                className="w-full p-4 border-2 border-zinc-200 hover:border-zinc-300 rounded-xl text-left transition-all"
              >
                <div className="flex items-center gap-3">
                  <Camera className="w-6 h-6 text-blue-600" />
                  <div>
                    <p className="font-semibold">I'm a Contributor/Supplier</p>
                    <p className="text-sm text-zinc-500">Upload to my assigned section</p>
                  </div>
                </div>
              </button>
            </div>
            
            {accessType === 'coordinator_pending' && (
              <div className="mt-4 space-y-3">
                <input
                  type="password"
                  placeholder="Enter coordinator password"
                  value={coordinatorPassword}
                  onChange={(e) => setCoordinatorPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-zinc-300 rounded-lg"
                  autoFocus
                />
                <button
                  onClick={() => handleAccessSubmit('coordinator')}
                  disabled={isAuthenticating}
                  className="w-full py-3 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:opacity-50"
                >
                  {isAuthenticating ? 'Verifying...' : 'Continue as Coordinator'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-zinc-800 to-zinc-600 rounded-xl flex items-center justify-center">
              <Camera className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-zinc-900">
                {hubData.event_title || hubData.gallery_title}
              </h1>
              {hubData.coordinator_name && (
                <p className="text-zinc-600 font-medium">
                  Coordinator: {hubData.coordinator_name}
                </p>
              )}
              <p className="text-zinc-500 text-sm">
                Supplier Hub by {hubData.photographer_name}
              </p>
              {hubData.event_date && (
                <p className="text-sm text-zinc-400 mt-1">
                  {formatEventDate(hubData.event_date)}
                </p>
              )}
            </div>
            {accessType === 'coordinator' && (
              <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium flex items-center gap-1">
                <Shield className="w-4 h-4" />
                Coordinator
              </span>
            )}
          </div>
          
          {/* Action buttons */}
          <div className="flex gap-3 mt-4">
            {hubData.share_link && (
              <a
                href={`${baseUrl}/g/${hubData.share_link}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800"
              >
                <Eye className="w-4 h-4" />
                View Live Gallery
              </a>
            )}
            {hubData.allow_supplier_sections && (
              <button
                onClick={() => setShowCreateSection(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
              >
                <Plus className="w-4 h-4" />
                Create My Section
              </button>
            )}
          </div>
        </div>
      </header>
  
      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-8">
          <h3 className="font-semibold text-blue-800 mb-2">📋 How to use this page</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Find your section below and click the link or scan the QR code</li>
            <li>• {hubData.allow_supplier_sections ? 'You can create your own section if needed' : 'Sections are created by the photographer'}</li>
            <li>• You will be asked to confirm your role before uploading</li>
            <li>• Status will update automatically once you submit</li>
          </ul>
        </div>
        
        {/* Pending Sections */}
        {pendingSections.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-zinc-800 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              Awaiting Submission ({pendingSections.length})
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {pendingSections.map((section) => (
                <SectionCard key={section.id} section={section} />
              ))}
            </div>
          </section>
        )}
        
        {/* Submitted Sections */}
        {submittedSections.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-zinc-800 mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              Completed ({submittedSections.length})
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {submittedSections.map((section) => (
                <SectionCard key={section.id} section={section} />
              ))}
            </div>
          </section>
        )}
        
        {/* Empty state */}
        {hubData.sections.length === 0 && (
          <div className="text-center py-16">
            <AlertCircle className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-zinc-600 mb-2">No sections yet</h3>
            <p className="text-zinc-400 mb-4">
              {hubData.allow_supplier_sections 
                ? 'Be the first to create a section for your uploads!'
                : 'The photographer hasn\'t created any sections for this gallery yet.'}
            </p>
            {hubData.allow_supplier_sections && (
              <button
                onClick={() => setShowCreateSection(true)}
                className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
              >
                <Plus className="w-4 h-4 inline mr-2" />
                Create My Section
              </button>
            )}
          </div>
        )}
      </main>
      
      {/* Create Section Modal */}
      {showCreateSection && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Create Your Section</h2>
              <button onClick={() => setShowCreateSection(false)} className="p-2 hover:bg-zinc-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Section Type */}
              <div>
                <label className="block text-sm font-medium mb-2">Section Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(sectionConfig).map(([type, cfg]) => {
                    const TypeIcon = cfg.icon;
                    return (
                      <button
                        key={type}
                        onClick={() => {
                          setNewSectionType(type);
                          setNewSectionName(recommendedNames[type]?.[0] || '');
                        }}
                        className={`p-3 rounded-lg border-2 transition-all ${
                          newSectionType === type 
                            ? 'border-zinc-900 bg-zinc-50' 
                            : 'border-zinc-200 hover:border-zinc-300'
                        }`}
                      >
                        <TypeIcon className={`w-5 h-5 mx-auto mb-1 ${newSectionType === type ? 'text-zinc-900' : 'text-zinc-400'}`} />
                        <p className="text-xs">{cfg.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
              
              {/* Section Name */}
              <div>
                <label className="block text-sm font-medium mb-2">Section Name</label>
                <input
                  type="text"
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  placeholder="e.g., Photos by John Doe"
                  className="w-full px-4 py-2.5 border border-zinc-300 rounded-lg"
                />
                {recommendedNames[newSectionType]?.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {recommendedNames[newSectionType].map((name) => (
                      <button
                        key={name}
                        onClick={() => setNewSectionName(name)}
                        className="px-2 py-1 text-xs bg-zinc-100 hover:bg-zinc-200 rounded"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Section Password */}
              <div>
                <label className="block text-sm font-medium mb-2">Section Password</label>
                <p className="text-xs text-zinc-500 mb-2">This protects your section from other suppliers</p>
                <input
                  type="password"
                  value={newSectionPassword}
                  onChange={(e) => setNewSectionPassword(e.target.value)}
                  placeholder="Create a password (min 4 characters)"
                  className="w-full px-4 py-2.5 border border-zinc-300 rounded-lg mb-2"
                />
                <input
                  type="password"
                  value={newSectionPasswordConfirm}
                  onChange={(e) => setNewSectionPasswordConfirm(e.target.value)}
                  placeholder="Confirm password"
                  className="w-full px-4 py-2.5 border border-zinc-300 rounded-lg"
                />
              </div>
              
              <button
                onClick={handleCreateSection}
                disabled={isCreatingSection}
                className="w-full py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {isCreatingSection ? 'Creating...' : 'Create Section'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Unlock Section Modal */}
      {sectionToUnlock && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Unlock Section
              </h2>
              <button onClick={() => setSectionToUnlock(null)} className="p-2 hover:bg-zinc-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-zinc-600 mb-4">Enter the password for <strong>{sectionToUnlock.name}</strong></p>
            <input
              type="password"
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              placeholder="Section password"
              className="w-full px-4 py-2.5 border border-zinc-300 rounded-lg mb-4"
              autoFocus
            />
            <button
              onClick={handleUnlockSection}
              className="w-full py-3 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700"
            >
              Unlock
            </button>
          </div>
        </div>
      )}
      
      {/* Delete Section Modal */}
      {sectionToDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-red-600 flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                Delete Section
              </h2>
              <button onClick={() => setSectionToDelete(null)} className="p-2 hover:bg-zinc-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-zinc-600 mb-4">
              Are you sure you want to delete <strong>{sectionToDelete.name}</strong>? 
              This will also delete all photos and videos in this section.
            </p>
            {accessType !== 'coordinator' && (
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Enter section password to confirm"
                className="w-full px-4 py-2.5 border border-zinc-300 rounded-lg mb-4"
              />
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setSectionToDelete(null)}
                className="flex-1 py-2.5 border border-zinc-300 rounded-lg font-medium hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSection}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Edit Section Modal */}
      {sectionToEdit && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Edit2 className="w-5 h-5" />
                Rename Section
              </h2>
              <button onClick={() => setSectionToEdit(null)} className="p-2 hover:bg-zinc-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="New section name"
              className="w-full px-4 py-2.5 border border-zinc-300 rounded-lg mb-4"
              autoFocus
            />
            {accessType !== 'coordinator' && (
              <input
                type="password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                placeholder="Enter section password"
                className="w-full px-4 py-2.5 border border-zinc-300 rounded-lg mb-4"
              />
            )}
            <button
              onClick={handleEditSection}
              className="w-full py-3 bg-zinc-900 text-white rounded-lg font-medium hover:bg-zinc-800"
            >
              Save Changes
            </button>
          </div>
        </div>
      )}
      
      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white py-6 mt-8">
        <div className="max-w-4xl mx-auto px-6 text-center text-sm text-zinc-400">
          <p>Powered by EventsGallery • Refresh this page to see updates</p>
        </div>
      </footer>
    </div>
  );
};

export default CoordinatorHub;
