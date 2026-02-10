# EventsGallery Deployment Guide

## Prerequisites
- Ubuntu 24.04 VPS (Hostinger KVM or similar)
- Docker and Docker Compose installed
- Domain with Cloudflare DNS (SSL handled by Cloudflare)
- MongoDB Atlas account
- Cloudflare R2 storage bucket

## Quick Start

### 1. Clone the Repository
```bash
cd ~
git clone https://github.com/YOUR_USERNAME/eventsgallery.git
cd eventsgallery
```

### 2. Create Environment File
```bash
cp .env.production.example .env
nano .env  # Edit with your actual values
```

### 3. Deploy with Docker Compose
```bash
docker-compose -f docker-compose.prod.yml up -d --build
```

### 4. Verify Deployment
```bash
# Check containers are running
docker ps

# Check backend health
curl http://localhost:8001/health

# Check nginx config
docker exec eventsgallery-nginx nginx -t
```

---

## Detailed Setup

### Install Docker (if not installed)
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Verify installation
docker --version
docker compose version
```

### Cloudflare Setup
1. Add your domain to Cloudflare
2. Set SSL/TLS mode to **Full** (not Full Strict)
3. Create DNS records:
   - `A` record: `eventsgallery.vip` → Your VPS IP
   - `A` record: `www.eventsgallery.vip` → Your VPS IP
   - `CNAME` record: `cdn.eventsgallery.vip` → Your R2 bucket public URL

### MongoDB Atlas Setup
1. Create a free cluster at [mongodb.com/atlas](https://mongodb.com/atlas)
2. Create a database user
3. Whitelist your VPS IP (or 0.0.0.0/0 for all IPs)
4. Get connection string and add to `.env`

### Cloudflare R2 Setup
1. Create R2 bucket named `eventsgallery-app`
2. Create API token with read/write permissions
3. Set up custom domain `cdn.eventsgallery.vip` for public access
4. Add R2 credentials to `.env`

---

## Management Commands

### View Logs
```bash
# All containers
docker-compose -f docker-compose.prod.yml logs -f

# Specific container
docker logs eventsgallery-backend --tail 100 -f
docker logs eventsgallery-frontend --tail 100 -f
docker logs eventsgallery-nginx --tail 100 -f
```

### Restart Services
```bash
# Restart all
docker-compose -f docker-compose.prod.yml restart

# Restart specific service
docker-compose -f docker-compose.prod.yml restart backend
```

### Update Deployment
```bash
cd ~/eventsgallery
git pull origin main
docker-compose -f docker-compose.prod.yml up -d --build
```

### Stop All Services
```bash
docker-compose -f docker-compose.prod.yml down
```

### Full Rebuild (clean)
```bash
docker-compose -f docker-compose.prod.yml down
docker system prune -af
docker-compose -f docker-compose.prod.yml up -d --build
```

---

## Troubleshooting

### Check Container Status
```bash
docker ps -a
docker-compose -f docker-compose.prod.yml ps
```

### Check Port Usage
```bash
sudo netstat -tlnp | grep -E '(80|443|8001|3000)'
```

### Check Nginx Config
```bash
docker exec eventsgallery-nginx cat /etc/nginx/nginx.conf
docker exec eventsgallery-nginx nginx -t
```

### MongoDB Connection Issues
```bash
# Check backend logs for MongoDB errors
docker logs eventsgallery-backend 2>&1 | grep -i mongo

# Verify MongoDB Atlas:
# - IP whitelist includes your VPS IP
# - Username/password are correct (URL-encoded special chars)
# - Cluster is running
```

### Frontend Build Issues
```bash
# Check frontend build logs
docker logs eventsgallery-frontend

# Rebuild frontend only
docker-compose -f docker-compose.prod.yml up -d --build frontend
```

---

## Architecture

```
                    ┌─────────────────┐
                    │   Cloudflare    │
                    │  (SSL + CDN)    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   nginx:80/443  │
                    │  (reverse proxy)│
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
    ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
    │  /api/*     │   │    /*       │   │  /health    │
    │  backend    │   │  frontend   │   │  backend    │
    │   :8001     │   │   :3000     │   │   :8001     │
    └──────┬──────┘   └─────────────┘   └─────────────┘
           │
    ┌──────▼──────┐         ┌─────────────────┐
    │  MongoDB    │         │  Cloudflare R2  │
    │   Atlas     │         │  (file storage) │
    └─────────────┘         └─────────────────┘
```

## Ports
| Service | Internal Port | External Port |
|---------|---------------|---------------|
| Backend | 8001 | 8001 |
| Frontend | 80 | 3000 |
| Nginx | 80, 443 | 80, 443 |

## File Structure
```
eventsgallery/
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── server.py
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
├── docker-compose.prod.yml
├── nginx.conf
├── .env.production.example
├── .env                    # Your actual config (not in git)
├── .gitignore
└── DEPLOYMENT.md
```

---

## Security Notes

1. **Never commit `.env` to git** - it contains secrets
2. **Use strong passwords** for admin and MongoDB
3. **Keep Docker updated** - `sudo apt update && sudo apt upgrade`
4. **Firewall** - Only ports 80 and 443 need to be open
   ```bash
   sudo ufw allow 80
   sudo ufw allow 443
   sudo ufw allow 22  # SSH
   sudo ufw enable
   ```

---

## Support
For issues, check:
1. Container logs: `docker logs <container-name>`
2. MongoDB Atlas dashboard for connection issues
3. Cloudflare dashboard for SSL/DNS issues
