# PhotoShare - Event Photography Platform

## Original Problem Statement
Build a photo-sharing application for event photographers with:
- Gallery management, photo uploads, guest uploads
- Custom branding, contributor upload links
- Display modes (Slideshow, Live Collage)
- **Complete subscription system with plans, credits, billing, and pricing page**
- **Professional, cinematic public gallery experience**

## Key Reference Documents
- **Subscription System:** `/app/SUBSCRIPTION_SYSTEM_REFERENCE.md` - Complete guide to tokens, grace periods, grandfathering
- **Code Analysis:** `/app/CODE_ANALYSIS_REPORT.md` - Full codebase audit
- **Refactor Plan:** `/app/backend/REFACTOR_PLAN.md` - Backend refactoring roadmap

## Latest Updates (February 2026)

### Subscription & Grandfathering System ✅ (NEW)
- **Token Renaming:** `event_credits` → `subscription_tokens`, `extra_credits` → `addon_tokens`
- **Grace Periods Implemented:**
  - Upload Grace: 2 months (60 days) after subscription expires
  - View Grace: 6 months (180 days) after subscription expires
- **Grandfathering Rules:**
  - Existing contributor links work during grace period
  - Cannot create NEW contributor links when expired
  - Galleries created before expiry get grace periods
- **See:** `/app/SUBSCRIPTION_SYSTEM_REFERENCE.md` for complete details

### Open Graph Meta Tags ✅ (NEW)
- Social sharing previews for galleries (`/og/g/{share_link}`)
- Shows: Cover photo, Event title, "Curated by {business_name}"
- Works with Facebook, Twitter, WhatsApp, Discord, etc.

### Contributor Upload Flow Standardized ✅ (NEW)
- All contributor types now use 4-step flow
- Company Name → Role Selection → Confirm → Upload
- Added "Edit Profile" button to change details after submission
- Applies to: Regular, pCloud, GDrive, Fotoshare (360 Glam), Videographer

### R2 Storage Integration Fix ✅
- Fixed critical bug where uploads went to local storage instead of R2
- All upload endpoints now correctly use Cloudflare R2:
  - `upload_photo` (photographer uploads)
  - `upload_photo_guest` (guest uploads)
  - `upload_contributor_photo` (contributor uploads)
  - `upload_cover_photo` (gallery covers)
  - `upload_landing_image` (admin landing page)
  - `upload_favicon` (admin favicon)
- Fixed frontend URL handling for CDN vs local paths

### Auto-Delete Bug Fix ✅
- Fixed `auto_delete_expired_galleries()` function
- Was using undefined variables (`STORAGE_BACKEND`, `delete_from_r2`)
- Now correctly uses the `storage` service for R2 operations

### Subscription UI Enhancement ✅
- Dashboard now shows subscription expiration dates
- Extra credits expiration displayed (12 months from purchase)
- Credits breakdown: "X event credits + Y extra"

### Code Analysis Complete ✅
- Full codebase audit performed
- All integrations verified (R2, MongoDB, Email, Drive, pCloud)
- Created `/app/CODE_ANALYSIS_REPORT.md`
- Created `/app/backend/REFACTOR_PLAN.md`

## Enhanced Download Feature (December 2025) ✅

### Section-Based Downloads
Guests and photographers can now download photos by section:
- **Download Photos Dropdown** - Click to see options:
  - Download All (shows total photos & size)
  - Individual sections (shows section photo count & size)
- **Per-Section Download Button** - Appears below each section header
- **Smart Filtering** - Only visible photos included (excludes hidden & flagged)

### 250MB Auto-Split
Large downloads automatically split into multiple ZIP files:
- Maximum 250MB per ZIP chunk
- Downloads labeled as "Part 1 of 2", "Part 2 of 2", etc.
- Progress tracking for multi-part downloads

### API Endpoints
| Endpoint | Description |
|----------|-------------|
| `POST /api/public/gallery/{share_link}/download-info` | Get sections, photo counts, chunk info |
| `POST /api/public/gallery/{share_link}/download-section?chunk=1` | Download specific section/chunk |

## Admin Storage & Expiration Controls (NEW - December 2025) ✅

### Override Mode Controls
Each override mode now has configurable:
- **Storage Limit**: Unlimited, 10GB, 20GB, 30GB, 50GB, 100GB, 200GB, 500GB
- **Gallery Expiration**: 1-6 months, 1 year, or Never (100 years)

Default settings per mode:
| Mode | Storage | Gallery Expiration |
|------|---------|-------------------|
| Founders Circle | Unlimited | Never (100 years) |
| Early Partner Beta | 50 GB | 6 Months |
| Comped Pro | 50 GB | 6 Months |
| Comped Standard | 20 GB | 3 Months |
| Enterprise Access | Unlimited | Never (100 years) |

### Universal Paid Plan Settings
Admin can set global defaults for Standard and Pro plans:
- **Gallery Expiration**: 1, 2, 3, 4, 5, or 6 months
- **Storage Allocation**: 10GB increments up to 500GB, or Unlimited

### UI Updates
- Dashboard shows "Never expires" (green) for galleries with >36000 days remaining
- Feature Toggles page includes Storage Limit and Gallery Expiration dropdowns for each Override Mode
- Billing tab includes "Paid Plan Settings (Universal)" section

## Public Gallery Redesign (NEW - February 2026) ✅

### Design Philosophy
Created a premium, photographer-worthy gallery experience that impresses guests with:
- **Cinematic Hero Section**: Full-viewport parallax cover photo with elegant typography
- **Floating Glass Navigation**: Frosted glass nav bar with photographer name and photo count
- **Bento Grid Highlights**: Featured photos displayed in an asymmetric magazine layout
- **Animated Photo Cards**: Smooth reveal animations as users scroll
- **Elegant Sections**: Each section with subtle headers and themed styling
- **Guest Upload Experience**: Clean modal-based upload from Hero CTA and navbar
- **Professional Footer**: Heartfelt thank-you message with photographer credit

### Key UI Components
| Component | Description |
|-----------|-------------|
| Floating Nav | Glass-morphism navigation, responsive, shows photo count |
| Hero Section | Parallax background, large event title, photographer credit |
| Bento Grid | 4-column asymmetric layout for highlight photos |
| AnimatedPhotoCard | Staggered fade-in animation, hover zoom, download overlay |
| Section Headers | Centered titles with accent color labels and photo counts |
| Upload Modal | Unified upload experience via Hero button or Navbar |
| Footer | Thank you message with heart icon and branding |

### Framer Motion Animations
- `heroImageY`: Parallax scroll effect on cover photo
- `heroOpacity`: Fade out effect on scroll
- `whileInView`: Staggered entrance animations for photos
- `animate={{ rotate }}`: Expand/collapse button rotation

### Theme Integration
All components respect the gallery's selected theme:
- Dark themes (modern, neon, blackgold) get inverted button colors
- Colors from `currentTheme.colors` (text, textLight, accent, secondary, background)
- Fonts from `currentTheme.fonts` (heading, body)

### Professional Contributor Credits Display (February 2026) ✅
Updated the hero section to display contributor credits professionally:
- **Hero Credits**: Shows "THE STORY, CURATED BY [Owner]" followed by "WITH" section
- **Contributor Roles**: Each contributor displays their name AND official title (e.g., "Videographer", "Lead Photographer", "Catering Partner")
- **Fallback Logic**: Uses `c.title` (section role) → `c.role` (coordinator/owner) → "Contributor"
- **Section-Level Attribution**: Photo sections now show "ROLE · Contributor Name" format instead of "by Name"

**Backend Data Structure** (`/api/public/gallery/{share_link}`):
```json
{
  "contributors": [
    {"name": "Less Real Moments", "role": "Gallery Owner", "is_owner": true},
    {"name": "Events by Sarah", "role": "Coordinator", "is_owner": false},
    {"name": "Romel Tan Concept", "title": "Videographer", "section": "Official Videographer", "is_owner": false}
  ]
}
```

### Gallery Performance Optimization (February 2026) ✅
Implemented smart progressive loading for galleries with 100s-1000s of photos:

**Problem Solved**: Galleries with 700+ photos (5-10MB each) were freezing browsers by loading 3.5-7GB of images at once.

**Solution Components**:
1. **VirtualizedGalleryGrid** (`/app/frontend/src/components/VirtualizedGalleryGrid.jsx`)
   - Manual "Load More" buttons (no auto infinite scroll)
   - 50 photos per batch for optimal UX
   - Shows "X of Y photos" counter
   - "Load All" option for power users
   - Triggers for galleries with 50+ photos

2. **Sharp Thumbnails** (No blur effect)
   - pCloud: 800x800px thumbnails (clear, ~100-200KB)
   - Google Drive: 800px thumbnails
   - Native browser lazy loading
   - Fallback to full-res if thumbnail fails

**Data Flow**:
- Grid View: Sharp 800px thumbnails via `/api/pcloud/thumb/{code}/{fileid}?size=800x800`
- Lightbox: Loads full resolution on-demand via proxy URL
- Download: Always serves original full-resolution

**Performance Impact**:
- Initial load: ~5-10MB (50 sharp thumbnails) - still much better than 7GB
- User-controlled expansion: 50 photos per click
- Memory efficient: Only rendered photos in DOM

**Affected Sections**: pCloud, Regular Photos, Unsorted Photos, Google Drive

### Smart Adaptive Upload System (February 2026) ✅
Implemented intelligent upload system that adapts to connection speed:

**Upload Modes by User Type**:
| User Type | Concurrency | Why |
|-----------|-------------|-----|
| Guests | 1 (sequential) | Limited mobile data, avoid timeouts |
| Photographer/Owner | 2-6 (adaptive) | Professional setup, maximize speed |
| Contributors | 2-6 (adaptive) | Professional suppliers |

**Smart Uploader Features** (`/app/frontend/src/hooks/useSmartUploader.js`):
- **Speed Measurement**: Samples upload speed during first few files
- **Auto-Adjust Concurrency**:
  - Fast (>5 MB/s / 40 Mbps): 6 concurrent uploads
  - Medium (2-5 MB/s): 4 concurrent uploads
  - Slow (<2 MB/s): 2 concurrent uploads
  - Very slow: 1 sequential upload
- **Progress UI**: Shows real-time speed (Mbps) and concurrent uploads count
- **Cancel Support**: Users can cancel ongoing uploads
- **Retry Logic**: Auto-retry failed uploads with exponential backoff

**Files Modified**:
- `/app/frontend/src/pages/GalleryDetail.jsx` - Photographer uploads
- `/app/frontend/src/pages/ContributorUpload.jsx` - Contributor uploads
- `/app/frontend/src/pages/PublicGallery.jsx` - Guest uploads (unchanged, already sequential)

## Admin Override System (NEW - February 2026)

### Authority Hierarchy (Strict Order)
The system resolves access using this priority:
1. **Admin Override Mode** (highest authority) - Always takes precedence if active and not expired
2. **Normal Payment/Subscription Plan** - Applies when no override is active
3. **Payment Status** - Only affects downloads if billing enforcement enabled

### Global Feature Toggle System
Admin-controlled features that can be independently toggled per package/mode:

| Feature | Description |
|---------|-------------|
| Unlimited Token | Unlimited event credits (no limit on galleries) |
| Copy Share Link | Copy shareable gallery links |
| QR Code | Generate QR codes for gallery sharing |
| View Public Gallery | Allow public gallery viewing |
| Display Mode | Slideshow/Collage display modes |
| Collaboration Link | Contributor upload links |

### Default Features by Override Mode
| Mode | Unlimited Token | Copy Share Link | QR Code | View Public | Display Mode | Collaboration |
|------|----------------|-----------------|---------|-------------|--------------|---------------|
| Founders Circle | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Early Partner Beta | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Comped Pro | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Comped Standard | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |

### Default Features by Payment Plan
| Plan | Unlimited Token | Copy Share Link | QR Code | View Public | Display Mode | Collaboration |
|------|----------------|-----------------|---------|-------------|--------------|---------------|
| Free | ❌ | ✅ | ✅ | ✅ | ✅ (demo) | ✅ (demo) |
| Standard | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Pro | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Admin Feature Toggle Page
- Located in Admin Panel > Feature Toggles tab
- Configure features for all 4 override modes and 3 payment plans
- Save All Changes applies globally across the platform
- Individual mode/plan toggles can be updated separately

## Subscription & Billing System (COMPLETED)

### Plans
| Plan | Price | Credits/Month | Storage | Features |
|------|-------|---------------|---------|----------|
| Free | ₱0 | 1 demo gallery | 500MB | All features, gallery expires in 6 hours |
| Standard | ₱1,000/mo | 2 | 10GB | QR Share, Online Gallery, Guest uploads. NO Display Mode, NO Contributor Links |
| Pro | ₱1,500/mo | 2 | 10GB | All Standard features + Display Mode (Slideshow + Collage) + Contributor Links |

### Override Modes (Admin Assigned)
| Mode | Effective Plan | Credits | Auto-Delete |
|------|----------------|---------|-------------|
| Founders Circle | Pro | Unlimited (999) | Never (100 years) |
| Early Partner Beta | Pro | 2/month | 6 months |
| Comped Pro | Pro | 2/month | 6 months |
| Comped Standard | Standard | 2/month | 6 months |

### Key Rules
- 1 credit = 1 event gallery (single-use, deducted on creation)
- Credits reset monthly (don't roll over)
- Extra credits: ₱500/event (current cycle only)
- Gallery expiration:
  - Free: 6 hours from creation
  - Standard/Pro: 6 months from creation
  - Founders: Never (100 years)
- Gallery edit lock after 7 days
- Downloads locked while payment is pending

### Payment Flow (Manual/Soft Launch - IMPLEMENTED)
1. User clicks Upgrade on Pricing page
2. Modal shows payment instructions (GCash: 09952568450)
3. User uploads payment screenshot within modal
4. Request submitted with proof -> Admin notification banner appears
5. Admin reviews in Billing tab -> View Proof, Approve, or Reject
6. On approval: Plan upgraded, credits set, features unlocked
7. Downloads locked until payment approved

## Feature Toggles by Plan
| Feature | Free | Standard | Pro |
|---------|------|----------|-----|
| QR Share | ✅ | ✅ | ✅ |
| Online Gallery | ✅ | ✅ | ✅ |
| Guest Uploads | ✅ | ✅ | ✅ |
| Display Mode | ✅ (6hr) | ❌ | ✅ |
| Contributor Links | ✅ (6hr) | ❌ | ✅ |

## Implemented Features (This Session)

### Credit System ✅
- Credits deducted when creating galleries
- Extra credits deducted first, then event_credits
- "No credits remaining" error when exhausted
- Free users limited to 1 demo gallery

### Download Gate ✅
- Downloads disabled when payment_status = "pending"
- Button shows "Download Disabled" with tooltip explanation
- Re-enabled after admin approves payment

### Upgrade Flow ✅
- Pricing page shows 3-tier comparison
- "Get Started"/"Go Pro" buttons open upgrade modal
- Modal includes payment instructions + upload area
- Payment proof required before submission
- Redirects to dashboard after request

### Admin Notifications ✅
- Orange banner at top: "X pending upgrade requests with payment proof"
- Shows user names in banner
- "Review Now" button jumps to Billing tab
- Red badge on Billing tab shows count

### Admin Billing Tab ✅
- Pending Payments section with cards
- Each card shows: user name, email, requested plan, submitted date
- "View Proof" opens payment screenshot
- "Approve" and "Reject" buttons with confirmation
- Plan Reference section shows features per tier

### Plan Reference in Admin ✅
- Free: 1 demo gallery, 500MB storage, Gallery expires in 6 hours
- Standard: 2 credits/month, 10GB storage, No Display Mode, No Contributor Links
- Pro: 2 credits/month, 10GB storage, Display Mode + Contributor Links

## Contributor Upload Flow (Enhanced - February 2026) ✅

### Multi-Step Form
All contributor types now share a unified 4-step professional flow:
1. **Company Name**: Enter business/company name for credits
2. **Role Selection**: Choose from predefined categories or custom role
3. **Confirmation**: Preview how credits will appear in gallery (elegant Credit Preview card)
4. **Upload/Add Content**: Upload photos OR add YouTube videos (based on section type)

### Standardized Across All Contributor Types (February 2026 Update) ✅
| Contributor Type | Route | Upload Format | Status |
|------------------|-------|---------------|--------|
| Regular Photo | `/c/{link}` | File upload | ✅ Standardized |
| pCloud | `/c/{link}` | Folder code sync | ✅ Standardized |
| Google Drive | `/c/{link}` | Folder ID sync | ✅ Standardized |
| 360 Glam Booth (Fotoshare) | `/c/{link}` | Event URL sync | ✅ Standardized |
| Videographer | `/v/{link}` | YouTube URL | ✅ Standardized |

### Predefined Role Categories

**Photo Contributors (`ContributorUpload.jsx`):**

**Core Team:**
- Photographer
- Videographer
- Event Coordinator / Planner
- Caterer
- Event Stylist / Designer
- Host / DJ / Emcee

**Additional Services:**
- Live Band / Musicians
- Hair & Makeup Artist (HMUA)
- Cake Designer
- Photobooth Provider
- Lights & Sounds / Technical Team

**Premium Enhancements:**
- Drone / Aerial Coverage
- LED Wall / Visual Display
- Special Effects (confetti, CO₂, fireworks, cold sparks)
- Content Creators / Social Media Team
- Live Streaming / Broadcast Team

**Video Contributors (`VideographerUpload.jsx`):**

**Video Production:**
- Videographer
- Cinematographer
- Director of Photography
- Video Editor

**Specialized:**
- Same Day Edit (SDE) Specialist
- Drone Operator
- Live Streaming Operator
- Documentary Filmmaker

### Credits Display in Public Gallery
Contributors appear in the hero section with:
- Company name (prominent)
- Role/Title (subtle, uppercase)

Example: "Sample Photography Studio" / "VIDEOGRAPHER"

## Extra Credits Purchase Flow (NEW)

### From Dashboard
1. User sees "X event credits remaining" with "Need more? (₱500)" link
2. Click opens Payment Methods modal
3. Select GCash/Maya/Bank Transfer
4. View account details + QR code (if uploaded by admin)
5. Upload payment screenshot
6. Submit request → Admin notification

### From Gallery Limit Modal
1. User tries to create gallery with 0 credits
2. "Gallery Limit Reached" modal appears
3. Shows "Buy Extra Credit (₱500)" button
4. Same payment flow as above

### Admin Payment Methods Config
- Admin can enable/disable each method (GCash, Maya, Bank)
- Edit account name, number, bank name
- Upload QR code images for scanning
- All changes saved in billing settings

## API Endpoints

### Public
- `GET /api/billing/pricing` - Get plan prices

### User
- `GET /api/user/subscription` - Get subscription info (plan, credits, features, can_download)
- `GET /api/user/features` - Get resolved features using authority hierarchy
- `POST /api/user/upgrade-request` - Submit upgrade with payment proof
- `POST /api/user/extra-credits-request` - Request extra credits with payment proof
- `POST /api/upload-payment-proof` - Upload proof image file

### Admin - Global Feature Toggles (NEW)
- `GET /api/admin/global-feature-toggles` - Get all modes/plans with feature configurations
- `PUT /api/admin/global-feature-toggles` - Update all feature toggles
- `PUT /api/admin/global-feature-toggles/{mode_or_plan}` - Update single mode/plan features
- `GET /api/admin/users/{user_id}/features` - Get resolved features for specific user

### Admin - Billing
- `GET /api/admin/billing/settings` - Get billing config (includes payment_methods)
- `PUT /api/admin/billing/settings` - Update pricing and payment methods
- `GET /api/admin/pending-payments` - List pending payments (upgrades + extra credits)
- `POST /api/admin/approve-payment` - Approve payment (upgrades plan OR adds extra credits)
- `POST /api/admin/reject-payment` - Reject payment
- `POST /api/admin/upload-payment-qr` - Upload QR code image for payment method
- `POST /api/admin/assign-override` - Assign override mode
- `POST /api/admin/remove-override` - Remove override

## Test Accounts
- **Admin**: admin / Aa@58798546521325
- **Founder**: lessrealmoments@gmail.com / (check .env)
- **Comped Pro**: jovelyneahig@gmail.com / Aa@050772 (0 credits remaining)
- **Free Pending**: testupgrade@example.com / Test123! (pending Standard upgrade)

## Routes
- `/` - Landing page
- `/pricing` - Pricing & plans page
- `/auth` - Login/Register
- `/dashboard` - User dashboard with subscription card
- `/admin` - Admin login
- `/admin/dashboard` - Admin panel with Billing tab
- `/v/{contributor_link}` - Videographer upload page for video sections
- `/c/{contributor_link}` - Contributor upload page for photo sections

## Videographer Section (NEW - February 2026) ✅

### Feature Overview
A new section type for galleries that allows videographers to add YouTube videos with a dedicated upload experience.

### Section Types
| Type | Description | Contributor URL | Display |
|------|-------------|-----------------|---------|
| photo | Traditional photo uploads | /c/{link} | Photo grid/masonry |
| video | YouTube video links | /v/{link} | Cinematic Showcase |

### Video Section Features
- **Create Video Section**: Select "Videos" type when creating a new section
- **Contributor Link**: Generate unique link for videographers (uses /v/ prefix)
- **Video Tags**: SDE, Preparation, Ceremony, Reception, Highlights, Full Film, Trailer, or Custom
- **Featured Video**: One video can be marked as "Featured" (displays prominently)
- **Thumbnail Management**: Auto-fetch from YouTube or upload custom thumbnail
- **Video Management**: View, edit, delete videos from photographer dashboard

### VideographerUpload Page (/v/{link}) - Redesigned ✅
Now follows the same 4-step professional flow as photo contributors:
1. **Step 1**: Company name input ("What's your company name?")
2. **Step 2**: Role selection with video-specific categories (Videographer, Cinematographer, etc.)
3. **Step 3**: Confirmation with Credit Preview card
4. **Step 4**: Video upload form with:
   - YouTube URL input with live thumbnail preview
   - Video tag selection chips (SDE, Ceremony, Highlights, etc.)
   - Optional title and description
   - "Your Videos" panel showing uploaded videos
   - Tips section for best results

**Previous**: Dark gradient theme with combined form (no steps)
**Current**: Clean zinc/white theme matching other contributor pages, 4-step flow with progress indicator

### VideoSection Component (Public Gallery)
- Cinematic Showcase layout
- Featured video at top (if set)
- Horizontal row of video thumbnails
- Play button overlay on thumbnails
- Tag badges on each video
- Contributor credit line

### API Endpoints
- `POST /api/galleries/{id}/sections` - Create section (type: 'photo' or 'video')
- `GET /api/galleries/{id}/videos` - Get all videos for a gallery
- `POST /api/galleries/{id}/videos` - Add video (photographer)
- `PUT /api/galleries/{id}/videos/{vid}` - Update video
- `DELETE /api/galleries/{id}/videos/{vid}` - Delete video
- `POST /api/galleries/{id}/videos/{vid}/feature` - Set featured video
- `POST /api/contributor/{link}/video` - Videographer upload
- `GET /api/public/gallery/{share}/videos` - Public videos endpoint

### Database Schema
**gallery_videos collection:**
- id, gallery_id, section_id
- youtube_url, video_id (extracted)
- tag, title, description
- thumbnail_url, youtube_thumbnail_url
- is_featured, order
- contributor_name, created_by, created_at

**sections (updated):**
- type: "photo" | "video" | "fotoshare" (new field)

## 360 Glam Booth / Fotoshare.co Integration (NEW - February 2026) ✅

### Feature Overview
A new section type that allows photographers to import 360-degree booth videos from fotoshare.co by simply providing the event URL. Videos are scraped and synced automatically.

### Section Types
| Type | Description | Source | Display |
|------|-------------|--------|---------|
| photo | Traditional photo uploads | Upload | Photo grid/masonry |
| video | YouTube video links | YouTube URL | Cinematic Showcase |
| fotoshare | 360 booth videos | fotoshare.co URL | Vertical video grid (collapsible) |

### How It Works
1. **Create Section**: In gallery detail, click "Add Section" → Select "360 Booth" type
2. **Two Options**:
   - **Option A - Direct Import**: Enter fotoshare.co URL now to import videos immediately
   - **Option B - Supplier Contributor**: Leave URL blank, generate a contributor link for your 360 booth supplier
3. **Auto-Scrape**: System scrapes video thumbnails and metadata from the page
4. **Display**: Videos appear in public gallery with vertical 9:16 aspect ratio
5. **Refresh**: Click "Refresh" to sync new videos from the source

### Contributor Mode for 360 Booth Suppliers
Just like video and photo sections, 360 booth sections support contributor links:

| Route | Section Type | Use Case |
|-------|-------------|----------|
| `/c/{link}` | Photo | Photo contributor uploads |
| `/v/{link}` | Video | Videographer uploads YouTube links |
| `/f/{link}` | Fotoshare | 360 booth supplier submits fotoshare.co URL |

**Workflow:**
1. Photographer creates empty 360 Booth section (without URL)
2. Photographer generates contributor link → Gets `/f/{link}` URL
3. Photographer shares link/QR code with 360 booth supplier
4. Supplier visits link, enters company name and fotoshare.co URL
5. System imports all videos with supplier attribution

### Public Gallery Display
- **Preview Mode**: Shows 6 videos initially with "Show X More Videos" button
- **Expanded Mode**: Click to reveal all videos, "Show Less" to collapse
- **Play Mode Toggle**: Choose between:
  - **"Play Here"**: Embedded iframe player (default)
  - **"Fotoshare.co"**: Open in new tab on fotoshare.co

### GalleryDetail Management UI
- Pink-themed section button with Camera icon
- Refresh button on section card
- Source URL display with external link
- Last synced timestamp
- Expired link warning (amber alert)
- Videos displayed in 5-column grid

### FotoshareSection Component (Public Gallery)
- Dark themed with gradient header
- Pink accent color scheme
- Vertical 9:16 video thumbnails (360° badge)
- Hover-to-play overlay
- Expand/collapse functionality
- Dual play mode (embedded vs external)

### API Endpoints
- `POST /api/galleries/{id}/fotoshare-sections` - Create section (scrapes URL)
- `POST /api/galleries/{id}/fotoshare-sections/{sid}/refresh` - Re-sync videos
- `GET /api/galleries/{id}/fotoshare-videos` - Get videos (supports gallery_id or share_link)
- `DELETE /api/galleries/{id}/fotoshare-sections/{sid}` - Delete section and videos

### Database Schema
**fotoshare_videos collection:**
- id, gallery_id, section_id
- hash (unique fotoshare identifier)
- source_url (link to fotoshare.co/i/{hash})
- thumbnail_url, width, height
- file_type, file_source, order
- synced_at, created_at_source

**sections (updated):**
- fotoshare_url (for type=fotoshare)
- fotoshare_last_sync (ISO timestamp)
- fotoshare_expired (boolean - true if link no longer works)

### Expired Link Handling
- When refresh fails with 404, section marked as expired
- Amber warning shown in UI
- Existing videos remain visible until section is deleted
- Photographer can delete section and re-create with new URL

## Next Steps / Backlog
1. **Payment Gateway Integration (P0)**: Integrate PayMongo or Stripe for automated payments
2. **Enable Live Billing (P1)**: Implement automated renewals when billing_enforcement_enabled = true
3. **Invoice Generation (P2)**: Generate downloadable invoices for payments
4. ~~**Codebase Refactoring (P2)**: Split server.py into modules~~ ✅ Phase 1 Complete
   - Phase 2: Extract routes to APIRouter modules
   - Phase 3: Add tests and dependency injection

## Recent Updates (February 7, 2026)

### 360 Glam Booth / Fotoshare.co Integration ✅ (COMPLETED)
- **New Section Type**: "360 Booth" option when creating gallery sections
- **Auto-Scraping**: Backend scrapes fotoshare.co event pages for video data
- **Sync/Refresh**: Videos can be refreshed manually or automatically
- **Expired Link Detection**: System detects when event links expire
- **FotoshareSection Component**: Cinematic display in public gallery
- **Full Test Coverage**: Backend (15/15 tests passed), Frontend working

### Auto-Refresh Schedule (NEW)
Background task automatically syncs fotoshare sections based on age:
| Section Age | Refresh Interval |
|-------------|------------------|
| Day 1 (0-24h) | Every 10 minutes |
| Day 2 (24-48h) | Every 1 hour |
| Day 3-30 | Every 24 hours |
| After 30 days | Every 30 days |

Plus manual refresh button always available in gallery management.

### Public Gallery UX Improvement ✅
- **Upload Button at Top**: "Share Your Photos" CTA now appears immediately after hero
- **One-Click Upload Modal**: Clicking the button opens upload popup instantly (no scrolling needed)
- **Better Guest Experience**: Elderly/non-tech-savvy guests can easily share photos with single click

### Files Modified
- `/app/backend/server.py`: Added scraping utility, 5 new API endpoints, auto-refresh background task, contributor fotoshare endpoint, coordinator field
- `/app/frontend/src/pages/GalleryDetail.jsx`: 360 Booth section creation/management UI with contributor link generation, coordinator field in edit modal
- `/app/frontend/src/components/FotoshareSection.jsx`: NEW - Public display component with expand/collapse
- `/app/frontend/src/pages/PublicGallery.jsx`: Integrated FotoshareSection, added upload modal popup, displays all contributors
- `/app/frontend/src/pages/FotoshareContributorUpload.jsx`: NEW - 360 booth supplier upload page
- `/app/frontend/src/pages/CreateGallery.jsx`: Added coordinator name field
- `/app/frontend/src/App.js`: Added `/f/:contributorLink` route

### Gallery Credits Display
The public gallery now shows all contributors with their roles:
- **Photographer**: Main account owner (no role tag)
- **Coordinator**: Event planner with "(Coordinator)" tag
- **Videography**: Video section contributors with "(Videography)" tag
- **360 Booth**: Fotoshare section contributors with "(360 Booth)" tag
- **Photography**: Photo section contributors (no extra tag, same as photographer)

---

## Previous Updates (February 4, 2026)

### Photographer Analytics Dashboard ✅ (COMPLETED)
- **Summary Stats**: Galleries, Photos, Total Views, Storage Used
- **New Metrics**: QR Scans, Downloads, Views Today, Views This Week
- **Per-Gallery Stats**: Each gallery shows Views, QR Scans, Downloads
- **Time-based Tracking**: Views tracked for today, week, month
- **Storage Progress**: Visual progress bar with quota usage

### Email Notifications ✅ (COMPLETED)
Integrated with **Resend** email service.

**Admin Notifications (to lessrealmoments@gmail.com):**
- 🎉 New account created (name, email, business)
- 💳 Payment proof submitted (upgrade or extra credits)

**Customer Notifications:**
- ⏳ Payment waiting for approval
- ✅ Payment approved (with plan/credits info)
- ❌ Payment rejected (with reason and dispute instructions)

### Analytics Tracking API Endpoints
- `POST /api/analytics/track-qr-scan/{gallery_id}` - Track QR scan
- `POST /api/analytics/track-download/{gallery_id}` - Track download
- `POST /api/analytics/track-view/{gallery_id}` - Track gallery view

---

## Previous Updates (February 3, 2026)

### Notification Bell for Photographers ✅
- Bell icon in dashboard header shows unread notification count
- Dropdown displays notifications with type icons (approved=green, rejected=red)
- Mark individual or all notifications as read
- Notifications created when admin approves/rejects payments

### Payment Dispute & Resubmit ✅
- Users with rejected payments see red banner with rejection reason
- "Dispute & Resubmit" button (1 attempt allowed)
- Dispute modal shows original proof, allows message + new proof upload
- After 1 dispute attempt, must contact customer service

### Admin Transaction History ✅
- New "Transaction History" section in Billing tab
- Table shows: date, client name/email, type, amount, status
- "View Proof" button for each transaction with proof
- "History" button opens modal showing all transactions for a specific client
- Blue history button added to photographer row actions

### API Endpoints Added
- `GET /api/user/notifications` - Get user notifications
- `GET /api/user/notifications/unread-count` - Get unread count
- `PUT /api/user/notifications/{id}/read` - Mark notification as read
- `PUT /api/user/notifications/read-all` - Mark all as read
- `POST /api/user/payment-dispute` - Submit dispute with new proof
- `GET /api/user/payment-status` - Get payment status with can_dispute flag
- `GET /api/user/transactions` - Get user's transaction history
- `GET /api/admin/transactions` - Get all transactions (admin)
- `GET /api/admin/users/{id}/transactions` - Get user's transactions (admin)

### Database Collections Added
- `notifications` - User notifications with type, title, message, read status
- `transactions` - Payment transaction history with proof URLs

## Access URLs
- Preview: https://picflow-app-3.preview.emergentagent.com
- Pricing: /pricing
- Admin: /admin

## Last Updated
February 5, 2026 - Fixed Collage Display stopping issue, Collage Layout Preset Builder

### Collage Display Perpetual Loop Fix ✅ (COMPLETED - February 5, 2026)

**Issue**: Collage display would stop after ~5 transitions (when showing 65+ tiles with 13-tile layouts on 53 photos)

**Root Cause**: Race condition in the preload/transition logic:
1. `isTransitioning` state wasn't being checked atomically
2. `preloadNextSets()` could get stuck when `isPreloadingRef` wasn't properly released
3. Preloaded sets were being consumed but not replenished correctly

**Fix Applied** in `CollageDisplay.jsx`:
- Added `isTransitioningRef` ref to prevent race conditions with state
- Simplified `transitionToNext` to generate tiles directly if preloaded buffer is empty
- Fixed `preloadNextSets` to properly calculate next indices and handle errors
- Ensured `photoPoolIndex` always advances to prevent index stagnation

### Collage Layout Preset Builder ✅ (COMPLETED - February 5, 2026)

**Admin-Only Preset Builder** (`/admin/collage-presets`):
- Visual canvas for designing mosaic collage layouts
- 16:9 aspect ratio canvas matching live display
- Add placeholders with predefined ratios (Landscape 3:2, Portrait 2:3, Square 1:1, Custom)
- Drag placeholders to position them
- Resize placeholders with aspect ratio lock (fixed resize bug that wasn't accounting for canvas aspect ratio)
- Visual settings: gap size, border thickness, border color, background color
- Preset metadata: name, description, tags, set as default
- Layer control for overlapping placeholders
- Distribution tools (horizontal/vertical alignment, tidy up)
- Grid overlay with snap-to-grid option

**Photographer Preset Picker** (Gallery Detail Page):
- Added "Choose Layout" option under Display Mode > Live Collage section
- Modal shows available presets with mini thumbnail previews
- Clicking a preset saves `collage_preset_id` to gallery
- Shows currently selected preset name in dropdown
- "Default Layout" option to use system default mosaic

**API Endpoints**:
- `POST /api/admin/collage-presets` - Create preset
- `GET /api/admin/collage-presets` - List all presets (admin)
- `GET /api/admin/collage-presets/{id}` - Get single preset
- `PUT /api/admin/collage-presets/{id}` - Update preset
- `DELETE /api/admin/collage-presets/{id}` - Delete preset
- `POST /api/admin/collage-presets/{id}/duplicate` - Duplicate preset
- `GET /api/collage-presets` - List presets (photographer)
- `GET /api/collage-presets/{id}/public` - Get preset (public)
- `GET /api/collage-presets/default/public` - Get default preset

**Database Schema** (`collage_presets` collection):
```json
{
  "id": "uuid",
  "name": "string",
  "description": "string", 
  "tags": ["string"],
  "placeholders": [{"id", "x", "y", "width", "height", "ratio", "z_index"}],
  "settings": {"gap", "border_thickness", "border_color", "background_color"},
  "is_default": false,
  "created_by": "admin",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

**Gallery Schema Update**:
- Added `collage_preset_id: Optional[str]` to Gallery model
- Saved via `PUT /api/galleries/{id}` with `{"collage_preset_id": "preset-id"}`

### Live Event Display Modes ✅ (COMPLETED - February 4, 2026)

**CollageDisplay.jsx - Rewritten for smooth live event experience:**
- 11-tile mosaic layout with 16:9 aspect ratio
- Individual tile crossfade transitions (1.2s opacity animation)
- No gaps between tiles (edge-to-edge photos)
- Image preloading with caching (preloads next batch before transition)
- Auto-polling for new photos (10s-45s based on photo count)
- Controls: Pause/Play, Settings panel with interval slider (3-15s), Fullscreen
- **Fixed**: Removed white border/cluttering issue from previous 3D cube-flip animation

**SlideshowDisplay.jsx - Optimized for smooth transitions:**
- Single photo display with smooth fade transitions (700ms)
- Image preloading (next 5 photos)
- Progress bar showing position in gallery
- Auto-advance with configurable interval
- Click to pause/play

**Test Gallery**: Ruby and Sapphire's Birthday (share_link: a189497a)
- Access: `/display/a189497a?mode=collage` or `?mode=slideshow`
- 53 photos, verified smooth transitions

### New Features ✅ (COMPLETED)

**1. Section Rename**
- Users can now rename gallery sections by hovering and clicking the blue edit icon
- Inline editing with Enter to save, Escape to cancel
- Backend endpoint: `PUT /api/galleries/{gallery_id}/sections/{section_id}`

**2. Enterprise Access Override Mode**
- New admin override mode for major clients testing the product (1-2 months trial)
- Includes unlimited event credits by default
- Admin can toggle individual features via Global Feature Toggles
- Available in: Admin Override dropdown, Feature Toggles page

### Bug Fixes ✅ (COMPLETED)
**Critical: Gallery Creation Bug Fixed**
- Fixed `NameError: name 'is_founder' is not defined` in `/app/backend/server.py`
- Users with unlimited tokens (Founders Circle) and Pro users with credits can now create galleries
- Tested with both `lessrealmoments@gmail.com` (Founders) and `tester1@gmail.com` (Pro)

**Admin UI Cleanup: Removed Per-User Feature Toggle**
- Removed the confusing per-user feature toggle button (purple toggle) from admin dashboard
- Features are now controlled ONLY via the global Feature Toggles page by plan/mode
- This eliminates confusion about which toggles apply to each user

### Mobile Responsiveness Improvements ✅ (COMPLETED)
Comprehensive mobile-first UI updates across key pages:

**Landing Page:**
- Added hamburger menu with animated dropdown for mobile
- Pricing link now accessible on mobile (was hidden before)
- Responsive hero section with proper text sizing
- Image carousel works on all screen sizes

**Dashboard:**
- Mobile hamburger menu with Analytics, Profile, Logout options
- Notification bell accessible on mobile
- Sticky nav header for better navigation
- Responsive subscription card and storage bar
- Gallery cards stack properly on mobile

**Pricing Page:**
- Pricing cards now stack vertically on mobile
- Improved text sizing and spacing
- Responsive feature grid and FAQ section
- Touch-friendly buttons and links

### Backend Refactoring (Phase 1) ✅ (COMPLETED)
Created modular code organization for future maintainability:
- **core/** - Configuration, database, dependencies
  - `config.py` - Constants and settings
  - `database.py` - MongoDB connection
  - `dependencies.py` - Auth dependencies
- **models/** - Pydantic data models
  - `user.py`, `gallery.py`, `billing.py`, `notification.py`, `analytics.py`
- **services/** - Business logic
  - `auth.py`, `billing.py`, `features.py`, `notifications.py`, `email.py`, `gallery.py`, `images.py`
- **README.md** - Comprehensive documentation of API endpoints and architecture

Note: server.py remains monolithic (~5300 lines) but modules are ready for Phase 2 extraction.

### Payment Modal Unification ✅ (COMPLETED)
- Replaced hardcoded upgrade modal in PricingPage.jsx with reusable PaymentMethodsModal
- Consistent payment experience across:
  - Plan upgrades from Pricing page
  - Extra credit purchases from Dashboard
- Modal dynamically loads payment methods from admin configuration
- Fixed missing imports (X, Upload from lucide-react) that caused blank page

## Fail-Safe Image Upload & Thumbnail System ✅ (COMPLETED - February 8, 2026)

### Problem Solved
Users reported broken thumbnails in galleries and black/perpetually loading images in collage mode. This feature implements a robust image pipeline with automatic error detection, retry, and recovery.

### Features Implemented

**1. Thumbnail Generation with Retry Logic**
- 3 retry attempts with 0.5s delay between retries
- Validates thumbnail file exists and is not empty after generation
- Logs detailed warnings/errors for debugging

**2. Image Validation Service**
- `validate_image_file()`: Checks if file exists, is readable, and can be opened by PIL
- `validate_thumbnail()`: Checks specific thumbnail file health
- Returns detailed validation results for diagnostics

**3. Auto-Flagging System**
- Photos with failed thumbnail generation are automatically flagged
- Flag reason: `auto:thumbnail_generation_failed`
- Auto-flagged photos hidden from public gallery automatically (existing filter)
- Photographer can see flagged photos and decide to unflag/delete

**4. Photo Health Check Endpoint**
- `GET /api/galleries/{gallery_id}/photos/health`
- Scans all photos in gallery, validates original + thumbnails
- Returns total issues count, auto-flagged count, and per-photo status

**5. Thumbnail Repair Endpoint**
- `POST /api/galleries/{gallery_id}/photos/repair-thumbnails`
- Scans and regenerates missing/broken thumbnails
- Auto-unflags photos that were flagged due to thumbnail failures
- Returns repair results (repaired, failed, already_valid, unflagged)

**6. Single Photo Repair/Flag/Unflag**
- `POST /api/photos/{photo_id}/repair-thumbnail`
- `POST /api/photos/{photo_id}/flag?reason=xxx`
- `POST /api/photos/{photo_id}/unflag`
- `GET /api/galleries/{gallery_id}/flagged-photos`

**7. Enhanced Thumbnail Serving**
- `/api/photos/thumb/{filename}` now validates file integrity
- Removes empty files and attempts on-the-fly regeneration
- Returns proper 404 for corrupted thumbnails

**8. Frontend UI Components**
- **Flagged Photos Warning Banner**: Amber warning box showing hidden photo count
- **"Repair Thumbnails" Button**: One-click thumbnail repair for entire gallery
- **"View Hidden Photos" Button**: Opens modal to review flagged photos
- **Flagged Photos Modal**: Grid view with Show/Delete actions per photo
- **Status Badges**: "Auto" (system flagged) vs "Manual" (user flagged)

**9. Collage Mode Protection**
- Photos without thumbnail URLs are filtered out before display
- Prevents black boxes and loading spinners in collage

### Database Schema Changes
- Added `auto_flagged: bool` field to Photo model
- Existing `is_flagged`, `flagged_at`, `flagged_reason` fields now used for auto-flagging

### API Endpoints Added
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/galleries/{id}/photos/health` | GET | Check health status of all photos |
| `/api/galleries/{id}/photos/repair-thumbnails` | POST | Repair all thumbnails in gallery |
| `/api/photos/{id}/repair-thumbnail` | POST | Repair single photo thumbnail |
| `/api/photos/{id}/flag` | POST | Flag a photo (hide from gallery) |
| `/api/photos/{id}/unflag` | POST | Unflag a photo (show in gallery) |
| `/api/galleries/{id}/flagged-photos` | GET | List all flagged photos |

### Files Modified
- `/app/backend/server.py`: Added thumbnail retry logic, validation functions, new endpoints
- `/app/frontend/src/pages/GalleryDetail.jsx`: Added flagged photos section, repair UI, modal
- `/app/frontend/src/pages/CollageDisplay.jsx`: Added thumbnail URL filter for photos

## Landing Page Image Upload Error Handling ✅ (COMPLETED - February 8, 2026)

### Problem Investigated
User reported "broken images" after uploading images for the landing page via Admin Dashboard.

### Investigation Results
- Backend upload endpoint `/api/admin/landing-image` is working correctly
- Images are stored in `/app/backend/uploads/` with proper filenames
- Database stores correct URLs in `site_config.landing` collection
- Image serving endpoint `/api/photos/serve/{filename}` returns 200 with correct content-type
- **No reproduction of the "broken image" issue in current environment**

### Defensive Improvements Made
1. **Image Error Handling in Admin Dashboard**
   - Added `onError` handler to hero image display
   - Broken images will be hidden and logged to console for debugging

2. **Upload Verification**
   - After upload, images are now verified by loading them in the browser
   - If verification fails, user sees "Image uploaded but failed to load. Please try again."

3. **Landing Page Error Handling**
   - Added `onError` handler to hero carousel images
   - Broken images are hidden and logged for debugging

### Possible Causes (if issue persists)
- Browser caching issue on user's machine
- Network/CDN issue specific to user's environment
- Upload interrupted mid-process (before database update)
- File corruption during upload

### Files Modified
- `/app/frontend/src/pages/AdminDashboard.jsx`: Added error handling and upload verification
- `/app/frontend/src/pages/LandingPage.jsx`: Added error handling for hero images

## pCloud Integration ✅ (COMPLETED - February 8, 2026)

### Feature Overview
Integrated pCloud as a photo source for galleries. This allows photographers to:
1. Link pCloud shared folders to gallery sections
2. Photos are proxied through our server (bypasses ISP blocking like Smart in Philippines)
3. Supports supplier subfolders - photos organized by who uploaded them

### How It Works
1. **Photographer's Workflow:**
   - Creates event folder in pCloud (e.g., "Janmark's Wedding")
   - Creates subfolder for each section (e.g., "Official Photographer", "RAW FILES")
   - Generates pCloud "request file link" and sends to supplier
   - Supplier uploads to pCloud → creates subfolder with their name
   - Photographer links pCloud folder to gallery section in dashboard

2. **System Architecture:**
   - pCloud API (`api.pcloud.com/showpublink`) fetches folder metadata
   - Photos stored in MongoDB with reference to pCloud code + fileid
   - Proxy endpoint (`/api/pcloud/serve/{code}/{fileid}`) streams images
   - Bypasses ISP blocking by routing through our server

### API Endpoints
- `POST /api/galleries/{id}/pcloud-sections` - Create new pCloud section
- `POST /api/galleries/{id}/pcloud-sections/{section_id}/refresh` - Sync new photos
- `GET /api/galleries/{id}/pcloud-photos` - Get pCloud photos for photographer
- `GET /api/public/gallery/{share_link}/pcloud-photos` - Get pCloud photos for guests
- `GET /api/pcloud/serve/{code}/{fileid}` - Proxy/serve pCloud image

### Frontend Features
- New "pCloud" section type option when creating sections
- Blue-themed UI consistent with pCloud branding
- Refresh button to sync new photos from pCloud
- Lightbox viewing with navigation and download
- Photos show supplier name attribution

### Database Schema
```javascript
// pcloud_photos collection
{
  id: String,
  gallery_id: String,
  section_id: String,
  pcloud_code: String,      // Share link code
  fileid: String,           // pCloud file ID (as string)
  name: String,             // Original filename
  size: Number,             // File size in bytes
  width: Number,
  height: Number,
  contenttype: String,
  supplier_name: String,    // From subfolder name
  hash: String,
  synced_at: String
}
```

### Files Modified
- `/app/backend/server.py`: Added pCloud helper functions and API endpoints
- `/app/frontend/src/pages/GalleryDetail.jsx`: Added pCloud section creation and management
- `/app/frontend/src/pages/PublicGallery.jsx`: Added pCloud section rendering and lightbox

### Known Limitations
- Large files may load slowly (proxied in real-time)
- Photos must be synced manually with "Refresh" button
- Does not auto-detect new uploads from pCloud

### Testing
- Tested with real pCloud share link containing 35+ photos
- Lightbox viewing and navigation working
- Download functionality working
- ISP bypass confirmed (images served through our domain)

### Thumbnail Optimization ✅ (COMPLETED - February 8, 2026)

**Problem:** pCloud photos are large (2-3MB each), causing slow gallery loading.

**Solution:** Implemented pCloud's `getpubthumb` API for fast thumbnails:
- Gallery grid uses 400x400 thumbnails (~40KB each instead of 2-3MB)
- Lightbox filmstrip uses thumbnails for quick navigation
- Full-quality images load only when viewing in lightbox

**Performance Improvement:**
- Before: 2.3MB per image = 80MB+ to load 35 photos
- After: 44KB per thumbnail = 1.5MB to load 35 thumbnails (50x faster!)

**API Endpoints:**
- `GET /api/pcloud/thumb/{code}/{fileid}?size=400x400` - Returns thumbnail (cached 24hrs)
- Full image endpoint unchanged: `GET /api/pcloud/serve/{code}/{fileid}`

**Files Modified:**
- `/app/backend/server.py`: Added thumbnail proxy endpoint
- `/app/frontend/src/pages/PublicGallery.jsx`: Use thumbnails in grid
- `/app/frontend/src/components/PremiumLightbox.jsx`: Use thumbnails in filmstrip

## Google Drive Integration ✅ (COMPLETED - February 10, 2026)

### Feature Overview
Integrated Google Drive as a photo source for galleries. This allows photographers to:
1. Create empty Google Drive sections and generate contributor links
2. Share links with suppliers who submit their Google Drive folder URLs
3. Import photos automatically with thumbnails
4. Credit contributors with optional name and role
5. Allow clients to view and highlight specific photos

### Workflow Options

**Option 1: Direct Import (Photographer has the link)**
1. Photographer creates Google Drive section with URL
2. Photos import automatically
3. Manual refresh available

**Option 2: Contributor Link (Professional workflow - NEW)**
1. Photographer creates empty Google Drive section (without URL)
2. Generate contributor link with `/d/` prefix
3. Share link/QR code with supplier or coordinator
4. Supplier visits link and submits:
   - Their name/company name
   - Their role (optional)
   - Their Google Drive folder URL
5. Photos import automatically after submission

### UI Components
- **Section Type Selector**: Green "Google Drive" option with HardDrive icon
- **Input Form**: URL field is now OPTIONAL - leave blank for contributor workflow
- **Contributor Link**: Uses `/d/{link}` prefix (like `/f/` for fotoshare, `/v/` for video)
- **Section Button**: Green styling with HardDrive icon, shows error warning if sync failed
- **Refresh Button**: Appears on hover over section button

### Contributor Upload Page (`/d/{contributorLink}`)
- Green gradient theme matching Google Drive branding
- Fields: Name (required), Role (optional), Google Drive URL (required)
- Step-by-step instructions for making folder public
- Re-submission replaces existing photos

### API Endpoints
- `POST /api/galleries/{id}/gdrive-sections` - Create new Google Drive section (URL optional)
- `POST /api/galleries/{id}/gdrive-sections/{section_id}/refresh` - Refresh photos from Google Drive
- `POST /api/contributor/{link}/gdrive` - Submit Google Drive folder as contributor (NEW)
- `GET /api/public/gallery/{share_link}/gdrive-photos` - Get Google Drive photos for public gallery
- `DELETE /api/galleries/{id}/gdrive-sections/{section_id}` - Delete section and its photos
- `POST /api/galleries/{id}/gdrive-sections/{section_id}/photos/{photo_id}/highlight` - Toggle highlight
- `GET /api/gdrive/proxy/{file_id}` - Proxy Google Drive images to avoid CORS

### Database Schema
```javascript
// gdrive_photos collection
{
  id: String,
  gallery_id: String,
  section_id: String,
  gdrive_folder_id: String,     // Google Drive file ID
  file_id: String,              // Individual file ID
  name: String,                 // Original filename
  mime_type: String,
  size: Number,                 // File size in bytes
  thumbnail_url: String,        // Google Drive thumbnail URL
  view_url: String,             // View in Google Drive link
  is_highlight: Boolean,        // Whether photo is highlighted
  synced_at: String
}

// sections collection (gdrive type)
{
  type: "gdrive",
  gdrive_folder_id: String,     // Extracted folder ID (null if empty section)
  gdrive_folder_name: String,   // Folder name from Google Drive
  gdrive_last_sync: String,     // Last sync timestamp
  gdrive_error: String,         // Error message if sync failed
  contributor_name: String,     // Optional contributor credit
  contributor_role: String,     // Optional role (e.g., "Photography")
  contributor_link: String,     // Contributor upload link
  contributor_enabled: Boolean  // Whether contributor uploads are enabled
}
```

### Files Modified/Created
- `/app/backend/server.py`: Added Google Drive helper functions and API endpoints
- `/app/frontend/src/pages/GalleryDetail.jsx`: Added Google Drive section creation and management
- `/app/frontend/src/pages/PublicGallery.jsx`: Added Google Drive section rendering
- `/app/frontend/src/pages/GdriveContributorUpload.jsx`: NEW - Contributor upload page
- `/app/frontend/src/components/GoogleDriveSection.jsx`: NEW - Public display component
- `/app/frontend/src/App.js`: Added route `/d/:contributorLink`

### Routes
| Route | Purpose |
|-------|---------|
| `/d/{link}` | Google Drive contributor upload page |

### Auto-Sync
- Background task runs every **15 minutes**
- Checks all Google Drive sections with `gdrive_folder_id` set
- Syncs every **30 minutes** based on `gdrive_last_sync`
- Adds new photos without removing existing ones

### Known Limitations
- Folder must be shared with "Anyone with the link can view"
- Large folders may take time to sync
- Google Drive API rate limits may affect large folders

### Testing Results
- Backend: 100% tests passed
- Frontend: All UI elements verified (100%)
- Test files: `/app/backend/tests/test_gdrive_section.py`, `/app/backend/tests/test_gdrive_contributor.py`

## pCloud Integration Enhancement ✅ (COMPLETED - February 10, 2026)

### Feature Overview
Enhanced pCloud integration to support a professional contributor workflow matching Google Drive:
1. Photographers create empty pCloud sections with upload request links
2. Generate contributor links to share with suppliers
3. Suppliers visit the contributor page, upload to pCloud, then sync

### Workflow
1. **Create pCloud Section**
   - Enter section name
   - Enter **pCloud Upload Request Link** (required) - the link you share with suppliers
   - Optionally enter **pCloud Viewing Link** to import photos immediately
2. **Generate Contributor Link**
   - Click "Generate Link" on the pCloud section
   - Uses `/p/{link}` prefix
   - Share link/QR code with suppliers
3. **Supplier Uploads**
   - Supplier visits `/p/{link}` page
   - Enters their name and role
   - Clicks "Upload Photos to pCloud" → Opens your upload request link
   - Clicks "Sync Now" → Provides their viewing link
   - Photos sync to gallery

### Contributor Page (`/p/{contributorLink}`)
3-step workflow:
1. **Your Details**: Name (required), Role (optional)
2. **Upload Photos**: Button opens pCloud upload request link in new tab
3. **Sync Photos**: Manual sync by providing pCloud viewing/share link

### Auto-Sync
- Background task runs every **15 minutes**
- Checks all pCloud sections with `pcloud_code` set
- Syncs every **30 minutes** based on `pcloud_last_sync`
- Adds new photos without removing existing ones

### API Endpoints
- `POST /api/galleries/{id}/pcloud-sections` - Create section (now supports optional viewing URL)
- `POST /api/contributor/{link}/pcloud` - Submit pCloud viewing link as contributor
- `POST /api/galleries/{id}/pcloud-sections/{section_id}/refresh` - Manual refresh

### Database Schema Updates
```javascript
// sections collection (pcloud type)
{
  type: "pcloud",
  pcloud_code: String,           // Extracted code from viewing link (null if empty)
  pcloud_folder_name: String,
  pcloud_upload_link: String,    // NEW: Upload request link for suppliers
  pcloud_last_sync: String,
  pcloud_error: String,
  contributor_name: String,
  contributor_role: String,
  contributor_link: String,
  contributor_enabled: Boolean
}
```

### Files Modified/Created
- `/app/backend/server.py`: Updated pCloud section creation, added contributor endpoint, added auto-sync
- `/app/frontend/src/pages/GalleryDetail.jsx`: Updated pCloud form with upload link field
- `/app/frontend/src/pages/PcloudContributorUpload.jsx`: NEW - Contributor upload page
- `/app/frontend/src/App.js`: Added route `/p/:contributorLink`

### Routes
| Route | Purpose |
|-------|---------|
| `/p/{link}` | pCloud contributor upload page |

### Testing Results
- Backend: 100% tests passed
- Frontend: All UI elements verified (100%)
- Test file: `/app/backend/tests/test_pcloud_contributor.py`

## Contributors Section (Public Gallery)

### How It Works
The public gallery automatically aggregates contributors from all section types:
- Photo sections (guest uploads)
- Video sections (videographers)
- 360 Booth/Fotoshare (booth suppliers)
- pCloud (photo suppliers)
- Google Drive (photo suppliers)

### Display Format
```
THE STORY, CURATED BY
[Gallery Owner Name]

WITH
[Contributor 1 Name]
[Contributor 1 Role]

[Contributor 2 Name]
[Contributor 2 Role]
...
```

### How Contributors Are Connected
Each section type stores contributor info:
- `contributor_name`: Name/company displayed in "WITH" section
- `contributor_role`: Role displayed below name

When contributors submit via their respective upload pages (/c/, /v/, /f/, /d/, /p/), their name and role are automatically saved to the section and displayed in the public gallery.

## Coordinator Hub Feature ✅ (COMPLETED - February 2026)

### Feature Overview
A centralized page for coordinators to manage all supplier upload links for a gallery. Accessible only via a unique link generated by the photographer.

### How It Works
1. Photographer clicks "Coordinator Hub" button in gallery detail page
2. A unique link is generated (e.g., `/coordinator/abc123xyz`)
3. Coordinator opens the link and sees all sections needing contributions
4. Each section shows: name, type, status (Pending/Submitted/Synced), QR code, and upload link
5. Coordinator shares individual section links with respective suppliers

### Role Confirmation
All contributor upload pages now show a confirmation step before allowing uploads:
- "Are you sure you are the OFFICIAL PHOTOGRAPHER?"
- "Are you sure you are the OFFICIAL VIDEOGRAPHER?"
- "Are you sure you are the OFFICIAL 360 BOOTH OPERATOR?"
- "Are you sure you are the OFFICIAL PHOTO CONTRIBUTOR?"

This prevents suppliers from accidentally uploading to wrong sections.

### Technical Implementation
**Backend Endpoints:**
- `POST /api/galleries/{id}/coordinator-link` - Generate coordinator hub link
- `GET /api/coordinator-hub/{link}` - Get hub data with all sections

**Frontend:**
- `/coordinator/{hubLink}` - CoordinatorHub.jsx page
- Updated GalleryDetail.jsx with Coordinator Hub button and modal
- Updated all 5 contributor pages with role confirmation step

### Files Changed
- `/app/backend/server.py` - Added coordinator hub endpoints
- `/app/frontend/src/pages/CoordinatorHub.jsx` (NEW)
- `/app/frontend/src/App.js` - Added route
- `/app/frontend/src/pages/GalleryDetail.jsx` - Added button and modal
- `/app/frontend/src/pages/ContributorUpload.jsx` - Added role confirmation
- `/app/frontend/src/pages/VideographerUpload.jsx` - Added role confirmation
- `/app/frontend/src/pages/FotoshareContributorUpload.jsx` - Added role confirmation
- `/app/frontend/src/pages/GdriveContributorUpload.jsx` - Added role confirmation
- `/app/frontend/src/pages/PcloudContributorUpload.jsx` - Added role confirmation

### Test Results
- 100% backend tests passed (7/7)
- 100% frontend tests passed
- Test report: `/app/test_reports/iteration_22.json`

### Feature Overview
Comprehensive text readability and typography enhancement across all 40+ gallery themes. All text in the public gallery now uses dynamic contrast calculation to ensure readability on any background color.

### Technical Implementation
Three key helper functions in `/app/frontend/src/themes.js`:

| Function | Purpose |
|----------|---------|
| `getContrastTextColor(hexColor)` | Returns white (#ffffff) for dark backgrounds, dark (#1a1a1a) for light backgrounds based on luminance |
| `getSubtleTextColor(hexColor, opacity)` | Returns RGBA color with specified opacity for secondary/subtle text |
| `getTextColorForBackground(theme, bgType)` | Combines theme info with contrast calculation for specific background types |

### Elements Updated in PublicGallery.jsx
- Password page text (photographer name, "password protected" message)
- Navigation bar text (photographer name on glass nav)
- Description text
- Guest upload CTA text
- Section headers and photo count labels
- Contributor names ("by [name]")
- Download dropdown text
- Footer text ("Thank you for being part of this special day", copyright)
- Empty state message
- View All buttons

### Themes Verified
Tested on multiple theme types:
- **Dark themes**: neon (purple), modern (dark blue), blackgold, midnight
- **Light themes**: romantic (pink), party (vibrant pink), classic (white)
- **Nature themes**: ocean (blue/white), garden (green/white)

### Google Fonts Added
Extended font collection for theme variety:
- Lato, Lora, Raleway, Source Sans Pro
- Cinzel, DM Serif Display, DM Sans
- Quicksand, Nunito, Poppins, Open Sans

### Test Results
- 100% frontend tests passed
- All text elements readable on all tested themes
- Test report: `/app/test_reports/iteration_21.json`


## Backend Refactoring - Phase 3 Complete ✅ (December 2025)

### Background Tasks Extraction
Successfully extracted all 5 background tasks from `server.py` to `/app/backend/tasks/background.py`:

| Task | Purpose | Interval |
|------|---------|----------|
| `auto_refresh_fotoshare_sections()` | Auto-refresh fotoshare sections based on age | Variable (10m-30d) |
| `auto_sync_gdrive_sections()` | Sync Google Drive sections for new photos | 15 minutes |
| `auto_sync_pcloud_sections()` | Sync pCloud sections for new photos | 15 minutes |
| `auto_sync_drive_backup_task()` | Auto-backup galleries to Google Drive | 5 minutes |
| `auto_delete_expired_galleries()` | Delete galleries past auto_delete_date | Daily |

### Architecture Pattern Used
**Dependency Injection**: Tasks receive dependencies via `init_tasks()`:
- `db` - MongoDB database connection
- `storage` - R2/local storage service
- `logger` - Logging instance
- `scrape_fotoshare_videos` - Fotoshare scraping function
- `fetch_pcloud_folder` - pCloud API function
- `get_gdrive_photos` - Google Drive photos function
- `get_drive_service_for_user` - Drive OAuth service
- `UPLOAD_DIR` - Upload directory path
- `DRIVE_SYNC_INTERVAL` - Drive sync interval

### Files Changed
- `/app/backend/server.py` - Removed duplicate tasks, updated lifespan to use tasks module
- `/app/backend/tasks/background.py` - All background task implementations
- `/app/backend/tasks/__init__.py` - Exports for tasks module
- `/app/backend/REFACTOR_PLAN.md` - Updated progress tracker

### Results
- **Lines reduced**: 425 lines removed from server.py
- **Server.py size**: 9,542 lines (down from 9,967)
- **Total reduction**: 529 lines (from 10,071 original)
- All background tasks verified running successfully
- API health check passing
- All endpoints functional

## Backend Refactoring - Phase 4 Complete ✅ (December 2025)

### Final Results
- **server.py**: Reduced from 10,071 to 9,163 lines (908 lines removed, 9% reduction)
- **Models extracted**: 45+ Pydantic models to `/app/backend/models/`
- **Tasks extracted**: 5 background tasks to `/app/backend/tasks/background.py`
- **Routes extracted**: Health route to `/app/backend/routes/health.py`
- **Testing**: 17/17 API endpoints verified working (100% pass rate)

### Architecture Now
```
backend/
├── server.py (9,163 lines - main app)
├── models/       ✅ Complete - All major models
├── tasks/        ✅ Complete - 5 background tasks
├── utils/        ✅ Complete - Helper functions
├── routes/       ✅ Started - Health route
├── services/     ⚠️ Partial - storage.py only
└── core/         ⚠️ Partial - config, db, deps
```

### Tests Passed
- Health endpoint, authentication, galleries, subscription
- Analytics, admin login, billing settings, photographers list
- Feature toggles, collage presets, landing config
- All background tasks running correctly

## Per-Gallery Storage System (February 2026) ✅

### Change from Per-User to Per-Gallery Storage

**Previous System:**
- Storage quota tracked at user level
- One large gallery could consume all storage

**New System:**
- Each gallery has its own storage quota
- Standard: 10GB per gallery
- Pro: 20GB per gallery
- Free: 1GB per gallery (demo only)
- Override modes: Configurable

### Storage Fields on Gallery Document
```json
{
  "storage_used": 0,      // Bytes used (R2 files only)
  "storage_quota": -1     // -1 = unlimited, else bytes
}
```

### Enforcement Points
- Owner uploads: Checked before upload
- Guest uploads: Checked before upload
- Contributor uploads: Checked before upload

### Frontend Storage Bar
- Shows on each gallery card
- Color coded: Green (<70%), Amber (70-90%), Red (>90%)
- Warning message at 80%: "Consider using Google Drive or pCloud"

### Migration Endpoint
```
POST /api/admin/migrate/gallery-storage
```
Calculates `storage_used` for all existing galleries from their photos.

---

## 60-Day Contributor Link Expiration (February 2026) ✅

### Implementation
Contributor uploads are now blocked 60 days after the gallery's event date.

### Enforcement Points
- `GET /api/contributor/{link}` - Returns `uploads_allowed` and `days_until_expires`
- `POST /api/contributor/{link}/upload` - Rejects if window expired

### Error Message
"Contributor upload window has expired (60 days from event date). Please contact the photographer."

---

## Pending Transactions Fix (February 2026) ✅

### Issue
When users submitted payment proofs for plan upgrades or extra credits, a pending transaction record was NOT being created in the database. This meant admins couldn't see incoming payment requests in the transaction history.

### Fix Applied
- **Upgrade requests**: Now creates a `pending` transaction when `proof_url` is provided
- **Extra credits requests**: Now creates a `pending` transaction when submitting with payment proof

### Transaction Record Structure
```json
{
  "id": "uuid",
  "user_id": "user_uuid",
  "type": "upgrade" | "extra_credits",
  "amount": 1000,
  "plan": "standard" | "pro" | null,
  "extra_credits": number | null,
  "status": "pending" | "approved" | "rejected",
  "payment_proof_url": "url",
  "created_at": "ISO date",
  "resolved_at": null
}
```

### Testing
- Created test user, submitted upgrade + extra credits requests
- Verified both created `pending` transaction records
- Admin can now see all pending transactions via `/api/admin/transactions?status=pending`

---

## Comprehensive Client Management System (February 2026) ✅

### New "Clients" Tab in Admin Dashboard
A complete client account management section with:

#### Stats Dashboard
- Total Clients, Active Clients, Pending Payments
- Total Revenue, Plan Distribution, Override Count

#### Client List View
| Column | Description |
|--------|-------------|
| Client | Name, email, business name |
| Plan | Free/Standard/Pro badge + override mode |
| Status | Active/Pending Payment/Suspended with icons |
| Credits | Event + extra credits |
| Storage | Usage bar with percentage |
| Galleries | Active / total count |
| Revenue | Total revenue + transaction count |
| Joined | Registration date + last login |
| Actions | View details button |

#### Filters & Search
- Search by name, email, business name
- Filter by: Plan, Status, Override Mode
- "Pending Only" checkbox
- Sortable columns (Name, Revenue, Joined)

#### Client Detail Modal
- **Subscription Card**: Plan, status, credits, storage bar
- **Quick Actions**: Add Credits, Extend, Change Plan, Override, Reset Password
- **Payment History**: All transactions with amounts and status
- **Galleries**: Recent galleries with photo counts
- **Account Info**: Member since, last login, status, client ID

### New API Endpoints
| Endpoint | Description |
|----------|-------------|
| `GET /api/admin/clients` | List clients with filters, search, sorting |
| `GET /api/admin/clients/{id}` | Get comprehensive client details |
| `GET /api/admin/clients/stats` | Overall client statistics |
| `POST /api/admin/clients/{id}/add-credits` | Add bonus credits |
| `POST /api/admin/clients/{id}/extend-subscription` | Extend subscription |
| `POST /api/admin/clients/{id}/change-plan` | Change client's plan |
| `POST /api/admin/clients/{id}/reset-password` | Reset client's password |

---

## Photo/Video Count & Download Integration Sources (December 2025)

### Photo Count Update
**Before**: Only counted R2 uploaded photos
**After**: Now counts photos from ALL sources:
- R2 uploaded photos
- Google Drive photos
- pCloud photos

### Video Count (NEW)
Now shows separate video count from:
- Fotoshare/360Glam videos
- YouTube embedded videos

Display format: "X photos • Y videos"

### Download Behavior Change
After password verification:
1. **Download ZIP** = Only R2 photos (server uploads)
2. **External Sources** section shows buttons with links to:
   - Google Drive folders (with section name)
   - pCloud folders (with section name)
   - 360Glam/Fotoshare links (with section name)
   - YouTube videos indicator

### Backend Changes
- `/api/public/gallery/{share_link}`: Now returns `photo_count` and `video_count`
- `/api/public/gallery/{share_link}/download-info`: Now returns `integration_sources` array with links

### Frontend Changes
- Hero section displays "X photos • Y videos"
- Download dropdown includes "External Sources" section after password verification
- Each integration source shows: icon, section name, label, and link to external service
