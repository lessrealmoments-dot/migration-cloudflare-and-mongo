"""
Gallery-related Pydantic models
"""
from pydantic import BaseModel, ConfigDict
from typing import List, Optional


class GalleryCreate(BaseModel):
    """Model for creating a new gallery"""
    title: str
    description: Optional[str] = None
    password: Optional[str] = None
    event_title: Optional[str] = None
    event_date: Optional[str] = None
    coordinator_name: Optional[str] = None  # Event coordinator/planner name
    share_link_expiration_days: int = 30
    guest_upload_enabled_days: int = 3
    download_all_password: Optional[str] = None
    theme: str = "classic"
    # Display settings
    display_mode: str = "slideshow"  # "slideshow" or "collage"
    display_transition: str = "crossfade"  # "crossfade", "fade-zoom", "slide", "flip"
    display_interval: int = 6  # seconds between transitions (slideshow mode)
    collage_preset_id: Optional[str] = None  # Selected collage preset for collage mode


class Gallery(BaseModel):
    """Model for gallery response"""
    model_config = ConfigDict(extra="ignore")
    id: str
    photographer_id: str
    title: str
    description: Optional[str] = None
    has_password: bool
    share_link: str
    cover_photo_url: Optional[str] = None
    event_title: Optional[str] = None
    event_date: Optional[str] = None
    coordinator_name: Optional[str] = None  # Event coordinator/planner name
    share_link_expiration_date: Optional[str] = None
    guest_upload_expiration_date: Optional[str] = None
    guest_upload_enabled: bool = True
    has_download_all_password: bool = False
    theme: str = "classic"
    # Display settings
    display_mode: str = "slideshow"
    display_transition: str = "crossfade"
    display_interval: int = 6
    collage_preset_id: Optional[str] = None  # Selected collage preset
    created_at: str
    photo_count: int = 0
    auto_delete_date: Optional[str] = None  # When gallery will be auto-deleted
    days_until_deletion: Optional[int] = None  # Days remaining until deletion
    is_edit_locked: bool = False  # Whether editing is locked (7 days after creation)
    days_until_edit_lock: int = 7  # Days remaining before edit lock
    download_locked_until_payment: bool = False  # Downloads locked until payment approved


class GalleryUpdate(BaseModel):
    """Model for updating gallery"""
    title: Optional[str] = None
    description: Optional[str] = None
    password: Optional[str] = None
    event_title: Optional[str] = None
    event_date: Optional[str] = None
    coordinator_name: Optional[str] = None  # Event coordinator/planner name
    share_link_expiration_days: Optional[int] = None
    guest_upload_enabled_days: Optional[int] = None
    download_all_password: Optional[str] = None
    theme: Optional[str] = None
    # Password removal flags
    remove_password: Optional[bool] = None  # Set to True to remove gallery password
    remove_download_password: Optional[bool] = None  # Set to True to remove download password
    # Display settings
    display_mode: Optional[str] = None
    display_transition: Optional[str] = None
    display_interval: Optional[int] = None
    collage_preset_id: Optional[str] = None


class Section(BaseModel):
    """Model for gallery section"""
    id: str
    name: str
    order: int
    type: str = "photo"  # "photo", "video", "fotoshare", "gdrive", or "pcloud"
    contributor_link: Optional[str] = None  # Unique link for contributor uploads
    contributor_name: Optional[str] = None  # Company/contributor name
    contributor_role: Optional[str] = None  # Role description
    contributor_enabled: bool = False  # Whether contributor uploads are enabled
    # Fotoshare-specific fields
    fotoshare_url: Optional[str] = None  # The fotoshare.co event URL
    fotoshare_last_sync: Optional[str] = None  # Last sync timestamp
    fotoshare_expired: bool = False  # Whether the link has expired
    # Google Drive-specific fields
    gdrive_folder_id: Optional[str] = None  # Google Drive folder ID
    gdrive_folder_url: Optional[str] = None  # Original folder URL
    gdrive_last_sync: Optional[str] = None  # Last sync timestamp
    gdrive_error: Optional[str] = None  # Last error message if any
    # pCloud-specific fields
    pcloud_code: Optional[str] = None  # The pCloud share link code
    pcloud_folder_name: Optional[str] = None  # Name of the linked folder
    pcloud_last_sync: Optional[str] = None  # Last sync timestamp
    pcloud_error: Optional[str] = None  # Last error message if any


class Photo(BaseModel):
    """Model for photo"""
    model_config = ConfigDict(extra="ignore")
    id: str
    gallery_id: str
    filename: str
    original_filename: Optional[str] = None
    url: str
    thumbnail_url: Optional[str] = None  # Small thumbnail for grids
    thumbnail_medium_url: Optional[str] = None  # Medium thumbnail for gallery view
    uploaded_by: str  # "photographer", "guest", or "contributor"
    contributor_name: Optional[str] = None  # Company name if uploaded by contributor
    section_id: Optional[str] = None
    uploaded_at: str
    order: int = 0
    is_highlight: bool = False
    is_hidden: bool = False
    is_flagged: bool = False
    auto_flagged: bool = False  # True if system auto-flagged (e.g., thumbnail failure)
    flagged_at: Optional[str] = None
    flagged_reason: Optional[str] = None


class PasswordVerify(BaseModel):
    """Model for password verification"""
    password: str


class BulkPhotoAction(BaseModel):
    """Model for bulk photo operations"""
    photo_ids: List[str]
    action: str
    section_id: Optional[str] = None


class PhotoReorder(BaseModel):
    """Model for reordering photos"""
    photo_orders: List[dict]


class BulkFlagAction(BaseModel):
    """Model for bulk flag operation"""
    photo_ids: List[str]
    reason: Optional[str] = None


class BulkUnflagAction(BaseModel):
    """Model for bulk unflag operation"""
    photo_ids: List[str]


class PublicGallery(BaseModel):
    """Model for public gallery view"""
    model_config = ConfigDict(extra="ignore")
    id: str
    title: str
    description: Optional[str] = None
    photographer_name: str
    has_password: bool
    cover_photo_url: Optional[str] = None
    cover_photo_position: Optional[dict] = None
    sections: List[Section] = []
    event_title: Optional[str] = None
    event_date: Optional[str] = None
    coordinator_name: Optional[str] = None  # Event coordinator/planner name
    is_expired: bool = False
    guest_upload_enabled: bool = True
    has_download_all_password: bool = False
    theme: str = "classic"
    photo_count: int = 0
    # Display settings for public view
    display_mode: str = "slideshow"
    display_transition: str = "crossfade"
    display_interval: int = 6
    collage_preset_id: Optional[str] = None


class CoverPhotoPosition(BaseModel):
    """Model for cover photo positioning"""
    scale: float = 1.0
    positionX: float = 50.0
    positionY: float = 50.0


class DuplicateCheckRequest(BaseModel):
    """Request model for duplicate check"""
    file_hashes: List[str]


class DuplicateCheckResponse(BaseModel):
    """Response model for duplicate check"""
    existing_hashes: List[str]
    new_hashes: List[str]


class ThumbnailRepairRequest(BaseModel):
    """Request model for thumbnail repair endpoint"""
    force_regenerate: bool = False


class PhotoHealthCheck(BaseModel):
    """Result of a photo health check"""
    photo_id: str
    original_valid: bool
    thumbnail_small_valid: bool
    thumbnail_medium_valid: bool
    is_flagged: bool
    flagged_reason: Optional[str] = None
    needs_repair: bool
