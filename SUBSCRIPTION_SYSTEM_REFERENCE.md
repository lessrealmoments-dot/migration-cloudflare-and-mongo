# EventsGallery Subscription & Grandfathering System

> **Last Updated:** February 2026
> **Purpose:** Reference document for understanding how subscriptions, tokens, and gallery access work.

---

## 📊 Token System

### Token Types

| Token Type | Field Name | Description | Expiration |
|------------|------------|-------------|------------|
| **Subscription Tokens** | `subscription_tokens` | 2 free tokens from monthly subscription (Standard or Pro) | Lost when subscription expires |
| **Add-on Tokens** | `addon_tokens` | Purchased separately (₱500 each) | 12 months from purchase date |

### Old Field Names (Backward Compatible)
The code reads from both old and new field names for backward compatibility:
- `event_credits` → now `subscription_tokens`
- `extra_credits` → now `addon_tokens`
- `extra_credits_purchased_at` → now `addon_tokens_purchased_at`

### Token Behavior on Subscription Expiry

```
SUBSCRIPTION ACTIVE:
├── subscription_tokens: 2 (available)
├── addon_tokens: 3 (available)
└── total_credits: 5

SUBSCRIPTION EXPIRED:
├── subscription_tokens: 0 (LOST)
├── addon_tokens: 3 (preserved until their own 12-month expiry)
└── total_credits: 3
```

---

## 🏛️ Grandfathering Rules

### Grace Period Constants
Located in `/app/backend/server.py`:
```python
UPLOAD_GRACE_PERIOD_DAYS = 60   # 2 months
VIEW_GRACE_PERIOD_DAYS = 180    # 6 months
```

### Timeline When Subscription Expires

| Phase | Duration | Guest Upload | Contributor Upload | Owner Upload | Create New Contributor Links | View Gallery | Download |
|-------|----------|--------------|-------------------|--------------|------------------------------|--------------|----------|
| **Active** | Subscription valid | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Grace Period 1** | Day 1-60 | ✅ | ✅ (existing links) | ✅ | ❌ | ✅ | ✅ |
| **Grace Period 2** | Day 61-180 | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Expired** | After Day 180 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Key Rules

1. **Galleries created BEFORE subscription expired** = Grandfathered (get grace periods)
2. **Galleries created AFTER subscription expired** = No grace period
3. **Existing contributor links** continue to work during Grace Period 1
4. **Cannot create NEW contributor links** once subscription expires
5. **Add-on tokens** can still be used to create NEW galleries (but with Free plan features)

---

## 🔐 Authority Hierarchy

The system checks features in this order (highest to lowest priority):

```
1. Admin Override Mode (founders_circle, early_partner_beta, etc.)
   ↓ (if not active or expired)
2. Payment Plan (free, standard, pro)
   ↓ (modified by)
3. Payment Status (billing enforcement)
```

### Override Modes
| Mode | Description | Features |
|------|-------------|----------|
| `founders_circle` | Founding members | Unlimited everything |
| `early_partner_beta` | Early beta partners | Full Pro features |
| `promo_code` | Promotional access | Varies |

---

## 📁 Key Code Locations

### Backend (`/app/backend/server.py`)

| Function | Line ~Range | Purpose |
|----------|-------------|---------|
| `resolve_user_features()` | 1607-1765 | Main feature resolution logic |
| `check_subscription_grace_periods()` | 1767-1875 | Grace period calculations |
| `is_subscription_active()` | 2211-2240 | Check if subscription is valid |
| `generate_contributor_link()` | 5968-6000 | Blocks when subscription expired |
| `upload_contributor_photo()` | 6600-6750 | Checks grace period before upload |
| `upload_photo_guest()` | 7872-8000 | Checks grace period for guest uploads |
| `get_public_gallery()` | 7602-7735 | Checks view grace period |

### Models (`/app/backend/models/`)

| File | Purpose |
|------|---------|
| `user.py` | User model with `subscription_tokens`, `addon_tokens` fields |
| `billing.py` | Billing-related models |

### Frontend (`/app/frontend/src/pages/`)

| File | Purpose |
|------|---------|
| `Dashboard.jsx` | Displays subscription status and tokens |
| `AdminDashboard.jsx` | Admin view of user subscriptions |

---

## 🔄 API Response Examples

### `/api/user/subscription` Response

```json
{
  "plan": "pro",
  "effective_plan": "free",          // Downgraded due to expiry
  "subscription_expired": true,
  "subscription_expires": "2026-01-15T00:00:00+00:00",
  
  "subscription_tokens": 0,          // Lost (was 2)
  "addon_tokens": 3,                 // Preserved
  "addon_tokens_expires_at": "2027-02-11T...",
  "total_credits": 3,
  
  "features_enabled": {
    "display_mode": false,           // Pro feature disabled
    "collaboration_link": false,     // Pro feature disabled
    "qr_code": true,
    "view_public_gallery": true
  },
  
  "grace_period_settings": {
    "upload_grace_days": 60,
    "view_grace_days": 180
  }
}
```

### `check_subscription_grace_periods()` Response

```json
{
  "subscription_expired": true,
  "subscription_expired_at": "2026-01-15T00:00:00+00:00",
  "in_upload_grace_period": true,    // Within 60 days
  "in_view_grace_period": true,      // Within 180 days
  "uploads_allowed": true,
  "viewing_allowed": true,
  "can_create_new_contributor_links": false,
  "existing_contributor_links_work": true,
  "days_until_upload_disabled": 45,
  "days_until_view_disabled": 165
}
```

---

## 🛡️ Feature Enforcement Matrix

| Feature | Free | Standard | Pro | Founders |
|---------|------|----------|-----|----------|
| QR Code | ✅ | ✅ | ✅ | ✅ |
| Share Link | ✅ | ✅ | ✅ | ✅ |
| Public Gallery | ✅ | ✅ | ✅ | ✅ |
| Display Mode (Slideshow/Collage) | ❌ | ❌ | ✅ | ✅ |
| Contributor Links | ❌ | ❌ | ✅ | ✅ |
| Storage per Gallery | 1GB | 10GB | 20GB | Unlimited |
| Gallery Expiration | 6 hours | 90 days | 180 days | Never |
| Monthly Tokens | 0 | 2 | 2 | Unlimited |

---

## 🧪 Testing Scenarios

### Scenario 1: Pro User Subscription Expires
1. User has Pro plan, 2 subscription tokens, 3 addon tokens
2. Subscription expires
3. Expected:
   - `subscription_tokens` = 0
   - `addon_tokens` = 3
   - `effective_plan` = "free"
   - Can create gallery with addon tokens (Free features only)
   - Existing galleries: uploads allowed for 60 days

### Scenario 2: Contributor Tries to Upload After 60 Days
1. Photographer subscription expired 70 days ago
2. Contributor visits existing link
3. Expected: HTTP 403 "The photographer's subscription has expired and the upload grace period has ended"

### Scenario 3: Guest Views Gallery After 180 Days
1. Photographer subscription expired 200 days ago
2. Guest visits public gallery
3. Expected: HTTP 403 "This gallery is no longer available. The viewing period has expired."

---

## 📝 Database Fields Reference

### User Document
```javascript
{
  "id": "uuid",
  "plan": "free" | "standard" | "pro",
  "payment_status": "none" | "pending" | "approved",
  "subscription_expires": "2026-03-11T00:00:00+00:00",  // ISO string
  "subscription_tokens": 2,          // Monthly tokens
  "addon_tokens": 0,                 // Purchased tokens
  "addon_tokens_purchased_at": null, // When purchased
  "override_mode": null,             // founders_circle, etc.
  "override_expires": null,
  "billing_cycle_start": "2026-02-11T00:00:00+00:00"
}
```

### Gallery Document
```javascript
{
  "id": "uuid",
  "photographer_id": "user_uuid",
  "created_at": "2026-02-11T00:00:00+00:00",
  "auto_delete_date": "2026-08-11T00:00:00+00:00",
  "sections": [
    {
      "id": "section_uuid",
      "contributor_link": "abc123",
      "contributor_enabled": true
    }
  ]
}
```

---

## 🚨 Common Issues & Solutions

### Issue: User sees "effective_plan: free" but has Pro
**Cause:** Subscription has expired
**Solution:** Check `subscription_expires` date, renew subscription

### Issue: Contributor can't upload but link exists
**Cause:** Upload grace period (60 days) has passed
**Solution:** Photographer needs to renew subscription

### Issue: Gallery shows "no longer available"
**Cause:** View grace period (180 days) has passed
**Solution:** Photographer needs to renew and galleries may need manual restore

---

## 📞 Deployment Commands

```bash
cd /root/eventsgallery
git pull origin main
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml build --no-cache backend
docker compose -f docker-compose.prod.yml up -d
```

Check backend logs:
```bash
docker logs eventsgallery-backend --tail 100
```
