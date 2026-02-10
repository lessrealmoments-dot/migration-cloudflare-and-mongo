# EventsGallery

Professional photo gallery sharing platform for event photographers.

## Features

- 📸 **Gallery Management** - Create and manage event galleries
- 👥 **Guest Uploads** - Allow guests to contribute photos
- 🎨 **40+ Themes** - Beautiful, customizable gallery themes
- 🔗 **Contributor Links** - QR codes for suppliers (photographers, videographers, 360 booth)
- 🎬 **Video Sections** - YouTube video integration
- 🔄 **360 Booth Support** - Fotoshare.co integration
- ☁️ **Cloud Storage** - Google Drive & pCloud integration with auto-sync
- 📊 **Display Modes** - Slideshow and Live Collage for events
- 💳 **Subscription System** - Plans with credits and billing

## Tech Stack

- **Frontend**: React 18, TailwindCSS, Framer Motion, Shadcn/UI
- **Backend**: Python FastAPI
- **Database**: MongoDB Atlas
- **Storage**: Cloudflare R2
- **Hosting**: Docker on VPS (Hostinger)
- **SSL**: Cloudflare

## Quick Start

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full deployment instructions.

```bash
# Clone
git clone https://github.com/YOUR_USERNAME/eventsgallery.git
cd eventsgallery

# Configure
cp .env.production.example .env
nano .env  # Add your credentials

# Deploy
docker-compose -f docker-compose.prod.yml up -d --build
```

## Project Structure

```
eventsgallery/
├── backend/           # FastAPI backend
├── frontend/          # React frontend
├── docker-compose.prod.yml
├── nginx.conf
├── .env.production.example
└── DEPLOYMENT.md
```

## Environment Variables

Copy `.env.production.example` to `.env` and configure:

| Variable | Description |
|----------|-------------|
| `MONGO_URL` | MongoDB Atlas connection string |
| `R2_*` | Cloudflare R2 credentials |
| `RESEND_API_KEY` | Email service API key |
| `GOOGLE_CLIENT_*` | Google OAuth credentials |

## Live Site

[https://eventsgallery.vip](https://eventsgallery.vip)

## License

Private - All rights reserved.
