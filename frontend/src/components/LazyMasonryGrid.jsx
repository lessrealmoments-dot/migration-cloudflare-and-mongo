import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { ChevronDown, Images } from 'lucide-react';

/**
 * LazyMasonryGrid - High-performance responsive masonry grid with viewport-based lazy loading
 * 
 * Key Features:
 * - TOP-TO-BOTTOM loading (viewport-based, not column-based)
 * - Uses flex-wrap for row-first rendering
 * - IntersectionObserver for true viewport-priority loading
 * - Responsive: 2 cols (mobile) / 3 cols (tablet) / 4 cols (desktop)
 * - Memory efficient - only loads images in/near viewport
 */

// Lazy Image component with true viewport-based loading
const LazyImage = ({ 
  src, 
  alt, 
  fallbackSrc, 
  className, 
  onLoad,
  priority = false,
  aspectRatio = null
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const [currentSrc, setCurrentSrc] = useState(priority ? src : null);
  const [hasError, setHasError] = useState(false);
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
        rootMargin: '300px 0px', // Start loading 300px before entering viewport
        threshold: 0.01
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [src, priority]);

  const handleError = useCallback(() => {
    if (fallbackSrc && currentSrc !== fallbackSrc && !hasError) {
      setCurrentSrc(fallbackSrc);
      setHasError(true);
    }
  }, [fallbackSrc, currentSrc, hasError]);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    onLoad?.();
  }, [onLoad]);

  // Estimate aspect ratio for placeholder sizing (prevents layout shift)
  const placeholderPadding = aspectRatio ? `${(1 / aspectRatio) * 100}%` : '75%';

  return (
    <div ref={imgRef} className="relative w-full overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
      {/* Placeholder with aspect ratio */}
      {!isLoaded && (
        <div 
          className="w-full animate-pulse bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600"
          style={{ paddingBottom: placeholderPadding }}
        />
      )}
      
      {/* Actual image */}
      {(isInView || currentSrc) && (
        <img
          src={currentSrc || src}
          alt={alt}
          className={`${className} ${isLoaded ? 'opacity-100' : 'opacity-0 absolute inset-0'} transition-opacity duration-300 w-full h-auto`}
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
  const containerRef = useRef(null);

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

  // Calculate which photos should have priority (first ~2 rows worth)
  // With 4 columns desktop, 3 tablet, 2 mobile - first 8 is safe for all
  const getPriority = (index) => index < 8;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* 
        Flex-based masonry grid with row-first ordering
        This ensures images load top-to-bottom as they appear visually
      */}
      <div className="flex flex-wrap -mx-1 sm:-mx-1.5 md:-mx-2">
        {displayedPhotos.map((photo, index) => {
          const thumbUrl = getThumbUrl ? getThumbUrl(photo) : photo.thumbnail_url || photo.url;
          const fullUrl = getFullUrl ? getFullUrl(photo) : photo.url;
          const isPriority = getPriority(index);

          return (
            <div
              key={photo.id || index}
              className="px-1 sm:px-1.5 md:px-2 mb-2 sm:mb-3 md:mb-4 w-1/2 sm:w-1/2 md:w-1/3 lg:w-1/4"
              style={{ touchAction: 'manipulation' }}
            >
              <div
                className="group cursor-pointer relative overflow-hidden rounded-lg"
                onClick={() => onPhotoClick && onPhotoClick(index, photo)}
                data-testid={`masonry-photo-${index}`}
              >
                <LazyImage
                  src={thumbUrl}
                  fallbackSrc={fullUrl}
                  alt={photo.name || photo.title || photo.filename || `Photo ${index + 1}`}
                  className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105"
                  priority={isPriority}
                  aspectRatio={photo.aspect_ratio}
                />
                
                {/* Hover overlay */}
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
                
                {/* Highlight badge */}
                {photo.is_highlight && (
                  <div className="absolute top-2 left-2 bg-yellow-500/90 text-white text-xs px-2 py-0.5 rounded-full pointer-events-none flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                    </svg>
                    Featured
                  </div>
                )}
              </div>
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
              className="inline-flex items-center gap-1.5 sm:gap-2 px-4 sm:px-8 py-2.5 sm:py-3 rounded-full text-xs sm:text-sm font-medium transition-transform duration-200 active:scale-95 shadow-md hover:shadow-lg"
              style={{
                backgroundColor: themeColors?.accent || '#3b82f6',
                color: '#ffffff',
              }}
              data-testid="load-more-section"
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
                data-testid="load-all-section"
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
