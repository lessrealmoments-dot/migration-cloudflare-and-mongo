# PhotoShare - Pic-time.com Clone

## Original Problem Statement
Build a website similar to Pic-time.com - a professional photo gallery platform where photographers can create accounts, create customizable galleries, and share them with clients. Guests can view galleries and upload their own photos via shareable links.

## User Personas
1. **Admin**: Manage photographers, adjust gallery limits, customize landing page
2. **Photographers**: Create and manage galleries, upload photos, customize themes, share links with clients
3. **Guests/Clients**: View shared galleries, upload photos, download individual/all photos

## Core Requirements
- [x] Photographer authentication (register/login)
- [x] Gallery CRUD operations
- [x] Photo upload (photographer + guest)
- [x] Shareable links for galleries
- [x] Gallery customization (cover photos, sections, themes)
- [x] Access controls (expiring links, upload timeframes)
- [x] Password-protected bulk downloads
- [x] Premium lightbox for photo viewing
- [x] **Upload progress animation** (Jan 2026)
- [x] **Server-side duplicate file prevention** (Jan 2026)
- [x] **Delete gallery with double confirmation** (Jan 2026)
- [x] **Google Drive backup integration** (Jan 2026)
- [x] **Admin Panel** (Jan 2026)
- [x] **Gallery limits per photographer** (Jan 2026)
- [x] **Anti-recycling mechanism** (Jan 2026)
- [x] **Forgot password with email** (Jan 2026)
- [x] **Photographer profile (business name)** (Jan 2026)
- [x] **Customizable landing page** (Jan 2026)

---

## What's Been Implemented (January 2026)

### Admin Panel (/admin)
- **Login**: admin / Aa@58798546521325
- **Features**:
  - View all photographers with their gallery usage
  - Adjust max gallery limits per photographer
  - Edit landing page (brand name, hero title, subtitle, images)
  - Cannot delete galleries (admin limitation)

### Gallery Limits & Anti-Recycling
- Default: 1 free trial gallery per photographer
- `galleries_created_total` tracks ALL galleries ever created (including deleted)
- Prevents recycling: deleted galleries still count against limit
- Popup when limit reached: "Please contact administrator"

### Forgot Password
- Email-based password reset using Resend
- Generates random secure password
- Sends to registered email
- User can change after login

### Photographer Profile
- Business name field (optional)
- Shown on public galleries instead of personal name
- Can be set during registration or updated later

### Landing Page Customization
- Admin can edit via `/admin/dashboard` → Landing Page tab
- Configurable: brand name, hero title, subtitle, hero images
- Changes apply immediately to public landing page

### Backend (FastAPI + MongoDB)
- JWT-based authentication system
- Admin authentication with fixed credentials
- Gallery CRUD with limit enforcement
- Photo upload/serve/delete endpoints with duplicate detection
- Forgot password with email (Resend)
- Landing page config stored in `site_config` collection

### Database Schema
- **users**: id, email, password, name, business_name, max_galleries, galleries_created_total, google_connected, google_email
- **galleries**: id, photographer_id, title, description, password, share_link, cover_photo_url, sections[], theme, created_at
- **photos**: id, gallery_id, filename, original_filename, url, uploaded_by, section_id, uploaded_at
- **site_config**: type, hero_title, hero_subtitle, brand_name, hero_image_1, hero_image_2
- **drive_backups**: id, gallery_id, user_id, status, folder_name, folder_url, photos_backed_up

---

## Key API Endpoints

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/admin/login | Admin login |
| GET | /api/admin/photographers | List all photographers |
| PUT | /api/admin/photographers/{id}/gallery-limit | Update gallery limit |
| GET | /api/admin/landing-config | Get landing config |
| PUT | /api/admin/landing-config | Update landing config |

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | User registration (with business_name) |
| POST | /api/auth/login | User login |
| PUT | /api/auth/profile | Update profile (name, business_name) |
| POST | /api/auth/forgot-password | Send new password email |

### Public
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/public/landing-config | Get landing config for public display |

---

## Admin Credentials
- **URL**: /admin
- **Username**: admin
- **Password**: Aa@58798546521325

---

## Email Configuration (for forgot password)
Set in `/app/backend/.env`:
- `RESEND_API_KEY`: Your Resend API key
- `SENDER_EMAIL`: Sender email address

---

## Future/Backlog (P2)
- Auto-delete galleries after 6 months with warning emails
- Photo tagging/favoriting
- Gallery analytics dashboard
- Storage quotas for photographers
