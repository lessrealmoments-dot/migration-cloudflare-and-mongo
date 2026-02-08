# PhotoShare System Audit Report
**Generated:** December 2025

## Executive Summary

### Codebase Stats
- **Backend:** 7,641 lines in single `server.py` (needs refactoring)
- **Frontend Pages:** 18 JSX files
- **Frontend Components:** 11 custom + 46 UI components
- **API Endpoints:** 142 total (59 GET, 53 POST, 21 PUT, 9 DELETE)

---

## 🔴 CRITICAL ISSUES

### 1. Duplicate Function Definition
**Location:** `/app/backend/server.py`
```
Line 6670: async def track_gallery_view(share_link: str)
Line 6814: async def track_gallery_view(gallery_id: str)
```
**Impact:** Second definition shadows the first. Function redefinition error.
**Fix:** Rename second function to `track_gallery_view_by_id`

### 2. Unused Variables (Linter Warnings)
- Line 1585: `global_toggles` assigned but not used in `resolve_user_features`
- Line 5899: `sections_dict` assigned but not used in `get_public_download_info`

---

## 🟠 MEDIUM ISSUES

### 3. Potentially Unused API Endpoints
These endpoints are defined but may not be called from frontend:
- `/admin/flagged-photos` - Admin flagged photos list
- `/analytics/track-download/{gallery_id}` - Download tracking
- `/analytics/track-qr-scan/{gallery_id}` - QR scan tracking
- `/auth/effective-settings` - New endpoint, needs frontend integration
- `/user/transactions` - Transaction history
- `/photos/{photo_id}/repair-thumbnail` - Individual photo repair

### 4. Unused Imports in Backend
- `Response` from fastapi
- `base64` module
- `httpx` module

### 5. Unused Icon Imports in Frontend
Multiple pages import lucide-react icons that are never used:
- AdminDashboard: Plus, Minus, Edit2, Clock, QrCode, Monitor, Link2, Trash
- Dashboard: Image, CreditCard
- PublicGallery: Share2, Play
- LandingPage: Share2, Loader2

---

## 🟡 LOW PRIORITY ISSUES

### 6. Legacy Code Comments
- Line 161 in PublicGallery.jsx: Comment about removed `guestUploadExpanded`

### 7. Old handleDownloadAll Function
- Still exists in PublicGallery.jsx (line 453) but replaced by new section download system
- Should be removed if no longer needed

---

## ✅ WORKING FEATURES (Verified)

1. **Authentication System** - Login, register, password reset
2. **Gallery Management** - Create, edit, delete galleries
3. **Photo Upload** - Photographer and guest uploads with thumbnails
4. **Section Management** - Create, reorder, delete sections
5. **Download System** - Section-based downloads with 250MB chunking
6. **Admin Panel** - User management, feature toggles, billing settings
7. **Display Modes** - Slideshow and Collage display
8. **Storage & Expiration** - Dynamic from admin settings
9. **Contributor Upload** - External contributor links
10. **Fotoshare Integration** - Video scraping

---

## 🛠 RECOMMENDED CLEANUP ACTIONS

### Immediate (Safe)
1. Fix duplicate `track_gallery_view` function
2. Remove unused variables
3. Remove unused imports
4. Clean up unused icon imports

### Deferred (Requires Testing)
1. Remove old `handleDownloadAll` if replaced
2. Backend refactoring into routes/ and services/
3. Remove legacy comments

---

## File Dependency Map

```
Frontend Pages → API Calls
├── Auth.jsx → /auth/login, /auth/register, /auth/forgot-password
├── Dashboard.jsx → /galleries, /analytics/photographer, /user/features
├── GalleryDetail.jsx → /galleries/{id}, /photos, /sections, /videos
├── PublicGallery.jsx → /public/gallery/{share_link}, /download-section
├── AdminDashboard.jsx → /admin/*, /billing/settings
├── FeatureTogglePage.jsx → /admin/global-feature-toggles
├── LandingPage.jsx → /public/landing-config
└── PricingPage.jsx → /billing/pricing
```
