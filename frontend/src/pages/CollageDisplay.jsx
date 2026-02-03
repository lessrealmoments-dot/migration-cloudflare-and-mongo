import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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

// Tile layout configuration for 16:9 aspect ratio
const TILE_LAYOUT = [
  { x: 0, y: 0, w: 25, h: 50 },
  { x: 25, y: 0, w: 25, h: 33.33 },
  { x: 50, y: 0, w: 25, h: 40 },
  { x: 75, y: 0, w: 25, h: 50 },
  { x: 25, y: 33.33, w: 25, h: 33.33 },
  { x: 50, y: 40, w: 25, h: 30 },
  { x: 0, y: 50, w: 33.33, h: 50 },
  { x: 33.33, y: 66.66, w: 16.67, h: 33.34 },
  { x: 50, y: 70, w: 25, h: 30 },
  { x: 75, y: 50, w: 25, h: 50 },
  { x: 33.33, y: 50, w: 16.67, h: 16.66 },
];

// Transition types
const TRANSITIONS = ['crossfade', 'fade-zoom', 'slide-up'];

const CollageDisplay = () => {
  const { shareLink } = useParams();
  const [searchParams] = useSearchParams();
  
  const [displayData, setDisplayData] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [tilePhotos, setTilePhotos] = useState([]);
  const [tileTransitions, setTileTransitions] = useState([]);
  const [isPaused, setIsPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const containerRef = useRef(null);
  const hideControlsTimer = useRef(null);
  const tileTimers = useRef({});
  const pollTimer = useRef(null);
  const photoPoolIndex = useRef(0);
  const lastPhotoCount = useRef(0);

  const layout = TILE_LAYOUT;

  // Fetch display data
  const fetchDisplayData = useCallback(async (isPolling = false) => {
    try {
      const response = await fetch(`${API}/display/${shareLink}`);
      if (!response.ok) throw new Error('Gallery not found');
      const data = await response.json();
      
      setDisplayData(data);
      
      if (data.photos.length > 0) {
        const photosChanged = data.photos.length !== lastPhotoCount.current;
        
        if (photosChanged || !isPolling) {
          // Shuffle photos
          const shuffled = [...data.photos].sort(() => Math.random() - 0.5);
          setPhotos(shuffled);
          lastPhotoCount.current = data.photos.length;
          
          // Initialize tiles only on first load
          if (!isPolling && tilePhotos.length === 0) {
            initializeTiles(shuffled);
          }
        }
      }
      
      setLoading(false);
    } catch (err) {
      if (!isPolling) {
        setError(err.message);
        setLoading(false);
      }
    }
  }, [shareLink, tilePhotos.length]);

  // Initialize tiles with photos
  const initializeTiles = (photoList) => {
    const tiles = [];
    const transitions = [];
    
    for (let i = 0; i < layout.length; i++) {
      tiles.push({
        current: photoList[i % photoList.length],
        next: null,
        isTransitioning: false,
      });
      transitions.push(TRANSITIONS[Math.floor(Math.random() * TRANSITIONS.length)]);
    }
    
    setTilePhotos(tiles);
    setTileTransitions(transitions);
    photoPoolIndex.current = layout.length;
  };

  // Update a single tile with smooth transition
  const updateTile = useCallback((tileIndex) => {
    if (isPaused || photos.length === 0) return;
    
    const nextPhoto = photos[photoPoolIndex.current % photos.length];
    photoPoolIndex.current++;
    
    // Start transition - show next image
    setTilePhotos(prev => {
      const newTiles = [...prev];
      if (newTiles[tileIndex]) {
        newTiles[tileIndex] = {
          ...newTiles[tileIndex],
          next: nextPhoto,
          isTransitioning: true,
        };
      }
      return newTiles;
    });
    
    // Complete transition after animation (900ms)
    setTimeout(() => {
      setTilePhotos(prev => {
        const newTiles = [...prev];
        if (newTiles[tileIndex] && newTiles[tileIndex].next) {
          newTiles[tileIndex] = {
            current: newTiles[tileIndex].next,
            next: null,
            isTransitioning: false,
          };
        }
        return newTiles;
      });
    }, 900);
  }, [isPaused, photos]);

  // Schedule tile updates with staggered timing
  const scheduleTileUpdate = useCallback((tileIndex) => {
    if (tileTimers.current[tileIndex]) {
      clearTimeout(tileTimers.current[tileIndex]);
    }
    
    // Minimum 3 seconds, max 6 seconds between updates
    const delay = 3000 + Math.random() * 3000;
    
    tileTimers.current[tileIndex] = setTimeout(() => {
      if (!isPaused) {
        updateTile(tileIndex);
      }
      scheduleTileUpdate(tileIndex);
    }, delay);
  }, [isPaused, updateTile]);

  // Initial load
  useEffect(() => {
    fetchDisplayData();
  }, []);

  // Dynamic poll interval based on photo count
  useEffect(() => {
    if (photos.length === 0) return;
    
    const pollInterval = getPollInterval(photos.length);
    console.log(`Collage: Polling interval set to ${pollInterval / 1000}s for ${photos.length} photos`);
    
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
    }
    
    pollTimer.current = setInterval(() => {
      fetchDisplayData(true);
    }, pollInterval);
    
    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
      }
    };
  }, [photos.length, fetchDisplayData]);

  // Start tile update timers after initialization
  useEffect(() => {
    if (tilePhotos.length === 0 || isPaused) return;
    
    // Clear all existing timers
    Object.values(tileTimers.current).forEach(timer => clearTimeout(timer));
    tileTimers.current = {};
    
    // Start updates for each tile with staggered initial delays
    tilePhotos.forEach((_, index) => {
      // Initial delay: stagger by 500ms + random 0-2s
      const initialDelay = index * 500 + Math.random() * 2000;
      
      setTimeout(() => {
        scheduleTileUpdate(index);
      }, initialDelay);
    });
    
    return () => {
      Object.values(tileTimers.current).forEach(timer => clearTimeout(timer));
    };
  }, [tilePhotos.length, isPaused, scheduleTileUpdate]);

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

  // Get transition styles for a tile
  const getTileTransitionStyle = (tile, transitionType) => {
    const baseStyle = {
      transition: 'opacity 0.9s cubic-bezier(0.4, 0, 0.2, 1), transform 0.9s cubic-bezier(0.4, 0, 0.2, 1)',
    };
    
    if (!tile.isTransitioning) {
      return { ...baseStyle, opacity: 1, transform: 'scale(1) translateY(0)' };
    }
    
    switch (transitionType) {
      case 'fade-zoom':
        return { ...baseStyle, opacity: 0, transform: 'scale(1.1)' };
      case 'slide-up':
        return { ...baseStyle, opacity: 0, transform: 'translateY(20px)' };
      default: // crossfade
        return { ...baseStyle, opacity: 0, transform: 'scale(1)' };
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
      className="fixed inset-0 bg-black overflow-hidden"
      onMouseMove={handleMouseMove}
      data-testid="collage-display"
    >
      {/* 16:9 Container */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div 
          className="relative bg-black"
          style={{
            width: '100vw',
            height: 'calc(100vw * 9 / 16)',
            maxHeight: '100vh',
            maxWidth: 'calc(100vh * 16 / 9)'
          }}
        >
          {/* Tiles */}
          {layout.map((tile, index) => {
            const tileData = tilePhotos[index];
            const transitionType = tileTransitions[index] || 'crossfade';
            
            if (!tileData?.current) return null;
            
            return (
              <div
                key={index}
                className="absolute overflow-hidden"
                style={{
                  left: `${tile.x}%`,
                  top: `${tile.y}%`,
                  width: `${tile.w}%`,
                  height: `${tile.h}%`,
                  padding: '2px'
                }}
              >
                <div className="relative w-full h-full overflow-hidden rounded-sm bg-zinc-900">
                  {/* Current image */}
                  <img
                    src={`${BACKEND_URL}${tileData.current.url}`}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    style={getTileTransitionStyle(tileData, transitionType)}
                  />
                  
                  {/* Next image (during transition) */}
                  {tileData.isTransitioning && tileData.next && (
                    <img
                      src={`${BACKEND_URL}${tileData.next.url}`}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{
                        opacity: 1,
                        transform: 'scale(1)',
                        transition: 'opacity 0.9s cubic-bezier(0.4, 0, 0.2, 1)',
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Controls Overlay */}
      <div 
        className={`absolute inset-0 z-50 transition-opacity duration-500 pointer-events-none ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Top bar - Event info */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-8 pb-24">
          <h1 className="text-white text-3xl font-light tracking-wide">
            {displayData?.event_title || displayData?.title}
          </h1>
          {displayData?.photographer_name && (
            <p className="text-white/70 text-sm mt-2">by {displayData.photographer_name}</p>
          )}
        </div>

        {/* Bottom bar - Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-8 pt-24 pointer-events-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <button
                onClick={() => setIsPaused(!isPaused)}
                className="text-white/80 hover:text-white p-2 transition-colors"
                data-testid="play-pause-btn"
              >
                {isPaused ? <Play className="w-8 h-8" /> : <Pause className="w-8 h-8" />}
              </button>
              <span className="text-white/80 text-lg font-light">
                {photos.length} photos
              </span>
            </div>
            
            <button
              onClick={toggleFullscreen}
              className="text-white/80 hover:text-white p-2 transition-colors"
              data-testid="fullscreen-btn"
            >
              {isFullscreen ? <Minimize className="w-8 h-8" /> : <Maximize className="w-8 h-8" />}
            </button>
          </div>
        </div>
      </div>

      {/* Pause indicator */}
      {isPaused && showControls && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-50">
          <div className="bg-black/40 backdrop-blur-md rounded-full p-8">
            <Pause className="w-16 h-16 text-white/90" />
          </div>
        </div>
      )}
    </div>
  );
};

export default CollageDisplay;
