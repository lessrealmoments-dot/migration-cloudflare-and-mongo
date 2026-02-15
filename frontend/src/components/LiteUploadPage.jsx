import React, { useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  Upload, Image, CheckCircle2, AlertCircle, 
  ExternalLink, Camera, CloudUpload, X,
  Loader2, Wifi, AlertTriangle
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import SparkMD5 from 'spark-md5';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Maximum photos per upload batch
const MAX_UPLOAD_LIMIT = 10;

/**
 * Calculate MD5 hash of file content for duplicate detection
 */
const calculateFileHash = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const spark = new SparkMD5.ArrayBuffer();
        spark.append(e.target.result);
        resolve(spark.end());
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

/**
 * LiteUploadPage - Minimal upload interface for slow connections
 * Features:
 * - 10 photo limit per batch
 * - Duplicate detection with content hashing
 * - Sequential uploads (one at a time)
 */
const LiteUploadPage = ({
  gallery,
  shareLink,
  onSwitchToFull,
  themeColors = {},
  onUploadComplete
}) => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [uploadedCount, setUploadedCount] = useState(0);
  const [guestName, setGuestName] = useState('');
  const [duplicateFiles, setDuplicateFiles] = useState([]);
  const fileInputRef = useRef(null);

  const accentColor = themeColors?.accent || '#3b82f6';
  const backgroundColor = themeColors?.background || '#ffffff';
  const textColor = themeColors?.text || '#1f2937';

  const handleFileSelect = useCallback((e) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    // Check total count including already selected files
    const totalFiles = files.length + selectedFiles.length;
    if (totalFiles > MAX_UPLOAD_LIMIT) {
      toast.error(`You can only upload up to ${MAX_UPLOAD_LIMIT} photos at a time. Please select fewer photos.`, {
        duration: 5000,
        icon: <AlertTriangle className="w-5 h-5 text-amber-500" />
      });
      return;
    }

    // Filter for images only
    const imageFiles = selectedFiles.filter(file => 
      file.type.startsWith('image/')
    );

    if (imageFiles.length !== selectedFiles.length) {
      toast.warning(`${selectedFiles.length - imageFiles.length} non-image files were excluded`);
    }

    // Check file size (50MB max)
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    const validFiles = [];
    const invalidFiles = [];

    for (const file of imageFiles) {
      if (file.size === 0) {
        invalidFiles.push({ name: file.name, reason: 'File is empty' });
      } else if (file.size > MAX_FILE_SIZE) {
        invalidFiles.push({ name: file.name, reason: 'File too large (max 50MB)' });
      } else {
        validFiles.push(file);
      }
    }

    if (invalidFiles.length > 0) {
      invalidFiles.forEach(f => toast.error(`${f.name}: ${f.reason}`));
    }

    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);
      setDuplicateFiles([]); // Clear duplicate status when new files added
    }
  }, [files.length]);

  const removeFile = useCallback((index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setDuplicateFiles(prev => prev.filter(i => i !== index));
  }, []);

  const handleUpload = useCallback(async () => {
    if (files.length === 0) {
      toast.error('Please select photos to upload');
      return;
    }

    if (files.length > MAX_UPLOAD_LIMIT) {
      toast.error(`You can only upload up to ${MAX_UPLOAD_LIMIT} photos at a time.`);
      return;
    }

    setUploading(true);
    setUploadProgress({});
    setDuplicateFiles([]);
    let successCount = 0;
    let duplicateCount = 0;
    let failCount = 0;

    try {
      // Step 1: Compute content hashes for duplicate detection
      toast.info('Checking for duplicates...', { duration: 2000 });
      
      const hashes = [];
      const fileHashMap = new Map();
      
      for (let i = 0; i < files.length; i++) {
        setUploadProgress(prev => ({ 
          ...prev, 
          [i]: { status: 'hashing', progress: 0 } 
        }));
        
        try {
          const hash = await calculateFileHash(files[i]);
          hashes.push(hash);
          fileHashMap.set(i, hash);
        } catch (e) {
          console.warn(`Could not hash ${files[i].name}, using filename fallback`);
          hashes.push(null);
        }
      }

      // Step 2: Check for duplicates on server
      let filesToUpload = [...files];
      let indicesToUpload = files.map((_, i) => i);
      
      try {
        const checkResponse = await axios.post(
          `${API}/api/public/gallery/${shareLink}/check-duplicates`,
          { 
            filenames: files.map(f => f.name),
            hashes: hashes
          }
        );
        
        const { duplicates, new_files } = checkResponse.data;
        
        if (duplicates.length > 0) {
          toast.warning(`${duplicates.length} photo(s) already in gallery`, {
            description: duplicates.length === 1 
              ? 'This exact photo was already uploaded before'
              : `${duplicates.slice(0, 2).join(', ')}${duplicates.length > 2 ? ` and ${duplicates.length - 2} more` : ''} are duplicates`,
            duration: 4000
          });
          
          // Mark duplicate files
          const duplicateSet = new Set(duplicates.map(d => d.toLowerCase()));
          const dupIndices = [];
          filesToUpload = [];
          indicesToUpload = [];
          
          files.forEach((file, index) => {
            if (duplicateSet.has(file.name.toLowerCase())) {
              dupIndices.push(index);
              setUploadProgress(prev => ({ 
                ...prev, 
                [index]: { status: 'duplicate', progress: 100 } 
              }));
              duplicateCount++;
            } else {
              filesToUpload.push(file);
              indicesToUpload.push(index);
            }
          });
          
          setDuplicateFiles(dupIndices);
        }
        
        if (new_files.length === 0) {
          toast.info('All selected photos have already been uploaded');
          setUploading(false);
          return;
        }
      } catch (error) {
        console.warn('Duplicate check failed, proceeding with upload:', error);
      }

      // Step 3: Sequential upload - one file at a time
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        const originalIndex = indicesToUpload[i];
        const formData = new FormData();
        formData.append('file', file);
        if (guestName.trim()) {
          formData.append('guest_name', guestName.trim());
        }
        
        // Add hash if available for server-side verification
        const hash = fileHashMap.get(originalIndex);
        if (hash) {
          formData.append('content_hash', hash);
        }

        try {
          setUploadProgress(prev => ({ 
            ...prev, 
            [originalIndex]: { status: 'uploading', progress: 0 } 
          }));

          await axios.post(
            `${API}/api/public/gallery/${shareLink}/upload`,
            formData,
            {
              headers: { 'Content-Type': 'multipart/form-data' },
              onUploadProgress: (progressEvent) => {
                const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                setUploadProgress(prev => ({ 
                  ...prev, 
                  [originalIndex]: { status: 'uploading', progress: percent } 
                }));
              }
            }
          );

          setUploadProgress(prev => ({ 
            ...prev, 
            [originalIndex]: { status: 'success', progress: 100 } 
          }));
          successCount++;
          setUploadedCount(prev => prev + 1);
        } catch (error) {
          console.error(`Failed to upload ${file.name}:`, error);
          const isDuplicate = error.response?.status === 409;
          
          setUploadProgress(prev => ({ 
            ...prev, 
            [originalIndex]: { 
              status: isDuplicate ? 'duplicate' : 'error', 
              progress: 100 
            } 
          }));
          
          if (isDuplicate) {
            duplicateCount++;
          } else {
            failCount++;
          }
        }
      }

      // Show result messages
      if (successCount > 0) {
        toast.success(`${successCount} photo(s) uploaded successfully!`);
        // Clear successfully uploaded files
        const successIndices = new Set();
        Object.entries(uploadProgress).forEach(([idx, data]) => {
          if (data.status === 'success') successIndices.add(parseInt(idx));
        });
        
        // Keep only failed files for retry
        if (failCount === 0) {
          setFiles([]);
          setUploadProgress({});
          onUploadComplete?.(successCount);
        }
      }
      
      if (duplicateCount > 0) {
        toast.warning(`${duplicateCount} duplicate photo(s) skipped`);
      }
      
      if (failCount > 0) {
        toast.error(`${failCount} photo(s) failed to upload`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [files, guestName, shareLink, onUploadComplete, uploadProgress]);

  const getProgressStatus = (index) => {
    const progress = uploadProgress[index];
    if (!progress) return null;
    return progress;
  };

  return (
    <div 
      className="min-h-screen"
      style={{ backgroundColor }}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 backdrop-blur-md bg-white/80 dark:bg-zinc-900/80 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${accentColor}20` }}
            >
              <Camera className="w-5 h-5" style={{ color: accentColor }} />
            </div>
            <div>
              <h1 className="font-semibold text-zinc-900 dark:text-white text-sm">
                {gallery?.event_title || gallery?.title}
              </h1>
              <p className="text-xs text-zinc-500 flex items-center gap-1">
                <Wifi className="w-3 h-3" />
                Quick Upload Mode
              </p>
            </div>
          </div>
          <button
            onClick={onSwitchToFull}
            className="text-sm flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            style={{ color: accentColor }}
          >
            View Full Gallery
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Event Info Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-zinc-800 rounded-2xl shadow-lg p-6 mb-6"
        >
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
              Share Your Moments
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 mt-2">
              Upload your photos from {gallery?.event_title || 'the event'}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              Maximum {MAX_UPLOAD_LIMIT} photos per upload
            </p>
          </div>

          {/* Guest Name Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Your Name (optional)
            </label>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white focus:ring-2 focus:ring-offset-0 transition-all"
              style={{ focusRingColor: accentColor }}
              disabled={uploading}
            />
          </div>

          {/* Upload Area */}
          <div
            onClick={() => !uploading && files.length < MAX_UPLOAD_LIMIT && fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
              transition-all duration-300
              ${uploading || files.length >= MAX_UPLOAD_LIMIT ? 'border-zinc-300 bg-zinc-50 cursor-not-allowed' : 'border-zinc-300 hover:border-zinc-400 dark:border-zinc-600 dark:hover:border-zinc-500'}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
              disabled={uploading || files.length >= MAX_UPLOAD_LIMIT}
            />
            
            <CloudUpload 
              className="w-12 h-12 mx-auto mb-4"
              style={{ color: uploading || files.length >= MAX_UPLOAD_LIMIT ? '#9ca3af' : accentColor }}
            />
            <p className="text-lg font-medium text-zinc-900 dark:text-white">
              {uploading ? 'Uploading...' : files.length >= MAX_UPLOAD_LIMIT ? `Maximum ${MAX_UPLOAD_LIMIT} photos reached` : 'Tap to select photos'}
            </p>
            <p className="text-sm text-zinc-500 mt-1">
              {files.length >= MAX_UPLOAD_LIMIT 
                ? 'Remove some photos to add more' 
                : `Select up to ${MAX_UPLOAD_LIMIT - files.length} more photo${MAX_UPLOAD_LIMIT - files.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          {/* Selected Files List */}
          {files.length > 0 && (
            <div className="mt-6 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Selected: {files.length}/{MAX_UPLOAD_LIMIT} photo{files.length !== 1 ? 's' : ''}
                </p>
                {files.length >= MAX_UPLOAD_LIMIT && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                    Limit reached
                  </span>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {files.map((file, index) => {
                  const progress = getProgressStatus(index);
                  const isDuplicate = progress?.status === 'duplicate' || duplicateFiles.includes(index);
                  const isError = progress?.status === 'error';
                  const isSuccess = progress?.status === 'success';
                  const isUploading = progress?.status === 'uploading';
                  const isHashing = progress?.status === 'hashing';
                  
                  return (
                    <div
                      key={index}
                      className={`flex items-center gap-3 p-2 rounded-lg ${
                        isDuplicate ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200' :
                        isError ? 'bg-red-50 dark:bg-red-900/20 border border-red-200' :
                        isSuccess ? 'bg-green-50 dark:bg-green-900/20 border border-green-200' :
                        'bg-zinc-50 dark:bg-zinc-700'
                      }`}
                    >
                      <div className="w-10 h-10 rounded bg-zinc-200 dark:bg-zinc-600 flex items-center justify-center overflow-hidden">
                        <img
                          src={URL.createObjectURL(file)}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-900 dark:text-white truncate">
                          {file.name}
                        </p>
                        {progress && (
                          <div className="mt-1">
                            {isDuplicate ? (
                              <span className="text-xs text-amber-600 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Already uploaded
                              </span>
                            ) : isError ? (
                              <span className="text-xs text-red-500 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> Failed
                              </span>
                            ) : isSuccess ? (
                              <span className="text-xs text-green-500 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Uploaded
                              </span>
                            ) : isHashing ? (
                              <span className="text-xs text-blue-500 flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" /> Checking...
                              </span>
                            ) : isUploading ? (
                              <div className="h-1.5 bg-zinc-200 dark:bg-zinc-600 rounded-full overflow-hidden">
                                <div
                                  className="h-full transition-all duration-300"
                                  style={{ 
                                    width: `${progress.progress}%`,
                                    backgroundColor: accentColor
                                  }}
                                />
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                      {!uploading && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(index);
                          }}
                          className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-600 rounded-full transition-colors"
                        >
                          <X className="w-4 h-4 text-zinc-500" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Upload Button */}
          {files.length > 0 && (
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="w-full mt-6 py-4 rounded-xl font-semibold text-white transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: accentColor }}
              data-testid="lite-upload-button"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Uploading {uploadedCount} of {files.length}...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  Upload {files.length} Photo{files.length !== 1 ? 's' : ''}
                </>
              )}
            </button>
          )}
        </motion.div>

        {/* Success Message */}
        {uploadedCount > 0 && !uploading && files.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-6 text-center"
          >
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-500" />
            <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">
              Thank you for sharing!
            </h3>
            <p className="text-green-700 dark:text-green-300 mt-1">
              {uploadedCount} photo{uploadedCount !== 1 ? 's' : ''} uploaded successfully
            </p>
            <button
              onClick={onSwitchToFull}
              className="mt-4 px-6 py-2 rounded-full text-sm font-medium transition-colors"
              style={{ 
                backgroundColor: `${accentColor}20`,
                color: accentColor
              }}
            >
              View Full Gallery →
            </button>
          </motion.div>
        )}

        {/* Footer Link */}
        <div className="mt-8 text-center">
          <button
            onClick={onSwitchToFull}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            Want to see all the photos? <span style={{ color: accentColor }}>View Full Gallery</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default LiteUploadPage;
