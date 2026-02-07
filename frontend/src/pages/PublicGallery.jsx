import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import { Lock, Upload, Download, X, Camera, ChevronDown, ChevronUp, Loader2, CheckCircle, AlertCircle, Star, Share2, Heart, Play } from 'lucide-react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { getThemeStyles, themes } from '@/themes';
import PremiumLightbox from '@/components/PremiumLightbox';
import OptimizedImage from '@/components/OptimizedImage';
import SocialSharePanel from '@/components/SocialSharePanel';
import VideoSection from '@/components/VideoSection';
import useBrandConfig from '../hooks/useBrandConfig';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const PREVIEW_COUNT = 8;

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
  const [loading, setLoading] = useState(true);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState([]); // Track individual file uploads
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [guestUploadExpanded, setGuestUploadExpanded] = useState(false);
  const [showDownloadAllModal, setShowDownloadAllModal] = useState(false);
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
      const [photosRes, videosRes] = await Promise.all([
        axios.get(
          `${API}/public/gallery/${shareLink}/photos`,
          { params: { password: pwd || password } }
        ),
        axios.get(
          `${API}/public/gallery/${shareLink}/videos`,
          { params: { password: pwd || password } }
        ).catch(() => ({ data: [] })) // Videos are optional, don't fail if not available
      ]);
      setPhotos(photosRes.data);
      setVideos(videosRes.data);
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

    // Server-side duplicate check
    setUploading(true);
    setUploadProgress([{ name: 'Checking for duplicates...', status: 'uploading', progress: 50 }]);

    let filesToUpload = validFiles;
    
    try {
      const checkResponse = await axios.post(
        `${API}/public/gallery/${shareLink}/check-duplicates`,
        { filenames: validFiles.map(f => f.name) }
      );
      
      const { duplicates, new_files } = checkResponse.data;
      
      if (duplicates.length > 0) {
        toast.warning(`${duplicates.length} file(s) already uploaded: ${duplicates.slice(0, 3).join(', ')}${duplicates.length > 3 ? '...' : ''}`);
      }
      
      if (new_files.length === 0) {
        toast.info('All selected files have already been uploaded');
        setUploadProgress([]);
        setUploading(false);
        return;
      }
      
      // Filter to only new files
      filesToUpload = acceptedFiles.filter(f => new_files.includes(f.name));
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
      
      // Update status to uploading
      setUploadProgress(prev => prev.map((item, i) => 
        i === index ? { ...item, status: 'uploading' } : item
      ));

      const formData = new FormData();
      formData.append('file', file);
      if (password) {
        formData.append('password', password);
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
      
      // Use backend URL with download parameter
      const downloadUrl = `${BACKEND_URL}${photo.url}?download=true`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = photo.filename || 'photo.jpg';
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

  const handleDownloadAll = async (e) => {
    e.preventDefault();
    if (isDownloadingAll) return; // Prevent double-click
    
    setIsDownloadingAll(true);
    
    try {
      const response = await axios.post(
        `${API}/public/gallery/${shareLink}/download-all`,
        { password: downloadAllPassword },
        { 
          responseType: 'blob',
          headers: {
            'Content-Type': 'application/json'
          },
          onDownloadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            if (percentCompleted < 100) {
              toast.loading(`Downloading... ${percentCompleted}%`, { id: 'download-all' });
            }
          }
        }
      );
      
      // Create blob and download
      const blob = new Blob([response.data], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers['content-disposition'];
      let filename = `${gallery?.title || 'gallery'}_photos.zip`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }
      
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);
      
      toast.success('All photos downloaded!', { id: 'download-all' });
      setShowDownloadAllModal(false);
      setDownloadAllPassword('');
    } catch (error) {
      console.error('Download all error:', error);
      if (error.response?.status === 401) {
        toast.error('Invalid download password', { id: 'download-all' });
      } else if (error.response?.status === 403) {
        toast.error('Download all is not enabled for this gallery', { id: 'download-all' });
      } else {
        toast.error('Download failed. Please try again.', { id: 'download-all' });
      }
    } finally {
      setIsDownloadingAll(false);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-zinc-500">Loading gallery...</p>
      </div>
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
            <p className="text-base font-light mb-2" style={{ color: currentTheme.colors.textLight }}>
              by {gallery?.photographer_name}
            </p>
            <p className="text-sm" style={{ color: currentTheme.colors.textLight }}>This gallery is password protected</p>
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

  return (
    <div className="themed-gallery min-h-screen" style={themeStyles}>
      <nav className="border-b backdrop-blur-md sticky top-0 z-40" style={{ 
        borderColor: currentTheme.colors.accent,
        backgroundColor: `${currentTheme.colors.background}cc`
      }}>
        <div className="max-w-screen-2xl mx-auto px-6 md:px-12 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1
                className="text-2xl font-medium"
                style={{ fontFamily: currentTheme.fonts.heading || 'Playfair Display, serif', color: currentTheme.colors.text }}
              >
                {gallery?.title}
              </h1>
              <p className="text-sm" style={{ color: currentTheme.colors.textLight }}>by {gallery?.photographer_name}</p>
            </div>
            <Camera className="w-6 h-6" strokeWidth={1.5} style={{ color: currentTheme.colors.accent }} />
          </div>
        </div>
      </nav>

      {gallery?.cover_photo_url && (
        <div className="w-full h-64 md:h-96 overflow-hidden relative" style={{ borderBottom: `1px solid ${currentTheme.colors.accent}` }}>
          <OptimizedImage
            src={`${BACKEND_URL}${gallery.cover_photo_url}`}
            alt="Cover"
            className="w-full h-full"
            showLoader={true}
            style={{
              objectFit: 'cover',
              objectPosition: gallery.cover_photo_position 
                ? `${gallery.cover_photo_position.positionX}% ${gallery.cover_photo_position.positionY}%`
                : '50% 50%',
              transform: gallery.cover_photo_position 
                ? `scale(${gallery.cover_photo_position.scale})`
                : 'scale(1)',
              transformOrigin: 'center center'
            }}
          />
        </div>
      )}

      <div className="max-w-screen-2xl mx-auto px-6 md:px-12 py-12">
        {gallery?.event_title && (
          <div className="text-center mb-8">
            <h2 className="text-3xl md:text-4xl font-normal mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
              {gallery.event_title}
            </h2>
            {gallery.event_date && (
              <p className="text-zinc-500">
                {new Date(gallery.event_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            )}
          </div>
        )}

        {gallery?.is_expired && (
          <div className="mb-8 p-6 bg-red-50 border border-red-200 rounded-sm text-center">
            <p className="text-red-700 font-medium">This gallery has expired and is no longer accessible.</p>
            <p className="text-sm text-red-600 mt-2">Please contact the photographer for access.</p>
          </div>
        )}

        {!gallery?.is_expired && gallery?.description && (
          <div className="mb-12 text-center max-w-2xl mx-auto">
            <p className="text-base font-light text-zinc-600">{gallery.description}</p>
          </div>
        )}

        {!gallery?.is_expired && gallery?.has_download_all_password && (
          <div className="mb-8 text-center">
            <button
              data-testid="download-all-button"
              onClick={() => setShowDownloadAllModal(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-8 rounded-sm font-medium tracking-wide transition-all duration-300 inline-flex items-center gap-2"
            >
              <Download className="w-5 h-5" strokeWidth={1.5} />
              Download All Photos
            </button>
          </div>
        )}

        {!gallery?.is_expired && (
          <>
            {/* Guest Upload Section - Hidden in view-only mode */}
            {!isViewOnly && (
            <div className="mb-12">
              <button
                data-testid="guest-upload-toggle"
                onClick={() => setGuestUploadExpanded(!guestUploadExpanded)}
                disabled={!gallery?.guest_upload_enabled}
                className={`w-full border border-zinc-200 rounded-sm p-6 transition-all duration-300 flex items-center justify-between ${
                  gallery?.guest_upload_enabled
                    ? 'bg-zinc-50 hover:bg-zinc-100 cursor-pointer'
                    : 'bg-zinc-100 cursor-not-allowed opacity-60'
                }`}
              >
            <div className="flex items-center gap-3">
              <Upload className="w-6 h-6 text-zinc-600" strokeWidth={1.5} />
              <div className="text-left">
                <h3 className="text-xl font-normal" style={{ fontFamily: 'Playfair Display, serif' }}>
                  {gallery?.guest_upload_enabled ? 'Upload Your Photos' : 'Upload Window Closed'}
                </h3>
                <p className="text-sm text-zinc-500">
                  {gallery?.guest_upload_enabled 
                    ? 'Share your shots with the celebrant'
                    : 'Guest uploads are no longer accepted for this gallery'}
                </p>
              </div>
            </div>
            {guestUploadExpanded ? (
              <ChevronUp className="w-6 h-6 text-zinc-600" strokeWidth={1.5} />
            ) : (
              <ChevronDown className="w-6 h-6 text-zinc-600" strokeWidth={1.5} />
            )}
          </button>

          {guestUploadExpanded && (
            <div className="mt-6">
              <div
                {...getRootProps()}
                data-testid="guest-upload-dropzone"
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
                        <div key={index} className="flex items-center gap-3 text-left bg-white rounded-md p-2 shadow-sm">
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
                      Drag & drop your photos here, or click to select
                    </p>
                    <p className="text-sm text-zinc-500">Max 10 photos at a time • JPEG, PNG, GIF, WebP</p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
            )}

        <div>
          <h3
            className="text-3xl md:text-4xl font-normal mb-8 text-center"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            Gallery
          </h3>

          {/* Highlights Section - Grid Layout */}
          {getHighlightPhotos().length > 0 && (
            <div className="mb-16">
              <h4
                className="text-2xl md:text-3xl font-normal mb-6 text-center flex items-center justify-center gap-2"
                style={{ fontFamily: 'Playfair Display, serif' }}
              >
                <Star className="w-6 h-6 text-yellow-500" />
                Highlights
                <span className="text-zinc-400 text-lg">({getHighlightPhotos().length})</span>
              </h4>
              <div className="highlight-grid">
                {getHighlightPhotos().map((photo) => (
                  <HighlightPhotoItem
                    key={photo.id}
                    photo={photo}
                    photoIndex={photos.findIndex(p => p.id === photo.id)}
                    onView={setLightboxIndex}
                    onDownload={handleDownload}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Sections - Photo and Video */}
          {gallery?.sections && gallery.sections.length > 0 ? (
            gallery.sections.map((section) => {
              // Check if this is a video section
              if (section.type === 'video') {
                const sectionVideos = getVideosBySection(section.id);
                if (sectionVideos.length === 0) return null;
                
                return (
                  <VideoSection
                    key={section.id}
                    videos={sectionVideos}
                    sectionName={section.name}
                    contributorName={section.contributor_name}
                  />
                );
              }
              
              // Photo section
              const sectionPhotos = getRegularPhotosBySection(section.id);
              if (sectionPhotos.length === 0) return null;
              const isExpanded = isSectionExpanded(section.id);
              const displayPhotos = isExpanded ? sectionPhotos : sectionPhotos.slice(0, PREVIEW_COUNT);
              const hasMore = sectionPhotos.length > PREVIEW_COUNT;
              
              return (
                <div key={section.id} className="mb-12">
                  <div 
                    className="flex items-center justify-center gap-4 mb-6 cursor-pointer"
                    onClick={() => hasMore && toggleSectionExpand(section.id)}
                  >
                    <div className="text-center">
                      <h4
                        className="text-2xl md:text-3xl font-normal"
                        style={{ fontFamily: 'Playfair Display, serif' }}
                      >
                        {section.name}
                        <span className="text-zinc-400 text-lg ml-2">({sectionPhotos.length})</span>
                      </h4>
                      {section.contributor_name && (
                        <p className="text-sm mt-1" style={{ color: currentTheme.colors.textLight }}>
                          Photos by <span className="font-medium" style={{ color: currentTheme.colors.text }}>{section.contributor_name}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="masonry-grid">
                    {displayPhotos.map((photo, idx) => (
                      <PublicPhotoItem
                        key={photo.id}
                        photo={photo}
                        photoIndex={photos.findIndex(p => p.id === photo.id)}
                        onView={setLightboxIndex}
                        onDownload={handleDownload}
                      />
                    ))}
                  </div>
                  {hasMore && (
                    <button 
                      onClick={() => toggleSectionExpand(section.id)}
                      className="mt-6 mx-auto block px-6 py-3 border-2 border-zinc-300 rounded-full text-zinc-600 hover:border-zinc-400 hover:text-zinc-800 transition-colors flex items-center gap-2"
                    >
                      {isExpanded ? (
                        <>Collapse <ChevronUp className="w-4 h-4" /></>
                      ) : (
                        <>Show all {sectionPhotos.length} photos <ChevronDown className="w-4 h-4" /></>
                      )}
                    </button>
                  )}
                </div>
              );
            })
          ) : null}

          {getRegularPhotosWithoutSection().length > 0 && (
            (() => {
              const unsortedPhotos = getRegularPhotosWithoutSection();
              const sectionId = 'unsorted';
              const isExpanded = isSectionExpanded(sectionId);
              const displayPhotos = isExpanded ? unsortedPhotos : unsortedPhotos.slice(0, PREVIEW_COUNT);
              const hasMore = unsortedPhotos.length > PREVIEW_COUNT;
              
              return (
                <div className="mb-12">
                  {(gallery?.sections && gallery.sections.length > 0) || getHighlightPhotos().length > 0 ? (
                    <div 
                      className="flex items-center justify-center gap-4 mb-6 cursor-pointer"
                      onClick={() => hasMore && toggleSectionExpand(sectionId)}
                    >
                      <h4
                        className="text-2xl md:text-3xl font-normal text-center"
                        style={{ fontFamily: 'Playfair Display, serif' }}
                      >
                        {gallery?.sections?.length > 0 ? 'More Photos' : 'Gallery'}
                        <span className="text-zinc-400 text-lg ml-2">({unsortedPhotos.length})</span>
                      </h4>
                    </div>
                  ) : null}
                  <div className="masonry-grid">
                    {displayPhotos.map((photo) => (
                      <PublicPhotoItem
                        key={photo.id}
                        photo={photo}
                        photoIndex={photos.findIndex(p => p.id === photo.id)}
                        onView={setLightboxIndex}
                        onDownload={handleDownload}
                      />
                    ))}
                  </div>
                  {hasMore && (
                    <button 
                      onClick={() => toggleSectionExpand(sectionId)}
                      className="mt-6 mx-auto block px-6 py-3 border-2 border-zinc-300 rounded-full text-zinc-600 hover:border-zinc-400 hover:text-zinc-800 transition-colors flex items-center gap-2"
                    >
                      {isExpanded ? (
                        <>Collapse <ChevronUp className="w-4 h-4" /></>
                      ) : (
                        <>Show all {unsortedPhotos.length} photos <ChevronDown className="w-4 h-4" /></>
                      )}
                    </button>
                  )}
                </div>
              );
            })()
          )}

          {getGuestPhotos().length > 0 && (
            (() => {
              const guestPhotos = getGuestPhotos();
              const sectionId = 'guest';
              const isExpanded = isSectionExpanded(sectionId);
              const displayPhotos = isExpanded ? guestPhotos : guestPhotos.slice(0, PREVIEW_COUNT);
              const hasMore = guestPhotos.length > PREVIEW_COUNT;
              
              return (
                <div className="mb-12 mt-16 pt-12 border-t-2 border-zinc-200">
                  <div 
                    className="flex items-center justify-center gap-4 mb-6 cursor-pointer"
                    onClick={() => hasMore && toggleSectionExpand(sectionId)}
                  >
                    <h4
                      className="text-2xl md:text-3xl font-normal text-center"
                      style={{ fontFamily: 'Playfair Display, serif' }}
                    >
                      Guest Uploads
                      <span className="text-zinc-400 text-lg ml-2">({guestPhotos.length})</span>
                    </h4>
                  </div>
                  <p className="text-center text-sm text-zinc-500 mb-8">
                    Photos shared by guests
                  </p>
                  <div className="masonry-grid">
                    {displayPhotos.map((photo) => (
                      <PublicPhotoItem
                        key={photo.id}
                        photo={photo}
                        photoIndex={photos.findIndex(p => p.id === photo.id)}
                        onView={setLightboxIndex}
                        onDownload={handleDownload}
                        isGuest
                      />
                    ))}
                  </div>
                  {hasMore && (
                    <button 
                      onClick={() => toggleSectionExpand(sectionId)}
                      className="mt-6 mx-auto block px-6 py-3 border-2 border-zinc-300 rounded-full text-zinc-600 hover:border-zinc-400 hover:text-zinc-800 transition-colors flex items-center gap-2"
                    >
                      {isExpanded ? (
                        <>Collapse <ChevronUp className="w-4 h-4" /></>
                      ) : (
                        <>Show all {guestPhotos.length} photos <ChevronDown className="w-4 h-4" /></>
                      )}
                    </button>
                  )}
                </div>
              );
            })()
          )}

          {photos.length === 0 && (
            <div className="text-center py-20 border border-zinc-200 rounded-sm">
              <p className="text-zinc-500">No photos yet. Be the first to upload!</p>
            </div>
          )}
        </div>
        </>
        )}
      </div>

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
                Download All Photos
              </h3>
              <button onClick={() => !isDownloadingAll && setShowDownloadAllModal(false)} disabled={isDownloadingAll}>
                <X className="w-6 h-6" strokeWidth={1.5} />
              </button>
            </div>
            <form onSubmit={handleDownloadAll} className="space-y-6">
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
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" strokeWidth={1.5} />
                      Download
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
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

      {/* Social Share Panel - Floating on right side */}
      <SocialSharePanel 
        galleryTitle={gallery?.title || 'Photo Gallery'}
        shareLink={`${window.location.origin}/g/${shareLink}`}
        isVisible={authenticated && !gallery?.is_expired}
      />

      <footer className="border-t py-8 mt-12" style={{ borderColor: currentTheme.colors.accent }}>
        <div className="max-w-screen-2xl mx-auto px-6 md:px-12 text-center text-sm" style={{ color: currentTheme.colors.textLight }}>
          <p>© {new Date().getFullYear()} {brandConfig.brand_name || 'PhotoShare'}. Built for photographers.</p>
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
      src={`${BACKEND_URL}${photo.url}`}
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
      src={`${BACKEND_URL}${photo.url}`}
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
