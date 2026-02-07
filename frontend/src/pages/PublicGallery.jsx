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
import FotoshareSection from '@/components/FotoshareSection';
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
  const [fotoshareVideos, setFotoshareVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState([]); // Track individual file uploads
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [guestUploadExpanded, setGuestUploadExpanded] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false); // Modal for quick upload
  const [showDownloadAllModal, setShowDownloadAllModal] = useState(false);
  
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
      const [photosRes, videosRes, fotoshareRes] = await Promise.all([
        axios.get(
          `${API}/public/gallery/${shareLink}/photos`,
          { params: { password: pwd || password } }
        ),
        axios.get(
          `${API}/public/gallery/${shareLink}/videos`,
          { params: { password: pwd || password } }
        ).catch(() => ({ data: [] })), // Videos are optional, don't fail if not available
        axios.get(`${API}/galleries/${shareLink}/fotoshare-videos`).catch(() => ({ data: [] })) // Fotoshare videos
      ]);
      setPhotos(photosRes.data);
      setVideos(videosRes.data);
      setFotoshareVideos(fotoshareRes.data);
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

  // Get fotoshare videos by section
  const getFotoshareVideosBySection = (sectionId) => {
    return fotoshareVideos.filter(v => v.section_id === sectionId);
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
  
  // Determine if theme is dark
  const isDarkTheme = ['modern', 'neon', 'blackgold'].includes(gallery?.theme);

  return (
    <div className="themed-gallery min-h-screen overflow-x-hidden" style={themeStyles} data-testid="public-gallery">
      
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
              style={{ color: currentTheme.colors.text, fontFamily: currentTheme.fonts.heading }}
            >
              {gallery?.photographer_name}
            </span>
          </div>
          
          <div className="h-6 w-px" style={{ backgroundColor: currentTheme.colors.accent + '30' }} />
          
          <span 
            className="text-xs uppercase tracking-[0.15em] font-medium"
            style={{ color: currentTheme.colors.textLight }}
          >
            {photos.length} Photos
          </span>
          
          {!isViewOnly && (
            <>
              <div className="h-6 w-px hidden md:block" style={{ backgroundColor: currentTheme.colors.accent + '30' }} />
              <button
                onClick={() => setGuestUploadExpanded(true)}
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
          {/* Parallax Background Image */}
          <motion.div 
            className="absolute inset-0"
            style={{ y: heroImageY, scale: heroScale }}
          >
            <OptimizedImage
              src={`${BACKEND_URL}${gallery.cover_photo_url}`}
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
              
              {/* Contributors Grid - Professional Layout */}
              {gallery?.contributors && gallery.contributors.length > 0 ? (
                <div className="mt-6">
                  <p className="text-sm text-white/40 uppercase tracking-widest mb-4">Captured by</p>
                  <div className="flex flex-wrap justify-center gap-x-8 gap-y-4">
                    {gallery.contributors.map((c, i) => (
                      <div key={i} className="text-center min-w-[120px]">
                        <p className="text-white/90 font-medium text-sm md:text-base">{c.name}</p>
                        <p className="text-white/40 text-xs mt-0.5">
                          {c.role === 'Photography' ? 'Photography' : c.role}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-base md:text-lg text-white/60 font-light mt-4">
                  Captured by <span className="text-white/90">{gallery?.photographer_name}</span>
                </p>
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
              style={{ fontFamily: currentTheme.fonts.heading, color: currentTheme.colors.text }}
            >
              {gallery?.event_title || gallery?.title}
            </h1>
            <p style={{ color: currentTheme.colors.textLight }}>
              {gallery?.contributors && gallery.contributors.length > 0 ? (
                <span className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                  <span>Captured by</span>
                  {gallery.contributors.map((c, i) => (
                    <span key={i} className="inline-flex items-center">
                      <span style={{ color: currentTheme.colors.text }}>{c.name}</span>
                      {c.role !== 'Photography' && (
                        <span className="ml-1 text-xs opacity-60">({c.role})</span>
                      )}
                      {i < gallery.contributors.length - 1 && <span className="mx-1 opacity-40">•</span>}
                    </span>
                  ))}
                </span>
              ) : (
                <>Captured by <span style={{ color: currentTheme.colors.text }}>{gallery?.photographer_name}</span></>
              )}
            </p>
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
            <h3 className="text-xl font-medium mb-2" style={{ fontFamily: currentTheme.fonts.heading, color: currentTheme.colors.text }}>
              Gallery Expired
            </h3>
            <p style={{ color: currentTheme.colors.textLight }}>
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
                  color: isDarkTheme ? '#000' : '#fff'
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Camera className="w-5 h-5" />
                Share Your Photos
              </motion.button>
              <p className="mt-3 text-sm" style={{ color: currentTheme.colors.textLight }}>
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
                  style={{ color: currentTheme.colors.textLight, fontFamily: currentTheme.fonts.body }}
                >
                  {gallery.description}
                </p>
              </div>
            </motion.section>
          )}

          {/* Highlights Bento Grid */}
          {getHighlightPhotos().length > 0 && (
            <section className="py-16 md:py-24 px-6 md:px-12 lg:px-24" style={{ backgroundColor: currentTheme.colors.secondary }}>
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
                    style={{ color: currentTheme.colors.accent }}
                  >
                    Featured Moments
                  </p>
                  <h2 
                    className="text-4xl md:text-5xl lg:text-6xl font-normal tracking-tight"
                    style={{ fontFamily: currentTheme.fonts.heading, color: currentTheme.colors.text }}
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

        {/* Download All Button */}
        {gallery?.has_download_all_password && (
          <div className="py-8 text-center">
            <button
              data-testid="download-all-button"
              onClick={() => setShowDownloadAllModal(true)}
              className="inline-flex items-center gap-3 px-8 py-4 rounded-full font-medium transition-all duration-300"
              style={{ 
                backgroundColor: currentTheme.colors.accent,
                color: isDarkTheme ? '#000' : '#fff'
              }}
            >
              <Download className="w-5 h-5" />
              Download All Photos
            </button>
          </div>
        )}

            {/* Guest Upload Section - Hidden in view-only mode */}
            {!isViewOnly && gallery?.guest_upload_enabled && (
            <motion.section 
              id="guest-upload-section"
              className="py-16 md:py-24"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              style={{ backgroundColor: currentTheme.colors.secondary }}
            >
              <div className="max-w-3xl mx-auto px-6 md:px-12">
                <motion.div 
                  className="text-center mb-10"
                  initial={{ y: 20, opacity: 0 }}
                  whileInView={{ y: 0, opacity: 1 }}
                  viewport={{ once: true }}
                >
                  <div 
                    className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-6"
                    style={{ backgroundColor: currentTheme.colors.accent + '20' }}
                  >
                    <Camera className="w-7 h-7" style={{ color: currentTheme.colors.accent }} />
                  </div>
                  <h3 
                    className="text-3xl md:text-4xl font-normal mb-3"
                    style={{ fontFamily: currentTheme.fonts.heading, color: currentTheme.colors.text }}
                  >
                    Share Your Moments
                  </h3>
                  <p style={{ color: currentTheme.colors.textLight }}>
                    Captured something special? Add your photos to the collection.
                  </p>
                </motion.div>

                <AnimatePresence>
                  {!guestUploadExpanded ? (
                    <motion.button
                      key="upload-btn"
                      data-testid="guest-upload-toggle"
                      onClick={() => setGuestUploadExpanded(true)}
                      className="w-full py-5 rounded-full font-medium transition-all duration-300 flex items-center justify-center gap-3"
                      style={{ 
                        backgroundColor: currentTheme.colors.accent,
                        color: isDarkTheme ? '#000' : '#fff'
                      }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Upload className="w-5 h-5" />
                      Upload Your Photos
                    </motion.button>
                  ) : (
                    <motion.div
                      key="upload-area"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div
                        {...getRootProps()}
                        data-testid="guest-upload-dropzone"
                        className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300 ${
                          isDragActive ? 'scale-[1.02]' : ''
                        }`}
                        style={{ 
                          borderColor: isDragActive ? currentTheme.colors.accent : currentTheme.colors.accent + '40',
                          backgroundColor: isDragActive ? currentTheme.colors.accent + '10' : 'transparent'
                        }}
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
                              <Loader2 className="w-4 h-4 animate-spin" style={{ color: currentTheme.colors.accent }} />
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
                    <p className="text-xs mt-2" style={{ color: currentTheme.colors.textLight }}>Please wait until all uploads complete</p>
                  </div>
                ) : isDragActive ? (
                  <>
                    <Upload className="w-16 h-16 mx-auto mb-4" style={{ color: currentTheme.colors.accent }} />
                    <p className="text-lg font-light" style={{ color: currentTheme.colors.text }}>Drop photos here...</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-16 h-16 mx-auto mb-4" style={{ color: currentTheme.colors.accent + '60' }} />
                    <p className="text-lg font-light mb-2" style={{ color: currentTheme.colors.text }}>
                      Drag & drop your photos here
                    </p>
                    <p className="text-sm mb-6" style={{ color: currentTheme.colors.textLight }}>
                      or click to browse
                    </p>
                    <p className="text-xs" style={{ color: currentTheme.colors.textLight }}>
                      Max 10 photos • JPEG, PNG, GIF, WebP
                    </p>
                  </>
                )}
              </div>
              
              <button
                onClick={() => setGuestUploadExpanded(false)}
                className="mt-4 text-sm mx-auto block"
                style={{ color: currentTheme.colors.textLight }}
              >
                Cancel
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
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
                  <VideoSection
                    key={section.id}
                    videos={sectionVideos}
                    sectionName={section.name}
                    contributorName={section.contributor_name}
                  />
                );
              }
              
              // Check if this is a fotoshare/360 booth section
              if (section.type === 'fotoshare') {
                const sectionFotoshareVideos = getFotoshareVideosBySection(section.id);
                if (sectionFotoshareVideos.length === 0 && !section.fotoshare_expired) return null;
                
                return (
                  <div key={section.id} className="py-16 md:py-24" style={{ backgroundColor: currentTheme.colors.background }}>
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
              
              // Photo section
              const sectionPhotos = getRegularPhotosBySection(section.id);
              if (sectionPhotos.length === 0) return null;
              const isExpanded = isSectionExpanded(section.id);
              const displayPhotos = isExpanded ? sectionPhotos : sectionPhotos.slice(0, PREVIEW_COUNT);
              const hasMore = sectionPhotos.length > PREVIEW_COUNT;
              
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
                        style={{ fontFamily: currentTheme.fonts.heading, color: currentTheme.colors.text }}
                      >
                        {section.name}
                      </h3>
                      {section.contributor_name && (
                        <p className="text-sm mt-3" style={{ color: currentTheme.colors.textLight }}>
                          Captured by <span style={{ color: currentTheme.colors.text }}>{section.contributor_name}</span>
                        </p>
                      )}
                    </motion.div>
                    
                    {/* Photo Grid with Animations */}
                    <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 md:gap-8">
                      {displayPhotos.map((photo, idx) => (
                        <AnimatedPhotoCard
                          key={photo.id}
                          photo={photo}
                          index={idx}
                          onView={setLightboxIndex}
                          onDownload={handleDownload}
                          photoIndex={photos.findIndex(p => p.id === photo.id)}
                        />
                      ))}
                    </div>
                    
                    {/* Show More Button */}
                    {hasMore && (
                      <motion.div 
                        className="text-center mt-12"
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                      >
                        <button 
                          onClick={() => toggleSectionExpand(section.id)}
                          className="group inline-flex items-center gap-3 px-8 py-4 rounded-full transition-all duration-300 border-2"
                          style={{ 
                            borderColor: currentTheme.colors.accent,
                            color: currentTheme.colors.text 
                          }}
                          data-testid={`show-more-${section.id}`}
                        >
                          <span className="font-medium">
                            {isExpanded ? 'Show Less' : `View All ${sectionPhotos.length} Photos`}
                          </span>
                          <motion.span
                            animate={{ rotate: isExpanded ? 180 : 0 }}
                            transition={{ duration: 0.3 }}
                          >
                            <ChevronDown className="w-5 h-5" />
                          </motion.span>
                        </button>
                      </motion.div>
                    )}
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
              const isExpanded = isSectionExpanded(sectionId);
              const displayPhotos = isExpanded ? unsortedPhotos : unsortedPhotos.slice(0, PREVIEW_COUNT);
              const hasMore = unsortedPhotos.length > PREVIEW_COUNT;
              
              return (
                <motion.section 
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
                          style={{ fontFamily: currentTheme.fonts.heading, color: currentTheme.colors.text }}
                        >
                          {gallery?.sections?.length > 0 ? 'More Moments' : 'Gallery'}
                        </h3>
                      </motion.div>
                    ) : null}
                    
                    <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 md:gap-8">
                      {displayPhotos.map((photo, idx) => (
                        <AnimatedPhotoCard
                          key={photo.id}
                          photo={photo}
                          index={idx}
                          onView={setLightboxIndex}
                          onDownload={handleDownload}
                          photoIndex={photos.findIndex(p => p.id === photo.id)}
                        />
                      ))}
                    </div>
                    
                    {hasMore && (
                      <motion.div 
                        className="text-center mt-12"
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                      >
                        <button 
                          onClick={() => toggleSectionExpand(sectionId)}
                          className="group inline-flex items-center gap-3 px-8 py-4 rounded-full transition-all duration-300 border-2"
                          style={{ 
                            borderColor: currentTheme.colors.accent,
                            color: currentTheme.colors.text 
                          }}
                        >
                          <span className="font-medium">
                            {isExpanded ? 'Show Less' : `View All ${unsortedPhotos.length} Photos`}
                          </span>
                          <motion.span
                            animate={{ rotate: isExpanded ? 180 : 0 }}
                            transition={{ duration: 0.3 }}
                          >
                            <ChevronDown className="w-5 h-5" />
                          </motion.span>
                        </button>
                      </motion.div>
                    )}
                  </div>
                </motion.section>
              );
            })()
          )}

          {/* Guest Photos Section */}
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
                    <Loader2 className="w-10 h-10 mx-auto text-zinc-600 animate-spin" />
                    <p className="font-medium text-zinc-700">Uploading {uploadProgress.length} photo(s)...</p>
                    <div className="max-w-sm mx-auto space-y-2">
                      {uploadProgress.slice(0, 3).map((file, index) => (
                        <div key={index} className="flex items-center gap-3 text-left bg-zinc-50 rounded-lg p-2">
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
                            {file.status === 'uploading' && <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />}
                            {file.status === 'success' && <CheckCircle className="w-4 h-4 text-green-500" />}
                            {file.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                          </div>
                        </div>
                      ))}
                      {uploadProgress.length > 3 && (
                        <p className="text-sm text-zinc-500">+ {uploadProgress.length - 3} more files</p>
                      )}
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
              style={{ fontFamily: currentTheme.fonts.heading, color: currentTheme.colors.text }}
            >
              Thank you for being part of this special day
            </p>
            <p className="text-sm" style={{ color: currentTheme.colors.textLight }}>
              Captured with love by {gallery?.photographer_name}
            </p>
            <div 
              className="w-16 h-px mx-auto my-8"
              style={{ backgroundColor: currentTheme.colors.accent + '40' }}
            />
            <p 
              className="text-xs uppercase tracking-[0.2em]"
              style={{ color: currentTheme.colors.textLight }}
            >
              {brandConfig.brand_name || 'PhotoShare'} © {new Date().getFullYear()}
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
