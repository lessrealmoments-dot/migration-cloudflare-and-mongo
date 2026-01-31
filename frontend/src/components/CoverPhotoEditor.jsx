import React, { useState, useRef, useEffect } from 'react';
import { ZoomIn, ZoomOut, Move, Check, X, RotateCcw } from 'lucide-react';

const CoverPhotoEditor = ({ 
  imageUrl, 
  initialSettings = {}, 
  onSave, 
  onCancel,
  aspectRatio = 3 // width/height ratio for cover (3:1 for wide banner)
}) => {
  const [scale, setScale] = useState(initialSettings.scale || 1);
  const [position, setPosition] = useState({
    x: initialSettings.positionX || 50,
    y: initialSettings.positionY || 50
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

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

  const handleMouseDown = (e) => {
    if (scale <= 1) return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  const handleMouseMove = (e) => {
    if (!isDragging || scale <= 1) return;
    
    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;
    
    // Constrain position based on zoom level
    const maxOffset = (scale - 1) * 50;
    setPosition({
      x: Math.max(50 - maxOffset, Math.min(50 + maxOffset, newX)),
      y: Math.max(50 - maxOffset, Math.min(50 + maxOffset, newY))
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e) => {
    if (scale <= 1) return;
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({
      x: touch.clientX - position.x,
      y: touch.clientY - position.y
    });
  };

  const handleTouchMove = (e) => {
    if (!isDragging || scale <= 1) return;
    const touch = e.touches[0];
    
    const newX = touch.clientX - dragStart.x;
    const newY = touch.clientY - dragStart.y;
    
    const maxOffset = (scale - 1) * 50;
    setPosition({
      x: Math.max(50 - maxOffset, Math.min(50 + maxOffset, newX)),
      y: Math.max(50 - maxOffset, Math.min(50 + maxOffset, newY))
    });
  };

  const handleSave = () => {
    onSave({
      scale,
      positionX: position.x,
      positionY: position.y
    });
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchend', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchend', handleGlobalMouseUp);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 flex justify-between items-center">
          <h3 className="text-xl font-medium">Adjust Cover Photo</h3>
          <button onClick={onCancel} className="p-2 hover:bg-zinc-100 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preview Area */}
        <div className="p-6">
          <p className="text-sm text-zinc-500 mb-4">
            {scale > 1 ? 'Drag to reposition • ' : ''}Zoom in to adjust position
          </p>
          
          {/* Cover preview container */}
          <div 
            ref={containerRef}
            className="relative w-full overflow-hidden rounded-lg border-2 border-zinc-300 bg-zinc-100"
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
            onTouchEnd={handleMouseUp}
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
                transition: isDragging ? 'none' : 'transform 0.2s ease-out'
              }}
              draggable={false}
            />
            
            {/* Grid overlay for positioning help */}
            <div className="absolute inset-0 pointer-events-none opacity-30">
              <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white"></div>
              <div className="absolute right-1/3 top-0 bottom-0 w-px bg-white"></div>
              <div className="absolute top-1/3 left-0 right-0 h-px bg-white"></div>
              <div className="absolute bottom-1/3 left-0 right-0 h-px bg-white"></div>
            </div>
          </div>

          {/* Controls */}
          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={handleZoomOut}
                disabled={scale <= 1}
                className="p-3 border border-zinc-300 rounded-lg hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Zoom out"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              
              <div className="px-4 py-2 bg-zinc-100 rounded-lg min-w-[80px] text-center">
                <span className="font-medium">{Math.round(scale * 100)}%</span>
              </div>
              
              <button
                onClick={handleZoomIn}
                disabled={scale >= 3}
                className="p-3 border border-zinc-300 rounded-lg hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Zoom in"
              >
                <ZoomIn className="w-5 h-5" />
              </button>

              <button
                onClick={handleReset}
                className="p-3 border border-zinc-300 rounded-lg hover:bg-zinc-50 ml-2 transition-colors"
                title="Reset"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
            </div>

            {scale > 1 && (
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Move className="w-4 h-4" />
                <span>Drag to reposition</span>
              </div>
            )}
          </div>

          {/* Position indicator */}
          <div className="mt-4 text-xs text-zinc-400 text-center">
            Position: {Math.round(position.x)}% x {Math.round(position.y)}% • Scale: {scale.toFixed(1)}x
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-200 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-6 py-2 border border-zinc-300 rounded-lg hover:bg-zinc-50 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 font-medium transition-colors flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default CoverPhotoEditor;
