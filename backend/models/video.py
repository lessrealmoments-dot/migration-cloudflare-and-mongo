"""
Video and Section-related Pydantic models
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional


class FotoshareVideo(BaseModel):
    """Video entry from fotoshare.co scraping"""
    model_config = ConfigDict(extra="ignore")
    id: str
    gallery_id: str
    section_id: str
    hash: str  # Fotoshare video hash (e.g., "308xz2a")
    source_url: str  # Full URL to view on fotoshare
    thumbnail_url: str  # CDN thumbnail URL
    width: int = 1080
    height: int = 1920
    file_type: str = "mp4"
    file_source: str = "lumabooth"
    created_at_source: Optional[str] = None
    order: int = 0
    synced_at: str


class GalleryVideo(BaseModel):
    """Video entry for video sections"""
    model_config = ConfigDict(extra="ignore")
    id: str
    gallery_id: str
    section_id: str
    youtube_url: str
    video_id: str  # Extracted YouTube video ID
    tag: str  # Custom tag like "SDE", "Preparation", "Ceremony", etc.
    title: Optional[str] = None
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None  # Custom uploaded thumbnail
    thumbnail_position: Optional[dict] = None  # {scale, x, y} for crop position
    youtube_thumbnail_url: Optional[str] = None  # Auto-fetched from YouTube
    duration: Optional[str] = None
    is_featured: bool = False  # Featured video shows large
    uploaded_by: str = "photographer"  # "photographer" or "contributor"
    contributor_name: Optional[str] = None
    order: int = 0
    created_at: str


class VideoCreate(BaseModel):
    """Request model for creating a video"""
    youtube_url: str
    tag: str
    title: Optional[str] = None
    description: Optional[str] = None
    is_featured: bool = False


class VideoUpdate(BaseModel):
    """Request model for updating a video"""
    youtube_url: Optional[str] = None
    tag: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    thumbnail_position: Optional[dict] = None
    is_featured: Optional[bool] = None
    order: Optional[int] = None


class FotoshareSectionCreate(BaseModel):
    """Request model for creating a fotoshare section"""
    fotoshare_url: str
    section_name: Optional[str] = None


class GoogleDriveSectionCreate(BaseModel):
    """Request model for creating a Google Drive section"""
    gdrive_url: Optional[str] = None  # Now optional - can create empty section first
    section_name: Optional[str] = None
    contributor_name: Optional[str] = None
    contributor_role: Optional[str] = None


class PCloudPhoto(BaseModel):
    """Photo entry from pCloud shared folder"""
    model_config = ConfigDict(extra="ignore")
    id: str
    gallery_id: str
    section_id: str
    pcloud_code: str  # The share link code
    fileid: str  # pCloud file ID (stored as string to avoid MongoDB int overflow)
    name: str  # Original filename
    size: int = 0  # File size in bytes
    width: Optional[int] = None
    height: Optional[int] = None
    contenttype: str = "image/jpeg"
    supplier_name: Optional[str] = None  # Supplier folder name
    hash: Optional[str] = None  # pCloud file hash (stored as string)
    created_at_source: Optional[str] = None
    order: int = 0
    synced_at: str  # When we synced this photo


class SectionDownloadRequest(BaseModel):
    """Request model for downloading a section"""
    password: Optional[str] = None
    section_id: Optional[str] = None  # None means download all
