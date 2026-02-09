#!/bin/bash

# EventsGallery Deployment Script for Hostinger KVM
# Run this script on your server after cloning the repo

set -e

echo "=========================================="
echo "  EventsGallery Deployment Script"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root${NC}"
    exit 1
fi

# Step 1: Update system
echo -e "${YELLOW}Step 1: Updating system...${NC}"
apt-get update && apt-get upgrade -y

# Step 2: Install Docker
echo -e "${YELLOW}Step 2: Installing Docker...${NC}"
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    systemctl enable docker
    systemctl start docker
    echo -e "${GREEN}Docker installed successfully${NC}"
else
    echo -e "${GREEN}Docker already installed${NC}"
fi

# Step 3: Install Docker Compose
echo -e "${YELLOW}Step 3: Installing Docker Compose...${NC}"
if ! command -v docker-compose &> /dev/null; then
    apt-get install -y docker-compose-plugin
    echo -e "${GREEN}Docker Compose installed successfully${NC}"
else
    echo -e "${GREEN}Docker Compose already installed${NC}"
fi

# Step 4: Create production environment file
echo -e "${YELLOW}Step 4: Setting up environment...${NC}"
if [ ! -f ./backend/.env.production ]; then
    cp ./backend/.env ./backend/.env.production
    echo -e "${GREEN}Created .env.production from .env${NC}"
    echo -e "${YELLOW}Please edit ./backend/.env.production with your production values${NC}"
else
    echo -e "${GREEN}.env.production already exists${NC}"
fi

# Step 5: Setup firewall
echo -e "${YELLOW}Step 5: Configuring firewall...${NC}"
apt-get install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
echo -e "${GREEN}Firewall configured${NC}"

# Step 6: Create SSL certificate directories
echo -e "${YELLOW}Step 6: Preparing SSL directories...${NC}"
mkdir -p certbot/conf certbot/www

echo ""
echo -e "${GREEN}=========================================="
echo "  Basic Setup Complete!"
echo "==========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Edit ./backend/.env.production with your production values"
echo "2. Point your domain DNS to this server IP"
echo "3. Run: ./ssl-setup.sh to get SSL certificates"
echo "4. Run: docker compose -f docker-compose.prod.yml up -d --build"
echo ""
