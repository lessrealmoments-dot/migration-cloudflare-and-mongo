import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import { ArrowLeft, Upload, Trash2, Copy, ExternalLink, Lock, X } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const GalleryDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [gallery, setGallery] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  useEffect(() => {
    fetchGalleryData();
  }, [id]);

  const fetchGalleryData = async () => {
    try {
      const token = localStorage.getItem('token');
      const [galleryRes, photosRes] = await Promise.all([
        axios.get(`${API}/galleries/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/galleries/${id}/photos`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      setGallery(galleryRes.data);
      setPhotos(photosRes.data);
    } catch (error) {
      toast.error('Failed to load gallery');
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const onDrop = useCallback(async (acceptedFiles) => {
    setUploading(true);
    const token = localStorage.getItem('token');

    try {
      const uploadPromises = acceptedFiles.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        return axios.post(`${API}/galleries/${id}/photos`, formData, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        });
      });

      await Promise.all(uploadPromises);
      toast.success(`${acceptedFiles.length} photo(s) uploaded successfully!`);
      fetchGalleryData();
    } catch (error) {
      toast.error('Failed to upload photos');
    } finally {
      setUploading(false);
    }
  }, [id]);

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

  const copyShareLink = () => {
    const shareUrl = `${window.location.origin}/g/${gallery.share_link}`;
    navigator.clipboard.writeText(shareUrl);
    toast.success('Share link copied to clipboard!');
  };

  const openShareLink = () => {
    window.open(`/g/${gallery.share_link}`, '_blank');
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
            <div>
              <h2
                className="text-4xl md:text-5xl font-normal tracking-tight mb-4"
                style={{ fontFamily: 'Playfair Display, serif' }}
              >
                {gallery.title}
              </h2>
              {gallery.description && (
                <p className="text-base font-light text-zinc-600">{gallery.description}</p>
              )}
            </div>
            {gallery.has_password && (
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Lock className="w-4 h-4" strokeWidth={1.5} />
                Protected
              </div>
            )}
          </div>

          <div className="flex gap-3">
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
          </div>
        </div>

        <div className="mb-12">
          <h3 className="text-2xl font-normal mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
            Upload Photos
          </h3>
          <div
            {...getRootProps()}
            data-testid="photo-dropzone"
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
                  Drag & drop photos here, or click to select
                </p>
                <p className="text-sm text-zinc-500">Support for multiple images</p>
              </>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-2xl font-normal mb-6" style={{ fontFamily: 'Playfair Display, serif' }}>
            Gallery Photos ({photos.length})
          </h3>
          {photos.length === 0 ? (
            <div className="text-center py-20 border border-zinc-200 rounded-sm">
              <p className="text-zinc-500">No photos yet. Upload some to get started!</p>
            </div>
          ) : (
            <div className="masonry-grid">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  data-testid={`photo-item-${photo.id}`}
                  className="masonry-item group relative"
                  onClick={() => setSelectedPhoto(photo)}
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
                        handleDelete(photo.id);
                      }}
                      className="bg-white text-red-600 hover:bg-red-50 h-10 w-10 rounded-sm flex items-center justify-center transition-all duration-300"
                    >
                      <Trash2 className="w-5 h-5" strokeWidth={1.5} />
                    </button>
                  </div>
                  <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-sm text-xs">
                    {photo.uploaded_by === 'photographer' ? 'You' : 'Guest'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedPhoto && (
        <div
          data-testid="photo-lightbox"
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <button
            data-testid="close-lightbox-button"
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
        </div>
      )}
    </div>
  );
};

export default GalleryDetail;