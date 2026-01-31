import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowLeft, Flag, CheckSquare, Square, AlertTriangle, X, Eye, EyeOff, RotateCcw, Search, Filter } from 'lucide-react';
import OptimizedImage from '@/components/OptimizedImage';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const AdminGalleryReview = () => {
  const { galleryId } = useParams();
  const navigate = useNavigate();
  const [gallery, setGallery] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState(new Set());
  const [showFlagPreview, setShowFlagPreview] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [flagging, setFlagging] = useState(false);
  const [filterMode, setFilterMode] = useState('all'); // all, flagged, unflagged
  const [lightboxPhoto, setLightboxPhoto] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) {
      navigate('/admin');
      return;
    }
    fetchGalleryData();
  }, [galleryId, navigate]);

  const getAuthHeader = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` }
  });

  const fetchGalleryData = async () => {
    try {
      const [galleryRes, photosRes] = await Promise.all([
        axios.get(`${API}/admin/galleries/${galleryId}`, getAuthHeader()),
        axios.get(`${API}/admin/galleries/${galleryId}/photos`, getAuthHeader())
      ]);
      setGallery(galleryRes.data);
      setPhotos(photosRes.data);
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        localStorage.removeItem('adminToken');
        navigate('/admin');
      } else {
        toast.error('Failed to load gallery');
        navigate('/admin/dashboard');
      }
    } finally {
      setLoading(false);
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

  // Select all visible photos
  const selectAllVisible = () => {
    const visiblePhotos = getFilteredPhotos();
    setSelectedPhotos(new Set(visiblePhotos.map(p => p.id)));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedPhotos(new Set());
    setSelectMode(false);
  };

  // Get filtered photos
  const getFilteredPhotos = () => {
    if (filterMode === 'flagged') {
      return photos.filter(p => p.is_flagged);
    } else if (filterMode === 'unflagged') {
      return photos.filter(p => !p.is_flagged);
    }
    return photos;
  };

  // Open flag preview modal
  const openFlagPreview = () => {
    if (selectedPhotos.size === 0) {
      toast.error('No photos selected');
      return;
    }
    setShowFlagPreview(true);
  };

  // Remove photo from selection in preview
  const removeFromSelection = (photoId) => {
    setSelectedPhotos(prev => {
      const newSet = new Set(prev);
      newSet.delete(photoId);
      return newSet;
    });
    
    // Close preview if no photos left
    if (selectedPhotos.size <= 1) {
      setShowFlagPreview(false);
    }
  };

  // Confirm and flag photos
  const confirmFlag = async () => {
    if (selectedPhotos.size === 0) return;
    
    setFlagging(true);
    try {
      await axios.post(`${API}/admin/photos/bulk-flag`, {
        photo_ids: Array.from(selectedPhotos),
        reason: flagReason || 'Flagged by admin'
      }, getAuthHeader());
      
      toast.success(`Flagged ${selectedPhotos.size} photos`);
      setShowFlagPreview(false);
      clearSelection();
      setFlagReason('');
      fetchGalleryData();
    } catch (error) {
      toast.error('Failed to flag photos');
    } finally {
      setFlagging(false);
    }
  };

  // Unflag/restore photos
  const unflagPhotos = async (photoIds) => {
    try {
      await axios.post(`${API}/admin/photos/bulk-unflag`, {
        photo_ids: photoIds
      }, getAuthHeader());
      
      toast.success(`Restored ${photoIds.length} photo(s)`);
      fetchGalleryData();
      clearSelection();
    } catch (error) {
      toast.error('Failed to restore photos');
    }
  };

  // Unflag selected photos
  const unflagSelected = () => {
    const selectedFlagged = Array.from(selectedPhotos).filter(id => 
      photos.find(p => p.id === id)?.is_flagged
    );
    if (selectedFlagged.length === 0) {
      toast.error('No flagged photos selected');
      return;
    }
    unflagPhotos(selectedFlagged);
  };

  // Handle single photo flagging (for individual flag icon click)
  const handleSingleFlag = (photoId) => {
    setSelectedPhotos(new Set([photoId]));
    setShowFlagPreview(true);
  };

  const filteredPhotos = getFilteredPhotos();
  const flaggedCount = photos.filter(p => p.is_flagged).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <p className="text-zinc-400">Loading gallery...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      {/* Header */}
      <header className="bg-zinc-800 border-b border-zinc-700 sticky top-0 z-40">
        <div className="max-w-screen-2xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/admin/dashboard')}
                className="p-2 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-medium">{gallery?.title}</h1>
                <p className="text-sm text-zinc-400">
                  by {gallery?.photographer_name} • {gallery?.photo_count} photos
                  {flaggedCount > 0 && (
                    <span className="text-red-400 ml-2">• {flaggedCount} flagged</span>
                  )}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Filter dropdown */}
              <select
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value)}
                className="bg-zinc-700 text-white px-3 py-2 rounded-lg text-sm"
              >
                <option value="all">All Photos ({photos.length})</option>
                <option value="flagged">Flagged ({flaggedCount})</option>
                <option value="unflagged">Unflagged ({photos.length - flaggedCount})</option>
              </select>

              {/* Select mode toggle */}
              <button
                onClick={() => { setSelectMode(!selectMode); if (selectMode) clearSelection(); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  selectMode ? 'bg-primary text-white' : 'bg-zinc-700 hover:bg-zinc-600'
                }`}
              >
                <CheckSquare className="w-4 h-4" />
                {selectMode ? 'Cancel' : 'Select'}
              </button>
            </div>
          </div>

          {/* Selection action bar */}
          {selectMode && selectedPhotos.size > 0 && (
            <div className="mt-4 bg-zinc-700 rounded-lg p-4 flex items-center justify-between">
              <span className="font-medium">{selectedPhotos.size} photo(s) selected</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={selectAllVisible}
                  className="px-3 py-2 bg-zinc-600 hover:bg-zinc-500 rounded-lg text-sm"
                >
                  Select All Visible
                </button>
                <button
                  onClick={openFlagPreview}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium flex items-center gap-2"
                >
                  <Flag className="w-4 h-4" />
                  Flag Selected
                </button>
                <button
                  onClick={unflagSelected}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Restore Selected
                </button>
                <button
                  onClick={clearSelection}
                  className="px-3 py-2 bg-zinc-600 hover:bg-zinc-500 rounded-lg text-sm"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Admin Notice Banner */}
      <div className="bg-yellow-900/30 border-b border-yellow-700/50">
        <div className="max-w-screen-2xl mx-auto px-6 py-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
          <p className="text-sm text-yellow-200">
            <strong>Admin Review Mode:</strong> You can view and flag photos. Flagged photos are automatically hidden from the public gallery.
          </p>
        </div>
      </div>

      {/* Photo Grid */}
      <main className="max-w-screen-2xl mx-auto px-6 py-8">
        {filteredPhotos.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-zinc-500">
              {filterMode === 'flagged' ? 'No flagged photos' : 'No photos in this gallery'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filteredPhotos.map((photo) => (
              <AdminPhotoItem
                key={photo.id}
                photo={photo}
                selectMode={selectMode}
                selected={selectedPhotos.has(photo.id)}
                onToggleSelect={togglePhotoSelection}
                onView={() => setLightboxPhoto(photo)}
                onUnflag={() => unflagPhotos([photo.id])}
                onSingleFlag={handleSingleFlag}
              />
            ))}
          </div>
        )}
      </main>

      {/* Flag Preview Modal */}
      {showFlagPreview && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-zinc-700">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-medium flex items-center gap-2">
                    <Flag className="w-5 h-5 text-red-500" />
                    Confirm Flag Photos
                  </h3>
                  <p className="text-sm text-zinc-400 mt-1">
                    {selectedPhotos.size} photo(s) will be flagged and hidden from the public gallery
                  </p>
                </div>
                <button
                  onClick={() => setShowFlagPreview(false)}
                  className="p-2 hover:bg-zinc-700 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Warning Banner */}
            <div className="bg-red-900/30 border-b border-red-700/50 px-6 py-3">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-200">
                  <strong>Warning:</strong> Flagged photos will be immediately hidden from the public gallery. This action can be undone by restoring the photos.
                </p>
              </div>
            </div>

            {/* Flag Reason */}
            <div className="p-6 border-b border-zinc-700">
              <label className="block text-sm font-medium mb-2">Flag Reason (optional)</label>
              <input
                type="text"
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                placeholder="e.g., Inappropriate content, Copyright violation..."
                className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-4 py-2 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Photo Preview Grid */}
            <div className="p-6 overflow-y-auto max-h-[400px]">
              <p className="text-sm text-zinc-400 mb-4">Click on a photo to remove it from selection:</p>
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {Array.from(selectedPhotos).map((photoId) => {
                  const photo = photos.find(p => p.id === photoId);
                  if (!photo) return null;
                  return (
                    <div
                      key={photo.id}
                      className="relative aspect-square group cursor-pointer"
                      onClick={() => removeFromSelection(photo.id)}
                    >
                      <img
                        src={`${BACKEND_URL}${photo.url}`}
                        alt="Photo to flag"
                        className="w-full h-full object-cover rounded-lg"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                        <X className="w-8 h-8 text-white" />
                      </div>
                      <div className="absolute top-1 right-1 w-5 h-5 bg-red-600 rounded flex items-center justify-center">
                        <Flag className="w-3 h-3" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="p-6 border-t border-zinc-700 flex justify-end gap-3">
              <button
                onClick={() => setShowFlagPreview(false)}
                className="px-6 py-3 bg-zinc-700 hover:bg-zinc-600 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmFlag}
                disabled={flagging || selectedPhotos.size === 0}
                className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50"
              >
                {flagging ? (
                  <>Processing...</>
                ) : (
                  <>
                    <Flag className="w-4 h-4" />
                    Flag {selectedPhotos.size} Photo(s)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Simple Lightbox */}
      {lightboxPhoto && (
        <div 
          className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxPhoto(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700"
            onClick={() => setLightboxPhoto(null)}
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={`${BACKEND_URL}${lightboxPhoto.url}`}
            alt="Photo preview"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          {lightboxPhoto.is_flagged && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-600 px-4 py-2 rounded-lg flex items-center gap-2">
              <Flag className="w-4 h-4" />
              Flagged: {lightboxPhoto.flagged_reason}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Admin Photo Item Component
const AdminPhotoItem = ({ photo, selectMode, selected, onToggleSelect, onView, onUnflag, onSingleFlag }) => (
  <div
    className={`relative aspect-square group cursor-pointer rounded-lg overflow-hidden ${
      photo.is_flagged ? 'ring-2 ring-red-500' : ''
    } ${selected ? 'ring-4 ring-primary' : ''}`}
    onClick={() => selectMode ? onToggleSelect(photo.id) : onView()}
  >
    <OptimizedImage
      src={`${BACKEND_URL}${photo.url}`}
      alt="Gallery photo"
      className="w-full h-full object-cover"
    />
    
    {/* Flagged overlay */}
    {photo.is_flagged && (
      <div className="absolute inset-0 bg-red-900/40 pointer-events-none">
        <div className="absolute top-2 left-2 bg-red-600 px-2 py-1 rounded text-xs font-medium flex items-center gap-1">
          <Flag className="w-3 h-3" />
          Flagged
        </div>
      </div>
    )}
    
    {/* Selection checkbox */}
    {selectMode && (
      <div className="absolute top-2 right-2 z-10">
        <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
          selected ? 'bg-primary border-primary text-white' : 'bg-white/80 border-zinc-300'
        }`}>
          {selected && <span className="text-sm">✓</span>}
        </div>
      </div>
    )}
    
    {/* Hover actions (when not in select mode) */}
    {!selectMode && (
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onView(); }}
          className="p-3 bg-white/20 hover:bg-white/30 rounded-lg"
          title="View"
        >
          <Eye className="w-5 h-5" />
        </button>
        {photo.is_flagged ? (
          <button
            onClick={(e) => { e.stopPropagation(); onUnflag(); }}
            className="p-3 bg-green-600 hover:bg-green-500 rounded-lg"
            title="Restore"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onSingleFlag(photo.id); }}
            className="p-3 bg-red-600 hover:bg-red-500 rounded-lg"
            title="Flag Photo"
          >
            <Flag className="w-5 h-5" />
          </button>
        )}
      </div>
    )}
    
    {/* Photo type indicator */}
    {photo.uploaded_by === 'guest' && (
      <div className="absolute bottom-2 left-2 bg-zinc-800/80 px-2 py-1 rounded text-xs">
        Guest
      </div>
    )}
  </div>
);

export default AdminGalleryReview;
