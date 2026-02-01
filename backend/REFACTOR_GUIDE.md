# Backend Refactoring Guide

## Current State
The `server.py` file is approximately 2900 lines and contains all API routes. While functional, it should be refactored for maintainability.

## Recommended Structure

```
backend/
├── server.py           # Main app, middleware, startup (slim)
├── database.py         # MongoDB connection, config
├── models/
│   ├── __init__.py
│   └── schemas.py      # All Pydantic models
├── routers/
│   ├── __init__.py
│   ├── auth.py         # /auth/* routes (~150 lines)
│   ├── admin.py        # /admin/* routes (~400 lines)
│   ├── galleries.py    # /galleries/* routes (~500 lines)
│   ├── photos.py       # Photo upload/management (~300 lines)
│   ├── public.py       # /public/* routes (~200 lines)
│   └── drive.py        # Google Drive integration (~200 lines)
├── services/
│   ├── __init__.py
│   ├── auth.py         # Password hashing, JWT, user validation
│   ├── storage.py      # File storage, quota management
│   ├── email.py        # Email sending (Resend)
│   └── drive.py        # Google Drive sync logic
└── utils/
    ├── __init__.py
    └── helpers.py      # Common utilities
```

## Route Summary (61 endpoints)

### Auth Routes (5)
- POST /auth/register
- POST /auth/login
- GET /auth/me
- PUT /auth/profile
- POST /auth/change-password
- POST /auth/forgot-password

### Admin Routes (15)
- POST /admin/login
- GET /admin/photographers
- PUT /admin/photographers/{id}/gallery-limit
- PUT /admin/photographers/{id}/storage-quota
- POST /admin/photographers/{id}/suspend
- POST /admin/photographers/{id}/activate
- DELETE /admin/photographers/{id}
- GET /admin/photographers/{id}/galleries
- GET /admin/galleries/{id}
- POST /admin/galleries/{id}/photos/flag
- POST /admin/galleries/{id}/photos/unflag
- GET /admin/landing-config
- PUT /admin/landing-config
- POST /admin/landing-image
- GET /admin/analytics
- GET /admin/activity-logs
- GET/PUT /admin/settings

### Gallery Routes (15)
- GET /galleries
- POST /galleries
- GET /galleries/{id}
- PUT /galleries/{id}
- DELETE /galleries/{id}
- POST /galleries/{id}/photos
- GET /galleries/{id}/photos
- DELETE /galleries/{id}/photos/{photo_id}
- POST /galleries/{id}/photos/bulk-action
- POST /galleries/{id}/photos/reorder
- POST /galleries/{id}/sections
- PUT /galleries/{id}/sections/{section_id}
- DELETE /galleries/{id}/sections/{section_id}
- POST /galleries/{id}/cover-photo
- PUT /galleries/{id}/cover-position
- GET /galleries/{id}/download-info
- GET /galleries/{id}/download-chunk/{chunk_number}

### Public Routes (8)
- GET /public/landing-config
- GET /public/gallery/{share_link}
- POST /public/gallery/{share_link}/verify-password
- GET /public/gallery/{share_link}/photos
- POST /public/gallery/{share_link}/upload
- POST /public/gallery/{share_link}/download-all
- GET /og/gallery/{share_link}

### Google Drive Routes (5)
- GET /galleries/{id}/drive/status
- GET /galleries/{id}/drive/connect
- GET /drive/callback
- POST /galleries/{id}/drive/sync
- POST /galleries/{id}/drive/disconnect

### Utility Routes (2)
- GET /health
- GET /photos/serve/{filename}

## Priority for Refactoring
1. Extract Pydantic models to models/schemas.py
2. Extract auth utilities to services/auth.py
3. Split routes by domain into routers/
4. Extract Google Drive logic to services/drive.py
5. Create database.py for connection management
