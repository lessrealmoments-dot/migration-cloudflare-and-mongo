import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Maximize, Minimize, Pause, Play, Settings, Loader2 } from 'lucide-react';

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

// Tile layout configuration for 16:9 aspect ratio - 11 tiles
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

// Default interval settings
const DEFAULT_INTERVAL = 7; // seconds
const MIN_INTERVAL = 3;
const MAX_INTERVAL = 15;

// Preload an image and return a promise
const preloadImage = (src) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(src);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
};

const CollageDisplay = () => {
  const { shareLink } = useParams();
  const [searchParams] = useSearchParams();
  
  const [displayData, setDisplayData] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [tilePhotos, setTilePhotos] = useState([]);
  const [isFlipping, setIsFlipping] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showBackSide, setShowBackSide] = useState(false);
  
  // Track loaded images
  const [loadedImages, setLoadedImages] = useState({});
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  
  // Configurable interval (3-15 seconds)
  const urlInterval = searchParams.get('interval');
  const [updateInterval, setUpdateInterval] = useState(
    urlInterval ? Math.max(MIN_INTERVAL, Math.min(MAX_INTERVAL, parseInt(urlInterval))) : DEFAULT_INTERVAL
  );
  
  const containerRef = useRef(null);
  const hideControlsTimer = useRef(null);
  const updateTimer = useRef(null);
  const pollTimer = useRef(null);
  const photoPoolIndex = useRef(0);
  const lastPhotoCount = useRef(0);
  const preloadQueue = useRef(new Set());

  const layout = TILE_LAYOUT;

  // Get photo URL
  const getPhotoUrl = useCallback((photo) => {
    if (!photo) return '';
    // For collage, prefer medium thumbnail for faster loading
    if (photo.thumbnail_medium_url) {
      return `${BACKEND_URL}${photo.thumbnail_medium_url}`;
    }
    return `${BACKEND_URL}${photo.url}`;
  }, []);

  // Preload a batch of photos
  const preloadBatch = useCallback(async (photoList) => {
    const toPreload = photoList.filter(photo => {
      const url = getPhotoUrl(photo);
      return photo && !loadedImages[photo.id] && !preloadQueue.current.has(url);
    });

    await Promise.all(
      toPreload.map(async (photo) => {
        const url = getPhotoUrl(photo);
        preloadQueue.current.add(url);
        try {
          await preloadImage(url);
          setLoadedImages(prev => ({ ...prev, [photo.id]: true }));
        } catch (err) {
          console.warn(`Failed to preload: ${url}`);
        } finally {
          preloadQueue.current.delete(url);
        }
      })
    );
  }, [getPhotoUrl, loadedImages]);

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
  const initializeTiles = async (photoList) => {
    const tiles = [];
    const photosToPreload = [];
    
    for (let i = 0; i < layout.length; i++) {
      const photo = photoList[i % photoList.length];
      tiles.push({
        current: photo,
        next: photoList[(i + layout.length) % photoList.length],
      });
      photosToPreload.push(photo);
    }
    
    // Preload initial photos before showing
    await preloadBatch(photosToPreload);
    
    setTilePhotos(tiles);
    setInitialLoadComplete(true);
    photoPoolIndex.current = layout.length * 2;
  };

  // Update ALL tiles at once with cube flip transition
  const updateAllTiles = useCallback(async () => {
    if (isPaused || photos.length === 0 || isFlipping) return;
    
    // Prepare next photos for ALL tiles
    const nextPhotos = [];
    for (let i = 0; i < layout.length; i++) {
      nextPhotos.push(photos[photoPoolIndex.current % photos.length]);
      photoPoolIndex.current++;
    }
    
    // Preload next batch before flipping
    await preloadBatch(nextPhotos);
    
    // Set next photos on the hidden face
    setTilePhotos(prev => {
      return prev.map((tile, index) => ({
        ...tile,
        next: nextPhotos[index],
      }));
    });
    
    // Small delay to ensure images are set
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Trigger flip animation
    setIsFlipping(true);
    
    // After flip animation completes
    setTimeout(() => {
      setTilePhotos(prev => {
        return prev.map((tile) => ({
          current: tile.next || tile.current,
          next: null,
        }));
      });
      setShowBackSide(prev => !prev);
      setIsFlipping(false);
    }, 850);
  }, [isPaused, photos, layout.length, isFlipping, preloadBatch]);

  // Initial load
  useEffect(() => {
    fetchDisplayData();
  }, []);

  // Dynamic poll interval based on photo count
  useEffect(() => {
    if (photos.length === 0) return;
    
    const pollInterval = getPollInterval(photos.length);
    
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

  // Update timer - triggers ALL tiles update at configurable interval
  useEffect(() => {
    if (tilePhotos.length === 0 || isPaused || !initialLoadComplete) return;
    
    updateTimer.current = setInterval(() => {
      updateAllTiles();
    }, updateInterval * 1000);
    
    return () => {
      if (updateTimer.current) {
        clearInterval(updateTimer.current);
      }
    };
  }, [tilePhotos.length, isPaused, updateInterval, updateAllTiles, initialLoadComplete]);

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

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-white animate-spin mx-auto mb-4" />
          <div className="text-white text-xl">Loading display...</div>
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
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <h1 className="text-3xl font-light mb-4">{displayData?.title || 'Gallery'}</h1>
          <p className="text-zinc-400">No photos yet. Photos will appear as they are uploaded.</p>
        </div>
      </div>
    );
  }

  // Show loading screen while initial photos load
  if (!initialLoadComplete) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-white animate-spin mx-auto mb-4" />
          <div className="text-white text-xl">Preparing photos...</div>
          <div className="text-white/50 text-sm mt-2">
            {Object.values(loadedImages).filter(Boolean).length} / {Math.min(photos.length, layout.length)} loaded
          </div>
        </div>
      </div>
    );
  }

  // Calculate loading progress
  const loadedCount = Object.values(loadedImages).filter(Boolean).length;

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 bg-black overflow-hidden"
      onMouseMove={handleMouseMove}
      data-testid="collage-display"
    >
      {/* CSS for 3D Cube Flip */}
      <style>{`
        .cube-container {
          perspective: 1000px;
          transform-style: preserve-3d;
        }
        .cube-flipper {
          position: relative;
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          transition: transform 0.8s cubic-bezier(0.4, 0.2, 0.2, 1);
        }
        .cube-flipper.flip-to-back {
          transform: rotateY(180deg);
        }
        .cube-flipper.flip-to-front {
          transform: rotateY(0deg);
        }
        .cube-flipper.no-transition {
          transition: none !important;
        }
        .cube-face {
          position: absolute;
          width: 100%;
          height: 100%;
          backface-visibility: hidden;
        }
        .cube-face-back {
          transform: rotateY(180deg);
        }
        .tile-image {
          transition: opacity 0.3s ease-in-out;
        }
        .tile-image.loading {
          opacity: 0.5;
        }
        .tile-image.loaded {
          opacity: 1;
        }
      `}</style>
      
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
            
            if (!tileData?.current) return null;
            
            const flipClass = isFlipping 
              ? (showBackSide ? 'flip-to-front' : 'flip-to-back')
              : (showBackSide ? 'flip-to-back no-transition' : 'flip-to-front no-transition');
            
            const currentLoaded = loadedImages[tileData.current?.id];
            const nextLoaded = tileData.next ? loadedImages[tileData.next?.id] : true;
            
            return (
              <div
                key={index}
                className="absolute cube-container"
                style={{
                  left: `${tile.x}%`,
                  top: `${tile.y}%`,
                  width: `${tile.w}%`,
                  height: `${tile.h}%`,
                  padding: '2px'
                }}
              >
                <div className={`cube-flipper ${flipClass}`}>
                  {/* Front face */}
                  <div className="cube-face rounded-sm overflow-hidden bg-zinc-900">
                    <img
                      src={getPhotoUrl(tileData.current)}
                      alt=""
                      className={`tile-image w-full h-full object-cover ${currentLoaded ? 'loaded' : 'loading'}`}
                      onLoad={() => {
                        if (!loadedImages[tileData.current?.id]) {
                          setLoadedImages(prev => ({ ...prev, [tileData.current.id]: true }));
                        }
                      }}
                    />
                  </div>
                  
                  {/* Back face */}
                  <div className="cube-face cube-face-back rounded-sm overflow-hidden bg-zinc-900">
                    {tileData.next ? (
                      <img
                        src={getPhotoUrl(tileData.next)}
                        alt=""
                        className={`tile-image w-full h-full object-cover ${nextLoaded ? 'loaded' : 'loading'}`}
                        onLoad={() => {
                          if (!loadedImages[tileData.next?.id]) {
                            setLoadedImages(prev => ({ ...prev, [tileData.next.id]: true }));
                          }
                        }}
                      />
                    ) : (
                      <img
                        src={getPhotoUrl(tileData.current)}
                        alt=""
                        className="tile-image w-full h-full object-cover loaded"
                      />
                    )}
                  </div>
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
              <span className="text-white/50 text-sm">
                • {updateInterval}s interval
              </span>
              {loadedCount < photos.length && (
                <span className="text-white/40 text-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {loadedCount}/{photos.length}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="text-white/80 hover:text-white p-2 transition-colors"
                data-testid="settings-btn"
              >
                <Settings className="w-7 h-7" />
              </button>
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
      </div>

      {/* Settings Panel */}
      {showSettings && showControls && (
        <div 
          className="absolute bottom-24 right-8 z-50 bg-black/80 backdrop-blur-md rounded-lg p-6 pointer-events-auto"
          data-testid="settings-panel"
        >
          <h3 className="text-white font-medium mb-4">Display Settings</h3>
          <div className="space-y-4">
            <div>
              <label className="text-white/70 text-sm block mb-2">
                Update Interval: {updateInterval} seconds
              </label>
              <input
                type="range"
                min={MIN_INTERVAL}
                max={MAX_INTERVAL}
                value={updateInterval}
                onChange={(e) => setUpdateInterval(parseInt(e.target.value))}
                className="w-48 accent-white"
                data-testid="interval-slider"
              />
              <div className="flex justify-between text-white/50 text-xs mt-1">
                <span>{MIN_INTERVAL}s</span>
                <span>{MAX_INTERVAL}s</span>
              </div>
            </div>
          </div>
        </div>
      )}

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
