from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Request, BackgroundTasks, Query, Body
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import RedirectResponse, StreamingResponse, HTMLResponse, FileResponse, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
from jose import JWTError, jwt
import shutil
import secrets
import string
import asyncio
import resend
import zipfile
from contextlib import asynccontextmanager
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
import io
import aiofiles
from PIL import Image
import aiohttp

import re

# Import storage service - handle both local dev and Docker paths
import importlib.util
from pathlib import Path

# Try multiple paths for storage.py
_storage_paths = [
    Path(__file__).parent / "services" / "storage.py",  # Local: /app/backend/services/storage.py
    Path("/app/services/storage.py"),  # Docker: /app/services/storage.py
]

storage_module = None
for _storage_path in _storage_paths:
    if _storage_path.exists():
        _storage_spec = importlib.util.spec_from_file_location("storage", str(_storage_path))
        storage_module = importlib.util.module_from_spec(_storage_spec)
        _storage_spec.loader.exec_module(storage_module)
        break

if storage_module is None:
    raise ImportError(f"Could not find storage.py in any of: {_storage_paths}")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# YouTube URL patterns and utilities
def extract_youtube_video_id(url: str) -> Optional[str]:
    """Extract video ID from various YouTube URL formats"""
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})',
        r'youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

def get_youtube_thumbnail_url(video_id: str) -> str:
    """Get the highest quality thumbnail URL for a YouTube video"""
    # YouTube provides these thumbnail sizes:
    # maxresdefault.jpg (1280x720) - may not exist
    # sddefault.jpg (640x480)
    # hqdefault.jpg (480x360)
    # mqdefault.jpg (320x180)
    # default.jpg (120x90)
    return f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"

def get_youtube_embed_url(video_id: str) -> str:
    """Get embeddable YouTube URL"""
    return f"https://www.youtube.com/embed/{video_id}"

# ============ Fotoshare.co / 360 Booth Scraping ============

def extract_fotoshare_event_id(url: str) -> Optional[str]:
    """Extract event ID from fotoshare.co URL"""
    # Patterns: fotoshare.co/e/EVENTID or fotoshare.co/event/EVENTID
    patterns = [
        r'fotoshare\.co/e/([a-zA-Z0-9_-]+)',
        r'fotoshare\.co/event/([a-zA-Z0-9_-]+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

async def scrape_fotoshare_videos(url: str) -> dict:
    """
    Scrape fotoshare.co event page to extract video thumbnails and metadata.
    Returns dict with 'success', 'videos', 'event_title', 'error' keys.
    """
    import aiohttp
    from bs4 import BeautifulSoup
    
    result = {
        'success': False,
        'videos': [],
        'event_title': None,
        'error': None,
        'expired': False
    }
    
    try:
        # Normalize URL
        if not url.startswith('http'):
            url = f'https://{url}'
        
        event_id = extract_fotoshare_event_id(url)
        if not event_id:
            result['error'] = 'Invalid fotoshare.co URL format'
            return result
        
        # Fetch the page
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        }
        
        timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url, headers=headers, allow_redirects=True) as response:
                if response.status == 404:
                    result['error'] = 'Event not found or link has expired'
                    result['expired'] = True
                    return result
                
                if response.status != 200:
                    result['error'] = f'Failed to fetch page (status {response.status})'
                    return result
                
                html = await response.text()
        
        # Parse HTML
        soup = BeautifulSoup(html, 'html.parser')
        
        # Check for expiration indicators
        if 'expired' in html.lower() or 'no longer available' in html.lower():
            result['expired'] = True
            result['error'] = 'This event link has expired'
            return result
        
        # Extract event title
        title_elem = soup.select_one('.album-title, h1.textColor, #albumHeaderSection2 h1')
        if title_elem:
            result['event_title'] = title_elem.get_text(strip=True)
        
        # Extract video thumbnails from the items container
        video_items = soup.select('.thumb[data-type="mp4"], .thumb[data-filetype="mp4"], div[data-hash]')
        
        videos = []
        for idx, item in enumerate(video_items):
            try:
                video_hash = item.get('data-hash')
                if not video_hash:
                    continue
                
                thumbnail = item.get('data-thumb', '')
                # Also try to get from img element
                if not thumbnail:
                    img = item.select_one('img')
                    if img:
                        thumbnail = img.get('data-src') or img.get('src', '')
                
                if not thumbnail:
                    continue
                
                video_data = {
                    'hash': video_hash,
                    'source_url': f'https://fotoshare.co/i/{video_hash}',
                    'thumbnail_url': thumbnail,
                    'width': int(item.get('data-width', 1080)),
                    'height': int(item.get('data-height', 1920)),
                    'file_type': item.get('data-filetype', 'mp4'),
                    'file_source': item.get('data-filesource', 'unknown'),
                    'created_at_source': item.get('data-filecreated'),
                    'order': idx
                }
                videos.append(video_data)
            except Exception as e:
                logging.warning(f"Error parsing video item: {e}")
                continue
        
        result['success'] = True
        result['videos'] = videos
        logging.info(f"Scraped {len(videos)} videos from fotoshare.co event")
        
    except aiohttp.ClientError as e:
        result['error'] = f'Network error: {str(e)}'
        # Check if it might be expired
        if 'timeout' in str(e).lower() or '404' in str(e):
            result['expired'] = True
    except Exception as e:
        logging.error(f"Error scraping fotoshare: {e}")
        result['error'] = f'Error scraping page: {str(e)}'
    
    return result

# ============ Fotoshare Auto-Refresh Background Task ============

async def auto_refresh_fotoshare_sections():
    """
    Background task to auto-refresh fotoshare sections based on age:
    - Day 1 (0-24h): Every 10 minutes
    - Day 2 (24-48h): Every hour
    - Day 3-30 (48h - 30 days): Every 24 hours
    - After 30 days: Every 30 days
    """
    logger.info("Fotoshare auto-refresh task started")
    
    while True:
        try:
            now = datetime.now(timezone.utc)
            
            # Find all galleries with fotoshare sections
            galleries = await db.galleries.find(
                {"sections.type": "fotoshare"},
                {"_id": 0, "id": 1, "sections": 1}
            ).to_list(None)
            
            refreshed_count = 0
            
            for gallery in galleries:
                for section in gallery.get("sections", []):
                    if section.get("type") != "fotoshare":
                        continue
                    
                    # Skip expired sections
                    if section.get("fotoshare_expired"):
                        continue
                    
                    fotoshare_url = section.get("fotoshare_url")
                    if not fotoshare_url:
                        continue
                    
                    last_sync_str = section.get("fotoshare_last_sync")
                    if not last_sync_str:
                        # Never synced - sync now
                        should_refresh = True
                    else:
                        try:
                            last_sync = datetime.fromisoformat(last_sync_str.replace('Z', '+00:00'))
                            age = now - last_sync
                            age_hours = age.total_seconds() / 3600
                            age_days = age_hours / 24
                            
                            # Determine refresh interval based on section age
                            # Calculate section creation age from first sync
                            section_age_days = age_days  # Approximate by time since last sync
                            
                            if section_age_days < 1:
                                # Day 1: Refresh every 10 minutes
                                refresh_interval_minutes = 10
                            elif section_age_days < 2:
                                # Day 2: Refresh every hour
                                refresh_interval_minutes = 60
                            elif section_age_days < 30:
                                # Day 3-30: Refresh every 24 hours
                                refresh_interval_minutes = 24 * 60
                            else:
                                # After 30 days: Refresh every 30 days
                                refresh_interval_minutes = 30 * 24 * 60
                            
                            minutes_since_sync = age.total_seconds() / 60
                            should_refresh = minutes_since_sync >= refresh_interval_minutes
                            
                        except Exception as e:
                            logger.warning(f"Error parsing last_sync date: {e}")
                            should_refresh = True
                    
                    if should_refresh:
                        try:
                            # Perform refresh
                            scrape_result = await scrape_fotoshare_videos(fotoshare_url)
                            sync_time = datetime.now(timezone.utc).isoformat()
                            
                            # Update section status
                            sections = gallery.get("sections", [])
                            for s in sections:
                                if s.get("id") == section.get("id"):
                                    s["fotoshare_last_sync"] = sync_time
                                    s["fotoshare_expired"] = scrape_result.get("expired", False)
                                    break
                            
                            await db.galleries.update_one(
                                {"id": gallery["id"]},
                                {"$set": {"sections": sections}}
                            )
                            
                            if scrape_result.get("success"):
                                # Get existing video hashes
                                existing = await db.fotoshare_videos.find(
                                    {"gallery_id": gallery["id"], "section_id": section["id"]},
                                    {"_id": 0, "hash": 1}
                                ).to_list(1000)
                                existing_hashes = {v["hash"] for v in existing}
                                
                                # Add new videos
                                new_videos = []
                                for video_data in scrape_result.get("videos", []):
                                    if video_data["hash"] not in existing_hashes:
                                        new_videos.append({
                                            "id": str(uuid.uuid4()),
                                            "gallery_id": gallery["id"],
                                            "section_id": section["id"],
                                            "hash": video_data["hash"],
                                            "source_url": video_data["source_url"],
                                            "thumbnail_url": video_data["thumbnail_url"],
                                            "width": video_data.get("width", 1080),
                                            "height": video_data.get("height", 1920),
                                            "file_type": video_data.get("file_type", "mp4"),
                                            "file_source": video_data.get("file_source", "lumabooth"),
                                            "created_at_source": video_data.get("created_at_source"),
                                            "order": video_data.get("order", 0),
                                            "synced_at": sync_time
                                        })
                                
                                if new_videos:
                                    await db.fotoshare_videos.insert_many(new_videos)
                                    logger.info(f"Auto-refresh: Added {len(new_videos)} new videos to section {section['id']}")
                            
                            refreshed_count += 1
                            
                        except Exception as e:
                            logger.error(f"Auto-refresh error for section {section.get('id')}: {e}")
            
            if refreshed_count > 0:
                logger.info(f"Fotoshare auto-refresh: Refreshed {refreshed_count} sections")
                
        except Exception as e:
            logger.error(f"Fotoshare auto-refresh task error: {e}")
        
        # Check every 5 minutes for sections that need refreshing
        await asyncio.sleep(300)

# ============ pCloud Integration ============

def extract_pcloud_code(url: str) -> Optional[str]:
    """Extract the share code from various pCloud URL formats"""
    patterns = [
        r'code=([a-zA-Z0-9]+)',  # ?code=xxx or &code=xxx
        r'publink/show\?code=([a-zA-Z0-9]+)',
        r'#page=publink&code=([a-zA-Z0-9]+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    # If it's just the code itself (no URL)
    if re.match(r'^[a-zA-Z0-9]+$', url):
        return url
    return None

async def fetch_pcloud_folder(code: str) -> dict:
    """
    Fetch folder contents from pCloud using their public API.
    Returns dict with 'success', 'folder_name', 'photos', 'subfolders', 'error' keys.
    """
    import aiohttp
    
    result = {
        'success': False,
        'folder_name': None,
        'photos': [],
        'subfolders': [],
        'error': None
    }
    
    try:
        api_url = f"https://api.pcloud.com/showpublink?code={code}"
        
        timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(api_url) as response:
                if response.status != 200:
                    result['error'] = f'pCloud API returned status {response.status}'
                    return result
                
                data = await response.json()
        
        # Check for pCloud API errors
        if data.get('result') != 0:
            error_codes = {
                7001: 'Invalid link code',
                7002: 'Link deleted by owner',
                7004: 'Link has expired',
                7005: 'Link reached traffic limit',
                7006: 'Link reached maximum downloads'
            }
            error_code = data.get('result', 0)
            result['error'] = error_codes.get(error_code, f'pCloud error code {error_code}')
            return result
        
        metadata = data.get('metadata', {})
        if not metadata.get('isfolder'):
            result['error'] = 'Link does not point to a folder'
            return result
        
        result['folder_name'] = metadata.get('name', 'Unknown')
        
        def extract_photos_recursive(contents: list, supplier_name: str = None) -> list:
            """Recursively extract photos from folder contents"""
            photos = []
            for item in contents:
                if item.get('isfolder'):
                    # This is a subfolder - use its name as supplier name
                    subfolder_name = item.get('name', 'Unknown')
                    subfolder_contents = item.get('contents', [])
                    # Add subfolder to result
                    result['subfolders'].append({
                        'name': subfolder_name,
                        'folderid': item.get('folderid'),
                        'photo_count': sum(1 for c in subfolder_contents if not c.get('isfolder') and c.get('category') == 1)
                    })
                    # Recursively get photos from subfolder
                    photos.extend(extract_photos_recursive(subfolder_contents, subfolder_name))
                elif item.get('category') == 1:  # category 1 = image
                    photos.append({
                        'fileid': item.get('fileid'),
                        'name': item.get('name'),
                        'size': item.get('size', 0),
                        'width': item.get('width'),
                        'height': item.get('height'),
                        'contenttype': item.get('contenttype', 'image/jpeg'),
                        'created': item.get('created'),
                        'modified': item.get('modified'),
                        'supplier_name': supplier_name,
                        'hash': item.get('hash')
                    })
            return photos
        
        contents = metadata.get('contents', [])
        result['photos'] = extract_photos_recursive(contents)
        result['success'] = True
        
        logger.info(f"pCloud: Found {len(result['photos'])} photos in {len(result['subfolders'])} supplier folders")
        
    except aiohttp.ClientError as e:
        result['error'] = f'Network error: {str(e)}'
    except Exception as e:
        logger.error(f"Error fetching pCloud folder: {e}")
        result['error'] = f'Error: {str(e)}'
    
    return result

async def get_pcloud_download_url(code: str, fileid: int) -> Optional[dict]:
    """
    Get direct download URL for a pCloud file.
    Returns dict with 'url', 'expires' or None on error.
    """
    import aiohttp
    
    try:
        api_url = f"https://api.pcloud.com/getpublinkdownload?code={code}&fileid={fileid}"
        
        timeout = aiohttp.ClientTimeout(total=15)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(api_url) as response:
                if response.status != 200:
                    return None
                
                data = await response.json()
        
        if data.get('result') != 0:
            logger.warning(f"pCloud download URL error: {data}")
            return None
        
        # Construct full URL from host + path
        hosts = data.get('hosts', [])
        path = data.get('path', '')
        
        if not hosts or not path:
            return None
        
        # Use first host
        url = f"https://{hosts[0]}{path}"
        
        return {
            'url': url,
            'expires': data.get('expires'),
            'hosts': hosts,
            'path': path
        }
        
    except Exception as e:
        logger.error(f"Error getting pCloud download URL: {e}")
        return None

async def proxy_pcloud_image(code: str, fileid: int) -> Optional[bytes]:
    """
    Fetch image content from pCloud and return bytes.
    This allows us to proxy images for users on networks that block pCloud.
    """
    import aiohttp
    
    try:
        # Get the download URL
        download_info = await get_pcloud_download_url(code, fileid)
        if not download_info:
            return None
        
        # Fetch the actual image
        timeout = aiohttp.ClientTimeout(total=60)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(download_info['url']) as response:
                if response.status != 200:
                    return None
                return await response.read()
                
    except Exception as e:
        logger.error(f"Error proxying pCloud image: {e}")
        return None

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
# Optimized MongoDB connection with connection pooling for high concurrency
client = AsyncIOMotorClient(
    mongo_url,
    maxPoolSize=100,           # Max connections in pool
    minPoolSize=10,            # Min connections always open
    maxIdleTimeMS=30000,       # Close idle connections after 30s
    connectTimeoutMS=5000,     # Connection timeout
    serverSelectionTimeoutMS=5000,
    waitQueueTimeoutMS=10000   # Queue timeout for connections
)
db = client[os.environ['DB_NAME']]

# Initialize storage service (R2 or local filesystem)
storage = storage_module.get_storage_service()
logger.info(f"Storage backend: {'Cloudflare R2' if storage.r2_enabled else 'Local Filesystem'}")

UPLOAD_DIR = ROOT_DIR / 'uploads'
UPLOAD_DIR.mkdir(exist_ok=True)

# Concurrency control for uploads (limit concurrent file writes to prevent I/O saturation)
MAX_CONCURRENT_UPLOADS = 50  # Max simultaneous upload operations
upload_semaphore = asyncio.Semaphore(MAX_CONCURRENT_UPLOADS)

# JWT configuration - will fail if not set (secure by default)
SECRET_KEY = os.environ['JWT_SECRET_KEY']
ALGORITHM = 'HS256'
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

# Admin credentials
ADMIN_USERNAME = os.environ.get('ADMIN_USERNAME', 'admin')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'admin123')

# Email configuration
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

# Default gallery limits
DEFAULT_MAX_GALLERIES = 1  # 1 free trial gallery

# Default storage quota (in bytes) - 500 MB for Free
DEFAULT_STORAGE_QUOTA = 500 * 1024 * 1024

# Plan-based storage quotas (in bytes)
PLAN_STORAGE_QUOTAS = {
    "free": 500 * 1024 * 1024,          # 500 MB
    "standard": 10 * 1024 * 1024 * 1024, # 10 GB
    "pro": 10 * 1024 * 1024 * 1024       # 10 GB
}

# Gallery auto-delete after 6 months (in days) - for paid plans
GALLERY_EXPIRATION_DAYS = 180

# Free/Demo gallery expiration (in hours) - 6 hours
FREE_GALLERY_EXPIRATION_HOURS = 6

# Gallery edit lock after 7 days from creation
GALLERY_EDIT_LOCK_DAYS = 7

# Demo gallery feature window (in hours) - same as expiration for free
DEMO_FEATURE_WINDOW_HOURS = 6

# ============ Google Drive Integration ============

def extract_gdrive_folder_id(url: str) -> Optional[str]:
    """Extract folder ID from various Google Drive URL formats"""
    patterns = [
        r'drive\.google\.com/drive/folders/([a-zA-Z0-9_-]+)',
        r'drive\.google\.com/drive/u/\d+/folders/([a-zA-Z0-9_-]+)',
        r'drive\.google\.com/open\?id=([a-zA-Z0-9_-]+)',
        r'drive\.google\.com/folderview\?id=([a-zA-Z0-9_-]+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

async def fetch_gdrive_folder_photos(folder_id: str) -> dict:
    """
    Fetch photos from a public Google Drive folder.
    Uses the Google Drive API to list files.
    """
    result = {
        'success': False,
        'folder_name': 'Google Drive Photos',
        'photos': [],
        'error': None
    }
    
    try:
        # Google Drive API endpoint for listing files in a folder
        # For public folders, we can use the API key-less approach
        api_url = f"https://www.googleapis.com/drive/v3/files"
        params = {
            "q": f"'{folder_id}' in parents and mimeType contains 'image/' and trashed=false",
            "fields": "files(id,name,mimeType,size,imageMediaMetadata,thumbnailLink,webContentLink,createdTime)",
            "pageSize": 1000,
            "key": os.environ.get('GOOGLE_API_KEY', '')  # Optional API key
        }
        
        # Try using public access first (works for "Anyone with link" folders)
        async with aiohttp.ClientSession() as session:
            # First, try to get folder metadata
            folder_url = f"https://www.googleapis.com/drive/v3/files/{folder_id}"
            folder_params = {
                "fields": "name",
                "key": os.environ.get('GOOGLE_API_KEY', '')
            }
            
            async with session.get(folder_url, params=folder_params) as folder_response:
                if folder_response.status == 200:
                    folder_data = await folder_response.json()
                    result['folder_name'] = folder_data.get('name', 'Google Drive Photos')
            
            # Now get the files
            async with session.get(api_url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    files = data.get('files', [])
                    
                    for file in files:
                        # Build thumbnail URL - Google provides thumbnails for images
                        file_id = file.get('id')
                        thumbnail_url = file.get('thumbnailLink', '')
                        
                        # Higher quality thumbnail
                        if thumbnail_url:
                            thumbnail_url = thumbnail_url.replace('=s220', '=s400')
                        else:
                            thumbnail_url = f"https://drive.google.com/thumbnail?id={file_id}&sz=w400"
                        
                        # Full image URL for viewing
                        view_url = f"https://drive.google.com/uc?export=view&id={file_id}"
                        
                        photo_data = {
                            'file_id': file_id,
                            'name': file.get('name', 'Untitled'),
                            'mime_type': file.get('mimeType', 'image/jpeg'),
                            'size': int(file.get('size', 0)) if file.get('size') else 0,
                            'thumbnail_url': thumbnail_url,
                            'view_url': view_url,
                            'width': file.get('imageMediaMetadata', {}).get('width'),
                            'height': file.get('imageMediaMetadata', {}).get('height'),
                            'created_time': file.get('createdTime')
                        }
                        result['photos'].append(photo_data)
                    
                    result['success'] = True
                    result['photo_count'] = len(result['photos'])
                    logger.info(f"Fetched {len(result['photos'])} photos from Google Drive folder {folder_id}")
                    
                elif response.status == 404:
                    result['error'] = "Folder not found. Make sure the folder is shared publicly."
                elif response.status == 403:
                    result['error'] = "Access denied. Please make sure the folder is set to 'Anyone with the link can view'."
                else:
                    error_text = await response.text()
                    result['error'] = f"Failed to fetch folder: {error_text[:200]}"
                    logger.error(f"Google Drive API error: {response.status} - {error_text}")
                    
    except Exception as e:
        result['error'] = f"Error fetching Google Drive folder: {str(e)}"
        logger.error(f"Google Drive fetch error: {e}")
    
    return result

async def scrape_gdrive_folder_html(folder_id: str) -> dict:
    """
    Alternative method: Scrape Google Drive folder HTML page for public folders.
    This works when the folder is publicly shared but API access is restricted.
    """
    result = {
        'success': False,
        'folder_name': 'Google Drive Photos',
        'photos': [],
        'error': None
    }
    
    try:
        url = f"https://drive.google.com/drive/folders/{folder_id}"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    html = await response.text()
                    
                    # Extract file IDs from the page
                    # Google Drive uses a specific pattern for file IDs in the HTML
                    file_pattern = r'\["([a-zA-Z0-9_-]{25,})"[^\]]*"([^"]+\.(jpg|jpeg|png|gif|webp|heic))"'
                    matches = re.findall(file_pattern, html, re.IGNORECASE)
                    
                    seen_ids = set()
                    for match in matches:
                        file_id = match[0]
                        file_name = match[1]
                        
                        if file_id in seen_ids:
                            continue
                        seen_ids.add(file_id)
                        
                        photo_data = {
                            'file_id': file_id,
                            'name': file_name,
                            'mime_type': 'image/jpeg',
                            'size': 0,
                            'thumbnail_url': f"https://drive.google.com/thumbnail?id={file_id}&sz=w400",
                            'view_url': f"https://drive.google.com/uc?export=view&id={file_id}",
                            'width': None,
                            'height': None,
                            'created_time': None
                        }
                        result['photos'].append(photo_data)
                    
                    # Try to extract folder name
                    title_match = re.search(r'<title>([^<]+)</title>', html)
                    if title_match:
                        title = title_match.group(1).replace(' - Google Drive', '').strip()
                        if title:
                            result['folder_name'] = title
                    
                    if result['photos']:
                        result['success'] = True
                        result['photo_count'] = len(result['photos'])
                    else:
                        result['error'] = "No photos found in folder. Make sure it contains images and is publicly shared."
                        
                elif response.status == 404:
                    result['error'] = "Folder not found"
                else:
                    result['error'] = f"Could not access folder (status {response.status})"
                    
    except Exception as e:
        result['error'] = f"Error scraping folder: {str(e)}"
        logger.error(f"Google Drive scrape error: {e}")
    
    return result

async def get_gdrive_photos(folder_id: str) -> dict:
    """
    Try multiple methods to get photos from a Google Drive folder.
    First tries API, then falls back to HTML scraping.
    """
    # First try the API method
    result = await fetch_gdrive_folder_photos(folder_id)
    
    # If API fails, try HTML scraping
    if not result['success']:
        logger.info(f"API method failed for folder {folder_id}, trying HTML scrape")
        result = await scrape_gdrive_folder_html(folder_id)
    
    return result

# ============================================
# SUBSCRIPTION & BILLING SYSTEM
# ============================================

# Plan types
PLAN_FREE = "free"
PLAN_STANDARD = "standard"
PLAN_PRO = "pro"

# Override modes (Higher authority than payment plans)
MODE_FOUNDERS_CIRCLE = "founders_circle"
MODE_EARLY_PARTNER_BETA = "early_partner_beta"
MODE_COMPED_PRO = "comped_pro"
MODE_COMPED_STANDARD = "comped_standard"
MODE_ENTERPRISE_ACCESS = "enterprise_access"

# All override modes list
ALL_OVERRIDE_MODES = [MODE_FOUNDERS_CIRCLE, MODE_EARLY_PARTNER_BETA, MODE_COMPED_PRO, MODE_COMPED_STANDARD, MODE_ENTERPRISE_ACCESS]

# All payment plans
ALL_PAYMENT_PLANS = [PLAN_FREE, PLAN_STANDARD, PLAN_PRO]

# Payment statuses
PAYMENT_NONE = "none"
PAYMENT_PENDING = "pending"
PAYMENT_APPROVED = "approved"

# Default pricing (in PHP)
DEFAULT_PRICING = {
    "standard_monthly": 1000,
    "pro_monthly": 1500,
    "extra_credit": 500
}

# Credits per plan per billing cycle
PLAN_CREDITS = {
    PLAN_FREE: 0,      # Demo only, 1 demo gallery
    PLAN_STANDARD: 2,
    PLAN_PRO: 2
}

# Mode credits (override)
MODE_CREDITS = {
    MODE_FOUNDERS_CIRCLE: -1,  # -1 = unlimited
    MODE_EARLY_PARTNER_BETA: 2,
    MODE_COMPED_PRO: 2,
    MODE_COMPED_STANDARD: 2,
    MODE_ENTERPRISE_ACCESS: -1  # -1 = unlimited
}

# ============================================
# FEATURE TOGGLE SYSTEM - ADMIN CONTROLLED
# ============================================
# Features that can be toggled per package/mode:
# - unlimited_token: Unlimited event credits
# - copy_share_link: Copy shareable gallery link
# - qr_code: Generate QR code for gallery
# - view_public_gallery: Allow public gallery viewing
# - display_mode: Slideshow/Collage display modes
# - collaboration_link: Contributor upload links

# Default feature toggles per override mode
DEFAULT_MODE_FEATURES = {
    MODE_FOUNDERS_CIRCLE: {
        "unlimited_token": True,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": True,
        "collaboration_link": True,
        "storage_limit_gb": -1,  # -1 = unlimited
        "gallery_expiration_days": 36500  # ~100 years (never)
    },
    MODE_EARLY_PARTNER_BETA: {
        "unlimited_token": False,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": True,
        "collaboration_link": True,
        "storage_limit_gb": 50,  # 50GB
        "gallery_expiration_days": 180  # 6 months
    },
    MODE_COMPED_PRO: {
        "unlimited_token": False,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": True,
        "collaboration_link": True,
        "storage_limit_gb": 50,  # 50GB
        "gallery_expiration_days": 180  # 6 months
    },
    MODE_COMPED_STANDARD: {
        "unlimited_token": False,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": False,
        "collaboration_link": False,
        "storage_limit_gb": 20,  # 20GB
        "gallery_expiration_days": 90  # 3 months
    },
    MODE_ENTERPRISE_ACCESS: {
        "unlimited_token": True,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": True,
        "collaboration_link": True,
        "storage_limit_gb": -1,  # -1 = unlimited
        "gallery_expiration_days": 36500  # ~100 years (never)
    }
}

# Default feature toggles per payment plan
DEFAULT_PLAN_FEATURES = {
    PLAN_FREE: {
        "unlimited_token": False,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": True,  # Demo only (6hr gallery)
        "collaboration_link": True  # Demo only (6hr gallery)
    },
    PLAN_STANDARD: {
        "unlimited_token": False,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": False,
        "collaboration_link": False
    },
    PLAN_PRO: {
        "unlimited_token": False,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": True,
        "collaboration_link": True
    }
}

# Standard features (available to Standard and above)
# Note: display_mode is DISABLED for Standard, only available in Pro
STANDARD_FEATURES = ["qr_share", "online_gallery", "owner_uploads", "guest_uploads"]

# Pro features (available to Pro only)
PRO_FEATURES = ["display_mode", "contributor_link", "supplier_sections", "supplier_attribution", "photographer_moderation"]

# Image optimization settings
THUMBNAIL_SIZES = {
    'small': (300, 300),    # For grid thumbnails
    'medium': (800, 800),   # For gallery view
    'large': (1600, 1600),  # For lightbox
}
JPEG_QUALITY = 85  # Balance between quality and size
THUMBNAILS_DIR = UPLOAD_DIR / 'thumbnails'
THUMBNAILS_DIR.mkdir(exist_ok=True)

# Thumbnail generation retry settings
THUMBNAIL_MAX_RETRIES = 3
THUMBNAIL_RETRY_DELAY = 0.5  # seconds between retries

def generate_thumbnail_single(source_path: Path, photo_id: str, size_name: str = 'medium') -> Optional[str]:
    """Generate a single thumbnail (internal, no retry)"""
    size = THUMBNAIL_SIZES.get(size_name, THUMBNAIL_SIZES['medium'])
    thumb_filename = f"{photo_id}_{size_name}.jpg"
    thumb_path = THUMBNAILS_DIR / thumb_filename
    
    try:
        # Use context manager to ensure image is closed and memory freed
        with Image.open(source_path) as img:
            # Limit image size to prevent memory issues with very large images
            max_pixels = 50_000_000  # 50MP max
            if img.width * img.height > max_pixels:
                # Calculate scale factor to fit within max_pixels
                scale = (max_pixels / (img.width * img.height)) ** 0.5
                new_size = (int(img.width * scale), int(img.height * scale))
                img = img.resize(new_size, Image.Resampling.LANCZOS)
            
            # Convert to RGB if necessary (handles PNG with transparency, HEIC, etc.)
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Auto-rotate based on EXIF first (before resizing)
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
            
            # Preserve aspect ratio and resize
            img.thumbnail(size, Image.Resampling.LANCZOS)
            
            # Save optimized JPEG
            img.save(thumb_path, 'JPEG', quality=JPEG_QUALITY, optimize=True)
        
        # Verify the file was created
        if thumb_path.exists() and thumb_path.stat().st_size > 0:
            return f"/api/photos/thumb/{thumb_filename}"
        else:
            logger.error(f"Thumbnail file not created or empty: {thumb_filename}")
            return None
            
    except Exception as e:
        logger.error(f"Error generating thumbnail for {photo_id}: {e}")
        # Clean up partial file if it exists
        if thumb_path.exists():
            try:
                thumb_path.unlink()
            except:
                pass
        return None

def generate_thumbnail(source_path: Path, photo_id: str, size_name: str = 'medium') -> Optional[str]:
    """Generate optimized thumbnail with retry logic"""
    import time
    last_error = None
    
    for attempt in range(THUMBNAIL_MAX_RETRIES):
        try:
            result = generate_thumbnail_single(source_path, photo_id, size_name)
            # Verify the thumbnail was created successfully
            thumb_filename = f"{photo_id}_{size_name}.jpg"
            thumb_path = THUMBNAILS_DIR / thumb_filename
            if thumb_path.exists() and thumb_path.stat().st_size > 0:
                return result
            else:
                raise Exception("Thumbnail file not created or empty")
        except Exception as e:
            last_error = e
            logger.warning(f"Thumbnail generation attempt {attempt + 1}/{THUMBNAIL_MAX_RETRIES} failed for {photo_id}: {e}")
            if attempt < THUMBNAIL_MAX_RETRIES - 1:
                time.sleep(THUMBNAIL_RETRY_DELAY)
    
    logger.error(f"All {THUMBNAIL_MAX_RETRIES} thumbnail generation attempts failed for {photo_id}: {last_error}")
    return None

def validate_image_file(file_path: Path) -> dict:
    """Validate an image file - check if it exists, is readable, and can be opened by PIL"""
    result = {
        "valid": False,
        "exists": False,
        "readable": False,
        "pil_valid": False,
        "file_size": 0,
        "error": None
    }
    
    try:
        if not file_path.exists():
            result["error"] = "File does not exist"
            return result
        result["exists"] = True
        
        file_size = file_path.stat().st_size
        result["file_size"] = file_size
        
        if file_size == 0:
            result["error"] = "File is empty (0 bytes)"
            return result
        result["readable"] = True
        
        # Try to open with PIL to verify it's a valid image
        with Image.open(file_path) as img:
            img.verify()
        result["pil_valid"] = True
        result["valid"] = True
        
    except Exception as e:
        result["error"] = str(e)
    
    return result

def validate_thumbnail(photo_id: str, size_name: str = 'medium') -> dict:
    """Validate a thumbnail file"""
    thumb_filename = f"{photo_id}_{size_name}.jpg"
    thumb_path = THUMBNAILS_DIR / thumb_filename
    return validate_image_file(thumb_path)

async def auto_flag_photo(photo_id: str, reason: str):
    """Auto-flag a photo due to processing issues"""
    await db.photos.update_one(
        {"id": photo_id},
        {"$set": {
            "is_flagged": True,
            "flagged_at": datetime.now(timezone.utc).isoformat(),
            "flagged_reason": f"auto:{reason}",
            "auto_flagged": True
        }}
    )
    logger.info(f"Auto-flagged photo {photo_id}: {reason}")

async def validate_and_repair_photo_thumbnails(photo_id: str, force_regenerate: bool = False) -> dict:
    """Validate and optionally repair thumbnails for a photo"""
    photo = await db.photos.find_one({"id": photo_id}, {"_id": 0})
    if not photo:
        return {"success": False, "error": "Photo not found"}
    
    # Get the original file path
    original_path = UPLOAD_DIR / photo["filename"]
    
    # Validate original
    original_validation = validate_image_file(original_path)
    if not original_validation["valid"]:
        return {
            "success": False,
            "error": f"Original image invalid: {original_validation['error']}",
            "should_flag": True,
            "flag_reason": "original_corrupted"
        }
    
    results = {
        "success": True,
        "photo_id": photo_id,
        "thumbnails": {},
        "regenerated": []
    }
    
    # Check/repair each thumbnail size
    for size_name in ['small', 'medium']:
        thumb_validation = validate_thumbnail(photo_id, size_name)
        
        if not thumb_validation["valid"] or force_regenerate:
            # Attempt to regenerate
            thumb_url = generate_thumbnail(original_path, photo_id, size_name)
            if thumb_url:
                results["regenerated"].append(size_name)
                results["thumbnails"][size_name] = {"status": "regenerated", "url": thumb_url}
                
                # Update photo record with new thumbnail URL
                update_field = "thumbnail_url" if size_name == "small" else "thumbnail_medium_url"
                await db.photos.update_one(
                    {"id": photo_id},
                    {"$set": {update_field: thumb_url}}
                )
            else:
                results["thumbnails"][size_name] = {"status": "failed", "error": "Regeneration failed"}
                results["success"] = False
        else:
            results["thumbnails"][size_name] = {"status": "valid"}
    
    return results

# Google Drive OAuth configuration
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', '')
GOOGLE_DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file']

# Google Drive sync interval (in seconds)
DRIVE_SYNC_INTERVAL = 5 * 60  # 5 minutes

# Background task control
sync_task_running = False

def get_google_oauth_flow(redirect_uri: str):
    """Create Google OAuth flow with dynamic redirect URI"""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return None
    
    return Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [redirect_uri]
            }
        },
        scopes=GOOGLE_DRIVE_SCOPES,
        redirect_uri=redirect_uri
    )

async def get_drive_service_for_user(user_id: str):
    """Get Google Drive service with auto-refresh credentials"""
    creds_doc = await db.drive_credentials.find_one({"user_id": user_id}, {"_id": 0})
    if not creds_doc:
        return None
    
    # Create credentials object
    creds = Credentials(
        token=creds_doc["access_token"],
        refresh_token=creds_doc.get("refresh_token"),
        token_uri=creds_doc["token_uri"],
        client_id=creds_doc["client_id"],
        client_secret=creds_doc["client_secret"],
        scopes=creds_doc.get("scopes", GOOGLE_DRIVE_SCOPES)
    )
    
    # Auto-refresh if expired
    if creds.expired and creds.refresh_token:
        logger.info(f"Refreshing expired token for user {user_id}")
        try:
            creds.refresh(GoogleRequest())
            
            # Update in database
            await db.drive_credentials.update_one(
                {"user_id": user_id},
                {"$set": {
                    "access_token": creds.token,
                    "expiry": creds.expiry.isoformat() if creds.expiry else None,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
        except Exception as e:
            logger.error(f"Failed to refresh token: {e}")
            return None
    
    return build('drive', 'v3', credentials=creds)

async def auto_sync_drive_task():
    """Background task that auto-syncs galleries to Google Drive every 5 minutes"""
    global sync_task_running
    sync_task_running = True
    logger.info("Google Drive auto-sync task started")
    
    while sync_task_running:
        try:
            # Find all users with Google Drive connected and auto_sync enabled
            users_with_drive = await db.drive_credentials.find({
                "drive_auto_sync": True
            }, {"_id": 0}).to_list(None)
            
            for creds in users_with_drive:
                user_id = creds["user_id"]
                # Find galleries that need syncing
                galleries = await db.galleries.find({
                    "photographer_id": user_id
                }, {"_id": 0}).to_list(None)
                
                for gallery in galleries:
                    await sync_gallery_to_drive(user_id, gallery["id"])
            
            logger.info(f"Auto-sync completed for {len(users_with_drive)} users")
        except Exception as e:
            logger.error(f"Auto-sync error: {e}")
        
        # Wait for next sync interval
        await asyncio.sleep(DRIVE_SYNC_INTERVAL)

async def sync_gallery_to_drive(user_id: str, gallery_id: str):
    """Sync a single gallery to Google Drive using proper OAuth"""
    try:
        gallery = await db.galleries.find_one({"id": gallery_id}, {"_id": 0})
        if not gallery:
            return
        
        # Get Drive service for user
        drive_service = await get_drive_service_for_user(user_id)
        if not drive_service:
            logger.warning(f"No Drive service available for user {user_id}")
            return
        
        # Get photos that haven't been synced yet
        photos = await db.photos.find({
            "gallery_id": gallery_id,
            "drive_synced": {"$ne": True}
        }, {"_id": 0}).to_list(None)
        
        if not photos:
            return
        
        # Get or create backup record
        backup = await db.drive_backups.find_one({
            "gallery_id": gallery_id,
            "user_id": user_id
        }, {"_id": 0})
        
        folder_name = f"PhotoShare - {gallery['title']}"
        # Escape special characters for Drive API query
        escaped_folder_name = folder_name.replace("\\", "\\\\").replace("'", "\\'")
        
        if not backup:
            backup = {
                "id": str(uuid.uuid4()),
                "gallery_id": gallery_id,
                "user_id": user_id,
                "status": "in_progress",
                "folder_name": folder_name,
                "photos_backed_up": 0,
                "total_photos": len(photos),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "last_updated": datetime.now(timezone.utc).isoformat()
            }
            await db.drive_backups.insert_one(backup)
        
        # Create folder if not exists
        folder_id = backup.get("folder_id")
        if not folder_id:
            try:
                # Search for existing folder first (use escaped name for query)
                results = drive_service.files().list(
                    q=f"name='{escaped_folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false",
                    spaces='drive',
                    fields='files(id, name)'
                ).execute()
                
                existing_folders = results.get('files', [])
                if existing_folders:
                    folder_id = existing_folders[0]['id']
                    logger.info(f"Found existing folder: {folder_id}")
                else:
                    # Create new folder
                    file_metadata = {
                        'name': folder_name,
                        'mimeType': 'application/vnd.google-apps.folder'
                    }
                    folder = drive_service.files().create(body=file_metadata, fields='id').execute()
                    folder_id = folder.get('id')
                    logger.info(f"Created new folder: {folder_id}")
                
                if folder_id:
                    await db.drive_backups.update_one(
                        {"id": backup["id"]},
                        {"$set": {
                            "folder_id": folder_id, 
                            "folder_url": f"https://drive.google.com/drive/folders/{folder_id}"
                        }}
                    )
            except Exception as e:
                logger.error(f"Failed to create/find Drive folder: {e}")
                return
        
        if not folder_id:
            logger.error(f"Failed to get Drive folder for gallery {gallery_id}")
            return
        
        # Upload each photo
        synced_count = 0
        for photo in photos:
            file_path = UPLOAD_DIR / photo["filename"]
            if file_path.exists():
                try:
                    # Determine mime type
                    ext = file_path.suffix.lower()
                    mime_types = {
                        '.jpg': 'image/jpeg',
                        '.jpeg': 'image/jpeg',
                        '.png': 'image/png',
                        '.gif': 'image/gif',
                        '.webp': 'image/webp'
                    }
                    mime_type = mime_types.get(ext, 'application/octet-stream')
                    
                    # Upload file
                    file_metadata = {
                        'name': photo.get("original_filename", photo["filename"]),
                        'parents': [folder_id]
                    }
                    media = MediaFileUpload(str(file_path), mimetype=mime_type, resumable=True)
                    file = drive_service.files().create(
                        body=file_metadata,
                        media_body=media,
                        fields='id'
                    ).execute()
                    
                    if file.get('id'):
                        await db.photos.update_one(
                            {"id": photo["id"]},
                            {"$set": {
                                "drive_synced": True, 
                                "drive_file_id": file['id'],
                                "drive_synced_at": datetime.now(timezone.utc).isoformat()
                            }}
                        )
                        synced_count += 1
                        logger.info(f"Uploaded photo {photo['id']} to Drive")
                except Exception as e:
                    logger.error(f"Failed to upload photo {photo['id']}: {e}")
        
        # Update backup status
        total_synced = backup.get("photos_backed_up", 0) + synced_count
        total_photos = await db.photos.count_documents({"gallery_id": gallery_id})
        
        await db.drive_backups.update_one(
            {"id": backup["id"]},
            {"$set": {
                "status": "completed" if total_synced >= total_photos else "in_progress",
                "photos_backed_up": total_synced,
                "total_photos": total_photos,
                "last_updated": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        logger.info(f"Synced {synced_count} photos for gallery {gallery_id}")
        
    except Exception as e:
        logger.error(f"Error syncing gallery {gallery_id}: {e}")

async def create_database_indexes():
    """Create database indexes for optimized query performance under high concurrency"""
    logger.info("Creating database indexes for high concurrency optimization...")
    
    try:
        # Users collection indexes
        await db.users.create_index("id", unique=True)
        await db.users.create_index("email", unique=True)
        
        # Galleries collection indexes
        await db.galleries.create_index("id", unique=True)
        await db.galleries.create_index("share_link", unique=True)
        await db.galleries.create_index("photographer_id")
        await db.galleries.create_index("auto_delete_date")  # For auto-delete queries
        await db.galleries.create_index([("photographer_id", 1), ("created_at", -1)])  # Compound index
        
        # Photos collection indexes - CRITICAL for high concurrency
        await db.photos.create_index("id", unique=True)
        await db.photos.create_index("gallery_id")
        await db.photos.create_index("filename")
        await db.photos.create_index([("gallery_id", 1), ("uploaded_at", -1)])  # For sorted photo queries
        await db.photos.create_index([("gallery_id", 1), ("original_filename", 1)])  # For duplicate detection
        
        # Drive credentials and backups
        await db.drive_credentials.create_index("user_id", unique=True)
        await db.drive_backups.create_index([("gallery_id", 1), ("user_id", 1)])
        
        # Site config
        await db.site_config.create_index("type", unique=True)
        
        # Notifications collection indexes
        await db.notifications.create_index("id", unique=True)
        await db.notifications.create_index("user_id")
        await db.notifications.create_index([("user_id", 1), ("read", 1), ("created_at", -1)])
        
        # Transactions collection indexes
        await db.transactions.create_index("id", unique=True)
        await db.transactions.create_index("user_id")
        await db.transactions.create_index([("user_id", 1), ("created_at", -1)])
        
        # Analytics events collection indexes
        await db.analytics_events.create_index("id", unique=True)
        await db.analytics_events.create_index("gallery_id")
        await db.analytics_events.create_index("photographer_id")
        await db.analytics_events.create_index([("photographer_id", 1), ("event_type", 1), ("created_at", -1)])
        
        # pCloud photos collection indexes
        await db.pcloud_photos.create_index("id", unique=True)
        await db.pcloud_photos.create_index("gallery_id")
        await db.pcloud_photos.create_index("section_id")
        await db.pcloud_photos.create_index([("gallery_id", 1), ("section_id", 1)])
        await db.pcloud_photos.create_index("fileid")
        
        logger.info("Database indexes created successfully")
    except Exception as e:
        logger.error(f"Error creating indexes (may already exist): {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown"""
    # Create database indexes for optimized performance
    await create_database_indexes()
    # Start background sync task
    asyncio.create_task(auto_sync_drive_task())
    # Start auto-delete task
    asyncio.create_task(auto_delete_expired_galleries())
    # Start fotoshare auto-refresh task
    asyncio.create_task(auto_refresh_fotoshare_sections())
    yield
    # Stop background task
    global sync_task_running
    sync_task_running = False

app = FastAPI(lifespan=lifespan)
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# Root-level health check for Kubernetes liveness/readiness probes
@app.get("/health")
async def health_check():
    """Health check endpoint for Kubernetes probes"""
    return {"status": "healthy", "service": "photoshare-backend"}

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    business_name: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    business_name: Optional[str] = None
    max_galleries: int = DEFAULT_MAX_GALLERIES
    galleries_created_total: int = 0  # Track total ever created (including deleted)
    storage_quota: int = DEFAULT_STORAGE_QUOTA  # Storage quota in bytes
    storage_used: int = 0  # Storage used in bytes
    created_at: str

class UserProfile(BaseModel):
    name: Optional[str] = None
    business_name: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str
    user: User

class ForgotPassword(BaseModel):
    email: EmailStr

class ChangePassword(BaseModel):
    current_password: str
    new_password: str

# Admin models
class AdminLogin(BaseModel):
    username: str
    password: str

class AdminToken(BaseModel):
    access_token: str
    token_type: str
    is_admin: bool = True

class PhotographerAdmin(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    business_name: Optional[str] = None
    max_galleries: int
    galleries_created_total: int
    active_galleries: int = 0
    storage_quota: int = DEFAULT_STORAGE_QUOTA
    storage_used: int = 0
    status: str = "active"
    created_at: str
    # Subscription fields
    plan: str = PLAN_FREE
    event_credits: int = 0
    extra_credits: int = 0
    payment_status: str = PAYMENT_NONE
    override_mode: Optional[str] = None
    override_expires: Optional[str] = None
    requested_plan: Optional[str] = None

class UpdateGalleryLimit(BaseModel):
    max_galleries: int

class UpdateStorageQuota(BaseModel):
    storage_quota: int  # in bytes

class LandingPageConfig(BaseModel):
    hero_title: str = "Share Your Photography, Beautifully"
    hero_subtitle: str = "Create stunning galleries, share with clients, and let them upload their own photos. The professional way to showcase and collaborate."
    brand_name: str = "PhotoShare"
    brand_tagline: Optional[str] = None  # e.g., "by Less Real Moments"
    favicon_url: Optional[str] = None  # Custom favicon URL
    hero_image_1: Optional[str] = None
    hero_image_2: Optional[str] = None
    hero_image_3: Optional[str] = None
    hero_image_4: Optional[str] = None
    hero_image_5: Optional[str] = None
    hero_image_6: Optional[str] = None
    hero_image_7: Optional[str] = None
    hero_image_8: Optional[str] = None
    hero_image_9: Optional[str] = None
    hero_image_10: Optional[str] = None

class GalleryCreate(BaseModel):
    title: str
    description: Optional[str] = None
    password: Optional[str] = None
    event_title: Optional[str] = None
    event_date: Optional[str] = None
    coordinator_name: Optional[str] = None  # Event coordinator/planner name
    share_link_expiration_days: int = 30
    guest_upload_enabled_days: int = 3
    download_all_password: Optional[str] = None
    theme: str = "classic"
    # Display settings
    display_mode: str = "slideshow"  # "slideshow" or "collage"
    display_transition: str = "crossfade"  # "crossfade", "fade-zoom", "slide", "flip"
    display_interval: int = 6  # seconds between transitions (slideshow mode)
    collage_preset_id: Optional[str] = None  # Selected collage preset for collage mode

class Gallery(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    photographer_id: str
    title: str
    description: Optional[str] = None
    has_password: bool
    share_link: str
    cover_photo_url: Optional[str] = None
    event_title: Optional[str] = None
    event_date: Optional[str] = None
    coordinator_name: Optional[str] = None  # Event coordinator/planner name
    share_link_expiration_date: Optional[str] = None
    guest_upload_expiration_date: Optional[str] = None
    guest_upload_enabled: bool = True
    has_download_all_password: bool = False
    theme: str = "classic"
    # Display settings
    display_mode: str = "slideshow"
    display_transition: str = "crossfade"
    display_interval: int = 6
    collage_preset_id: Optional[str] = None  # Selected collage preset
    created_at: str
    photo_count: int = 0
    auto_delete_date: Optional[str] = None  # When gallery will be auto-deleted
    days_until_deletion: Optional[int] = None  # Days remaining until deletion
    is_edit_locked: bool = False  # Whether editing is locked (7 days after creation)
    days_until_edit_lock: int = 7  # Days remaining before edit lock
    download_locked_until_payment: bool = False  # Downloads locked until payment approved

class GalleryUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    password: Optional[str] = None
    event_title: Optional[str] = None
    event_date: Optional[str] = None
    coordinator_name: Optional[str] = None  # Event coordinator/planner name
    share_link_expiration_days: Optional[int] = None
    guest_upload_enabled_days: Optional[int] = None
    download_all_password: Optional[str] = None
    theme: Optional[str] = None
    # Display settings
    display_mode: Optional[str] = None
    display_transition: Optional[str] = None
    display_interval: Optional[int] = None
    collage_preset_id: Optional[str] = None

class Section(BaseModel):
    id: str
    name: str
    order: int
    type: str = "photo"  # "photo", "video", "fotoshare", or "pcloud"
    contributor_link: Optional[str] = None  # Unique link for contributor uploads
    contributor_name: Optional[str] = None  # Company/contributor name
    contributor_enabled: bool = False  # Whether contributor uploads are enabled
    # Fotoshare-specific fields
    fotoshare_url: Optional[str] = None  # The fotoshare.co event URL
    fotoshare_last_sync: Optional[str] = None  # Last sync timestamp
    fotoshare_expired: bool = False  # Whether the link has expired
    # pCloud-specific fields
    pcloud_code: Optional[str] = None  # The pCloud share link code
    pcloud_folder_name: Optional[str] = None  # Name of the linked folder
    pcloud_last_sync: Optional[str] = None  # Last sync timestamp
    pcloud_error: Optional[str] = None  # Last error message if any

class PCloudPhoto(BaseModel):
    """Photo entry from pCloud shared folder"""
    model_config = ConfigDict(extra="ignore")
    id: str
    gallery_id: str
    section_id: str
    pcloud_code: str  # The share link code
    fileid: str  # pCloud file ID (stored as string to avoid MongoDB int overflow)
    name: str  # Original filename
    size: int = 0  # File size in bytes
    width: Optional[int] = None
    height: Optional[int] = None
    contenttype: str = "image/jpeg"
    supplier_name: Optional[str] = None  # Supplier folder name
    hash: Optional[str] = None  # pCloud file hash (stored as string)
    created_at_source: Optional[str] = None
    order: int = 0
    synced_at: str  # When we synced this photo

class FotoshareVideo(BaseModel):
    """Video entry from fotoshare.co / 360 booth providers"""
    model_config = ConfigDict(extra="ignore")
    id: str
    gallery_id: str
    section_id: str
    hash: str  # Fotoshare video hash (e.g., "308xz2a")
    source_url: str  # Full URL to view on fotoshare (e.g., "https://fotoshare.co/i/308xz2a")
    thumbnail_url: str  # CDN thumbnail URL
    width: int = 1080
    height: int = 1920
    file_type: str = "mp4"
    file_source: str = "lumabooth"  # e.g., "lumabooth"
    created_at_source: Optional[str] = None  # When it was created on fotoshare
    order: int = 0
    synced_at: str  # When we synced this video

class GalleryVideo(BaseModel):
    """Video entry for video sections"""
    model_config = ConfigDict(extra="ignore")
    id: str
    gallery_id: str
    section_id: str
    youtube_url: str
    video_id: str  # Extracted YouTube video ID
    tag: str  # Custom tag like "SDE", "Preparation", "Ceremony", etc.
    title: Optional[str] = None
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None  # Custom uploaded thumbnail
    thumbnail_position: Optional[dict] = None  # {scale, x, y} for crop position
    youtube_thumbnail_url: Optional[str] = None  # Auto-fetched from YouTube
    duration: Optional[str] = None
    is_featured: bool = False  # Featured video shows large
    uploaded_by: str = "photographer"  # "photographer" or "contributor"
    contributor_name: Optional[str] = None
    order: int = 0
    created_at: str

class VideoCreate(BaseModel):
    youtube_url: str
    tag: str
    title: Optional[str] = None
    description: Optional[str] = None
    is_featured: bool = False

class VideoUpdate(BaseModel):
    youtube_url: Optional[str] = None
    tag: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    thumbnail_position: Optional[dict] = None
    is_featured: Optional[bool] = None
    order: Optional[int] = None

class Photo(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    gallery_id: str
    filename: str
    original_filename: Optional[str] = None
    url: str
    thumbnail_url: Optional[str] = None  # Small thumbnail for grids
    thumbnail_medium_url: Optional[str] = None  # Medium thumbnail for gallery view
    uploaded_by: str  # "photographer", "guest", or "contributor"
    contributor_name: Optional[str] = None  # Company name if uploaded by contributor
    section_id: Optional[str] = None
    uploaded_at: str
    order: int = 0
    is_highlight: bool = False
    is_hidden: bool = False
    is_flagged: bool = False
    auto_flagged: bool = False  # True if system auto-flagged (e.g., thumbnail failure)
    flagged_at: Optional[str] = None
    flagged_reason: Optional[str] = None

class PasswordVerify(BaseModel):
    password: str

# Bulk action models
class BulkPhotoAction(BaseModel):
    photo_ids: List[str]
    action: str  # delete, move_section, highlight, unhighlight, hide, unhide
    section_id: Optional[str] = None

class PhotoReorder(BaseModel):
    photo_orders: List[dict]  # [{"id": "...", "order": 0}, ...]

class BulkFlagAction(BaseModel):
    photo_ids: List[str]
    reason: Optional[str] = None

class BulkUnflagAction(BaseModel):
    photo_ids: List[str]

class PublicGallery(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    title: str
    description: Optional[str] = None
    photographer_name: str
    has_password: bool
    cover_photo_url: Optional[str] = None
    cover_photo_position: Optional[dict] = None  # {scale, positionX, positionY}
    sections: List[Section] = []
    event_title: Optional[str] = None
    event_date: Optional[str] = None
    coordinator_name: Optional[str] = None  # Event coordinator
    contributors: List[dict] = []  # List of {name, role} for all contributors
    is_expired: bool = False
    guest_upload_enabled: bool = True
    has_download_all_password: bool = False
    theme: str = "classic"
    photo_count: int = 0

# ============================================
# SUBSCRIPTION & BILLING MODELS
# ============================================

class SubscriptionInfo(BaseModel):
    plan: str = PLAN_FREE
    billing_cycle_start: Optional[str] = None
    event_credits: int = 0
    extra_credits: int = 0
    payment_status: str = PAYMENT_NONE
    payment_proof_url: Optional[str] = None
    payment_submitted_at: Optional[str] = None
    # Override mode
    override_mode: Optional[str] = None
    override_expires: Optional[str] = None
    override_reason: Optional[str] = None
    override_assigned_at: Optional[str] = None

class AssignOverrideMode(BaseModel):
    user_id: str
    mode: str  # founders_circle, early_partner_beta, comped_pro, comped_standard
    duration_months: int = Field(ge=1, le=24)  # 1-24 months max
    reason: str

class RemoveOverrideMode(BaseModel):
    user_id: str
    reason: str

class UpdatePricing(BaseModel):
    standard_monthly: Optional[int] = None
    pro_monthly: Optional[int] = None
    extra_credit: Optional[int] = None

class PurchaseExtraCredits(BaseModel):
    quantity: int = Field(ge=1, le=10)

class PaymentProofSubmit(BaseModel):
    proof_url: str  # URL to uploaded screenshot
    notes: Optional[str] = None

class ApprovePayment(BaseModel):
    user_id: str
    notes: Optional[str] = None

class RejectPayment(BaseModel):
    user_id: str
    reason: str

class PaymentMethod(BaseModel):
    enabled: bool = True
    name: str
    account_name: str = ""
    account_number: str = ""
    bank_name: Optional[str] = None  # For bank transfer
    qr_code_url: Optional[str] = None

class BillingSettings(BaseModel):
    billing_enforcement_enabled: bool = False
    pricing: dict = Field(default_factory=lambda: DEFAULT_PRICING.copy())
    payment_methods: dict = Field(default_factory=lambda: {
        "gcash": {
            "enabled": True,
            "name": "GCash",
            "account_name": "Less Real Moments",
            "account_number": "09952568450",
            "qr_code_url": None
        },
        "maya": {
            "enabled": True,
            "name": "Maya",
            "account_name": "Less Real Moments",
            "account_number": "09952568450",
            "qr_code_url": None
        },
        "bank": {
            "enabled": False,
            "name": "Bank Transfer",
            "account_name": "",
            "account_number": "",
            "bank_name": "",
            "qr_code_url": None
        }
    })
    # Universal paid plan settings (applies to Standard and Pro)
    paid_gallery_expiration_months: int = 6  # 1-6 months
    paid_storage_limit_gb: int = -1  # -1 = unlimited, or 10, 20, 30, etc.

# ============================================
# NOTIFICATION SYSTEM MODELS
# ============================================

class Notification(BaseModel):
    id: str
    user_id: str
    type: str  # "payment_approved", "payment_rejected", "plan_changed", "credits_added"
    title: str
    message: str
    read: bool = False
    created_at: str
    metadata: Optional[dict] = None

class NotificationCreate(BaseModel):
    user_id: str
    type: str
    title: str
    message: str
    metadata: Optional[dict] = None

# ============================================
# PAYMENT DISPUTE MODELS
# ============================================

class PaymentDispute(BaseModel):
    dispute_message: str
    new_proof_url: str

# ============================================
# TRANSACTION HISTORY MODELS
# ============================================

class Transaction(BaseModel):
    id: str
    user_id: str
    type: str  # "subscription", "upgrade", "extra_credits"
    amount: int
    plan: Optional[str] = None
    extra_credits: Optional[int] = None
    status: str  # "pending", "approved", "rejected", "disputed"
    payment_proof_url: Optional[str] = None
    admin_notes: Optional[str] = None
    rejection_reason: Optional[str] = None
    dispute_message: Optional[str] = None
    dispute_proof_url: Optional[str] = None
    created_at: str
    resolved_at: Optional[str] = None

# ============================================
# GLOBAL FEATURE TOGGLE MODELS
# ============================================

class GlobalFeatureToggles(BaseModel):
    """Global feature toggles for all modes and plans - admin controlled"""
    # Override Modes
    founders_circle: dict = Field(default_factory=lambda: DEFAULT_MODE_FEATURES[MODE_FOUNDERS_CIRCLE].copy())
    early_partner_beta: dict = Field(default_factory=lambda: DEFAULT_MODE_FEATURES[MODE_EARLY_PARTNER_BETA].copy())
    comped_pro: dict = Field(default_factory=lambda: DEFAULT_MODE_FEATURES[MODE_COMPED_PRO].copy())
    comped_standard: dict = Field(default_factory=lambda: DEFAULT_MODE_FEATURES[MODE_COMPED_STANDARD].copy())
    enterprise_access: dict = Field(default_factory=lambda: DEFAULT_MODE_FEATURES[MODE_ENTERPRISE_ACCESS].copy())
    # Payment Plans
    free: dict = Field(default_factory=lambda: DEFAULT_PLAN_FEATURES[PLAN_FREE].copy())
    standard: dict = Field(default_factory=lambda: DEFAULT_PLAN_FEATURES[PLAN_STANDARD].copy())
    pro: dict = Field(default_factory=lambda: DEFAULT_PLAN_FEATURES[PLAN_PRO].copy())

# ============================================
# COLLAGE LAYOUT PRESET MODELS
# ============================================

class CollagePresetPlaceholder(BaseModel):
    """Individual placeholder/frame in a collage preset"""
    id: str
    x: float  # Position X (percentage 0-100)
    y: float  # Position Y (percentage 0-100)
    width: float  # Width (percentage 0-100)
    height: float  # Height (percentage 0-100)
    ratio: str = "3:2"  # "3:2" (landscape), "2:3" (portrait), "1:1" (square), "custom"
    z_index: int = 0  # Layer order

class CollagePresetSettings(BaseModel):
    """Visual settings for a collage preset"""
    gap: int = 3  # Gap between placeholders in pixels
    border_thickness: int = 0  # Border thickness in pixels
    border_color: str = "#000000"  # Border color
    border_opacity: float = 1.0  # Border opacity (0-1)
    background_color: str = "#000000"  # Canvas background color

class CollagePresetCreate(BaseModel):
    """Model for creating a new collage preset"""
    name: str
    description: Optional[str] = None
    tags: List[str] = []
    placeholders: List[CollagePresetPlaceholder]
    settings: CollagePresetSettings = CollagePresetSettings()
    is_default: bool = False

class CollagePresetUpdate(BaseModel):
    """Model for updating a collage preset"""
    name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    placeholders: Optional[List[CollagePresetPlaceholder]] = None
    settings: Optional[CollagePresetSettings] = None
    is_default: Optional[bool] = None

class CollagePreset(BaseModel):
    """Full collage preset model"""
    id: str
    name: str
    description: Optional[str] = None
    tags: List[str] = []
    placeholders: List[CollagePresetPlaceholder]
    settings: CollagePresetSettings
    is_default: bool = False
    created_by: str  # Admin user ID
    created_at: str
    updated_at: str

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

# ============================================
# AUTHORITY HIERARCHY HELPER FUNCTIONS
# ============================================

async def get_global_feature_toggles():
    """Get global feature toggles from database or return defaults"""
    toggles = await db.site_config.find_one({"type": "global_feature_toggles"}, {"_id": 0})
    if not toggles:
        return {
            # Override Modes
            MODE_FOUNDERS_CIRCLE: DEFAULT_MODE_FEATURES[MODE_FOUNDERS_CIRCLE].copy(),
            MODE_EARLY_PARTNER_BETA: DEFAULT_MODE_FEATURES[MODE_EARLY_PARTNER_BETA].copy(),
            MODE_COMPED_PRO: DEFAULT_MODE_FEATURES[MODE_COMPED_PRO].copy(),
            MODE_COMPED_STANDARD: DEFAULT_MODE_FEATURES[MODE_COMPED_STANDARD].copy(),
            MODE_ENTERPRISE_ACCESS: DEFAULT_MODE_FEATURES[MODE_ENTERPRISE_ACCESS].copy(),
            # Payment Plans
            PLAN_FREE: DEFAULT_PLAN_FEATURES[PLAN_FREE].copy(),
            PLAN_STANDARD: DEFAULT_PLAN_FEATURES[PLAN_STANDARD].copy(),
            PLAN_PRO: DEFAULT_PLAN_FEATURES[PLAN_PRO].copy()
        }
    return {
        # Override Modes
        MODE_FOUNDERS_CIRCLE: toggles.get(MODE_FOUNDERS_CIRCLE, DEFAULT_MODE_FEATURES[MODE_FOUNDERS_CIRCLE]),
        MODE_EARLY_PARTNER_BETA: toggles.get(MODE_EARLY_PARTNER_BETA, DEFAULT_MODE_FEATURES[MODE_EARLY_PARTNER_BETA]),
        MODE_COMPED_PRO: toggles.get(MODE_COMPED_PRO, DEFAULT_MODE_FEATURES[MODE_COMPED_PRO]),
        MODE_COMPED_STANDARD: toggles.get(MODE_COMPED_STANDARD, DEFAULT_MODE_FEATURES[MODE_COMPED_STANDARD]),
        MODE_ENTERPRISE_ACCESS: toggles.get(MODE_ENTERPRISE_ACCESS, DEFAULT_MODE_FEATURES[MODE_ENTERPRISE_ACCESS]),
        # Payment Plans
        PLAN_FREE: toggles.get(PLAN_FREE, DEFAULT_PLAN_FEATURES[PLAN_FREE]),
        PLAN_STANDARD: toggles.get(PLAN_STANDARD, DEFAULT_PLAN_FEATURES[PLAN_STANDARD]),
        PLAN_PRO: toggles.get(PLAN_PRO, DEFAULT_PLAN_FEATURES[PLAN_PRO])
    }

async def resolve_user_features(user: dict) -> dict:
    """
    Resolve user's effective features using AUTHORITY HIERARCHY:
    1. Admin Override Mode (highest) - if active and not expired
    2. Normal Payment/Subscription Plan
    3. Payment Status
    
    Returns dict with all feature flags and metadata
    """
    global_toggles = await get_global_feature_toggles()
    
    # Get user info
    override_mode = user.get("override_mode")
    override_expires = user.get("override_expires")
    plan = user.get("plan", PLAN_FREE)
    payment_status = user.get("payment_status", PAYMENT_NONE)
    billing_settings = await get_billing_settings()
    billing_enabled = billing_settings.get("billing_enforcement_enabled", False)
    
    # Default result
    result = {
        "authority_source": None,  # What's providing the features
        "effective_plan": plan,
        "features": {},
        "has_unlimited_credits": False,
        "credits_available": user.get("event_credits", 0) + user.get("extra_credits", 0),
        "can_download": True,
        "override_active": False,
        "override_mode": None,
        "override_expires": None,
        "payment_required": False
    }
    
    # STEP 1: Check Admin Override Mode (HIGHEST AUTHORITY)
    if override_mode and override_expires:
        try:
            expires_dt = datetime.fromisoformat(override_expires.replace('Z', '+00:00'))
            logger.info(f"Checking override: mode={override_mode}, expires={expires_dt}, now={datetime.now(timezone.utc)}")
            if datetime.now(timezone.utc) < expires_dt:
                # Override is active! Use override mode features
                result["authority_source"] = "override_mode"
                result["override_active"] = True
                result["override_mode"] = override_mode
                result["override_expires"] = override_expires
                
                # Get mode features from global_toggles first, then fall back to defaults
                mode_features = global_toggles.get(override_mode, DEFAULT_MODE_FEATURES.get(override_mode, {})).copy()
                logger.info(f"Mode features for {override_mode}: {mode_features}")
                result["features"] = mode_features
                
                # Check unlimited credits from feature toggle
                if result["features"].get("unlimited_token", False):
                    result["has_unlimited_credits"] = True
                    result["credits_available"] = 999
                
                # Override mode always allows downloads (ignores payment status)
                result["can_download"] = True
                result["payment_required"] = False
                
                # Determine effective plan based on override mode
                if override_mode in [MODE_FOUNDERS_CIRCLE, MODE_EARLY_PARTNER_BETA, MODE_COMPED_PRO, MODE_ENTERPRISE_ACCESS]:
                    result["effective_plan"] = PLAN_PRO
                elif override_mode == MODE_COMPED_STANDARD:
                    result["effective_plan"] = PLAN_STANDARD
                
                logger.info(f"Returning override result: {result}")
                return result
        except (ValueError, TypeError) as e:
            logger.error(f"Override check error: {e}")
            pass  # Override expired or invalid, continue to normal plan
    
    # STEP 2: Normal Payment/Subscription Plan
    result["authority_source"] = "payment_plan"
    result["effective_plan"] = plan
    
    # Get plan features from global_toggles first, then fall back to defaults
    plan_features = global_toggles.get(plan, DEFAULT_PLAN_FEATURES.get(plan, {})).copy()
    result["features"] = plan_features
    
    # Check unlimited credits from feature toggle (unlikely for regular plans)
    if result["features"].get("unlimited_token", False):
        result["has_unlimited_credits"] = True
        result["credits_available"] = 999
    
    # STEP 3: Payment Status Check (only if billing enforcement enabled)
    if billing_enabled and plan != PLAN_FREE:
        if payment_status == PAYMENT_PENDING:
            result["can_download"] = False
            result["payment_required"] = True
        elif payment_status != PAYMENT_APPROVED:
            result["payment_required"] = True
    
    return result

# ============================================
# EMAIL NOTIFICATION SERVICE
# ============================================

# Initialize Resend
resend.api_key = os.environ.get("RESEND_API_KEY")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "lessrealmoments@gmail.com")

async def send_email(to_email: str, subject: str, html_content: str):
    """Send email using Resend API (non-blocking)"""
    if not resend.api_key:
        logger.warning("RESEND_API_KEY not configured, skipping email")
        return None
    
    try:
        params = {
            "from": SENDER_EMAIL,
            "to": [to_email],
            "subject": subject,
            "html": html_content
        }
        result = await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Email sent to {to_email}: {subject}")
        return result
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {str(e)}")
        return None

# Email Templates
def get_email_template(template_type: str, data: dict) -> tuple:
    """Get email subject and HTML content for different notification types"""
    
    brand_name = "Less Real Moments"
    
    if template_type == "admin_new_account":
        subject = f"🎉 New Account Created - {data.get('name', 'Unknown')}"
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #7c3aed;">New Photographer Account</h2>
            <p>A new photographer has registered on {brand_name}:</p>
            <div style="background: #f4f4f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <p><strong>Name:</strong> {data.get('name', 'N/A')}</p>
                <p><strong>Email:</strong> {data.get('email', 'N/A')}</p>
                <p><strong>Business:</strong> {data.get('business_name', 'N/A')}</p>
                <p><strong>Registered:</strong> {data.get('created_at', 'N/A')}</p>
            </div>
            <p style="color: #71717a; font-size: 12px;">This is an automated notification from {brand_name}.</p>
        </div>
        """
        return subject, html
    
    elif template_type == "admin_payment_submitted":
        subject = f"💳 Payment Proof Submitted - {data.get('name', 'Unknown')}"
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #7c3aed;">New Payment Awaiting Review</h2>
            <p>A photographer has submitted payment proof:</p>
            <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #f59e0b;">
                <p><strong>Name:</strong> {data.get('name', 'N/A')}</p>
                <p><strong>Email:</strong> {data.get('email', 'N/A')}</p>
                <p><strong>Request Type:</strong> {data.get('request_type', 'Upgrade')}</p>
                <p><strong>Plan/Credits:</strong> {data.get('plan_or_credits', 'N/A')}</p>
            </div>
            <p><a href="{data.get('admin_url', '#')}" style="display: inline-block; background: #7c3aed; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Review Payment</a></p>
            <p style="color: #71717a; font-size: 12px;">Please review this payment in the admin dashboard.</p>
        </div>
        """
        return subject, html
    
    elif template_type == "customer_payment_pending":
        subject = f"⏳ Payment Received - Awaiting Approval"
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #7c3aed;">Payment Submitted Successfully!</h2>
            <p>Hi {data.get('name', 'there')},</p>
            <p>We've received your payment proof and it's now being reviewed by our team.</p>
            <div style="background: #dbeafe; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #3b82f6;">
                <p><strong>Request:</strong> {data.get('request_type', 'Plan Upgrade')}</p>
                <p><strong>Status:</strong> Pending Review</p>
            </div>
            <p>You'll receive another email once your payment has been processed. This usually takes less than 24 hours.</p>
            <p>Thank you for choosing {brand_name}!</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="color: #71717a; font-size: 12px;">Questions? Contact us at {ADMIN_EMAIL}</p>
        </div>
        """
        return subject, html
    
    elif template_type == "customer_payment_approved":
        subject = f"✅ Payment Approved - You're All Set!"
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #22c55e;">Payment Approved! 🎉</h2>
            <p>Hi {data.get('name', 'there')},</p>
            <p>Great news! Your payment has been approved and your account has been updated.</p>
            <div style="background: #dcfce7; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #22c55e;">
                <p><strong>Plan:</strong> {data.get('plan', 'N/A')}</p>
                <p><strong>Credits:</strong> {data.get('credits', 'N/A')}</p>
                <p><strong>Status:</strong> Active</p>
            </div>
            <p>You now have full access to all your plan features. Start creating amazing galleries!</p>
            <p><a href="{data.get('dashboard_url', '#')}" style="display: inline-block; background: #7c3aed; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Go to Dashboard</a></p>
            <p>Thank you for being part of {brand_name}!</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="color: #71717a; font-size: 12px;">Questions? Contact us at {ADMIN_EMAIL}</p>
        </div>
        """
        return subject, html
    
    elif template_type == "customer_payment_rejected":
        subject = f"❌ Payment Review Update"
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #ef4444;">Payment Could Not Be Verified</h2>
            <p>Hi {data.get('name', 'there')},</p>
            <p>Unfortunately, we were unable to verify your recent payment submission.</p>
            <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #ef4444;">
                <p><strong>Reason:</strong> {data.get('reason', 'Payment details could not be verified')}</p>
            </div>
            <p><strong>What you can do:</strong></p>
            <ul>
                <li>Double-check your payment was sent to the correct account</li>
                <li>Ensure the screenshot clearly shows the transaction details</li>
                <li>You have <strong>1 attempt</strong> to dispute and resubmit from your dashboard</li>
            </ul>
            <p>If you need assistance, please contact us:</p>
            <p>📧 {ADMIN_EMAIL}<br>📱 09952568450</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="color: #71717a; font-size: 12px;">This is an automated message from {brand_name}.</p>
        </div>
        """
        return subject, html
    
    return "Notification", "<p>You have a notification from Less Real Moments.</p>"

# ============================================
# SUBSCRIPTION HELPER FUNCTIONS
# ============================================

def get_effective_plan(user: dict) -> str:
    """Get user's effective plan considering override modes"""
    override_mode = user.get("override_mode")
    override_expires = user.get("override_expires")
    
    # Check if override is active and not expired
    if override_mode and override_expires:
        try:
            expires = datetime.fromisoformat(override_expires.replace('Z', '+00:00'))
            if expires > datetime.now(timezone.utc):
                # Map override modes to effective plans
                if override_mode in [MODE_FOUNDERS_CIRCLE, MODE_EARLY_PARTNER_BETA, MODE_COMPED_PRO, MODE_ENTERPRISE_ACCESS]:
                    return PLAN_PRO
                elif override_mode == MODE_COMPED_STANDARD:
                    return PLAN_STANDARD
        except:
            pass
    
    return user.get("plan", PLAN_FREE)

def get_effective_credits(user: dict) -> int:
    """Get user's available credits (base + extra)"""
    override_mode = user.get("override_mode")
    override_expires = user.get("override_expires")
    
    # Check if override is active
    if override_mode and override_expires:
        try:
            expires = datetime.fromisoformat(override_expires.replace('Z', '+00:00'))
            if expires > datetime.now(timezone.utc):
                mode_credits = MODE_CREDITS.get(override_mode, 0)
                if mode_credits == -1:  # Unlimited (founders_circle)
                    return 999
                # For other override modes, use actual remaining credits
                # (event_credits stores the remaining credits after deductions)
                base_credits = user.get("event_credits", 0)
                extra_credits = user.get("extra_credits", 0)
                return max(0, base_credits + extra_credits)
        except:
            pass
    
    # Regular plan credits
    base_credits = user.get("event_credits", 0)
    extra_credits = user.get("extra_credits", 0)
    return max(0, base_credits + extra_credits)

def is_feature_enabled_for_user(user: dict, feature: str) -> bool:
    """Check if a feature is enabled for the user based on their plan"""
    effective_plan = get_effective_plan(user)
    
    # Check user-specific feature toggles first
    user_toggles = user.get("feature_toggles", {})
    if feature in user_toggles:
        if not user_toggles[feature]:
            return False
    
    # Standard features available to Standard and Pro
    if feature in STANDARD_FEATURES:
        return effective_plan in [PLAN_STANDARD, PLAN_PRO]
    
    # Pro features only for Pro
    if feature in PRO_FEATURES:
        return effective_plan == PLAN_PRO
    
    return True  # Default allow for unlisted features

def can_download(user: dict) -> bool:
    """Check if user can download (payment not pending)"""
    payment_status = user.get("payment_status", PAYMENT_NONE)
    return payment_status != PAYMENT_PENDING

def is_gallery_locked(gallery: dict) -> bool:
    """Check if gallery is past edit window (7 days)"""
    created_at = gallery.get("created_at")
    if not created_at:
        return False
    try:
        created = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
        lock_date = created + timedelta(days=GALLERY_EDIT_LOCK_DAYS)
        return datetime.now(timezone.utc) > lock_date
    except:
        return False

def is_demo_expired(gallery: dict) -> bool:
    """Check if demo gallery's feature window has expired (6 hours)"""
    if not gallery.get("is_demo"):
        return False
    created_at = gallery.get("created_at")
    if not created_at:
        return False
    try:
        created = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
        expiry = created + timedelta(hours=DEMO_FEATURE_WINDOW_HOURS)
        return datetime.now(timezone.utc) > expiry
    except:
        return False

async def get_billing_settings() -> dict:
    """Get current billing settings from database"""
    default_payment_methods = {
        "gcash": {"enabled": True, "name": "GCash", "account_name": "Less Real Moments", "account_number": "09952568450", "qr_code_url": None},
        "maya": {"enabled": True, "name": "Maya", "account_name": "Less Real Moments", "account_number": "09952568450", "qr_code_url": None},
        "bank": {"enabled": False, "name": "Bank Transfer", "account_name": "", "account_number": "", "bank_name": "", "qr_code_url": None}
    }
    
    settings = await db.site_config.find_one({"type": "billing_settings"}, {"_id": 0})
    if not settings:
        return {
            "billing_enforcement_enabled": False,
            "pricing": DEFAULT_PRICING.copy(),
            "payment_methods": default_payment_methods,
            "paid_gallery_expiration_months": 6,
            "paid_storage_limit_gb": -1
        }
    return {
        "billing_enforcement_enabled": settings.get("billing_enforcement_enabled", False),
        "pricing": settings.get("pricing", DEFAULT_PRICING.copy()),
        "payment_methods": settings.get("payment_methods", default_payment_methods),
        "paid_gallery_expiration_months": settings.get("paid_gallery_expiration_months", 6),
        "paid_storage_limit_gb": settings.get("paid_storage_limit_gb", -1)
    }

async def get_effective_storage_quota(user: dict) -> int:
    """
    Calculate effective storage quota for a user based on:
    1. Override mode settings (if active)
    2. Plan-specific settings from global toggles
    3. Billing settings fallback for paid plans
    4. User-specific override (if set by admin)
    Returns storage in bytes. -1 means unlimited.
    """
    # Check for user-specific storage quota override (set by admin)
    if user.get("storage_quota_override"):
        return user.get("storage_quota_override")
    
    override_mode = user.get("override_mode")
    override_expires = user.get("override_expires")
    
    # Check if override mode is active and not expired
    if override_mode and override_expires:
        try:
            expires = datetime.fromisoformat(override_expires.replace('Z', '+00:00'))
            if expires > datetime.now(timezone.utc):
                # Get mode-specific storage limit
                global_toggles = await get_global_feature_toggles()
                if override_mode in global_toggles:
                    storage_gb = global_toggles[override_mode].get("storage_limit_gb", 50)
                    if storage_gb == -1:
                        return -1  # Unlimited
                    return storage_gb * 1024 * 1024 * 1024  # Convert GB to bytes
        except:
            pass
    
    # For paid plans, check global toggles first, then fall back to billing settings
    plan = user.get("plan", PLAN_FREE)
    if plan in [PLAN_STANDARD, PLAN_PRO]:
        global_toggles = await get_global_feature_toggles()
        plan_config = global_toggles.get(plan, {})
        
        if plan_config.get("storage_limit_gb") is not None:
            # Use plan-specific storage from global toggles
            storage_gb = plan_config.get("storage_limit_gb")
            if storage_gb == -1:
                return -1  # Unlimited
            return int(storage_gb * 1024 * 1024 * 1024)  # Convert GB to bytes
        else:
            # Fall back to billing settings
            billing_settings = await get_billing_settings()
            storage_gb = billing_settings.get("paid_storage_limit_gb", -1)
            if storage_gb == -1:
                return -1  # Unlimited
            return storage_gb * 1024 * 1024 * 1024  # Convert GB to bytes
    
    # Default for free users
    return DEFAULT_STORAGE_QUOTA

# ============================================
# NOTIFICATION HELPER FUNCTIONS
# ============================================

async def create_notification(user_id: str, notification_type: str, title: str, message: str, metadata: dict = None):
    """Create a notification for a user"""
    notification = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": notification_type,
        "title": title,
        "message": message,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "metadata": metadata or {}
    }
    await db.notifications.insert_one(notification)
    return notification

async def create_transaction(user_id: str, tx_type: str, amount: int, status: str, 
                           plan: str = None, extra_credits: int = None,
                           payment_proof_url: str = None, admin_notes: str = None,
                           rejection_reason: str = None, dispute_message: str = None,
                           dispute_proof_url: str = None, resolved_at: str = None):
    """Create a transaction record"""
    transaction = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": tx_type,
        "amount": amount,
        "plan": plan,
        "extra_credits": extra_credits,
        "status": status,
        "payment_proof_url": payment_proof_url,
        "admin_notes": admin_notes,
        "rejection_reason": rejection_reason,
        "dispute_message": dispute_message,
        "dispute_proof_url": dispute_proof_url,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "resolved_at": resolved_at
    }
    await db.transactions.insert_one(transaction)
    return transaction

async def reset_user_credits_if_needed(user_id: str):
    """Reset user credits if billing cycle has passed"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        return
    
    billing_start = user.get("billing_cycle_start")
    if not billing_start:
        # Initialize billing cycle
        await db.users.update_one(
            {"id": user_id},
            {"$set": {
                "billing_cycle_start": datetime.now(timezone.utc).isoformat(),
                "event_credits": PLAN_CREDITS.get(user.get("plan", PLAN_FREE), 0),
                "extra_credits": 0
            }}
        )
        return
    
    try:
        start = datetime.fromisoformat(billing_start.replace('Z', '+00:00'))
        # Check if a month has passed
        if datetime.now(timezone.utc) >= start + timedelta(days=30):
            plan = user.get("plan", PLAN_FREE)
            new_credits = PLAN_CREDITS.get(plan, 0)
            
            # Check override mode
            override_mode = user.get("override_mode")
            override_expires = user.get("override_expires")
            if override_mode and override_expires:
                try:
                    expires = datetime.fromisoformat(override_expires.replace('Z', '+00:00'))
                    if expires > datetime.now(timezone.utc):
                        new_credits = MODE_CREDITS.get(override_mode, new_credits)
                        if new_credits == -1:
                            new_credits = 999  # Unlimited
                except:
                    pass
            
            await db.users.update_one(
                {"id": user_id},
                {"$set": {
                    "billing_cycle_start": datetime.now(timezone.utc).isoformat(),
                    "event_credits": new_credits,
                    "extra_credits": 0  # Extra credits don't roll over
                }}
            )
    except:
        pass

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def generate_random_password(length: int = 12) -> str:
    """Generate a random password"""
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    return ''.join(secrets.choice(alphabet) for _ in range(length))

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication")
        
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication")

async def get_admin_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Verify admin token"""
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if not payload.get("is_admin"):
            raise HTTPException(status_code=403, detail="Admin access required")
        return {"is_admin": True}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication")

@api_router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "photoshare-api"}

@api_router.post("/auth/register", response_model=Token)
async def register(user_data: UserRegister, background_tasks: BackgroundTasks):
    existing = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    hashed_pw = hash_password(user_data.password)
    created_at = datetime.now(timezone.utc).isoformat()
    
    user_doc = {
        "id": user_id,
        "email": user_data.email,
        "password": hashed_pw,
        "name": user_data.name,
        "business_name": user_data.business_name,
        "max_galleries": DEFAULT_MAX_GALLERIES,
        "galleries_created_total": 0,
        "storage_quota": DEFAULT_STORAGE_QUOTA,
        "storage_used": 0,
        "created_at": created_at
    }
    
    await db.users.insert_one(user_doc)
    
    # Send email notification to admin about new account
    subject, html = get_email_template("admin_new_account", {
        "name": user_data.name,
        "email": user_data.email,
        "business_name": user_data.business_name or "Not specified",
        "created_at": created_at
    })
    background_tasks.add_task(send_email, ADMIN_EMAIL, subject, html)
    
    access_token = create_access_token({"sub": user_id})
    user = User(
        id=user_id,
        email=user_data.email,
        name=user_data.name,
        business_name=user_data.business_name,
        max_galleries=DEFAULT_MAX_GALLERIES,
        galleries_created_total=0,
        storage_quota=DEFAULT_STORAGE_QUOTA,
        storage_used=0,
        created_at=user_doc["created_at"]
    )
    
    return Token(access_token=access_token, token_type="bearer", user=user)

@api_router.post("/auth/login", response_model=Token)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Check if user is suspended
    if user.get("status") == "suspended":
        raise HTTPException(status_code=403, detail="Your account has been suspended. Please contact support.")
    
    access_token = create_access_token({"sub": user["id"]})
    user_obj = User(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        business_name=user.get("business_name"),
        max_galleries=user.get("max_galleries", DEFAULT_MAX_GALLERIES),
        galleries_created_total=user.get("galleries_created_total", 0),
        storage_quota=user.get("storage_quota", DEFAULT_STORAGE_QUOTA),
        storage_used=user.get("storage_used", 0),
        created_at=user["created_at"]
    )
    
    return Token(access_token=access_token, token_type="bearer", user=user_obj)

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: dict = Depends(get_current_user)):
    # Get full user data for effective quota calculation
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    
    # Calculate effective storage quota from global toggles
    effective_storage = await get_effective_storage_quota(user)
    
    return User(
        id=current_user["id"],
        email=current_user["email"],
        name=current_user["name"],
        business_name=current_user.get("business_name"),
        max_galleries=current_user.get("max_galleries", DEFAULT_MAX_GALLERIES),
        galleries_created_total=current_user.get("galleries_created_total", 0),
        storage_quota=effective_storage if effective_storage != -1 else 999999999999,  # -1 means unlimited
        storage_used=current_user.get("storage_used", 0),
        created_at=current_user["created_at"]
    )

@api_router.get("/auth/effective-settings")
async def get_effective_settings(current_user: dict = Depends(get_current_user)):
    """Get the user's effective plan settings (storage, expiration) based on their plan/override mode"""
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    
    # Get effective storage quota
    effective_storage = await get_effective_storage_quota(user)
    
    # Get effective gallery expiration
    global_toggles = await get_global_feature_toggles()
    override_mode = user.get("override_mode")
    override_expires = user.get("override_expires")
    plan = user.get("plan", PLAN_FREE)
    
    gallery_expiration_days = 180  # Default
    settings_source = "default"
    
    # Check override mode first
    if override_mode and override_expires:
        try:
            expires = datetime.fromisoformat(override_expires.replace('Z', '+00:00'))
            if expires > datetime.now(timezone.utc):
                mode_config = global_toggles.get(override_mode, {})
                gallery_expiration_days = mode_config.get("gallery_expiration_days", 180)
                settings_source = f"override:{override_mode}"
        except:
            pass
    
    # If no override, check plan config
    if settings_source == "default" and plan in [PLAN_STANDARD, PLAN_PRO]:
        plan_config = global_toggles.get(plan, {})
        if plan_config.get("gallery_expiration_days"):
            gallery_expiration_days = plan_config.get("gallery_expiration_days")
            settings_source = f"plan:{plan}"
    
    return {
        "plan": plan,
        "override_mode": override_mode if settings_source.startswith("override") else None,
        "settings_source": settings_source,
        "storage_limit_bytes": effective_storage,
        "storage_limit_gb": -1 if effective_storage == -1 else round(effective_storage / (1024 * 1024 * 1024), 1),
        "storage_unlimited": effective_storage == -1,
        "storage_used_bytes": user.get("storage_used", 0),
        "gallery_expiration_days": gallery_expiration_days,
        "gallery_expiration_display": "Never" if gallery_expiration_days >= 36500 else f"{gallery_expiration_days} days"
    }

@api_router.put("/auth/profile", response_model=User)
async def update_profile(profile: UserProfile, current_user: dict = Depends(get_current_user)):
    """Update photographer profile (name, business name)"""
    update_data = {}
    if profile.name is not None:
        update_data["name"] = profile.name
    if profile.business_name is not None:
        update_data["business_name"] = profile.business_name
    
    if update_data:
        await db.users.update_one({"id": current_user["id"]}, {"$set": update_data})
    
    updated_user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    return User(
        id=updated_user["id"],
        email=updated_user["email"],
        name=updated_user["name"],
        business_name=updated_user.get("business_name"),
        max_galleries=updated_user.get("max_galleries", DEFAULT_MAX_GALLERIES),
        galleries_created_total=updated_user.get("galleries_created_total", 0),
        created_at=updated_user["created_at"]
    )

@api_router.put("/auth/change-password")
async def change_password(data: ChangePassword, current_user: dict = Depends(get_current_user)):
    """Change user password"""
    # Verify current password
    if not verify_password(data.current_password, current_user["password"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    # Validate new password length
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    
    # Hash and save new password
    hashed_pw = hash_password(data.new_password)
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"password": hashed_pw}}
    )
    
    return {"message": "Password updated successfully"}

@api_router.post("/auth/forgot-password")
async def forgot_password(data: ForgotPassword):
    """Send new password to user's email"""
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user:
        # Don't reveal if email exists
        return {"message": "If this email is registered, a new password has been sent."}
    
    # Generate new password
    new_password = generate_random_password()
    hashed_pw = hash_password(new_password)
    
    # Update password in database
    await db.users.update_one({"id": user["id"]}, {"$set": {"password": hashed_pw}})
    
    # Send email with new password
    if not RESEND_API_KEY:
        logging.error("RESEND_API_KEY not configured in environment")
        raise HTTPException(status_code=500, detail="Email service not configured. Please contact support.")
    
    try:
        params = {
            "from": SENDER_EMAIL,
            "to": [data.email],
            "subject": "PhotoShare - Your New Password",
            "html": f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Password Reset</h2>
                <p>Hello {user['name']},</p>
                <p>Your password has been reset. Here is your new password:</p>
                <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <code style="font-size: 18px; color: #333;">{new_password}</code>
                </div>
                <p>Please login and change your password immediately for security.</p>
                <p style="color: #666; font-size: 12px;">If you didn't request this, please contact support.</p>
            </div>
            """
        }
        logging.info(f"Attempting to send password reset email to {data.email} from {SENDER_EMAIL}")
        result = await asyncio.to_thread(resend.Emails.send, params)
        logging.info(f"Password reset email sent to {data.email}, result: {result}")
    except Exception as e:
        logging.error(f"Failed to send password reset email to {data.email}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to send email. Please try again later.")
    
    return {"message": "If this email is registered, a new password has been sent."}

# ============ ADMIN ENDPOINTS ============

@api_router.post("/admin/login", response_model=AdminToken)
async def admin_login(credentials: AdminLogin):
    """Admin login with fixed credentials"""
    if credentials.username != ADMIN_USERNAME or credentials.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    
    access_token = create_access_token({"sub": "admin", "is_admin": True})
    return AdminToken(access_token=access_token, token_type="bearer", is_admin=True)

@api_router.get("/admin/photographers", response_model=List[PhotographerAdmin])
async def get_all_photographers(admin: dict = Depends(get_admin_user)):
    """Get all photographers with their gallery limits using aggregation to avoid N+1 queries"""
    # Use aggregation pipeline to get users with gallery counts in a single query
    pipeline = [
        {"$match": {}},
        {"$lookup": {
            "from": "galleries",
            "localField": "id",
            "foreignField": "photographer_id",
            "as": "user_galleries"
        }},
        {"$addFields": {
            "active_galleries": {"$size": "$user_galleries"}
        }},
        {"$project": {
            "_id": 0,
            "password": 0,
            "user_galleries": 0,
            "google_session_token": 0
        }},
        {"$limit": 1000}  # Safety limit
    ]
    
    users = await db.users.aggregate(pipeline).to_list(None)
    
    result = []
    for user in users:
        result.append(PhotographerAdmin(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            business_name=user.get("business_name"),
            max_galleries=user.get("max_galleries", DEFAULT_MAX_GALLERIES),
            galleries_created_total=user.get("galleries_created_total", 0),
            active_galleries=user.get("active_galleries", 0),
            storage_quota=user.get("storage_quota", DEFAULT_STORAGE_QUOTA),
            storage_used=user.get("storage_used", 0),
            status=user.get("status", "active"),
            created_at=user["created_at"],
            # Subscription fields
            plan=user.get("plan", PLAN_FREE),
            event_credits=user.get("event_credits", 0),
            extra_credits=user.get("extra_credits", 0),
            payment_status=user.get("payment_status", PAYMENT_NONE),
            override_mode=user.get("override_mode"),
            override_expires=user.get("override_expires"),
            requested_plan=user.get("requested_plan")
        ))
    
    return result

@api_router.put("/admin/photographers/{user_id}/gallery-limit")
async def update_gallery_limit(user_id: str, data: UpdateGalleryLimit, admin: dict = Depends(get_admin_user)):
    """Update max galleries for a photographer"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"max_galleries": data.max_galleries}}
    )
    
    return {"message": f"Gallery limit updated to {data.max_galleries}"}

@api_router.put("/admin/photographers/{user_id}/storage-quota")
async def update_storage_quota(user_id: str, data: UpdateStorageQuota, admin: dict = Depends(get_admin_user)):
    """Update storage quota for a photographer"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"storage_quota": data.storage_quota}}
    )
    
    # Convert bytes to human readable
    quota_mb = data.storage_quota / (1024 * 1024)
    return {"message": f"Storage quota updated to {quota_mb:.0f} MB"}

@api_router.put("/admin/photographers/{user_id}/status")
async def update_photographer_status(user_id: str, data: dict, admin: dict = Depends(get_admin_user)):
    """Suspend or activate a photographer account"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    status = data.get("status", "active")
    if status not in ["active", "suspended"]:
        raise HTTPException(status_code=400, detail="Invalid status. Use 'active' or 'suspended'")
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"status": status, "status_updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Log activity
    await db.activity_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": f"photographer_{status}",
        "target_type": "user",
        "target_id": user_id,
        "target_name": user.get("name", user["email"]),
        "admin_user": "admin",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": f"Photographer {status}", "status": status}

@api_router.delete("/admin/photographers/{user_id}")
async def delete_photographer(user_id: str, admin: dict = Depends(get_admin_user)):
    """Delete a photographer and all their data"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get all galleries
    galleries = await db.galleries.find({"photographer_id": user_id}, {"_id": 0}).to_list(None)
    
    # Delete all photos and their files
    for gallery in galleries:
        photos = await db.photos.find({"gallery_id": gallery["id"]}, {"_id": 0}).to_list(None)
        for photo in photos:
            file_path = UPLOAD_DIR / photo["filename"]
            if file_path.exists():
                file_path.unlink()
        await db.photos.delete_many({"gallery_id": gallery["id"]})
        
        # Delete cover photo if exists
        if gallery.get("cover_photo_url"):
            cover_filename = gallery["cover_photo_url"].split('/')[-1]
            cover_path = UPLOAD_DIR / cover_filename
            if cover_path.exists():
                cover_path.unlink()
    
    # Delete galleries
    await db.galleries.delete_many({"photographer_id": user_id})
    
    # Delete drive credentials and backups
    await db.drive_credentials.delete_many({"user_id": user_id})
    await db.drive_backups.delete_many({"user_id": user_id})
    
    # Delete user
    await db.users.delete_one({"id": user_id})
    
    # Log activity
    await db.activity_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "photographer_deleted",
        "target_type": "user",
        "target_id": user_id,
        "target_name": user.get("name", user["email"]),
        "admin_user": "admin",
        "details": f"Deleted {len(galleries)} galleries",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": f"Photographer deleted along with {len(galleries)} galleries"}

@api_router.get("/admin/photographers/{user_id}/galleries")
async def get_photographer_galleries(user_id: str, admin: dict = Depends(get_admin_user)):
    """Get all galleries for a specific photographer"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    galleries = await db.galleries.find({"photographer_id": user_id}, {"_id": 0}).to_list(None)
    
    result = []
    for g in galleries:
        photo_count = await db.photos.count_documents({"gallery_id": g["id"]})
        result.append({
            "id": g["id"],
            "title": g["title"],
            "share_link": g["share_link"],
            "photo_count": photo_count,
            "theme": g.get("theme", "classic"),
            "created_at": g["created_at"],
            "cover_photo_url": g.get("cover_photo_url")
        })
    
    return result

@api_router.get("/admin/activity-logs")
async def get_activity_logs(limit: int = 50, admin: dict = Depends(get_admin_user)):
    """Get recent admin activity logs"""
    logs = await db.activity_logs.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(None)
    return logs

@api_router.get("/admin/settings")
async def get_admin_settings(admin: dict = Depends(get_admin_user)):
    """Get admin settings"""
    settings = await db.site_config.find_one({"type": "admin_settings"}, {"_id": 0})
    if not settings:
        settings = {
            "type": "admin_settings",
            "default_storage_quota": DEFAULT_STORAGE_QUOTA,
            "default_max_galleries": DEFAULT_MAX_GALLERIES,
            "default_theme": "classic",
            "auto_delete_days": 180
        }
    return settings

@api_router.put("/admin/settings")
async def update_admin_settings(data: dict, admin: dict = Depends(get_admin_user)):
    """Update admin settings"""
    allowed_fields = ["default_storage_quota", "default_max_galleries", "default_theme", "auto_delete_days"]
    update_data = {k: v for k, v in data.items() if k in allowed_fields}
    update_data["type"] = "admin_settings"
    
    await db.site_config.update_one(
        {"type": "admin_settings"},
        {"$set": update_data},
        upsert=True
    )
    
    return {"message": "Settings updated", "settings": update_data}

# ============================================
# Feature Toggles Endpoints
# ============================================

class FeatureToggle(BaseModel):
    qr_share: bool = True
    online_gallery: bool = True
    display_mode: bool = True
    contributor_link: bool = True
    auto_delete_enabled: bool = True  # If false, disable auto-delete after 6 months

@api_router.get("/admin/feature-toggles")
async def get_feature_toggles(admin: dict = Depends(get_admin_user)):
    """Get feature toggle settings (legacy - for backward compatibility)"""
    toggles = await db.site_config.find_one({"type": "feature_toggles"}, {"_id": 0})
    if not toggles:
        toggles = {
            "type": "feature_toggles",
            "qr_share": True,
            "online_gallery": True,
            "display_mode": True,
            "contributor_link": True,
            "auto_delete_enabled": True
        }
    return toggles

@api_router.put("/admin/feature-toggles")
async def update_feature_toggles(data: FeatureToggle, admin: dict = Depends(get_admin_user)):
    """Update feature toggle settings (legacy)"""
    toggle_doc = data.model_dump()
    toggle_doc["type"] = "feature_toggles"
    
    await db.site_config.update_one(
        {"type": "feature_toggles"},
        {"$set": toggle_doc},
        upsert=True
    )
    
    return {"message": "Feature toggles updated", "toggles": toggle_doc}

@api_router.get("/public/feature-toggles")
async def get_public_feature_toggles():
    """Get feature toggles for public use (to check feature availability)"""
    toggles = await db.site_config.find_one({"type": "feature_toggles"}, {"_id": 0})
    if not toggles:
        return {
            "qr_share": True,
            "online_gallery": True,
            "display_mode": True,
            "contributor_link": True,
            "auto_delete_enabled": True
        }
    # Remove internal type field from response
    return {k: v for k, v in toggles.items() if k != "type"}

# ============================================
# GLOBAL FEATURE TOGGLE SYSTEM (NEW)
# Admin-controlled features per package/mode
# ============================================

@api_router.get("/admin/global-feature-toggles")
async def get_admin_global_feature_toggles(admin: dict = Depends(get_admin_user)):
    """
    Get global feature toggles for all override modes and payment plans.
    Admin can configure which features are available for each mode/plan.
    """
    toggles = await get_global_feature_toggles()
    return {
        "override_modes": {
            MODE_FOUNDERS_CIRCLE: {
                "label": "Founders Circle",
                "features": toggles.get(MODE_FOUNDERS_CIRCLE, DEFAULT_MODE_FEATURES[MODE_FOUNDERS_CIRCLE])
            },
            MODE_EARLY_PARTNER_BETA: {
                "label": "Early Partner Beta",
                "features": toggles.get(MODE_EARLY_PARTNER_BETA, DEFAULT_MODE_FEATURES[MODE_EARLY_PARTNER_BETA])
            },
            MODE_COMPED_PRO: {
                "label": "Comped Pro",
                "features": toggles.get(MODE_COMPED_PRO, DEFAULT_MODE_FEATURES[MODE_COMPED_PRO])
            },
            MODE_COMPED_STANDARD: {
                "label": "Comped Standard",
                "features": toggles.get(MODE_COMPED_STANDARD, DEFAULT_MODE_FEATURES[MODE_COMPED_STANDARD])
            },
            MODE_ENTERPRISE_ACCESS: {
                "label": "Enterprise Access",
                "features": toggles.get(MODE_ENTERPRISE_ACCESS, DEFAULT_MODE_FEATURES[MODE_ENTERPRISE_ACCESS])
            }
        },
        "payment_plans": {
            PLAN_FREE: {
                "label": "Free",
                "features": toggles.get(PLAN_FREE, DEFAULT_PLAN_FEATURES[PLAN_FREE])
            },
            PLAN_STANDARD: {
                "label": "Standard",
                "features": toggles.get(PLAN_STANDARD, DEFAULT_PLAN_FEATURES[PLAN_STANDARD])
            },
            PLAN_PRO: {
                "label": "Pro",
                "features": toggles.get(PLAN_PRO, DEFAULT_PLAN_FEATURES[PLAN_PRO])
            }
        },
        "feature_definitions": {
            "unlimited_token": "Unlimited event credits (no limit on galleries)",
            "copy_share_link": "Copy shareable gallery link",
            "qr_code": "Generate QR code for gallery",
            "view_public_gallery": "Allow public gallery viewing",
            "display_mode": "Slideshow/Collage display modes",
            "collaboration_link": "Contributor upload links"
        }
    }

@api_router.put("/admin/global-feature-toggles")
async def update_admin_global_feature_toggles(data: GlobalFeatureToggles, admin: dict = Depends(get_admin_user)):
    """
    Update global feature toggles for all override modes and payment plans.
    This applies universally across the entire platform.
    """
    toggle_doc = {
        "type": "global_feature_toggles",
        # Override Modes
        MODE_FOUNDERS_CIRCLE: data.founders_circle,
        MODE_EARLY_PARTNER_BETA: data.early_partner_beta,
        MODE_COMPED_PRO: data.comped_pro,
        MODE_COMPED_STANDARD: data.comped_standard,
        MODE_ENTERPRISE_ACCESS: data.enterprise_access,
        # Payment Plans
        PLAN_FREE: data.free,
        PLAN_STANDARD: data.standard,
        PLAN_PRO: data.pro,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.site_config.update_one(
        {"type": "global_feature_toggles"},
        {"$set": toggle_doc},
        upsert=True
    )
    
    return {"message": "Global feature toggles updated successfully", "toggles": toggle_doc}

@api_router.put("/admin/global-feature-toggles/{mode_or_plan}")
async def update_single_mode_features(
    mode_or_plan: str,
    features: dict,
    admin: dict = Depends(get_admin_user)
):
    """
    Update features for a single mode or plan.
    mode_or_plan: one of founders_circle, early_partner_beta, comped_pro, comped_standard, enterprise_access, free, standard, pro
    """
    valid_keys = ALL_OVERRIDE_MODES + ALL_PAYMENT_PLANS
    if mode_or_plan not in valid_keys:
        raise HTTPException(status_code=400, detail=f"Invalid mode/plan. Must be one of: {valid_keys}")
    
    # Validate feature keys - include storage and expiration for override modes AND paid plans
    valid_features = ["unlimited_token", "copy_share_link", "qr_code", "view_public_gallery", "display_mode", "collaboration_link"]
    if mode_or_plan in ALL_OVERRIDE_MODES or mode_or_plan in [PLAN_STANDARD, PLAN_PRO]:
        valid_features.extend(["storage_limit_gb", "gallery_expiration_days"])
    
    for key in features.keys():
        if key not in valid_features:
            raise HTTPException(status_code=400, detail=f"Invalid feature key: {key}. Valid keys: {valid_features}")
    
    # Update only the specified mode/plan
    await db.site_config.update_one(
        {"type": "global_feature_toggles"},
        {"$set": {
            mode_or_plan: features,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    return {"message": f"Features updated for {mode_or_plan}", "features": features}

# ============================================
# Per-User Feature Toggles (Resolved via Authority Hierarchy)
# ============================================

class UserFeatureToggle(BaseModel):
    qr_share: bool = True
    online_gallery: bool = True
    display_mode: bool = True
    contributor_link: bool = True
    auto_delete_enabled: bool = True

@api_router.get("/admin/users/{user_id}/features")
async def get_user_feature_toggles(user_id: str, admin: dict = Depends(get_admin_user)):
    """Get feature toggles for a specific user (resolved via authority hierarchy)"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Resolve features using authority hierarchy
    resolved = await resolve_user_features(user)
    return {
        "user_id": user_id,
        "authority_source": resolved["authority_source"],
        "effective_plan": resolved["effective_plan"],
        "override_active": resolved["override_active"],
        "override_mode": resolved["override_mode"],
        "override_expires": resolved["override_expires"],
        "has_unlimited_credits": resolved["has_unlimited_credits"],
        "credits_available": resolved["credits_available"],
        "can_download": resolved["can_download"],
        "payment_required": resolved["payment_required"],
        "features": resolved["features"]
    }

@api_router.put("/admin/users/{user_id}/features")
async def update_user_feature_toggles(user_id: str, data: UserFeatureToggle, admin: dict = Depends(get_admin_user)):
    """Update feature toggles for a specific user (legacy - kept for compatibility)"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    toggle_doc = data.model_dump()
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"feature_toggles": toggle_doc}}
    )
    
    return {"message": "User features updated", "features": toggle_doc}

@api_router.get("/user/features")
async def get_current_user_features(user: dict = Depends(get_current_user)):
    """
    Get feature toggles for the currently logged-in user.
    Resolved using AUTHORITY HIERARCHY:
    1. Admin Override Mode (highest)
    2. Normal Payment Plan
    3. Payment Status
    """
    db_user = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Resolve features using authority hierarchy
    resolved = await resolve_user_features(db_user)
    return {
        "authority_source": resolved["authority_source"],
        "effective_plan": resolved["effective_plan"],
        "override_active": resolved["override_active"],
        "override_mode": resolved["override_mode"],
        "override_expires": resolved["override_expires"],
        "has_unlimited_credits": resolved["has_unlimited_credits"],
        "credits_available": resolved["credits_available"],
        "can_download": resolved["can_download"],
        "payment_required": resolved["payment_required"],
        "features": resolved["features"]
    }


@api_router.get("/admin/galleries/{gallery_id}")
async def admin_get_gallery(gallery_id: str, admin: dict = Depends(get_admin_user)):
    """Get gallery details for admin review"""
    gallery = await db.galleries.find_one({"id": gallery_id}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    photographer = await db.users.find_one({"id": gallery["photographer_id"]}, {"_id": 0})
    photo_count = await db.photos.count_documents({"gallery_id": gallery_id})
    flagged_count = await db.photos.count_documents({"gallery_id": gallery_id, "is_flagged": True})
    
    return {
        **gallery,
        "photographer_name": photographer.get("name") if photographer else "Unknown",
        "photographer_email": photographer.get("email") if photographer else "Unknown",
        "photo_count": photo_count,
        "flagged_count": flagged_count
    }

@api_router.get("/admin/galleries/{gallery_id}/photos")
async def admin_get_gallery_photos(gallery_id: str, include_flagged: bool = True, admin: dict = Depends(get_admin_user)):
    """Get all photos in a gallery for admin review (including flagged)"""
    gallery = await db.galleries.find_one({"id": gallery_id}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    query = {"gallery_id": gallery_id}
    if not include_flagged:
        query["is_flagged"] = {"$ne": True}
    
    photos = await db.photos.find(query, {"_id": 0}).sort([
        ("is_flagged", -1),  # Flagged photos first for review
        ("is_highlight", -1),
        ("order", 1),
        ("uploaded_at", -1)
    ]).to_list(None)
    
    return photos

@api_router.post("/admin/photos/bulk-flag")
async def admin_bulk_flag_photos(data: BulkFlagAction, admin: dict = Depends(get_admin_user)):
    """Flag multiple photos (with confirmation from frontend)"""
    if not data.photo_ids:
        raise HTTPException(status_code=400, detail="No photos selected")
    
    flagged_at = datetime.now(timezone.utc).isoformat()
    
    result = await db.photos.update_many(
        {"id": {"$in": data.photo_ids}},
        {"$set": {
            "is_flagged": True,
            "flagged_at": flagged_at,
            "flagged_reason": data.reason or "Flagged by admin"
        }}
    )
    
    # Log the action
    await db.activity_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "photos_flagged",
        "target_type": "photos",
        "target_ids": data.photo_ids,
        "count": result.modified_count,
        "reason": data.reason,
        "admin_user": "admin",
        "timestamp": flagged_at
    })
    
    return {
        "message": f"Flagged {result.modified_count} photos",
        "flagged_count": result.modified_count
    }

@api_router.post("/admin/photos/bulk-unflag")
async def admin_bulk_unflag_photos(data: BulkUnflagAction, admin: dict = Depends(get_admin_user)):
    """Restore/unflag multiple photos"""
    if not data.photo_ids:
        raise HTTPException(status_code=400, detail="No photos selected")
    
    result = await db.photos.update_many(
        {"id": {"$in": data.photo_ids}},
        {"$set": {
            "is_flagged": False,
            "flagged_at": None,
            "flagged_reason": None
        }}
    )
    
    # Log the action
    await db.activity_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "photos_unflagged",
        "target_type": "photos",
        "target_ids": data.photo_ids,
        "count": result.modified_count,
        "admin_user": "admin",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "message": f"Restored {result.modified_count} photos",
        "unflagged_count": result.modified_count
    }

@api_router.get("/admin/flagged-photos")
async def admin_get_all_flagged_photos(limit: int = 100, admin: dict = Depends(get_admin_user)):
    """Get all flagged photos across all galleries"""
    photos = await db.photos.find(
        {"is_flagged": True}, 
        {"_id": 0}
    ).sort("flagged_at", -1).limit(limit).to_list(None)
    
    # Enrich with gallery info
    result = []
    for photo in photos:
        gallery = await db.galleries.find_one({"id": photo["gallery_id"]}, {"_id": 0, "title": 1, "photographer_id": 1})
        if gallery:
            photographer = await db.users.find_one({"id": gallery["photographer_id"]}, {"_id": 0, "name": 1})
            result.append({
                **photo,
                "gallery_title": gallery.get("title"),
                "photographer_name": photographer.get("name") if photographer else "Unknown"
            })
    
    return result

@api_router.get("/admin/landing-config", response_model=LandingPageConfig)
async def get_landing_config(admin: dict = Depends(get_admin_user)):
    """Get landing page configuration"""
    config = await db.site_config.find_one({"type": "landing"}, {"_id": 0})
    if not config:
        return LandingPageConfig()
    return LandingPageConfig(**config)

@api_router.put("/admin/landing-config", response_model=LandingPageConfig)
async def update_landing_config(config: LandingPageConfig, admin: dict = Depends(get_admin_user)):
    """Update landing page configuration"""
    config_doc = config.model_dump()
    config_doc["type"] = "landing"
    
    await db.site_config.update_one(
        {"type": "landing"},
        {"$set": config_doc},
        upsert=True
    )
    
    return config

@api_router.post("/admin/landing-image")
async def upload_landing_image(
    file: UploadFile = File(...),
    image_slot: str = Form(...),  # "hero_image_1" through "hero_image_10"
    admin: dict = Depends(get_admin_user)
):
    """Upload an image for the landing page"""
    valid_slots = [f"hero_image_{i}" for i in range(1, 11)]
    if image_slot not in valid_slots:
        raise HTTPException(status_code=400, detail="Invalid image slot")
    
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Generate unique filename
    file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    filename = f"landing_{image_slot}_{uuid.uuid4().hex[:8]}.{file_ext}"
    file_path = UPLOAD_DIR / filename
    
    # Save the file
    with open(file_path, 'wb') as f:
        shutil.copyfileobj(file.file, f)
    
    # Update landing config with new image URL
    image_url = f"/api/photos/serve/{filename}"
    
    await db.site_config.update_one(
        {"type": "landing"},
        {"$set": {image_slot: image_url}},
        upsert=True
    )
    
    return {"success": True, "url": image_url, "slot": image_slot}

@api_router.post("/admin/favicon")
async def upload_favicon(
    file: UploadFile = File(...),
    admin: dict = Depends(get_admin_user)
):
    """Upload a custom favicon for the site"""
    # Validate file type - favicons can be ico, png, svg, or jpg
    allowed_types = ['image/x-icon', 'image/vnd.microsoft.icon', 'image/png', 'image/svg+xml', 'image/jpeg', 'image/jpg', 'image/gif']
    if not file.content_type or file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: ICO, PNG, SVG, JPG, GIF")
    
    # Generate unique filename
    file_ext = file.filename.split('.')[-1].lower() if '.' in file.filename else 'png'
    if file_ext not in ['ico', 'png', 'svg', 'jpg', 'jpeg', 'gif']:
        file_ext = 'png'
    filename = f"favicon_{uuid.uuid4().hex[:8]}.{file_ext}"
    file_path = UPLOAD_DIR / filename
    
    # Save the file
    with open(file_path, 'wb') as f:
        shutil.copyfileobj(file.file, f)
    
    # Update landing config with new favicon URL
    favicon_url = f"/api/photos/serve/{filename}"
    
    await db.site_config.update_one(
        {"type": "landing"},
        {"$set": {"favicon_url": favicon_url}},
        upsert=True
    )
    
    return {"success": True, "url": favicon_url}

# ============ COLLAGE PRESET ENDPOINTS ============

@api_router.get("/admin/collage-presets")
async def get_collage_presets(admin: dict = Depends(get_admin_user)):
    """Get all collage presets (admin only)"""
    presets = await db.collage_presets.find({}, {"_id": 0}).sort("created_at", -1).to_list(None)
    return presets or []

@api_router.post("/admin/collage-presets")
async def create_collage_preset(
    preset_data: CollagePresetCreate,
    admin: dict = Depends(get_admin_user)
):
    """Create a new collage preset (admin only)"""
    now = datetime.now(timezone.utc).isoformat()
    
    # If this preset is set as default, unset all other defaults
    if preset_data.is_default:
        await db.collage_presets.update_many({}, {"$set": {"is_default": False}})
    
    preset = {
        "id": str(uuid.uuid4()),
        "name": preset_data.name,
        "description": preset_data.description,
        "tags": preset_data.tags,
        "placeholders": [p.model_dump() for p in preset_data.placeholders],
        "settings": preset_data.settings.model_dump(),
        "is_default": preset_data.is_default,
        "created_by": "admin",
        "created_at": now,
        "updated_at": now
    }
    
    await db.collage_presets.insert_one(preset)
    if "_id" in preset:
        del preset["_id"]
    
    return preset

@api_router.get("/admin/collage-presets/{preset_id}")
async def get_collage_preset(preset_id: str, admin: dict = Depends(get_admin_user)):
    """Get a specific collage preset (admin only)"""
    preset = await db.collage_presets.find_one({"id": preset_id}, {"_id": 0})
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")
    return preset

@api_router.put("/admin/collage-presets/{preset_id}")
async def update_collage_preset(
    preset_id: str,
    preset_data: CollagePresetUpdate,
    admin: dict = Depends(get_admin_user)
):
    """Update a collage preset (admin only)"""
    preset = await db.collage_presets.find_one({"id": preset_id})
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if preset_data.name is not None:
        update_data["name"] = preset_data.name
    if preset_data.description is not None:
        update_data["description"] = preset_data.description
    if preset_data.tags is not None:
        update_data["tags"] = preset_data.tags
    if preset_data.placeholders is not None:
        update_data["placeholders"] = [p.model_dump() for p in preset_data.placeholders]
    if preset_data.settings is not None:
        update_data["settings"] = preset_data.settings.model_dump()
    if preset_data.is_default is not None:
        if preset_data.is_default:
            # Unset all other defaults
            await db.collage_presets.update_many({}, {"$set": {"is_default": False}})
        update_data["is_default"] = preset_data.is_default
    
    await db.collage_presets.update_one({"id": preset_id}, {"$set": update_data})
    
    updated_preset = await db.collage_presets.find_one({"id": preset_id}, {"_id": 0})
    return updated_preset

@api_router.delete("/admin/collage-presets/{preset_id}")
async def delete_collage_preset(preset_id: str, admin: dict = Depends(get_admin_user)):
    """Delete a collage preset (admin only)"""
    preset = await db.collage_presets.find_one({"id": preset_id})
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")
    
    await db.collage_presets.delete_one({"id": preset_id})
    
    # Also clear this preset from any galleries using it
    await db.galleries.update_many(
        {"collage_preset_id": preset_id},
        {"$set": {"collage_preset_id": None}}
    )
    
    return {"success": True, "message": "Preset deleted"}

@api_router.post("/admin/collage-presets/{preset_id}/duplicate")
async def duplicate_collage_preset(preset_id: str, admin: dict = Depends(get_admin_user)):
    """Duplicate an existing collage preset (admin only)"""
    preset = await db.collage_presets.find_one({"id": preset_id}, {"_id": 0})
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")
    
    now = datetime.now(timezone.utc).isoformat()
    
    new_preset = {
        **preset,
        "id": str(uuid.uuid4()),
        "name": f"{preset['name']} (Copy)",
        "is_default": False,
        "created_by": "admin",
        "created_at": now,
        "updated_at": now
    }
    
    await db.collage_presets.insert_one(new_preset)
    if "_id" in new_preset:
        del new_preset["_id"]
    
    return new_preset

# Public endpoint for photographers to get available presets
@api_router.get("/collage-presets")
async def get_available_collage_presets(current_user: dict = Depends(get_current_user)):
    """Get all available collage presets for photographers"""
    presets = await db.collage_presets.find({}, {"_id": 0}).sort("created_at", -1).to_list(None)
    return presets or []

# Public endpoint to get a specific preset (for CollageDisplay)
@api_router.get("/collage-presets/{preset_id}/public")
async def get_collage_preset_public(preset_id: str):
    """Get a specific collage preset (public - for display)"""
    preset = await db.collage_presets.find_one({"id": preset_id}, {"_id": 0})
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")
    return preset

# Get default preset
@api_router.get("/collage-presets/default/public")
async def get_default_collage_preset():
    """Get the default collage preset"""
    preset = await db.collage_presets.find_one({"is_default": True}, {"_id": 0})
    return preset

@api_router.get("/public/landing-config", response_model=LandingPageConfig)
async def get_public_landing_config():
    """Get landing page config for public display"""
    config = await db.site_config.find_one({"type": "landing"}, {"_id": 0})
    if not config:
        return LandingPageConfig()
    return LandingPageConfig(**config)

@api_router.post("/galleries", response_model=Gallery)
async def create_gallery(gallery_data: GalleryCreate, current_user: dict = Depends(get_current_user)):
    # Get full user data
    user = await db.users.find_one({"id": current_user["id"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check and reset credits if billing cycle passed
    await reset_user_credits_if_needed(current_user["id"])
    user = await db.users.find_one({"id": current_user["id"]})
    
    # Use authority hierarchy to resolve features and credits
    resolved_features = await resolve_user_features(user)
    effective_plan = resolved_features["effective_plan"]
    has_unlimited_credits = resolved_features["has_unlimited_credits"]
    credits_available = resolved_features["credits_available"]
    override_mode = user.get("override_mode")
    payment_status = user.get("payment_status", PAYMENT_NONE)
    
    # Check if user is on Free plan (demo gallery)
    is_demo = effective_plan == PLAN_FREE
    
    # Track if this gallery was created with pending payment (downloads will be disabled)
    download_locked_until_payment = False
    
    if is_demo:
        # Free users get 1 demo gallery total
        existing_demo = await db.galleries.find_one({
            "photographer_id": current_user["id"],
            "is_demo": True
        })
        if existing_demo:
            raise HTTPException(
                status_code=403,
                detail="Demo gallery already created. Upgrade to Standard or Pro for more galleries."
            )
    else:
        # Paid/Override plans use credit system (except those with unlimited_token enabled)
        if not has_unlimited_credits and credits_available <= 0:
            # Check if user has pending payment - allow gallery creation but lock downloads
            if payment_status == PAYMENT_PENDING:
                download_locked_until_payment = True
                # Don't deduct credits - they're creating on credit
            else:
                raise HTTPException(
                    status_code=403,
                    detail="No event credits remaining. Purchase extra credits or wait for next billing cycle."
                )
        elif not has_unlimited_credits:
            # Deduct credit (skip for users with unlimited_token)
            if user.get("extra_credits", 0) > 0:
                await db.users.update_one(
                    {"id": current_user["id"]},
                    {"$inc": {"extra_credits": -1}}
                )
            else:
                await db.users.update_one(
                    {"id": current_user["id"]},
                    {"$inc": {"event_credits": -1}}
                )
    
    gallery_id = str(uuid.uuid4())
    share_link = str(uuid.uuid4())[:8]
    created_at = datetime.now(timezone.utc)
    
    share_link_expiration_date = None
    if gallery_data.share_link_expiration_days > 0:
        share_link_expiration_date = (created_at + timedelta(days=gallery_data.share_link_expiration_days)).isoformat()
    
    guest_upload_expiration_date = None
    if gallery_data.event_date and gallery_data.guest_upload_enabled_days > 0:
        try:
            event_dt = datetime.fromisoformat(gallery_data.event_date.replace('Z', '+00:00'))
            guest_upload_expiration_date = (event_dt + timedelta(days=gallery_data.guest_upload_enabled_days)).isoformat()
        except:
            pass
    
    # Set auto-delete date based on plan and settings
    # Free/Demo: 6 hours
    # Override modes: Use mode-specific gallery_expiration_days
    # Paid plans: Check global_toggles first, then fall back to billing settings
    billing_settings = await get_billing_settings()
    global_toggles = await get_global_feature_toggles()
    
    if override_mode and override_mode in global_toggles:
        # Use override mode settings
        mode_config = global_toggles[override_mode]
        gallery_expiration_days = mode_config.get("gallery_expiration_days", 180)
        auto_delete_date = (created_at + timedelta(days=gallery_expiration_days)).isoformat()
    elif is_demo:
        auto_delete_date = (created_at + timedelta(hours=FREE_GALLERY_EXPIRATION_HOURS)).isoformat()
    else:
        # Paid plans - check global_toggles for plan-specific settings first
        plan = current_user.get("plan", PLAN_FREE)
        plan_config = global_toggles.get(plan, {})
        
        if plan_config.get("gallery_expiration_days"):
            # Use plan-specific expiration from global toggles
            gallery_expiration_days = plan_config.get("gallery_expiration_days")
            auto_delete_date = (created_at + timedelta(days=gallery_expiration_days)).isoformat()
        else:
            # Fall back to billing settings (universal)
            expiration_months = billing_settings.get("paid_gallery_expiration_months", 6)
            auto_delete_date = (created_at + timedelta(days=expiration_months * 30)).isoformat()
    
    # Demo gallery feature expiry (6 hours) - only for free plan
    demo_features_expire = None
    if is_demo:
        demo_features_expire = (created_at + timedelta(hours=DEMO_FEATURE_WINDOW_HOURS)).isoformat()
    
    # Check if this is a founder gallery (has unlimited token via override mode)
    is_founder = has_unlimited_credits and override_mode == MODE_FOUNDERS_CIRCLE
    
    gallery_doc = {
        "id": gallery_id,
        "photographer_id": current_user["id"],
        "title": gallery_data.title,
        "description": gallery_data.description,
        "password": hash_password(gallery_data.password) if gallery_data.password else None,
        "share_link": share_link,
        "cover_photo_url": None,
        "sections": [],
        "event_title": gallery_data.event_title,
        "event_date": gallery_data.event_date,
        "coordinator_name": gallery_data.coordinator_name,
        "share_link_expiration_date": share_link_expiration_date,
        "share_link_expiration_days": gallery_data.share_link_expiration_days,
        "guest_upload_expiration_date": guest_upload_expiration_date,
        "guest_upload_enabled_days": gallery_data.guest_upload_enabled_days,
        "download_all_password": hash_password(gallery_data.download_all_password) if gallery_data.download_all_password else None,
        "theme": gallery_data.theme,
        "created_at": created_at.isoformat(),
        "auto_delete_date": auto_delete_date,
        "edit_lock_date": (created_at + timedelta(days=GALLERY_EDIT_LOCK_DAYS)).isoformat(),
        "is_demo": is_demo,
        "is_founder_gallery": is_founder,
        "demo_features_expire": demo_features_expire,
        "download_locked_until_payment": download_locked_until_payment,
        "view_count": 0
    }
    
    await db.galleries.insert_one(gallery_doc)
    
    # Increment total galleries created
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$inc": {"galleries_created_total": 1}}
    )
    
    # Calculate days until deletion
    auto_delete_dt = created_at + timedelta(days=GALLERY_EXPIRATION_DAYS)
    days_until_deletion = (auto_delete_dt - datetime.now(timezone.utc)).days
    
    return Gallery(
        id=gallery_id,
        photographer_id=current_user["id"],
        title=gallery_data.title,
        description=gallery_data.description,
        has_password=gallery_data.password is not None,
        share_link=share_link,
        cover_photo_url=None,
        event_title=gallery_data.event_title,
        event_date=gallery_data.event_date,
        coordinator_name=gallery_data.coordinator_name,
        share_link_expiration_date=share_link_expiration_date,
        guest_upload_expiration_date=guest_upload_expiration_date,
        guest_upload_enabled=True,
        has_download_all_password=gallery_data.download_all_password is not None,
        theme=gallery_data.theme,
        created_at=gallery_doc["created_at"],
        photo_count=0,
        auto_delete_date=gallery_doc["auto_delete_date"],
        days_until_deletion=days_until_deletion,
        is_edit_locked=False,
        days_until_edit_lock=GALLERY_EDIT_LOCK_DAYS,
        download_locked_until_payment=download_locked_until_payment
    )

def calculate_days_until_deletion(auto_delete_date: str) -> int:
    """Calculate days remaining until auto-deletion"""
    if not auto_delete_date:
        return None
    try:
        delete_dt = datetime.fromisoformat(auto_delete_date.replace('Z', '+00:00'))
        if delete_dt.tzinfo is None:
            delete_dt = delete_dt.replace(tzinfo=timezone.utc)
        return max(0, (delete_dt - datetime.now(timezone.utc)).days)
    except:
        return None

def is_gallery_edit_locked(created_at: str) -> bool:
    """Check if gallery is locked for editing (7 days after creation)"""
    try:
        created_dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
        if created_dt.tzinfo is None:
            created_dt = created_dt.replace(tzinfo=timezone.utc)
        days_since_creation = (datetime.now(timezone.utc) - created_dt).days
        return days_since_creation >= GALLERY_EDIT_LOCK_DAYS
    except:
        return False

def get_edit_lock_info(created_at: str) -> dict:
    """Get edit lock status and days remaining"""
    try:
        created_dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
        if created_dt.tzinfo is None:
            created_dt = created_dt.replace(tzinfo=timezone.utc)
        days_since_creation = (datetime.now(timezone.utc) - created_dt).days
        is_locked = days_since_creation >= GALLERY_EDIT_LOCK_DAYS
        days_until_lock = max(0, GALLERY_EDIT_LOCK_DAYS - days_since_creation)
        return {
            "is_locked": is_locked,
            "days_until_lock": days_until_lock if not is_locked else 0
        }
    except:
        return {"is_locked": False, "days_until_lock": GALLERY_EDIT_LOCK_DAYS}

@api_router.get("/galleries", response_model=List[Gallery])
async def get_galleries(current_user: dict = Depends(get_current_user)):
    pipeline = [
        {"$match": {"photographer_id": current_user["id"]}},
        {"$lookup": {
            "from": "photos",
            "localField": "id",
            "foreignField": "gallery_id",
            "as": "photos"
        }},
        {"$addFields": {"photo_count": {"$size": "$photos"}}},
        {"$project": {"_id": 0, "photos": 0}},
        {"$limit": 500}
    ]
    
    galleries = await db.galleries.aggregate(pipeline).to_list(None)
    
    result = []
    for g in galleries:
        auto_delete_date = g.get("auto_delete_date")
        days_until_deletion = calculate_days_until_deletion(auto_delete_date)
        edit_info = get_edit_lock_info(g["created_at"])
        
        result.append(Gallery(
            id=g["id"],
            photographer_id=g["photographer_id"],
            title=g["title"],
            description=g.get("description"),
            has_password=g.get("password") is not None,
            share_link=g["share_link"],
            cover_photo_url=g.get("cover_photo_url"),
            event_title=g.get("event_title"),
            event_date=g.get("event_date"),
            share_link_expiration_date=g.get("share_link_expiration_date"),
            guest_upload_expiration_date=g.get("guest_upload_expiration_date"),
            guest_upload_enabled=True,
            has_download_all_password=g.get("download_all_password") is not None,
            theme=g.get("theme", "classic"),
            display_mode=g.get("display_mode", "slideshow"),
            display_transition=g.get("display_transition", "crossfade"),
            display_interval=g.get("display_interval", 6),
            collage_preset_id=g.get("collage_preset_id"),
            created_at=g["created_at"],
            photo_count=g.get("photo_count", 0),
            auto_delete_date=auto_delete_date,
            days_until_deletion=days_until_deletion,
            is_edit_locked=edit_info["is_locked"],
            days_until_edit_lock=edit_info["days_until_lock"]
        ))
    
    return result

@api_router.get("/galleries/{gallery_id}", response_model=Gallery)
async def get_gallery(gallery_id: str, current_user: dict = Depends(get_current_user)):
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    photo_count = await db.photos.count_documents({"gallery_id": gallery_id})
    auto_delete_date = gallery.get("auto_delete_date")
    days_until_deletion = calculate_days_until_deletion(auto_delete_date)
    edit_info = get_edit_lock_info(gallery["created_at"])
    
    return Gallery(
        id=gallery["id"],
        photographer_id=gallery["photographer_id"],
        title=gallery["title"],
        description=gallery.get("description"),
        has_password=gallery.get("password") is not None,
        share_link=gallery["share_link"],
        cover_photo_url=gallery.get("cover_photo_url"),
        event_title=gallery.get("event_title"),
        event_date=gallery.get("event_date"),
        share_link_expiration_date=gallery.get("share_link_expiration_date"),
        guest_upload_expiration_date=gallery.get("guest_upload_expiration_date"),
        guest_upload_enabled=True,
        has_download_all_password=gallery.get("download_all_password") is not None,
        theme=gallery.get("theme", "classic"),
        display_mode=gallery.get("display_mode", "slideshow"),
        display_transition=gallery.get("display_transition", "crossfade"),
        display_interval=gallery.get("display_interval", 6),
        collage_preset_id=gallery.get("collage_preset_id"),
        created_at=gallery["created_at"],
        photo_count=photo_count,
        auto_delete_date=auto_delete_date,
        days_until_deletion=days_until_deletion,
        is_edit_locked=edit_info["is_locked"],
        days_until_edit_lock=edit_info["days_until_lock"],
        download_locked_until_payment=gallery.get("download_locked_until_payment", False)
    )

@api_router.put("/galleries/{gallery_id}", response_model=Gallery)
async def update_gallery(gallery_id: str, updates: GalleryUpdate, current_user: dict = Depends(get_current_user)):
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Check if gallery is edit-locked (7 days after creation)
    edit_lock_info = get_edit_lock_info(gallery["created_at"])
    locked_fields = ["title", "description", "event_title", "event_date", "theme"]
    
    if edit_lock_info["is_locked"]:
        # Check if any locked fields are being updated
        for field in locked_fields:
            if getattr(updates, field, None) is not None:
                raise HTTPException(
                    status_code=403, 
                    detail=f"Gallery editing is locked. You can no longer change {field} after 7 days from creation."
                )
    
    update_data = {}
    if updates.title is not None:
        update_data["title"] = updates.title
    if updates.description is not None:
        update_data["description"] = updates.description
    if updates.password is not None:
        update_data["password"] = hash_password(updates.password)
    if updates.event_title is not None:
        update_data["event_title"] = updates.event_title
    if updates.event_date is not None:
        update_data["event_date"] = updates.event_date
        if updates.guest_upload_enabled_days:
            try:
                event_dt = datetime.fromisoformat(updates.event_date.replace('Z', '+00:00'))
                update_data["guest_upload_expiration_date"] = (event_dt + timedelta(days=updates.guest_upload_enabled_days)).isoformat()
            except:
                pass
    if updates.coordinator_name is not None:
        update_data["coordinator_name"] = updates.coordinator_name
    if updates.share_link_expiration_days is not None:
        update_data["share_link_expiration_days"] = updates.share_link_expiration_days
        created_at = datetime.fromisoformat(gallery["created_at"])
        update_data["share_link_expiration_date"] = (created_at + timedelta(days=updates.share_link_expiration_days)).isoformat()
    if updates.guest_upload_enabled_days is not None:
        update_data["guest_upload_enabled_days"] = updates.guest_upload_enabled_days
        if gallery.get("event_date"):
            try:
                event_dt = datetime.fromisoformat(gallery["event_date"].replace('Z', '+00:00'))
                update_data["guest_upload_expiration_date"] = (event_dt + timedelta(days=updates.guest_upload_enabled_days)).isoformat()
            except:
                pass
    if updates.download_all_password is not None:
        update_data["download_all_password"] = hash_password(updates.download_all_password)
    if updates.theme is not None:
        update_data["theme"] = updates.theme
    # Display settings
    if updates.display_mode is not None:
        update_data["display_mode"] = updates.display_mode
    if updates.display_transition is not None:
        update_data["display_transition"] = updates.display_transition
    if updates.display_interval is not None:
        update_data["display_interval"] = updates.display_interval
    if updates.collage_preset_id is not None:
        update_data["collage_preset_id"] = updates.collage_preset_id
    # Handle explicit null for collage_preset_id (to clear it)
    elif hasattr(updates, 'collage_preset_id') and updates.collage_preset_id is None:
        # Check if the field was explicitly set to None in the request
        pass  # Will be handled below
    
    if update_data:
        await db.galleries.update_one({"id": gallery_id}, {"$set": update_data})
    
    updated_gallery = await db.galleries.find_one({"id": gallery_id}, {"_id": 0})
    photo_count = await db.photos.count_documents({"gallery_id": gallery_id})
    
    # Get edit lock info for response
    edit_info = get_edit_lock_info(updated_gallery["created_at"])
    
    return Gallery(
        id=updated_gallery["id"],
        photographer_id=updated_gallery["photographer_id"],
        title=updated_gallery["title"],
        description=updated_gallery.get("description"),
        has_password=updated_gallery.get("password") is not None,
        share_link=updated_gallery["share_link"],
        cover_photo_url=updated_gallery.get("cover_photo_url"),
        event_title=updated_gallery.get("event_title"),
        event_date=updated_gallery.get("event_date"),
        coordinator_name=updated_gallery.get("coordinator_name"),
        share_link_expiration_date=updated_gallery.get("share_link_expiration_date"),
        guest_upload_expiration_date=updated_gallery.get("guest_upload_expiration_date"),
        guest_upload_enabled=True,
        has_download_all_password=updated_gallery.get("download_all_password") is not None,
        theme=updated_gallery.get("theme", "classic"),
        display_mode=updated_gallery.get("display_mode", "slideshow"),
        display_transition=updated_gallery.get("display_transition", "crossfade"),
        display_interval=updated_gallery.get("display_interval", 6),
        collage_preset_id=updated_gallery.get("collage_preset_id"),
        created_at=updated_gallery["created_at"],
        photo_count=photo_count,
        is_edit_locked=edit_info["is_locked"],
        days_until_edit_lock=edit_info["days_until_lock"]
    )

@api_router.delete("/galleries/{gallery_id}")
async def delete_gallery(gallery_id: str, current_user: dict = Depends(get_current_user)):
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Track total storage freed
    total_storage_freed = 0
    
    # Delete all photo files and thumbnails
    photos = await db.photos.find({"gallery_id": gallery_id}, {"_id": 0}).to_list(None)
    for photo in photos:
        # Delete original file
        file_path = UPLOAD_DIR / photo["filename"]
        if file_path.exists():
            total_storage_freed += file_path.stat().st_size
            file_path.unlink()
        
        # Delete thumbnails (small and medium)
        photo_id = photo.get("id", "")
        for size in ["small", "medium"]:
            thumb_path = THUMBNAILS_DIR / f"{photo_id}_{size}.jpg"
            if thumb_path.exists():
                try:
                    thumb_path.unlink()
                except:
                    pass
    
    # Delete cover photo if exists
    if gallery.get("cover_photo_url"):
        cover_filename = gallery["cover_photo_url"].split('/')[-1]
        cover_path = UPLOAD_DIR / cover_filename
        if cover_path.exists():
            try:
                total_storage_freed += cover_path.stat().st_size
                cover_path.unlink()
            except:
                pass
    
    # Delete all database records for this gallery
    await db.photos.delete_many({"gallery_id": gallery_id})
    await db.gallery_videos.delete_many({"gallery_id": gallery_id})
    await db.fotoshare_videos.delete_many({"gallery_id": gallery_id})
    await db.galleries.delete_one({"id": gallery_id})
    
    # Update user's storage used
    if total_storage_freed > 0:
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$inc": {"storage_used": -total_storage_freed}}
        )
    
    logger.info(f"Deleted gallery {gallery_id}, freed {total_storage_freed / (1024*1024):.2f}MB storage")
    
    return {"message": "Gallery deleted", "storage_freed": total_storage_freed}

@api_router.post("/galleries/{gallery_id}/cover-photo")
async def upload_cover_photo(gallery_id: str, file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    
    if gallery.get("cover_photo_url"):
        old_filename = gallery["cover_photo_url"].split('/')[-1]
        old_file_path = UPLOAD_DIR / old_filename
        if old_file_path.exists():
            old_file_path.unlink()
    
    photo_id = str(uuid.uuid4())
    file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    filename = f"cover_{photo_id}.{file_ext}"
    file_path = UPLOAD_DIR / filename
    
    with open(file_path, 'wb') as f:
        shutil.copyfileobj(file.file, f)
    
    cover_url = f"/api/photos/serve/{filename}"
    # Reset position when uploading new cover photo
    await db.galleries.update_one({"id": gallery_id}, {"$set": {
        "cover_photo_url": cover_url,
        "cover_photo_position": {"scale": 1, "positionX": 50, "positionY": 50}
    }})
    
    return {"cover_photo_url": cover_url}

class CoverPhotoPosition(BaseModel):
    scale: float = 1.0
    positionX: float = 50.0
    positionY: float = 50.0

@api_router.put("/galleries/{gallery_id}/cover-photo-position")
async def update_cover_photo_position(gallery_id: str, position: CoverPhotoPosition, current_user: dict = Depends(get_current_user)):
    """Save cover photo position settings (zoom, pan)"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    if not gallery.get("cover_photo_url"):
        raise HTTPException(status_code=400, detail="No cover photo to position")
    
    await db.galleries.update_one(
        {"id": gallery_id},
        {"$set": {"cover_photo_position": position.model_dump()}}
    )
    
    return {"message": "Cover photo position updated", "position": position.model_dump()}

@api_router.get("/galleries/{gallery_id}/cover-photo-position")
async def get_cover_photo_position(gallery_id: str, current_user: dict = Depends(get_current_user)):
    """Get cover photo position settings"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    position = gallery.get("cover_photo_position", {"scale": 1, "positionX": 50, "positionY": 50})
    return position

@api_router.post("/galleries/{gallery_id}/sections", response_model=Section)
async def create_section(
    gallery_id: str, 
    name: str = Form(...), 
    type: str = Form("photo"),  # "photo" or "video"
    current_user: dict = Depends(get_current_user)
):
    """Create a new section (photo or video type)"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    if type not in ["photo", "video", "fotoshare"]:
        raise HTTPException(status_code=400, detail="Section type must be 'photo', 'video', or 'fotoshare'")
    
    section_id = str(uuid.uuid4())
    sections = gallery.get("sections", [])
    new_section = {
        "id": section_id,
        "name": name,
        "type": type,
        "order": len(sections)
    }
    sections.append(new_section)
    
    await db.galleries.update_one({"id": gallery_id}, {"$set": {"sections": sections}})
    
    return Section(**new_section)

@api_router.get("/galleries/{gallery_id}/sections", response_model=List[Section])
async def get_sections(gallery_id: str, current_user: dict = Depends(get_current_user)):
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    sections = gallery.get("sections", [])
    return [Section(**s) for s in sections]

@api_router.put("/galleries/{gallery_id}/sections/reorder")
async def reorder_sections(gallery_id: str, data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    """Reorder sections within a gallery"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    section_orders = data.get("section_orders", [])
    if not section_orders:
        raise HTTPException(status_code=400, detail="section_orders is required")
    
    sections = gallery.get("sections", [])
    
    # Create a map for quick lookup
    section_map = {s["id"]: s for s in sections}
    
    # Reorder sections based on the provided order
    reordered_sections = []
    for order_item in section_orders:
        section_id = order_item.get("id")
        new_order = order_item.get("order", 0)
        if section_id in section_map:
            section = section_map[section_id]
            section["order"] = new_order
            reordered_sections.append(section)
    
    # Sort by order
    reordered_sections.sort(key=lambda s: s.get("order", 0))
    
    await db.galleries.update_one({"id": gallery_id}, {"$set": {"sections": reordered_sections}})
    
    return {"message": "Sections reordered", "sections": reordered_sections}

@api_router.delete("/galleries/{gallery_id}/sections/{section_id}")
async def delete_section(gallery_id: str, section_id: str, current_user: dict = Depends(get_current_user)):
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    sections = gallery.get("sections", [])
    section_to_delete = next((s for s in sections if s["id"] == section_id), None)
    sections = [s for s in sections if s["id"] != section_id]
    
    await db.galleries.update_one({"id": gallery_id}, {"$set": {"sections": sections}})
    
    # Delete associated content based on section type
    if section_to_delete and section_to_delete.get("type") == "video":
        await db.gallery_videos.delete_many({"gallery_id": gallery_id, "section_id": section_id})
    else:
        await db.photos.update_many({"gallery_id": gallery_id, "section_id": section_id}, {"$set": {"section_id": None}})
    
    return {"message": "Section deleted"}

@api_router.put("/galleries/{gallery_id}/sections/{section_id}")
async def rename_section(gallery_id: str, section_id: str, data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    """Rename a section within a gallery"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    new_name = data.get("name")
    if not new_name or not new_name.strip():
        raise HTTPException(status_code=400, detail="Section name is required")
    
    sections = gallery.get("sections", [])
    section_found = False
    
    for section in sections:
        if section["id"] == section_id:
            section["name"] = new_name.strip()
            section_found = True
            break
    
    if not section_found:
        raise HTTPException(status_code=404, detail="Section not found")
    
    await db.galleries.update_one({"id": gallery_id}, {"$set": {"sections": sections}})
    
    return {"message": "Section renamed", "name": new_name.strip()}

# ============ Fotoshare / 360 Booth Section Endpoints ============

class FotoshareSectionCreate(BaseModel):
    name: str
    fotoshare_url: str

@api_router.post("/galleries/{gallery_id}/fotoshare-sections")
async def create_fotoshare_section(
    gallery_id: str,
    data: FotoshareSectionCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new fotoshare/360 booth section by scraping the URL"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Validate and scrape the fotoshare URL
    scrape_result = await scrape_fotoshare_videos(data.fotoshare_url)
    
    if not scrape_result['success']:
        error_msg = scrape_result.get('error', 'Failed to scrape fotoshare URL')
        if scrape_result.get('expired'):
            raise HTTPException(status_code=400, detail=f"Link expired: {error_msg}")
        raise HTTPException(status_code=400, detail=error_msg)
    
    # Create the section
    section_id = str(uuid.uuid4())
    sections = gallery.get("sections", [])
    now = datetime.now(timezone.utc).isoformat()
    
    new_section = {
        "id": section_id,
        "name": data.name,
        "type": "fotoshare",
        "order": len(sections),
        "fotoshare_url": data.fotoshare_url,
        "fotoshare_last_sync": now,
        "fotoshare_expired": False
    }
    sections.append(new_section)
    await db.galleries.update_one({"id": gallery_id}, {"$set": {"sections": sections}})
    
    # Store the scraped videos
    fotoshare_videos = []
    for video_data in scrape_result['videos']:
        video_entry = {
            "id": str(uuid.uuid4()),
            "gallery_id": gallery_id,
            "section_id": section_id,
            "hash": video_data['hash'],
            "source_url": video_data['source_url'],
            "thumbnail_url": video_data['thumbnail_url'],
            "width": video_data.get('width', 1080),
            "height": video_data.get('height', 1920),
            "file_type": video_data.get('file_type', 'mp4'),
            "file_source": video_data.get('file_source', 'lumabooth'),
            "created_at_source": video_data.get('created_at_source'),
            "order": video_data.get('order', 0),
            "synced_at": now
        }
        fotoshare_videos.append(video_entry)
    
    if fotoshare_videos:
        await db.fotoshare_videos.insert_many(fotoshare_videos)
    
    return {
        "section": Section(**new_section),
        "videos_count": len(fotoshare_videos),
        "event_title": scrape_result.get('event_title')
    }

@api_router.post("/galleries/{gallery_id}/fotoshare-sections/{section_id}/refresh")
async def refresh_fotoshare_section(
    gallery_id: str,
    section_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Refresh a fotoshare section by re-scraping the URL"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    sections = gallery.get("sections", [])
    section = next((s for s in sections if s["id"] == section_id), None)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    if section.get("type") != "fotoshare":
        raise HTTPException(status_code=400, detail="Section is not a fotoshare type")
    
    fotoshare_url = section.get("fotoshare_url")
    if not fotoshare_url:
        raise HTTPException(status_code=400, detail="No fotoshare URL configured for this section")
    
    # Scrape the URL again
    scrape_result = await scrape_fotoshare_videos(fotoshare_url)
    now = datetime.now(timezone.utc).isoformat()
    
    # Update section status
    for s in sections:
        if s["id"] == section_id:
            s["fotoshare_last_sync"] = now
            s["fotoshare_expired"] = scrape_result.get('expired', False)
            break
    
    await db.galleries.update_one({"id": gallery_id}, {"$set": {"sections": sections}})
    
    if not scrape_result['success']:
        return {
            "success": False,
            "expired": scrape_result.get('expired', False),
            "error": scrape_result.get('error'),
            "videos_count": 0
        }
    
    # Get existing video hashes
    existing_videos = await db.fotoshare_videos.find(
        {"gallery_id": gallery_id, "section_id": section_id},
        {"_id": 0, "hash": 1}
    ).to_list(1000)
    existing_hashes = {v['hash'] for v in existing_videos}
    
    # Add new videos
    new_videos = []
    for video_data in scrape_result['videos']:
        if video_data['hash'] not in existing_hashes:
            video_entry = {
                "id": str(uuid.uuid4()),
                "gallery_id": gallery_id,
                "section_id": section_id,
                "hash": video_data['hash'],
                "source_url": video_data['source_url'],
                "thumbnail_url": video_data['thumbnail_url'],
                "width": video_data.get('width', 1080),
                "height": video_data.get('height', 1920),
                "file_type": video_data.get('file_type', 'mp4'),
                "file_source": video_data.get('file_source', 'lumabooth'),
                "created_at_source": video_data.get('created_at_source'),
                "order": video_data.get('order', 0),
                "synced_at": now
            }
            new_videos.append(video_entry)
    
    if new_videos:
        await db.fotoshare_videos.insert_many(new_videos)
    
    return {
        "success": True,
        "expired": False,
        "videos_count": len(scrape_result['videos']),
        "new_videos_added": len(new_videos)
    }

@api_router.get("/galleries/{gallery_id}/fotoshare-videos")
async def get_fotoshare_videos(gallery_id: str, section_id: Optional[str] = None):
    """Get fotoshare videos for a gallery (supports both gallery_id and share_link)"""
    # First try to find by gallery_id
    gallery = await db.galleries.find_one({"id": gallery_id}, {"_id": 0, "id": 1})
    
    # If not found, try by share_link
    if not gallery:
        gallery = await db.galleries.find_one({"share_link": gallery_id}, {"_id": 0, "id": 1})
    
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    actual_gallery_id = gallery["id"]
    query = {"gallery_id": actual_gallery_id}
    if section_id:
        query["section_id"] = section_id
    
    videos = await db.fotoshare_videos.find(query, {"_id": 0}).to_list(500)
    videos.sort(key=lambda v: v.get("order", 0))
    return videos

@api_router.delete("/galleries/{gallery_id}/fotoshare-sections/{section_id}")
async def delete_fotoshare_section(
    gallery_id: str,
    section_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a fotoshare section and all its videos"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    sections = gallery.get("sections", [])
    section = next((s for s in sections if s["id"] == section_id), None)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    # Remove section
    sections = [s for s in sections if s["id"] != section_id]
    await db.galleries.update_one({"id": gallery_id}, {"$set": {"sections": sections}})
    
    # Delete associated videos
    await db.fotoshare_videos.delete_many({"gallery_id": gallery_id, "section_id": section_id})
    
    return {"message": "Fotoshare section deleted"}

# ============ pCloud Integration Endpoints ============

@api_router.post("/galleries/{gallery_id}/pcloud-sections")
async def create_pcloud_section(
    gallery_id: str,
    pcloud_url: str = Body(..., embed=True),
    section_name: Optional[str] = Body(None, embed=True),
    current_user: dict = Depends(get_current_user)
):
    """Create a new pCloud section by linking to a pCloud shared folder"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Extract code from URL
    code = extract_pcloud_code(pcloud_url)
    if not code:
        raise HTTPException(status_code=400, detail="Invalid pCloud URL. Please provide a valid share link.")
    
    # Fetch folder contents from pCloud
    pcloud_data = await fetch_pcloud_folder(code)
    if not pcloud_data['success']:
        raise HTTPException(status_code=400, detail=f"Failed to fetch pCloud folder: {pcloud_data['error']}")
    
    # Create section
    sections = gallery.get("sections", [])
    new_order = max([s.get("order", 0) for s in sections], default=-1) + 1
    
    section_id = str(uuid.uuid4())
    new_section = {
        "id": section_id,
        "name": section_name or pcloud_data['folder_name'],
        "order": new_order,
        "type": "pcloud",
        "pcloud_code": code,
        "pcloud_folder_name": pcloud_data['folder_name'],
        "pcloud_last_sync": datetime.now(timezone.utc).isoformat(),
        "pcloud_error": None
    }
    
    sections.append(new_section)
    await db.galleries.update_one({"id": gallery_id}, {"$set": {"sections": sections}})
    
    # Store photos in database
    sync_time = datetime.now(timezone.utc).isoformat()
    pcloud_photos = []
    for idx, photo in enumerate(pcloud_data['photos']):
        pcloud_photos.append({
            "id": str(uuid.uuid4()),
            "gallery_id": gallery_id,
            "section_id": section_id,
            "pcloud_code": code,
            "fileid": str(photo['fileid']),  # Convert to string to avoid MongoDB int overflow
            "name": photo['name'],
            "size": photo.get('size', 0),
            "width": photo.get('width'),
            "height": photo.get('height'),
            "contenttype": photo.get('contenttype', 'image/jpeg'),
            "supplier_name": photo.get('supplier_name'),
            "hash": str(photo.get('hash', '')) if photo.get('hash') else None,  # Convert to string
            "created_at_source": photo.get('created'),
            "order": idx,
            "synced_at": sync_time
        })
    
    if pcloud_photos:
        await db.pcloud_photos.insert_many(pcloud_photos)
    
    return {
        "section": new_section,
        "photo_count": len(pcloud_photos),
        "subfolders": pcloud_data['subfolders']
    }

@api_router.post("/galleries/{gallery_id}/pcloud-sections/{section_id}/refresh")
async def refresh_pcloud_section(
    gallery_id: str,
    section_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Refresh photos from a pCloud section"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    sections = gallery.get("sections", [])
    section = next((s for s in sections if s["id"] == section_id and s.get("type") == "pcloud"), None)
    if not section:
        raise HTTPException(status_code=404, detail="pCloud section not found")
    
    code = section.get("pcloud_code")
    if not code:
        raise HTTPException(status_code=400, detail="Section has no pCloud code")
    
    # Fetch fresh data from pCloud
    pcloud_data = await fetch_pcloud_folder(code)
    
    # Update section status
    for s in sections:
        if s["id"] == section_id:
            s["pcloud_last_sync"] = datetime.now(timezone.utc).isoformat()
            s["pcloud_error"] = pcloud_data['error'] if not pcloud_data['success'] else None
            break
    
    await db.galleries.update_one({"id": gallery_id}, {"$set": {"sections": sections}})
    
    if not pcloud_data['success']:
        return {"success": False, "error": pcloud_data['error'], "photos_added": 0}
    
    # Get existing photo fileids
    existing = await db.pcloud_photos.find(
        {"gallery_id": gallery_id, "section_id": section_id},
        {"_id": 0, "fileid": 1}
    ).to_list(10000)
    existing_fileids = {p["fileid"] for p in existing}
    
    # Add new photos
    sync_time = datetime.now(timezone.utc).isoformat()
    existing_count = len(existing_fileids)
    new_photos = []
    
    for photo in pcloud_data['photos']:
        fileid_str = str(photo['fileid'])
        if fileid_str not in existing_fileids:
            new_photos.append({
                "id": str(uuid.uuid4()),
                "gallery_id": gallery_id,
                "section_id": section_id,
                "pcloud_code": code,
                "fileid": fileid_str,  # Store as string
                "name": photo['name'],
                "size": photo.get('size', 0),
                "width": photo.get('width'),
                "height": photo.get('height'),
                "contenttype": photo.get('contenttype', 'image/jpeg'),
                "supplier_name": photo.get('supplier_name'),
                "hash": str(photo.get('hash', '')) if photo.get('hash') else None,
                "created_at_source": photo.get('created'),
                "order": existing_count + len(new_photos),
                "synced_at": sync_time
            })
    
    if new_photos:
        await db.pcloud_photos.insert_many(new_photos)
    
    return {
        "success": True,
        "photos_added": len(new_photos),
        "total_photos": len(pcloud_data['photos']),
        "subfolders": pcloud_data['subfolders']
    }

@api_router.get("/galleries/{gallery_id}/pcloud-photos")
async def get_pcloud_photos(
    gallery_id: str,
    section_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all pCloud photos for a gallery or specific section"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    query = {"gallery_id": gallery_id}
    if section_id:
        query["section_id"] = section_id
    
    photos = await db.pcloud_photos.find(query, {"_id": 0}).to_list(10000)
    photos.sort(key=lambda p: p.get("order", 0))
    return photos

@api_router.delete("/galleries/{gallery_id}/pcloud-sections/{section_id}")
async def delete_pcloud_section(
    gallery_id: str,
    section_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a pCloud section and all its photos"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    sections = gallery.get("sections", [])
    section = next((s for s in sections if s["id"] == section_id), None)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    # Remove section
    sections = [s for s in sections if s["id"] != section_id]
    await db.galleries.update_one({"id": gallery_id}, {"$set": {"sections": sections}})
    
    # Delete associated photos
    await db.pcloud_photos.delete_many({"gallery_id": gallery_id, "section_id": section_id})
    
    return {"message": "pCloud section deleted"}

@api_router.get("/pcloud/serve/{code}/{fileid}")
async def serve_pcloud_image(code: str, fileid: str):
    """
    Proxy a pCloud image through our server.
    This bypasses ISP blocking (e.g., Smart in Philippines blocks pCloud).
    """
    # Get download URL from pCloud (fileid needs to be int for API)
    download_info = await get_pcloud_download_url(code, int(fileid))
    if not download_info:
        raise HTTPException(status_code=404, detail="Could not get pCloud download URL")
    
    # Fetch the image
    import aiohttp
    try:
        timeout = aiohttp.ClientTimeout(total=60)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(download_info['url']) as response:
                if response.status != 200:
                    raise HTTPException(status_code=response.status, detail="Failed to fetch from pCloud")
                
                content = await response.read()
                content_type = response.headers.get('Content-Type', 'image/jpeg')
                
                return StreamingResponse(
                    io.BytesIO(content),
                    media_type=content_type,
                    headers={
                        "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
                        "Content-Length": str(len(content))
                    }
                )
    except aiohttp.ClientError as e:
        logger.error(f"Error proxying pCloud image: {e}")
        raise HTTPException(status_code=502, detail="Failed to fetch image from pCloud")

@api_router.get("/pcloud/thumb/{code}/{fileid}")
async def serve_pcloud_thumbnail(code: str, fileid: str, size: str = "400x400"):
    """
    Proxy a pCloud thumbnail through our server.
    Much smaller than full image - great for gallery grid views.
    
    Size format: WIDTHxHEIGHT (e.g., 400x400, 200x200)
    Valid sizes: dimensions divisible by 4 or 5, between 16-2048 (max 1024 height)
    """
    import aiohttp
    
    try:
        # Use pCloud's getpubthumb API
        api_url = f"https://api.pcloud.com/getpubthumb?code={code}&fileid={fileid}&size={size}"
        
        timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(api_url) as response:
                if response.status != 200:
                    # Fall back to serving full image if thumbnail fails
                    logger.warning(f"pCloud thumbnail failed, status: {response.status}")
                    raise HTTPException(status_code=response.status, detail="Thumbnail not available")
                
                content = await response.read()
                content_type = response.headers.get('Content-Type', 'image/jpeg')
                
                return StreamingResponse(
                    io.BytesIO(content),
                    media_type=content_type,
                    headers={
                        "Cache-Control": "public, max-age=86400",  # Cache thumbnails for 24 hours
                        "Content-Length": str(len(content))
                    }
                )
    except aiohttp.ClientError as e:
        logger.error(f"Error fetching pCloud thumbnail: {e}")
        raise HTTPException(status_code=502, detail="Failed to fetch thumbnail from pCloud")

@api_router.get("/public/gallery/{share_link}/pcloud-photos")
async def get_public_pcloud_photos(share_link: str, section_id: Optional[str] = None):
    """Get pCloud photos for public gallery view"""
    gallery = await db.galleries.find_one({"share_link": share_link}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    query = {"gallery_id": gallery["id"]}
    if section_id:
        query["section_id"] = section_id
    
    photos = await db.pcloud_photos.find(query, {"_id": 0}).to_list(10000)
    photos.sort(key=lambda p: p.get("order", 0))
    
    # Add proxy URLs for each photo (without /api prefix since frontend adds it)
    for photo in photos:
        code = photo['pcloud_code']
        fileid = photo['fileid']
        photo["proxy_url"] = f"/pcloud/serve/{code}/{fileid}"
        photo["thumbnail_url"] = f"/pcloud/thumb/{code}/{fileid}?size=400x400"
    
    return photos

# ============ Google Drive Section Endpoints ============

class GoogleDriveSectionCreate(BaseModel):
    gdrive_url: Optional[str] = None  # Now optional - can create empty section first
    section_name: Optional[str] = None
    contributor_name: Optional[str] = None
    contributor_role: Optional[str] = None

@api_router.post("/galleries/{gallery_id}/gdrive-sections")
async def create_gdrive_section(
    gallery_id: str,
    data: GoogleDriveSectionCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new Google Drive section by linking to a public Google Drive folder"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Extract folder ID from URL
    folder_id = extract_gdrive_folder_id(data.gdrive_url)
    if not folder_id:
        raise HTTPException(status_code=400, detail="Invalid Google Drive URL. Please provide a valid folder link.")
    
    # Fetch folder contents from Google Drive
    gdrive_data = await get_gdrive_photos(folder_id)
    if not gdrive_data['success']:
        raise HTTPException(status_code=400, detail=f"Failed to fetch Google Drive folder: {gdrive_data['error']}")
    
    if not gdrive_data['photos']:
        raise HTTPException(status_code=400, detail="No photos found in the Google Drive folder. Make sure it contains images and is publicly shared.")
    
    # Create section
    sections = gallery.get("sections", [])
    new_order = max([s.get("order", 0) for s in sections], default=-1) + 1
    
    section_id = str(uuid.uuid4())
    new_section = {
        "id": section_id,
        "name": data.section_name or gdrive_data['folder_name'],
        "order": new_order,
        "type": "gdrive",
        "gdrive_folder_id": folder_id,
        "gdrive_folder_name": gdrive_data['folder_name'],
        "gdrive_last_sync": datetime.now(timezone.utc).isoformat(),
        "gdrive_error": None,
        "contributor_name": data.contributor_name,
        "contributor_role": data.contributor_role or "Photos"
    }
    
    sections.append(new_section)
    await db.galleries.update_one({"id": gallery_id}, {"$set": {"sections": sections}})
    
    # Store photos in database
    sync_time = datetime.now(timezone.utc).isoformat()
    gdrive_photos = []
    for idx, photo in enumerate(gdrive_data['photos']):
        gdrive_photos.append({
            "id": str(uuid.uuid4()),
            "gallery_id": gallery_id,
            "section_id": section_id,
            "gdrive_folder_id": folder_id,
            "file_id": photo['file_id'],
            "name": photo['name'],
            "mime_type": photo.get('mime_type', 'image/jpeg'),
            "size": photo.get('size', 0),
            "width": photo.get('width'),
            "height": photo.get('height'),
            "thumbnail_url": photo['thumbnail_url'],
            "view_url": photo['view_url'],
            "created_time": photo.get('created_time'),
            "order": idx,
            "is_highlight": False,
            "synced_at": sync_time
        })
    
    if gdrive_photos:
        await db.gdrive_photos.insert_many(gdrive_photos)
    
    return {
        "section": new_section,
        "photo_count": len(gdrive_photos)
    }

@api_router.post("/galleries/{gallery_id}/gdrive-sections/{section_id}/refresh")
async def refresh_gdrive_section(
    gallery_id: str,
    section_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Manually refresh a Google Drive section to sync new photos"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    section = next((s for s in gallery.get("sections", []) if s["id"] == section_id and s.get("type") == "gdrive"), None)
    if not section:
        raise HTTPException(status_code=404, detail="Google Drive section not found")
    
    folder_id = section.get("gdrive_folder_id")
    if not folder_id:
        raise HTTPException(status_code=400, detail="Section has no Google Drive folder ID")
    
    # Fetch updated folder contents
    gdrive_data = await get_gdrive_photos(folder_id)
    if not gdrive_data['success']:
        # Update section with error
        await db.galleries.update_one(
            {"id": gallery_id, "sections.id": section_id},
            {"$set": {
                "sections.$.gdrive_error": gdrive_data['error'],
                "sections.$.gdrive_last_sync": datetime.now(timezone.utc).isoformat()
            }}
        )
        raise HTTPException(status_code=400, detail=f"Failed to refresh: {gdrive_data['error']}")
    
    # Get existing photos to preserve highlight status
    existing_photos = await db.gdrive_photos.find(
        {"gallery_id": gallery_id, "section_id": section_id},
        {"_id": 0}
    ).to_list(10000)
    existing_highlights = {p['file_id']: p.get('is_highlight', False) for p in existing_photos}
    
    # Delete old photos
    await db.gdrive_photos.delete_many({"gallery_id": gallery_id, "section_id": section_id})
    
    # Insert new photos
    sync_time = datetime.now(timezone.utc).isoformat()
    gdrive_photos = []
    for idx, photo in enumerate(gdrive_data['photos']):
        file_id = photo['file_id']
        gdrive_photos.append({
            "id": str(uuid.uuid4()),
            "gallery_id": gallery_id,
            "section_id": section_id,
            "gdrive_folder_id": folder_id,
            "file_id": file_id,
            "name": photo['name'],
            "mime_type": photo.get('mime_type', 'image/jpeg'),
            "size": photo.get('size', 0),
            "width": photo.get('width'),
            "height": photo.get('height'),
            "thumbnail_url": photo['thumbnail_url'],
            "view_url": photo['view_url'],
            "created_time": photo.get('created_time'),
            "order": idx,
            "is_highlight": existing_highlights.get(file_id, False),  # Preserve highlight
            "synced_at": sync_time
        })
    
    if gdrive_photos:
        await db.gdrive_photos.insert_many(gdrive_photos)
    
    # Update section
    await db.galleries.update_one(
        {"id": gallery_id, "sections.id": section_id},
        {"$set": {
            "sections.$.gdrive_last_sync": sync_time,
            "sections.$.gdrive_error": None
        }}
    )
    
    return {
        "message": "Google Drive section refreshed",
        "photo_count": len(gdrive_photos)
    }

@api_router.delete("/galleries/{gallery_id}/gdrive-sections/{section_id}")
async def delete_gdrive_section(
    gallery_id: str,
    section_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a Google Drive section and its photos"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Remove section from gallery
    sections = [s for s in gallery.get("sections", []) if s["id"] != section_id]
    await db.galleries.update_one({"id": gallery_id}, {"$set": {"sections": sections}})
    
    # Delete photos from database
    await db.gdrive_photos.delete_many({"gallery_id": gallery_id, "section_id": section_id})
    
    return {"message": "Google Drive section deleted"}

@api_router.post("/galleries/{gallery_id}/gdrive-sections/{section_id}/photos/{photo_id}/highlight")
async def toggle_gdrive_photo_highlight(
    gallery_id: str,
    section_id: str,
    photo_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Toggle highlight status for a Google Drive photo"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    photo = await db.gdrive_photos.find_one({"id": photo_id, "section_id": section_id}, {"_id": 0})
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    
    new_highlight = not photo.get("is_highlight", False)
    await db.gdrive_photos.update_one(
        {"id": photo_id},
        {"$set": {"is_highlight": new_highlight}}
    )
    
    return {"is_highlight": new_highlight}

@api_router.get("/public/gallery/{share_link}/gdrive-photos")
async def get_public_gdrive_photos(share_link: str, section_id: Optional[str] = None):
    """Get Google Drive photos for a public gallery"""
    gallery = await db.galleries.find_one({"share_link": share_link, "is_published": True}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    query = {"gallery_id": gallery["id"]}
    if section_id:
        query["section_id"] = section_id
    
    photos = await db.gdrive_photos.find(query, {"_id": 0}).to_list(10000)
    
    # Sort: highlights first, then by order
    photos.sort(key=lambda p: (not p.get("is_highlight", False), p.get("order", 0)))
    
    return photos

@api_router.get("/gdrive/proxy/{file_id}")
async def proxy_gdrive_image(file_id: str, thumb: bool = False):
    """Proxy Google Drive images to avoid CORS issues"""
    try:
        if thumb:
            url = f"https://drive.google.com/thumbnail?id={file_id}&sz=w800"
        else:
            url = f"https://drive.google.com/uc?export=view&id={file_id}"
        
        async with aiohttp.ClientSession() as session:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            async with session.get(url, headers=headers, allow_redirects=True) as response:
                if response.status == 200:
                    content = await response.read()
                    content_type = response.headers.get('Content-Type', 'image/jpeg')
                    
                    return Response(
                        content=content,
                        media_type=content_type,
                        headers={
                            "Cache-Control": "public, max-age=86400",
                            "Access-Control-Allow-Origin": "*"
                        }
                    )
                else:
                    raise HTTPException(status_code=response.status, detail="Failed to fetch image")
    except Exception as e:
        logger.error(f"Error proxying Google Drive image: {e}")
        raise HTTPException(status_code=500, detail="Failed to proxy image")

# ============ Gallery Videos Endpoints ============

@api_router.get("/galleries/{gallery_id}/videos")
async def get_gallery_videos(gallery_id: str, current_user: dict = Depends(get_current_user)):
    """Get all videos for a gallery"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    videos = await db.gallery_videos.find({"gallery_id": gallery_id}, {"_id": 0}).to_list(100)
    # Sort by order, then by featured status
    videos.sort(key=lambda v: (not v.get("is_featured", False), v.get("order", 0)))
    return videos

@api_router.post("/galleries/{gallery_id}/sections/{section_id}/videos")
async def create_video(
    gallery_id: str, 
    section_id: str, 
    video: VideoCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add a video to a video section"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Verify section exists and is video type
    section = next((s for s in gallery.get("sections", []) if s["id"] == section_id), None)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    if section.get("type") != "video":
        raise HTTPException(status_code=400, detail="Section is not a video section")
    
    # Extract YouTube video ID
    video_id = extract_youtube_video_id(video.youtube_url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")
    
    # Get existing videos count for order
    existing_count = await db.gallery_videos.count_documents({"gallery_id": gallery_id, "section_id": section_id})
    
    # If this is featured, unfeatured other videos in this section
    if video.is_featured:
        await db.gallery_videos.update_many(
            {"gallery_id": gallery_id, "section_id": section_id},
            {"$set": {"is_featured": False}}
        )
    
    video_doc = {
        "id": str(uuid.uuid4()),
        "gallery_id": gallery_id,
        "section_id": section_id,
        "youtube_url": video.youtube_url,
        "video_id": video_id,
        "tag": video.tag,
        "title": video.title,
        "description": video.description,
        "thumbnail_url": None,
        "thumbnail_position": None,
        "youtube_thumbnail_url": get_youtube_thumbnail_url(video_id),
        "duration": None,
        "is_featured": video.is_featured,
        "uploaded_by": "photographer",
        "contributor_name": None,
        "order": existing_count,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.gallery_videos.insert_one(video_doc)
    video_doc.pop("_id", None)
    
    return video_doc

@api_router.put("/galleries/{gallery_id}/videos/{video_id}")
async def update_video(
    gallery_id: str, 
    video_id: str, 
    update: VideoUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a video"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    video = await db.gallery_videos.find_one({"id": video_id, "gallery_id": gallery_id}, {"_id": 0})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    update_data = {}
    
    if update.youtube_url is not None:
        new_video_id = extract_youtube_video_id(update.youtube_url)
        if not new_video_id:
            raise HTTPException(status_code=400, detail="Invalid YouTube URL")
        update_data["youtube_url"] = update.youtube_url
        update_data["video_id"] = new_video_id
        update_data["youtube_thumbnail_url"] = get_youtube_thumbnail_url(new_video_id)
    
    if update.tag is not None:
        update_data["tag"] = update.tag
    if update.title is not None:
        update_data["title"] = update.title
    if update.description is not None:
        update_data["description"] = update.description
    if update.thumbnail_url is not None:
        update_data["thumbnail_url"] = update.thumbnail_url
    if update.thumbnail_position is not None:
        update_data["thumbnail_position"] = update.thumbnail_position
    if update.order is not None:
        update_data["order"] = update.order
    
    if update.is_featured is not None:
        update_data["is_featured"] = update.is_featured
        # If setting as featured, unfeatured others in same section
        if update.is_featured:
            await db.gallery_videos.update_many(
                {"gallery_id": gallery_id, "section_id": video["section_id"], "id": {"$ne": video_id}},
                {"$set": {"is_featured": False}}
            )
    
    if update_data:
        await db.gallery_videos.update_one({"id": video_id}, {"$set": update_data})
    
    updated_video = await db.gallery_videos.find_one({"id": video_id}, {"_id": 0})
    return updated_video

@api_router.delete("/galleries/{gallery_id}/videos/{video_id}")
async def delete_video(gallery_id: str, video_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a video"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    result = await db.gallery_videos.delete_one({"id": video_id, "gallery_id": gallery_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Video not found")
    
    return {"message": "Video deleted"}

@api_router.post("/galleries/{gallery_id}/videos/{video_id}/set-featured")
async def set_featured_video(gallery_id: str, video_id: str, current_user: dict = Depends(get_current_user)):
    """Set a video as the featured video for its section"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    video = await db.gallery_videos.find_one({"id": video_id, "gallery_id": gallery_id}, {"_id": 0})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    # Unfeatured all other videos in the same section
    await db.gallery_videos.update_many(
        {"gallery_id": gallery_id, "section_id": video["section_id"]},
        {"$set": {"is_featured": False}}
    )
    
    # Set this video as featured
    await db.gallery_videos.update_one({"id": video_id}, {"$set": {"is_featured": True}})
    
    return {"message": "Video set as featured", "video_id": video_id}

@api_router.post("/upload-video-thumbnail")
async def upload_video_thumbnail(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """Upload custom thumbnail for a video"""
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="Only image files allowed")
    
    MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
    
    thumbnails_dir = Path("uploads/video_thumbnails")
    thumbnails_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        content = await file.read()
        
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="File too large. Maximum size is 5MB")
        
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Empty file received")
        
        filename = f"{user['id']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
        file_path = thumbnails_dir / filename
        
        # Process and optimize thumbnail
        try:
            img = Image.open(io.BytesIO(content))
            
            # Convert to RGB
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Resize to reasonable max size while maintaining aspect ratio
            max_dimension = 1920
            if max(img.size) > max_dimension:
                ratio = max_dimension / max(img.size)
                new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
                img = img.resize(new_size, Image.Resampling.LANCZOS)
            
            img.save(file_path, 'JPEG', quality=90, optimize=True)
            
        except Exception as img_error:
            logger.error(f"Image processing error: {img_error}")
            with open(file_path, "wb") as f:
                f.write(content)
        
        return {"url": f"/api/files/video_thumbnails/{filename}"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Video thumbnail upload error: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload thumbnail")

# ============ Contributor Upload Link Endpoints ============

@api_router.post("/galleries/{gallery_id}/sections/{section_id}/contributor-link")
async def generate_contributor_link(gallery_id: str, section_id: str, current_user: dict = Depends(get_current_user)):
    """Generate a unique contributor upload link for a section"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    sections = gallery.get("sections", [])
    section_idx = next((i for i, s in enumerate(sections) if s["id"] == section_id), None)
    if section_idx is None:
        raise HTTPException(status_code=404, detail="Section not found")
    
    # Generate unique contributor link
    contributor_link = secrets.token_urlsafe(16)
    
    # Update section with contributor link
    sections[section_idx]["contributor_link"] = contributor_link
    sections[section_idx]["contributor_enabled"] = True
    
    await db.galleries.update_one({"id": gallery_id}, {"$set": {"sections": sections}})
    
    return {
        "contributor_link": contributor_link,
        "section_id": section_id,
        "section_name": sections[section_idx]["name"]
    }

@api_router.delete("/galleries/{gallery_id}/sections/{section_id}/contributor-link")
async def revoke_contributor_link(gallery_id: str, section_id: str, current_user: dict = Depends(get_current_user)):
    """Revoke/disable contributor upload link for a section"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    sections = gallery.get("sections", [])
    section_idx = next((i for i, s in enumerate(sections) if s["id"] == section_id), None)
    if section_idx is None:
        raise HTTPException(status_code=404, detail="Section not found")
    
    # Disable contributor link
    sections[section_idx]["contributor_link"] = None
    sections[section_idx]["contributor_enabled"] = False
    # Note: We keep contributor_name to preserve attribution on existing photos
    
    await db.galleries.update_one({"id": gallery_id}, {"$set": {"sections": sections}})
    
    return {"message": "Contributor link revoked"}

@api_router.get("/contributor/{contributor_link}")
async def get_contributor_upload_info(contributor_link: str):
    """Get gallery and section info for contributor upload page"""
    # Find gallery with this contributor link in any section
    gallery = await db.galleries.find_one(
        {"sections.contributor_link": contributor_link},
        {"_id": 0, "id": 1, "title": 1, "sections": 1, "photographer_id": 1}
    )
    if not gallery:
        raise HTTPException(status_code=404, detail="Invalid or expired contributor link")
    
    # Find the specific section
    section = next((s for s in gallery.get("sections", []) if s.get("contributor_link") == contributor_link), None)
    if not section or not section.get("contributor_enabled", False):
        raise HTTPException(status_code=404, detail="Contributor uploads are not enabled for this section")
    
    # Get photographer info for display
    photographer = await db.users.find_one({"id": gallery["photographer_id"]}, {"_id": 0, "business_name": 1, "name": 1})
    
    # Get existing videos if this is a video section
    existing_videos = []
    if section.get("type") == "video":
        videos = await db.gallery_videos.find(
            {"gallery_id": gallery["id"], "section_id": section["id"]},
            {"_id": 0}
        ).to_list(50)
        existing_videos = videos
    
    # Get existing fotoshare videos if this is a fotoshare section
    existing_fotoshare_videos = []
    if section.get("type") == "fotoshare":
        fvideos = await db.fotoshare_videos.find(
            {"gallery_id": gallery["id"], "section_id": section["id"]},
            {"_id": 0}
        ).to_list(100)
        existing_fotoshare_videos = fvideos
    
    return {
        "gallery_id": gallery["id"],
        "gallery_title": gallery["title"],
        "section_id": section["id"],
        "section_name": section["name"],
        "section_type": section.get("type", "photo"),  # NEW: Return section type
        "photographer_name": photographer.get("business_name") or photographer.get("name", "Photographer"),
        "existing_contributor_name": section.get("contributor_name"),
        "existing_videos": existing_videos,  # For video sections
        "existing_fotoshare_videos": existing_fotoshare_videos,  # For fotoshare sections
        "fotoshare_url": section.get("fotoshare_url")  # Existing fotoshare URL if any
    }

@api_router.post("/contributor/{contributor_link}/set-name")
async def set_contributor_name(contributor_link: str, data: dict = Body(...)):
    """Set the contributor/company name for a section"""
    company_name = data.get("company_name", "").strip()
    if not company_name:
        raise HTTPException(status_code=400, detail="Company name is required")
    
    if len(company_name) > 100:
        raise HTTPException(status_code=400, detail="Company name must be 100 characters or less")
    
    # Find gallery with this contributor link
    gallery = await db.galleries.find_one(
        {"sections.contributor_link": contributor_link},
        {"_id": 0}
    )
    if not gallery:
        raise HTTPException(status_code=404, detail="Invalid contributor link")
    
    sections = gallery.get("sections", [])
    section_idx = next((i for i, s in enumerate(sections) if s.get("contributor_link") == contributor_link), None)
    if section_idx is None:
        raise HTTPException(status_code=404, detail="Section not found")
    
    # Update contributor name
    sections[section_idx]["contributor_name"] = company_name
    
    await db.galleries.update_one({"id": gallery["id"]}, {"$set": {"sections": sections}})
    
    return {"success": True, "company_name": company_name}

@api_router.post("/contributor/{contributor_link}/fotoshare")
async def submit_contributor_fotoshare(contributor_link: str, data: dict = Body(...)):
    """Submit fotoshare.co URL as a contributor for 360 booth section"""
    company_name = data.get("company_name", "").strip()
    fotoshare_url = data.get("fotoshare_url", "").strip()
    
    if not company_name:
        raise HTTPException(status_code=400, detail="Company/supplier name is required")
    
    if not fotoshare_url:
        raise HTTPException(status_code=400, detail="Fotoshare.co URL is required")
    
    # Validate URL format
    if not fotoshare_url.startswith("https://fotoshare.co/"):
        raise HTTPException(status_code=400, detail="Please enter a valid fotoshare.co URL")
    
    # Find gallery with this contributor link
    gallery = await db.galleries.find_one(
        {"sections.contributor_link": contributor_link},
        {"_id": 0}
    )
    if not gallery:
        raise HTTPException(status_code=404, detail="Invalid contributor link")
    
    # Find the section
    section = next((s for s in gallery.get("sections", []) if s.get("contributor_link") == contributor_link), None)
    if not section or not section.get("contributor_enabled", False):
        raise HTTPException(status_code=404, detail="Contributor uploads are not enabled")
    
    if section.get("type") != "fotoshare":
        raise HTTPException(status_code=400, detail="This link is not for 360 booth uploads")
    
    # Scrape the fotoshare URL
    scrape_result = await scrape_fotoshare_videos(fotoshare_url)
    
    if not scrape_result['success']:
        error_msg = scrape_result.get('error', 'Failed to scrape fotoshare URL')
        if scrape_result.get('expired'):
            raise HTTPException(status_code=400, detail=f"Link expired: {error_msg}")
        raise HTTPException(status_code=400, detail=error_msg)
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Update section with fotoshare URL and contributor name
    sections = gallery.get("sections", [])
    section_idx = next((i for i, s in enumerate(sections) if s.get("contributor_link") == contributor_link), None)
    if section_idx is not None:
        sections[section_idx]["fotoshare_url"] = fotoshare_url
        sections[section_idx]["fotoshare_last_sync"] = now
        sections[section_idx]["fotoshare_expired"] = False
        sections[section_idx]["contributor_name"] = company_name
        
        await db.galleries.update_one({"id": gallery["id"]}, {"$set": {"sections": sections}})
    
    # Get existing video hashes to avoid duplicates
    existing_videos = await db.fotoshare_videos.find(
        {"gallery_id": gallery["id"], "section_id": section["id"]},
        {"_id": 0, "hash": 1}
    ).to_list(1000)
    existing_hashes = {v['hash'] for v in existing_videos}
    
    # Store the scraped videos
    new_videos = []
    for video_data in scrape_result['videos']:
        if video_data['hash'] not in existing_hashes:
            video_entry = {
                "id": str(uuid.uuid4()),
                "gallery_id": gallery["id"],
                "section_id": section["id"],
                "hash": video_data['hash'],
                "source_url": video_data['source_url'],
                "thumbnail_url": video_data['thumbnail_url'],
                "width": video_data.get('width', 1080),
                "height": video_data.get('height', 1920),
                "file_type": video_data.get('file_type', 'mp4'),
                "file_source": video_data.get('file_source', 'lumabooth'),
                "created_at_source": video_data.get('created_at_source'),
                "order": video_data.get('order', 0),
                "synced_at": now,
                "contributor_name": company_name
            }
            new_videos.append(video_entry)
    
    if new_videos:
        await db.fotoshare_videos.insert_many(new_videos)
    
    return {
        "success": True,
        "videos_count": len(scrape_result['videos']),
        "new_videos_added": len(new_videos),
        "event_title": scrape_result.get('event_title'),
        "contributor_name": company_name
    }

@api_router.post("/contributor/{contributor_link}/upload")
async def upload_contributor_photo(
    contributor_link: str,
    file: UploadFile = File(...),
    company_name: str = Form(...)
):
    """Upload a photo as a contributor to a specific section"""
    # Validate company name
    if not company_name or not company_name.strip():
        raise HTTPException(status_code=400, detail="Company name is required")
    
    # Find gallery with this contributor link
    gallery = await db.galleries.find_one(
        {"sections.contributor_link": contributor_link},
        {"_id": 0}
    )
    if not gallery:
        raise HTTPException(status_code=404, detail="Invalid contributor link")
    
    # Find the section
    section = next((s for s in gallery.get("sections", []) if s.get("contributor_link") == contributor_link), None)
    if not section or not section.get("contributor_enabled", False):
        raise HTTPException(status_code=404, detail="Contributor uploads are not enabled")
    
    # Validate file type
    allowed_types = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
    if not file.content_type or file.content_type.lower() not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: JPEG, PNG, GIF, WebP, HEIC")
    
    if not file.filename:
        raise HTTPException(status_code=400, detail="File must have a filename")
    
    # Check for duplicates
    existing_filenames = set()
    async for photo in db.photos.find({"gallery_id": gallery["id"]}, {"original_filename": 1}):
        if photo.get("original_filename"):
            existing_filenames.add(photo["original_filename"].lower())
    
    if file.filename.lower() in existing_filenames:
        raise HTTPException(status_code=400, detail=f"Photo '{file.filename}' already exists in this gallery")
    
    # Generate unique filename
    file_ext = file.filename.split('.')[-1].lower()
    filename = f"{uuid.uuid4().hex}.{file_ext}"
    file_path = UPLOAD_DIR / filename
    
    # Get current photo count for order
    photo_count = await db.photos.count_documents({"gallery_id": gallery["id"], "section_id": section["id"]})
    
    # Save the file
    with open(file_path, 'wb') as f:
        shutil.copyfileobj(file.file, f)
    
    # Create photo document with generated ID first
    photo_id = str(uuid.uuid4())
    
    photo = {
        "id": photo_id,
        "gallery_id": gallery["id"],
        "filename": filename,
        "original_filename": file.filename,
        "url": f"/api/photos/serve/{filename}",
        "uploaded_by": "contributor",
        "contributor_name": company_name.strip(),
        "section_id": section["id"],
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "order": photo_count,
        "is_highlight": False,
        "is_hidden": False,
        "is_flagged": False,
        "auto_flagged": False
    }
    
    # Generate thumbnails with retry logic - auto-flag if all retries fail
    thumbnail_failed = False
    try:
        thumb_small = generate_thumbnail(file_path, photo_id, 'small')
        thumb_medium = generate_thumbnail(file_path, photo_id, 'medium')
        
        if thumb_small:
            photo["thumbnail_url"] = thumb_small
        else:
            thumbnail_failed = True
            logger.warning(f"Small thumbnail generation failed for contributor photo {photo_id} after retries")
            
        if thumb_medium:
            photo["thumbnail_medium_url"] = thumb_medium
        else:
            thumbnail_failed = True
            logger.warning(f"Medium thumbnail generation failed for contributor photo {photo_id} after retries")
            
    except Exception as e:
        thumbnail_failed = True
        logger.warning(f"Thumbnail generation exception for contributor photo {photo_id}: {e}")
    
    # Auto-flag photo if thumbnails failed - it will be hidden from public gallery
    if thumbnail_failed:
        photo["is_flagged"] = True
        photo["auto_flagged"] = True
        photo["flagged_at"] = datetime.now(timezone.utc).isoformat()
        photo["flagged_reason"] = "auto:thumbnail_generation_failed"
        logger.info(f"Auto-flagged contributor photo {photo_id} due to thumbnail generation failure")
    
    await db.photos.insert_one(photo)
    
    # Update section contributor name if not set
    if not section.get("contributor_name"):
        sections = gallery.get("sections", [])
        section_idx = next((i for i, s in enumerate(sections) if s["id"] == section["id"]), None)
        if section_idx is not None:
            sections[section_idx]["contributor_name"] = company_name.strip()
            await db.galleries.update_one({"id": gallery["id"]}, {"$set": {"sections": sections}})
    
    # Update gallery photo count
    await db.galleries.update_one(
        {"id": gallery["id"]},
        {"$inc": {"photo_count": 1, "contributor_photos": 1}}
    )
    
    return {
        "id": photo_id,
        "url": photo["url"],
        "thumbnail_url": photo["thumbnail_url"],
        "filename": file.filename
    }

# ============ End Contributor Upload Endpoints ============

@api_router.post("/contributor/{contributor_link}/video")
async def upload_contributor_video(
    contributor_link: str,
    youtube_url: str = Form(...),
    tag: str = Form(...),
    company_name: str = Form(...),
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None)
):
    """Upload a video link as a contributor to a video section"""
    # Validate company name
    if not company_name or not company_name.strip():
        raise HTTPException(status_code=400, detail="Company name is required")
    
    # Find gallery with this contributor link
    gallery = await db.galleries.find_one(
        {"sections.contributor_link": contributor_link},
        {"_id": 0}
    )
    if not gallery:
        raise HTTPException(status_code=404, detail="Invalid contributor link")
    
    # Find the section
    section = next((s for s in gallery.get("sections", []) if s.get("contributor_link") == contributor_link), None)
    if not section or not section.get("contributor_enabled", False):
        raise HTTPException(status_code=404, detail="Contributor uploads are not enabled")
    
    # Verify this is a video section
    if section.get("type") != "video":
        raise HTTPException(status_code=400, detail="This section is not configured for video uploads")
    
    # Extract YouTube video ID
    video_id = extract_youtube_video_id(youtube_url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL. Please provide a valid YouTube video link.")
    
    # Check for duplicate videos
    existing_video = await db.gallery_videos.find_one({
        "gallery_id": gallery["id"],
        "section_id": section["id"],
        "video_id": video_id
    })
    if existing_video:
        raise HTTPException(status_code=400, detail="This video has already been added to this section")
    
    # Update contributor name in section if not set
    sections = gallery.get("sections", [])
    section_idx = next((i for i, s in enumerate(sections) if s.get("contributor_link") == contributor_link), None)
    if section_idx is not None and not sections[section_idx].get("contributor_name"):
        sections[section_idx]["contributor_name"] = company_name.strip()
        await db.galleries.update_one({"id": gallery["id"]}, {"$set": {"sections": sections}})
    
    # Get existing videos count for order
    existing_count = await db.gallery_videos.count_documents({
        "gallery_id": gallery["id"],
        "section_id": section["id"]
    })
    
    # Create video document
    video_doc = {
        "id": str(uuid.uuid4()),
        "gallery_id": gallery["id"],
        "section_id": section["id"],
        "youtube_url": youtube_url,
        "video_id": video_id,
        "tag": tag.strip(),
        "title": title.strip() if title else None,
        "description": description.strip() if description else None,
        "thumbnail_url": None,
        "thumbnail_position": None,
        "youtube_thumbnail_url": get_youtube_thumbnail_url(video_id),
        "duration": None,
        "is_featured": existing_count == 0,  # First video is automatically featured
        "uploaded_by": "contributor",
        "contributor_name": company_name.strip(),
        "order": existing_count,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.gallery_videos.insert_one(video_doc)
    
    return {
        "success": True,
        "message": "Video added successfully",
        "video": {
            "id": video_doc["id"],
            "tag": video_doc["tag"],
            "title": video_doc["title"],
            "youtube_thumbnail_url": video_doc["youtube_thumbnail_url"],
            "is_featured": video_doc["is_featured"]
        }
    }

@api_router.delete("/contributor/{contributor_link}/video/{video_id}")
async def delete_contributor_video(contributor_link: str, video_id: str, company_name: str = None):
    """Delete a video uploaded by contributor"""
    # Find gallery with this contributor link
    gallery = await db.galleries.find_one(
        {"sections.contributor_link": contributor_link},
        {"_id": 0}
    )
    if not gallery:
        raise HTTPException(status_code=404, detail="Invalid contributor link")
    
    # Find the section
    section = next((s for s in gallery.get("sections", []) if s.get("contributor_link") == contributor_link), None)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    # Find and delete the video (must be in same section and uploaded by contributor)
    video = await db.gallery_videos.find_one({
        "id": video_id,
        "gallery_id": gallery["id"],
        "section_id": section["id"],
        "uploaded_by": "contributor"
    })
    
    if not video:
        raise HTTPException(status_code=404, detail="Video not found or you don't have permission to delete it")
    
    await db.gallery_videos.delete_one({"id": video_id})
    
    return {"success": True, "message": "Video deleted"}

# ============ Gallery Photos Endpoints ============

@api_router.post("/galleries/{gallery_id}/photos", response_model=Photo)
async def upload_photo(gallery_id: str, file: UploadFile = File(...), section_id: Optional[str] = Form(None), current_user: dict = Depends(get_current_user)):
    """Optimized photo upload with concurrency control and async I/O"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Validate file type more thoroughly
    allowed_types = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
    if not file.content_type or not any(file.content_type.lower().startswith(t.split('/')[0]) for t in allowed_types):
        raise HTTPException(status_code=400, detail=f"Invalid file type: {file.content_type}. Allowed: JPEG, PNG, GIF, WebP, HEIC")
    
    # Validate filename
    if not file.filename:
        raise HTTPException(status_code=400, detail="File must have a filename")
    
    # Get full user data for storage quota calculation
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    
    # Check storage quota using effective quota (considers override modes and billing settings)
    storage_used = current_user.get("storage_used", 0)
    storage_quota = await get_effective_storage_quota(user or current_user)
    
    # Read file content with size limit (50MB max per file)
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
    try:
        file_content = await file.read()
        file_size = len(file_content)
        
        if file_size == 0:
            raise HTTPException(status_code=400, detail="File is empty")
        
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail=f"File too large. Maximum size is 50MB, got {file_size/(1024*1024):.1f}MB")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reading uploaded file: {e}")
        raise HTTPException(status_code=400, detail="Failed to read uploaded file")
    
    # Check storage quota (skip if unlimited: -1)
    if storage_quota != -1 and storage_used + file_size > storage_quota:
        raise HTTPException(
            status_code=403, 
            detail=f"Storage quota exceeded. Used: {storage_used/(1024*1024):.1f}MB / {storage_quota/(1024*1024):.0f}MB"
        )
    
    photo_id = str(uuid.uuid4())
    # Sanitize file extension
    original_ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else 'jpg'
    allowed_extensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif']
    file_ext = original_ext if original_ext in allowed_extensions else 'jpg'
    filename = f"{photo_id}.{file_ext}"
    
    # Use R2 storage service if available, otherwise fall back to local
    async with upload_semaphore:
        if storage.r2_enabled:
            # Upload to R2 with automatic thumbnail generation
            upload_result = await storage.upload_with_thumbnails(
                photo_id=photo_id,
                content=file_content,
                file_ext=file_ext,
                content_type=file.content_type or 'image/jpeg'
            )
            
            if not upload_result['success']:
                logger.error(f"R2 upload failed for {photo_id}: {upload_result.get('error')}")
                raise HTTPException(status_code=500, detail="Failed to save photo. Please try again.")
            
            photo_url = upload_result['original_url']
            thumb_small = upload_result.get('thumbnail_url')
            thumb_medium = upload_result.get('thumbnail_medium_url')
            storage_key = upload_result['original_key']  # Store R2 key for deletion
        else:
            # Fallback to local filesystem
            file_path = UPLOAD_DIR / filename
            try:
                async with aiofiles.open(file_path, 'wb') as f:
                    await f.write(file_content)
                
                if not file_path.exists() or file_path.stat().st_size != file_size:
                    raise Exception("File verification failed")
            except Exception as e:
                logger.error(f"Error writing file {filename}: {e}")
                if file_path.exists():
                    try:
                        file_path.unlink()
                    except:
                        pass
                raise HTTPException(status_code=500, detail="Failed to save photo. Please try again.")
            
            photo_url = f"/api/photos/serve/{filename}"
            storage_key = filename  # For local, just use filename
            
            # Generate thumbnails locally
            thumb_small = generate_thumbnail(file_path, photo_id, 'small')
            thumb_medium = generate_thumbnail(file_path, photo_id, 'medium')
    
    # Update storage used
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$inc": {"storage_used": file_size}}
    )
    
    photo_doc = {
        "id": photo_id,
        "gallery_id": gallery_id,
        "filename": filename,
        "original_filename": file.filename,
        "url": photo_url,
        "storage_key": storage_key,  # Store key for R2 deletion
        "uploaded_by": "photographer",
        "section_id": section_id,
        "file_size": file_size,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "is_flagged": False,
        "is_hidden": False,
        "auto_flagged": False
    }
    
    # Add thumbnail URLs if available
    thumbnail_failed = False
    if thumb_small:
        photo_doc["thumbnail_url"] = thumb_small
    else:
        thumbnail_failed = True
        logger.warning(f"Small thumbnail generation failed for {photo_id}")
        
    if thumb_medium:
        photo_doc["thumbnail_medium_url"] = thumb_medium
    else:
        thumbnail_failed = True
        logger.warning(f"Medium thumbnail generation failed for {photo_id}")
    
    # Auto-flag photo if thumbnails failed - it will be hidden from public gallery
    if thumbnail_failed:
        photo_doc["is_flagged"] = True
        photo_doc["auto_flagged"] = True
        photo_doc["flagged_at"] = datetime.now(timezone.utc).isoformat()
        photo_doc["flagged_reason"] = "auto:thumbnail_generation_failed"
        logger.info(f"Auto-flagged photo {photo_id} due to thumbnail generation failure")
    
    try:
        await db.photos.insert_one(photo_doc)
    except Exception as e:
        logger.error(f"Error saving photo to database: {e}")
        # Clean up file if DB insert fails
        if storage.r2_enabled:
            await storage.delete_photo_with_thumbnails(photo_id, file_ext)
        else:
            file_path = UPLOAD_DIR / filename
            if file_path.exists():
                try:
                    file_path.unlink()
                except:
                    pass
        # Revert storage
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$inc": {"storage_used": -file_size}}
        )
        raise HTTPException(status_code=500, detail="Failed to save photo record. Please try again.")
    
    return Photo(**{k: v for k, v in photo_doc.items() if k != '_id'})

@api_router.get("/galleries/{gallery_id}/photos", response_model=List[Photo])
async def get_gallery_photos(gallery_id: str, current_user: dict = Depends(get_current_user)):
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Get photos sorted by: highlights first, then by order, then by upload date
    photos = await db.photos.find(
        {"gallery_id": gallery_id}, 
        {"_id": 0}
    ).sort([("is_highlight", -1), ("order", 1), ("uploaded_at", -1)]).limit(500).to_list(None)
    return [Photo(**p) for p in photos]

@api_router.delete("/photos/{photo_id}")
async def delete_photo(photo_id: str, current_user: dict = Depends(get_current_user)):
    photo = await db.photos.find_one({"id": photo_id}, {"_id": 0})
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    
    gallery = await db.galleries.find_one({"id": photo["gallery_id"], "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    file_size = photo.get("file_size", 0)
    filename = photo.get("filename", "")
    
    # Delete from R2 if enabled
    if storage.r2_enabled:
        # Get file extension
        file_ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'jpg'
        await storage.delete_photo_with_thumbnails(photo_id, file_ext)
        logger.info(f"Deleted photo from R2: {photo_id}")
    
    # Also delete from local filesystem (for migration/fallback)
    file_path = UPLOAD_DIR / filename
    if file_path.exists():
        if file_size == 0:
            file_size = file_path.stat().st_size
        file_path.unlink()
        logger.info(f"Deleted local photo file: {file_path}")
    
    # Delete local thumbnails
    for size_name in ['small', 'medium']:
        thumb_path = THUMBNAILS_DIR / f"{photo_id}_{size_name}.jpg"
        if thumb_path.exists():
            thumb_path.unlink()
            logger.info(f"Deleted local thumbnail: {thumb_path}")
    
    # Update storage used
    if file_size > 0:
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$inc": {"storage_used": -file_size}}
        )
    
    await db.photos.delete_one({"id": photo_id})
    
    return {"message": "Photo deleted"}

# ============ Photo Thumbnail Health & Repair Endpoints ============

class ThumbnailRepairRequest(BaseModel):
    force_regenerate: bool = False

class PhotoHealthCheck(BaseModel):
    photo_id: str
    original_valid: bool
    thumbnail_small_valid: bool
    thumbnail_medium_valid: bool
    is_flagged: bool
    flagged_reason: Optional[str] = None
    needs_repair: bool

@api_router.get("/galleries/{gallery_id}/photos/health")
async def get_gallery_photos_health(gallery_id: str, current_user: dict = Depends(get_current_user)):
    """Check health status of all photos in a gallery - identify broken thumbnails"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    photos = await db.photos.find({"gallery_id": gallery_id}, {"_id": 0}).to_list(None)
    
    health_results = []
    total_issues = 0
    auto_flagged_count = 0
    
    for photo in photos:
        photo_id = photo["id"]
        original_path = UPLOAD_DIR / photo["filename"]
        
        # Check original
        original_valid = validate_image_file(original_path)["valid"]
        
        # Check thumbnails
        thumb_small_valid = validate_thumbnail(photo_id, 'small')["valid"]
        thumb_medium_valid = validate_thumbnail(photo_id, 'medium')["valid"]
        
        needs_repair = not original_valid or not thumb_small_valid or not thumb_medium_valid
        
        if needs_repair:
            total_issues += 1
        
        if photo.get("auto_flagged"):
            auto_flagged_count += 1
        
        health_results.append({
            "photo_id": photo_id,
            "original_filename": photo.get("original_filename", "unknown"),
            "original_valid": original_valid,
            "thumbnail_small_valid": thumb_small_valid,
            "thumbnail_medium_valid": thumb_medium_valid,
            "is_flagged": photo.get("is_flagged", False),
            "auto_flagged": photo.get("auto_flagged", False),
            "flagged_reason": photo.get("flagged_reason"),
            "needs_repair": needs_repair
        })
    
    return {
        "gallery_id": gallery_id,
        "total_photos": len(photos),
        "total_issues": total_issues,
        "auto_flagged_count": auto_flagged_count,
        "photos": health_results
    }

@api_router.post("/galleries/{gallery_id}/photos/repair-thumbnails")
async def repair_gallery_thumbnails(gallery_id: str, data: ThumbnailRepairRequest, current_user: dict = Depends(get_current_user)):
    """Scan and repair all thumbnails in a gallery"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    photos = await db.photos.find({"gallery_id": gallery_id}, {"_id": 0}).to_list(None)
    
    results = {
        "total_photos": len(photos),
        "repaired": 0,
        "failed": 0,
        "already_valid": 0,
        "unflagged": 0,
        "details": []
    }
    
    for photo in photos:
        repair_result = await validate_and_repair_photo_thumbnails(
            photo["id"], 
            force_regenerate=data.force_regenerate
        )
        
        if repair_result["success"]:
            if repair_result.get("regenerated"):
                results["repaired"] += 1
                
                # If photo was auto-flagged due to thumbnails and repair succeeded, unflag it
                if photo.get("auto_flagged") and photo.get("flagged_reason") == "auto:thumbnail_generation_failed":
                    await db.photos.update_one(
                        {"id": photo["id"]},
                        {"$set": {
                            "is_flagged": False,
                            "auto_flagged": False,
                            "flagged_at": None,
                            "flagged_reason": None
                        }}
                    )
                    results["unflagged"] += 1
            else:
                results["already_valid"] += 1
        else:
            results["failed"] += 1
            results["details"].append({
                "photo_id": photo["id"],
                "error": repair_result.get("error")
            })
    
    return results

@api_router.post("/photos/{photo_id}/repair-thumbnail")
async def repair_single_photo_thumbnail(photo_id: str, data: ThumbnailRepairRequest, current_user: dict = Depends(get_current_user)):
    """Repair thumbnails for a single photo"""
    photo = await db.photos.find_one({"id": photo_id}, {"_id": 0})
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    
    gallery = await db.galleries.find_one({"id": photo["gallery_id"], "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await validate_and_repair_photo_thumbnails(photo_id, force_regenerate=data.force_regenerate)
    
    # If repair succeeded and photo was auto-flagged, unflag it
    if result["success"] and photo.get("auto_flagged") and photo.get("flagged_reason") == "auto:thumbnail_generation_failed":
        await db.photos.update_one(
            {"id": photo_id},
            {"$set": {
                "is_flagged": False,
                "auto_flagged": False,
                "flagged_at": None,
                "flagged_reason": None
            }}
        )
        result["unflagged"] = True
    
    return result

@api_router.post("/photos/{photo_id}/unflag")
async def unflag_photo(photo_id: str, current_user: dict = Depends(get_current_user)):
    """Manually unflag a photo (makes it visible in public gallery again)"""
    photo = await db.photos.find_one({"id": photo_id}, {"_id": 0})
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    
    gallery = await db.galleries.find_one({"id": photo["gallery_id"], "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.photos.update_one(
        {"id": photo_id},
        {"$set": {
            "is_flagged": False,
            "auto_flagged": False,
            "flagged_at": None,
            "flagged_reason": None
        }}
    )
    
    return {"message": "Photo unflagged successfully", "photo_id": photo_id}

@api_router.post("/photos/{photo_id}/flag")
async def flag_photo(photo_id: str, reason: str = "manual", current_user: dict = Depends(get_current_user)):
    """Manually flag a photo (hides it from public gallery)"""
    photo = await db.photos.find_one({"id": photo_id}, {"_id": 0})
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    
    gallery = await db.galleries.find_one({"id": photo["gallery_id"], "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.photos.update_one(
        {"id": photo_id},
        {"$set": {
            "is_flagged": True,
            "auto_flagged": False,
            "flagged_at": datetime.now(timezone.utc).isoformat(),
            "flagged_reason": f"manual:{reason}"
        }}
    )
    
    return {"message": "Photo flagged successfully", "photo_id": photo_id}

@api_router.get("/galleries/{gallery_id}/flagged-photos")
async def get_gallery_flagged_photos(gallery_id: str, current_user: dict = Depends(get_current_user)):
    """Get all flagged photos in a gallery for photographer review"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    flagged_photos = await db.photos.find(
        {"gallery_id": gallery_id, "is_flagged": True},
        {"_id": 0}
    ).sort("flagged_at", -1).to_list(None)
    
    return {
        "gallery_id": gallery_id,
        "flagged_count": len(flagged_photos),
        "photos": [Photo(**p) for p in flagged_photos]
    }

@api_router.post("/galleries/{gallery_id}/photos/reorder")
async def reorder_photos(gallery_id: str, data: PhotoReorder, current_user: dict = Depends(get_current_user)):
    """Reorder photos in a gallery"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Update order for each photo
    for item in data.photo_orders:
        await db.photos.update_one(
            {"id": item["id"], "gallery_id": gallery_id},
            {"$set": {"order": item["order"]}}
        )
    
    return {"message": "Photos reordered successfully"}

@api_router.post("/galleries/{gallery_id}/photos/bulk-action")
async def bulk_photo_action(gallery_id: str, data: BulkPhotoAction, current_user: dict = Depends(get_current_user)):
    """Perform bulk actions on selected photos"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    if not data.photo_ids:
        raise HTTPException(status_code=400, detail="No photos selected")
    
    affected_count = 0
    
    if data.action == "delete":
        # Delete photos and update storage
        for photo_id in data.photo_ids:
            photo = await db.photos.find_one({"id": photo_id, "gallery_id": gallery_id}, {"_id": 0})
            if photo:
                file_path = UPLOAD_DIR / photo["filename"]
                file_size = 0
                if file_path.exists():
                    file_size = file_path.stat().st_size
                    file_path.unlink()
                if file_size > 0:
                    await db.users.update_one(
                        {"id": current_user["id"]},
                        {"$inc": {"storage_used": -file_size}}
                    )
                await db.photos.delete_one({"id": photo_id})
                affected_count += 1
    
    elif data.action == "move_section":
        result = await db.photos.update_many(
            {"id": {"$in": data.photo_ids}, "gallery_id": gallery_id},
            {"$set": {"section_id": data.section_id}}
        )
        affected_count = result.modified_count
    
    elif data.action == "highlight":
        result = await db.photos.update_many(
            {"id": {"$in": data.photo_ids}, "gallery_id": gallery_id},
            {"$set": {"is_highlight": True}}
        )
        affected_count = result.modified_count
    
    elif data.action == "unhighlight":
        result = await db.photos.update_many(
            {"id": {"$in": data.photo_ids}, "gallery_id": gallery_id},
            {"$set": {"is_highlight": False}}
        )
        affected_count = result.modified_count
    
    elif data.action == "hide":
        result = await db.photos.update_many(
            {"id": {"$in": data.photo_ids}, "gallery_id": gallery_id},
            {"$set": {"is_hidden": True}}
        )
        affected_count = result.modified_count
    
    elif data.action == "unhide":
        result = await db.photos.update_many(
            {"id": {"$in": data.photo_ids}, "gallery_id": gallery_id},
            {"$set": {"is_hidden": False}}
        )
        affected_count = result.modified_count
    
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {data.action}")
    
    return {"message": f"Action '{data.action}' applied to {affected_count} photos", "affected_count": affected_count}

@api_router.get("/og/gallery/{share_link}", response_class=HTMLResponse)
async def get_gallery_opengraph(share_link: str, request: Request):
    """
    Serve Open Graph meta tags for social media preview.
    Social crawlers (Facebook, Twitter, WhatsApp, etc.) will fetch this to show rich previews.
    """
    gallery = await db.galleries.find_one({"share_link": share_link}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    photographer = await db.users.find_one({"id": gallery["photographer_id"]}, {"_id": 0})
    display_name = photographer.get("business_name") or photographer.get("name", "Photographer") if photographer else "Photographer"
    
    # Get photo count
    photo_count = await db.photos.count_documents({"gallery_id": gallery["id"]})
    
    # Build the frontend URL - ensure HTTPS for social media
    frontend_url = str(request.base_url).rstrip('/')
    # Remove /api if present (we want the frontend URL)
    if '/api' in frontend_url:
        frontend_url = frontend_url.replace('/api', '')
    # Force HTTPS for production URLs
    if 'localhost' not in frontend_url and frontend_url.startswith('http://'):
        frontend_url = frontend_url.replace('http://', 'https://')
    # Add ?view=1 to make shared links view-only (no upload section)
    gallery_url = f"{frontend_url}/g/{share_link}?view=1"
    
    # Get cover image or first photo as preview image
    og_image = None
    if gallery.get("cover_photo_url"):
        og_image = f"{frontend_url}{gallery['cover_photo_url']}"
    else:
        # Try to get the first photo
        first_photo = await db.photos.find_one(
            {"gallery_id": gallery["id"], "is_flagged": {"$ne": True}},
            {"_id": 0, "url": 1}
        )
        if first_photo and first_photo.get("url"):
            og_image = f"{frontend_url}{first_photo['url']}"
    
    # Build description
    description = gallery.get("description") or f"View {photo_count} photos from {display_name}"
    title = gallery.get("title", "Photo Gallery")
    
    # Generate HTML with Open Graph meta tags
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- Primary Meta Tags -->
    <title>{title} | PhotoShare</title>
    <meta name="title" content="{title} by {display_name}">
    <meta name="description" content="{description}">
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="{gallery_url}">
    <meta property="og:title" content="{title}">
    <meta property="og:description" content="{description}">
    <meta property="og:site_name" content="PhotoShare">
    {'<meta property="og:image" content="' + og_image + '">' if og_image else ''}
    {'<meta property="og:image:width" content="1200">' if og_image else ''}
    {'<meta property="og:image:height" content="630">' if og_image else ''}
    
    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="{gallery_url}">
    <meta property="twitter:title" content="{title}">
    <meta property="twitter:description" content="{description}">
    {'<meta property="twitter:image" content="' + og_image + '">' if og_image else ''}
    
    <!-- Redirect to actual gallery page -->
    <meta http-equiv="refresh" content="0;url={gallery_url}">
</head>
<body>
    <p>Redirecting to <a href="{gallery_url}">{title}</a>...</p>
</body>
</html>"""
    
    return HTMLResponse(content=html)

@api_router.get("/public/gallery/{share_link}", response_model=PublicGallery)
async def get_public_gallery(share_link: str):
    gallery = await db.galleries.find_one({"share_link": share_link}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    is_expired = False
    if gallery.get("share_link_expiration_date"):
        try:
            expiration_dt = datetime.fromisoformat(gallery["share_link_expiration_date"].replace('Z', '+00:00'))
            if expiration_dt.tzinfo is None:
                expiration_dt = expiration_dt.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > expiration_dt:
                is_expired = True
        except:
            pass
    
    guest_upload_enabled = True
    if gallery.get("guest_upload_expiration_date"):
        try:
            upload_expiration_dt = datetime.fromisoformat(gallery["guest_upload_expiration_date"].replace('Z', '+00:00'))
            if upload_expiration_dt.tzinfo is None:
                upload_expiration_dt = upload_expiration_dt.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > upload_expiration_dt:
                guest_upload_enabled = False
        except:
            pass
    
    photographer = await db.users.find_one({"id": gallery["photographer_id"]}, {"_id": 0})
    photo_count = await db.photos.count_documents({"gallery_id": gallery["id"]})
    sections = gallery.get("sections", [])
    
    # Use business_name if available, otherwise use personal name
    display_name = photographer.get("business_name") or photographer.get("name", "Unknown") if photographer else "Unknown"
    
    # Get cover photo position
    cover_position = gallery.get("cover_photo_position", {"scale": 1, "positionX": 50, "positionY": 50})
    
    # Build contributors list from all sources
    # Structure: owner first, then coordinator, then section contributors
    contributors = []
    seen_entries = set()  # Track (name, section) pairs to avoid exact duplicates
    
    # Always add gallery owner first as the curator
    contributors.append({"name": display_name, "role": "Gallery Owner", "is_owner": True})
    seen_entries.add((display_name.lower(), "owner"))
    
    # Add coordinator if set (special role, not tied to a section)
    coordinator_name = gallery.get("coordinator_name")
    if coordinator_name:
        contributors.append({"name": coordinator_name, "role": "Coordinator", "is_owner": False})
        seen_entries.add((coordinator_name.lower(), "coordinator"))
    
    # Add contributors from each section with section name as role
    for section in sections:
        section_name = section.get("name", "")
        contributor_name = section.get("contributor_name")
        
        if contributor_name:
            # Use section name as the role
            entry_key = (contributor_name.lower(), section_name.lower())
            if entry_key not in seen_entries:
                contributors.append({"name": contributor_name, "role": section_name, "is_owner": False})
                seen_entries.add(entry_key)
    
    return PublicGallery(
        id=gallery["id"],
        title=gallery["title"],
        description=gallery.get("description"),
        photographer_name=display_name,
        has_password=gallery.get("password") is not None,
        cover_photo_url=gallery.get("cover_photo_url"),
        cover_photo_position=cover_position,
        sections=[Section(**s) for s in sections],
        event_title=gallery.get("event_title"),
        event_date=gallery.get("event_date"),
        coordinator_name=coordinator_name,
        contributors=contributors,
        is_expired=is_expired,
        guest_upload_enabled=guest_upload_enabled,
        has_download_all_password=gallery.get("download_all_password") is not None,
        theme=gallery.get("theme", "classic"),
        photo_count=photo_count
    )

@api_router.post("/public/gallery/{share_link}/verify-password")
async def verify_gallery_password(share_link: str, password_data: PasswordVerify):
    gallery = await db.galleries.find_one({"share_link": share_link}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    if not gallery.get("password"):
        return {"valid": True}
    
    if verify_password(password_data.password, gallery["password"]):
        token = create_access_token({"gallery_id": gallery["id"], "type": "guest"})
        return {"valid": True, "token": token}
    else:
        raise HTTPException(status_code=401, detail="Invalid password")

@api_router.get("/public/gallery/{share_link}/photos", response_model=List[Photo])
async def get_public_gallery_photos(share_link: str, password: Optional[str] = None):
    gallery = await db.galleries.find_one({"share_link": share_link}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    if gallery.get("password") and not password:
        raise HTTPException(status_code=401, detail="Password required")
    
    if gallery.get("password") and not verify_password(password, gallery["password"]):
        raise HTTPException(status_code=401, detail="Invalid password")
    
    # Get photos excluding hidden AND flagged ones, sorted by highlights first, then order
    photos = await db.photos.find(
        {
            "gallery_id": gallery["id"], 
            "is_hidden": {"$ne": True},
            "is_flagged": {"$ne": True}  # Exclude flagged photos from public view
        }, 
        {"_id": 0}
    ).sort([("is_highlight", -1), ("order", 1), ("uploaded_at", -1)]).limit(500).to_list(None)
    return [Photo(**p) for p in photos]

@api_router.get("/public/gallery/{share_link}/videos")
async def get_public_gallery_videos(share_link: str, password: Optional[str] = None):
    """Get videos for a public gallery"""
    gallery = await db.galleries.find_one({"share_link": share_link}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    if gallery.get("password") and not password:
        raise HTTPException(status_code=401, detail="Password required")
    
    if gallery.get("password") and not verify_password(password, gallery["password"]):
        raise HTTPException(status_code=401, detail="Invalid password")
    
    # Get videos sorted by featured first, then order
    videos = await db.gallery_videos.find(
        {"gallery_id": gallery["id"]},
        {"_id": 0}
    ).sort([("is_featured", -1), ("order", 1)]).to_list(50)
    
    return videos

@api_router.get("/display/{share_link}")
async def get_display_data(share_link: str):
    """Get gallery data optimized for display/slideshow mode - no password required"""
    gallery = await db.galleries.find_one({"share_link": share_link}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Get all visible photos for display
    photos = await db.photos.find(
        {
            "gallery_id": gallery["id"],
            "is_hidden": {"$ne": True},
            "is_flagged": {"$ne": True}
        },
        {"_id": 0, "id": 1, "url": 1, "thumbnail_url": 1, "thumbnail_medium_url": 1, "is_highlight": 1, "uploaded_at": 1}
    ).sort([("is_highlight", -1), ("order", 1), ("uploaded_at", -1)]).limit(500).to_list(None)
    
    # Get photographer info for branding
    photographer = await db.users.find_one({"id": gallery["photographer_id"]}, {"_id": 0, "business_name": 1, "name": 1})
    
    # Get collage preset if specified
    collage_preset = None
    collage_preset_id = gallery.get("collage_preset_id")
    if collage_preset_id:
        collage_preset = await db.collage_presets.find_one({"id": collage_preset_id}, {"_id": 0})
    
    # If no preset specified, try to get default preset
    if not collage_preset:
        collage_preset = await db.collage_presets.find_one({"is_default": True}, {"_id": 0})
    
    # Get videos for video sections
    videos = await db.gallery_videos.find(
        {"gallery_id": gallery["id"]},
        {"_id": 0}
    ).sort([("is_featured", -1), ("order", 1)]).to_list(50)
    
    return {
        "gallery_id": gallery["id"],
        "title": gallery.get("title", ""),
        "event_title": gallery.get("event_title", ""),
        "event_date": gallery.get("event_date", ""),
        "photographer_name": photographer.get("business_name") or photographer.get("name", "") if photographer else "",
        "display_mode": gallery.get("display_mode", "slideshow"),
        "display_transition": gallery.get("display_transition", "crossfade"),
        "display_interval": gallery.get("display_interval", 6),
        "collage_preset": collage_preset,
        "photos": photos,
        "photo_count": len(photos),
        "videos": videos,  # NEW: Include videos
        "sections": gallery.get("sections", []),  # NEW: Include sections with types
        "last_updated": max([p.get("uploaded_at", "") for p in photos]) if photos else ""
    }

class DuplicateCheckRequest(BaseModel):
    filenames: List[str]

class DuplicateCheckResponse(BaseModel):
    duplicates: List[str]
    new_files: List[str]

@api_router.post("/public/gallery/{share_link}/check-duplicates", response_model=DuplicateCheckResponse)
async def check_duplicate_files(share_link: str, request: DuplicateCheckRequest):
    """Check which filenames already exist in the gallery"""
    gallery = await db.galleries.find_one({"share_link": share_link}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Get all original filenames in this gallery
    existing_photos = await db.photos.find(
        {"gallery_id": gallery["id"]}, 
        {"_id": 0, "original_filename": 1}
    ).to_list(None)
    
    existing_filenames = set(
        p.get("original_filename", "").lower() 
        for p in existing_photos 
        if p.get("original_filename")
    )
    
    duplicates = []
    new_files = []
    
    for filename in request.filenames:
        if filename.lower() in existing_filenames:
            duplicates.append(filename)
        else:
            new_files.append(filename)
    
    return DuplicateCheckResponse(duplicates=duplicates, new_files=new_files)

@api_router.post("/public/gallery/{share_link}/upload", response_model=Photo)
async def upload_photo_guest(share_link: str, file: UploadFile = File(...), password: Optional[str] = Form(None)):
    """Optimized guest photo upload with concurrency control and async I/O"""
    gallery = await db.galleries.find_one({"share_link": share_link}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Validate filename exists
    if not file.filename:
        raise HTTPException(status_code=400, detail="File must have a filename")
    
    # Check for duplicate filename (uses indexed field for fast lookup)
    original_filename = file.filename
    existing = await db.photos.find_one({
        "gallery_id": gallery["id"],
        "original_filename": {"$regex": f"^{original_filename}$", "$options": "i"}
    }, {"_id": 0})
    
    if existing:
        raise HTTPException(status_code=409, detail=f"File '{original_filename}' has already been uploaded")
    
    if gallery.get("share_link_expiration_date"):
        try:
            expiration_dt = datetime.fromisoformat(gallery["share_link_expiration_date"].replace('Z', '+00:00'))
            if expiration_dt.tzinfo is None:
                expiration_dt = expiration_dt.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > expiration_dt:
                raise HTTPException(status_code=403, detail="Gallery has expired")
        except (ValueError, AttributeError):
            pass
    
    if gallery.get("guest_upload_expiration_date"):
        try:
            upload_expiration_dt = datetime.fromisoformat(gallery["guest_upload_expiration_date"].replace('Z', '+00:00'))
            if upload_expiration_dt.tzinfo is None:
                upload_expiration_dt = upload_expiration_dt.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > upload_expiration_dt:
                raise HTTPException(status_code=403, detail="Upload window has closed")
        except (ValueError, AttributeError):
            pass
    
    if gallery.get("password"):
        if not password:
            raise HTTPException(status_code=401, detail="Password required")
        if not verify_password(password, gallery["password"]):
            raise HTTPException(status_code=401, detail="Invalid password")
    
    # Validate file type more thoroughly
    allowed_types = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
    if not file.content_type or not any(file.content_type.lower().startswith(t.split('/')[0]) for t in allowed_types):
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: JPEG, PNG, GIF, WebP, HEIC")
    
    # Read file with size limit
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
    try:
        file_content = await file.read()
        file_size = len(file_content)
        
        if file_size == 0:
            raise HTTPException(status_code=400, detail="File is empty")
        
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="File too large. Maximum size is 50MB")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reading guest upload: {e}")
        raise HTTPException(status_code=400, detail="Failed to read uploaded file")
    
    photo_id = str(uuid.uuid4())
    # Sanitize file extension
    original_ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else 'jpg'
    allowed_extensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif']
    file_ext = original_ext if original_ext in allowed_extensions else 'jpg'
    filename = f"{photo_id}.{file_ext}"
    file_path = UPLOAD_DIR / filename
    
    # Use semaphore for concurrency control and async file I/O
    async with upload_semaphore:
        try:
            async with aiofiles.open(file_path, 'wb') as f:
                await f.write(file_content)
            
            # Verify file was written correctly
            if not file_path.exists() or file_path.stat().st_size != file_size:
                raise Exception("File verification failed")
        except Exception as e:
            logger.error(f"Error writing guest upload {filename}: {e}")
            if file_path.exists():
                try:
                    file_path.unlink()
                except:
                    pass
            raise HTTPException(status_code=500, detail="Failed to save photo. Please try again.")
    
    photo_doc = {
        "id": photo_id,
        "gallery_id": gallery["id"],
        "filename": filename,
        "original_filename": file.filename,
        "url": f"/api/photos/serve/{filename}",
        "uploaded_by": "guest",
        "section_id": None,
        "file_size": file_size,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "is_flagged": False,
        "is_hidden": False,
        "auto_flagged": False
    }
    
    # Generate thumbnails with retry logic - auto-flag if all retries fail
    thumbnail_failed = False
    try:
        thumb_small = generate_thumbnail(file_path, photo_id, 'small')
        thumb_medium = generate_thumbnail(file_path, photo_id, 'medium')
        
        if thumb_small:
            photo_doc["thumbnail_url"] = thumb_small
        else:
            thumbnail_failed = True
            
        if thumb_medium:
            photo_doc["thumbnail_medium_url"] = thumb_medium
        else:
            thumbnail_failed = True
            
    except Exception as e:
        thumbnail_failed = True
        logger.warning(f"Guest upload thumbnail generation exception for {photo_id}: {e}")
    
    # Auto-flag photo if thumbnails failed
    if thumbnail_failed:
        photo_doc["is_flagged"] = True
        photo_doc["auto_flagged"] = True
        photo_doc["flagged_at"] = datetime.now(timezone.utc).isoformat()
        photo_doc["flagged_reason"] = "auto:thumbnail_generation_failed"
        logger.info(f"Auto-flagged guest photo {photo_id} due to thumbnail generation failure")
    
    try:
        await db.photos.insert_one(photo_doc)
    except Exception as e:
        logger.error(f"Error saving guest photo to database: {e}")
        if file_path.exists():
            try:
                file_path.unlink()
            except:
                pass
        raise HTTPException(status_code=500, detail="Failed to save photo record. Please try again.")
    
    return Photo(**{k: v for k, v in photo_doc.items() if k != '_id'})

@api_router.post("/public/gallery/{share_link}/download-all")
async def download_all_photos(share_link: str, password_data: PasswordVerify):
    gallery = await db.galleries.find_one({"share_link": share_link}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    if not gallery.get("download_all_password"):
        raise HTTPException(status_code=403, detail="Download all is not enabled for this gallery")
    
    if not verify_password(password_data.password, gallery["download_all_password"]):
        raise HTTPException(status_code=401, detail="Invalid download password")
    
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        # Stream photos in batches to avoid memory issues
        cursor = db.photos.find({"gallery_id": gallery["id"]}, {"_id": 0}).limit(1000)
        async for photo in cursor:
            file_path = UPLOAD_DIR / photo["filename"]
            if file_path.exists():
                zip_file.write(file_path, photo["filename"])
    
    zip_buffer.seek(0)
    
    return StreamingResponse(
        iter([zip_buffer.getvalue()]),
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename={gallery['title'].replace(' ', '_')}_photos.zip",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

# ============ PHOTOGRAPHER DOWNLOAD (NO PASSWORD) ============

# Max size per zip chunk (200MB)
MAX_ZIP_CHUNK_SIZE = 200 * 1024 * 1024

@api_router.get("/galleries/{gallery_id}/download-info")
async def get_download_info(gallery_id: str, current_user: dict = Depends(get_current_user)):
    """Get info about the download chunks for a gallery"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Get all photos and calculate total size
    photos = await db.photos.find({"gallery_id": gallery_id}, {"_id": 0}).to_list(None)
    
    chunks = []
    current_chunk = []
    current_chunk_size = 0
    chunk_number = 1
    
    for photo in photos:
        file_path = UPLOAD_DIR / photo["filename"]
        if file_path.exists():
            file_size = file_path.stat().st_size
            
            # If adding this file exceeds chunk size, start a new chunk
            if current_chunk_size + file_size > MAX_ZIP_CHUNK_SIZE and current_chunk:
                chunks.append({
                    "chunk_number": chunk_number,
                    "photo_count": len(current_chunk),
                    "size_bytes": current_chunk_size
                })
                chunk_number += 1
                current_chunk = []
                current_chunk_size = 0
            
            current_chunk.append(photo)
            current_chunk_size += file_size
    
    # Add the last chunk if it has photos
    if current_chunk:
        chunks.append({
            "chunk_number": chunk_number,
            "photo_count": len(current_chunk),
            "size_bytes": current_chunk_size
        })
    
    total_size = sum(c["size_bytes"] for c in chunks)
    
    return {
        "gallery_id": gallery_id,
        "gallery_title": gallery["title"],
        "total_photos": len(photos),
        "total_size_bytes": total_size,
        "chunk_count": len(chunks),
        "chunks": chunks
    }

@api_router.get("/galleries/{gallery_id}/download/{chunk_number}")
async def download_gallery_chunk(gallery_id: str, chunk_number: int, current_user: dict = Depends(get_current_user)):
    """Download a specific chunk of photos as a zip file"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Get all photos
    photos = await db.photos.find({"gallery_id": gallery_id}, {"_id": 0}).to_list(None)
    
    # Organize into chunks
    chunks = []
    current_chunk = []
    current_chunk_size = 0
    
    for photo in photos:
        file_path = UPLOAD_DIR / photo["filename"]
        if file_path.exists():
            file_size = file_path.stat().st_size
            
            if current_chunk_size + file_size > MAX_ZIP_CHUNK_SIZE and current_chunk:
                chunks.append(current_chunk)
                current_chunk = []
                current_chunk_size = 0
            
            current_chunk.append(photo)
            current_chunk_size += file_size
    
    if current_chunk:
        chunks.append(current_chunk)
    
    # Validate chunk number
    if chunk_number < 1 or chunk_number > len(chunks):
        raise HTTPException(status_code=404, detail=f"Chunk {chunk_number} not found. Gallery has {len(chunks)} chunks.")
    
    # Get the requested chunk (1-indexed)
    chunk_photos = chunks[chunk_number - 1]
    
    # Create zip file
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for photo in chunk_photos:
            file_path = UPLOAD_DIR / photo["filename"]
            if file_path.exists():
                # Use original filename if available, otherwise use stored filename
                archive_name = photo.get("original_filename", photo["filename"])
                zip_file.write(file_path, archive_name)
    
    zip_buffer.seek(0)
    
    # Create filename with chunk info
    safe_title = gallery['title'].replace(' ', '_').replace('/', '-')
    if len(chunks) > 1:
        filename = f"{safe_title}_part{chunk_number}_of_{len(chunks)}.zip"
    else:
        filename = f"{safe_title}_photos.zip"
    
    return StreamingResponse(
        iter([zip_buffer.getvalue()]),
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

# ============ SECTION-BASED DOWNLOAD (Guest & Photographer) ============

# Max size per zip chunk (250MB as requested)
SECTION_ZIP_CHUNK_SIZE = 250 * 1024 * 1024

class SectionDownloadRequest(BaseModel):
    password: Optional[str] = None
    section_id: Optional[str] = None  # None means download all

@api_router.post("/public/gallery/{share_link}/download-info")
async def get_public_download_info(share_link: str, request: SectionDownloadRequest):
    """Get download info for public gallery - sections, photo counts, and chunk info"""
    gallery = await db.galleries.find_one({"share_link": share_link}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Verify password if download requires it
    if gallery.get("download_all_password"):
        if not request.password or not verify_password(request.password, gallery["download_all_password"]):
            raise HTTPException(status_code=401, detail="Invalid download password")
    
    # Get all visible photos (not hidden, not flagged)
    photo_filter = {
        "gallery_id": gallery["id"],
        "is_hidden": {"$ne": True},
        "is_flagged": {"$ne": True}
    }
    
    if request.section_id:
        photo_filter["section_id"] = request.section_id
    
    photos = await db.photos.find(photo_filter, {"_id": 0}).to_list(None)
    
    # Get sections from the gallery document (sections are stored within gallery, not separate collection)
    sections = gallery.get("sections", [])
    
    # Calculate chunks based on 250MB limit
    chunks = []
    current_chunk = []
    current_chunk_size = 0
    chunk_number = 1
    
    for photo in photos:
        file_path = UPLOAD_DIR / photo["filename"]
        if file_path.exists():
            file_size = file_path.stat().st_size
            
            if current_chunk_size + file_size > SECTION_ZIP_CHUNK_SIZE and current_chunk:
                chunks.append({
                    "chunk_number": chunk_number,
                    "photo_count": len(current_chunk),
                    "size_bytes": current_chunk_size,
                    "size_mb": round(current_chunk_size / (1024 * 1024), 1)
                })
                chunk_number += 1
                current_chunk = []
                current_chunk_size = 0
            
            current_chunk.append(photo["id"])
            current_chunk_size += file_size
    
    if current_chunk:
        chunks.append({
            "chunk_number": chunk_number,
            "photo_count": len(current_chunk),
            "size_bytes": current_chunk_size,
            "size_mb": round(current_chunk_size / (1024 * 1024), 1)
        })
    
    # Build section info with photo counts
    section_info = []
    for section in sorted(sections, key=lambda s: s.get("order", 0)):
        # Only include photo sections (not video or fotoshare)
        if section.get("type", "photo") != "photo":
            continue
        section_photos = [p for p in photos if p.get("section_id") == section["id"]]
        if section_photos:
            section_size = sum(
                (UPLOAD_DIR / p["filename"]).stat().st_size 
                for p in section_photos 
                if (UPLOAD_DIR / p["filename"]).exists()
            )
            section_info.append({
                "id": section["id"],
                "title": section.get("name", section.get("title", "Untitled")),
                "photo_count": len(section_photos),
                "size_mb": round(section_size / (1024 * 1024), 1)
            })
    
    total_size = sum(c["size_bytes"] for c in chunks)
    
    return {
        "gallery_id": gallery["id"],
        "gallery_title": gallery.get("title", "Gallery"),
        "total_photos": len(photos),
        "total_size_mb": round(total_size / (1024 * 1024), 1),
        "chunk_count": len(chunks),
        "chunks": chunks,
        "sections": section_info
    }

@api_router.post("/public/gallery/{share_link}/download-section")
async def download_section(share_link: str, request: SectionDownloadRequest, chunk: int = 1):
    """Download photos from a specific section or all photos, with chunking support"""
    gallery = await db.galleries.find_one({"share_link": share_link}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Verify password if required
    if gallery.get("download_all_password"):
        if not request.password or not verify_password(request.password, gallery["download_all_password"]):
            raise HTTPException(status_code=401, detail="Invalid download password")
    
    # Build photo filter - only visible photos
    photo_filter = {
        "gallery_id": gallery["id"],
        "is_hidden": {"$ne": True},
        "is_flagged": {"$ne": True}
    }
    
    section_title = "All_Photos"
    if request.section_id:
        photo_filter["section_id"] = request.section_id
        # Get section from gallery document (sections are stored within gallery)
        sections = gallery.get("sections", [])
        section = next((s for s in sections if s["id"] == request.section_id), None)
        if section:
            section_title = section.get("name", section.get("title", "Section")).replace(" ", "_").replace("/", "-")
    
    photos = await db.photos.find(photo_filter, {"_id": 0}).to_list(None)
    
    if not photos:
        raise HTTPException(status_code=404, detail="No photos found")
    
    # Organize into chunks
    chunks = []
    current_chunk = []
    current_chunk_size = 0
    
    for photo in photos:
        file_path = UPLOAD_DIR / photo["filename"]
        if file_path.exists():
            file_size = file_path.stat().st_size
            
            if current_chunk_size + file_size > SECTION_ZIP_CHUNK_SIZE and current_chunk:
                chunks.append(current_chunk)
                current_chunk = []
                current_chunk_size = 0
            
            current_chunk.append(photo)
            current_chunk_size += file_size
    
    if current_chunk:
        chunks.append(current_chunk)
    
    # Validate chunk number
    if chunk < 1 or chunk > len(chunks):
        raise HTTPException(status_code=404, detail=f"Chunk {chunk} not found. Download has {len(chunks)} chunks.")
    
    # Get the requested chunk
    chunk_photos = chunks[chunk - 1]
    
    # Create zip file
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for photo in chunk_photos:
            file_path = UPLOAD_DIR / photo["filename"]
            if file_path.exists():
                archive_name = photo.get("original_filename", photo["filename"])
                zip_file.write(file_path, archive_name)
    
    zip_buffer.seek(0)
    
    # Create filename
    safe_gallery = gallery.get('title', 'Gallery').replace(' ', '_').replace('/', '-')
    if len(chunks) > 1:
        filename = f"{safe_gallery}_{section_title}_part{chunk}_of_{len(chunks)}.zip"
    else:
        filename = f"{safe_gallery}_{section_title}.zip"
    
    return StreamingResponse(
        iter([zip_buffer.getvalue()]),
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

import mimetypes

# Initialize mimetypes
mimetypes.init()

@api_router.get("/photos/serve/{filename}")
async def serve_photo(filename: str, download: bool = False):
    """
    Serve photos - works with both R2 and local storage.
    For R2, this endpoint serves as a fallback/proxy if direct R2 URL fails.
    """
    # First try local filesystem
    file_path = UPLOAD_DIR / filename
    
    if file_path.exists():
        # Serve from local filesystem
        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'jpg'
        media_types = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'heic': 'image/heic',
            'heif': 'image/heif'
        }
        media_type = media_types.get(ext, 'image/jpeg')
        file_size = file_path.stat().st_size
        disposition = "attachment" if download else "inline"
        
        return FileResponse(
            file_path,
            media_type=media_type,
            headers={
                "Content-Disposition": f"{disposition}; filename={filename}",
                "Content-Length": str(file_size),
                "Cache-Control": "public, max-age=31536000, immutable",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Expose-Headers": "Content-Disposition, Content-Length"
            }
        )
    
    # If R2 is enabled, try to fetch from R2
    if storage.r2_enabled:
        # Extract photo_id from filename to construct R2 key
        photo_id = filename.rsplit('.', 1)[0] if '.' in filename else filename
        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'jpg'
        r2_key = f"photos/{photo_id}.{ext}"
        
        content = await storage.get_file(r2_key)
        if content:
            media_types = {
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'png': 'image/png',
                'gif': 'image/gif',
                'webp': 'image/webp',
                'heic': 'image/heic',
                'heif': 'image/heif'
            }
            media_type = media_types.get(ext, 'image/jpeg')
            disposition = "attachment" if download else "inline"
            
            return Response(
                content=content,
                media_type=media_type,
                headers={
                    "Content-Disposition": f"{disposition}; filename={filename}",
                    "Content-Length": str(len(content)),
                    "Cache-Control": "public, max-age=31536000, immutable",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Expose-Headers": "Content-Disposition, Content-Length"
                }
            )
    
    raise HTTPException(status_code=404, detail="Photo not found")

@api_router.get("/photos/thumb/{filename}")
async def serve_thumbnail(filename: str):
    """
    Serve optimized thumbnail images with validation and fallback.
    Works with both R2 and local storage.
    """
    # First try local filesystem
    file_path = THUMBNAILS_DIR / filename
    
    # Check if thumbnail exists locally and is valid
    if file_path.exists():
        file_size = file_path.stat().st_size
        if file_size == 0:
            logger.warning(f"Empty thumbnail found: {filename}")
            file_path.unlink()
        else:
            return FileResponse(
                file_path,
                media_type="image/jpeg",
                headers={
                    "Content-Length": str(file_size),
                    "Cache-Control": "public, max-age=31536000, immutable",
                    "Access-Control-Allow-Origin": "*"
                }
            )
    
    # If R2 is enabled, try to fetch from R2
    if storage.r2_enabled:
        r2_key = f"thumbnails/{filename}"
        content = await storage.get_file(r2_key)
        if content:
            return Response(
                content=content,
                media_type="image/jpeg",
                headers={
                    "Content-Length": str(len(content)),
                    "Cache-Control": "public, max-age=31536000, immutable",
                    "Access-Control-Allow-Origin": "*"
                }
            )
    
    # Try to generate thumbnail on-the-fly if original exists locally
    if not file_path.exists():
        parts = filename.rsplit('_', 1)
        if len(parts) == 2:
            photo_id = parts[0]
            size_name = parts[1].replace('.jpg', '')
            for ext in ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif']:
                original = UPLOAD_DIR / f"{photo_id}.{ext}"
                if original.exists():
                    thumb_url = generate_thumbnail(original, photo_id, size_name)
                    if thumb_url and file_path.exists():
                        logger.info(f"Regenerated missing thumbnail: {filename}")
                        file_size = file_path.stat().st_size
                        return FileResponse(
                            file_path,
                            media_type="image/jpeg",
                            headers={
                                "Content-Length": str(file_size),
                                "Cache-Control": "public, max-age=31536000, immutable",
                                "Access-Control-Allow-Origin": "*"
                            }
                        )
                    break
    
    raise HTTPException(status_code=404, detail="Thumbnail not found")

# ============ GOOGLE DRIVE INTEGRATION ============

class GoogleDriveStatus(BaseModel):
    connected: bool
    email: Optional[str] = None
    name: Optional[str] = None

class GoogleDriveBackupRequest(BaseModel):
    gallery_id: str

class GoogleDriveBackupStatus(BaseModel):
    gallery_id: str
    status: str  # 'pending', 'in_progress', 'completed', 'failed'
    folder_id: Optional[str] = None
    folder_url: Optional[str] = None
    photos_backed_up: int = 0
    total_photos: int = 0
    error_message: Optional[str] = None
    last_updated: str

# Store temporary state for OAuth flow
oauth_states = {}

# Frontend/Base URL for redirects - set this in production for custom domains
FRONTEND_URL = os.environ.get('FRONTEND_URL', '')

def get_oauth_base_url(request: Request) -> str:
    """Get the base URL for OAuth redirects, handling proxies and custom domains"""
    # 1. First check environment variable (best for custom domains)
    if FRONTEND_URL:
        return FRONTEND_URL.rstrip('/')
    
    # 2. Check X-Forwarded-Host header (set by proxies)
    forwarded_host = request.headers.get('x-forwarded-host')
    if forwarded_host:
        scheme = request.headers.get('x-forwarded-proto', 'https')
        return f"{scheme}://{forwarded_host}"
    
    # 3. Check Host header
    host = request.headers.get('host')
    if host and not host.endswith('.deploy.emergentcf.cloud'):
        scheme = 'https'
        return f"{scheme}://{host}"
    
    # 4. Fall back to request base_url
    return str(request.base_url).rstrip('/')

@api_router.get("/oauth/drive/authorize")
async def google_drive_authorize(request: Request, gallery_id: str, current_user: dict = Depends(get_current_user)):
    """Start Google Drive OAuth flow"""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=400, 
            detail="Google Drive not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
        )
    
    # Build redirect URI - respects custom domains and proxies
    base_url = get_oauth_base_url(request)
    redirect_uri = f"{base_url}/api/oauth/drive/callback"
    
    logger.info(f"OAuth authorize - base_url: {base_url}, redirect_uri: {redirect_uri}")
    
    flow = get_google_oauth_flow(redirect_uri)
    if not flow:
        raise HTTPException(status_code=500, detail="Failed to create OAuth flow")
    
    # Generate state with user ID and gallery ID
    state = f"{current_user['id']}:{gallery_id}:{secrets.token_urlsafe(16)}"
    oauth_states[state] = {
        "user_id": current_user["id"],
        "gallery_id": gallery_id,
        "redirect_uri": redirect_uri,  # Store redirect URI for callback
        "base_url": base_url,
        "created_at": datetime.now(timezone.utc)
    }
    
    authorization_url, _ = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        state=state,
        prompt='consent'
    )
    
    return {"authorization_url": authorization_url}

@api_router.get("/oauth/drive/callback")
async def google_drive_callback(request: Request, code: str = Query(...), state: str = Query(...)):
    """Handle Google Drive OAuth callback"""
    # Verify state
    state_data = oauth_states.get(state)
    if not state_data:
        # Redirect to frontend with error - try to get base URL from request
        base_url = str(request.base_url).rstrip('/')
        return RedirectResponse(
            url=f"{base_url}/dashboard?drive_error=invalid_state",
            status_code=302
        )
    
    user_id = state_data["user_id"]
    gallery_id = state_data["gallery_id"]
    redirect_uri = state_data["redirect_uri"]
    base_url = state_data["base_url"]
    
    # Clean up state
    del oauth_states[state]
    
    try:
        flow = get_google_oauth_flow(redirect_uri)
        flow.fetch_token(code=code)
        credentials = flow.credentials
        
        # Store credentials in database
        creds_doc = {
            "user_id": user_id,
            "access_token": credentials.token,
            "refresh_token": credentials.refresh_token,
            "token_uri": credentials.token_uri,
            "client_id": credentials.client_id,
            "client_secret": credentials.client_secret,
            "scopes": list(credentials.scopes) if credentials.scopes else GOOGLE_DRIVE_SCOPES,
            "expiry": credentials.expiry.isoformat() if credentials.expiry else None,
            "drive_auto_sync": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        # Get user info from Google
        drive_service = build('drive', 'v3', credentials=credentials)
        about = drive_service.about().get(fields="user").execute()
        user_info = about.get('user', {})
        
        creds_doc["google_email"] = user_info.get('emailAddress')
        creds_doc["google_name"] = user_info.get('displayName')
        
        # Upsert credentials
        await db.drive_credentials.update_one(
            {"user_id": user_id},
            {"$set": creds_doc},
            upsert=True
        )
        
        # Update user record
        await db.users.update_one(
            {"id": user_id},
            {"$set": {
                "google_connected": True,
                "google_email": user_info.get('emailAddress'),
                "google_name": user_info.get('displayName'),
                "drive_auto_sync": True,
                "google_connected_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        # Redirect back to gallery using the same base URL
        return RedirectResponse(
            url=f"{base_url}/gallery/{gallery_id}?drive_connected=true",
            status_code=302
        )
        
    except Exception as e:
        logger.error(f"OAuth callback error: {e}")
        return RedirectResponse(
            url=f"{base_url}/gallery/{gallery_id}?drive_error=auth_failed",
            status_code=302
        )

@api_router.get("/auth/google/status")
async def get_google_drive_status(current_user: dict = Depends(get_current_user)):
    """Check if Google Drive is connected"""
    creds = await db.drive_credentials.find_one({"user_id": current_user["id"]}, {"_id": 0})
    
    if creds:
        return {
            "connected": True,
            "email": creds.get("google_email"),
            "name": creds.get("google_name"),
            "auto_sync": creds.get("drive_auto_sync", False)
        }
    
    return {
        "connected": False,
        "email": None,
        "name": None,
        "auto_sync": False
    }

@api_router.post("/auth/google/toggle-auto-sync")
async def toggle_auto_sync(current_user: dict = Depends(get_current_user)):
    """Toggle auto-sync for Google Drive"""
    creds = await db.drive_credentials.find_one({"user_id": current_user["id"]}, {"_id": 0})
    if not creds:
        raise HTTPException(status_code=400, detail="Google Drive not connected")
    
    current_auto_sync = creds.get("drive_auto_sync", False)
    
    await db.drive_credentials.update_one(
        {"user_id": current_user["id"]},
        {"$set": {"drive_auto_sync": not current_auto_sync}}
    )
    
    return {"auto_sync": not current_auto_sync}

@api_router.post("/auth/google/disconnect")
async def disconnect_google_drive(current_user: dict = Depends(get_current_user)):
    """Disconnect Google Drive"""
    # Remove credentials
    await db.drive_credentials.delete_one({"user_id": current_user["id"]})
    
    # Update user record
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$unset": {
            "google_connected": "",
            "google_email": "",
            "google_name": "",
            "drive_auto_sync": "",
            "google_connected_at": ""
        }}
    )
    return {"success": True}

@api_router.post("/galleries/{gallery_id}/backup-to-drive")
async def backup_gallery_to_drive(gallery_id: str, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """
    Initiate backup of gallery photos to Google Drive.
    The actual upload happens in the background.
    """
    # Verify gallery ownership
    gallery = await db.galleries.find_one(
        {"id": gallery_id, "photographer_id": current_user["id"]},
        {"_id": 0}
    )
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Check Google Drive connection
    creds = await db.drive_credentials.find_one({"user_id": current_user["id"]}, {"_id": 0})
    if not creds:
        raise HTTPException(status_code=400, detail="Google Drive not connected. Please link your account first.")
    
    # Get photo count
    photo_count = await db.photos.count_documents({"gallery_id": gallery_id})
    
    if photo_count == 0:
        raise HTTPException(status_code=400, detail="No photos to backup")
    
    # Check for unsynced photos
    unsynced_count = await db.photos.count_documents({"gallery_id": gallery_id, "drive_synced": {"$ne": True}})
    
    # Create/update backup status
    existing_backup = await db.drive_backups.find_one(
        {"gallery_id": gallery_id, "user_id": current_user["id"]},
        {"_id": 0}
    )
    
    backup_id = existing_backup["id"] if existing_backup else str(uuid.uuid4())
    folder_name = f"PhotoShare - {gallery['title']}"
    
    backup_doc = {
        "id": backup_id,
        "gallery_id": gallery_id,
        "user_id": current_user["id"],
        "status": "in_progress",
        "folder_name": folder_name,
        "photos_backed_up": photo_count - unsynced_count,
        "total_photos": photo_count,
        "created_at": existing_backup.get("created_at") if existing_backup else datetime.now(timezone.utc).isoformat(),
        "last_updated": datetime.now(timezone.utc).isoformat()
    }
    
    # Preserve folder_id if it exists
    if existing_backup and existing_backup.get("folder_id"):
        backup_doc["folder_id"] = existing_backup["folder_id"]
        backup_doc["folder_url"] = existing_backup.get("folder_url")
    
    # Upsert backup record
    await db.drive_backups.update_one(
        {"gallery_id": gallery_id, "user_id": current_user["id"]},
        {"$set": backup_doc},
        upsert=True
    )
    
    # Start background sync task
    background_tasks.add_task(sync_gallery_to_drive, current_user["id"], gallery_id)
    
    return {
        "success": True,
        "message": f"Backup started for {unsynced_count} new photos (total: {photo_count})",
        "backup_id": backup_id,
        "folder_url": backup_doc.get("folder_url")
    }

@api_router.get("/galleries/{gallery_id}/backup-status", response_model=GoogleDriveBackupStatus)
async def get_backup_status(gallery_id: str, current_user: dict = Depends(get_current_user)):
    """Get the backup status for a gallery"""
    # Verify gallery ownership
    gallery = await db.galleries.find_one(
        {"id": gallery_id, "photographer_id": current_user["id"]},
        {"_id": 0}
    )
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    backup = await db.drive_backups.find_one(
        {"gallery_id": gallery_id, "user_id": current_user["id"]},
        {"_id": 0}
    )
    
    if not backup:
        photo_count = await db.photos.count_documents({"gallery_id": gallery_id})
        return GoogleDriveBackupStatus(
            gallery_id=gallery_id,
            status="not_started",
            photos_backed_up=0,
            total_photos=photo_count,
            last_updated=datetime.now(timezone.utc).isoformat()
        )
    
    return GoogleDriveBackupStatus(
        gallery_id=gallery_id,
        status=backup.get("status", "unknown"),
        folder_id=backup.get("folder_id"),
        folder_url=backup.get("folder_url"),
        photos_backed_up=backup.get("photos_backed_up", 0),
        total_photos=backup.get("total_photos", 0),
        error_message=backup.get("error_message"),
        last_updated=backup.get("last_updated", datetime.now(timezone.utc).isoformat())
    )

# ============ ANALYTICS ENDPOINTS ============

class GalleryAnalytics(BaseModel):
    gallery_id: str
    gallery_title: str
    view_count: int = 0
    total_photos: int = 0
    photographer_photos: int = 0
    guest_photos: int = 0
    created_at: str
    days_until_deletion: Optional[int] = None
    qr_scans: int = 0
    download_count: int = 0

class PhotographerAnalytics(BaseModel):
    total_galleries: int = 0
    total_photos: int = 0
    total_views: int = 0
    total_qr_scans: int = 0
    total_downloads: int = 0
    storage_used: int = 0
    storage_quota: int = DEFAULT_STORAGE_QUOTA
    galleries: List[GalleryAnalytics] = []
    # Time-based stats
    views_today: int = 0
    views_this_week: int = 0
    views_this_month: int = 0

class AdminAnalytics(BaseModel):
    total_photographers: int = 0
    total_galleries: int = 0
    total_photos: int = 0
    total_storage_used: int = 0
    top_galleries: List[GalleryAnalytics] = []

@api_router.get("/analytics/photographer", response_model=PhotographerAnalytics)
async def get_photographer_analytics(current_user: dict = Depends(get_current_user)):
    """Get analytics for the current photographer"""
    user_id = current_user["id"]
    
    # Get all galleries with photo counts
    pipeline = [
        {"$match": {"photographer_id": user_id}},
        {"$lookup": {
            "from": "photos",
            "localField": "id",
            "foreignField": "gallery_id",
            "as": "all_photos"
        }},
        {"$addFields": {
            "total_photos": {"$size": "$all_photos"},
            "photographer_photos": {
                "$size": {
                    "$filter": {
                        "input": "$all_photos",
                        "cond": {"$eq": ["$$this.uploaded_by", "photographer"]}
                    }
                }
            },
            "guest_photos": {
                "$size": {
                    "$filter": {
                        "input": "$all_photos",
                        "cond": {"$eq": ["$$this.uploaded_by", "guest"]}
                    }
                }
            }
        }},
        {"$project": {"_id": 0, "all_photos": 0, "password": 0, "download_all_password": 0}}
    ]
    
    galleries = await db.galleries.aggregate(pipeline).to_list(None)
    
    gallery_analytics = []
    total_photos = 0
    total_views = 0
    total_qr_scans = 0
    total_downloads = 0
    
    for g in galleries:
        days_remaining = calculate_days_until_deletion(g.get("auto_delete_date"))
        gallery_analytics.append(GalleryAnalytics(
            gallery_id=g["id"],
            gallery_title=g["title"],
            view_count=g.get("view_count", 0),
            total_photos=g.get("total_photos", 0),
            photographer_photos=g.get("photographer_photos", 0),
            guest_photos=g.get("guest_photos", 0),
            created_at=g["created_at"],
            days_until_deletion=days_remaining,
            qr_scans=g.get("qr_scan_count", 0),
            download_count=g.get("download_count", 0)
        ))
        total_photos += g.get("total_photos", 0)
        total_views += g.get("view_count", 0)
        total_qr_scans += g.get("qr_scan_count", 0)
        total_downloads += g.get("download_count", 0)
    
    # Sort galleries by views (most popular first)
    gallery_analytics.sort(key=lambda x: x.view_count, reverse=True)
    
    # Get time-based view stats from analytics_events collection
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())
    month_start = today_start.replace(day=1)
    
    views_today = await db.analytics_events.count_documents({
        "photographer_id": user_id,
        "event_type": "view",
        "created_at": {"$gte": today_start.isoformat()}
    })
    
    views_this_week = await db.analytics_events.count_documents({
        "photographer_id": user_id,
        "event_type": "view",
        "created_at": {"$gte": week_start.isoformat()}
    })
    
    views_this_month = await db.analytics_events.count_documents({
        "photographer_id": user_id,
        "event_type": "view",
        "created_at": {"$gte": month_start.isoformat()}
    })
    
    # Get effective storage quota from global toggles
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    effective_storage = await get_effective_storage_quota(user)
    
    return PhotographerAnalytics(
        total_galleries=len(galleries),
        total_photos=total_photos,
        total_views=total_views,
        total_qr_scans=total_qr_scans,
        total_downloads=total_downloads,
        storage_used=current_user.get("storage_used", 0),
        storage_quota=effective_storage if effective_storage != -1 else 999999999999,  # -1 means unlimited
        galleries=gallery_analytics,
        views_today=views_today,
        views_this_week=views_this_week,
        views_this_month=views_this_month
    )

@api_router.get("/admin/analytics", response_model=AdminAnalytics)
async def get_admin_analytics(admin: dict = Depends(get_admin_user)):
    """Get site-wide analytics for admin"""
    total_photographers = await db.users.count_documents({})
    total_galleries = await db.galleries.count_documents({})
    total_photos = await db.photos.count_documents({})
    
    # Get total storage used
    storage_pipeline = [
        {"$group": {"_id": None, "total": {"$sum": "$storage_used"}}}
    ]
    storage_result = await db.users.aggregate(storage_pipeline).to_list(1)
    total_storage = storage_result[0]["total"] if storage_result else 0
    
    # Get top galleries by views
    top_pipeline = [
        {"$sort": {"view_count": -1}},
        {"$limit": 10},
        {"$lookup": {
            "from": "photos",
            "localField": "id",
            "foreignField": "gallery_id",
            "as": "photos"
        }},
        {"$addFields": {"total_photos": {"$size": "$photos"}}},
        {"$project": {"_id": 0, "photos": 0, "password": 0, "download_all_password": 0}}
    ]
    
    top_galleries = await db.galleries.aggregate(top_pipeline).to_list(None)
    
    gallery_analytics = []
    for g in top_galleries:
        gallery_analytics.append(GalleryAnalytics(
            gallery_id=g["id"],
            gallery_title=g["title"],
            view_count=g.get("view_count", 0),
            total_photos=g.get("total_photos", 0),
            photographer_photos=0,
            guest_photos=0,
            created_at=g["created_at"],
            days_until_deletion=calculate_days_until_deletion(g.get("auto_delete_date"))
        ))
    
    return AdminAnalytics(
        total_photographers=total_photographers,
        total_galleries=total_galleries,
        total_photos=total_photos,
        total_storage_used=total_storage,
        top_galleries=gallery_analytics
    )

# Track gallery view when public gallery is accessed
@api_router.post("/public/gallery/{share_link}/view")
async def track_gallery_view(share_link: str):
    """Track a view when someone accesses a public gallery"""
    result = await db.galleries.update_one(
        {"share_link": share_link},
        {"$inc": {"view_count": 1}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Gallery not found")
    return {"success": True}

# ============ AUTO-DELETE TASK ============

async def auto_delete_expired_galleries():
    """Background task to delete galleries older than 6 months"""
    global sync_task_running
    
    while sync_task_running:
        try:
            now = datetime.now(timezone.utc)
            
            # Find galleries that should be deleted
            expired_galleries = await db.galleries.find({
                "auto_delete_date": {"$lt": now.isoformat()}
            }, {"_id": 0}).to_list(None)
            
            for gallery in expired_galleries:
                gallery_id = gallery["id"]
                photographer_id = gallery["photographer_id"]
                
                # Delete photos
                photos = await db.photos.find({"gallery_id": gallery_id}, {"_id": 0}).to_list(None)
                for photo in photos:
                    file_path = UPLOAD_DIR / photo["filename"]
                    if file_path.exists():
                        try:
                            file_size = file_path.stat().st_size
                            file_path.unlink()
                            # Update storage used
                            await db.users.update_one(
                                {"id": photographer_id},
                                {"$inc": {"storage_used": -file_size}}
                            )
                        except Exception as e:
                            logger.error(f"Failed to delete photo file: {e}")
                
                await db.photos.delete_many({"gallery_id": gallery_id})
                await db.drive_backups.delete_many({"gallery_id": gallery_id})
                await db.galleries.delete_one({"id": gallery_id})
                
                logger.info(f"Auto-deleted expired gallery: {gallery['title']} ({gallery_id})")
            
            if expired_galleries:
                logger.info(f"Auto-deleted {len(expired_galleries)} expired galleries")
        
        except Exception as e:
            logger.error(f"Auto-delete task error: {e}")
        
        # Check daily
        await asyncio.sleep(24 * 60 * 60)

# ============================================
# BILLING & SUBSCRIPTION ENDPOINTS
# ============================================

@api_router.get("/billing/settings")
async def get_billing_settings_endpoint(admin: dict = Depends(get_admin_user)):
    """Get billing settings (admin only)"""
    return await get_billing_settings()

@api_router.put("/billing/settings")
async def update_billing_settings(data: BillingSettings, admin: dict = Depends(get_admin_user)):
    """Update billing settings (admin only)"""
    update_data = {
        "type": "billing_settings",
        "billing_enforcement_enabled": data.billing_enforcement_enabled,
        "pricing": data.pricing,
        "paid_gallery_expiration_months": data.paid_gallery_expiration_months,
        "paid_storage_limit_gb": data.paid_storage_limit_gb
    }
    # Include payment_methods if provided
    if data.payment_methods:
        update_data["payment_methods"] = data.payment_methods
    
    await db.site_config.update_one(
        {"type": "billing_settings"},
        {"$set": update_data},
        upsert=True
    )
    return {"message": "Billing settings updated", "settings": data.model_dump()}

# ============================================
# ANALYTICS TRACKING ENDPOINTS
# ============================================

@api_router.post("/analytics/track-qr-scan/{gallery_id}")
async def track_qr_scan(gallery_id: str):
    """Track a QR code scan for a gallery"""
    gallery = await db.galleries.find_one({"id": gallery_id})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Increment QR scan count
    await db.galleries.update_one(
        {"id": gallery_id},
        {"$inc": {"qr_scan_count": 1}}
    )
    
    # Log analytics event
    await db.analytics_events.insert_one({
        "id": str(uuid.uuid4()),
        "gallery_id": gallery_id,
        "photographer_id": gallery.get("photographer_id"),
        "event_type": "qr_scan",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "QR scan tracked"}

@api_router.post("/analytics/track-download/{gallery_id}")
async def track_download(gallery_id: str, photo_id: Optional[str] = None):
    """Track a download from a gallery"""
    gallery = await db.galleries.find_one({"id": gallery_id})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Increment download count
    await db.galleries.update_one(
        {"id": gallery_id},
        {"$inc": {"download_count": 1}}
    )
    
    # Log analytics event
    await db.analytics_events.insert_one({
        "id": str(uuid.uuid4()),
        "gallery_id": gallery_id,
        "photographer_id": gallery.get("photographer_id"),
        "photo_id": photo_id,
        "event_type": "download",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "Download tracked"}

@api_router.post("/analytics/track-view/{gallery_id}")
async def track_gallery_view_by_id(gallery_id: str):
    """Track a gallery view by gallery ID"""
    gallery = await db.galleries.find_one({"id": gallery_id})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Increment view count
    await db.galleries.update_one(
        {"id": gallery_id},
        {"$inc": {"view_count": 1}}
    )
    
    # Log analytics event
    await db.analytics_events.insert_one({
        "id": str(uuid.uuid4()),
        "gallery_id": gallery_id,
        "photographer_id": gallery.get("photographer_id"),
        "event_type": "view",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "View tracked"}

@api_router.get("/billing/pricing")
async def get_public_pricing():
    """Get current pricing and payment methods (public)"""
    settings = await get_billing_settings()
    return {
        **settings.get("pricing", DEFAULT_PRICING),
        "payment_methods": settings.get("payment_methods", {
            "gcash": {"enabled": True, "name": "GCash", "account_name": "Less Real Moments", "account_number": "09952568450"},
            "maya": {"enabled": True, "name": "Maya", "account_name": "Less Real Moments", "account_number": "09952568450"},
            "bank": {"enabled": False, "name": "Bank Transfer", "account_name": "", "account_number": "", "bank_name": ""}
        })
    }

@api_router.get("/user/subscription")
async def get_user_subscription(user: dict = Depends(get_current_user)):
    """Get current user's subscription info"""
    db_user = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check and reset credits if billing cycle passed
    await reset_user_credits_if_needed(user["id"])
    
    # Refresh user data
    db_user = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    
    # Use authority hierarchy to resolve features
    resolved = await resolve_user_features(db_user)
    override_mode = db_user.get("override_mode")
    
    return {
        "plan": db_user.get("plan", PLAN_FREE),
        "effective_plan": resolved["effective_plan"],
        "billing_cycle_start": db_user.get("billing_cycle_start"),
        "event_credits": db_user.get("event_credits", 0),
        "extra_credits": db_user.get("extra_credits", 0),
        "total_credits": resolved["credits_available"],
        "is_unlimited_credits": resolved["has_unlimited_credits"],
        "requested_plan": db_user.get("requested_plan"),  # Pending upgrade
        "payment_status": db_user.get("payment_status", PAYMENT_NONE),
        "payment_proof_url": db_user.get("payment_proof_url"),
        "override_mode": override_mode,
        "override_expires": db_user.get("override_expires"),
        "can_download": resolved["can_download"],
        "storage_quota": db_user.get("storage_quota", DEFAULT_STORAGE_QUOTA),
        "storage_used": db_user.get("storage_used", 0),
        "features_enabled": resolved["features"],
        "authority_source": resolved["authority_source"]
    }

@api_router.post("/user/payment-proof")
async def submit_payment_proof(data: PaymentProofSubmit, user: dict = Depends(get_current_user)):
    """Submit payment proof (screenshot)"""
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "payment_status": PAYMENT_PENDING,
            "payment_proof_url": data.proof_url,
            "payment_proof_notes": data.notes,
            "payment_submitted_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    return {"message": "Payment proof submitted. Awaiting admin approval."}

class UpgradeRequest(BaseModel):
    requested_plan: str
    proof_url: Optional[str] = None  # Payment proof can be submitted with upgrade request

@api_router.post("/user/upgrade-request")
async def submit_upgrade_request(data: UpgradeRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    """Submit an upgrade request with optional payment proof"""
    if data.requested_plan not in [PLAN_STANDARD, PLAN_PRO]:
        raise HTTPException(status_code=400, detail="Invalid plan")
    
    db_user = await db.users.find_one({"id": user["id"]})
    current_plan = get_effective_plan(db_user)
    
    if current_plan == data.requested_plan:
        raise HTTPException(status_code=400, detail="You are already on this plan")
    
    # Save upgrade request
    update_data = {
        "requested_plan": data.requested_plan,
        "upgrade_requested_at": datetime.now(timezone.utc).isoformat(),
    }
    
    # If payment proof is provided, set status to pending
    if data.proof_url:
        update_data["payment_status"] = PAYMENT_PENDING
        update_data["payment_proof_url"] = data.proof_url
        update_data["payment_submitted_at"] = datetime.now(timezone.utc).isoformat()
        message = f"Upgrade to {data.requested_plan} requested with payment proof. Awaiting admin approval."
        
        # Send email notifications
        # To Admin
        admin_subject, admin_html = get_email_template("admin_payment_submitted", {
            "name": db_user.get("name", "Unknown"),
            "email": db_user.get("email", "Unknown"),
            "request_type": "Plan Upgrade",
            "plan_or_credits": f"Upgrade to {data.requested_plan.capitalize()}",
            "admin_url": f"{os.environ.get('FRONTEND_URL')}/admin/dashboard"
        })
        background_tasks.add_task(send_email, ADMIN_EMAIL, admin_subject, admin_html)
        
        # To Customer
        customer_subject, customer_html = get_email_template("customer_payment_pending", {
            "name": db_user.get("name", "there"),
            "request_type": f"Upgrade to {data.requested_plan.capitalize()} Plan"
        })
        background_tasks.add_task(send_email, db_user.get("email"), customer_subject, customer_html)
    else:
        update_data["payment_status"] = PAYMENT_NONE
        message = f"Upgrade to {data.requested_plan} requested. Please submit payment proof."
    
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": update_data}
    )
    
    return {"message": message, "needs_payment_proof": data.proof_url is None}

class ExtraCreditRequest(BaseModel):
    quantity: int = 1
    proof_url: str

@api_router.post("/user/extra-credits-request")
async def submit_extra_credits_request(data: ExtraCreditRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    """Submit a request for extra credits with payment proof"""
    if data.quantity < 1 or data.quantity > 10:
        raise HTTPException(status_code=400, detail="Quantity must be between 1 and 10")
    
    db_user = await db.users.find_one({"id": user["id"]})
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Set pending status with credit request info
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "payment_status": PAYMENT_PENDING,
            "payment_proof_url": data.proof_url,
            "payment_submitted_at": datetime.now(timezone.utc).isoformat(),
            "requested_extra_credits": data.quantity
        }}
    )
    
    settings = await get_billing_settings()
    total_cost = data.quantity * settings.get("pricing", {}).get("extra_credit", 500)
    
    # Send email notifications
    # To Admin
    admin_subject, admin_html = get_email_template("admin_payment_submitted", {
        "name": db_user.get("name", "Unknown"),
        "email": db_user.get("email", "Unknown"),
        "request_type": "Extra Credits Purchase",
        "plan_or_credits": f"{data.quantity} Extra Credit(s) - ₱{total_cost}",
        "admin_url": f"{os.environ.get('FRONTEND_URL')}/admin/dashboard"
    })
    background_tasks.add_task(send_email, ADMIN_EMAIL, admin_subject, admin_html)
    
    # To Customer
    customer_subject, customer_html = get_email_template("customer_payment_pending", {
        "name": db_user.get("name", "there"),
        "request_type": f"Purchase {data.quantity} Extra Credit(s) - ₱{total_cost}"
    })
    background_tasks.add_task(send_email, db_user.get("email"), customer_subject, customer_html)
    
    return {
        "message": f"Request for {data.quantity} extra credit(s) submitted. Total: ₱{total_cost}. Awaiting admin approval.",
        "quantity": data.quantity,
        "total_cost": total_cost
    }

@api_router.get("/admin/pending-payments")
async def get_pending_payments(admin: dict = Depends(get_admin_user)):
    """Get all users with pending payments"""
    users = await db.users.find(
        {"payment_status": PAYMENT_PENDING},
        {"_id": 0, "password": 0}
    ).to_list(None)
    return users

@api_router.post("/admin/approve-payment")
async def approve_payment(data: ApprovePayment, background_tasks: BackgroundTasks, admin: dict = Depends(get_admin_user)):
    """Approve a user's payment and process any pending upgrade or extra credits"""
    user = await db.users.find_one({"id": data.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = {
        "payment_status": PAYMENT_APPROVED,
        "payment_approved_at": datetime.now(timezone.utc).isoformat(),
        "payment_approved_notes": data.notes,
        "payment_dispute_count": 0  # Reset dispute count on approval
    }
    
    message_parts = ["Payment approved"]
    notification_title = "Payment Approved"
    notification_msg_parts = ["Your payment has been approved!"]
    
    # Get pricing for transaction record
    billing_settings = await get_billing_settings()
    pricing = billing_settings.get("pricing", DEFAULT_PRICING)
    tx_amount = 0
    tx_type = "subscription"
    
    # For email
    email_plan = None
    email_credits = None
    
    # If user has a pending upgrade request, apply it
    requested_plan = user.get("requested_plan")
    current_plan = user.get("plan", PLAN_FREE)
    
    if requested_plan:
        # Check if upgrading from Standard to Pro
        if current_plan == PLAN_STANDARD and requested_plan == PLAN_PRO:
            # Keep existing credits and add Pro credits
            current_credits = user.get("event_credits", 0)
            update_data["event_credits"] = current_credits + PLAN_CREDITS.get(requested_plan, 2)
        else:
            # Fresh plan activation
            update_data["event_credits"] = PLAN_CREDITS.get(requested_plan, 2)
        
        update_data["plan"] = requested_plan
        update_data["requested_plan"] = None
        update_data["billing_cycle_start"] = datetime.now(timezone.utc).isoformat()
        
        # Update storage quota based on new plan
        update_data["storage_quota"] = PLAN_STORAGE_QUOTAS.get(requested_plan, DEFAULT_STORAGE_QUOTA)
        
        # Update feature toggles based on new plan
        update_data["feature_toggles"] = {
            "qr_share": True,
            "online_gallery": True,
            "display_mode": requested_plan == PLAN_PRO,
            "contributor_link": requested_plan == PLAN_PRO,
            "auto_delete_enabled": True
        }
        message_parts.append(f"upgraded to {requested_plan}")
        notification_msg_parts.append(f"Your plan has been upgraded to {requested_plan.capitalize()}.")
        tx_type = "upgrade"
        tx_amount = pricing.get(f"{requested_plan}_monthly", 0)
        email_plan = requested_plan.capitalize()
        email_credits = update_data.get("event_credits", PLAN_CREDITS.get(requested_plan, 2))
    
    # If user has requested extra credits, add them
    requested_extra_credits = user.get("requested_extra_credits")
    if requested_extra_credits and requested_extra_credits > 0:
        current_extra = user.get("extra_credits", 0)
        update_data["extra_credits"] = current_extra + requested_extra_credits
        update_data["requested_extra_credits"] = None
        message_parts.append(f"+{requested_extra_credits} extra credits added")
        notification_msg_parts.append(f"You received {requested_extra_credits} extra credit(s).")
        tx_type = "extra_credits"
        tx_amount = pricing.get("extra_credit", 500) * requested_extra_credits
        email_credits = f"+{requested_extra_credits} extra"
        if not email_plan:
            email_plan = get_effective_plan(user).capitalize()
    
    await db.users.update_one(
        {"id": data.user_id},
        {"$set": update_data}
    )
    
    # Unlock downloads on galleries that were created with pending payment
    result = await db.galleries.update_many(
        {"photographer_id": data.user_id, "download_locked_until_payment": True},
        {"$set": {"download_locked_until_payment": False}}
    )
    if result.modified_count > 0:
        message_parts.append(f"{result.modified_count} gallery downloads unlocked")
        notification_msg_parts.append(f"Downloads on {result.modified_count} gallery(ies) have been unlocked.")
    
    # Create notification for user
    await create_notification(
        user_id=data.user_id,
        notification_type="payment_approved",
        title=notification_title,
        message=" ".join(notification_msg_parts),
        metadata={
            "plan": requested_plan,
            "extra_credits": requested_extra_credits
        }
    )
    
    # Create transaction record
    await create_transaction(
        user_id=data.user_id,
        tx_type=tx_type,
        amount=tx_amount,
        status="approved",
        plan=requested_plan,
        extra_credits=requested_extra_credits,
        payment_proof_url=user.get("payment_proof_url"),
        admin_notes=data.notes,
        resolved_at=datetime.now(timezone.utc).isoformat()
    )
    
    # Send approval email to customer
    subject, html = get_email_template("customer_payment_approved", {
        "name": user.get("name", "there"),
        "plan": email_plan or "Active",
        "credits": email_credits or "Updated",
        "dashboard_url": f"{os.environ.get('FRONTEND_URL')}/dashboard"
    })
    background_tasks.add_task(send_email, user.get("email"), subject, html)
    
    return {"message": ", ".join(message_parts)}

@api_router.post("/upload-payment-proof")
async def upload_payment_proof(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """Upload payment proof screenshot with optimization"""
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="Only image files allowed")
    
    # File size limit (10MB)
    MAX_FILE_SIZE = 10 * 1024 * 1024
    
    # Create payment proofs directory
    proofs_dir = Path("uploads/payment_proofs")
    proofs_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        # Read file content
        content = await file.read()
        
        # Check file size
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="File too large. Maximum size is 10MB")
        
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Empty file received")
        
        # Generate unique filename (always save as jpg for consistency)
        filename = f"{user['id']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
        file_path = proofs_dir / filename
        
        # Process and optimize image
        try:
            from PIL import Image
            import io
            
            # Open image from bytes
            img = Image.open(io.BytesIO(content))
            
            # Convert to RGB if necessary (handles PNG with transparency, etc.)
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            # Resize if too large (max 2000px on longest side)
            max_dimension = 2000
            if max(img.size) > max_dimension:
                ratio = max_dimension / max(img.size)
                new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
                img = img.resize(new_size, Image.Resampling.LANCZOS)
            
            # Save optimized image
            img.save(file_path, 'JPEG', quality=85, optimize=True)
            
            logger.info(f"Payment proof uploaded successfully: {filename}, size: {file_path.stat().st_size} bytes")
            
        except Exception as img_error:
            logger.error(f"Image processing error: {img_error}")
            # Fall back to saving raw content if image processing fails
            with open(file_path, "wb") as f:
                f.write(content)
        
        return {"url": f"/api/files/payment_proofs/{filename}"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Payment proof upload error: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload file. Please try again.")

@api_router.get("/files/{file_type}/{filename}")
async def serve_uploaded_file(file_type: str, filename: str):
    """Serve uploaded files (payment proofs, QR codes, video thumbnails, etc.)"""
    from fastapi.responses import FileResponse
    
    allowed_types = ["payment_proofs", "payment_qr", "video_thumbnails"]
    if file_type not in allowed_types:
        raise HTTPException(status_code=404, detail="File not found")
    
    file_path = UPLOAD_DIR / file_type / filename
    if not file_path.exists():
        logger.warning(f"File not found: {file_path}")
        raise HTTPException(status_code=404, detail="File not found")
    
    # Check if file is valid (not empty/corrupted)
    if file_path.stat().st_size == 0:
        logger.warning(f"Empty file found: {file_path}")
        raise HTTPException(status_code=404, detail="File is corrupted")
    
    # Determine content type
    suffix = file_path.suffix.lower()
    content_types = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
    }
    content_type = content_types.get(suffix, 'image/jpeg')
    
    # Add cache headers for better performance
    return FileResponse(
        file_path, 
        media_type=content_type,
        headers={
            "Cache-Control": "public, max-age=31536000",  # Cache for 1 year
            "X-Content-Type-Options": "nosniff"
        }
    )

@api_router.post("/admin/reject-payment")
async def reject_payment(data: RejectPayment, background_tasks: BackgroundTasks, admin: dict = Depends(get_admin_user)):
    """Reject a user's payment"""
    user = await db.users.find_one({"id": data.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if user still has a dispute attempt
    dispute_count = user.get("payment_dispute_count", 0)
    can_dispute = dispute_count < 1
    
    await db.users.update_one(
        {"id": data.user_id},
        {"$set": {
            "payment_status": PAYMENT_NONE,
            "payment_rejected_at": datetime.now(timezone.utc).isoformat(),
            "payment_rejected_reason": data.reason,
            # Don't clear payment_proof_url so they can reference it in dispute
        }}
    )
    
    # Create notification for user
    dispute_msg = " You have 1 attempt to dispute and resubmit." if can_dispute else " Please contact customer service for assistance."
    await create_notification(
        user_id=data.user_id,
        notification_type="payment_rejected",
        title="Payment Rejected",
        message=f"Your payment was rejected. Reason: {data.reason}.{dispute_msg}",
        metadata={
            "reason": data.reason,
            "can_dispute": can_dispute,
            "requested_plan": user.get("requested_plan"),
            "requested_extra_credits": user.get("requested_extra_credits")
        }
    )
    
    # Create transaction record
    billing_settings = await get_billing_settings()
    pricing = billing_settings.get("pricing", DEFAULT_PRICING)
    requested_plan = user.get("requested_plan")
    requested_extra_credits = user.get("requested_extra_credits")
    tx_amount = 0
    tx_type = "subscription"
    
    if requested_plan:
        tx_type = "upgrade"
        tx_amount = pricing.get(f"{requested_plan}_monthly", 0)
    if requested_extra_credits:
        tx_type = "extra_credits"
        tx_amount = pricing.get("extra_credit", 500) * requested_extra_credits
    
    await create_transaction(
        user_id=data.user_id,
        tx_type=tx_type,
        amount=tx_amount,
        status="rejected",
        plan=requested_plan,
        extra_credits=requested_extra_credits,
        payment_proof_url=user.get("payment_proof_url"),
        rejection_reason=data.reason,
        resolved_at=datetime.now(timezone.utc).isoformat()
    )
    
    # Send rejection email to customer
    subject, html = get_email_template("customer_payment_rejected", {
        "name": user.get("name", "there"),
        "reason": data.reason
    })
    background_tasks.add_task(send_email, user.get("email"), subject, html)
    
    return {"message": "Payment rejected"}

@api_router.post("/admin/upload-payment-qr")
async def upload_payment_qr(file: UploadFile = File(...), method: str = Form(...), admin: dict = Depends(get_admin_user)):
    """Upload QR code image for a payment method"""
    if method not in ["gcash", "maya", "bank"]:
        raise HTTPException(status_code=400, detail="Invalid payment method")
    
    # Create directory if not exists
    qr_dir = Path("uploads/payment_qr")
    qr_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate filename with method name
    ext = file.filename.split('.')[-1] if '.' in file.filename else 'png'
    filename = f"{method}_qr_{uuid.uuid4().hex[:8]}.{ext}"
    file_path = qr_dir / filename
    
    # Save file
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    
    return {"url": f"/api/files/payment_qr/{filename}"}

@api_router.post("/admin/assign-override")
async def assign_override_mode(data: AssignOverrideMode, admin: dict = Depends(get_admin_user)):
    """Assign an override mode to a user"""
    user = await db.users.find_one({"id": data.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if data.mode not in [MODE_FOUNDERS_CIRCLE, MODE_EARLY_PARTNER_BETA, MODE_COMPED_PRO, MODE_COMPED_STANDARD, MODE_ENTERPRISE_ACCESS]:
        raise HTTPException(status_code=400, detail="Invalid override mode")
    
    if data.duration_months < 1 or data.duration_months > 24:
        raise HTTPException(status_code=400, detail="Duration must be between 1 and 24 months")
    
    expires = datetime.now(timezone.utc) + timedelta(days=data.duration_months * 30)
    
    # Set credits based on mode
    credits = MODE_CREDITS.get(data.mode, 2)
    if credits == -1:
        credits = 999  # Unlimited representation for founders
    
    # Determine effective plan from override mode
    effective_plan = PLAN_PRO if data.mode in [MODE_FOUNDERS_CIRCLE, MODE_EARLY_PARTNER_BETA, MODE_COMPED_PRO, MODE_ENTERPRISE_ACCESS] else PLAN_STANDARD
    
    # Get storage quota for the effective plan
    storage_quota = PLAN_STORAGE_QUOTAS.get(effective_plan, DEFAULT_STORAGE_QUOTA)
    
    # Set feature toggles based on effective plan
    feature_toggles = {
        "qr_share": True,
        "online_gallery": True,
        "display_mode": effective_plan == PLAN_PRO,
        "contributor_link": effective_plan == PLAN_PRO,
        "auto_delete_enabled": data.mode != MODE_FOUNDERS_CIRCLE  # Founders don't auto-delete
    }
    
    await db.users.update_one(
        {"id": data.user_id},
        {"$set": {
            "override_mode": data.mode,
            "override_expires": expires.isoformat(),
            "override_reason": data.reason,
            "override_assigned_at": datetime.now(timezone.utc).isoformat(),
            "event_credits": credits,
            "billing_cycle_start": datetime.now(timezone.utc).isoformat(),
            "payment_status": PAYMENT_APPROVED,  # Override users don't need to pay
            "storage_quota": storage_quota,
            "feature_toggles": feature_toggles
        }}
    )
    return {"message": f"Override mode '{data.mode}' assigned until {expires.date()}"}

@api_router.post("/admin/remove-override")
async def remove_override_mode(data: RemoveOverrideMode, admin: dict = Depends(get_admin_user)):
    """Remove override mode from a user"""
    user = await db.users.find_one({"id": data.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    plan = user.get("plan", PLAN_FREE)
    credits = PLAN_CREDITS.get(plan, 0)
    
    await db.users.update_one(
        {"id": data.user_id},
        {"$set": {
            "override_mode": None,
            "override_expires": None,
            "override_reason": None,
            "override_removed_at": datetime.now(timezone.utc).isoformat(),
            "override_removal_reason": data.reason,
            "event_credits": credits
        }}
    )
    return {"message": "Override mode removed"}

@api_router.get("/admin/users/{user_id}/subscription")
async def get_user_subscription_admin(user_id: str, admin: dict = Depends(get_admin_user)):
    """Get a user's subscription details (admin)"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "id": user["id"],
        "email": user.get("email"),
        "name": user.get("name"),
        "plan": user.get("plan", PLAN_FREE),
        "effective_plan": get_effective_plan(user),
        "billing_cycle_start": user.get("billing_cycle_start"),
        "event_credits": user.get("event_credits", 0),
        "extra_credits": user.get("extra_credits", 0),
        "total_credits": get_effective_credits(user),
        "payment_status": user.get("payment_status", PAYMENT_NONE),
        "payment_proof_url": user.get("payment_proof_url"),
        "override_mode": user.get("override_mode"),
        "override_expires": user.get("override_expires"),
        "override_reason": user.get("override_reason"),
        "galleries_created": user.get("galleries_created_total", 0)
    }

@api_router.put("/admin/users/{user_id}/plan")
async def update_user_plan(user_id: str, plan: str = Body(..., embed=True), admin: dict = Depends(get_admin_user)):
    """Update a user's subscription plan (admin)"""
    if plan not in [PLAN_FREE, PLAN_STANDARD, PLAN_PRO]:
        raise HTTPException(status_code=400, detail="Invalid plan")
    
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    credits = PLAN_CREDITS.get(plan, 0)
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "plan": plan,
            "event_credits": credits,
            "billing_cycle_start": datetime.now(timezone.utc).isoformat()
        }}
    )
    return {"message": f"User plan updated to {plan}"}

# ============================================
# NOTIFICATION ENDPOINTS
# ============================================

@api_router.get("/user/notifications")
async def get_user_notifications(limit: int = 50, user: dict = Depends(get_current_user)):
    """Get notifications for the current user"""
    notifications = await db.notifications.find(
        {"user_id": user["id"]},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(None)
    return notifications

@api_router.get("/user/notifications/unread-count")
async def get_unread_notification_count(user: dict = Depends(get_current_user)):
    """Get count of unread notifications"""
    count = await db.notifications.count_documents({"user_id": user["id"], "read": False})
    return {"count": count}

@api_router.put("/user/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user: dict = Depends(get_current_user)):
    """Mark a notification as read"""
    result = await db.notifications.update_one(
        {"id": notification_id, "user_id": user["id"]},
        {"$set": {"read": True}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification marked as read"}

@api_router.put("/user/notifications/read-all")
async def mark_all_notifications_read(user: dict = Depends(get_current_user)):
    """Mark all notifications as read"""
    await db.notifications.update_many(
        {"user_id": user["id"], "read": False},
        {"$set": {"read": True}}
    )
    return {"message": "All notifications marked as read"}

# ============================================
# PAYMENT DISPUTE ENDPOINTS
# ============================================

@api_router.post("/user/payment-dispute")
async def submit_payment_dispute(data: PaymentDispute, user: dict = Depends(get_current_user)):
    """Submit a dispute for a rejected payment - only 1 attempt allowed"""
    db_user = await db.users.find_one({"id": user["id"]})
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if payment was rejected
    if db_user.get("payment_rejected_at") is None:
        raise HTTPException(status_code=400, detail="No rejected payment to dispute")
    
    # Check if already disputed (only 1 attempt)
    if db_user.get("payment_dispute_count", 0) >= 1:
        raise HTTPException(
            status_code=400, 
            detail="You have already used your dispute attempt. Please contact customer service at lessrealmoments@gmail.com or 09952568450"
        )
    
    # Update user with dispute info
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "payment_status": PAYMENT_PENDING,
            "payment_proof_url": data.new_proof_url,
            "payment_dispute_message": data.dispute_message,
            "payment_disputed_at": datetime.now(timezone.utc).isoformat(),
            "payment_rejected_at": None,
            "payment_rejected_reason": None
        },
        "$inc": {"payment_dispute_count": 1}}
    )
    
    return {"message": "Dispute submitted successfully. Your payment will be reviewed again."}

@api_router.get("/user/payment-status")
async def get_payment_status(user: dict = Depends(get_current_user)):
    """Get detailed payment status including rejection info"""
    db_user = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "payment_status": db_user.get("payment_status", PAYMENT_NONE),
        "payment_rejected_at": db_user.get("payment_rejected_at"),
        "payment_rejected_reason": db_user.get("payment_rejected_reason"),
        "payment_dispute_count": db_user.get("payment_dispute_count", 0),
        "can_dispute": db_user.get("payment_rejected_at") is not None and db_user.get("payment_dispute_count", 0) < 1,
        "payment_proof_url": db_user.get("payment_proof_url"),
        "requested_plan": db_user.get("requested_plan"),
        "requested_extra_credits": db_user.get("requested_extra_credits")
    }

# ============================================
# TRANSACTION HISTORY ENDPOINTS
# ============================================

@api_router.get("/user/transactions")
async def get_user_transactions(limit: int = 50, user: dict = Depends(get_current_user)):
    """Get transaction history for the current user"""
    transactions = await db.transactions.find(
        {"user_id": user["id"]},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(None)
    return transactions

@api_router.get("/admin/users/{user_id}/transactions")
async def get_admin_user_transactions(user_id: str, admin: dict = Depends(get_admin_user)):
    """Get transaction history for a specific user (admin only)"""
    transactions = await db.transactions.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(None)
    return transactions

@api_router.get("/admin/transactions")
async def get_all_transactions(
    limit: int = 100, 
    status: Optional[str] = None,
    admin: dict = Depends(get_admin_user)
):
    """Get all transactions (admin only)"""
    query = {}
    if status:
        query["status"] = status
    
    transactions = await db.transactions.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(None)
    
    # Enrich with user info
    result = []
    for tx in transactions:
        user = await db.users.find_one({"id": tx["user_id"]}, {"_id": 0, "name": 1, "email": 1})
        result.append({
            **tx,
            "user_name": user.get("name") if user else "Unknown",
            "user_email": user.get("email") if user else "Unknown"
        })
    return result

@api_router.post("/admin/repair-thumbnails")
async def repair_all_thumbnails(
    admin: dict = Depends(get_admin_user),
    batch_size: int = 50
):
    """Repair all missing thumbnails for photos in database"""
    # Find all photos missing thumbnails
    missing_photos = await db.photos.find(
        {"$or": [{"thumbnail_url": None}, {"thumbnail_url": ""}]},
        {"_id": 0, "id": 1, "url": 1}
    ).to_list(10000)
    
    total = len(missing_photos)
    repaired = 0
    failed = 0
    errors = []
    
    for photo in missing_photos:
        photo_id = photo["id"]
        url = photo.get("url", "")
        
        # Extract filename from URL
        filename = url.split("/")[-1] if url else f"{photo_id}.jpg"
        file_path = UPLOAD_DIR / filename
        
        # Try different extensions
        if not file_path.exists():
            for ext in ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'JPG', 'JPEG', 'PNG']:
                test_path = UPLOAD_DIR / f"{photo_id}.{ext}"
                if test_path.exists():
                    file_path = test_path
                    break
        
        if not file_path.exists():
            failed += 1
            errors.append(f"{photo_id}: Original file not found")
            continue
        
        try:
            # Generate both thumbnail sizes
            thumb_small = generate_thumbnail(file_path, photo_id, 'small')
            thumb_medium = generate_thumbnail(file_path, photo_id, 'medium')
            
            update = {}
            if thumb_small:
                update["thumbnail_url"] = thumb_small
            if thumb_medium:
                update["thumbnail_medium_url"] = thumb_medium
            
            if update:
                await db.photos.update_one(
                    {"id": photo_id},
                    {"$set": update}
                )
                repaired += 1
            else:
                failed += 1
                errors.append(f"{photo_id}: Thumbnail generation returned None")
                
        except Exception as e:
            failed += 1
            errors.append(f"{photo_id}: {str(e)}")
    
    return {
        "total_missing": total,
        "repaired": repaired,
        "failed": failed,
        "errors": errors[:20]  # Return first 20 errors only
    }

@api_router.get("/admin/thumbnail-status")
async def get_thumbnail_status(admin: dict = Depends(get_admin_user)):
    """Get status of thumbnails in the system"""
    total = await db.photos.count_documents({})
    missing = await db.photos.count_documents({"$or": [{"thumbnail_url": None}, {"thumbnail_url": ""}]})
    
    return {
        "total_photos": total,
        "missing_thumbnails": missing,
        "has_thumbnails": total - missing,
        "percentage_missing": round(missing / total * 100, 1) if total > 0 else 0
    }

@api_router.get("/admin/storage-status")
async def get_storage_status(admin: dict = Depends(get_admin_user)):
    """Get comprehensive storage status - find orphaned files and R2 status"""
    import glob
    
    # R2 Storage status
    r2_status = {
        "enabled": storage.r2_enabled,
        "endpoint": os.environ.get('R2_ENDPOINT_URL', 'Not configured'),
        "bucket": os.environ.get('R2_BUCKET_NAME', 'Not configured'),
        "public_url": os.environ.get('R2_PUBLIC_URL', 'Not configured')
    }
    
    # Get all photo IDs from database
    db_photos = await db.photos.find({}, {"_id": 0, "id": 1, "filename": 1}).to_list(100000)
    db_photo_ids = {p["id"] for p in db_photos}
    db_filenames = {p.get("filename", "") for p in db_photos}
    
    # Get all files on disk (excluding system files)
    upload_files = []
    for ext in ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'JPG', 'JPEG', 'PNG', 'GIF', 'WEBP']:
        upload_files.extend(glob.glob(str(UPLOAD_DIR / f"*.{ext}")))
    
    # Exclude landing images and other system files
    photo_files = [f for f in upload_files if not Path(f).name.startswith(('landing_', 'favicon_', 'logo_', 'payment_'))]
    
    # Get all thumbnails on disk
    thumb_files = glob.glob(str(THUMBNAILS_DIR / "*.jpg"))
    
    # Find orphaned files (on disk but not in database)
    orphaned_uploads = []
    for file_path in photo_files:
        filename = Path(file_path).name
        # Check if filename matches any database entry
        if filename not in db_filenames:
            # Also check by photo_id pattern (uuid.ext)
            photo_id = filename.rsplit('.', 1)[0] if '.' in filename else filename
            if photo_id not in db_photo_ids:
                orphaned_uploads.append({
                    "path": file_path,
                    "filename": filename,
                    "size": Path(file_path).stat().st_size
                })
    
    # Find orphaned thumbnails
    orphaned_thumbs = []
    for thumb_path in thumb_files:
        filename = Path(thumb_path).name
        # Extract photo_id from thumb filename (format: {photo_id}_{size}.jpg)
        parts = filename.rsplit('_', 1)
        if len(parts) == 2:
            photo_id = parts[0]
            if photo_id not in db_photo_ids:
                orphaned_thumbs.append({
                    "path": thumb_path,
                    "filename": filename,
                    "size": Path(thumb_path).stat().st_size
                })
    
    # Calculate sizes
    orphaned_upload_size = sum(f["size"] for f in orphaned_uploads)
    orphaned_thumb_size = sum(f["size"] for f in orphaned_thumbs)
    
    return {
        "r2_storage": r2_status,
        "database": {
            "total_photos": len(db_photo_ids)
        },
        "disk": {
            "total_photo_files": len(photo_files),
            "total_thumbnail_files": len(thumb_files)
        },
        "orphaned": {
            "upload_files": len(orphaned_uploads),
            "upload_size_mb": round(orphaned_upload_size / (1024 * 1024), 2),
            "thumbnail_files": len(orphaned_thumbs),
            "thumbnail_size_mb": round(orphaned_thumb_size / (1024 * 1024), 2),
            "total_files": len(orphaned_uploads) + len(orphaned_thumbs),
            "total_size_mb": round((orphaned_upload_size + orphaned_thumb_size) / (1024 * 1024), 2)
        },
        "sample_orphaned_uploads": orphaned_uploads[:10],
        "sample_orphaned_thumbs": orphaned_thumbs[:10]
    }

@api_router.post("/admin/test-r2-upload")
async def test_r2_upload(admin: dict = Depends(get_admin_user)):
    """Test R2 connectivity by uploading a small test file"""
    if not storage.r2_enabled:
        return {
            "success": False,
            "error": "R2 is not enabled. Check environment variables.",
            "config": {
                "R2_ACCESS_KEY_ID": bool(os.environ.get('R2_ACCESS_KEY_ID')),
                "R2_SECRET_ACCESS_KEY": bool(os.environ.get('R2_SECRET_ACCESS_KEY')),
                "R2_ENDPOINT_URL": os.environ.get('R2_ENDPOINT_URL', 'Not set'),
                "R2_BUCKET_NAME": os.environ.get('R2_BUCKET_NAME', 'Not set'),
            }
        }
    
    try:
        # Create a tiny test file
        test_content = b"R2 connectivity test - " + datetime.now(timezone.utc).isoformat().encode()
        test_key = f"test/connectivity_test_{uuid.uuid4().hex[:8]}.txt"
        
        # Try to upload
        success, result = await storage.upload_file(test_key, test_content, "text/plain")
        
        if success:
            # Try to delete the test file
            await storage.delete_file(test_key)
            return {
                "success": True,
                "message": "R2 upload and delete successful!",
                "test_key": test_key,
                "public_url": result
            }
        else:
            return {
                "success": False,
                "error": result,
                "hint": "Check that your API token has 'Object Read & Write' permission for this bucket"
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "hint": "Check R2 credentials and bucket configuration"
        }

@api_router.post("/admin/cleanup-orphaned-files")
async def cleanup_orphaned_files(
    admin: dict = Depends(get_admin_user),
    dry_run: bool = True
):
    """Delete orphaned files from disk that aren't in the database.
    Use dry_run=true first to see what would be deleted."""
    import glob
    
    # Get all photo IDs and filenames from database
    db_photos = await db.photos.find({}, {"_id": 0, "id": 1, "filename": 1}).to_list(100000)
    db_photo_ids = {p["id"] for p in db_photos}
    db_filenames = {p.get("filename", "") for p in db_photos}
    
    # Get all files on disk
    upload_files = []
    for ext in ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'JPG', 'JPEG', 'PNG', 'GIF', 'WEBP']:
        upload_files.extend(glob.glob(str(UPLOAD_DIR / f"*.{ext}")))
    
    # Exclude system files
    photo_files = [f for f in upload_files if not Path(f).name.startswith(('landing_', 'favicon_', 'logo_', 'payment_'))]
    thumb_files = glob.glob(str(THUMBNAILS_DIR / "*.jpg"))
    
    deleted_uploads = []
    deleted_thumbs = []
    total_freed = 0
    
    # Process orphaned uploads
    for file_path in photo_files:
        filename = Path(file_path).name
        photo_id = filename.rsplit('.', 1)[0] if '.' in filename else filename
        
        if filename not in db_filenames and photo_id not in db_photo_ids:
            file_size = Path(file_path).stat().st_size
            if not dry_run:
                Path(file_path).unlink()
                logger.info(f"Deleted orphaned upload: {filename}")
            deleted_uploads.append({"filename": filename, "size": file_size})
            total_freed += file_size
    
    # Process orphaned thumbnails
    for thumb_path in thumb_files:
        filename = Path(thumb_path).name
        parts = filename.rsplit('_', 1)
        if len(parts) == 2:
            photo_id = parts[0]
            if photo_id not in db_photo_ids:
                file_size = Path(thumb_path).stat().st_size
                if not dry_run:
                    Path(thumb_path).unlink()
                    logger.info(f"Deleted orphaned thumbnail: {filename}")
                deleted_thumbs.append({"filename": filename, "size": file_size})
                total_freed += file_size
    
    return {
        "dry_run": dry_run,
        "message": "Files would be deleted" if dry_run else "Files deleted",
        "uploads_deleted": len(deleted_uploads),
        "thumbnails_deleted": len(deleted_thumbs),
        "total_files_deleted": len(deleted_uploads) + len(deleted_thumbs),
        "space_freed_mb": round(total_freed / (1024 * 1024), 2),
        "deleted_uploads": deleted_uploads[:20],
        "deleted_thumbs": deleted_thumbs[:20]
    }

@api_router.get("/admin/orphaned-db-photos")
async def get_orphaned_db_photos(admin: dict = Depends(get_admin_user)):
    """Find photos in database whose files don't exist on disk"""
    db_photos = await db.photos.find({}, {"_id": 0, "id": 1, "filename": 1, "gallery_id": 1}).to_list(100000)
    
    orphaned = []
    for photo in db_photos:
        file_path = UPLOAD_DIR / photo.get("filename", "")
        if not file_path.exists():
            orphaned.append({
                "id": photo["id"],
                "filename": photo.get("filename"),
                "gallery_id": photo.get("gallery_id")
            })
    
    return {
        "total_db_photos": len(db_photos),
        "orphaned_db_records": len(orphaned),
        "orphaned_photos": orphaned[:50]
    }

@api_router.post("/admin/cleanup-orphaned-db-photos")
async def cleanup_orphaned_db_photos(
    admin: dict = Depends(get_admin_user),
    dry_run: bool = True
):
    """Delete database records for photos whose files don't exist on disk"""
    db_photos = await db.photos.find({}, {"_id": 0, "id": 1, "filename": 1}).to_list(100000)
    
    deleted = []
    for photo in db_photos:
        file_path = UPLOAD_DIR / photo.get("filename", "")
        if not file_path.exists():
            if not dry_run:
                await db.photos.delete_one({"id": photo["id"]})
                logger.info(f"Deleted orphaned DB record: {photo['id']}")
            deleted.append(photo["id"])
    
    return {
        "dry_run": dry_run,
        "message": "Records would be deleted" if dry_run else "Records deleted",
        "records_deleted": len(deleted),
        "deleted_ids": deleted[:50]
    }

app.include_router(api_router)

# Mount static files for uploads (payment proofs, QR codes, etc.)
from fastapi.staticfiles import StaticFiles
uploads_path = ROOT_DIR / "uploads"
uploads_path.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_path)), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()