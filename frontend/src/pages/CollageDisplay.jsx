import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Maximize, Minimize, Pause, Play, Settings, Camera } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Poll interval based on photo count
const getPollInterval = (photoCount) => {
  if (photoCount < 10) return 10000;
  if (photoCount < 20) return 15000;
  if (photoCount < 30) return 20000;
  if (photoCount <= 50) return 30000;
  return 45000;
};

// Tile layout for 16:9 - 11 tiles
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

const DEFAULT_INTERVAL = 7;
const MIN_INTERVAL = 3;
const MAX_INTERVAL = 15;

// Preload image
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
  const [isPaused, setIsPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isReady, setIsReady] = useState(false);
  
  // Two sets of tiles for crossfade transition
  const [currentSet, setCurrentSet] = useState([]);
  const [nextSet, setNextSet] = useState([]);
  const [showNextSet, setShowNextSet] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
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

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  // Get photo URL - prefer thumbnail for tiles
  const getPhotoUrl = useCallback((photo) => {
    if (!photo) return '';
    if (photo.thumbnail_medium_url) {
      return `${BACKEND_URL}${photo.thumbnail_medium_url}`;
    }
    return `${BACKEND_URL}${photo.url}`;
  }, []);

  // Generate a set of photos for tiles
  const generateTileSet = useCallback(() => {
    const currentPhotos = photosRef.current;
    if (currentPhotos.length === 0) return [];
    
    const tiles = [];
    for (let i = 0; i < layout.length; i++) {
      const photo = currentPhotos[photoPoolIndex.current % currentPhotos.length];
      tiles.push(photo);
      photoPoolIndex.current++;
    }
    return tiles;
  }, [layout.length]);

  // Preload next batch
  const preloadNextBatch = useCallback(async () => {
    const currentPhotos = photosRef.current;
    if (currentPhotos.length === 0) return;
    
    const startIdx = photoPoolIndex.current;
    for (let i = 0; i < layout.length; i++) {
      const idx = (startIdx + i) % currentPhotos.length;
      const photo = currentPhotos[idx];
      if (photo && !preloadedSet.current.has(photo.id)) {
        preloadedSet.current.add(photo.id);
        preloadImage(getPhotoUrl(photo));
      }
    }
  }, [layout.length, getPhotoUrl]);

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
          // Shuffle on initial load
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

  // Initial load
  useEffect(() => {
    fetchDisplayData();
  }, [fetchDisplayData]);

  // Initialize tiles when photos load
  useEffect(() => {
    if (photos.length === 0 || isReady) return;
    
    const initialize = async () => {
      // Preload first batch
      const initialSet = [];
      for (let i = 0; i < Math.min(layout.length, photos.length); i++) {
        initialSet.push(photos[i]);
        preloadedSet.current.add(photos[i].id);
      }
      
      await Promise.all(initialSet.map(p => preloadImage(getPhotoUrl(p))));
      
      photoPoolIndex.current = layout.length;
      setCurrentSet(initialSet);
      
      // Preload next batch
      preloadNextBatch();
      
      setIsReady(true);
    };
    
    initialize();
  }, [photos, isReady, layout.length, getPhotoUrl, preloadNextBatch]);

  // Transition to next set
  const transitionToNext = useCallback(async () => {
    if (isPaused || photosRef.current.length === 0 || isTransitioning) return;
    
    setIsTransitioning(true);
    
    // Generate next set
    const newSet = generateTileSet();
    setNextSet(newSet);
    
    // Small delay then start crossfade
    await new Promise(r => setTimeout(r, 50));
    setShowNextSet(true);
    
    // After transition completes, swap sets
    setTimeout(() => {
      setCurrentSet(newSet);
      setNextSet([]);
      setShowNextSet(false);
      setIsTransitioning(false);
      
      // Preload next batch
      preloadNextBatch();
    }, 1000); // Match CSS transition duration
  }, [isPaused, isTransitioning, generateTileSet, preloadNextBatch]);

  // Poll for new photos
  useEffect(() => {
    if (photos.length === 0) return;
    
    pollTimer.current = setInterval(() => {
      fetchDisplayData(true);
    }, getPollInterval(photos.length));
    
    return () => clearInterval(pollTimer.current);
  }, [photos.length, fetchDisplayData]);

  // Auto-update timer
  useEffect(() => {
    if (!isReady || isPaused) return;
    
    updateTimer.current = setInterval(transitionToNext, updateInterval * 1000);
    
    return () => clearInterval(updateTimer.current);
  }, [isReady, isPaused, updateInterval, transitionToNext]);

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

  // Render tile grid
  const renderTileGrid = (tiles, opacity = 1, zIndex = 1) => (
    <div 
      className="absolute inset-0 transition-opacity duration-1000 ease-in-out"
      style={{ opacity, zIndex }}
    >
      {layout.map((tile, index) => {
        const photo = tiles[index];
        if (!photo) return null;
        
        return (
          <div
            key={`${index}-${photo.id}`}
            className="absolute overflow-hidden"
            style={{
              left: `${tile.x}%`,
              top: `${tile.y}%`,
              width: `${tile.w}%`,
              height: `${tile.h}%`,
              padding: '2px'
            }}
          >
            <img
              src={getPhotoUrl(photo)}
              alt=""
              className="w-full h-full object-cover rounded-sm"
              draggable={false}
            />
          </div>
        );
      })}
    </div>
  );

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
          className="relative bg-black overflow-hidden"
          style={{
            width: '100vw',
            height: 'calc(100vw * 9 / 16)',
            maxHeight: '100vh',
            maxWidth: 'calc(100vh * 16 / 9)'
          }}
        >
          {/* Current set (always visible) */}
          {renderTileGrid(currentSet, 1, 1)}
          
          {/* Next set (fades in during transition) */}
          {nextSet.length > 0 && renderTileGrid(nextSet, showNextSet ? 1 : 0, 2)}
        </div>
      </div>

      {/* Controls */}
      <div 
        className={`absolute inset-0 z-50 transition-opacity duration-500 pointer-events-none ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Top */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-8 pb-24">
          <h1 className="text-white text-3xl font-light tracking-wide">
            {displayData?.event_title || displayData?.title}
          </h1>
          {displayData?.photographer_name && (
            <p className="text-white/60 text-sm mt-2">by {displayData.photographer_name}</p>
          )}
        </div>

        {/* Bottom */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-8 pt-24 pointer-events-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <button
                onClick={() => setIsPaused(!isPaused)}
                className="text-white/70 hover:text-white p-2 transition-colors"
              >
                {isPaused ? <Play className="w-8 h-8" /> : <Pause className="w-8 h-8" />}
              </button>
              <span className="text-white/70 text-lg font-light">
                {photos.length} photos
              </span>
              <span className="text-white/40 text-sm">• {updateInterval}s</span>
            </div>
            
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="text-white/70 hover:text-white p-2 transition-colors"
              >
                <Settings className="w-7 h-7" />
              </button>
              <button
                onClick={toggleFullscreen}
                className="text-white/70 hover:text-white p-2 transition-colors"
              >
                {isFullscreen ? <Minimize className="w-8 h-8" /> : <Maximize className="w-8 h-8" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Settings */}
      {showSettings && showControls && (
        <div className="absolute bottom-24 right-8 z-50 bg-black/70 backdrop-blur-md rounded-lg p-6 pointer-events-auto">
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
