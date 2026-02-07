import React, { useState } from 'react';
import { Play, Star, X, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';

const VideoSection = ({ videos = [], sectionName, contributorName }) => {
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
  
  const getThumbnail = (video) => {
    return video.thumbnail_url || video.youtube_thumbnail_url;
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
  
  return (
    <>
      <div className="bg-black py-8 md:py-12">
        <div className="max-w-7xl mx-auto px-4">
          {/* Section Header - Elegant Cinematic Style */}
          {(sectionName || contributorName) && (
            <div className="mb-8 text-center">
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
          
          {/* Featured Video */}
          <div 
            className="relative aspect-video max-h-[60vh] mx-auto rounded-xl overflow-hidden cursor-pointer group"
            onClick={() => openVideo(featuredVideo)}
          >
            {/* Thumbnail */}
            <img 
              src={getThumbnail(featuredVideo)}
              alt={featuredVideo.title || featuredVideo.tag}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              onError={(e) => {
                e.target.src = `https://img.youtube.com/vi/${featuredVideo.video_id}/hqdefault.jpg`;
              }}
            />
            
            {/* Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            
            {/* Play Button */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 md:w-24 md:h-24 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center transition-transform group-hover:scale-110">
                <Play className="w-10 h-10 md:w-12 md:h-12 text-white ml-1" fill="white" />
              </div>
            </div>
            
            {/* Info */}
            <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6">
              <div className="flex items-center gap-2 mb-2">
                {featuredVideo.is_featured && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-500 text-black text-xs font-semibold rounded">
                    <Star className="w-3 h-3" fill="currentColor" />
                    FEATURED
                  </span>
                )}
                <span className={`px-2 py-1 text-xs font-medium rounded ${getTagColor(featuredVideo.tag)}`}>
                  {featuredVideo.tag}
                </span>
              </div>
              <h3 className="text-white text-xl md:text-2xl font-semibold">
                {featuredVideo.title || featuredVideo.tag}
              </h3>
              {featuredVideo.description && (
                <p className="text-zinc-300 text-sm mt-1 line-clamp-2">
                  {featuredVideo.description}
                </p>
              )}
              {featuredVideo.contributor_name && (
                <p className="text-zinc-500 text-sm mt-2">
                  {featuredVideo.contributor_name}
                </p>
              )}
            </div>
          </div>
          
          {/* Other Videos - Horizontal Scroll */}
          {otherVideos.length > 0 && (
            <div className="mt-6">
              <h4 className="text-zinc-400 text-sm font-medium mb-3 px-1">More Videos</h4>
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                {otherVideos.map((video) => (
                  <div 
                    key={video.id}
                    onClick={() => openVideo(video)}
                    className="flex-shrink-0 w-48 md:w-64 cursor-pointer group"
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-video rounded-lg overflow-hidden mb-2">
                      <img 
                        src={getThumbnail(video)}
                        alt={video.title || video.tag}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={(e) => {
                          e.target.src = `https://img.youtube.com/vi/${video.video_id}/hqdefault.jpg`;
                        }}
                      />
                      <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors" />
                      
                      {/* Play icon */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity">
                        <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                          <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
                        </div>
                      </div>
                      
                      {/* Tag badge */}
                      <span className={`absolute top-2 left-2 px-2 py-0.5 text-xs font-medium rounded ${getTagColor(video.tag)}`}>
                        {video.tag}
                      </span>
                      
                      {/* Duration */}
                      {video.duration && (
                        <span className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 text-white text-xs rounded">
                          {video.duration}
                        </span>
                      )}
                    </div>
                    
                    {/* Title */}
                    <h5 className="text-white text-sm font-medium truncate px-1">
                      {video.title || video.tag}
                    </h5>
                    {video.contributor_name && (
                      <p className="text-zinc-500 text-xs truncate px-1">
                        {video.contributor_name}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
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
                {playingVideo.is_featured && (
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

export default VideoSection;
