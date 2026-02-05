import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Plus, Trash2, Copy, Save, Grid, AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter, Maximize2, Square, RectangleHorizontal,
  RectangleVertical, Settings, Eye, GripVertical, ChevronUp, ChevronDown,
  Sparkles, Check, X, Search, Tag, LayoutGrid
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

// Ratio presets
const RATIO_PRESETS = {
  '3:2': { label: 'Landscape (3:2)', widthRatio: 3, heightRatio: 2 },
  '2:3': { label: 'Portrait (2:3)', widthRatio: 2, heightRatio: 3 },
  '1:1': { label: 'Square (1:1)', widthRatio: 1, heightRatio: 1 },
  '16:9': { label: 'Wide (16:9)', widthRatio: 16, heightRatio: 9 },
  '4:3': { label: 'Classic (4:3)', widthRatio: 4, heightRatio: 3 },
  'custom': { label: 'Custom (Free)', widthRatio: null, heightRatio: null },
};

const DEFAULT_SETTINGS = {
  gap: 3,
  border_thickness: 0,
  border_color: '#000000',
  border_opacity: 1.0,
  background_color: '#000000'
};

// Generate unique ID
const generateId = () => Math.random().toString(36).substr(2, 9);

const CollagePresetBuilder = () => {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const [presets, setPresets] = useState([]);
  const [selectedPresetId, setSelectedPresetId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Current preset being edited
  const [presetName, setPresetName] = useState('New Preset');
  const [presetDescription, setPresetDescription] = useState('');
  const [presetTags, setPresetTags] = useState([]);
  const [placeholders, setPlaceholders] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [isDefault, setIsDefault] = useState(false);
  
  // Editor state
  const [selectedPlaceholderId, setSelectedPlaceholderId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [gridSize, setGridSize] = useState(5); // 5% grid
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [snapToEdges, setSnapToEdges] = useState(true); // Snap to other tile edges
  const [showPreview, setShowPreview] = useState(false);
  const [snapGuides, setSnapGuides] = useState({ horizontal: [], vertical: [] }); // Visual guides
  
  // Tag input
  const [tagInput, setTagInput] = useState('');
  
  // Search/filter
  const [searchQuery, setSearchQuery] = useState('');

  // Get admin token
  const getAdminToken = () => localStorage.getItem('adminToken');

  // Fetch presets
  const fetchPresets = useCallback(async () => {
    try {
      const response = await fetch(`${API}/api/admin/collage-presets`, {
        headers: { 'Authorization': `Bearer ${getAdminToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setPresets(data);
      }
    } catch (error) {
      console.error('Error fetching presets:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  // Load preset into editor
  const loadPreset = (preset) => {
    setSelectedPresetId(preset.id);
    setPresetName(preset.name);
    setPresetDescription(preset.description || '');
    setPresetTags(preset.tags || []);
    setPlaceholders(preset.placeholders || []);
    setSettings(preset.settings || DEFAULT_SETTINGS);
    setIsDefault(preset.is_default || false);
    setSelectedPlaceholderId(null);
  };

  // Create new preset
  const createNewPreset = () => {
    setSelectedPresetId(null);
    setPresetName('New Preset');
    setPresetDescription('');
    setPresetTags([]);
    setPlaceholders([]);
    setSettings(DEFAULT_SETTINGS);
    setIsDefault(false);
    setSelectedPlaceholderId(null);
  };

  // Save preset
  const savePreset = async () => {
    if (placeholders.length === 0) {
      alert('Please add at least one placeholder');
      return;
    }
    
    setIsSaving(true);
    try {
      const presetData = {
        name: presetName,
        description: presetDescription,
        tags: presetTags,
        placeholders,
        settings,
        is_default: isDefault
      };

      const url = selectedPresetId 
        ? `${API}/api/admin/collage-presets/${selectedPresetId}`
        : `${API}/api/admin/collage-presets`;
      
      const method = selectedPresetId ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAdminToken()}`
        },
        body: JSON.stringify(presetData)
      });

      if (response.ok) {
        const savedPreset = await response.json();
        await fetchPresets();
        setSelectedPresetId(savedPreset.id);
        alert('Preset saved successfully!');
      } else {
        alert('Error saving preset');
      }
    } catch (error) {
      console.error('Error saving preset:', error);
      alert('Error saving preset');
    } finally {
      setIsSaving(false);
    }
  };

  // Duplicate preset
  const duplicatePreset = async (presetId) => {
    try {
      const response = await fetch(`${API}/api/admin/collage-presets/${presetId}/duplicate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getAdminToken()}` }
      });
      if (response.ok) {
        await fetchPresets();
      }
    } catch (error) {
      console.error('Error duplicating preset:', error);
    }
  };

  // Delete preset
  const deletePreset = async (presetId) => {
    if (!window.confirm('Are you sure you want to delete this preset?')) return;
    
    try {
      const response = await fetch(`${API}/api/admin/collage-presets/${presetId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getAdminToken()}` }
      });
      if (response.ok) {
        if (selectedPresetId === presetId) {
          createNewPreset();
        }
        await fetchPresets();
      }
    } catch (error) {
      console.error('Error deleting preset:', error);
    }
  };

  // Add placeholder
  const addPlaceholder = (ratio = '3:2') => {
    const ratioInfo = RATIO_PRESETS[ratio];
    
    // Base dimensions - adjusted for 16:9 canvas
    // Canvas is 16:9, so height% is worth more visually than width%
    // A 20% width on 16:9 canvas = 20 units
    // A 20% height on 16:9 canvas = 20 * (9/16) = 11.25 visual units
    // To make squares look square, we need to account for canvas aspect ratio
    
    const canvasAspect = 16 / 9; // Canvas width/height ratio
    let width, height;
    
    if (ratio === 'custom') {
      // Custom: 20% x 20% (will look like landscape due to canvas)
      width = 20;
      height = 20;
    } else if (ratioInfo && ratioInfo.widthRatio && ratioInfo.heightRatio) {
      const targetAspect = ratioInfo.widthRatio / ratioInfo.heightRatio;
      
      if (ratio === '3:2') {
        // Landscape - wider than tall
        width = 25;
        height = (width / targetAspect) * canvasAspect;
      } else if (ratio === '2:3') {
        // Portrait - taller than wide
        height = 40;
        width = height * targetAspect / canvasAspect;
      } else if (ratio === '1:1') {
        // Square - equal visual dimensions
        width = 20;
        height = width * canvasAspect;
      } else if (ratio === '16:9') {
        // Wide landscape
        width = 30;
        height = (width / targetAspect) * canvasAspect;
      } else if (ratio === '4:3') {
        // Classic
        width = 25;
        height = (width / targetAspect) * canvasAspect;
      } else {
        // Default
        width = 20;
        height = (width / targetAspect) * canvasAspect;
      }
    } else {
      width = 20;
      height = 20;
    }
    
    // Clamp values
    width = Math.min(width, 50);
    height = Math.min(height, 60);
    
    const newPlaceholder = {
      id: generateId(),
      x: 5 + (placeholders.length * 5) % 30, // Stagger new placeholders
      y: 5 + (placeholders.length * 5) % 30,
      width,
      height,
      ratio,
      z_index: placeholders.length
    };
    
    setPlaceholders([...placeholders, newPlaceholder]);
    setSelectedPlaceholderId(newPlaceholder.id);
  };

  // Delete placeholder
  const deletePlaceholder = (id) => {
    setPlaceholders(placeholders.filter(p => p.id !== id));
    if (selectedPlaceholderId === id) {
      setSelectedPlaceholderId(null);
    }
  };

  // Snap value to grid
  const snapToGridValue = (value) => {
    if (!snapToGrid) return value;
    return Math.round(value / gridSize) * gridSize;
  };

  // Smart snap - considers grid, other tiles' edges, and gaps
  const smartSnap = (value, axis, placeholderId, isEdge = false) => {
    const SNAP_THRESHOLD = 2; // Snap within 2% proximity
    const gap = settings.gap || 0;
    let snappedValue = value;
    let guides = [];
    
    // First try edge snapping to other tiles
    if (snapToEdges) {
      const otherPlaceholders = placeholders.filter(p => p.id !== placeholderId);
      
      for (const other of otherPlaceholders) {
        // Get edges of other placeholder
        const edges = axis === 'x' 
          ? [other.x, other.x + other.width] // left, right edges
          : [other.y, other.y + other.height]; // top, bottom edges
        
        for (const edge of edges) {
          // Snap to edge with gap
          const edgeWithGap = edge + gap;
          const edgeMinusGap = edge - gap;
          
          // Check if close to edge (for placing next to)
          if (Math.abs(value - edgeWithGap) < SNAP_THRESHOLD) {
            snappedValue = edgeWithGap;
            guides.push(edge);
          } else if (Math.abs(value - edgeMinusGap) < SNAP_THRESHOLD && isEdge) {
            // For resizing, snap to edge minus gap
            snappedValue = edgeMinusGap;
            guides.push(edge);
          } else if (Math.abs(value - edge) < SNAP_THRESHOLD) {
            // Direct edge alignment
            snappedValue = edge;
            guides.push(edge);
          }
        }
      }
      
      // Also snap to canvas edges (0 and 100)
      if (Math.abs(value) < SNAP_THRESHOLD) {
        snappedValue = 0;
        guides.push(0);
      }
      if (Math.abs(value - 100) < SNAP_THRESHOLD) {
        snappedValue = 100;
        guides.push(100);
      }
    }
    
    // If no edge snap, fall back to grid
    if (guides.length === 0 && snapToGrid) {
      snappedValue = Math.round(value / gridSize) * gridSize;
    }
    
    return { value: snappedValue, guides };
  };

  // Get canvas coordinates from mouse event
  const getCanvasCoords = (e) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return { x, y };
  };

  // Click to select placeholder (separate from drag)
  const handlePlaceholderClick = (e, placeholder) => {
    e.stopPropagation();
    setSelectedPlaceholderId(placeholder.id);
  };

  // Mouse down on placeholder - for drag or resize
  const handlePlaceholderMouseDown = (e, placeholder, handle = null) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Always select on mousedown
    setSelectedPlaceholderId(placeholder.id);
    
    const coords = getCanvasCoords(e);
    setDragStart({
      x: coords.x - placeholder.x,
      y: coords.y - placeholder.y,
      width: placeholder.width,
      height: placeholder.height,
      originalX: placeholder.x,
      originalY: placeholder.y
    });
    
    if (handle) {
      setIsResizing(true);
      setResizeHandle(handle);
    } else {
      setIsDragging(true);
    }
  };

  // Mouse move
  const handleMouseMove = (e) => {
    if (!isDragging && !isResizing) return;
    if (!selectedPlaceholderId) return;

    const coords = getCanvasCoords(e);
    let newGuides = { horizontal: [], vertical: [] };
    
    setPlaceholders(placeholders.map(p => {
      if (p.id !== selectedPlaceholderId) return p;
      
      if (isDragging) {
        const rawX = coords.x - dragStart.x;
        const rawY = coords.y - dragStart.y;
        
        // Smart snap for position
        const snapX = smartSnap(rawX, 'x', p.id);
        const snapY = smartSnap(rawY, 'y', p.id);
        
        // Also check right and bottom edges for snapping
        const snapRightEdge = smartSnap(rawX + p.width, 'x', p.id, true);
        const snapBottomEdge = smartSnap(rawY + p.height, 'y', p.id, true);
        
        let newX = snapX.value;
        let newY = snapY.value;
        
        // Prefer edge snap if it found a guide
        if (snapRightEdge.guides.length > 0 && snapX.guides.length === 0) {
          newX = snapRightEdge.value - p.width;
          newGuides.vertical = [...newGuides.vertical, ...snapRightEdge.guides];
        } else {
          newGuides.vertical = [...newGuides.vertical, ...snapX.guides];
        }
        
        if (snapBottomEdge.guides.length > 0 && snapY.guides.length === 0) {
          newY = snapBottomEdge.value - p.height;
          newGuides.horizontal = [...newGuides.horizontal, ...snapBottomEdge.guides];
        } else {
          newGuides.horizontal = [...newGuides.horizontal, ...snapY.guides];
        }
        
        // Keep within bounds
        newX = Math.max(0, Math.min(100 - p.width, newX));
        newY = Math.max(0, Math.min(100 - p.height, newY));
        
        return { ...p, x: newX, y: newY };
      }
      
      if (isResizing) {
        const ratioInfo = RATIO_PRESETS[p.ratio];
        let newWidth = p.width;
        let newHeight = p.height;
        let newX = p.x;
        let newY = p.y;
        
        // Canvas is 16:9, so we need to account for this when maintaining visual ratios
        const canvasAspect = 16 / 9;
        
        // Calculate new dimensions based on handle with smart snapping
        if (resizeHandle.includes('e')) {
          const snapResult = smartSnap(coords.x, 'x', p.id, true);
          newWidth = snapResult.value - p.x;
          newGuides.vertical = [...newGuides.vertical, ...snapResult.guides];
        }
        if (resizeHandle.includes('s')) {
          const snapResult = smartSnap(coords.y, 'y', p.id, true);
          newHeight = snapResult.value - p.y;
          newGuides.horizontal = [...newGuides.horizontal, ...snapResult.guides];
        }
        if (resizeHandle.includes('w')) {
          const snapResult = smartSnap(coords.x, 'x', p.id, true);
          const newLeft = snapResult.value;
          newWidth = p.x + p.width - newLeft;
          newX = newLeft;
          newGuides.vertical = [...newGuides.vertical, ...snapResult.guides];
        }
        if (resizeHandle.includes('n')) {
          const snapResult = smartSnap(coords.y, 'y', p.id, true);
          const newTop = snapResult.value;
          newHeight = p.y + p.height - newTop;
          newY = newTop;
          newGuides.horizontal = [...newGuides.horizontal, ...snapResult.guides];
        }
        
        // Maintain aspect ratio only if not custom
        if (ratioInfo && ratioInfo.widthRatio && ratioInfo.heightRatio) {
          const targetRatio = ratioInfo.widthRatio / ratioInfo.heightRatio;
          
          const isHorizontalHandle = resizeHandle === 'e' || resizeHandle === 'w';
          const isVerticalHandle = resizeHandle === 'n' || resizeHandle === 's';
          
          if (isHorizontalHandle || resizeHandle.length === 2) {
            newHeight = (newWidth * canvasAspect) / targetRatio;
          } else if (isVerticalHandle) {
            newWidth = (newHeight * targetRatio) / canvasAspect;
          }
        }
        
        // Minimum size
        newWidth = Math.max(5, newWidth);
        newHeight = Math.max(5, newHeight);
        newX = Math.max(0, newX);
        newY = Math.max(0, newY);
        
        // Keep within bounds
        if (newX + newWidth > 100) newWidth = 100 - newX;
        if (newY + newHeight > 100) newHeight = 100 - newY;
        
        return { ...p, x: newX, y: newY, width: newWidth, height: newHeight };
      }
      
      return p;
    }));
    
    // Update snap guides
    setSnapGuides(newGuides);
  };

  // Mouse up
  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
    setResizeHandle(null);
    setSnapGuides({ horizontal: [], vertical: [] }); // Clear guides
  };

  // Change placeholder layer
  const changeLayer = (id, direction) => {
    const index = placeholders.findIndex(p => p.id === id);
    if (index === -1) return;
    
    const newIndex = direction === 'up' ? index + 1 : index - 1;
    if (newIndex < 0 || newIndex >= placeholders.length) return;
    
    const newPlaceholders = [...placeholders];
    [newPlaceholders[index], newPlaceholders[newIndex]] = [newPlaceholders[newIndex], newPlaceholders[index]];
    
    // Update z_index
    newPlaceholders.forEach((p, i) => p.z_index = i);
    setPlaceholders(newPlaceholders);
  };

  // Distribute placeholders evenly
  const distributeHorizontally = () => {
    if (placeholders.length < 2) return;
    
    const sorted = [...placeholders].sort((a, b) => a.x - b.x);
    const totalWidth = sorted.reduce((sum, p) => sum + p.width, 0);
    const availableSpace = 100 - totalWidth;
    const gap = availableSpace / (placeholders.length + 1);
    
    let currentX = gap;
    const newPlaceholders = sorted.map(p => {
      const newP = { ...p, x: snapToGridValue(currentX) };
      currentX += p.width + gap;
      return newP;
    });
    
    setPlaceholders(newPlaceholders);
  };

  const distributeVertically = () => {
    if (placeholders.length < 2) return;
    
    const sorted = [...placeholders].sort((a, b) => a.y - b.y);
    const totalHeight = sorted.reduce((sum, p) => sum + p.height, 0);
    const availableSpace = 100 - totalHeight;
    const gap = availableSpace / (placeholders.length + 1);
    
    let currentY = gap;
    const newPlaceholders = sorted.map(p => {
      const newP = { ...p, y: snapToGridValue(currentY) };
      currentY += p.height + gap;
      return newP;
    });
    
    setPlaceholders(newPlaceholders);
  };

  // Tidy up - correct minor overlaps and uneven gaps
  const tidyUp = () => {
    // Simple implementation: snap all to grid and adjust overlaps
    let newPlaceholders = placeholders.map(p => ({
      ...p,
      x: snapToGridValue(p.x),
      y: snapToGridValue(p.y),
      width: snapToGridValue(p.width),
      height: snapToGridValue(p.height)
    }));
    
    // Keep within bounds
    newPlaceholders = newPlaceholders.map(p => ({
      ...p,
      x: Math.max(0, Math.min(100 - p.width, p.x)),
      y: Math.max(0, Math.min(100 - p.height, p.y))
    }));
    
    setPlaceholders(newPlaceholders);
  };

  // Add tag
  const addTag = () => {
    if (tagInput.trim() && !presetTags.includes(tagInput.trim())) {
      setPresetTags([...presetTags, tagInput.trim()]);
      setTagInput('');
    }
  };

  // Remove tag
  const removeTag = (tag) => {
    setPresetTags(presetTags.filter(t => t !== tag));
  };

  // Filter presets
  const filteredPresets = presets.filter(p => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(query) ||
      (p.description || '').toLowerCase().includes(query) ||
      (p.tags || []).some(t => t.toLowerCase().includes(query))
    );
  });

  // Selected placeholder
  const selectedPlaceholder = placeholders.find(p => p.id === selectedPlaceholderId);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white" data-testid="collage-preset-builder">
      {/* Header */}
      <header className="bg-neutral-900 border-b border-neutral-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin')}
              className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-semibold">Collage Layout Presets</h1>
              <p className="text-sm text-neutral-400">Design reusable mosaic layouts</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                showPreview ? 'bg-blue-600' : 'bg-neutral-800 hover:bg-neutral-700'
              }`}
            >
              <Eye className="w-4 h-4" />
              Preview
            </button>
            <button
              onClick={savePreset}
              disabled={isSaving}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save Preset'}
            </button>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Left Sidebar - Preset List */}
        <div className="w-64 bg-neutral-900 border-r border-neutral-800 flex flex-col">
          <div className="p-4 border-b border-neutral-800">
            <button
              onClick={createNewPreset}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Preset
            </button>
          </div>
          
          {/* Search */}
          <div className="p-4 border-b border-neutral-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search presets..."
                className="w-full pl-10 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          
          {/* Preset List */}
          <div className="flex-1 overflow-y-auto p-2">
            {filteredPresets.length === 0 ? (
              <p className="text-center text-neutral-500 text-sm py-4">No presets found</p>
            ) : (
              filteredPresets.map(preset => (
                <div
                  key={preset.id}
                  onClick={() => loadPreset(preset)}
                  className={`p-3 rounded-lg cursor-pointer mb-2 transition-colors ${
                    selectedPresetId === preset.id
                      ? 'bg-blue-600/20 border border-blue-500'
                      : 'bg-neutral-800 hover:bg-neutral-700 border border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm truncate">{preset.name}</span>
                    {preset.is_default && (
                      <span className="text-xs bg-green-600/20 text-green-400 px-2 py-0.5 rounded">
                        Default
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <LayoutGrid className="w-3 h-3" />
                    {preset.placeholders?.length || 0} tiles
                  </div>
                  {preset.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {preset.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-xs bg-neutral-700 px-2 py-0.5 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  
                  {/* Actions */}
                  <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); duplicatePreset(preset.id); }}
                      className="p-1 hover:bg-neutral-600 rounded"
                      title="Duplicate"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deletePreset(preset.id); }}
                      className="p-1 hover:bg-red-600 rounded"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Main Canvas Area */}
        <div className="flex-1 flex flex-col bg-neutral-950">
          {/* Toolbar */}
          <div className="bg-neutral-900 border-b border-neutral-800 px-4 py-2 flex items-center gap-4">
            {/* Add Placeholders */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-400">Add:</span>
              <button
                onClick={() => addPlaceholder('3:2')}
                className="p-2 hover:bg-neutral-700 rounded transition-colors"
                title="Landscape (3:2)"
              >
                <RectangleHorizontal className="w-5 h-5" />
              </button>
              <button
                onClick={() => addPlaceholder('2:3')}
                className="p-2 hover:bg-neutral-700 rounded transition-colors"
                title="Portrait (2:3)"
              >
                <RectangleVertical className="w-5 h-5" />
              </button>
              <button
                onClick={() => addPlaceholder('1:1')}
                className="p-2 hover:bg-neutral-700 rounded transition-colors"
                title="Square (1:1)"
              >
                <Square className="w-5 h-5" />
              </button>
              <button
                onClick={() => addPlaceholder('custom')}
                className="p-2 hover:bg-neutral-700 rounded transition-colors"
                title="Custom (Free resize)"
              >
                <Maximize2 className="w-5 h-5" />
              </button>
            </div>
            
            <div className="w-px h-6 bg-neutral-700" />
            
            {/* Layout Tools */}
            <div className="flex items-center gap-2">
              <button
                onClick={distributeHorizontally}
                className="p-2 hover:bg-neutral-700 rounded transition-colors"
                title="Distribute Horizontally"
              >
                <AlignHorizontalDistributeCenter className="w-5 h-5" />
              </button>
              <button
                onClick={distributeVertically}
                className="p-2 hover:bg-neutral-700 rounded transition-colors"
                title="Distribute Vertically"
              >
                <AlignVerticalDistributeCenter className="w-5 h-5" />
              </button>
              <button
                onClick={tidyUp}
                className="p-2 hover:bg-neutral-700 rounded transition-colors"
                title="Tidy Up"
              >
                <Sparkles className="w-5 h-5" />
              </button>
            </div>
            
            <div className="w-px h-6 bg-neutral-700" />
            
            {/* Grid Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowGrid(!showGrid)}
                className={`p-2 rounded transition-colors ${showGrid ? 'bg-blue-600' : 'hover:bg-neutral-700'}`}
                title="Toggle Grid"
              >
                <Grid className="w-5 h-5" />
              </button>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={snapToGrid}
                  onChange={(e) => setSnapToGrid(e.target.checked)}
                  className="rounded"
                />
                Grid
              </label>
              <select
                value={gridSize}
                onChange={(e) => setGridSize(Number(e.target.value))}
                className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm"
              >
                <option value={1}>1%</option>
                <option value={2}>2%</option>
                <option value={5}>5%</option>
                <option value={10}>10%</option>
              </select>
              <label className="flex items-center gap-2 text-sm ml-2">
                <input
                  type="checkbox"
                  checked={snapToEdges}
                  onChange={(e) => setSnapToEdges(e.target.checked)}
                  className="rounded"
                />
                <span title="Snap to edges of other tiles with gap spacing">Edges</span>
              </label>
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
            <div
              ref={canvasRef}
              className="relative bg-neutral-900 rounded-lg overflow-hidden shadow-2xl"
              style={{
                width: '80%',
                maxWidth: '1200px',
                aspectRatio: '16/9',
                backgroundColor: settings.background_color
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onClick={() => setSelectedPlaceholderId(null)}
            >
              {/* Grid Overlay */}
              {showGrid && (
                <div 
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage: `
                      linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px),
                      linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)
                    `,
                    backgroundSize: `${gridSize}% ${gridSize}%`
                  }}
                />
              )}
              
              {/* Snap Guides - Visual alignment indicators */}
              {snapGuides.vertical.map((x, i) => (
                <div
                  key={`v-${i}`}
                  className="absolute top-0 bottom-0 w-px bg-pink-500 pointer-events-none z-[200]"
                  style={{ left: `${x}%`, boxShadow: '0 0 4px rgba(236,72,153,0.8)' }}
                />
              ))}
              {snapGuides.horizontal.map((y, i) => (
                <div
                  key={`h-${i}`}
                  className="absolute left-0 right-0 h-px bg-pink-500 pointer-events-none z-[200]"
                  style={{ top: `${y}%`, boxShadow: '0 0 4px rgba(236,72,153,0.8)' }}
                />
              ))}

              {/* Placeholders */}
              {placeholders.map((placeholder) => (
                <div
                  key={placeholder.id}
                  className={`absolute transition-shadow select-none ${
                    selectedPlaceholderId === placeholder.id
                      ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-black cursor-move z-50'
                      : 'hover:ring-1 hover:ring-white/50 cursor-pointer'
                  }`}
                  style={{
                    left: `calc(${placeholder.x}% + ${settings.gap / 2}px)`,
                    top: `calc(${placeholder.y}% + ${settings.gap / 2}px)`,
                    width: `calc(${placeholder.width}% - ${settings.gap}px)`,
                    height: `calc(${placeholder.height}% - ${settings.gap}px)`,
                    zIndex: selectedPlaceholderId === placeholder.id ? 100 : placeholder.z_index + 10,
                    backgroundColor: showPreview ? '#374151' : '#1f2937',
                    border: settings.border_thickness > 0 
                      ? `${settings.border_thickness}px solid ${settings.border_color}`
                      : '1px solid rgba(255,255,255,0.1)'
                  }}
                  onClick={(e) => handlePlaceholderClick(e, placeholder)}
                  onMouseDown={(e) => {
                    // Only start drag if already selected, otherwise just select
                    if (selectedPlaceholderId === placeholder.id) {
                      handlePlaceholderMouseDown(e, placeholder);
                    } else {
                      e.stopPropagation();
                      setSelectedPlaceholderId(placeholder.id);
                    }
                  }}
                >
                  {/* Placeholder Info */}
                  {!showPreview && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-400 text-xs pointer-events-none">
                      <span className="font-medium">{RATIO_PRESETS[placeholder.ratio]?.label || placeholder.ratio}</span>
                      <span className="text-neutral-500">{Math.round(placeholder.width)}% × {Math.round(placeholder.height)}%</span>
                    </div>
                  )}
                  
                  {/* Resize Handles - only show when selected */}
                  {selectedPlaceholderId === placeholder.id && !showPreview && (
                    <>
                      {/* Corners - larger for easier grabbing */}
                      <div
                        className="absolute -top-2 -left-2 w-4 h-4 bg-blue-500 rounded-full cursor-nw-resize hover:bg-blue-400 hover:scale-110 transition-transform"
                        onMouseDown={(e) => handlePlaceholderMouseDown(e, placeholder, 'nw')}
                      />
                      <div
                        className="absolute -top-2 -right-2 w-4 h-4 bg-blue-500 rounded-full cursor-ne-resize hover:bg-blue-400 hover:scale-110 transition-transform"
                        onMouseDown={(e) => handlePlaceholderMouseDown(e, placeholder, 'ne')}
                      />
                      <div
                        className="absolute -bottom-2 -left-2 w-4 h-4 bg-blue-500 rounded-full cursor-sw-resize hover:bg-blue-400 hover:scale-110 transition-transform"
                        onMouseDown={(e) => handlePlaceholderMouseDown(e, placeholder, 'sw')}
                      />
                      <div
                        className="absolute -bottom-2 -right-2 w-4 h-4 bg-blue-500 rounded-full cursor-se-resize hover:bg-blue-400 hover:scale-110 transition-transform"
                        onMouseDown={(e) => handlePlaceholderMouseDown(e, placeholder, 'se')}
                      />
                      
                      {/* Edges - larger for easier grabbing */}
                      <div
                        className="absolute top-1/2 -left-2 w-3 h-8 -translate-y-1/2 bg-blue-500 rounded cursor-w-resize hover:bg-blue-400"
                        onMouseDown={(e) => handlePlaceholderMouseDown(e, placeholder, 'w')}
                      />
                      <div
                        className="absolute top-1/2 -right-2 w-3 h-8 -translate-y-1/2 bg-blue-500 rounded cursor-e-resize hover:bg-blue-400"
                        onMouseDown={(e) => handlePlaceholderMouseDown(e, placeholder, 'e')}
                      />
                      <div
                        className="absolute -top-2 left-1/2 w-8 h-3 -translate-x-1/2 bg-blue-500 rounded cursor-n-resize hover:bg-blue-400"
                        onMouseDown={(e) => handlePlaceholderMouseDown(e, placeholder, 'n')}
                      />
                      <div
                        className="absolute -bottom-2 left-1/2 w-8 h-3 -translate-x-1/2 bg-blue-500 rounded cursor-s-resize hover:bg-blue-400"
                        onMouseDown={(e) => handlePlaceholderMouseDown(e, placeholder, 's')}
                      />
                    </>
                  )}
                </div>
              ))}
              
              {/* Empty State */}
              {placeholders.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500">
                  <LayoutGrid className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-lg">Click a ratio button above to add placeholders</p>
                  <p className="text-sm">Click to select, then drag or resize</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar - Properties */}
        <div className="w-80 bg-neutral-900 border-l border-neutral-800 overflow-y-auto">
          {/* Preset Info */}
          <div className="p-4 border-b border-neutral-800">
            <h3 className="font-medium mb-3 flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Preset Details
            </h3>
            
            <div className="space-y-3">
              <div>
                <label className="text-sm text-neutral-400 block mb-1">Name</label>
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="text-sm text-neutral-400 block mb-1">Description</label>
                <textarea
                  value={presetDescription}
                  onChange={(e) => setPresetDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
              
              <div>
                <label className="text-sm text-neutral-400 block mb-1">Tags</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addTag()}
                    placeholder="Add tag..."
                    className="flex-1 px-3 py-1 bg-neutral-800 border border-neutral-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={addTag}
                    className="p-1 hover:bg-neutral-700 rounded"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {presetTags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 text-xs bg-neutral-700 px-2 py-1 rounded">
                      <Tag className="w-3 h-3" />
                      {tag}
                      <button onClick={() => removeTag(tag)} className="hover:text-red-400">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="rounded"
                />
                Set as default preset
              </label>
            </div>
          </div>

          {/* Visual Settings */}
          <div className="p-4 border-b border-neutral-800">
            <h3 className="font-medium mb-3">Visual Settings</h3>
            
            <div className="space-y-3">
              <div>
                <label className="text-sm text-neutral-400 block mb-1">Gap Size (px)</label>
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={settings.gap}
                  onChange={(e) => setSettings({ ...settings, gap: Number(e.target.value) })}
                  className="w-full"
                />
                <span className="text-xs text-neutral-500">{settings.gap}px</span>
              </div>
              
              <div>
                <label className="text-sm text-neutral-400 block mb-1">Border Thickness (px)</label>
                <input
                  type="range"
                  min={0}
                  max={5}
                  value={settings.border_thickness}
                  onChange={(e) => setSettings({ ...settings, border_thickness: Number(e.target.value) })}
                  className="w-full"
                />
                <span className="text-xs text-neutral-500">{settings.border_thickness}px</span>
              </div>
              
              <div>
                <label className="text-sm text-neutral-400 block mb-1">Border Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={settings.border_color}
                    onChange={(e) => setSettings({ ...settings, border_color: e.target.value })}
                    className="w-10 h-8 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={settings.border_color}
                    onChange={(e) => setSettings({ ...settings, border_color: e.target.value })}
                    className="flex-1 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm"
                  />
                </div>
              </div>
              
              <div>
                <label className="text-sm text-neutral-400 block mb-1">Background Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={settings.background_color}
                    onChange={(e) => setSettings({ ...settings, background_color: e.target.value })}
                    className="w-10 h-8 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={settings.background_color}
                    onChange={(e) => setSettings({ ...settings, background_color: e.target.value })}
                    className="flex-1 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Selected Placeholder */}
          {selectedPlaceholder && (
            <div className="p-4 border-b border-neutral-800">
              <h3 className="font-medium mb-3 flex items-center justify-between">
                <span>Selected Placeholder</span>
                <button
                  onClick={() => deletePlaceholder(selectedPlaceholder.id)}
                  className="p-1 hover:bg-red-600 rounded text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </h3>
              
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-neutral-400 block mb-1">Ratio</label>
                  <select
                    value={selectedPlaceholder.ratio}
                    onChange={(e) => {
                      const ratio = e.target.value;
                      const ratioInfo = RATIO_PRESETS[ratio];
                      const canvasAspect = 16 / 9;
                      if (ratioInfo && ratioInfo.widthRatio && ratioInfo.heightRatio) {
                        // Calculate new height accounting for canvas aspect ratio
                        const targetRatio = ratioInfo.widthRatio / ratioInfo.heightRatio;
                        const newHeight = (selectedPlaceholder.width * canvasAspect) / targetRatio;
                        setPlaceholders(placeholders.map(p =>
                          p.id === selectedPlaceholder.id
                            ? { ...p, ratio, height: Math.min(newHeight, 100 - p.y) }
                            : p
                        ));
                      } else {
                        // Custom ratio - keep current dimensions
                        setPlaceholders(placeholders.map(p =>
                          p.id === selectedPlaceholder.id ? { ...p, ratio } : p
                        ));
                      }
                    }}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm"
                  >
                    {Object.entries(RATIO_PRESETS).map(([key, value]) => (
                      <option key={key} value={key}>{value.label}</option>
                    ))}
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-sm text-neutral-400 block mb-1">X (%)</label>
                    <input
                      type="number"
                      value={Math.round(selectedPlaceholder.x)}
                      onChange={(e) => setPlaceholders(placeholders.map(p =>
                        p.id === selectedPlaceholder.id ? { ...p, x: Number(e.target.value) } : p
                      ))}
                      className="w-full px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-neutral-400 block mb-1">Y (%)</label>
                    <input
                      type="number"
                      value={Math.round(selectedPlaceholder.y)}
                      onChange={(e) => setPlaceholders(placeholders.map(p =>
                        p.id === selectedPlaceholder.id ? { ...p, y: Number(e.target.value) } : p
                      ))}
                      className="w-full px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-neutral-400 block mb-1">Width (%)</label>
                    <input
                      type="number"
                      value={Math.round(selectedPlaceholder.width)}
                      onChange={(e) => {
                        const width = Number(e.target.value);
                        const ratioInfo = RATIO_PRESETS[selectedPlaceholder.ratio];
                        const canvasAspect = 16 / 9;
                        let height;
                        if (ratioInfo && ratioInfo.widthRatio && ratioInfo.heightRatio) {
                          const targetRatio = ratioInfo.widthRatio / ratioInfo.heightRatio;
                          height = (width * canvasAspect) / targetRatio;
                        } else {
                          height = selectedPlaceholder.height;
                        }
                        setPlaceholders(placeholders.map(p =>
                          p.id === selectedPlaceholder.id ? { ...p, width, height } : p
                        ));
                      }}
                      className="w-full px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-neutral-400 block mb-1">Height (%)</label>
                    <input
                      type="number"
                      value={Math.round(selectedPlaceholder.height)}
                      readOnly
                      className="w-full px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-sm text-neutral-500"
                    />
                  </div>
                </div>
                
                {/* Layer controls */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-400">Layer:</span>
                  <button
                    onClick={() => changeLayer(selectedPlaceholder.id, 'up')}
                    className="p-1 hover:bg-neutral-700 rounded"
                    title="Bring Forward"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => changeLayer(selectedPlaceholder.id, 'down')}
                    className="p-1 hover:bg-neutral-700 rounded"
                    title="Send Backward"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Placeholders List */}
          <div className="p-4">
            <h3 className="font-medium mb-3">All Placeholders ({placeholders.length})</h3>
            
            <div className="space-y-2">
              {placeholders.map((p, index) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedPlaceholderId(p.id)}
                  className={`p-2 rounded flex items-center justify-between cursor-pointer ${
                    selectedPlaceholderId === p.id
                      ? 'bg-blue-600/20 border border-blue-500'
                      : 'bg-neutral-800 hover:bg-neutral-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-neutral-500" />
                    <span className="text-sm">{RATIO_PRESETS[p.ratio]?.label || p.ratio}</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deletePlaceholder(p.id); }}
                    className="p-1 hover:bg-red-600 rounded opacity-50 hover:opacity-100"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CollagePresetBuilder;
