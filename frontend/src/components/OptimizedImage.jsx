import React, { useState, useEffect, useRef } from 'react';
import { Loader2, ImageOff } from 'lucide-react';

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
  priority = false  // Load immediately without lazy loading
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(priority ? (thumbnailSrc || src) : null);
  const [retries, setRetries] = useState(0);
  const [useThumbnail, setUseThumbnail] = useState(!!thumbnailSrc);
  const imgRef = useRef(null);
  const observerRef = useRef(null);

  // Get the appropriate source (thumbnail or original)
  const getImageSrc = () => {
    if (useThumbnail && thumbnailSrc) {
      return thumbnailSrc;
    }
    return src;
  };

  useEffect(() => {
    // Reset state when src changes
    setLoading(true);
    setError(false);
    setRetries(0);
    setUseThumbnail(!!thumbnailSrc);
    
    if (priority) {
      setCurrentSrc(thumbnailSrc || src);
      return;
    }
    
    setCurrentSrc(null);

    // Use Intersection Observer for lazy loading
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setCurrentSrc(thumbnailSrc || src);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '200px', // Start loading 200px before entering viewport
        threshold: 0.01
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    observerRef.current = observer;

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [src, thumbnailSrc, priority]);

  const handleLoad = () => {
    setLoading(false);
    setError(false);
  };

  const handleError = () => {
    // If thumbnail fails, try original
    if (useThumbnail && thumbnailSrc && currentSrc === thumbnailSrc) {
      setUseThumbnail(false);
      setCurrentSrc(src);
      return;
    }
    
    if (retries < retryCount) {
      // Retry loading after delay
      setTimeout(() => {
        setRetries(prev => prev + 1);
        // Force reload by adding cache-busting parameter
        const baseSrc = useThumbnail && thumbnailSrc ? thumbnailSrc : src;
        setCurrentSrc(`${baseSrc}${baseSrc.includes('?') ? '&' : '?'}retry=${retries + 1}`);
      }, retryDelay * (retries + 1));
    } else {
      setLoading(false);
      setError(true);
    }
  };

  return (
    <div ref={imgRef} className={`relative ${className}`} style={{ minHeight: loading ? '100px' : 'auto' }}>
      {/* Loading placeholder */}
      {loading && showLoader && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 rounded-sm">
          <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
        </div>
      )}
      
      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-100 rounded-sm">
          {fallback || (
            <>
              <ImageOff className="w-8 h-8 text-zinc-400 mb-2" />
              <span className="text-xs text-zinc-500">Failed to load</span>
            </>
          )}
        </div>
      )}
      
      {/* Actual image */}
      {currentSrc && (
        <img
          src={currentSrc}
          alt={alt}
          className={`${className} ${loading || error ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
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
