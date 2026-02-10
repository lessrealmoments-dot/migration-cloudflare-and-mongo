"""
Background Tasks Module for EventsGallery

This module contains all background tasks that run continuously.
Tasks are started during application lifespan and run in the background.

Dependencies (injected at startup):
- db: MongoDB database connection
- storage: Storage service (R2/local)
- logger: Logging instance
"""
import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any
import logging

# Module-level references to dependencies (set by init_tasks)
_db = None
_storage = None
_logger = None
_sync_task_running = True

# References to helper functions (set by init_tasks)
_scrape_fotoshare_videos = None
_fetch_pcloud_folder = None
_get_gdrive_photos = None
_get_drive_service_for_user = None
_UPLOAD_DIR = None
_DRIVE_SYNC_INTERVAL = 300


def init_tasks(
    db,
    storage,
    logger,
    scrape_fotoshare_videos,
    fetch_pcloud_folder,
    get_gdrive_photos,
    get_drive_service_for_user,
    UPLOAD_DIR,
    DRIVE_SYNC_INTERVAL=300
):
    """
    Initialize the tasks module with required dependencies.
    Must be called before starting any background tasks.
    """
    global _db, _storage, _logger, _sync_task_running
    global _scrape_fotoshare_videos, _fetch_pcloud_folder, _get_gdrive_photos
    global _get_drive_service_for_user, _UPLOAD_DIR, _DRIVE_SYNC_INTERVAL
    
    _db = db
    _storage = storage
    _logger = logger
    _scrape_fotoshare_videos = scrape_fotoshare_videos
    _fetch_pcloud_folder = fetch_pcloud_folder
    _get_gdrive_photos = get_gdrive_photos
    _get_drive_service_for_user = get_drive_service_for_user
    _UPLOAD_DIR = UPLOAD_DIR
    _DRIVE_SYNC_INTERVAL = DRIVE_SYNC_INTERVAL
    _sync_task_running = True
    
    _logger.info("Background tasks module initialized")


def stop_tasks():
    """Signal all tasks to stop"""
    global _sync_task_running
    _sync_task_running = False


async def auto_refresh_fotoshare_sections():
    """
    Background task to auto-refresh fotoshare sections based on age:
    - Day 1 (0-24h): Every 10 minutes
    - Day 2 (24-48h): Every hour
    - Day 3-30 (48h - 30 days): Every 24 hours
    - After 30 days: Every 30 days
    """
    _logger.info("Fotoshare auto-refresh task started")
    
    while _sync_task_running:
        try:
            now = datetime.now(timezone.utc)
            
            # Find all galleries with fotoshare sections
            galleries = await _db.galleries.find(
                {"sections.type": "fotoshare"},
                {"_id": 0, "id": 1, "sections": 1}
            ).to_list(None)
            
            refreshed_count = 0
            
            for gallery in galleries:
                for section in gallery.get("sections", []):
                    if section.get("type") != "fotoshare":
                        continue
                    
                    # Skip expired sections
                    if section.get("fotoshare_expired"):
                        continue
                    
                    fotoshare_url = section.get("fotoshare_url")
                    if not fotoshare_url:
                        continue
                    
                    last_sync_str = section.get("fotoshare_last_sync")
                    if not last_sync_str:
                        should_refresh = True
                    else:
                        try:
                            last_sync = datetime.fromisoformat(last_sync_str.replace('Z', '+00:00'))
                            age = now - last_sync
                            age_hours = age.total_seconds() / 3600
                            age_days = age_hours / 24
                            
                            section_age_days = age_days
                            
                            if section_age_days < 1:
                                refresh_interval_minutes = 10
                            elif section_age_days < 2:
                                refresh_interval_minutes = 60
                            elif section_age_days < 30:
                                refresh_interval_minutes = 24 * 60
                            else:
                                refresh_interval_minutes = 30 * 24 * 60
                            
                            minutes_since_sync = age.total_seconds() / 60
                            should_refresh = minutes_since_sync >= refresh_interval_minutes
                            
                        except Exception as e:
                            _logger.warning(f"Error parsing last_sync date: {e}")
                            should_refresh = True
                    
                    if should_refresh:
                        try:
                            scrape_result = await _scrape_fotoshare_videos(fotoshare_url)
                            sync_time = datetime.now(timezone.utc).isoformat()
                            
                            sections = gallery.get("sections", [])
                            for s in sections:
                                if s.get("id") == section.get("id"):
                                    s["fotoshare_last_sync"] = sync_time
                                    s["fotoshare_expired"] = scrape_result.get("expired", False)
                                    break
                            
                            await _db.galleries.update_one(
                                {"id": gallery["id"]},
                                {"$set": {"sections": sections}}
                            )
                            
                            if scrape_result.get("success"):
                                existing = await _db.fotoshare_videos.find(
                                    {"gallery_id": gallery["id"], "section_id": section["id"]},
                                    {"_id": 0, "hash": 1}
                                ).to_list(1000)
                                existing_hashes = {v["hash"] for v in existing}
                                
                                new_videos = []
                                for video_data in scrape_result.get("videos", []):
                                    if video_data["hash"] not in existing_hashes:
                                        new_videos.append({
                                            "id": str(uuid.uuid4()),
                                            "gallery_id": gallery["id"],
                                            "section_id": section["id"],
                                            "hash": video_data["hash"],
                                            "source_url": video_data["source_url"],
                                            "thumbnail_url": video_data["thumbnail_url"],
                                            "width": video_data.get("width", 1080),
                                            "height": video_data.get("height", 1920),
                                            "file_type": video_data.get("file_type", "mp4"),
                                            "file_source": video_data.get("file_source", "lumabooth"),
                                            "created_at_source": video_data.get("created_at_source"),
                                            "order": video_data.get("order", 0),
                                            "synced_at": sync_time
                                        })
                                
                                if new_videos:
                                    await _db.fotoshare_videos.insert_many(new_videos)
                                    _logger.info(f"Auto-refresh: Added {len(new_videos)} new videos to section {section['id']}")
                            
                            refreshed_count += 1
                            
                        except Exception as e:
                            _logger.error(f"Auto-refresh error for section {section.get('id')}: {e}")
            
            if refreshed_count > 0:
                _logger.info(f"Fotoshare auto-refresh: Refreshed {refreshed_count} sections")
                
        except Exception as e:
            _logger.error(f"Fotoshare auto-refresh task error: {e}")
        
        await asyncio.sleep(300)  # Check every 5 minutes


async def auto_sync_gdrive_sections():
    """
    Background task to auto-sync Google Drive sections.
    Refresh interval: Every 30 minutes for sections with data.
    """
    _logger.info("Google Drive auto-sync task started")
    
    while _sync_task_running:
        try:
            now = datetime.now(timezone.utc)
            
            galleries = await _db.galleries.find(
                {"sections.type": "gdrive", "sections.gdrive_folder_id": {"$ne": None}},
                {"_id": 0, "id": 1, "sections": 1}
            ).to_list(None)
            
            synced_count = 0
            
            for gallery in galleries:
                for section in gallery.get("sections", []):
                    if section.get("type") != "gdrive" or not section.get("gdrive_folder_id"):
                        continue
                    
                    folder_id = section.get("gdrive_folder_id")
                    last_sync_str = section.get("gdrive_last_sync")
                    
                    should_sync = False
                    if not last_sync_str:
                        should_sync = True
                    else:
                        try:
                            last_sync = datetime.fromisoformat(last_sync_str.replace('Z', '+00:00'))
                            minutes_since_sync = (now - last_sync).total_seconds() / 60
                            should_sync = minutes_since_sync >= 30
                        except:
                            should_sync = True
                    
                    if should_sync:
                        try:
                            gdrive_data = await _get_gdrive_photos(folder_id)
                            
                            if gdrive_data['success']:
                                existing = await _db.gdrive_photos.find(
                                    {"gallery_id": gallery["id"], "section_id": section["id"]},
                                    {"_id": 0, "file_id": 1}
                                ).to_list(10000)
                                existing_file_ids = {p["file_id"] for p in existing}
                                
                                sync_time = now.isoformat()
                                new_photos = []
                                
                                for idx, photo in enumerate(gdrive_data['photos']):
                                    if photo['file_id'] not in existing_file_ids:
                                        new_photos.append({
                                            "id": str(uuid.uuid4()),
                                            "gallery_id": gallery["id"],
                                            "section_id": section["id"],
                                            "gdrive_folder_id": folder_id,
                                            "file_id": photo['file_id'],
                                            "name": photo['name'],
                                            "mime_type": photo.get('mime_type', 'image/jpeg'),
                                            "size": photo.get('size', 0),
                                            "width": photo.get('width'),
                                            "height": photo.get('height'),
                                            "thumbnail_url": photo['thumbnail_url'],
                                            "view_url": photo['view_url'],
                                            "created_time": photo.get('created_time'),
                                            "order": len(existing_file_ids) + idx,
                                            "is_highlight": False,
                                            "synced_at": sync_time
                                        })
                                
                                if new_photos:
                                    await _db.gdrive_photos.insert_many(new_photos)
                                    _logger.info(f"Synced {len(new_photos)} new photos for gallery {gallery['id']}")
                                
                                await _db.galleries.update_one(
                                    {"id": gallery["id"], "sections.id": section["id"]},
                                    {"$set": {"sections.$.gdrive_last_sync": sync_time, "sections.$.gdrive_error": None}}
                                )
                                
                                synced_count += 1
                        except Exception as e:
                            _logger.error(f"Auto-sync error for gdrive section {section.get('id')}: {e}")
            
            if synced_count > 0:
                _logger.info(f"Google Drive auto-sync: Synced {synced_count} sections")
                
        except Exception as e:
            _logger.error(f"Google Drive auto-sync task error: {e}")
        
        await asyncio.sleep(900)  # Check every 15 minutes


async def auto_sync_pcloud_sections():
    """
    Background task to auto-sync pCloud sections.
    Refresh interval: Every 30 minutes for sections with data.
    """
    _logger.info("pCloud auto-sync task started")
    
    while _sync_task_running:
        try:
            now = datetime.now(timezone.utc)
            
            galleries = await _db.galleries.find(
                {"sections.type": "pcloud", "sections.pcloud_code": {"$ne": None}},
                {"_id": 0, "id": 1, "sections": 1}
            ).to_list(None)
            
            synced_count = 0
            
            for gallery in galleries:
                for section in gallery.get("sections", []):
                    if section.get("type") != "pcloud" or not section.get("pcloud_code"):
                        continue
                    
                    code = section.get("pcloud_code")
                    last_sync_str = section.get("pcloud_last_sync")
                    
                    should_sync = False
                    if not last_sync_str:
                        should_sync = True
                    else:
                        try:
                            last_sync = datetime.fromisoformat(last_sync_str.replace('Z', '+00:00'))
                            minutes_since_sync = (now - last_sync).total_seconds() / 60
                            should_sync = minutes_since_sync >= 30
                        except:
                            should_sync = True
                    
                    if should_sync:
                        try:
                            pcloud_data = await _fetch_pcloud_folder(code)
                            
                            if pcloud_data['success']:
                                existing = await _db.pcloud_photos.find(
                                    {"gallery_id": gallery["id"], "section_id": section["id"]},
                                    {"_id": 0, "fileid": 1}
                                ).to_list(10000)
                                existing_fileids = {p["fileid"] for p in existing}
                                
                                sync_time = now.isoformat()
                                new_photos = []
                                
                                for photo in pcloud_data['photos']:
                                    fileid_str = str(photo['fileid'])
                                    if fileid_str not in existing_fileids:
                                        new_photos.append({
                                            "id": str(uuid.uuid4()),
                                            "gallery_id": gallery["id"],
                                            "section_id": section["id"],
                                            "pcloud_code": code,
                                            "fileid": fileid_str,
                                            "name": photo['name'],
                                            "size": photo.get('size', 0),
                                            "width": photo.get('width'),
                                            "height": photo.get('height'),
                                            "contenttype": photo.get('contenttype', 'image/jpeg'),
                                            "supplier_name": photo.get('supplier_name'),
                                            "hash": str(photo.get('hash', '')) if photo.get('hash') else None,
                                            "created_at_source": photo.get('created'),
                                            "order": len(existing_fileids) + len(new_photos),
                                            "synced_at": sync_time
                                        })
                                
                                if new_photos:
                                    await _db.pcloud_photos.insert_many(new_photos)
                                    _logger.info(f"Synced {len(new_photos)} new pCloud photos for gallery {gallery['id']}")
                                
                                await _db.galleries.update_one(
                                    {"id": gallery["id"], "sections.id": section["id"]},
                                    {"$set": {"sections.$.pcloud_last_sync": sync_time, "sections.$.pcloud_error": None}}
                                )
                                
                                synced_count += 1
                        except Exception as e:
                            _logger.error(f"Auto-sync error for pcloud section {section.get('id')}: {e}")
            
            if synced_count > 0:
                _logger.info(f"pCloud auto-sync: Synced {synced_count} sections")
                
        except Exception as e:
            _logger.error(f"pCloud auto-sync task error: {e}")
        
        await asyncio.sleep(900)  # Check every 15 minutes


async def auto_sync_drive_backup_task():
    """Background task that auto-syncs galleries to Google Drive backup"""
    _logger.info("Google Drive backup auto-sync task started")
    
    while _sync_task_running:
        try:
            users_with_drive = await _db.drive_credentials.find({
                "drive_auto_sync": True
            }, {"_id": 0}).to_list(None)
            
            for creds in users_with_drive:
                user_id = creds["user_id"]
                galleries = await _db.galleries.find({
                    "photographer_id": user_id
                }, {"_id": 0}).to_list(None)
                
                for gallery in galleries:
                    await _sync_gallery_to_drive(user_id, gallery["id"])
            
            _logger.info(f"Auto-sync completed for {len(users_with_drive)} users")
        except Exception as e:
            _logger.error(f"Auto-sync error: {e}")
        
        await asyncio.sleep(_DRIVE_SYNC_INTERVAL)


async def _sync_gallery_to_drive(user_id: str, gallery_id: str):
    """Sync a single gallery to Google Drive backup"""
    try:
        gallery = await _db.galleries.find_one({"id": gallery_id}, {"_id": 0})
        if not gallery:
            return
        
        drive_service = await _get_drive_service_for_user(user_id)
        if not drive_service:
            _logger.warning(f"No Drive service available for user {user_id}")
            return
        
        photos = await _db.photos.find({
            "gallery_id": gallery_id,
            "drive_synced": {"$ne": True}
        }, {"_id": 0}).to_list(None)
        
        if not photos:
            return
        
        # ... rest of sync logic would go here
        # This is a simplified version - full implementation remains in server.py
        
    except Exception as e:
        _logger.error(f"Error syncing gallery {gallery_id} to drive: {e}")


async def auto_delete_expired_galleries():
    """Background task to delete galleries past their auto_delete_date (6 months default)"""
    _logger.info("Auto-delete expired galleries task started")
    
    while _sync_task_running:
        try:
            now = datetime.now(timezone.utc)
            
            expired_galleries = await _db.galleries.find({
                "auto_delete_date": {"$lt": now.isoformat()}
            }, {"_id": 0}).to_list(None)
            
            for gallery in expired_galleries:
                gallery_id = gallery["id"]
                photographer_id = gallery["photographer_id"]
                gallery_title = gallery.get("title", "Unknown")
                
                _logger.info(f"Auto-deleting expired gallery: {gallery_title} ({gallery_id})")
                
                try:
                    photos = await _db.photos.find({"gallery_id": gallery_id}, {"_id": 0}).to_list(None)
                    total_size_freed = 0
                    
                    for photo in photos:
                        try:
                            filename = photo.get("filename", "")
                            if filename:
                                await _storage.delete_file(f"photos/{filename}")
                                
                                photo_id = filename.rsplit('.', 1)[0]
                                file_ext = filename.rsplit('.', 1)[-1] if '.' in filename else 'jpg'
                                await _storage.delete_photo_with_thumbnails(photo_id, file_ext)
                                
                                if not _storage.r2_enabled:
                                    file_path = _UPLOAD_DIR / filename
                                    if file_path.exists():
                                        total_size_freed += file_path.stat().st_size
                        except Exception as e:
                            _logger.error(f"Failed to delete photo file {photo.get('filename')}: {e}")
                    
                    if gallery.get("cover_photo_url"):
                        cover_filename = gallery["cover_photo_url"].split("/")[-1]
                        try:
                            await _storage.delete_file(f"photos/{cover_filename}")
                        except Exception as e:
                            _logger.warning(f"Failed to delete cover photo {cover_filename}: {e}")
                    
                    await _db.photos.delete_many({"gallery_id": gallery_id})
                    await _db.gallery_videos.delete_many({"gallery_id": gallery_id})
                    await _db.fotoshare_videos.delete_many({"gallery_id": gallery_id})
                    await _db.gdrive_photos.delete_many({"gallery_id": gallery_id})
                    await _db.pcloud_photos.delete_many({"gallery_id": gallery_id})
                    await _db.drive_backups.delete_many({"gallery_id": gallery_id})
                    await _db.galleries.delete_one({"id": gallery_id})
                    
                    if total_size_freed > 0:
                        await _db.users.update_one(
                            {"id": photographer_id},
                            {"$inc": {"storage_used": -total_size_freed}}
                        )
                    
                    _logger.info(f"Successfully auto-deleted gallery: {gallery_title} ({gallery_id})")
                    
                except Exception as e:
                    _logger.error(f"Failed to auto-delete gallery {gallery_id}: {e}")
            
            if expired_galleries:
                _logger.info(f"Auto-delete task completed: {len(expired_galleries)} galleries removed")
        
        except Exception as e:
            _logger.error(f"Auto-delete task error: {e}")
        
        await asyncio.sleep(24 * 60 * 60)  # Check daily
