import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Maximize, Minimize, Pause, Play, Settings, Camera } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Calculate poll interval based on photo count
const getPollInterval = (photoCount) => {
  if (photoCount < 10) return 10000;       // 10 seconds
  if (photoCount < 20) return 15000;       // 15 seconds
  if (photoCount < 30) return 20000;       // 20 seconds
  if (photoCount <= 50) return 30000;      // 30 seconds
  return 45000;                            // 45 seconds for 50+
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
const DEFAULT_INTERVAL = 7;
const MIN_INTERVAL = 3;
const MAX_INTERVAL = 15;

// Preload an image
const preloadImage = (src) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
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
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showBackSide, setShowBackSide] = useState(false);
  const [isReady, setIsReady] = useState(false);
  
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
  const photosRef = useRef([]);
  const preloadedSet = useRef(new Set());

  const layout = TILE_LAYOUT;

  // Update ref when photos change
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  // Get photo URL - use thumbnail for collage tiles (faster loading)
  const getPhotoUrl = useCallback((photo) => {
    if (!photo) return '';
    // Prefer medium thumbnail for collage tiles
    if (photo.thumbnail_medium_url) {
      return `${BACKEND_URL}${photo.thumbnail_medium_url}`;
    }
    return `${BACKEND_URL}${photo.url}`;
  }, []);

  // Preload next batch of photos
  const preloadNextBatch = useCallback(async (fromIndex, count = 11) => {
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
    
    // Preload in parallel without blocking
    toPreload.forEach(photo => {
      preloadImage(getPhotoUrl(photo));
    });
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
          // New photos - add to queue
          const existingIds = new Set(photosRef.current.map(p => p.id));
          const newPhotos = data.photos.filter(p => !existingIds.has(p.id));
          
          if (newPhotos.length > 0) {
            console.log(`[Live] ${newPhotos.length} new photo(s) added to queue`);
            setPhotos(prev => [...prev, ...newPhotos]);
          }
        } else {
          // Initial load - shuffle
          const shuffled = [...data.photos].sort(() => Math.random() - 0.5);
          setPhotos(shuffled);
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

  // Initialize tiles with photos
  const initializeTiles = useCallback(async (photoList) => {
    const tiles = [];
    const photosToPreload = [];
    
    for (let i = 0; i < layout.length; i++) {
      const photo = photoList[i % photoList.length];
      tiles.push({
        current: photo,
        next: null,
      });
      if (photo && !preloadedSet.current.has(photo.id)) {
        photosToPreload.push(photo);
        preloadedSet.current.add(photo.id);
      }
    }
    
    // Preload initial tiles
    await Promise.all(photosToPreload.map(photo => preloadImage(getPhotoUrl(photo))));
    
    setTilePhotos(tiles);
    photoPoolIndex.current = layout.length;
    setIsReady(true);
  }, [layout.length, getPhotoUrl]);

  // Update ALL tiles at once with cube flip
  const updateAllTiles = useCallback(() => {
    if (isPaused || photosRef.current.length === 0 || isFlipping) return;
    
    // Get next batch of photos
    const nextPhotos = [];
    for (let i = 0; i < layout.length; i++) {
      nextPhotos.push(photosRef.current[photoPoolIndex.current % photosRef.current.length]);
      photoPoolIndex.current++;
    }
    
    // Preload the batch after this one (5 sets ahead = 55 photos)
    preloadNextBatch(photoPoolIndex.current, layout.length);
    
    // Set next photos on hidden face
    setTilePhotos(prev => prev.map((tile, index) => ({
      ...tile,
      next: nextPhotos[index],
    })));
    
    // Trigger flip
    setIsFlipping(true);
    
    // Complete flip after animation
    setTimeout(() => {
      setTilePhotos(prev => prev.map((tile) => ({
        current: tile.next || tile.current,
        next: null,
      })));
      setShowBackSide(prev => !prev);
      setIsFlipping(false);
    }, 850);
  }, [isPaused, isFlipping, layout.length, preloadNextBatch]);

  // Initial load
  useEffect(() => {
    fetchDisplayData();
  }, []);

  // Initialize tiles when photos are loaded
  useEffect(() => {
    if (photos.length > 0 && tilePhotos.length === 0) {
      initializeTiles(photos);
    }
  }, [photos, tilePhotos.length, initializeTiles]);

  // Poll for new photos
  useEffect(() => {
    if (photos.length === 0) return;
    
    const pollInterval = getPollInterval(photos.length);
    
    pollTimer.current = setInterval(() => {
      fetchDisplayData(true);
    }, pollInterval);
    
    return () => clearInterval(pollTimer.current);
  }, [photos.length, fetchDisplayData]);

  // Update timer
  useEffect(() => {
    if (tilePhotos.length === 0 || isPaused || !isReady) return;
    
    updateTimer.current = setInterval(updateAllTiles, updateInterval * 1000);
    
    return () => clearInterval(updateTimer.current);
  }, [tilePhotos.length, isPaused, updateInterval, updateAllTiles, isReady]);

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

  // Loading state
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

  // Preparing initial photos
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
                      className="w-full h-full object-cover"
                    />
                  </div>
                  
                  {/* Back face */}
                  <div className="cube-face cube-face-back rounded-sm overflow-hidden bg-zinc-900">
                    <img
                      src={getPhotoUrl(tileData.next || tileData.current)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
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
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-8 pb-24">
          <h1 className="text-white text-3xl font-light tracking-wide">
            {displayData?.event_title || displayData?.title}
          </h1>
          {displayData?.photographer_name && (
            <p className="text-white/60 text-sm mt-2">by {displayData.photographer_name}</p>
          )}
        </div>

        {/* Bottom bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-8 pt-24 pointer-events-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <button
                onClick={() => setIsPaused(!isPaused)}
                className="text-white/70 hover:text-white p-2 transition-colors"
                data-testid="play-pause-btn"
              >
                {isPaused ? <Play className="w-8 h-8" /> : <Pause className="w-8 h-8" />}
              </button>
              <span className="text-white/70 text-lg font-light">
                {photos.length} photos
              </span>
              <span className="text-white/40 text-sm">
                • {updateInterval}s
              </span>
            </div>
            
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="text-white/70 hover:text-white p-2 transition-colors"
                data-testid="settings-btn"
              >
                <Settings className="w-7 h-7" />
              </button>
              <button
                onClick={toggleFullscreen}
                className="text-white/70 hover:text-white p-2 transition-colors"
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
          className="absolute bottom-24 right-8 z-50 bg-black/70 backdrop-blur-md rounded-lg p-6 pointer-events-auto"
          data-testid="settings-panel"
        >
          <h3 className="text-white font-medium mb-4">Display Settings</h3>
          <div>
            <label className="text-white/60 text-sm block mb-2">
              Update Interval: {updateInterval}s
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
            <div className="flex justify-between text-white/40 text-xs mt-1">
              <span>{MIN_INTERVAL}s</span>
              <span>{MAX_INTERVAL}s</span>
            </div>
          </div>
        </div>
      )}

      {/* Pause indicator */}
      {isPaused && showControls && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-50">
          <div className="bg-black/30 backdrop-blur-sm rounded-full p-8">
            <Pause className="w-16 h-16 text-white/80" />
          </div>
        </div>
      )}
    </div>
  );
};

export default CollageDisplay;
