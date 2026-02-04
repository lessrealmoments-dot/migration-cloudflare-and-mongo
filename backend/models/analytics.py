"""
Analytics-related Pydantic models
"""
from pydantic import BaseModel
from typing import Optional


class GalleryAnalytics(BaseModel):
    gallery_id: str
    title: str
    views: int = 0
    unique_visitors: int = 0
    downloads: int = 0
    qr_scans: int = 0
    guest_uploads: int = 0
    share_link_clicks: int = 0
    avg_time_spent: float = 0.0


class PhotographerAnalytics(BaseModel):
    total_galleries: int = 0
    total_photos: int = 0
    total_views: int = 0
    total_downloads: int = 0
    total_qr_scans: int = 0
    total_guest_uploads: int = 0
    storage_used: int = 0
    storage_quota: int = 0
    most_viewed_gallery: Optional[str] = None


class AdminAnalytics(BaseModel):
    total_photographers: int = 0
    total_galleries: int = 0
    total_photos: int = 0
    storage_used_all: int = 0


class GoogleDriveStatus(BaseModel):
    connected: bool = False
    auto_sync_enabled: bool = False


class GoogleDriveBackupRequest(BaseModel):
    gallery_id: str


class GoogleDriveBackupStatus(BaseModel):
    status: str
    progress: int = 0
    total: int = 0
    message: str = ""
    folder_url: Optional[str] = None
    last_backup: Optional[str] = None
    photos_backed_up: int = 0
    error: Optional[str] = None
