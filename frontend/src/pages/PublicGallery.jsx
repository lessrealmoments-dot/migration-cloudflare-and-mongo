import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import { Lock, Upload, Download, X, Camera } from 'lucide-react';

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
      const response = await axios.get(`${BACKEND_URL}${photo.url}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', photo.filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Photo downloaded!');
    } catch (error) {
      toast.error('Failed to download photo');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-zinc-500">Loading gallery...</p>
      </div>
    );
  }

  if (passwordRequired && !authenticated) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center border border-zinc-200 rounded-sm">
              <Lock className="w-8 h-8" strokeWidth={1.5} />
            </div>
            <h1
              className="text-4xl md:text-5xl font-normal tracking-tight mb-4"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              {gallery?.title}
            </h1>
            <p className="text-base font-light text-zinc-600 mb-2">
              by {gallery?.photographer_name}
            </p>
            <p className="text-sm text-zinc-500">This gallery is password protected</p>
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

  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-zinc-200 bg-white/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-12 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1
                className="text-2xl font-medium"
                style={{ fontFamily: 'Playfair Display, serif' }}
              >
                {gallery?.title}
              </h1>
              <p className="text-sm text-zinc-500">by {gallery?.photographer_name}</p>
            </div>
            <Camera className="w-6 h-6 text-zinc-400" strokeWidth={1.5} />
          </div>
        </div>
      </nav>

      <div className="max-w-screen-2xl mx-auto px-6 md:px-12 py-12">
        {gallery?.description && (
          <div className="mb-12 text-center max-w-2xl mx-auto">
            <p className="text-base font-light text-zinc-600">{gallery.description}</p>
          </div>
        )}

        <div className="mb-12">
          <h3
            className="text-2xl md:text-3xl font-normal mb-6 text-center"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            Upload Your Photos
          </h3>
          <div
            {...getRootProps()}
            data-testid="guest-upload-dropzone"
            className={`border-2 border-dashed rounded-sm p-12 text-center cursor-pointer transition-all duration-300 max-w-3xl mx-auto ${
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
                <p className="text-sm text-zinc-500">Share your memories with the photographer</p>
              </>
            )}
          </div>
        </div>

        <div>
          <h3
            className="text-2xl md:text-3xl font-normal mb-6 text-center"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            Gallery ({photos.length} {photos.length === 1 ? 'photo' : 'photos'})
          </h3>
          {photos.length === 0 ? (
            <div className="text-center py-20 border border-zinc-200 rounded-sm">
              <p className="text-zinc-500">No photos yet. Be the first to upload!</p>
            </div>
          ) : (
            <div className="masonry-grid">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  data-testid={`public-photo-item-${photo.id}`}
                  className="masonry-item group relative"
                  onClick={() => setSelectedPhoto(photo)}
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
                        handleDownload(photo);
                      }}
                      className="bg-white text-zinc-900 hover:bg-zinc-100 h-10 w-10 rounded-sm flex items-center justify-center transition-all duration-300"
                    >
                      <Download className="w-5 h-5" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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

      <footer className="border-t border-zinc-200 py-8 mt-12">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-12 text-center text-sm text-zinc-500">
          <p>Powered by PhotoShare</p>
        </div>
      </footer>
    </div>
  );
};

export default PublicGallery;