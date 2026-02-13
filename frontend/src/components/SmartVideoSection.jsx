import React, { useState, useMemo } from 'react';
import { Play, Star, X, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * Smart Video Section Component
 * 
 * Intelligent layouts based on video count:
 * - 1 video: Full-width cinematic
 * - 2 videos: Side by side equal
 * - 3 videos: Hero on top, 2 below
 * - 4 videos: 2x2 grid with featured larger
 * - 5+ videos: Featured + scrollable row
 * 
 * Supports theme colors for premium blending
 */
const SmartVideoSection = ({ 
  videos = [], 
  sectionName, 
  contributorName,
  onHighlightChange, // For admin to change featured
  isEditable = false,
  themeColors = null,
  themeFonts = null,
}) => {
  const [playingVideo, setPlayingVideo] = useState(null);
  const [showModal, setShowModal] = useState(false);
  
  // Compute background styles based on theme
  const backgroundStyle = useMemo(() => {
    if (!themeColors) {
      // Default dark cinematic
      return {
        background: 'linear-gradient(180deg, #0a0a0a 0%, #171717 50%, #0a0a0a 100%)',
        textColor: '#ffffff',
        subtitleColor: '#a1a1aa',
        accentColor: '#f59e0b',
      };
    }
    
    // Check if theme is dark or light
    const bgColor = themeColors.background || '#ffffff';
    const isLightTheme = bgColor.toLowerCase() === '#ffffff' || 
                         bgColor.toLowerCase() === '#fff' || 
                         bgColor.toLowerCase().startsWith('#f') ||
                         bgColor.toLowerCase().startsWith('#e');
    
    if (isLightTheme) {
      // For light themes: create a sophisticated dark gradient that blends
      const accent = themeColors.accent || '#3b82f6';
      return {
        background: `linear-gradient(180deg, 
          #1a1a2e 0%, 
          #16213e 30%, 
          #0f0f23 70%, 
          #1a1a2e 100%)`,
        textColor: '#ffffff',
        subtitleColor: 'rgba(255,255,255,0.6)',
        accentColor: accent,
        overlay: 'rgba(0,0,0,0.4)',
      };
    } else {
      // For dark themes: enhance with gradient using theme colors
      const accent = themeColors.accent || '#f59e0b';
      const bg = themeColors.background || '#0a0a0a';
      return {
        background: `linear-gradient(180deg, 
          ${bg} 0%, 
          ${adjustBrightness(bg, -10)} 50%, 
          ${bg} 100%)`,
        textColor: themeColors.text || '#ffffff',
        subtitleColor: themeColors.textLight || 'rgba(255,255,255,0.6)',
        accentColor: accent,
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
  
  // Tag colors - using accent color from theme
  const getTagColor = (tag) => {
    const tagLower = tag?.toLowerCase() || '';
    if (tagLower.includes('sde') || tagLower.includes('same day')) return 'bg-yellow-500 text-black';
    if (tagLower.includes('ceremony')) return 'bg-purple-500 text-white';
    if (tagLower.includes('reception')) return 'bg-pink-500 text-white';
    if (tagLower.includes('prep')) return 'bg-blue-500 text-white';
    if (tagLower.includes('highlight')) return 'bg-green-500 text-white';
    if (tagLower.includes('full')) return 'bg-red-500 text-white';
    return 'bg-white/20 text-white backdrop-blur-sm';
  };

  // Video Card Component
  const VideoCard = ({ video, size = 'normal', showFeaturedBadge = true }) => {
    const isFeatured = video.is_featured || video.id === featuredVideo.id;
    
    return (
      <motion.div 
        className={`relative rounded-xl overflow-hidden cursor-pointer group ${
          size === 'large' ? 'aspect-video' : 
          size === 'medium' ? 'aspect-video' : 
          'aspect-video'
        }`}
        onClick={() => openVideo(video)}
        whileHover={{ scale: 1.02 }}
        transition={{ duration: 0.2 }}
      >
        {/* Thumbnail */}
        <img 
          src={getThumbnail(video)}
          alt={video.title || video.tag}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            e.target.src = `https://img.youtube.com/vi/${video.video_id}/hqdefault.jpg`;
          }}
        />
        
        {/* Overlay with theme-aware gradient */}
        <div 
          className="absolute inset-0 opacity-80 group-hover:opacity-90 transition-opacity"
          style={{
            background: `linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.3) 40%, transparent 70%)`
          }}
        />
        
        {/* Play Button */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div 
            className={`${
              size === 'large' ? 'w-20 h-20' : 'w-14 h-14'
            } backdrop-blur-sm rounded-full flex items-center justify-center transition-transform group-hover:scale-110 border border-white/20`}
            style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
          >
            <Play className={`${size === 'large' ? 'w-10 h-10' : 'w-6 h-6'} text-white ml-1`} fill="white" />
          </div>
        </div>
        
        {/* Info */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {isFeatured && showFeaturedBadge && (
              <span 
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded"
                style={{ 
                  backgroundColor: backgroundStyle.accentColor,
                  color: '#000'
                }}
              >
                <Star className="w-3 h-3" fill="currentColor" />
                FEATURED
              </span>
            )}
            <span className={`px-2 py-1 text-xs font-medium rounded ${getTagColor(video.tag)}`}>
              {video.tag}
            </span>
          </div>
          <h3 
            className={`font-semibold ${size === 'large' ? 'text-xl' : 'text-sm'}`}
            style={{ color: backgroundStyle.textColor }}
          >
            {video.title || video.tag}
          </h3>
          {video.contributor_name && size === 'large' && (
            <p className="text-sm mt-1" style={{ color: backgroundStyle.subtitleColor }}>
              by {video.contributor_name}
            </p>
          )}
        </div>

        {/* Editable: Set as Featured */}
        {isEditable && !isFeatured && (
          <button
            onClick={(e) => { e.stopPropagation(); setFeatured(video.id); }}
            className="absolute top-3 right-3 p-2 bg-black/50 hover:bg-yellow-500 rounded-full opacity-0 group-hover:opacity-100 transition-all"
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

    // 1 Video: Full Cinematic
    if (count === 1) {
      return (
        <div className="max-w-5xl mx-auto">
          <VideoCard video={featuredVideo} size="large" />
        </div>
      );
    }

    // 2 Videos: Side by Side
    if (count === 2) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-6xl mx-auto">
          {sortedVideos.map(video => (
            <VideoCard key={video.id} video={video} size="medium" />
          ))}
        </div>
      );
    }

    // 3 Videos: Hero on top, 2 below
    if (count === 3) {
      return (
        <div className="max-w-6xl mx-auto space-y-4">
          <VideoCard video={featuredVideo} size="large" />
          <div className="grid grid-cols-2 gap-4">
            {otherVideos.slice(0, 2).map(video => (
              <VideoCard key={video.id} video={video} size="medium" showFeaturedBadge={false} />
            ))}
          </div>
        </div>
      );
    }

    // 4 Videos: Featured large + 3 smaller in column or 2x2
    if (count === 4) {
      return (
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <VideoCard video={featuredVideo} size="large" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
              {otherVideos.slice(0, 3).map(video => (
                <VideoCard key={video.id} video={video} size="normal" showFeaturedBadge={false} />
              ))}
            </div>
          </div>
        </div>
      );
    }

    // 5+ Videos: Featured hero + horizontal scroll
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Featured Video */}
        <div className="max-w-5xl mx-auto">
          <VideoCard video={featuredVideo} size="large" />
        </div>
        
        {/* Other Videos - Horizontal Scroll */}
        {otherVideos.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-3 px-1" style={{ color: backgroundStyle.subtitleColor }}>
              More Videos
            </h4>
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
              {otherVideos.map((video) => (
                <div 
                  key={video.id}
                  className="flex-shrink-0 w-64 md:w-80"
                >
                  <VideoCard video={video} size="normal" showFeaturedBadge={false} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };
  
  return (
    <>
      <div 
        className="py-12 md:py-16 relative overflow-hidden"
        style={{ background: backgroundStyle.background }}
      >
        {/* Subtle pattern overlay for premium look */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
            backgroundSize: '40px 40px'
          }}
        />
        
        {/* Ambient glow effect - using opacity instead of blur for better performance */}
        <div 
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] opacity-10 pointer-events-none"
          style={{ 
            background: `radial-gradient(ellipse, ${backgroundStyle.accentColor}, transparent 60%)`
          }}
        />
        
        <div className="relative px-4">
          {/* Section Header */}
          {(sectionName || contributorName) && (
            <div className="mb-10 text-center max-w-5xl mx-auto">
              {sectionName && (
                <h2 
                  className="text-2xl md:text-3xl lg:text-4xl font-light tracking-wide"
                  style={{ 
                    color: backgroundStyle.textColor,
                    fontFamily: themeFonts?.heading || 'Playfair Display, serif'
                  }}
                >
                  {sectionName}
                </h2>
              )}
              {contributorName && (
                <p className="text-sm mt-3" style={{ color: backgroundStyle.subtitleColor }}>
                  by <span style={{ color: backgroundStyle.accentColor }}>{contributorName}</span>
                </p>
              )}
              
              {/* Decorative line */}
              <div className="flex items-center justify-center gap-3 mt-4">
                <div className="h-px w-12" style={{ backgroundColor: backgroundStyle.accentColor + '40' }} />
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: backgroundStyle.accentColor }} />
                <div className="h-px w-12" style={{ backgroundColor: backgroundStyle.accentColor + '40' }} />
              </div>
            </div>
          )}
          
          {/* Smart Layout */}
          {renderLayout()}
        </div>
      </div>
      
      {/* Video Modal */}
      {showModal && playingVideo && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.95)' }}
          onClick={closeModal}
        >
          {/* Close button */}
          <button 
            onClick={closeModal}
            className="absolute top-4 right-4 z-10 p-2 text-white/70 hover:text-white transition-colors"
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
          
          {/* Video Player */}
          <div 
            className="w-full max-w-5xl mx-4"
            onClick={(e) => e.stopPropagation()}
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
                <span className={`px-2 py-1 text-xs font-medium rounded ${getTagColor(playingVideo.tag)}`}>
                  {playingVideo.tag}
                </span>
                {(playingVideo.is_featured || playingVideo.id === featuredVideo.id) && (
                  <span 
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded"
                    style={{ backgroundColor: backgroundStyle.accentColor, color: '#000' }}
                  >
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
          </div>
        </div>
      )}
    </>
  );
};

// Helper function to adjust color brightness
function adjustBrightness(hex, percent) {
  try {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, Math.min(255, (num >> 16) + amt));
    const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt));
    const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
    return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
  } catch {
    return hex;
  }
}

export default SmartVideoSection;
