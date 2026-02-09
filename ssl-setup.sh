#!/bin/bash

# SSL Certificate Setup Script
# Run this after pointing your domain to the server

set -e

DOMAIN="eventsgallery.vip"
EMAIL="lessrealmoments@gmail.com"

echo "=========================================="
echo "  SSL Certificate Setup"
echo "=========================================="

# Create a temporary nginx config for certificate validation
cat > nginx-temp.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        server_name eventsgallery.vip www.eventsgallery.vip;

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 200 'Server is running';
            add_header Content-Type text/plain;
        }
    }
}
EOF

# Stop any running containers
docker compose -f docker-compose.prod.yml down 2>/dev/null || true

# Start temporary nginx for certificate validation
echo "Starting temporary nginx for domain validation..."
docker run -d --name temp-nginx \
    -p 80:80 \
    -v $(pwd)/nginx-temp.conf:/etc/nginx/nginx.conf:ro \
    -v $(pwd)/certbot/www:/var/www/certbot \
    nginx:alpine

# Wait for nginx to start
sleep 3

# Request certificate
echo "Requesting SSL certificate for $DOMAIN..."
docker run --rm \
    -v $(pwd)/certbot/conf:/etc/letsencrypt \
    -v $(pwd)/certbot/www:/var/www/certbot \
    certbot/certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    -d $DOMAIN \
    -d www.$DOMAIN

# Stop temporary nginx
docker stop temp-nginx
docker rm temp-nginx
rm nginx-temp.conf

echo ""
echo "=========================================="
echo "  SSL Certificate obtained successfully!"
echo "=========================================="
echo ""
echo "Now run: docker compose -f docker-compose.prod.yml up -d --build"
echo ""
