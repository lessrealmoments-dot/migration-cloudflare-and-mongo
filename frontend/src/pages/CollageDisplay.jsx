import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Maximize, Minimize, Pause, Play, Settings, Camera } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Helper to get the correct image URL (handles both CDN and local URLs)
const getImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `${BACKEND_URL}${url}`;
};

// Poll interval based on photo count
const getPollInterval = (photoCount) => {
  if (photoCount < 10) return 10000;
  if (photoCount < 20) return 15000;
  if (photoCount < 30) return 20000;
  if (photoCount <= 50) return 30000;
  return 45000;
};

// Default fallback layout if no preset is configured
const DEFAULT_TILE_LAYOUT = [
  { id: '1', x: 0, y: 0, width: 38, height: 50, ratio: '3:2', z_index: 0 },
  { id: '2', x: 38, y: 0, width: 22, height: 50, ratio: '2:3', z_index: 0 },
  { id: '3', x: 60, y: 0, width: 22, height: 26, ratio: '3:2', z_index: 0 },
  { id: '4', x: 82, y: 0, width: 18, height: 18, ratio: '1:1', z_index: 0 },
  { id: '5', x: 82, y: 18, width: 18, height: 32, ratio: '2:3', z_index: 0 },
  { id: '6', x: 60, y: 26, width: 22, height: 24, ratio: '3:2', z_index: 0 },
  { id: '7', x: 0, y: 50, width: 20, height: 28, ratio: '2:3', z_index: 0 },
  { id: '8', x: 20, y: 50, width: 40, height: 28, ratio: '3:2', z_index: 0 },
  { id: '9', x: 60, y: 50, width: 40, height: 30, ratio: '3:2', z_index: 0 },
  { id: '10', x: 0, y: 78, width: 30, height: 22, ratio: '3:2', z_index: 0 },
  { id: '11', x: 30, y: 78, width: 30, height: 22, ratio: '3:2', z_index: 0 },
  { id: '12', x: 60, y: 80, width: 40, height: 20, ratio: '3:2', z_index: 0 },
];

const DEFAULT_SETTINGS = {
  gap: 3,
  border_thickness: 0,
  border_color: '#000000',
  border_opacity: 1.0,
  background_color: '#000000'
};

const DEFAULT_INTERVAL = 7;
const MIN_INTERVAL = 3;
const MAX_INTERVAL = 15;
const TRANSITION_DURATION = 1200;
const PRELOAD_SETS_AHEAD = 3;

// Enhanced image preloader with timeout, retry, and verification
class ImagePreloader {
  constructor() {
    this.cache = new Map();
    this.loading = new Map();
    this.failed = new Set();
    this.timeout = 12000; // 12 second timeout per image
    this.maxRetries = 2;
  }

  preload(src, retryCount = 0) {
    // Already loaded successfully
    if (this.cache.has(src) && this.cache.get(src).loaded) {
      return Promise.resolve(true);
    }

    // Currently loading - return existing promise
    if (this.loading.has(src)) {
      return this.loading.get(src);
    }

    // Failed too many times - don't retry
    if (this.failed.has(src) && retryCount >= this.maxRetries) {
      return Promise.resolve(false);
    }

    const promise = new Promise((resolve) => {
      const img = new Image();
      let timeoutId = null;
      let resolved = false;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        img.onload = null;
        img.onerror = null;
      };

      const succeed = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        // Verify image actually loaded with valid dimensions
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          this.cache.set(src, { loaded: true, element: img, timestamp: Date.now() });
          this.failed.delete(src);
          this.loading.delete(src);
          resolve(true);
        } else {
          fail();
        }
      };

      const fail = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        this.loading.delete(src);
        
        // Retry if under limit
        if (retryCount < this.maxRetries) {
          // Add small delay before retry
          setTimeout(() => {
            const retryUrl = `${src}${src.includes('?') ? '&' : '?'}retry=${retryCount + 1}&t=${Date.now()}`;
            this.preload(retryUrl, retryCount + 1).then(resolve);
          }, 500 * (retryCount + 1));
        } else {
          this.failed.add(src);
          resolve(false);
        }
      };

      // Set timeout
      timeoutId = setTimeout(() => {
        console.warn(`[ImagePreloader] Timeout loading: ${src.substring(0, 50)}...`);
        fail();
      }, this.timeout);

      img.onload = succeed;
      img.onerror = fail;
      
      // Use crossOrigin for external images to prevent CORS issues
      if (src.startsWith('http') && !src.includes(window.location.hostname)) {
        img.crossOrigin = 'anonymous';
      }
      
      img.src = src;
    });

    this.loading.set(src, promise);
    return promise;
  }

  isLoaded(src) {
    return this.cache.has(src) && this.cache.get(src).loaded;
  }

  hasFailed(src) {
    return this.failed.has(src);
  }

  async preloadAll(urls, options = {}) {
    const { concurrency = 4, failFast = false } = options;
    
    // Process in batches for better performance
    const results = [];
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map(url => this.preload(url)));
      results.push(...batchResults);
      
      // If failFast and any failed, stop early
      if (failFast && batchResults.some(r => !r)) {
        break;
      }
    }
    
    const successCount = results.filter(r => r).length;
    return successCount === urls.length;
  }

  // Clear old cache entries to free memory
  cleanCache(maxAge = 300000) { // 5 minutes default
    const now = Date.now();
    for (const [src, data] of this.cache.entries()) {
      if (now - data.timestamp > maxAge) {
        this.cache.delete(src);
      }
    }
  }

  getStats() {
    return {
      cached: this.cache.size,
      loading: this.loading.size,
      failed: this.failed.size
    };
  }
}

const imagePreloader = new ImagePreloader();

// Robust image component for collage tiles - handles loading/errors gracefully
const CollageImage = ({ src, photoId, preloader }) => {
  const [loaded, setLoaded] = useState(preloader.isLoaded(src));
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const imgRef = useRef(null);
  const maxRetries = 2;

  useEffect(() => {
    // Check if already preloaded
    if (preloader.isLoaded(src)) {
      setLoaded(true);
      return;
    }

    // Preload the image
    preloader.preload(src).then(success => {
      if (success) {
        setLoaded(true);
      } else if (retryCount < maxRetries) {
        setRetryCount(prev => prev + 1);
      } else {
        setError(true);
      }
    });
  }, [src, retryCount, preloader]);

  const handleLoad = () => {
    setLoaded(true);
    setError(false);
  };

  const handleError = () => {
    if (retryCount < maxRetries) {
      // Retry with cache buster
      setRetryCount(prev => prev + 1);
    } else {
      setError(true);
    }
  };

  // Generate URL with retry cache buster if needed
  const imageUrl = retryCount > 0 ? `${src}${src.includes('?') ? '&' : '?'}r=${retryCount}` : src;

  return (
    <>
      {/* Placeholder/Loading state - subtle gradient */}
      {!loaded && !error && (
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-900 animate-pulse" />
      )}
      
      {/* Error state - dark placeholder */}
      {error && (
        <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-zinc-800" />
        </div>
      )}
      
      {/* Actual image */}
      <img
        ref={imgRef}
        src={imageUrl}
        alt=""
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded && !error ? 'opacity-100' : 'opacity-0'}`}
        loading="eager"
        decoding="sync"
        draggable={false}
        onLoad={handleLoad}
        onError={handleError}
      />
    </>
  );
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
  
  // Preset-based layout
  const [layout, setLayout] = useState(DEFAULT_TILE_LAYOUT);
  const [presetSettings, setPresetSettings] = useState(DEFAULT_SETTINGS);
  
  const [layerA, setLayerA] = useState([]);
  const [layerB, setLayerB] = useState([]);
  const [activeLayer, setActiveLayer] = useState('A');
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  const preloadedSetsRef = useRef([]);
  const isPreloadingRef = useRef(false);
  const isTransitioningRef = useRef(false);
  
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
  const layoutRef = useRef(layout);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const getPhotoUrl = useCallback((photo) => {
    if (!photo) return '';
    
    // Handle different photo sources
    const source = photo.source || 'upload';
    
    if (source === 'pcloud') {
      // pCloud photos use our proxy endpoint - needs BACKEND_URL prefix
      // URL format: /api/pcloud/serve/{code}/{fileid}
      const url = photo.url || photo.thumbnail_medium_url || photo.thumbnail_url;
      if (url && url.startsWith('/api/')) {
        return `${BACKEND_URL}${url}`;
      }
      return getImageUrl(url);
    }
    
    if (source === 'gdrive') {
      // Google Drive photos use direct Google URLs (already absolute)
      // Prefer thumbnail_medium_url for better quality in collage
      return photo.thumbnail_medium_url || photo.thumbnail_url || photo.url;
    }
    
    // Regular uploaded photos - prefer medium thumbnail for display
    if (photo.thumbnail_medium_url) {
      return getImageUrl(photo.thumbnail_medium_url);
    }
    return getImageUrl(photo.url);
  }, []);

  const generateTileSet = useCallback((startIndex = null) => {
    const currentPhotos = photosRef.current;
    const currentLayout = layoutRef.current;
    if (currentPhotos.length === 0 || currentLayout.length === 0) return [];
    
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
    
    for (let i = 0; i < currentLayout.length; i++) {
      const photo = currentPhotos[(index + i) % currentPhotos.length];
      tiles.push(photo);
    }
    
    if (startIndex === null) {
      photoPoolIndex.current += currentLayout.length;
    }
    
    return tiles;
  }, []);

  const preloadNextSets = useCallback(async () => {
    if (isPreloadingRef.current || photosRef.current.length === 0) return;
    
    isPreloadingRef.current = true;
    const currentLayout = layoutRef.current;
    
    try {
      const setsNeeded = PRELOAD_SETS_AHEAD - preloadedSetsRef.current.length;
      
      for (let s = 0; s < setsNeeded; s++) {
        // Calculate next index based on current pool position and already preloaded sets
        const nextIndex = photoPoolIndex.current + (preloadedSetsRef.current.length * currentLayout.length);
        
        // Generate set at that index
        const tiles = [];
        const currentPhotos = photosRef.current;
        for (let i = 0; i < currentLayout.length; i++) {
          const photo = currentPhotos[(nextIndex + i) % currentPhotos.length];
          tiles.push(photo);
        }
        
        if (tiles.length === 0) continue;
        
        const urls = tiles.map(photo => getPhotoUrl(photo));
        
        await imagePreloader.preloadAll(urls);
        
        preloadedSetsRef.current.push({
          photos: tiles,
          index: nextIndex
        });
      }
    } catch (err) {
      console.error('[Collage] Preload error:', err);
    }
    
    isPreloadingRef.current = false;
  }, [getPhotoUrl]);

  const fetchDisplayData = useCallback(async (isPolling = false) => {
    try {
      const response = await fetch(`${API}/display/${shareLink}`);
      if (!response.ok) throw new Error('Gallery not found');
      const data = await response.json();
      
      setDisplayData(data);
      
      // Apply collage preset if available
      if (!isPolling && data.collage_preset) {
        const preset = data.collage_preset;
        if (preset.placeholders && preset.placeholders.length > 0) {
          setLayout(preset.placeholders);
        }
        if (preset.settings) {
          setPresetSettings(preset.settings);
        }
        console.log(`[Collage] Using preset: ${preset.name || 'Unnamed'} with ${preset.placeholders?.length || 0} tiles`);
      }
      
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
          // Filter out photos without valid URLs
          // pCloud and GDrive photos always have url, upload photos should have thumbnails
          const validPhotos = data.photos.filter(p => {
            // Accept if has any displayable URL
            if (p.url) return true;
            if (p.thumbnail_medium_url) return true;
            if (p.thumbnail_url) return true;
            return false;
          });
          const shuffled = [...validPhotos].sort(() => Math.random() - 0.5);
          setPhotos(shuffled);
          
          // Log photo sources for debugging
          const sources = validPhotos.reduce((acc, p) => {
            const source = p.source || 'upload';
            acc[source] = (acc[source] || 0) + 1;
            return acc;
          }, {});
          console.log(`[Collage] Loaded ${validPhotos.length} photos:`, sources);
          
          if (validPhotos.length < data.photos.length) {
            console.log(`[Collage] Filtered out ${data.photos.length - validPhotos.length} photos without valid URLs`);
          }
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
    if (isPaused || photosRef.current.length === 0) return;
    
    // Use ref to prevent race conditions with isTransitioning state
    if (isTransitioningRef.current) {
      return;
    }
    
    isTransitioningRef.current = true;
    setIsTransitioning(true);
    
    try {
      let nextSet;
      
      // Try to get from preloaded sets first
      if (preloadedSetsRef.current.length > 0) {
        const nextSetData = preloadedSetsRef.current.shift();
        nextSet = nextSetData.photos;
      } else {
        // Generate directly if no preloaded sets available
        const currentPhotos = photosRef.current;
        const currentLayout = layoutRef.current;
        nextSet = [];
        for (let i = 0; i < currentLayout.length; i++) {
          const photo = currentPhotos[(photoPoolIndex.current + i) % currentPhotos.length];
          nextSet.push(photo);
        }
      }
      
      // Advance pool index
      photoPoolIndex.current += layoutRef.current.length;
      
      // Reset index periodically to prevent overflow
      if (photoPoolIndex.current > photosRef.current.length * 100) {
        photoPoolIndex.current = photoPoolIndex.current % photosRef.current.length;
      }
      
      if (nextSet.length === 0) {
        isTransitioningRef.current = false;
        setIsTransitioning(false);
        return;
      }
      
      // Ensure all images are loaded
      const urls = nextSet.map(p => getPhotoUrl(p));
      await imagePreloader.preloadAll(urls);
      
      const targetLayer = activeLayer === 'A' ? 'B' : 'A';
      
      if (targetLayer === 'A') {
        setLayerA(nextSet);
      } else {
        setLayerB(nextSet);
      }
      
      await new Promise(r => setTimeout(r, 50));
      
      setActiveLayer(targetLayer);
      
      // Schedule preload of next sets after transition completes
      setTimeout(() => {
        isTransitioningRef.current = false;
        setIsTransitioning(false);
        preloadNextSets();
      }, TRANSITION_DURATION);
      
    } catch (err) {
      console.error('[Collage] Transition error:', err);
      isTransitioningRef.current = false;
      setIsTransitioning(false);
    }
    
  }, [isPaused, activeLayer, getPhotoUrl, preloadNextSets]);

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

  // Render a layer of tiles with gaps/borders from preset settings
  const renderLayer = (tiles, isActive) => (
    <div 
      className="absolute inset-0"
      style={{
        opacity: isActive ? 1 : 0,
        transition: `opacity ${TRANSITION_DURATION}ms ease-in-out`,
        zIndex: isActive ? 2 : 1,
        padding: `${presetSettings.gap}px`,
      }}
    >
      {layout.map((tilePos, index) => {
        const photo = tiles[index];
        if (!photo) return null;
        
        const url = getPhotoUrl(photo);
        // Support both 'width'/'height' (new format) and 'w'/'h' (old format)
        const width = tilePos.width || tilePos.w;
        const height = tilePos.height || tilePos.h;
        
        return (
          <div
            key={`${index}-${photo.id}`}
            className="absolute overflow-hidden rounded-sm"
            style={{
              left: `calc(${tilePos.x}% + ${presetSettings.gap/2}px)`,
              top: `calc(${tilePos.y}% + ${presetSettings.gap/2}px)`,
              width: `calc(${width}% - ${presetSettings.gap}px)`,
              height: `calc(${height}% - ${presetSettings.gap}px)`,
              backgroundColor: '#1a1a1a',
              border: presetSettings.border_thickness > 0 
                ? `${presetSettings.border_thickness}px solid ${presetSettings.border_color}`
                : 'none',
              opacity: presetSettings.border_opacity,
            }}
          >
            <CollageImage 
              src={url} 
              photoId={photo.id}
              preloader={imagePreloader}
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
      className="fixed inset-0 overflow-hidden"
      style={{ backgroundColor: presetSettings.background_color }}
      onMouseMove={handleMouseMove}
      data-testid="collage-display"
    >
      {/* 16:9 Container */}
      <div className="absolute inset-0 flex items-center justify-center p-2">
        <div 
          className="relative overflow-hidden rounded-lg"
          style={{
            width: '100vw',
            height: 'calc(100vw * 9 / 16)',
            maxHeight: '100vh',
            maxWidth: 'calc(100vh * 16 / 9)',
            backgroundColor: presetSettings.background_color
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
