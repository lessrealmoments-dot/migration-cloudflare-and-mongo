"""Pydantic models/schemas for the PhotoShare API"""
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
from datetime import datetime


# ============== Auth Models ==============
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    business_name: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    id: str
    email: str
    name: str
    business_name: Optional[str] = None
    created_at: datetime
    max_galleries: int = 1
    storage_quota: int = 500 * 1024 * 1024
    storage_used: int = 0
    drive_connected: bool = False

class UserProfile(BaseModel):
    name: str
    business_name: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User

class ForgotPassword(BaseModel):
    email: EmailStr

class ChangePassword(BaseModel):
    current_password: str
    new_password: str


# ============== Admin Models ==============
class AdminLogin(BaseModel):
    username: str
    password: str

class AdminToken(BaseModel):
    access_token: str
    token_type: str = "bearer"

class PhotographerAdmin(BaseModel):
    id: str
    email: str
    name: str
    business_name: Optional[str] = None
    created_at: datetime
    max_galleries: int
    gallery_count: int = 0
    storage_quota: int = 500 * 1024 * 1024
    storage_used: int = 0
    status: str = "active"

class UpdateGalleryLimit(BaseModel):
    max_galleries: int

class UpdateStorageQuota(BaseModel):
    storage_quota: int

class LandingPageConfig(BaseModel):
    hero_title: str = "Share Your Photography, Beautifully"
    hero_subtitle: str = "Create stunning galleries, share with clients, and let them upload their own photos. The professional way to showcase and collaborate."
    brand_name: str = "PhotoShare"
    brand_tagline: Optional[str] = None
    hero_image_1: Optional[str] = None
    hero_image_2: Optional[str] = None
    hero_image_3: Optional[str] = None
    hero_image_4: Optional[str] = None
    hero_image_5: Optional[str] = None
    hero_image_6: Optional[str] = None
    hero_image_7: Optional[str] = None
    hero_image_8: Optional[str] = None
    hero_image_9: Optional[str] = None
    hero_image_10: Optional[str] = None


# ============== Gallery Models ==============
class GalleryCreate(BaseModel):
    title: str
    description: Optional[str] = None
    event_date: Optional[str] = None
    theme: str = "classic_elegance"
    password: Optional[str] = None
    share_link_expiration_days: Optional[int] = None
    guest_upload_enabled: bool = True
    guest_upload_enabled_days: int = 3
    download_all_password: Optional[str] = None

class Gallery(BaseModel):
    id: str
    photographer_id: str
    title: str
    description: Optional[str] = None
    event_date: Optional[str] = None
    theme: str = "classic_elegance"
    share_link: str
    password: Optional[str] = None
    share_link_expiration_date: Optional[datetime] = None
    guest_upload_enabled: bool = True
    guest_upload_expiration_date: Optional[datetime] = None
    download_all_password: Optional[str] = None
    cover_photo_url: Optional[str] = None
    cover_photo_position: Optional[dict] = None
    created_at: datetime
    photo_count: int = 0
    days_until_deletion: int = 180
    days_until_edit_lock: int = 7

class GalleryUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    event_date: Optional[str] = None
    theme: Optional[str] = None
    password: Optional[str] = None
    share_link_expiration_days: Optional[int] = None
    guest_upload_enabled: Optional[bool] = None
    guest_upload_enabled_days: Optional[int] = None
    download_all_password: Optional[str] = None

class Section(BaseModel):
    id: str
    gallery_id: str
    name: str
    order: int = 0


# ============== Photo Models ==============
class Photo(BaseModel):
    id: str
    gallery_id: str
    photographer_id: str
    url: str
    thumbnail_url: Optional[str] = None
    filename: str
    file_size: int = 0
    uploaded_at: datetime
    uploaded_by: str = "photographer"
    approved: bool = True
    is_hidden: bool = False
    is_highlight: bool = False
    section_id: Optional[str] = None
    order: int = 0
    is_flagged: bool = False
    flagged_by: Optional[str] = None
    flagged_at: Optional[datetime] = None
    flag_reason: Optional[str] = None

class PasswordVerify(BaseModel):
    password: str

class BulkPhotoAction(BaseModel):
    photo_ids: List[str]
    action: str  # 'delete', 'highlight', 'unhighlight', 'hide', 'show', 'move_section'
    section_id: Optional[str] = None

class PhotoReorder(BaseModel):
    photo_orders: List[dict]  # [{"id": "...", "order": 0}, ...]

class BulkFlagAction(BaseModel):
    photo_ids: List[str]
    reason: Optional[str] = None

class BulkUnflagAction(BaseModel):
    photo_ids: List[str]


# ============== Public Gallery Model ==============
class PublicGallery(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    event_date: Optional[str] = None
    theme: str
    photographer_name: str
    photographer_business: Optional[str] = None
    cover_photo_url: Optional[str] = None
    cover_photo_position: Optional[dict] = None
    photo_count: int = 0
    guest_upload_enabled: bool = True
    is_expired: bool = False
    has_download_all_password: bool = False
    sections: List[Section] = []
