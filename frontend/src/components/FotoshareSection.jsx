import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, X, ExternalLink, Camera } from 'lucide-react';

const FotoshareSection = ({ section, videos }) => {
  const [selectedVideo, setSelectedVideo] = useState(null);

  if (!videos || videos.length === 0) {
    return null;
  }

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
            <h2 className="text-2xl md:text-3xl font-light tracking-wide text-white/90">
              {section.name}
            </h2>
            <p className="text-sm text-white/50">360° Booth Experience</p>
          </div>
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-pink-500/50 to-transparent" />
        <span className="text-white/40 text-sm">{videos.length} moments</span>
      </div>

      {/* Videos Grid - Vertical format for 360 videos */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {videos.map((video, index) => (
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

      {/* Lightbox Modal */}
      <AnimatePresence>
        {selectedVideo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md"
            onClick={() => setSelectedVideo(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25 }}
              className="relative max-w-2xl w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={() => setSelectedVideo(null)}
                className="absolute -top-12 right-0 p-2 text-white/60 hover:text-white transition-colors"
                data-testid="close-fotoshare-modal"
              >
                <X className="w-8 h-8" />
              </button>

              {/* Video preview with thumbnail and link to source */}
              <div className="bg-zinc-900 rounded-2xl overflow-hidden">
                <div className="aspect-[9/16] max-h-[70vh] relative">
                  <img
                    src={selectedVideo.thumbnail_url}
                    alt="360 Booth Video"
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <a
                      href={selectedVideo.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-6 py-3 bg-pink-500 hover:bg-pink-600 text-white rounded-full transition-colors font-medium shadow-xl"
                      data-testid="watch-on-fotoshare"
                    >
                      <Play className="w-5 h-5 fill-current" />
                      Watch Video
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
                
                {/* Video info */}
                <div className="p-4 text-center border-t border-zinc-800">
                  <p className="text-white/60 text-sm">
                    This video is hosted on{' '}
                    <a 
                      href={selectedVideo.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-pink-400 hover:text-pink-300 transition-colors"
                    >
                      fotoshare.co
                    </a>
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
