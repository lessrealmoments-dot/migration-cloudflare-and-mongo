import { useState, useCallback, useRef } from 'react';
import axios from 'axios';

/**
 * Smart Adaptive Upload Hook
 * 
 * Features:
 * - Measures upload speed during initial uploads
 * - Dynamically adjusts concurrency based on connection speed
 * - Supports retry logic for failed uploads
 * - Progress tracking per file
 * 
 * Speed-based concurrency:
 * - Fast (>5 Mbps): 5-8 concurrent uploads
 * - Medium (2-5 Mbps): 3-4 concurrent uploads
 * - Slow (<2 Mbps): 1-2 concurrent uploads
 */

const SPEED_THRESHOLDS = {
  FAST: 5 * 1024 * 1024,      // 5 MB/s (40 Mbps)
  MEDIUM: 2 * 1024 * 1024,    // 2 MB/s (16 Mbps)
  SLOW: 512 * 1024,           // 512 KB/s (4 Mbps)
};

const CONCURRENCY_LEVELS = {
  FAST: 6,
  MEDIUM: 4,
  SLOW: 2,
  VERY_SLOW: 1,
};

export const useSmartUploader = ({
  uploadEndpoint,
  onFileSuccess,
  onFileError,
  onAllComplete,
  maxRetries = 2,
  timeout = 120000,
  headers = {},
  formDataBuilder = null, // Custom function to build FormData
}) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState([]);
  const [stats, setStats] = useState({
    totalFiles: 0,
    completed: 0,
    failed: 0,
    currentSpeed: 0,
    concurrency: CONCURRENCY_LEVELS.MEDIUM,
  });
  
  // Speed measurement
  const speedSamplesRef = useRef([]);
  const concurrencyRef = useRef(CONCURRENCY_LEVELS.MEDIUM);
  const abortControllerRef = useRef(null);

  // Calculate average speed from samples
  const calculateAverageSpeed = useCallback(() => {
    const samples = speedSamplesRef.current;
    if (samples.length === 0) return 0;
    const sum = samples.reduce((a, b) => a + b, 0);
    return sum / samples.length;
  }, []);

  // Determine concurrency based on measured speed
  const updateConcurrency = useCallback(() => {
    const avgSpeed = calculateAverageSpeed();
    let newConcurrency;
    
    if (avgSpeed >= SPEED_THRESHOLDS.FAST) {
      newConcurrency = CONCURRENCY_LEVELS.FAST;
    } else if (avgSpeed >= SPEED_THRESHOLDS.MEDIUM) {
      newConcurrency = CONCURRENCY_LEVELS.MEDIUM;
    } else if (avgSpeed >= SPEED_THRESHOLDS.SLOW) {
      newConcurrency = CONCURRENCY_LEVELS.SLOW;
    } else {
      newConcurrency = CONCURRENCY_LEVELS.VERY_SLOW;
    }
    
    concurrencyRef.current = newConcurrency;
    setStats(prev => ({ 
      ...prev, 
      concurrency: newConcurrency,
      currentSpeed: avgSpeed 
    }));
    
    return newConcurrency;
  }, [calculateAverageSpeed]);

  // Upload a single file with retry logic
  const uploadFile = useCallback(async (file, index, signal) => {
    const startTime = Date.now();
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          setProgress(prev => prev.map((p, i) => 
            i === index ? { ...p, status: 'retrying', retries: attempt } : p
          ));
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
        
        // Build FormData
        const formData = formDataBuilder 
          ? formDataBuilder(file) 
          : (() => {
              const fd = new FormData();
              fd.append('file', file);
              return fd;
            })();
        
        const response = await axios.post(uploadEndpoint, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
            ...headers,
          },
          timeout,
          signal,
          onUploadProgress: (progressEvent) => {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setProgress(prev => prev.map((p, i) => 
              i === index ? { ...p, progress: percent } : p
            ));
            
            // Measure speed (bytes per second)
            const elapsed = (Date.now() - startTime) / 1000;
            if (elapsed > 0 && progressEvent.loaded > 0) {
              const speed = progressEvent.loaded / elapsed;
              // Only record significant samples
              if (progressEvent.loaded > 100 * 1024) { // After 100KB
                speedSamplesRef.current.push(speed);
                // Keep last 10 samples
                if (speedSamplesRef.current.length > 10) {
                  speedSamplesRef.current.shift();
                }
              }
            }
          }
        });
        
        // Success
        setProgress(prev => prev.map((p, i) => 
          i === index ? { ...p, status: 'success', progress: 100 } : p
        ));
        
        // Update concurrency based on speed after first few uploads
        if (speedSamplesRef.current.length >= 2) {
          updateConcurrency();
        }
        
        if (onFileSuccess) onFileSuccess(file, response.data, index);
        return { success: true, response };
        
      } catch (error) {
        lastError = error;
        // Don't retry for these errors
        if (error.response?.status === 403 || 
            error.response?.status === 400 || 
            error.response?.status === 409 ||
            error.name === 'CanceledError') {
          break;
        }
      }
    }
    
    // Failed after all retries
    let errorMsg = 'Upload failed';
    if (lastError?.response?.status === 403) {
      errorMsg = 'Storage full';
    } else if (lastError?.response?.status === 400) {
      errorMsg = lastError.response?.data?.detail || 'Invalid file';
    } else if (lastError?.response?.status === 409) {
      errorMsg = 'Duplicate file';
    } else if (lastError?.code === 'ECONNABORTED') {
      errorMsg = 'Timeout';
    } else if (lastError?.name === 'CanceledError') {
      errorMsg = 'Cancelled';
    }
    
    setProgress(prev => prev.map((p, i) => 
      i === index ? { ...p, status: 'error', errorMsg } : p
    ));
    
    if (onFileError) onFileError(file, lastError, errorMsg, index);
    return { success: false, error: lastError, errorMsg };
  }, [uploadEndpoint, headers, timeout, maxRetries, formDataBuilder, onFileSuccess, onFileError, updateConcurrency]);

  // Main upload function with adaptive concurrency
  const startUpload = useCallback(async (files) => {
    if (files.length === 0) return;
    
    setUploading(true);
    speedSamplesRef.current = [];
    abortControllerRef.current = new AbortController();
    
    // Initialize progress
    const initialProgress = files.map(file => ({
      name: file.name,
      size: file.size,
      status: 'pending',
      progress: 0,
      retries: 0,
    }));
    setProgress(initialProgress);
    setStats({
      totalFiles: files.length,
      completed: 0,
      failed: 0,
      currentSpeed: 0,
      concurrency: concurrencyRef.current,
    });
    
    let completed = 0;
    let failed = 0;
    let currentIndex = 0;
    const results = [];
    
    // Process files with dynamic concurrency
    const processNext = async () => {
      while (currentIndex < files.length) {
        const index = currentIndex++;
        const file = files[index];
        
        setProgress(prev => prev.map((p, i) => 
          i === index ? { ...p, status: 'uploading' } : p
        ));
        
        const result = await uploadFile(file, index, abortControllerRef.current.signal);
        results[index] = result;
        
        if (result.success) {
          completed++;
        } else {
          failed++;
        }
        
        setStats(prev => ({ ...prev, completed, failed }));
      }
    };
    
    // Start with initial concurrency, dynamically adjusted
    const getConcurrency = () => concurrencyRef.current;
    
    // Create worker promises
    const workers = [];
    const initialConcurrency = getConcurrency();
    
    for (let i = 0; i < Math.min(initialConcurrency, files.length); i++) {
      workers.push(processNext());
    }
    
    await Promise.all(workers);
    
    setUploading(false);
    if (onAllComplete) onAllComplete(results, completed, failed);
    
    return { results, completed, failed };
  }, [uploadFile, onAllComplete]);

  // Cancel all uploads
  const cancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setUploading(false);
    setProgress(prev => prev.map(p => 
      p.status === 'uploading' || p.status === 'pending' 
        ? { ...p, status: 'cancelled', errorMsg: 'Cancelled' } 
        : p
    ));
  }, []);

  // Clear progress
  const clearProgress = useCallback(() => {
    setProgress([]);
    setStats({
      totalFiles: 0,
      completed: 0,
      failed: 0,
      currentSpeed: 0,
      concurrency: CONCURRENCY_LEVELS.MEDIUM,
    });
  }, []);

  return {
    uploading,
    progress,
    stats,
    startUpload,
    cancelUpload,
    clearProgress,
  };
};

/**
 * Sequential Upload Hook (for guests)
 * 
 * Simple one-at-a-time upload for users with limited connectivity
 */
export const useSequentialUploader = ({
  uploadEndpoint,
  onFileSuccess,
  onFileError,
  onAllComplete,
  maxRetries = 1,
  timeout = 60000,
  headers = {},
  formDataBuilder = null,
}) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState([]);
  const [currentFile, setCurrentFile] = useState(null);
  const abortControllerRef = useRef(null);

  const startUpload = useCallback(async (files) => {
    if (files.length === 0) return;
    
    setUploading(true);
    abortControllerRef.current = new AbortController();
    
    const initialProgress = files.map(file => ({
      name: file.name,
      size: file.size,
      status: 'pending',
      progress: 0,
    }));
    setProgress(initialProgress);
    
    let completed = 0;
    let failed = 0;
    const results = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setCurrentFile(file.name);
      
      setProgress(prev => prev.map((p, idx) => 
        idx === i ? { ...p, status: 'uploading' } : p
      ));
      
      let success = false;
      let lastError;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            setProgress(prev => prev.map((p, idx) => 
              idx === i ? { ...p, status: 'retrying' } : p
            ));
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          const formData = formDataBuilder 
            ? formDataBuilder(file) 
            : (() => {
                const fd = new FormData();
                fd.append('file', file);
                return fd;
              })();
          
          const response = await axios.post(uploadEndpoint, formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
              ...headers,
            },
            timeout,
            signal: abortControllerRef.current.signal,
            onUploadProgress: (progressEvent) => {
              const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              setProgress(prev => prev.map((p, idx) => 
                idx === i ? { ...p, progress: percent } : p
              ));
            }
          });
          
          setProgress(prev => prev.map((p, idx) => 
            idx === i ? { ...p, status: 'success', progress: 100 } : p
          ));
          
          if (onFileSuccess) onFileSuccess(file, response.data, i);
          results[i] = { success: true, response };
          success = true;
          completed++;
          break;
          
        } catch (error) {
          lastError = error;
          if (error.response?.status === 403 || 
              error.response?.status === 400 || 
              error.response?.status === 409 ||
              error.name === 'CanceledError') {
            break;
          }
        }
      }
      
      if (!success) {
        let errorMsg = 'Upload failed';
        if (lastError?.response?.status === 403) {
          errorMsg = 'Storage full';
        } else if (lastError?.response?.status === 409) {
          errorMsg = 'Already uploaded';
        } else if (lastError?.name === 'CanceledError') {
          errorMsg = 'Cancelled';
        }
        
        setProgress(prev => prev.map((p, idx) => 
          idx === i ? { ...p, status: 'error', errorMsg } : p
        ));
        
        if (onFileError) onFileError(file, lastError, errorMsg, i);
        results[i] = { success: false, error: lastError, errorMsg };
        failed++;
      }
    }
    
    setUploading(false);
    setCurrentFile(null);
    if (onAllComplete) onAllComplete(results, completed, failed);
    
    return { results, completed, failed };
  }, [uploadEndpoint, headers, timeout, maxRetries, formDataBuilder, onFileSuccess, onFileError, onAllComplete]);

  const cancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setUploading(false);
    setCurrentFile(null);
  }, []);

  const clearProgress = useCallback(() => {
    setProgress([]);
    setCurrentFile(null);
  }, []);

  return {
    uploading,
    progress,
    currentFile,
    startUpload,
    cancelUpload,
    clearProgress,
  };
};

export default useSmartUploader;
