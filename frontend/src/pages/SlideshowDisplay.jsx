import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Maximize, Minimize, Settings, X, Play, Pause } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Transition styles
const transitions = {
  crossfade: {
    enter: 'opacity-0',
    enterActive: 'opacity-100 transition-opacity duration-1000 ease-in-out',
    exit: 'opacity-100',
    exitActive: 'opacity-0 transition-opacity duration-1000 ease-in-out'
  },
  'fade-zoom': {
    enter: 'opacity-0 scale-105',
    enterActive: 'opacity-100 scale-100 transition-all duration-1000 ease-in-out',
    exit: 'opacity-100 scale-100',
    exitActive: 'opacity-0 scale-95 transition-all duration-1000 ease-in-out'
  },
  slide: {
    enter: 'opacity-0 translate-x-full',
    enterActive: 'opacity-100 translate-x-0 transition-all duration-1000 ease-in-out',
    exit: 'opacity-100 translate-x-0',
    exitActive: 'opacity-0 -translate-x-full transition-all duration-1000 ease-in-out'
  },
  flip: {
    enter: 'opacity-0 rotateY-90',
    enterActive: 'opacity-100 rotateY-0 transition-all duration-1000 ease-in-out',
    exit: 'opacity-100 rotateY-0',
    exitActive: 'opacity-0 rotateY-90 transition-all duration-1000 ease-in-out'
  }
};

const SlideshowDisplay = () => {
  const { shareLink } = useParams();
  const [searchParams] = useSearchParams();
  const overrideTransition = searchParams.get('transition');
  const overrideInterval = searchParams.get('interval');
  
  const [displayData, setDisplayData] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [nextIndex, setNextIndex] = useState(1);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastPhotoCount, setLastPhotoCount] = useState(0);
  
  const containerRef = useRef(null);
  const hideControlsTimer = useRef(null);
  const transitionTimer = useRef(null);
  const pollTimer = useRef(null);

  // Fetch display data
  const fetchDisplayData = useCallback(async (isPolling = false) => {
    try {
      const response = await fetch(`${API}/display/${shareLink}`);
      if (!response.ok) throw new Error('Gallery not found');
      const data = await response.json();
      
      setDisplayData(data);
      
      // Only update photos if count changed (new photos added)
      if (data.photos.length !== lastPhotoCount || !isPolling) {
        setPhotos(data.photos);
        setLastPhotoCount(data.photos.length);
        
        // If new photos added during display, keep showing but include new ones
        if (isPolling && data.photos.length > lastPhotoCount) {
          console.log(`New photos detected: ${data.photos.length - lastPhotoCount} added`);
        }
      }
      
      setLoading(false);
    } catch (err) {
      if (!isPolling) {
        setError(err.message);
        setLoading(false);
      }
    }
  }, [shareLink, lastPhotoCount]);

  // Initial load
  useEffect(() => {
    fetchDisplayData();
  }, [fetchDisplayData]);

  // Poll for new photos every 30 seconds
  useEffect(() => {
    pollTimer.current = setInterval(() => {
      fetchDisplayData(true);
    }, 30000);
    
    return () => clearInterval(pollTimer.current);
  }, [fetchDisplayData]);

  // Auto-advance slideshow
  useEffect(() => {
    if (isPaused || photos.length <= 1 || isTransitioning) return;
    
    const interval = (overrideInterval ? parseInt(overrideInterval) : displayData?.display_interval) || 6;
    
    transitionTimer.current = setTimeout(() => {
      setIsTransitioning(true);
      setNextIndex((currentIndex + 1) % photos.length);
      
      // Complete transition after animation
      setTimeout(() => {
        setCurrentIndex((currentIndex + 1) % photos.length);
        setIsTransitioning(false);
      }, 1000);
    }, interval * 1000);
    
    return () => clearTimeout(transitionTimer.current);
  }, [currentIndex, isPaused, photos.length, isTransitioning, displayData?.display_interval, overrideInterval]);

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

  // Preload next images
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
      {/* Current Image */}
      <div 
        className={`absolute inset-0 flex items-center justify-center ${
          isTransitioning ? 'z-0' : 'z-10'
        }`}
      >
        <img
          src={`${BACKEND_URL}${photos[currentIndex]?.url}`}
          alt=""
          className={`max-w-full max-h-full object-contain ${
            isTransitioning 
              ? `${transitions[transition]?.exitActive}` 
              : 'opacity-100'
          }`}
          style={{ 
            maxWidth: '100vw', 
            maxHeight: '100vh',
            transition: 'all 1s ease-in-out'
          }}
        />
      </div>

      {/* Next Image (for transition) */}
      {isTransitioning && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <img
            src={`${BACKEND_URL}${photos[nextIndex]?.url}`}
            alt=""
            className={`max-w-full max-h-full object-contain ${transitions[transition]?.enterActive}`}
            style={{ 
              maxWidth: '100vw', 
              maxHeight: '100vh',
              transition: 'all 1s ease-in-out'
            }}
          />
        </div>
      )}

      {/* Controls Overlay */}
      <div 
        className={`absolute inset-0 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Top bar - Event info */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/60 to-transparent p-6">
          <h1 className="text-white text-2xl font-light">
            {displayData?.event_title || displayData?.title}
          </h1>
          {displayData?.photographer_name && (
            <p className="text-white/70 text-sm mt-1">by {displayData.photographer_name}</p>
          )}
        </div>

        {/* Bottom bar - Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={(e) => { e.stopPropagation(); setIsPaused(!isPaused); }}
                className="text-white/80 hover:text-white p-2"
                data-testid="play-pause-btn"
              >
                {isPaused ? <Play className="w-6 h-6" /> : <Pause className="w-6 h-6" />}
              </button>
              <span className="text-white/60 text-sm">
                {currentIndex + 1} / {photos.length}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                className="text-white/80 hover:text-white p-2"
                data-testid="fullscreen-btn"
              >
                {isFullscreen ? <Minimize className="w-6 h-6" /> : <Maximize className="w-6 h-6" />}
              </button>
            </div>
          </div>
          
          {/* Progress bar */}
          <div className="mt-4 h-1 bg-white/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-white/60 transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / photos.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Pause indicator */}
        {isPaused && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="bg-black/50 backdrop-blur-sm rounded-full p-6">
              <Pause className="w-12 h-12 text-white" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SlideshowDisplay;
