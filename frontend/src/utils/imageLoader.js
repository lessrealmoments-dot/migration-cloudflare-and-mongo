/**
 * Robust Image Loader Utility
 * Handles preloading, caching, and error recovery for images across the site
 */

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Global image cache with LRU-like behavior
class ImageCache {
  constructor(maxSize = 200) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.loadingPromises = new Map();
  }

  // Get normalized URL
  normalizeUrl(url) {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    if (url.startsWith('/api') || url.startsWith('/')) {
      return `${BACKEND_URL}${url}`;
    }
    return url;
  }

  // Check if image is cached and loaded
  isLoaded(url) {
    const normalizedUrl = this.normalizeUrl(url);
    const cached = this.cache.get(normalizedUrl);
    return cached?.status === 'loaded';
  }

  // Get cached image element
  getCachedElement(url) {
    const normalizedUrl = this.normalizeUrl(url);
    const cached = this.cache.get(normalizedUrl);
    return cached?.status === 'loaded' ? cached.element : null;
  }

  // Preload single image with retry logic
  async preload(url, options = {}) {
    const {
      retries = 3,
      retryDelay = 500,
      timeout = 15000,
      priority = false
    } = options;

    const normalizedUrl = this.normalizeUrl(url);
    if (!normalizedUrl) return { success: false, url: null };

    // Already loaded
    if (this.isLoaded(normalizedUrl)) {
      return { success: true, url: normalizedUrl, cached: true };
    }

    // Currently loading - return existing promise
    if (this.loadingPromises.has(normalizedUrl)) {
      return this.loadingPromises.get(normalizedUrl);
    }

    // Create loading promise
    const loadPromise = this._loadWithRetry(normalizedUrl, retries, retryDelay, timeout);
    this.loadingPromises.set(normalizedUrl, loadPromise);

    try {
      const result = await loadPromise;
      return result;
    } finally {
      this.loadingPromises.delete(normalizedUrl);
    }
  }

  // Internal load with retry
  async _loadWithRetry(url, retries, retryDelay, timeout) {
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await this._loadSingleAttempt(url, timeout);
        if (result.success) {
          this._addToCache(url, result.element);
          return { success: true, url, cached: false };
        }
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
        }
      }
    }

    // Mark as failed in cache to prevent repeated attempts
    this.cache.set(url, { status: 'failed', timestamp: Date.now() });
    return { success: false, url, error: lastError };
  }

  // Single load attempt with timeout
  _loadSingleAttempt(url, timeout) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      let timeoutId = null;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        img.onload = null;
        img.onerror = null;
      };

      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Image load timeout'));
      }, timeout);

      img.onload = () => {
        cleanup();
        // Verify image actually loaded (some browsers fire onload even for broken images)
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          resolve({ success: true, element: img });
        } else {
          reject(new Error('Image loaded but appears broken'));
        }
      };

      img.onerror = () => {
        cleanup();
        reject(new Error('Image failed to load'));
      };

      // Add cache-busting only on retries
      img.src = url;
    });
  }

  // Add to cache with LRU eviction
  _addToCache(url, element) {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(url, {
      status: 'loaded',
      element,
      timestamp: Date.now()
    });
  }

  // Preload multiple images in parallel with concurrency limit
  async preloadBatch(urls, options = {}) {
    const { concurrency = 4, ...loadOptions } = options;
    const results = [];
    const queue = [...urls];

    const worker = async () => {
      while (queue.length > 0) {
        const url = queue.shift();
        if (url) {
          const result = await this.preload(url, loadOptions);
          results.push(result);
        }
      }
    };

    // Start concurrent workers
    const workers = Array(Math.min(concurrency, urls.length))
      .fill(null)
      .map(() => worker());

    await Promise.all(workers);
    return results;
  }

  // Preload images for display (collage/slideshow)
  async preloadForDisplay(photos, options = {}) {
    const {
      useHighRes = false,
      concurrency = 6
    } = options;

    const urls = photos.map(photo => {
      if (!photo) return null;
      // Use medium thumbnail for faster loading, fall back to full URL
      if (!useHighRes && photo.thumbnail_medium_url) {
        return photo.thumbnail_medium_url;
      }
      return photo.url;
    }).filter(Boolean);

    return this.preloadBatch(urls, { concurrency, ...options });
  }

  // Clear cache (useful for memory management)
  clear() {
    this.cache.clear();
    this.loadingPromises.clear();
  }

  // Get cache stats
  getStats() {
    let loaded = 0;
    let failed = 0;
    this.cache.forEach(item => {
      if (item.status === 'loaded') loaded++;
      if (item.status === 'failed') failed++;
    });
    return {
      total: this.cache.size,
      loaded,
      failed,
      loading: this.loadingPromises.size
    };
  }
}

// Singleton instance
export const imageCache = new ImageCache();

// Helper function to get best available image URL for a photo
export const getOptimalImageUrl = (photo, options = {}) => {
  const { preferHighRes = false, forDisplay = false } = options;
  
  if (!photo) return null;

  // For display modes (collage/slideshow), use medium thumbnails for performance
  if (forDisplay && !preferHighRes) {
    if (photo.thumbnail_medium_url) {
      return `${BACKEND_URL}${photo.thumbnail_medium_url}`;
    }
  }

  // For gallery view, use appropriate size
  if (photo.thumbnail_medium_url && !preferHighRes) {
    return `${BACKEND_URL}${photo.thumbnail_medium_url}`;
  }

  // Full resolution
  if (photo.url) {
    return `${BACKEND_URL}${photo.url}`;
  }

  return null;
};

// Preload helper for display components
export const preloadDisplaySet = async (photos, onProgress = null) => {
  const total = photos.length;
  let loaded = 0;

  const urls = photos.map(p => getOptimalImageUrl(p, { forDisplay: true })).filter(Boolean);
  
  const results = await Promise.all(
    urls.map(async (url) => {
      const result = await imageCache.preload(url);
      loaded++;
      if (onProgress) {
        onProgress({ loaded, total, percent: Math.round((loaded / total) * 100) });
      }
      return result;
    })
  );

  const successful = results.filter(r => r.success).length;
  return {
    total,
    successful,
    failed: total - successful,
    allLoaded: successful === total
  };
};

export default imageCache;
