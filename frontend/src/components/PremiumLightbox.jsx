import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react';

// Helper to get the correct image URL - handles both CDN (absolute) and local (relative) URLs
const getImageUrl = (url, backendUrl) => {
  if (!url) return '';
  // If URL already starts with http(s), it's a CDN URL - use as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  // Otherwise, it's a local/relative URL - prepend backend URL
  return `${backendUrl}${url}`;
};

const PremiumLightbox = ({ 
  photos, 
  initialIndex = 0, 
  onClose, 
  onDownload,
  backendUrl 
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const imageRef = useRef(null);
  
  const currentPhoto = photos[currentIndex];
  
  // Minimum swipe distance (in px)
  const minSwipeDistance = 50;

  // Preload adjacent images for smooth transitions
  useEffect(() => {
    const preloadImage = (index) => {
      if (index >= 0 && index < photos.length) {
        const photo = photos[index];
        const img = new Image();
        // Preload full image for viewing - use helper to handle CDN vs local URLs
        img.src = getImageUrl(photo.url, backendUrl);
        // Also preload thumbnail for filmstrip
        if (photo.thumbnail_url && photo.thumbnail_url !== photo.url) {
          const thumbImg = new Image();
          thumbImg.src = getImageUrl(photo.thumbnail_url, backendUrl);
        }
      }
    };
    
    // Preload next and previous images
    preloadImage(currentIndex + 1);
    preloadImage(currentIndex - 1);
  }, [currentIndex, photos, backendUrl]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') handlePrevious();
      if (e.key === 'ArrowRight') handleNext();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, photos.length]);

  // Lock body scroll when lightbox is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const handleNext = useCallback(() => {
    if (currentIndex < photos.length - 1 && !isTransitioning) {
      setIsTransitioning(true);
      setImageLoaded(false);
      setTimeout(() => {
        setCurrentIndex(prev => prev + 1);
        setIsTransitioning(false);
      }, 150);
    }
  }, [currentIndex, photos.length, isTransitioning]);

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0 && !isTransitioning) {
      setIsTransitioning(true);
      setImageLoaded(false);
      setTimeout(() => {
        setCurrentIndex(prev => prev - 1);
        setIsTransitioning(false);
      }, 150);
    }
  }, [currentIndex, isTransitioning]);

  const handleThumbnailClick = (index) => {
    if (index !== currentIndex && !isTransitioning) {
      setIsTransitioning(true);
      setImageLoaded(false);
      setTimeout(() => {
        setCurrentIndex(index);
        setIsTransitioning(false);
      }, 150);
    }
  };

  // Touch handlers for swipe
  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      handleNext();
    } else if (isRightSwipe) {
      handlePrevious();
    }
  };

  // Get visible thumbnails (show 5 at a time, centered on current)
  const getVisibleThumbnails = () => {
    const thumbnailCount = 5;
    const halfCount = Math.floor(thumbnailCount / 2);
    
    let start = Math.max(0, currentIndex - halfCount);
    let end = Math.min(photos.length, start + thumbnailCount);
    
    // Adjust if we're near the end
    if (end - start < thumbnailCount) {
      start = Math.max(0, end - thumbnailCount);
    }
    
    return photos.slice(start, end).map((photo, idx) => ({
      photo,
      actualIndex: start + idx
    }));
  };

  const visibleThumbnails = getVisibleThumbnails();

  return (
    <div 
      className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-sm"
      data-testid="premium-lightbox"
    >
      {/* Close button */}
      <button
        onClick={onClose}
        data-testid="lightbox-close"
        className="fixed top-6 right-6 z-50 text-white/90 hover:text-white transition-all duration-300 bg-black/30 hover:bg-black/50 rounded-full p-3"
        aria-label="Close"
      >
        <X className="w-6 h-6" strokeWidth={2} />
      </button>

      {/* Download button */}
      {onDownload && (
        <button
          onClick={() => onDownload(currentPhoto)}
          data-testid="lightbox-download"
          className="fixed top-6 right-20 z-50 text-white/90 hover:text-white transition-all duration-300 bg-black/30 hover:bg-black/50 rounded-full p-3"
          aria-label="Download"
        >
          <Download className="w-5 h-5" strokeWidth={2} />
        </button>
      )}

      {/* Image counter */}
      <div className="fixed top-6 left-6 z-50 text-white/90 text-sm font-light bg-black/30 rounded-full px-4 py-2">
        {currentIndex + 1} / {photos.length}
      </div>

      {/* Main image area */}
      <div 
        className="h-full w-full flex items-center justify-center pb-32 pt-20 px-4"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Previous button (desktop) */}
        {currentIndex > 0 && (
          <button
            onClick={handlePrevious}
            data-testid="lightbox-previous"
            className="hidden md:flex absolute left-6 z-40 text-white/70 hover:text-white transition-all duration-300 bg-black/30 hover:bg-black/50 rounded-full p-4 hover:scale-110"
            aria-label="Previous"
          >
            <ChevronLeft className="w-8 h-8" strokeWidth={2} />
          </button>
        )}

        {/* Image container with smooth transition */}
        <div className="relative max-w-7xl max-h-full flex items-center justify-center">
          <img
            ref={imageRef}
            src={getImageUrl(currentPhoto.url, backendUrl)}
            alt="Gallery"
            onLoad={() => setImageLoaded(true)}
            className={`max-w-full max-h-[70vh] w-auto h-auto object-contain transition-all duration-300 ${
              imageLoaded && !isTransitioning ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
            }`}
            style={{
              filter: imageLoaded && !isTransitioning ? 'none' : 'blur(4px)'
            }}
          />
          
          {/* Loading indicator */}
          {!imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white/50"></div>
            </div>
          )}
        </div>

        {/* Next button (desktop) */}
        {currentIndex < photos.length - 1 && (
          <button
            onClick={handleNext}
            data-testid="lightbox-next"
            className="hidden md:flex absolute right-6 z-40 text-white/70 hover:text-white transition-all duration-300 bg-black/30 hover:bg-black/50 rounded-full p-4 hover:scale-110"
            aria-label="Next"
          >
            <ChevronRight className="w-8 h-8" strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Thumbnail filmstrip */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-black via-black/90 to-transparent pt-8 pb-6">
        <div className="flex justify-center items-center gap-2 px-4 overflow-x-auto scrollbar-hide">
          {visibleThumbnails.map(({ photo, actualIndex }) => (
            <button
              key={photo.id}
              onClick={() => handleThumbnailClick(actualIndex)}
              data-testid={`lightbox-thumbnail-${actualIndex}`}
              className={`relative flex-shrink-0 transition-all duration-300 rounded-sm overflow-hidden ${
                actualIndex === currentIndex
                  ? 'ring-2 ring-white scale-110 opacity-100'
                  : 'opacity-60 hover:opacity-100 hover:scale-105'
              }`}
              style={{
                width: actualIndex === currentIndex ? '90px' : '70px',
                height: actualIndex === currentIndex ? '90px' : '70px'
              }}
            >
              <img
                src={`${backendUrl}${photo.thumbnail_url || photo.url}`}
                alt={`Thumbnail ${actualIndex + 1}`}
                className="w-full h-full object-cover"
              />
              {actualIndex === currentIndex && (
                <div className="absolute inset-0 bg-white/10"></div>
              )}
            </button>
          ))}
        </div>
        
        {/* Swipe hint for mobile */}
        <div className="md:hidden text-center text-white/50 text-xs mt-3 font-light">
          Swipe left or right to navigate
        </div>
      </div>
    </div>
  );
};

export default PremiumLightbox;
