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

// TurboCollage style - 10 tiles with LANDSCAPE orientation focus
// Better suited for professional landscape photography
const TILE_LAYOUT = [
  // TOP ROW - Wide landscape tiles
  { x: 0, y: 0, w: 35, h: 40 },        // Large landscape top-left
  { x: 35, y: 0, w: 30, h: 35 },       // Medium landscape top-center
  { x: 65, y: 0, w: 35, h: 40 },       // Large landscape top-right
  
  // MIDDLE ROW - Mixed landscape tiles
  { x: 0, y: 40, w: 25, h: 30 },       // Medium landscape mid-left
  { x: 25, y: 35, w: 25, h: 32 },      // Medium landscape mid-center-left
  { x: 50, y: 35, w: 25, h: 30 },      // Medium landscape mid-center-right
  { x: 75, y: 40, w: 25, h: 30 },      // Medium landscape mid-right
  
  // BOTTOM ROW - Wide landscape tiles
  { x: 0, y: 70, w: 35, h: 30 },       // Large landscape bottom-left
  { x: 35, y: 67, w: 30, h: 33 },      // Medium landscape bottom-center
  { x: 65, y: 70, w: 35, h: 30 },      // Large landscape bottom-right
];

const TILE_GAP = 3; // Gap between tiles in pixels

const DEFAULT_INTERVAL = 7;
const MIN_INTERVAL = 3;
const MAX_INTERVAL = 15;
const TRANSITION_DURATION = 1200;
const PRELOAD_SETS_AHEAD = 3;

// Robust image preloader with retry and verification
class ImagePreloader {
  constructor() {
    this.cache = new Map();
    this.loading = new Map();
  }

  preload(src) {
    if (this.cache.has(src) && this.cache.get(src).loaded) {
      return Promise.resolve(true);
    }

    if (this.loading.has(src)) {
      return this.loading.get(src);
    }

    const promise = new Promise((resolve) => {
      const img = new Image();
      
      img.onload = () => {
        this.cache.set(src, { loaded: true, element: img });
        this.loading.delete(src);
        resolve(true);
      };
      
      img.onerror = () => {
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
  
  const [layerA, setLayerA] = useState([]);
  const [layerB, setLayerB] = useState([]);
  const [activeLayer, setActiveLayer] = useState('A');
  const [isTransitioning, setIsTransitioning] = useState(false);
  
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

  const getPhotoUrl = useCallback((photo) => {
    if (!photo) return '';
    if (photo.thumbnail_medium_url) {
      return `${BACKEND_URL}${photo.thumbnail_medium_url}`;
    }
    return `${BACKEND_URL}${photo.url}`;
  }, []);

  const generateTileSet = useCallback((startIndex = null) => {
    const currentPhotos = photosRef.current;
    if (currentPhotos.length === 0) return [];
    
    let index = startIndex !== null ? startIndex : photoPoolIndex.current;
    
    // Reset index if it gets too large (prevents overflow on long sessions)
    // This also ensures perpetual looping
    if (index >= currentPhotos.length * 100) {
      index = index % currentPhotos.length;
      if (startIndex === null) {
        photoPoolIndex.current = index;
      }
      console.log('[Collage] Looping back to start - perpetual playback continues');
    }
    
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

  const preloadNextSets = useCallback(async () => {
    if (isPreloadingRef.current || photosRef.current.length === 0) return;
    
    isPreloadingRef.current = true;
    
    const setsNeeded = PRELOAD_SETS_AHEAD - preloadedSetsRef.current.length;
    
    for (let s = 0; s < setsNeeded; s++) {
      const nextIndex = photoPoolIndex.current + (preloadedSetsRef.current.length * layout.length);
      const nextSet = generateTileSet(nextIndex);
      const urls = nextSet.map(photo => getPhotoUrl(photo));
      
      await imagePreloader.preloadAll(urls);
      
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
            newPhotos.forEach(p => imagePreloader.preload(getPhotoUrl(p)));
          }
        } else {
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

  useEffect(() => {
    fetchDisplayData();
  }, [fetchDisplayData]);

  useEffect(() => {
    if (photos.length === 0 || isReady) return;
    
    const initialize = async () => {
      const firstSet = [];
      for (let i = 0; i < Math.min(layout.length, photos.length); i++) {
        firstSet.push(photos[i % photos.length]);
      }
      // Ensure we have enough photos for all tiles
      while (firstSet.length < layout.length) {
        firstSet.push(photos[firstSet.length % photos.length]);
      }
      photoPoolIndex.current = layout.length;
      
      const urls = firstSet.map(p => getPhotoUrl(p));
      await imagePreloader.preloadAll(urls);
      
      setLayerA(firstSet);
      setActiveLayer('A');
      
      preloadNextSets();
      
      setIsReady(true);
    };
    
    initialize();
  }, [photos, isReady, layout.length, getPhotoUrl, preloadNextSets]);

  const transitionToNext = useCallback(async () => {
    if (isPaused || photosRef.current.length === 0 || isTransitioning) return;
    
    if (preloadedSetsRef.current.length === 0) {
      console.log('[Collage] Waiting for preload...');
      await preloadNextSets();
      
      if (preloadedSetsRef.current.length === 0) {
        const emergencySet = generateTileSet();
        const urls = emergencySet.map(p => getPhotoUrl(p));
        await imagePreloader.preloadAll(urls);
        preloadedSetsRef.current.push({ photos: emergencySet, index: photoPoolIndex.current - layout.length });
      }
    }
    
    const nextSetData = preloadedSetsRef.current.shift();
    if (!nextSetData) return;
    
    const nextSet = nextSetData.photos;
    
    const urls = nextSet.map(p => getPhotoUrl(p));
    const allReady = urls.every(url => imagePreloader.isLoaded(url));
    
    if (!allReady) {
      await imagePreloader.preloadAll(urls);
    }
    
    setIsTransitioning(true);
    
    const targetLayer = activeLayer === 'A' ? 'B' : 'A';
    
    if (targetLayer === 'A') {
      setLayerA(nextSet);
    } else {
      setLayerB(nextSet);
    }
    
    await new Promise(r => setTimeout(r, 50));
    
    setActiveLayer(targetLayer);
    
    setTimeout(() => {
      setIsTransitioning(false);
      preloadNextSets();
    }, TRANSITION_DURATION);
    
  }, [isPaused, isTransitioning, activeLayer, generateTileSet, getPhotoUrl, preloadNextSets, layout.length]);

  useEffect(() => {
    if (photos.length === 0) return;
    
    pollTimer.current = setInterval(() => {
      fetchDisplayData(true);
    }, getPollInterval(photos.length));
    
    return () => clearInterval(pollTimer.current);
  }, [photos.length, fetchDisplayData]);

  useEffect(() => {
    if (!isReady || isPaused) return;
    
    updateTimer.current = setInterval(transitionToNext, updateInterval * 1000);
    
    return () => clearInterval(updateTimer.current);
  }, [isReady, isPaused, updateInterval, transitionToNext]);

  useEffect(() => {
    if (!isReady || isPaused) return;
    
    const preloadInterval = setInterval(() => {
      if (preloadedSetsRef.current.length < PRELOAD_SETS_AHEAD) {
        preloadNextSets();
      }
    }, 2000);
    
    return () => clearInterval(preloadInterval);
  }, [isReady, isPaused, preloadNextSets]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => setShowControls(false), 3000);
  };

  // Render a layer of tiles with gaps/borders
  const renderLayer = (tiles, isActive) => (
    <div 
      className="absolute inset-0"
      style={{
        opacity: isActive ? 1 : 0,
        transition: `opacity ${TRANSITION_DURATION}ms ease-in-out`,
        zIndex: isActive ? 2 : 1,
        padding: `${TILE_GAP}px`,
      }}
    >
      {layout.map((tilePos, index) => {
        const photo = tiles[index];
        if (!photo) return null;
        
        const url = getPhotoUrl(photo);
        
        return (
          <div
            key={`${index}-${photo.id}`}
            className="absolute overflow-hidden rounded-sm"
            style={{
              left: `calc(${tilePos.x}% + ${TILE_GAP/2}px)`,
              top: `calc(${tilePos.y}% + ${TILE_GAP/2}px)`,
              width: `calc(${tilePos.w}% - ${TILE_GAP}px)`,
              height: `calc(${tilePos.h}% - ${TILE_GAP}px)`,
              backgroundColor: '#1a1a1a',
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
      className="fixed inset-0 bg-neutral-900 overflow-hidden"
      onMouseMove={handleMouseMove}
      data-testid="collage-display"
    >
      {/* 16:9 Container */}
      <div className="absolute inset-0 flex items-center justify-center p-2">
        <div 
          className="relative bg-neutral-900 overflow-hidden rounded-lg"
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
