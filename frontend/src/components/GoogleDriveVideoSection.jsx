import React, { useState } from 'react';
import { Play, Star, X, ExternalLink, ChevronLeft, ChevronRight, Film, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const GoogleDriveVideoSection = ({ section, videos = [], themeColors, isEditable = false, onSetFeatured }) => {
  const [playingVideo, setPlayingVideo] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [videoError, setVideoError] = useState({});

  if (!videos || videos.length === 0) return null;

  // Sort: featured first, then by order
  const sortedVideos = [...videos].sort((a, b) => {
    if (a.is_featured && !b.is_featured) return -1;
    if (!a.is_featured && b.is_featured) return 1;
    return (a.order || 0) - (b.order || 0);
  });

  const featuredVideo = sortedVideos.find(v => v.is_featured) || sortedVideos[0];
  const otherVideos = sortedVideos.filter(v => v.id !== featuredVideo?.id);

  const accentColor = themeColors?.accent || '#3b82f6';
  const textColor = themeColors?.text || '#ffffff';

  const openVideo = (video) => {
    setPlayingVideo(video);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setPlayingVideo(null);
  };

  const playNext = () => {
    const currentIndex = sortedVideos.findIndex(v => v.id === playingVideo?.id);
    setPlayingVideo(sortedVideos[(currentIndex + 1) % sortedVideos.length]);
  };

  const playPrev = () => {
    const currentIndex = sortedVideos.findIndex(v => v.id === playingVideo?.id);
    setPlayingVideo(sortedVideos[(currentIndex - 1 + sortedVideos.length) % sortedVideos.length]);
  };

  const getStreamUrl = (video) => `https://drive.google.com/uc?export=download&id=${video.file_id}`;
  const getIframeUrl = (video) => `https://drive.google.com/file/d/${video.file_id}/preview`;

  const getFilename = (video) => {
    const name = video.name || '';
    return name.replace(/\.[^/.]+$/, '') || 'Video';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="mb-16"
      data-testid={`gdrive-video-section-${section.id}`}
    >
      {/* Section Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}99)` }}
          >
            <Film className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-light tracking-wide" style={{ color: textColor }}>
              {section.name}
            </h2>
            {section.contributor_name && (
              <p className="text-sm opacity-60" style={{ color: textColor }}>
                {section.contributor_role || 'Videos'} by {section.contributor_name}
              </p>
            )}
          </div>
        </div>
        <div
          className="flex-1 h-px hidden sm:block"
          style={{ background: `linear-gradient(to right, ${accentColor}50, transparent)` }}
        />
        <span className="text-sm opacity-40 hidden sm:block" style={{ color: textColor }}>
          {videos.length} {videos.length === 1 ? 'video' : 'videos'}
        </span>
      </div>

      {/* Featured Video — big hero */}
      {featuredVideo && (
        <div
          className="relative aspect-video max-h-[65vh] mx-auto rounded-xl overflow-hidden cursor-pointer group mb-6"
          onClick={() => openVideo(featuredVideo)}
          data-testid="gdrive-featured-video"
        >
          {/* Thumbnail */}
          {featuredVideo.thumbnail_url ? (
            <img
              src={featuredVideo.thumbnail_url}
              alt={getFilename(featuredVideo)}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : (
            <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
              <Film className="w-20 h-20 text-zinc-600" />
            </div>
          )}

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

          {/* Play button */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-20 h-20 md:w-24 md:h-24 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center transition-transform group-hover:scale-110 border-2 border-white/40">
              <Play className="w-10 h-10 md:w-12 md:h-12 text-white ml-1" fill="white" />
            </div>
          </div>

          {/* Info bar */}
          <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6">
            <div className="flex items-center gap-2 mb-2">
              <span
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold"
                style={{ backgroundColor: accentColor, color: '#fff' }}
              >
                <Star className="w-3 h-3" fill="currentColor" />
                FEATURED
              </span>
              {featuredVideo.duration && (
                <span className="flex items-center gap-1 px-2 py-1 bg-black/60 text-white text-xs rounded">
                  <Clock className="w-3 h-3" />
                  {featuredVideo.duration}
                </span>
              )}
            </div>
            <h3 className="text-white text-lg md:text-2xl font-semibold">
              {getFilename(featuredVideo)}
            </h3>
            {section.contributor_name && (
              <p className="text-zinc-400 text-sm mt-1">by {section.contributor_name}</p>
            )}
          </div>

          {/* Admin: set featured button */}
          {isEditable && onSetFeatured && !featuredVideo.is_featured && (
            <button
              onClick={(e) => { e.stopPropagation(); onSetFeatured(featuredVideo.id); }}
              className="absolute top-3 right-3 p-2 bg-yellow-500 text-black rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              title="Set as featured"
            >
              <Star className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Other Videos - YouTube-style horizontal scroll row */}
      {otherVideos.length > 0 && (
        <div>
          <h4 className="text-sm font-medium opacity-50 mb-3 px-1" style={{ color: textColor }}>
            More Videos
          </h4>
          <div className="flex gap-4 overflow-x-auto pb-4" style={{ scrollbarWidth: 'none' }}>
            {otherVideos.map((video) => (
              <div
                key={video.id}
                onClick={() => openVideo(video)}
                className="flex-shrink-0 w-48 md:w-64 cursor-pointer group"
                data-testid={`gdrive-video-card-${video.id}`}
              >
                {/* Thumbnail */}
                <div className="relative aspect-video rounded-lg overflow-hidden mb-2 bg-zinc-900">
                  {video.thumbnail_url ? (
                    <img
                      src={video.thumbnail_url}
                      alt={getFilename(video)}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Film className="w-10 h-10 text-zinc-600" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors" />

                  {/* Play icon */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity">
                    <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/30">
                      <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
                    </div>
                  </div>

                  {/* Duration badge */}
                  {video.duration && (
                    <span className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 text-white text-xs rounded">
                      {video.duration}
                    </span>
                  )}

                  {/* Admin: set featured */}
                  {isEditable && onSetFeatured && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onSetFeatured(video.id); }}
                      className="absolute top-2 left-2 p-1.5 bg-yellow-500/80 text-black rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Set as featured"
                    >
                      <Star className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Title */}
                <h5 className="text-sm font-medium truncate px-1" style={{ color: textColor }}>
                  {getFilename(video)}
                </h5>
                {section.contributor_name && (
                  <p className="text-xs opacity-40 truncate px-1" style={{ color: textColor }}>
                    {section.contributor_name}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Video Modal */}
      <AnimatePresence>
        {showModal && playingVideo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4"
            onClick={closeModal}
          >
            {/* Close */}
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 z-10 p-2 text-white/70 hover:text-white transition-colors"
              data-testid="close-gdrive-video-modal"
            >
              <X className="w-8 h-8" />
            </button>

            {/* Navigation arrows */}
            {sortedVideos.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); playPrev(); }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2 text-white/70 hover:text-white transition-colors"
                >
                  <ChevronLeft className="w-10 h-10" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); playNext(); }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2 text-white/70 hover:text-white transition-colors"
                >
                  <ChevronRight className="w-10 h-10" />
                </button>
              </>
            )}

            {/* Player */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-5xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="aspect-video rounded-xl overflow-hidden bg-black">
                {videoError[playingVideo.id] ? (
                  /* Fallback: GDrive iframe player */
                  <iframe
                    src={getIframeUrl(playingVideo)}
                    title={getFilename(playingVideo)}
                    className="w-full h-full"
                    allow="autoplay"
                    allowFullScreen
                  />
                ) : (
                  /* Primary: HTML5 video */
                  <video
                    key={playingVideo.id}
                    controls
                    autoPlay
                    className="w-full h-full"
                    onError={() => setVideoError(prev => ({ ...prev, [playingVideo.id]: true }))}
                  >
                    <source src={getStreamUrl(playingVideo)} type={playingVideo.mime_type || 'video/mp4'} />
                    Your browser does not support this video.
                  </video>
                )}
              </div>

              {/* Video info */}
              <div className="mt-4 px-2">
                <div className="flex items-center gap-3 mb-2">
                  {playingVideo.is_featured && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-500 text-black text-xs font-semibold rounded">
                      <Star className="w-3 h-3" fill="currentColor" />
                      FEATURED
                    </span>
                  )}
                  {playingVideo.duration && (
                    <span className="flex items-center gap-1 text-zinc-400 text-sm">
                      <Clock className="w-3.5 h-3.5" />
                      {playingVideo.duration}
                    </span>
                  )}
                </div>
                <h3 className="text-white text-xl font-semibold">{getFilename(playingVideo)}</h3>
                {section.contributor_name && (
                  <p className="text-zinc-500 text-sm mt-1">
                    Videography by {section.contributor_name}
                  </p>
                )}
                <a
                  href={`https://drive.google.com/file/d/${playingVideo.file_id}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-4 text-zinc-400 hover:text-white text-sm transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-4 h-4" />
                  View on Google Drive
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default GoogleDriveVideoSection;
