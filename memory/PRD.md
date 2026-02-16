# EventsGallery.vip - Photo Sharing Platform PRD

## Last Updated: Feb 17, 2025

## Original Problem Statement
A comprehensive photo-sharing application for photographers with focus on:
- Professional features for event photographers
- Performance optimization for large galleries (2000+ photos)
- Monetization via subscription/credit system
- Multiple photo source integrations (uploads, pCloud, GDrive, Fotoshare)
- Smart adaptive UX for different connection speeds
- **RSVP & Invitation System** - Separate billable service for event RSVPs

## RSVP Token System (NEW - Feb 17, 2025)
### Token Economy
- **1 RSVP Token = 1 Invitation** (unlimited guest responses)
- **Price**: ₱500 per token (admin editable)
- **Expiry**: 12 months from purchase
- **Founder's Override**: Unlimited tokens automatically

### Token Rules
- Tokens consumed on invitation creation (not refundable even if invitation deleted)
- Guest RSVP responses **CANNOT be deleted** (data protection)
- Invitations can be edited until event date passes
- After event date: invitation locked from editing

### Admin Features
- Grant unlimited tokens to any user
- Grant specific number of tokens
- Revoke unlimited token access
- Set/update token price
- View pending token purchases
- Approve/reject purchases

### API Endpoints
- `GET /api/rsvp-tokens/balance` - User's token balance
- `GET /api/rsvp-tokens/price` - Current token price
- `POST /api/rsvp-tokens/purchase` - Purchase tokens
- `POST /api/rsvp-tokens/admin/grant` - Admin grant tokens
- `PUT /api/rsvp-tokens/admin/settings/price` - Update price

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
- [x] **Lite Mode for Slow Connections** (Feb 15): Detects slow internet and offers minimal upload-only interface ✅

### Lite Mode Feature (NEW - Feb 15, 2025)
- [x] Gallery settings toggle to enable/disable "Slow Connection Mode"
- [x] Connection speed detection using Navigator API with download test fallback
- [x] LiteModeModal: Prompts slow connection users with Quick Upload vs Full Gallery options
- [x] LiteUploadPage: Minimal upload-only interface for fast photo sharing
  - [x] **10 photo limit per upload** with clear error message
  - [x] **Duplicate detection** using SparkMD5 content hashing
  - [x] **Sequential uploads** (one at a time, not simultaneous)
  - [x] Individual progress bars per file
  - [x] "Already uploaded" status for duplicates
- [x] Full Gallery option dismisses modal and loads complete gallery
- [x] `?lite=1` URL parameter for testing (forces Lite Mode)

### External Integrations
- [x] **Cloudflare R2**: Photo storage with CDN
- [x] **pCloud**: Contributor workflow with download proxy
- [x] **Google Drive API**: Proper API integration for public folders (replaces web scraping) ✅
- [x] **Fotoshare 360° Booth**: Video integration with iframe embedding
- [x] **Fotoshare Photobooth**: Session-based photo integration (separate from 360°)

### Subscription System
- [x] Free/Standard/Pro/Enterprise tiers
- [x] **Payment System Bug Fixes (Feb 16, 2025)**:
  - [x] Add-on token expiration dates (`addon_tokens_purchased_at`, `addon_tokens_expires_at`) now correctly set on admin approval
  - [x] Downgrade restrictions enforced: Can't downgrade until 30-day subscription expires
  - [x] Override mode users cannot change plan while override is active
  - [x] Add-on token purchase requires active subscription
  - [x] Token consumption priority: Add-on tokens deducted before subscription tokens
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
- [x] **Gallery Loading Performance** (Feb 14): 
  - Optimized backend API with MongoDB projection (reduced payload by ~70%)
  - Fixed loading regression - galleries now correctly show all photos, not limited to 50
- [x] **Viewport-Based Lazy Loading** (Feb 14):
  - Changed photo grid from CSS columns (column-by-column) to flex-wrap (row-by-row)
  - Photos now load top-to-bottom as user scrolls, not left-column-first
  - IntersectionObserver triggers loading when images are 300px from viewport
- [x] **Responsive Masonry Layout** (Feb 14): Replaced CSS grid with JS-powered masonry (Pinterest-style)
- [x] **Founder's Circle Features** (Feb 14):
  - Admin toggle for "Never Expires" guest upload option for Founder users
  - Edit lock bypass for Founder users
- [x] **Critical Bug Fix: Negative Credits** (Feb 14): Fixed token deduction logic, added admin repair endpoint
- [x] **Photo Download Fix** (Feb 14): Fixed navigation instead of download issue with fetch+blob solution
- [x] **Lite Mode for Slow Connections** (Feb 15): Complete implementation with toggle, modal, and minimal upload page ✅
- [x] **Payment System Audit & Bug Fixes** (Feb 16):
  - Fixed add-on token expiration not being set on approval
  - Implemented downgrade restrictions (30-day subscription rule)
  - Override mode users blocked from plan changes
  - Add-on tokens require active subscription
  - Token priority verified: add-on before subscription
- [x] **Coordinator Hub Bug Fix** (Feb 16):
  - Fixed feature toggle resolution to properly merge defaults with stored values
  - Added `coordinator_hub_link` to Gallery model and API response
  - Fixed frontend to show existing link without regenerating
- [x] **Demo Gallery Logic** (Feb 16):
  - Demo duration changed from 6 hours to 2 hours
  - Expired Pro/Standard users blocked from creating galleries
  - Demo warning messages added to API and frontend
- [x] **RSVP & Invitation System - Phase 1** (Feb 16):
  - Backend models and API routes created
  - 10 invitation templates (wedding, birthday, corporate, celebration)
  - RSVP form with customizable fields
  - Public invitation page for guests
  - RSVP statistics and tracking
  - Frontend InvitationsPage with invitation cards
  - Dashboard integration with Invitations button
- [x] **RSVP & Invitation System - Phase 2 (COMPLETE)** (Feb 16):
  - **GuestPix-inspired Public Invitation Page** (`PublicInvitation.jsx`):
    - Dark themed background with event accent colors
    - Split layout: Info card (left) + Cover image (right)
    - Initials header (e.g., "J + J")
    - Expandable RSVP form with smooth toggle
    - Default cover images by event type (wedding, birthday, corporate, etc.)
    - View Gallery + RSVP action buttons
    - Thank You confirmation screen after RSVP
  - **5-Step Create Invitation Wizard** (`CreateInvitation.jsx`):
    - Step 1: Event Type selection (7 types with icons)
    - Step 2: Event Details (title, hosts, date, time, venue, map URL)
    - Step 3: Message & Additional Info
    - Step 4: Template selection with color customization
    - Step 5: RSVP settings (enable/disable, deadline, max guests, field toggles)
    - Edit mode support (loads existing invitation data)
  - **Invitation Detail/Management Page** (`InvitationDetail.jsx`):
    - RSVP Summary stats (total RSVPs, attending, not attending, maybe, total guests)
    - Event details card
    - RSVP list with filter tabs (All/Attending/Not Attending/Maybe)
    - Publish, Copy Link, Preview, Edit, Export RSVPs actions
    - Link Gallery modal to connect invitation to photo gallery
  - **Complete Routes Setup** in App.js:
    - `/invitations` - List page
    - `/invitations/create` - Create wizard
    - `/invitations/:id` - Detail/stats page
    - `/invitations/:id/edit` - Edit wizard
    - `/i/:shareLink` - Public guest page
  - **100% Test Pass Rate** - 22/22 backend tests, all frontend flows verified
- [x] **RSVP & Invitation System - Phase 3 (Enhancements)** (Feb 16):
  - **Countdown Timer** on public invitation page:
    - Live countdown showing Days/Hours/Mins/Secs until event
    - Automatically shows "🎉 The event has started!" for past events
    - Styled with accent colors from invitation design
  - **Cover Image Upload**:
    - New section in Step 4 (Design) of Create Invitation wizard
    - Upload dropzone with recommended dimensions (1200x800px)
    - Preview with remove button for uploaded images
    - API endpoint: `POST /api/invitations/{id}/upload-cover`
  - **QR Code Generation**:
    - "QR Code" button in invitation detail page header
    - Modal displays generated QR code with invitation URL
    - Download button to save QR code as PNG
    - API endpoints: `GET /api/invitations/{id}/qr-code` (PNG), `GET /api/invitations/{id}/qr-code-base64` (for UI)
- [x] **RSVP & Invitation System - Phase 4 (Celebrant Dashboard)** (Feb 16):
  - **Dedicated Celebrant Dashboard** (`CelebrantDashboard.jsx`):
    - New route at `/invitations/:id/dashboard`
    - Quick Actions bar: Copy Link, QR Code, Preview, Add Guest, External Link, Export
    - Stats overview: Total RSVPs, Attending, Not Attending, Maybe/Pending
    - Expected Guests banner with total count from attending RSVPs
    - Search/filter for guest list (name, email, phone)
    - Guest list sorted by status with collapsible sections
  - **Manual Guest Addition**:
    - Modal for adding guests who RSVPed via phone/in-person
    - Fields: Name, Email, Phone, Attendance Status, Guest Count, Notes
    - "How did they RSVP?" dropdown (Manual, Phone, In Person)
    - Badges on guest cards: ✍️ Manual, 📞 Phone, 🤝 In Person
    - API endpoints: `POST /api/invitations/{id}/guests`, `PUT /api/invitations/{id}/guests/{rsvp_id}`
  - **External Invitation Link Support** (for Canva, etc.):
    - Modal to save external invitation URL
    - "View Invitation" button appears on public RSVP page
    - Perfect for clients using other platforms for invitation design
    - Field added: `external_invitation_url` to Invitation model
  - **100% Test Pass Rate** - 16/16 backend tests, all frontend flows verified
- [x] **RSVP & Invitation System - Phase 5 (Photographer Integration)** (Feb 16):
  - **RSVP Button in Gallery Detail Page**:
    - Rose/pink button with mail icon shows when gallery is linked to invitation
    - Displays attending count: "RSVP (4 attending)"
    - Clicking navigates directly to Celebrant Dashboard
    - API: `GET /api/invitations/by-gallery/{gallery_id}` fetches linked invitation
  - **GuestPix-Inspired Public RSVP Page Redesign** (`PublicInvitation.jsx`):
    - Frosted glass design with primaryColor overlay on blurred cover image
    - Initials badge in header (e.g., "J + J")
    - Split layout: 3/5 info card (left) + 2/5 photo (right) on desktop
    - Countdown timer in card header (shows "The celebration has begun!" for past events)
    - Location and Date/Time info cards with icons
    - Two CTA buttons: "View Invitation" (external link) + "RSVP Now"
    - Expandable RSVP form with attendance selection
    - Cover image fallback when uploaded image fails to load
    - Responsive: photo hidden on mobile
  - **91% Backend / 100% Frontend Test Pass Rate**
- [x] **RSVP & Invitation System - Phase 6 (Host/Celebrant Role Separation)** (Feb 17):
  - **Complete Host/Celebrant Access Control Model**:
    - Host (Photographer) has FULL control via `CelebrantDashboard.jsx`
    - Celebrant (Client) has LIMITED access via `CelebrantView.jsx`
  - **Host Dashboard Features** (`/invitations/:id/dashboard`):
    - Quick Actions: Copy Link, QR Code, Preview, Add Guest, External Link, Export
    - Host Controls: Unlink Gallery, Celebrant Link, Edit Invitation
    - RSVP Stats with expected guests count
    - Searchable/filterable guest list
  - **Celebrant Access Link Generation**:
    - Host can generate unique access URL for celebrant
    - Modal shows link with Copy and Revoke buttons
    - API: `POST /api/invitations/{id}/generate-celebrant-link`
  - **CelebrantView Limited Controls** (`/celebrant/:accessCode`):
    - Only shows: Copy Link, QR Code, Preview, Add Guest
    - NO gallery linking capabilities
    - Edit Details button with confirmation dialogs
  - **Edit Confirmation Dialogs** (User-Requested Feature):
    - Every edit action triggers "Confirm Change" dialog
    - Shows: Field name, Previous value (red strikethrough), New value (green)
    - Cancel and "Yes, Update" buttons
    - Warning: "Changes will be visible to your guests"
  - **100% Frontend Test Pass Rate** - All Host/Celebrant flows verified
- [x] **UI Clarity Improvements** (Feb 17):
  - **Host Dashboard**: Renamed from "Manage RSVPs" to "Host Dashboard" with green badge
  - **Client Access**: Renamed from "Celebrant Link" to "Client Access" with purple badge
  - **Celebrant View**: Header shows "CELEBRANT VIEW (CLIENT ACCESS)" in purple
  - Clear visual distinction between Host (green) and Client (purple) interfaces
  - Warning note in Client Access modal: "Clients cannot link/unlink galleries or delete guest responses"

## Known Issues (Priority Order)

### P0 - Critical
- None currently

### P1 - High
1. **PayMongo Integration**: Blocked - waiting for user's business permit/API keys
2. **Slow Cover/Hero Images**: Older galleries need thumbnail re-upload

### P2 - Medium
1. **Fotoshare Photobooth Frontend**: Component needed to display session photos
2. **PDF Generation**: Failed due to missing `libpangoft2-1.0-0` system library
3. **Data Inconsistency**: Photos uploaded before R2 fix exist in DB but not in storage
4. **server.py Refactoring**: Large monolith needs modular route extraction
5. **Integrate Premium Uploader UI**: `PremiumPhotoUpload.jsx` and `VideoHighlightSelector.jsx` placeholders need integration

### P3 - Low
1. Auto-delete expired galleries job needs verification
2. Docker volume mount for `/app/uploads` directory

## In Progress

### Completed: Lite Mode for Slow Connections ✅ (Feb 15, 2025)
- [x] Backend: `lite_mode_enabled` field in Gallery model
- [x] Backend: Update endpoint supports `lite_mode_enabled`
- [x] Frontend: `useConnectionSpeed.js` hook for speed detection
- [x] Frontend: `LiteModeModal.jsx` component for user choice
- [x] Frontend: `LiteUploadPage.jsx` minimal upload interface
- [x] Frontend: Toggle in Gallery edit modal
- [x] Frontend: `editFormData` initialization includes `lite_mode_enabled`
- [x] Frontend: Update payload includes `lite_mode_enabled`
- [x] Integration in `PublicGallery.jsx`

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
1. **Pinterest-Style Collage Option** - Alternative photo display for public invitation page
2. **RSVP Reminders** - Manual or automated reminders for pending guests
3. **Guest List Import** - Import guests from CSV/Excel for manual tracking
4. **PayMongo Payment Integration** - When API keys received
5. **Improved Uploader UI** - Integrate `PremiumPhotoUpload.jsx` into workflows
6. **Mobile Performance** - Skeleton loaders, hero image preloading

## Future/Backlog
- Enable "Live Billing" Mode
- Refactor GDrive to use official API
- Photographer-side section downloads
- Invoice generation
- User notifications for plan changes
- Mobile collage preset builder improvements
- RSVP guest list import (CSV/Excel)
- Multiple invitation designs per event
- RSVP reminders automation

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
- `fotoshare_videos` (360° booth videos)
- `photobooth_sessions` (NEW - photobooth session cover photos)
- `users`, `site_config`

## Test Credentials
- Email: lessrealmoments@gmail.com
- Password: 3tfL99B%u2qw
- Admin: admin / Aa@58798546521325
