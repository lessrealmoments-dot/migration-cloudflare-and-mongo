import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, Check, X, RotateCcw, Grid3X3, ArrowUp, ArrowDown, Maximize2 } from 'lucide-react';

const CoverPhotoEditor = ({ 
  imageUrl, 
  initialSettings = {}, 
  onSave, 
  onCancel,
  aspectRatio = 3
}) => {
  const [scale, setScale] = useState(initialSettings.scale || 1);
  const [position, setPosition] = useState({
    x: initialSettings.positionX || 50,
    y: initialSettings.positionY || 50
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastTouchDistance, setLastTouchDistance] = useState(null);
  const [showPresets, setShowPresets] = useState(false);
  const containerRef = useRef(null);

  // Quick position presets
  const presets = [
    { name: 'Center', icon: Grid3X3, scale: 1, x: 50, y: 50 },
    { name: 'Focus Top (Faces)', icon: ArrowUp, scale: 1.2, x: 50, y: 30 },
    { name: 'Focus Bottom', icon: ArrowDown, scale: 1.2, x: 50, y: 70 },
    { name: 'Wide Landscape', icon: Maximize2, scale: 1, x: 50, y: 50 },
    { name: 'Zoom Center', icon: ZoomIn, scale: 1.5, x: 50, y: 50 },
  ];

  const applyPreset = (preset) => {
    setScale(preset.scale);
    setPosition({ x: preset.x, y: preset.y });
    setShowPresets(false);
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.1, 3));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.1, 1));
  };

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 50, y: 50 });
  };

  // Calculate distance between two touch points
  const getTouchDistance = (touches) => {
    if (touches.length < 2) return null;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Get center point of two touches
  const getTouchCenter = (touches) => {
    if (touches.length < 2) return null;
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  };

  // Constrain position based on zoom level
  const constrainPosition = useCallback((x, y, currentScale) => {
    const maxOffset = (currentScale - 1) * 50;
    return {
      x: Math.max(50 - maxOffset, Math.min(50 + maxOffset, x)),
      y: Math.max(50 - maxOffset, Math.min(50 + maxOffset, y))
    };
  }, []);

  // Mouse handlers
  const handleMouseDown = (e) => {
    if (scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  const handleMouseMove = (e) => {
    if (!isDragging || scale <= 1) return;
    const newPos = constrainPosition(
      e.clientX - dragStart.x,
      e.clientY - dragStart.y,
      scale
    );
    setPosition(newPos);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setLastTouchDistance(null);
  };

  // Touch handlers - optimized for mobile
  const handleTouchStart = (e) => {
    e.preventDefault();
    
    if (e.touches.length === 2) {
      // Pinch-to-zoom start
      const distance = getTouchDistance(e.touches);
      setLastTouchDistance(distance);
      setIsDragging(false);
    } else if (e.touches.length === 1 && scale > 1) {
      // Single finger drag (only when zoomed)
      const touch = e.touches[0];
      setIsDragging(true);
      setDragStart({
        x: touch.clientX - position.x,
        y: touch.clientY - position.y
      });
    }
  };

  const handleTouchMove = (e) => {
    e.preventDefault();
    
    if (e.touches.length === 2) {
      // Pinch-to-zoom
      const newDistance = getTouchDistance(e.touches);
      if (lastTouchDistance && newDistance) {
        const scaleChange = (newDistance - lastTouchDistance) / 200;
        const newScale = Math.max(1, Math.min(3, scale + scaleChange));
        setScale(newScale);
        
        // Adjust position constraints when scale changes
        const newPos = constrainPosition(position.x, position.y, newScale);
        setPosition(newPos);
      }
      setLastTouchDistance(newDistance);
      setIsDragging(false);
    } else if (e.touches.length === 1 && isDragging && scale > 1) {
      // Single finger drag
      const touch = e.touches[0];
      const newPos = constrainPosition(
        touch.clientX - dragStart.x,
        touch.clientY - dragStart.y,
        scale
      );
      setPosition(newPos);
    }
  };

  const handleTouchEnd = (e) => {
    if (e.touches.length === 0) {
      setIsDragging(false);
      setLastTouchDistance(null);
    } else if (e.touches.length === 1) {
      // Switched from pinch to single finger
      setLastTouchDistance(null);
      if (scale > 1) {
        const touch = e.touches[0];
        setDragStart({
          x: touch.clientX - position.x,
          y: touch.clientY - position.y
        });
        setIsDragging(true);
      }
    }
  };

  const handleSave = () => {
    onSave({
      scale,
      positionX: position.x,
      positionY: position.y
    });
  };

  useEffect(() => {
    const handleGlobalEnd = () => {
      setIsDragging(false);
      setLastTouchDistance(null);
    };
    window.addEventListener('mouseup', handleGlobalEnd);
    window.addEventListener('touchend', handleGlobalEnd);
    return () => {
      window.removeEventListener('mouseup', handleGlobalEnd);
      window.removeEventListener('touchend', handleGlobalEnd);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-zinc-200 flex justify-between items-center">
          <h3 className="text-lg sm:text-xl font-medium">Adjust Cover Photo</h3>
          <button 
            onClick={onCancel} 
            className="p-2 hover:bg-zinc-100 rounded-full touch-manipulation"
            data-testid="close-cover-editor"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preview Area */}
        <div className="p-4 sm:p-6">
          {/* Instructions - different for touch vs mouse */}
          <p className="text-sm text-zinc-500 mb-4 text-center sm:text-left">
            <span className="hidden sm:inline">
              {scale > 1 ? 'Drag to reposition • ' : ''}Zoom in to adjust position
            </span>
            <span className="sm:hidden">
              Pinch to zoom • {scale > 1 ? 'Drag to reposition' : 'Zoom in to move'}
            </span>
          </p>
          
          {/* Cover preview container */}
          <div 
            ref={containerRef}
            className="relative w-full overflow-hidden rounded-lg border-2 border-zinc-300 bg-zinc-100 touch-none"
            style={{ 
              paddingBottom: `${100 / aspectRatio}%`,
              cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <img
              src={imageUrl}
              alt="Cover preview"
              className="absolute inset-0 w-full h-full select-none pointer-events-none"
              style={{
                objectFit: 'cover',
                objectPosition: `${position.x}% ${position.y}%`,
                transform: `scale(${scale})`,
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : 'transform 0.15s ease-out, object-position 0.15s ease-out'
              }}
              draggable={false}
            />
            
            {/* Grid overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-20">
              <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white"></div>
              <div className="absolute right-1/3 top-0 bottom-0 w-px bg-white"></div>
              <div className="absolute top-1/3 left-0 right-0 h-px bg-white"></div>
              <div className="absolute bottom-1/3 left-0 right-0 h-px bg-white"></div>
            </div>

            {/* Touch hint overlay */}
            {scale <= 1 && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none sm:hidden">
                <div className="bg-white/90 px-4 py-2 rounded-full text-sm font-medium">
                  Pinch to zoom in
                </div>
              </div>
            )}
          </div>

          {/* Quick Presets */}
          <div className="mt-4">
            <button
              onClick={() => setShowPresets(!showPresets)}
              className="text-sm text-zinc-600 hover:text-zinc-900 underline underline-offset-2 touch-manipulation"
              data-testid="quick-presets-toggle"
            >
              Quick Presets
            </button>
            
            {showPresets && (
              <div className="mt-3 flex flex-wrap gap-2">
                {presets.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => applyPreset(preset)}
                    className="flex items-center gap-2 px-3 py-2 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-sm transition-colors touch-manipulation"
                    data-testid={`preset-${preset.name.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <preset.icon className="w-4 h-4" />
                    {preset.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Zoom controls - larger touch targets on mobile */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleZoomOut}
                disabled={scale <= 1}
                className="p-3 sm:p-3 border border-zinc-300 rounded-lg hover:bg-zinc-50 active:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-manipulation min-w-[48px] min-h-[48px] flex items-center justify-center"
                title="Zoom out"
                data-testid="zoom-out-btn"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              
              {/* Zoom slider for touch */}
              <div className="flex-1 sm:flex-none px-2">
                <input
                  type="range"
                  min="100"
                  max="300"
                  value={scale * 100}
                  onChange={(e) => {
                    const newScale = parseInt(e.target.value) / 100;
                    setScale(newScale);
                    const newPos = constrainPosition(position.x, position.y, newScale);
                    setPosition(newPos);
                  }}
                  className="w-24 sm:w-32 h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer touch-manipulation"
                  style={{
                    background: `linear-gradient(to right, #18181b ${(scale - 1) * 50}%, #e4e4e7 ${(scale - 1) * 50}%)`
                  }}
                  data-testid="zoom-slider"
                />
              </div>
              
              <div className="px-3 py-2 bg-zinc-100 rounded-lg min-w-[70px] text-center">
                <span className="font-medium text-sm">{Math.round(scale * 100)}%</span>
              </div>
              
              <button
                onClick={handleZoomIn}
                disabled={scale >= 3}
                className="p-3 sm:p-3 border border-zinc-300 rounded-lg hover:bg-zinc-50 active:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-manipulation min-w-[48px] min-h-[48px] flex items-center justify-center"
                title="Zoom in"
                data-testid="zoom-in-btn"
              >
                <ZoomIn className="w-5 h-5" />
              </button>

              <button
                onClick={handleReset}
                className="p-3 border border-zinc-300 rounded-lg hover:bg-zinc-50 active:bg-zinc-100 ml-2 transition-colors touch-manipulation min-w-[48px] min-h-[48px] flex items-center justify-center"
                title="Reset"
                data-testid="reset-position-btn"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
            </div>

            {/* Position indicator - simplified on mobile */}
            <div className="text-xs text-zinc-400 text-center">
              <span className="hidden sm:inline">Position: {Math.round(position.x)}% × {Math.round(position.y)}% • </span>
              Scale: {scale.toFixed(1)}x
            </div>
          </div>
        </div>

        {/* Footer - larger buttons for touch */}
        <div className="px-4 sm:px-6 py-4 border-t border-zinc-200 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-5 py-3 sm:px-6 sm:py-2 border border-zinc-300 rounded-lg hover:bg-zinc-50 active:bg-zinc-100 font-medium transition-colors touch-manipulation"
            data-testid="cancel-cover-edit"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-3 sm:px-6 sm:py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 active:bg-zinc-700 font-medium transition-colors flex items-center gap-2 touch-manipulation"
            data-testid="save-cover-position"
          >
            <Check className="w-4 h-4" />
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default CoverPhotoEditor;
