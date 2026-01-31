# PhotoShare - Pic-time.com Clone

## Original Problem Statement
Build a website similar to Pic-time.com - a professional photo gallery platform where photographers can create accounts, create customizable galleries, and share them with clients. Guests can view galleries and upload their own photos via shareable links.

## User Personas
1. **Photographers**: Create and manage galleries, upload photos, customize themes, share links with clients
2. **Guests/Clients**: View shared galleries, upload photos, download individual/all photos

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

---

## What's Been Implemented (January 2026)

### Latest Updates (Jan 31, 2026)
1. **Server-Side Duplicate Prevention**:
   - Backend stores `original_filename` for each photo
   - `/api/public/gallery/{share_link}/check-duplicates` endpoint checks files before upload
   - Upload endpoint returns 409 Conflict if file already exists
   - Frontend filters out duplicates before uploading
   
2. **Delete Gallery with Double Confirmation**:
   - First modal: "Are you sure you want to delete?"
   - Second modal: Type gallery name to confirm deletion
   - Prevents accidental permanent deletion
   
3. **Google Drive Backup**:
   - "Link Google Drive" button using Emergent OAuth
   - "Backup to Drive" creates folder and syncs photos
   - Shows backup status with link to Drive folder
   - Disconnect option available

### Backend (FastAPI + MongoDB)
- JWT-based authentication system
- Gallery CRUD with full customization
- Photo upload/serve/delete endpoints with duplicate detection
- Public gallery access via share links
- Section management within galleries
- Cover photo upload
- Password verification for protected galleries
- Bulk download (ZIP) with password protection
- 5 gallery themes support
- Google Drive OAuth integration endpoints

### Frontend (React + Tailwind CSS)
- Landing page with hero section
- Authentication (login/register) forms
- Photographer dashboard with gallery list
- Gallery detail view with management controls
- Delete gallery with double confirmation modals
- Google Drive backup section
- Public gallery view for guests
- Premium lightbox with thumbnail navigation
- Guest photo upload via dropzone with progress tracking
- Theme selection in gallery creation
- Copy share link functionality

### Key Features
| Feature | Status |
|---------|--------|
| User Registration/Login | ✅ Complete |
| Create/Edit/Delete Galleries | ✅ Complete |
| Photo Upload (Photographer) | ✅ Complete |
| Photo Upload (Guest) | ✅ Complete |
| Upload Progress Animation | ✅ Complete |
| Duplicate File Prevention | ✅ Complete |
| Delete Gallery (Double Confirm) | ✅ Complete |
| Google Drive Backup | ✅ Complete |
| Shareable Links | ✅ Complete |
| Link Expiration | ✅ Complete |
| Guest Upload Timeframe | ✅ Complete |
| Individual Photo Download | ✅ Complete |
| Bulk Download (Password) | ✅ Complete |
| Gallery Themes (5 themes) | ✅ Complete |
| Premium Lightbox | ✅ Complete |
| Section Management | ✅ Complete |
| Cover Photo | ✅ Complete |

---

## Technical Architecture

```
/app/
├── backend/
│   ├── server.py       # FastAPI app, all endpoints
│   ├── uploads/        # Photo storage
│   └── .env            # MONGO_URL, JWT_SECRET_KEY
└── frontend/
    ├── src/
    │   ├── components/
    │   │   └── PremiumLightbox.jsx
    │   ├── pages/
    │   │   ├── Auth.jsx
    │   │   ├── Dashboard.jsx
    │   │   ├── GalleryDetail.jsx  # Includes delete & drive backup
    │   │   └── PublicGallery.jsx  # Includes duplicate detection
    │   └── themes.js
    └── .env            # REACT_APP_BACKEND_URL
```

### Database Schema
- **users**: id, email, password, name, created_at, google_connected, google_email, google_session_token
- **galleries**: id, photographer_id, title, description, password, share_link, cover_photo_url, sections[], event_title, event_date, share_link_expiration_date, guest_upload_expiration_date, download_all_password, theme, created_at
- **photos**: id, gallery_id, filename, **original_filename**, url, uploaded_by, section_id, uploaded_at
- **drive_backups**: id, gallery_id, user_id, status, folder_name, folder_url, photos_backed_up, total_photos

---

## API Endpoints Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | User registration |
| POST | /api/auth/login | User login |
| GET | /api/auth/me | Get current user |

### Google Drive
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/google/callback | Exchange OAuth token |
| GET | /api/auth/google/status | Check Drive connection |
| POST | /api/auth/google/disconnect | Disconnect Drive |

### Galleries
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/galleries | Create gallery |
| GET | /api/galleries | Get user galleries |
| GET | /api/galleries/{id} | Get single gallery |
| PUT | /api/galleries/{id} | Update gallery |
| DELETE | /api/galleries/{id} | Delete gallery |
| POST | /api/galleries/{id}/cover-photo | Upload cover |
| POST | /api/galleries/{id}/sections | Create section |
| POST | /api/galleries/{id}/photos | Upload photo |
| POST | /api/galleries/{id}/backup-to-drive | Backup to Drive |
| GET | /api/galleries/{id}/backup-status | Get backup status |

### Public Gallery
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/public/gallery/{link} | Public gallery info |
| GET | /api/public/gallery/{link}/photos | Public photos |
| POST | /api/public/gallery/{link}/check-duplicates | Check for duplicates |
| POST | /api/public/gallery/{link}/upload | Guest upload |
| POST | /api/public/gallery/{link}/download-all | Bulk download |

### Photos
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/photos/serve/{filename} | Serve photo |
| DELETE | /api/photos/{id} | Delete photo |

---

## Future/Backlog (P2)
- Photo tagging/favoriting
- Gallery analytics dashboard
- Seasonal/event-based themes
- Storage quotas for photographers
- Refactoring: Break down large components
