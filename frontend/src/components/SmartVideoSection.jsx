import React, { useState, useMemo } from 'react';
import { Play, Star, X, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getContrastTextColor } from '@/themes';

/**
 * Smart Video Section Component - Premium Frosted Glass Design
 * 
 * Features a cinematic dark frosted glass aesthetic that looks premium
 * on any gallery theme while using accent colors for cohesion.
 * 
 * Intelligent layouts based on video count:
 * - 1 video: Full-width cinematic hero
 * - 2 videos: Side by side equal
 * - 3 videos: Hero on top, 2 below
 * - 4+ videos: Featured hero + horizontal scroll
 */
const SmartVideoSection = ({ 
  videos = [], 
  sectionName, 
  contributorName,
  onHighlightChange,
  isEditable = false,
  themeColors = null,
  themeFonts = null,
}) => {
  const [playingVideo, setPlayingVideo] = useState(null);
  const [showModal, setShowModal] = useState(false);
  
  // Get accent color from theme for highlights
  const accentColor = themeColors?.accent || '#db2777';
  
  if (videos.length === 0) return null;
  
  // Sort videos: featured first, then by order
  const sortedVideos = [...videos].sort((a, b) => {
    if (a.is_featured && !b.is_featured) return -1;
    if (!a.is_featured && b.is_featured) return 1;
    return (a.order || 0) - (b.order || 0);
  });
  
  const featuredVideo = sortedVideos.find(v => v.is_featured) || sortedVideos[0];
  const otherVideos = sortedVideos.filter(v => v.id !== featuredVideo.id);
  
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
    const nextIndex = (currentIndex + 1) % sortedVideos.length;
    setPlayingVideo(sortedVideos[nextIndex]);
  };
  
  const playPrev = () => {
    const currentIndex = sortedVideos.findIndex(v => v.id === playingVideo?.id);
    const prevIndex = (currentIndex - 1 + sortedVideos.length) % sortedVideos.length;
    setPlayingVideo(sortedVideos[prevIndex]);
  };

  const setFeatured = (videoId) => {
    if (onHighlightChange) {
      onHighlightChange(videoId);
    }
  };
  
  const getThumbnail = (video) => {
    return video.thumbnail_url || video.youtube_thumbnail_url || 
           `https://img.youtube.com/vi/${video.video_id}/maxresdefault.jpg`;
  };
  
  // Tag styling - using accent for SDE, neutral for others
  const getTagStyle = (tag) => {
    const tagLower = tag?.toLowerCase() || '';
    if (tagLower.includes('sde') || tagLower.includes('same day')) {
      return { bg: accentColor, text: getContrastTextColor(accentColor) };
    }
    return { bg: 'rgba(255,255,255,0.15)', text: '#ffffff' };
  };

  // Premium Frosted Video Card Component
  const VideoCard = ({ video, size = 'normal', showFeaturedBadge = true, index = 0 }) => {
    const isFeatured = video.is_featured || video.id === featuredVideo.id;
    const tagStyle = getTagStyle(video.tag);
    
    return (
      <motion.div 
        className={`relative overflow-hidden cursor-pointer group ${
          size === 'large' ? 'aspect-video' : 'aspect-video'
        }`}
        onClick={() => openVideo(video)}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: index * 0.1 }}
        whileHover={{ y: -4, scale: 1.01 }}
        style={{
          borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
        data-testid={`video-card-${video.id || index}`}
      >
        {/* Thumbnail */}
        <img 
          src={getThumbnail(video)}
          alt={video.title || video.tag}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          style={{ borderRadius: '16px' }}
          onError={(e) => {
            e.target.src = `https://img.youtube.com/vi/${video.video_id}/hqdefault.jpg`;
          }}
        />
        
        {/* Frosted Glass Overlay */}
        <div 
          className="absolute inset-0 transition-opacity duration-300"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.2) 100%)',
            borderRadius: '16px',
          }}
        />
        
        {/* Play Button - Premium Glass Style */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div 
            className={`${size === 'large' ? 'w-24 h-24' : 'w-18 h-18'} rounded-full flex items-center justify-center backdrop-blur-md transition-all duration-300`}
            style={{ 
              backgroundColor: 'rgba(255,255,255,0.1)',
              border: '2px solid rgba(255,255,255,0.2)',
              boxShadow: `0 8px 32px rgba(0,0,0,0.3), inset 0 0 20px rgba(255,255,255,0.05)`
            }}
            whileHover={{ 
              scale: 1.1,
              backgroundColor: accentColor,
              borderColor: accentColor,
            }}
          >
            <Play 
              className={`${size === 'large' ? 'w-10 h-10' : 'w-7 h-7'} ml-1 text-white`} 
              fill="white"
            />
          </motion.div>
        </div>
        
        {/* Info Section - Bottom with frosted glass effect */}
        <div 
          className="absolute bottom-0 left-0 right-0 p-5 md:p-6"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)',
          }}
        >
          {/* Tags Row */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {isFeatured && showFeaturedBadge && (
              <span 
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full uppercase tracking-wider"
                style={{ 
                  backgroundColor: accentColor,
                  color: getContrastTextColor(accentColor),
                  boxShadow: `0 4px 15px ${accentColor}50`
                }}
              >
                <Star className="w-3.5 h-3.5" fill="currentColor" />
                Featured
              </span>
            )}
            {video.tag && (
              <span 
                className="px-3 py-1.5 text-xs font-medium rounded-full backdrop-blur-sm"
                style={{ backgroundColor: tagStyle.bg, color: tagStyle.text }}
              >
                {video.tag}
              </span>
            )}
          </div>
          
          {/* Title */}
          <h3 
            className={`font-semibold text-white ${size === 'large' ? 'text-2xl md:text-3xl' : 'text-lg'}`}
            style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}
          >
            {video.title || video.tag || 'Video'}
          </h3>
          
          {/* Contributor */}
          {video.contributor_name && size === 'large' && (
            <p className="text-sm mt-2 text-white/70">
              by <span style={{ color: accentColor }}>{video.contributor_name}</span>
            </p>
          )}
        </div>

        {/* Admin: Set as Featured */}
        {isEditable && !isFeatured && (
          <button
            onClick={(e) => { e.stopPropagation(); setFeatured(video.id); }}
            className="absolute top-4 right-4 p-2.5 rounded-full opacity-0 group-hover:opacity-100 transition-all backdrop-blur-md"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)' }}
            title="Set as featured"
          >
            <Star className="w-4 h-4 text-white" />
          </button>
        )}
      </motion.div>
    );
  };

  // Render layouts based on video count
  const renderLayout = () => {
    const count = videos.length;

    // 1 Video: Cinematic Hero
    if (count === 1) {
      return (
        <div className="max-w-5xl mx-auto">
          <VideoCard video={featuredVideo} size="large" index={0} />
        </div>
      );
    }

    // 2 Videos: Side by Side
    if (count === 2) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {sortedVideos.map((video, idx) => (
            <VideoCard key={video.id} video={video} size="medium" index={idx} />
          ))}
        </div>
      );
    }

    // 3 Videos: Hero on top, 2 below
    if (count === 3) {
      return (
        <div className="max-w-5xl mx-auto space-y-6">
          <VideoCard video={featuredVideo} size="large" index={0} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {otherVideos.slice(0, 2).map((video, idx) => (
              <VideoCard key={video.id} video={video} size="medium" showFeaturedBadge={false} index={idx + 1} />
            ))}
          </div>
        </div>
      );
    }

    // 4+ Videos: Featured hero + scrollable row
    return (
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Featured Video */}
        <div className="max-w-5xl mx-auto">
          <VideoCard video={featuredVideo} size="large" index={0} />
        </div>
        
        {/* Other Videos - Grid or Scroll */}
        {otherVideos.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-4 uppercase tracking-wider text-white/50">
              More Videos
            </h4>
            {otherVideos.length <= 3 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {otherVideos.map((video, idx) => (
                  <VideoCard key={video.id} video={video} size="normal" showFeaturedBadge={false} index={idx + 1} />
                ))}
              </div>
            ) : (
              <div className="flex gap-5 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4">
                {otherVideos.map((video, idx) => (
                  <div key={video.id} className="flex-shrink-0 w-72 md:w-80">
                    <VideoCard video={video} size="normal" showFeaturedBadge={false} index={idx + 1} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };
  
  return (
    <>
      {/* Premium Frosted Dark Section */}
      <section 
        className="py-20 md:py-24 relative overflow-hidden"
        style={{ 
          background: 'linear-gradient(180deg, #0a0a0a 0%, #121212 50%, #0a0a0a 100%)',
        }}
        data-testid="smart-video-section"
      >
        {/* Subtle animated gradient overlay */}
        <div 
          className="absolute inset-0 opacity-30"
          style={{
            background: `radial-gradient(ellipse at 50% 0%, ${accentColor}15 0%, transparent 50%)`
          }}
        />
        
        {/* Noise texture for premium feel */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />
        
        {/* Frosted glass top edge */}
        <div 
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)' }}
        />
        
        <div className="relative max-w-screen-xl mx-auto px-6 md:px-12">
          {/* Section Header */}
          {(sectionName || contributorName) && (
            <motion.div 
              className="mb-14 text-center"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              {sectionName && (
                <h2 
                  className="text-3xl md:text-4xl lg:text-5xl font-light tracking-wide text-white"
                  style={{ 
                    fontFamily: themeFonts?.heading || 'Playfair Display, serif',
                    textShadow: '0 4px 20px rgba(0,0,0,0.5)'
                  }}
                >
                  {sectionName}
                </h2>
              )}
              {contributorName && (
                <p className="text-sm mt-4 text-white/50">
                  by <span style={{ color: accentColor }}>{contributorName}</span>
                </p>
              )}
              
              {/* Decorative Accent Line */}
              <div className="flex items-center justify-center gap-3 mt-6">
                <div className="h-px w-16" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}60)` }} />
                <div 
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: accentColor, boxShadow: `0 0 10px ${accentColor}` }}
                />
                <div className="h-px w-16" style={{ background: `linear-gradient(90deg, ${accentColor}60, transparent)` }} />
              </div>
            </motion.div>
          )}
          
          {/* Video Layout */}
          {renderLayout()}
        </div>
        
        {/* Frosted glass bottom edge */}
        <div 
          className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)' }}
        />
      </section>
      
      {/* Video Modal */}
      <AnimatePresence>
        {showModal && playingVideo && (
          <motion.div 
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.95)' }}
            onClick={closeModal}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Close button */}
            <button 
              onClick={closeModal}
              className="absolute top-4 right-4 z-10 p-3 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-all"
              data-testid="video-modal-close"
            >
              <X className="w-8 h-8" />
            </button>
            
            {/* Navigation arrows */}
            {sortedVideos.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); playPrev(); }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-all"
                  data-testid="video-modal-prev"
                >
                  <ChevronLeft className="w-10 h-10" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); playNext(); }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-all"
                  data-testid="video-modal-next"
                >
                  <ChevronRight className="w-10 h-10" />
                </button>
              </>
            )}
            
            {/* Video Player */}
            <motion.div 
              className="w-full max-w-5xl mx-4"
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="aspect-video rounded-2xl overflow-hidden bg-black shadow-2xl">
                <iframe
                  src={`https://www.youtube.com/embed/${playingVideo.video_id}?autoplay=1&rel=0&modestbranding=1`}
                  title={playingVideo.title || playingVideo.tag}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              
              {/* Video Info */}
              <div className="mt-5 px-2">
                <div className="flex items-center gap-2 mb-3">
                  {playingVideo.tag && (
                    <span 
                      className="px-3 py-1.5 text-xs font-medium rounded-full"
                      style={{ 
                        backgroundColor: accentColor,
                        color: getContrastTextColor(accentColor)
                      }}
                    >
                      {playingVideo.tag}
                    </span>
                  )}
                  {(playingVideo.is_featured || playingVideo.id === featuredVideo.id) && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full bg-yellow-500 text-black">
                      <Star className="w-3.5 h-3.5" fill="currentColor" />
                      Featured
                    </span>
                  )}
                </div>
                <h3 className="text-white text-2xl font-semibold">
                  {playingVideo.title || playingVideo.tag}
                </h3>
                {playingVideo.description && (
                  <p className="text-zinc-400 text-sm mt-2">
                    {playingVideo.description}
                  </p>
                )}
                {playingVideo.contributor_name && (
                  <p className="text-zinc-500 text-sm mt-2">
                    Videography by <span style={{ color: accentColor }}>{playingVideo.contributor_name}</span>
                  </p>
                )}
                
                {/* Watch on YouTube */}
                <a
                  href={playingVideo.youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-4 text-zinc-400 hover:text-white text-sm transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Watch on YouTube
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SmartVideoSection;
