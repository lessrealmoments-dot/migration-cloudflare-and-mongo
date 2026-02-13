import React, { useState, useMemo } from 'react';
import { Play, Star, X, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getContrastTextColor, getSubtleTextColor } from '@/themes';

/**
 * Smart Video Section Component - Theme-Aware Premium Design
 * 
 * Intelligent layouts based on video count:
 * - 1 video: Full-width cinematic hero
 * - 2 videos: Side by side equal
 * - 3 videos: Hero on top, 2 below
 * - 4+ videos: Featured hero + horizontal scroll
 * 
 * Adapts to gallery theme - works beautifully on both light and dark themes
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
  
  // Compute styles based on theme - adapts to light/dark
  const styles = useMemo(() => {
    const bg = themeColors?.background || '#ffffff';
    const accent = themeColors?.accent || '#db2777';
    const isLightTheme = bg.toLowerCase() === '#ffffff' || 
                         bg.toLowerCase() === '#fff' || 
                         bg.toLowerCase().startsWith('#f') ||
                         bg.toLowerCase().startsWith('#e');
    
    if (isLightTheme) {
      // Light theme: Use a subtle warm/cool tinted background
      return {
        sectionBg: themeColors?.secondary || '#fafafa',
        cardBg: '#ffffff',
        textColor: themeColors?.text || '#1a1a1a',
        subtitleColor: themeColors?.textLight || '#6b7280',
        accentColor: accent,
        isLight: true,
        // Card styling
        cardShadow: '0 4px 20px rgba(0,0,0,0.08)',
        cardHoverShadow: '0 8px 30px rgba(0,0,0,0.12)',
        cardBorder: `1px solid ${accent}15`,
        // Play button
        playBg: 'rgba(0,0,0,0.7)',
        playBgHover: accent,
        playIcon: '#ffffff',
        // Overlay gradient
        overlayGradient: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.3) 40%, transparent 70%)',
        // Badge styling
        featuredBg: accent,
        featuredText: getContrastTextColor(accent),
        tagBg: 'rgba(0,0,0,0.6)',
        tagText: '#ffffff',
      };
    } else {
      // Dark theme: Rich dark with accent glow
      return {
        sectionBg: themeColors?.secondary || '#1a1a1a',
        cardBg: themeColors?.background || '#0a0a0a',
        textColor: themeColors?.text || '#ffffff',
        subtitleColor: themeColors?.textLight || '#a1a1aa',
        accentColor: accent,
        isLight: false,
        // Card styling
        cardShadow: `0 4px 20px ${accent}15`,
        cardHoverShadow: `0 8px 30px ${accent}25`,
        cardBorder: `1px solid ${accent}30`,
        // Play button
        playBg: `${accent}90`,
        playBgHover: accent,
        playIcon: getContrastTextColor(accent),
        // Overlay gradient
        overlayGradient: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 40%, transparent 70%)',
        // Badge styling
        featuredBg: accent,
        featuredText: getContrastTextColor(accent),
        tagBg: 'rgba(255,255,255,0.15)',
        tagText: '#ffffff',
      };
    }
  }, [themeColors]);
  
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
  
  // Tag styling based on content
  const getTagStyle = (tag) => {
    const tagLower = tag?.toLowerCase() || '';
    if (tagLower.includes('sde') || tagLower.includes('same day')) {
      return { bg: styles.accentColor, text: getContrastTextColor(styles.accentColor) };
    }
    return { bg: styles.tagBg, text: styles.tagText };
  };

  // Premium Video Card Component
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
        whileHover={{ y: -4 }}
        style={{
          borderRadius: '12px',
          boxShadow: styles.cardShadow,
          border: styles.cardBorder,
          backgroundColor: styles.cardBg,
        }}
        data-testid={`video-card-${video.id || index}`}
      >
        {/* Thumbnail */}
        <img 
          src={getThumbnail(video)}
          alt={video.title || video.tag}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          style={{ borderRadius: '12px' }}
          onError={(e) => {
            e.target.src = `https://img.youtube.com/vi/${video.video_id}/hqdefault.jpg`;
          }}
        />
        
        {/* Overlay Gradient */}
        <div 
          className="absolute inset-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: styles.overlayGradient,
            borderRadius: '12px',
            opacity: 0.9,
          }}
        />
        
        {/* Play Button - Centered */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div 
            className={`${size === 'large' ? 'w-20 h-20' : 'w-16 h-16'} rounded-full flex items-center justify-center transition-all duration-300`}
            style={{ 
              backgroundColor: styles.playBg,
              boxShadow: `0 4px 20px ${styles.accentColor}40`
            }}
            whileHover={{ 
              scale: 1.1,
              backgroundColor: styles.playBgHover,
            }}
          >
            <Play 
              className={`${size === 'large' ? 'w-8 h-8' : 'w-6 h-6'} ml-1`} 
              fill={styles.playIcon}
              color={styles.playIcon}
            />
          </motion.div>
        </div>
        
        {/* Info Section - Bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5">
          {/* Tags Row */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {isFeatured && showFeaturedBadge && (
              <span 
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full"
                style={{ 
                  backgroundColor: styles.featuredBg,
                  color: styles.featuredText
                }}
              >
                <Star className="w-3 h-3" fill="currentColor" />
                FEATURED
              </span>
            )}
            {video.tag && (
              <span 
                className="px-2.5 py-1 text-xs font-medium rounded-full backdrop-blur-sm"
                style={{ backgroundColor: tagStyle.bg, color: tagStyle.text }}
              >
                {video.tag}
              </span>
            )}
          </div>
          
          {/* Title */}
          <h3 
            className={`font-semibold text-white ${size === 'large' ? 'text-xl md:text-2xl' : 'text-base'}`}
          >
            {video.title || video.tag || 'Video'}
          </h3>
          
          {/* Contributor */}
          {video.contributor_name && size === 'large' && (
            <p className="text-sm mt-1 text-white/70">
              by {video.contributor_name}
            </p>
          )}
        </div>

        {/* Admin: Set as Featured */}
        {isEditable && !isFeatured && (
          <button
            onClick={(e) => { e.stopPropagation(); setFeatured(video.id); }}
            className="absolute top-3 right-3 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-all"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
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
        <div className="max-w-4xl mx-auto">
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
        <div className="max-w-4xl mx-auto">
          <VideoCard video={featuredVideo} size="large" index={0} />
        </div>
        
        {/* Other Videos - Horizontal Scroll or Grid */}
        {otherVideos.length > 0 && (
          <div>
            <h4 
              className="text-sm font-medium mb-4 uppercase tracking-wider"
              style={{ color: styles.subtitleColor }}
            >
              More Videos
            </h4>
            {otherVideos.length <= 3 ? (
              // Grid for 2-3 videos
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {otherVideos.map((video, idx) => (
                  <VideoCard key={video.id} video={video} size="normal" showFeaturedBadge={false} index={idx + 1} />
                ))}
              </div>
            ) : (
              // Horizontal scroll for 4+ videos
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
      <section 
        className="py-16 md:py-20 relative"
        style={{ backgroundColor: styles.sectionBg }}
        data-testid="smart-video-section"
      >
        <div className="max-w-screen-xl mx-auto px-6 md:px-12">
          {/* Section Header */}
          {(sectionName || contributorName) && (
            <motion.div 
              className="mb-12 text-center"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              {sectionName && (
                <h2 
                  className="text-2xl md:text-3xl lg:text-4xl font-normal tracking-wide"
                  style={{ 
                    color: styles.textColor,
                    fontFamily: themeFonts?.heading || 'Playfair Display, serif'
                  }}
                >
                  {sectionName}
                </h2>
              )}
              {contributorName && (
                <p className="text-sm mt-3" style={{ color: styles.subtitleColor }}>
                  by <span style={{ color: styles.accentColor }}>{contributorName}</span>
                </p>
              )}
              
              {/* Decorative Divider */}
              <div className="flex items-center justify-center gap-3 mt-5">
                <div className="h-px w-12" style={{ backgroundColor: styles.accentColor + '40' }} />
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: styles.accentColor }} />
                <div className="h-px w-12" style={{ backgroundColor: styles.accentColor + '40' }} />
              </div>
            </motion.div>
          )}
          
          {/* Video Layout */}
          {renderLayout()}
        </div>
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
              className="absolute top-4 right-4 z-10 p-2 text-white/70 hover:text-white transition-colors"
              data-testid="video-modal-close"
            >
              <X className="w-8 h-8" />
            </button>
            
            {/* Navigation arrows */}
            {sortedVideos.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); playPrev(); }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2 text-white/70 hover:text-white transition-colors"
                  data-testid="video-modal-prev"
                >
                  <ChevronLeft className="w-10 h-10" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); playNext(); }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2 text-white/70 hover:text-white transition-colors"
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
              <div className="aspect-video rounded-xl overflow-hidden bg-black">
                <iframe
                  src={`https://www.youtube.com/embed/${playingVideo.video_id}?autoplay=1&rel=0&modestbranding=1`}
                  title={playingVideo.title || playingVideo.tag}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              
              {/* Video Info */}
              <div className="mt-4 px-2">
                <div className="flex items-center gap-2 mb-2">
                  {playingVideo.tag && (
                    <span 
                      className="px-2.5 py-1 text-xs font-medium rounded-full"
                      style={{ 
                        backgroundColor: styles.accentColor,
                        color: getContrastTextColor(styles.accentColor)
                      }}
                    >
                      {playingVideo.tag}
                    </span>
                  )}
                  {(playingVideo.is_featured || playingVideo.id === featuredVideo.id) && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-yellow-500 text-black">
                      <Star className="w-3 h-3" fill="currentColor" />
                      FEATURED
                    </span>
                  )}
                </div>
                <h3 className="text-white text-xl font-semibold">
                  {playingVideo.title || playingVideo.tag}
                </h3>
                {playingVideo.description && (
                  <p className="text-zinc-400 text-sm mt-2">
                    {playingVideo.description}
                  </p>
                )}
                {playingVideo.contributor_name && (
                  <p className="text-zinc-500 text-sm mt-2">
                    Videography by {playingVideo.contributor_name}
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
