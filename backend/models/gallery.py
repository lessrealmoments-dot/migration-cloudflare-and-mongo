"""
Gallery-related Pydantic models
"""
from pydantic import BaseModel, ConfigDict
from typing import List, Optional


class GalleryCreate(BaseModel):
    title: str
    description: Optional[str] = None
    password: Optional[str] = None
    event_title: Optional[str] = None
    event_date: Optional[str] = None
    share_link_expiration_days: int = 30
    guest_upload_enabled_days: int = 3
    download_all_password: Optional[str] = None
    theme: str = "classic"
    display_mode: str = "slideshow"
    display_transition: str = "crossfade"
    display_interval: int = 6


class Gallery(BaseModel):
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
    share_link_expiration_date: Optional[str] = None
    guest_upload_expiration_date: Optional[str] = None
    guest_upload_enabled: bool = True
    has_download_all_password: bool = False
    theme: str = "classic"
    display_mode: str = "slideshow"
    display_transition: str = "crossfade"
    display_interval: int = 6
    created_at: str
    photo_count: int = 0
    auto_delete_date: Optional[str] = None
    days_until_deletion: Optional[int] = None
    is_edit_locked: bool = False
    days_until_edit_lock: int = 7
    download_locked_until_payment: bool = False


class GalleryUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    password: Optional[str] = None
    event_title: Optional[str] = None
    event_date: Optional[str] = None
    share_link_expiration_days: Optional[int] = None
    guest_upload_enabled_days: Optional[int] = None
    download_all_password: Optional[str] = None
    theme: Optional[str] = None


class Section(BaseModel):
    id: str
    name: str
    order: int
    contributor_link: Optional[str] = None
    contributor_name: Optional[str] = None
    contributor_enabled: bool = False


class Photo(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    gallery_id: str
    filename: str
    original_filename: Optional[str] = None
    url: str
    thumbnail_url: Optional[str] = None
    thumbnail_medium_url: Optional[str] = None
    uploaded_by: str
    contributor_name: Optional[str] = None
    section_id: Optional[str] = None
    uploaded_at: str
    order: int = 0
    is_highlight: bool = False
    is_hidden: bool = False
    is_flagged: bool = False
    flagged_at: Optional[str] = None
    flagged_reason: Optional[str] = None


class PasswordVerify(BaseModel):
    password: str


class BulkPhotoAction(BaseModel):
    photo_ids: List[str]
    action: str
    section_id: Optional[str] = None


class PhotoReorder(BaseModel):
    photo_orders: List[dict]


class BulkFlagAction(BaseModel):
    photo_ids: List[str]
    reason: Optional[str] = None


class BulkUnflagAction(BaseModel):
    photo_ids: List[str]


class PublicGallery(BaseModel):
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
    is_expired: bool = False
    guest_upload_enabled: bool = True
    has_download_all_password: bool = False
    theme: str = "classic"
    photo_count: int = 0


class CoverPhotoPosition(BaseModel):
    scale: float = 1.0
    positionX: float = 50.0
    positionY: float = 50.0


class DuplicateCheckRequest(BaseModel):
    file_hashes: List[str]


class DuplicateCheckResponse(BaseModel):
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

