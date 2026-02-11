import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, ImageOff } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * ProgressiveImage - Clean image loading without blur effect
 * 
 * Features:
 * - Loads thumbnail immediately (sharp, no blur)
 * - Lazy loading with Intersection Observer
 * - Graceful error handling with fallback
 * - Optional full-res loading on view (for lightbox)
 */
const ProgressiveImage = ({
  src,                          // Full resolution URL
  thumbnailSrc,                 // Thumbnail URL (shown in grid)
  alt = '',
  className = '',
  style = {},
  onClick,
  showLoader = true,
  aspectRatio = null,           // e.g., "4/3", "16/9", "1/1"
  objectFit = 'cover',
  onLoadComplete = null,
  loadFullOnView = false,       // Load full-res when in viewport
}) => {
  const [loadState, setLoadState] = useState('initial'); // initial | loading | loaded | error
  const [currentSrc, setCurrentSrc] = useState(null);
  const [isInView, setIsInView] = useState(false);
  const containerRef = useRef(null);

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
            // Start loading when visible
            if (loadState === 'initial') {
              const imageUrl = normalizeUrl(thumbnailSrc || src);
              setCurrentSrc(imageUrl);
              setLoadState('loading');
            }
          }
        });
      },
      {
        rootMargin: '100px', // Start loading 100px before entering viewport
        threshold: 0.01
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [thumbnailSrc, src, loadState, normalizeUrl]);

  // Handle image load
  const handleLoad = useCallback(() => {
    setLoadState('loaded');
    if (onLoadComplete) onLoadComplete();
  }, [onLoadComplete]);

  // Handle image error
  const handleError = useCallback(() => {
    // Try loading full URL if thumbnail fails
    const fullUrl = normalizeUrl(src);
    if (currentSrc !== fullUrl && src) {
      setCurrentSrc(fullUrl);
    } else {
      setLoadState('error');
    }
  }, [src, currentSrc, normalizeUrl]);

  const isLoading = loadState === 'initial' || loadState === 'loading';
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
      onClick={onClick}
    >
      {/* Loading placeholder */}
      {isLoading && showLoader && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800">
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

      {/* Image - sharp, no blur */}
      {currentSrc && !hasError && (
        <img
          src={currentSrc}
          alt={alt}
          className={`
            w-full h-full transition-opacity duration-300
            ${loadState === 'loading' ? 'opacity-0' : 'opacity-100'}
          `}
          style={{ objectFit }}
          onLoad={handleLoad}
          onError={handleError}
          loading="lazy"
          decoding="async"
        />
      )}
    </div>
  );
};

export default ProgressiveImage;
