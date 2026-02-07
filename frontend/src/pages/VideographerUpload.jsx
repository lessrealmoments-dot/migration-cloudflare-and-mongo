import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { 
  Video, Upload, Trash2, Play, Star, Plus, 
  ExternalLink, Check, X, Loader2, Film
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

// Common video tags
const SUGGESTED_TAGS = [
  'Same Day Edit (SDE)',
  'Preparation',
  'Ceremony', 
  'Reception',
  'Highlights',
  'Full Film',
  'Trailer'
];

const VideographerUpload = () => {
  const { contributorLink } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [galleryInfo, setGalleryInfo] = useState(null);
  const [companyName, setCompanyName] = useState('');
  const [videos, setVideos] = useState([]);
  
  // Form state
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [tag, setTag] = useState('');
  const [customTag, setCustomTag] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [previewVideoId, setPreviewVideoId] = useState(null);
  
  useEffect(() => {
    fetchGalleryInfo();
  }, [contributorLink]);
  
  const fetchGalleryInfo = async () => {
    try {
      const response = await axios.get(`${API}/contributor/${contributorLink}`);
      
      if (response.data.section_type !== 'video') {
        toast.error('This link is for photo uploads, not videos');
        navigate('/');
        return;
      }
      
      setGalleryInfo(response.data);
      setCompanyName(response.data.existing_contributor_name || '');
      setVideos(response.data.existing_videos || []);
    } catch (error) {
      toast.error('Invalid or expired upload link');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };
  
  const extractVideoId = (url) => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };
  
  const handleUrlChange = (url) => {
    setYoutubeUrl(url);
    const videoId = extractVideoId(url);
    setPreviewVideoId(videoId);
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!companyName.trim()) {
      toast.error('Please enter your company/videographer name');
      return;
    }
    
    if (!youtubeUrl.trim()) {
      toast.error('Please enter a YouTube URL');
      return;
    }
    
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      toast.error('Invalid YouTube URL. Please enter a valid YouTube video link.');
      return;
    }
    
    const finalTag = tag === 'custom' ? customTag.trim() : tag;
    if (!finalTag) {
      toast.error('Please select or enter a video tag');
      return;
    }
    
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('youtube_url', youtubeUrl);
      formData.append('tag', finalTag);
      formData.append('company_name', companyName);
      formData.append('title', title || '');
      formData.append('description', description || '');
      
      const response = await axios.post(
        `${API}/contributor/${contributorLink}/video`,
        formData
      );
      
      toast.success('Video added successfully!');
      
      // Add to local videos list
      setVideos([...videos, {
        id: response.data.video.id,
        tag: finalTag,
        title: title || finalTag,
        youtube_thumbnail_url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        is_featured: response.data.video.is_featured
      }]);
      
      // Reset form
      setYoutubeUrl('');
      setTag('');
      setCustomTag('');
      setTitle('');
      setDescription('');
      setPreviewVideoId(null);
      
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add video');
    } finally {
      setUploading(false);
    }
  };
  
  const handleDeleteVideo = async (videoId) => {
    if (!window.confirm('Are you sure you want to remove this video?')) return;
    
    try {
      await axios.delete(`${API}/contributor/${contributorLink}/video/${videoId}`);
      setVideos(videos.filter(v => v.id !== videoId));
      toast.success('Video removed');
    } catch (error) {
      toast.error('Failed to remove video');
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white" />
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
      {/* Header */}
      <div className="bg-black/30 border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
              <Film className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Video Upload</h1>
              <p className="text-zinc-400 text-sm">{galleryInfo?.gallery_title}</p>
            </div>
          </div>
          <p className="text-zinc-500 text-sm mt-2">
            Section: <span className="text-zinc-300">{galleryInfo?.section_name}</span>
            {' • '}
            Photographer: <span className="text-zinc-300">{galleryInfo?.photographer_name}</span>
          </p>
        </div>
      </div>
      
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Upload Form */}
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
            <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Add Video
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Company Name */}
              <div>
                <label className="block text-sm text-zinc-400 mb-2">
                  Your Company / Videographer Name *
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g., Juan Films"
                  className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none"
                  disabled={galleryInfo?.existing_contributor_name}
                  data-testid="videographer-name-input"
                />
              </div>
              
              {/* YouTube URL */}
              <div>
                <label className="block text-sm text-zinc-400 mb-2">
                  YouTube Video URL *
                </label>
                <input
                  type="url"
                  value={youtubeUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none"
                  data-testid="youtube-url-input"
                />
                
                {/* Preview */}
                {previewVideoId && (
                  <div className="mt-3 rounded-xl overflow-hidden aspect-video bg-black">
                    <img 
                      src={`https://img.youtube.com/vi/${previewVideoId}/maxresdefault.jpg`}
                      alt="Video thumbnail"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.src = `https://img.youtube.com/vi/${previewVideoId}/hqdefault.jpg`;
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center">
                        <Play className="w-8 h-8 text-white ml-1" fill="white" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Video Tag */}
              <div>
                <label className="block text-sm text-zinc-400 mb-2">
                  Video Type / Tag *
                </label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {SUGGESTED_TAGS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { setTag(t); setCustomTag(''); }}
                      className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                        tag === t
                          ? 'bg-purple-600 text-white'
                          : 'bg-white/10 text-zinc-300 hover:bg-white/20'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setTag('custom')}
                    className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                      tag === 'custom'
                        ? 'bg-purple-600 text-white'
                        : 'bg-white/10 text-zinc-300 hover:bg-white/20'
                    }`}
                  >
                    + Custom
                  </button>
                </div>
                
                {tag === 'custom' && (
                  <input
                    type="text"
                    value={customTag}
                    onChange={(e) => setCustomTag(e.target.value)}
                    placeholder="Enter custom tag..."
                    className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none"
                  />
                )}
              </div>
              
              {/* Title (optional) */}
              <div>
                <label className="block text-sm text-zinc-400 mb-2">
                  Video Title <span className="text-zinc-600">(optional)</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Our Perfect Day"
                  className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none"
                  data-testid="video-title-input"
                />
              </div>
              
              {/* Description (optional) */}
              <div>
                <label className="block text-sm text-zinc-400 mb-2">
                  Description <span className="text-zinc-600">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short description of the video..."
                  rows={3}
                  className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none resize-none"
                  data-testid="video-description-input"
                />
              </div>
              
              {/* Submit Button */}
              <button
                type="submit"
                disabled={uploading}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                data-testid="add-video-button"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Adding Video...
                  </>
                ) : (
                  <>
                    <Plus className="w-5 h-5" />
                    Add Video
                  </>
                )}
              </button>
            </form>
          </div>
          
          {/* Uploaded Videos */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Video className="w-5 h-5" />
              Your Videos ({videos.length})
            </h2>
            
            {videos.length === 0 ? (
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10 text-center">
                <Film className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-400">No videos uploaded yet</p>
                <p className="text-zinc-600 text-sm mt-1">Add your first video using the form</p>
              </div>
            ) : (
              <div className="space-y-4">
                {videos.map((video) => (
                  <div 
                    key={video.id}
                    className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden group"
                  >
                    <div className="flex">
                      {/* Thumbnail */}
                      <div className="w-32 h-20 relative flex-shrink-0">
                        <img 
                          src={video.thumbnail_url || video.youtube_thumbnail_url}
                          alt={video.title || video.tag}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.src = 'https://via.placeholder.com/320x180?text=Video';
                          }}
                        />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <Play className="w-8 h-8 text-white" fill="white" />
                        </div>
                        {video.is_featured && (
                          <div className="absolute top-1 left-1 bg-yellow-500 text-black text-xs px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                            <Star className="w-3 h-3" fill="currentColor" />
                            Featured
                          </div>
                        )}
                      </div>
                      
                      {/* Info */}
                      <div className="flex-1 p-3 flex flex-col justify-between">
                        <div>
                          <span className="inline-block px-2 py-0.5 bg-purple-600/30 text-purple-300 text-xs rounded-full mb-1">
                            {video.tag}
                          </span>
                          <h3 className="text-white text-sm font-medium truncate">
                            {video.title || video.tag}
                          </h3>
                        </div>
                        
                        <button
                          onClick={() => handleDeleteVideo(video.id)}
                          className="self-end p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Tips */}
            <div className="mt-6 bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
              <h3 className="text-purple-300 font-medium text-sm mb-2">Tips for best results:</h3>
              <ul className="text-purple-200/70 text-sm space-y-1">
                <li>• Use unlisted or public YouTube videos</li>
                <li>• Label videos with appropriate tags (SDE, Ceremony, etc.)</li>
                <li>• The first video added will be featured prominently</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideographerUpload;
