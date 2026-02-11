# Payment & Subscription System Audit Report

## Executive Summary

Your system uses a **3-tier authority hierarchy** for determining user features:
1. **Admin Override Mode** (Highest) - founders_circle, early_partner_beta, etc.
2. **Payment Plan** - free, standard, pro
3. **Payment Status** - none, pending, approved

---

## Current System Analysis

### Authority Hierarchy (Working Correctly ✅)

```
Admin Override Mode (if active & not expired)
    ↓ (fallback if expired)
Payment Plan (free/standard/pro)
    ↓ (modified by)
Payment Status (billing enforcement)
```

### Plans & Features Matrix

| Feature | Free | Standard | Pro | Founders |
|---------|------|----------|-----|----------|
| QR Code | ✅ | ✅ | ✅ | ✅ |
| Share Link | ✅ | ✅ | ✅ | ✅ |
| Public Gallery | ✅ | ✅ | ✅ | ✅ |
| Display Mode (Slideshow/Collage) | ✅* | ❌ | ✅ | ✅ |
| Contributor Links | ✅* | ❌ | ✅ | ✅ |
| Storage per Gallery | 1GB | 10GB | 20GB | Unlimited |
| Gallery Expiration | 6 hours | 90 days | 180 days | Never |
| Event Credits | 0 | 2/month | 2/month | Unlimited |

*Free plan gets these for demo gallery (6-hour window only)

---

## 🔴 ISSUES FOUND

### Issue 1: No Automatic Downgrade When Subscription Expires

**Problem:** When a Pro user's subscription expires, there's no mechanism to:
- Automatically downgrade them to Free plan
- Disable Pro features
- Reset their `payment_status` to `none`

**Current Behavior:**
- `is_subscription_active()` returns `false` if expired
- BUT the user's `plan` field stays as `pro`
- Features continue to work based on `plan` field, not subscription status

**Impact:** Users can continue using Pro features after their subscription expires.

**Location:** `resolve_user_features()` at line 1605

**Fix Needed:**
```python
# In resolve_user_features(), after override check:
if plan != PLAN_FREE:
    subscription_active = await is_subscription_active(user)
    if not subscription_active:
        # Downgrade to free
        plan = PLAN_FREE
        result["effective_plan"] = PLAN_FREE
        # Also update in database
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"plan": PLAN_FREE, "payment_status": PAYMENT_NONE}}
        )
```

---

### Issue 2: Billing Enforcement Not Applied to Feature Checks

**Problem:** The `billing_enabled` flag only affects `can_download` in `resolve_user_features()`, but doesn't affect feature access.

**Current Behavior:**
```python
# Line 1690-1695
if billing_enabled and plan != PLAN_FREE:
    if payment_status == PAYMENT_PENDING:
        result["can_download"] = False
        result["payment_required"] = True
```

**Impact:** Even if billing is enabled and payment is pending, users can still:
- Create galleries
- Use display modes
- Generate contributor links

**Fix Needed:** Feature enforcement should also check billing status.

---

### Issue 3: Gallery Auto-Delete Doesn't Consider Account Status

**Problem:** `auto_delete_expired_galleries()` only checks `auto_delete_date` on the gallery itself. It doesn't verify if the owning account's subscription has expired.

**Current Behavior:**
- Gallery with `auto_delete_date` in 180 days will survive even if owner's subscription expired after 30 days

**Recommendation:** Consider adding subscription-based gallery enforcement (galleries become read-only or are archived when subscription expires).

---

### Issue 4: Credits Don't Reset When Subscription Lapses ✅ FIXED

**Problem:** The `reset_user_credits_if_needed()` function doesn't handle expired subscriptions.

**Your Actual System (Clarified):**
1. **Subscription Tokens (`subscription_tokens`)**: Reset to 0 when subscription expires (unused tokens lost)
2. **Add-on Tokens (`addon_tokens`)**: Valid for 12 months from purchase date, survive subscription expiry
3. User can still create galleries with addon tokens even after subscription expires
4. BUT Pro features (display_mode, contributor_links) remain disabled

**Fix Applied:**
- When subscription expires:
  - `subscription_tokens` → effectively 0 (monthly tokens lost)
  - `addon_tokens` → preserved until their 12-month expiry
  - `effective_plan` → "free" (Pro features disabled)
  - User can still create galleries if they have addon_tokens

---

### Issue 5: Override Expiry Doesn't Trigger Cleanup

**Problem:** When an override (founders_circle, etc.) expires, the system only checks if it's expired but doesn't:
- Notify the user
- Reset their plan to default
- Update their `payment_status`

**Current Behavior:**
```python
# Line 1643
if datetime.now(timezone.utc) < expires_dt:
    # Override active
else:
    pass  # Just falls through to payment plan check
```

**Recommendation:** Add a background task to handle override expirations.

---

## What Currently WORKS Well ✅

1. **Authority Hierarchy** - Override modes correctly take precedence
2. **Feature Toggle System** - Admin can control features per plan via site_config
3. **Auto-Delete Task** - Properly deletes expired galleries and frees storage
4. **Storage Quota** - Correctly tracked per user
5. **Demo Gallery Expiration** - 6-hour window enforced for free users
6. **Gallery Edit Lock** - 7-day edit window after creation

---

## What Happens When Account Expires (Current vs Expected)

### Current Behavior:
| Action | What Happens Now |
|--------|------------------|
| Pro user subscription expires | Plan stays "pro", features continue |
| Override mode expires | Falls back to payment plan |
| User tries to create gallery | Allowed (if credits exist) |
| Existing galleries | Stay accessible |
| Download | Still works |
| Display mode/Contributor links | Still work |

### Expected Behavior:
| Action | What Should Happen |
|--------|---------------------|
| Pro user subscription expires | Plan → "free", Pro features disabled |
| Override mode expires | Plan → "free" or original paid plan |
| User tries to create gallery | Blocked (no credits) |
| Existing galleries | Read-only or archived |
| Download | Blocked or limited |
| Display mode/Contributor links | Disabled |

---

## Recommended Fixes (Priority Order)

### P0 - Critical (Implement ASAP)
1. **Add subscription expiry check** in `resolve_user_features()`
2. **Downgrade plan** when subscription expires
3. **Block gallery creation** when subscription expired

### P1 - Important
4. **Background task** to check expiring subscriptions daily
5. **Email notifications** for upcoming expiry (7 days, 3 days, expired)
6. **Mark galleries as "archived"** when owner subscription expires

### P2 - Nice to Have
7. **Grace period** (7 days) before fully disabling features
8. **Reactivation flow** for expired users
9. **Admin dashboard** showing expiring users

---

## Database Fields Reference

**User Document:**
```javascript
{
  plan: "free" | "standard" | "pro",
  payment_status: "none" | "pending" | "approved",
  subscription_expires: "2026-03-11T00:00:00+00:00",  // ISO string
  override_mode: "founders_circle" | null,
  override_expires: "2027-02-03T14:21:40+00:00",
  subscription_tokens: 2,
  addon_tokens: 0,
  billing_cycle_start: "2026-02-11T00:00:00+00:00"
}
```

**Gallery Document:**
```javascript
{
  auto_delete_date: "2026-08-11T00:00:00+00:00",  // 180 days from creation
  download_locked_until_payment: false
}
```
