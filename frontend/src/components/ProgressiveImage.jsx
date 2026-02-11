import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, ImageOff } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * ProgressiveImage - Premium blur-to-sharp image loading
 * 
 * Features:
 * - Tiny placeholder (blurred) → Medium quality → Full quality
 * - Intersection Observer for lazy loading
 * - Smooth blur-to-sharp transition (like Apple/Unsplash)
 * - Memory efficient - no full image loaded until needed
 */
const ProgressiveImage = ({
  src,                          // Full resolution URL
  thumbnailSrc,                 // Low-res thumbnail URL (required for progressive loading)
  placeholderSrc = null,        // Tiny placeholder (optional, for extra blur effect)
  alt = '',
  className = '',
  style = {},
  onClick,
  showLoader = true,
  aspectRatio = null,           // e.g., "4/3", "16/9", "1/1" for consistent layout before load
  objectFit = 'cover',
  onLoadComplete = null,
  loadFullOnView = false,       // Load full-res when in viewport (for lightbox)
}) => {
  const [loadState, setLoadState] = useState('initial'); // initial | thumbnail | full | error
  const [currentSrc, setCurrentSrc] = useState(null);
  const [isInView, setIsInView] = useState(false);
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);
  const containerRef = useRef(null);
  const thumbnailRef = useRef(null);
  const fullImageRef = useRef(null);

  // Normalize URL
  const normalizeUrl = useCallback((url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    if (url.startsWith('/api') || url.startsWith('/')) {
      return `${BACKEND_URL}${url}`;
    }
    return url;
  }, []);

  // Intersection Observer for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            // Start loading thumbnail when visible
            if (loadState === 'initial') {
              setCurrentSrc(normalizeUrl(thumbnailSrc || src));
              setLoadState('loading-thumbnail');
            }
          }
        });
      },
      {
        rootMargin: '200px', // Start loading 200px before entering viewport
        threshold: 0.01
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [thumbnailSrc, src, loadState, normalizeUrl]);

  // Handle thumbnail load
  const handleThumbnailLoad = useCallback(() => {
    setThumbnailLoaded(true);
    setLoadState('thumbnail');
    
    // If loadFullOnView is true and we're in view, start loading full image
    if (loadFullOnView && isInView && src !== thumbnailSrc) {
      // Preload full image in background
      const fullImg = new Image();
      fullImg.onload = () => {
        setCurrentSrc(normalizeUrl(src));
        setLoadState('full');
        if (onLoadComplete) onLoadComplete();
      };
      fullImg.onerror = () => {
        // Keep thumbnail, log error
        console.warn('Full image failed to load:', src);
      };
      fullImg.src = normalizeUrl(src);
    } else if (onLoadComplete) {
      onLoadComplete();
    }
  }, [loadFullOnView, isInView, src, thumbnailSrc, normalizeUrl, onLoadComplete]);

  // Handle thumbnail error
  const handleThumbnailError = useCallback(() => {
    // Try loading original if thumbnail fails
    if (src && currentSrc !== normalizeUrl(src)) {
      setCurrentSrc(normalizeUrl(src));
    } else {
      setLoadState('error');
    }
  }, [src, currentSrc, normalizeUrl]);

  // Load full resolution on demand (for lightbox click)
  const loadFullResolution = useCallback(() => {
    if (loadState === 'full' || !src) return;
    
    const fullImg = new Image();
    fullImg.onload = () => {
      setCurrentSrc(normalizeUrl(src));
      setLoadState('full');
    };
    fullImg.src = normalizeUrl(src);
  }, [loadState, src, normalizeUrl]);

  // Handle click - load full res first if needed
  const handleClick = useCallback((e) => {
    if (onClick) {
      // If we haven't loaded full res yet and it's different from thumbnail
      if (loadState !== 'full' && src !== thumbnailSrc) {
        loadFullResolution();
      }
      onClick(e);
    }
  }, [onClick, loadState, src, thumbnailSrc, loadFullResolution]);

  const isLoading = loadState === 'initial' || loadState === 'loading-thumbnail';
  const hasError = loadState === 'error';

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={{
        aspectRatio: aspectRatio || 'auto',
        minHeight: isLoading ? '100px' : 'auto',
        ...style
      }}
      onClick={handleClick}
    >
      {/* Loading placeholder with subtle pulse */}
      {isLoading && showLoader && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 animate-pulse">
          <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-100 dark:bg-zinc-800">
          <ImageOff className="w-8 h-8 text-zinc-400 mb-2" />
          <span className="text-xs text-zinc-500">Unable to load</span>
        </div>
      )}

      {/* Thumbnail layer - always visible once loaded */}
      {currentSrc && !hasError && (
        <img
          ref={thumbnailRef}
          src={currentSrc}
          alt={alt}
          className={`
            w-full h-full transition-all duration-700 ease-out
            ${loadState === 'loading-thumbnail' ? 'opacity-0 scale-105' : 'opacity-100 scale-100'}
            ${loadState === 'thumbnail' ? 'blur-[1px]' : 'blur-0'}
          `}
          style={{ objectFit }}
          onLoad={handleThumbnailLoad}
          onError={handleThumbnailError}
          loading="lazy"
          decoding="async"
        />
      )}

      {/* Full resolution overlay - fades in over thumbnail */}
      {loadState === 'full' && src !== thumbnailSrc && (
        <img
          ref={fullImageRef}
          src={normalizeUrl(src)}
          alt={alt}
          className="absolute inset-0 w-full h-full opacity-100 transition-opacity duration-500"
          style={{ objectFit }}
          loading="lazy"
          decoding="async"
        />
      )}
    </div>
  );
};

export default ProgressiveImage;
