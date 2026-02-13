import React, { useState } from 'react';
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
 */
const SmartVideoSection = ({ 
  videos = [], 
  sectionName, 
  contributorName,
  onHighlightChange, // For admin to change featured
  isEditable = false,
}) => {
  const [playingVideo, setPlayingVideo] = useState(null);
  const [showModal, setShowModal] = useState(false);
  
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
  
  // Tag colors
  const getTagColor = (tag) => {
    const tagLower = tag?.toLowerCase() || '';
    if (tagLower.includes('sde') || tagLower.includes('same day')) return 'bg-yellow-500 text-black';
    if (tagLower.includes('ceremony')) return 'bg-purple-500 text-white';
    if (tagLower.includes('reception')) return 'bg-pink-500 text-white';
    if (tagLower.includes('prep')) return 'bg-blue-500 text-white';
    if (tagLower.includes('highlight')) return 'bg-green-500 text-white';
    if (tagLower.includes('full')) return 'bg-red-500 text-white';
    return 'bg-zinc-700 text-white';
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
        
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />
        
        {/* Play Button */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={`${
            size === 'large' ? 'w-20 h-20' : 'w-14 h-14'
          } bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center transition-transform group-hover:scale-110`}>
            <Play className={`${size === 'large' ? 'w-10 h-10' : 'w-6 h-6'} text-white ml-1`} fill="white" />
          </div>
        </div>
        
        {/* Info */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {isFeatured && showFeaturedBadge && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-500 text-black text-xs font-semibold rounded">
                <Star className="w-3 h-3" fill="currentColor" />
                FEATURED
              </span>
            )}
            <span className={`px-2 py-1 text-xs font-medium rounded ${getTagColor(video.tag)}`}>
              {video.tag}
            </span>
          </div>
          <h3 className={`text-white font-semibold ${size === 'large' ? 'text-xl' : 'text-sm'}`}>
            {video.title || video.tag}
          </h3>
          {video.contributor_name && size === 'large' && (
            <p className="text-zinc-400 text-sm mt-1">
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
            <h4 className="text-zinc-400 text-sm font-medium mb-3 px-1">More Videos</h4>
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
      <div className="bg-black py-8 md:py-12">
        <div className="px-4">
          {/* Section Header */}
          {(sectionName || contributorName) && (
            <div className="mb-8 text-center max-w-5xl mx-auto">
              {sectionName && (
                <h2 className="text-2xl md:text-3xl lg:text-4xl font-light text-white tracking-wide" style={{ fontFamily: 'Playfair Display, serif' }}>
                  {sectionName}
                </h2>
              )}
              {contributorName && (
                <p className="text-zinc-400 text-sm mt-2">by <span className="text-zinc-300">{contributorName}</span></p>
              )}
            </div>
          )}
          
          {/* Smart Layout */}
          {renderLayout()}
        </div>
      </div>
      
      {/* Video Modal */}
      {showModal && playingVideo && (
        <div 
          className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center"
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
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-500 text-black text-xs font-semibold rounded">
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

export default SmartVideoSection;
