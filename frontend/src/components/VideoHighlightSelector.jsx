import React from 'react';
import { Star, Play, Trash2, GripVertical } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * Video Highlight Selector
 * 
 * Allows selecting which video should be featured (only one)
 * Radio button style selection
 */
const VideoHighlightSelector = ({
  videos = [],
  onSetFeatured,
  onRemove,
  disabled = false,
}) => {
  if (videos.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500">
        No videos added yet
      </div>
    );
  }

  const featuredVideo = videos.find(v => v.is_featured) || videos[0];

  const getThumbnail = (video) => {
    return video.thumbnail_url || video.youtube_thumbnail_url || 
           `https://img.youtube.com/vi/${video.video_id}/maxresdefault.jpg`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-zinc-600">
          <Star className="w-4 h-4 inline text-yellow-500 mr-1" fill="currentColor" />
          Select which video to feature (displayed prominently)
        </p>
      </div>

      {videos.map((video, index) => {
        const isFeatured = video.is_featured || video.id === featuredVideo?.id;
        
        return (
          <motion.div
            key={video.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={`relative flex items-center gap-4 p-3 rounded-xl border-2 transition-all ${
              isFeatured 
                ? 'border-yellow-400 bg-yellow-50' 
                : 'border-zinc-200 hover:border-zinc-300 bg-white'
            }`}
          >
            {/* Drag Handle (future: for reordering) */}
            <div className="text-zinc-300 cursor-grab">
              <GripVertical className="w-5 h-5" />
            </div>

            {/* Radio Button */}
            <button
              onClick={() => !disabled && onSetFeatured(video.id)}
              disabled={disabled}
              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                isFeatured 
                  ? 'border-yellow-500 bg-yellow-500' 
                  : 'border-zinc-300 hover:border-yellow-400'
              }`}
            >
              {isFeatured && <Star className="w-4 h-4 text-white" fill="currentColor" />}
            </button>

            {/* Thumbnail */}
            <div className="relative w-24 h-14 rounded-lg overflow-hidden shrink-0">
              <img 
                src={getThumbnail(video)}
                alt={video.title || video.tag}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.src = `https://img.youtube.com/vi/${video.video_id}/hqdefault.jpg`;
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Play className="w-6 h-6 text-white" fill="white" />
              </div>
            </div>

            {/* Video Info */}
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-zinc-800 truncate">
                {video.title || video.tag || 'Untitled Video'}
              </h4>
              <div className="flex items-center gap-2 mt-1">
                {video.tag && (
                  <span className="px-2 py-0.5 bg-zinc-100 text-zinc-600 text-xs rounded">
                    {video.tag}
                  </span>
                )}
                {isFeatured && (
                  <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded font-medium">
                    Featured
                  </span>
                )}
              </div>
            </div>

            {/* Remove Button */}
            {onRemove && (
              <button
                onClick={() => !disabled && onRemove(video.id)}
                disabled={disabled}
                className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
          </motion.div>
        );
      })}

      <p className="text-xs text-zinc-400 mt-4 text-center">
        The featured video will be displayed larger and highlighted in the gallery
      </p>
    </div>
  );
};

export default VideoHighlightSelector;
