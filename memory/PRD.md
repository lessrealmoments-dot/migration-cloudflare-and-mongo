# PhotoShare - Product Requirements Document

## Original Problem Statement
Build a website similar to Pic-time.com where photographers can create photo galleries and share them with guests via shareable links.

## Core Features
- **Photographers**: Create accounts, manage galleries, upload photos
- **Guests**: View galleries and upload photos via shareable links
- **Admin**: Manage photographers, site settings, and analytics

---

## Implemented Features (as of Jan 31, 2026)

### Gallery Management
- [x] Create galleries with titles, descriptions, passwords
- [x] Set cover photos for galleries
- [x] **Cover Photo Editor** - zoom/pan/crop functionality with touch support
- [x] **QR Code Generator** - downloadable PNG for easy sharing (NEW)
- [x] Create and manage sections within galleries
- [x] Editable event title and event date
- [x] 15 gallery themes (elegant + fun)
- [x] Share link expiration periods
- [x] Guest upload time restrictions
- [x] Password-protected "Download All"
- [x] Delete gallery with double-confirmation
- [x] Upload progress UI for photographers

### High Concurrency Optimization (NEW - Jan 31, 2026)
- [x] **Database Indexes** - Optimized indexes on users, galleries, photos collections
- [x] **MongoDB Connection Pooling** - maxPoolSize: 100, minPoolSize: 10
- [x] **Async File I/O** - Non-blocking file writes with aiofiles
- [x] **Upload Concurrency Control** - Semaphore limiting 50 concurrent uploads
- [x] System can handle 150-200 concurrent users uploading photos

### Photo Management
- [x] Photographer photo uploads with progress tracking
- [x] Guest photo uploads via share link
- [x] Duplicate upload prevention (server-side)
- [x] Upload animations and progress indicators
- [x] Full-screen lightbox viewer
- [x] Guest photo moderation by photographer
- [x] **Photo Reordering** - Drag & drop to rearrange photo sequence (NEW)
- [x] **Multi-Select Actions** (NEW):
  - Select/Select All photos
  - Bulk Delete
  - Bulk Move to Section
  - Mark as Highlight (appears first)
  - Hide from Guests
  - Show Hidden Photos

### User Features
- [x] Photographer registration/login (JWT)
- [x] Profile editing (name, business name)
- [x] Change password functionality
- [x] Forgot password (with Resend API)
- [x] Analytics dashboard showing views, photos, storage

### Admin Features
- [x] Admin login and dashboard
- [x] Manage photographer gallery limits
- [x] Storage quota management (100MB to 10GB)
- [x] Landing page content customization
- [x] Landing page image uploads
- [x] Site-wide analytics
- [x] **Enhanced Admin Panel** (NEW):
  - Search/filter photographers by name, email
  - Sort by newest, storage used, name
  - Suspend/Activate accounts
  - Delete photographer (with all data)
  - View photographer's galleries
  - Activity logs tracking
  - Admin settings management

### Auto-Delete System
- [x] Galleries auto-delete after 6 months (180 days)
- [x] Days until deletion shown in dashboard
- [x] Background task for automated cleanup

### Storage Quota System
- [x] Default 500MB quota per photographer
- [x] Storage tracking on upload/delete
- [x] Quota enforcement (rejects uploads when exceeded)
- [x] Storage bar in photographer dashboard
- [x] Admin can adjust quotas per photographer

### Gallery Themes (16 total)
**Elegant:**
- Classic Elegance, Romantic Blush, Modern Dark, Natural Earth, Ocean Breeze, Vintage Sepia, **Black & Gold** (NEW - Luxurious)

**Fun/Colorful:**
- Party Vibes, Tropical Paradise, Golden Sunset, Neon Nights, Spring Garden, Lavender Dreams, Corporate Professional, Holiday Cheer, Ultra Minimal

**Theme Selection UI:**
- Color palette preview (4 swatches per theme)
- Theme name and description
- "Selected" indicator

### Integrations
- [x] **Google Drive Backup** - OAuth flow, auto-sync capability
- [x] **Resend** - Password reset emails

---

## Backlog / Future Tasks

### P1 (High Priority)
- Storage usage alerts/notifications when approaching quota
- Backend refactoring (server.py is 2500+ lines - needs modularization into routes/, models/, services/)

### P2 (Medium Priority)
- Gallery templates for quick creation
- Bulk photo upload improvements
- More detailed view tracking (unique visitors, time on page)

### P3 (Low Priority)
- Social sharing buttons
- Watermark options for photos
- Guest comments on photos
- Publish Google OAuth app (remove "unverified app" warning)
- More seasonal/event-based gallery themes
- Frontend component refactoring (GalleryDetail, AdminDashboard)

---

## Technical Architecture

### Backend
- **Framework**: FastAPI
- **Database**: MongoDB (Motor async driver)
- **Auth**: JWT tokens
- **File Storage**: Local `/uploads` directory
- **Background Tasks**: asyncio tasks for auto-sync and auto-delete
- **File I/O**: aiofiles for async operations
- **Connection Pool**: 100 max connections, 10 min

### Frontend
- **Framework**: React 18
- **Routing**: React Router
- **Styling**: Tailwind CSS
- **Components**: Shadcn/UI
- **Icons**: Lucide React

### Key Files
- `/app/backend/server.py` - Main API (2500+ lines)
- `/app/frontend/src/pages/Dashboard.jsx` - Photographer dashboard
- `/app/frontend/src/pages/AdminDashboard.jsx` - Admin panel
- `/app/frontend/src/pages/GalleryDetail.jsx` - Gallery management
- `/app/frontend/src/components/CoverPhotoEditor.jsx` - Cover photo zoom/pan editor
- `/app/frontend/src/themes.js` - 15 gallery themes

---

## API Endpoints

### Auth
- `POST /api/auth/register` - Register photographer
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update profile
- `PUT /api/auth/change-password` - Change password
- `POST /api/auth/forgot-password` - Password reset

### Galleries
- `GET /api/galleries` - List user's galleries
- `POST /api/galleries` - Create gallery
- `GET /api/galleries/{id}` - Get gallery details
- `PUT /api/galleries/{id}` - Update gallery
- `DELETE /api/galleries/{id}` - Delete gallery

### Cover Photo (NEW)
- `POST /api/galleries/{id}/cover-photo` - Upload cover photo
- `PUT /api/galleries/{id}/cover-photo-position` - Save zoom/pan settings
- `GET /api/galleries/{id}/cover-photo-position` - Get position settings

### Photos
- `POST /api/galleries/{id}/photos` - Upload photo (optimized for concurrency)
- `DELETE /api/photos/{id}` - Delete photo
- `GET /api/photos/serve/{filename}` - Serve photo (with caching)

### Public/Guest
- `GET /api/public/gallery/{share_link}` - Get public gallery (includes cover_photo_position)
- `POST /api/public/gallery/{share_link}/upload` - Guest upload (optimized)

### Admin
- `POST /api/admin/login` - Admin login
- `GET /api/admin/photographers` - List photographers
- `PUT /api/admin/photographers/{id}/gallery-limit` - Set gallery limit
- `PUT /api/admin/photographers/{id}/storage-quota` - Set storage quota

---

## Credentials

### Admin
- URL: `/admin`
- Username: `admin`
- Password: `Aa@58798546521325`

### Test Photographer
- Create via registration form at `/auth`

---

## Known Issues
- None currently blocking

## Notes for Future Development
- `server.py` should be refactored into modules (routes/, models/, services/)
- Large frontend components should be split into smaller sub-components
- React hooks dependency warnings in some components (non-blocking)
