# PhotoShare - Event Photography Platform

## Original Problem Statement
Build a photo-sharing application for event photographers with:
- Gallery management, photo uploads, guest uploads
- Custom branding, contributor upload links
- Display modes (Slideshow, Live Collage)
- **Subscription system with plans, credits, and billing**

## Subscription & Billing System (NEW)

### Plans
| Plan | Price | Credits/Month | Features |
|------|-------|---------------|----------|
| Free | ₱0 | 1 demo gallery | All features for 6 hours, then view-only |
| Standard | ₱1,000/mo | 2 | Standard features |
| Pro | ₱1,500/mo | 2 | Standard + Pro features |

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
1. User submits payment proof (screenshot)
2. Admin reviews and approves/rejects
3. Downloads locked while payment pending
4. Approved = downloads unlocked

## Technical Implementation

### Database Schema Updates
```javascript
// User subscription fields
{
  plan: "free" | "standard" | "pro",
  billing_cycle_start: ISO date,
  event_credits: number,
  extra_credits: number,
  payment_status: "none" | "pending" | "approved",
  payment_proof_url: string,
  override_mode: "founders_circle" | "early_partner_beta" | "comped_pro" | "comped_standard" | null,
  override_expires: ISO date,
  override_reason: string
}

// Gallery fields
{
  is_demo: boolean,
  demo_features_expire: ISO date,
  edit_lock_date: ISO date (7 days after creation)
}

// Billing settings (site_config)
{
  billing_enforcement_enabled: boolean,
  pricing: { standard_monthly, pro_monthly, extra_credit }
}
```

### API Endpoints
- `GET /api/billing/pricing` - Public pricing
- `GET /api/billing/settings` - Admin: billing config
- `PUT /api/billing/settings` - Admin: update billing
- `GET /api/user/subscription` - User's subscription info
- `POST /api/user/payment-proof` - Submit payment screenshot
- `GET /api/admin/pending-payments` - Pending approvals
- `POST /api/admin/approve-payment` - Approve payment
- `POST /api/admin/reject-payment` - Reject payment
- `POST /api/admin/assign-override` - Assign override mode
- `POST /api/admin/remove-override` - Remove override
- `PUT /api/admin/users/{id}/plan` - Change user plan

### Admin Panel Updates
- **Billing tab**: Mode toggle, pricing config, pending payments
- **Photographers tab**: Crown button for override mode assignment
- **Override modal**: Mode, duration (1-24 months), reason

## Current Founder
- Email: lessrealmoments@gmail.com
- Mode: Founders Circle
- Expires: January 2028
- Credits: Unlimited

## Completed This Session
1. ✅ Subscription data model
2. ✅ Credit system (consume on gallery create)
3. ✅ Override modes (4 types)
4. ✅ Payment proof submission flow
5. ✅ Admin billing tab
6. ✅ Admin override assignment modal
7. ✅ Pricing configuration
8. ✅ Billing mode toggle (manual/live)

## Next Steps
- [ ] User dashboard: show plan, credits, payment status
- [ ] Payment proof upload UI for users
- [ ] Demo gallery 6-hour timer display
- [ ] Edit lock warning in gallery detail
- [ ] Download gate UI when payment pending
- [ ] GCash/PayMaya integration (when ready)

## Access URLs
- Preview: https://eventphoto-share.preview.emergentagent.com
- Admin: /admin
- Billing API: /api/billing/*
