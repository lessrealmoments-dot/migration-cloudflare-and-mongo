"""
Tasks package for EventsGallery backend

Contains background tasks that run continuously during application lifetime.
"""
from .background import (
    init_tasks,
    stop_tasks,
    auto_refresh_fotoshare_sections,
    auto_sync_gdrive_sections,
    auto_sync_pcloud_sections,
    auto_sync_drive_backup_task,
    auto_delete_expired_galleries,
)

__all__ = [
    'init_tasks',
    'stop_tasks',
    'auto_refresh_fotoshare_sections',
    'auto_sync_gdrive_sections',
    'auto_sync_pcloud_sections',
    'auto_sync_drive_backup_task',
    'auto_delete_expired_galleries',
]
