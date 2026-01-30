import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import { Lock, Upload, Download, X, Camera, ChevronDown, ChevronUp } from 'lucide-react';
import { getThemeStyles, themes } from '@/themes';
import PremiumLightbox from '@/components/PremiumLightbox';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const PublicGallery = () => {
  const { shareLink } = useParams();
  const [gallery, setGallery] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [guestUploadExpanded, setGuestUploadExpanded] = useState(false);
  const [showDownloadAllModal, setShowDownloadAllModal] = useState(false);
  const [downloadAllPassword, setDownloadAllPassword] = useState('');

  useEffect(() => {
    fetchGalleryInfo();
  }, [shareLink]);

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
      const response = await axios.get(
        `${API}/public/gallery/${shareLink}/photos`,
        { params: { password: pwd || password } }
      );
      setPhotos(response.data);
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

    setUploading(true);

    try {
      const uploadPromises = acceptedFiles.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        if (password) {
          formData.append('password', password);
        }
        return axios.post(
          `${API}/public/gallery/${shareLink}/upload`,
          formData,
          {
            headers: { 'Content-Type': 'multipart/form-data' }
          }
        );
      });

      await Promise.all(uploadPromises);
      toast.success(`${acceptedFiles.length} photo(s) uploaded successfully!`);
      fetchPhotos();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to upload photos');
    } finally {
      setUploading(false);
    }
  }, [shareLink, password, authenticated, gallery]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: true,
    disabled: !authenticated
  });

  const handleDownload = async (photo) => {
    try {
      // Use backend URL with download parameter
      const downloadUrl = `${BACKEND_URL}${photo.url}?download=true`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = photo.filename || 'photo.jpg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Photo download started!');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download photo');
    }
  };

  const handleDownloadAll = async (e) => {
    e.preventDefault();
    
    try {
      const response = await axios.post(
        `${API}/public/gallery/${shareLink}/download-all`,
        { password: downloadAllPassword },
        { 
          responseType: 'blob',
          headers: {
            'Content-Type': 'application/json'
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
      
      toast.success('All photos downloaded!');
      setShowDownloadAllModal(false);
      setDownloadAllPassword('');
    } catch (error) {
      console.error('Download all error:', error);
      if (error.response?.status === 401) {
        toast.error('Invalid download password');
      } else if (error.response?.status === 403) {
        toast.error('Download all is not enabled for this gallery');
      } else {
        toast.error('Download failed. Please try again.');
      }
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
                style={{ fontFamily: currentTheme.fonts.heading, color: currentTheme.colors.text }}
                style={{ fontFamily: 'Playfair Display, serif' }}
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
        <div className="w-full h-64 md:h-96 overflow-hidden" style={{ borderBottom: `1px solid ${currentTheme.colors.accent}` }}>
          <img
            src={`${BACKEND_URL}${gallery.cover_photo_url}`}
            alt="Cover"
            className="w-full h-full object-cover"
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
                    ? 'Share your memories with the photographer'
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
                    : 'border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50/50'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="w-12 h-12 mx-auto mb-4 text-zinc-400" strokeWidth={1.5} />
                {uploading ? (
                  <p className="text-base font-light text-zinc-600">Uploading photos...</p>
                ) : isDragActive ? (
                  <p className="text-base font-light text-zinc-600">Drop photos here...</p>
                ) : (
                  <>
                    <p className="text-base font-light text-zinc-600 mb-2">
                      Drag & drop your photos here, or click to select
                    </p>
                    <p className="text-sm text-zinc-500">Support for multiple images</p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div>
          <h3
            className="text-3xl md:text-4xl font-normal mb-8 text-center"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            Gallery
          </h3>

          {gallery?.sections && gallery.sections.length > 0 ? (
            gallery.sections.map((section) => {
              const sectionPhotos = getPhotosBySection(section.id);
              if (sectionPhotos.length === 0) return null;
              
              return (
                <div key={section.id} className="mb-16">
                  <h4
                    className="text-2xl md:text-3xl font-normal mb-6 text-center"
                    style={{ fontFamily: 'Playfair Display, serif' }}
                  >
                    {section.name}
                  </h4>
                  <div className="masonry-grid">
                    {sectionPhotos.map((photo) => (
                      <PublicPhotoItem
                        key={photo.id}
                        photo={photo}
                        onView={setSelectedPhoto}
                        onDownload={handleDownload}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          ) : null}

          {getPhotosWithoutSection().length > 0 && (
            <div className="mb-16">
              {gallery?.sections && gallery.sections.length > 0 && (
                <h4
                  className="text-2xl md:text-3xl font-normal mb-6 text-center"
                  style={{ fontFamily: 'Playfair Display, serif' }}
                >
                  More Photos
                </h4>
              )}
              <div className="masonry-grid">
                {getPhotosWithoutSection().map((photo) => (
                  <PublicPhotoItem
                    key={photo.id}
                    photo={photo}
                    onView={setSelectedPhoto}
                    onDownload={handleDownload}
                  />
                ))}
              </div>
            </div>
          )}

          {getGuestPhotos().length > 0 && (
            <div className="mb-16 mt-20 pt-12 border-t-2 border-zinc-200">
              <h4
                className="text-2xl md:text-3xl font-normal mb-6 text-center"
                style={{ fontFamily: 'Playfair Display, serif' }}
              >
                Guest Uploads ({getGuestPhotos().length})
              </h4>
              <p className="text-center text-sm text-zinc-500 mb-8">
                Photos shared by guests
              </p>
              <div className="masonry-grid">
                {getGuestPhotos().map((photo) => (
                  <PublicPhotoItem
                    key={photo.id}
                    photo={photo}
                    onView={setSelectedPhoto}
                    onDownload={handleDownload}
                    isGuest
                  />
                ))}
              </div>
            </div>
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

      {selectedPhoto && (
        <div
          data-testid="public-photo-lightbox"
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <button
            data-testid="close-public-lightbox-button"
            className="absolute top-6 right-6 text-white hover:text-zinc-300 transition-colors"
            onClick={() => setSelectedPhoto(null)}
          >
            <X className="w-8 h-8" strokeWidth={1.5} />
          </button>
          <img
            src={`${BACKEND_URL}${selectedPhoto.url}`}
            alt="Full size"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            data-testid="download-lightbox-photo-button"
            onClick={(e) => {
              e.stopPropagation();
              handleDownload(selectedPhoto);
            }}
            className="absolute bottom-6 right-6 bg-white text-zinc-900 hover:bg-zinc-100 h-12 px-6 rounded-sm flex items-center gap-2 transition-all duration-300"
          >
            <Download className="w-5 h-5" strokeWidth={1.5} />
            Download
          </button>
        </div>
      )}

      {showDownloadAllModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm max-w-md w-full p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-normal" style={{ fontFamily: 'Playfair Display, serif' }}>
                Download All Photos
              </h3>
              <button onClick={() => setShowDownloadAllModal(false)}>
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
                />
                <p className="text-xs text-zinc-500 mt-2">
                  This password was provided by the photographer
                </p>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowDownloadAllModal(false)}
                  className="border border-input h-10 px-6 rounded-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="download-all-submit-button"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-6 rounded-sm font-medium flex items-center gap-2"
                >
                  <Download className="w-4 h-4" strokeWidth={1.5} />
                  Download
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="border-t border-zinc-200 py-8 mt-12">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-12 text-center text-sm text-zinc-500">
          <p>© 2024 PhotoShare. Built for photographers.</p>
        </div>
      </footer>
    </div>
  );
};

const PublicPhotoItem = ({ photo, onView, onDownload, isGuest }) => (
  <div
    data-testid={`public-photo-item-${photo.id}`}
    className="masonry-item group relative"
    onClick={() => onView(photo)}
  >
    <img
      src={`${BACKEND_URL}${photo.url}`}
      alt="Gallery photo"
      className="w-full h-auto cursor-pointer rounded-sm"
    />
    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center rounded-sm">
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
      <div className="absolute bottom-2 right-2 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-sm text-xs font-medium">
        Guest
      </div>
    )}
  </div>
);

export default PublicGallery;
