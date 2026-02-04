# PhotoShare Backend

## Architecture Overview

This is a FastAPI backend with MongoDB database for a photo gallery sharing platform.

## Directory Structure

```
backend/
├── server.py          # Main application (monolithic - 5000+ lines)
├── core/              # Core configuration and dependencies
│   ├── config.py      # Constants and configuration values
│   ├── database.py    # MongoDB connection setup
│   └── dependencies.py # FastAPI dependencies (auth)
├── models/            # Pydantic data models
│   ├── user.py        # User, Admin, Photographer models
│   ├── gallery.py     # Gallery, Photo, Section models
│   ├── billing.py     # Subscription, Payment, Feature models
│   ├── notification.py # Notification models
│   └── analytics.py   # Analytics, Google Drive models
├── services/          # Business logic services
│   ├── auth.py        # Authentication (hash, JWT)
│   ├── billing.py     # Subscription & payment logic
│   ├── features.py    # Feature toggle resolution
│   ├── notifications.py # Create notifications/transactions
│   ├── email.py       # Email templates and sending
│   ├── gallery.py     # Gallery helper functions
│   └── images.py      # Thumbnail generation
├── routes/            # (Future) API route modules
└── uploads/           # File storage directory
```

## Current State

**server.py** contains all API endpoints in a single file (~5300 lines). The modular structure in `core/`, `models/`, and `services/` has been created for:
1. Code organization and documentation
2. Reusable business logic
3. Future refactoring path

## API Endpoint Categories

### Authentication (`/api/auth/*`)
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `GET /auth/me` - Get current user
- `PUT /auth/profile` - Update profile
- `PUT /auth/change-password` - Change password
- `POST /auth/forgot-password` - Reset password

### Admin (`/api/admin/*`)
- `POST /admin/login` - Admin login
- `GET /admin/photographers` - List photographers
- `PUT /admin/photographers/{id}/status` - Update user status
- `DELETE /admin/photographers/{id}` - Delete user
- `GET /admin/settings` - Get admin settings
- `PUT /admin/settings` - Update settings
- `GET /admin/feature-toggles` - Get global feature toggles
- `PUT /admin/feature-toggles` - Update feature toggles

### Galleries (`/api/galleries/*`)
- `POST /galleries` - Create gallery
- `GET /galleries` - List user's galleries
- `GET /galleries/{id}` - Get gallery details
- `PUT /galleries/{id}` - Update gallery
- `DELETE /galleries/{id}` - Delete gallery
- `POST /galleries/{id}/cover` - Upload cover photo
- `POST /galleries/{id}/sections` - Create section
- `POST /galleries/{id}/photos` - Upload photo

### Public Gallery (`/api/gallery/*`)
- `GET /gallery/{share_link}` - Get public gallery
- `POST /gallery/{share_link}/verify` - Verify password
- `GET /gallery/{share_link}/photos` - Get gallery photos
- `POST /gallery/{share_link}/upload` - Guest upload
- `POST /gallery/{share_link}/download-all` - Download all

### Billing (`/api/billing/*`, `/api/user/*`)
- `GET /billing/pricing` - Get pricing
- `GET /user/subscription` - Get subscription info
- `GET /user/features` - Get user features
- `POST /user/upgrade-request` - Request upgrade
- `POST /user/extra-credits-request` - Buy extra credits
- `GET /admin/pending-payments` - List pending payments
- `POST /admin/approve-payment` - Approve payment
- `POST /admin/reject-payment` - Reject payment

### Notifications (`/api/user/notifications/*`)
- `GET /user/notifications` - Get notifications
- `GET /user/notifications/unread-count` - Unread count
- `PUT /user/notifications/{id}/read` - Mark as read
- `PUT /user/notifications/read-all` - Mark all read

### Analytics (`/api/analytics/*`)
- `POST /analytics/track-view/{gallery_id}` - Track view
- `POST /analytics/track-qr-scan/{gallery_id}` - Track QR scan
- `POST /analytics/track-download/{gallery_id}` - Track download
- `GET /user/analytics` - Get photographer analytics

### Google Drive (`/api/drive/*`)
- `GET /drive/authorize/{gallery_id}` - Start OAuth
- `GET /drive/callback` - OAuth callback
- `GET /drive/status` - Get connection status
- `POST /drive/backup/{gallery_id}` - Backup gallery

## Key Concepts

### Authority Hierarchy
Features are resolved in this order:
1. **Admin Override Mode** (founders_circle, comped_pro, etc.)
2. **Payment Plan** (free, standard, pro)
3. **Default** (free tier)

### Feature Toggles
Configurable per plan/mode:
- `unlimited_token` - Unlimited gallery credits
- `copy_share_link` - Copy gallery link
- `qr_code` - QR code generation
- `display_mode` - Slideshow/Collage
- `collaboration_link` - Contributor uploads

### Payment Flow (Manual)
1. User uploads payment proof
2. Admin reviews and approves/rejects
3. User receives notification + email
4. Plan/credits updated on approval

## Database Collections

- `users` - User accounts
- `galleries` - Photo galleries
- `photos` - Individual photos
- `notifications` - User notifications
- `transactions` - Payment history
- `analytics_events` - View/download tracking
- `settings` - App configuration
- `activity_logs` - Admin activity

## Environment Variables

```env
MONGO_URL=mongodb://...
DB_NAME=photoshare
JWT_SECRET_KEY=...
ADMIN_USERNAME=admin
ADMIN_PASSWORD=...
RESEND_API_KEY=... (optional)
SENDER_EMAIL=...
```

## Refactoring Roadmap

### Phase 1 (Current)
- ✅ Extract constants to `core/config.py`
- ✅ Extract models to `models/`
- ✅ Extract services to `services/`
- ✅ Document API structure

### Phase 2 (Future)
- [ ] Extract routes to `routes/` using APIRouter
- [ ] Split by domain: auth, admin, galleries, billing
- [ ] Add unit tests in `tests/`

### Phase 3 (Future)
- [ ] Add dependency injection
- [ ] Implement repository pattern for DB
- [ ] Add caching layer (Redis)
