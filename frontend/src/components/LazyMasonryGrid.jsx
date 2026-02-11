import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { ChevronDown, Images } from 'lucide-react';

/**
 * LazyMasonryGrid - High-performance responsive masonry grid with viewport-based lazy loading
 * 
 * Features:
 * - Responsive columns: 2 (mobile) / 3 (tablet) / 4 (desktop)
 * - Intersection Observer for viewport-priority loading
 * - Top-to-bottom loading order
 * - Native lazy loading with fallback
 * - Memory efficient - only loads images in/near viewport
 * - No Framer Motion for better scroll performance
 */

// Lazy Image component with Intersection Observer
const LazyImage = ({ 
  src, 
  alt, 
  fallbackSrc, 
  className, 
  onLoad,
  priority = false 
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const [currentSrc, setCurrentSrc] = useState(null);
  const imgRef = useRef(null);

  useEffect(() => {
    if (priority) {
      setCurrentSrc(src);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            setCurrentSrc(src);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '200px 0px', // Start loading 200px before entering viewport
        threshold: 0.01
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [src, priority]);

  const handleError = useCallback(() => {
    if (fallbackSrc && currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc);
    }
  }, [fallbackSrc, currentSrc]);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    onLoad?.();
  }, [onLoad]);

  return (
    <div ref={imgRef} className="relative w-full">
      {/* Placeholder skeleton */}
      {!isLoaded && (
        <div 
          className="absolute inset-0 bg-gray-200 dark:bg-gray-700 animate-pulse rounded-lg"
          style={{ minHeight: '150px' }}
        />
      )}
      
      {/* Actual image */}
      {(isInView || currentSrc) && (
        <img
          src={currentSrc || src}
          alt={alt}
          className={`${className} ${isLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
          loading="lazy"
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </div>
  );
};

const LazyMasonryGrid = ({
  photos,
  initialCount = 50,
  batchSize = 50,
  onPhotoClick,
  getThumbUrl,
  getFullUrl,
  themeColors,
  showSupplierName = false,
  className = '',
}) => {
  const [visibleCount, setVisibleCount] = useState(initialCount);
  const totalPhotos = photos.length;

  const hasMore = visibleCount < totalPhotos;
  const remainingPhotos = totalPhotos - visibleCount;

  const displayedPhotos = useMemo(() => 
    photos.slice(0, visibleCount), 
    [photos, visibleCount]
  );

  const handleLoadMore = useCallback(() => {
    setVisibleCount(prev => Math.min(prev + batchSize, totalPhotos));
  }, [batchSize, totalPhotos]);

  const handleLoadAll = useCallback(() => {
    setVisibleCount(totalPhotos);
  }, [totalPhotos]);

  // Get responsive column class
  const getColumnClass = () => {
    return 'columns-2 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-4';
  };

  return (
    <div className={`relative ${className}`}>
      {/* Responsive Masonry Grid */}
      <div className={`${getColumnClass()} gap-2 sm:gap-3 md:gap-4`}>
        {displayedPhotos.map((photo, index) => {
          const thumbUrl = getThumbUrl ? getThumbUrl(photo) : photo.thumbnail_url || photo.url;
          const fullUrl = getFullUrl ? getFullUrl(photo) : photo.url;
          
          // First 8 photos get priority loading (above the fold)
          const isPriority = index < 8;

          return (
            <div
              key={photo.id || index}
              className="break-inside-avoid mb-2 sm:mb-3 md:mb-4 group cursor-pointer relative overflow-hidden rounded-lg"
              style={{ 
                opacity: 1,
                transform: 'translateY(0)',
              }}
              onClick={() => onPhotoClick && onPhotoClick(index, photo)}
              data-testid={`masonry-photo-${index}`}
            >
              <LazyImage
                src={thumbUrl}
                fallbackSrc={fullUrl}
                alt={photo.name || photo.title || photo.filename || `Photo ${index + 1}`}
                className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105"
                priority={isPriority}
              />
              
              {/* Hover overlay - simplified for performance */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
              
              {/* Supplier/Contributor name overlay */}
              {showSupplierName && (photo.supplier_name || photo.contributor_name || photo.uploaded_by_name) && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 sm:p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                  <p className="text-white text-xs font-medium truncate">
                    by {photo.supplier_name || photo.contributor_name || photo.uploaded_by_name}
                  </p>
                </div>
              )}
              
              {/* Guest badge */}
              {photo.uploaded_by === 'guest' && (
                <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full pointer-events-none">
                  Guest
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Load More Section */}
      {hasMore && (
        <div className="text-center py-6 sm:py-8 space-y-3 sm:space-y-4">
          <p className="text-xs sm:text-sm opacity-60" style={{ color: themeColors?.text || '#666' }}>
            Showing {visibleCount} of {totalPhotos} photos
          </p>
          
          <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap px-4">
            <button
              onClick={handleLoadMore}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-4 sm:px-8 py-2.5 sm:py-3 rounded-full text-xs sm:text-sm font-medium transition-transform duration-200 active:scale-95"
              style={{
                backgroundColor: themeColors?.accent || '#3b82f6',
                color: '#ffffff',
              }}
            >
              <Images className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Load {Math.min(batchSize, remainingPhotos)} More</span>
              <span className="sm:hidden">Load More</span>
              <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
            
            {remainingPhotos > batchSize && (
              <button
                onClick={handleLoadAll}
                className="inline-flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-full text-xs sm:text-sm font-medium transition-transform duration-200 active:scale-95"
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
        <div className="text-center py-4 sm:py-6">
          <p className="text-xs sm:text-sm opacity-50" style={{ color: themeColors?.text || '#666' }}>
            All {totalPhotos} photos loaded
          </p>
        </div>
      )}
    </div>
  );
};

export default LazyMasonryGrid;
