import { useState, useEffect, useCallback } from 'react';

/**
 * Hook to detect connection speed
 * Uses Navigator API if available, falls back to download test
 * 
 * @param {Object} options - Configuration options
 * @param {boolean} options.enabled - Whether to run the speed test
 * @param {number} options.threshold - Speed threshold in Mbps (default: 1)
 * @returns {Object} { speed, isSlowConnection, isTesting, runTest }
 */
export function useConnectionSpeed({ enabled = true, threshold = 1 } = {}) {
  const [speed, setSpeed] = useState(null);
  const [isSlowConnection, setIsSlowConnection] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const runTest = useCallback(async () => {
    if (!enabled) return;
    
    setIsTesting(true);
    
    try {
      // Try Navigator API first (faster, but not all browsers)
      if ('connection' in navigator) {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (conn && conn.downlink) {
          const speedMbps = conn.downlink; // Already in Mbps
          setSpeed(speedMbps);
          setIsSlowConnection(speedMbps < threshold);
          setIsTesting(false);
          return { speed: speedMbps, isSlowConnection: speedMbps < threshold };
        }
      }
      
      // Fallback: Download test using a small image
      // Use a small placeholder image (~1KB) to minimize data usage
      const testImageUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      
      // For more accurate test, fetch a known size resource
      // We'll use multiple small fetches and average
      const testUrls = [
        '/favicon.ico', // Usually small
        '/static/media/logo.png', // If exists
      ];
      
      let totalBytes = 0;
      let totalTime = 0;
      let successfulTests = 0;
      
      for (const url of testUrls) {
        try {
          const startTime = performance.now();
          const response = await fetch(url + '?t=' + Date.now(), { 
            method: 'GET',
            cache: 'no-store'
          });
          
          if (response.ok) {
            const blob = await response.blob();
            const endTime = performance.now();
            
            totalBytes += blob.size;
            totalTime += (endTime - startTime) / 1000; // Convert to seconds
            successfulTests++;
          }
        } catch {
          // Ignore failed fetches
        }
      }
      
      if (successfulTests > 0 && totalTime > 0) {
        // Calculate speed: bytes -> bits -> megabits
        const bitsPerSecond = (totalBytes * 8) / totalTime;
        const mbps = bitsPerSecond / 1000000;
        
        // This is a rough estimate, actual speed is likely higher
        // We multiply by a factor to account for overhead
        const estimatedMbps = Math.min(mbps * 1.5, 100);
        
        setSpeed(estimatedMbps);
        setIsSlowConnection(estimatedMbps < threshold);
        setIsTesting(false);
        return { speed: estimatedMbps, isSlowConnection: estimatedMbps < threshold };
      }
      
      // If all tests fail, assume normal connection
      setSpeed(null);
      setIsSlowConnection(false);
      setIsTesting(false);
      return { speed: null, isSlowConnection: false };
      
    } catch (error) {
      console.error('Speed test error:', error);
      setSpeed(null);
      setIsSlowConnection(false);
      setIsTesting(false);
      return { speed: null, isSlowConnection: false };
    }
  }, [enabled, threshold]);

  useEffect(() => {
    if (enabled) {
      runTest();
    }
  }, [enabled, runTest]);

  return { speed, isSlowConnection, isTesting, runTest };
}

export default useConnectionSpeed;
