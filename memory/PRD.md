# PhotoShare - Product Requirements Document

## Original Problem Statement
Build a website similar to Pic-time.com where photographers can create photo galleries and share them with guests via shareable links.

## Core Features
- **Photographers**: Create accounts, manage galleries, upload photos
- **Guests**: View galleries and upload photos via shareable links
- **Admin**: Manage photographers, site settings, and analytics

---

## Implemented Features (as of Feb 1, 2026)

### Gallery Management
- [x] Create galleries with titles, descriptions, passwords
- [x] Set cover photos for galleries
- [x] **Cover Photo Editor** - zoom/pan/crop functionality with touch support
- [x] **QR Code Generator** - downloadable PNG for easy sharing
- [x] **Album Embed** - Generate iframe embed code for external websites (NEW)
- [x] Create and manage sections within galleries
- [x] Editable event title and event date
- [x] 15 gallery themes (elegant + fun)
- [x] Share link expiration periods
- [x] Guest upload time restrictions
- [x] Password-protected "Download All"
- [x] Delete gallery with double-confirmation
- [x] Upload progress UI for photographers

### Social Sharing (NEW - Feb 1, 2026)
- [x] **Floating Share Panel** - appears on public galleries
- [x] **Facebook Sharing** - opens share dialog
- [x] **X (Twitter) Sharing** - opens tweet dialog
- [x] **WhatsApp Sharing** - opens message dialog
- [x] **Copy Link** - copies view-only URL to clipboard
- [x] **View-Only Mode** - shared links disable guest uploads (?view=1)

### High Concurrency Optimization
- [x] **Database Indexes** - Optimized indexes on users, galleries, photos collections
- [x] **MongoDB Connection Pooling** - maxPoolSize: 100, minPoolSize: 10
- [x] **Async File I/O** - Non-blocking file writes with aiofiles
- [x] **Upload Concurrency Control** - Semaphore limiting 50 concurrent uploads
- [x] System can handle 150-200 concurrent users uploading photos

### Photo Management
- [x] Photographer photo uploads with progress tracking
- [x] Guest photo uploads via share link
- [x] **Guest Upload Limit** - Max 10 photos per upload batch (Feb 1, 2026)
- [x] Duplicate upload prevention (server-side)
- [x] Upload animations and progress indicators
- [x] Full-screen lightbox viewer
- [x] Guest photo moderation by photographer
- [x] **Photo Reordering** - Drag & drop to rearrange photo sequence
- [x] **Multi-Select Actions (Photographer Photos)**:
  - Select/Select All photos
  - Bulk Delete
  - Bulk Move to Section
  - Mark as Highlight (appears first)
  - Hide from Guests
  - Show Hidden Photos
- [x] **Multi-Select Actions (Guest Photos)** - NEW Feb 1, 2026:
  - Select/Select All guest photos
  - Bulk Hide from public gallery
  - Bulk Unhide (restore visibility)
  - Bulk Delete with confirmation
  - Visual selection feedback (ring highlight)
  - Hidden indicator badges

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
- [x] Landing page image uploads (up to 10 carousel images)
- [x] **Brand Tagline** - separate field for "by Less Real Moments" style text (NEW)
- [x] Site-wide analytics
- [x] **Enhanced Admin Panel**:
  - Search/filter photographers by name, email
  - Sort by newest, storage used, name
  - Suspend/Activate accounts
  - Delete photographer (with all data)
  - View photographer's galleries
  - Activity logs tracking
  - Admin settings management
- [x] **Admin Gallery Review System**:
  - Access photographer galleries in controlled admin view
  - View and flag photos only (no edit/download)
  - Bulk photo selection
  - Single photo flagging via flag icon
  - Flag preview with confirmation before finalizing
  - Deselect photos in preview before confirming
  - Flagged photos auto-hidden from public gallery
  - Visual indicators for flagged photos (red overlay)
  - Filter by All/Flagged/Unflagged
  - Undo/restore flagged photos

### Landing Page Improvements (NEW - Feb 1, 2026)
- [x] **Admin Link Moved** - Now on left side of navigation (avoids Emergent logo)
- [x] **Brand Layout** - Brand name centered with optional tagline below
- [x] **Image Carousel** - Up to 10 images with auto-rotate and manual controls
- [x] **No Image Flash** - Images load without showing placeholder first

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
- Classic Elegance, Romantic Blush, Modern Dark, Natural Earth, Ocean Breeze, Vintage Sepia, **Black & Gold** (Luxurious)

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

## Recent Bug Fixes (Jan 31, 2026)

### P0 - Admin Single Photo Flagging (FIXED)
- **Issue**: Clicking flag icon on a single photo only selected it instead of opening the flag modal
- **Fix**: Added `handleSingleFlag` function and passed `onSingleFlag` prop to `AdminPhotoItem` component

### P1 - Photo Reordering (FIXED)
- **Issue**: Drag-and-drop reordering didn't visually update or persist
- **Fix**: Fixed filtering logic in `handleDrop` to only include photographer photos, and added sorting by `order` field in display functions

---

## Backlog / Future Tasks

### P1 (High Priority)
- Storage usage alerts/notifications when approaching quota
- ~~Backend refactoring (server.py is 2500+ lines - needs modularization)~~ → Guide created at `/app/backend/REFACTOR_GUIDE.md`

### P2 (Medium Priority)
- Gallery templates for quick creation
- Bulk photo upload improvements
- More detailed view tracking (unique visitors, time on page)

### P3 (Low Priority)
- Watermark options for photos
- Publish Google OAuth app (remove "unverified app" warning)
- More seasonal/event-based gallery themes
- Frontend component refactoring (GalleryDetail, AdminDashboard)

---

## Technical Notes

### Backend Structure
- Main API: `/app/backend/server.py` (~2900 lines, 61 endpoints)
- Refactoring guide: `/app/backend/REFACTOR_GUIDE.md`
- Recommended modular structure documented for future work

### Code Quality
- ESLint: Minor React hooks warnings (non-blocking)
- Python lint: Clean (fixed comparison issues)
- Health endpoint: `/api/health` returns `{"status": "healthy"}`

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
