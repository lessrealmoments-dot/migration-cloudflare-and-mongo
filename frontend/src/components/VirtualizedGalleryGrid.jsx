import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Loader2, ChevronDown } from 'lucide-react';
import ProgressiveImage from './ProgressiveImage';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * VirtualizedGalleryGrid - High-performance gallery for 100s-1000s of photos
 * 
 * Features:
 * - Initial batch loading (shows first N photos immediately)
 * - Infinite scroll with batched loading
 * - Uses thumbnails for grid, full-res only in lightbox
 * - Memory efficient - doesn't load all photos at once
 * - Smooth animations with framer-motion
 */
const VirtualizedGalleryGrid = ({
  photos,                       // Array of photo objects
  initialCount = 24,            // Number of photos to show initially
  batchSize = 24,               // Number to load on each scroll
  onPhotoClick,                 // Callback when photo is clicked (index, photo)
  getThumbUrl,                  // Function to get thumbnail URL from photo
  getFullUrl,                   // Function to get full resolution URL from photo
  themeColors,                  // Theme colors for styling
  showSupplierName = false,     // Show contributor name overlay
  gridCols = 'columns-2 md:columns-3 lg:columns-4',  // CSS columns class
}) => {
  const [visibleCount, setVisibleCount] = useState(initialCount);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreRef = useRef(null);
  const totalPhotos = photos.length;

  // Calculate if there are more photos to load
  const hasMore = visibleCount < totalPhotos;
  const displayedPhotos = useMemo(() => 
    photos.slice(0, visibleCount), 
    [photos, visibleCount]
  );

  // Infinite scroll observer
  useEffect(() => {
    if (!hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore) {
          loadMorePhotos();
        }
      },
      {
        rootMargin: '400px', // Start loading well before user reaches bottom
        threshold: 0.1
      }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, visibleCount]);

  // Load more photos
  const loadMorePhotos = useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    
    setIsLoadingMore(true);
    
    // Small delay for smooth UX
    setTimeout(() => {
      setVisibleCount(prev => Math.min(prev + batchSize, totalPhotos));
      setIsLoadingMore(false);
    }, 100);
  }, [isLoadingMore, hasMore, batchSize, totalPhotos]);

  // Manual load more button click
  const handleLoadMoreClick = useCallback(() => {
    loadMorePhotos();
  }, [loadMorePhotos]);

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
              duration: 0.4, 
              delay: Math.min(index * 0.02, 0.5), // Cap delay for large batches
              ease: [0.22, 1, 0.36, 1]
            }}
            onClick={() => onPhotoClick && onPhotoClick(index, photo)}
          >
            <ProgressiveImage
              src={getFullUrl ? getFullUrl(photo) : photo.url}
              thumbnailSrc={getThumbUrl ? getThumbUrl(photo) : photo.thumbnail_url}
              alt={photo.name || photo.title || 'Photo'}
              className="w-full h-auto"
              objectFit="cover"
            />
            
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              {/* Download indicator could go here */}
            </div>
            
            {/* Supplier name overlay */}
            {showSupplierName && photo.supplier_name && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-white text-xs">by {photo.supplier_name}</p>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Load more trigger (invisible) */}
      {hasMore && (
        <div 
          ref={loadMoreRef} 
          className="h-20 flex items-center justify-center"
        >
          {isLoadingMore && (
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: themeColors?.accent || '#888' }} />
          )}
        </div>
      )}

      {/* Manual load more button (fallback for failed auto-load) */}
      {hasMore && !isLoadingMore && visibleCount > initialCount && (
        <div className="text-center py-4">
          <button
            onClick={handleLoadMoreClick}
            className="inline-flex items-center gap-2 px-6 py-2 rounded-full text-sm font-medium transition-all hover:scale-105"
            style={{
              backgroundColor: themeColors?.accent ? `${themeColors.accent}15` : '#f0f0f0',
              color: themeColors?.accent || '#666',
              border: `1px solid ${themeColors?.accent || '#ddd'}30`
            }}
          >
            Load More ({totalPhotos - visibleCount} remaining)
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Photo count indicator */}
      <div className="text-center py-4 text-sm opacity-60">
        Showing {Math.min(visibleCount, totalPhotos)} of {totalPhotos} photos
      </div>
    </div>
  );
};

export default VirtualizedGalleryGrid;
