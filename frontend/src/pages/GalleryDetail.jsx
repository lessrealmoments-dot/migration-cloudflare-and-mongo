import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import { ArrowLeft, Upload, Trash2, Copy, ExternalLink, Lock, X, Plus, Image as ImageIcon, AlertTriangle, Cloud, CloudOff, Check, Loader2, RefreshCw, CheckCircle, AlertCircle, Download, Package, Settings2, QrCode, Star, EyeOff, Eye, GripVertical, CheckSquare, Square, FolderInput, ChevronDown, ChevronUp, Code, Monitor, Grid, Play, Edit2, Film, Video, Camera, Sparkles, RotateCcw } from 'lucide-react';
import { themes } from '@/themes';
import PremiumLightbox from '@/components/PremiumLightbox';
import OptimizedImage from '@/components/OptimizedImage';
import CoverPhotoEditor from '@/components/CoverPhotoEditor';
import EmbedCodeModal from '@/components/EmbedCodeModal';
import VideoThumbnailCropper from '@/components/VideoThumbnailCropper';
import { QRCodeSVG } from 'qrcode.react';
import useBrandConfig from '../hooks/useBrandConfig';
import useFeatureToggles from '../hooks/useFeatureToggles';

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
  const brandConfig = useBrandConfig();
  const { isFeatureEnabled, getUnavailableMessage } = useFeatureToggles();
  const [gallery, setGallery] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [videos, setVideos] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState([]); // Track individual file uploads
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  // Section expand/collapse state
  const [expandedSections, setExpandedSections] = useState({});
  const PREVIEW_COUNT = 8; // Number of photos to show in collapsed view
  const [newSectionName, setNewSectionName] = useState('');
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [selectedSection, setSelectedSection] = useState(null);
  // New section type state (photo, video, fotoshare, or pcloud)
  const [newSectionType, setNewSectionType] = useState('photo');
  // Fotoshare section state
  const [newFotoshareUrl, setNewFotoshareUrl] = useState('');
  const [fotoshareVideos, setFotoshareVideos] = useState([]);
  const [refreshingSection, setRefreshingSection] = useState(null);
  // pCloud section state
  const [newPcloudUrl, setNewPcloudUrl] = useState('');
  const [pcloudPhotos, setPcloudPhotos] = useState([]);
  // Section rename state
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [editingSectionName, setEditingSectionName] = useState('');
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
  const [isPreparingDownload, setIsPreparingDownload] = useState(false); // Loading state for download button
  // Subscription/download permission state
  const [canDownload, setCanDownload] = useState(true);
  const [downloadDisabledReason, setDownloadDisabledReason] = useState(null);
  // Cover photo editor state
  const [showCoverEditor, setShowCoverEditor] = useState(false);
  const [coverPhotoPosition, setCoverPhotoPosition] = useState({ scale: 1, positionX: 50, positionY: 50 });
  // QR Code state
  const [showQRCode, setShowQRCode] = useState(false);
  const qrRef = useRef(null);
  // Display Mode QR state
  const [showDisplayQR, setShowDisplayQR] = useState(false);
  const [displayQRMode, setDisplayQRMode] = useState('slideshow');
  const displayQrRef = useRef(null);
  // Contributor QR state
  const [showContributorQR, setShowContributorQR] = useState(false);
  const [contributorQRLink, setContributorQRLink] = useState('');
  const contributorQrRef = useRef(null);
  // Embed code state
  const [showEmbedModal, setShowEmbedModal] = useState(false);
  // Multi-select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState(new Set());
  const [showBulkActionModal, setShowBulkActionModal] = useState(false);
  const [bulkAction, setBulkAction] = useState(null);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  // Drag reorder state
  const [draggedPhoto, setDraggedPhoto] = useState(null);
  const [reorderMode, setReorderMode] = useState(false);
  // Guest photos multi-select state
  const [guestSelectMode, setGuestSelectMode] = useState(false);
  const [selectedGuestPhotos, setSelectedGuestPhotos] = useState(new Set());
  const [guestBulkActionLoading, setGuestBulkActionLoading] = useState(false);
  // Section drag reorder state
  const [draggedSection, setDraggedSection] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const [dropPosition, setDropPosition] = useState(null); // 'before' or 'after'
  // Collage preset state
  const [collagePresets, setCollagePresets] = useState([]);
  const [showCollagePresetPicker, setShowCollagePresetPicker] = useState(false);
  const [selectedCollagePreset, setSelectedCollagePreset] = useState(null);
  const [savingPreset, setSavingPreset] = useState(false);
  // Video management state
  const [editingVideo, setEditingVideo] = useState(null);
  const [showVideoThumbnailCropper, setShowVideoThumbnailCropper] = useState(false);
  // Photo health/repair state
  const [flaggedPhotos, setFlaggedPhotos] = useState([]);
  const [showFlaggedPhotosModal, setShowFlaggedPhotosModal] = useState(false);
  const [repairingThumbnails, setRepairingThumbnails] = useState(false);
  const [photoHealthStatus, setPhotoHealthStatus] = useState(null);

  // Section drag handlers
  const handleSectionDragStart = (e, section) => {
    setDraggedSection(section);
    e.dataTransfer.effectAllowed = 'move';
    // Add visual feedback
    e.target.style.opacity = '0.5';
  };

  const handleSectionDragEnd = (e) => {
    e.target.style.opacity = '1';
    setDraggedSection(null);
    setDropTargetId(null);
    setDropPosition(null);
  };

  const handleSectionDragOver = (e, section) => {
    e.preventDefault();
    if (!draggedSection || draggedSection.id === section.id) return;
    
    // Calculate if we're in the top or bottom half of the target
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? 'before' : 'after';
    
    setDropTargetId(section.id);
    setDropPosition(position);
  };

  const handleSectionDragLeave = (e) => {
    // Only clear if we're actually leaving the element
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDropTargetId(null);
      setDropPosition(null);
    }
  };

  const handleSectionDrop = async (e, targetSection) => {
    e.preventDefault();
    if (!draggedSection || draggedSection.id === targetSection.id) return;

    const newSections = [...sections];
    const draggedIdx = newSections.findIndex(s => s.id === draggedSection.id);
    let targetIdx = newSections.findIndex(s => s.id === targetSection.id);
    
    // Adjust target index based on drop position
    if (dropPosition === 'after') {
      targetIdx = targetIdx + 1;
    }
    
    // Adjust if dragging from before target
    if (draggedIdx < targetIdx) {
      targetIdx = targetIdx - 1;
    }

    // Remove dragged section and insert at target position
    const [removed] = newSections.splice(draggedIdx, 1);
    newSections.splice(targetIdx, 0, removed);

    // Update order values
    const updatedSections = newSections.map((s, idx) => ({ ...s, order: idx }));
    setSections(updatedSections);
    setDraggedSection(null);
    setDropTargetId(null);
    setDropPosition(null);

    // Save to backend
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/galleries/${id}/sections/reorder`, {
        section_orders: updatedSections.map(s => ({ id: s.id, order: s.order }))
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Sections reordered');
    } catch (error) {
      toast.error('Failed to save section order');
      fetchGalleryData(); // Revert on error
    }
  };

  // Toggle photo selection
  const togglePhotoSelection = (photoId) => {
    setSelectedPhotos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(photoId)) {
        newSet.delete(photoId);
      } else {
        newSet.add(photoId);
      }
      return newSet;
    });
  };

  // Select all photos
  const selectAllPhotos = () => {
    const filteredPhotos = selectedSection 
      ? photos.filter(p => p.section_id === selectedSection)
      : photos;
    setSelectedPhotos(new Set(filteredPhotos.map(p => p.id)));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedPhotos(new Set());
    setSelectMode(false);
  };

  // Guest photos selection handlers
  const toggleGuestPhotoSelection = (photoId) => {
    setSelectedGuestPhotos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(photoId)) {
        newSet.delete(photoId);
      } else {
        newSet.add(photoId);
      }
      return newSet;
    });
  };

  const selectAllGuestPhotos = () => {
    const guestPhotos = getGuestPhotos();
    setSelectedGuestPhotos(new Set(guestPhotos.map(p => p.id)));
  };

  const clearGuestSelection = () => {
    setSelectedGuestPhotos(new Set());
    setGuestSelectMode(false);
  };

  // Guest bulk action handler (hide, unhide, or delete)
  const handleGuestBulkAction = async (action) => {
    if (selectedGuestPhotos.size === 0) {
      toast.error('No guest photos selected');
      return;
    }

    let confirmMsg;
    if (action === 'delete') {
      confirmMsg = `Are you sure you want to delete ${selectedGuestPhotos.size} guest photo(s)? This cannot be undone.`;
    } else if (action === 'hide') {
      confirmMsg = `Hide ${selectedGuestPhotos.size} guest photo(s) from the public gallery?`;
    } else if (action === 'unhide') {
      confirmMsg = `Make ${selectedGuestPhotos.size} guest photo(s) visible in the public gallery?`;
    }
    
    if (confirmMsg && !window.confirm(confirmMsg)) return;

    setGuestBulkActionLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/galleries/${id}/photos/bulk-action`, {
        photo_ids: Array.from(selectedGuestPhotos),
        action: action
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const actionText = action === 'delete' ? 'deleted' : action === 'hide' ? 'hidden' : 'restored';
      toast.success(`${selectedGuestPhotos.size} guest photo(s) ${actionText}`);
      clearGuestSelection();
      fetchGalleryData();
    } catch (error) {
      toast.error(`Failed to ${action} photos`);
    } finally {
      setGuestBulkActionLoading(false);
    }
  };

  // Contributor link functions
  const generateContributorLink = async (sectionId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API}/galleries/${id}/sections/${sectionId}/contributor-link`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Check section type to use the correct URL prefix
      const section = sections.find(s => s.id === sectionId);
      const urlPrefix = section?.type === 'video' ? '/v/' : section?.type === 'fotoshare' ? '/f/' : '/c/';
      const linkType = section?.type === 'video' ? 'Video upload' : section?.type === 'fotoshare' ? '360 Booth upload' : 'Contributor';
      const contributorUrl = `${window.location.origin}${urlPrefix}${response.data.contributor_link}`;
      await navigator.clipboard.writeText(contributorUrl);
      toast.success(`${linkType} link created and copied to clipboard!`);
      fetchGalleryData();
    } catch (error) {
      toast.error('Failed to generate contributor link');
    }
  };

  const copyContributorLink = async (contributorLink, sectionId) => {
    // Check section type to use the correct URL prefix
    const section = sections.find(s => s.id === sectionId);
    const urlPrefix = section?.type === 'video' ? '/v/' : section?.type === 'fotoshare' ? '/f/' : '/c/';
    const contributorUrl = `${window.location.origin}${urlPrefix}${contributorLink}`;
    await navigator.clipboard.writeText(contributorUrl);
    toast.success('Link copied to clipboard!');
  };

  const showContributorQRCode = (contributorLink, sectionId) => {
    // Check section type to use the correct URL prefix
    const section = sections.find(s => s.id === sectionId);
    const urlPrefix = section?.type === 'video' ? '/v/' : section?.type === 'fotoshare' ? '/f/' : '/c/';
    const contributorUrl = `${window.location.origin}${urlPrefix}${contributorLink}`;
    setContributorQRLink(contributorUrl);
    setShowContributorQR(true);
  };

  const downloadContributorQR = () => {
    if (contributorQrRef.current) {
      const canvas = contributorQrRef.current.querySelector('canvas');
      if (canvas) {
        const link = document.createElement('a');
        link.download = `contributor-qr-${gallery?.title || 'upload'}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        toast.success('QR Code downloaded!');
      }
    }
  };

  const revokeContributorLink = async (sectionId) => {
    if (!window.confirm('Are you sure you want to revoke this contributor link? The contributor will no longer be able to upload photos.')) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(
        `${API}/galleries/${id}/sections/${sectionId}/contributor-link`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Contributor link revoked');
      fetchGalleryData();
    } catch (error) {
      toast.error('Failed to revoke contributor link');
    }
  };

  // Bulk action handler
  const handleBulkAction = async (action, sectionId = null) => {
    if (selectedPhotos.size === 0) {
      toast.error('No photos selected');
      return;
    }

    setBulkActionLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/galleries/${id}/photos/bulk-action`, {
        photo_ids: Array.from(selectedPhotos),
        action: action,
        section_id: sectionId
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success(`${action} applied to ${selectedPhotos.size} photos`);
      clearSelection();
      fetchGalleryData();
      setShowBulkActionModal(false);
    } catch (error) {
      toast.error(`Failed to ${action} photos`);
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Drag and drop reorder
  const handleDragStart = (e, photo) => {
    setDraggedPhoto(photo);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e, targetPhoto) => {
    e.preventDefault();
    if (!draggedPhoto || draggedPhoto.id === targetPhoto.id) return;

    // Get only photographer photos for reordering (matching the display logic)
    const photographerPhotos = photos.filter(p => p.uploaded_by === 'photographer');
    
    // Apply section filter if active
    const filteredPhotos = selectedSection 
      ? photographerPhotos.filter(p => p.section_id === selectedSection)
      : photographerPhotos;
    
    const dragIndex = filteredPhotos.findIndex(p => p.id === draggedPhoto.id);
    const dropIndex = filteredPhotos.findIndex(p => p.id === targetPhoto.id);
    
    // If either photo not found in filtered list, exit
    if (dragIndex === -1 || dropIndex === -1) {
      setDraggedPhoto(null);
      return;
    }
    
    // Reorder locally first for instant feedback
    const reordered = [...filteredPhotos];
    const [removed] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, removed);
    
    // Update order values
    const photoOrders = reordered.map((p, idx) => ({ id: p.id, order: idx }));
    
    // Optimistic update - merge reordered photos back with other photos
    setPhotos(prev => {
      // Get all photos NOT in our reordered set
      const otherPhotos = prev.filter(p => !reordered.find(r => r.id === p.id));
      // Return reordered photos with updated order + other photos
      return [...reordered.map((p, idx) => ({ ...p, order: idx })), ...otherPhotos];
    });
    
    // Save to backend
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/galleries/${id}/photos/reorder`, {
        photo_orders: photoOrders
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Photos reordered!');
    } catch (error) {
      toast.error('Failed to save order');
      fetchGalleryData(); // Revert on error
    }
    
    setDraggedPhoto(null);
  };

  // Toggle section expand/collapse
  const toggleSectionExpand = (sectionId) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  // Check if section is expanded
  const isSectionExpanded = (sectionId) => {
    return expandedSections[sectionId] ?? false;
  };

  // Download QR Code as PNG
  const downloadQRCode = () => {
    if (!qrRef.current) return;
    const svg = qrRef.current.querySelector('svg');
    if (!svg) return;
    
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      canvas.width = 512;
      canvas.height = 512;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, 512, 512);
      
      const pngUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      downloadLink.download = `${gallery?.title || 'gallery'}-qr-code.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      toast.success('QR Code downloaded!');
    };
    
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  useEffect(() => {
    fetchGalleryData();
    fetchGoogleDriveStatus();
    fetchSubscriptionStatus();
    fetchFotoshareVideos();
    fetchFlaggedPhotos();
    checkPhotoHealth();
  }, [id]);

  const fetchSubscriptionStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/user/subscription`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // We'll check gallery-specific download lock in fetchGalleryData
      // User-level can_download is for backwards compatibility
      if (!response.data.can_download) {
        // This is a fallback - gallery-specific check takes priority
      }
    } catch (error) {
      console.error('Failed to fetch subscription status');
    }
  };

  // Check if downloads are locked for this specific gallery
  const checkGalleryDownloadLock = (galleryData) => {
    if (galleryData.download_locked_until_payment) {
      setCanDownload(false);
      setDownloadDisabledReason('Downloads for this gallery are locked. Your payment is pending approval - once confirmed, downloads will be enabled.');
    } else {
      setCanDownload(true);
      setDownloadDisabledReason(null);
    }
  };

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
      const [galleryRes, photosRes, sectionsRes, videosRes, positionRes, presetsRes] = await Promise.all([
        axios.get(`${API}/galleries/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/galleries/${id}/photos`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/galleries/${id}/sections`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/galleries/${id}/videos`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => ({ data: [] })),
        axios.get(`${API}/galleries/${id}/cover-photo-position`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => ({ data: { scale: 1, positionX: 50, positionY: 50 } })),
        axios.get(`${API}/collage-presets`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => ({ data: [] }))
      ]);
      setGallery(galleryRes.data);
      setPhotos(photosRes.data);
      setSections(sectionsRes.data);
      setVideos(videosRes.data);
      setCoverPhotoPosition(positionRes.data);
      setCollagePresets(presetsRes.data);
      setSelectedCollagePreset(galleryRes.data.collage_preset_id || null);
      
      // Check gallery-specific download lock
      checkGalleryDownloadLock(galleryRes.data);
    } catch (error) {
      toast.error('Failed to load gallery');
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  // Save collage preset selection
  const handleSaveCollagePreset = async (presetId) => {
    setSavingPreset(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/galleries/${id}`, {
        collage_preset_id: presetId || null
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedCollagePreset(presetId);
      setGallery({ ...gallery, collage_preset_id: presetId });
      toast.success(presetId ? 'Collage layout saved!' : 'Using default layout');
      setShowCollagePresetPicker(false);
    } catch (error) {
      toast.error('Failed to save collage layout');
    } finally {
      setSavingPreset(false);
    }
  };

  // Fetch flagged photos for this gallery
  const fetchFlaggedPhotos = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/galleries/${id}/flagged-photos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFlaggedPhotos(response.data.photos || []);
    } catch (error) {
      console.error('Failed to fetch flagged photos:', error);
    }
  };

  // Check photo health status
  const checkPhotoHealth = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/galleries/${id}/photos/health`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPhotoHealthStatus(response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to check photo health:', error);
      return null;
    }
  };

  // Repair all thumbnails in the gallery
  const handleRepairThumbnails = async () => {
    setRepairingThumbnails(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API}/galleries/${id}/photos/repair-thumbnails`, 
        { force_regenerate: false },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const result = response.data;
      if (result.repaired > 0) {
        toast.success(`Repaired ${result.repaired} photo(s)! ${result.unflagged > 0 ? `${result.unflagged} photo(s) restored to gallery.` : ''}`);
        // Refresh photos and flagged photos
        fetchGalleryData();
        fetchFlaggedPhotos();
      } else if (result.already_valid > 0) {
        toast.success('All photos are already healthy!');
      } else if (result.failed > 0) {
        toast.warning(`${result.failed} photo(s) could not be repaired.`);
      }
      
      // Refresh health status
      checkPhotoHealth();
    } catch (error) {
      toast.error('Failed to repair thumbnails');
    } finally {
      setRepairingThumbnails(false);
    }
  };

  // Unflag a single photo
  const handleUnflagPhoto = async (photoId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/photos/${photoId}/unflag`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Photo restored to gallery');
      fetchFlaggedPhotos();
      fetchGalleryData();
    } catch (error) {
      toast.error('Failed to unflag photo');
    }
  };

  // Flag a single photo (hide from gallery)
  const handleFlagPhoto = async (photoId, reason = 'manual') => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/photos/${photoId}/flag?reason=${encodeURIComponent(reason)}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Photo hidden from gallery');
      fetchFlaggedPhotos();
      fetchGalleryData();
    } catch (error) {
      toast.error('Failed to flag photo');
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
      setCoverPhotoPosition({ scale: 1, positionX: 50, positionY: 50 });
      toast.success('Cover photo updated!');
    } catch (error) {
      toast.error('Failed to upload cover photo');
    }
  };

  const handleSaveCoverPosition = async (position) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/galleries/${id}/cover-photo-position`, position, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCoverPhotoPosition(position);
      setShowCoverEditor(false);
      toast.success('Cover photo position saved!');
    } catch (error) {
      toast.error('Failed to save cover photo position');
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
    
    // Validate files before uploading
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    const validFiles = [];
    const invalidFiles = [];
    
    for (const file of acceptedFiles) {
      if (file.size === 0) {
        invalidFiles.push({ name: file.name, reason: 'File is empty' });
      } else if (file.size > MAX_FILE_SIZE) {
        invalidFiles.push({ name: file.name, reason: 'File too large (max 50MB)' });
      } else if (!file.type.startsWith('image/')) {
        invalidFiles.push({ name: file.name, reason: 'Not an image file' });
      } else {
        validFiles.push(file);
      }
    }
    
    // Show warnings for invalid files
    if (invalidFiles.length > 0) {
      invalidFiles.forEach(f => toast.error(`${f.name}: ${f.reason}`));
    }
    
    if (validFiles.length === 0) {
      return;
    }
    
    setUploading(true);
    const token = localStorage.getItem('token');

    // Initialize progress tracking for each file
    const initialProgress = validFiles.map(file => ({
      name: file.name,
      status: 'pending',
      progress: 0,
      retries: 0
    }));
    setUploadProgress(initialProgress);

    // Upload function with retry logic
    const uploadWithRetry = async (file, index, maxRetries = 2) => {
      const formData = new FormData();
      formData.append('file', file);
      if (selectedSection) {
        formData.append('section_id', selectedSection);
      }
      
      let lastError;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            setUploadProgress(prev => prev.map((item, i) => 
              i === index ? { ...item, status: 'retrying', retries: attempt } : item
            ));
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
          
          const response = await axios.post(`${API}/galleries/${id}/photos`, formData, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'multipart/form-data'
            },
            timeout: 120000, // 2 minute timeout for large files
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
          lastError = error;
          // Don't retry for these errors
          if (error.response?.status === 403 || error.response?.status === 400 || error.response?.status === 409) {
            break;
          }
        }
      }
      
      // Mark as error with specific message
      let errorMsg = 'Upload failed';
      if (lastError?.response?.status === 403) {
        errorMsg = 'Storage full';
      } else if (lastError?.response?.status === 400) {
        errorMsg = lastError.response?.data?.detail || 'Invalid file';
      } else if (lastError?.response?.status === 409) {
        errorMsg = 'Duplicate file';
      } else if (lastError?.code === 'ECONNABORTED') {
        errorMsg = 'Timeout';
      }
      
      setUploadProgress(prev => prev.map((item, i) => 
        i === index ? { ...item, status: 'error', errorMsg } : item
      ));
      throw lastError;
    };

    // Sequential upload - one file at a time
    let successCount = 0;
    let failCount = 0;

    for (let index = 0; index < validFiles.length; index++) {
      const file = validFiles[index];
      
      // Update status to uploading
      setUploadProgress(prev => prev.map((item, i) => 
        i === index ? { ...item, status: 'uploading' } : item
      ));

      try {
        await uploadWithRetry(file, index);
        successCount++;
      } catch (error) {
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} photo(s) uploaded successfully!`);
      fetchGalleryData();
    }
    if (failCount > 0) {
      toast.error(`${failCount} photo(s) failed to upload`);
    }

    // Clear progress after a delay
    setTimeout(() => {
      setUploadProgress([]);
      setUploading(false);
    }, 3000);
  }, [id, selectedSection, fetchGalleryData]);

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
      
      if (newSectionType === 'fotoshare' && newFotoshareUrl.trim()) {
        // Create fotoshare section with URL - dedicated endpoint
        const response = await axios.post(`${API}/galleries/${id}/fotoshare-sections`, {
          name: newSectionName,
          fotoshare_url: newFotoshareUrl
        }, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        
        setSections([...sections, response.data.section]);
        toast.success(`360 Booth section created with ${response.data.videos_count} videos!`);
        // Fetch the fotoshare videos
        fetchFotoshareVideos();
      } else if (newSectionType === 'pcloud' && newPcloudUrl.trim()) {
        // Create pCloud section with URL - dedicated endpoint
        const response = await axios.post(`${API}/galleries/${id}/pcloud-sections`, {
          pcloud_url: newPcloudUrl,
          section_name: newSectionName
        }, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        
        setSections([...sections, response.data.section]);
        toast.success(`pCloud section created with ${response.data.photo_count} photos!`);
        // Fetch the pCloud photos
        fetchPcloudPhotos();
      } else {
        // Create regular section (photo, video, or fotoshare without URL)
        const formData = new FormData();
        formData.append('name', newSectionName);
        formData.append('type', newSectionType);
        
        const response = await axios.post(`${API}/galleries/${id}/sections`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        setSections([...sections, response.data]);
        const typeLabel = newSectionType === 'fotoshare' ? '360 Booth section created! Generate a contributor link to let suppliers add videos.' : 'Section created!';
        toast.success(typeLabel);
      }
      
      setNewSectionName('');
      setNewSectionType('photo');
      setNewFotoshareUrl('');
      setNewPcloudUrl('');
      setShowSectionForm(false);
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to create section';
      toast.error(errorMsg);
    }
  };

  // Fetch fotoshare videos
  const fetchFotoshareVideos = async () => {
    try {
      const response = await axios.get(`${API}/galleries/${id}/fotoshare-videos`);
      setFotoshareVideos(response.data);
    } catch (error) {
      console.error('Failed to fetch fotoshare videos');
    }
  };

  // Refresh fotoshare section
  const handleRefreshFotoshare = async (sectionId) => {
    setRefreshingSection(sectionId);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API}/galleries/${id}/fotoshare-sections/${sectionId}/refresh`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.success) {
        toast.success(`Refreshed! ${response.data.new_videos_added} new videos found.`);
        fetchFotoshareVideos();
        // Update section sync timestamp
        setSections(sections.map(s => 
          s.id === sectionId 
            ? { ...s, fotoshare_last_sync: new Date().toISOString(), fotoshare_expired: false }
            : s
        ));
      } else if (response.data.expired) {
        toast.error('This fotoshare link has expired');
        setSections(sections.map(s => 
          s.id === sectionId ? { ...s, fotoshare_expired: true } : s
        ));
      } else {
        toast.error(response.data.error || 'Failed to refresh');
      }
    } catch (error) {
      toast.error('Failed to refresh section');
    } finally {
      setRefreshingSection(null);
    }
  };

  // Fetch pCloud photos
  const fetchPcloudPhotos = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/galleries/${id}/pcloud-photos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPcloudPhotos(response.data);
    } catch (error) {
      console.error('Failed to fetch pCloud photos');
    }
  };

  // Refresh pCloud section
  const handleRefreshPcloud = async (sectionId) => {
    setRefreshingSection(sectionId);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API}/galleries/${id}/pcloud-sections/${sectionId}/refresh`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.success) {
        toast.success(`Refreshed! ${response.data.photos_added} new photos found.`);
        fetchPcloudPhotos();
        // Update section sync timestamp
        setSections(sections.map(s => 
          s.id === sectionId 
            ? { ...s, pcloud_last_sync: new Date().toISOString(), pcloud_error: null }
            : s
        ));
      } else {
        toast.error(response.data.error || 'Failed to refresh');
        setSections(sections.map(s => 
          s.id === sectionId ? { ...s, pcloud_error: response.data.error } : s
        ));
      }
    } catch (error) {
      toast.error('Failed to refresh section');
    } finally {
      setRefreshingSection(null);
    }
  };

  // Get pCloud photos by section
  const getPcloudPhotosBySection = (sectionId) => {
    return pcloudPhotos.filter(p => p.section_id === sectionId);
  };

  // Get fotoshare videos by section
  const getFotoshareVideosBySection = (sectionId) => {
    return fotoshareVideos.filter(v => v.section_id === sectionId);
  };

  // Get videos by section
  const getVideosBySection = (sectionId) => {
    return videos.filter(v => v.section_id === sectionId);
  };

  // Handle video deletion
  const handleDeleteVideo = async (videoId) => {
    if (!window.confirm('Are you sure you want to delete this video?')) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/galleries/${id}/videos/${videoId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setVideos(videos.filter(v => v.id !== videoId));
      toast.success('Video deleted');
    } catch (error) {
      toast.error('Failed to delete video');
    }
  };

  // Handle set featured video
  const handleSetFeaturedVideo = async (videoId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/galleries/${id}/videos/${videoId}/feature`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Update local state
      setVideos(videos.map(v => ({
        ...v,
        is_featured: v.id === videoId
      })));
      toast.success('Video set as featured');
    } catch (error) {
      toast.error('Failed to update featured video');
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

  const handleRenameSection = async (sectionId, newName) => {
    if (!newName || !newName.trim()) {
      toast.error('Section name is required');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/galleries/${id}/sections/${sectionId}`, 
        { name: newName.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSections(sections.map(s => 
        s.id === sectionId ? { ...s, name: newName.trim() } : s
      ));
      setEditingSectionId(null);
      setEditingSectionName('');
      toast.success('Section renamed');
    } catch (error) {
      toast.error('Failed to rename section');
    }
  };

  const startEditingSection = (section) => {
    setEditingSectionId(section.id);
    setEditingSectionName(section.name);
  };

  // Download All functionality
  const handleDownloadAll = async () => {
    if (isPreparingDownload) return; // Prevent double-click
    
    setIsPreparingDownload(true);
    toast.loading('Preparing download...', { id: 'prepare-download' });
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/galleries/${id}/download-info`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDownloadInfo(response.data);
      setDownloadingChunks({});
      setDownloadedChunks({});
      setShowDownloadModal(true);
      toast.success('Download ready!', { id: 'prepare-download' });
    } catch (error) {
      toast.error('Failed to get download info', { id: 'prepare-download' });
    } finally {
      setIsPreparingDownload(false);
    }
  };

  const downloadChunk = async (chunkNumber) => {
    if (downloadingChunks[chunkNumber]) return; // Already downloading

    setDownloadingChunks(prev => ({ ...prev, [chunkNumber]: true }));
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/galleries/${id}/download/${chunkNumber}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Get filename from Content-Disposition header or create one
      const contentDisposition = response.headers['content-disposition'];
      let filename = `${gallery.title}_part${chunkNumber}.zip`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename=(.+)/);
        if (filenameMatch) {
          filename = filenameMatch[1].replace(/"/g, '');
        }
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      setDownloadedChunks(prev => ({ ...prev, [chunkNumber]: true }));
      toast.success(`Downloaded ${filename}`);
    } catch (error) {
      toast.error(`Failed to download part ${chunkNumber}`);
    } finally {
      setDownloadingChunks(prev => ({ ...prev, [chunkNumber]: false }));
    }
  };

  const downloadAllChunks = async () => {
    if (!downloadInfo) return;
    
    for (let i = 1; i <= downloadInfo.chunk_count; i++) {
      if (!downloadedChunks[i]) {
        await downloadChunk(i);
        // Small delay between downloads to prevent browser issues
        await new Promise(resolve => setTimeout(resolve, 500));
      }
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
      coordinator_name: gallery.coordinator_name || '',
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
        coordinator_name: editFormData.coordinator_name || null,
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
    return photos
      .filter(p => p.section_id === sectionId && (p.uploaded_by === 'photographer' || p.uploaded_by === 'contributor'))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  };

  const getPhotosWithoutSection = () => {
    return photos
      .filter(p => !p.section_id && p.uploaded_by === 'photographer')
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  };

  const getGuestPhotos = () => {
    return photos.filter(p => p.uploaded_by === 'guest');
  };

  const getContributorPhotos = () => {
    return photos.filter(p => p.uploaded_by === 'contributor');
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
            {brandConfig.brand_name || 'PhotoShare'}
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
              data-testid="qr-code-button"
              onClick={() => {
                if (isFeatureEnabled('qr_share')) {
                  setShowQRCode(true);
                } else {
                  toast.error(getUnavailableMessage());
                }
              }}
              className={`border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-6 rounded-sm transition-all duration-300 flex items-center gap-2 ${!isFeatureEnabled('qr_share') ? 'opacity-50' : ''}`}
            >
              <QrCode className="w-4 h-4" strokeWidth={1.5} />
              QR Code
            </button>
            <button
              data-testid="embed-code-button"
              onClick={() => setShowEmbedModal(true)}
              className="border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-6 rounded-sm transition-all duration-300 flex items-center gap-2"
            >
              <Code className="w-4 h-4" strokeWidth={1.5} />
              Embed
            </button>
            <button
              data-testid="open-share-link-button"
              onClick={() => {
                if (isFeatureEnabled('online_gallery')) {
                  openShareLink();
                } else {
                  toast.error(getUnavailableMessage());
                }
              }}
              className={`border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-6 rounded-sm transition-all duration-300 flex items-center gap-2 ${!isFeatureEnabled('online_gallery') ? 'opacity-50' : ''}`}
            >
              <ExternalLink className="w-4 h-4" strokeWidth={1.5} />
              View Public Gallery
            </button>
            {isFeatureEnabled('display_mode') ? (
            <div className="relative group">
              <button
                data-testid="display-mode-button"
                className="border border-purple-300 bg-white hover:bg-purple-50 text-purple-700 h-10 px-6 rounded-sm transition-all duration-300 flex items-center gap-2"
              >
                <Monitor className="w-4 h-4" strokeWidth={1.5} />
                Display Mode
                <ChevronDown className="w-3 h-3" />
              </button>
              <div className="absolute top-full left-0 mt-1 bg-white border border-zinc-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 min-w-[260px]">
                {/* Slideshow Mode */}
                <div className="p-2 border-b border-zinc-100">
                  <div className="text-xs text-zinc-400 px-2 py-1 font-medium">Slideshow Mode</div>
                  <button
                    onClick={() => window.open(`/display/${gallery?.share_link}?mode=slideshow`, '_blank')}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 flex items-center gap-3 rounded"
                  >
                    <div className="w-7 h-7 bg-purple-100 rounded flex items-center justify-center">
                      <Play className="w-3.5 h-3.5 text-purple-600" />
                    </div>
                    <span>Open Slideshow</span>
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/display/${gallery?.share_link}?mode=slideshow`);
                      toast.success('Slideshow link copied!');
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 flex items-center gap-3 rounded"
                  >
                    <div className="w-7 h-7 bg-zinc-100 rounded flex items-center justify-center">
                      <Copy className="w-3.5 h-3.5 text-zinc-600" />
                    </div>
                    <span>Copy Link</span>
                  </button>
                  <button
                    onClick={() => { setDisplayQRMode('slideshow'); setShowDisplayQR(true); }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 flex items-center gap-3 rounded"
                  >
                    <div className="w-7 h-7 bg-zinc-100 rounded flex items-center justify-center">
                      <QrCode className="w-3.5 h-3.5 text-zinc-600" />
                    </div>
                    <span>Show QR Code</span>
                  </button>
                </div>
                {/* Live Collage Mode */}
                <div className="p-2">
                  <div className="text-xs text-zinc-400 px-2 py-1 font-medium">Live Collage Mode</div>
                  <button
                    onClick={() => window.open(`/display/${gallery?.share_link}?mode=collage`, '_blank')}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 flex items-center gap-3 rounded"
                  >
                    <div className="w-7 h-7 bg-purple-100 rounded flex items-center justify-center">
                      <Grid className="w-3.5 h-3.5 text-purple-600" />
                    </div>
                    <span>Open Collage</span>
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/display/${gallery?.share_link}?mode=collage`);
                      toast.success('Collage link copied!');
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 flex items-center gap-3 rounded"
                  >
                    <div className="w-7 h-7 bg-zinc-100 rounded flex items-center justify-center">
                      <Copy className="w-3.5 h-3.5 text-zinc-600" />
                    </div>
                    <span>Copy Link</span>
                  </button>
                  <button
                    onClick={() => { setDisplayQRMode('collage'); setShowDisplayQR(true); }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 flex items-center gap-3 rounded"
                  >
                    <div className="w-7 h-7 bg-zinc-100 rounded flex items-center justify-center">
                      <QrCode className="w-3.5 h-3.5 text-zinc-600" />
                    </div>
                    <span>Show QR Code</span>
                  </button>
                  <button
                    onClick={() => setShowCollagePresetPicker(true)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-purple-50 flex items-center gap-3 rounded border-t border-zinc-100 mt-1 pt-2"
                    data-testid="choose-collage-layout-btn"
                  >
                    <div className="w-7 h-7 bg-purple-100 rounded flex items-center justify-center">
                      <Settings2 className="w-3.5 h-3.5 text-purple-600" />
                    </div>
                    <div className="flex flex-col items-start">
                      <span>Choose Layout</span>
                      {selectedCollagePreset && collagePresets.find(p => p.id === selectedCollagePreset) && (
                        <span className="text-xs text-purple-600">
                          {collagePresets.find(p => p.id === selectedCollagePreset)?.name}
                        </span>
                      )}
                    </div>
                  </button>
                </div>
              </div>
            </div>
            ) : (
              <button
                onClick={() => toast.error(getUnavailableMessage())}
                className="border border-purple-300 bg-white text-purple-700 h-10 px-6 rounded-sm flex items-center gap-2 opacity-50 cursor-not-allowed"
              >
                <Monitor className="w-4 h-4" strokeWidth={1.5} />
                Display Mode
              </button>
            )}
            {!canDownload ? (
              <div className="relative group">
                <button
                  data-testid="download-all-button"
                  disabled
                  className="border border-zinc-300 bg-zinc-100 text-zinc-400 h-10 px-6 rounded-sm cursor-not-allowed flex items-center gap-2"
                  title={downloadDisabledReason}
                >
                  <Lock className="w-4 h-4" strokeWidth={1.5} />
                  Download Disabled
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-zinc-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  {downloadDisabledReason}
                </div>
              </div>
            ) : (
              <button
                data-testid="download-all-button"
                onClick={handleDownloadAll}
                disabled={isPreparingDownload}
                className="border border-green-300 bg-white hover:bg-green-50 text-green-700 h-10 px-6 rounded-sm transition-all duration-300 flex items-center gap-2 disabled:opacity-70"
              >
                {isPreparingDownload ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Preparing...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" strokeWidth={1.5} />
                    Download All
                  </>
                )}
              </button>
            )}
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

        {/* Embed Code Modal */}
        {showEmbedModal && (
          <EmbedCodeModal
            galleryTitle={gallery?.title || 'Gallery'}
            shareLink={`${window.location.origin}/g/${gallery?.share_link}`}
            onClose={() => setShowEmbedModal(false)}
          />
        )}

        {/* QR Code Modal */}
        {showQRCode && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg max-w-sm w-full p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-medium">Gallery QR Code</h3>
                <button 
                  onClick={() => setShowQRCode(false)} 
                  className="p-2 hover:bg-zinc-100 rounded-full"
                  data-testid="close-qr-modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div ref={qrRef} className="flex justify-center p-4 bg-white border border-zinc-200 rounded-lg">
                <QRCodeSVG 
                  value={`${BACKEND_URL}/g/${gallery?.share_link}`}
                  size={256}
                  level="H"
                  includeMargin={true}
                />
              </div>
              
              <p className="text-center text-sm text-zinc-500 mt-4 mb-4">
                Scan to access: <span className="font-medium">{gallery?.title}</span>
              </p>
              
              <button
                onClick={downloadQRCode}
                data-testid="download-qr-button"
                className="w-full bg-zinc-900 text-white py-3 rounded-lg hover:bg-zinc-800 font-medium flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download QR Code
              </button>
            </div>
          </div>
        )}

        {/* Display Mode QR Modal */}
        {showDisplayQR && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg max-w-sm w-full p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-medium">
                  {displayQRMode === 'slideshow' ? 'Slideshow' : 'Live Collage'} QR Code
                </h3>
                <button 
                  onClick={() => setShowDisplayQR(false)} 
                  className="p-2 hover:bg-zinc-100 rounded-full"
                  data-testid="close-display-qr-modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div ref={displayQrRef} className="flex justify-center p-4 bg-white border border-zinc-200 rounded-lg">
                <QRCodeSVG 
                  value={`${window.location.origin}/display/${gallery?.share_link}?mode=${displayQRMode}`}
                  size={256}
                  level="H"
                  includeMargin={true}
                />
              </div>
              
              <p className="text-center text-sm text-zinc-500 mt-4 mb-2">
                Scan to view {displayQRMode === 'slideshow' ? 'slideshow' : 'live collage'}
              </p>
              <p className="text-center text-xs text-zinc-400 mb-4">
                {gallery?.title}
              </p>
              
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/display/${gallery?.share_link}?mode=${displayQRMode}`);
                    toast.success('Link copied!');
                  }}
                  data-testid="copy-display-link-btn"
                  className="flex-1 bg-zinc-100 text-zinc-900 py-3 rounded-lg hover:bg-zinc-200 font-medium flex items-center justify-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  Copy Link
                </button>
                <button
                  onClick={() => {
                    const svg = displayQrRef.current?.querySelector('svg');
                    if (!svg) return;
                    const svgData = new XMLSerializer().serializeToString(svg);
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const img = new Image();
                    img.onload = () => {
                      canvas.width = img.width;
                      canvas.height = img.height;
                      ctx.fillStyle = 'white';
                      ctx.fillRect(0, 0, canvas.width, canvas.height);
                      ctx.drawImage(img, 0, 0);
                      const link = document.createElement('a');
                      link.download = `${gallery?.title || 'gallery'}-${displayQRMode}-qr.png`;
                      link.href = canvas.toDataURL('image/png');
                      link.click();
                    };
                    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
                  }}
                  data-testid="download-display-qr-btn"
                  className="flex-1 bg-zinc-900 text-white py-3 rounded-lg hover:bg-zinc-800 font-medium flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Contributor QR Code Modal */}
        {showContributorQR && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" data-testid="contributor-qr-modal">
            <div className="bg-white rounded-xl max-w-md w-full overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-zinc-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold">Contributor Upload QR</h3>
                    <p className="text-sm text-zinc-500 mt-1">Share this QR code for photo uploads</p>
                  </div>
                  <button
                    onClick={() => setShowContributorQR(false)}
                    className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              <div className="p-6">
                <div ref={contributorQrRef} className="bg-white p-6 rounded-lg flex justify-center">
                  <QRCodeSVG 
                    value={contributorQRLink}
                    size={200}
                    level="H"
                    includeMargin={true}
                  />
                </div>
                <p className="text-center text-sm text-zinc-500 mt-4 break-all px-4">
                  {contributorQRLink}
                </p>
              </div>
              
              <div className="p-4 border-t border-zinc-200 flex gap-3">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(contributorQRLink);
                    toast.success('Link copied!');
                  }}
                  className="flex-1 border border-zinc-300 py-3 rounded-lg hover:bg-zinc-50 font-medium flex items-center justify-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  Copy Link
                </button>
                <button
                  onClick={() => {
                    const svg = contributorQrRef.current?.querySelector('svg');
                    if (svg) {
                      const svgData = new XMLSerializer().serializeToString(svg);
                      const canvas = document.createElement('canvas');
                      const ctx = canvas.getContext('2d');
                      const img = new Image();
                      img.onload = () => {
                        canvas.width = img.width;
                        canvas.height = img.height;
                        ctx.fillStyle = 'white';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(img, 0, 0);
                        const link = document.createElement('a');
                        link.download = `contributor-upload-qr-${gallery?.title || 'gallery'}.png`;
                        link.href = canvas.toDataURL('image/png');
                        link.click();
                        toast.success('QR Code downloaded!');
                      };
                      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
                    }
                  }}
                  data-testid="download-contributor-qr-btn"
                  className="flex-1 bg-zinc-900 text-white py-3 rounded-lg hover:bg-zinc-800 font-medium flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Collage Layout Preset Picker Modal */}
        {showCollagePresetPicker && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" data-testid="collage-preset-picker-modal">
            <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-zinc-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold">Choose Collage Layout</h3>
                    <p className="text-sm text-zinc-500 mt-1">Select a layout for your live collage display</p>
                  </div>
                  <button
                    onClick={() => setShowCollagePresetPicker(false)}
                    className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              <div className="p-6 overflow-y-auto max-h-[50vh]">
                {collagePresets.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500">
                    <Grid className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No layout presets available</p>
                    <p className="text-sm mt-1">Contact your administrator to create layouts</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {/* Default option */}
                    <button
                      onClick={() => handleSaveCollagePreset(null)}
                      disabled={savingPreset}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        !selectedCollagePreset 
                          ? 'border-purple-500 bg-purple-50' 
                          : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                      }`}
                      data-testid="preset-option-default"
                    >
                      <div className="aspect-video bg-zinc-200 rounded-lg mb-3 flex items-center justify-center">
                        <Grid className="w-8 h-8 text-zinc-400" />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-zinc-900">Default Layout</p>
                          <p className="text-xs text-zinc-500">System default mosaic</p>
                        </div>
                        {!selectedCollagePreset && (
                          <Check className="w-5 h-5 text-purple-600" />
                        )}
                      </div>
                    </button>
                    
                    {/* Preset options */}
                    {collagePresets.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => handleSaveCollagePreset(preset.id)}
                        disabled={savingPreset}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                          selectedCollagePreset === preset.id 
                            ? 'border-purple-500 bg-purple-50' 
                            : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                        }`}
                        data-testid={`preset-option-${preset.id}`}
                      >
                        {/* Mini preview of layout */}
                        <div className="aspect-video bg-zinc-900 rounded-lg mb-3 relative overflow-hidden">
                          {preset.placeholders?.slice(0, 6).map((ph, idx) => (
                            <div
                              key={idx}
                              className="absolute bg-zinc-700 rounded-sm"
                              style={{
                                left: `${ph.x}%`,
                                top: `${ph.y}%`,
                                width: `${ph.width}%`,
                                height: `${ph.height}%`,
                              }}
                            />
                          ))}
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-zinc-900">{preset.name}</p>
                            <p className="text-xs text-zinc-500">
                              {preset.placeholders?.length || 0} tiles
                              {preset.is_default && ' • Default'}
                            </p>
                          </div>
                          {selectedCollagePreset === preset.id && (
                            <Check className="w-5 h-5 text-purple-600" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="p-4 border-t border-zinc-200 bg-zinc-50 flex justify-end gap-3">
                <button
                  onClick={() => setShowCollagePresetPicker(false)}
                  className="px-4 py-2 border border-zinc-300 rounded-lg hover:bg-zinc-100 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

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
              <div className="relative">
                <div 
                  className="rounded-sm overflow-hidden border border-zinc-200"
                  style={{ paddingBottom: '33.33%', position: 'relative' }}
                >
                  <img
                    src={`${BACKEND_URL}${gallery.cover_photo_url}`}
                    alt="Cover"
                    className="absolute inset-0 w-full h-full"
                    style={{
                      objectFit: 'cover',
                      objectPosition: `${coverPhotoPosition.positionX}% ${coverPhotoPosition.positionY}%`,
                      transform: `scale(${coverPhotoPosition.scale})`,
                      transformOrigin: 'center center'
                    }}
                  />
                </div>
                <button
                  onClick={() => setShowCoverEditor(true)}
                  data-testid="edit-cover-position-btn"
                  className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full transition-colors"
                  title="Adjust cover photo position"
                >
                  <Settings2 className="w-4 h-4" />
                </button>
                <p className="text-xs text-zinc-500 mt-2 text-center">
                  Click the settings icon to adjust position and zoom
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Cover Photo Editor Modal */}
        {showCoverEditor && gallery.cover_photo_url && (
          <CoverPhotoEditor
            imageUrl={`${BACKEND_URL}${gallery.cover_photo_url}`}
            initialSettings={coverPhotoPosition}
            onSave={handleSaveCoverPosition}
            onCancel={() => setShowCoverEditor(false)}
            aspectRatio={3}
          />
        )}

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
            <form onSubmit={handleCreateSection} className="mb-6 p-4 bg-zinc-50 rounded-lg border border-zinc-200">
              <div className="flex gap-3 mb-3">
                <input
                  data-testid="section-name-input"
                  type="text"
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  placeholder={newSectionType === 'fotoshare' ? "e.g., 360 Glam Booth Moments" : "e.g., Wedding Ceremony, Reception, Video Highlights"}
                  className="flex h-10 flex-1 rounded-sm border border-input bg-white px-3 py-2 text-sm"
                  autoFocus
                />
              </div>
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <span className="text-sm text-zinc-600">Section type:</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="sectionType"
                    value="photo"
                    checked={newSectionType === 'photo'}
                    onChange={() => setNewSectionType('photo')}
                    className="accent-primary"
                  />
                  <ImageIcon className="w-4 h-4 text-zinc-600" />
                  <span className="text-sm">Photos</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="sectionType"
                    value="video"
                    checked={newSectionType === 'video'}
                    onChange={() => setNewSectionType('video')}
                    className="accent-purple-600"
                  />
                  <Film className="w-4 h-4 text-purple-600" />
                  <span className="text-sm">Videos</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="sectionType"
                    value="fotoshare"
                    checked={newSectionType === 'fotoshare'}
                    onChange={() => setNewSectionType('fotoshare')}
                    className="accent-pink-500"
                  />
                  <Camera className="w-4 h-4 text-pink-500" />
                  <span className="text-sm">360 Booth</span>
                </label>
              </div>
              
              {/* Fotoshare URL input - only shown when fotoshare type selected */}
              {newSectionType === 'fotoshare' && (
                <div className="mb-4 p-3 bg-pink-50 border border-pink-200 rounded-md">
                  <label className="flex items-center gap-2 text-sm text-pink-700 font-medium mb-2">
                    <Sparkles className="w-4 h-4" />
                    Fotoshare.co Event URL (Optional)
                  </label>
                  <input
                    type="url"
                    data-testid="fotoshare-url-input"
                    value={newFotoshareUrl}
                    onChange={(e) => setNewFotoshareUrl(e.target.value)}
                    placeholder="https://fotoshare.co/e/your-event-id"
                    className="flex h-10 w-full rounded-sm border border-pink-300 bg-white px-3 py-2 text-sm focus:border-pink-500 focus:ring-pink-500"
                  />
                  <p className="text-xs text-pink-600 mt-1">
                    Enter URL now to import videos, or leave blank and generate a contributor link for your supplier
                  </p>
                </div>
              )}
              
              <div className="flex gap-3">
                <button
                  type="submit"
                  data-testid="create-section-button"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-6 rounded-sm font-medium"
                >
                  Create Section
                </button>
                <button
                  type="button"
                  onClick={() => { setShowSectionForm(false); setNewSectionType('photo'); setNewFotoshareUrl(''); }}
                  className="border border-input h-10 px-6 rounded-sm"
                >
                  Cancel
                </button>
              </div>
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
            {sections.map((section, index) => (
              <div 
                key={section.id} 
                className={`relative group cursor-move ${draggedSection?.id === section.id ? 'opacity-50' : ''}`}
                draggable
                onDragStart={(e) => handleSectionDragStart(e, section)}
                onDragOver={(e) => handleSectionDragOver(e, section)}
                onDragLeave={handleSectionDragLeave}
                onDrop={(e) => handleSectionDrop(e, section)}
                onDragEnd={handleSectionDragEnd}
              >
                {/* Drop indicator - before */}
                {dropTargetId === section.id && dropPosition === 'before' && (
                  <div className="absolute -top-1 left-0 right-0 h-0.5 bg-zinc-900 z-10" />
                )}
                
                {editingSectionId === section.id ? (
                  <div className="flex items-center gap-2 w-full">
                    <input
                      type="text"
                      value={editingSectionName}
                      onChange={(e) => setEditingSectionName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSection(section.id, editingSectionName);
                        if (e.key === 'Escape') { setEditingSectionId(null); setEditingSectionName(''); }
                      }}
                      className="flex-1 h-10 px-3 border border-zinc-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      autoFocus
                      data-testid={`section-rename-input-${section.id}`}
                    />
                    <button
                      onClick={() => handleRenameSection(section.id, editingSectionName)}
                      className="p-2 bg-green-500 text-white rounded-sm hover:bg-green-600"
                      title="Save"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { setEditingSectionId(null); setEditingSectionName(''); }}
                      className="p-2 bg-zinc-200 text-zinc-600 rounded-sm hover:bg-zinc-300"
                      title="Cancel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      data-testid={`section-${section.id}-button`}
                      onClick={() => setSelectedSection(section.id)}
                      className={`w-full h-12 rounded-sm font-medium transition-all duration-300 flex items-center justify-center gap-2 ${
                        selectedSection === section.id
                          ? section.type === 'video' ? 'bg-purple-600 text-white' 
                            : section.type === 'fotoshare' ? 'bg-pink-500 text-white'
                            : 'bg-primary text-primary-foreground'
                          : section.type === 'video' ? 'border border-purple-300 hover:bg-purple-50' 
                            : section.type === 'fotoshare' ? 'border border-pink-300 hover:bg-pink-50'
                            : 'border border-zinc-200 hover:bg-zinc-50'
                      }`}
                    >
                      <GripVertical className="w-4 h-4 opacity-50" />
                      {section.type === 'video' && <Film className="w-4 h-4" />}
                      {section.type === 'fotoshare' && <Camera className="w-4 h-4" />}
                      {section.name}
                      {section.type === 'fotoshare' && section.fotoshare_expired && (
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      )}
                    </button>
                    {/* Refresh button for fotoshare sections */}
                    {section.type === 'fotoshare' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRefreshFotoshare(section.id); }}
                        disabled={refreshingSection === section.id}
                        className="absolute -top-2 left-6 bg-pink-500 text-white w-6 h-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center disabled:opacity-50"
                        title="Refresh from fotoshare.co"
                      >
                        {refreshingSection === section.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3 h-3" strokeWidth={2} />
                        )}
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); startEditingSection(section); }}
                      className="absolute -top-2 -left-2 bg-blue-500 text-white w-6 h-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      title="Rename section"
                    >
                      <Edit2 className="w-3 h-3" strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => handleDeleteSection(section.id)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white w-6 h-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      title="Delete section"
                    >
                      <X className="w-3 h-3" strokeWidth={2} />
                    </button>
                  </>
                )}
                {/* Contributor link indicator */}
                {section.contributor_link && (
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-green-500 text-white px-2 py-0.5 rounded-full text-xs flex items-center gap-1">
                    <Upload className="w-3 h-3" /> Contributor
                  </div>
                )}
                
                {/* Drop indicator - after */}
                {dropTargetId === section.id && dropPosition === 'after' && (
                  <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-zinc-900 z-10" />
                )}
              </div>
            ))}
          </div>
          
          {/* Contributor Link Management Card */}
          {selectedSection && isFeatureEnabled('contributor_link') && (
            <div className="mt-6 bg-zinc-50 border border-zinc-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-zinc-900">Contributor Upload Link</h4>
                  <p className="text-sm text-zinc-600 mt-1">
                    Share this link with external teams to let them upload photos to &ldquo;{sections.find(s => s.id === selectedSection)?.name}&rdquo;
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {sections.find(s => s.id === selectedSection)?.contributor_link ? (
                    <>
                      <button
                        onClick={() => copyContributorLink(sections.find(s => s.id === selectedSection)?.contributor_link, selectedSection)}
                        className="px-4 py-2 bg-white border border-zinc-300 hover:bg-zinc-50 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        data-testid="copy-contributor-link"
                      >
                        <Copy className="w-4 h-4" /> Copy Link
                      </button>
                      <button
                        onClick={() => showContributorQRCode(sections.find(s => s.id === selectedSection)?.contributor_link, selectedSection)}
                        className="px-4 py-2 bg-white border border-zinc-300 hover:bg-zinc-50 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        data-testid="show-contributor-qr"
                      >
                        <QrCode className="w-4 h-4" /> QR Code
                      </button>
                      <button
                        onClick={() => revokeContributorLink(selectedSection)}
                        className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-sm font-medium transition-colors"
                        data-testid="revoke-contributor-link"
                      >
                        Revoke
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => generateContributorLink(selectedSection)}
                      className="px-4 py-2 bg-primary text-white hover:bg-primary/90 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                      data-testid="generate-contributor-link"
                    >
                      <Upload className="w-4 h-4" /> Generate Link
                    </button>
                  )}
                </div>
              </div>
              {sections.find(s => s.id === selectedSection)?.contributor_name && (
                <div className="mt-3 pt-3 border-t border-zinc-200">
                  <p className="text-sm text-zinc-600">
                    Contributor: <span className="font-medium text-zinc-900">{sections.find(s => s.id === selectedSection)?.contributor_name}</span>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Video Section Management - Show when a video section is selected */}
        {selectedSection && sections.find(s => s.id === selectedSection)?.type === 'video' && (
          <div className="mb-12 bg-purple-50 rounded-xl p-6 border border-purple-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-normal flex items-center gap-3" style={{ fontFamily: 'Playfair Display, serif' }}>
                <Film className="w-6 h-6 text-purple-600" />
                Video Section: {sections.find(s => s.id === selectedSection)?.name}
              </h3>
              <span className="text-purple-600 text-sm font-medium">
                {getVideosBySection(selectedSection).length} video(s)
              </span>
            </div>
            
            {/* Video contributor link info */}
            {sections.find(s => s.id === selectedSection)?.contributor_link ? (
              <div className="bg-white rounded-lg p-4 mb-6 border border-purple-200">
                <p className="text-sm text-zinc-600 mb-2">
                  Videographers can upload via:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-purple-100 px-3 py-2 rounded text-sm font-mono text-purple-800 truncate">
                    {window.location.origin}/v/{sections.find(s => s.id === selectedSection)?.contributor_link}
                  </code>
                  <button
                    onClick={() => copyContributorLink(sections.find(s => s.id === selectedSection)?.contributor_link, selectedSection)}
                    className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => showContributorQRCode(sections.find(s => s.id === selectedSection)?.contributor_link, selectedSection)}
                    className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                  >
                    <QrCode className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg p-4 mb-6 border border-purple-200 text-center">
                <p className="text-zinc-600 mb-3">Generate a contributor link to let videographers add videos</p>
                <button
                  onClick={() => generateContributorLink(selectedSection)}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Generate Video Upload Link
                </button>
              </div>
            )}
            
            {/* Videos Grid */}
            {getVideosBySection(selectedSection).length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {getVideosBySection(selectedSection).map((video) => (
                  <div 
                    key={video.id}
                    className={`relative group bg-white rounded-lg overflow-hidden border-2 ${
                      video.is_featured ? 'border-yellow-400' : 'border-transparent'
                    } hover:border-purple-400 transition-colors`}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-video bg-zinc-900 relative">
                      <img
                        src={video.thumbnail_url || video.youtube_thumbnail_url || `https://img.youtube.com/vi/${video.video_id}/maxresdefault.jpg`}
                        alt={video.title || video.tag}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.src = `https://img.youtube.com/vi/${video.video_id}/hqdefault.jpg`;
                        }}
                      />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <Play className="w-10 h-10 text-white" fill="white" />
                      </div>
                      {video.is_featured && (
                        <div className="absolute top-2 left-2 bg-yellow-500 text-black text-xs px-2 py-1 rounded font-semibold flex items-center gap-1">
                          <Star className="w-3 h-3" fill="currentColor" /> Featured
                        </div>
                      )}
                      <span className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                        {video.tag}
                      </span>
                    </div>
                    
                    {/* Info */}
                    <div className="p-3">
                      <h4 className="text-sm font-medium text-zinc-800 truncate">
                        {video.title || video.tag}
                      </h4>
                      {video.contributor_name && (
                        <p className="text-xs text-zinc-500 truncate">by {video.contributor_name}</p>
                      )}
                    </div>
                    
                    {/* Actions */}
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!video.is_featured && (
                        <button
                          onClick={() => handleSetFeaturedVideo(video.id)}
                          className="p-1.5 bg-yellow-500 text-black rounded-full hover:bg-yellow-600"
                          title="Set as featured"
                        >
                          <Star className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <a
                        href={video.youtube_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 bg-white text-zinc-700 rounded-full hover:bg-zinc-100"
                        title="View on YouTube"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => handleDeleteVideo(video.id)}
                        className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600"
                        title="Delete video"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-zinc-500">
                <Video className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No videos in this section yet</p>
                <p className="text-sm mt-1">Share the contributor link with your videographer</p>
              </div>
            )}
          </div>
        )}

        {/* 360 Booth / Fotoshare Section Management - Show when a fotoshare section is selected */}
        {selectedSection && sections.find(s => s.id === selectedSection)?.type === 'fotoshare' && (
          <div className="mb-12 bg-pink-50 rounded-xl p-6 border border-pink-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-normal flex items-center gap-3" style={{ fontFamily: 'Playfair Display, serif' }}>
                <Camera className="w-6 h-6 text-pink-500" />
                360 Booth: {sections.find(s => s.id === selectedSection)?.name}
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-pink-600 text-sm font-medium">
                  {getFotoshareVideosBySection(selectedSection).length} video(s)
                </span>
                <button
                  onClick={() => handleRefreshFotoshare(selectedSection)}
                  disabled={refreshingSection === selectedSection}
                  className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:opacity-50 transition-colors flex items-center gap-2"
                  data-testid="refresh-fotoshare-btn"
                >
                  {refreshingSection === selectedSection ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4" />
                  )}
                  Refresh
                </button>
              </div>
            </div>
            
            {/* Contributor Link for 360 Booth Suppliers */}
            {sections.find(s => s.id === selectedSection)?.contributor_link ? (
              <div className="bg-white rounded-lg p-4 mb-6 border border-pink-200">
                <p className="text-sm text-zinc-600 mb-2">
                  360 Booth suppliers can upload via:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-pink-100 px-3 py-2 rounded text-sm font-mono text-pink-800 truncate">
                    {window.location.origin}/f/{sections.find(s => s.id === selectedSection)?.contributor_link}
                  </code>
                  <button
                    onClick={() => copyContributorLink(sections.find(s => s.id === selectedSection)?.contributor_link, selectedSection)}
                    className="p-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600"
                    title="Copy link"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => showContributorQRCode(sections.find(s => s.id === selectedSection)?.contributor_link, selectedSection)}
                    className="p-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600"
                    title="Show QR Code"
                  >
                    <QrCode className="w-4 h-4" />
                  </button>
                </div>
                {sections.find(s => s.id === selectedSection)?.contributor_name && (
                  <p className="text-xs text-pink-600 mt-2">
                    Supplier: {sections.find(s => s.id === selectedSection)?.contributor_name}
                  </p>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-lg p-4 mb-6 border border-pink-200 text-center">
                <p className="text-zinc-600 mb-3">Generate a contributor link to let 360 booth suppliers add videos</p>
                <button
                  onClick={() => generateContributorLink(selectedSection)}
                  className="bg-pink-500 text-white px-4 py-2 rounded-lg hover:bg-pink-600 inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Generate 360 Booth Upload Link
                </button>
              </div>
            )}
            
            {/* Fotoshare URL info - show if URL exists */}
            {sections.find(s => s.id === selectedSection)?.fotoshare_url && (
              <div className="bg-white rounded-lg p-4 mb-6 border border-pink-200">
                <p className="text-sm text-zinc-600 mb-2">
                  Source: <a 
                    href={sections.find(s => s.id === selectedSection)?.fotoshare_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-pink-600 hover:underline"
                  >
                    {sections.find(s => s.id === selectedSection)?.fotoshare_url}
                  </a>
                </p>
                {sections.find(s => s.id === selectedSection)?.fotoshare_last_sync && (
                  <p className="text-xs text-zinc-500">
                    Last synced: {new Date(sections.find(s => s.id === selectedSection)?.fotoshare_last_sync).toLocaleString()}
                  </p>
                )}
                {sections.find(s => s.id === selectedSection)?.fotoshare_expired && (
                  <div className="mt-2 flex items-center gap-2 text-amber-600 bg-amber-50 p-2 rounded-md">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-sm">This fotoshare link has expired. Videos may no longer be accessible.</span>
                  </div>
                )}
              </div>
            )}
            
            {/* Fotoshare Videos Grid */}
            {getFotoshareVideosBySection(selectedSection).length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {getFotoshareVideosBySection(selectedSection).map((video) => (
                  <div 
                    key={video.id}
                    className="relative group bg-white rounded-lg overflow-hidden border border-pink-200 hover:border-pink-400 transition-colors"
                  >
                    {/* Thumbnail */}
                    <div className="aspect-[9/16] bg-zinc-900 relative">
                      <img
                        src={video.thumbnail_url}
                        alt={`360 Booth Video`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23333" width="100" height="100"/><text fill="%23fff" x="50" y="50" text-anchor="middle" dy=".3em" font-size="12">360</text></svg>';
                        }}
                      />
                      {/* Play overlay */}
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <a 
                          href={video.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-white/90 p-3 rounded-full hover:bg-white transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Play className="w-6 h-6 text-pink-500 fill-current" />
                        </a>
                      </div>
                    </div>
                    
                    {/* Video info */}
                    <div className="p-2 text-center">
                      <a 
                        href={video.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-pink-600 hover:underline flex items-center justify-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View on Fotoshare
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-lg border border-pink-200">
                <Camera className="w-12 h-12 mx-auto text-pink-300 mb-4" />
                <p className="text-zinc-600">No videos found</p>
                <p className="text-sm text-zinc-500 mt-1">Click Refresh to sync videos from fotoshare.co</p>
              </div>
            )}
          </div>
        )}

        {/* Photo Upload Section - Hide when viewing video or fotoshare section */}
        {!(selectedSection && (sections.find(s => s.id === selectedSection)?.type === 'video' || sections.find(s => s.id === selectedSection)?.type === 'fotoshare')) && (
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
                              file.status === 'success' ? 'bg-green-500' : 
                              file.status === 'retrying' ? 'bg-amber-500' : 'bg-zinc-600'
                            }`}
                            style={{ width: `${file.progress}%` }}
                          />
                        </div>
                        {file.status === 'error' && file.errorMsg && (
                          <p className="text-xs text-red-500 mt-1">{file.errorMsg}</p>
                        )}
                        {file.status === 'retrying' && (
                          <p className="text-xs text-amber-500 mt-1">Retrying... (attempt {file.retries + 1})</p>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        {(file.status === 'uploading' || file.status === 'retrying') && (
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
                <p className="text-sm text-zinc-500">Max 50MB per file • JPEG, PNG, GIF, WebP, HEIC</p>
              </>
            )}
          </div>
        </div>
        )}

        {/* Hide photo management when viewing video or fotoshare section */}
        {!(selectedSection && (sections.find(s => s.id === selectedSection)?.type === 'video' || sections.find(s => s.id === selectedSection)?.type === 'fotoshare')) && (
        <div>
          {/* Photo Management Toolbar */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-normal" style={{ fontFamily: 'Playfair Display, serif' }}>
              Photographer Photos ({photos.filter(p => p.uploaded_by === 'photographer' || p.uploaded_by === 'contributor').length})
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setSelectMode(!selectMode); if (selectMode) clearSelection(); }}
                data-testid="toggle-select-mode"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectMode ? 'bg-primary text-white' : 'bg-zinc-100 hover:bg-zinc-200'
                }`}
              >
                <CheckSquare className="w-4 h-4 inline mr-2" />
                {selectMode ? 'Cancel' : 'Select'}
              </button>
              <button
                onClick={() => setReorderMode(!reorderMode)}
                data-testid="toggle-reorder-mode"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  reorderMode ? 'bg-primary text-white' : 'bg-zinc-100 hover:bg-zinc-200'
                }`}
              >
                <GripVertical className="w-4 h-4 inline mr-2" />
                {reorderMode ? 'Done' : 'Reorder'}
              </button>
            </div>
          </div>

          {/* Bulk Action Bar */}
          {selectMode && selectedPhotos.size > 0 && (
            <div className="bg-zinc-900 text-white p-4 rounded-lg mb-6 flex items-center justify-between">
              <span className="font-medium">{selectedPhotos.size} photo(s) selected</span>
              <div className="flex items-center gap-2">
                <button onClick={selectAllPhotos} className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-sm">
                  Select All
                </button>
                <button 
                  onClick={() => handleBulkAction('highlight')} 
                  className="px-3 py-1 bg-yellow-600 hover:bg-yellow-500 rounded text-sm flex items-center gap-1"
                >
                  <Star className="w-4 h-4" /> Highlight
                </button>
                <button 
                  onClick={() => handleBulkAction('hide')} 
                  className="px-3 py-1 bg-zinc-600 hover:bg-zinc-500 rounded text-sm flex items-center gap-1"
                >
                  <EyeOff className="w-4 h-4" /> Hide
                </button>
                <button 
                  onClick={() => handleBulkAction('unhide')} 
                  className="px-3 py-1 bg-zinc-600 hover:bg-zinc-500 rounded text-sm flex items-center gap-1"
                >
                  <Eye className="w-4 h-4" /> Show
                </button>
                {sections.length > 0 && (
                  <button 
                    onClick={() => setShowBulkActionModal(true)} 
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm flex items-center gap-1"
                  >
                    <FolderInput className="w-4 h-4" /> Move
                  </button>
                )}
                <button 
                  onClick={() => handleBulkAction('delete')} 
                  className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-sm flex items-center gap-1"
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
                <button onClick={clearSelection} className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-sm">
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Move to Section Modal */}
          {showBulkActionModal && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-lg max-w-md w-full p-6">
                <h3 className="text-xl font-medium mb-4">Move to Section</h3>
                <div className="space-y-2">
                  {sections.map(section => (
                    <button
                      key={section.id}
                      onClick={() => handleBulkAction('move_section', section.id)}
                      disabled={bulkActionLoading}
                      className="w-full p-3 text-left border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"
                    >
                      {section.name}
                    </button>
                  ))}
                  <button
                    onClick={() => handleBulkAction('move_section', null)}
                    disabled={bulkActionLoading}
                    className="w-full p-3 text-left border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors text-zinc-500"
                  >
                    Remove from section (Unsorted)
                  </button>
                </div>
                <button
                  onClick={() => setShowBulkActionModal(false)}
                  className="mt-4 w-full p-3 border border-zinc-300 rounded-lg hover:bg-zinc-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {sections.length > 0 ? (
            sections.map((section) => {
              const sectionPhotos = getPhotosBySection(section.id);
              if (sectionPhotos.length === 0 && !section.contributor_enabled) return null;
              const isExpanded = isSectionExpanded(section.id);
              const displayPhotos = isExpanded ? sectionPhotos : sectionPhotos.slice(0, PREVIEW_COUNT);
              const hasMore = sectionPhotos.length > PREVIEW_COUNT;
              
              return (
                <div key={section.id} className="mb-8">
                  <div className="mb-4">
                    <div 
                      className="flex items-center justify-between cursor-pointer group"
                      onClick={() => toggleSectionExpand(section.id)}
                    >
                      <div>
                        <h4 className="text-xl font-normal flex items-center gap-2" style={{ fontFamily: 'Playfair Display, serif' }}>
                          {section.name} 
                          <span className="text-zinc-400 text-base">({sectionPhotos.length})</span>
                        </h4>
                        {section.contributor_name && (
                          <p className="text-sm text-zinc-500 mt-1">
                            Photos by <span className="font-medium text-zinc-700">{section.contributor_name}</span>
                          </p>
                        )}
                      </div>
                      {hasMore && (
                        <button className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700 transition-colors">
                          {isExpanded ? (
                            <>Collapse <ChevronUp className="w-4 h-4" /></>
                          ) : (
                            <>Show all {sectionPhotos.length} <ChevronDown className="w-4 h-4" /></>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {sectionPhotos.length > 0 && (
                    <div className="masonry-grid">
                      {displayPhotos.map((photo) => {
                        const photoIndex = photos.findIndex(p => p.id === photo.id);
                        return (
                          <PhotoItem
                            key={photo.id}
                            photo={photo}
                            photoIndex={photoIndex}
                            onDelete={handleDelete}
                            onView={setLightboxIndex}
                            selectMode={selectMode}
                            selected={selectedPhotos.has(photo.id)}
                            onToggleSelect={togglePhotoSelection}
                            reorderMode={reorderMode}
                          onDragStart={handleDragStart}
                          onDragOver={handleDragOver}
                          onDrop={handleDrop}
                        />
                      );
                    })}
                    </div>
                  )}
                  {hasMore && !isExpanded && (
                    <button 
                      onClick={() => toggleSectionExpand(section.id)}
                      className="mt-4 w-full py-3 border-2 border-dashed border-zinc-200 rounded-lg text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <ChevronDown className="w-4 h-4" />
                      Show {sectionPhotos.length - PREVIEW_COUNT} more photos
                    </button>
                  )}
                </div>
              );
            })
          ) : null}

          {getPhotosWithoutSection().length > 0 && (
            <div className="mb-8">
              {(() => {
                const unsortedPhotos = getPhotosWithoutSection();
                const sectionId = 'unsorted';
                const isExpanded = isSectionExpanded(sectionId);
                const displayPhotos = isExpanded ? unsortedPhotos : unsortedPhotos.slice(0, PREVIEW_COUNT);
                const hasMore = unsortedPhotos.length > PREVIEW_COUNT;
                
                return (
                  <>
                    <div 
                      className="flex items-center justify-between mb-4 cursor-pointer group"
                      onClick={() => toggleSectionExpand(sectionId)}
                    >
                      <h4 className="text-xl font-normal flex items-center gap-2" style={{ fontFamily: 'Playfair Display, serif' }}>
                        {sections.length > 0 ? 'Unsorted' : 'All Photos'}
                        <span className="text-zinc-400 text-base">({unsortedPhotos.length})</span>
                      </h4>
                      {hasMore && (
                        <button className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700 transition-colors">
                          {isExpanded ? (
                            <>Collapse <ChevronUp className="w-4 h-4" /></>
                          ) : (
                            <>Show all {unsortedPhotos.length} <ChevronDown className="w-4 h-4" /></>
                          )}
                        </button>
                      )}
                    </div>
                    <div className="masonry-grid">
                      {displayPhotos.map((photo) => {
                        const photoIndex = photos.findIndex(p => p.id === photo.id);
                        return (
                          <PhotoItem
                            key={photo.id}
                            photo={photo}
                            photoIndex={photoIndex}
                            onDelete={handleDelete}
                            onView={setLightboxIndex}
                            selectMode={selectMode}
                            selected={selectedPhotos.has(photo.id)}
                            onToggleSelect={togglePhotoSelection}
                            reorderMode={reorderMode}
                            onDragStart={handleDragStart}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                          />
                        );
                      })}
                    </div>
                    {hasMore && !isExpanded && (
                      <button 
                        onClick={() => toggleSectionExpand(sectionId)}
                        className="mt-4 w-full py-3 border-2 border-dashed border-zinc-200 rounded-lg text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 transition-colors flex items-center justify-center gap-2"
                      >
                        <ChevronDown className="w-4 h-4" />
                        Show {unsortedPhotos.length - PREVIEW_COUNT} more photos
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {photos.filter(p => p.uploaded_by === 'photographer' || p.uploaded_by === 'contributor').length === 0 && (
            <div className="text-center py-20 border border-zinc-200 rounded-sm">
              <p className="text-zinc-500">No photos yet. Upload some to get started!</p>
            </div>
          )}
        </div>
        )}

        {/* Flagged/Problem Photos Section */}
        {(flaggedPhotos.length > 0 || (photoHealthStatus && photoHealthStatus.total_issues > 0)) && (
          <div className="mt-8 p-6 bg-amber-50 border border-amber-200 rounded-xl" data-testid="flagged-photos-section">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-lg font-semibold text-amber-800">
                    {flaggedPhotos.length > 0 ? `${flaggedPhotos.length} Photo(s) Hidden from Gallery` : 'Photo Issues Detected'}
                  </h3>
                  <p className="text-sm text-amber-700 mt-1">
                    {flaggedPhotos.length > 0 
                      ? 'These photos are not visible to guests. They may have broken thumbnails or were manually hidden.'
                      : `${photoHealthStatus?.total_issues || 0} photo(s) have thumbnail issues that may cause display problems.`
                    }
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRepairThumbnails}
                  disabled={repairingThumbnails}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
                  data-testid="repair-thumbnails-btn"
                >
                  {repairingThumbnails ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Repairing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Repair Thumbnails
                    </>
                  )}
                </button>
                {flaggedPhotos.length > 0 && (
                  <button
                    onClick={() => setShowFlaggedPhotosModal(true)}
                    className="px-4 py-2 bg-white hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-sm font-medium transition-colors"
                    data-testid="view-flagged-photos-btn"
                  >
                    View Hidden Photos
                  </button>
                )}
              </div>
            </div>
            
            {/* Quick preview of flagged photos */}
            {flaggedPhotos.length > 0 && (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
                {flaggedPhotos.slice(0, 6).map(photo => (
                  <div key={photo.id} className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 border-amber-300 bg-zinc-100">
                    {photo.thumbnail_url ? (
                      <img 
                        src={`${BACKEND_URL}${photo.thumbnail_url}`} 
                        alt="" 
                        className="w-full h-full object-cover opacity-60"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-6 h-6 text-zinc-400" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <EyeOff className="w-5 h-5 text-amber-600" />
                    </div>
                  </div>
                ))}
                {flaggedPhotos.length > 6 && (
                  <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-amber-200 flex items-center justify-center text-amber-800 font-medium text-sm">
                    +{flaggedPhotos.length - 6}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Flagged Photos Modal */}
        {showFlaggedPhotosModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" data-testid="flagged-photos-modal">
            <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col">
              <div className="p-6 border-b border-zinc-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Hidden Photos ({flaggedPhotos.length})</h2>
                    <p className="text-sm text-zinc-500 mt-1">
                      These photos are hidden from your public gallery. Click "Show in Gallery" to make them visible again.
                    </p>
                  </div>
                  <button 
                    onClick={() => setShowFlaggedPhotosModal(false)}
                    className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1">
                {flaggedPhotos.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500">
                    <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                    <p>No hidden photos! All photos are visible in your gallery.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {flaggedPhotos.map(photo => (
                      <div key={photo.id} className="relative group">
                        <div className="aspect-square rounded-lg overflow-hidden bg-zinc-100 border border-zinc-200">
                          {photo.thumbnail_medium_url || photo.thumbnail_url ? (
                            <img 
                              src={`${BACKEND_URL}${photo.thumbnail_medium_url || photo.thumbnail_url}`}
                              alt={photo.original_filename || 'Photo'}
                              className="w-full h-full object-cover"
                              onError={(e) => { 
                                e.target.onerror = null; 
                                e.target.src = ''; 
                                e.target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center"><svg class="w-8 h-8 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>';
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon className="w-8 h-8 text-zinc-400" />
                            </div>
                          )}
                        </div>
                        
                        {/* Photo info and actions overlay */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex flex-col items-center justify-center gap-2 p-2">
                          <p className="text-white text-xs text-center truncate w-full px-2">
                            {photo.original_filename || 'Unknown'}
                          </p>
                          <p className="text-amber-400 text-xs">
                            {photo.flagged_reason?.startsWith('auto:') ? 'Auto-hidden (thumbnail issue)' : 'Manually hidden'}
                          </p>
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => handleUnflagPhoto(photo.id)}
                              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium flex items-center gap-1"
                            >
                              <Eye className="w-3 h-3" />
                              Show
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm('Permanently delete this photo?')) {
                                  handleDelete(photo.id);
                                  fetchFlaggedPhotos();
                                }
                              }}
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              Delete
                            </button>
                          </div>
                        </div>
                        
                        {/* Status badge */}
                        <div className="absolute top-2 left-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            photo.auto_flagged 
                              ? 'bg-amber-500 text-white' 
                              : 'bg-zinc-700 text-white'
                          }`}>
                            {photo.auto_flagged ? 'Auto' : 'Manual'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="p-4 border-t border-zinc-200 bg-zinc-50 flex justify-between items-center">
                <button
                  onClick={handleRepairThumbnails}
                  disabled={repairingThumbnails}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                >
                  {repairingThumbnails ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Repair All Thumbnails
                </button>
                <button
                  onClick={() => setShowFlaggedPhotosModal(false)}
                  className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 rounded-lg text-sm font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Guest Photos Section */}
        {getGuestPhotos().length > 0 && (
          <div className="mt-12 pt-12 border-t border-zinc-200" data-testid="guest-photos-section">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-normal" style={{ fontFamily: 'Playfair Display, serif' }}>
                  Guest Uploads ({getGuestPhotos().length})
                </h3>
                <p className="text-sm text-zinc-500 mt-1">
                  Photos uploaded by guests. Select photos to hide or delete them.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-sm font-medium">
                  Needs Review
                </span>
                <button
                  onClick={() => { setGuestSelectMode(!guestSelectMode); if (guestSelectMode) clearGuestSelection(); }}
                  data-testid="toggle-guest-select-mode"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    guestSelectMode ? 'bg-primary text-white' : 'bg-zinc-100 hover:bg-zinc-200'
                  }`}
                >
                  <CheckSquare className="w-4 h-4 inline mr-2" />
                  {guestSelectMode ? 'Cancel' : 'Select'}
                </button>
              </div>
            </div>

            {/* Guest Bulk Action Bar */}
            {guestSelectMode && selectedGuestPhotos.size > 0 && (
              <div className="bg-zinc-900 text-white p-4 rounded-lg mb-6 flex items-center justify-between" data-testid="guest-bulk-action-bar">
                <span className="font-medium">{selectedGuestPhotos.size} guest photo(s) selected</span>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={selectAllGuestPhotos} 
                    className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-sm"
                    data-testid="select-all-guest-photos"
                  >
                    Select All
                  </button>
                  <button 
                    onClick={() => handleGuestBulkAction('hide')} 
                    disabled={guestBulkActionLoading}
                    className="px-3 py-1 bg-zinc-600 hover:bg-zinc-500 rounded text-sm flex items-center gap-1 disabled:opacity-50"
                    data-testid="hide-guest-photos"
                  >
                    <EyeOff className="w-4 h-4" /> Hide
                  </button>
                  <button 
                    onClick={() => handleGuestBulkAction('unhide')} 
                    disabled={guestBulkActionLoading}
                    className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-sm flex items-center gap-1 disabled:opacity-50"
                    data-testid="unhide-guest-photos"
                  >
                    <Eye className="w-4 h-4" /> Unhide
                  </button>
                  <button 
                    onClick={() => handleGuestBulkAction('delete')} 
                    disabled={guestBulkActionLoading}
                    className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-sm flex items-center gap-1 disabled:opacity-50"
                    data-testid="delete-guest-photos"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                  <button 
                    onClick={clearGuestSelection} 
                    className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-sm"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
            
            <div className="masonry-grid">
              {getGuestPhotos().map((photo, index) => (
                <div
                  key={photo.id}
                  data-testid={`guest-photo-${photo.id}`}
                  className={`masonry-item group relative ${guestSelectMode && selectedGuestPhotos.has(photo.id) ? 'ring-4 ring-primary ring-offset-2' : ''}`}
                  onClick={guestSelectMode ? () => toggleGuestPhotoSelection(photo.id) : undefined}
                >
                  <OptimizedImage
                    src={`${BACKEND_URL}${photo.url}`}
                    alt="Guest upload"
                    className={`w-full h-auto rounded-sm ${guestSelectMode ? 'cursor-pointer' : 'cursor-pointer'}`}
                    onClick={guestSelectMode ? undefined : () => {
                      setLightboxIndex(photos.findIndex(p => p.id === photo.id));
                    }}
                  />
                  {/* Selection checkbox */}
                  {guestSelectMode && (
                    <div className="absolute top-2 right-2 z-10">
                      <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                        selectedGuestPhotos.has(photo.id) 
                          ? 'bg-primary border-primary text-white' 
                          : 'bg-white/90 border-zinc-400'
                      }`}>
                        {selectedGuestPhotos.has(photo.id) && <Check className="w-4 h-4" />}
                      </div>
                    </div>
                  )}
                  <div className="absolute top-2 left-2 bg-amber-500 text-white px-2 py-1 rounded text-xs font-medium">
                    Guest
                  </div>
                  {/* Hidden indicator */}
                  {photo.is_hidden && (
                    <div className="absolute top-2 left-16 bg-zinc-700 text-white px-2 py-1 rounded text-xs font-medium flex items-center gap-1">
                      <EyeOff className="w-3 h-3" /> Hidden
                    </div>
                  )}
                  {!guestSelectMode && (
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-2 rounded-sm">
                      <button
                        data-testid={`delete-guest-photo-${photo.id}`}
                        onClick={(e) => { e.stopPropagation(); handleDelete(photo.id); }}
                        className="bg-red-500 text-white hover:bg-red-600 h-10 w-10 rounded-sm flex items-center justify-center transition-all duration-300"
                        title="Delete this photo"
                      >
                        <Trash2 className="w-5 h-5" strokeWidth={1.5} />
                      </button>
                    </div>
                  )}
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
                <label className="block text-sm font-medium mb-2">Coordinator Name</label>
                <input
                  type="text"
                  value={editFormData.coordinator_name}
                  onChange={(e) => setEditFormData({ ...editFormData, coordinator_name: e.target.value })}
                  placeholder="e.g., Events by Sarah"
                  className="flex h-10 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm"
                />
                <p className="text-xs text-zinc-500 mt-1">Event planner/coordinator who organized this event</p>
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
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {Object.entries(themes).map(([key, theme]) => (
                    <div
                      key={key}
                      onClick={() => setEditFormData({ ...editFormData, theme: key })}
                      data-testid={`theme-${key}`}
                      className={`cursor-pointer border-2 rounded-lg p-3 transition-all duration-300 hover:shadow-md ${
                        editFormData.theme === key 
                          ? 'border-primary ring-2 ring-primary/20' 
                          : 'border-zinc-200 hover:border-zinc-300'
                      }`}
                    >
                      {/* Color Palette Preview */}
                      <div className="flex gap-1 mb-2">
                        <div 
                          className="flex-1 h-8 rounded-l-md" 
                          style={{ backgroundColor: theme.colors.background }}
                          title="Background"
                        />
                        <div 
                          className="flex-1 h-8" 
                          style={{ backgroundColor: theme.colors.primary }}
                          title="Primary"
                        />
                        <div 
                          className="flex-1 h-8" 
                          style={{ backgroundColor: theme.colors.accent }}
                          title="Accent"
                        />
                        <div 
                          className="flex-1 h-8 rounded-r-md" 
                          style={{ backgroundColor: theme.colors.text }}
                          title="Text"
                        />
                      </div>
                      {/* Theme Name & Description */}
                      <h4 className="font-medium text-sm">{theme.name}</h4>
                      <p className="text-xs text-zinc-500 line-clamp-1">{theme.description}</p>
                      {/* Selected indicator */}
                      {editFormData.theme === key && (
                        <div className="mt-2 text-xs text-primary font-medium flex items-center gap-1">
                          <Check className="w-3 h-3" /> Selected
                        </div>
                      )}
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

      {/* Download Modal */}
      {showDownloadModal && downloadInfo && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm p-8 max-w-lg w-full" data-testid="download-modal">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-medium" style={{ fontFamily: 'Playfair Display, serif' }}>
                Download Photos
              </h3>
              <button
                onClick={() => setShowDownloadModal(false)}
                className="p-2 hover:bg-zinc-100 rounded-sm transition-colors"
              >
                <X className="w-5 h-5" strokeWidth={1.5} />
              </button>
            </div>

            {/* Summary */}
            <div className="bg-zinc-50 rounded-sm p-4 mb-6">
              <div className="flex items-center gap-3 mb-2">
                <Package className="w-5 h-5 text-zinc-600" strokeWidth={1.5} />
                <span className="font-medium">{downloadInfo.gallery_title}</span>
              </div>
              <div className="text-sm text-zinc-600 space-y-1">
                <p>{downloadInfo.total_photos} photos • {formatBytes(downloadInfo.total_size_bytes)} total</p>
                {downloadInfo.chunk_count > 1 && (
                  <p className="text-amber-600">Split into {downloadInfo.chunk_count} zip files (max 200MB each)</p>
                )}
              </div>
            </div>

            {/* Chunk List */}
            <div className="space-y-3 mb-6 max-h-60 overflow-y-auto">
              {downloadInfo.chunks.map((chunk) => (
                <div 
                  key={chunk.chunk_number} 
                  className={`flex items-center justify-between p-4 rounded-sm border transition-all ${
                    downloadedChunks[chunk.chunk_number] 
                      ? 'border-green-300 bg-green-50' 
                      : 'border-zinc-200 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {downloadingChunks[chunk.chunk_number] ? (
                      <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" strokeWidth={1.5} />
                    ) : downloadedChunks[chunk.chunk_number] ? (
                      <CheckCircle className="w-5 h-5 text-green-600" strokeWidth={1.5} />
                    ) : (
                      <Package className="w-5 h-5 text-zinc-400" strokeWidth={1.5} />
                    )}
                    <div>
                      <p className="font-medium text-sm">
                        {downloadInfo.chunk_count > 1 
                          ? `Part ${chunk.chunk_number} of ${downloadInfo.chunk_count}`
                          : `${downloadInfo.gallery_title}.zip`
                        }
                      </p>
                      <p className="text-xs text-zinc-500">
                        {chunk.photo_count} photos • {formatBytes(chunk.size_bytes)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => downloadChunk(chunk.chunk_number)}
                    disabled={downloadingChunks[chunk.chunk_number] || downloadedChunks[chunk.chunk_number]}
                    className={`h-9 px-4 rounded-sm text-sm font-medium transition-all flex items-center gap-2 ${
                      downloadedChunks[chunk.chunk_number]
                        ? 'bg-green-100 text-green-700 cursor-default'
                        : downloadingChunks[chunk.chunk_number]
                        ? 'bg-zinc-100 text-zinc-500 cursor-wait'
                        : 'bg-zinc-900 text-white hover:bg-zinc-800'
                    }`}
                  >
                    {downloadingChunks[chunk.chunk_number] ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Preparing...
                      </>
                    ) : downloadedChunks[chunk.chunk_number] ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Downloaded
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        Download
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>

            {/* Download All Button */}
            {downloadInfo.chunk_count > 1 && (
              <button
                onClick={downloadAllChunks}
                disabled={Object.keys(downloadingChunks).some(k => downloadingChunks[k])}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-11 rounded-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Download className="w-4 h-4" strokeWidth={1.5} />
                Download All Parts
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const PhotoItem = ({ photo, photoIndex, onDelete, onView, selectMode, selected, onToggleSelect, reorderMode, onDragStart, onDragOver, onDrop }) => (
  <div
    data-testid={`photo-item-${photo.id}`}
    className={`masonry-item group relative ${reorderMode ? 'cursor-move' : ''} ${selected ? 'ring-4 ring-primary' : ''}`}
    onClick={() => {
      if (selectMode) {
        onToggleSelect(photo.id);
      } else if (!reorderMode) {
        onView(photoIndex);
      }
    }}
    draggable={reorderMode}
    onDragStart={reorderMode ? (e) => onDragStart(e, photo) : undefined}
    onDragOver={reorderMode ? onDragOver : undefined}
    onDrop={reorderMode ? (e) => onDrop(e, photo) : undefined}
  >
    <OptimizedImage
      src={`${BACKEND_URL}${photo.url}`}
      alt="Gallery photo"
      className="w-full h-auto cursor-pointer rounded-sm"
    />
    
    {/* Highlight/Hidden badges */}
    {(photo.is_highlight || photo.is_hidden) && (
      <div className="absolute top-2 left-2 flex gap-1">
        {photo.is_highlight && (
          <span className="bg-yellow-500 text-white px-2 py-1 rounded text-xs font-medium flex items-center gap-1">
            <Star className="w-3 h-3" /> Highlight
          </span>
        )}
        {photo.is_hidden && (
          <span className="bg-zinc-700 text-white px-2 py-1 rounded text-xs font-medium flex items-center gap-1">
            <EyeOff className="w-3 h-3" /> Hidden
          </span>
        )}
      </div>
    )}
    
    {/* Select mode checkbox */}
    {selectMode && (
      <div className="absolute top-2 right-2 z-10">
        <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
          selected ? 'bg-primary border-primary text-white' : 'bg-white border-zinc-300'
        }`}>
          {selected && <Check className="w-4 h-4" />}
        </div>
      </div>
    )}
    
    {/* Reorder mode drag handle */}
    {reorderMode && (
      <div className="absolute top-2 right-2 z-10 bg-white/90 p-1 rounded">
        <GripVertical className="w-5 h-5 text-zinc-500" />
      </div>
    )}
    
    {/* Hover overlay */}
    {!selectMode && !reorderMode && (
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
    )}
  </div>
);

export default GalleryDetail;