import React, { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Images } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * VirtualizedGalleryGrid - High-performance gallery for large photo collections
 * 
 * Features:
 * - Manual "Load More" expansion (no auto infinite scroll)
 * - 50 photos per expansion for optimal UX
 * - Sharp thumbnails (no blur effect)
 * - Lazy loading with native browser support
 * - Memory efficient - only renders visible photos
 */
const VirtualizedGalleryGrid = ({
  photos,                       // Array of photo objects
  initialCount = 50,            // Number of photos to show initially
  batchSize = 50,               // Number to load on each "Load More" click
  onPhotoClick,                 // Callback when photo is clicked (index, photo)
  getThumbUrl,                  // Function to get thumbnail URL from photo
  getFullUrl,                   // Function to get full resolution URL from photo
  themeColors,                  // Theme colors for styling
  showSupplierName = false,     // Show contributor name overlay
  gridCols = 'columns-2 md:columns-3 lg:columns-4',  // CSS columns class
}) => {
  const [visibleCount, setVisibleCount] = useState(initialCount);
  const totalPhotos = photos.length;

  // Calculate if there are more photos to load
  const hasMore = visibleCount < totalPhotos;
  const remainingPhotos = totalPhotos - visibleCount;
  
  const displayedPhotos = useMemo(() => 
    photos.slice(0, visibleCount), 
    [photos, visibleCount]
  );

  // Load more photos on button click
  const handleLoadMore = useCallback(() => {
    setVisibleCount(prev => Math.min(prev + batchSize, totalPhotos));
  }, [batchSize, totalPhotos]);

  // Load all remaining photos
  const handleLoadAll = useCallback(() => {
    setVisibleCount(totalPhotos);
  }, [totalPhotos]);

  return (
    <div className="relative">
      {/* Masonry Grid */}
      <div className={`${gridCols} gap-4 space-y-4`}>
        {displayedPhotos.map((photo, index) => (
          <motion.div
            key={photo.id || index}
            className="break-inside-avoid mb-4 group cursor-pointer relative overflow-hidden rounded-lg"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ 
              duration: 0.3, 
              delay: Math.min((index % batchSize) * 0.015, 0.3), // Reset delay for each batch
              ease: [0.22, 1, 0.36, 1]
            }}
            onClick={() => onPhotoClick && onPhotoClick(index, photo)}
          >
            {/* Sharp thumbnail - no blur effect */}
            <img
              src={getThumbUrl ? getThumbUrl(photo) : photo.thumbnail_url}
              alt={photo.name || photo.title || 'Photo'}
              className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                // Fallback to full URL if thumbnail fails
                const fullUrl = getFullUrl ? getFullUrl(photo) : photo.url;
                if (e.target.src !== fullUrl) {
                  e.target.src = fullUrl;
                }
              }}
            />
            
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            
            {/* Supplier name overlay */}
            {showSupplierName && photo.supplier_name && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-white text-xs font-medium">by {photo.supplier_name}</p>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Load More Section */}
      {hasMore && (
        <div className="text-center py-8 space-y-4">
          {/* Photo count indicator */}
          <p className="text-sm opacity-60" style={{ color: themeColors?.text || '#666' }}>
            Showing {visibleCount} of {totalPhotos} photos
          </p>
          
          {/* Load More Button */}
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={handleLoadMore}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-full text-sm font-medium transition-all duration-300 hover:scale-105"
              style={{
                backgroundColor: themeColors?.accent || '#3b82f6',
                color: '#ffffff',
              }}
            >
              <Images className="w-4 h-4" />
              Load {Math.min(batchSize, remainingPhotos)} More Photos
              <ChevronDown className="w-4 h-4" />
            </button>
            
            {/* Show "Load All" only if there are many remaining */}
            {remainingPhotos > batchSize && (
              <button
                onClick={handleLoadAll}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium transition-all duration-300 hover:scale-105"
                style={{
                  backgroundColor: 'transparent',
                  color: themeColors?.accent || '#3b82f6',
                  border: `1px solid ${themeColors?.accent || '#3b82f6'}40`
                }}
              >
                Load All ({remainingPhotos})
              </button>
            )}
          </div>
        </div>
      )}

      {/* All photos loaded indicator */}
      {!hasMore && totalPhotos > initialCount && (
        <div className="text-center py-6">
          <p className="text-sm opacity-50" style={{ color: themeColors?.text || '#666' }}>
            All {totalPhotos} photos loaded
          </p>
        </div>
      )}
    </div>
  );
};

export default VirtualizedGalleryGrid;
