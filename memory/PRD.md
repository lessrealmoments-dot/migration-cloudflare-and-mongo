# PhotoShare - Event Photography Platform

## Original Problem Statement
Build a photo-sharing application for event photographers with features including:
- Gallery management and photo uploads
- Guest uploads with moderation
- Custom branding (name, favicon)
- Contributor upload links
- Section organization and reordering
- Display modes (Slideshow, Live Collage) for viewing stations
- Per-user feature access controls for subscription management

## Core Features Implemented

### Gallery Management
- Create and manage photo galleries
- Multi-section organization
- Drag-and-drop section reordering
- Photo reordering within sections
- Cover photo selection and cropping

### Guest & Contributor Uploads
- Guest upload with 10-photo batch limit
- Photographer moderation (hide/unhide/delete)
- Private contributor upload links per section
- Contributor name credit in gallery

### Display Modes
- **Slideshow**: Full-screen single-image rotation with fade transitions
- **Live Collage**: 11-tile dynamic grid with 3D cube flip animation
  - Configurable interval (3-15 seconds)
  - All tiles update simultaneously
  - Settings panel for customization
  - Live polling for new photos

### Sharing Features
- Public gallery links
- QR code generation and download
- Display mode links with Copy Link + QR popup
- Embed code for websites

### Admin Panel
- Photographer management
- **Per-user feature toggles** (new)
  - QR Share
  - Online Gallery
  - Display Mode
  - Contributor Link
  - Auto Delete (6 months)
- Default feature settings for new users
- Storage quota management
- Gallery limit controls
- User suspend/activate/delete

### Branding
- Custom site name
- Custom favicon upload
- Consistent branding across all pages

## Technical Stack
- **Frontend**: React, Vite, Tailwind CSS, Shadcn/UI
- **Backend**: FastAPI (Python)
- **Database**: MongoDB with Motor async driver
- **Libraries**: react-beautiful-dnd, qrcode.react

## Key Files
- `/app/frontend/src/pages/CollageDisplay.jsx` - Live Collage with cube flip
- `/app/frontend/src/pages/GalleryDetail.jsx` - Main gallery management
- `/app/frontend/src/pages/AdminDashboard.jsx` - Admin with per-user features
- `/app/frontend/src/hooks/useFeatureToggles.js` - User feature access hook
- `/app/backend/server.py` - All API endpoints

## API Endpoints (Feature Toggles)
- `GET /api/user/features` - Get logged-in user's features
- `GET /api/admin/users/{user_id}/features` - Admin get user features
- `PUT /api/admin/users/{user_id}/features` - Admin update user features

## Completed This Session (Feb 2025)
1. ✅ Live Collage cube flip animation - all tiles flip together
2. ✅ Configurable interval slider (3-15 seconds)
3. ✅ Display Mode dropdown with Copy Link + QR Code options
4. ✅ Per-user feature toggles in Admin panel
5. ✅ Feature availability checks in photographer dashboard
6. ✅ User Features modal in Photographers table Actions column

## Access URLs
- Preview: https://eventphoto-share.preview.emergentagent.com
- Admin: /admin (credentials in .env)
- Gallery: /gallery/{id}
- Public: /g/{shareLink}
- Display: /display/{shareLink}?mode=slideshow|collage
