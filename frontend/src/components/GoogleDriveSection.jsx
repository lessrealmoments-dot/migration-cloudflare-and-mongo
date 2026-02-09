import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image, X, ChevronDown, Star, ExternalLink } from 'lucide-react';

const PREVIEW_COUNT = 8; // Show 8 photos initially

const GoogleDriveSection = ({ 
  section, 
  photos, 
  themeColors,
  onHighlightToggle,
  isEditable = false 
}) => {
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);

  if (!photos || photos.length === 0) {
    return null;
  }

  // Sort: highlights first, then by order
  const sortedPhotos = [...photos].sort((a, b) => {
    if (a.is_highlight && !b.is_highlight) return -1;
    if (!a.is_highlight && b.is_highlight) return 1;
    return (a.order || 0) - (b.order || 0);
  });

  const displayPhotos = isExpanded ? sortedPhotos : sortedPhotos.slice(0, PREVIEW_COUNT);
  const hasMore = photos.length > PREVIEW_COUNT;
  const hiddenCount = photos.length - PREVIEW_COUNT;

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
          className="flex-1 h-px" 
          style={{ background: `linear-gradient(to right, ${accentColor}50, transparent)` }} 
        />
        <span className="text-sm opacity-40" style={{ color: textColor }}>
          {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
          {highlightCount > 0 && ` · ${highlightCount} featured`}
        </span>
      </div>

      {/* Photos Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-3 md:gap-4">
        {displayPhotos.map((photo, index) => (
          <motion.div
            key={photo.id}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: index * 0.03 }}
            className={`group relative aspect-square rounded-lg overflow-hidden cursor-pointer bg-zinc-900 ${
              photo.is_highlight ? 'ring-2 ring-offset-2 ring-offset-black' : ''
            }`}
            style={photo.is_highlight ? { ringColor: accentColor } : {}}
            onClick={() => setSelectedPhoto(photo)}
            data-testid={`gdrive-photo-${photo.id}`}
          >
            <img
              src={photo.thumbnail_url}
              alt={photo.name || 'Photo'}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              loading="lazy"
              onError={(e) => {
                // Fallback to proxy if direct thumbnail fails
                e.target.src = `/api/gdrive/proxy/${photo.file_id}?thumb=true`;
              }}
            />
            
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            
            {/* Highlight badge */}
            {photo.is_highlight && (
              <div 
                className="absolute top-2 left-2 px-2 py-1 rounded-full backdrop-blur-sm"
                style={{ backgroundColor: `${accentColor}cc` }}
              >
                <Star className="w-3 h-3 text-white fill-current" />
              </div>
            )}

            {/* Hover overlay with actions */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <motion.div
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="w-12 h-12 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-xl"
              >
                <ExternalLink className="w-5 h-5" style={{ color: accentColor }} />
              </motion.div>
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
          </motion.div>
        ))}
      </div>

      {/* Expand/Collapse Button */}
      {hasMore && (
        <motion.div 
          className="text-center mt-10"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="group inline-flex items-center gap-3 px-8 py-4 rounded-full transition-all duration-300 border-2 hover:bg-opacity-10"
            style={{ 
              borderColor: accentColor,
              color: textColor,
              backgroundColor: isExpanded ? 'transparent' : `${accentColor}10`
            }}
            data-testid="gdrive-expand-toggle"
          >
            <span className="font-medium">
              {isExpanded ? 'Show Less' : `View All ${photos.length} Photos`}
            </span>
            <motion.span
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.3 }}
            >
              <ChevronDown className="w-5 h-5" />
            </motion.span>
          </button>
        </motion.div>
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
                    // Fallback to proxy if direct view fails
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
