#!/bin/bash
# EventsGallery Local Storage Cleanup Script
# Run this on your VPS to delete photos stored locally (after R2 fix)

echo "============================================"
echo "EventsGallery Local Storage Cleanup"
echo "============================================"

# Check if running inside docker or on host
if [ -f /.dockerenv ]; then
    UPLOADS_DIR="/app/uploads"
else
    echo "This script should be run inside the Docker container."
    echo "Run: docker exec -it eventsgallery-backend bash /app/cleanup_local_uploads.sh"
    exit 1
fi

# Show current state
echo ""
echo "Current local storage status:"
echo "--------------------------------------------"
du -sh $UPLOADS_DIR 2>/dev/null || echo "Directory not found"
echo ""
echo "File counts:"
echo "  Photos: $(ls $UPLOADS_DIR/*.jpg $UPLOADS_DIR/*.jpeg $UPLOADS_DIR/*.png $UPLOADS_DIR/*.gif $UPLOADS_DIR/*.webp 2>/dev/null | wc -l)"
echo "  Thumbnails: $(ls $UPLOADS_DIR/thumbnails/* 2>/dev/null | wc -l)"

# Confirm before deleting
echo ""
echo "⚠️  WARNING: This will delete ALL local photo files!"
echo "New uploads now go directly to Cloudflare R2."
echo ""
read -p "Are you sure you want to delete all local photos? (yes/no): " confirm

if [ "$confirm" = "yes" ]; then
    echo ""
    echo "Deleting local photos..."
    rm -f $UPLOADS_DIR/*.jpg $UPLOADS_DIR/*.jpeg $UPLOADS_DIR/*.png $UPLOADS_DIR/*.gif $UPLOADS_DIR/*.webp 2>/dev/null
    rm -rf $UPLOADS_DIR/thumbnails/* 2>/dev/null
    
    echo ""
    echo "✅ Cleanup complete!"
    echo ""
    echo "Remaining in $UPLOADS_DIR:"
    ls -la $UPLOADS_DIR 2>/dev/null
else
    echo ""
    echo "Cleanup cancelled."
fi
