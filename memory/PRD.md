# PhotoShare - Event Photography Platform

## Original Problem Statement
Build a photo-sharing application for event photographers with:
- Gallery management, photo uploads, guest uploads
- Custom branding, contributor upload links
- Display modes (Slideshow, Live Collage)
- **Complete subscription system with plans, credits, billing, and pricing page**

## Subscription & Billing System

### Plans
| Plan | Price | Credits/Month | Features |
|------|-------|---------------|----------|
| Free | ₱0 | 1 demo gallery | All features for 6 hours, then view-only |
| Standard | ₱1,000/mo | 2 | Standard features (QR, Display, Guest uploads) |
| Pro | ₱1,500/mo | 2 | All features including Contributor Links |

### Override Modes (Admin Assigned)
| Mode | Features | Credits | Fee |
|------|----------|---------|-----|
| Founders Circle | Full Pro | Unlimited | ₱0 |
| Early Partner Beta | Full Pro | 2/month | ₱0 |
| Comped Pro | Full Pro | 2/month | Based on plan |
| Comped Standard | Standard | 2/month | Based on plan |

### Key Rules
- 1 credit = 1 event gallery (single-use)
- Credits reset monthly (don't roll over)
- Extra credits: ₱500/event (current cycle only)
- Galleries auto-delete after 6 months
- Gallery edit lock after 7 days
- Demo galleries: 6-hour feature window, then view-only

### Payment Flow (Manual/Soft Launch)
1. User submits payment proof (screenshot via GCash/PayMaya)
2. Admin reviews in Billing tab and approves/rejects
3. Downloads locked while payment pending
4. Approved = downloads unlocked

## Implemented Features

### Pricing Page (/pricing)
- Three-tier plan comparison (Free, Standard ₱1,000, Pro ₱1,500)
- Feature checklist for each plan
- Extra credits section (₱500/credit)
- Features grid (QR, Display Mode, Guest Uploads, etc.)
- FAQ section
- CTA to sign up

### User Dashboard
- Subscription card showing:
  - Current plan with icon
  - Override mode badge (if applicable)
  - Credit balance (or "Unlimited")
  - Payment status (Active/Pending)
  - Link to pricing page
- Payment proof upload modal
- Download lock warning when payment pending

### Admin Panel - Billing Tab
- Billing mode toggle (Manual/Live)
- Pricing configuration (editable)
- Pending payments queue with Approve/Reject
- Plan reference cards

### Admin Panel - Override Assignment
- Crown button in Photographers table
- Modal with mode selection, duration, reason
- Remove override option

## API Endpoints

### Billing
- `GET /api/billing/pricing` - Public pricing
- `GET /api/billing/settings` - Admin: billing config
- `PUT /api/billing/settings` - Admin: update billing

### User Subscription
- `GET /api/user/subscription` - User's subscription info
- `POST /api/user/payment-proof` - Submit payment screenshot
- `POST /api/upload-payment-proof` - Upload proof image

### Admin
- `GET /api/admin/pending-payments` - Pending approvals
- `POST /api/admin/approve-payment` - Approve payment
- `POST /api/admin/reject-payment` - Reject payment
- `POST /api/admin/assign-override` - Assign override mode
- `POST /api/admin/remove-override` - Remove override
- `PUT /api/admin/users/{id}/plan` - Change user plan

## Current Founder
- Email: lessrealmoments@gmail.com
- Mode: Founders Circle
- Expires: January 2028
- Credits: Unlimited

## Routes
- `/` - Landing page (with Pricing link)
- `/pricing` - Pricing & plans page
- `/auth` - Login/Register
- `/dashboard` - User dashboard with subscription card
- `/admin/dashboard` - Admin with Billing tab

## Completed This Session
1. ✅ Subscription data model & API
2. ✅ Credit consumption on gallery creation
3. ✅ Override modes (4 types)
4. ✅ Payment proof upload flow
5. ✅ Admin billing tab
6. ✅ Admin override assignment modal
7. ✅ Pricing page with plans, features, FAQ
8. ✅ User dashboard subscription card
9. ✅ Download gate when payment pending

## Next Steps
- [ ] GCash/PayMaya live payment integration (when ready)
- [ ] Email notifications for payment status
- [ ] Automated billing when enabled
- [ ] Invoice/receipt generation

## Access URLs
- Preview: https://eventphoto-share.preview.emergentagent.com
- Pricing: /pricing
- Admin: /admin
