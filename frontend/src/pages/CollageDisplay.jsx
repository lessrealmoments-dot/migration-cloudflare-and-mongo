import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Maximize, Minimize, Pause, Play } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Tile layout configuration for 16:9 aspect ratio
// Each tile has: x, y (percentage), width, height (percentage), size category
const TILE_LAYOUTS = [
  // Layout 1: Mixed sizes - 12 tiles
  [
    { x: 0, y: 0, w: 25, h: 50, size: 'large' },
    { x: 25, y: 0, w: 25, h: 25, size: 'medium' },
    { x: 50, y: 0, w: 25, h: 33.33, size: 'medium' },
    { x: 75, y: 0, w: 25, h: 50, size: 'large' },
    { x: 25, y: 25, w: 25, h: 25, size: 'small' },
    { x: 50, y: 33.33, w: 25, h: 33.33, size: 'medium' },
    { x: 0, y: 50, w: 33.33, h: 50, size: 'large' },
    { x: 33.33, y: 50, w: 16.67, h: 25, size: 'small' },
    { x: 50, y: 66.66, w: 25, h: 33.34, size: 'medium' },
    { x: 75, y: 50, w: 25, h: 50, size: 'large' },
    { x: 33.33, y: 75, w: 16.67, h: 25, size: 'small' },
  ],
  // Layout 2: Grid-like - 15 tiles
  [
    { x: 0, y: 0, w: 20, h: 33.33, size: 'medium' },
    { x: 20, y: 0, w: 30, h: 50, size: 'large' },
    { x: 50, y: 0, w: 25, h: 33.33, size: 'medium' },
    { x: 75, y: 0, w: 25, h: 33.33, size: 'medium' },
    { x: 0, y: 33.33, w: 20, h: 33.33, size: 'small' },
    { x: 50, y: 33.33, w: 25, h: 33.33, size: 'medium' },
    { x: 75, y: 33.33, w: 25, h: 33.33, size: 'medium' },
    { x: 0, y: 66.66, w: 25, h: 33.34, size: 'medium' },
    { x: 25, y: 50, w: 25, h: 50, size: 'large' },
    { x: 50, y: 66.66, w: 25, h: 33.34, size: 'medium' },
    { x: 75, y: 66.66, w: 25, h: 33.34, size: 'medium' },
  ],
];

// Transition options for individual tiles
const tileTransitions = ['crossfade', 'fade-zoom', 'slide-up', 'slide-down'];

const CollageDisplay = () => {
  const { shareLink } = useParams();
  const [searchParams] = useSearchParams();
  
  const [displayData, setDisplayData] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [tilePhotos, setTilePhotos] = useState([]); // Current photo for each tile
  const [tileStates, setTileStates] = useState([]); // Transition state for each tile
  const [isPaused, setIsPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [photoPool, setPhotoPool] = useState([]); // Shuffled pool of photos
  
  const containerRef = useRef(null);
  const hideControlsTimer = useRef(null);
  const tileTimers = useRef([]);
  const pollTimer = useRef(null);
  const photoIndexRef = useRef(0);

  // Select layout based on photo count
  const layout = useMemo(() => {
    return TILE_LAYOUTS[0]; // Use first layout, can be randomized
  }, []);

  // Fetch display data
  const fetchDisplayData = useCallback(async (isPolling = false) => {
    try {
      const response = await fetch(`${API}/display/${shareLink}`);
      if (!response.ok) throw new Error('Gallery not found');
      const data = await response.json();
      
      setDisplayData(data);
      
      if (data.photos.length > 0) {
        // Add new photos to pool
        const newPhotos = data.photos.filter(
          p => !photos.find(existing => existing.id === p.id)
        );
        
        if (newPhotos.length > 0 || !isPolling) {
          setPhotos(data.photos);
          
          // Shuffle photos for variety
          const shuffled = [...data.photos].sort(() => Math.random() - 0.5);
          setPhotoPool(shuffled);
          
          // Initialize tiles if first load
          if (!isPolling) {
            initializeTiles(shuffled, layout.length);
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
  }, [shareLink, photos, layout.length]);

  // Initialize tiles with photos
  const initializeTiles = (photoList, tileCount) => {
    const initialPhotos = [];
    const initialStates = [];
    
    for (let i = 0; i < tileCount; i++) {
      const photoIndex = i % photoList.length;
      initialPhotos.push({
        current: photoList[photoIndex],
        next: null,
        transitioning: false
      });
      initialStates.push({
        transition: tileTransitions[Math.floor(Math.random() * tileTransitions.length)],
        updateInterval: 3000 + Math.random() * 4000 // 3-7 seconds
      });
    }
    
    setTilePhotos(initialPhotos);
    setTileStates(initialStates);
    photoIndexRef.current = tileCount;
  };

  // Update a single tile
  const updateTile = useCallback((tileIndex) => {
    if (isPaused || photos.length === 0) return;
    
    setTilePhotos(prev => {
      const newTilePhotos = [...prev];
      const nextPhotoIndex = photoIndexRef.current % photos.length;
      photoIndexRef.current++;
      
      newTilePhotos[tileIndex] = {
        ...newTilePhotos[tileIndex],
        next: photos[nextPhotoIndex],
        transitioning: true
      };
      
      return newTilePhotos;
    });
    
    // Complete transition after animation
    setTimeout(() => {
      setTilePhotos(prev => {
        const newTilePhotos = [...prev];
        if (newTilePhotos[tileIndex]?.next) {
          newTilePhotos[tileIndex] = {
            current: newTilePhotos[tileIndex].next,
            next: null,
            transitioning: false
          };
        }
        return newTilePhotos;
      });
    }, 800);
  }, [isPaused, photos]);

  // Initial load
  useEffect(() => {
    fetchDisplayData();
  }, []);

  // Poll for new photos every 30 seconds
  useEffect(() => {
    pollTimer.current = setInterval(() => {
      fetchDisplayData(true);
    }, 30000);
    
    return () => clearInterval(pollTimer.current);
  }, [fetchDisplayData]);

  // Start tile update timers
  useEffect(() => {
    if (tileStates.length === 0 || isPaused) return;
    
    // Clear existing timers
    tileTimers.current.forEach(timer => clearTimeout(timer));
    tileTimers.current = [];
    
    // Start staggered updates for each tile
    tileStates.forEach((state, index) => {
      const scheduleUpdate = () => {
        const timer = setTimeout(() => {
          updateTile(index);
          scheduleUpdate(); // Reschedule
        }, state.updateInterval + Math.random() * 2000); // Add randomness
        
        tileTimers.current[index] = timer;
      };
      
      // Initial delay to stagger starts
      setTimeout(scheduleUpdate, index * 300 + Math.random() * 1000);
    });
    
    return () => {
      tileTimers.current.forEach(timer => clearTimeout(timer));
    };
  }, [tileStates, isPaused, updateTile]);

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

  // Get transition classes for a tile
  const getTransitionClasses = (tile, state) => {
    if (!tile.transitioning) return 'opacity-100 scale-100';
    
    switch (state.transition) {
      case 'fade-zoom':
        return 'opacity-0 scale-110';
      case 'slide-up':
        return 'opacity-0 -translate-y-4';
      case 'slide-down':
        return 'opacity-0 translate-y-4';
      default: // crossfade
        return 'opacity-0';
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
            const tilePhoto = tilePhotos[index];
            const tileState = tileStates[index];
            
            if (!tilePhoto?.current) return null;
            
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
                <div className="relative w-full h-full overflow-hidden rounded-sm">
                  {/* Current image */}
                  <img
                    src={`${BACKEND_URL}${tilePhoto.current.url}`}
                    alt=""
                    className={`absolute inset-0 w-full h-full object-cover transition-all duration-700 ease-in-out ${
                      tilePhoto.transitioning ? getTransitionClasses(tilePhoto, tileState) : 'opacity-100 scale-100'
                    }`}
                  />
                  
                  {/* Next image (during transition) */}
                  {tilePhoto.transitioning && tilePhoto.next && (
                    <img
                      src={`${BACKEND_URL}${tilePhoto.next.url}`}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover opacity-100 scale-100 transition-all duration-700 ease-in-out"
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
        className={`absolute inset-0 transition-opacity duration-300 pointer-events-none ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Top bar - Event info */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-6">
          <h1 className="text-white text-2xl font-light">
            {displayData?.event_title || displayData?.title}
          </h1>
          {displayData?.photographer_name && (
            <p className="text-white/70 text-sm mt-1">by {displayData.photographer_name}</p>
          )}
        </div>

        {/* Bottom bar - Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-6 pointer-events-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsPaused(!isPaused)}
                className="text-white/80 hover:text-white p-2"
                data-testid="play-pause-btn"
              >
                {isPaused ? <Play className="w-6 h-6" /> : <Pause className="w-6 h-6" />}
              </button>
              <span className="text-white/60 text-sm">
                {photos.length} photos
              </span>
            </div>
            
            <button
              onClick={toggleFullscreen}
              className="text-white/80 hover:text-white p-2"
              data-testid="fullscreen-btn"
            >
              {isFullscreen ? <Minimize className="w-6 h-6" /> : <Maximize className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Pause indicator */}
      {isPaused && showControls && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="bg-black/50 backdrop-blur-sm rounded-full p-6">
            <Pause className="w-12 h-12 text-white" />
          </div>
        </div>
      )}
    </div>
  );
};

export default CollageDisplay;
