import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import axios from 'axios';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import { Lock, Upload, Download, X, Camera, ChevronDown, ChevronUp, Loader2, CheckCircle, AlertCircle, Star, Share2, Heart, Play, ExternalLink, Cloud, Film, Youtube, Users, Image, Video, HardDrive } from 'lucide-react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { getThemeStyles, themes } from '@/themes';
import PremiumLightbox from '@/components/PremiumLightbox';
import OptimizedImage from '@/components/OptimizedImage';
import ProgressiveImage from '@/components/ProgressiveImage';
import VirtualizedGalleryGrid from '@/components/VirtualizedGalleryGrid';
import LazyMasonryGrid from '@/components/LazyMasonryGrid';
import SocialSharePanel from '@/components/SocialSharePanel';
import VideoSection from '@/components/VideoSection';
import SmartVideoSection from '@/components/SmartVideoSection';
import FotoshareSection from '@/components/FotoshareSection';
import PhotoboothSection from '@/components/PhotoboothSection';
import GoogleDriveSection from '@/components/GoogleDriveSection';
import LiteModeModal from '@/components/LiteModeModal';
import LiteUploadPage from '@/components/LiteUploadPage';
import useConnectionSpeed from '@/hooks/useConnectionSpeed';
import useBrandConfig from '../hooks/useBrandConfig';
import { getContrastTextColor, getTextColorForBackground, getSubtleTextColor } from '@/themes';
import { calculateFileHash } from '@/utils/fileHash';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const PREVIEW_COUNT = 8;
const LARGE_GALLERY_THRESHOLD = 50; // Use virtualized grid for galleries with more photos
const PHOTOS_PER_BATCH = 50; // Load 50 photos at a time

// Helper to get the correct image URL (handles both CDN and local URLs)
const getImageUrl = (url) => {
  if (!url) return '';
  // If URL already starts with http(s), it's a CDN URL - use as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  // Otherwise, it's a local URL - prepend backend URL
  return `${BACKEND_URL}${url}`;
};

// Animated Photo Card Component
const AnimatedPhotoCard = ({ photo, index, onView, onDownload, photoIndex }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="masonry-item group relative overflow-hidden"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid={`photo-card-${photo.id}`}
    >
      <div 
        className="relative cursor-pointer"
        onClick={() => onView(photoIndex)}
      >
        <OptimizedImage
          src={photo.thumbnail_medium_url || photo.thumbnail_url || photo.url}
          alt={photo.title || 'Photo'}
          className="w-full rounded-sm transition-transform duration-700 ease-out group-hover:scale-105"
          showLoader={true}
        />
        
        {/* Elegant Overlay */}
        <motion.div 
          className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent rounded-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: isHovered ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="absolute bottom-0 left-0 right-0 p-4 flex justify-between items-end">
            <motion.button
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: isHovered ? 0 : 10, opacity: isHovered ? 1 : 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              onClick={(e) => { e.stopPropagation(); onDownload(photo); }}
              className="p-2.5 bg-white/20 backdrop-blur-md rounded-full hover:bg-white/30 transition-colors"
              data-testid={`download-photo-${photo.id}`}
            >
              <Download className="w-4 h-4 text-white" />
            </motion.button>
            {photo.is_highlight && (
              <motion.div
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: isHovered ? 0 : 10, opacity: isHovered ? 1 : 0 }}
                transition={{ duration: 0.3, delay: 0.15 }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 backdrop-blur-md rounded-full"
              >
                <Star className="w-3 h-3 text-yellow-400" fill="currentColor" />
                <span className="text-xs text-white font-medium">Featured</span>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

// Bento Grid Item for Highlights
const BentoItem = ({ photo, index, span, onView, onDownload, photoIndex }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  const spanClasses = {
    'hero': 'col-span-2 row-span-2',
    'portrait': 'col-span-1 row-span-2', 
    'wide': 'col-span-2 row-span-1',
    'standard': 'col-span-1 row-span-1'
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.7, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
      className={`${spanClasses[span] || spanClasses.standard} relative overflow-hidden rounded-sm cursor-pointer group`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onView(photoIndex)}
      data-testid={`bento-item-${photo.id}`}
    >
      <OptimizedImage
        src={photo.url || photo.thumbnail_medium_url}
        alt={photo.title || 'Highlight'}
        className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
        showLoader={true}
      />
      
      {/* Gradient Overlay */}
      <motion.div 
        className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"
        initial={{ opacity: 0.3 }}
        animate={{ opacity: isHovered ? 0.8 : 0.3 }}
        transition={{ duration: 0.4 }}
      />
      
      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-6">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: isHovered ? 0 : 20, opacity: isHovered ? 1 : 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-3"
        >
          <button
            onClick={(e) => { e.stopPropagation(); onDownload(photo); }}
            className="p-3 bg-white/20 backdrop-blur-md rounded-full hover:bg-white/30 transition-colors"
          >
            <Download className="w-5 h-5 text-white" />
          </button>
          <div className="flex items-center gap-1.5 px-4 py-2 bg-white/20 backdrop-blur-md rounded-full">
            <Star className="w-4 h-4 text-yellow-400" fill="currentColor" />
            <span className="text-sm text-white font-medium">Highlight</span>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

const PublicGallery = () => {
  const { shareLink } = useParams();
  const [searchParams] = useSearchParams();
  const isViewOnly = searchParams.get('view') === '1';
  const brandConfig = useBrandConfig();
  const [gallery, setGallery] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [videos, setVideos] = useState([]);
  const [fotoshareVideos, setFotoshareVideos] = useState([]);
  const [pcloudPhotos, setPcloudPhotos] = useState([]);
  const [pcloudLightboxPhotos, setPcloudLightboxPhotos] = useState([]);
  const [pcloudLightboxIndex, setPcloudLightboxIndex] = useState(null);
  const [gdrivePhotos, setGdrivePhotos] = useState([]);
  const [gdriveLightboxPhotos, setGdriveLightboxPhotos] = useState([]);
  const [gdriveLightboxIndex, setGdriveLightboxIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState([]); // Track individual file uploads
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  // Removed guestUploadExpanded - using modal-based upload instead
  const [showUploadModal, setShowUploadModal] = useState(false); // Modal for quick upload
  const [showDownloadAllModal, setShowDownloadAllModal] = useState(false);
  const [showDownloadDropdown, setShowDownloadDropdown] = useState(false);
  
  // Lite Mode state for slow connections
  const [showLiteModeModal, setShowLiteModeModal] = useState(false);
  const [isLiteMode, setIsLiteMode] = useState(false);
  const [liteModeChecked, setLiteModeChecked] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState(null);
  const [downloadingSection, setDownloadingSection] = useState(null);
  
  // Scroll tracking for parallax effects
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"]
  });
  
  // Parallax transforms
  const heroImageY = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 1], [1, 1.1]);
  const [downloadAllPassword, setDownloadAllPassword] = useState('');
  const [expandedSections, setExpandedSections] = useState({});
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [downloadingPhoto, setDownloadingPhoto] = useState(null);

  // Toggle section expand/collapse
  const toggleSectionExpand = (sectionId) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  const isSectionExpanded = (sectionId) => expandedSections[sectionId] ?? false;

  useEffect(() => {
    fetchGalleryInfo();
    // Track view
    trackView();
  }, [shareLink]);

  // Connection speed detection for Lite Mode
  const { speed, isSlowConnection, isTesting: isTestingSpeed } = useConnectionSpeed({
    enabled: gallery?.lite_mode_enabled && !liteModeChecked && authenticated,
    threshold: 1 // 1 Mbps threshold
  });

  // Show Lite Mode modal when slow connection detected
  useEffect(() => {
    if (gallery?.lite_mode_enabled && !liteModeChecked && authenticated && !isTestingSpeed) {
      if (isSlowConnection) {
        setShowLiteModeModal(true);
      }
      setLiteModeChecked(true);
    }
  }, [gallery?.lite_mode_enabled, liteModeChecked, authenticated, isSlowConnection, isTestingSpeed]);

  const handleSelectLiteMode = () => {
    setIsLiteMode(true);
    setShowLiteModeModal(false);
  };

  const handleSelectFullMode = () => {
    setIsLiteMode(false);
    setShowLiteModeModal(false);
  };

  const handleSwitchToFull = () => {
    setIsLiteMode(false);
  };

  const trackView = async () => {
    try {
      await axios.post(`${API}/public/gallery/${shareLink}/view`);
    } catch (error) {
      // Silently fail - view tracking is not critical
    }
  };

  const fetchGalleryInfo = async () => {
    try {
      const response = await axios.get(`${API}/public/gallery/${shareLink}`);
      setGallery(response.data);
      
      if (!response.data.has_password) {
        setAuthenticated(true);
        fetchPhotos();
      } else {
        setPasswordRequired(true);
      }
    } catch (error) {
      toast.error('Gallery not found');
    } finally {
      setLoading(false);
    }
  };

  const fetchPhotos = async (pwd = null) => {
    try {
      // Fetch all data in parallel - backend now returns optimized payload
      const [photosRes, videosRes, fotoshareRes, pcloudRes, gdriveRes] = await Promise.all([
        axios.get(
          `${API}/public/gallery/${shareLink}/photos`,
          { params: { password: pwd || password } }
        ),
        axios.get(
          `${API}/public/gallery/${shareLink}/videos`,
          { params: { password: pwd || password } }
        ).catch(() => ({ data: [] })),
        axios.get(`${API}/galleries/${shareLink}/fotoshare-videos`).catch(() => ({ data: [] })),
        axios.get(`${API}/public/gallery/${shareLink}/pcloud-photos`).catch(() => ({ data: [] })),
        axios.get(`${API}/public/gallery/${shareLink}/gdrive-photos`).catch(() => ({ data: [] }))
      ]);
      
      // Set all photos at once - per-section lazy loading handled by LazyMasonryGrid
      setPhotos(photosRes.data);
      setVideos(videosRes.data);
      setFotoshareVideos(fotoshareRes.data);
      setPcloudPhotos(pcloudRes.data);
      setGdrivePhotos(gdriveRes.data);
    } catch (error) {
      if (error.response?.status === 401) {
        toast.error('Invalid password');
      } else {
        toast.error('Failed to load photos');
      }
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/public/gallery/${shareLink}/verify-password`, {
        password
      });
      setAuthenticated(true);
      setPasswordRequired(false);
      fetchPhotos();
      toast.success('Access granted!');
    } catch (error) {
      toast.error('Invalid password');
    }
  };

  const onDrop = useCallback(async (acceptedFiles) => {
    if (!authenticated && gallery?.has_password) {
      toast.error('Please enter the gallery password first');
      return;
    }

    if (acceptedFiles.length === 0) return;

    // Guest upload limit: max 10 photos per batch
    const MAX_GUEST_UPLOAD = 10;
    if (acceptedFiles.length > MAX_GUEST_UPLOAD) {
      toast.error(`You can only upload up to ${MAX_GUEST_UPLOAD} photos at a time. Please select fewer photos.`);
      return;
    }

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

    // Server-side duplicate check with content hashing
    setUploading(true);
    setUploadProgress([{ name: 'Computing file signatures...', status: 'uploading', progress: 10 }]);

    let filesToUpload = validFiles;
    let fileHashes = new Map(); // Store hashes for upload
    
    try {
      // Step 1: Compute content hashes for all files (happens on client, fast)
      setUploadProgress([{ name: 'Computing file signatures...', status: 'uploading', progress: 20 }]);
      
      const hashes = [];
      for (let i = 0; i < validFiles.length; i++) {
        try {
          const hash = await calculateFileHash(validFiles[i]);
          hashes.push(hash);
          fileHashes.set(validFiles[i], hash);
        } catch (e) {
          console.warn(`Could not hash ${validFiles[i].name}, using filename fallback`);
          hashes.push(null);
        }
        // Update progress for hashing
        setUploadProgress([{ 
          name: `Analyzing ${i + 1}/${validFiles.length} files...`, 
          status: 'uploading', 
          progress: 20 + Math.round((i / validFiles.length) * 30)
        }]);
      }
      
      setUploadProgress([{ name: 'Checking for duplicates...', status: 'uploading', progress: 60 }]);
      
      // Step 2: Send hashes to server to check for duplicates
      const checkResponse = await axios.post(
        `${API}/public/gallery/${shareLink}/check-duplicates`,
        { 
          filenames: validFiles.map(f => f.name),
          hashes: hashes
        }
      );
      
      const { duplicates, new_files, duplicate_hashes } = checkResponse.data;
      
      if (duplicates.length > 0) {
        toast.warning(`${duplicates.length} photo(s) already in gallery`, {
          description: duplicates.length === 1 
            ? 'This exact photo was already uploaded before'
            : `${duplicates.slice(0, 2).join(', ')}${duplicates.length > 2 ? ` and ${duplicates.length - 2} more` : ''} are duplicates`
        });
      }
      
      if (new_files.length === 0) {
        toast.info('All selected photos have already been uploaded');
        setUploadProgress([]);
        setUploading(false);
        return;
      }
      
      // Filter to only new files (by filename since that's what backend returns)
      const duplicateSet = new Set(duplicates.map(d => d.toLowerCase()));
      filesToUpload = validFiles.filter(f => !duplicateSet.has(f.name.toLowerCase()));
      
    } catch (error) {
      console.error('Duplicate check failed, proceeding with upload:', error);
      // Continue with all files if check fails
    }
    
    // Initialize progress tracking for each file
    const initialProgress = filesToUpload.map(file => ({
      name: file.name,
      status: 'pending',
      progress: 0
    }));
    setUploadProgress(initialProgress);

    // Sequential upload - one file at a time
    let successCount = 0;
    let failCount = 0;
    let duplicateCount = 0;

    for (let index = 0; index < filesToUpload.length; index++) {
      const file = filesToUpload[index];
      const fileHash = fileHashes.get(file);
      
      // Update status to uploading
      setUploadProgress(prev => prev.map((item, i) => 
        i === index ? { ...item, status: 'uploading' } : item
      ));

      const formData = new FormData();
      formData.append('file', file);
      if (password) {
        formData.append('password', password);
      }
      // Include the content hash for server-side verification
      if (fileHash) {
        formData.append('content_hash', fileHash);
      }
      
      try {
        await axios.post(
          `${API}/public/gallery/${shareLink}/upload`,
          formData,
          {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (progressEvent) => {
              const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              setUploadProgress(prev => prev.map((item, i) => 
                i === index ? { ...item, progress: percentCompleted } : item
              ));
            }
          }
        );
        
        // Mark as success
        setUploadProgress(prev => prev.map((item, i) => 
          i === index ? { ...item, status: 'success', progress: 100 } : item
        ));
        successCount++;
        
      } catch (error) {
        // Mark as error with message
        const isDuplicate = error.response?.status === 409;
        const errorMsg = isDuplicate ? 'Already uploaded' : 'Failed';
        setUploadProgress(prev => prev.map((item, i) => 
          i === index ? { ...item, status: 'error', errorMsg } : item
        ));
        
        if (isDuplicate) {
          duplicateCount++;
        }
        failCount++;
      }
    }

    // Show summary
    if (successCount > 0) {
      toast.success(`${successCount} photo(s) uploaded successfully!`);
      fetchPhotos();
    }
    if (duplicateCount > 0) {
      toast.warning(`${duplicateCount} duplicate file(s) skipped`);
    }
    if (failCount - duplicateCount > 0) {
      toast.error(`${failCount - duplicateCount} photo(s) failed to upload`);
    }

    // Clear progress after a delay
    setTimeout(() => {
      setUploadProgress([]);
      setUploading(false);
    }, 2000);
  }, [shareLink, password, authenticated, gallery, fetchPhotos]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: true,
    disabled: !authenticated || uploading
  });

  const handleDownload = async (photo) => {
    if (downloadingPhoto === photo.id) return; // Prevent double-click
    
    try {
      setDownloadingPhoto(photo.id);
      toast.loading('Preparing download...', { id: 'download-photo' });
      
      let downloadUrl;
      const filename = photo.filename || photo.name || 'photo.jpg';
      
      // Check if this is a pCloud photo - use proxy download to bypass ISP blocks
      if (photo.download_url) {
        // Use the pre-built download URL from the API
        downloadUrl = `${BACKEND_URL}/api${photo.download_url}?filename=${encodeURIComponent(filename)}`;
      } else if (photo.url && photo.url.includes('/pcloud/serve/')) {
        // Convert serve URL to download URL
        downloadUrl = photo.url.replace('/pcloud/serve/', '/pcloud/download/');
        downloadUrl = `${BACKEND_URL}${downloadUrl}?filename=${encodeURIComponent(filename)}`;
      } else if (photo.is_pcloud && photo.pcloud_code && photo.fileid) {
        // Build proxy download URL from photo metadata
        downloadUrl = `${BACKEND_URL}/api/pcloud/download/${photo.pcloud_code}/${photo.fileid}?filename=${encodeURIComponent(filename)}`;
      } else {
        // Regular photo - check if it's a CDN URL
        const imageUrl = getImageUrl(photo.url);
        
        if (imageUrl.startsWith('https://cdn.') || imageUrl.includes('r2.cloudflarestorage')) {
          // CDN URL - fetch as blob to force download (cross-origin doesn't support download attribute)
          try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up blob URL after a short delay
            setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
            
            toast.success('Photo downloaded!', { id: 'download-photo' });
            return;
          } catch (fetchError) {
            console.error('CDN fetch failed, falling back to backend proxy:', fetchError);
            // Fall back to backend proxy
            downloadUrl = `${BACKEND_URL}/api/photos/download?url=${encodeURIComponent(photo.url)}&filename=${encodeURIComponent(filename)}`;
          }
        } else {
          // Local URL - use backend with download parameter
          downloadUrl = `${imageUrl}?download=true`;
        }
      }
      
      // For non-CDN URLs, use the link approach
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Photo download started!', { id: 'download-photo' });
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download photo', { id: 'download-photo' });
    } finally {
      setTimeout(() => setDownloadingPhoto(null), 1000);
    }
  };

  // Fetch download info (sections, photo counts, chunks)
  const fetchDownloadInfo = async () => {
    try {
      const response = await axios.post(
        `${API}/public/gallery/${shareLink}/download-info`,
        { password: downloadAllPassword || null }
      );
      setDownloadInfo(response.data);
    } catch (error) {
      if (error.response?.status === 401) {
        // Password required but not provided or invalid
        setDownloadInfo(null);
      } else {
        console.error('Failed to fetch download info:', error);
      }
    }
  };

  // Verify download password (or fetch info when no password required)
  const handleVerifyDownloadPassword = async () => {
    try {
      const response = await axios.post(
        `${API}/public/gallery/${shareLink}/download-info`,
        { password: downloadAllPassword || null }
      );
      setDownloadInfo(response.data);
      setShowDownloadDropdown(true);
      if (!gallery?.has_download_all_password) {
        // No password was needed
      } else {
        toast.success('Password verified!');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        toast.error('Invalid download password');
      } else {
        toast.error('Failed to verify download access');
      }
    }
  };

  // Download a specific section or all photos
  const handleSectionDownload = async (sectionId = null, sectionTitle = 'All Photos') => {
    if (downloadingSection) return;
    
    setDownloadingSection(sectionId || 'all');
    const toastId = `download-${sectionId || 'all'}`;
    
    try {
      // First get download info to check for chunks
      const infoResponse = await axios.post(
        `${API}/public/gallery/${shareLink}/download-info`,
        { password: downloadAllPassword || null, section_id: sectionId }
      );
      
      const { chunk_count, total_photos, sections } = infoResponse.data;
      
      if (total_photos === 0) {
        toast.error('No photos available for download', { id: toastId });
        return;
      }
      
      // Download each chunk
      for (let chunk = 1; chunk <= chunk_count; chunk++) {
        if (chunk_count > 1) {
          toast.loading(`Downloading part ${chunk} of ${chunk_count}...`, { id: toastId });
        } else {
          toast.loading(`Downloading ${total_photos} photos...`, { id: toastId });
        }
        
        const response = await axios.post(
          `${API}/public/gallery/${shareLink}/download-section?chunk=${chunk}`,
          { password: downloadAllPassword || null, section_id: sectionId },
          { 
            responseType: 'blob',
            onDownloadProgress: (progressEvent) => {
              const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
              if (percent < 100) {
                const chunkText = chunk_count > 1 ? ` (Part ${chunk}/${chunk_count})` : '';
                toast.loading(`Downloading${chunkText}... ${percent}%`, { id: toastId });
              }
            }
          }
        );
        
        // Create blob and trigger download
        const blob = new Blob([response.data], { type: 'application/zip' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        // Get filename from header
        const contentDisposition = response.headers['content-disposition'];
        let filename = `${gallery?.title || 'gallery'}_${sectionTitle.replace(/\s+/g, '_')}.zip`;
        if (contentDisposition) {
          const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (match && match[1]) {
            filename = match[1].replace(/['"]/g, '');
          }
        }
        
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        
        setTimeout(() => {
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        }, 100);
        
        // Small delay between chunks
        if (chunk < chunk_count) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      const successMsg = chunk_count > 1 
        ? `Downloaded ${total_photos} photos in ${chunk_count} parts!`
        : `Downloaded ${total_photos} photos!`;
      toast.success(successMsg, { id: toastId });
      setShowDownloadDropdown(false);
      
    } catch (error) {
      console.error('Section download error:', error);
      if (error.response?.status === 401) {
        toast.error('Invalid download password', { id: toastId });
        setShowDownloadAllModal(true);
      } else {
        toast.error('Download failed. Please try again.', { id: toastId });
      }
    } finally {
      setDownloadingSection(null);
    }
  };

  const getPhotosBySection = (sectionId) => {
    return photos.filter(p => p.section_id === sectionId && (p.uploaded_by === 'photographer' || p.uploaded_by === 'contributor'));
  };

  const getPhotosWithoutSection = () => {
    return photos.filter(p => !p.section_id && p.uploaded_by === 'photographer');
  };

  const getGuestPhotos = () => {
    return photos.filter(p => p.uploaded_by === 'guest');
  };

  // Get videos by section
  const getVideosBySection = (sectionId) => {
    return videos.filter(v => v.section_id === sectionId);
  };

  // Get fotoshare videos by section
  const getFotoshareVideosBySection = (sectionId) => {
    return fotoshareVideos.filter(v => v.section_id === sectionId);
  };

  // Get pCloud photos by section
  const getPcloudPhotosBySection = (sectionId) => {
    return pcloudPhotos.filter(p => p.section_id === sectionId);
  };

  // Get Google Drive photos by section
  const getGdrivePhotosBySection = (sectionId) => {
    return gdrivePhotos.filter(p => p.section_id === sectionId);
  };

  // Get highlighted photos (shown in grid)
  const getHighlightPhotos = () => {
    return photos.filter(p => p.is_highlight && (p.uploaded_by === 'photographer' || p.uploaded_by === 'contributor'));
  };

  // Get regular photos (shown in masonry)
  const getRegularPhotosBySection = (sectionId) => {
    return photos.filter(p => p.section_id === sectionId && (p.uploaded_by === 'photographer' || p.uploaded_by === 'contributor') && !p.is_highlight);
  };

  const getRegularPhotosWithoutSection = () => {
    return photos.filter(p => !p.section_id && p.uploaded_by === 'photographer' && !p.is_highlight);
  };

  // Group contributors by name for the credits section
  // This merges the same contributor's sections together for display in credits
  const getGroupedContributors = useMemo(() => {
    if (!gallery?.sections) return [];
    
    const contributorMap = new Map(); // Key: contributor_name (lowercase)
    
    gallery.sections.forEach(section => {
      const contributorName = section.contributor_name?.trim();
      if (!contributorName) return; // Skip sections without contributor
      
      const key = contributorName.toLowerCase();
      
      if (contributorMap.has(key)) {
        // Add section to existing contributor
        const existing = contributorMap.get(key);
        existing.sections.push({
          id: section.id,
          name: section.name,
          type: section.type || 'photo'
        });
      } else {
        // Create new contributor entry
        contributorMap.set(key, {
          name: contributorName, // Keep original casing from first occurrence
          role: section.contributor_role || 'Contributor',
          sections: [{
            id: section.id,
            name: section.name,
            type: section.type || 'photo'
          }]
        });
      }
    });
    
    return Array.from(contributorMap.values());
  }, [gallery?.sections]);

  // Generate navigation items from sections
  const getNavigationItems = useMemo(() => {
    const items = [];
    
    // Add Highlights if there are any
    const highlights = photos.filter(p => p.is_highlight);
    if (highlights.length > 0) {
      items.push({
        id: 'highlights',
        name: 'Highlights',
        type: 'highlight',
        icon: 'star',
        count: highlights.length
      });
    }
    
    // Add sections
    if (gallery?.sections) {
      gallery.sections.forEach(section => {
        let count = 0;
        let icon = 'image';
        
        if (section.type === 'video') {
          count = getVideosBySection(section.id).length;
          icon = 'video';
        } else if (section.type === 'fotoshare') {
          count = getFotoshareVideosBySection(section.id).length;
          icon = 'film';
        } else if (section.type === 'pcloud') {
          count = getPcloudPhotosBySection(section.id).length;
          icon = 'cloud';
        } else if (section.type === 'gdrive') {
          count = getGdrivePhotosBySection(section.id).length;
          icon = 'drive';
        } else {
          count = getPhotosBySection(section.id).length;
          icon = 'image';
        }
        
        if (count > 0) {
          items.push({
            id: section.id,
            name: section.name,
            type: section.type || 'photo',
            icon,
            count
          });
        }
      });
    }
    
    // Add unsorted photos
    const unsortedPhotos = getRegularPhotosWithoutSection();
    if (unsortedPhotos.length > 0) {
      items.push({
        id: 'unsorted',
        name: 'Photos',
        type: 'photo',
        icon: 'image',
        count: unsortedPhotos.length
      });
    }
    
    // Add guest photos
    const guestPhotos = photos.filter(p => p.uploaded_by === 'guest');
    if (guestPhotos.length > 0) {
      items.push({
        id: 'guest-uploads',
        name: 'Guest Photos',
        type: 'guest',
        icon: 'users',
        count: guestPhotos.length
      });
    }
    
    return items;
  }, [gallery, photos, videos, fotoshareVideos, pcloudPhotos, gdrivePhotos]);

  // Scroll to section
  const scrollToSection = (sectionId) => {
    const element = document.getElementById(`section-${sectionId}`);
    if (element) {
      const offset = 80; // Account for sticky nav
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;
      
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-zinc-500">Loading gallery...</p>
      </div>
    );
  }

  // Lite Mode - Show minimal upload interface
  if (isLiteMode && gallery) {
    const currentTheme = themes[gallery?.theme || 'classic'];
    return (
      <>
        <LiteUploadPage
          gallery={gallery}
          shareLink={shareLink}
          onSwitchToFull={handleSwitchToFull}
          themeColors={currentTheme?.colors}
          onUploadComplete={(count) => {
            // Refresh photos count
            fetchPhotos();
          }}
        />
        <LiteModeModal
          isOpen={showLiteModeModal}
          onClose={() => setShowLiteModeModal(false)}
          onSelectLiteMode={handleSelectLiteMode}
          onSelectFullMode={handleSelectFullMode}
          speed={speed}
          eventTitle={gallery?.event_title || gallery?.title}
          themeColors={currentTheme?.colors}
        />
      </>
    );
  }

  if (passwordRequired && !authenticated) {
    const themeStyles = getThemeStyles(gallery?.theme || 'classic');
    const currentTheme = themes[gallery?.theme || 'classic'];
    
    return (
      <div 
        className="themed-gallery min-h-screen flex items-center justify-center p-6"
        style={themeStyles}
      >
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center border rounded-sm" style={{ borderColor: currentTheme.colors.accent }}>
              <Lock className="w-8 h-8" strokeWidth={1.5} />
            </div>
            <h1
              className="text-4xl md:text-5xl font-normal tracking-tight mb-4"
              style={{ fontFamily: currentTheme.fonts.heading }}
            >
              {gallery?.title}
            </h1>
            <p className="text-base font-light mb-2" style={{ color: getSubtleTextColor(currentTheme.colors.background, 0.7) }}>
              by {gallery?.photographer_name}
            </p>
            <p className="text-sm" style={{ color: getSubtleTextColor(currentTheme.colors.background, 0.6) }}>This gallery is password protected</p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-6" data-testid="password-form">
            <div>
              <label className="block text-sm font-medium mb-2">Enter Password</label>
              <input
                data-testid="gallery-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex h-10 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all duration-200 focus:border-primary"
                placeholder="Password"
                required
                autoFocus
              />
            </div>

            <button
              data-testid="password-submit-button"
              type="submit"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-8 rounded-sm font-medium tracking-wide transition-all duration-300"
            >
              Access Gallery
            </button>
          </form>
        </div>
      </div>
    );
  }

  const themeStyles = getThemeStyles(gallery?.theme || 'classic');
  const currentTheme = themes[gallery?.theme || 'classic'];
  
  // Determine if theme is dark
  const isDarkTheme = ['modern', 'neon', 'blackgold'].includes(gallery?.theme);

  // Get cover photo URL for OG tags
  const getCoverPhotoUrl = () => {
    if (gallery?.cover_photo_url) {
      return getImageUrl(gallery.cover_photo_url);
    }
    // Fallback to first photo
    if (photos.length > 0 && photos[0]?.url) {
      return getImageUrl(photos[0].url);
    }
    return null;
  };

  const ogTitle = gallery?.event_title || gallery?.title || 'Photo Gallery';
  const ogDescription = gallery?.description || `Photos by ${gallery?.photographer_name || 'EventsGallery'}`;
  const ogImage = getCoverPhotoUrl();

  return (
    <div className="themed-gallery min-h-screen" style={{...themeStyles, overflowX: 'clip'}} data-testid="public-gallery">
      
      {/* Dynamic Open Graph Meta Tags for Social Sharing */}
      <Helmet>
        <title>{ogTitle} | {brandConfig.brand_name || 'EventsGallery'}</title>
        <meta name="description" content={ogDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={ogTitle} />
        <meta property="og:description" content={ogDescription} />
        <meta property="og:site_name" content={brandConfig.brand_name || 'EventsGallery'} />
        <meta property="og:url" content={window.location.href} />
        {ogImage && <meta property="og:image" content={ogImage} />}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={ogTitle} />
        <meta name="twitter:description" content={ogDescription} />
        {ogImage && <meta name="twitter:image" content={ogImage} />}
      </Helmet>
      
      {/* Floating Glass Navigation */}
      <motion.nav 
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="fixed top-6 left-1/2 -translate-x-1/2 z-50"
      >
        <div 
          className="flex items-center gap-6 md:gap-10 px-6 md:px-10 py-4 rounded-full backdrop-blur-xl border shadow-2xl"
          style={{ 
            backgroundColor: isDarkTheme ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)',
            borderColor: isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
          }}
        >
          <div className="flex items-center gap-3">
            <div 
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: currentTheme.colors.accent + '20' }}
            >
              <Camera className="w-4 h-4" style={{ color: currentTheme.colors.accent }} />
            </div>
            <span 
              className="text-sm font-medium hidden md:block"
              style={{ color: isDarkTheme ? '#ffffff' : currentTheme.colors.text, fontFamily: currentTheme.fonts.heading }}
            >
              {gallery?.photographer_name}
            </span>
          </div>
          
          <div className="h-6 w-px" style={{ backgroundColor: currentTheme.colors.accent + '30' }} />
          
          <span 
            className="text-xs uppercase tracking-[0.15em] font-medium"
            style={{ color: isDarkTheme ? 'rgba(255,255,255,0.7)' : currentTheme.colors.textLight }}
          >
            {gallery?.photo_count || photos.length} Photos
            {gallery?.video_count > 0 && ` • ${gallery.video_count} Videos`}
          </span>
          
          {!isViewOnly && (
            <>
              <div className="h-6 w-px hidden md:block" style={{ backgroundColor: currentTheme.colors.accent + '30' }} />
              <button
                onClick={() => setShowUploadModal(true)}
                className="hidden md:flex items-center gap-2 text-xs uppercase tracking-[0.15em] font-medium hover:opacity-70 transition-opacity"
                style={{ color: currentTheme.colors.accent }}
                data-testid="nav-upload-btn"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload
              </button>
            </>
          )}
        </div>
      </motion.nav>

      {/* Cinematic Hero Section */}
      {gallery?.cover_photo_url ? (
        <motion.section 
          ref={heroRef}
          className="relative h-[100svh] overflow-hidden"
          data-testid="hero-section"
        >
          {/* Parallax Background Image - Use optimized medium version for fast loading */}
          <motion.div 
            className="absolute inset-0"
            style={{ y: heroImageY, scale: heroScale }}
          >
            <OptimizedImage
              src={getImageUrl(gallery.cover_photo_medium_url || gallery.cover_photo_url)}
              alt="Cover"
              className="w-full h-full object-cover"
              showLoader={true}
              style={{
                objectPosition: gallery.cover_photo_position 
                  ? `${gallery.cover_photo_position.positionX}% ${gallery.cover_photo_position.positionY}%`
                  : '50% 50%'
              }}
            />
          </motion.div>
          
          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70" />
          
          {/* Hero Content */}
          <motion.div 
            className="absolute inset-0 flex flex-col justify-end items-center pb-20 md:pb-32 px-6"
            style={{ opacity: heroOpacity }}
          >
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="text-center max-w-4xl"
            >
              {gallery?.event_title && (
                <p className="text-sm md:text-base uppercase tracking-[0.3em] text-white/70 mb-4">
                  {gallery.event_date && new Date(gallery.event_date).toLocaleDateString('en-US', { 
                    month: 'long', day: 'numeric', year: 'numeric' 
                  })}
                </p>
              )}
              <h1 
                className="text-5xl md:text-7xl lg:text-8xl font-normal text-white tracking-tight leading-[0.95] mb-6"
                style={{ fontFamily: currentTheme.fonts.heading }}
              >
                {gallery?.event_title || gallery?.title}
              </h1>
              
              {/* Elegant Credits Layout */}
              {gallery?.contributors && gallery.contributors.length > 0 && (
                <div className="mt-8">
                  {/* Owner/Curator Section */}
                  {(() => {
                    const owner = gallery.contributors.find(c => c.is_owner);
                    const others = gallery.contributors.filter(c => !c.is_owner);
                    
                    return (
                      <>
                        {/* The Story, Curated by */}
                        <div className="mb-6">
                          <p className="text-xs text-white/40 uppercase tracking-[0.3em] mb-2">
                            The Story, Curated by
                          </p>
                          <p className="text-xl md:text-2xl text-white/95 font-light" style={{ fontFamily: 'Playfair Display, serif' }}>
                            {owner?.name || gallery?.photographer_name}
                          </p>
                        </div>
                        
                        {/* Other Contributors */}
                        {others.length > 0 && (
                          <div className="mt-6">
                            <p className="text-xs text-white/30 uppercase tracking-[0.2em] mb-4">with</p>
                            <div className="flex flex-wrap justify-center gap-x-6 gap-y-3">
                              {others.map((c, i) => (
                                <div key={i} className="text-center">
                                  <p className="text-white/80 text-sm font-medium">{c.name}</p>
                                  <p className="text-white/40 text-[10px] uppercase tracking-wider mt-0.5">
                                    {c.title || c.role || 'Contributor'}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </motion.div>
            
            {/* Scroll Indicator */}
            <motion.div 
              className="absolute bottom-8 left-1/2 -translate-x-1/2"
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <ChevronDown className="w-6 h-6 text-white/50" />
            </motion.div>
          </motion.div>
        </motion.section>
      ) : (
        /* Simple Header when no cover photo */
        <section className="pt-32 pb-16 px-6 md:px-12" style={{ backgroundColor: currentTheme.colors.background }}>
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-4xl mx-auto text-center"
          >
            {gallery?.event_date && (
              <p 
                className="text-xs uppercase tracking-[0.3em] mb-4"
                style={{ color: currentTheme.colors.textLight }}
              >
                {new Date(gallery.event_date).toLocaleDateString('en-US', { 
                  month: 'long', day: 'numeric', year: 'numeric' 
                })}
              </p>
            )}
            <h1 
              className="text-4xl md:text-6xl lg:text-7xl font-normal tracking-tight mb-4"
              style={{ fontFamily: currentTheme.fonts.heading, color: getContrastTextColor(currentTheme.colors.background) }}
            >
              {gallery?.event_title || gallery?.title}
            </h1>
            
            {/* Elegant Credits Layout */}
            {gallery?.contributors && gallery.contributors.length > 0 && (
              <div className="mt-8">
                {(() => {
                  const owner = gallery.contributors.find(c => c.is_owner);
                  const others = gallery.contributors.filter(c => !c.is_owner);
                  const textColor = getContrastTextColor(currentTheme.colors.background);
                  const subtleColor = getSubtleTextColor(currentTheme.colors.background, 0.6);
                  
                  return (
                    <>
                      {/* The Story, Curated by */}
                      <div className="mb-6">
                        <p className="text-xs uppercase tracking-[0.3em] mb-2" style={{ color: subtleColor }}>
                          The Story, Curated by
                        </p>
                        <p className="text-xl md:text-2xl font-light" style={{ fontFamily: currentTheme.fonts.heading, color: textColor }}>
                          {owner?.name || gallery?.photographer_name}
                        </p>
                      </div>
                      
                      {/* Other Contributors */}
                      {others.length > 0 && (
                        <div className="mt-6">
                          <p className="text-xs uppercase tracking-[0.2em] mb-4" style={{ color: getSubtleTextColor(currentTheme.colors.background, 0.5) }}>with</p>
                          <div className="flex flex-wrap justify-center gap-x-6 gap-y-3">
                            {others.map((c, i) => (
                              <div key={i} className="text-center">
                                <p className="text-sm font-medium" style={{ color: textColor }}>{c.name}</p>
                                <p className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: subtleColor }}>
                                  {c.title || c.role || 'Contributor'}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </motion.div>
        </section>
      )}

      {/* Expired Gallery Message */}
      {gallery?.is_expired && (
        <div className="px-6 md:px-12 py-24">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-xl mx-auto p-8 rounded-sm text-center border-2 border-dashed"
            style={{ borderColor: currentTheme.colors.accent + '50' }}
          >
            <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: currentTheme.colors.accent }} />
            <h3 className="text-xl font-medium mb-2" style={{ fontFamily: currentTheme.fonts.heading, color: getContrastTextColor(currentTheme.colors.background) }}>
              Gallery Expired
            </h3>
            <p style={{ color: getSubtleTextColor(currentTheme.colors.background, 0.7) }}>
              This gallery is no longer accessible. Please contact the photographer.
            </p>
          </motion.div>
        </div>
      )}

      {!gallery?.is_expired && (
        <>
          {/* Guest Upload CTA - Prominent position at top */}
          {!isViewOnly && gallery?.guest_upload_enabled && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="py-8 px-6 text-center"
              style={{ backgroundColor: currentTheme.colors.background }}
            >
              <motion.button
                data-testid="guest-upload-cta-top"
                onClick={() => setShowUploadModal(true)}
                className="inline-flex items-center gap-3 px-8 py-4 rounded-full font-medium transition-all duration-300 shadow-lg hover:shadow-xl"
                style={{ 
                  backgroundColor: currentTheme.colors.accent,
                  color: getContrastTextColor(currentTheme.colors.accent)
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Camera className="w-5 h-5" />
                Share Your Photos
              </motion.button>
              <p className="mt-3 text-sm" style={{ color: getSubtleTextColor(currentTheme.colors.background, 0.7) }}>
                Captured a moment? Add it to the gallery!
              </p>
            </motion.div>
          )}

          {/* Description */}
          {gallery?.description && (
            <motion.section 
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="py-16 md:py-24 px-6 md:px-12"
              style={{ backgroundColor: currentTheme.colors.background }}
            >
              <div className="max-w-2xl mx-auto text-center">
                <p 
                  className="text-lg md:text-xl leading-relaxed font-light"
                  style={{ color: getSubtleTextColor(currentTheme.colors.background, 0.8), fontFamily: currentTheme.fonts.body }}
                >
                  {gallery.description}
                </p>
              </div>
            </motion.section>
          )}

          {/* Highlights Bento Grid */}
          {getHighlightPhotos().length > 0 && (
            <section id="section-highlights" className="py-16 md:py-24 px-6 md:px-12 lg:px-24" style={{ backgroundColor: currentTheme.colors.secondary }}>
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
                className="max-w-screen-2xl mx-auto"
              >
                <div className="text-center mb-16">
                  <p 
                    className="text-xs uppercase tracking-[0.3em] mb-3"
                    style={{ color: getContrastTextColor(currentTheme.colors.secondary) === '#ffffff' ? currentTheme.colors.accent : currentTheme.colors.accent }}
                  >
                    Featured Moments
                  </p>
                  <h2 
                    className="text-4xl md:text-5xl lg:text-6xl font-normal tracking-tight"
                    style={{ fontFamily: currentTheme.fonts.heading, color: getContrastTextColor(currentTheme.colors.secondary) }}
                  >
                    Highlights
                  </h2>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 auto-rows-[200px] md:auto-rows-[250px] gap-4 md:gap-6">
                  {getHighlightPhotos().slice(0, 8).map((photo, idx) => {
                    // Determine span based on position for visual interest
                    let span = 'standard';
                    if (idx === 0) span = 'hero';
                    else if (idx === 1 || idx === 4) span = 'portrait';
                    else if (idx === 3) span = 'wide';
                    
                    return (
                      <BentoItem
                        key={photo.id}
                        photo={photo}
                        index={idx}
                        span={span}
                        onView={setLightboxIndex}
                        onDownload={handleDownload}
                        photoIndex={photos.findIndex(p => p.id === photo.id)}
                      />
                    );
                  })}
                </div>
              </motion.div>
            </section>
          )}

        {/* Download Button with Dropdown - Show when gallery has photos */}
        {photos.length > 0 && (
          <div className="py-8 text-center relative">
            <div className="inline-block relative">
              <button
                data-testid="download-all-button"
                onClick={() => {
                  if (gallery?.has_download_all_password && !downloadInfo) {
                    // Password required - show modal
                    setShowDownloadAllModal(true);
                  } else if (!gallery?.has_download_all_password && !downloadInfo) {
                    // No password required - fetch download info directly
                    handleVerifyDownloadPassword();
                  } else {
                    // Already verified - toggle dropdown
                    setShowDownloadDropdown(!showDownloadDropdown);
                  }
                }}
                className="inline-flex items-center gap-3 px-8 py-4 rounded-full font-medium transition-all duration-300"
                style={{ 
                  backgroundColor: currentTheme.colors.accent,
                  color: getContrastTextColor(currentTheme.colors.accent)
                }}
              >
                <Download className="w-5 h-5" />
                Download Photos
                <ChevronDown className={`w-4 h-4 transition-transform ${showDownloadDropdown ? 'rotate-180' : ''}`} />
              </button>
              
              {/* Download Dropdown */}
              <AnimatePresence>
                {showDownloadDropdown && downloadInfo && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="absolute left-1/2 -translate-x-1/2 mt-2 w-72 rounded-xl shadow-2xl overflow-hidden z-50"
                    style={{ backgroundColor: currentTheme.colors.secondary }}
                  >
                    <div className="p-2">
                      {/* Download All Option */}
                      <button
                        onClick={() => handleSectionDownload(null, 'All_Photos')}
                        disabled={downloadingSection}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-lg hover:bg-white/10 transition-colors text-left"
                        style={{ color: getContrastTextColor(currentTheme.colors.secondary) }}
                      >
                        <div className="flex items-center gap-3">
                          <Download className="w-4 h-4" style={{ color: currentTheme.colors.accent }} />
                          <span className="font-medium">Download All</span>
                        </div>
                        <span className="text-xs opacity-60">
                          {downloadInfo.total_photos} photos • {downloadInfo.total_size_mb}MB
                        </span>
                      </button>
                      
                      {/* Section Divider */}
                      {downloadInfo.sections?.length > 0 && (
                        <div className="border-t my-2" style={{ borderColor: getSubtleTextColor(currentTheme.colors.secondary, 0.2) }} />
                      )}
                      
                      {/* Individual Sections */}
                      {downloadInfo.sections?.map((section) => (
                        <button
                          key={section.id}
                          onClick={() => handleSectionDownload(section.id, section.title)}
                          disabled={downloadingSection}
                          className="w-full flex items-center justify-between px-4 py-3 rounded-lg hover:bg-white/10 transition-colors text-left"
                          style={{ color: getContrastTextColor(currentTheme.colors.secondary) }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: currentTheme.colors.accent + '40' }} />
                            <span className="text-sm">{section.title}</span>
                          </div>
                          <span className="text-xs opacity-60">
                            {section.photo_count} • {section.size_mb}MB
                          </span>
                        </button>
                      ))}
                      
                      {/* Integration Sources Section */}
                      {downloadInfo.integration_sources?.length > 0 && (
                        <>
                          <div className="border-t my-2" style={{ borderColor: getSubtleTextColor(currentTheme.colors.secondary, 0.2) }} />
                          <div className="px-4 py-2">
                            <p className="text-xs uppercase tracking-wider opacity-50 mb-2" style={{ color: getContrastTextColor(currentTheme.colors.secondary) }}>
                              External Sources
                            </p>
                          </div>
                          {downloadInfo.integration_sources.map((source, idx) => (
                            <a
                              key={idx}
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-full flex items-center justify-between px-4 py-3 rounded-lg hover:bg-white/10 transition-colors text-left"
                              style={{ color: getContrastTextColor(currentTheme.colors.secondary) }}
                              onClick={(e) => {
                                if (!source.url) {
                                  e.preventDefault();
                                  toast.info('Videos are embedded in the gallery');
                                }
                              }}
                            >
                              <div className="flex items-center gap-3">
                                {source.type === 'gdrive' && (
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M7.71 3.5L1.15 15l3.43 5.5L11.14 9 7.71 3.5zM16.29 3.5H9.14l6.43 11h7.14l-6.42-11zM8.57 16l-3.43 4.5h13.72l3.43-4.5H8.57z"/>
                                  </svg>
                                )}
                                {source.type === 'pcloud' && <Cloud className="w-4 h-4" />}
                                {source.type === 'fotoshare' && <Film className="w-4 h-4" />}
                                {source.type === 'youtube' && <Youtube className="w-4 h-4" />}
                                <div>
                                  <span className="text-sm block">{source.section_name}</span>
                                  <span className="text-xs opacity-60">{source.label}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs opacity-60">
                                  {source.photo_count ? `${source.photo_count} photos` : ''}
                                  {source.video_count ? `${source.video_count} videos` : ''}
                                </span>
                                {source.url && <ExternalLink className="w-3 h-3 opacity-60" />}
                              </div>
                            </a>
                          ))}
                        </>
                      )}
                    </div>
                    
                    {/* Chunk Info */}
                    {downloadInfo.chunk_count > 1 && (
                      <div className="px-4 py-2 text-xs text-center border-t" 
                           style={{ borderColor: getSubtleTextColor(currentTheme.colors.secondary, 0.2), color: getSubtleTextColor(currentTheme.colors.secondary, 0.6) }}>
                        Large downloads split into 250MB parts
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            {/* Click outside to close dropdown */}
            {showDownloadDropdown && (
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowDownloadDropdown(false)}
              />
            )}
          </div>
        )}


          {/* Middle upload section removed - using hero CTA and navbar instead */}

        {/* Quick Section Navigation - Mobile optimized */}
        {getNavigationItems.length > 1 && (
          <nav 
            className="sticky top-0 z-30 py-2 md:py-3 border-b"
            style={{ 
              backgroundColor: currentTheme.colors.background,
              borderColor: getSubtleTextColor(currentTheme.colors.background, 0.1)
            }}
          >
            <div className="max-w-screen-2xl mx-auto px-3 md:px-12">
              <div 
                className="flex items-center gap-1.5 md:gap-2 overflow-x-auto scrollbar-hide py-1 -mx-1 px-1"
                style={{ 
                  WebkitOverflowScrolling: 'touch'
                }}
              >
                <span className="text-xs font-medium uppercase tracking-wider shrink-0 opacity-50 hidden sm:block"
                      style={{ color: getContrastTextColor(currentTheme.colors.background) }}>
                  Jump to:
                </span>
                {getNavigationItems.map((item) => {
                  const IconComponent = {
                    star: Star,
                    image: Image,
                    video: Video,
                    film: Film,
                    cloud: Cloud,
                    drive: HardDrive,
                    users: Users
                  }[item.icon] || Image;
                  
                  return (
                    <button
                      key={item.id}
                      onClick={() => scrollToSection(item.id)}
                      className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-1.5 rounded-full text-xs md:text-sm font-medium whitespace-nowrap active:scale-95"
                      style={{ 
                        backgroundColor: getSubtleTextColor(currentTheme.colors.background, 0.08),
                        color: getContrastTextColor(currentTheme.colors.background),
                        touchAction: 'manipulation'
                      }}
                    >
                      <IconComponent className="w-3 h-3 md:w-3.5 md:h-3.5" />
                      <span className="max-w-[100px] md:max-w-none truncate">{item.name}</span>
                      <span className="text-xs opacity-60">({item.count})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </nav>
        )}

        {/* Main Gallery Content */}
        <div className="py-8" style={{ backgroundColor: currentTheme.colors.background }}>

          {/* Sections - Photo, Video, and Fotoshare */}
          {gallery?.sections && gallery.sections.length > 0 ? (
            gallery.sections.map((section) => {
              // Check if this is a video section
              if (section.type === 'video') {
                const sectionVideos = getVideosBySection(section.id);
                if (sectionVideos.length === 0) return null;
                
                return (
                  <div key={section.id} id={`section-${section.id}`}>
                    <SmartVideoSection
                      videos={sectionVideos}
                      sectionName={section.name}
                      contributorName={section.contributor_name}
                      themeColors={currentTheme.colors}
                      themeFonts={currentTheme.fonts}
                    />
                  </div>
                );
              }
              
              // Check if this is a fotoshare/360 booth section
              if (section.type === 'fotoshare') {
                const sectionFotoshareVideos = getFotoshareVideosBySection(section.id);
                if (sectionFotoshareVideos.length === 0 && !section.fotoshare_expired) return null;
                
                return (
                  <div key={section.id} id={`section-${section.id}`} className="py-16 md:py-24" style={{ backgroundColor: currentTheme.colors.background }}>
                    <div className="max-w-screen-2xl mx-auto px-6 md:px-12 lg:px-24">
                      <FotoshareSection
                        section={section}
                        videos={sectionFotoshareVideos}
                        themeColors={currentTheme.colors}
                      />
                    </div>
                  </div>
                );
              }
              
              // Check if this is a Fotoshare Photobooth section (separate from 360° booth)
              if (section.type === 'fotoshare_photobooth') {
                return (
                  <div key={section.id} id={`section-${section.id}`} className="py-16 md:py-24" style={{ backgroundColor: currentTheme.colors.background }}>
                    <div className="max-w-screen-2xl mx-auto px-6 md:px-12 lg:px-24">
                      <PhotoboothSection
                        section={section}
                        galleryId={gallery.id}
                        isPublic={true}
                      />
                    </div>
                  </div>
                );
              }
              
              // Check if this is a pCloud section
              if (section.type === 'pcloud') {
                const sectionPcloudPhotos = getPcloudPhotosBySection(section.id);
                if (sectionPcloudPhotos.length === 0) return null;
                
                // Create lightbox-compatible photo objects for pCloud photos
                // Use full image URL for lightbox, thumbnail for grid
                const pcloudLightboxPhotos = sectionPcloudPhotos.map(p => ({
                  ...p,
                  url: `/api${p.proxy_url}`,  // Full image for lightbox viewing
                  thumbnail_url: `/api${p.thumbnail_url || p.proxy_url}`,  // Thumbnail for lightbox nav
                  is_pcloud: true
                }));
                
                // Helper functions for VirtualizedGalleryGrid
                const getPcloudThumbUrl = (photo) => `${API}${photo.thumbnail_url || photo.proxy_url}`;
                const getPcloudFullUrl = (photo) => `${API}${photo.proxy_url}`;
                
                // Use virtualized grid for large galleries (50+ photos)
                const useLargeGalleryMode = sectionPcloudPhotos.length >= LARGE_GALLERY_THRESHOLD;
                
                return (
                  <motion.section 
                    key={section.id}
                    id={`section-${section.id}`}
                    className="py-16 md:py-24"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                  >
                    <div className="max-w-screen-2xl mx-auto px-6 md:px-12 lg:px-24">
                      {/* Section Header */}
                      <motion.div 
                        className="text-center mb-12 md:mb-16"
                        initial={{ y: 30, opacity: 0 }}
                        whileInView={{ y: 0, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                      >
                        <p 
                          className="text-xs uppercase tracking-[0.3em] mb-3"
                          style={{ color: getContrastTextColor(currentTheme.colors.background) === '#ffffff' ? currentTheme.colors.textLight : currentTheme.colors.accent }}
                        >
                          {sectionPcloudPhotos.length} Photos
                        </p>
                        <h3 
                          className="text-3xl md:text-4xl lg:text-5xl font-normal tracking-tight"
                          style={{ fontFamily: currentTheme.fonts.heading, color: getContrastTextColor(currentTheme.colors.background) }}
                        >
                          {section.name}
                        </h3>
                      </motion.div>
                      
                      {/* pCloud Photos Grid - Using LazyMasonryGrid for all sizes */}
                      <LazyMasonryGrid
                        photos={sectionPcloudPhotos}
                        initialCount={PHOTOS_PER_BATCH}
                        batchSize={PHOTOS_PER_BATCH}
                        onPhotoClick={(index) => {
                          setPcloudLightboxPhotos(pcloudLightboxPhotos);
                          setPcloudLightboxIndex(index);
                        }}
                        getThumbUrl={getPcloudThumbUrl}
                        getFullUrl={getPcloudFullUrl}
                        themeColors={currentTheme.colors}
                        showSupplierName={true}
                      />
                    </div>
                  </motion.section>
                );
              }
              
              // Check if this is a Google Drive section
              if (section.type === 'gdrive') {
                const sectionGdrivePhotos = getGdrivePhotosBySection(section.id);
                if (sectionGdrivePhotos.length === 0) return null;
                
                return (
                  <div key={section.id} id={`section-${section.id}`} className="py-16 md:py-24" style={{ backgroundColor: currentTheme.colors.background }}>
                    <div className="max-w-screen-2xl mx-auto px-6 md:px-12 lg:px-24">
                      <GoogleDriveSection
                        section={section}
                        photos={sectionGdrivePhotos}
                        themeColors={currentTheme.colors}
                        isEditable={false}
                      />
                    </div>
                  </div>
                );
              }
              
              // Photo section
              const sectionPhotos = getRegularPhotosBySection(section.id);
              if (sectionPhotos.length === 0) return null;
              const isExpanded = isSectionExpanded(section.id);
              const useLargeGalleryMode = sectionPhotos.length >= LARGE_GALLERY_THRESHOLD;
              const displayPhotos = useLargeGalleryMode ? sectionPhotos : (isExpanded ? sectionPhotos : sectionPhotos.slice(0, PREVIEW_COUNT));
              const hasMore = !useLargeGalleryMode && sectionPhotos.length > PREVIEW_COUNT;
              
              // Helper functions for VirtualizedGalleryGrid
              const getPhotoThumbUrl = (photo) => getImageUrl(photo.thumbnail_medium_url || photo.thumbnail_url || photo.url);
              const getPhotoFullUrl = (photo) => getImageUrl(photo.url);
              
              return (
                <motion.section 
                  key={section.id} 
                  className="py-16 md:py-24"
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                >
                  <div className="max-w-screen-2xl mx-auto px-6 md:px-12 lg:px-24">
                    {/* Section Header */}
                    <motion.div 
                      className="text-center mb-12 md:mb-16"
                      initial={{ y: 30, opacity: 0 }}
                      whileInView={{ y: 0, opacity: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.6 }}
                    >
                      <p 
                        className="text-xs uppercase tracking-[0.3em] mb-3"
                        style={{ color: currentTheme.colors.accent }}
                      >
                        {sectionPhotos.length} Photos
                      </p>
                      <h3 
                        className="text-3xl md:text-4xl lg:text-5xl font-normal tracking-tight"
                        style={{ fontFamily: currentTheme.fonts.heading, color: getContrastTextColor(currentTheme.colors.background) }}
                      >
                        {section.name}
                      </h3>
                      {section.contributor_name && (
                        <p className="text-sm mt-2" style={{ color: getSubtleTextColor(currentTheme.colors.background, 0.6) }}>
                          {section.contributor_role ? (
                            <>
                              <span className="uppercase tracking-wider text-[10px]" style={{ color: getSubtleTextColor(currentTheme.colors.background, 0.5) }}>
                                {section.contributor_role}
                              </span>
                              <span className="mx-2">·</span>
                            </>
                          ) : null}
                          <span style={{ color: getSubtleTextColor(currentTheme.colors.background, 0.8) }}>{section.contributor_name}</span>
                        </p>
                      )}
                      
                      {/* Section Download Button */}
                      {downloadInfo && (
                        <motion.button
                          onClick={() => handleSectionDownload(section.id, section.name)}
                          disabled={downloadingSection === section.id}
                          className="mt-6 inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-300 hover:scale-105"
                          style={{ 
                            backgroundColor: currentTheme.colors.accent + '15',
                            color: currentTheme.colors.accent,
                            border: `1px solid ${currentTheme.colors.accent}30`
                          }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.98 }}
                          data-testid={`download-section-${section.id}`}
                        >
                          {downloadingSection === section.id ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Downloading...
                            </>
                          ) : (
                            <>
                              <Download className="w-4 h-4" />
                              Download This Section
                            </>
                          )}
                        </motion.button>
                      )}
                    </motion.div>
                    
                    {/* Photo Grid - Using LazyMasonryGrid */}
                    <LazyMasonryGrid
                      photos={sectionPhotos}
                      initialCount={PHOTOS_PER_BATCH}
                      batchSize={PHOTOS_PER_BATCH}
                      onPhotoClick={(index, photo) => {
                        const globalIndex = photos.findIndex(p => p.id === photo.id);
                        setLightboxIndex(globalIndex >= 0 ? globalIndex : index);
                      }}
                      getThumbUrl={getPhotoThumbUrl}
                      getFullUrl={getPhotoFullUrl}
                      themeColors={currentTheme.colors}
                      showSupplierName={!!section.contributor_name}
                    />
                  </div>
                </motion.section>
              );
            })
          ) : null}

          {/* Unsorted Photos Section */}
          {getRegularPhotosWithoutSection().length > 0 && (
            (() => {
              const unsortedPhotos = getRegularPhotosWithoutSection();
              const sectionId = 'unsorted';
              const useLargeGalleryMode = unsortedPhotos.length >= LARGE_GALLERY_THRESHOLD;
              const isExpanded = isSectionExpanded(sectionId);
              const displayPhotos = useLargeGalleryMode ? unsortedPhotos : (isExpanded ? unsortedPhotos : unsortedPhotos.slice(0, PREVIEW_COUNT));
              const hasMore = !useLargeGalleryMode && unsortedPhotos.length > PREVIEW_COUNT;
              
              // Helper functions for VirtualizedGalleryGrid
              const getPhotoThumbUrl = (photo) => getImageUrl(photo.thumbnail_medium_url || photo.thumbnail_url || photo.url);
              const getPhotoFullUrl = (photo) => getImageUrl(photo.url);
              
              return (
                <motion.section 
                  id="section-unsorted"
                  className="py-16 md:py-24"
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                >
                  <div className="max-w-screen-2xl mx-auto px-6 md:px-12 lg:px-24">
                    {(gallery?.sections && gallery.sections.length > 0) || getHighlightPhotos().length > 0 ? (
                      <motion.div 
                        className="text-center mb-12 md:mb-16"
                        initial={{ y: 30, opacity: 0 }}
                        whileInView={{ y: 0, opacity: 1 }}
                        viewport={{ once: true }}
                      >
                        <p 
                          className="text-xs uppercase tracking-[0.3em] mb-3"
                          style={{ color: currentTheme.colors.accent }}
                        >
                          {unsortedPhotos.length} Photos
                        </p>
                        <h3 
                          className="text-3xl md:text-4xl lg:text-5xl font-normal tracking-tight"
                          style={{ fontFamily: currentTheme.fonts.heading, color: getContrastTextColor(currentTheme.colors.background) }}
                        >
                          {gallery?.sections?.length > 0 ? 'More Moments' : 'Gallery'}
                        </h3>
                      </motion.div>
                    ) : null}
                    
                    {/* Photo Grid - Using LazyMasonryGrid */}
                    <LazyMasonryGrid
                      photos={unsortedPhotos}
                      initialCount={PHOTOS_PER_BATCH}
                      batchSize={PHOTOS_PER_BATCH}
                      onPhotoClick={(index, photo) => {
                        const globalIndex = photos.findIndex(p => p.id === photo.id);
                        setLightboxIndex(globalIndex >= 0 ? globalIndex : index);
                      }}
                      getThumbUrl={getPhotoThumbUrl}
                      getFullUrl={getPhotoFullUrl}
                      themeColors={currentTheme.colors}
                    />
                  </div>
                </motion.section>
              );
            })()
          )}

          {/* Guest Photos Section */}
          {getGuestPhotos().length > 0 && (
            (() => {
              const guestPhotos = getGuestPhotos();
              const bgTextColor = getContrastTextColor(currentTheme.colors.background);
              const subtleColor = getSubtleTextColor(currentTheme.colors.background, 0.6);
              
              // Helper functions for LazyMasonryGrid
              const getGuestThumbUrl = (photo) => getImageUrl(photo.thumbnail_medium_url || photo.thumbnail_url || photo.url);
              const getGuestFullUrl = (photo) => getImageUrl(photo.url);
              
              return (
                <div 
                  id="section-guest-uploads"
                  className="mb-12 mt-16 pt-12 border-t-2"
                  style={{ borderColor: getSubtleTextColor(currentTheme.colors.background, 0.2) }}
                >
                  <div className="text-center mb-8">
                    <h4
                      className="text-2xl md:text-3xl font-normal"
                      style={{ fontFamily: currentTheme.fonts.heading, color: bgTextColor }}
                    >
                      Guest Uploads
                      <span className="text-lg ml-2" style={{ color: subtleColor }}>({guestPhotos.length})</span>
                    </h4>
                    <p className="text-sm mt-2" style={{ color: subtleColor }}>
                      Photos shared by guests
                    </p>
                  </div>
                  
                  <LazyMasonryGrid
                    photos={guestPhotos}
                    initialCount={PHOTOS_PER_BATCH}
                    batchSize={PHOTOS_PER_BATCH}
                    onPhotoClick={(index, photo) => {
                      const globalIndex = photos.findIndex(p => p.id === photo.id);
                      setLightboxIndex(globalIndex >= 0 ? globalIndex : index);
                    }}
                    getThumbUrl={getGuestThumbUrl}
                    getFullUrl={getGuestFullUrl}
                    themeColors={currentTheme.colors}
                  />
                </div>
              );
            })()
          )}

          {photos.length === 0 && (
            <div 
              className="text-center py-20 border rounded-sm"
              style={{ borderColor: getSubtleTextColor(currentTheme.colors.background, 0.2) }}
            >
              <p style={{ color: getSubtleTextColor(currentTheme.colors.background, 0.6) }}>No photos yet. Be the first to upload!</p>
            </div>
          )}
        </div>
        </>
      )}

      {/* Premium Lightbox */}
      {lightboxIndex !== null && (
        <PremiumLightbox
          photos={photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onDownload={handleDownload}
          backendUrl={BACKEND_URL}
        />
      )}

      {showDownloadAllModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm max-w-md w-full p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-normal" style={{ fontFamily: 'Playfair Display, serif' }}>
                Download Photos
              </h3>
              <button onClick={() => !isDownloadingAll && setShowDownloadAllModal(false)} disabled={isDownloadingAll}>
                <X className="w-6 h-6" strokeWidth={1.5} />
              </button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              setIsDownloadingAll(true);
              try {
                // Verify password and fetch download info
                const response = await axios.post(
                  `${API}/public/gallery/${shareLink}/download-info`,
                  { password: downloadAllPassword }
                );
                setDownloadInfo(response.data);
                toast.success('Password verified! Choose what to download.', { id: 'verify-pwd' });
                setShowDownloadAllModal(false);
                setShowDownloadDropdown(true);
              } catch (error) {
                if (error.response?.status === 401) {
                  toast.error('Invalid download password', { id: 'verify-pwd' });
                } else {
                  toast.error('Failed to verify password', { id: 'verify-pwd' });
                }
              } finally {
                setIsDownloadingAll(false);
              }
            }} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Enter Download Password</label>
                <input
                  data-testid="download-all-password-input"
                  type="password"
                  value={downloadAllPassword}
                  onChange={(e) => setDownloadAllPassword(e.target.value)}
                  className="flex h-10 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm"
                  placeholder="Download password"
                  required
                  autoFocus
                  disabled={isDownloadingAll}
                />
                <p className="text-xs text-zinc-500 mt-2">
                  This password was provided by the photographer
                </p>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowDownloadAllModal(false)}
                  className="border border-input h-10 px-6 rounded-sm disabled:opacity-50"
                  disabled={isDownloadingAll}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="download-all-submit-button"
                  disabled={isDownloadingAll}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-6 rounded-sm font-medium flex items-center gap-2 disabled:opacity-70"
                >
                  {isDownloadingAll ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" strokeWidth={1.5} />
                      Continue
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Upload Modal - Opens from top CTA button */}
      <AnimatePresence>
        {showUploadModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => !uploading && setShowUploadModal(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 25 }}
              className="bg-white rounded-2xl max-w-lg w-full p-8 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center">
                    <Camera className="w-5 h-5 text-zinc-600" />
                  </div>
                  <h3 className="text-xl font-medium">Share Your Photos</h3>
                </div>
                <button 
                  onClick={() => !uploading && setShowUploadModal(false)} 
                  disabled={uploading}
                  className="p-2 hover:bg-zinc-100 rounded-full transition-colors disabled:opacity-50"
                  data-testid="close-upload-modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div
                {...getRootProps()}
                data-testid="modal-upload-dropzone"
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 ${
                  isDragActive ? 'border-zinc-800 bg-zinc-50 scale-[1.02]' : 'border-zinc-300 hover:border-zinc-400'
                }`}
              >
                <input {...getInputProps()} disabled={uploading} />
                
                {uploading && uploadProgress.length > 0 ? (
                  <div className="space-y-4">
                    {/* Upload Summary Header */}
                    <div className="flex items-center justify-center gap-3">
                      <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
                      <p className="font-medium text-zinc-700">
                        Uploading {uploadProgress.filter(f => f.status === 'uploading' || f.status === 'pending').length} of {uploadProgress.length} photo(s)
                      </p>
                    </div>
                    
                    {/* Progress Summary Bar */}
                    <div className="max-w-sm mx-auto">
                      <div className="flex justify-between text-xs text-zinc-500 mb-1">
                        <span>{uploadProgress.filter(f => f.status === 'success').length} completed</span>
                        <span>{uploadProgress.filter(f => f.status === 'error').length > 0 ? `${uploadProgress.filter(f => f.status === 'error').length} failed` : ''}</span>
                      </div>
                      <div className="w-full bg-zinc-200 rounded-full h-2">
                        <div 
                          className="h-2 rounded-full bg-green-500 transition-all duration-300"
                          style={{ 
                            width: `${(uploadProgress.filter(f => f.status === 'success').length / uploadProgress.length) * 100}%` 
                          }}
                        />
                      </div>
                    </div>
                    
                    {/* All Files List - Scrollable */}
                    <div className="max-w-sm mx-auto max-h-64 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                      {uploadProgress.map((file, index) => (
                        <div 
                          key={index} 
                          className={`flex items-center gap-3 text-left rounded-lg p-2.5 transition-colors ${
                            file.status === 'uploading' ? 'bg-blue-50 border border-blue-100' :
                            file.status === 'success' ? 'bg-green-50 border border-green-100' :
                            file.status === 'error' ? 'bg-red-50 border border-red-100' :
                            'bg-zinc-50 border border-zinc-100'
                          }`}
                        >
                          {/* File Number */}
                          <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                            file.status === 'success' ? 'bg-green-500 text-white' :
                            file.status === 'error' ? 'bg-red-500 text-white' :
                            file.status === 'uploading' ? 'bg-blue-500 text-white' :
                            'bg-zinc-300 text-zinc-600'
                          }`}>
                            {file.status === 'success' ? '✓' : file.status === 'error' ? '!' : index + 1}
                          </div>
                          
                          {/* File Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-zinc-700 truncate font-medium">{file.name}</p>
                            {file.status === 'uploading' && (
                              <div className="w-full bg-zinc-200 rounded-full h-1.5 mt-1.5">
                                <div 
                                  className="h-1.5 rounded-full bg-blue-500 transition-all duration-300"
                                  style={{ width: `${file.progress}%` }}
                                />
                              </div>
                            )}
                            {file.status === 'error' && file.errorMsg && (
                              <p className="text-xs text-red-500 mt-0.5">{file.errorMsg}</p>
                            )}
                          </div>
                          
                          {/* Status Icon */}
                          <div className="flex-shrink-0">
                            {file.status === 'uploading' && (
                              <span className="text-xs text-blue-600 font-medium">{file.progress}%</span>
                            )}
                            {file.status === 'success' && <CheckCircle className="w-5 h-5 text-green-500" />}
                            {file.status === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
                            {file.status === 'pending' && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : isDragActive ? (
                  <>
                    <Upload className="w-12 h-12 mx-auto mb-4 text-zinc-600" />
                    <p className="text-lg font-medium text-zinc-700">Drop photos here...</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-12 h-12 mx-auto mb-4 text-zinc-400" />
                    <p className="text-lg font-medium text-zinc-700 mb-2">
                      Drag & drop photos here
                    </p>
                    <p className="text-sm text-zinc-500 mb-4">or click to browse</p>
                    <button 
                      type="button"
                      className="px-6 py-2 bg-zinc-900 text-white rounded-full text-sm font-medium hover:bg-zinc-800 transition-colors"
                    >
                      Select Photos
                    </button>
                  </>
                )}
              </div>
              
              <p className="text-xs text-zinc-500 mt-4 text-center">
                Max 50MB per file • JPEG, PNG, GIF, WebP, HEIC
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Premium Lightbox */}
      {lightboxIndex !== null && (
        <PremiumLightbox
          photos={photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onDownload={handleDownload}
          backendUrl={BACKEND_URL}
        />
      )}

      {/* pCloud Photos Lightbox */}
      {pcloudLightboxIndex !== null && (
        <PremiumLightbox
          photos={pcloudLightboxPhotos}
          initialIndex={pcloudLightboxIndex}
          onClose={() => setPcloudLightboxIndex(null)}
          onDownload={(photo) => {
            // Download pCloud photo through our proxy to bypass ISP blocks
            // photo.url format: /api/pcloud/serve/{code}/{fileid}
            // Convert to download endpoint: /api/pcloud/download/{code}/{fileid}
            let downloadUrl;
            if (photo.url && photo.url.includes('/pcloud/serve/')) {
              // Use our proxy download endpoint
              downloadUrl = photo.url.replace('/pcloud/serve/', '/pcloud/download/');
              downloadUrl = `${BACKEND_URL}${downloadUrl}?filename=${encodeURIComponent(photo.name || 'photo.jpg')}`;
            } else if (photo.pcloud_code && photo.fileid) {
              // Build proxy download URL from photo metadata
              downloadUrl = `${BACKEND_URL}/api/pcloud/download/${photo.pcloud_code}/${photo.fileid}?filename=${encodeURIComponent(photo.name || 'photo.jpg')}`;
            } else {
              // Fallback to original URL
              downloadUrl = getImageUrl(photo.url);
            }
            
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = photo.name || 'photo.jpg';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }}
          backendUrl={BACKEND_URL}
        />
      )}

      {/* Social Share Panel - Floating on right side */}
      <SocialSharePanel 
        galleryTitle={gallery?.title || 'Photo Gallery'}
        shareLink={`${window.location.origin}/g/${shareLink}`}
        isVisible={authenticated && !gallery?.is_expired}
      />

      {/* Elegant Footer */}
      <footer 
        className="py-16 md:py-24"
        style={{ backgroundColor: currentTheme.colors.secondary }}
      >
        <div className="max-w-screen-2xl mx-auto px-6 md:px-12 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div 
              className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-6"
              style={{ backgroundColor: currentTheme.colors.accent + '20' }}
            >
              <Heart className="w-6 h-6" style={{ color: currentTheme.colors.accent }} />
            </div>
            <p 
              className="text-lg md:text-xl font-light mb-2"
              style={{ fontFamily: currentTheme.fonts.heading, color: getContrastTextColor(currentTheme.colors.secondary) }}
            >
              Thank you for being part of this special day
            </p>
            <p className="text-sm" style={{ color: getSubtleTextColor(currentTheme.colors.secondary, 0.7) }}>
              Gathered with love by {gallery?.photographer_name || brandConfig.brand_name || 'PhotoShare'}
            </p>
            <div 
              className="w-16 h-px mx-auto my-8"
              style={{ backgroundColor: currentTheme.colors.accent + '40' }}
            />
            <p 
              className="text-xs uppercase tracking-[0.2em]"
              style={{ color: getSubtleTextColor(currentTheme.colors.secondary, 0.6) }}
            >
              {brandConfig.brand_name || 'EventsGallery'} © 2024
            </p>
          </motion.div>
        </div>
      </footer>
    </div>
  );
};

// Highlight photo - square grid item
const HighlightPhotoItem = ({ photo, photoIndex, onView, onDownload }) => (
  <div
    data-testid={`highlight-photo-item-${photo.id}`}
    className="highlight-item group relative cursor-pointer"
    onClick={() => onView(photoIndex)}
  >
    <OptimizedImage
      src={getImageUrl(photo.url)}
      alt="Highlight photo"
      className="w-full h-full object-cover rounded-sm"
    />
    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-300 flex items-center justify-center rounded-sm">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDownload(photo);
        }}
        className="bg-white text-zinc-900 hover:bg-zinc-100 h-10 w-10 rounded-sm flex items-center justify-center transition-all duration-300"
      >
        <Download className="w-5 h-5" strokeWidth={1.5} />
      </button>
    </div>
    <div className="absolute top-2 left-2 bg-yellow-500 text-white px-2 py-1 rounded text-xs font-medium pointer-events-none flex items-center gap-1">
      <Star className="w-3 h-3" /> Featured
    </div>
  </div>
);

// Regular photo - masonry item with natural aspect ratio
const PublicPhotoItem = ({ photo, photoIndex, onView, onDownload, isGuest }) => (
  <div
    data-testid={`public-photo-item-${photo.id}`}
    className="masonry-item group relative cursor-pointer"
    onClick={() => onView(photoIndex)}
  >
    <OptimizedImage
      src={getImageUrl(photo.url)}
      alt="Gallery photo"
      className="w-full h-auto rounded-sm"
    />
    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-300 flex items-center justify-center rounded-sm">
      <button
        data-testid={`download-photo-${photo.id}`}
        onClick={(e) => {
          e.stopPropagation();
          onDownload(photo);
        }}
        className="bg-white text-zinc-900 hover:bg-zinc-100 h-10 w-10 rounded-sm flex items-center justify-center transition-all duration-300"
      >
        <Download className="w-5 h-5" strokeWidth={1.5} />
      </button>
    </div>
    {isGuest && (
      <div className="absolute bottom-2 right-2 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-sm text-xs font-medium pointer-events-none">
        Guest
      </div>
    )}
  </div>
);

export default PublicGallery;
