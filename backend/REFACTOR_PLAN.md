# Backend Refactoring Plan

## Current State (February 2026)
- `server.py`: **9,967 lines** (down from 10,071)
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

## Remaining Work

### Phase 3: Background Tasks (MEDIUM RISK) - NOT STARTED
Create `/app/backend/tasks/background.py`:
- `auto_refresh_fotoshare_sections()`
- `auto_sync_gdrive_sections()`
- `auto_sync_pcloud_sections()`
- `auto_sync_drive_task()`
- `auto_delete_expired_galleries()`

**Complexity**: These tasks have deep dependencies on db, storage, and logging. Need careful extraction.

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

## Updated File Structure
```
backend/
├── server.py           # Main app (9,967 lines - reduced from 10,071)
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
├── routes/             # Empty - future use
├── tasks/              # Empty - future use
└── core/               # Not used
```

## Testing After Refactoring
All tests passed:
- ✅ Server module loads successfully
- ✅ All 168 API routes registered
- ✅ Storage backend: Cloudflare R2
- ✅ Background tasks running

