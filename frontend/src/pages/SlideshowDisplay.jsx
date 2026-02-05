import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Maximize, Minimize, Pause, Play, Camera } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Calculate poll interval based on photo count
const getPollInterval = (photoCount) => {
  if (photoCount < 10) return 10000;       // 10 seconds - check frequently for new uploads
  if (photoCount < 20) return 15000;       // 15 seconds
  if (photoCount < 30) return 20000;       // 20 seconds
  if (photoCount <= 50) return 30000;      // 30 seconds
  return 45000;                            // 45 seconds for 50+
};

// Preload an image - returns promise that resolves when loaded
const preloadImage = (src) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false); // Don't reject, just mark as failed
    img.src = src;
  });
};

const SlideshowDisplay = () => {
  const { shareLink } = useParams();
  const [searchParams] = useSearchParams();
  const overrideTransition = searchParams.get('transition');
  const overrideInterval = searchParams.get('interval');
  
  const [displayData, setDisplayData] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isReady, setIsReady] = useState(false); // Ready to start slideshow
  
  const containerRef = useRef(null);
  const hideControlsTimer = useRef(null);
  const transitionTimer = useRef(null);
  const pollTimer = useRef(null);
  const lastPhotoCount = useRef(0);
  const preloadedSet = useRef(new Set()); // Track which photos are preloaded
  const photosRef = useRef([]); // Keep photos in ref for callbacks

  // Update ref when photos change
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  // Get photo URL
  const getPhotoUrl = useCallback((photo) => {
    if (!photo) return '';
    return `${BACKEND_URL}${photo.url}`;
  }, []);

  // Preload next N photos from current index
  const preloadAhead = useCallback(async (fromIndex, count = 5) => {
    const currentPhotos = photosRef.current;
    if (currentPhotos.length === 0) return;
    
    const toPreload = [];
    for (let i = 0; i < count; i++) {
      const idx = (fromIndex + i) % currentPhotos.length;
      const photo = currentPhotos[idx];
      if (photo && !preloadedSet.current.has(photo.id)) {
        toPreload.push(photo);
        preloadedSet.current.add(photo.id);
      }
    }
    
    // Preload in parallel, don't wait
    toPreload.forEach(photo => {
      preloadImage(getPhotoUrl(photo));
    });
  }, [getPhotoUrl]);

  // Fetch display data - handles new photos seamlessly
  const fetchDisplayData = useCallback(async (isPolling = false) => {
    try {
      const response = await fetch(`${API}/display/${shareLink}`);
      if (!response.ok) throw new Error('Gallery not found');
      const data = await response.json();
      
      setDisplayData(data);
      
      const newPhotoCount = data.photos.length;
      const previousCount = lastPhotoCount.current;
      
      // Always update photos - new ones get added to the end of rotation
      if (newPhotoCount !== previousCount || !isPolling) {
        // Merge new photos - keep existing order, append new ones
        if (isPolling && newPhotoCount > previousCount) {
          // New photos detected during live event
          const existingIds = new Set(photosRef.current.map(p => p.id));
          const newPhotos = data.photos.filter(p => !existingIds.has(p.id));
          
          if (newPhotos.length > 0) {
            console.log(`[Live] ${newPhotos.length} new photo(s) added to queue`);
            setPhotos(prev => [...prev, ...newPhotos]);
          }
        } else {
          // Initial load or full refresh
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

  // Prepare initial photos and start slideshow
  useEffect(() => {
    if (photos.length === 0 || isReady) return;
    
    // Preload first 5 photos before starting
    const prepareSlideshow = async () => {
      const initialBatch = photos.slice(0, Math.min(5, photos.length));
      
      await Promise.all(
        initialBatch.map(photo => {
          preloadedSet.current.add(photo.id);
          return preloadImage(getPhotoUrl(photo));
        })
      );
      
      // Ready to start
      setIsReady(true);
    };
    
    prepareSlideshow();
  }, [photos, isReady, getPhotoUrl]);

  // Preload ahead as we navigate
  useEffect(() => {
    if (!isReady || photos.length === 0) return;
    
    // Preload 5 photos ahead of current
    preloadAhead(currentIndex + 1, 5);
  }, [currentIndex, isReady, photos.length, preloadAhead]);

  // Dynamic poll interval for new photos
  useEffect(() => {
    if (photos.length === 0) return;
    
    const pollInterval = getPollInterval(photos.length);
    
    pollTimer.current = setInterval(() => {
      fetchDisplayData(true);
    }, pollInterval);
    
    return () => clearInterval(pollTimer.current);
  }, [photos.length, fetchDisplayData]);

  // Auto-advance slideshow
  useEffect(() => {
    if (isPaused || photos.length <= 1 || !isReady) return;
    
    const interval = (overrideInterval ? parseInt(overrideInterval) : displayData?.display_interval) || 6;
    
    transitionTimer.current = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % photos.length);
    }, interval * 1000);
    
    return () => clearTimeout(transitionTimer.current);
  }, [currentIndex, isPaused, photos.length, displayData?.display_interval, overrideInterval, isReady]);

  // Fullscreen handling
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Hide controls after inactivity
  const handleMouseMove = () => {
    setShowControls(true);
    clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  useEffect(() => {
    return () => clearTimeout(hideControlsTimer.current);
  }, []);

  const transition = overrideTransition || displayData?.display_transition || 'crossfade';

  // Get transition CSS
  const getTransitionStyle = (type) => {
    switch (type) {
      case 'fade-zoom':
        return { transition: 'opacity 1.2s ease-in-out, transform 1.2s ease-in-out' };
      case 'slide':
        return { transition: 'opacity 0.8s ease-in-out, transform 0.8s ease-in-out' };
      default: // crossfade
        return { transition: 'opacity 1.2s ease-in-out' };
    }
  };

  // Initial loading - fetching gallery data
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

  // Empty gallery - waiting for uploads
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

  // Preparing photos for smooth viewing
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
      {/* Single image display with crossfade transition */}
      <div className="absolute inset-0 flex items-center justify-center">
        <img
          key={photos[currentIndex]?.id}
          src={getPhotoUrl(photos[currentIndex])}
          alt=""
          className="max-w-full max-h-full object-contain animate-fadeIn"
          style={{ 
            maxWidth: '100vw', 
            maxHeight: '100vh',
            animation: 'fadeIn 1s ease-in-out'
          }}
          draggable={false}
        />
      </div>
      
      {/* CSS for fade animation */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      {/* Controls Overlay - Clean, minimal */}
      <div 
        className={`absolute inset-0 z-50 transition-opacity duration-500 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Top bar - Event info */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/60 to-transparent p-8 pb-20">
          <h1 className="text-white text-3xl font-light tracking-wide">
            {displayData?.event_title || displayData?.title}
          </h1>
          {displayData?.photographer_name && (
            <p className="text-white/60 text-sm mt-2">by {displayData.photographer_name}</p>
          )}
        </div>

        {/* Bottom bar - Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-8 pt-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <button
                onClick={(e) => { e.stopPropagation(); setIsPaused(!isPaused); }}
                className="text-white/70 hover:text-white p-2 transition-colors"
                data-testid="play-pause-btn"
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
              data-testid="fullscreen-btn"
            >
              {isFullscreen ? <Minimize className="w-8 h-8" /> : <Maximize className="w-8 h-8" />}
            </button>
          </div>
          
          {/* Progress bar */}
          <div className="mt-6 h-0.5 bg-white/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-white/60 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${((currentIndex + 1) / photos.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Pause indicator */}
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
