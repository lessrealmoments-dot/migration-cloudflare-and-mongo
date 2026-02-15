import React, { useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  Upload, Image, CheckCircle2, AlertCircle, 
  ExternalLink, Camera, CloudUpload, X,
  Loader2, Wifi
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * LiteUploadPage - Minimal upload interface for slow connections
 * Shows only essential elements: event info, upload area, and link to full gallery
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
  const fileInputRef = useRef(null);

  const accentColor = themeColors?.accent || '#3b82f6';
  const backgroundColor = themeColors?.background || '#ffffff';
  const textColor = themeColors?.text || '#1f2937';

  const handleFileSelect = useCallback((e) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    // Filter for images only
    const imageFiles = selectedFiles.filter(file => 
      file.type.startsWith('image/')
    );

    if (imageFiles.length !== selectedFiles.length) {
      toast.warning(`${selectedFiles.length - imageFiles.length} non-image files were excluded`);
    }

    setFiles(prev => [...prev, ...imageFiles]);
  }, []);

  const removeFile = useCallback((index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpload = useCallback(async () => {
    if (files.length === 0) {
      toast.error('Please select photos to upload');
      return;
    }

    setUploading(true);
    let successCount = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);
        if (guestName.trim()) {
          formData.append('guest_name', guestName.trim());
        }

        try {
          setUploadProgress(prev => ({ ...prev, [i]: 0 }));

          await axios.post(
            `${API}/public/gallery/${shareLink}/upload`,
            formData,
            {
              headers: { 'Content-Type': 'multipart/form-data' },
              onUploadProgress: (progressEvent) => {
                const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                setUploadProgress(prev => ({ ...prev, [i]: percent }));
              }
            }
          );

          setUploadProgress(prev => ({ ...prev, [i]: 100 }));
          successCount++;
          setUploadedCount(prev => prev + 1);
        } catch (error) {
          console.error(`Failed to upload ${file.name}:`, error);
          setUploadProgress(prev => ({ ...prev, [i]: -1 })); // -1 indicates error
        }
      }

      if (successCount === files.length) {
        toast.success(`All ${successCount} photos uploaded successfully!`);
        setFiles([]);
        setUploadProgress({});
        onUploadComplete?.(successCount);
      } else if (successCount > 0) {
        toast.warning(`${successCount} of ${files.length} photos uploaded`);
      } else {
        toast.error('Upload failed. Please try again.');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [files, guestName, shareLink, onUploadComplete]);

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
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
              transition-all duration-300
              ${uploading ? 'border-zinc-300 bg-zinc-50' : 'border-zinc-300 hover:border-zinc-400 dark:border-zinc-600 dark:hover:border-zinc-500'}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
              disabled={uploading}
            />
            
            <CloudUpload 
              className="w-12 h-12 mx-auto mb-4"
              style={{ color: uploading ? '#9ca3af' : accentColor }}
            />
            <p className="text-lg font-medium text-zinc-900 dark:text-white">
              {uploading ? 'Uploading...' : 'Tap to select photos'}
            </p>
            <p className="text-sm text-zinc-500 mt-1">
              or drag and drop your images here
            </p>
          </div>

          {/* Selected Files List */}
          {files.length > 0 && (
            <div className="mt-6 space-y-2">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Selected: {files.length} photo{files.length !== 1 ? 's' : ''}
              </p>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-2 bg-zinc-50 dark:bg-zinc-700 rounded-lg"
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
                      {uploadProgress[index] !== undefined && (
                        <div className="mt-1">
                          {uploadProgress[index] === -1 ? (
                            <span className="text-xs text-red-500 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> Failed
                            </span>
                          ) : uploadProgress[index] === 100 ? (
                            <span className="text-xs text-green-500 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Uploaded
                            </span>
                          ) : (
                            <div className="h-1.5 bg-zinc-200 dark:bg-zinc-600 rounded-full overflow-hidden">
                              <div
                                className="h-full transition-all duration-300"
                                style={{ 
                                  width: `${uploadProgress[index]}%`,
                                  backgroundColor: accentColor
                                }}
                              />
                            </div>
                          )}
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
                ))}
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
