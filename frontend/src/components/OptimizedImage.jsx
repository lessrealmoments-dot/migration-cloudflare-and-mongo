import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, ImageOff } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Normalize URL to handle relative paths
const normalizeUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('/api') || url.startsWith('/')) {
    return `${BACKEND_URL}${url}`;
  }
  return url;
};

const OptimizedImage = ({ 
  src, 
  thumbnailSrc = null,  // Optimized thumbnail URL
  alt = '', 
  className = '', 
  style = {},
  onClick,
  fallback = null,
  showLoader = true,
  retryCount = 3,
  retryDelay = 1000,
  priority = false,  // Load immediately without lazy loading
  onLoadComplete = null,  // Callback when image loads
  placeholderColor = 'bg-zinc-100'  // Customizable placeholder
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(priority ? normalizeUrl(thumbnailSrc || src) : null);
  const [retries, setRetries] = useState(0);
  const [useThumbnail, setUseThumbnail] = useState(!!thumbnailSrc);
  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const observerRef = useRef(null);
  const prevSrcRef = useRef(src);
  const timeoutRef = useRef(null);

  // Reset when src changes
  useEffect(() => {
    if (prevSrcRef.current !== src) {
      prevSrcRef.current = src;
      setLoading(true);
      setError(false);
      setRetries(0);
      setUseThumbnail(!!thumbnailSrc);
      if (priority) {
        setCurrentSrc(normalizeUrl(thumbnailSrc || src));
      }
    }
  }, [src, thumbnailSrc, priority]);

  useEffect(() => {
    if (priority) {
      setCurrentSrc(normalizeUrl(thumbnailSrc || src));
      setLoading(true);
      setError(false);
      return;
    }

    // Use Intersection Observer for lazy loading
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setCurrentSrc(normalizeUrl(thumbnailSrc || src));
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '300px', // Start loading 300px before entering viewport
        threshold: 0.01
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    observerRef.current = observer;

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [src, thumbnailSrc, priority]);

  const handleLoad = useCallback((e) => {
    // Verify image actually loaded with valid dimensions
    const img = e.target;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setLoading(false);
      setError(false);
      if (onLoadComplete) onLoadComplete();
    } else {
      // Image appears broken despite load event
      handleError();
    }
  }, [onLoadComplete]);

  const handleError = useCallback(() => {
    // Clear any pending timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // If thumbnail fails, try original
    if (useThumbnail && thumbnailSrc && currentSrc === normalizeUrl(thumbnailSrc)) {
      setUseThumbnail(false);
      setCurrentSrc(normalizeUrl(src));
      return;
    }
    
    if (retries < retryCount) {
      // Retry loading after delay with cache buster
      timeoutRef.current = setTimeout(() => {
        setRetries(prev => prev + 1);
        const baseSrc = normalizeUrl(useThumbnail && thumbnailSrc ? thumbnailSrc : src);
        setCurrentSrc(`${baseSrc}${baseSrc.includes('?') ? '&' : '?'}retry=${retries + 1}&t=${Date.now()}`);
      }, retryDelay * (retries + 1));
    } else {
      setLoading(false);
      setError(true);
    }
  }, [useThumbnail, thumbnailSrc, currentSrc, src, retries, retryCount, retryDelay]);

  // Timeout for slow loading images
  useEffect(() => {
    if (currentSrc && loading && !error) {
      timeoutRef.current = setTimeout(() => {
        if (loading) {
          console.warn('[OptimizedImage] Load timeout for:', currentSrc?.substring(0, 50));
          handleError();
        }
      }, 15000); // 15 second timeout

      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }
  }, [currentSrc, loading, error, handleError]);

  return (
    <div 
      ref={containerRef} 
      className={`relative overflow-hidden ${className}`} 
      style={{ minHeight: loading ? '50px' : 'auto', ...style }}
    >
      {/* Loading placeholder - subtle animation */}
      {loading && showLoader && (
        <div className={`absolute inset-0 flex items-center justify-center ${placeholderColor} rounded-sm`}>
          <div className="relative">
            <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
          </div>
        </div>
      )}
      
      {/* Error state */}
      {error && (
        <div className={`absolute inset-0 flex flex-col items-center justify-center ${placeholderColor} rounded-sm`}>
          {fallback || (
            <>
              <ImageOff className="w-8 h-8 text-zinc-400 mb-2" />
              <span className="text-xs text-zinc-500">Unable to load</span>
            </>
          )}
        </div>
      )}
      
      {/* Actual image - fades in smoothly */}
      {currentSrc && (
        <img
          ref={imgRef}
          src={currentSrc}
          alt={alt}
          className={`w-full h-full object-cover ${loading || error ? 'opacity-0' : 'opacity-100'} transition-opacity duration-500`}
          style={style}
          onLoad={handleLoad}
          onError={handleError}
          onClick={onClick}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
        />
      )}
    </div>
  );
};

export default OptimizedImage;
