# PhotoShare - Event Photography Platform

## Original Problem Statement
Build a photo-sharing application for event photographers with:
- Gallery management, photo uploads, guest uploads
- Custom branding, contributor upload links
- Display modes (Slideshow, Live Collage)
- **Complete subscription system with plans, credits, billing, and pricing page**

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
- `POST /api/user/upgrade-request` - Submit upgrade with payment proof
- `POST /api/user/extra-credits-request` - Request extra credits with payment proof
- `POST /api/upload-payment-proof` - Upload proof image file

### Admin
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
1. **Payment Gateway Integration (P0)**: Integrate PayMongo for GCash/PayMaya automated payments
2. **Enable Live Billing (P1)**: Implement automated renewals when billing_enforcement_enabled = true
3. **Email Notifications (P2)**: Notify users on payment approval/rejection, plan changes, expiring overrides
4. **Invoice Generation (P2)**: Generate downloadable invoices for payments
5. **Analytics Dashboard (P1)**: Make photographer analytics fully functional (views, QR scans, downloads)
6. **Codebase Refactoring (P2)**: Split server.py into modules (models, routes, utils)

## Access URLs
- Preview: https://photo-pay-plans.preview.emergentagent.com
- Pricing: /pricing
- Admin: /admin

## Last Updated
February 3, 2026 - Subscription & Billing System fully implemented and tested
