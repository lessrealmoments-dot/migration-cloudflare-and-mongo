import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, ZoomIn, ZoomOut, Check, X, AlertCircle, Image } from 'lucide-react';
import { toast } from 'sonner';

const VideoThumbnailCropper = ({ 
  onSave, 
  onCancel, 
  currentThumbnail = null,
  aspectRatio = 16/9 
}) => {
  const [image, setImage] = useState(null);
  const [imageUrl, setImageUrl] = useState(currentThumbnail);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [cropWarning, setCropWarning] = useState(null);
  const [uploading, setUploading] = useState(false);
  
  const containerRef = useRef(null);
  const imageRef = useRef(null);
  const fileInputRef = useRef(null);
  
  // Calculate if image will be cropped
  useEffect(() => {
    if (!imageSize.width || !imageSize.height) {
      setCropWarning(null);
      return;
    }
    
    const imageRatio = imageSize.width / imageSize.height;
    const targetRatio = aspectRatio;
    
    if (Math.abs(imageRatio - targetRatio) < 0.01) {
      setCropWarning({ type: 'perfect', message: 'Perfect fit! No cropping needed.' });
    } else if (imageRatio > targetRatio) {
      // Image is wider - sides will be cropped
      const visiblePercent = Math.round((targetRatio / imageRatio) * 100);
      setCropWarning({ 
        type: 'horizontal', 
        message: `Image will be cropped on the sides (${visiblePercent}% visible width)` 
      });
    } else {
      // Image is taller - top/bottom will be cropped
      const visiblePercent = Math.round((imageRatio / targetRatio) * 100);
      setCropWarning({ 
        type: 'vertical', 
        message: `Image will be cropped on top/bottom (${visiblePercent}% visible height)` 
      });
    }
  }, [imageSize, aspectRatio]);
  
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement('img');
      img.onload = () => {
        setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
        setImage(file);
        setImageUrl(e.target.result);
        setScale(1);
        setPosition({ x: 50, y: 50 });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };
  
  const handleMouseDown = (e) => {
    if (!imageUrl) return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };
  
  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    
    const newX = Math.max(0, Math.min(100, e.clientX - dragStart.x));
    const newY = Math.max(0, Math.min(100, e.clientY - dragStart.y));
    
    setPosition({ x: newX, y: newY });
  }, [isDragging, dragStart]);
  
  const handleMouseUp = () => {
    setIsDragging(false);
  };
  
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove]);
  
  const handleSave = async () => {
    if (!image) {
      toast.error('Please select an image first');
      return;
    }
    
    setUploading(true);
    
    try {
      // Create a canvas to crop the image
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = imageRef.current;
      
      // Set output dimensions (16:9 at 1920px wide)
      canvas.width = 1920;
      canvas.height = Math.round(1920 / aspectRatio);
      
      // Calculate crop area based on position and scale
      const imgWidth = img.naturalWidth;
      const imgHeight = img.naturalHeight;
      
      // The visible area in the preview
      const visibleWidth = imgWidth / scale;
      const visibleHeight = imgHeight / scale;
      
      // Source coordinates
      const sx = ((position.x / 100) * imgWidth) - (visibleWidth / 2);
      const sy = ((position.y / 100) * imgHeight) - (visibleHeight / 2);
      
      // Draw with white background
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw the cropped image
      ctx.drawImage(
        img,
        Math.max(0, sx), Math.max(0, sy),
        Math.min(visibleWidth, imgWidth - sx), Math.min(visibleHeight, imgHeight - sy),
        0, 0,
        canvas.width, canvas.height
      );
      
      // Convert to blob
      const blob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/jpeg', 0.9);
      });
      
      // Create file for upload
      const croppedFile = new File([blob], 'thumbnail.jpg', { type: 'image/jpeg' });
      
      await onSave(croppedFile, { scale, x: position.x, y: position.y });
      
    } catch (error) {
      console.error('Error cropping image:', error);
      toast.error('Failed to process image');
    } finally {
      setUploading(false);
    }
  };
  
  return (
    <div className="bg-zinc-900 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <Image className="w-5 h-5" />
        Custom Thumbnail
      </h3>
      
      {/* Upload Area / Preview */}
      <div 
        ref={containerRef}
        className="relative aspect-video bg-black rounded-lg overflow-hidden mb-4"
      >
        {imageUrl ? (
          <>
            {/* Cropped preview with overlay */}
            <div 
              className="absolute inset-0 cursor-move"
              onMouseDown={handleMouseDown}
            >
              <img 
                ref={imageRef}
                src={imageUrl}
                alt="Thumbnail preview"
                className="w-full h-full object-cover"
                style={{
                  transform: `scale(${scale})`,
                  objectPosition: `${position.x}% ${position.y}%`
                }}
                draggable={false}
              />
            </div>
            
            {/* Crop zone indicator */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Dimmed overlay for cropped areas */}
              <div className="absolute inset-0 border-2 border-white/50" />
              
              {/* Corner indicators */}
              <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-white" />
              <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-white" />
              <div className="absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-white" />
              <div className="absolute bottom-2 right-2 w-6 h-6 border-b-2 border-r-2 border-white" />
              
              {/* Center crosshair */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8">
                <div className="absolute top-1/2 left-0 right-0 h-px bg-white/30" />
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/30" />
              </div>
            </div>
            
            {/* Drag instruction */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1 rounded-full">
              Drag to reposition
            </div>
          </>
        ) : (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors"
          >
            <Upload className="w-10 h-10 text-zinc-500 mb-2" />
            <p className="text-zinc-400 text-sm">Click to upload thumbnail</p>
            <p className="text-zinc-600 text-xs mt-1">Recommended: 1920x1080 (16:9)</p>
          </div>
        )}
      </div>
      
      {/* Crop Warning */}
      {cropWarning && imageUrl && (
        <div className={`flex items-center gap-2 mb-4 p-3 rounded-lg ${
          cropWarning.type === 'perfect' 
            ? 'bg-green-500/10 border border-green-500/20 text-green-400'
            : 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-400'
        }`}>
          {cropWarning.type === 'perfect' ? (
            <Check className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          )}
          <span className="text-sm">{cropWarning.message}</span>
        </div>
      )}
      
      {/* Zoom Control */}
      {imageUrl && (
        <div className="flex items-center gap-4 mb-4">
          <span className="text-zinc-400 text-sm">Zoom:</span>
          <button
            onClick={() => setScale(Math.max(1, scale - 0.1))}
            className="p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors"
          >
            <ZoomOut className="w-4 h-4 text-white" />
          </button>
          <input 
            type="range"
            min="1"
            max="2"
            step="0.05"
            value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
            className="flex-1 accent-purple-500"
          />
          <button
            onClick={() => setScale(Math.min(2, scale + 0.1))}
            className="p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors"
          >
            <ZoomIn className="w-4 h-4 text-white" />
          </button>
          <span className="text-zinc-500 text-sm w-12 text-right">{Math.round(scale * 100)}%</span>
        </div>
      )}
      
      {/* Hidden file input */}
      <input 
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      
      {/* Actions */}
      <div className="flex gap-3">
        {imageUrl && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 py-3 border border-zinc-700 text-white rounded-lg hover:bg-zinc-800 transition-colors text-sm"
          >
            Change Image
          </button>
        )}
        <button
          onClick={onCancel}
          className="flex-1 py-3 border border-zinc-700 text-zinc-400 rounded-lg hover:bg-zinc-800 transition-colors text-sm"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!imageUrl || uploading}
          className="flex-1 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2"
        >
          {uploading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              Save Thumbnail
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default VideoThumbnailCropper;
