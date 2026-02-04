"""
Gallery helper services
"""
from datetime import datetime, timezone, timedelta
from core.config import GALLERY_EDIT_LOCK_DAYS, FREE_GALLERY_EXPIRATION_HOURS


def is_gallery_locked(gallery: dict) -> bool:
    """Check if gallery downloads are locked due to pending payment"""
    return gallery.get("download_locked_until_payment", False)


def is_demo_expired(gallery: dict) -> bool:
    """Check if a demo/free gallery has expired (6 hours)"""
    auto_delete_date = gallery.get("auto_delete_date")
    if not auto_delete_date:
        return False
    
    try:
        delete_date = datetime.fromisoformat(auto_delete_date.replace('Z', '+00:00'))
        return datetime.now(timezone.utc) >= delete_date
    except:
        return False


def calculate_days_until_deletion(auto_delete_date: str) -> int:
    """Calculate days remaining until gallery deletion"""
    if not auto_delete_date:
        return -1  # Never deleted
    
    try:
        delete_date = datetime.fromisoformat(auto_delete_date.replace('Z', '+00:00'))
        now = datetime.now(timezone.utc)
        delta = delete_date - now
        return max(0, delta.days)
    except:
        return -1


def is_gallery_edit_locked(created_at: str) -> bool:
    """Check if gallery editing is locked (7 days after creation)"""
    if not created_at:
        return False
    
    try:
        created = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
        lock_date = created + timedelta(days=GALLERY_EDIT_LOCK_DAYS)
        return datetime.now(timezone.utc) >= lock_date
    except:
        return False


def get_edit_lock_info(created_at: str) -> dict:
    """Get edit lock status and days remaining"""
    if not created_at:
        return {"is_locked": False, "days_until_lock": GALLERY_EDIT_LOCK_DAYS}
    
    try:
        created = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
        lock_date = created + timedelta(days=GALLERY_EDIT_LOCK_DAYS)
        now = datetime.now(timezone.utc)
        
        if now >= lock_date:
            return {"is_locked": True, "days_until_lock": 0}
        
        days_remaining = (lock_date - now).days
        return {"is_locked": False, "days_until_lock": days_remaining}
    except:
        return {"is_locked": False, "days_until_lock": GALLERY_EDIT_LOCK_DAYS}
