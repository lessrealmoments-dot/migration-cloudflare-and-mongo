import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, X, ExternalLink, Camera, ChevronDown } from 'lucide-react';

const PREVIEW_COUNT = 6; // Show 6 videos initially

const FotoshareSection = ({ section, videos, themeColors }) => {
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [playMode, setPlayMode] = useState('local'); // 'local' or 'external'

  if (!videos || videos.length === 0) {
    return null;
  }

  const displayVideos = isExpanded ? videos : videos.slice(0, PREVIEW_COUNT);
  const hasMore = videos.length > PREVIEW_COUNT;
  const hiddenCount = videos.length - PREVIEW_COUNT;

  // Use theme colors if provided, otherwise use defaults
  const accentColor = themeColors?.accent || '#ec4899';
  const textColor = themeColors?.text || '#ffffff';

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="mb-16"
      data-testid={`fotoshare-section-${section.id}`}
    >
      {/* Section Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
            <Camera className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-light tracking-wide" style={{ color: textColor }}>
              {section.name}
            </h2>
            {section.contributor_name ? (
              <p className="text-sm opacity-60" style={{ color: textColor }}>by {section.contributor_name}</p>
            ) : (
              <p className="text-sm opacity-50" style={{ color: textColor }}>360° Booth Experience</p>
            )}
          </div>
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-pink-500/50 to-transparent" />
        <span className="text-sm opacity-40" style={{ color: textColor }}>{videos.length} moments</span>
      </div>

      {/* Videos Grid - Vertical format for 360 videos */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {displayVideos.map((video, index) => (
          <motion.div
            key={video.id}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: index * 0.05 }}
            className="group relative aspect-[9/16] rounded-xl overflow-hidden cursor-pointer bg-zinc-900"
            onClick={() => setSelectedVideo(video)}
            data-testid={`fotoshare-video-${video.id}`}
          >
            <img
              src={video.thumbnail_url}
              alt="360 Booth Video"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
            
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            
            {/* Play button */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <motion.div
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="w-14 h-14 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-2xl"
              >
                <Play className="w-6 h-6 text-pink-600 fill-current ml-1" />
              </motion.div>
            </div>

            {/* 360 badge */}
            <div className="absolute top-2 left-2 px-2 py-1 bg-pink-500/80 backdrop-blur-sm rounded-full">
              <span className="text-[10px] font-bold text-white tracking-wider">360°</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Expand/Collapse Button - Prominent styling matching photo sections */}
      {hasMore && (
        <motion.div 
          className="text-center mt-12"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="group inline-flex items-center gap-3 px-8 py-4 rounded-full transition-all duration-300 border-2 hover:bg-pink-500/10"
            style={{ 
              borderColor: accentColor,
              color: textColor 
            }}
            data-testid="fotoshare-expand-toggle"
          >
            <span className="font-medium">
              {isExpanded ? 'Show Less' : `View All ${videos.length} Videos`}
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

      {/* Video Player Modal - Tighter container for vertical videos */}
      <AnimatePresence>
        {selectedVideo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-4"
            onClick={() => setSelectedVideo(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25 }}
              className="relative flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={() => setSelectedVideo(null)}
                className="absolute -top-12 right-0 p-2 text-white/60 hover:text-white transition-colors z-10"
                data-testid="close-fotoshare-modal"
              >
                <X className="w-8 h-8" />
              </button>

              {/* Play Mode Toggle */}
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={() => setPlayMode('local')}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    playMode === 'local' 
                      ? 'bg-pink-500 text-white' 
                      : 'bg-white/10 text-white/60 hover:text-white hover:bg-white/20'
                  }`}
                  data-testid="play-mode-local"
                >
                  Play Here
                </button>
                <button
                  onClick={() => setPlayMode('external')}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-1 ${
                    playMode === 'external' 
                      ? 'bg-pink-500 text-white' 
                      : 'bg-white/10 text-white/60 hover:text-white hover:bg-white/20'
                  }`}
                  data-testid="play-mode-external"
                >
                  <ExternalLink className="w-4 h-4" />
                  Fotoshare.co
                </button>
              </div>

              {/* Video Content - Tight wrapper for vertical video */}
              <div className="bg-zinc-900 rounded-2xl overflow-hidden" style={{ width: 'auto', maxWidth: '400px' }}>
                {playMode === 'local' ? (
                  /* Embedded Player - iframe to fotoshare */
                  <div 
                    className="relative bg-black"
                    style={{ 
                      width: '100%',
                      maxWidth: '400px',
                      aspectRatio: '9/16',
                      maxHeight: '70vh'
                    }}
                  >
                    <iframe
                      src={selectedVideo.source_url}
                      title="360 Booth Video"
                      className="w-full h-full"
                      style={{ 
                        width: '100%',
                        height: '100%',
                        aspectRatio: '9/16'
                      }}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      data-testid="fotoshare-iframe"
                    />
                  </div>
                ) : (
                  /* External Link View */
                  <div 
                    className="relative"
                    style={{ 
                      width: '100%',
                      maxWidth: '400px',
                      aspectRatio: '9/16',
                      maxHeight: '70vh'
                    }}
                  >
                    <img
                      src={selectedVideo.thumbnail_url}
                      alt="360 Booth Video"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <a
                        href={selectedVideo.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-6 py-3 bg-pink-500 hover:bg-pink-600 text-white rounded-full transition-colors font-medium shadow-xl"
                        data-testid="watch-on-fotoshare"
                      >
                        <Play className="w-5 h-5 fill-current" />
                        Open on Fotoshare.co
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                )}
                
                {/* Video info */}
                <div className="p-3 text-center border-t border-zinc-800">
                  <p className="text-white/60 text-sm">
                    {playMode === 'local' ? (
                      'Playing embedded from fotoshare.co'
                    ) : (
                      <>
                        Opens in new tab on{' '}
                        <a 
                          href={selectedVideo.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-pink-400 hover:text-pink-300 transition-colors"
                        >
                          fotoshare.co
                        </a>
                      </>
                    )}
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default FotoshareSection;
