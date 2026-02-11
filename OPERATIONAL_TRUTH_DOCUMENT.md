# EventsGallery.vip — Operational Truth Document
## Technical Product Analysis for Business Strategy

**Document Version:** 1.0  
**Generated:** February 2026  
**Purpose:** Enable business/strategy advisor to understand all operational mechanics without code access  
**Accuracy Guarantee:** This document reflects implemented behavior. Inaccuracies may cause financial miscalculation.

---

# SECTION 1: SYSTEM ARCHITECTURE

## 1.1 Technology Overview

The platform is a three-tier web application:

**Frontend:** React.js single-page application served via Nginx. All user interaction happens here. The frontend makes API calls to the backend and does NOT independently enforce business rules—it reflects backend decisions.

**Backend:** Python FastAPI application running on Uvicorn. This is the single source of truth for all business logic, permissions, and enforcement. Every action (create gallery, upload photo, download file) passes through the backend for authorization.

**Database:** MongoDB Atlas (cloud-hosted). Stores all user data, gallery metadata, photo references, transactions, and configuration. The backend performs all queries.

**File Storage:** Cloudflare R2 (S3-compatible object storage). All photos, thumbnails, payment proof images, and QR codes are stored here. Files are served via CDN at `cdn.eventsgallery.vip`. The backend manages upload/delete operations.

**Deployment:** Self-hosted on Hostinger KVM VPS running Docker containers. User deploys via Git pull and Docker Compose rebuild.

## 1.2 Permission Checking Model

**All permissions are checked LIVE at the backend on every request.**

There is no caching of user plans, credits, or subscription status. When a user attempts any action:
1. Backend retrieves current user document from MongoDB
2. Backend calculates effective permissions based on current state
3. Backend either allows or denies the action

This means:
- If admin changes a user's plan, the change takes effect on the user's very next API call
- If a subscription expires mid-session, the next action will be denied
- There are no "cached" permissions that could be stale

The frontend may display stale information until it refetches, but the backend is always authoritative.

---

# SECTION 2: USER TYPES AND ROLES

## 2.1 User Type: Photographer (Authenticated Account)

A photographer is any person who creates an account on the platform. They are the **gallery owners**.

**How they authenticate:** Email + password login. JWT tokens stored in browser localStorage.

**What they own:** All galleries they create. Ownership is tracked via `photographer_id` field on each gallery document.

**What determines their capabilities:** Their subscription plan, override mode (if any), payment status, and credit balance—all stored in their user document.

## 2.2 User Type: Guest (Unauthenticated Public Visitor)

A guest is anyone who visits a gallery via its public share link (`/gallery/{share_link}`).

**How they access:** No authentication. They simply visit the URL.

**What they can do:**
- View gallery photos and videos
- Download individual photos (if not password-protected)
- Download all photos (if they provide the download password, if one is set)
- Upload photos to the gallery (if guest upload is enabled and within the guest upload window)

**What limits them:**
- Gallery password (optional—restricts viewing entirely)
- Download password (optional—restricts bulk downloads)
- Guest upload expiration window (time-limited)
- Gallery expiration (if share link has expired, they see an "expired" notice)

## 2.3 User Type: Contributor (Unauthenticated via Special Link)

A contributor is a third-party (second shooter, videographer, external service) who uploads content via a contributor link.

**How they access:** A unique URL generated per gallery section: `/contributor/{contributor_link}`

**What they can do:**
- Upload photos to their designated section
- Set their name/company name for attribution
- For video sections: paste YouTube URLs
- For Google Drive sections: paste folder links
- For pCloud sections: paste pCloud codes
- For Fotoshare sections: paste Fotoshare URLs

**What limits them:**
- The contributor link must be active (not revoked by owner)
- The section must have `contributor_enabled: true`
- **There is NO time-based expiration on contributor links.** They remain valid until the gallery owner explicitly revokes them or the gallery is deleted.

## 2.4 User Type: Admin (Platform Administrator)

A single admin account exists, authenticated separately via `/admin/login`.

**How they authenticate:** Username + password (hardcoded: `admin`). Credentials stored in environment variables.

**What they can do:**
- View and manage all photographers
- Approve/reject payment proofs
- Assign or remove override modes
- Change any user's plan directly
- Add credits to any user
- Extend subscriptions
- Reset passwords
- View all transactions
- Configure global billing settings
- Configure feature toggles per plan
- Delete photographers and all their data

**What they cannot do:**
- There is no multi-admin system
- Admin cannot impersonate users
- Admin actions are logged to activity_logs collection

---

# SECTION 3: GALLERY LIFECYCLE

## 3.1 Gallery Creation

When a photographer clicks "Create Gallery":

1. **Credit Check:** Backend checks if user has available credits (`event_credits + extra_credits > 0`) OR has `unlimited_token` enabled via override mode.

2. **Credit Deduction Order:**
   - IF `extra_credits > 0`: Deduct 1 from `extra_credits`
   - ELSE IF `event_credits > 0`: Deduct 1 from `event_credits`
   - This means **extra credits (purchased) are consumed FIRST**, preserving monthly allocation.

3. **Special Case — Pending Payment:**
   - If `credits_available = 0` AND `payment_status = "pending"`, gallery creation IS ALLOWED
   - However, `download_locked_until_payment` flag is set to TRUE on the gallery
   - This prevents guests from downloading until payment is approved

4. **Special Case — Free Plan (Demo):**
   - Free users do NOT use credits
   - They get exactly ONE demo gallery
   - If they already have a demo gallery, creation is blocked
   - Demo galleries expire in 6 hours (auto-deleted)

5. **Gallery Document Created:**
   - `id`: UUID
   - `photographer_id`: Owner's user ID
   - `share_link`: Random 8-character string
   - `created_at`: Current timestamp
   - `auto_delete_date`: Calculated expiration (see Section 3.2)
   - `is_demo`: TRUE if free user
   - `download_locked_until_payment`: TRUE if created with pending payment

## 3.2 Key Dates on a Gallery

| Field | What It Controls | How It's Set |
|-------|------------------|--------------|
| `created_at` | Edit lock deadline (7 days from this) | Set at creation, immutable |
| `event_date` | Guest upload deadline (N days from this) | Set by owner, can be edited within 7 days |
| `guest_upload_expiration_date` | When guest uploads stop | `event_date + guest_upload_enabled_days` |
| `share_link_expiration_date` | When public link stops working | `created_at + share_link_expiration_days` (optional) |
| `auto_delete_date` | When gallery is permanently deleted | Based on plan settings |

## 3.3 Edit Lock (7-Day Rule)

**What it is:** After 7 days from `created_at`, certain gallery fields cannot be modified.

**Locked fields:**
- `title`
- `description`
- `event_title`
- `event_date`
- `theme`

**Not locked (can always be changed):**
- Photos (add, delete, reorder, hide, flag)
- Sections (add, delete, rename)
- Passwords (gallery password, download password)
- Cover photo

**Why it exists:** Prevents "gallery reuse" where a photographer creates one gallery, shares it for Event A, then edits it for Event B without using another credit.

**Can admin unlock?** There is NO admin override for this. The 7-day lock is absolute based on `created_at`.

**Can owner reset by modifying event_date?** No. The lock is based on `created_at`, not `event_date`. Changing `event_date` only affects guest upload window.

## 3.4 Guest Upload Window

**How it's calculated:** `event_date + guest_upload_enabled_days`

**Default:** `guest_upload_enabled_days = 7` (set during gallery creation)

**What happens when window passes:**
- Frontend hides the "Upload Photo" button
- Backend returns `guest_upload_enabled: false` in public gallery response
- Backend REJECTS any upload attempt after the deadline

**What controls it:**
- The `guest_upload_expiration_date` field on the gallery
- This is recalculated if owner changes `event_date` (within 7-day edit window)

**Can window be reopened?**
- YES, if owner changes `event_date` to a future date (within 7-day edit window)
- NO, after 7-day edit lock, `event_date` cannot be changed

**Does subscription status affect it?** No. Guest upload window is purely date-based. Even if owner's subscription expires, existing guest upload windows remain active until their expiration date.

## 3.5 Share Link Expiration

**What it is:** Optional setting that makes the public gallery URL stop working after N days.

**How it's set:** `share_link_expiration_days` parameter during gallery creation or update.

**What happens when expired:**
- Frontend shows "This gallery has expired" message
- Guests cannot view photos
- Guests cannot download
- Guests cannot upload

**Different from auto-delete:** Share link expiration makes gallery INVISIBLE to public but does NOT delete it. Owner can still see and manage it. Auto-delete PERMANENTLY REMOVES the gallery.

## 3.6 Auto-Delete (Retention Expiration)

**What it is:** Galleries are automatically and permanently deleted after their `auto_delete_date`.

**How `auto_delete_date` is set:**

| Plan/Mode | Expiration |
|-----------|------------|
| Free (Demo) | 6 hours from creation |
| Standard | 6 months from creation (configurable) |
| Pro | 6 months from creation (configurable) |
| Founders Circle | 36,500 days (~100 years) |
| Enterprise Access | 36,500 days (~100 years) |
| Comped Pro | Uses mode-specific `gallery_expiration_days` setting |
| Comped Standard | Uses mode-specific `gallery_expiration_days` setting |

**What happens at auto-delete:**
1. Background task runs periodically (checks every hour)
2. Finds galleries where `auto_delete_date < now`
3. For each expired gallery:
   - Deletes all photos from R2 storage
   - Deletes all photo records from database
   - Deletes gallery document
   - Updates owner's `storage_used` to reflect freed space
   - Logs the deletion

**Can owner prevent auto-delete?** No. There is no UI or mechanism to extend or disable auto-delete.

**Can admin prevent auto-delete?** Not directly. Admin could:
- Assign an override mode with longer expiration
- This would affect NEW galleries only, not existing ones

**Can subscription renewal extend existing galleries?** NO. The `auto_delete_date` is set at creation and is IMMUTABLE. Renewing subscription does not change existing galleries' expiration dates.

## 3.7 Gallery States Summary

A gallery can be in multiple states simultaneously:

| State | How Determined | Effect |
|-------|----------------|--------|
| **Active** | `auto_delete_date > now` | Normal operation |
| **Share Link Expired** | `share_link_expiration_date < now` | Public cannot view |
| **Edit Locked** | `created_at + 7 days < now` | Core fields immutable |
| **Guest Upload Closed** | `guest_upload_expiration_date < now` | No guest uploads |
| **Download Locked** | `download_locked_until_payment = true` | Guests cannot download |
| **Deleted** | Background task runs | Gallery permanently gone |

---

# SECTION 4: COLLABORATOR/CONTRIBUTOR SYSTEM

## 4.1 How Contributor Links Work

Each gallery section can have its own contributor link. This is a PRO-only feature (part of `contributor_link` feature toggle).

**Creating a contributor link:**
1. Owner navigates to section settings
2. Clicks "Generate Contributor Link"
3. Backend creates random `contributor_link` token (16-char URL-safe)
4. Token stored on the section: `sections[i].contributor_link`
5. Owner shares URL: `/contributor/{contributor_link}`

**What contributor can do at that URL:**
- See gallery title and section name
- Set their company/name (stored as `contributor_name` on section)
- Upload photos (for photo sections)
- Paste YouTube URLs (for video sections)
- Paste Google Drive folder IDs (for gdrive sections)
- Paste pCloud codes (for pcloud sections)
- Paste Fotoshare URLs (for fotoshare sections)

## 4.2 Contributor Link Lifetime

**When link becomes invalid:**
- Owner explicitly revokes it (sets `contributor_link: null`)
- Gallery is deleted
- Section is deleted

**What does NOT invalidate the link:**
- Owner's subscription expiring
- Time passing (no automatic expiration)
- Gallery edit lock (7 days)

**Critical implication:** If a photographer's subscription expires, existing contributor links REMAIN VALID. Contributors can continue uploading to those sections indefinitely.

**Is this intentional?** Unknown. This may be an oversight or intentional to not disrupt ongoing collaborations.

## 4.3 Subscription Expiration Mid-Collaboration

**Scenario:** Photographer has active Pro plan. Creates gallery with contributor link. Shares link with videographer. Subscription expires before videographer finishes uploading.

**What happens:**
- Contributor link remains valid
- Videographer can continue uploading
- Photographer's dashboard may show expired/downgraded features
- Photos uploaded by contributor still consume photographer's storage quota
- Gallery remains accessible until its `auto_delete_date`

**What photographer loses:**
- Ability to create NEW contributor links (feature gated behind Pro)
- Ability to access Display Mode
- Other Pro-only features

**What is NOT affected:**
- Existing galleries remain unchanged
- Existing contributor links remain active
- Existing photos remain accessible

---

# SECTION 5: CREDIT SYSTEM

## 5.1 Credit Types

| Credit Type | Source | Storage Field | Expiration |
|-------------|--------|---------------|------------|
| **Event Credits** | Monthly subscription allocation | `user.event_credits` | Reset each billing cycle (NOT rolled over) |
| **Extra Credits** | Purchased separately | `user.extra_credits` | 12 months from `extra_credits_purchased_at` |

## 5.2 How Credits Are Deducted

When creating a gallery (non-demo):

```
if user.extra_credits > 0:
    deduct from extra_credits
else if user.event_credits > 0:
    deduct from event_credits
else:
    BLOCK gallery creation (unless payment_pending allows it)
```

**Key implication:** Extra credits are ALWAYS consumed first. This preserves monthly event credits for later in the billing cycle.

## 5.3 Credit Refunds

**Credits are NEVER refunded.**

If a photographer:
- Deletes a gallery: Credit NOT returned
- Gallery expires: Credit NOT returned
- Subscription downgrades: Credits NOT returned

## 5.4 Credits with Inactive Subscription

**Scenario:** User has 3 extra credits. Subscription expires. What happens?

**Answer:** The extra credits remain in the account. However:
- User cannot CREATE new galleries (no active subscription)
- User MAY still have access if they have an override mode
- Credits do not disappear upon subscription expiration
- If user resubscribes, credits are still there

**Edge case:** If `extra_credits_expires_at` passes while subscription is inactive, extra credits expire per their own 12-month timer.

## 5.5 Monthly Credit Reset

**When does it happen?** At the start of each billing cycle (30 days from `billing_cycle_start`).

**How are credits reset?**
```
event_credits = PLAN_CREDITS[plan]  // 0 for free, 2 for standard, 2 for pro
```

**What about unused credits?** They are LOST. No rollover.

**What triggers reset?** This is NOT automatic. Reset occurs when:
- Admin approves a payment/renewal
- The reset logic runs as part of payment approval

**Important:** There is NO automatic recurring billing. All renewals are manual (admin-approved payments). If user forgets to pay and admin doesn't process renewal, credits are NOT automatically reset.

## 5.6 Override Mode Credits

| Override Mode | Credits |
|---------------|---------|
| Founders Circle | 999 (unlimited_token = true) |
| Enterprise Access | 999 (unlimited_token = true) |
| Early Partner Beta | 2/month |
| Comped Pro | 2/month |
| Comped Standard | 2/month |

For modes with `unlimited_token = true`:
- Credit check is bypassed entirely
- No deduction occurs during gallery creation
- User shows 999 credits in UI

---

# SECTION 6: SUBSCRIPTION MECHANICS

## 6.1 Subscription Data Model

Subscription state is stored on the USER document (not a separate subscription collection):

| Field | Purpose |
|-------|---------|
| `plan` | Current plan: "free", "standard", "pro" |
| `payment_status` | "none", "pending", "approved" |
| `billing_cycle_start` | ISO timestamp when current cycle began |
| `subscription_expires` | ISO timestamp when subscription ends (optional) |
| `override_mode` | Special access mode (overrides plan) |
| `override_expires` | When override mode expires |
| `requested_plan` | Plan user is trying to upgrade to (pending approval) |

## 6.2 How Subscription Status Is Determined

On every request, backend calculates effective subscription:

1. **Check Override Mode First:**
   - If `override_mode` exists AND `override_expires > now`: Use override mode features
   - Override COMPLETELY replaces plan-based permissions

2. **If No Active Override:**
   - Use `plan` field directly
   - Check `payment_status` for download restrictions

3. **Billing Enforcement:**
   - Currently DISABLED globally (`billing_enforcement_enabled: false`)
   - When enabled: Users with `payment_status: pending` would have downloads blocked

## 6.3 What Subscription Expiration Affects

**When subscription "expires" (subscription_expires < now):**

Currently, `subscription_expires` is SET but NOT ENFORCED. The field exists in the database but the backend does not check it to restrict features.

**What IS enforced:**
- Override mode expiration (`override_expires`)
- Gallery auto-delete dates
- Guest upload windows

**What is NOT enforced:**
- Plan downgrade on expiration
- Automatic feature restriction on `subscription_expires`

This may be intentional (soft launch) or an implementation gap.

## 6.4 Payment Status Effects

| Status | Can Create Gallery | Can Download (Owner) | Guests Can Download |
|--------|-------------------|---------------------|---------------------|
| `none` | Yes (if credits) | Yes | Yes |
| `pending` | Yes (downloads locked) | Yes | NO (if billing enforcement ON) |
| `approved` | Yes (if credits) | Yes | Yes |

Note: Billing enforcement is currently OFF, so `pending` status has limited effect.

## 6.5 What Renewal Restores

When admin approves a renewal payment:

1. `payment_status` → "approved"
2. `billing_cycle_start` → now
3. `event_credits` → plan allocation (2 for standard/pro)
4. `plan` → requested plan (if upgrading)
5. `download_locked_until_payment` → FALSE on all user's galleries

**What renewal does NOT do:**
- Extend `auto_delete_date` on existing galleries
- Reopen guest upload windows
- Unlock edit-locked galleries
- Restore deleted galleries

---

# SECTION 7: STORAGE SYSTEM

## 7.1 Where Files Are Stored

**Primary Storage:** Cloudflare R2 bucket
- Endpoint: Configured via `R2_ENDPOINT_URL` environment variable
- CDN URL: `https://cdn.eventsgallery.vip`

**File Types Stored:**
- Original photos: `photos/{uuid}.{ext}`
- Small thumbnails: `photos/thumb_{uuid}_small.{ext}`
- Medium thumbnails: `photos/thumb_{uuid}_medium.{ext}`
- Payment proof images: `payment_proofs/{uuid}.{ext}`
- QR codes: `qrcodes/{uuid}.png`
- Video thumbnails: `thumbnails/video_{uuid}.{ext}`

**Local Fallback:** If R2 is unavailable, files fall back to `/app/uploads/`. This is stored on the VPS filesystem and is NOT persistent across container rebuilds (known issue—no Docker volume mount configured).

## 7.2 Storage Quota System

Each user has a storage quota tracked in their document:

| Field | Purpose |
|-------|---------|
| `storage_quota` | Maximum allowed bytes |
| `storage_used` | Current bytes used |
| `storage_quota_override` | Admin-set override (optional) |

**Default quotas:**
- Free: 500 MB
- Standard: 10 GB (configurable via global toggles)
- Pro: 10 GB (configurable via global toggles)
- Override modes: Per-mode configuration (Founders: unlimited)

## 7.3 How Storage Is Calculated

**On photo upload:**
- Backend reads file size
- Adds to `storage_used` on user document
- Does NOT check against quota before upload (no hard block)

**On photo deletion:**
- Backend subtracts file size from `storage_used`

**Is there a hard limit?** Currently, there is NO HARD ENFORCEMENT of storage quota. Users can exceed their quota. The quota is tracked but uploads are not blocked when exceeded.

**Per-gallery storage tracking?** No. Storage is tracked at the USER level only. There is no per-gallery breakdown.

## 7.4 Storage with Integration Sources

Photos from external sources (Google Drive, pCloud) do NOT count against storage quota because they are not stored in R2. Only metadata/references are stored in MongoDB.

| Source | Stored In | Counts Against Quota |
|--------|-----------|---------------------|
| Direct Upload | R2 | YES |
| Guest Upload | R2 | YES |
| Contributor Upload | R2 | YES |
| Google Drive | GDrive (external) | NO |
| pCloud | pCloud (external) | NO |
| YouTube | YouTube (external) | NO |
| Fotoshare | Fotoshare (external) | NO |

---

# SECTION 8: EXTERNAL INTEGRATIONS

## 8.1 Google Drive Integration

**Purpose:** Allow photographers to link existing Google Drive folders as gallery sections. Photos remain on Google Drive and are displayed via embed URLs.

**Data Flow:**
1. Owner creates "Google Drive" section in gallery
2. Owner or contributor pastes Google Drive folder ID
3. Backend calls Google Drive API to list photos in folder
4. Photo metadata stored in `gdrive_photos` collection
5. Frontend displays using Google's thumbnail/view URLs

**Auto-Sync:** Background task runs every 30 minutes to check for new photos in linked folders.

**Storage:** NO R2 storage used. Photos served directly from Google Drive CDN.

**Authentication:** OAuth flow for Google account. Tokens stored in `drive_credentials` collection.

## 8.2 pCloud Integration

**Purpose:** Similar to Google Drive—link external pCloud folders.

**Data Flow:**
1. Contributor receives pCloud upload request link
2. Contributor uploads to pCloud
3. Contributor pastes pCloud folder code
4. Backend fetches photo list via pCloud API
5. Metadata stored in `pcloud_photos` collection

**Auto-Sync:** Background task runs every 15 minutes.

**Storage:** NO R2 storage used.

## 8.3 YouTube Integration

**Purpose:** Embed YouTube videos in gallery video sections.

**Data Flow:**
1. Contributor pastes YouTube video URL
2. Backend extracts video ID
3. Video metadata stored in `gallery_videos` collection
4. Frontend embeds using YouTube iframe player

**Storage:** NO R2 storage used.

## 8.4 Fotoshare/360Glam Integration

**Purpose:** Embed videos from Fotoshare platform (common in Philippines wedding industry).

**Data Flow:**
1. Contributor pastes Fotoshare URL
2. Backend scrapes video metadata from Fotoshare page
3. Video info stored in `fotoshare_videos` collection
4. Frontend embeds using Fotoshare player

**Auto-Refresh:** Background task with adaptive refresh rate:
- Day 1: Every 10 minutes
- Day 2: Every hour
- Days 3-30: Every 24 hours
- After 30 days: Every 30 days

**Storage:** NO R2 storage used.

## 8.5 Resend (Email)

**Purpose:** Send transactional emails for notifications.

**Emails sent:**
- Admin: New account registered
- Admin: Payment proof submitted
- Customer: Payment submitted (awaiting approval)
- Customer: Payment approved
- Customer: Payment rejected

**Configuration:** API key via `RESEND_API_KEY` environment variable.

---

# SECTION 9: ADMIN CAPABILITIES AND LIMITS

## 9.1 What Admin CAN Force

| Action | Effect |
|--------|--------|
| Assign Override Mode | Immediately grants override-level features |
| Remove Override Mode | Immediately reverts to plan-based features |
| Change User Plan | Immediately changes plan (no payment required) |
| Add Credits | Immediately grants extra credits (free) |
| Extend Subscription | Sets future `subscription_expires` date |
| Approve Payment | Sets `payment_status: approved`, grants credits |
| Reject Payment | Sets `payment_status: none`, notifies user |
| Reset Password | Allows user to login with new password |
| Delete Photographer | Removes user and ALL their galleries/photos |

## 9.2 What Admin CANNOT Do

| Action | Why Not |
|--------|---------|
| Unlock edit-locked gallery | 7-day lock is based on `created_at`, which is immutable |
| Extend gallery auto-delete | `auto_delete_date` is set at creation, no update mechanism |
| Restore deleted gallery | Deletion is permanent, no soft-delete |
| Refund credits | No mechanism exists |
| Impersonate user | No impersonation feature |
| View user passwords | Passwords are hashed |
| Bulk operations | All admin actions are per-user/per-gallery |

## 9.3 Admin Action Logging

All admin actions are logged to `activity_logs` collection:

```json
{
  "action": "add_credits",
  "admin": "admin",
  "target_user": "user_uuid",
  "details": "Added 3 event credit(s) to user@email.com: Bonus",
  "timestamp": "2026-02-11T..."
}
```

---

# SECTION 10: EDGE CASES AND SCENARIOS

## 10.1 Subscription Expires Mid-Event

**Scenario:** Photographer creates gallery on Feb 1. Event is Feb 15. Subscription expires Feb 10.

**What happens:**
- Gallery remains accessible (until its `auto_delete_date`)
- Guest uploads work (until `guest_upload_expiration_date`)
- Contributor links work (no expiration tied to subscription)
- Photographer cannot create NEW galleries without renewing
- Downloads work (billing enforcement is currently OFF)

**Risk:** Photographer could theoretically keep using existing galleries indefinitely without paying.

## 10.2 Renewal After Gallery Auto-Delete

**Scenario:** User lets subscription lapse. Gallery auto-deletes. User later renews.

**What happens:**
- Deleted gallery is NOT restored (permanent deletion)
- User starts fresh with new galleries
- Old photos are gone forever

## 10.3 Existing Contributor Links with Inactive Account

**Scenario:** Photographer account is suspended/deleted. Contributor links exist.

**If account suspended:** Unknown behavior—suspension feature not fully implemented.

**If account deleted:**
- All galleries are deleted
- All photos are deleted from R2
- Contributor links become invalid (gallery doesn't exist)

## 10.4 Admin Extends Subscription Without Payment

**Scenario:** Admin uses "Extend Subscription" without user paying.

**What happens:**
- `subscription_expires` is extended
- No payment record created
- No credits granted (admin must separately add credits if needed)
- This is essentially a comp/gift

## 10.5 User Modifies Event Date During Upload Window

**Scenario:** Gallery created. Event date is Feb 15. Guest upload window is Feb 15-22. On Feb 20, owner changes event date to Feb 25.

**Can they do this?** Only if within 7-day edit window from gallery creation.

**If allowed:**
- `guest_upload_expiration_date` is recalculated: Feb 25 + 7 = Mar 4
- Upload window effectively extended

**Abuse potential:** User could repeatedly extend event date to keep guest upload window open.

**Mitigation:** 7-day edit lock prevents this after initial week.

---

# SECTION 11: NOTIFICATIONS AND REMINDERS

## 11.1 Automated Notifications

| Event | Recipient | Method | Timing |
|-------|-----------|--------|--------|
| New account created | Admin | Email | Immediate |
| Payment proof submitted | Admin | Email | Immediate |
| Payment submitted | Customer | Email | Immediate |
| Payment approved | Customer | Email | Immediate |
| Payment rejected | Customer | Email | Immediate |

## 11.2 What Is NOT Automated

| Event | Current State |
|-------|---------------|
| Subscription expiring soon | NO notification |
| Credits running low | NO notification |
| Gallery expiring soon | NO notification |
| Guest upload window closing | NO notification |
| Storage quota nearing limit | NO notification |

All billing is manual. User must remember to pay and admin must remember to process.

---

# SECTION 12: KNOWN WEAKNESSES AND TECHNICAL DEBT

## 12.1 Critical Business Risks

1. **No Subscription Expiration Enforcement:** The `subscription_expires` field is stored but not checked. Users could theoretically continue using service after "expiration."

2. **Contributor Links Never Expire:** Once created, contributor links are valid forever unless manually revoked. This could be exploited.

3. **No Storage Quota Enforcement:** Users can exceed storage quota. No hard limit prevents uploads.

4. **Manual Payment Processing:** All payments require admin approval. This doesn't scale and creates delays.

5. **No Automatic Credit Reset:** Monthly credits only reset when admin processes a renewal. No automatic billing cycle.

## 12.2 Data Integrity Risks

1. **Local File Fallback Not Persistent:** If R2 is unavailable, files go to local filesystem which is lost on container rebuild.

2. **No Soft Delete:** Deleting galleries/photos is permanent. No recovery possible.

3. **Pre-R2 Data Inconsistency:** Some galleries created before R2 migration have photos referenced in DB but files don't exist in R2 (they were in local storage).

## 12.3 Manual Processes Required

1. **Payment Approval:** Admin must manually review each payment proof
2. **Plan Changes:** Admin must manually process upgrades/downgrades
3. **Credit Grants:** Admin must manually add bonus credits
4. **Subscription Renewal:** No automatic recurring billing

## 12.4 Missing Features

1. **No Invoice Generation:** Users cannot get receipts/invoices
2. **No Refund Mechanism:** No way to refund credits or payments
3. **No Usage Analytics for Users:** Users cannot see their storage breakdown
4. **No Expiration Warnings:** No email reminders before galleries or subscriptions expire

---

# APPENDIX: DATA MODEL REFERENCE

## User Document

```javascript
{
  "id": "uuid",
  "email": "string",
  "password": "bcrypt_hash",
  "name": "string",
  "business_name": "string",
  "plan": "free|standard|pro",
  "payment_status": "none|pending|approved",
  "event_credits": 0-999,
  "extra_credits": 0-999,
  "extra_credits_purchased_at": "ISO timestamp",
  "extra_credits_expires_at": "ISO timestamp",
  "billing_cycle_start": "ISO timestamp",
  "subscription_expires": "ISO timestamp",
  "override_mode": "string|null",
  "override_expires": "ISO timestamp|null",
  "override_reason": "string|null",
  "storage_quota": "bytes",
  "storage_used": "bytes",
  "storage_quota_override": "bytes|null",
  "requested_plan": "string|null",
  "requested_extra_credits": "number|null",
  "created_at": "ISO timestamp",
  "last_login": "ISO timestamp",
  "status": "active|suspended",
  "feature_toggles": {}
}
```

## Gallery Document

```javascript
{
  "id": "uuid",
  "photographer_id": "user_uuid",
  "title": "string",
  "description": "string",
  "share_link": "8-char string",
  "event_date": "ISO timestamp",
  "event_title": "string",
  "password": "string|null",
  "download_all_password": "string|null",
  "cover_photo_url": "string|null",
  "theme": "string",
  "sections": [/* Section objects */],
  "created_at": "ISO timestamp",
  "auto_delete_date": "ISO timestamp",
  "share_link_expiration_date": "ISO timestamp|null",
  "guest_upload_expiration_date": "ISO timestamp|null",
  "guest_upload_enabled_days": 7,
  "download_locked_until_payment": false,
  "is_demo": false,
  "coordinator_hub_link": "string|null",
  "coordinator_name": "string|null"
}
```

## Transaction Document

```javascript
{
  "id": "uuid",
  "user_id": "user_uuid",
  "type": "upgrade|extra_credits|admin_bonus",
  "amount": "number (PHP)",
  "plan": "string|null",
  "extra_credits": "number|null",
  "status": "pending|approved|rejected",
  "payment_proof_url": "string|null",
  "admin_notes": "string|null",
  "created_at": "ISO timestamp",
  "resolved_at": "ISO timestamp|null"
}
```

---

**END OF DOCUMENT**

*This document represents the operational state of EventsGallery.vip as of February 2026. Any changes to the codebase may invalidate portions of this document.*
