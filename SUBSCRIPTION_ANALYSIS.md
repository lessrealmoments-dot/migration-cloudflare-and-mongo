# Subscription Downgrade/Expiration Behavior Analysis

## Current System Behavior

### Scenario 1: Pro → Didn't Renew → Now Free

**What happens to EXISTING galleries?**

| Aspect | Behavior | Reason |
|--------|----------|--------|
| **Gallery Visibility** | ✅ Still visible in dashboard | Gallery ownership unchanged |
| **Gallery Access (Public)** | ✅ Guests can still view | `share_link` still valid until `auto_delete_date` |
| **Gallery Storage Quota** | ⚠️ UNCHANGED at 20GB | Quota set at creation, NOT recalculated |
| **Auto-Delete Date** | ⚠️ UNCHANGED | Set at creation based on Pro plan (6 months) |
| **Owner Can Upload** | ❌ BLOCKED | `is_subscription_active()` returns FALSE |
| **Guest Upload** | ✅ STILL WORKS | Does NOT check owner's subscription |
| **Contributor Upload** | ✅ STILL WORKS | Does NOT check owner's subscription |
| **Display Mode** | ❓ May still work | Feature check varies by endpoint |
| **Create NEW Gallery** | ❌ BLOCKED | Requires active subscription + credits |

### Scenario 2: Pro (20GB gallery) → Standard (10GB plan)

**What happens to the 20GB gallery?**

| Aspect | Behavior | Risk Level |
|--------|----------|------------|
| **Gallery Storage Quota** | ⚠️ STAYS at 20GB | Quota is NOT downgraded |
| **Can Upload to 20GB** | ✅ YES | Checks `gallery.storage_quota`, not plan |
| **NEW galleries** | 10GB quota | New galleries get Standard quota |

**This is a potential LOOPHOLE:**
- User creates gallery on Pro (20GB)
- Downgrades to Standard
- Can still upload 20GB to that gallery!

### Scenario 3: Guest Upload on Expired Account

**Current Behavior:**
```
Guest Upload Flow:
1. Find gallery by share_link ✅
2. Check gallery password ✅
3. Check guest_upload_expiration_date ✅
4. Check gallery storage quota ✅
5. ❌ Does NOT check owner's subscription status
```

**Result:** Guests CAN upload even if photographer's account is expired.

---

## Summary of Issues Found

| Issue | Severity | Description |
|-------|----------|-------------|
| **Gallery quota not downgraded** | 🟡 MEDIUM | Pro galleries keep 20GB even after downgrade to Standard |
| **Guest uploads ignore subscription** | 🟡 MEDIUM | Guests can upload to galleries of expired accounts |
| **Contributor uploads ignore subscription** | 🟡 MEDIUM | Contributors can upload to galleries of expired accounts |
| **No subscription enforcement on public access** | 🟢 LOW | By design - galleries should remain viewable |

---

## Recommended Fixes

### Option A: Strict Enforcement (Recommended)
1. **Recalculate gallery quotas on plan change**
2. **Block guest/contributor uploads if owner subscription expired**
3. **Grace period of 7 days after expiration**

### Option B: Soft Enforcement
1. **Keep existing galleries as-is** (grandfathered)
2. **Only enforce new quotas on NEW galleries**
3. **Allow guest uploads but show warning**

### Option C: Current + Small Fix
1. **Keep gallery quotas unchanged** (user paid for it when created)
2. **Block guest/contributor uploads if owner expired** (prevent abuse)
3. **Send email reminders before expiration**

---

## Code Locations to Fix

1. **Guest upload subscription check:**
   - File: `/app/backend/server.py`
   - Function: `upload_photo_guest()` (line ~7500)
   - Add: Check photographer's subscription status

2. **Contributor upload subscription check:**
   - File: `/app/backend/server.py`
   - Function: `upload_contributor_photo()` (line ~6200)
   - Add: Check photographer's subscription status

3. **Plan change quota recalculation:**
   - File: `/app/backend/server.py`
   - Function: `approve_payment()` or `change_client_plan()`
   - Add: Recalculate all user's gallery quotas

