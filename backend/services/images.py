"""
Image processing services
"""
from pathlib import Path
from typing import Optional
from PIL import Image
from core.config import THUMBNAIL_SIZES, JPEG_QUALITY, THUMBNAILS_DIR, logger


def generate_thumbnail(source_path: Path, photo_id: str, size_name: str = 'medium') -> Optional[str]:
    """Generate optimized thumbnail from source image"""
    try:
        size = THUMBNAIL_SIZES.get(size_name, THUMBNAIL_SIZES['medium'])
        thumb_filename = f"{photo_id}_{size_name}.jpg"
        thumb_path = THUMBNAILS_DIR / thumb_filename
        
        with Image.open(source_path) as img:
            # Convert to RGB if necessary
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Maintain aspect ratio
            img.thumbnail(size, Image.Resampling.LANCZOS)
            
            # Save with optimization
            img.save(thumb_path, 'JPEG', quality=JPEG_QUALITY, optimize=True)
            
        return f"/api/thumbnails/{thumb_filename}"
    except Exception as e:
        logger.error(f"Error generating thumbnail for {photo_id}: {e}")
        return None
