import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Maximize, Minimize, Pause, Play } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Calculate poll interval based on photo count
const getPollInterval = (photoCount) => {
  if (photoCount < 10) return 15000;      // 15 seconds
  if (photoCount < 20) return 30000;      // 30 seconds
  if (photoCount < 30) return 60000;      // 1 minute
  if (photoCount <= 50) return 120000;    // 2 minutes
  return 180000;                           // 3 minutes for 50+
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [imageLoaded, setImageLoaded] = useState([false, false]); // Track if current and next images are loaded
  
  const containerRef = useRef(null);
  const hideControlsTimer = useRef(null);
  const transitionTimer = useRef(null);
  const pollTimer = useRef(null);
  const lastPhotoCount = useRef(0);

  // Fetch display data
  const fetchDisplayData = useCallback(async (isPolling = false) => {
    try {
      const response = await fetch(`${API}/display/${shareLink}`);
      if (!response.ok) throw new Error('Gallery not found');
      const data = await response.json();
      
      setDisplayData(data);
      
      // Only update photos if count changed (new photos added)
      if (data.photos.length !== lastPhotoCount.current || !isPolling) {
        setPhotos(data.photos);
        lastPhotoCount.current = data.photos.length;
        
        if (isPolling && data.photos.length > lastPhotoCount.current) {
          console.log(`New photos detected: ${data.photos.length - lastPhotoCount.current} added`);
        }
      }
      
      setLoading(false);
    } catch (err) {
      if (!isPolling) {
        setError(err.message);
        setLoading(false);
      }
    }
  }, [shareLink]);

  // Initial load
  useEffect(() => {
    fetchDisplayData();
  }, [fetchDisplayData]);

  // Dynamic poll interval based on photo count
  useEffect(() => {
    if (photos.length === 0) return;
    
    const pollInterval = getPollInterval(photos.length);
    console.log(`Polling interval set to ${pollInterval / 1000}s for ${photos.length} photos`);
    
    pollTimer.current = setInterval(() => {
      fetchDisplayData(true);
    }, pollInterval);
    
    return () => clearInterval(pollTimer.current);
  }, [photos.length, fetchDisplayData]);

  // Auto-advance slideshow with smooth transition
  useEffect(() => {
    if (isPaused || photos.length <= 1) return;
    
    const interval = (overrideInterval ? parseInt(overrideInterval) : displayData?.display_interval) || 6;
    
    transitionTimer.current = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % photos.length);
    }, interval * 1000);
    
    return () => clearTimeout(transitionTimer.current);
  }, [currentIndex, isPaused, photos.length, displayData?.display_interval, overrideInterval]);

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
    return () => {
      clearTimeout(hideControlsTimer.current);
    };
  }, []);

  // Preload images
  useEffect(() => {
    if (photos.length === 0) return;
    
    // Preload next 3 images
    for (let i = 1; i <= 3; i++) {
      const idx = (currentIndex + i) % photos.length;
      const img = new Image();
      img.src = `${BACKEND_URL}${photos[idx]?.url}`;
    }
  }, [currentIndex, photos]);

  const transition = overrideTransition || displayData?.display_transition || 'crossfade';

  // Get transition CSS based on type
  const getTransitionStyle = (type) => {
    switch (type) {
      case 'fade-zoom':
        return {
          transition: 'opacity 1.2s cubic-bezier(0.4, 0, 0.2, 1), transform 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
        };
      case 'slide':
        return {
          transition: 'opacity 1s cubic-bezier(0.4, 0, 0.2, 1), transform 1s cubic-bezier(0.4, 0, 0.2, 1)',
        };
      case 'flip':
        return {
          transition: 'opacity 1s cubic-bezier(0.4, 0, 0.2, 1), transform 1s cubic-bezier(0.4, 0, 0.2, 1)',
        };
      default: // crossfade
        return {
          transition: 'opacity 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
        };
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-white text-xl">Loading display...</div>
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
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <h1 className="text-3xl font-light mb-4">{displayData?.title || 'Gallery'}</h1>
          <p className="text-zinc-400">No photos yet. Photos will appear as they are uploaded.</p>
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
      {/* Image Container - Stack all images and fade between them */}
      <div className="absolute inset-0">
        {photos.map((photo, index) => {
          const isActive = index === currentIndex;
          const isPrev = index === (currentIndex - 1 + photos.length) % photos.length;
          
          return (
            <div
              key={photo.id}
              className="absolute inset-0 flex items-center justify-center"
              style={{
                ...getTransitionStyle(transition),
                opacity: isActive ? 1 : 0,
                transform: transition === 'fade-zoom' 
                  ? (isActive ? 'scale(1)' : 'scale(1.05)') 
                  : transition === 'slide'
                    ? (isActive ? 'translateX(0)' : (isPrev ? 'translateX(-100%)' : 'translateX(100%)'))
                    : 'none',
                zIndex: isActive ? 10 : (isPrev ? 5 : 1),
                pointerEvents: 'none',
              }}
            >
              <img
                src={`${BACKEND_URL}${photo.url}`}
                alt=""
                className="max-w-full max-h-full object-contain"
                style={{ 
                  maxWidth: '100vw', 
                  maxHeight: '100vh',
                }}
                loading={Math.abs(index - currentIndex) <= 2 ? 'eager' : 'lazy'}
              />
            </div>
          );
        })}
      </div>

      {/* Controls Overlay */}
      <div 
        className={`absolute inset-0 z-50 transition-opacity duration-500 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Top bar - Event info */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 via-black/30 to-transparent p-8 pb-20">
          <h1 className="text-white text-3xl font-light tracking-wide">
            {displayData?.event_title || displayData?.title}
          </h1>
          {displayData?.photographer_name && (
            <p className="text-white/70 text-sm mt-2">by {displayData.photographer_name}</p>
          )}
        </div>

        {/* Bottom bar - Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-8 pt-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <button
                onClick={(e) => { e.stopPropagation(); setIsPaused(!isPaused); }}
                className="text-white/80 hover:text-white p-2 transition-colors"
                data-testid="play-pause-btn"
              >
                {isPaused ? <Play className="w-8 h-8" /> : <Pause className="w-8 h-8" />}
              </button>
              <span className="text-white/80 text-lg font-light">
                {currentIndex + 1} / {photos.length}
              </span>
            </div>
            
            <button
              onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
              className="text-white/80 hover:text-white p-2 transition-colors"
              data-testid="fullscreen-btn"
            >
              {isFullscreen ? <Minimize className="w-8 h-8" /> : <Maximize className="w-8 h-8" />}
            </button>
          </div>
          
          {/* Progress bar */}
          <div className="mt-6 h-1 bg-white/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-white/70 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${((currentIndex + 1) / photos.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Pause indicator */}
        {isPaused && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <div className="bg-black/40 backdrop-blur-md rounded-full p-8">
              <Pause className="w-16 h-16 text-white/90" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SlideshowDisplay;
