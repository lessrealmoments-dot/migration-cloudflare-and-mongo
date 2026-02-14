import React, { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { ChevronDown, Images } from 'lucide-react';

/**
 * LazyMasonryGrid - True Pinterest-style waterfall layout with viewport-based lazy loading
 * 
 * Key Features:
 * - TRUE MASONRY: Images tightly packed with no vertical gaps (waterfall/Pinterest style)
 * - TOP-TO-BOTTOM LOADING: Images load based on visual Y position, not column order
 * - IntersectionObserver triggers loading when images approach viewport
 * - Responsive: 2 cols (mobile) / 3 cols (tablet) / 4 cols (desktop)
 */

// Lazy Image component with viewport-based loading
const LazyImage = ({ 
  src, 
  alt, 
  fallbackSrc, 
  onLoad,
  priority = false,
  style,
  className
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
        rootMargin: '400px 0px', // Start loading 400px before viewport
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

  const handleLoad = useCallback((e) => {
    setIsLoaded(true);
    if (onLoad) {
      onLoad(e.target.naturalWidth, e.target.naturalHeight);
    }
  }, [onLoad]);

  return (
    <div ref={imgRef} style={style} className={className}>
      {/* Skeleton placeholder */}
      {!isLoaded && (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 animate-pulse rounded-lg" />
      )}
      
      {/* Actual image */}
      {(isInView || currentSrc) && (
        <img
          src={currentSrc || src}
          alt={alt}
          className={`w-full h-full object-cover rounded-lg transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
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
  const [containerWidth, setContainerWidth] = useState(0);
  const [columns, setColumns] = useState(4);
  const [itemPositions, setItemPositions] = useState([]);
  const [containerHeight, setContainerHeight] = useState(0);
  const [loadedImages, setLoadedImages] = useState(new Map()); // Track loaded image dimensions
  
  const containerRef = useRef(null);
  const totalPhotos = photos.length;

  const hasMore = visibleCount < totalPhotos;
  const remainingPhotos = totalPhotos - visibleCount;

  const displayedPhotos = useMemo(() => 
    photos.slice(0, visibleCount), 
    [photos, visibleCount]
  );

  // Determine column count based on container width
  useEffect(() => {
    const updateColumns = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.offsetWidth;
      setContainerWidth(width);
      
      if (width < 640) {
        setColumns(2); // Mobile
      } else if (width < 1024) {
        setColumns(3); // Tablet
      } else {
        setColumns(4); // Desktop
      }
    };

    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);

  // Calculate masonry positions
  useLayoutEffect(() => {
    if (!containerWidth || displayedPhotos.length === 0) return;

    const gap = 12; // Gap between items in pixels
    const columnWidth = (containerWidth - (gap * (columns - 1))) / columns;
    const columnHeights = new Array(columns).fill(0);
    const positions = [];

    displayedPhotos.forEach((photo, index) => {
      // Find shortest column
      const shortestColumn = columnHeights.indexOf(Math.min(...columnHeights));
      
      // Calculate estimated height based on aspect ratio or loaded dimensions
      let aspectRatio = photo.aspect_ratio || 1.33; // Default to 4:3
      
      // If we have loaded dimensions, use them
      const loadedDims = loadedImages.get(photo.id);
      if (loadedDims) {
        aspectRatio = loadedDims.width / loadedDims.height;
      }
      
      const itemHeight = columnWidth / aspectRatio;
      
      positions.push({
        left: shortestColumn * (columnWidth + gap),
        top: columnHeights[shortestColumn],
        width: columnWidth,
        height: itemHeight,
        column: shortestColumn
      });

      columnHeights[shortestColumn] += itemHeight + gap;
    });

    setItemPositions(positions);
    setContainerHeight(Math.max(...columnHeights));
  }, [containerWidth, columns, displayedPhotos, loadedImages]);

  // Handle image load to get real dimensions
  const handleImageLoad = useCallback((photoId, width, height) => {
    setLoadedImages(prev => {
      const newMap = new Map(prev);
      newMap.set(photoId, { width, height });
      return newMap;
    });
  }, []);

  const handleLoadMore = useCallback(() => {
    setVisibleCount(prev => Math.min(prev + batchSize, totalPhotos));
  }, [batchSize, totalPhotos]);

  const handleLoadAll = useCallback(() => {
    setVisibleCount(totalPhotos);
  }, [totalPhotos]);

  // Determine priority based on Y position (top rows load first)
  const getPriority = (position) => {
    if (!position) return false;
    // Priority for items in the first ~600px (approximately first 2-3 rows)
    return position.top < 600;
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Masonry Grid Container */}
      <div 
        className="relative w-full"
        style={{ height: containerHeight || 'auto', minHeight: 200 }}
      >
        {displayedPhotos.map((photo, index) => {
          const thumbUrl = getThumbUrl ? getThumbUrl(photo) : photo.thumbnail_url || photo.url;
          const fullUrl = getFullUrl ? getFullUrl(photo) : photo.url;
          const position = itemPositions[index];
          const isPriority = getPriority(position);

          if (!position) return null;

          return (
            <div
              key={photo.id || index}
              className="absolute group cursor-pointer"
              style={{
                left: position.left,
                top: position.top,
                width: position.width,
                height: position.height,
                transition: 'top 0.3s ease, left 0.3s ease, height 0.3s ease'
              }}
              onClick={() => onPhotoClick && onPhotoClick(index, photo)}
              data-testid={`masonry-photo-${index}`}
            >
              <LazyImage
                src={thumbUrl}
                fallbackSrc={fullUrl}
                alt={photo.name || photo.title || photo.filename || `Photo ${index + 1}`}
                priority={isPriority}
                onLoad={(w, h) => handleImageLoad(photo.id, w, h)}
                style={{ position: 'absolute', inset: 0 }}
                className="overflow-hidden rounded-lg"
              />
              
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg pointer-events-none" />
              
              {/* Zoom effect on hover */}
              <div className="absolute inset-0 overflow-hidden rounded-lg">
                <div className="w-full h-full transition-transform duration-500 group-hover:scale-105" />
              </div>
              
              {/* Supplier/Contributor name overlay */}
              {showSupplierName && (photo.supplier_name || photo.contributor_name || photo.uploaded_by_name) && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 sm:p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-b-lg pointer-events-none">
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
