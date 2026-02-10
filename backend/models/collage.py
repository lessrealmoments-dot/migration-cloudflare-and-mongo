"""
Collage preset Pydantic models
"""
from pydantic import BaseModel
from typing import Optional, List


class CollagePresetPlaceholder(BaseModel):
    """Individual placeholder/frame in a collage preset"""
    id: str
    x: float  # Position X (percentage 0-100)
    y: float  # Position Y (percentage 0-100)
    width: float  # Width (percentage 0-100)
    height: float  # Height (percentage 0-100)
    ratio: str = "3:2"  # "3:2" (landscape), "2:3" (portrait), "1:1" (square), "custom"
    z_index: int = 0  # Layer order


class CollagePresetSettings(BaseModel):
    """Visual settings for a collage preset"""
    gap: int = 3  # Gap between placeholders in pixels
    border_thickness: int = 0  # Border thickness in pixels
    border_color: str = "#000000"  # Border color
    border_opacity: float = 1.0  # Border opacity (0-1)
    background_color: str = "#000000"  # Canvas background color


class CollagePresetCreate(BaseModel):
    """Model for creating a new collage preset"""
    name: str
    description: Optional[str] = None
    tags: List[str] = []
    placeholders: List[CollagePresetPlaceholder]
    settings: CollagePresetSettings = CollagePresetSettings()
    is_default: bool = False


class CollagePresetUpdate(BaseModel):
    """Model for updating a collage preset"""
    name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    placeholders: Optional[List[CollagePresetPlaceholder]] = None
    settings: Optional[CollagePresetSettings] = None
    is_default: Optional[bool] = None


class CollagePreset(BaseModel):
    """Full collage preset model"""
    id: str
    name: str
    description: Optional[str] = None
    tags: List[str] = []
    placeholders: List[CollagePresetPlaceholder]
    settings: CollagePresetSettings
    is_default: bool = False
    created_by: str  # Admin user ID
    created_at: str
    updated_at: str
