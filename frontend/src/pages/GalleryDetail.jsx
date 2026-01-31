import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import { ArrowLeft, Upload, Trash2, Copy, ExternalLink, Lock, X, Plus, Image as ImageIcon, AlertTriangle, Cloud, CloudOff, Check, Loader2, RefreshCw, CheckCircle, AlertCircle, Download, Package } from 'lucide-react';
import { themes } from '@/themes';
import PremiumLightbox from '@/components/PremiumLightbox';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Helper to format bytes
const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const GalleryDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [gallery, setGallery] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState([]); // Track individual file uploads
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [newSectionName, setNewSectionName] = useState('');
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [selectedSection, setSelectedSection] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  // Google Drive state
  const [googleDriveStatus, setGoogleDriveStatus] = useState({ connected: false });
  const [backupStatus, setBackupStatus] = useState(null);
  const [backingUp, setBackingUp] = useState(false);
  // Download state
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState(null);
  const [downloadingChunks, setDownloadingChunks] = useState({}); // Track which chunks are downloading
  const [downloadedChunks, setDownloadedChunks] = useState({}); // Track which chunks are done

  useEffect(() => {
    fetchGalleryData();
    fetchGoogleDriveStatus();
  }, [id]);

  const fetchGoogleDriveStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const [driveRes, backupRes] = await Promise.all([
        axios.get(`${API}/auth/google/status`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/galleries/${id}/backup-status`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      setGoogleDriveStatus(driveRes.data);
      setBackupStatus(backupRes.data);
    } catch (error) {
      console.error('Failed to fetch Google Drive status');
    }
  };

  const handleLinkGoogleDrive = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/oauth/drive/authorize?gallery_id=${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Redirect to Google OAuth
      window.location.href = response.data.authorization_url;
    } catch (error) {
      const message = error.response?.data?.detail || 'Failed to start Google Drive authorization';
      toast.error(message);
    }
  };

  const handleDisconnectGoogleDrive = async () => {
    if (!window.confirm('Disconnect Google Drive? Your existing backups will remain in Drive.')) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/auth/google/disconnect`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setGoogleDriveStatus({ connected: false });
      toast.success('Google Drive disconnected');
    } catch (error) {
      toast.error('Failed to disconnect Google Drive');
    }
  };

  const handleBackupToDrive = async () => {
    if (!googleDriveStatus.connected) {
      toast.error('Please link Google Drive first');
      return;
    }
    
    setBackingUp(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API}/galleries/${id}/backup-to-drive`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(response.data.message);
      fetchGoogleDriveStatus(); // Refresh backup status
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to backup to Google Drive');
    } finally {
      setBackingUp(false);
    }
  };

  const handleToggleAutoSync = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API}/auth/google/toggle-auto-sync`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setGoogleDriveStatus(prev => ({ ...prev, auto_sync: response.data.auto_sync }));
      toast.success(response.data.auto_sync ? 'Auto-sync enabled (every 5 minutes)' : 'Auto-sync disabled');
    } catch (error) {
      toast.error('Failed to toggle auto-sync');
    }
  };

  // Handle Google OAuth callback from URL params
  useEffect(() => {
    const handleGoogleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const driveConnected = params.get('drive_connected');
      const driveError = params.get('drive_error');
      
      if (driveConnected === 'true') {
        toast.success('Google Drive linked successfully!');
        fetchGoogleDriveStatus();
        // Clean URL
        window.history.replaceState(null, '', window.location.pathname);
      } else if (driveError) {
        const errorMessages = {
          'invalid_state': 'Authorization expired. Please try again.',
          'auth_failed': 'Failed to link Google Drive. Please try again.'
        };
        toast.error(errorMessages[driveError] || 'Google Drive connection failed');
        // Clean URL
        window.history.replaceState(null, '', window.location.pathname);
      }
    };
    
    handleGoogleCallback();
  }, [id]);

  const fetchGalleryData = async () => {
    try {
      const token = localStorage.getItem('token');
      const [galleryRes, photosRes, sectionsRes] = await Promise.all([
        axios.get(`${API}/galleries/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/galleries/${id}/photos`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/galleries/${id}/sections`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      setGallery(galleryRes.data);
      setPhotos(photosRes.data);
      setSections(sectionsRes.data);
    } catch (error) {
      toast.error('Failed to load gallery');
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleCoverPhotoUpload = async (file) => {
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post(`${API}/galleries/${id}/cover-photo`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      setGallery({ ...gallery, cover_photo_url: response.data.cover_photo_url });
      toast.success('Cover photo updated!');
    } catch (error) {
      toast.error('Failed to upload cover photo');
    }
  };

  const onDropCover = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      await handleCoverPhotoUpload(acceptedFiles[0]);
    }
  }, [id, gallery]);

  const { getRootProps: getCoverRootProps, getInputProps: getCoverInputProps, isDragActive: isCoverDragActive } = useDropzone({
    onDrop: onDropCover,
    accept: { 'image/*': [] },
    multiple: false
  });

  const onDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return;
    
    setUploading(true);
    const token = localStorage.getItem('token');

    // Initialize progress tracking for each file
    const initialProgress = acceptedFiles.map(file => ({
      name: file.name,
      status: 'uploading',
      progress: 0
    }));
    setUploadProgress(initialProgress);

    const results = await Promise.allSettled(
      acceptedFiles.map(async (file, index) => {
        const formData = new FormData();
        formData.append('file', file);
        if (selectedSection) {
          formData.append('section_id', selectedSection);
        }
        
        try {
          const response = await axios.post(`${API}/galleries/${id}/photos`, formData, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'multipart/form-data'
            },
            onUploadProgress: (progressEvent) => {
              const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              setUploadProgress(prev => prev.map((item, i) => 
                i === index ? { ...item, progress: percentCompleted } : item
              ));
            }
          });
          
          // Mark as success
          setUploadProgress(prev => prev.map((item, i) => 
            i === index ? { ...item, status: 'success', progress: 100 } : item
          ));
          
          return response;
        } catch (error) {
          // Mark as error with message
          const errorMsg = error.response?.status === 403 ? 'Storage full' : 'Failed';
          setUploadProgress(prev => prev.map((item, i) => 
            i === index ? { ...item, status: 'error', errorMsg } : item
          ));
          throw error;
        }
      })
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failCount = results.filter(r => r.status === 'rejected').length;

    if (successCount > 0) {
      toast.success(`${successCount} photo(s) uploaded successfully!`);
      fetchGalleryData();
    }
    if (failCount > 0) {
      const storageFullCount = results.filter(r => 
        r.status === 'rejected' && r.reason?.response?.status === 403
      ).length;
      if (storageFullCount > 0) {
        toast.error(`${storageFullCount} photo(s) failed - storage quota exceeded`);
      }
      if (failCount - storageFullCount > 0) {
        toast.error(`${failCount - storageFullCount} photo(s) failed to upload`);
      }
    }

    // Clear progress after a delay
    setTimeout(() => {
      setUploadProgress([]);
      setUploading(false);
    }, 2000);
  }, [id, selectedSection]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: true
  });

  const handleDelete = async (photoId) => {
    if (!window.confirm('Are you sure you want to delete this photo?')) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/photos/${photoId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Photo deleted');
      setPhotos(photos.filter(p => p.id !== photoId));
      setSelectedPhoto(null);
    } catch (error) {
      toast.error('Failed to delete photo');
    }
  };

  const handleCreateSection = async (e) => {
    e.preventDefault();
    if (!newSectionName.trim()) return;

    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('name', newSectionName);
      
      const response = await axios.post(`${API}/galleries/${id}/sections`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setSections([...sections, response.data]);
      setNewSectionName('');
      setShowSectionForm(false);
      toast.success('Section created!');
    } catch (error) {
      toast.error('Failed to create section');
    }
  };

  const handleDeleteSection = async (sectionId) => {
    if (!window.confirm('Delete this section? Photos will be moved to unsorted.')) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/galleries/${id}/sections/${sectionId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSections(sections.filter(s => s.id !== sectionId));
      toast.success('Section deleted');
      fetchGalleryData();
    } catch (error) {
      toast.error('Failed to delete section');
    }
  };

  // Delete gallery with double confirmation
  const handleDeleteGalleryStep1 = () => {
    setShowDeleteModal(true);
  };

  const handleDeleteGalleryStep2 = () => {
    setShowDeleteModal(false);
    setShowDeleteConfirmModal(true);
    setDeleteConfirmText('');
  };

  const handleDeleteGalleryFinal = async () => {
    if (deleteConfirmText !== gallery?.title) {
      toast.error('Gallery name does not match');
      return;
    }

    setDeleting(true);
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/galleries/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Gallery deleted permanently');
      navigate('/dashboard');
    } catch (error) {
      toast.error('Failed to delete gallery');
    } finally {
      setDeleting(false);
      setShowDeleteConfirmModal(false);
    }
  };

  const copyShareLink = () => {
    const shareUrl = `${window.location.origin}/g/${gallery.share_link}`;
    
    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareUrl)
        .then(() => toast.success('Share link copied to clipboard!'))
        .catch(() => {
          // Fallback to old method
          fallbackCopyTextToClipboard(shareUrl);
        });
    } else {
      // Fallback for older browsers
      fallbackCopyTextToClipboard(shareUrl);
    }
  };

  const fallbackCopyTextToClipboard = (text) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      document.execCommand('copy');
      toast.success('Share link copied to clipboard!');
    } catch (err) {
      toast.error('Failed to copy link. Please copy manually: ' + text);
    }
    
    document.body.removeChild(textArea);
  };

  const openShareLink = () => {
    window.open(`/g/${gallery.share_link}`, '_blank');
  };

  const handleEditGallery = () => {
    setEditFormData({
      title: gallery.title,
      event_title: gallery.event_title || '',
      event_date: gallery.event_date || '',
      description: gallery.description || '',
      share_link_expiration_days: 30,
      guest_upload_enabled_days: 3,
      theme: gallery.theme || 'classic'
    });
    setShowEditModal(true);
  };

  const handleUpdateGallery = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/galleries/${id}`, {
        title: editFormData.title,
        event_title: editFormData.event_title || null,
        event_date: editFormData.event_date || null,
        description: editFormData.description || null,
        share_link_expiration_days: parseInt(editFormData.share_link_expiration_days),
        guest_upload_enabled_days: parseInt(editFormData.guest_upload_enabled_days),
        theme: editFormData.theme
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Gallery updated successfully!');
      setShowEditModal(false);
      fetchGalleryData();
    } catch (error) {
      toast.error('Failed to update gallery');
    }
  };

  const getPhotosBySection = (sectionId) => {
    return photos.filter(p => p.section_id === sectionId && p.uploaded_by === 'photographer');
  };

  const getPhotosWithoutSection = () => {
    return photos.filter(p => !p.section_id && p.uploaded_by === 'photographer');
  };

  const getGuestPhotos = () => {
    return photos.filter(p => p.uploaded_by === 'guest');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-zinc-500">Loading gallery...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-zinc-200 bg-white sticky top-0 z-40">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-12 py-6">
          <h1
            className="text-2xl font-medium cursor-pointer"
            style={{ fontFamily: 'Playfair Display, serif' }}
            onClick={() => navigate('/dashboard')}
          >
            PhotoShare
          </h1>
        </div>
      </nav>

      <div className="max-w-screen-2xl mx-auto px-6 md:px-12 py-12">
        <button
          data-testid="back-to-dashboard-button"
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          Back to Dashboard
        </button>

        <div className="mb-12">
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <h2
                className="text-4xl md:text-5xl font-normal tracking-tight mb-4"
                style={{ fontFamily: 'Playfair Display, serif' }}
              >
                {gallery.title}
              </h2>
              {gallery.event_title && (
                <p className="text-lg font-light text-zinc-700 mb-2">Event: {gallery.event_title}</p>
              )}
              {gallery.event_date && (
                <p className="text-sm text-zinc-500 mb-2">
                  Date: {new Date(gallery.event_date).toLocaleDateString()}
                </p>
              )}
              {gallery.description && (
                <p className="text-base font-light text-zinc-600">{gallery.description}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {gallery.is_edit_locked ? (
                <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-4 py-2 rounded-sm border border-amber-200">
                  <Lock className="w-4 h-4" strokeWidth={1.5} />
                  Editing locked (7+ days since creation)
                </div>
              ) : (
                <>
                  <button
                    data-testid="edit-gallery-button"
                    onClick={handleEditGallery}
                    className="border border-input hover:bg-zinc-50 h-10 px-6 rounded-sm font-medium transition-all duration-300"
                  >
                    Edit Details
                  </button>
                  {gallery.days_until_edit_lock > 0 && (
                    <span className="text-xs text-zinc-500">
                      {gallery.days_until_edit_lock} days left to edit
                    </span>
                  )}
                </>
              )}
              {gallery.has_password && (
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Lock className="w-4 h-4" strokeWidth={1.5} />
                  Protected
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            <button
              data-testid="copy-share-link-button"
              onClick={copyShareLink}
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-6 rounded-sm font-medium tracking-wide transition-all duration-300 flex items-center gap-2"
            >
              <Copy className="w-4 h-4" strokeWidth={1.5} />
              Copy Share Link
            </button>
            <button
              data-testid="open-share-link-button"
              onClick={openShareLink}
              className="border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-6 rounded-sm transition-all duration-300 flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" strokeWidth={1.5} />
              View Public Gallery
            </button>
            <button
              data-testid="delete-gallery-button"
              onClick={handleDeleteGalleryStep1}
              className="border border-red-300 bg-white hover:bg-red-50 text-red-600 h-10 px-6 rounded-sm transition-all duration-300 flex items-center gap-2 ml-auto"
            >
              <Trash2 className="w-4 h-4" strokeWidth={1.5} />
              Delete Gallery
            </button>
          </div>
        </div>

        <div className="mb-12">
          <h3 className="text-2xl font-normal mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
            Cover Photo
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div
              {...getCoverRootProps()}
              data-testid="cover-photo-dropzone"
              className={`border-2 border-dashed rounded-sm p-8 text-center cursor-pointer transition-all duration-300 ${
                isCoverDragActive
                  ? 'border-primary bg-zinc-50'
                  : 'border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50/50'
              }`}
            >
              <input {...getCoverInputProps()} />
              <ImageIcon className="w-10 h-10 mx-auto mb-3 text-zinc-400" strokeWidth={1.5} />
              <p className="text-sm font-light text-zinc-600">
                {isCoverDragActive ? 'Drop cover photo here' : 'Click or drag to upload cover photo'}
              </p>
            </div>
            {gallery.cover_photo_url && (
              <div className="rounded-sm overflow-hidden border border-zinc-200">
                <img
                  src={`${BACKEND_URL}${gallery.cover_photo_url}`}
                  alt="Cover"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>
        </div>

        {/* Google Drive Backup Section */}
        <div className="mb-12">
          <h3 className="text-2xl font-normal mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
            Google Drive Backup
          </h3>
          <div className="border border-zinc-200 rounded-sm p-6 bg-zinc-50/50">
            {!googleDriveStatus.connected ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-zinc-200 rounded-full flex items-center justify-center">
                    <CloudOff className="w-6 h-6 text-zinc-500" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="font-medium text-zinc-800">Google Drive not connected</p>
                    <p className="text-sm text-zinc-500">Link your account to backup photos automatically</p>
                  </div>
                </div>
                <button
                  data-testid="link-google-drive-btn"
                  onClick={handleLinkGoogleDrive}
                  className="bg-blue-600 text-white hover:bg-blue-700 h-10 px-6 rounded-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Cloud className="w-4 h-4" strokeWidth={1.5} />
                  Link Google Drive
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                      <Cloud className="w-6 h-6 text-green-600" strokeWidth={1.5} />
                    </div>
                    <div>
                      <p className="font-medium text-zinc-800">Connected to Google Drive</p>
                      <p className="text-sm text-zinc-500">{googleDriveStatus.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      data-testid="backup-to-drive-btn"
                      onClick={handleBackupToDrive}
                      disabled={backingUp || photos.length === 0}
                      className={`h-10 px-6 rounded-sm font-medium transition-colors flex items-center gap-2 ${
                        backingUp || photos.length === 0
                          ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {backingUp ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" strokeWidth={1.5} />
                          Sync Now
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleDisconnectGoogleDrive}
                      className="border border-zinc-300 text-zinc-600 hover:bg-zinc-100 h-10 px-4 rounded-sm text-sm transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
                
                {/* Auto-sync toggle */}
                <div className="flex items-center justify-between border-t border-zinc-200 pt-4">
                  <div className="flex items-center gap-3">
                    <RefreshCw className={`w-5 h-5 ${googleDriveStatus.auto_sync ? 'text-green-600' : 'text-zinc-400'}`} strokeWidth={1.5} />
                    <div>
                      <p className="text-sm font-medium text-zinc-700">Auto-sync every 5 minutes</p>
                      <p className="text-xs text-zinc-500">Automatically backup new photos to Google Drive</p>
                    </div>
                  </div>
                  <button
                    onClick={handleToggleAutoSync}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      googleDriveStatus.auto_sync ? 'bg-green-600' : 'bg-zinc-300'
                    }`}
                    data-testid="auto-sync-toggle"
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        googleDriveStatus.auto_sync ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                
                {backupStatus && backupStatus.status !== 'not_started' && (
                  <div className="border-t border-zinc-200 pt-4 mt-4">
                    <div className="flex items-center gap-3">
                      {backupStatus.status === 'completed' ? (
                        <Check className="w-5 h-5 text-green-600" strokeWidth={1.5} />
                      ) : backupStatus.status === 'in_progress' ? (
                        <Loader2 className="w-5 h-5 text-blue-600 animate-spin" strokeWidth={1.5} />
                      ) : null}
                      <div className="flex-1">
                        <p className="text-sm font-medium text-zinc-700">
                          {backupStatus.status === 'completed' 
                            ? `${backupStatus.photos_backed_up} photos backed up`
                            : backupStatus.status === 'in_progress'
                            ? `Backing up ${backupStatus.photos_backed_up}/${backupStatus.total_photos} photos...`
                            : 'Backup status unknown'}
                        </p>
                        {backupStatus.folder_url && (
                          <a 
                            href={backupStatus.folder_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                          >
                            Open in Google Drive
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-normal" style={{ fontFamily: 'Playfair Display, serif' }}>
              Sections
            </h3>
            <button
              data-testid="add-section-button"
              onClick={() => setShowSectionForm(!showSectionForm)}
              className="hover:bg-zinc-100 text-foreground h-10 px-6 rounded-sm font-medium transition-all duration-300 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" strokeWidth={1.5} />
              Add Section
            </button>
          </div>

          {showSectionForm && (
            <form onSubmit={handleCreateSection} className="mb-6 flex gap-3">
              <input
                data-testid="section-name-input"
                type="text"
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                placeholder="e.g., Wedding Ceremony, Reception, Photobooth"
                className="flex h-10 flex-1 rounded-sm border border-input bg-transparent px-3 py-2 text-sm"
                autoFocus
              />
              <button
                type="submit"
                data-testid="create-section-button"
                className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-6 rounded-sm font-medium"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowSectionForm(false)}
                className="border border-input h-10 px-6 rounded-sm"
              >
                Cancel
              </button>
            </form>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              data-testid="section-all-button"
              onClick={() => setSelectedSection(null)}
              className={`h-12 rounded-sm font-medium transition-all duration-300 ${
                selectedSection === null
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              All Photos
            </button>
            {sections.map((section) => (
              <div key={section.id} className="relative group">
                <button
                  data-testid={`section-${section.id}-button`}
                  onClick={() => setSelectedSection(section.id)}
                  className={`w-full h-12 rounded-sm font-medium transition-all duration-300 ${
                    selectedSection === section.id
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-zinc-200 hover:bg-zinc-50'
                  }`}
                >
                  {section.name}
                </button>
                <button
                  onClick={() => handleDeleteSection(section.id)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white w-6 h-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  <X className="w-3 h-3" strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-12">
          <h3 className="text-2xl font-normal mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
            Upload Photos {selectedSection && `to ${sections.find(s => s.id === selectedSection)?.name}`}
          </h3>
          <div
            {...getRootProps()}
            data-testid="photo-dropzone"
            className={`border-2 border-dashed rounded-sm p-12 text-center cursor-pointer transition-all duration-300 ${
              isDragActive
                ? 'border-primary bg-zinc-50'
                : uploading
                ? 'border-zinc-300 bg-zinc-50 cursor-not-allowed'
                : 'border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50/50'
            }`}
          >
            <input {...getInputProps()} disabled={uploading} />
            
            {uploading && uploadProgress.length > 0 ? (
              <div className="space-y-4">
                <Loader2 className="w-12 h-12 mx-auto text-zinc-600 animate-spin" strokeWidth={1.5} />
                <p className="text-base font-medium text-zinc-700">Uploading {uploadProgress.length} photo(s)...</p>
                <div className="max-w-md mx-auto space-y-2">
                  {uploadProgress.map((file, index) => (
                    <div key={index} className="flex items-center gap-3 text-left bg-white rounded-md p-2 shadow-sm border border-zinc-200">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-700 truncate">{file.name}</p>
                        <div className="w-full bg-zinc-200 rounded-full h-1.5 mt-1">
                          <div 
                            className={`h-1.5 rounded-full transition-all duration-300 ${
                              file.status === 'error' ? 'bg-red-500' : 
                              file.status === 'success' ? 'bg-green-500' : 'bg-zinc-600'
                            }`}
                            style={{ width: `${file.progress}%` }}
                          />
                        </div>
                        {file.status === 'error' && file.errorMsg && (
                          <p className="text-xs text-red-500 mt-1">{file.errorMsg}</p>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        {file.status === 'uploading' && (
                          <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
                        )}
                        {file.status === 'success' && (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        )}
                        {file.status === 'error' && (
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-zinc-500 mt-2">Please wait until all uploads complete</p>
              </div>
            ) : isDragActive ? (
              <>
                <Upload className="w-12 h-12 mx-auto mb-4 text-zinc-400" strokeWidth={1.5} />
                <p className="text-base font-light text-zinc-600">Drop photos here...</p>
              </>
            ) : (
              <>
                <Upload className="w-12 h-12 mx-auto mb-4 text-zinc-400" strokeWidth={1.5} />
                <p className="text-base font-light text-zinc-600 mb-2">
                  Drag & drop photos here, or click to select
                </p>
                <p className="text-sm text-zinc-500">Support for multiple images</p>
              </>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-2xl font-normal mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
            Photographer Photos ({photos.filter(p => p.uploaded_by === 'photographer').length})
          </h3>

          {sections.length > 0 ? (
            sections.map((section) => {
              const sectionPhotos = getPhotosBySection(section.id);
              if (sectionPhotos.length === 0) return null;
              
              return (
                <div key={section.id} className="mb-12">
                  <h4 className="text-xl font-normal mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
                    {section.name} ({sectionPhotos.length})
                  </h4>
                  <div className="masonry-grid">
                    {sectionPhotos.map((photo) => {
                      const photoIndex = photos.findIndex(p => p.id === photo.id);
                      return (
                        <PhotoItem
                          key={photo.id}
                          photo={photo}
                          photoIndex={photoIndex}
                          onDelete={handleDelete}
                          onView={setLightboxIndex}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })
          ) : null}

          {getPhotosWithoutSection().length > 0 && (
            <div className="mb-12">
              <h4 className="text-xl font-normal mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
                {sections.length > 0 ? 'Unsorted' : 'All Photos'} ({getPhotosWithoutSection().length})
              </h4>
              <div className="masonry-grid">
                {getPhotosWithoutSection().map((photo) => {
                  const photoIndex = photos.findIndex(p => p.id === photo.id);
                  return (
                    <PhotoItem
                      key={photo.id}
                      photo={photo}
                      photoIndex={photoIndex}
                      onDelete={handleDelete}
                      onView={setLightboxIndex}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {photos.filter(p => p.uploaded_by === 'photographer').length === 0 && (
            <div className="text-center py-20 border border-zinc-200 rounded-sm">
              <p className="text-zinc-500">No photos yet. Upload some to get started!</p>
            </div>
          )}
        </div>

        {/* Guest Photos Section */}
        {getGuestPhotos().length > 0 && (
          <div className="mt-12 pt-12 border-t border-zinc-200">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-normal" style={{ fontFamily: 'Playfair Display, serif' }}>
                  Guest Uploads ({getGuestPhotos().length})
                </h3>
                <p className="text-sm text-zinc-500 mt-1">
                  Photos uploaded by guests. You can delete inappropriate content.
                </p>
              </div>
              <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-sm font-medium">
                Needs Review
              </span>
            </div>
            
            <div className="masonry-grid">
              {getGuestPhotos().map((photo, index) => (
                <div
                  key={photo.id}
                  data-testid={`guest-photo-${photo.id}`}
                  className="masonry-item group relative"
                >
                  <img
                    src={`${BACKEND_URL}${photo.url}`}
                    alt="Guest upload"
                    className="w-full h-auto cursor-pointer rounded-sm"
                    onClick={() => {
                      const guestPhotos = getGuestPhotos();
                      setLightboxIndex(photos.findIndex(p => p.id === photo.id));
                    }}
                  />
                  <div className="absolute top-2 left-2 bg-amber-500 text-white px-2 py-1 rounded text-xs font-medium">
                    Guest
                  </div>
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-2 rounded-sm">
                    <button
                      data-testid={`delete-guest-photo-${photo.id}`}
                      onClick={() => handleDelete(photo.id)}
                      className="bg-red-500 text-white hover:bg-red-600 h-10 w-10 rounded-sm flex items-center justify-center transition-all duration-300"
                      title="Delete this photo"
                    >
                      <Trash2 className="w-5 h-5" strokeWidth={1.5} />
                    </button>
                  </div>
                  <div className="absolute bottom-2 right-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded text-xs text-zinc-600">
                    {new Date(photo.uploaded_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Premium Lightbox */}
      {lightboxIndex !== null && (
        <PremiumLightbox
          photos={photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onDownload={null}
          backendUrl={BACKEND_URL}
        />
      )}

      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm max-w-2xl w-full max-h-[90vh] overflow-y-auto p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-normal" style={{ fontFamily: 'Playfair Display, serif' }}>
                Edit Gallery Details
              </h3>
              <button onClick={() => setShowEditModal(false)}>
                <X className="w-6 h-6" strokeWidth={1.5} />
              </button>
            </div>
            <form onSubmit={handleUpdateGallery} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Gallery Title *</label>
                <input
                  type="text"
                  value={editFormData.title}
                  onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                  className="flex h-10 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Event Title</label>
                <input
                  type="text"
                  value={editFormData.event_title}
                  onChange={(e) => setEditFormData({ ...editFormData, event_title: e.target.value })}
                  className="flex h-10 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Event Date</label>
                <input
                  type="date"
                  value={editFormData.event_date}
                  onChange={(e) => setEditFormData({ ...editFormData, event_date: e.target.value })}
                  className="flex h-10 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={editFormData.description}
                  onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                  className="flex min-h-[100px] w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Share Link Expiration</label>
                  <select
                    value={editFormData.share_link_expiration_days}
                    onChange={(e) => setEditFormData({ ...editFormData, share_link_expiration_days: e.target.value })}
                    className="flex h-10 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm"
                  >
                    <option value="30">30 days</option>
                    <option value="60">60 days</option>
                    <option value="90">90 days</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Guest Upload Window</label>
                  <select
                    value={editFormData.guest_upload_enabled_days}
                    onChange={(e) => setEditFormData({ ...editFormData, guest_upload_enabled_days: e.target.value })}
                    className="flex h-10 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm"
                  >
                    <option value="1">1 day</option>
                    <option value="2">2 days</option>
                    <option value="3">3 days</option>
                    <option value="4">4 days</option>
                    <option value="5">5 days</option>
                    <option value="6">6 days</option>
                    <option value="7">7 days</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-4">Gallery Theme</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {Object.entries(themes).map(([key, theme]) => (
                    <div
                      key={key}
                      onClick={() => setEditFormData({ ...editFormData, theme: key })}
                      className={`cursor-pointer border-2 rounded-sm p-2 transition-all duration-300 ${
                        editFormData.theme === key ? 'border-primary bg-zinc-50' : 'border-zinc-200'
                      }`}
                    >
                      <img 
                        src={theme.preview} 
                        alt={theme.name}
                        className="w-full h-16 object-cover rounded-sm mb-1"
                      />
                      <h4 className="font-medium text-xs">{theme.name}</h4>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="border border-input h-10 px-6 rounded-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-6 rounded-sm font-medium"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Gallery - First Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm p-8 max-w-md w-full" data-testid="delete-gallery-modal-1">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="text-xl font-medium" style={{ fontFamily: 'Playfair Display, serif' }}>
                  Delete Gallery?
                </h3>
                <p className="text-sm text-zinc-500">This action cannot be undone</p>
              </div>
            </div>
            
            <p className="text-zinc-600 mb-6">
              Are you sure you want to delete <strong>&ldquo;{gallery?.title}&rdquo;</strong>? 
              All {photos.length} photo(s) in this gallery will be permanently removed.
            </p>
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="border border-input h-10 px-6 rounded-sm hover:bg-zinc-50 transition-colors"
              >
                Cancel
              </button>
              <button
                data-testid="delete-gallery-continue-btn"
                onClick={handleDeleteGalleryStep2}
                className="bg-red-600 text-white hover:bg-red-700 h-10 px-6 rounded-sm font-medium transition-colors"
              >
                Yes, Delete Gallery
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Gallery - Final Confirmation Modal */}
      {showDeleteConfirmModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm p-8 max-w-md w-full" data-testid="delete-gallery-modal-2">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="text-xl font-medium text-red-600" style={{ fontFamily: 'Playfair Display, serif' }}>
                  Final Warning
                </h3>
                <p className="text-sm text-zinc-500">This cannot be recovered</p>
              </div>
            </div>
            
            <p className="text-zinc-600 mb-4">
              To confirm deletion, please type the gallery name:
            </p>
            <p className="text-sm font-medium text-zinc-800 mb-2 bg-zinc-100 px-3 py-2 rounded">
              {gallery?.title}
            </p>
            
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type gallery name to confirm"
              className="w-full border border-zinc-300 rounded-sm px-4 py-3 mb-6 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              data-testid="delete-gallery-confirm-input"
            />
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteConfirmModal(false);
                  setDeleteConfirmText('');
                }}
                className="border border-input h-10 px-6 rounded-sm hover:bg-zinc-50 transition-colors"
              >
                Cancel
              </button>
              <button
                data-testid="delete-gallery-final-btn"
                onClick={handleDeleteGalleryFinal}
                disabled={deleteConfirmText !== gallery?.title || deleting}
                className={`h-10 px-6 rounded-sm font-medium transition-colors ${
                  deleteConfirmText === gallery?.title && !deleting
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-zinc-300 text-zinc-500 cursor-not-allowed'
                }`}
              >
                {deleting ? 'Deleting...' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const PhotoItem = ({ photo, photoIndex, onDelete, onView }) => (
  <div
    data-testid={`photo-item-${photo.id}`}
    className="masonry-item group relative"
    onClick={() => onView(photoIndex)}
  >
    <img
      src={`${BACKEND_URL}${photo.url}`}
      alt="Gallery photo"
      className="w-full h-auto cursor-pointer rounded-sm"
    />
    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-4 rounded-sm">
      <button
        data-testid={`delete-photo-${photo.id}`}
        onClick={(e) => {
          e.stopPropagation();
          onDelete(photo.id);
        }}
        className="bg-white text-red-600 hover:bg-red-50 h-10 w-10 rounded-sm flex items-center justify-center transition-all duration-300"
      >
        <Trash2 className="w-5 h-5" strokeWidth={1.5} />
      </button>
    </div>
  </div>
);

export default GalleryDetail;