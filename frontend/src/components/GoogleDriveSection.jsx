import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image, X, Star, ExternalLink, ChevronDown, Images } from 'lucide-react';

const INITIAL_COUNT = 50;
const BATCH_SIZE = 50;

// Lazy Image component with Intersection Observer for Google Drive
const LazyGDriveImage = ({ 
  photo,
  onClick, 
  isEditable,
  onHighlightToggle,
  accentColor,
  priority = false 
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const imgRef = useRef(null);

  useEffect(() => {
    if (priority) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '200px 0px',
        threshold: 0.01
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [priority]);

  return (
    <div
      ref={imgRef}
      className={`group relative overflow-hidden rounded-lg cursor-pointer bg-zinc-800 ${
        photo.is_highlight ? 'ring-2 ring-offset-2 ring-offset-black' : ''
      }`}
      style={photo.is_highlight ? { ringColor: accentColor } : {}}
      onClick={() => onClick(photo)}
      data-testid={`gdrive-photo-${photo.id}`}
    >
      {/* Placeholder skeleton */}
      {!isLoaded && (
        <div 
          className="w-full bg-gray-700 animate-pulse"
          style={{ aspectRatio: '1/1', minHeight: '150px' }}
        />
      )}
      
      {/* Actual image */}
      {isInView && (
        <img
          src={photo.thumbnail_url}
          alt={photo.name || 'Photo'}
          className={`w-full h-auto object-cover transition-all duration-500 group-hover:scale-105 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          loading="lazy"
          decoding="async"
          onLoad={() => setIsLoaded(true)}
          onError={(e) => {
            e.target.src = `/api/gdrive/proxy/${photo.file_id}?thumb=true`;
          }}
        />
      )}
      
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
      
      {/* Highlight badge */}
      {photo.is_highlight && (
        <div 
          className="absolute top-2 left-2 px-2 py-1 rounded-full backdrop-blur-sm pointer-events-none"
          style={{ backgroundColor: `${accentColor}cc` }}
        >
          <Star className="w-3 h-3 text-white fill-current" />
        </div>
      )}

      {/* Hover overlay with actions */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-xl">
          <ExternalLink className="w-4 h-4" style={{ color: accentColor }} />
        </div>
      </div>

      {/* Edit mode highlight toggle */}
      {isEditable && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onHighlightToggle?.(photo.id);
          }}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"
          title={photo.is_highlight ? 'Remove from highlights' : 'Add to highlights'}
        >
          <Star 
            className={`w-4 h-4 ${photo.is_highlight ? 'fill-yellow-400 text-yellow-400' : 'text-white'}`} 
          />
        </button>
      )}
    </div>
  );
};

const GoogleDriveSection = ({ 
  section, 
  photos, 
  themeColors,
  onHighlightToggle,
  isEditable = false 
}) => {
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);

  if (!photos || photos.length === 0) {
    return null;
  }

  // Sort: highlights first, then by order
  const sortedPhotos = useMemo(() => [...photos].sort((a, b) => {
    if (a.is_highlight && !b.is_highlight) return -1;
    if (!a.is_highlight && b.is_highlight) return 1;
    return (a.order || 0) - (b.order || 0);
  }), [photos]);

  const displayPhotos = sortedPhotos.slice(0, visibleCount);
  const hasMore = visibleCount < photos.length;
  const remainingPhotos = photos.length - visibleCount;

  const handleLoadMore = useCallback(() => {
    setVisibleCount(prev => Math.min(prev + BATCH_SIZE, photos.length));
  }, [photos.length]);

  const handleLoadAll = useCallback(() => {
    setVisibleCount(photos.length);
  }, [photos.length]);

  // Use theme colors if provided, otherwise use defaults
  const accentColor = themeColors?.accent || '#3b82f6';
  const textColor = themeColors?.text || '#ffffff';

  const highlightCount = photos.filter(p => p.is_highlight).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="mb-16"
      data-testid={`gdrive-section-${section.id}`}
    >
      {/* Section Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}99)` }}
          >
            <Image className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-light tracking-wide" style={{ color: textColor }}>
              {section.name}
            </h2>
            {section.contributor_name && (
              <p className="text-sm opacity-60" style={{ color: textColor }}>
                {section.contributor_role || 'Photos'} by {section.contributor_name}
              </p>
            )}
          </div>
        </div>
        <div 
          className="flex-1 h-px hidden sm:block" 
          style={{ background: `linear-gradient(to right, ${accentColor}50, transparent)` }} 
        />
        <span className="text-sm opacity-40 hidden sm:block" style={{ color: textColor }}>
          {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
          {highlightCount > 0 && ` · ${highlightCount} featured`}
        </span>
      </div>

      {/* Photos Grid - Responsive Masonry */}
      <div className="columns-2 sm:columns-2 md:columns-3 lg:columns-4 gap-2 sm:gap-3 md:gap-4">
        {displayPhotos.map((photo, index) => (
          <div key={photo.id} className="break-inside-avoid mb-2 sm:mb-3 md:mb-4">
            <LazyGDriveImage
              photo={photo}
              onClick={setSelectedPhoto}
              isEditable={isEditable}
              onHighlightToggle={onHighlightToggle}
              accentColor={accentColor}
              priority={index < 8}
            />
          </div>
        ))}
      </div>

      {/* Load More Section */}
      {hasMore && (
        <div className="text-center py-6 sm:py-8 space-y-3 sm:space-y-4">
          <p className="text-xs sm:text-sm opacity-60" style={{ color: textColor }}>
            Showing {visibleCount} of {photos.length} photos
          </p>
          
          <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap px-4">
            <button
              onClick={handleLoadMore}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-4 sm:px-8 py-2.5 sm:py-3 rounded-full text-xs sm:text-sm font-medium transition-transform duration-200 active:scale-95"
              style={{
                backgroundColor: accentColor,
                color: '#ffffff',
              }}
            >
              <Images className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Load {Math.min(BATCH_SIZE, remainingPhotos)} More</span>
              <span className="sm:hidden">Load More</span>
              <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
            
            {remainingPhotos > BATCH_SIZE && (
              <button
                onClick={handleLoadAll}
                className="inline-flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-full text-xs sm:text-sm font-medium transition-transform duration-200 active:scale-95"
                style={{
                  backgroundColor: 'transparent',
                  color: accentColor,
                  border: `1px solid ${accentColor}40`
                }}
              >
                Load All ({remainingPhotos})
              </button>
            )}
          </div>
        </div>
      )}

      {/* All photos loaded indicator */}
      {!hasMore && photos.length > INITIAL_COUNT && (
        <div className="text-center py-4 sm:py-6">
          <p className="text-xs sm:text-sm opacity-50" style={{ color: textColor }}>
            All {photos.length} photos loaded
          </p>
        </div>
      )}

      {/* Photo Viewer Modal */}
      <AnimatePresence>
        {selectedPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-4"
            onClick={() => setSelectedPhoto(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25 }}
              className="relative max-w-5xl max-h-[90vh] flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={() => setSelectedPhoto(null)}
                className="absolute -top-12 right-0 p-2 text-white/60 hover:text-white transition-colors z-10"
                data-testid="close-gdrive-modal"
              >
                <X className="w-8 h-8" />
              </button>

              {/* Photo */}
              <div className="bg-zinc-900 rounded-2xl overflow-hidden">
                <img
                  src={selectedPhoto.view_url}
                  alt={selectedPhoto.name || 'Photo'}
                  className="max-w-full max-h-[80vh] object-contain"
                  onError={(e) => {
                    e.target.src = `/api/gdrive/proxy/${selectedPhoto.file_id}`;
                  }}
                />
                
                {/* Photo info */}
                <div className="p-4 text-center border-t border-zinc-800">
                  <p className="text-white font-medium">{selectedPhoto.name}</p>
                  {section.contributor_name && (
                    <p className="text-white/50 text-sm mt-1">
                      {section.contributor_role || 'Photo'} by {section.contributor_name}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default GoogleDriveSection;
