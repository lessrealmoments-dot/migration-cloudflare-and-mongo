"""
Storage Service - Cloudflare R2 Integration
Provides a unified interface for file storage operations.
Supports both R2 (production) and local filesystem (fallback).
"""

import aioboto3
import logging
import os
from typing import Optional, Tuple, BinaryIO
from io import BytesIO
from pathlib import Path
from PIL import Image

logger = logging.getLogger(__name__)

# R2 Configuration from environment
R2_ACCESS_KEY_ID = os.environ.get('R2_ACCESS_KEY_ID', '')
R2_SECRET_ACCESS_KEY = os.environ.get('R2_SECRET_ACCESS_KEY', '')
R2_ENDPOINT_URL = os.environ.get('R2_ENDPOINT_URL', '')
R2_PUBLIC_URL = os.environ.get('R2_PUBLIC_URL', '')
R2_BUCKET_NAME = os.environ.get('R2_BUCKET_NAME', 'eventsgallery-photos')

# Check if R2 is configured
R2_ENABLED = bool(R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and R2_ENDPOINT_URL)

# Thumbnail settings
THUMBNAIL_SIZES = {
    'small': (300, 300),
    'medium': (800, 800),
    'large': (1600, 1600),
}
JPEG_QUALITY = 85


class StorageService:
    """
    Unified storage service that abstracts R2 and local filesystem operations.
    """
    
    def __init__(self):
        self.r2_enabled = R2_ENABLED
        if self.r2_enabled:
            self.session = aioboto3.Session(
                aws_access_key_id=R2_ACCESS_KEY_ID,
                aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            )
            logger.info(f"R2 Storage initialized - Bucket: {R2_BUCKET_NAME}")
        else:
            self.session = None
            logger.warning("R2 not configured - using local filesystem")
    
    def get_public_url(self, key: str) -> str:
        """Get the public URL for a file"""
        if self.r2_enabled and R2_PUBLIC_URL:
            return f"{R2_PUBLIC_URL}/{key}"
        return f"/api/photos/serve/{key}"
    
    def get_thumbnail_url(self, key: str) -> str:
        """Get URL for a thumbnail"""
        if self.r2_enabled and R2_PUBLIC_URL:
            return f"{R2_PUBLIC_URL}/{key}"
        # For local, extract just the filename
        filename = key.split('/')[-1]
        return f"/api/photos/thumb/{filename}"
    
    async def upload_file(
        self,
        key: str,
        content: bytes,
        content_type: str = 'image/jpeg'
    ) -> Tuple[bool, str]:
        """
        Upload a file to storage.
        Returns (success, url/error_message)
        """
        if self.r2_enabled:
            return await self._upload_to_r2(key, content, content_type)
        else:
            return await self._upload_to_local(key, content)
    
    async def _upload_to_r2(
        self,
        key: str,
        content: bytes,
        content_type: str
    ) -> Tuple[bool, str]:
        """Upload file to Cloudflare R2"""
        try:
            async with self.session.client(
                "s3",
                endpoint_url=R2_ENDPOINT_URL,
                region_name="auto"
            ) as s3_client:
                await s3_client.put_object(
                    Bucket=R2_BUCKET_NAME,
                    Key=key,
                    Body=content,
                    ContentType=content_type,
                )
                url = self.get_public_url(key)
                logger.info(f"Uploaded to R2: {key}")
                return True, url
        except Exception as e:
            logger.error(f"R2 upload failed for {key}: {e}")
            return False, str(e)
    
    async def _upload_to_local(
        self,
        key: str,
        content: bytes
    ) -> Tuple[bool, str]:
        """Upload file to local filesystem (fallback)"""
        try:
            from pathlib import Path
            ROOT_DIR = Path(__file__).parent.parent
            UPLOAD_DIR = ROOT_DIR / 'uploads'
            UPLOAD_DIR.mkdir(exist_ok=True)
            
            # Handle thumbnails directory
            if key.startswith('thumbnails/'):
                filename = key.replace('thumbnails/', '')
                file_path = UPLOAD_DIR / 'thumbnails' / filename
                file_path.parent.mkdir(exist_ok=True)
            else:
                # For regular uploads, use just the filename
                filename = key.split('/')[-1] if '/' in key else key
                file_path = UPLOAD_DIR / filename
            
            with open(file_path, 'wb') as f:
                f.write(content)
            
            # Return API endpoint URL
            if key.startswith('thumbnails/'):
                return True, f"/api/photos/thumb/{filename}"
            return True, f"/api/photos/serve/{filename}"
        except Exception as e:
            logger.error(f"Local upload failed for {key}: {e}")
            return False, str(e)
    
    async def delete_file(self, key: str) -> bool:
        """Delete a file from storage"""
        if self.r2_enabled:
            return await self._delete_from_r2(key)
        else:
            return await self._delete_from_local(key)
    
    async def _delete_from_r2(self, key: str) -> bool:
        """Delete file from R2"""
        try:
            async with self.session.client(
                "s3",
                endpoint_url=R2_ENDPOINT_URL,
                region_name="auto"
            ) as s3_client:
                await s3_client.delete_object(
                    Bucket=R2_BUCKET_NAME,
                    Key=key
                )
                logger.info(f"Deleted from R2: {key}")
                return True
        except Exception as e:
            logger.error(f"R2 delete failed for {key}: {e}")
            return False
    
    async def _delete_from_local(self, key: str) -> bool:
        """Delete file from local filesystem"""
        try:
            from pathlib import Path
            ROOT_DIR = Path(__file__).parent.parent
            UPLOAD_DIR = ROOT_DIR / 'uploads'
            
            if key.startswith('thumbnails/'):
                filename = key.replace('thumbnails/', '')
                file_path = UPLOAD_DIR / 'thumbnails' / filename
            else:
                filename = key.split('/')[-1] if '/' in key else key
                file_path = UPLOAD_DIR / filename
            
            if file_path.exists():
                file_path.unlink()
                logger.info(f"Deleted local file: {file_path}")
            return True
        except Exception as e:
            logger.error(f"Local delete failed for {key}: {e}")
            return False
    
    async def file_exists(self, key: str) -> bool:
        """Check if a file exists in storage"""
        if self.r2_enabled:
            return await self._exists_in_r2(key)
        else:
            return await self._exists_in_local(key)
    
    async def _exists_in_r2(self, key: str) -> bool:
        """Check if file exists in R2"""
        try:
            async with self.session.client(
                "s3",
                endpoint_url=R2_ENDPOINT_URL,
                region_name="auto"
            ) as s3_client:
                await s3_client.head_object(
                    Bucket=R2_BUCKET_NAME,
                    Key=key
                )
                return True
        except:
            return False
    
    async def _exists_in_local(self, key: str) -> bool:
        """Check if file exists locally"""
        from pathlib import Path
        ROOT_DIR = Path(__file__).parent.parent
        UPLOAD_DIR = ROOT_DIR / 'uploads'
        
        if key.startswith('thumbnails/'):
            filename = key.replace('thumbnails/', '')
            file_path = UPLOAD_DIR / 'thumbnails' / filename
        else:
            filename = key.split('/')[-1] if '/' in key else key
            file_path = UPLOAD_DIR / filename
        
        return file_path.exists()
    
    async def get_file(self, key: str) -> Optional[bytes]:
        """Get file content from storage"""
        if self.r2_enabled:
            return await self._get_from_r2(key)
        else:
            return await self._get_from_local(key)
    
    async def _get_from_r2(self, key: str) -> Optional[bytes]:
        """Get file from R2"""
        try:
            async with self.session.client(
                "s3",
                endpoint_url=R2_ENDPOINT_URL,
                region_name="auto"
            ) as s3_client:
                response = await s3_client.get_object(
                    Bucket=R2_BUCKET_NAME,
                    Key=key
                )
                async with response['Body'] as stream:
                    return await stream.read()
        except Exception as e:
            logger.error(f"R2 get failed for {key}: {e}")
            return None
    
    async def _get_from_local(self, key: str) -> Optional[bytes]:
        """Get file from local filesystem"""
        try:
            from pathlib import Path
            ROOT_DIR = Path(__file__).parent.parent
            UPLOAD_DIR = ROOT_DIR / 'uploads'
            
            if key.startswith('thumbnails/'):
                filename = key.replace('thumbnails/', '')
                file_path = UPLOAD_DIR / 'thumbnails' / filename
            else:
                filename = key.split('/')[-1] if '/' in key else key
                file_path = UPLOAD_DIR / filename
            
            if file_path.exists():
                with open(file_path, 'rb') as f:
                    return f.read()
            return None
        except Exception as e:
            logger.error(f"Local get failed for {key}: {e}")
            return None
    
    def generate_thumbnail_bytes(
        self,
        image_content: bytes,
        size_name: str = 'medium'
    ) -> Optional[bytes]:
        """
        Generate thumbnail from image bytes.
        Returns thumbnail bytes or None if failed.
        """
        size = THUMBNAIL_SIZES.get(size_name, THUMBNAIL_SIZES['medium'])
        
        try:
            with Image.open(BytesIO(image_content)) as img:
                # Limit image size to prevent memory issues
                max_pixels = 50_000_000  # 50MP max
                if img.width * img.height > max_pixels:
                    scale = (max_pixels / (img.width * img.height)) ** 0.5
                    new_size = (int(img.width * scale), int(img.height * scale))
                    img = img.resize(new_size, Image.Resampling.LANCZOS)
                
                # Convert to RGB
                if img.mode in ('RGBA', 'LA', 'P'):
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    if img.mode == 'P':
                        img = img.convert('RGBA')
                    background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                    img = background
                elif img.mode != 'RGB':
                    img = img.convert('RGB')
                
                # Auto-rotate based on EXIF
                try:
                    from PIL import ExifTags
                    for orientation in ExifTags.TAGS.keys():
                        if ExifTags.TAGS[orientation] == 'Orientation':
                            break
                    exif = img._getexif()
                    if exif:
                        orientation_value = exif.get(orientation)
                        if orientation_value == 3:
                            img = img.rotate(180, expand=True)
                        elif orientation_value == 6:
                            img = img.rotate(270, expand=True)
                        elif orientation_value == 8:
                            img = img.rotate(90, expand=True)
                except (AttributeError, KeyError, IndexError, TypeError):
                    pass
                
                # Resize
                img.thumbnail(size, Image.Resampling.LANCZOS)
                
                # Save to bytes
                thumb_buffer = BytesIO()
                img.save(thumb_buffer, 'JPEG', quality=JPEG_QUALITY, optimize=True)
                return thumb_buffer.getvalue()
                
        except Exception as e:
            logger.error(f"Thumbnail generation failed: {e}")
            return None
    
    async def upload_with_thumbnails(
        self,
        photo_id: str,
        content: bytes,
        file_ext: str,
        content_type: str = 'image/jpeg'
    ) -> dict:
        """
        Upload a photo with automatic thumbnail generation.
        Returns dict with urls for original and thumbnails.
        """
        result = {
            'success': False,
            'original_key': None,
            'original_url': None,
            'thumbnail_url': None,
            'thumbnail_medium_url': None,
            'error': None
        }
        
        # Upload original
        original_key = f"photos/{photo_id}.{file_ext}"
        success, url_or_error = await self.upload_file(original_key, content, content_type)
        
        if not success:
            result['error'] = url_or_error
            return result
        
        result['original_key'] = original_key
        result['original_url'] = url_or_error
        
        # Generate and upload thumbnails
        for size_name, url_field in [('small', 'thumbnail_url'), ('medium', 'thumbnail_medium_url')]:
            thumb_bytes = self.generate_thumbnail_bytes(content, size_name)
            if thumb_bytes:
                thumb_key = f"thumbnails/{photo_id}_{size_name}.jpg"
                thumb_success, thumb_url = await self.upload_file(thumb_key, thumb_bytes, 'image/jpeg')
                if thumb_success:
                    result[url_field] = thumb_url
                else:
                    logger.warning(f"Failed to upload {size_name} thumbnail for {photo_id}")
            else:
                logger.warning(f"Failed to generate {size_name} thumbnail for {photo_id}")
        
        result['success'] = True
        return result
    
    async def delete_photo_with_thumbnails(self, photo_id: str, file_ext: str) -> bool:
        """Delete a photo and all its thumbnails"""
        original_key = f"photos/{photo_id}.{file_ext}"
        await self.delete_file(original_key)
        
        for size_name in ['small', 'medium', 'large']:
            thumb_key = f"thumbnails/{photo_id}_{size_name}.jpg"
            await self.delete_file(thumb_key)
        
        return True


# Global storage instance
storage_service = StorageService()


def get_storage_service() -> StorageService:
    """Get the storage service instance"""
    return storage_service
