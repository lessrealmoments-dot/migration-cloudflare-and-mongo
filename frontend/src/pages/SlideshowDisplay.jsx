import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Maximize, Minimize, Pause, Play, Camera } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Helper to get the correct image URL (handles both CDN and local URLs)
const getImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `${BACKEND_URL}${url}`;
};

// Calculate poll interval based on photo count
const getPollInterval = (photoCount) => {
  if (photoCount < 10) return 10000;
  if (photoCount < 20) return 15000;
  if (photoCount < 30) return 20000;
  if (photoCount <= 50) return 30000;
  return 45000;
};

// Preload an image
const preloadImage = (src) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
};

const SlideshowDisplay = () => {
  const { shareLink } = useParams();
  const [searchParams] = useSearchParams();
  const overrideInterval = searchParams.get('interval');
  
  const [displayData, setDisplayData] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isReady, setIsReady] = useState(false);
  
  // For crossfade effect - track displayed image separately
  const [displayedPhoto, setDisplayedPhoto] = useState(null);
  const [fadeIn, setFadeIn] = useState(false);
  
  const containerRef = useRef(null);
  const hideControlsTimer = useRef(null);
  const transitionTimer = useRef(null);
  const pollTimer = useRef(null);
  const lastPhotoCount = useRef(0);
  const preloadedSet = useRef(new Set());
  const photosRef = useRef([]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  const getPhotoUrl = useCallback((photo) => {
    if (!photo) return '';
    
    // Handle different photo sources
    const source = photo.source || 'upload';
    
    if (source === 'pcloud') {
      // pCloud photos use our proxy endpoint - needs BACKEND_URL prefix
      const url = photo.url || photo.thumbnail_medium_url || photo.thumbnail_url;
      if (url && url.startsWith('/api/')) {
        return `${BACKEND_URL}${url}`;
      }
      return getImageUrl(url);
    }
    
    if (source === 'gdrive') {
      // Google Drive photos use direct Google URLs (already absolute)
      return photo.url || photo.thumbnail_medium_url || photo.thumbnail_url;
    }
    
    // Regular uploaded photos
    return getImageUrl(photo.url);
  }, []);

  // Preload next N photos
  const preloadAhead = useCallback((fromIndex, count = 5) => {
    const currentPhotos = photosRef.current;
    if (currentPhotos.length === 0) return;
    
    for (let i = 0; i < count; i++) {
      const idx = (fromIndex + i) % currentPhotos.length;
      const photo = currentPhotos[idx];
      if (photo && !preloadedSet.current.has(photo.id)) {
        preloadedSet.current.add(photo.id);
        preloadImage(getPhotoUrl(photo));
      }
    }
  }, [getPhotoUrl]);

  // Fetch display data
  const fetchDisplayData = useCallback(async (isPolling = false) => {
    try {
      const response = await fetch(`${API}/display/${shareLink}`);
      if (!response.ok) throw new Error('Gallery not found');
      const data = await response.json();
      
      setDisplayData(data);
      
      const newPhotoCount = data.photos.length;
      const previousCount = lastPhotoCount.current;
      
      if (newPhotoCount !== previousCount || !isPolling) {
        if (isPolling && newPhotoCount > previousCount) {
          const existingIds = new Set(photosRef.current.map(p => p.id));
          const newPhotos = data.photos.filter(p => !existingIds.has(p.id));
          if (newPhotos.length > 0) {
            console.log(`[Live] ${newPhotos.length} new photo(s) added`);
            setPhotos(prev => [...prev, ...newPhotos]);
          }
        } else {
          setPhotos(data.photos);
        }
        lastPhotoCount.current = newPhotoCount;
      }
      
      setInitialLoading(false);
    } catch (err) {
      if (!isPolling) {
        setError(err.message);
        setInitialLoading(false);
      }
    }
  }, [shareLink]);

  // Initial load
  useEffect(() => {
    fetchDisplayData();
  }, [fetchDisplayData]);

  // Prepare initial photos
  useEffect(() => {
    if (photos.length === 0 || isReady) return;
    
    const prepare = async () => {
      const batch = photos.slice(0, Math.min(5, photos.length));
      await Promise.all(batch.map(photo => {
        preloadedSet.current.add(photo.id);
        return preloadImage(getPhotoUrl(photo));
      }));
      
      setDisplayedPhoto(photos[0]);
      setFadeIn(true);
      setIsReady(true);
    };
    
    prepare();
  }, [photos, isReady, getPhotoUrl]);

  // Handle photo transitions
  useEffect(() => {
    if (!isReady || photos.length === 0) return;
    
    const currentPhoto = photos[currentIndex];
    if (displayedPhoto?.id !== currentPhoto?.id) {
      // Fade out then change photo
      setFadeIn(false);
      
      setTimeout(() => {
        setDisplayedPhoto(currentPhoto);
        setFadeIn(true);
      }, 300); // Short fade out duration
    }
    
    // Preload ahead
    preloadAhead(currentIndex + 1, 5);
  }, [currentIndex, isReady, photos, displayedPhoto, preloadAhead]);

  // Auto-advance
  useEffect(() => {
    if (isPaused || photos.length <= 1 || !isReady) return;
    
    const interval = (overrideInterval ? parseInt(overrideInterval) : displayData?.display_interval) || 6;
    
    transitionTimer.current = setTimeout(() => {
      setCurrentIndex(prev => (prev + 1) % photos.length);
    }, interval * 1000);
    
    return () => clearTimeout(transitionTimer.current);
  }, [currentIndex, isPaused, photos.length, displayData?.display_interval, overrideInterval, isReady]);

  // Poll for new photos
  useEffect(() => {
    if (photos.length === 0) return;
    
    pollTimer.current = setInterval(() => {
      fetchDisplayData(true);
    }, getPollInterval(photos.length));
    
    return () => clearInterval(pollTimer.current);
  }, [photos.length, fetchDisplayData]);

  // Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Hide controls
  const handleMouseMove = () => {
    setShowControls(true);
    clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => setShowControls(false), 3000);
  };

  useEffect(() => {
    return () => clearTimeout(hideControlsTimer.current);
  }, []);

  if (initialLoading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-6" />
          <div className="text-white/80 text-xl font-light">Loading gallery...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-white text-xl">{error}</div>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center" data-testid="waiting-screen">
        <div className="text-center">
          <div className="w-24 h-24 border-2 border-white/10 rounded-full flex items-center justify-center mx-auto mb-8">
            <Camera className="w-12 h-12 text-white/40" />
          </div>
          <h1 className="text-white text-3xl font-light mb-4">
            {displayData?.event_title || displayData?.title || 'Gallery'}
          </h1>
          <p className="text-white/50 text-lg">Waiting for photos to be uploaded...</p>
          <p className="text-white/30 text-sm mt-4">Photos will appear automatically</p>
        </div>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center" data-testid="preparing-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-6" />
          <h1 className="text-white text-2xl font-light mb-2">
            {displayData?.event_title || displayData?.title}
          </h1>
          <p className="text-white/50">Preparing photos for smooth viewing...</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 bg-black overflow-hidden cursor-none"
      onMouseMove={handleMouseMove}
      onClick={() => setIsPaused(!isPaused)}
      data-testid="slideshow-display"
    >
      {/* Single photo with fade transition */}
      <div className="absolute inset-0 flex items-center justify-center">
        {displayedPhoto && (
          <img
            src={getPhotoUrl(displayedPhoto)}
            alt=""
            className="max-w-full max-h-full object-contain transition-opacity duration-700 ease-in-out"
            style={{ 
              maxWidth: '100vw', 
              maxHeight: '100vh',
              opacity: fadeIn ? 1 : 0
            }}
            draggable={false}
          />
        )}
      </div>

      {/* Controls */}
      <div 
        className={`absolute inset-0 z-50 transition-opacity duration-500 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Top */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/60 to-transparent p-8 pb-20">
          <h1 className="text-white text-3xl font-light tracking-wide">
            {displayData?.event_title || displayData?.title}
          </h1>
          {displayData?.photographer_name && (
            <p className="text-white/60 text-sm mt-2">by {displayData.photographer_name}</p>
          )}
        </div>

        {/* Bottom */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-8 pt-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <button
                onClick={(e) => { e.stopPropagation(); setIsPaused(!isPaused); }}
                className="text-white/70 hover:text-white p-2 transition-colors"
              >
                {isPaused ? <Play className="w-8 h-8" /> : <Pause className="w-8 h-8" />}
              </button>
              <span className="text-white/70 text-lg font-light">
                {currentIndex + 1} / {photos.length}
              </span>
            </div>
            
            <button
              onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
              className="text-white/70 hover:text-white p-2 transition-colors"
            >
              {isFullscreen ? <Minimize className="w-8 h-8" /> : <Maximize className="w-8 h-8" />}
            </button>
          </div>
          
          <div className="mt-6 h-0.5 bg-white/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-white/60 rounded-full transition-all duration-500"
              style={{ width: `${((currentIndex + 1) / photos.length) * 100}%` }}
            />
          </div>
        </div>

        {isPaused && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <div className="bg-black/30 backdrop-blur-sm rounded-full p-8">
              <Pause className="w-16 h-16 text-white/80" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SlideshowDisplay;
