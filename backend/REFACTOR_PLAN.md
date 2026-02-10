# Backend Refactoring Plan

## Current State (February 2026)
- `server.py`: 10,071 lines
- 200 async functions
- 26 regular functions  
- 67 Pydantic models
- 170 API endpoints

## Existing Modular Structure (Partially Used)
```
backend/
├── server.py           # Monolithic (NEEDS REFACTORING)
├── models/             # EXISTS - partially matches server.py
│   ├── user.py        # ✅ Has user models
│   ├── gallery.py     # ✅ Has gallery models
│   ├── billing.py     # ✅ Has billing models
│   ├── notification.py # ✅ Has notification models
│   └── analytics.py   # ✅ Has analytics models
├── services/           # EXISTS - actively used
│   ├── storage.py     # ✅ R2/local storage (USED)
│   ├── auth.py        # ⚠️ NOT imported in server.py
│   ├── email_service.py # ⚠️ NOT imported in server.py
│   ├── integrations.py  # ⚠️ NOT imported in server.py
│   └── notifications.py # ⚠️ NOT imported in server.py
├── routes/             # EXISTS - empty (placeholder)
├── core/               # EXISTS - not imported
│   ├── config.py      # Has config but not used
│   └── dependencies.py # Has deps but not used
└── utils/              # NOT EXISTS
```

## Phase 1: Safe Cleanup (LOW RISK)
**Timeline: Can be done now**

1. ✅ Delete unused files:
   - `/app/=2.0.0` (DONE)
   
2. Remove duplicate model definitions:
   - Compare models in `server.py` with `models/*.py`
   - Update `models/*.py` to match server.py exactly
   - Import from models instead of defining in server.py

## Phase 2: Extract Utilities (LOW RISK)
**Create `/app/backend/utils/helpers.py`**

Move these functions from server.py:
- `extract_youtube_video_id()`
- `get_youtube_thumbnail_url()`
- `get_youtube_embed_url()`
- `extract_fotoshare_event_id()`
- `extract_pcloud_code()`
- `extract_gdrive_folder_id()`
- `hash_password()` / `verify_password()`
- `generate_thumbnail()` functions

## Phase 3: Extract Background Tasks (MEDIUM RISK)
**Create `/app/backend/tasks/background.py`**

Move these functions:
- `auto_refresh_fotoshare_sections()`
- `auto_sync_gdrive_sections()`
- `auto_sync_pcloud_sections()`
- `auto_sync_drive_task()`
- `auto_delete_expired_galleries()`

## Phase 4: Extract Routes (HIGH RISK - DO INCREMENTALLY)
**Create route files one at a time**

Priority order:
1. `/app/backend/routes/health.py` - Simple, low risk
2. `/app/backend/routes/public.py` - Public gallery endpoints
3. `/app/backend/routes/auth.py` - Authentication
4. `/app/backend/routes/admin.py` - Admin endpoints
5. `/app/backend/routes/galleries.py` - Gallery CRUD
6. `/app/backend/routes/photos.py` - Photo management
7. `/app/backend/routes/billing.py` - Subscription/payments
8. `/app/backend/routes/integrations.py` - Drive, pCloud, Fotoshare

## Testing Strategy
For each extraction:
1. Create the new module
2. Import in server.py (don't remove old code yet)
3. Test thoroughly
4. Remove duplicate code from server.py
5. Deploy and verify

## Current Blockers
- Production is live - can't risk breaking changes
- No automated test suite running in CI/CD
- Manual testing required for each change

## Recommendation
Start with Phase 1 and 2 (low risk), then do Phase 3 and 4 incrementally with thorough testing between each step.
