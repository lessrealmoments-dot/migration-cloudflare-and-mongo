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
- [x] Create and manage sections within galleries
- [x] Editable event title and event date
- [x] 15 gallery themes (elegant + fun)
- [x] Share link expiration periods
- [x] Guest upload time restrictions
- [x] Password-protected "Download All"
- [x] Delete gallery with double-confirmation
- [x] **Upload progress UI for photographers** (NEW - shows individual file progress with status icons)

### Photo Management
- [x] Photographer photo uploads
- [x] Guest photo uploads via share link
- [x] Duplicate upload prevention (server-side)
- [x] Upload animations and progress indicators
- [x] Full-screen lightbox viewer
- [x] Guest photo moderation by photographer

### User Features
- [x] Photographer registration/login (JWT)
- [x] Profile editing (name, business name)
- [x] Forgot password functionality (requires Resend API key)
- [x] Analytics dashboard showing views, photos, storage

### Admin Features
- [x] Admin login and dashboard
- [x] Manage photographer gallery limits
- [x] **Storage quota management** (NEW - admin can set quotas from 100MB to 10GB)
- [x] Landing page content customization
- [x] Landing page image uploads
- [x] **Site-wide analytics** (NEW - photographers, galleries, photos, storage stats)

### Auto-Delete System (NEW)
- [x] Galleries auto-delete after 6 months (180 days)
- [x] Days until deletion shown in dashboard
- [x] Background task for automated cleanup

### Storage Quota System (NEW)
- [x] Default 500MB quota per photographer
- [x] Storage tracking on upload/delete
- [x] Quota enforcement (rejects uploads when exceeded)
- [x] Storage bar in photographer dashboard
- [x] Admin can adjust quotas per photographer

### Analytics (NEW)
- [x] Photographer analytics: galleries, photos, views, storage
- [x] Admin analytics: site-wide stats, top galleries
- [x] View count tracking for public galleries
- [x] Gallery performance breakdown

### Gallery Themes (15 total)
**Elegant:**
- Classic Elegance, Romantic Blush, Modern Dark, Natural Earth, Ocean Breeze, Vintage Sepia

**Fun/Colorful:**
- Party Vibes, Tropical Paradise, Golden Sunset, Neon Nights, Spring Garden, Lavender Dreams, Corporate Professional, Holiday Cheer, Ultra Minimal

---

## Pending/Blocked Features

### Forgot Password (BLOCKED - needs API key)
- Backend code complete
- Requires: `RESEND_API_KEY`

### Google Drive Integration ✅ CONFIGURED
- Client ID and Secret configured
- OAuth flow ready to use
- Click "Link Google Drive" button in any gallery to connect

---

## Backlog / Future Tasks

### P1 (High Priority)
- Gallery analytics dashboard for individual galleries
- More detailed view tracking (unique visitors, time on page)

### P2 (Medium Priority)
- Storage usage alerts/notifications
- Gallery templates for quick creation
- Bulk photo upload improvements

### P3 (Low Priority)
- Social sharing buttons
- Watermark options for photos
- Guest comments on photos

---

## Technical Architecture

### Backend
- **Framework**: FastAPI
- **Database**: MongoDB (Motor async driver)
- **Auth**: JWT tokens
- **File Storage**: Local `/uploads` directory
- **Background Tasks**: asyncio tasks for auto-sync and auto-delete

### Frontend
- **Framework**: React 18
- **Routing**: React Router
- **Styling**: Tailwind CSS
- **Components**: Shadcn/UI
- **Icons**: Lucide React

### Key Files
- `/app/backend/server.py` - Main API (1800+ lines)
- `/app/frontend/src/pages/Dashboard.jsx` - Photographer dashboard
- `/app/frontend/src/pages/AdminDashboard.jsx` - Admin panel
- `/app/frontend/src/pages/GalleryDetail.jsx` - Gallery management
- `/app/frontend/src/themes.js` - 15 gallery themes

---

## API Endpoints

### Auth
- `POST /api/auth/register` - Register photographer
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update profile
- `POST /api/auth/forgot-password` - Password reset (requires Resend)

### Galleries
- `GET /api/galleries` - List user's galleries
- `POST /api/galleries` - Create gallery
- `GET /api/galleries/{id}` - Get gallery details
- `PUT /api/galleries/{id}` - Update gallery
- `DELETE /api/galleries/{id}` - Delete gallery

### Photos
- `POST /api/galleries/{id}/photos` - Upload photo
- `DELETE /api/photos/{id}` - Delete photo
- `GET /api/photos/serve/{filename}` - Serve photo

### Analytics (NEW)
- `GET /api/analytics/photographer` - Photographer stats
- `GET /api/admin/analytics` - Site-wide stats
- `POST /api/public/gallery/{share_link}/view` - Track view

### Admin
- `POST /api/admin/login` - Admin login
- `GET /api/admin/photographers` - List photographers
- `PUT /api/admin/photographers/{id}/gallery-limit` - Set gallery limit
- `PUT /api/admin/photographers/{id}/storage-quota` - Set storage quota (NEW)
- `GET/POST /api/admin/landing-config` - Landing page settings

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
- `server.py` could be refactored into modules (routes/, models/, services/)
- Large frontend components could be split into smaller sub-components
