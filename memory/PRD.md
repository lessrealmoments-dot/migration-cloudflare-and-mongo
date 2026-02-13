# EventsGallery.vip - Photo Sharing Platform PRD

## Last Updated: Feb 13, 2025

## Original Problem Statement
A comprehensive photo-sharing application for photographers with focus on:
- Professional features for event photographers
- Performance optimization for large galleries (2000+ photos)
- Monetization via subscription/credit system
- Multiple photo source integrations (uploads, pCloud, GDrive, Fotoshare)

## Core Features Implemented

### Gallery Management
- [x] Multi-section galleries with photos, videos, pCloud, GDrive, Fotoshare integration
- [x] Public gallery sharing via unique share links
- [x] QR code generation for galleries
- [x] Premium lightbox with download/share capabilities
- [x] Responsive masonry grid with lazy loading
- [x] Quick section navigation bar

### Display Modes
- [x] Collage display mode (optimized for 2000+ photos, loads in ~3.5s)
- [x] Slideshow display mode
- [x] Photos aggregated from all sources (uploads, pCloud, GDrive)

### External Integrations
- [x] **Cloudflare R2**: Photo storage with CDN
- [x] **pCloud**: Contributor workflow with download proxy
- [x] **Google Drive**: Public folder scraping
- [x] **Fotoshare 360° Booth**: Video integration with iframe embedding
- [x] **Fotoshare Photobooth**: Backend scraping complete (sessions + photos)

### Subscription System
- [x] Free/Standard/Pro/Enterprise tiers
- [x] Token-based gallery creation
- [x] Admin-configurable pricing and features
- [x] Grandfathering for expired Pro galleries

## Recent Fixes (Feb 2025)
- [x] Fixed lightbox preview loading issue (CDN URL handling)
- [x] Standardized token naming (subscription_tokens, addon_tokens)
- [x] Implemented grandfathering for expired Pro galleries
- [x] Added pCloud download proxy for ISP bypass
- [x] Fixed dashboard crash (datetime serialization)
- [x] **Collage/Slideshow Performance** (Feb 13): Optimized from stuck loading to ~3.5s for 2000+ photos
- [x] **Pricing Page Storage Display** (Feb 13): Fixed to use `gallery_storage_limit_gb` field
- [x] **Fotoshare Photobooth Backend** (Feb 13): Added session-aware scraping and photo storage

## Known Issues (Priority Order)

### P0 - Critical
- None currently

### P1 - High
1. **PayMongo Integration**: Blocked - waiting for user's business permit/API keys

### P2 - Medium
1. **Fotoshare Photobooth Frontend**: Component needed to display session photos
2. **PDF Generation**: Failed due to missing `libpangoft2-1.0-0` system library
3. **Data Inconsistency**: Photos uploaded before R2 fix exist in DB but not in storage
4. **server.py Refactoring**: Large monolith needs modular route extraction

### P3 - Low
1. Auto-delete expired galleries job needs verification
2. Docker volume mount for `/app/uploads` directory

## In Progress

### Completed: Fotoshare Photobooth Integration ✅
- [x] Backend: Separate scraper for photobooth (`scrape_fotoshare_photobooth`)
- [x] Backend: New section type `fotoshare_photobooth` (separate from `fotoshare`)
- [x] Backend: New `photobooth_sessions` collection
- [x] Backend: CRUD endpoints (`/photobooth-sections`, `/photobooth-sessions`)
- [x] Frontend: `PhotoboothSection.jsx` component with premium modal
- [x] Frontend: Session grid with stacked cards effect
- [x] Frontend: Iframe embedding of Fotoshare viewer
- [x] Frontend: "Open in Fotoshare" external link
- [x] Integration in `PublicGallery.jsx`
- [x] Integration in `GalleryDetail.jsx` (admin section creation)

## Upcoming Tasks
1. **Fotoshare Photobooth Frontend** - Session grid with modal viewer
2. **PayMongo Payment Integration** - When API keys received
3. **UI for re-uploading broken images** - Address data inconsistency
4. **Contributor autocomplete refactor** - Extract to reusable hook

## Future/Backlog
- Enable "Live Billing" Mode
- Refactor GDrive to use official API
- Photographer-side section downloads
- Invoice generation
- User notifications for plan changes
- Mobile collage preset builder improvements

## Technical Architecture

### Backend: FastAPI
- Main file: `/app/backend/server.py` (needs refactoring)
- MongoDB with Motor async driver
- R2 storage via boto3

### Frontend: React
- Key pages: PublicGallery, CollageDisplay, SlideshowDisplay
- Key components: LazyMasonryGrid, FotoshareSection, PremiumLightbox
- Shadcn/UI components

### Database Collections
- `galleries`, `photos`, `gallery_videos`
- `pcloud_photos`, `gdrive_photos`
- `fotoshare_videos`, `fotoshare_photos` (new)
- `users`, `site_config`

## Test Credentials
- Email: lessrealmoments@gmail.com
- Password: 3tfL99B%u2qw
- Admin: admin / Aa@58798546521325
