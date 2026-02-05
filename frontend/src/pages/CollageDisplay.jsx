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

// Tile layout for 16:9 - 11 tiles (edge-to-edge)
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
const TRANSITION_DURATION = 1200;
const PRELOAD_SETS_AHEAD = 3; // Preload 3 sets ahead

// Robust image preloader with retry and verification
class ImagePreloader {
  constructor() {
    this.cache = new Map(); // url -> { loaded: boolean, element: Image }
    this.loading = new Map(); // url -> Promise
  }

  preload(src) {
    // Already fully loaded
    if (this.cache.has(src) && this.cache.get(src).loaded) {
      return Promise.resolve(true);
    }

    // Currently loading - return existing promise
    if (this.loading.has(src)) {
      return this.loading.get(src);
    }

    // Start new load
    const promise = new Promise((resolve) => {
      const img = new Image();
      
      img.onload = () => {
        this.cache.set(src, { loaded: true, element: img });
        this.loading.delete(src);
        resolve(true);
      };
      
      img.onerror = () => {
        // Retry once on error
        const retryImg = new Image();
        retryImg.onload = () => {
          this.cache.set(src, { loaded: true, element: retryImg });
          this.loading.delete(src);
          resolve(true);
        };
        retryImg.onerror = () => {
          this.loading.delete(src);
          resolve(false);
        };
        retryImg.src = src;
      };
      
      img.src = src;
    });

    this.loading.set(src, promise);
    return promise;
  }

  isLoaded(src) {
    return this.cache.has(src) && this.cache.get(src).loaded;
  }

  async preloadAll(urls) {
    const results = await Promise.all(urls.map(url => this.preload(url)));
    return results.every(r => r);
  }
}

const imagePreloader = new ImagePreloader();

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
  
  // Two layers that alternate for smooth crossfade
  const [layerA, setLayerA] = useState([]);
  const [layerB, setLayerB] = useState([]);
  const [activeLayer, setActiveLayer] = useState('A');
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Queue of preloaded sets ready to display
  const preloadedSetsRef = useRef([]);
  const isPreloadingRef = useRef(false);
  
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

  const layout = TILE_LAYOUT;

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  // Get photo URL - prefer thumbnail for better performance
  const getPhotoUrl = useCallback((photo) => {
    if (!photo) return '';
    if (photo.thumbnail_medium_url) {
      return `${BACKEND_URL}${photo.thumbnail_medium_url}`;
    }
    return `${BACKEND_URL}${photo.url}`;
  }, []);

  // Generate a set of photos for the tiles
  const generateTileSet = useCallback((startIndex = null) => {
    const currentPhotos = photosRef.current;
    if (currentPhotos.length === 0) return [];
    
    const index = startIndex !== null ? startIndex : photoPoolIndex.current;
    const tiles = [];
    
    for (let i = 0; i < layout.length; i++) {
      const photo = currentPhotos[(index + i) % currentPhotos.length];
      tiles.push(photo);
    }
    
    if (startIndex === null) {
      photoPoolIndex.current += layout.length;
    }
    
    return tiles;
  }, [layout.length]);

  // Preload multiple sets ahead in background
  const preloadNextSets = useCallback(async () => {
    if (isPreloadingRef.current || photosRef.current.length === 0) return;
    
    isPreloadingRef.current = true;
    
    const setsNeeded = PRELOAD_SETS_AHEAD - preloadedSetsRef.current.length;
    
    for (let s = 0; s < setsNeeded; s++) {
      const nextIndex = photoPoolIndex.current + (preloadedSetsRef.current.length * layout.length);
      const nextSet = generateTileSet(nextIndex);
      const urls = nextSet.map(photo => getPhotoUrl(photo));
      
      // Wait for all images to load
      await imagePreloader.preloadAll(urls);
      
      // Double-check all are loaded
      const allLoaded = urls.every(url => imagePreloader.isLoaded(url));
      
      if (allLoaded) {
        preloadedSetsRef.current.push({
          photos: nextSet,
          index: nextIndex
        });
      }
    }
    
    isPreloadingRef.current = false;
  }, [layout.length, generateTileSet, getPhotoUrl]);

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
            // Preload new photos immediately
            newPhotos.forEach(p => imagePreloader.preload(getPhotoUrl(p)));
          }
        } else {
          // Shuffle on initial load for variety
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
  }, [shareLink, getPhotoUrl]);

  // Initial load
  useEffect(() => {
    fetchDisplayData();
  }, [fetchDisplayData]);

  // Initialize first set of tiles
  useEffect(() => {
    if (photos.length === 0 || isReady) return;
    
    const initialize = async () => {
      // Generate first set
      const firstSet = [];
      for (let i = 0; i < Math.min(layout.length, photos.length); i++) {
        firstSet.push(photos[i]);
      }
      photoPoolIndex.current = layout.length;
      
      // Preload ALL first set images with verification
      const urls = firstSet.map(p => getPhotoUrl(p));
      await imagePreloader.preloadAll(urls);
      
      // Set first layer
      setLayerA(firstSet);
      setActiveLayer('A');
      
      // Start preloading next sets in background
      preloadNextSets();
      
      setIsReady(true);
    };
    
    initialize();
  }, [photos, isReady, layout.length, getPhotoUrl, preloadNextSets]);

  // Transition to next set - only if preloaded
  const transitionToNext = useCallback(async () => {
    if (isPaused || photosRef.current.length === 0 || isTransitioning) return;
    
    // Check if we have a preloaded set ready
    if (preloadedSetsRef.current.length === 0) {
      // No preloaded set - force preload and wait
      console.log('[Collage] Waiting for preload...');
      await preloadNextSets();
      
      // Still nothing? Generate and preload on the spot
      if (preloadedSetsRef.current.length === 0) {
        const emergencySet = generateTileSet();
        const urls = emergencySet.map(p => getPhotoUrl(p));
        await imagePreloader.preloadAll(urls);
        preloadedSetsRef.current.push({ photos: emergencySet, index: photoPoolIndex.current - layout.length });
      }
    }
    
    // Get the next preloaded set
    const nextSetData = preloadedSetsRef.current.shift();
    if (!nextSetData) return;
    
    const nextSet = nextSetData.photos;
    
    // Verify all images are still in cache (double-check)
    const urls = nextSet.map(p => getPhotoUrl(p));
    const allReady = urls.every(url => imagePreloader.isLoaded(url));
    
    if (!allReady) {
      // Re-preload if somehow not ready
      await imagePreloader.preloadAll(urls);
    }
    
    setIsTransitioning(true);
    
    // Update the hidden layer with new photos
    const targetLayer = activeLayer === 'A' ? 'B' : 'A';
    
    if (targetLayer === 'A') {
      setLayerA(nextSet);
    } else {
      setLayerB(nextSet);
    }
    
    // Wait for React to render the new images (they're already cached)
    await new Promise(r => setTimeout(r, 50));
    
    // Trigger crossfade
    setActiveLayer(targetLayer);
    
    // After transition completes
    setTimeout(() => {
      setIsTransitioning(false);
      // Continue preloading
      preloadNextSets();
    }, TRANSITION_DURATION);
    
  }, [isPaused, isTransitioning, activeLayer, generateTileSet, getPhotoUrl, preloadNextSets, layout.length]);

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

  // Continuously preload in background
  useEffect(() => {
    if (!isReady || isPaused) return;
    
    const preloadInterval = setInterval(() => {
      if (preloadedSetsRef.current.length < PRELOAD_SETS_AHEAD) {
        preloadNextSets();
      }
    }, 2000);
    
    return () => clearInterval(preloadInterval);
  }, [isReady, isPaused, preloadNextSets]);

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

  // Render a layer of tiles
  const renderLayer = (tiles, isActive) => (
    <div 
      className="absolute inset-0"
      style={{
        opacity: isActive ? 1 : 0,
        transition: `opacity ${TRANSITION_DURATION}ms ease-in-out`,
        zIndex: isActive ? 2 : 1,
      }}
    >
      {layout.map((tilePos, index) => {
        const photo = tiles[index];
        if (!photo) return null;
        
        const url = getPhotoUrl(photo);
        
        return (
          <div
            key={`${index}-${photo.id}`}
            className="absolute overflow-hidden"
            style={{
              left: `${tilePos.x}%`,
              top: `${tilePos.y}%`,
              width: `${tilePos.w}%`,
              height: `${tilePos.h}%`,
            }}
          >
            <img
              src={url}
              alt=""
              className="w-full h-full object-cover"
              loading="eager"
              decoding="sync"
              draggable={false}
            />
          </div>
        );
      })}
    </div>
  );

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
          {/* Layer A */}
          {layerA.length > 0 && renderLayer(layerA, activeLayer === 'A')}
          
          {/* Layer B */}
          {layerB.length > 0 && renderLayer(layerB, activeLayer === 'B')}
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
                data-testid="pause-play-button"
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
                data-testid="settings-button"
              >
                <Settings className="w-7 h-7" />
              </button>
              <button
                onClick={toggleFullscreen}
                className="text-white/70 hover:text-white p-2 transition-colors"
                data-testid="fullscreen-button"
              >
                {isFullscreen ? <Minimize className="w-8 h-8" /> : <Maximize className="w-8 h-8" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Settings */}
      {showSettings && showControls && (
        <div className="absolute bottom-24 right-8 z-50 bg-black/70 backdrop-blur-md rounded-lg p-6 pointer-events-auto" data-testid="settings-panel">
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
