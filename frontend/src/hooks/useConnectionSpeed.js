import { useState, useEffect, useCallback } from 'react';

/**
 * Lightweight hook to detect slow connections
 * 
 * Strategy (in order of reliability):
 * 1. Check navigator.connection.saveData (user's data saver preference)
 * 2. Check navigator.connection.effectiveType ('slow-2g', '2g', '3g', '4g')
 * 3. Fallback: Simple timing test with a small CDN resource
 * 
 * @param {Object} options - Configuration options
 * @param {boolean} options.enabled - Whether to run the detection
 * @param {number} options.slowThresholdMs - Response time threshold in ms (default: 1500)
 * @returns {Object} { speed, effectiveType, isSlowConnection, isTesting, runTest }
 */
export function useConnectionSpeed({ enabled = true, slowThresholdMs = 1500 } = {}) {
  const [speed, setSpeed] = useState(null);
  const [effectiveType, setEffectiveType] = useState(null);
  const [isSlowConnection, setIsSlowConnection] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const runTest = useCallback(async () => {
    if (!enabled) return { speed: null, isSlowConnection: false };
    
    setIsTesting(true);
    
    try {
      // Method 1: Check Network Information API (most reliable when available)
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      
      if (connection) {
        // Check if user has Data Saver enabled - respect their preference
        if (connection.saveData) {
          console.log('[ConnectionSpeed] Data Saver enabled by user');
          setEffectiveType('save-data');
          setIsSlowConnection(true);
          setSpeed(null);
          setIsTesting(false);
          return { speed: null, effectiveType: 'save-data', isSlowConnection: true };
        }
        
        // Check effectiveType - this is more reliable than downlink
        // Values: 'slow-2g', '2g', '3g', '4g'
        const effType = connection.effectiveType;
        if (effType) {
          setEffectiveType(effType);
          const isSlow = effType === 'slow-2g' || effType === '2g';
          
          // Also check downlink as secondary indicator (if available and non-zero)
          const downlink = connection.downlink;
          if (downlink && downlink > 0) {
            setSpeed(downlink);
            // Consider slow if effectiveType is 2g OR downlink < 1.5 Mbps
            const isSlowBySpeed = downlink < 1.5;
            const finalIsSlow = isSlow || isSlowBySpeed;
            setIsSlowConnection(finalIsSlow);
            setIsTesting(false);
            console.log(`[ConnectionSpeed] effectiveType: ${effType}, downlink: ${downlink} Mbps, isSlow: ${finalIsSlow}`);
            return { speed: downlink, effectiveType: effType, isSlowConnection: finalIsSlow };
          }
          
          setIsSlowConnection(isSlow);
          setIsTesting(false);
          console.log(`[ConnectionSpeed] effectiveType: ${effType}, isSlow: ${isSlow}`);
          return { speed: null, effectiveType: effType, isSlowConnection: isSlow };
        }
      }
      
      // Method 2: Fallback timing test with a small external resource
      // Use a reliable, fast CDN with a tiny resource
      console.log('[ConnectionSpeed] Fallback: timing test');
      
      const testUrls = [
        'https://www.google.com/favicon.ico',
        'https://www.cloudflare.com/favicon.ico',
      ];
      
      let fastestTime = Infinity;
      
      for (const url of testUrls) {
        try {
          const startTime = performance.now();
          
          // Use HEAD request for minimal data transfer
          const response = await fetch(url, { 
            method: 'HEAD',
            mode: 'no-cors', // Avoid CORS issues
            cache: 'no-store'
          });
          
          const endTime = performance.now();
          const responseTime = endTime - startTime;
          
          if (responseTime < fastestTime) {
            fastestTime = responseTime;
          }
          
          // If we get a fast response, no need to test more
          if (responseTime < slowThresholdMs / 2) {
            break;
          }
        } catch (e) {
          // Ignore individual fetch failures
          console.log(`[ConnectionSpeed] Fetch failed for ${url}:`, e.message);
        }
      }
      
      if (fastestTime < Infinity) {
        // Estimate speed based on response time
        // This is rough but better than nothing
        const estimatedMbps = fastestTime < 200 ? 50 : 
                              fastestTime < 500 ? 10 : 
                              fastestTime < 1000 ? 3 : 
                              fastestTime < 2000 ? 1 : 0.5;
        
        const isSlow = fastestTime > slowThresholdMs;
        
        setSpeed(estimatedMbps);
        setEffectiveType(isSlow ? 'slow' : 'fast');
        setIsSlowConnection(isSlow);
        setIsTesting(false);
        
        console.log(`[ConnectionSpeed] Timing test: ${fastestTime.toFixed(0)}ms, estimated: ${estimatedMbps} Mbps, isSlow: ${isSlow}`);
        return { speed: estimatedMbps, effectiveType: isSlow ? 'slow' : 'fast', isSlowConnection: isSlow };
      }
      
      // If all tests fail, assume normal connection (don't annoy users)
      console.log('[ConnectionSpeed] All tests failed, assuming normal connection');
      setSpeed(null);
      setEffectiveType('unknown');
      setIsSlowConnection(false);
      setIsTesting(false);
      return { speed: null, effectiveType: 'unknown', isSlowConnection: false };
      
    } catch (error) {
      console.error('[ConnectionSpeed] Error:', error);
      setSpeed(null);
      setEffectiveType('error');
      setIsSlowConnection(false);
      setIsTesting(false);
      return { speed: null, effectiveType: 'error', isSlowConnection: false };
    }
  }, [enabled, slowThresholdMs]);

  // Listen for connection changes
  useEffect(() => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    
    if (connection) {
      const handleChange = () => {
        console.log('[ConnectionSpeed] Connection changed, re-testing...');
        runTest();
      };
      
      connection.addEventListener('change', handleChange);
      return () => connection.removeEventListener('change', handleChange);
    }
  }, [runTest]);

  // Initial test
  useEffect(() => {
    if (enabled) {
      runTest();
    }
  }, [enabled, runTest]);

  return { speed, effectiveType, isSlowConnection, isTesting, runTest };
}

export default useConnectionSpeed;
