# PhotoShare - Event Photography Platform

## Original Problem Statement
Build a photo-sharing application for event photographers with:
- Gallery management, photo uploads, guest uploads
- Custom branding, contributor upload links
- Display modes (Slideshow, Live Collage)
- **Complete subscription system with plans, credits, billing, and pricing page**

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

## Next Steps / Backlog
1. **Payment Gateway Integration (P0)**: Integrate PayMongo or Stripe for automated payments
2. **Enable Live Billing (P1)**: Implement automated renewals when billing_enforcement_enabled = true
3. **Invoice Generation (P2)**: Generate downloadable invoices for payments
4. ~~**Codebase Refactoring (P2)**: Split server.py into modules~~ ✅ Phase 1 Complete
   - Phase 2: Extract routes to APIRouter modules
   - Phase 3: Add tests and dependency injection

## Recent Updates (February 4, 2026)

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
- Preview: https://photo-billing.preview.emergentagent.com
- Pricing: /pricing
- Admin: /admin

## Last Updated
February 4, 2026 - Fixed critical gallery creation bug, removed confusing per-user toggles, mobile improvements

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
