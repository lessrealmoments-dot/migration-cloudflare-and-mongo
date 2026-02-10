# Backend Refactoring Plan

## Current State (December 2025)
- `server.py`: **9,542 lines** (down from 10,071 - reduced 529 lines)
- 200 async functions
- 26 regular functions  
- ~50 Pydantic models (reduced after extracting to models/)
- 168 API endpoints

## Progress Tracker ✅

### Phase 1: Models Extraction - COMPLETED ✅
- ✅ Created `/app/backend/models/video.py` (GalleryVideo, VideoCreate, VideoUpdate, FotoshareVideo, PCloudPhoto)
- ✅ Created `/app/backend/models/collage.py` (CollagePreset, CollagePresetCreate, CollagePresetUpdate, etc.)
- ✅ Added ThumbnailRepairRequest, PhotoHealthCheck to `/app/backend/models/gallery.py`
- ✅ Updated `/app/backend/models/__init__.py` to export all models
- ✅ Removed duplicate model definitions from server.py
- **Lines reduced**: 104 lines

### Phase 2: Utils Extraction - COMPLETED ✅
- ✅ Created `/app/backend/utils/helpers.py` with:
  - `extract_youtube_video_id()`
  - `get_youtube_thumbnail_url()`
  - `get_youtube_embed_url()`
  - `extract_fotoshare_event_id()`
  - `extract_pcloud_code()`
  - `extract_gdrive_folder_id()`
  - `generate_random_string()`
  - `format_file_size()`
- ✅ Created `/app/backend/utils/__init__.py`
- ✅ server.py now imports from utils.helpers

### Phase 3: Background Tasks Extraction - COMPLETED ✅
- ✅ Created `/app/backend/tasks/background.py` with:
  - `auto_refresh_fotoshare_sections()` - Auto-refresh fotoshare sections based on age
  - `auto_sync_gdrive_sections()` - Sync Google Drive sections every 30 minutes
  - `auto_sync_pcloud_sections()` - Sync pCloud sections every 30 minutes
  - `auto_sync_drive_backup_task()` - Auto-backup galleries to Google Drive
  - `auto_delete_expired_galleries()` - Delete galleries past auto_delete_date
- ✅ Created `/app/backend/tasks/__init__.py` with exports
- ✅ Implemented dependency injection via `init_tasks()` function
- ✅ Updated server.py lifespan to initialize and use tasks module
- ✅ Removed all duplicate task implementations from server.py
- **Lines reduced**: 425 lines

## Remaining Work

### Phase 4: Routes Extraction (HIGH RISK) - NOT STARTED
Extract routes to separate files:
1. `/app/backend/routes/health.py` - Health check endpoints
2. `/app/backend/routes/auth.py` - Authentication endpoints
3. `/app/backend/routes/public.py` - Public gallery endpoints
4. `/app/backend/routes/galleries.py` - Gallery CRUD
5. `/app/backend/routes/photos.py` - Photo management
6. `/app/backend/routes/admin.py` - Admin endpoints
7. `/app/backend/routes/billing.py` - Subscription/payments
8. `/app/backend/routes/integrations.py` - Drive, pCloud, Fotoshare

**Complexity**: Routes use many shared dependencies (db, storage, auth functions). Need to create a shared context module first.

### Phase 5: Services Consolidation - NOT STARTED
Currently unused service files that could absorb logic from server.py:
- `/app/backend/services/auth.py` - Could contain auth logic currently in server.py
- `/app/backend/services/email_service.py` - Could contain email sending logic
- `/app/backend/services/integrations.py` - Could contain pCloud/GDrive/Fotoshare logic
- `/app/backend/services/notifications.py` - Could contain notification logic

## Updated File Structure
```
backend/
├── server.py           # Main app (9,542 lines - reduced from 10,071)
├── models/             # ✅ UPDATED - Now used by server.py
│   ├── __init__.py     # ✅ Exports all models
│   ├── user.py         
│   ├── gallery.py      # ✅ Added ThumbnailRepairRequest, PhotoHealthCheck
│   ├── billing.py      
│   ├── notification.py 
│   ├── analytics.py    
│   ├── video.py        # ✅ NEW - Video/Section models
│   └── collage.py      # ✅ NEW - Collage preset models
├── services/           
│   ├── storage.py      # ✅ Used
│   ├── auth.py         # ⚠️ Not used
│   ├── email_service.py # ⚠️ Not used
│   ├── integrations.py  # ⚠️ Not used
│   └── notifications.py # ⚠️ Not used
├── utils/              # ✅ NEW
│   ├── __init__.py     # ✅ Exports all utils
│   └── helpers.py      # ✅ URL extraction, string utils
├── tasks/              # ✅ NEW - Background tasks module
│   ├── __init__.py     # ✅ Exports all tasks
│   └── background.py   # ✅ All 5 background tasks with dependency injection
├── routes/             # Empty - future use
└── core/               # Not used
```

## Testing After Refactoring
All tests passed:
- ✅ Server module loads successfully
- ✅ All 168 API routes registered
- ✅ Storage backend: Cloudflare R2
- ✅ Background tasks running via tasks module
- ✅ Dependency injection working (db, storage, logger injected)
- ✅ API health check passing

## Summary of Line Reductions
| Phase | Lines Removed |
|-------|---------------|
| Phase 1 (Models) | 104 |
| Phase 2 (Utils) | ~0 (imports added) |
| Phase 3 (Tasks) | 425 |
| **Total** | **529 lines** |

Current `server.py`: **9,542 lines** (target: <5,000 lines)
