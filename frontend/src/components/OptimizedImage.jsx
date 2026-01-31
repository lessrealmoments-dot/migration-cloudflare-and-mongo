import React, { useState, useEffect, useRef } from 'react';
import { Loader2, ImageOff } from 'lucide-react';

const OptimizedImage = ({ 
  src, 
  alt = '', 
  className = '', 
  style = {},
  onClick,
  fallback = null,
  showLoader = true,
  retryCount = 3,
  retryDelay = 1000
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(null);
  const [retries, setRetries] = useState(0);
  const imgRef = useRef(null);
  const observerRef = useRef(null);

  useEffect(() => {
    // Reset state when src changes
    setLoading(true);
    setError(false);
    setRetries(0);
    setCurrentSrc(null);

    // Use Intersection Observer for lazy loading
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setCurrentSrc(src);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '100px', // Start loading 100px before entering viewport
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
  }, [src]);

  const handleLoad = () => {
    setLoading(false);
    setError(false);
  };

  const handleError = () => {
    if (retries < retryCount) {
      // Retry loading after delay
      setTimeout(() => {
        setRetries(prev => prev + 1);
        // Force reload by adding cache-busting parameter
        setCurrentSrc(`${src}${src.includes('?') ? '&' : '?'}retry=${retries + 1}`);
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
          loading="lazy"
          decoding="async"
        />
      )}
    </div>
  );
};

export default OptimizedImage;
