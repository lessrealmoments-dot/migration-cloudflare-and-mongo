import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, X, Star, Check, AlertCircle, Loader2, 
  Image as ImageIcon, Trash2, RotateCcw, Zap,
  CheckCircle, ChevronUp, ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';

const MAX_HIGHLIGHTS = 5;

/**
 * Premium Photo Upload Component
 * 
 * Features:
 * - Drag & drop with preview grid
 * - Highlight selection (max 5)
 * - Smart adaptive upload with speed detection
 * - Individual progress bars
 * - Batch actions (select all, delete, highlight)
 */
const PremiumPhotoUpload = ({
  onUpload,
  onComplete,
  maxFiles = 500,
  maxFileSize = 50 * 1024 * 1024, // 50MB
  acceptedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  existingHighlights = 0,
  disabled = false,
  className = '',
}) => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);
  const [uploadStats, setUploadStats] = useState({ completed: 0, failed: 0, total: 0 });
  const [showUploadPanel, setShowUploadPanel] = useState(true);
  const fileInputRef = useRef(null);

  // Calculate remaining highlight slots
  const remainingHighlightSlots = MAX_HIGHLIGHTS - existingHighlights;
  const currentHighlights = files.filter(f => f.isHighlight).length;

  // Handle drag events
  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  // Handle drop
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files).filter(file => 
      acceptedTypes.includes(file.type) || file.type.startsWith('image/')
    );
    
    addFiles(droppedFiles);
  }, [acceptedTypes]);

  // Add files to queue
  const addFiles = useCallback((newFiles) => {
    const validFiles = newFiles.filter(file => {
      if (file.size > maxFileSize) {
        toast.error(`${file.name} is too large (max ${maxFileSize / 1024 / 1024}MB)`);
        return false;
      }
      return true;
    });

    if (files.length + validFiles.length > maxFiles) {
      toast.error(`Maximum ${maxFiles} files allowed`);
      return;
    }

    const filesWithPreview = validFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      name: file.name,
      size: file.size,
      preview: URL.createObjectURL(file),
      status: 'pending', // pending, uploading, success, error
      progress: 0,
      isHighlight: false,
      isSelected: false,
      error: null,
    }));

    setFiles(prev => [...prev, ...filesWithPreview]);
  }, [files.length, maxFiles, maxFileSize]);

  // Handle file input change
  const handleFileSelect = useCallback((e) => {
    const selectedFiles = Array.from(e.target.files);
    addFiles(selectedFiles);
    e.target.value = ''; // Reset input
  }, [addFiles]);

  // Toggle highlight for a file
  const toggleHighlight = useCallback((fileId) => {
    setFiles(prev => prev.map(f => {
      if (f.id === fileId) {
        if (!f.isHighlight && currentHighlights >= remainingHighlightSlots) {
          toast.error(`Maximum ${MAX_HIGHLIGHTS} highlights allowed (${existingHighlights} already set)`);
          return f;
        }
        return { ...f, isHighlight: !f.isHighlight };
      }
      return f;
    }));
  }, [currentHighlights, remainingHighlightSlots, existingHighlights]);

  // Toggle selection
  const toggleSelect = useCallback((fileId) => {
    setFiles(prev => {
      const updated = prev.map(f => 
        f.id === fileId ? { ...f, isSelected: !f.isSelected } : f
      );
      setSelectedCount(updated.filter(f => f.isSelected).length);
      return updated;
    });
  }, []);

  // Select all
  const selectAll = useCallback(() => {
    setFiles(prev => {
      const allSelected = prev.every(f => f.isSelected);
      const updated = prev.map(f => ({ ...f, isSelected: !allSelected }));
      setSelectedCount(allSelected ? 0 : updated.length);
      return updated;
    });
  }, []);

  // Remove file
  const removeFile = useCallback((fileId) => {
    setFiles(prev => {
      const file = prev.find(f => f.id === fileId);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
      const updated = prev.filter(f => f.id !== fileId);
      setSelectedCount(updated.filter(f => f.isSelected).length);
      return updated;
    });
  }, []);

  // Remove selected files
  const removeSelected = useCallback(() => {
    setFiles(prev => {
      prev.filter(f => f.isSelected).forEach(f => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });
      return prev.filter(f => !f.isSelected);
    });
    setSelectedCount(0);
  }, []);

  // Highlight selected files
  const highlightSelected = useCallback(() => {
    const selectedFiles = files.filter(f => f.isSelected && !f.isHighlight);
    const availableSlots = remainingHighlightSlots - currentHighlights;
    
    if (selectedFiles.length > availableSlots) {
      toast.error(`Can only add ${availableSlots} more highlights`);
    }
    
    let added = 0;
    setFiles(prev => prev.map(f => {
      if (f.isSelected && !f.isHighlight && added < availableSlots) {
        added++;
        return { ...f, isHighlight: true };
      }
      return f;
    }));
  }, [files, remainingHighlightSlots, currentHighlights]);

  // Clear all highlights
  const clearHighlights = useCallback(() => {
    setFiles(prev => prev.map(f => ({ ...f, isHighlight: false })));
  }, []);

  // Start upload
  const startUpload = useCallback(async () => {
    if (files.length === 0 || uploading) return;
    
    setUploading(true);
    setUploadStats({ completed: 0, failed: 0, total: files.length });
    
    const highlights = files.filter(f => f.isHighlight).map(f => f.id);
    
    // Call parent upload handler with files and highlights
    if (onUpload) {
      await onUpload(files, highlights, {
        onProgress: (fileId, progress) => {
          setFiles(prev => prev.map(f => 
            f.id === fileId ? { ...f, progress, status: 'uploading' } : f
          ));
        },
        onSuccess: (fileId, response) => {
          setFiles(prev => prev.map(f => 
            f.id === fileId ? { ...f, status: 'success', progress: 100 } : f
          ));
          setUploadStats(prev => ({ ...prev, completed: prev.completed + 1 }));
        },
        onError: (fileId, error) => {
          setFiles(prev => prev.map(f => 
            f.id === fileId ? { ...f, status: 'error', error: error.message } : f
          ));
          setUploadStats(prev => ({ ...prev, failed: prev.failed + 1 }));
        },
      });
    }
    
    setUploading(false);
    if (onComplete) {
      onComplete(files.filter(f => f.status === 'success'));
    }
  }, [files, uploading, onUpload, onComplete]);

  // Cleanup previews on unmount
  useEffect(() => {
    return () => {
      files.forEach(f => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });
    };
  }, []);

  const pendingFiles = files.filter(f => f.status === 'pending');
  const hasHighlights = files.some(f => f.isHighlight);

  return (
    <div className={`bg-white rounded-2xl shadow-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div 
        className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-zinc-50 to-white border-b border-zinc-100 cursor-pointer"
        onClick={() => setShowUploadPanel(!showUploadPanel)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-xl">
            <Upload className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-zinc-800">Upload Photos</h3>
            <p className="text-sm text-zinc-500">
              {files.length > 0 ? `${files.length} photos ready` : 'Drag & drop or click to upload'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {currentHighlights > 0 && (
            <span className="flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">
              <Star className="w-4 h-4" fill="currentColor" />
              {currentHighlights} highlight{currentHighlights !== 1 ? 's' : ''}
            </span>
          )}
          {showUploadPanel ? <ChevronUp className="w-5 h-5 text-zinc-400" /> : <ChevronDown className="w-5 h-5 text-zinc-400" />}
        </div>
      </div>

      <AnimatePresence>
        {showUploadPanel && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="p-6">
              {/* Drop Zone */}
              <div
                className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                  dragActive 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-zinc-200 hover:border-zinc-300 bg-zinc-50/50'
                } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => !disabled && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={acceptedTypes.join(',')}
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={disabled}
                />
                
                <div className="flex flex-col items-center gap-3">
                  <div className={`p-4 rounded-full ${dragActive ? 'bg-blue-100' : 'bg-zinc-100'}`}>
                    <ImageIcon className={`w-8 h-8 ${dragActive ? 'text-blue-500' : 'text-zinc-400'}`} />
                  </div>
                  <div>
                    <p className="font-medium text-zinc-700">
                      {dragActive ? 'Drop photos here' : 'Drag & drop photos'}
                    </p>
                    <p className="text-sm text-zinc-500 mt-1">
                      or <span className="text-blue-600 cursor-pointer">browse</span> to select files
                    </p>
                  </div>
                  <p className="text-xs text-zinc-400">
                    JPG, PNG, WebP, HEIC • Max {maxFileSize / 1024 / 1024}MB per file
                  </p>
                </div>
              </div>

              {/* Highlight Info */}
              {files.length > 0 && (
                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <Star className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="currentColor" />
                    <div>
                      <p className="font-medium text-amber-800">Select up to {remainingHighlightSlots} highlights</p>
                      <p className="text-sm text-amber-600 mt-1">
                        Click the star icon on photos to mark them as highlights. 
                        {existingHighlights > 0 && ` (${existingHighlights} already selected in gallery)`}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Batch Actions */}
              {files.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    onClick={selectAll}
                    className="px-3 py-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-800 hover:bg-zinc-100 rounded-lg transition-colors"
                  >
                    {selectedCount === files.length ? 'Deselect All' : 'Select All'}
                  </button>
                  {selectedCount > 0 && (
                    <>
                      <span className="text-zinc-300">|</span>
                      <button
                        onClick={highlightSelected}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                      >
                        <Star className="w-4 h-4" />
                        Highlight ({selectedCount})
                      </button>
                      <button
                        onClick={removeSelected}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Remove ({selectedCount})
                      </button>
                    </>
                  )}
                  {hasHighlights && (
                    <>
                      <span className="text-zinc-300">|</span>
                      <button
                        onClick={clearHighlights}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-zinc-500 hover:bg-zinc-100 rounded-lg transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Clear Highlights
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Photo Grid */}
              {files.length > 0 && (
                <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 max-h-[400px] overflow-y-auto pr-2">
                  {files.map((file, index) => (
                    <motion.div
                      key={file.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ delay: index * 0.02 }}
                      className={`relative aspect-square rounded-lg overflow-hidden group cursor-pointer ${
                        file.isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''
                      }`}
                      onClick={() => toggleSelect(file.id)}
                    >
                      {/* Preview Image */}
                      <img
                        src={file.preview}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                      
                      {/* Overlay */}
                      <div className={`absolute inset-0 transition-colors ${
                        file.status === 'error' ? 'bg-red-500/30' :
                        file.status === 'success' ? 'bg-green-500/20' :
                        file.isSelected ? 'bg-blue-500/20' : 'bg-black/0 group-hover:bg-black/20'
                      }`} />
                      
                      {/* Progress Bar */}
                      {file.status === 'uploading' && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-200">
                          <div 
                            className="h-full bg-blue-500 transition-all duration-300"
                            style={{ width: `${file.progress}%` }}
                          />
                        </div>
                      )}
                      
                      {/* Status Icon */}
                      {file.status === 'success' && (
                        <div className="absolute top-2 left-2 p-1 bg-green-500 rounded-full">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                      {file.status === 'error' && (
                        <div className="absolute top-2 left-2 p-1 bg-red-500 rounded-full">
                          <AlertCircle className="w-3 h-3 text-white" />
                        </div>
                      )}
                      {file.status === 'uploading' && (
                        <div className="absolute top-2 left-2 p-1 bg-blue-500 rounded-full">
                          <Loader2 className="w-3 h-3 text-white animate-spin" />
                        </div>
                      )}
                      
                      {/* Highlight Star */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleHighlight(file.id); }}
                        className={`absolute top-2 right-2 p-1.5 rounded-full transition-all ${
                          file.isHighlight 
                            ? 'bg-yellow-400 text-white' 
                            : 'bg-black/40 text-white/70 opacity-0 group-hover:opacity-100 hover:bg-black/60'
                        }`}
                        disabled={uploading}
                      >
                        <Star className="w-4 h-4" fill={file.isHighlight ? 'currentColor' : 'none'} />
                      </button>
                      
                      {/* Remove Button */}
                      {file.status === 'pending' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFile(file.id); }}
                          className="absolute bottom-2 right-2 p-1.5 rounded-full bg-black/40 text-white/70 opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                      
                      {/* Selection Checkbox */}
                      <div className={`absolute bottom-2 left-2 p-1 rounded ${
                        file.isSelected ? 'bg-blue-500' : 'bg-black/40 opacity-0 group-hover:opacity-100'
                      } transition-all`}>
                        <Check className={`w-4 h-4 ${file.isSelected ? 'text-white' : 'text-white/50'}`} />
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Upload Progress Stats */}
              {uploading && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-blue-500" />
                      <span className="font-medium text-blue-800">Uploading...</span>
                    </div>
                    <span className="text-sm text-blue-600">
                      {uploadStats.completed + uploadStats.failed} / {uploadStats.total}
                    </span>
                  </div>
                  <div className="h-2 bg-blue-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${((uploadStats.completed + uploadStats.failed) / uploadStats.total) * 100}%` }}
                    />
                  </div>
                  {uploadStats.failed > 0 && (
                    <p className="text-sm text-red-600 mt-2">
                      {uploadStats.failed} file{uploadStats.failed !== 1 ? 's' : ''} failed
                    </p>
                  )}
                </div>
              )}

              {/* Upload Button */}
              {pendingFiles.length > 0 && !uploading && (
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={() => { setFiles([]); setSelectedCount(0); }}
                    className="px-4 py-2 text-zinc-600 hover:text-zinc-800 hover:bg-zinc-100 rounded-lg transition-colors"
                  >
                    Clear All
                  </button>
                  <button
                    onClick={startUpload}
                    disabled={disabled}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-300 text-white font-medium rounded-xl transition-colors"
                  >
                    <Upload className="w-5 h-5" />
                    Upload {pendingFiles.length} Photo{pendingFiles.length !== 1 ? 's' : ''}
                    {currentHighlights > 0 && (
                      <span className="ml-1 px-2 py-0.5 bg-yellow-400 text-yellow-900 text-xs rounded-full">
                        {currentHighlights} ★
                      </span>
                    )}
                  </button>
                </div>
              )}

              {/* Upload Complete */}
              {!uploading && uploadStats.total > 0 && uploadStats.completed === uploadStats.total && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
                  <CheckCircle className="w-6 h-6 text-green-500" />
                  <div>
                    <p className="font-medium text-green-800">Upload Complete!</p>
                    <p className="text-sm text-green-600">
                      {uploadStats.completed} photo{uploadStats.completed !== 1 ? 's' : ''} uploaded successfully
                    </p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PremiumPhotoUpload;
