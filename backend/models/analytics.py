"""
Analytics-related Pydantic models
"""
from pydantic import BaseModel
from typing import List, Optional


class GalleryAnalytics(BaseModel):
    """Analytics for a single gallery"""
    gallery_id: str
    gallery_title: str
    view_count: int = 0
    total_photos: int = 0
    photographer_photos: int = 0
    guest_photos: int = 0
    created_at: str
    days_until_deletion: Optional[int] = None
    qr_scans: int = 0
    download_count: int = 0


class PhotographerAnalytics(BaseModel):
    """Aggregated analytics for a photographer"""
    total_galleries: int = 0
    total_photos: int = 0
    total_views: int = 0
    total_qr_scans: int = 0
    total_downloads: int = 0
    storage_used: int = 0
    storage_quota: int = 500 * 1024 * 1024  # Default 500MB
    galleries: List[GalleryAnalytics] = []
    # Time-based stats
    views_today: int = 0
    views_this_week: int = 0
    views_this_month: int = 0


class AdminAnalytics(BaseModel):
    """Site-wide analytics for admin"""
    total_photographers: int = 0
    total_galleries: int = 0
    total_photos: int = 0
    total_storage_used: int = 0
    top_galleries: List[GalleryAnalytics] = []


class GoogleDriveStatus(BaseModel):
    """Status of Google Drive connection"""
    connected: bool = False
    auto_sync_enabled: bool = False


class GoogleDriveBackupRequest(BaseModel):
    """Request to backup gallery to Google Drive"""
    gallery_id: str


class GoogleDriveBackupStatus(BaseModel):
    """Status of a Google Drive backup operation"""
    gallery_id: str
    status: str  # 'pending', 'in_progress', 'completed', 'failed'
    folder_id: Optional[str] = None
    folder_url: Optional[str] = None
    photos_backed_up: int = 0
    total_photos: int = 0
    error_message: Optional[str] = None
    last_updated: str
