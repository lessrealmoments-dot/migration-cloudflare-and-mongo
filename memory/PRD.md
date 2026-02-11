# EventsGallery.vip - Photo Sharing Platform PRD

## Original Problem Statement
A comprehensive photo-sharing application with a focus on professional features for photographers, performance, and monetization. Key features include:
- Multi-source photo gallery (direct upload, pCloud, Google Drive)
- Subscription & token-based billing system
- Contributor workflow for multiple photographers/videographers
- Dynamic pricing page
- Social media sharing with OG tags
- Cloudflare R2 storage with CDN

## User Personas
1. **Photographers**: Main users who create galleries, upload photos, manage contributors
2. **Event Guests**: View galleries, upload their own photos
3. **Contributors**: Videographers, additional photographers who upload via contributor links
4. **Admin**: Platform administrators managing users, billing, and settings

## Current Architecture

### Tech Stack
- **Frontend**: React 18 with Vite, Tailwind CSS, Shadcn/UI, Framer Motion
- **Backend**: FastAPI (Python) with MongoDB Atlas
- **Storage**: Cloudflare R2 with CDN (cdn.eventsgallery.vip)
- **Email**: Resend
- **Deployment**: Docker Compose on Hostinger VPS with Nginx

### Key Files
- `/app/backend/server.py` - Main backend (monolithic, needs refactoring)
- `/app/frontend/src/pages/PublicGallery.jsx` - Public gallery view
- `/app/frontend/src/components/PremiumLightbox.jsx` - Photo lightbox component
- `/app/backend/models/` - Pydantic models
- `/app/backend/tasks/background.py` - Background jobs

## Implemented Features

### Core Features
- [x] User authentication (JWT)
- [x] Gallery CRUD with sections
- [x] Photo upload with R2 storage
- [x] Thumbnail generation
- [x] Password-protected galleries
- [x] Guest uploads
- [x] Contributor links (5 types: photo, video, pCloud, Google Drive, Fotoshare)
- [x] Subscription system with tokens
- [x] Grace periods for expired subscriptions
- [x] Dynamic pricing page
- [x] Open Graph meta tags for social sharing
- [x] pCloud integration with download proxy
- [x] Admin panel

### Recent Fixes (Feb 2025)
- [x] Fixed lightbox preview loading issue (CDN URL handling)
- [x] Standardized token naming (subscription_tokens, addon_tokens)
- [x] Implemented grandfathering for expired Pro galleries
- [x] Added pCloud download proxy for ISP bypass
- [x] Fixed dashboard crash (datetime serialization)

## Known Issues (Priority Order)

### P0 - Critical
1. **Google Drive Integration Broken**: Web scraping logic outdated after Google changed HTML structure
   - File: `/app/backend/server.py` function `scrape_gdrive_folder_html`
   - Last attempt: Updated regex patterns but still failing

### P1 - High
1. **PayMongo Integration**: Blocked - waiting for user's business permit/API keys

### P2 - Medium  
1. **Data Inconsistency**: Photos uploaded before R2 fix exist in DB but not in storage
2. **PDF Generation**: Missing system library
3. **server.py Refactoring**: 8000+ line monolith needs route extraction

### P3 - Low
1. **Auto-delete job monitoring**: Needs verification on production
2. **Docker volume mount**: Missing for `/app/uploads`

## API Endpoints (Key)

### Public
- `GET /api/public/gallery/{share_link}` - Gallery info
- `GET /api/public/gallery/{share_link}/photos` - Gallery photos
- `POST /api/public/gallery/{share_link}/upload` - Guest upload
- `GET /og/g/{share_link}` - OG tags for social sharing

### Auth Required
- `POST /api/galleries` - Create gallery
- `GET /api/galleries` - List user's galleries
- `POST /api/photos/upload` - Upload photos
- `GET /api/user/subscription` - Get subscription status

### Admin
- `POST /api/admin/login` - Admin authentication
- `GET /api/admin/photographers` - List all users
- `POST /api/admin/user/{user_id}/assign-mode` - Assign override mode

## Database Schema (Key Collections)

### users
- `id`, `email`, `password_hash`
- `subscription_tokens` (formerly event_credits)
- `addon_tokens` (formerly extra_credits)
- `override_mode` - special access modes
- `current_plan` - free/standard/pro
- `subscription_expires_at`

### galleries
- `id`, `share_link`, `photographer_id`
- `sections[]` - gallery sections
- `contributors[]` - contributor info
- `created_under_pro` - for grandfathering
- `auto_delete_date`

### photos
- `id`, `gallery_id`, `filename`
- `url` - CDN URL (absolute)
- `thumbnail_url`, `thumbnail_medium_url`
- `uploaded_by` - photographer/guest/contributor

## Test Credentials
- **User Email**: lessrealmoments@gmail.com
- **User Password**: 3tfL99B%u2qw
- **Admin Username**: admin  
- **Admin Password**: Aa@58798546521325

## Reference Documents
- `/app/SUBSCRIPTION_SYSTEM_REFERENCE.md` - Complete subscription logic
- `/app/SUBSCRIPTION_AUDIT_REPORT.md` - Audit findings
- `/app/backend/REFACTOR_PLAN.md` - Backend refactoring plan
