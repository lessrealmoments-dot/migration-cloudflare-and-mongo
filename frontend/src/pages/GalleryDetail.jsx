import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import { ArrowLeft, Upload, Trash2, Copy, ExternalLink, Lock, X, Plus, Image as ImageIcon } from 'lucide-react';
import { themes } from '@/themes';
import PremiumLightbox from '@/components/PremiumLightbox';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const GalleryDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [gallery, setGallery] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [newSectionName, setNewSectionName] = useState('');
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [selectedSection, setSelectedSection] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({});

  useEffect(() => {
    fetchGalleryData();
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
    setUploading(true);
    const token = localStorage.getItem('token');

    try {
      const uploadPromises = acceptedFiles.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        if (selectedSection) {
          formData.append('section_id', selectedSection);
        }
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
    return photos.filter(p => p.section_id === sectionId);
  };

  const getPhotosWithoutSection = () => {
    return photos.filter(p => !p.section_id && p.uploaded_by === 'photographer');
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
              <button
                data-testid="edit-gallery-button"
                onClick={handleEditGallery}
                className="border border-input hover:bg-zinc-50 h-10 px-6 rounded-sm font-medium transition-all duration-300"
              >
                Edit Details
              </button>
              {gallery.has_password && (
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Lock className="w-4 h-4" strokeWidth={1.5} />
                  Protected
                </div>
              )}
            </div>
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
                    {sectionPhotos.map((photo) => (
                      <PhotoItem
                        key={photo.id}
                        photo={photo}
                        onDelete={handleDelete}
                        onView={setSelectedPhoto}
                      />
                    ))}
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
                {getPhotosWithoutSection().map((photo) => (
                  <PhotoItem
                    key={photo.id}
                    photo={photo}
                    onDelete={handleDelete}
                    onView={setSelectedPhoto}
                  />
                ))}
              </div>
            </div>
          )}

          {photos.filter(p => p.uploaded_by === 'photographer').length === 0 && (
            <div className="text-center py-20 border border-zinc-200 rounded-sm">
              <p className="text-zinc-500">No photos yet. Upload some to get started!</p>
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
    </div>
  );
};

const PhotoItem = ({ photo, onDelete, onView }) => (
  <div
    data-testid={`photo-item-${photo.id}`}
    className="masonry-item group relative"
    onClick={() => onView(photo)}
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