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
import httpx
from contextlib import asynccontextmanager
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest

# Import models from models package (Phase 1 refactoring)
# These models are now defined in /app/backend/models/ for better organization
from models.collage import (
    CollagePreset,
    CollagePresetCreate,
    CollagePresetUpdate,
    CollagePresetPlaceholder,
    CollagePresetSettings,
)
from models.video import (
    GalleryVideo,
    VideoCreate,
    VideoUpdate,
    FotoshareVideo,
    PCloudPhoto,
    FotoshareSectionCreate,
    GoogleDriveSectionCreate,
    SectionDownloadRequest,
)
from models.gallery import (
    ThumbnailRepairRequest,
    PhotoHealthCheck,
    GalleryCreate,
    Gallery,
    GalleryUpdate,
    Section,
    Photo,
    PasswordVerify,
    BulkPhotoAction,
    PhotoReorder,
    BulkFlagAction,
    BulkUnflagAction,
    PublicGallery,
    CoverPhotoPosition,
    DuplicateCheckRequest,
    DuplicateCheckResponse,
)
from models.analytics import (
    GalleryAnalytics,
    PhotographerAnalytics,
    AdminAnalytics,
    GoogleDriveBackupStatus,
)
from models.user import (
    UserRegister,
    UserLogin,
    User,
    UserProfile,
    Token,
    ForgotPassword,
    ChangePassword,
    AdminLogin,
    AdminToken,
    PhotographerAdmin,
    UpdateGalleryLimit,
    UpdateStorageQuota,
    LandingPageConfig,
)
from models.billing import (
    SubscriptionInfo,
    AssignOverrideMode,
    RemoveOverrideMode,
    UpdatePricing,
    PurchaseExtraCredits,
    PaymentProofSubmit,
    ApprovePayment,
    RejectPayment,
    PaymentMethod,
    BillingSettings,
    PaymentDispute,
    Transaction,
    GlobalFeatureToggles,
    UpgradeRequest,
    ExtraCreditRequest,
    # Note: FeatureToggle and UserFeatureToggle in server.py have different fields
)
from models.invitation import (
    Invitation,
    InvitationCreate,
    InvitationUpdate,
    InvitationSummary,
    PublicInvitation,
    RSVPResponse,
    RSVPResponseCreate,
    RSVPStats,
)
from models.notification import (
    Notification,
    NotificationCreate,
)
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

# Import utility functions from utils package
from utils.helpers import (
    extract_youtube_video_id,
    get_youtube_thumbnail_url,
    get_youtube_embed_url,
    extract_fotoshare_event_id,
    extract_pcloud_code,
    extract_gdrive_folder_id,
)

# Import background tasks from tasks package (Phase 3 refactoring)
from tasks import (
    init_tasks,
    stop_tasks,
    auto_refresh_fotoshare_sections,
    auto_sync_gdrive_sections,
    auto_sync_pcloud_sections,
    auto_sync_drive_backup_task,
    auto_delete_expired_galleries,
    check_expiring_subscriptions,
)

# Import routes from routes package (Phase 4 refactoring)
from routes import health_router
from routes.rsvp_token import router as rsvp_token_router, set_database as set_rsvp_token_db, set_email_functions as set_rsvp_token_email, consume_rsvp_token, get_user_token_balance

# YouTube URL patterns and utilities - NOW IMPORTED FROM utils.helpers
# Keeping local definitions as fallback for backward compatibility
def _extract_youtube_video_id(url: str) -> Optional[str]:
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

def _get_youtube_thumbnail_url(video_id: str) -> str:
    """DEPRECATED - Use from utils.helpers"""
    return f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"

def _get_youtube_embed_url(video_id: str) -> str:
    """DEPRECATED - Use from utils.helpers"""
    return f"https://www.youtube.com/embed/{video_id}"

# ============ Fotoshare.co / 360 Booth Scraping ============

def _extract_fotoshare_event_id(url: str) -> Optional[str]:
    """DEPRECATED - Use from utils.helpers"""
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
    Scrape fotoshare.co event page to extract video/photo thumbnails and metadata.
    Supports both 360° Booth (videos) and Photobooth (photos with sessions).
    Returns dict with 'success', 'videos', 'photos', 'sessions', 'event_title', 'content_type', 'error' keys.
    """
    import aiohttp
    from bs4 import BeautifulSoup
    
    result = {
        'success': False,
        'videos': [],
        'photos': [],
        'sessions': {},  # session_id -> list of photos
        'event_title': None,
        'content_type': 'unknown',  # '360_booth', 'photobooth', or 'mixed'
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
        
        # Extract ALL items from the items container
        all_items = soup.select('.thumb[data-hash], div.thumb[data-hash]')
        
        videos = []
        photos = []
        sessions = {}  # Group photos by session_id
        
        for idx, item in enumerate(all_items):
            try:
                item_hash = item.get('data-hash')
                if not item_hash:
                    continue
                
                thumbnail = item.get('data-thumb', '')
                # Also try to get from img element
                if not thumbnail:
                    img = item.select_one('img:not(.session-thumb-overlay)')
                    if img:
                        thumbnail = img.get('data-src') or img.get('src', '')
                
                if not thumbnail:
                    continue
                
                file_type = item.get('data-filetype', item.get('data-type', 'unknown')).lower()
                session_id = item.get('data-session-id')
                
                # Check if this item has a session overlay (indicates multiple photos in session)
                has_session_overlay = item.select_one('.session-thumb-overlay') is not None
                
                item_data = {
                    'hash': item_hash,
                    'source_url': f'https://fotoshare.co/i/{item_hash}',
                    'thumbnail_url': thumbnail,
                    'width': int(item.get('data-width', 1080)),
                    'height': int(item.get('data-height', 1920)),
                    'file_type': file_type,
                    'file_size': int(item.get('data-filesize', 0)),
                    'file_source': item.get('data-filesource', 'unknown'),
                    'created_at_source': item.get('data-filecreated'),
                    'session_id': session_id,
                    'has_session_items': has_session_overlay,
                    'order': idx
                }
                
                if file_type == 'mp4':
                    videos.append(item_data)
                else:
                    # Photo (jpg, png, etc.)
                    photos.append(item_data)
                    
                    # Group by session
                    if session_id:
                        if session_id not in sessions:
                            sessions[session_id] = []
                        sessions[session_id].append(item_data)
                        
            except Exception as e:
                logging.warning(f"Error parsing fotoshare item: {e}")
                continue
        
        # Determine content type
        if videos and not photos:
            result['content_type'] = '360_booth'
        elif photos and not videos:
            result['content_type'] = 'photobooth'
        elif videos and photos:
            result['content_type'] = 'mixed'
        
        result['success'] = True
        result['videos'] = videos
        result['photos'] = photos
        result['sessions'] = sessions
        
        logging.info(f"Scraped fotoshare.co: {len(videos)} videos, {len(photos)} photos, {len(sessions)} sessions (type: {result['content_type']})")
        
    except aiohttp.ClientError as e:
        result['error'] = f'Network error: {str(e)}'
        # Check if it might be expired
        if 'timeout' in str(e).lower() or '404' in str(e):
            result['expired'] = True
    except Exception as e:
        logging.error(f"Error scraping fotoshare: {e}")
        result['error'] = f'Error scraping page: {str(e)}'
    
    return result

# ============ pCloud Integration ============
# NOTE: Background tasks (auto_refresh_fotoshare_sections, auto_sync_gdrive_sections, 
# auto_sync_pcloud_sections) have been moved to /app/backend/tasks/background.py

def _extract_pcloud_code_deprecated(url: str) -> Optional[str]:
    """DEPRECATED - Now imported from utils.helpers. Kept for reference."""
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

# Helper function to convert datetime to ISO string for Pydantic models
def datetime_to_str(value):
    """Convert datetime to ISO string, return as-is if already string or None"""
    if value is None:
        return None
    if hasattr(value, 'isoformat'):
        return value.isoformat()
    return str(value)

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
FREE_GALLERY_EXPIRATION_HOURS = 2  # Demo galleries expire after 2 hours

# Gallery edit lock after 7 days from creation
GALLERY_EDIT_LOCK_DAYS = 7

# Demo gallery feature window (in hours) - same as expiration for free
DEMO_FEATURE_WINDOW_HOURS = 2  # Demo features available for 2 hours

# ============================================
# SUBSCRIPTION GRACE PERIOD SETTINGS
# ============================================
# When subscription expires, galleries get grace periods:
# - UPLOAD_GRACE_PERIOD_DAYS: Owner/guests/contributors can still upload
# - VIEW_GRACE_PERIOD_DAYS: Gallery remains viewable after subscription expires
UPLOAD_GRACE_PERIOD_DAYS = 60  # 2 months
VIEW_GRACE_PERIOD_DAYS = 180   # 6 months

# ============ Google Drive Integration ============

def _extract_gdrive_folder_id_deprecated(url: str) -> Optional[str]:
    """DEPRECATED - Now imported from utils.helpers. Kept for reference."""
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
    Fetch photos from a public Google Drive folder using the Google Drive API.
    Requires GOOGLE_DRIVE_API_KEY environment variable.
    """
    result = {
        'success': False,
        'folder_name': 'Google Drive Photos',
        'photos': [],
        'error': None
    }
    
    api_key = os.environ.get('GOOGLE_DRIVE_API_KEY', '')
    if not api_key:
        result['error'] = "Google Drive API key not configured"
        logger.error("GOOGLE_DRIVE_API_KEY not set in environment")
        return result
    
    try:
        async with aiohttp.ClientSession() as session:
            # First, get folder metadata to get the folder name
            folder_url = f"https://www.googleapis.com/drive/v3/files/{folder_id}"
            folder_params = {
                "fields": "name,mimeType",
                "key": api_key
            }
            
            async with session.get(folder_url, params=folder_params) as folder_response:
                if folder_response.status == 200:
                    folder_data = await folder_response.json()
                    result['folder_name'] = folder_data.get('name', 'Google Drive Photos')
                    logger.info(f"Found folder: {result['folder_name']}")
                elif folder_response.status == 404:
                    result['error'] = "Folder not found. Check if the link is correct."
                    return result
                elif folder_response.status == 403:
                    error_data = await folder_response.json()
                    error_msg = error_data.get('error', {}).get('message', 'Access denied')
                    result['error'] = f"Access denied: {error_msg}. Make sure the folder is set to 'Anyone with the link can view'."
                    return result
            
            # Now get all image files in the folder
            all_photos = []
            next_page_token = None
            
            while True:
                api_url = "https://www.googleapis.com/drive/v3/files"
                params = {
                    "q": f"'{folder_id}' in parents and (mimeType contains 'image/') and trashed=false",
                    "fields": "nextPageToken,files(id,name,mimeType,size,imageMediaMetadata,thumbnailLink,createdTime)",
                    "pageSize": 1000,
                    "orderBy": "createdTime desc",
                    "key": api_key
                }
                
                if next_page_token:
                    params["pageToken"] = next_page_token
                
                async with session.get(api_url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        files = data.get('files', [])
                        
                        for file in files:
                            file_id = file.get('id')
                            thumbnail_url = file.get('thumbnailLink', '')
                            
                            # Get higher quality thumbnail (up to 1600px)
                            if thumbnail_url:
                                thumbnail_url = thumbnail_url.replace('=s220', '=s1600')
                            else:
                                thumbnail_url = f"https://drive.google.com/thumbnail?id={file_id}&sz=w1600"
                            
                            # Full image URL for viewing/downloading
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
                            all_photos.append(photo_data)
                        
                        next_page_token = data.get('nextPageToken')
                        if not next_page_token:
                            break
                            
                    elif response.status == 403:
                        error_data = await response.json()
                        error_msg = error_data.get('error', {}).get('message', 'Access denied')
                        result['error'] = f"Cannot list files: {error_msg}. Make sure the folder is publicly shared."
                        return result
                    else:
                        error_text = await response.text()
                        result['error'] = f"API error ({response.status}): {error_text[:200]}"
                        logger.error(f"Google Drive API error: {response.status} - {error_text}")
                        return result
            
            result['success'] = True
            result['photos'] = all_photos
            result['photo_count'] = len(all_photos)
            logger.info(f"Successfully fetched {len(all_photos)} photos from Google Drive folder '{result['folder_name']}'")
                    
    except Exception as e:
        result['error'] = f"Error fetching Google Drive folder: {str(e)}"
        logger.error(f"Google Drive fetch error: {e}")
    
    return result

async def scrape_gdrive_folder_html(folder_id: str) -> dict:
    """
    Scrape Google Drive folder HTML page for public folders.
    This works when the folder is publicly shared.
    Updated for Google's 2024/2025 page structure with multiple extraction methods.
    """
    result = {
        'success': False,
        'folder_name': 'Google Drive Photos',
        'photos': [],
        'error': None
    }
    
    try:
        # Try both URL formats
        urls_to_try = [
            f"https://drive.google.com/drive/folders/{folder_id}?usp=sharing",
            f"https://drive.google.com/drive/folders/{folder_id}",
        ]
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0',
        }
        
        html = None
        async with aiohttp.ClientSession() as session:
            for url in urls_to_try:
                try:
                    async with session.get(url, headers=headers, allow_redirects=True, timeout=aiohttp.ClientTimeout(total=30)) as response:
                        if response.status == 200:
                            html = await response.text()
                            logger.info(f"Successfully fetched Google Drive folder HTML ({len(html)} bytes) from {url}")
                            break
                        else:
                            logger.warning(f"Google Drive returned status {response.status} for {url}")
                except Exception as e:
                    logger.warning(f"Failed to fetch {url}: {e}")
                    continue
            
            if not html:
                result['error'] = "Could not access Google Drive folder. Make sure the link is correct and publicly shared."
                return result
            
            # Extract folder name from title
            title_match = re.search(r'<title>([^<]+)</title>', html)
            if title_match:
                title = title_match.group(1).replace(' - Google Drive', '').strip()
                if title and title != 'Google Drive':
                    result['folder_name'] = title
            
            # Multiple patterns to extract file IDs (Google changes their HTML frequently)
            all_file_ids = set()
            
            # Pattern 1: /file/d/{fileId}/view format (most common in links)
            pattern1 = r'/file/d/([a-zA-Z0-9_-]{25,})/view'
            matches1 = re.findall(pattern1, html)
            all_file_ids.update(matches1)
            logger.info(f"Pattern 1 (/file/d/.../view): found {len(matches1)} matches")
            
            # Pattern 2: /d/{fileId} format
            pattern2 = r'/d/([a-zA-Z0-9_-]{25,})'
            matches2 = re.findall(pattern2, html)
            all_file_ids.update(matches2)
            logger.info(f"Pattern 2 (/d/...): found {len(matches2)} matches")
            
            # Pattern 3: data-id attribute
            pattern3 = r'data-id="([a-zA-Z0-9_-]{25,})"'
            matches3 = re.findall(pattern3, html)
            all_file_ids.update(matches3)
            logger.info(f"Pattern 3 (data-id): found {len(matches3)} matches")
            
            # Pattern 4: Quoted file IDs starting with '1' (common Google Drive ID format)
            pattern4 = r'"(1[a-zA-Z0-9_-]{32,})"'
            matches4 = re.findall(pattern4, html)
            all_file_ids.update(matches4)
            logger.info(f"Pattern 4 (quoted 1...): found {len(matches4)} matches")
            
            # Pattern 5: id= parameter in URLs
            pattern5 = r'id=([a-zA-Z0-9_-]{25,})'
            matches5 = re.findall(pattern5, html)
            all_file_ids.update(matches5)
            logger.info(f"Pattern 5 (id=...): found {len(matches5)} matches")
            
            # Pattern 6: JSON-like structure with file IDs
            pattern6 = r'\["([a-zA-Z0-9_-]{25,})"[^\]]*"image/'
            matches6 = re.findall(pattern6, html)
            all_file_ids.update(matches6)
            logger.info(f"Pattern 6 (JSON image): found {len(matches6)} matches")
            
            # Remove the folder ID itself
            all_file_ids.discard(folder_id)
            
            # Also remove common non-file IDs (known Google IDs that aren't files)
            known_non_files = {'AIzaSy', 'gtm.js', 'analytics'}
            all_file_ids = {fid for fid in all_file_ids if not any(x in fid for x in known_non_files)}
            
            logger.info(f"Total unique potential file IDs found: {len(all_file_ids)}")
            
            if not all_file_ids:
                # Save HTML for debugging if no files found
                debug_sample = html[:5000] if len(html) > 5000 else html
                logger.error(f"No file IDs found. HTML sample: {debug_sample[:1000]}...")
                result['error'] = "No photos found in folder. Make sure it contains images and is publicly shared with 'Anyone with the link'."
                return result
            
            # Verify files are images by checking thumbnails (with rate limiting)
            verified_photos = []
            check_limit = min(len(all_file_ids), 100)  # Limit checks to avoid rate limiting
            
            for i, file_id in enumerate(list(all_file_ids)[:check_limit]):
                if i > 0 and i % 10 == 0:
                    await asyncio.sleep(0.5)  # Rate limit
                
                thumb_url = f"https://drive.google.com/thumbnail?id={file_id}&sz=w100"
                try:
                    async with session.head(thumb_url, allow_redirects=True, timeout=aiohttp.ClientTimeout(total=5)) as thumb_resp:
                        if thumb_resp.status == 200:
                            content_type = thumb_resp.headers.get('Content-Type', '')
                            if 'image' in content_type.lower():
                                photo_data = {
                                    'file_id': file_id,
                                    'name': f'Photo_{len(verified_photos)+1}.jpg',
                                    'mime_type': 'image/jpeg',
                                    'size': 0,
                                    'thumbnail_url': f"https://drive.google.com/thumbnail?id={file_id}&sz=w800",
                                    'view_url': f"https://drive.google.com/uc?export=view&id={file_id}",
                                    'width': None,
                                    'height': None,
                                    'created_time': None
                                }
                                verified_photos.append(photo_data)
                except asyncio.TimeoutError:
                    continue
                except Exception as e:
                    logger.debug(f"Error verifying file {file_id}: {e}")
                    continue
            
            logger.info(f"Verified {len(verified_photos)} images out of {check_limit} checked")
            
            # If verification found images, use those
            if verified_photos:
                result['photos'] = verified_photos
                result['success'] = True
                result['photo_count'] = len(verified_photos)
            else:
                # If verification failed (rate limiting), add all potential files
                # and let the frontend handle broken images
                logger.warning("Verification failed, adding all potential files without verification")
                for i, file_id in enumerate(all_file_ids):
                    photo_data = {
                        'file_id': file_id,
                        'name': f'Photo_{i+1}.jpg',
                        'mime_type': 'image/jpeg',
                        'size': 0,
                        'thumbnail_url': f"https://drive.google.com/thumbnail?id={file_id}&sz=w800",
                        'view_url': f"https://drive.google.com/uc?export=view&id={file_id}",
                        'width': None,
                        'height': None,
                        'created_time': None
                    }
                    result['photos'].append(photo_data)
                
                if result['photos']:
                    result['success'] = True
                    result['photo_count'] = len(result['photos'])
                else:
                    result['error'] = "No photos found in folder."
                    
    except Exception as e:
        result['error'] = f"Error accessing Google Drive folder: {str(e)}"
        logger.error(f"Google Drive scrape error: {e}", exc_info=True)
    
    return result

async def get_gdrive_photos(folder_id: str) -> dict:
    """
    Get photos from a Google Drive folder using the API.
    Falls back to HTML scraping only if API key is not configured.
    """
    # Check if API key is available
    api_key = os.environ.get('GOOGLE_DRIVE_API_KEY', '')
    
    if api_key:
        # Use the proper API method
        result = await fetch_gdrive_folder_photos(folder_id)
        if result['success']:
            return result
        
        # If API fails with auth error, don't fall back to scraping
        if 'Access denied' in str(result.get('error', '')) or 'API key' in str(result.get('error', '')):
            logger.warning(f"API access denied for folder {folder_id}: {result.get('error')}")
            return result
    
    # Fall back to HTML scraping (legacy method)
    logger.info(f"Using HTML scraping for folder {folder_id} (API key not configured or API failed)")
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
# - coordinator_hub: Coordinator Hub feature for managing suppliers

# Default feature toggles per override mode
DEFAULT_MODE_FEATURES = {
    MODE_FOUNDERS_CIRCLE: {
        "unlimited_token": True,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": True,
        "collaboration_link": True,
        "coordinator_hub": True,
        "gallery_storage_limit_gb": -1,  # -1 = unlimited per gallery
        "gallery_expiration_days": 36500  # ~100 years (never)
    },
    MODE_EARLY_PARTNER_BETA: {
        "unlimited_token": False,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": True,
        "collaboration_link": True,
        "coordinator_hub": True,
        "gallery_storage_limit_gb": 20,  # 20GB per gallery
        "gallery_expiration_days": 180  # 6 months
    },
    MODE_COMPED_PRO: {
        "unlimited_token": False,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": True,
        "collaboration_link": True,
        "coordinator_hub": True,
        "gallery_storage_limit_gb": 20,  # 20GB per gallery
        "gallery_expiration_days": 180  # 6 months
    },
    MODE_COMPED_STANDARD: {
        "unlimited_token": False,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": False,
        "collaboration_link": False,
        "coordinator_hub": False,
        "gallery_storage_limit_gb": 10,  # 10GB per gallery
        "gallery_expiration_days": 90  # 3 months
    },
    MODE_ENTERPRISE_ACCESS: {
        "unlimited_token": True,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": True,
        "collaboration_link": True,
        "coordinator_hub": True,
        "gallery_storage_limit_gb": -1,  # -1 = unlimited per gallery
        "gallery_expiration_days": 36500  # ~100 years (never)
    }
}

# Default feature toggles per payment plan
# NOTE: These can be overridden in admin panel under "Normal Payment Plans"
DEFAULT_PLAN_FEATURES = {
    PLAN_FREE: {
        "unlimited_token": False,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": True,  # Demo only (6hr gallery)
        "collaboration_link": True,  # Demo only (6hr gallery)
        "coordinator_hub": True,  # Demo only (6hr gallery)
        "storage_limit_gb": 1,  # 1GB per gallery for demo
        "gallery_expiration_days": 1  # 6 hours (demo)
    },
    PLAN_STANDARD: {
        "unlimited_token": False,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": False,
        "collaboration_link": False,
        "coordinator_hub": False,
        "storage_limit_gb": 10,  # 10GB per gallery
        "gallery_expiration_days": 90  # 3 months
    },
    PLAN_PRO: {
        "unlimited_token": False,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": True,
        "collaboration_link": True,
        "coordinator_hub": True,
        "storage_limit_gb": 15,  # 15GB per gallery
        "gallery_expiration_days": 180  # 6 months
    }
}

# Standard features (available to Standard and above)
# Note: display_mode is DISABLED for Standard, only available in Pro
STANDARD_FEATURES = ["qr_share", "online_gallery", "owner_uploads", "guest_uploads"]

# Pro features (available to Pro only)
PRO_FEATURES = ["display_mode", "contributor_link", "coordinator_hub", "supplier_sections", "supplier_attribution", "photographer_moderation"]

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

# NOTE: sync_task_running is now managed in /app/backend/tasks/background.py

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

# NOTE: auto_sync_drive_task has been moved to /app/backend/tasks/background.py

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
        await db.photos.create_index([("gallery_id", 1), ("content_hash", 1)])  # For hash-based duplicate detection
        
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
    
    # Initialize background tasks module with dependencies
    init_tasks(
        db=db,
        storage=storage,
        logger=logger,
        scrape_fotoshare_videos=scrape_fotoshare_videos,
        fetch_pcloud_folder=fetch_pcloud_folder,
        get_gdrive_photos=get_gdrive_photos,
        get_drive_service_for_user=get_drive_service_for_user,
        UPLOAD_DIR=UPLOAD_DIR,
        DRIVE_SYNC_INTERVAL=DRIVE_SYNC_INTERVAL
    )
    
    # Start background tasks (imported from tasks module)
    asyncio.create_task(auto_sync_drive_backup_task())
    asyncio.create_task(auto_delete_expired_galleries())
    asyncio.create_task(auto_refresh_fotoshare_sections())
    asyncio.create_task(auto_sync_gdrive_sections())
    asyncio.create_task(auto_sync_pcloud_sections())
    asyncio.create_task(check_expiring_subscriptions())
    
    yield
    
    # Stop all background tasks
    stop_tasks()

app = FastAPI(lifespan=lifespan)
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# Root-level health check for Kubernetes liveness/readiness probes
@app.get("/health")
async def health_check():
    """Health check endpoint for Kubernetes probes"""
    return {"status": "healthy", "service": "photoshare-backend"}

# ============================================
# OPEN GRAPH META TAGS FOR SOCIAL SHARING
# ============================================
@app.get("/og/gallery/{share_link}", response_class=HTMLResponse)
@app.get("/og/g/{share_link}", response_class=HTMLResponse)
async def get_gallery_og_tags(share_link: str, request: Request):
    """
    Serve HTML with Open Graph meta tags for social media link previews.
    This endpoint is called by social media crawlers (Facebook, Twitter, etc.)
    """
    gallery = await db.galleries.find_one({"share_link": share_link}, {"_id": 0})
    
    if not gallery:
        # Return basic HTML if gallery not found
        return HTMLResponse(content="""
        <!DOCTYPE html>
        <html>
        <head>
            <meta property="og:title" content="Gallery Not Found" />
            <meta property="og:description" content="This gallery does not exist or has been removed." />
            <meta property="og:type" content="website" />
        </head>
        <body>Gallery not found</body>
        </html>
        """, status_code=404)
    
    # Get photographer/owner info
    photographer = await db.users.find_one({"id": gallery["photographer_id"]}, {"_id": 0})
    business_name = photographer.get("business_name") or photographer.get("name", "PhotoShare") if photographer else "PhotoShare"
    
    # Get gallery details
    title = gallery.get("event_title") or gallery.get("title", "Photo Gallery")
    cover_photo_url = gallery.get("cover_photo_url", "")
    
    # Build the canonical URL for the gallery
    # Use the request's host or default to the site
    host = request.headers.get("x-forwarded-host", request.headers.get("host", "eventsgallery.vip"))
    scheme = request.headers.get("x-forwarded-proto", "https")
    canonical_url = f"{scheme}://{host}/g/{share_link}"
    
    # If no cover photo, use a default or leave empty
    if not cover_photo_url:
        # Try to get the first photo as cover
        first_photo = await db.photos.find_one({"gallery_id": gallery["id"]}, {"_id": 0, "url": 1, "thumbnail_url": 1})
        if first_photo:
            cover_photo_url = first_photo.get("url") or first_photo.get("thumbnail_url", "")
    
    # Ensure cover photo URL is absolute
    if cover_photo_url and not cover_photo_url.startswith("http"):
        cover_photo_url = f"{scheme}://{host}{cover_photo_url}"
    
    # Build description
    description = f"Curated by {business_name}"
    
    # Photo count for additional context
    photo_count = await db.photos.count_documents({"gallery_id": gallery["id"]})
    if photo_count > 0:
        description += f" • {photo_count} photos"
    
    # Build image meta tags only if we have a cover photo
    image_meta_tags = ""
    if cover_photo_url:
        image_meta_tags = f"""
    <meta property="og:image" content="{cover_photo_url}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="twitter:image" content="{cover_photo_url}">"""
    
    # Build the HTML response with OG tags
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- Primary Meta Tags -->
    <title>{title}</title>
    <meta name="title" content="{title}">
    <meta name="description" content="{description}">
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="{canonical_url}">
    <meta property="og:title" content="{title}">
    <meta property="og:description" content="{description}">{image_meta_tags}
    <meta property="og:site_name" content="{business_name}">
    
    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="{canonical_url}">
    <meta property="twitter:title" content="{title}">
    <meta property="twitter:description" content="{description}">
    
    <!-- Redirect to actual gallery page for real users -->
    <meta http-equiv="refresh" content="0;url={canonical_url}">>
    <link rel="canonical" href="{canonical_url}">
</head>
<body>
    <p>Redirecting to <a href="{canonical_url}">{title}</a>...</p>
</body>
</html>"""
    
    return HTMLResponse(content=html_content)

# NOTE: User, UserRegister, UserLogin, UserProfile, Token, ForgotPassword, ChangePassword,
# AdminLogin, AdminToken, PhotographerAdmin, UpdateGalleryLimit, UpdateStorageQuota, 
# LandingPageConfig models moved to models/user.py

# NOTE: GalleryCreate, Gallery, GalleryUpdate, Section, Photo, PasswordVerify, BulkPhotoAction,
# PhotoReorder, BulkFlagAction, BulkUnflagAction, PublicGallery, CoverPhotoPosition,
# DuplicateCheckRequest, DuplicateCheckResponse models moved to models/gallery.py

# NOTE: Billing models (SubscriptionInfo, AssignOverrideMode, RemoveOverrideMode, UpdatePricing,
# PurchaseExtraCredits, PaymentProofSubmit, ApprovePayment, RejectPayment, PaymentMethod,
# BillingSettings, PaymentDispute, Transaction, GlobalFeatureToggles) moved to models/billing.py

# NOTE: Notification, NotificationCreate models moved to models/notification.py

# ============================================
# COLLAGE LAYOUT PRESET MODELS
# ============================================
# NOTE: CollagePreset models are now imported from models.collage
# See: /app/backend/models/collage.py

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

# ============================================
# AUTHORITY HIERARCHY HELPER FUNCTIONS
# ============================================

async def get_global_feature_toggles():
    """
    Get global feature toggles from database.
    ADMIN SETTINGS ALWAYS WIN - only returns what admin explicitly set.
    Missing features default to False/disabled for upselling control.
    """
    toggles = await db.site_config.find_one({"type": "global_feature_toggles"}, {"_id": 0})
    if not toggles:
        # No admin settings yet - use defaults as initial state
        # Admin should configure these in Feature Toggles page
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
    
    # ADMIN SETTINGS WIN: Return exactly what admin saved
    # Features not explicitly set will be missing (treated as False/disabled)
    return {
        # Override Modes - return admin's exact settings
        MODE_FOUNDERS_CIRCLE: toggles.get(MODE_FOUNDERS_CIRCLE, {}),
        MODE_EARLY_PARTNER_BETA: toggles.get(MODE_EARLY_PARTNER_BETA, {}),
        MODE_COMPED_PRO: toggles.get(MODE_COMPED_PRO, {}),
        MODE_COMPED_STANDARD: toggles.get(MODE_COMPED_STANDARD, {}),
        MODE_ENTERPRISE_ACCESS: toggles.get(MODE_ENTERPRISE_ACCESS, {}),
        # Payment Plans - return admin's exact settings
        PLAN_FREE: toggles.get(PLAN_FREE, {}),
        PLAN_STANDARD: toggles.get(PLAN_STANDARD, {}),
        PLAN_PRO: toggles.get(PLAN_PRO, {})
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
    
    # Helper to read tokens with backward compatibility (old field names: event_credits, extra_credits)
    def get_subscription_tokens(u):
        return u.get("subscription_tokens", u.get("event_credits", 0))
    
    def get_addon_tokens(u):
        return u.get("addon_tokens", u.get("extra_credits", 0))
    
    def get_addon_tokens_purchased_at(u):
        return u.get("addon_tokens_purchased_at", u.get("extra_credits_purchased_at"))
    
    # Default result
    result = {
        "authority_source": None,  # What's providing the features
        "effective_plan": plan,
        "features": {},
        "has_unlimited_credits": False,
        "credits_available": get_subscription_tokens(user) + get_addon_tokens(user),
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
                
                # Start with default mode features
                default_mode_features = DEFAULT_MODE_FEATURES.get(override_mode, {}).copy()
                
                # Get stored features from global_toggles (admin overrides)
                stored_mode_features = global_toggles.get(override_mode, {})
                
                # global_toggles now returns properly merged features (defaults + stored)
                # So stored_mode_features already includes all default features with stored overrides
                mode_features = stored_mode_features.copy()
                
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
    
    # CRITICAL: Check if subscription has expired for paid plans
    # If expired, downgrade to free plan but preserve addon_tokens
    effective_plan = plan
    subscription_expired = False
    
    if plan != PLAN_FREE:
        subscription_expires_str = user.get("subscription_expires")
        if subscription_expires_str:
            try:
                subscription_expires = datetime.fromisoformat(subscription_expires_str.replace('Z', '+00:00'))
                if datetime.now(timezone.utc) >= subscription_expires:
                    # Subscription has expired - downgrade to free
                    subscription_expired = True
                    effective_plan = PLAN_FREE
                    logger.warning(f"User subscription expired, downgrading to free: user_id={user.get('id')}")
            except (ValueError, TypeError):
                pass
        else:
            # No subscription_expires set but has a paid plan - check payment_status
            if payment_status != PAYMENT_APPROVED:
                # Not approved payment, treat as free
                effective_plan = PLAN_FREE
    
    result["effective_plan"] = effective_plan
    result["subscription_expired"] = subscription_expired
    
    # ADMIN SETTINGS ALWAYS WIN for features
    # Get features directly from admin-configured global_toggles
    # Missing features = disabled (for upselling control)
    plan_features = global_toggles.get(effective_plan, {})
    
    result["features"] = plan_features
    
    # Check unlimited credits from feature toggle (unlikely for regular plans)
    if result["features"].get("unlimited_token", False):
        result["has_unlimited_credits"] = True
        result["credits_available"] = 999
    
    # Handle credits when subscription expires:
    # - Monthly tokens (subscription_tokens) → reset to 0
    # - Extra tokens (addon_tokens) → preserved until their own expiration (12 months from purchase)
    if subscription_expired:
        # Monthly credits are lost, but extra credits remain
        subscription_tokens = 0  # Monthly tokens gone
        addon_tokens = get_addon_tokens(user)
        
        # Check if extra credits have expired (12 months from purchase)
        addon_tokens_purchased_at = get_addon_tokens_purchased_at(user)
        if addon_tokens_purchased_at and addon_tokens > 0:
            try:
                purchased_at = datetime.fromisoformat(addon_tokens_purchased_at.replace('Z', '+00:00'))
                addon_tokens_expires = purchased_at + timedelta(days=365)
                if datetime.now(timezone.utc) >= addon_tokens_expires:
                    addon_tokens = 0  # Extra credits also expired
            except (ValueError, TypeError):
                pass
        
        result["credits_available"] = addon_tokens
        result["has_unlimited_credits"] = False
    
    # STEP 3: Payment Status Check (only if billing enforcement enabled)
    if billing_enabled and effective_plan != PLAN_FREE:
        if payment_status == PAYMENT_PENDING:
            result["can_download"] = False
            result["payment_required"] = True
        elif payment_status != PAYMENT_APPROVED:
            result["payment_required"] = True
    
    return result


async def resolve_gallery_features(user: dict, gallery: dict) -> dict:
    """
    Resolve features for a specific gallery using GRANDFATHERING HIERARCHY:
    
    PRIORITY (highest to lowest):
    1. Override Mode (if active and not expired)
    2. Current Plan features (if user has upgraded since gallery creation)
    3. Grandfathered Plan features (plan gallery was created under)
    
    Key rules:
    - Admin feature toggles ALWAYS win (they define what each plan can do)
    - If user upgrades (e.g., Standard→Pro), gallery gets upgraded features
    - If user downgrades (e.g., Pro→Free), gallery retains original plan features
    - Expiration only affects NEW galleries, not existing ones
    
    Returns dict with:
    - features: dict of enabled features
    - effective_plan: str (the plan providing features)
    - grandfathered: bool (whether using grandfather plan)
    - authority_source: str ('override_mode', 'current_plan', 'grandfather')
    """
    global_toggles = await get_global_feature_toggles()
    
    # Get user info
    override_mode = user.get("override_mode")
    override_expires = user.get("override_expires")
    current_plan = user.get("plan", PLAN_FREE)
    
    # Get gallery's creation plan info
    created_under_plan = gallery.get("created_under_plan", PLAN_FREE)
    created_under_override = gallery.get("created_under_override")
    
    result = {
        "features": {},
        "effective_plan": current_plan,
        "grandfathered": False,
        "authority_source": "current_plan"
    }
    
    # STEP 1: Check Override Mode (HIGHEST PRIORITY)
    if override_mode and override_expires:
        try:
            expires_dt = datetime.fromisoformat(override_expires.replace('Z', '+00:00'))
            if datetime.now(timezone.utc) < expires_dt:
                # Override is active - use override mode features
                mode_features = global_toggles.get(override_mode, {})
                result["features"] = mode_features.copy()
                result["authority_source"] = "override_mode"
                
                # Determine effective plan from override
                if override_mode in [MODE_FOUNDERS_CIRCLE, MODE_EARLY_PARTNER_BETA, MODE_COMPED_PRO, MODE_ENTERPRISE_ACCESS]:
                    result["effective_plan"] = PLAN_PRO
                elif override_mode == MODE_COMPED_STANDARD:
                    result["effective_plan"] = PLAN_STANDARD
                
                return result
        except (ValueError, TypeError):
            pass
    
    # STEP 2: Determine which plan provides better features
    # Priority: Current Plan > Grandfather Plan (but only if current is HIGHER)
    
    # Plan hierarchy: pro > standard > free
    plan_hierarchy = {PLAN_FREE: 0, PLAN_STANDARD: 1, PLAN_PRO: 2}
    
    current_plan_level = plan_hierarchy.get(current_plan, 0)
    created_plan_level = plan_hierarchy.get(created_under_plan, 0)
    
    # If user has upgraded since gallery creation, use current (higher) plan
    # If user has downgraded, use grandfather (original) plan
    if current_plan_level >= created_plan_level:
        # Current plan is same or higher - use current plan features
        effective_plan = current_plan
        result["authority_source"] = "current_plan"
        result["grandfathered"] = False
    else:
        # Current plan is lower - use grandfathered plan features
        effective_plan = created_under_plan
        result["authority_source"] = "grandfather"
        result["grandfathered"] = True
        logger.info(f"Grandfathering gallery {gallery.get('id')}: created under {created_under_plan}, current plan {current_plan}")
    
    # Get features from admin-configured toggles for the effective plan
    plan_features = global_toggles.get(effective_plan, {})
    result["features"] = plan_features.copy()
    result["effective_plan"] = effective_plan
    
    return result


async def is_gallery_feature_enabled(user: dict, gallery: dict, feature_name: str) -> bool:
    """
    Check if a specific feature is enabled for a gallery, considering grandfathering.
    
    Args:
        user: The gallery owner's user document
        gallery: The gallery document
        feature_name: The feature to check (e.g., 'coordinator_hub', 'display_mode')
    
    Returns:
        bool: True if feature is enabled for this gallery
    """
    resolved = await resolve_gallery_features(user, gallery)
    return resolved["features"].get(feature_name, False)


async def can_create_section_in_gallery(user: dict, gallery: dict) -> tuple[bool, str]:
    """
    Check if user can create a new section in a gallery, considering grandfathering.
    
    Returns:
        tuple: (can_create: bool, reason: str)
        - If can_create is True, reason is empty
        - If can_create is False, reason explains why
    """
    # First check if subscription is active
    subscription_active = await is_subscription_active(user)
    
    if subscription_active:
        return True, ""
    
    # Subscription expired - check grandfathering
    gallery_features = await resolve_gallery_features(user, gallery)
    
    # If gallery was created under a paid plan, allow section creation (grandfathered)
    if gallery_features.get("grandfathered") and gallery_features.get("effective_plan") in [PLAN_STANDARD, PLAN_PRO]:
        logger.info(f"Allowing section creation for grandfathered gallery {gallery.get('id')} (created under {gallery.get('created_under_plan')})")
        return True, ""
    
    return False, "Your subscription has expired. Please renew to create new sections."


async def check_subscription_grace_periods(user: dict, gallery: dict = None) -> dict:
    """
    Check subscription grace periods for grandfathered galleries.
    
    When subscription expires, galleries created during that subscription get:
    - 2 months (UPLOAD_GRACE_PERIOD_DAYS): uploads still allowed
    - 6 months (VIEW_GRACE_PERIOD_DAYS): gallery still viewable
    
    Returns dict with:
    - subscription_expired: bool
    - subscription_expired_at: str (ISO date)
    - in_upload_grace_period: bool (within 2 months of expiry)
    - in_view_grace_period: bool (within 6 months of expiry)
    - uploads_allowed: bool
    - viewing_allowed: bool
    - can_create_new_contributor_links: bool
    - existing_contributor_links_work: bool
    - days_until_upload_disabled: int or None
    - days_until_view_disabled: int or None
    """
    now = datetime.now(timezone.utc)
    
    result = {
        "subscription_expired": False,
        "subscription_expired_at": None,
        "in_upload_grace_period": False,
        "in_view_grace_period": False,
        "uploads_allowed": True,
        "viewing_allowed": True,
        "can_create_new_contributor_links": True,
        "existing_contributor_links_work": True,
        "days_until_upload_disabled": None,
        "days_until_view_disabled": None
    }
    
    # Check if user has an override mode (bypasses all restrictions)
    override_mode = user.get("override_mode")
    override_expires_str = user.get("override_expires")
    if override_mode and override_expires_str:
        try:
            override_expires = datetime.fromisoformat(override_expires_str.replace('Z', '+00:00'))
            if now < override_expires:
                # Override is active - full access
                return result
        except:
            pass
    
    # Check subscription expiration
    plan = user.get("plan", PLAN_FREE)
    if plan == PLAN_FREE:
        # Free users don't have subscription expiration logic
        return result
    
    subscription_expires_str = user.get("subscription_expires")
    if not subscription_expires_str:
        return result
    
    try:
        subscription_expires = datetime.fromisoformat(subscription_expires_str.replace('Z', '+00:00'))
    except:
        return result
    
    if now < subscription_expires:
        # Subscription is still active
        return result
    
    # Subscription has expired
    result["subscription_expired"] = True
    result["subscription_expired_at"] = subscription_expires_str
    result["can_create_new_contributor_links"] = False  # Cannot create NEW contributor links
    
    # Calculate grace periods
    days_since_expiry = (now - subscription_expires).days
    
    # Upload grace period (2 months = 60 days)
    if days_since_expiry <= UPLOAD_GRACE_PERIOD_DAYS:
        result["in_upload_grace_period"] = True
        result["uploads_allowed"] = True
        result["existing_contributor_links_work"] = True
        result["days_until_upload_disabled"] = UPLOAD_GRACE_PERIOD_DAYS - days_since_expiry
    else:
        result["in_upload_grace_period"] = False
        result["uploads_allowed"] = False
        result["existing_contributor_links_work"] = False
    
    # View grace period (6 months = 180 days)
    if days_since_expiry <= VIEW_GRACE_PERIOD_DAYS:
        result["in_view_grace_period"] = True
        result["viewing_allowed"] = True
        result["days_until_view_disabled"] = VIEW_GRACE_PERIOD_DAYS - days_since_expiry
    else:
        result["in_view_grace_period"] = False
        result["viewing_allowed"] = False
    
    # If gallery is provided, check if it was created before subscription expired
    if gallery:
        gallery_created_str = gallery.get("created_at")
        if gallery_created_str:
            try:
                gallery_created = datetime.fromisoformat(gallery_created_str.replace('Z', '+00:00'))
                # Gallery must have been created before subscription expired to be grandfathered
                if gallery_created > subscription_expires:
                    # Gallery was created after subscription expired - no grace period
                    result["uploads_allowed"] = False
                    result["existing_contributor_links_work"] = False
            except:
                pass
    
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
    
    elif template_type == "admin_rsvp_token_purchase":
        subject = f"🎟️ RSVP Token Purchase - {data.get('name', 'Unknown')}"
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #7c3aed;">New RSVP Token Purchase Request</h2>
            <p>A user has submitted a purchase request for RSVP tokens:</p>
            <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #f59e0b;">
                <p><strong>Name:</strong> {data.get('name', 'N/A')}</p>
                <p><strong>Email:</strong> {data.get('email', 'N/A')}</p>
                <p><strong>Tokens Requested:</strong> {data.get('quantity', 0)}</p>
                <p><strong>Amount:</strong> ₱{data.get('amount', 0):,}</p>
                <p><strong>Submitted:</strong> {data.get('submitted_at', 'N/A')}</p>
            </div>
            <p><a href="{data.get('admin_url', '#')}" style="display: inline-block; background: #7c3aed; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Review in Admin Panel</a></p>
            <p style="color: #71717a; font-size: 12px;">Please review this purchase in the RSVP Tokens section of the admin dashboard.</p>
        </div>
        """
        return subject, html
    
    elif template_type == "customer_rsvp_token_pending":
        subject = f"⏳ RSVP Token Purchase Received"
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #7c3aed;">RSVP Token Purchase Submitted!</h2>
            <p>Hi {data.get('name', 'there')},</p>
            <p>We've received your RSVP token purchase request and it's now being reviewed.</p>
            <div style="background: #dbeafe; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #3b82f6;">
                <p><strong>Tokens:</strong> {data.get('quantity', 0)}</p>
                <p><strong>Amount:</strong> ₱{data.get('amount', 0):,}</p>
                <p><strong>Status:</strong> Pending Review</p>
            </div>
            <p>You'll receive an email once your purchase has been approved. This usually takes less than 24 hours.</p>
            <p>Once approved, your tokens will be available in your dashboard and can be used to create invitations.</p>
            <p>Thank you for choosing {brand_name}!</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="color: #71717a; font-size: 12px;">Questions? Contact us at {ADMIN_EMAIL}</p>
        </div>
        """
        return subject, html
    
    elif template_type == "customer_rsvp_token_approved":
        subject = f"✅ RSVP Tokens Added to Your Account!"
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #22c55e;">RSVP Tokens Approved! 🎉</h2>
            <p>Hi {data.get('name', 'there')},</p>
            <p>Great news! Your RSVP token purchase has been approved.</p>
            <div style="background: #dcfce7; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #22c55e;">
                <p><strong>Tokens Added:</strong> {data.get('quantity', 0)}</p>
                <p><strong>New Balance:</strong> {data.get('new_balance', 'N/A')}</p>
                <p><strong>Expires:</strong> {data.get('expires_at', '12 months from purchase')}</p>
            </div>
            <p>You can now use your tokens to create beautiful event invitations!</p>
            <p><a href="{data.get('dashboard_url', '#')}" style="display: inline-block; background: #7c3aed; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Create an Invitation</a></p>
            <p>Thank you for being part of {brand_name}!</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="color: #71717a; font-size: 12px;">Questions? Contact us at {ADMIN_EMAIL}</p>
        </div>
        """
        return subject, html
    
    elif template_type == "customer_rsvp_token_rejected":
        subject = f"❌ RSVP Token Purchase Update"
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #ef4444;">RSVP Token Purchase Not Approved</h2>
            <p>Hi {data.get('name', 'there')},</p>
            <p>Unfortunately, we were unable to approve your RSVP token purchase.</p>
            <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #ef4444;">
                <p><strong>Reason:</strong> {data.get('reason', 'Payment could not be verified')}</p>
            </div>
            <p>You can submit a new purchase request with valid payment proof from your dashboard.</p>
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
                # (subscription_tokens stores the remaining credits after deductions)
                base_credits = user.get("subscription_tokens", 0)
                addon_tokens = user.get("addon_tokens", 0)
                return max(0, base_credits + addon_tokens)
        except:
            pass
    
    # Regular plan credits
    base_credits = user.get("subscription_tokens", 0)
    addon_tokens = user.get("addon_tokens", 0)
    return max(0, base_credits + addon_tokens)

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

async def check_download_allowed(gallery: dict, is_owner: bool = False) -> dict:
    """
    Check if downloads are allowed for a gallery.
    Returns: {"allowed": bool, "reason": str or None}
    
    Downloads are blocked if:
    1. Gallery has download_locked_until_payment = True
    2. Photographer has a pending payment transaction
    """
    # Check gallery-level lock
    if gallery.get("download_locked_until_payment", False):
        return {
            "allowed": False,
            "reason": "Downloads are temporarily locked while payment is being verified. Please wait for admin approval."
        }
    
    # Check photographer's payment status
    photographer = await db.users.find_one({"id": gallery["photographer_id"]}, {"_id": 0, "payment_status": 1})
    if photographer and photographer.get("payment_status") == PAYMENT_PENDING:
        return {
            "allowed": False,
            "reason": "Downloads are temporarily locked while payment is being verified. Please wait for admin approval."
        }
    
    return {"allowed": True, "reason": None}

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
        "bank": {"enabled": False, "name": "Bank Transfer", "account_name": "", "account_number": "", "bank_name": "", "qr_code_url": None},
        "paypal": {"enabled": False, "name": "PayPal", "account_name": "", "account_number": "", "paypal_email": "", "qr_code_url": None}
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
    
    # Merge stored payment methods with defaults to include new methods
    stored_payment_methods = settings.get("payment_methods", {})
    merged_payment_methods = default_payment_methods.copy()
    for key, value in stored_payment_methods.items():
        if key in merged_payment_methods:
            merged_payment_methods[key] = value
        else:
            merged_payment_methods[key] = value
    
    return {
        "billing_enforcement_enabled": settings.get("billing_enforcement_enabled", False),
        "pricing": settings.get("pricing", DEFAULT_PRICING.copy()),
        "payment_methods": merged_payment_methods,
        "paid_gallery_expiration_months": settings.get("paid_gallery_expiration_months", 6),
        "paid_storage_limit_gb": settings.get("paid_storage_limit_gb", -1)
    }

async def get_gallery_storage_quota(user: dict) -> int:
    """
    Calculate storage quota for a NEW gallery based on user's plan/mode.
    Returns storage in bytes. -1 means unlimited.
    Used when creating galleries to set their storage_quota field.
    
    ADMIN SETTINGS ALWAYS WIN - no defaults, only what admin configured.
    """
    global_toggles = await get_global_feature_toggles()
    
    override_mode = user.get("override_mode")
    override_expires = user.get("override_expires")
    
    # Check if override mode is active and not expired
    if override_mode and override_expires:
        try:
            expires = datetime.fromisoformat(override_expires.replace('Z', '+00:00'))
            if expires > datetime.now(timezone.utc):
                mode_config = global_toggles.get(override_mode, {})
                storage_gb = mode_config.get("gallery_storage_limit_gb")
                if storage_gb is not None:
                    if storage_gb == -1:
                        return -1  # Unlimited
                    return int(storage_gb * 1024 * 1024 * 1024)
                # Admin hasn't set storage for this mode - default to unlimited per gallery
                return -1
        except:
            pass
    
    # Use plan-based storage from admin settings
    plan = user.get("plan", PLAN_FREE)
    plan_config = global_toggles.get(plan, {})
    
    storage_gb = plan_config.get("gallery_storage_limit_gb")
    if storage_gb is not None:
        if storage_gb == -1:
            return -1
        return int(storage_gb * 1024 * 1024 * 1024)
    
    # Admin hasn't set storage for this plan - default to unlimited per gallery
    return -1

async def get_effective_storage_quota(user: dict) -> int:
    """
    DEPRECATED: Account-level storage limits removed.
    Storage is now only limited per-gallery via get_gallery_storage_quota().
    
    This function now always returns -1 (unlimited) for backwards compatibility.
    Per-gallery storage limits are controlled via admin Feature Toggles.
    """
    # Account-level storage limits removed - always unlimited
    # Per-gallery storage is controlled by get_gallery_storage_quota()
    return -1

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
                           plan: str = None, addon_tokens: int = None,
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
        "addon_tokens": addon_tokens,
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
    now = datetime.now(timezone.utc)
    plan = user.get("plan", PLAN_FREE)
    payment_status = user.get("payment_status", PAYMENT_NONE)
    override_mode = user.get("override_mode")
    override_expires_str = user.get("override_expires")
    
    # Check if user has active override mode
    has_active_override = False
    if override_mode and override_expires_str:
        try:
            override_expires = datetime.fromisoformat(override_expires_str.replace('Z', '+00:00'))
            has_active_override = override_expires > now
        except:
            pass
    
    if not billing_start:
        # Initialize billing cycle for the first time
        # Only give credits if:
        # 1. User has active override mode, OR
        # 2. User has APPROVED payment status, OR
        # 3. User is on FREE plan (demo gallery, no credits needed)
        
        if has_active_override:
            # Override mode - give credits based on mode
            mode_credits = MODE_CREDITS.get(override_mode, 0)
            initial_credits = 999 if mode_credits == -1 else mode_credits
            subscription_expires = override_expires_str
        elif payment_status == PAYMENT_APPROVED:
            # Paid user with approved payment - give plan credits
            initial_credits = PLAN_CREDITS.get(plan, 0)
            subscription_expires = (now + timedelta(days=30)).isoformat()
        elif plan == PLAN_FREE:
            # Free user - no credits (uses demo gallery system)
            initial_credits = 0
            subscription_expires = None
        else:
            # Paid plan but payment not approved - no credits yet
            initial_credits = 0
            subscription_expires = None
        
        await db.users.update_one(
            {"id": user_id},
            {"$set": {
                "billing_cycle_start": now.isoformat(),
                "subscription_expires": subscription_expires,
                "subscription_tokens": initial_credits,
            }}
        )
        logger.info(f"Initialized billing cycle: user={user_id}, plan={plan}, payment={payment_status}, credits={initial_credits}")
        return
    
    try:
        start = datetime.fromisoformat(billing_start.replace('Z', '+00:00'))
        
        # Check if a month has passed (billing cycle reset)
        if now >= start + timedelta(days=30):
            plan = user.get("plan", PLAN_FREE)
            payment_status = user.get("payment_status", PAYMENT_NONE)
            
            # Only reset event credits if payment is approved (subscription active)
            if payment_status == PAYMENT_APPROVED:
                new_credits = PLAN_CREDITS.get(plan, 0)
                subscription_expires = (now + timedelta(days=30)).isoformat()
            else:
                # Subscription not active - event credits go to 0
                new_credits = 0
                subscription_expires = None
            
            # Check override mode
            override_mode = user.get("override_mode")
            override_expires_str = user.get("override_expires")
            if override_mode and override_expires_str:
                try:
                    override_expires = datetime.fromisoformat(override_expires_str.replace('Z', '+00:00'))
                    if override_expires > now:
                        new_credits = MODE_CREDITS.get(override_mode, new_credits)
                        if new_credits == -1:
                            new_credits = 999  # Unlimited
                        subscription_expires = override_expires_str
                except:
                    pass
            
            update_data = {
                "billing_cycle_start": now.isoformat(),
                "subscription_tokens": new_credits,
            }
            
            if subscription_expires:
                update_data["subscription_expires"] = subscription_expires
            
            await db.users.update_one({"id": user_id}, {"$set": update_data})
        
        # Check if extra credits have expired (12 months from purchase)
        addon_tokens_purchased = user.get("addon_tokens_purchased_at")
        if addon_tokens_purchased and user.get("addon_tokens", 0) > 0:
            try:
                purchased_at = datetime.fromisoformat(addon_tokens_purchased.replace('Z', '+00:00'))
                if now >= purchased_at + timedelta(days=365):  # 12 months
                    await db.users.update_one(
                        {"id": user_id},
                        {"$set": {"addon_tokens": 0, "addon_tokens_purchased_at": None}}
                    )
            except:
                pass
                
    except:
        pass

async def is_subscription_active(user: dict) -> bool:
    """Check if user has an active subscription"""
    # Check override mode first
    override_mode = user.get("override_mode")
    override_expires_str = user.get("override_expires")
    if override_mode and override_expires_str:
        try:
            override_expires = datetime.fromisoformat(override_expires_str.replace('Z', '+00:00'))
            if override_expires > datetime.now(timezone.utc):
                return True
        except:
            pass
    
    # Free plan users don't have an active paid subscription
    plan = user.get("plan", PLAN_FREE)
    if plan == PLAN_FREE:
        return False
    
    # Check regular subscription
    payment_status = user.get("payment_status", PAYMENT_NONE)
    if payment_status != PAYMENT_APPROVED:
        return False
    
    subscription_expires_str = user.get("subscription_expires")
    
    # If user has approved payment and paid plan but no expiration set,
    # they should be treated as active (legacy data fix)
    if not subscription_expires_str:
        # Auto-fix: Set subscription_expires for this user
        user_id = user.get("id")
        if user_id:
            new_expires = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
            await db.users.update_one(
                {"id": user_id},
                {"$set": {"subscription_expires": new_expires}}
            )
            logger.info(f"Auto-fixed subscription_expires for user {user_id}")
        return True  # Allow access while fixing
    
    try:
        subscription_expires = datetime.fromisoformat(subscription_expires_str.replace('Z', '+00:00'))
        return subscription_expires > datetime.now(timezone.utc)
    except:
        return False

async def check_gallery_access_windows(gallery: dict) -> dict:
    """
    Check access windows for a gallery based on event date.
    Returns dict with:
    - guest_upload_allowed: bool (7 days from event date)
    - collaborator_access_allowed: bool (60 days from event date)
    - days_until_guest_upload_expires: int
    - days_until_collaborator_expires: int
    """
    now = datetime.now(timezone.utc)
    event_date_str = gallery.get("event_date")
    
    result = {
        "guest_upload_allowed": True,
        "collaborator_access_allowed": True,
        "days_until_guest_upload_expires": None,
        "days_until_collaborator_expires": None
    }
    
    if not event_date_str:
        return result
    
    try:
        # Parse event date
        if 'T' in event_date_str:
            event_date = datetime.fromisoformat(event_date_str.replace('Z', '+00:00'))
        else:
            event_date = datetime.fromisoformat(event_date_str + 'T00:00:00+00:00')
        
        if event_date.tzinfo is None:
            event_date = event_date.replace(tzinfo=timezone.utc)
        
        # Guest upload window: 7 days from event date
        guest_upload_deadline = event_date + timedelta(days=7)
        if now > guest_upload_deadline:
            result["guest_upload_allowed"] = False
        else:
            result["days_until_guest_upload_expires"] = (guest_upload_deadline - now).days
        
        # Collaborator access window: 60 days from event date
        collaborator_deadline = event_date + timedelta(days=60)
        if now > collaborator_deadline:
            result["collaborator_access_allowed"] = False
        else:
            result["days_until_collaborator_expires"] = (collaborator_deadline - now).days
            
    except Exception as e:
        logger.error(f"Error checking gallery access windows: {e}")
    
    return result

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

# NOTE: /api/health endpoint moved to routes/health.py

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
        override_mode=user.get("override_mode"),  # Include override mode for Founder features
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
            subscription_tokens=user.get("subscription_tokens", 0),
            addon_tokens=user.get("addon_tokens", 0),
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
            filename = photo.get("filename", "")
            photo_id = photo.get("id", "")
            file_ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'jpg'
            
            # Delete from R2 if enabled
            if storage.r2_enabled:
                try:
                    await storage.delete_photo_with_thumbnails(photo_id, file_ext)
                except Exception as e:
                    logger.warning(f"Admin delete: Failed to delete photo {photo_id} from R2: {e}")
            
            # Delete from local filesystem
            file_path = UPLOAD_DIR / filename
            if file_path.exists():
                file_path.unlink()
            
            # Delete local thumbnails
            for size in ["small", "medium"]:
                thumb_path = THUMBNAILS_DIR / f"{photo_id}_{size}.jpg"
                if thumb_path.exists():
                    try:
                        thumb_path.unlink()
                    except:
                        pass
        
        await db.photos.delete_many({"gallery_id": gallery["id"]})
        
        # Delete cover photo if exists
        if gallery.get("cover_photo_url"):
            cover_filename = gallery["cover_photo_url"].split('/')[-1]
            
            # Delete from R2 if enabled
            if storage.r2_enabled:
                try:
                    await storage.delete_file(f"photos/{cover_filename}")
                except Exception as e:
                    logger.warning(f"Admin delete: Failed to delete cover photo from R2: {e}")
            
            # Delete from local filesystem
            cover_path = UPLOAD_DIR / cover_filename
            if cover_path.exists():
                cover_path.unlink()
        
        # Delete integration photos
        await db.gdrive_photos.delete_many({"gallery_id": gallery["id"]})
        await db.pcloud_photos.delete_many({"gallery_id": gallery["id"]})
        await db.fotoshare_videos.delete_many({"gallery_id": gallery["id"]})
        await db.gallery_videos.delete_many({"gallery_id": gallery["id"]})
    
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
    
    logger.info(f"Admin deleted photographer {user_id} with {len(galleries)} galleries")
    
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

# ============================================
# Client Management Endpoints (Comprehensive)
# ============================================

@api_router.get("/admin/clients")
async def get_all_clients(
    search: Optional[str] = None,
    plan: Optional[str] = None,
    status: Optional[str] = None,
    has_pending: Optional[bool] = None,
    override_mode: Optional[str] = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    limit: int = 100,
    admin: dict = Depends(get_admin_user)
):
    """Get all clients with comprehensive data, filters, and sorting"""
    
    # Build query
    query = {}
    
    if search:
        search_regex = {"$regex": search, "$options": "i"}
        query["$or"] = [
            {"name": search_regex},
            {"email": search_regex},
            {"business_name": search_regex}
        ]
    
    if plan:
        query["plan"] = plan
    
    if status:
        query["status"] = status
    
    if has_pending:
        query["payment_status"] = PAYMENT_PENDING
    
    if override_mode:
        if override_mode == "none":
            query["override_mode"] = None
        else:
            query["override_mode"] = override_mode
    
    # Determine sort direction
    sort_direction = -1 if sort_order == "desc" else 1
    
    # Aggregation pipeline for comprehensive data
    pipeline = [
        {"$match": query},
        {"$lookup": {
            "from": "galleries",
            "localField": "id",
            "foreignField": "photographer_id",
            "as": "user_galleries"
        }},
        {"$lookup": {
            "from": "transactions",
            "localField": "id",
            "foreignField": "user_id",
            "as": "user_transactions"
        }},
        {"$addFields": {
            "active_galleries": {"$size": "$user_galleries"},
            "total_galleries": "$galleries_created_total",
            "transaction_count": {"$size": "$user_transactions"},
            "total_revenue": {
                "$sum": {
                    "$map": {
                        "input": {
                            "$filter": {
                                "input": "$user_transactions",
                                "as": "tx",
                                "cond": {"$eq": ["$$tx.status", "approved"]}
                            }
                        },
                        "as": "approved_tx",
                        "in": "$$approved_tx.amount"
                    }
                }
            },
            "pending_transactions": {
                "$size": {
                    "$filter": {
                        "input": "$user_transactions",
                        "as": "tx",
                        "cond": {"$eq": ["$$tx.status", "pending"]}
                    }
                }
            }
        }},
        {"$project": {
            "_id": 0,
            "password": 0,
            "user_galleries": 0,
            "user_transactions": 0,
            "google_session_token": 0
        }},
        {"$sort": {sort_by: sort_direction}},
        {"$limit": limit}
    ]
    
    clients = await db.users.aggregate(pipeline).to_list(None)
    
    # Format response
    result = []
    for client in clients:
        # Determine effective status
        effective_status = client.get("status", "active")
        if client.get("payment_status") == PAYMENT_PENDING:
            effective_status = "pending_payment"
        elif client.get("override_expires"):
            try:
                expires = datetime.fromisoformat(client["override_expires"].replace("Z", "+00:00"))
                if expires < datetime.now(timezone.utc):
                    effective_status = "override_expired"
            except:
                pass
        
        # Determine effective plan (considering override)
        effective_plan = client.get("plan", PLAN_FREE)
        if client.get("override_mode"):
            override_plans = {
                "founders_circle": "pro",
                "early_partner_beta": "pro",
                "comped_pro": "pro",
                "comped_standard": "standard",
                "enterprise_access": "pro"
            }
            effective_plan = override_plans.get(client.get("override_mode"), effective_plan)
        
        result.append({
            "id": client["id"],
            "email": client["email"],
            "name": client.get("name", ""),
            "business_name": client.get("business_name", ""),
            "plan": client.get("plan", PLAN_FREE),
            "effective_plan": effective_plan,
            "override_mode": client.get("override_mode"),
            "override_expires": client.get("override_expires"),
            "status": client.get("status", "active"),
            "effective_status": effective_status,
            "payment_status": client.get("payment_status", PAYMENT_NONE),
            "subscription_tokens": client.get("subscription_tokens", 0),
            "addon_tokens": client.get("addon_tokens", 0),
            "total_credits": client.get("subscription_tokens", 0) + client.get("addon_tokens", 0),
            "storage_quota": client.get("storage_quota", DEFAULT_STORAGE_QUOTA),
            "storage_used": client.get("storage_used", 0),
            "storage_percent": round((client.get("storage_used", 0) / max(client.get("storage_quota", DEFAULT_STORAGE_QUOTA), 1)) * 100, 1),
            "active_galleries": client.get("active_galleries", 0),
            "total_galleries": client.get("total_galleries", 0),
            "transaction_count": client.get("transaction_count", 0),
            "total_revenue": client.get("total_revenue", 0),
            "pending_transactions": client.get("pending_transactions", 0),
            "billing_cycle_start": client.get("billing_cycle_start"),
            "subscription_expires": client.get("subscription_expires"),
            "created_at": client["created_at"],
            "last_login": client.get("last_login"),
            "requested_plan": client.get("requested_plan"),
            "requested_addon_tokens": client.get("requested_addon_tokens")
        })
    
    return result

@api_router.get("/admin/clients/{user_id}")
async def get_client_details(user_id: str, admin: dict = Depends(get_admin_user)):
    """Get comprehensive details for a specific client"""
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0, "google_session_token": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Get galleries summary
    galleries = await db.galleries.find(
        {"photographer_id": user_id},
        {"_id": 0, "id": 1, "title": 1, "share_link": 1, "created_at": 1, "theme": 1, "cover_photo_url": 1}
    ).sort("created_at", -1).to_list(None)
    
    # Get photo count per gallery
    gallery_summaries = []
    total_photos = 0
    for g in galleries:
        photo_count = await db.photos.count_documents({"gallery_id": g["id"]})
        total_photos += photo_count
        gallery_summaries.append({
            **g,
            "photo_count": photo_count
        })
    
    # Get transactions
    transactions = await db.transactions.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(None)
    
    # Calculate total revenue
    total_revenue = sum(tx.get("amount", 0) for tx in transactions if tx.get("status") == "approved")
    
    # Determine effective plan
    effective_plan = user.get("plan", PLAN_FREE)
    if user.get("override_mode"):
        override_plans = {
            "founders_circle": "pro",
            "early_partner_beta": "pro",
            "comped_pro": "pro",
            "comped_standard": "standard",
            "enterprise_access": "pro"
        }
        effective_plan = override_plans.get(user.get("override_mode"), effective_plan)
    
    return {
        "profile": {
            "id": user["id"],
            "email": user["email"],
            "name": user.get("name", ""),
            "business_name": user.get("business_name", ""),
            "created_at": user["created_at"],
            "last_login": user.get("last_login"),
            "status": user.get("status", "active")
        },
        "subscription": {
            "plan": user.get("plan", PLAN_FREE),
            "effective_plan": effective_plan,
            "override_mode": user.get("override_mode"),
            "override_expires": user.get("override_expires"),
            "override_reason": user.get("override_reason"),
            "billing_cycle_start": user.get("billing_cycle_start"),
            "subscription_expires": user.get("subscription_expires"),
            "subscription_tokens": user.get("subscription_tokens", 0),
            "addon_tokens": user.get("addon_tokens", 0),
            "addon_tokens_purchased_at": user.get("addon_tokens_purchased_at"),
            "addon_tokens_expires_at": user.get("addon_tokens_expires_at"),
            "payment_status": user.get("payment_status", PAYMENT_NONE),
            "requested_plan": user.get("requested_plan"),
            "requested_addon_tokens": user.get("requested_addon_tokens")
        },
        "storage": {
            "quota": user.get("storage_quota", DEFAULT_STORAGE_QUOTA),
            "used": user.get("storage_used", 0),
            "percent": round((user.get("storage_used", 0) / max(user.get("storage_quota", DEFAULT_STORAGE_QUOTA), 1)) * 100, 1)
        },
        "galleries": {
            "active": len(galleries),
            "total": user.get("galleries_created_total", 0),
            "max_allowed": user.get("max_galleries", DEFAULT_MAX_GALLERIES),
            "total_photos": total_photos,
            "recent": gallery_summaries[:5]  # Last 5 galleries
        },
        "billing": {
            "total_revenue": total_revenue,
            "transaction_count": len(transactions),
            "pending_count": sum(1 for tx in transactions if tx.get("status") == "pending"),
            "recent_transactions": transactions[:10]  # Last 10 transactions
        },
        "feature_toggles": user.get("feature_toggles", {})
    }

@api_router.post("/admin/clients/{user_id}/add-credits")
async def add_client_credits(user_id: str, data: dict, admin: dict = Depends(get_admin_user)):
    """Add bonus credits to a client account"""
    
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Client not found")
    
    credits_to_add = data.get("credits", 1)
    credit_type = data.get("type", "event")  # "event" or "extra"
    reason = data.get("reason", "Admin bonus")
    
    if credits_to_add < 1 or credits_to_add > 100:
        raise HTTPException(status_code=400, detail="Credits must be between 1 and 100")
    
    update_field = "subscription_tokens" if credit_type == "event" else "addon_tokens"
    current_credits = user.get(update_field, 0)
    
    update_data = {
        update_field: current_credits + credits_to_add
    }
    
    # If adding extra credits, set expiration
    if credit_type == "extra":
        update_data["addon_tokens_purchased_at"] = datetime.now(timezone.utc).isoformat()
        update_data["addon_tokens_expires_at"] = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
    
    await db.users.update_one({"id": user_id}, {"$set": update_data})
    
    # Create transaction record
    await create_transaction(
        user_id=user_id,
        tx_type="admin_bonus",
        amount=0,
        status="approved",
        addon_tokens=credits_to_add if credit_type == "extra" else None,
        admin_notes=f"Admin added {credits_to_add} {credit_type} credit(s): {reason}",
        resolved_at=datetime.now(timezone.utc).isoformat()
    )
    
    # Log activity
    await db.activity_logs.insert_one({
        "action": "add_credits",
        "admin": admin.get("username", "admin"),
        "target_user": user_id,
        "details": f"Added {credits_to_add} {credit_type} credit(s) to {user.get('email')}: {reason}",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "message": f"Added {credits_to_add} {credit_type} credit(s)",
        "new_total": current_credits + credits_to_add
    }

@api_router.post("/admin/clients/{user_id}/cleanup-transactions")
async def cleanup_duplicate_transactions(user_id: str, admin: dict = Depends(get_admin_user)):
    """
    Clean up duplicate pending transactions that were not properly updated when approved.
    This removes pending transactions that have a matching approved transaction.
    """
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get all transactions for this user
    transactions = await db.transactions.find({"user_id": user_id}).to_list(None)
    
    # Group by type and amount to find duplicates
    approved_txs = {}
    pending_to_remove = []
    
    for tx in transactions:
        key = (tx.get("type"), tx.get("amount"))
        if tx.get("status") == "approved":
            if key not in approved_txs:
                approved_txs[key] = []
            approved_txs[key].append(tx)
    
    # Find pending transactions that have a matching approved one
    for tx in transactions:
        if tx.get("status") == "pending":
            key = (tx.get("type"), tx.get("amount"))
            if key in approved_txs and len(approved_txs[key]) > 0:
                pending_to_remove.append(tx["id"])
                approved_txs[key].pop(0)  # Remove one approved to match
    
    # Delete the duplicate pending transactions
    if pending_to_remove:
        result = await db.transactions.delete_many({"id": {"$in": pending_to_remove}})
        return {
            "message": f"Cleaned up {result.deleted_count} duplicate pending transactions",
            "removed_count": result.deleted_count,
            "removed_ids": pending_to_remove
        }
    
    return {
        "message": "No duplicate transactions found",
        "removed_count": 0
    }

@api_router.post("/admin/clients/{user_id}/fix-billing")
async def fix_client_billing(user_id: str, data: dict, admin: dict = Depends(get_admin_user)):
    """Fix corrupted billing state for a client (e.g., negative credits, missing billing cycle)"""
    
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Client not found")
    
    action = data.get("action", "reset")  # "reset" or "set"
    
    # Get current state
    plan = user.get("plan", PLAN_FREE)
    payment_status = user.get("payment_status", PAYMENT_NONE)
    override_mode = user.get("override_mode")
    current_tokens = user.get("subscription_tokens", 0)
    active_galleries = await db.galleries.count_documents({"photographer_id": user_id})
    
    now = datetime.now(timezone.utc)
    update_data = {}
    
    if action == "reset":
        # Calculate correct token count based on plan and active galleries
        if override_mode:
            mode_credits = MODE_CREDITS.get(override_mode, 0)
            base_credits = 999 if mode_credits == -1 else mode_credits
        elif payment_status == PAYMENT_APPROVED:
            base_credits = PLAN_CREDITS.get(plan, 0)
        else:
            base_credits = 0
        
        # Set credits to base minus active galleries (minimum 0)
        correct_tokens = max(0, base_credits - active_galleries)
        
        update_data = {
            "subscription_tokens": data.get("credits", correct_tokens),
            "billing_cycle_start": now.isoformat(),
            "subscription_expires": (now + timedelta(days=30)).isoformat() if payment_status == PAYMENT_APPROVED else None,
            "galleries_created_total": active_galleries  # Reset to match active count
        }
    elif action == "set":
        # Set specific values
        if "credits" in data:
            update_data["subscription_tokens"] = max(0, data["credits"])
        if "addon_tokens" in data:
            update_data["addon_tokens"] = max(0, data["addon_tokens"])
        if "billing_cycle_start" in data:
            update_data["billing_cycle_start"] = data["billing_cycle_start"]
        if "subscription_expires" in data:
            update_data["subscription_expires"] = data["subscription_expires"]
    
    if update_data:
        await db.users.update_one({"id": user_id}, {"$set": update_data})
    
    # Log the fix
    await db.activity_logs.insert_one({
        "action": "fix_billing",
        "admin": admin.get("username", "admin"),
        "target_user": user_id,
        "details": f"Fixed billing for {user.get('email')}: {action}, changes: {update_data}",
        "previous_state": {
            "subscription_tokens": current_tokens,
            "plan": plan,
            "payment_status": payment_status
        },
        "timestamp": now.isoformat()
    })
    
    # Get updated user
    updated_user = await db.users.find_one({"id": user_id}, {"_id": 0})
    
    return {
        "message": f"Billing fixed for {user.get('email')}",
        "previous_tokens": current_tokens,
        "new_tokens": updated_user.get("subscription_tokens"),
        "active_galleries": active_galleries,
        "changes": update_data
    }

@api_router.post("/admin/clients/{user_id}/extend-subscription")
async def extend_client_subscription(user_id: str, data: dict, admin: dict = Depends(get_admin_user)):
    """Extend a client's subscription"""
    
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Client not found")
    
    months = data.get("months", 1)
    reason = data.get("reason", "Admin extension")
    
    if months < 1 or months > 24:
        raise HTTPException(status_code=400, detail="Extension must be between 1 and 24 months")
    
    # Get current expiration or use now
    current_expires = user.get("subscription_expires")
    if current_expires:
        try:
            base_date = datetime.fromisoformat(current_expires.replace("Z", "+00:00"))
            if base_date < datetime.now(timezone.utc):
                base_date = datetime.now(timezone.utc)
        except:
            base_date = datetime.now(timezone.utc)
    else:
        base_date = datetime.now(timezone.utc)
    
    new_expires = (base_date + timedelta(days=30 * months)).isoformat()
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"subscription_expires": new_expires}}
    )
    
    # Log activity
    await db.activity_logs.insert_one({
        "action": "extend_subscription",
        "admin": admin.get("username", "admin"),
        "target_user": user_id,
        "details": f"Extended subscription by {months} month(s) for {user.get('email')}: {reason}",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "message": f"Subscription extended by {months} month(s)",
        "new_expiration": new_expires
    }

@api_router.post("/admin/clients/{user_id}/change-plan")
async def change_client_plan(user_id: str, data: dict, admin: dict = Depends(get_admin_user)):
    """Change a client's subscription plan"""
    
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Client not found")
    
    new_plan = data.get("plan")
    reason = data.get("reason", "Admin change")
    
    if new_plan not in [PLAN_FREE, PLAN_STANDARD, PLAN_PRO]:
        raise HTTPException(status_code=400, detail="Invalid plan")
    
    old_plan = user.get("plan", PLAN_FREE)
    
    update_data = {
        "plan": new_plan,
        "subscription_tokens": PLAN_CREDITS.get(new_plan, 0),
        "billing_cycle_start": datetime.now(timezone.utc).isoformat()
    }
    
    # Set subscription expiration for paid plans
    if new_plan != PLAN_FREE:
        update_data["subscription_expires"] = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    
    await db.users.update_one({"id": user_id}, {"$set": update_data})
    
    # Log activity
    await db.activity_logs.insert_one({
        "action": "change_plan",
        "admin": admin.get("username", "admin"),
        "target_user": user_id,
        "details": f"Changed plan from {old_plan} to {new_plan} for {user.get('email')}: {reason}",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "message": f"Plan changed from {old_plan} to {new_plan}",
        "new_credits": PLAN_CREDITS.get(new_plan, 0)
    }

@api_router.post("/admin/clients/{user_id}/reset-password")
async def reset_client_password(user_id: str, data: dict, admin: dict = Depends(get_admin_user)):
    """Reset a client's password"""
    
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Client not found")
    
    new_password = data.get("new_password")
    if not new_password or len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    
    hashed_password = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt())
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"password": hashed_password.decode('utf-8')}}
    )
    
    # Log activity
    await db.activity_logs.insert_one({
        "action": "reset_password",
        "admin": admin.get("username", "admin"),
        "target_user": user_id,
        "details": f"Reset password for {user.get('email')}",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "Password reset successfully"}

@api_router.get("/admin/clients/stats")
async def get_client_stats(admin: dict = Depends(get_admin_user)):
    """Get overall client statistics"""
    
    total_clients = await db.users.count_documents({})
    active_clients = await db.users.count_documents({"status": "active"})
    suspended_clients = await db.users.count_documents({"status": "suspended"})
    
    # Plan distribution
    free_count = await db.users.count_documents({"plan": PLAN_FREE})
    standard_count = await db.users.count_documents({"plan": PLAN_STANDARD})
    pro_count = await db.users.count_documents({"plan": PLAN_PRO})
    
    # Override counts
    override_counts = {}
    for mode in ["founders_circle", "early_partner_beta", "comped_pro", "comped_standard", "enterprise_access"]:
        count = await db.users.count_documents({"override_mode": mode})
        if count > 0:
            override_counts[mode] = count
    
    # Pending payments
    pending_payments = await db.users.count_documents({"payment_status": PAYMENT_PENDING})
    
    # Revenue stats
    pipeline = [
        {"$match": {"status": "approved"}},
        {"$group": {
            "_id": None,
            "total_revenue": {"$sum": "$amount"},
            "total_transactions": {"$sum": 1}
        }}
    ]
    revenue_result = await db.transactions.aggregate(pipeline).to_list(1)
    total_revenue = revenue_result[0]["total_revenue"] if revenue_result else 0
    total_transactions = revenue_result[0]["total_transactions"] if revenue_result else 0
    
    return {
        "total_clients": total_clients,
        "active_clients": active_clients,
        "suspended_clients": suspended_clients,
        "plan_distribution": {
            "free": free_count,
            "standard": standard_count,
            "pro": pro_count
        },
        "override_counts": override_counts,
        "pending_payments": pending_payments,
        "total_revenue": total_revenue,
        "total_transactions": total_transactions
    }

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
    allow_guest_upload_never_expires: bool = False  # If true, show "Never expires" option for guest uploads

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
            "auto_delete_enabled": True,
            "allow_guest_upload_never_expires": False
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
            "auto_delete_enabled": True,
            "allow_guest_upload_never_expires": False
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
    
    ADMIN SETTINGS ALWAYS WIN - shows exactly what admin configured.
    Empty features = nothing configured yet (admin should set them).
    """
    toggles = await get_global_feature_toggles()
    return {
        "override_modes": {
            MODE_FOUNDERS_CIRCLE: {
                "label": "Founders Circle",
                "features": toggles.get(MODE_FOUNDERS_CIRCLE, {})
            },
            MODE_EARLY_PARTNER_BETA: {
                "label": "Early Partner Beta",
                "features": toggles.get(MODE_EARLY_PARTNER_BETA, {})
            },
            MODE_COMPED_PRO: {
                "label": "Comped Pro",
                "features": toggles.get(MODE_COMPED_PRO, {})
            },
            MODE_COMPED_STANDARD: {
                "label": "Comped Standard",
                "features": toggles.get(MODE_COMPED_STANDARD, {})
            },
            MODE_ENTERPRISE_ACCESS: {
                "label": "Enterprise Access",
                "features": toggles.get(MODE_ENTERPRISE_ACCESS, {})
            }
        },
        "payment_plans": {
            PLAN_FREE: {
                "label": "Free",
                "features": toggles.get(PLAN_FREE, {})
            },
            PLAN_STANDARD: {
                "label": "Standard",
                "features": toggles.get(PLAN_STANDARD, {})
            },
            PLAN_PRO: {
                "label": "Pro",
                "features": toggles.get(PLAN_PRO, {})
            }
        },
        "feature_definitions": {
            "unlimited_token": "Unlimited event credits (no limit on galleries)",
            "copy_share_link": "Copy shareable gallery link",
            "qr_code": "Generate QR code for gallery",
            "view_public_gallery": "Allow public gallery viewing",
            "display_mode": "Slideshow/Collage display modes",
            "collaboration_link": "Contributor upload links",
            "coordinator_hub": "Coordinator Hub for managing suppliers",
            "gallery_storage_limit_gb": "Storage limit per gallery in GB (-1 = unlimited)",
            "gallery_expiration_days": "Days until gallery auto-deletes"
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
    valid_features = ["unlimited_token", "copy_share_link", "qr_code", "view_public_gallery", "display_mode", "collaboration_link", "coordinator_hub"]
    if mode_or_plan in ALL_OVERRIDE_MODES or mode_or_plan in [PLAN_STANDARD, PLAN_PRO]:
        valid_features.extend(["gallery_storage_limit_gb", "gallery_expiration_days"])
    
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
# Gallery Storage Migration Endpoint
# ============================================

@api_router.post("/admin/migrate/gallery-storage")
async def migrate_gallery_storage(admin: dict = Depends(get_admin_user)):
    """
    Migration endpoint to calculate and set storage_used and storage_quota for all existing galleries.
    This should be run once after deploying the per-gallery storage feature.
    """
    galleries_updated = 0
    galleries_failed = 0
    total_storage_calculated = 0
    
    # Get all galleries
    async for gallery in db.galleries.find({}, {"_id": 0, "id": 1, "photographer_id": 1, "storage_used": 1, "storage_quota": 1}):
        try:
            gallery_id = gallery["id"]
            
            # Calculate total storage used by this gallery's photos
            pipeline = [
                {"$match": {"gallery_id": gallery_id}},
                {"$group": {
                    "_id": None,
                    "total_size": {"$sum": "$file_size"}
                }}
            ]
            result = await db.photos.aggregate(pipeline).to_list(1)
            storage_used = result[0]["total_size"] if result else 0
            
            # Get photographer to determine storage quota
            photographer = await db.users.find_one({"id": gallery["photographer_id"]}, {"_id": 0})
            if photographer:
                storage_quota = await get_gallery_storage_quota(photographer)
            else:
                storage_quota = 10 * 1024 * 1024 * 1024  # Default 10GB
            
            # Update gallery with calculated storage
            await db.galleries.update_one(
                {"id": gallery_id},
                {"$set": {
                    "storage_used": storage_used,
                    "storage_quota": storage_quota
                }}
            )
            
            galleries_updated += 1
            total_storage_calculated += storage_used
            
        except Exception as e:
            logger.error(f"Failed to migrate gallery {gallery.get('id')}: {e}")
            galleries_failed += 1
    
    return {
        "message": "Gallery storage migration completed",
        "galleries_updated": galleries_updated,
        "galleries_failed": galleries_failed,
        "total_storage_calculated_gb": round(total_storage_calculated / (1024 * 1024 * 1024), 2)
    }

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
    file_ext = file.filename.split('.')[-1].lower() if '.' in file.filename else 'jpg'
    filename = f"landing_{image_slot}_{uuid.uuid4().hex[:8]}.{file_ext}"
    
    # Read file content
    file_content = await file.read()
    
    # Use R2 storage if enabled
    if storage.r2_enabled:
        r2_key = f"photos/{filename}"
        success, url_or_error = await storage.upload_file(r2_key, file_content, file.content_type or 'image/jpeg')
        if not success:
            logger.error(f"R2 upload failed for landing image {filename}: {url_or_error}")
            raise HTTPException(status_code=500, detail="Failed to save image. Please try again.")
        image_url = url_or_error
    else:
        # Fallback to local filesystem
        file_path = UPLOAD_DIR / filename
        with open(file_path, 'wb') as f:
            f.write(file_content)
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
    
    # Read file content
    file_content = await file.read()
    
    # Use R2 storage if enabled
    if storage.r2_enabled:
        r2_key = f"photos/{filename}"
        success, url_or_error = await storage.upload_file(r2_key, file_content, file.content_type or 'image/png')
        if not success:
            logger.error(f"R2 upload failed for favicon {filename}: {url_or_error}")
            raise HTTPException(status_code=500, detail="Failed to save favicon. Please try again.")
        favicon_url = url_or_error
    else:
        # Fallback to local filesystem
        file_path = UPLOAD_DIR / filename
        with open(file_path, 'wb') as f:
            f.write(file_content)
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
        # Check if this is an EXPIRED paid user (had subscription before)
        # Expired users should NOT get demo galleries - they must resubscribe
        subscription_expires_str = user.get("subscription_expires")
        user_plan_in_db = user.get("plan", PLAN_FREE)
        
        if subscription_expires_str and user_plan_in_db in [PLAN_STANDARD, PLAN_PRO]:
            # User had a paid subscription that expired - block demo creation
            raise HTTPException(
                status_code=403,
                detail="Your subscription has expired. Please resubscribe to Standard or Pro to create new galleries. Your existing galleries are still accessible during the grace period."
            )
        
        # Fresh FREE users get 1 demo gallery total
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
            # Priority: addon_tokens first (they expire), then subscription_tokens
            # Backward compatibility: also check old field names (extra_credits, event_credits)
            addon_tokens = user.get("addon_tokens", user.get("extra_credits", 0))
            subscription_tokens = user.get("subscription_tokens", user.get("event_credits", 0))
            
            if addon_tokens > 0:
                # Use addon token first (they expire in 12 months)
                # Update both old and new field names for compatibility
                await db.users.update_one(
                    {"id": current_user["id"]},
                    {"$inc": {"addon_tokens": -1, "extra_credits": -1}}
                )
                logger.info(f"Deducted 1 addon_token for gallery creation: user={current_user['id']}, remaining={addon_tokens - 1}")
            elif subscription_tokens > 0:
                # Use subscription token only if available (prevent negative)
                await db.users.update_one(
                    {"id": current_user["id"]},
                    {"$inc": {"subscription_tokens": -1, "event_credits": -1}}
                )
                logger.info(f"Deducted 1 subscription_token for gallery creation: user={current_user['id']}, remaining={subscription_tokens - 1}")
            else:
                # This shouldn't happen - credits_available check should have caught this
                # But as a safety net, don't deduct and log a warning
                logger.warning(f"Attempted to deduct credit with 0 tokens: user={current_user['id']}, addon={addon_tokens}, sub={subscription_tokens}")
                raise HTTPException(
                    status_code=403,
                    detail="No event credits remaining. Purchase extra credits or wait for next billing cycle."
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
    
    # Get per-gallery storage quota based on user's plan/mode
    gallery_storage_quota = await get_gallery_storage_quota(user)
    
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
        "view_count": 0,
        # Per-gallery storage tracking
        "storage_used": 0,
        "storage_quota": gallery_storage_quota,  # -1 = unlimited
        # GRANDFATHERING: Store the plan this gallery was created under
        # This ensures galleries retain their features even if user downgrades
        "created_under_plan": effective_plan,
        "created_under_override": override_mode if override_mode else None
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
    
    # Prepare demo warning message
    demo_warning = None
    if is_demo:
        demo_warning = f"⚠️ This is a DEMO gallery. It will expire in 2 hours and all content will be permanently deleted. Upgrading to a paid plan will NOT extend this demo gallery. Create a new gallery after upgrading to keep your photos permanently."
    
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
        created_at=datetime_to_str(gallery_doc["created_at"]),
        photo_count=0,
        auto_delete_date=gallery_doc["auto_delete_date"],
        days_until_deletion=days_until_deletion,
        is_edit_locked=False,
        days_until_edit_lock=GALLERY_EDIT_LOCK_DAYS,
        download_locked_until_payment=download_locked_until_payment,
        is_demo=is_demo,
        demo_warning=demo_warning,
        demo_expires_at=demo_features_expire
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
        
        # Calculate storage percentage
        storage_used = g.get("storage_used", 0)
        storage_quota = g.get("storage_quota", -1)
        storage_percent = 0.0
        if storage_quota > 0:
            storage_percent = round((storage_used / storage_quota) * 100, 1)
        
        result.append(Gallery(
            id=g["id"],
            photographer_id=g["photographer_id"],
            title=g["title"],
            description=g.get("description"),
            has_password=g.get("password") is not None,
            share_link=g["share_link"],
            cover_photo_url=g.get("cover_photo_url"),
            event_title=g.get("event_title"),
            event_date=datetime_to_str(g.get("event_date")),
            share_link_expiration_date=datetime_to_str(g.get("share_link_expiration_date")),
            guest_upload_expiration_date=datetime_to_str(g.get("guest_upload_expiration_date")),
            guest_upload_enabled=True,
            has_download_all_password=g.get("download_all_password") is not None,
            theme=g.get("theme", "classic"),
            display_mode=g.get("display_mode", "slideshow"),
            display_transition=g.get("display_transition", "crossfade"),
            display_interval=g.get("display_interval", 6),
            collage_preset_id=g.get("collage_preset_id"),
            created_at=datetime_to_str(g["created_at"]),
            photo_count=g.get("photo_count", 0),
            auto_delete_date=datetime_to_str(auto_delete_date),
            days_until_deletion=days_until_deletion,
            is_edit_locked=edit_info["is_locked"],
            days_until_edit_lock=edit_info["days_until_lock"],
            storage_used=storage_used,
            storage_quota=storage_quota,
            storage_percent=storage_percent
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
    
    # Calculate storage percentage
    storage_used = gallery.get("storage_used", 0)
    storage_quota = gallery.get("storage_quota", -1)
    storage_percent = 0.0
    if storage_quota > 0:
        storage_percent = round((storage_used / storage_quota) * 100, 1)
    
    # Prepare demo warning if this is a demo gallery
    is_demo = gallery.get("is_demo", False)
    demo_warning = None
    demo_expires_at = gallery.get("demo_features_expire")
    
    if is_demo:
        demo_warning = "⚠️ This is a DEMO gallery. It will expire soon and all content will be permanently deleted. Upgrading to a paid plan will NOT extend this demo gallery."
    
    return Gallery(
        id=gallery["id"],
        photographer_id=gallery["photographer_id"],
        title=gallery["title"],
        description=gallery.get("description"),
        has_password=gallery.get("password") is not None,
        share_link=gallery["share_link"],
        cover_photo_url=gallery.get("cover_photo_url"),
        cover_photo_medium_url=gallery.get("cover_photo_medium_url"),
        cover_photo_thumb_url=gallery.get("cover_photo_thumb_url"),
        event_title=gallery.get("event_title"),
        event_date=datetime_to_str(gallery.get("event_date")),
        coordinator_name=gallery.get("coordinator_name"),
        coordinator_hub_link=gallery.get("coordinator_hub_link"),
        share_link_expiration_date=datetime_to_str(gallery.get("share_link_expiration_date")),
        share_link_expiration_days=gallery.get("share_link_expiration_days"),
        guest_upload_expiration_date=datetime_to_str(gallery.get("guest_upload_expiration_date")),
        guest_upload_enabled_days=gallery.get("guest_upload_enabled_days"),
        guest_upload_enabled=True,
        has_download_all_password=gallery.get("download_all_password") is not None,
        theme=gallery.get("theme", "classic"),
        display_mode=gallery.get("display_mode", "slideshow"),
        display_transition=gallery.get("display_transition", "crossfade"),
        display_interval=gallery.get("display_interval", 6),
        collage_preset_id=gallery.get("collage_preset_id"),
        lite_mode_enabled=gallery.get("lite_mode_enabled", False),
        created_at=datetime_to_str(gallery["created_at"]),
        photo_count=photo_count,
        auto_delete_date=datetime_to_str(auto_delete_date),
        days_until_deletion=days_until_deletion,
        is_edit_locked=edit_info["is_locked"],
        days_until_edit_lock=edit_info["days_until_lock"],
        download_locked_until_payment=gallery.get("download_locked_until_payment", False),
        is_demo=is_demo,
        demo_warning=demo_warning,
        demo_expires_at=demo_expires_at,
        storage_used=storage_used,
        storage_quota=storage_quota,
        storage_percent=storage_percent
    )


@api_router.get("/galleries/{gallery_id}/features")
async def get_gallery_features(gallery_id: str, current_user: dict = Depends(get_current_user)):
    """
    Get features available for a specific gallery, considering grandfathering.
    
    This is used by the frontend to check which features are available for a gallery
    when the user's current plan might be different from the plan the gallery was created under.
    """
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Get full user data
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Resolve gallery-specific features with grandfathering
    resolved = await resolve_gallery_features(user, gallery)
    
    return {
        "gallery_id": gallery_id,
        "features": resolved["features"],
        "effective_plan": resolved["effective_plan"],
        "grandfathered": resolved["grandfathered"],
        "authority_source": resolved["authority_source"],
        "created_under_plan": gallery.get("created_under_plan"),
        "created_under_override": gallery.get("created_under_override")
    }


@api_router.put("/galleries/{gallery_id}", response_model=Gallery)
async def update_gallery(gallery_id: str, updates: GalleryUpdate, current_user: dict = Depends(get_current_user)):
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Get full user data to check override_mode (not in JWT token)
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    is_founder = user.get("override_mode") == MODE_FOUNDERS_CIRCLE if user else False
    
    # Check if gallery is edit-locked (7 days after creation) - Founders are exempt
    edit_lock_info = get_edit_lock_info(gallery["created_at"])
    locked_fields = ["title", "description", "event_title", "event_date", "theme"]
    
    if edit_lock_info["is_locked"] and not is_founder:
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
    # Handle password - can be set or removed
    if updates.remove_password:
        update_data["password"] = None  # Remove password
    elif updates.password is not None:
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
        # If 0, guest uploads never expire (set expiration to None)
        if updates.guest_upload_enabled_days == 0:
            update_data["guest_upload_expiration_date"] = None
        elif gallery.get("event_date"):
            try:
                event_dt = datetime.fromisoformat(gallery["event_date"].replace('Z', '+00:00'))
                update_data["guest_upload_expiration_date"] = (event_dt + timedelta(days=updates.guest_upload_enabled_days)).isoformat()
            except:
                pass
    # Handle download password - can be set or removed
    if updates.remove_download_password:
        update_data["download_all_password"] = None  # Remove download password
    elif updates.download_all_password is not None:
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
    
    # Lite mode setting
    if updates.lite_mode_enabled is not None:
        update_data["lite_mode_enabled"] = updates.lite_mode_enabled
    
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
        event_date=datetime_to_str(updated_gallery.get("event_date")),
        coordinator_name=updated_gallery.get("coordinator_name"),
        share_link_expiration_date=datetime_to_str(updated_gallery.get("share_link_expiration_date")),
        share_link_expiration_days=updated_gallery.get("share_link_expiration_days"),
        guest_upload_expiration_date=datetime_to_str(updated_gallery.get("guest_upload_expiration_date")),
        guest_upload_enabled_days=updated_gallery.get("guest_upload_enabled_days"),
        guest_upload_enabled=True,
        has_download_all_password=updated_gallery.get("download_all_password") is not None,
        theme=updated_gallery.get("theme", "classic"),
        display_mode=updated_gallery.get("display_mode", "slideshow"),
        display_transition=updated_gallery.get("display_transition", "crossfade"),
        display_interval=updated_gallery.get("display_interval", 6),
        collage_preset_id=updated_gallery.get("collage_preset_id"),
        created_at=datetime_to_str(updated_gallery["created_at"]),
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
        filename = photo.get("filename", "")
        photo_id = photo.get("id", "")
        file_ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'jpg'
        
        # Delete from R2 if enabled
        if storage.r2_enabled:
            try:
                await storage.delete_photo_with_thumbnails(photo_id, file_ext)
                logger.info(f"Deleted photo from R2: {photo_id}")
            except Exception as e:
                logger.warning(f"Failed to delete photo {photo_id} from R2: {e}")
        
        # Also delete from local filesystem (for migration/fallback)
        file_path = UPLOAD_DIR / filename
        if file_path.exists():
            total_storage_freed += file_path.stat().st_size
            file_path.unlink()
        
        # Delete local thumbnails
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
        
        # Delete from R2 if enabled
        if storage.r2_enabled:
            try:
                cover_key = f"photos/{cover_filename}"
                await storage.delete_file(cover_key)
                logger.info(f"Deleted cover photo from R2: {cover_filename}")
            except Exception as e:
                logger.warning(f"Failed to delete cover photo from R2: {e}")
        
        # Delete from local filesystem
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
    await db.gdrive_photos.delete_many({"gallery_id": gallery_id})
    await db.pcloud_photos.delete_many({"gallery_id": gallery_id})
    await db.drive_backups.delete_many({"gallery_id": gallery_id})
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
    
    # Delete old cover photo and thumbnails if exists
    if gallery.get("cover_photo_url"):
        old_filename = gallery["cover_photo_url"].split('/')[-1]
        old_photo_id = old_filename.replace('cover_', '').rsplit('.', 1)[0]
        if storage.r2_enabled:
            # Delete original and thumbnails
            await storage.delete_file(f"photos/{old_filename}")
            await storage.delete_file(f"thumbnails/{old_photo_id}_thumb.jpg")
            await storage.delete_file(f"thumbnails/{old_photo_id}_medium.jpg")
        else:
            old_file_path = UPLOAD_DIR / old_filename
            if old_file_path.exists():
                old_file_path.unlink()
    
    photo_id = str(uuid.uuid4())
    file_ext = file.filename.split('.')[-1].lower() if '.' in file.filename else 'jpg'
    filename = f"cover_{photo_id}.{file_ext}"
    
    # Read file content
    file_content = await file.read()
    
    # Use R2 storage if enabled - with thumbnail generation for fast loading
    if storage.r2_enabled:
        # Upload with thumbnails for optimized loading
        upload_result = await storage.upload_with_thumbnails(
            photo_id=f"cover_{photo_id}",
            content=file_content,
            file_ext=file_ext,
            content_type=file.content_type or 'image/jpeg'
        )
        
        if not upload_result['success']:
            logger.error(f"R2 upload failed for cover photo {filename}: {upload_result.get('error')}")
            raise HTTPException(status_code=500, detail="Failed to save cover photo. Please try again.")
        
        cover_url = upload_result['original_url']
        cover_thumb_url = upload_result.get('thumbnail_url')  # Small thumbnail
        cover_medium_url = upload_result.get('thumbnail_medium_url')  # Medium for hero display
    else:
        # Fallback to local filesystem
        file_path = UPLOAD_DIR / filename
        with open(file_path, 'wb') as f:
            f.write(file_content)
        cover_url = f"/api/photos/serve/{filename}"
        cover_thumb_url = None
        cover_medium_url = None
    
    # Reset position when uploading new cover photo
    update_data = {
        "cover_photo_url": cover_url,
        "cover_photo_position": {"scale": 1, "positionX": 50, "positionY": 50}
    }
    
    # Store optimized versions for fast loading
    if cover_thumb_url:
        update_data["cover_photo_thumb_url"] = cover_thumb_url
    if cover_medium_url:
        update_data["cover_photo_medium_url"] = cover_medium_url
    
    await db.galleries.update_one({"id": gallery_id}, {"$set": update_data})
    
    return {
        "cover_photo_url": cover_url,
        "cover_photo_medium_url": cover_medium_url,
        "cover_photo_thumb_url": cover_thumb_url
    }

# NOTE: CoverPhotoPosition model is now imported from models/gallery.py

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
    # First get the gallery to check grandfathering
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Get full user data for feature resolution
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if user can create sections (with grandfathering support)
    can_create, reason = await can_create_section_in_gallery(user, gallery)
    if not can_create:
        raise HTTPException(status_code=403, detail=reason)
    
    if type not in ["photo", "video", "fotoshare", "fotoshare_photobooth"]:
        raise HTTPException(status_code=400, detail="Section type must be 'photo', 'video', 'fotoshare', or 'fotoshare_photobooth'")
    
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
# NOTE: FotoshareSectionCreate model is now imported from models/video.py

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
    
    # Check section creation permission with grandfathering
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    if user:
        can_create, reason = await can_create_section_in_gallery(user, gallery)
        if not can_create:
            raise HTTPException(status_code=403, detail=reason)
    
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
    content_type = scrape_result.get('content_type', '360_booth')
    
    new_section = {
        "id": section_id,
        "name": data.name,
        "type": "fotoshare",
        "order": len(sections),
        "fotoshare_url": data.fotoshare_url,
        "fotoshare_last_sync": now,
        "fotoshare_expired": False,
        "fotoshare_content_type": content_type  # '360_booth', 'photobooth', or 'mixed'
    }
    sections.append(new_section)
    await db.galleries.update_one({"id": gallery_id}, {"$set": {"sections": sections}})
    
    # Store the scraped videos (360° booth)
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
    
    # Store the scraped photos (Photobooth)
    fotoshare_photos = []
    for photo_data in scrape_result['photos']:
        photo_entry = {
            "id": str(uuid.uuid4()),
            "gallery_id": gallery_id,
            "section_id": section_id,
            "hash": photo_data['hash'],
            "source_url": photo_data['source_url'],
            "thumbnail_url": photo_data['thumbnail_url'],
            "width": photo_data.get('width', 3600),
            "height": photo_data.get('height', 2400),
            "file_type": photo_data.get('file_type', 'jpg'),
            "file_size": photo_data.get('file_size', 0),
            "file_source": photo_data.get('file_source', 'photobooth'),
            "created_at_source": photo_data.get('created_at_source'),
            "session_id": photo_data.get('session_id'),
            "has_session_items": photo_data.get('has_session_items', False),
            "order": photo_data.get('order', 0),
            "synced_at": now
        }
        fotoshare_photos.append(photo_entry)
    
    if fotoshare_photos:
        await db.fotoshare_photos.insert_many(fotoshare_photos)
    
    return {
        "section": Section(**new_section),
        "videos_count": len(fotoshare_videos),
        "photos_count": len(fotoshare_photos),
        "sessions_count": len(scrape_result.get('sessions', {})),
        "content_type": content_type,
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
    content_type = scrape_result.get('content_type', section.get('fotoshare_content_type', '360_booth'))
    
    # Update section status
    for s in sections:
        if s["id"] == section_id:
            s["fotoshare_last_sync"] = now
            s["fotoshare_expired"] = scrape_result.get('expired', False)
            s["fotoshare_content_type"] = content_type
            break
    
    await db.galleries.update_one({"id": gallery_id}, {"$set": {"sections": sections}})
    
    if not scrape_result['success']:
        return {
            "success": False,
            "expired": scrape_result.get('expired', False),
            "error": scrape_result.get('error'),
            "videos_count": 0,
            "photos_count": 0
        }
    
    # Get existing video hashes
    existing_videos = await db.fotoshare_videos.find(
        {"gallery_id": gallery_id, "section_id": section_id},
        {"_id": 0, "hash": 1}
    ).to_list(1000)
    existing_video_hashes = {v['hash'] for v in existing_videos}
    
    # Get existing photo hashes
    existing_photos = await db.fotoshare_photos.find(
        {"gallery_id": gallery_id, "section_id": section_id},
        {"_id": 0, "hash": 1}
    ).to_list(1000)
    existing_photo_hashes = {p['hash'] for p in existing_photos}
    
    # Add new videos
    new_videos = []
    for video_data in scrape_result['videos']:
        if video_data['hash'] not in existing_video_hashes:
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
    
    # Add new photos
    new_photos = []
    for photo_data in scrape_result['photos']:
        if photo_data['hash'] not in existing_photo_hashes:
            photo_entry = {
                "id": str(uuid.uuid4()),
                "gallery_id": gallery_id,
                "section_id": section_id,
                "hash": photo_data['hash'],
                "source_url": photo_data['source_url'],
                "thumbnail_url": photo_data['thumbnail_url'],
                "width": photo_data.get('width', 3600),
                "height": photo_data.get('height', 2400),
                "file_type": photo_data.get('file_type', 'jpg'),
                "file_size": photo_data.get('file_size', 0),
                "file_source": photo_data.get('file_source', 'photobooth'),
                "created_at_source": photo_data.get('created_at_source'),
                "session_id": photo_data.get('session_id'),
                "has_session_items": photo_data.get('has_session_items', False),
                "order": photo_data.get('order', 0),
                "synced_at": now
            }
            new_photos.append(photo_entry)
    
    if new_photos:
        await db.fotoshare_photos.insert_many(new_photos)
    
    return {
        "success": True,
        "expired": False,
        "content_type": content_type,
        "videos_count": len(scrape_result['videos']),
        "photos_count": len(scrape_result['photos']),
        "new_videos_added": len(new_videos),
        "new_photos_added": len(new_photos)
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

@api_router.get("/galleries/{gallery_id}/fotoshare-photos")
async def get_fotoshare_photos(gallery_id: str, section_id: Optional[str] = None):
    """Get fotoshare photos for a gallery (supports both gallery_id and share_link)"""
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
    
    photos = await db.fotoshare_photos.find(query, {"_id": 0}).to_list(500)
    photos.sort(key=lambda p: p.get("order", 0))
    
    # Group photos by session for easier frontend consumption
    sessions = {}
    standalone_photos = []
    
    for photo in photos:
        session_id = photo.get("session_id")
        if session_id:
            if session_id not in sessions:
                sessions[session_id] = {
                    "session_id": session_id,
                    "cover_photo": photo,  # First photo is the cover
                    "photos": []
                }
            sessions[session_id]["photos"].append(photo)
        else:
            standalone_photos.append(photo)
    
    return {
        "photos": photos,
        "sessions": list(sessions.values()),
        "standalone_photos": standalone_photos,
        "total_count": len(photos),
        "sessions_count": len(sessions)
    }

@api_router.delete("/galleries/{gallery_id}/fotoshare-sections/{section_id}")
async def delete_fotoshare_section(
    gallery_id: str,
    section_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a fotoshare section and all its videos and photos"""
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
    
    # Delete associated videos and photos
    await db.fotoshare_videos.delete_many({"gallery_id": gallery_id, "section_id": section_id})
    await db.fotoshare_photos.delete_many({"gallery_id": gallery_id, "section_id": section_id})
    
    return {"message": "Fotoshare section deleted"}

# ============ Fotoshare Photobooth Integration (Separate from 360° Booth) ============

async def scrape_fotoshare_photobooth(url: str) -> dict:
    """
    Scrape fotoshare.co photobooth event - separate from 360° booth scraper.
    Returns session-grouped photos with cover thumbnails.
    """
    import aiohttp
    from bs4 import BeautifulSoup
    
    result = {
        'success': False,
        'sessions': [],
        'total_photos': 0,
        'event_title': None,
        'error': None,
        'expired': False
    }
    
    try:
        if not url.startswith('http'):
            url = f'https://{url}'
        
        event_id = extract_fotoshare_event_id(url)
        if not event_id:
            result['error'] = 'Invalid fotoshare.co URL format'
            return result
        
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
        
        soup = BeautifulSoup(html, 'html.parser')
        
        if 'expired' in html.lower() or 'no longer available' in html.lower():
            result['expired'] = True
            result['error'] = 'This event link has expired'
            return result
        
        title_elem = soup.select_one('.album-title, h1.textColor, #albumHeaderSection2 h1')
        if title_elem:
            result['event_title'] = title_elem.get_text(strip=True)
        
        # Extract all photo items (photobooth only - ignore mp4)
        all_items = soup.select('.thumb[data-hash], div.thumb[data-hash]')
        
        sessions_dict = {}
        
        for idx, item in enumerate(all_items):
            try:
                item_hash = item.get('data-hash')
                if not item_hash:
                    continue
                
                file_type = item.get('data-filetype', item.get('data-type', 'unknown')).lower()
                
                # Skip videos - this is photobooth only
                if file_type == 'mp4':
                    continue
                
                thumbnail = item.get('data-thumb', '')
                if not thumbnail:
                    img = item.select_one('img:not(.session-thumb-overlay)')
                    if img:
                        thumbnail = img.get('data-src') or img.get('src', '')
                
                if not thumbnail:
                    continue
                
                session_id = item.get('data-session-id', item_hash)  # Fallback to hash if no session
                has_session_overlay = item.select_one('.session-thumb-overlay') is not None
                
                photo_data = {
                    'hash': item_hash,
                    'item_url': f'https://fotoshare.co/i/{item_hash}',
                    'thumbnail_url': thumbnail,
                    'width': int(item.get('data-width', 3600)),
                    'height': int(item.get('data-height', 2400)),
                    'file_type': file_type,
                    'file_size': int(item.get('data-filesize', 0)),
                    'created_at': item.get('data-filecreated'),
                    'has_more_in_session': has_session_overlay,
                    'order': idx
                }
                
                if session_id not in sessions_dict:
                    sessions_dict[session_id] = {
                        'session_id': session_id,
                        'cover_photo': photo_data,
                        'cover_thumbnail': thumbnail,
                        'has_multiple': has_session_overlay,
                        'first_item_hash': item_hash,
                        'created_at': photo_data['created_at'],
                        'order': idx
                    }
                    
            except Exception as e:
                logging.warning(f"Error parsing photobooth item: {e}")
                continue
        
        result['success'] = True
        result['sessions'] = list(sessions_dict.values())
        result['total_photos'] = len(sessions_dict)
        
        logging.info(f"Scraped fotoshare photobooth: {len(sessions_dict)} sessions")
        
    except aiohttp.ClientError as e:
        result['error'] = f'Network error: {str(e)}'
        if 'timeout' in str(e).lower() or '404' in str(e):
            result['expired'] = True
    except Exception as e:
        logging.error(f"Error scraping fotoshare photobooth: {e}")
        result['error'] = f'Error scraping page: {str(e)}'
    
    return result

@api_router.post("/galleries/{gallery_id}/photobooth-sections")
async def create_photobooth_section(
    gallery_id: str,
    fotoshare_url: Optional[str] = Body(None, embed=True),
    name: str = Body("Photobooth", embed=True),
    contributor_name: Optional[str] = Body(None, embed=True),
    current_user: dict = Depends(get_current_user)
):
    """Create a new Fotoshare Photobooth section (separate from 360° booth)
    
    The fotoshare_url is optional - if not provided, a contributor link will be
    generated so the photobooth provider can submit their URL later.
    """
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Check section creation permission with grandfathering
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    if user:
        can_create, reason = await can_create_section_in_gallery(user, gallery)
        if not can_create:
            raise HTTPException(status_code=403, detail=reason)
    
    section_id = str(uuid.uuid4())
    sections = gallery.get("sections", [])
    now = datetime.now(timezone.utc).isoformat()
    
    # Generate contributor link for photobooth provider
    contributor_link = str(uuid.uuid4())[:8]
    
    new_section = {
        "id": section_id,
        "name": name,
        "type": "fotoshare_photobooth",
        "order": len(sections),
        "contributor_enabled": True,
        "contributor_link": contributor_link,
        "contributor_name": contributor_name or "Photobooth Provider"
    }
    
    photobooth_sessions = []
    
    # If fotoshare URL is provided, validate and scrape immediately
    if fotoshare_url and fotoshare_url.strip():
        fotoshare_url = fotoshare_url.strip()
        scrape_result = await scrape_fotoshare_photobooth(fotoshare_url)
        
        if not scrape_result['success']:
            error_msg = scrape_result.get('error', 'Failed to scrape fotoshare URL')
            if scrape_result.get('expired'):
                raise HTTPException(status_code=400, detail=f"Link expired: {error_msg}")
            raise HTTPException(status_code=400, detail=error_msg)
        
        if len(scrape_result['sessions']) == 0:
            raise HTTPException(status_code=400, detail="No photobooth sessions found. This might be a 360° booth link - use the 360° booth section instead.")
        
        new_section["fotoshare_url"] = fotoshare_url
        new_section["fotoshare_event_title"] = scrape_result.get('event_title')
        new_section["fotoshare_last_sync"] = now
        new_section["fotoshare_expired"] = False
        
        # Store sessions
        for session_data in scrape_result['sessions']:
            session_entry = {
                "id": str(uuid.uuid4()),
                "gallery_id": gallery_id,
                "section_id": section_id,
                "session_id": session_data['session_id'],
                "first_item_hash": session_data['first_item_hash'],
                "cover_thumbnail": session_data['cover_thumbnail'],
                "item_url": f"https://fotoshare.co/i/{session_data['first_item_hash']}",
                "has_multiple": session_data['has_multiple'],
                "created_at_source": session_data.get('created_at'),
                "order": session_data.get('order', 0),
                "synced_at": now
            }
            photobooth_sessions.append(session_entry)
        
        if photobooth_sessions:
            await db.photobooth_sessions.insert_many(photobooth_sessions)
    
    sections.append(new_section)
    await db.galleries.update_one({"id": gallery_id}, {"$set": {"sections": sections}})
    
    return {
        "section": Section(**new_section),
        "sessions_count": len(photobooth_sessions),
        "event_title": new_section.get('fotoshare_event_title'),
        "contributor_link": contributor_link,
        "message": "Photobooth section created. " + (
            f"Found {len(photobooth_sessions)} sessions." if photobooth_sessions 
            else "Share the contributor link with the photobooth provider to add their Fotoshare URL."
        )
    }

@api_router.get("/galleries/{gallery_id}/photobooth-sessions")
async def get_photobooth_sessions(gallery_id: str, section_id: Optional[str] = None):
    """Get photobooth sessions for a gallery"""
    # Support both gallery_id and share_link
    gallery = await db.galleries.find_one({"id": gallery_id}, {"_id": 0, "id": 1})
    if not gallery:
        gallery = await db.galleries.find_one({"share_link": gallery_id}, {"_id": 0, "id": 1})
    
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    actual_gallery_id = gallery["id"]
    query = {"gallery_id": actual_gallery_id}
    if section_id:
        query["section_id"] = section_id
    
    sessions = await db.photobooth_sessions.find(query, {"_id": 0}).to_list(500)
    sessions.sort(key=lambda s: s.get("order", 0))
    
    return sessions

@api_router.post("/galleries/{gallery_id}/photobooth-sections/{section_id}/refresh")
async def refresh_photobooth_section(
    gallery_id: str,
    section_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Refresh a photobooth section"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    sections = gallery.get("sections", [])
    section = next((s for s in sections if s["id"] == section_id), None)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    if section.get("type") != "fotoshare_photobooth":
        raise HTTPException(status_code=400, detail="Section is not a photobooth type")
    
    fotoshare_url = section.get("fotoshare_url")
    if not fotoshare_url:
        raise HTTPException(status_code=400, detail="No fotoshare URL configured")
    
    scrape_result = await scrape_fotoshare_photobooth(fotoshare_url)
    now = datetime.now(timezone.utc).isoformat()
    
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
            "sessions_count": 0
        }
    
    # Get existing session hashes
    existing = await db.photobooth_sessions.find(
        {"gallery_id": gallery_id, "section_id": section_id},
        {"_id": 0, "first_item_hash": 1}
    ).to_list(500)
    existing_hashes = {s['first_item_hash'] for s in existing}
    
    # Add new sessions
    new_sessions = []
    for session_data in scrape_result['sessions']:
        if session_data['first_item_hash'] not in existing_hashes:
            session_entry = {
                "id": str(uuid.uuid4()),
                "gallery_id": gallery_id,
                "section_id": section_id,
                "session_id": session_data['session_id'],
                "first_item_hash": session_data['first_item_hash'],
                "cover_thumbnail": session_data['cover_thumbnail'],
                "item_url": f"https://fotoshare.co/i/{session_data['first_item_hash']}",
                "has_multiple": session_data['has_multiple'],
                "created_at_source": session_data.get('created_at'),
                "order": session_data.get('order', 0),
                "synced_at": now
            }
            new_sessions.append(session_entry)
    
    if new_sessions:
        await db.photobooth_sessions.insert_many(new_sessions)
    
    return {
        "success": True,
        "sessions_count": len(scrape_result['sessions']),
        "new_sessions_added": len(new_sessions)
    }

@api_router.delete("/galleries/{gallery_id}/photobooth-sections/{section_id}")
async def delete_photobooth_section(
    gallery_id: str,
    section_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a photobooth section"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    sections = gallery.get("sections", [])
    section = next((s for s in sections if s["id"] == section_id), None)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    sections = [s for s in sections if s["id"] != section_id]
    await db.galleries.update_one({"id": gallery_id}, {"$set": {"sections": sections}})
    
    await db.photobooth_sessions.delete_many({"gallery_id": gallery_id, "section_id": section_id})
    
    return {"message": "Photobooth section deleted"}

# ============ pCloud Integration Endpoints ============

@api_router.post("/galleries/{gallery_id}/pcloud-sections")
async def create_pcloud_section(
    gallery_id: str,
    pcloud_url: Optional[str] = Body(None, embed=True),
    pcloud_upload_link: Optional[str] = Body(None, embed=True),
    section_name: Optional[str] = Body(None, embed=True),
    current_user: dict = Depends(get_current_user)
):
    """Create a new pCloud section - either with viewing URL or empty for contributor workflow"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    sections = gallery.get("sections", [])
    new_order = max([s.get("order", 0) for s in sections], default=-1) + 1
    section_id = str(uuid.uuid4())
    
    # If viewing URL is provided, fetch photos immediately
    if pcloud_url and pcloud_url.strip():
        # Extract code from URL
        code = extract_pcloud_code(pcloud_url)
        if not code:
            raise HTTPException(status_code=400, detail="Invalid pCloud URL. Please provide a valid share link.")
        
        # Fetch folder contents from pCloud
        pcloud_data = await fetch_pcloud_folder(code)
        if not pcloud_data['success']:
            raise HTTPException(status_code=400, detail=f"Failed to fetch pCloud folder: {pcloud_data['error']}")
        
        new_section = {
            "id": section_id,
            "name": section_name or pcloud_data['folder_name'],
            "order": new_order,
            "type": "pcloud",
            "pcloud_code": code,
            "pcloud_folder_name": pcloud_data['folder_name'],
            "pcloud_upload_link": pcloud_upload_link,  # Store upload request link
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
                "fileid": str(photo['fileid']),
                "name": photo['name'],
                "size": photo.get('size', 0),
                "width": photo.get('width'),
                "height": photo.get('height'),
                "contenttype": photo.get('contenttype', 'image/jpeg'),
                "supplier_name": photo.get('supplier_name'),
                "hash": str(photo.get('hash', '')) if photo.get('hash') else None,
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
    else:
        # Create empty section - contributor will trigger sync after uploading
        if not section_name:
            raise HTTPException(status_code=400, detail="Section name is required when creating without a viewing link")
        
        new_section = {
            "id": section_id,
            "name": section_name,
            "order": new_order,
            "type": "pcloud",
            "pcloud_code": None,  # Will be set when viewing link is provided
            "pcloud_folder_name": None,
            "pcloud_upload_link": pcloud_upload_link,  # Store upload request link for contributors
            "pcloud_last_sync": None,
            "pcloud_error": None,
            "contributor_name": None,
            "contributor_role": None,
            "contributor_link": None
        }
        
        sections.append(new_section)
        await db.galleries.update_one({"id": gallery_id}, {"$set": {"sections": sections}})
        
        return {
            "section": new_section,
            "photo_count": 0,
            "message": "pCloud section created. Generate a contributor link to let your supplier upload photos."
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

@api_router.get("/pcloud/download/{code}/{fileid}")
async def download_pcloud_file(code: str, fileid: str, filename: Optional[str] = None):
    """
    Proxy a pCloud file download through our server.
    This bypasses ISP blocking for downloads (some ISPs block e.pcloud.link).
    
    Parameters:
    - code: pCloud folder code
    - fileid: File ID within the folder
    - filename: Optional filename for Content-Disposition header
    """
    # Get download URL from pCloud
    download_info = await get_pcloud_download_url(code, int(fileid))
    if not download_info:
        raise HTTPException(status_code=404, detail="Could not get pCloud download URL")
    
    import aiohttp
    try:
        timeout = aiohttp.ClientTimeout(total=300)  # 5 minute timeout for large files
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(download_info['url']) as response:
                if response.status != 200:
                    raise HTTPException(status_code=response.status, detail="Failed to fetch from pCloud")
                
                content = await response.read()
                content_type = response.headers.get('Content-Type', 'application/octet-stream')
                
                # Determine filename
                download_filename = filename
                if not download_filename:
                    # Try to get from Content-Disposition header
                    cd = response.headers.get('Content-Disposition', '')
                    if 'filename=' in cd:
                        download_filename = cd.split('filename=')[1].strip('"\'')
                    else:
                        # Default filename with extension based on content type
                        ext = 'jpg' if 'image' in content_type else 'bin'
                        download_filename = f"pcloud_{fileid}.{ext}"
                
                return StreamingResponse(
                    io.BytesIO(content),
                    media_type=content_type,
                    headers={
                        "Content-Disposition": f'attachment; filename="{download_filename}"',
                        "Content-Length": str(len(content)),
                        "Cache-Control": "private, no-cache"
                    }
                )
    except aiohttp.ClientError as e:
        logger.error(f"Error proxying pCloud download: {e}")
        raise HTTPException(status_code=502, detail="Failed to download from pCloud")

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
        photo["thumbnail_url"] = f"/pcloud/thumb/{code}/{fileid}?size=800x800"
        photo["download_url"] = f"/pcloud/download/{code}/{fileid}"  # Proxy download URL
    
    return photos

# ============ Google Drive Section Endpoints ============
# NOTE: GoogleDriveSectionCreate model is now imported from models/video.py

@api_router.post("/galleries/{gallery_id}/gdrive-sections")
async def create_gdrive_section(
    gallery_id: str,
    data: GoogleDriveSectionCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new Google Drive section - either with URL or empty for contributor to fill"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    sections = gallery.get("sections", [])
    new_order = max([s.get("order", 0) for s in sections], default=-1) + 1
    section_id = str(uuid.uuid4())
    
    # If URL is provided, fetch photos immediately
    if data.gdrive_url and data.gdrive_url.strip():
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
    else:
        # Create empty section - contributor will provide URL later via contributor link
        new_section = {
            "id": section_id,
            "name": data.section_name,
            "order": new_order,
            "type": "gdrive",
            "gdrive_folder_id": None,
            "gdrive_folder_name": None,
            "gdrive_last_sync": None,
            "gdrive_error": None,
            "contributor_name": None,
            "contributor_role": None,
            "contributor_link": None  # Will be generated separately
        }
        
        sections.append(new_section)
        await db.galleries.update_one({"id": gallery_id}, {"$set": {"sections": sections}})
        
        return {
            "section": new_section,
            "photo_count": 0,
            "message": "Google Drive section created. Generate a contributor link to let your supplier submit their Google Drive folder."
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
    """Upload custom thumbnail for a video - stores in R2"""
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="Only image files allowed")
    
    MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
    
    try:
        content = await file.read()
        
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="File too large. Maximum size is 5MB")
        
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Empty file received")
        
        filename = f"{user['id']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
        
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
            
            # Save to bytes buffer
            buffer = io.BytesIO()
            img.save(buffer, 'JPEG', quality=90, optimize=True)
            optimized_content = buffer.getvalue()
            
        except Exception as img_error:
            logger.error(f"Image processing error: {img_error}")
            optimized_content = content
        
        # Upload to R2 if enabled, otherwise save locally
        if storage.r2_enabled:
            file_key = f"video_thumbnails/{filename}"
            success, url_or_error = await storage.upload_file(file_key, optimized_content, "image/jpeg")
            if not success:
                logger.error(f"R2 upload failed for video thumbnail: {url_or_error}")
                raise HTTPException(status_code=500, detail="Failed to upload thumbnail. Please try again.")
            logger.info(f"Video thumbnail uploaded to R2: {filename}")
            return {"url": url_or_error}
        else:
            # Fallback to local storage
            thumbnails_dir = Path("uploads/video_thumbnails")
            thumbnails_dir.mkdir(parents=True, exist_ok=True)
            file_path = thumbnails_dir / filename
            with open(file_path, "wb") as f:
                f.write(optimized_content)
            logger.info(f"Video thumbnail uploaded locally: {filename}")
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
    # Check subscription status
    subscription_active = await is_subscription_active(current_user)
    if not subscription_active:
        raise HTTPException(
            status_code=403, 
            detail="Your subscription has expired. Please renew to create new contributor links."
        )
    
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

# ============ Coordinator Hub Endpoints ============

@api_router.post("/galleries/{gallery_id}/coordinator-link")
async def generate_coordinator_link(gallery_id: str, current_user: dict = Depends(get_current_user)):
    """Generate a unique coordinator hub link for the gallery"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Generate unique coordinator link if not exists
    coordinator_hub_link = gallery.get("coordinator_hub_link")
    if not coordinator_hub_link:
        coordinator_hub_link = secrets.token_urlsafe(16)
        await db.galleries.update_one(
            {"id": gallery_id}, 
            {"$set": {"coordinator_hub_link": coordinator_hub_link}}
        )
    
    return {
        "coordinator_hub_link": coordinator_hub_link,
        "gallery_id": gallery_id,
        "gallery_title": gallery.get("title")
    }

@api_router.delete("/galleries/{gallery_id}/coordinator-link")
async def revoke_coordinator_link(gallery_id: str, current_user: dict = Depends(get_current_user)):
    """Revoke the coordinator hub link"""
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    await db.galleries.update_one(
        {"id": gallery_id}, 
        {"$unset": {"coordinator_hub_link": ""}}
    )
    
    return {"message": "Coordinator link revoked"}

@api_router.get("/coordinator-hub/{hub_link}")
async def get_coordinator_hub(hub_link: str):
    """Get coordinator hub data - all sections needing contributors with their status"""
    gallery = await db.galleries.find_one(
        {"coordinator_hub_link": hub_link},
        {"_id": 0}
    )
    if not gallery:
        raise HTTPException(status_code=404, detail="Invalid coordinator hub link")
    
    # Get photographer info (full user for feature check)
    photographer = await db.users.find_one(
        {"id": gallery["photographer_id"]}, 
        {"_id": 0}
    )
    if not photographer:
        raise HTTPException(status_code=404, detail="Gallery owner not found")
    
    # Check if coordinator_hub feature is enabled (with grandfathering)
    feature_enabled = await is_gallery_feature_enabled(photographer, gallery, "coordinator_hub")
    if not feature_enabled:
        raise HTTPException(
            status_code=403, 
            detail="Coordinator Hub feature is not available for this gallery. Please contact the photographer."
        )
    
    photographer_name = photographer.get("business_name") or photographer.get("name", "Photographer")
    
    # Build sections data with status
    sections_data = []
    for section in gallery.get("sections", []):
        # Only include sections that can have contributors
        section_type = section.get("type", "photo")
        
        # Determine status and counts
        status = "pending"
        item_count = 0
        last_updated = None
        
        if section_type == "photo":
            # Check for contributor photos
            photo_count = await db.photos.count_documents({
                "gallery_id": gallery["id"],
                "section_id": section["id"],
                "uploaded_by": "contributor"
            })
            if photo_count > 0:
                status = "submitted"
                item_count = photo_count
                # Get last photo timestamp
                last_photo = await db.photos.find_one(
                    {"gallery_id": gallery["id"], "section_id": section["id"], "uploaded_by": "contributor"},
                    {"_id": 0, "created_at": 1},
                    sort=[("created_at", -1)]
                )
                if last_photo:
                    last_updated = last_photo.get("created_at")
        
        elif section_type == "video":
            # Check for videos
            video_count = await db.gallery_videos.count_documents({
                "gallery_id": gallery["id"],
                "section_id": section["id"]
            })
            if video_count > 0:
                status = "submitted"
                item_count = video_count
                last_video = await db.gallery_videos.find_one(
                    {"gallery_id": gallery["id"], "section_id": section["id"]},
                    {"_id": 0, "created_at": 1},
                    sort=[("created_at", -1)]
                )
                if last_video:
                    last_updated = last_video.get("created_at")
        
        elif section_type == "fotoshare":
            # Check for fotoshare videos (360 Booth)
            fs_count = await db.fotoshare_videos.count_documents({
                "gallery_id": gallery["id"],
                "section_id": section["id"]
            })
            if fs_count > 0 or section.get("fotoshare_url"):
                status = "submitted"
                item_count = fs_count
                last_updated = section.get("fotoshare_last_sync")
        
        elif section_type == "fotoshare_photobooth":
            # Check for photobooth sessions
            pb_count = await db.photobooth_sessions.count_documents({
                "gallery_id": gallery["id"],
                "section_id": section["id"]
            })
            if pb_count > 0 or section.get("fotoshare_url"):
                status = "submitted"
                item_count = pb_count
                last_updated = section.get("fotoshare_last_sync")
        
        elif section_type == "gdrive":
            # Check for gdrive photos
            gd_count = await db.gdrive_photos.count_documents({
                "gallery_id": gallery["id"],
                "section_id": section["id"]
            })
            if gd_count > 0 or section.get("gdrive_folder_id"):
                status = "synced"
                item_count = gd_count
                last_updated = section.get("last_synced_at")
        
        elif section_type == "pcloud":
            # Check for pcloud photos
            pc_count = await db.pcloud_photos.count_documents({
                "gallery_id": gallery["id"],
                "section_id": section["id"]
            })
            if pc_count > 0 or section.get("pcloud_code"):
                status = "synced"
                item_count = pc_count
                last_updated = section.get("pcloud_last_sync")
        
        # Determine the contributor link prefix based on section type
        link_prefix_map = {
            "photo": "/c/",
            "video": "/v/",
            "fotoshare": "/f/",
            "fotoshare_photobooth": "/pb/",
            "gdrive": "/d/",
            "pcloud": "/p/"
        }
        link_prefix = link_prefix_map.get(section_type, "/c/")
        
        # Determine role label based on section type
        role_label_map = {
            "photo": "Official Photographer",
            "video": "Official Videographer", 
            "fotoshare": "Official 360 Booth Operator",
            "fotoshare_photobooth": "Official Photobooth Operator",
            "gdrive": "Official Photo Contributor",
            "pcloud": "Official Photo Contributor"
        }
        role_label = role_label_map.get(section_type, "Official Contributor")
        
        sections_data.append({
            "id": section["id"],
            "name": section.get("name", "Untitled"),
            "type": section_type,
            "status": status,
            "item_count": item_count,
            "last_updated": last_updated,
            "contributor_name": section.get("contributor_name"),
            "contributor_link": section.get("contributor_link"),
            "contributor_enabled": section.get("contributor_enabled", False),
            "link_prefix": link_prefix,
            "role_label": role_label
        })
    
    return {
        "gallery_id": gallery["id"],
        "gallery_title": gallery.get("title"),
        "event_title": gallery.get("event_title"),
        "event_date": gallery.get("event_date"),
        "photographer_name": photographer_name,
        "coordinator_name": gallery.get("coordinator_name"),
        "sections": sections_data
    }

@api_router.get("/contributor/{contributor_link}")
async def get_contributor_upload_info(contributor_link: str):
    """Get gallery and section info for contributor upload page"""
    # Find gallery with this contributor link in any section
    gallery = await db.galleries.find_one(
        {"sections.contributor_link": contributor_link},
        {"_id": 0}
    )
    if not gallery:
        raise HTTPException(status_code=404, detail="Invalid or expired contributor link")
    
    # Find the specific section
    section = next((s for s in gallery.get("sections", []) if s.get("contributor_link") == contributor_link), None)
    if not section or not section.get("contributor_enabled", False):
        raise HTTPException(status_code=404, detail="Contributor uploads are not enabled for this section")
    
    # Check 60-day collaborator access window
    access_windows = await check_gallery_access_windows(gallery)
    uploads_allowed = access_windows.get("collaborator_access_allowed", True)
    days_until_expires = access_windows.get("days_until_collaborator_expires")
    
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
    
    # Get existing photobooth sessions if this is a photobooth section
    existing_photobooth_sessions = []
    if section.get("type") == "fotoshare_photobooth":
        psessions = await db.photobooth_sessions.find(
            {"gallery_id": gallery["id"], "section_id": section["id"]},
            {"_id": 0}
        ).to_list(500)
        existing_photobooth_sessions = psessions
    
    # Get existing gdrive photos if this is a gdrive section
    existing_gdrive_photos = []
    if section.get("type") == "gdrive":
        gphotos = await db.gdrive_photos.find(
            {"gallery_id": gallery["id"], "section_id": section["id"]},
            {"_id": 0}
        ).to_list(500)
        existing_gdrive_photos = gphotos
    
    # Get existing pcloud photos if this is a pcloud section
    existing_pcloud_photos = []
    if section.get("type") == "pcloud":
        pphotos = await db.pcloud_photos.find(
            {"gallery_id": gallery["id"], "section_id": section["id"]},
            {"_id": 0}
        ).to_list(500)
        existing_pcloud_photos = pphotos
    
    return {
        "gallery_id": gallery["id"],
        "gallery_title": gallery["title"],
        "section_id": section["id"],
        "section_name": section["name"],
        "section_type": section.get("type", "photo"),
        "photographer_name": photographer.get("business_name") or photographer.get("name", "Photographer"),
        "existing_contributor_name": section.get("contributor_name"),
        "existing_contributor_role": section.get("contributor_role"),
        "existing_videos": existing_videos,
        "existing_fotoshare_videos": existing_fotoshare_videos,
        "existing_gdrive_photos": existing_gdrive_photos,
        "existing_pcloud_photos": existing_pcloud_photos,
        "fotoshare_url": section.get("fotoshare_url"),
        "gdrive_folder_id": section.get("gdrive_folder_id"),
        "gdrive_folder_name": section.get("gdrive_folder_name"),
        "pcloud_code": section.get("pcloud_code"),
        "pcloud_folder_name": section.get("pcloud_folder_name"),
        "pcloud_upload_link": section.get("pcloud_upload_link"),
        # Photobooth-specific data
        "existing_photobooth_sessions": existing_photobooth_sessions,
        # Contributor access window info
        "uploads_allowed": uploads_allowed,
        "days_until_expires": days_until_expires,
        "upload_window_expired": not uploads_allowed,
        # Existing contributors for autocomplete
        "existing_contributors": await get_gallery_existing_contributors(gallery)
    }


async def get_gallery_existing_contributors(gallery: dict) -> list:
    """Get unique contributor names from all sections in the gallery for autocomplete"""
    contributors = []
    seen_names = set()
    
    for section in gallery.get("sections", []):
        contributor_name = (section.get("contributor_name") or "").strip()
        contributor_role = (section.get("contributor_role") or "").strip()
        
        if contributor_name and contributor_name.lower() not in seen_names:
            seen_names.add(contributor_name.lower())
            contributors.append({
                "name": contributor_name,
                "role": contributor_role or "Contributor"
            })
    
    return contributors


@api_router.post("/contributor/{contributor_link}/set-name")
async def set_contributor_name(contributor_link: str, data: dict = Body(...)):
    """Set the contributor/company name and role for a section"""
    company_name = data.get("company_name", "").strip()
    contributor_role = data.get("contributor_role", "").strip()
    
    if not company_name:
        raise HTTPException(status_code=400, detail="Company name is required")
    
    if len(company_name) > 100:
        raise HTTPException(status_code=400, detail="Company name must be 100 characters or less")
    
    if contributor_role and len(contributor_role) > 100:
        raise HTTPException(status_code=400, detail="Role must be 100 characters or less")
    
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
    
    # Update contributor name and role
    sections[section_idx]["contributor_name"] = company_name
    if contributor_role:
        sections[section_idx]["contributor_role"] = contributor_role
    
    await db.galleries.update_one({"id": gallery["id"]}, {"$set": {"sections": sections}})
    
    return {"success": True, "company_name": company_name, "contributor_role": contributor_role}

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

@api_router.post("/contributor/{contributor_link}/submit-photobooth")
async def submit_contributor_photobooth(contributor_link: str, data: dict = Body(...)):
    """Submit Fotoshare Photobooth URL as a contributor (separate from 360 booth)"""
    fotoshare_url = data.get("fotoshare_url", "").strip()
    
    if not fotoshare_url:
        raise HTTPException(status_code=400, detail="Fotoshare URL is required")
    
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
    
    # Get contributor name from section
    company_name = section.get("contributor_name", "Photobooth Provider")
    
    # Scrape the fotoshare URL using photobooth-specific scraper
    scrape_result = await scrape_fotoshare_photobooth(fotoshare_url)
    
    if not scrape_result['success']:
        error_msg = scrape_result.get('error', 'Failed to scrape fotoshare URL')
        if scrape_result.get('expired'):
            raise HTTPException(status_code=400, detail=f"Link expired: {error_msg}")
        raise HTTPException(status_code=400, detail=error_msg)
    
    if len(scrape_result['sessions']) == 0:
        raise HTTPException(status_code=400, detail="No photobooth sessions found. This might be a 360° booth link.")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Update section with fotoshare URL
    sections = gallery.get("sections", [])
    section_idx = next((i for i, s in enumerate(sections) if s.get("contributor_link") == contributor_link), None)
    if section_idx is not None:
        sections[section_idx]["fotoshare_url"] = fotoshare_url
        sections[section_idx]["fotoshare_last_sync"] = now
        sections[section_idx]["fotoshare_expired"] = False
        sections[section_idx]["fotoshare_event_title"] = scrape_result.get('event_title')
        
        await db.galleries.update_one({"id": gallery["id"]}, {"$set": {"sections": sections}})
    
    # Get existing session hashes to avoid duplicates
    existing_sessions = await db.photobooth_sessions.find(
        {"gallery_id": gallery["id"], "section_id": section["id"]},
        {"_id": 0, "first_item_hash": 1}
    ).to_list(500)
    existing_hashes = {s['first_item_hash'] for s in existing_sessions}
    
    # Store the scraped sessions
    new_sessions = []
    for session_data in scrape_result['sessions']:
        if session_data['first_item_hash'] not in existing_hashes:
            session_entry = {
                "id": str(uuid.uuid4()),
                "gallery_id": gallery["id"],
                "section_id": section["id"],
                "session_id": session_data['session_id'],
                "first_item_hash": session_data['first_item_hash'],
                "cover_thumbnail": session_data['cover_thumbnail'],
                "item_url": f"https://fotoshare.co/i/{session_data['first_item_hash']}",
                "has_multiple": session_data['has_multiple'],
                "created_at_source": session_data.get('created_at'),
                "order": session_data.get('order', 0),
                "synced_at": now,
                "contributor_name": company_name
            }
            new_sessions.append(session_entry)
    
    if new_sessions:
        await db.photobooth_sessions.insert_many(new_sessions)
    
    return {
        "success": True,
        "sessions_count": len(scrape_result['sessions']),
        "new_sessions_added": len(new_sessions),
        "event_title": scrape_result.get('event_title'),
        "contributor_name": company_name
    }

@api_router.post("/contributor/{contributor_link}/refresh-photobooth")
async def refresh_contributor_photobooth(contributor_link: str):
    """Refresh photobooth sessions for a contributor section"""
    gallery = await db.galleries.find_one(
        {"sections.contributor_link": contributor_link},
        {"_id": 0}
    )
    if not gallery:
        raise HTTPException(status_code=404, detail="Invalid contributor link")
    
    section = next((s for s in gallery.get("sections", []) if s.get("contributor_link") == contributor_link), None)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    fotoshare_url = section.get("fotoshare_url")
    if not fotoshare_url:
        raise HTTPException(status_code=400, detail="No Fotoshare URL configured")
    
    scrape_result = await scrape_fotoshare_photobooth(fotoshare_url)
    now = datetime.now(timezone.utc).isoformat()
    
    # Update section status
    sections = gallery.get("sections", [])
    section_idx = next((i for i, s in enumerate(sections) if s.get("contributor_link") == contributor_link), None)
    if section_idx is not None:
        sections[section_idx]["fotoshare_last_sync"] = now
        sections[section_idx]["fotoshare_expired"] = scrape_result.get('expired', False)
        await db.galleries.update_one({"id": gallery["id"]}, {"$set": {"sections": sections}})
    
    if not scrape_result['success']:
        return {
            "success": False,
            "expired": scrape_result.get('expired', False),
            "error": scrape_result.get('error'),
            "sessions_count": 0
        }
    
    # Get existing hashes
    existing = await db.photobooth_sessions.find(
        {"gallery_id": gallery["id"], "section_id": section["id"]},
        {"_id": 0, "first_item_hash": 1}
    ).to_list(500)
    existing_hashes = {s['first_item_hash'] for s in existing}
    
    # Add new sessions
    new_sessions = []
    for session_data in scrape_result['sessions']:
        if session_data['first_item_hash'] not in existing_hashes:
            session_entry = {
                "id": str(uuid.uuid4()),
                "gallery_id": gallery["id"],
                "section_id": section["id"],
                "session_id": session_data['session_id'],
                "first_item_hash": session_data['first_item_hash'],
                "cover_thumbnail": session_data['cover_thumbnail'],
                "item_url": f"https://fotoshare.co/i/{session_data['first_item_hash']}",
                "has_multiple": session_data['has_multiple'],
                "created_at_source": session_data.get('created_at'),
                "order": session_data.get('order', 0),
                "synced_at": now
            }
            new_sessions.append(session_entry)
    
    if new_sessions:
        await db.photobooth_sessions.insert_many(new_sessions)
    
    return {
        "success": True,
        "sessions_count": len(scrape_result['sessions']),
        "new_sessions_added": len(new_sessions)
    }

@api_router.post("/contributor/{contributor_link}/gdrive")
async def submit_contributor_gdrive(contributor_link: str, data: dict = Body(...)):
    """Submit Google Drive folder URL as a contributor"""
    company_name = data.get("company_name", "").strip()
    contributor_role = data.get("contributor_role", "").strip() or "Photos"
    gdrive_url = data.get("gdrive_url", "").strip()
    
    if not company_name:
        raise HTTPException(status_code=400, detail="Your name/company name is required")
    
    if not gdrive_url:
        raise HTTPException(status_code=400, detail="Google Drive folder URL is required")
    
    # Validate URL format
    folder_id = extract_gdrive_folder_id(gdrive_url)
    if not folder_id:
        raise HTTPException(status_code=400, detail="Invalid Google Drive URL. Please provide a valid folder link (e.g., https://drive.google.com/drive/folders/...)")
    
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
    
    if section.get("type") != "gdrive":
        raise HTTPException(status_code=400, detail="This link is not for Google Drive uploads")
    
    # Fetch folder contents from Google Drive
    gdrive_data = await get_gdrive_photos(folder_id)
    if not gdrive_data['success']:
        raise HTTPException(status_code=400, detail=f"Failed to access Google Drive folder: {gdrive_data['error']}. Make sure the folder is shared with 'Anyone with the link can view'.")
    
    if not gdrive_data['photos']:
        raise HTTPException(status_code=400, detail="No photos found in the Google Drive folder. Make sure it contains images and is publicly shared.")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Update section with Google Drive details and contributor info
    sections = gallery.get("sections", [])
    section_idx = next((i for i, s in enumerate(sections) if s.get("contributor_link") == contributor_link), None)
    if section_idx is not None:
        sections[section_idx]["gdrive_folder_id"] = folder_id
        sections[section_idx]["gdrive_folder_name"] = gdrive_data['folder_name']
        sections[section_idx]["gdrive_last_sync"] = now
        sections[section_idx]["gdrive_error"] = None
        sections[section_idx]["contributor_name"] = company_name
        sections[section_idx]["contributor_role"] = contributor_role
        
        await db.galleries.update_one({"id": gallery["id"]}, {"$set": {"sections": sections}})
    
    # Delete any existing photos for this section (in case of re-submission)
    await db.gdrive_photos.delete_many({"gallery_id": gallery["id"], "section_id": section["id"]})
    
    # Store the photos
    gdrive_photos = []
    for idx, photo in enumerate(gdrive_data['photos']):
        gdrive_photos.append({
            "id": str(uuid.uuid4()),
            "gallery_id": gallery["id"],
            "section_id": section["id"],
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
            "synced_at": now
        })
    
    if gdrive_photos:
        await db.gdrive_photos.insert_many(gdrive_photos)
    
    return {
        "success": True,
        "photo_count": len(gdrive_photos),
        "folder_name": gdrive_data['folder_name'],
        "contributor_name": company_name,
        "contributor_role": contributor_role
    }

@api_router.post("/contributor/{contributor_link}/pcloud")
async def submit_contributor_pcloud(contributor_link: str, data: dict = Body(...)):
    """Submit pCloud viewing link as a contributor for pCloud section"""
    company_name = data.get("company_name", "").strip()
    contributor_role = data.get("contributor_role", "").strip() or "Photos"
    pcloud_viewing_url = data.get("pcloud_viewing_url", "").strip()
    
    if not company_name:
        raise HTTPException(status_code=400, detail="Your name/company name is required")
    
    if not pcloud_viewing_url:
        raise HTTPException(status_code=400, detail="pCloud viewing link is required")
    
    # Extract code from URL
    code = extract_pcloud_code(pcloud_viewing_url)
    if not code:
        raise HTTPException(status_code=400, detail="Invalid pCloud URL. Please provide a valid share/viewing link.")
    
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
    
    if section.get("type") != "pcloud":
        raise HTTPException(status_code=400, detail="This link is not for pCloud uploads")
    
    # Fetch folder contents from pCloud
    pcloud_data = await fetch_pcloud_folder(code)
    if not pcloud_data['success']:
        raise HTTPException(status_code=400, detail=f"Failed to access pCloud folder: {pcloud_data['error']}. Make sure the link is valid and publicly accessible.")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Update section with pCloud details and contributor info
    sections = gallery.get("sections", [])
    section_idx = next((i for i, s in enumerate(sections) if s.get("contributor_link") == contributor_link), None)
    if section_idx is not None:
        sections[section_idx]["pcloud_code"] = code
        sections[section_idx]["pcloud_folder_name"] = pcloud_data['folder_name']
        sections[section_idx]["pcloud_last_sync"] = now
        sections[section_idx]["pcloud_error"] = None
        sections[section_idx]["contributor_name"] = company_name
        sections[section_idx]["contributor_role"] = contributor_role
        
        await db.galleries.update_one({"id": gallery["id"]}, {"$set": {"sections": sections}})
    
    # Delete any existing photos for this section (in case of re-submission)
    await db.pcloud_photos.delete_many({"gallery_id": gallery["id"], "section_id": section["id"]})
    
    # Store the photos
    pcloud_photos = []
    for idx, photo in enumerate(pcloud_data['photos']):
        pcloud_photos.append({
            "id": str(uuid.uuid4()),
            "gallery_id": gallery["id"],
            "section_id": section["id"],
            "pcloud_code": code,
            "fileid": str(photo['fileid']),
            "name": photo['name'],
            "size": photo.get('size', 0),
            "width": photo.get('width'),
            "height": photo.get('height'),
            "contenttype": photo.get('contenttype', 'image/jpeg'),
            "supplier_name": company_name,
            "hash": str(photo.get('hash', '')) if photo.get('hash') else None,
            "created_at_source": photo.get('created'),
            "order": idx,
            "synced_at": now
        })
    
    if pcloud_photos:
        await db.pcloud_photos.insert_many(pcloud_photos)
    
    return {
        "success": True,
        "photo_count": len(pcloud_photos),
        "folder_name": pcloud_data['folder_name'],
        "contributor_name": company_name,
        "contributor_role": contributor_role
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
    
    # Check 60-day collaborator access window (based on event date)
    access_windows = await check_gallery_access_windows(gallery)
    if not access_windows.get("collaborator_access_allowed", True):
        raise HTTPException(
            status_code=403, 
            detail="Contributor upload window has expired (60 days from event date). Please contact the photographer."
        )
    
    # Check subscription grace period (2 months from subscription expiry)
    photographer = await db.users.find_one({"id": gallery["photographer_id"]}, {"_id": 0})
    if photographer:
        grace_periods = await check_subscription_grace_periods(photographer, gallery)
        if grace_periods["subscription_expired"] and not grace_periods["uploads_allowed"]:
            raise HTTPException(
                status_code=403,
                detail="The photographer's subscription has expired and the upload grace period has ended. Please contact the photographer."
            )
        if grace_periods["subscription_expired"] and not grace_periods["existing_contributor_links_work"]:
            raise HTTPException(
                status_code=403,
                detail="Contributor uploads have been disabled due to subscription expiration. Please contact the photographer."
            )
    
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
    
    # Read file content
    file_content = await file.read()
    file_size = len(file_content)
    
    # Check per-gallery storage quota
    gallery_storage_used = gallery.get("storage_used", 0)
    gallery_storage_quota = gallery.get("storage_quota", -1)
    
    if gallery_storage_quota != -1 and gallery_storage_used + file_size > gallery_storage_quota:
        raise HTTPException(
            status_code=403, 
            detail="This gallery has reached its storage limit. Please contact the photographer."
        )
    
    # Generate unique filename
    file_ext = file.filename.split('.')[-1].lower()
    photo_id = str(uuid.uuid4())
    filename = f"{photo_id}.{file_ext}"
    
    # Get current photo count for order
    photo_count = await db.photos.count_documents({"gallery_id": gallery["id"], "section_id": section["id"]})
    
    # Use R2 storage if enabled, otherwise local
    if storage.r2_enabled:
        upload_result = await storage.upload_with_thumbnails(
            photo_id=photo_id,
            content=file_content,
            file_ext=file_ext,
            content_type=file.content_type or 'image/jpeg'
        )
        
        if not upload_result['success']:
            logger.error(f"R2 upload failed for contributor photo {photo_id}: {upload_result.get('error')}")
            raise HTTPException(status_code=500, detail="Failed to save photo. Please try again.")
        
        photo_url = upload_result['original_url']
        thumb_small = upload_result.get('thumbnail_url')
        thumb_medium = upload_result.get('thumbnail_medium_url')
        storage_key = upload_result['original_key']
    else:
        # Fallback to local filesystem
        file_path = UPLOAD_DIR / filename
        with open(file_path, 'wb') as f:
            f.write(file_content)
        photo_url = f"/api/photos/serve/{filename}"
        storage_key = filename
        thumb_small = generate_thumbnail(file_path, photo_id, 'small')
        thumb_medium = generate_thumbnail(file_path, photo_id, 'medium')
    
    photo = {
        "id": photo_id,
        "gallery_id": gallery["id"],
        "filename": filename,
        "original_filename": file.filename,
        "url": photo_url,
        "storage_key": storage_key,
        "uploaded_by": "contributor",
        "contributor_name": company_name.strip(),
        "section_id": section["id"],
        "file_size": file_size,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "order": photo_count,
        "is_highlight": False,
        "is_hidden": False,
        "is_flagged": False,
        "auto_flagged": False
    }
    
    # Add thumbnails if available
    if thumb_small:
        photo["thumbnail_url"] = thumb_small
    if thumb_medium:
        photo["thumbnail_medium_url"] = thumb_medium
    
    await db.photos.insert_one(photo)
    
    # Update gallery storage used
    await db.galleries.update_one(
        {"id": gallery["id"]},
        {"$inc": {"storage_used": file_size}}
    )
    
    # Update photographer's total storage for overall tracking
    await db.users.update_one(
        {"id": gallery["photographer_id"]},
        {"$inc": {"storage_used": file_size}}
    )
    
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
    
    # Note: Owner uploads are allowed even if subscription expired
    # They paid for the gallery, so they can continue uploading to it
    # Only creating NEW galleries requires active subscription
    
    # Validate file type more thoroughly
    allowed_types = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
    if not file.content_type or not any(file.content_type.lower().startswith(t.split('/')[0]) for t in allowed_types):
        raise HTTPException(status_code=400, detail=f"Invalid file type: {file.content_type}. Allowed: JPEG, PNG, GIF, WebP, HEIC")
    
    # Validate filename
    if not file.filename:
        raise HTTPException(status_code=400, detail="File must have a filename")
    
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
    
    # Check per-gallery storage quota
    gallery_storage_used = gallery.get("storage_used", 0)
    gallery_storage_quota = gallery.get("storage_quota", -1)  # -1 = unlimited
    
    if gallery_storage_quota != -1 and gallery_storage_used + file_size > gallery_storage_quota:
        used_gb = gallery_storage_used / (1024 * 1024 * 1024)
        quota_gb = gallery_storage_quota / (1024 * 1024 * 1024)
        raise HTTPException(
            status_code=403, 
            detail=f"Gallery storage limit reached ({used_gb:.1f}GB / {quota_gb:.0f}GB). Consider using Google Drive or pCloud for additional photos."
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
    
    # Update gallery storage used (per-gallery tracking)
    await db.galleries.update_one(
        {"id": gallery_id},
        {"$inc": {"storage_used": file_size}}
    )
    
    # Also update user storage for overall tracking
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
    
    # Get ALL photos - no limit, frontend handles progressive loading
    photos = await db.photos.find(
        {"gallery_id": gallery_id}, 
        {"_id": 0}
    ).sort([("is_highlight", -1), ("order", 1), ("uploaded_at", -1)]).to_list(None)
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
# NOTE: ThumbnailRepairRequest and PhotoHealthCheck are now imported from models.gallery
# See: /app/backend/models/gallery.py

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
                filename = photo.get("filename", "")
                file_ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'jpg'
                file_size = photo.get("file_size", 0)
                
                # Delete from R2 if enabled
                if storage.r2_enabled:
                    try:
                        await storage.delete_photo_with_thumbnails(photo_id, file_ext)
                        logger.info(f"Bulk delete: Deleted photo from R2: {photo_id}")
                    except Exception as e:
                        logger.warning(f"Bulk delete: Failed to delete photo {photo_id} from R2: {e}")
                
                # Also delete from local filesystem
                file_path = UPLOAD_DIR / filename
                if file_path.exists():
                    if file_size == 0:
                        file_size = file_path.stat().st_size
                    file_path.unlink()
                
                # Delete local thumbnails
                for size in ["small", "medium"]:
                    thumb_path = THUMBNAILS_DIR / f"{photo_id}_{size}.jpg"
                    if thumb_path.exists():
                        try:
                            thumb_path.unlink()
                        except:
                            pass
                
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
    
    # Get brand name from photographer's settings
    brand_name = "EventsGallery"
    photographer = await db.users.find_one({"id": gallery.get("photographer_id")}, {"_id": 0, "business_name": 1})
    if photographer and photographer.get("business_name"):
        brand_name = photographer["business_name"]
    
    # Build description
    description = gallery.get("description") or f"View {photo_count} photos from {display_name}"
    title = gallery.get("event_title") or gallery.get("title", "Photo Gallery")
    
    # Generate HTML with Open Graph meta tags
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- Primary Meta Tags -->
    <title>{title} | {brand_name}</title>
    <meta name="title" content="{title} by {display_name}">
    <meta name="description" content="{description}">
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="{gallery_url}">
    <meta property="og:title" content="{title}">
    <meta property="og:description" content="{description}">
    <meta property="og:site_name" content="{brand_name}">
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

@api_router.get("/og/gallery/{share_link}")
async def get_gallery_og_meta(share_link: str, request: Request):
    """Get Open Graph meta tags for a gallery (for Facebook/social media sharing)"""
    gallery = await db.galleries.find_one({"share_link": share_link}, {"_id": 0})
    
    # Default values
    site_name = "EventsGallery"
    default_title = "Photo Gallery"
    default_description = "View and download photos from this special event"
    default_image = f"{request.base_url}api/photos/serve/default_og_image.jpg"
    
    if not gallery:
        return {
            "title": default_title,
            "description": default_description,
            "image": default_image,
            "url": str(request.url).replace("/api/og/", "/g/"),
            "site_name": site_name
        }
    
    # Get photographer info for site name
    photographer = await db.users.find_one({"id": gallery.get("photographer_id")}, {"_id": 0, "business_name": 1})
    if photographer and photographer.get("business_name"):
        site_name = photographer["business_name"]
    
    # Build title
    title = gallery.get("event_title") or gallery.get("title") or default_title
    
    # Build description
    description = gallery.get("description")
    if not description:
        photographer_name = gallery.get("photographer_name", "")
        if photographer_name:
            description = f"Photos by {photographer_name}"
        else:
            description = default_description
    
    # Get cover image URL
    cover_photo_url = gallery.get("cover_photo_url")
    if cover_photo_url:
        if cover_photo_url.startswith("/api"):
            image_url = f"{str(request.base_url).rstrip('/')}{cover_photo_url}"
        elif cover_photo_url.startswith("http"):
            image_url = cover_photo_url
        else:
            image_url = f"{str(request.base_url).rstrip('/')}/api/photos/serve/{cover_photo_url}"
    else:
        # Try to get first photo as fallback
        first_photo = await db.photos.find_one(
            {"gallery_id": gallery.get("id")},
            {"_id": 0, "url": 1}
        )
        if first_photo and first_photo.get("url"):
            photo_url = first_photo["url"]
            if photo_url.startswith("/api"):
                image_url = f"{str(request.base_url).rstrip('/')}{photo_url}"
            else:
                image_url = f"{str(request.base_url).rstrip('/')}/api/photos/serve/{photo_url}"
        else:
            image_url = default_image
    
    gallery_url = str(request.url).replace("/api/og/", "/g/")
    
    return {
        "title": title,
        "description": description[:160] if description else default_description,
        "image": image_url,
        "url": gallery_url,
        "site_name": site_name,
        "type": "website"
    }

@api_router.get("/public/gallery/{share_link}", response_model=PublicGallery)
async def get_public_gallery(share_link: str):
    gallery = await db.galleries.find_one({"share_link": share_link}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Check subscription grace period for gallery viewing
    photographer = await db.users.find_one({"id": gallery["photographer_id"]}, {"_id": 0})
    if photographer:
        grace_periods = await check_subscription_grace_periods(photographer, gallery)
        if grace_periods["subscription_expired"] and not grace_periods["viewing_allowed"]:
            raise HTTPException(
                status_code=403,
                detail="This gallery is no longer available. The viewing period has expired."
            )
    
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
    
    # Also disable guest uploads if subscription grace period expired
    if photographer:
        grace_periods = await check_subscription_grace_periods(photographer, gallery)
        if grace_periods["subscription_expired"] and not grace_periods["uploads_allowed"]:
            guest_upload_enabled = False
    
    photographer = await db.users.find_one({"id": gallery["photographer_id"]}, {"_id": 0})
    sections = gallery.get("sections", [])
    
    # Count photos from R2 storage
    r2_photo_count = await db.photos.count_documents({"gallery_id": gallery["id"]})
    
    # Count photos from Google Drive sections
    gdrive_photo_count = await db.gdrive_photos.count_documents({"gallery_id": gallery["id"]})
    
    # Count photos from pCloud sections
    pcloud_photo_count = await db.pcloud_photos.count_documents({"gallery_id": gallery["id"]})
    
    # Total photo count (all sources)
    total_photo_count = r2_photo_count + gdrive_photo_count + pcloud_photo_count
    
    # Count videos from Fotoshare/360Glam
    fotoshare_video_count = await db.fotoshare_videos.count_documents({"gallery_id": gallery["id"]})
    
    # Count videos from YouTube (gallery_videos collection)
    youtube_video_count = await db.gallery_videos.count_documents({"gallery_id": gallery["id"]})
    
    # Total video count
    total_video_count = fotoshare_video_count + youtube_video_count
    
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
    
    # Add contributors from each section with their official title and section name
    for section in sections:
        section_name = section.get("name", "")
        contributor_name = section.get("contributor_name")
        contributor_title = section.get("contributor_role", "")  # Official title like "Videographer"
        
        if contributor_name:
            # Use contributor name + title as unique key to avoid duplicates
            entry_key = (contributor_name.lower(), contributor_title.lower() if contributor_title else section_name.lower())
            if entry_key not in seen_entries:
                contributors.append({
                    "name": contributor_name,
                    "title": contributor_title,  # Official title (e.g., "Videographer", "Second Shooter")
                    "section": section_name,     # Section they contributed to
                    "is_owner": False
                })
                seen_entries.add(entry_key)
    
    # Check download lock status
    download_check = await check_download_allowed(gallery)
    downloads_locked = not download_check["allowed"]
    downloads_locked_reason = download_check["reason"]
    
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
        photo_count=total_photo_count,
        video_count=total_video_count,
        lite_mode_enabled=gallery.get("lite_mode_enabled", False),
        downloads_locked=downloads_locked,
        downloads_locked_reason=downloads_locked_reason
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

@api_router.get("/public/gallery/{share_link}/photos")
async def get_public_gallery_photos(share_link: str, password: Optional[str] = None):
    """Get photos for a public gallery - optimized with projection for fast loading"""
    gallery = await db.galleries.find_one({"share_link": share_link}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    if gallery.get("password") and not password:
        raise HTTPException(status_code=401, detail="Password required")
    
    if gallery.get("password") and not verify_password(password, gallery["password"]):
        raise HTTPException(status_code=401, detail="Invalid password")
    
    # Optimized projection - only fetch fields needed for gallery grid display
    # This significantly reduces payload size for large galleries (2000+ photos)
    projection = {
        "_id": 0,
        "id": 1,
        "url": 1,
        "thumbnail_url": 1,
        "thumbnail_medium_url": 1,
        "section_id": 1,
        "is_highlight": 1,
        "uploaded_by": 1,
        "uploaded_by_type": 1,
        "uploaded_by_name": 1,
        "order": 1,
        "aspect_ratio": 1,
        "title": 1,
        "filename": 1
    }
    
    # Get photos excluding hidden AND flagged ones
    photos = await db.photos.find(
        {
            "gallery_id": gallery["id"], 
            "is_hidden": {"$ne": True},
            "is_flagged": {"$ne": True}
        }, 
        projection
    ).sort([("is_highlight", -1), ("order", 1), ("uploaded_at", -1)]).to_list(None)
    
    return photos

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
    
    # Get all visible photos for display (no limit - frontend handles pagination)
    # Use thumbnail_medium_url for display - optimized size for large screens
    photos = await db.photos.find(
        {
            "gallery_id": gallery["id"],
            "is_hidden": {"$ne": True},
            "is_flagged": {"$ne": True}
        },
        {"_id": 0, "id": 1, "url": 1, "thumbnail_url": 1, "thumbnail_medium_url": 1, "is_highlight": 1, "uploaded_at": 1}
    ).sort([("is_highlight", -1), ("order", 1), ("uploaded_at", -1)]).to_list(None)
    
    # Mark regular photos with source type and optimize URL for display
    for photo in photos:
        photo["source"] = "upload"
        # Prefer medium thumbnail (typically 1200px) for display - sharp but fast
        if photo.get("thumbnail_medium_url"):
            photo["display_url"] = photo["thumbnail_medium_url"]
        else:
            photo["display_url"] = photo.get("url", "")
    
    # Get pCloud photos and format them for display
    # Use pCloud's thumbnail API for faster loading on large screens (1600px wide, sharp but compressed)
    pcloud_photos_raw = await db.pcloud_photos.find(
        {"gallery_id": gallery["id"]},
        {"_id": 0}
    ).to_list(None)
    
    # Convert pCloud photos to display format with optimized thumbnail sizes
    for p in pcloud_photos_raw:
        pcloud_code = p.get('pcloud_code')
        fileid = p.get('fileid')
        # Use 1600x1600 thumbnail for display - sharp but fast loading
        optimized_url = f"/api/pcloud/thumb/{pcloud_code}/{fileid}?size=1600x1600"
        photos.append({
            "id": p.get("id"),
            "url": optimized_url,
            "thumbnail_url": optimized_url,
            "thumbnail_medium_url": optimized_url,
            "display_url": optimized_url,  # Explicit display-optimized URL
            "is_highlight": False,
            "uploaded_at": p.get("created_at", ""),
            "source": "pcloud",
            "supplier_name": p.get("supplier_name")
        })
    
    # Get Google Drive photos and format them for display
    gdrive_photos_raw = await db.gdrive_photos.find(
        {"gallery_id": gallery["id"]},
        {"_id": 0}
    ).to_list(None)
    
    # Convert Google Drive photos to display format
    # Use w1600 for sharp display on large screens (max supported is w2000)
    for g in gdrive_photos_raw:
        file_id = g.get('file_id')
        # Use 1600px wide thumbnail - sharp for large screens, faster than full image
        optimized_url = f"https://drive.google.com/thumbnail?id={file_id}&sz=w1600"
        photos.append({
            "id": g.get("id"),
            "url": optimized_url,
            "thumbnail_url": optimized_url,
            "thumbnail_medium_url": optimized_url,
            "display_url": optimized_url,  # Explicit display-optimized URL
            "is_highlight": False,
            "uploaded_at": g.get("created_at", ""),
            "source": "gdrive",
            "file_id": file_id
        })
    
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
    
    # Count photos by source
    upload_count = len([p for p in photos if p.get("source") == "upload"])
    pcloud_count = len([p for p in photos if p.get("source") == "pcloud"])
    gdrive_count = len([p for p in photos if p.get("source") == "gdrive"])
    
    logger.info(f"Display data for {share_link}: {upload_count} uploads, {pcloud_count} pCloud, {gdrive_count} GDrive photos")
    
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
        "photo_sources": {
            "upload": upload_count,
            "pcloud": pcloud_count,
            "gdrive": gdrive_count
        },
        "videos": videos,
        "sections": gallery.get("sections", []),
        "last_updated": max([p.get("uploaded_at", "") for p in photos if p.get("uploaded_at")]) if photos else ""
    }

@api_router.post("/public/gallery/{share_link}/check-duplicates", response_model=DuplicateCheckResponse)
async def check_duplicate_files(share_link: str, request: DuplicateCheckRequest):
    """Check for duplicates using content hash (preferred) or filename fallback"""
    gallery = await db.galleries.find_one({"share_link": share_link}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    duplicates = []
    new_files = []
    duplicate_hashes = []
    
    # If hashes are provided, use hash-based detection (more reliable)
    if request.hashes and len(request.hashes) == len(request.filenames):
        # Get all content hashes in this gallery
        existing_photos = await db.photos.find(
            {"gallery_id": gallery["id"], "content_hash": {"$exists": True, "$ne": None}}, 
            {"_id": 0, "content_hash": 1}
        ).to_list(None)
        
        existing_hashes = set(p.get("content_hash", "").lower() for p in existing_photos if p.get("content_hash"))
        
        for filename, file_hash in zip(request.filenames, request.hashes):
            if file_hash and file_hash.lower() in existing_hashes:
                duplicates.append(filename)
                duplicate_hashes.append(file_hash)
            else:
                new_files.append(filename)
        
        return DuplicateCheckResponse(
            duplicates=duplicates, 
            new_files=new_files,
            duplicate_hashes=duplicate_hashes if duplicate_hashes else None
        )
    
    # Fallback to filename-based detection (less reliable but works for desktop)
    existing_photos = await db.photos.find(
        {"gallery_id": gallery["id"]}, 
        {"_id": 0, "original_filename": 1}
    ).to_list(None)
    
    existing_filenames = set(
        p.get("original_filename", "").lower() 
        for p in existing_photos 
        if p.get("original_filename")
    )
    
    for filename in request.filenames:
        if filename.lower() in existing_filenames:
            duplicates.append(filename)
        else:
            new_files.append(filename)
    
    return DuplicateCheckResponse(duplicates=duplicates, new_files=new_files)

@api_router.post("/public/gallery/{share_link}/upload", response_model=Photo)
async def upload_photo_guest(
    share_link: str, 
    file: UploadFile = File(...), 
    password: Optional[str] = Form(None),
    content_hash: Optional[str] = Form(None)  # MD5 hash from frontend
):
    """Optimized guest photo upload with hash-based duplicate detection"""
    gallery = await db.galleries.find_one({"share_link": share_link}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Check subscription grace period for guest uploads
    photographer = await db.users.find_one({"id": gallery["photographer_id"]}, {"_id": 0})
    if photographer:
        grace_periods = await check_subscription_grace_periods(photographer, gallery)
        if grace_periods["subscription_expired"] and not grace_periods["uploads_allowed"]:
            raise HTTPException(
                status_code=403,
                detail="Guest uploads have been disabled. The photographer's upload grace period has ended."
            )
    
    # Validate filename exists
    if not file.filename:
        raise HTTPException(status_code=400, detail="File must have a filename")
    
    original_filename = file.filename
    
    # Check for duplicate by content hash first (most reliable)
    if content_hash:
        existing_by_hash = await db.photos.find_one({
            "gallery_id": gallery["id"],
            "content_hash": content_hash.lower()
        }, {"_id": 0, "original_filename": 1})
        
        if existing_by_hash:
            raise HTTPException(
                status_code=409, 
                detail=f"This photo has already been uploaded (matches '{existing_by_hash.get('original_filename', 'existing photo')}')"
            )
    
    # Fallback: Check for duplicate filename (for backward compatibility)
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
        
        # Compute content hash on backend if not provided by frontend
        import hashlib
        computed_hash = hashlib.md5(file_content).hexdigest()
        
        # Double-check for duplicate using computed hash (in case frontend hash was wrong)
        existing_by_computed_hash = await db.photos.find_one({
            "gallery_id": gallery["id"],
            "content_hash": computed_hash
        }, {"_id": 0, "original_filename": 1})
        
        if existing_by_computed_hash:
            raise HTTPException(
                status_code=409, 
                detail=f"This photo has already been uploaded (matches '{existing_by_computed_hash.get('original_filename', 'existing photo')}')"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reading guest upload: {e}")
        raise HTTPException(status_code=400, detail="Failed to read uploaded file")
    
    # Check per-gallery storage quota
    gallery_storage_used = gallery.get("storage_used", 0)
    gallery_storage_quota = gallery.get("storage_quota", -1)
    
    if gallery_storage_quota != -1 and gallery_storage_used + file_size > gallery_storage_quota:
        raise HTTPException(
            status_code=403, 
            detail="This gallery has reached its storage limit. Please contact the photographer."
        )
    
    photo_id = str(uuid.uuid4())
    # Sanitize file extension
    original_ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else 'jpg'
    allowed_extensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif']
    file_ext = original_ext if original_ext in allowed_extensions else 'jpg'
    filename = f"{photo_id}.{file_ext}"
    
    # Use semaphore for concurrency control
    async with upload_semaphore:
        # Use R2 storage if enabled, otherwise local
        if storage.r2_enabled:
            upload_result = await storage.upload_with_thumbnails(
                photo_id=photo_id,
                content=file_content,
                file_ext=file_ext,
                content_type=file.content_type or 'image/jpeg'
            )
            
            if not upload_result['success']:
                logger.error(f"R2 upload failed for guest photo {photo_id}: {upload_result.get('error')}")
                raise HTTPException(status_code=500, detail="Failed to save photo. Please try again.")
            
            photo_url = upload_result['original_url']
            thumb_small = upload_result.get('thumbnail_url')
            thumb_medium = upload_result.get('thumbnail_medium_url')
            storage_key = upload_result['original_key']
        else:
            # Fallback to local filesystem
            file_path = UPLOAD_DIR / filename
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
            
            photo_url = f"/api/photos/serve/{filename}"
            storage_key = filename
            thumb_small = generate_thumbnail(file_path, photo_id, 'small')
            thumb_medium = generate_thumbnail(file_path, photo_id, 'medium')
    
    photo_doc = {
        "id": photo_id,
        "gallery_id": gallery["id"],
        "filename": filename,
        "original_filename": file.filename,
        "content_hash": computed_hash,  # Store hash for future duplicate detection
        "url": photo_url,
        "storage_key": storage_key,
        "uploaded_by": "guest",
        "section_id": None,
        "file_size": file_size,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "is_flagged": False,
        "is_hidden": False,
        "auto_flagged": False
    }
    
    # Add thumbnails if available
    if thumb_small:
        photo_doc["thumbnail_url"] = thumb_small
    if thumb_medium:
        photo_doc["thumbnail_medium_url"] = thumb_medium
    
    try:
        await db.photos.insert_one(photo_doc)
        
        # Update gallery storage used
        await db.galleries.update_one(
            {"id": gallery["id"]},
            {"$inc": {"storage_used": file_size}}
        )
        
        # Update photographer's total storage for overall tracking
        await db.users.update_one(
            {"id": gallery["photographer_id"]},
            {"$inc": {"storage_used": file_size}}
        )
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
    
    # Check if downloads are allowed
    download_check = await check_download_allowed(gallery)
    if not download_check["allowed"]:
        raise HTTPException(status_code=403, detail=download_check["reason"])
    
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
    
    # Check if downloads are allowed
    download_check = await check_download_allowed(gallery, is_owner=True)
    if not download_check["allowed"]:
        raise HTTPException(status_code=403, detail=download_check["reason"])
    
    # Get all photos and calculate total size
    photos = await db.photos.find({"gallery_id": gallery_id}, {"_id": 0}).to_list(None)
    
    chunks = []
    current_chunk = []
    current_chunk_size = 0
    chunk_number = 1
    DEFAULT_PHOTO_SIZE = 2 * 1024 * 1024  # Default 2MB estimate per photo
    
    for photo in photos:
        # Try to get file size from multiple sources
        file_size = 0
        
        # 1. Check if size is stored in the database
        if photo.get("size") and photo["size"] > 0:
            file_size = photo["size"]
        # 2. Check local file (for legacy uploads)
        elif photo.get("filename"):
            file_path = UPLOAD_DIR / photo["filename"]
            if file_path.exists():
                file_size = file_path.stat().st_size
        
        # 3. Use default estimate for CDN photos without size info
        if file_size == 0:
            file_size = DEFAULT_PHOTO_SIZE
        
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
    
    # Check if downloads are allowed
    download_check = await check_download_allowed(gallery, is_owner=True)
    if not download_check["allowed"]:
        raise HTTPException(status_code=403, detail=download_check["reason"])
    
    # Get all photos
    photos = await db.photos.find({"gallery_id": gallery_id}, {"_id": 0}).to_list(None)
    
    # Organize into chunks (same logic as download-info)
    chunks = []
    current_chunk = []
    current_chunk_size = 0
    DEFAULT_PHOTO_SIZE = 2 * 1024 * 1024  # 2MB default
    
    for photo in photos:
        # Get file size from stored value, local file, or use default
        file_size = 0
        if photo.get("size") and photo["size"] > 0:
            file_size = photo["size"]
        elif photo.get("filename"):
            file_path = UPLOAD_DIR / photo["filename"]
            if file_path.exists():
                file_size = file_path.stat().st_size
        if file_size == 0:
            file_size = DEFAULT_PHOTO_SIZE
        
        if current_chunk_size + file_size > MAX_ZIP_CHUNK_SIZE and current_chunk:
            chunks.append(current_chunk)
            current_chunk = []
            current_chunk_size = 0
        
        current_chunk.append(photo)
        current_chunk_size += file_size
    
    if current_chunk:
        chunks.append(current_chunk)
    
    # Validate chunk number
    if not chunks:
        raise HTTPException(status_code=404, detail="No photos available for download")
    if chunk_number < 1 or chunk_number > len(chunks):
        raise HTTPException(status_code=404, detail=f"Chunk {chunk_number} not found. Gallery has {len(chunks)} chunks.")
    
    # Get the requested chunk (1-indexed)
    chunk_photos = chunks[chunk_number - 1]
    
    # Create zip file
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for photo in chunk_photos:
            photo_data = None
            archive_name = photo.get("original_filename", photo.get("filename", f"photo_{photo.get('id', 'unknown')}.jpg"))
            
            # Try local file first
            if photo.get("filename"):
                file_path = UPLOAD_DIR / photo["filename"]
                if file_path.exists():
                    zip_file.write(file_path, archive_name)
                    continue
            
            # Try fetching from CDN/URL
            if photo.get("url"):
                try:
                    async with httpx.AsyncClient(timeout=30.0) as client:
                        response = await client.get(photo["url"])
                        if response.status_code == 200:
                            photo_data = response.content
                except Exception as e:
                    logger.warning(f"Failed to fetch photo from CDN: {photo.get('url')}: {e}")
            
            if photo_data:
                zip_file.writestr(archive_name, photo_data)
    
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

# NOTE: SectionDownloadRequest model is now imported from models/video.py

@api_router.post("/public/gallery/{share_link}/download-info")
async def get_public_download_info(share_link: str, request: SectionDownloadRequest):
    """Get download info for public gallery - sections, photo counts, and chunk info"""
    gallery = await db.galleries.find_one({"share_link": share_link}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Check if downloads are allowed
    download_check = await check_download_allowed(gallery)
    if not download_check["allowed"]:
        raise HTTPException(status_code=403, detail=download_check["reason"])
    
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
    DEFAULT_PHOTO_SIZE = 2 * 1024 * 1024  # 2MB default estimate
    
    for photo in photos:
        # Get file size from stored value, local file, or use default
        file_size = 0
        if photo.get("size") and photo["size"] > 0:
            file_size = photo["size"]
        elif photo.get("filename"):
            file_path = UPLOAD_DIR / photo["filename"]
            if file_path.exists():
                file_size = file_path.stat().st_size
        if file_size == 0:
            file_size = DEFAULT_PHOTO_SIZE
        
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
    DEFAULT_PHOTO_SIZE = 2 * 1024 * 1024  # 2MB default
    for section in sorted(sections, key=lambda s: s.get("order", 0)):
        # Only include photo sections (not video or fotoshare)
        if section.get("type", "photo") != "photo":
            continue
        section_photos = [p for p in photos if p.get("section_id") == section["id"]]
        if section_photos:
            section_size = 0
            for p in section_photos:
                if p.get("size") and p["size"] > 0:
                    section_size += p["size"]
                elif p.get("filename") and (UPLOAD_DIR / p["filename"]).exists():
                    section_size += (UPLOAD_DIR / p["filename"]).stat().st_size
                else:
                    section_size += DEFAULT_PHOTO_SIZE
            section_info.append({
                "id": section["id"],
                "title": section.get("name", section.get("title", "Untitled")),
                "photo_count": len(section_photos),
                "size_mb": round(section_size / (1024 * 1024), 1)
            })
    
    total_size = sum(c["size_bytes"] for c in chunks)
    
    # Build integration sources list (only shown after password verification)
    integration_sources = []
    
    for section in sorted(sections, key=lambda s: s.get("order", 0)):
        section_type = section.get("type", "photo")
        section_name = section.get("name", section.get("title", "Untitled"))
        
        # Google Drive sections
        if section_type == "gdrive" and section.get("gdrive_folder_id"):
            gdrive_photo_count = await db.gdrive_photos.count_documents({
                "gallery_id": gallery["id"],
                "section_id": section["id"]
            })
            if gdrive_photo_count > 0:
                # Build Google Drive folder URL
                folder_url = section.get("gdrive_folder_url") or f"https://drive.google.com/drive/folders/{section['gdrive_folder_id']}"
                integration_sources.append({
                    "type": "gdrive",
                    "icon": "google-drive",
                    "label": "Google Drive",
                    "section_name": section_name,
                    "url": folder_url,
                    "photo_count": gdrive_photo_count
                })
        
        # pCloud sections
        elif section_type == "pcloud" and section.get("pcloud_code"):
            pcloud_photo_count = await db.pcloud_photos.count_documents({
                "gallery_id": gallery["id"],
                "section_id": section["id"]
            })
            if pcloud_photo_count > 0:
                pcloud_url = f"https://e.pcloud.link/publink/show?code={section['pcloud_code']}"
                integration_sources.append({
                    "type": "pcloud",
                    "icon": "cloud",
                    "label": "pCloud",
                    "section_name": section_name,
                    "url": pcloud_url,
                    "photo_count": pcloud_photo_count
                })
        
        # Fotoshare/360Glam sections
        elif section_type == "fotoshare" and section.get("fotoshare_url"):
            fotoshare_video_count = await db.fotoshare_videos.count_documents({
                "gallery_id": gallery["id"],
                "section_id": section["id"]
            })
            if fotoshare_video_count > 0:
                integration_sources.append({
                    "type": "fotoshare",
                    "icon": "video",
                    "label": "360Glam",
                    "section_name": section_name,
                    "url": section["fotoshare_url"],
                    "video_count": fotoshare_video_count
                })
        
        # Video/YouTube sections
        elif section_type == "video":
            youtube_video_count = await db.gallery_videos.count_documents({
                "gallery_id": gallery["id"],
                "section_id": section["id"]
            })
            if youtube_video_count > 0:
                # For YouTube, we don't have a single link, but we can link to the gallery
                integration_sources.append({
                    "type": "youtube",
                    "icon": "youtube",
                    "label": "YouTube Videos",
                    "section_name": section_name,
                    "url": None,  # Videos are embedded in gallery
                    "video_count": youtube_video_count
                })
    
    return {
        "gallery_id": gallery["id"],
        "gallery_title": gallery.get("title", "Gallery"),
        "total_photos": len(photos),
        "total_size_mb": round(total_size / (1024 * 1024), 1),
        "chunk_count": len(chunks),
        "chunks": chunks,
        "sections": section_info,
        "integration_sources": integration_sources
    }

@api_router.post("/public/gallery/{share_link}/download-section")
async def download_section(share_link: str, request: SectionDownloadRequest, chunk: int = 1):
    """Download photos from a specific section or all photos, with chunking support"""
    gallery = await db.galleries.find_one({"share_link": share_link}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Check if downloads are allowed
    download_check = await check_download_allowed(gallery)
    if not download_check["allowed"]:
        raise HTTPException(status_code=403, detail=download_check["reason"])
    
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
    DEFAULT_PHOTO_SIZE = 2 * 1024 * 1024  # 2MB default
    
    for photo in photos:
        # Get file size from stored value, local file, or use default
        file_size = 0
        if photo.get("size") and photo["size"] > 0:
            file_size = photo["size"]
        elif photo.get("filename"):
            file_path = UPLOAD_DIR / photo["filename"]
            if file_path.exists():
                file_size = file_path.stat().st_size
        if file_size == 0:
            file_size = DEFAULT_PHOTO_SIZE
        
        if current_chunk_size + file_size > SECTION_ZIP_CHUNK_SIZE and current_chunk:
            chunks.append(current_chunk)
            current_chunk = []
            current_chunk_size = 0
        
        current_chunk.append(photo)
        current_chunk_size += file_size
    
    if current_chunk:
        chunks.append(current_chunk)
    
    # If no chunks were created (all CDN photos), create one chunk with all photos
    if not chunks and photos:
        chunks = [photos]
    
    # Validate chunk number
    if not chunks:
        raise HTTPException(status_code=404, detail="No photos available for download")
    if chunk < 1 or chunk > len(chunks):
        raise HTTPException(status_code=404, detail=f"Chunk {chunk} not found. Download has {len(chunks)} chunks.")
    
    # Get the requested chunk
    chunk_photos = chunks[chunk - 1]
    
    # Create zip file
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for photo in chunk_photos:
            photo_data = None
            archive_name = photo.get("original_filename", photo.get("filename", f"photo_{photo.get('id', 'unknown')}.jpg"))
            
            # Try local file first
            if photo.get("filename"):
                file_path = UPLOAD_DIR / photo["filename"]
                if file_path.exists():
                    zip_file.write(file_path, archive_name)
                    continue
            
            # Try fetching from CDN/URL
            if photo.get("url"):
                try:
                    async with httpx.AsyncClient(timeout=30.0) as client:
                        response = await client.get(photo["url"])
                        if response.status_code == 200:
                            photo_data = response.content
                except Exception as e:
                    logger.warning(f"Failed to fetch photo from CDN: {photo.get('url')}: {e}")
            
            if photo_data:
                zip_file.writestr(archive_name, photo_data)
    
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

@api_router.get("/photos/download")
async def proxy_download_photo(url: str, filename: str = "photo.jpg"):
    """
    Proxy download for CDN photos - fetches from CDN and returns with proper Content-Disposition header.
    This is needed because CDN URLs don't support the download attribute due to cross-origin restrictions.
    """
    import httpx
    
    # Validate URL is from our CDN
    if not url.startswith("photos/") and not url.startswith("https://cdn."):
        raise HTTPException(status_code=400, detail="Invalid URL")
    
    # Build full URL if it's a relative path
    if url.startswith("photos/"):
        if storage.r2_enabled and storage.cdn_url:
            full_url = f"{storage.cdn_url}/{url}"
        else:
            # Fall back to local serve
            filename_only = url.split("/")[-1]
            return await serve_photo(filename_only, download=True)
    else:
        full_url = url
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(full_url)
            response.raise_for_status()
            
            # Determine content type
            content_type = response.headers.get("content-type", "image/jpeg")
            
            # Sanitize filename
            safe_filename = "".join(c for c in filename if c.isalnum() or c in "._- ").strip()
            if not safe_filename:
                safe_filename = "photo.jpg"
            
            return Response(
                content=response.content,
                media_type=content_type,
                headers={
                    "Content-Disposition": f'attachment; filename="{safe_filename}"',
                    "Content-Length": str(len(response.content)),
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Expose-Headers": "Content-Disposition, Content-Length"
                }
            )
    except httpx.HTTPError as e:
        logger.error(f"Failed to proxy download from {full_url}: {e}")
        raise HTTPException(status_code=502, detail="Failed to fetch photo from CDN")

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

# NOTE: GoogleDriveBackupStatus model moved to models/analytics.py

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
# NOTE: GalleryAnalytics, PhotographerAnalytics, AdminAnalytics models moved to models/analytics.py

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
        # Convert datetime to ISO string for Pydantic model
        created_at_value = g.get("created_at")
        if hasattr(created_at_value, 'isoformat'):
            created_at_str = created_at_value.isoformat()
        else:
            created_at_str = str(created_at_value) if created_at_value else ""
        gallery_analytics.append(GalleryAnalytics(
            gallery_id=g["id"],
            gallery_title=g["title"],
            view_count=g.get("view_count", 0),
            total_photos=g.get("total_photos", 0),
            photographer_photos=g.get("photographer_photos", 0),
            guest_photos=g.get("guest_photos", 0),
            created_at=created_at_str,
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

# NOTE: auto_delete_expired_galleries has been moved to /app/backend/tasks/background.py

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
    """Get current pricing, plan features, and retention settings (public)
    
    This endpoint dynamically pulls from admin-configured feature toggles
    for Free, Standard, and Pro plans.
    
    ADMIN SETTINGS ALWAYS WIN - features not set by admin are disabled.
    """
    settings = await get_billing_settings()
    global_toggles = await get_global_feature_toggles()
    
    # Get plan-specific settings from admin feature toggles (no defaults)
    free_config = global_toggles.get(PLAN_FREE, {})
    standard_config = global_toggles.get(PLAN_STANDARD, {})
    pro_config = global_toggles.get(PLAN_PRO, {})
    
    # Calculate retention in human-readable format
    def days_to_text(days):
        if days >= 36500:
            return "Unlimited"
        if days >= 365:
            years = days // 365
            return f"{years} year{'s' if years > 1 else ''}"
        months = days // 30
        if months > 0:
            return f"{months} month{'s' if months > 1 else ''}"
        return f"{days} day{'s' if days > 1 else ''}"
    
    # Get tokens per plan from billing settings
    tokens_per_plan = settings.get("tokens_per_plan", {
        "free": 0,
        "standard": 2,
        "pro": 2
    })
    
    return {
        # Pricing from admin settings
        "standard_monthly": settings.get("pricing", DEFAULT_PRICING).get("standard_monthly", 1000),
        "pro_monthly": settings.get("pricing", DEFAULT_PRICING).get("pro_monthly", 1500),
        "addon_token_price": settings.get("pricing", DEFAULT_PRICING).get("extra_credit", 500),
        "extra_credit": settings.get("pricing", DEFAULT_PRICING).get("extra_credit", 500),  # Legacy name
        
        # Payment methods
        "payment_methods": settings.get("payment_methods", {
            "gcash": {"enabled": True, "name": "GCash", "account_name": "Less Real Moments", "account_number": "09952568450"},
            "maya": {"enabled": True, "name": "Maya", "account_name": "Less Real Moments", "account_number": "09952568450"},
            "bank": {"enabled": False, "name": "Bank Transfer", "account_name": "", "account_number": "", "bank_name": ""},
            "paypal": {"enabled": False, "name": "PayPal", "account_name": "", "account_number": "", "paypal_email": ""}
        }),
        
        # Plan features - pulled directly from admin feature toggles
        "plan_features": {
            "free": {
                "tokens_per_month": tokens_per_plan.get("free", 0),
                "storage_per_gallery_gb": free_config.get("gallery_storage_limit_gb", free_config.get("storage_limit_gb", 1)),
                "gallery_retention": days_to_text(free_config.get("gallery_expiration_days", 1)),
                "gallery_expiration_days": free_config.get("gallery_expiration_days", 1),
                "display_mode": free_config.get("display_mode", False),
                "collaboration_link": free_config.get("collaboration_link", False),
                "qr_code": free_config.get("qr_code", True),
                "copy_share_link": free_config.get("copy_share_link", True),
                "view_public_gallery": free_config.get("view_public_gallery", True),
                "unlimited_token": free_config.get("unlimited_token", False),
            },
            "standard": {
                "tokens_per_month": tokens_per_plan.get("standard", 2),
                "storage_per_gallery_gb": standard_config.get("gallery_storage_limit_gb", standard_config.get("storage_limit_gb", 10)),
                "gallery_retention": days_to_text(standard_config.get("gallery_expiration_days", 90)),
                "gallery_expiration_days": standard_config.get("gallery_expiration_days", 90),
                "display_mode": standard_config.get("display_mode", False),
                "collaboration_link": standard_config.get("collaboration_link", False),
                "qr_code": standard_config.get("qr_code", True),
                "copy_share_link": standard_config.get("copy_share_link", True),
                "view_public_gallery": standard_config.get("view_public_gallery", True),
                "unlimited_token": standard_config.get("unlimited_token", False),
            },
            "pro": {
                "tokens_per_month": tokens_per_plan.get("pro", 2),
                "storage_per_gallery_gb": pro_config.get("gallery_storage_limit_gb", pro_config.get("storage_limit_gb", 15)),
                "gallery_retention": days_to_text(pro_config.get("gallery_expiration_days", 180)),
                "gallery_expiration_days": pro_config.get("gallery_expiration_days", 180),
                "display_mode": pro_config.get("display_mode", True),
                "collaboration_link": pro_config.get("collaboration_link", True),
                "qr_code": pro_config.get("qr_code", True),
                "copy_share_link": pro_config.get("copy_share_link", True),
                "view_public_gallery": pro_config.get("view_public_gallery", True),
                "unlimited_token": pro_config.get("unlimited_token", False),
            }
        },
        
        # Grace periods
        "grace_periods": {
            "upload_grace_days": UPLOAD_GRACE_PERIOD_DAYS,
            "view_grace_days": VIEW_GRACE_PERIOD_DAYS
        }
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
    
    # Helper for backward compatibility with old field names
    def get_addon_tokens_val(u):
        return u.get("addon_tokens", u.get("extra_credits", 0))
    def get_addon_tokens_purchased(u):
        return u.get("addon_tokens_purchased_at", u.get("extra_credits_purchased_at"))
    def get_subscription_tokens_val(u):
        return u.get("subscription_tokens", u.get("event_credits", 0))
    
    # Calculate extra credits expiration
    addon_tokens_purchased_at = get_addon_tokens_purchased(db_user)
    addon_tokens_expires_at = None
    if addon_tokens_purchased_at and get_addon_tokens_val(db_user) > 0:
        try:
            purchased_at = datetime.fromisoformat(addon_tokens_purchased_at.replace('Z', '+00:00'))
            addon_tokens_expires_at = (purchased_at + timedelta(days=365)).isoformat()
        except:
            pass
    
    # Check subscription status
    is_subscription_active_flag = await is_subscription_active(db_user)
    subscription_expired = resolved.get("subscription_expired", False)
    
    # Calculate effective credits based on subscription status
    # - If subscription expired: monthly credits (subscription_tokens) = 0, addon_tokens preserved
    # - If subscription active: both subscription_tokens and addon_tokens count
    effective_subscription_tokens = 0 if subscription_expired else get_subscription_tokens_val(db_user)
    effective_addon_tokens = get_addon_tokens_val(db_user)
    
    # Check if extra credits have also expired (12 months from purchase)
    if addon_tokens_purchased_at and effective_addon_tokens > 0:
        try:
            purchased_at = datetime.fromisoformat(addon_tokens_purchased_at.replace('Z', '+00:00'))
            if datetime.now(timezone.utc) >= (purchased_at + timedelta(days=365)):
                effective_addon_tokens = 0
        except:
            pass
    
    return {
        "plan": db_user.get("plan", PLAN_FREE),
        "effective_plan": resolved["effective_plan"],
        "billing_cycle_start": db_user.get("billing_cycle_start"),
        "subscription_expires": db_user.get("subscription_expires"),  # When subscription period ends
        "subscription_active": is_subscription_active_flag,  # Whether subscription is currently active
        "subscription_expired": subscription_expired,  # Whether subscription has expired
        "subscription_tokens": effective_subscription_tokens,  # Monthly tokens (0 if subscription expired)
        "subscription_tokens_raw": get_subscription_tokens_val(db_user),  # Raw value in DB (for debugging)
        "addon_tokens": effective_addon_tokens,  # Extra tokens (preserved until 12 months from purchase)
        "addon_tokens_raw": get_addon_tokens_val(db_user),  # Raw value in DB
        "addon_tokens_purchased_at": addon_tokens_purchased_at,  # When addon tokens were bought
        "addon_tokens_expires_at": addon_tokens_expires_at,  # When addon tokens will expire
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
        "authority_source": resolved["authority_source"],
        # Grace period constants for client-side calculations
        "grace_period_settings": {
            "upload_grace_days": UPLOAD_GRACE_PERIOD_DAYS,  # 2 months (60 days)
            "view_grace_days": VIEW_GRACE_PERIOD_DAYS,  # 6 months (180 days)
        }
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

# NOTE: UpgradeRequest model is now imported from models/billing.py

@api_router.post("/user/upgrade-request")
async def submit_upgrade_request(data: UpgradeRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    """Submit an upgrade request with optional payment proof"""
    if data.requested_plan not in [PLAN_STANDARD, PLAN_PRO]:
        raise HTTPException(status_code=400, detail="Invalid plan")
    
    db_user = await db.users.find_one({"id": user["id"]})
    current_plan = get_effective_plan(db_user)
    
    if current_plan == data.requested_plan:
        raise HTTPException(status_code=400, detail="You are already on this plan")
    
    # Validate upgrade/downgrade rules:
    # - Free can upgrade to Standard or Pro
    # - Standard can upgrade to Pro only
    # - Pro cannot downgrade until subscription expires (30 days)
    plan_hierarchy = {PLAN_FREE: 0, PLAN_STANDARD: 1, PLAN_PRO: 2}
    current_level = plan_hierarchy.get(current_plan, 0)
    requested_level = plan_hierarchy.get(data.requested_plan, 0)
    
    if requested_level < current_level:
        # This is a downgrade - check if subscription is expired
        subscription_expires_str = db_user.get("subscription_expires")
        if subscription_expires_str:
            try:
                subscription_expires = datetime.fromisoformat(subscription_expires_str.replace('Z', '+00:00'))
                if datetime.now(timezone.utc) < subscription_expires:
                    days_remaining = (subscription_expires - datetime.now(timezone.utc)).days
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Cannot downgrade until your current subscription expires. {days_remaining} days remaining."
                    )
            except ValueError:
                pass
        # Override mode users also cannot downgrade while override is active
        override_expires_str = db_user.get("override_expires")
        if override_expires_str:
            try:
                override_expires = datetime.fromisoformat(override_expires_str.replace('Z', '+00:00'))
                if datetime.now(timezone.utc) < override_expires:
                    raise HTTPException(
                        status_code=400, 
                        detail="Cannot change plan while override mode is active."
                    )
            except ValueError:
                pass
    
    # Get pricing for transaction record
    billing_settings = await get_billing_settings()
    pricing = billing_settings.get("pricing", DEFAULT_PRICING)
    tx_amount = pricing.get(f"{data.requested_plan}_monthly", 0)
    
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
        
        # Create pending transaction record
        await create_transaction(
            user_id=user["id"],
            tx_type="upgrade",
            amount=tx_amount,
            status="pending",
            plan=data.requested_plan,
            payment_proof_url=data.proof_url
        )
        
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

# NOTE: ExtraCreditRequest model is now imported from models/billing.py

@api_router.post("/user/extra-credits-request")
async def submit_addon_tokens_request(data: ExtraCreditRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    """Submit a request for extra credits with payment proof"""
    if data.quantity < 1 or data.quantity > 10:
        raise HTTPException(status_code=400, detail="Quantity must be between 1 and 10")
    
    db_user = await db.users.find_one({"id": user["id"]})
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # CRITICAL: Add-on tokens require an active subscription
    # Check if user has an active subscription (not Free, not expired)
    is_active = await is_subscription_active(db_user)
    if not is_active:
        raise HTTPException(
            status_code=400, 
            detail="Add-on tokens can only be purchased with an active subscription. Please subscribe to Standard or Pro first."
        )
    
    # Set pending status with credit request info
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "payment_status": PAYMENT_PENDING,
            "payment_proof_url": data.proof_url,
            "payment_submitted_at": datetime.now(timezone.utc).isoformat(),
            "requested_addon_tokens": data.quantity
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
    
    # Create pending transaction record
    await create_transaction(
        user_id=user["id"],
        tx_type="addon_tokens",
        amount=total_cost,
        status="pending",
        addon_tokens=data.quantity,
        payment_proof_url=data.proof_url
    )
    
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
            current_credits = user.get("subscription_tokens", 0)
            update_data["subscription_tokens"] = current_credits + PLAN_CREDITS.get(requested_plan, 2)
        else:
            # Fresh plan activation
            update_data["subscription_tokens"] = PLAN_CREDITS.get(requested_plan, 2)
        
        update_data["plan"] = requested_plan
        update_data["requested_plan"] = None
        update_data["billing_cycle_start"] = datetime.now(timezone.utc).isoformat()
        # CRITICAL: Set subscription expiration (30 days from now)
        update_data["subscription_expires"] = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        
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
        email_credits = update_data.get("subscription_tokens", PLAN_CREDITS.get(requested_plan, 2))
    
    # If user has requested extra credits, add them
    requested_addon_tokens = user.get("requested_addon_tokens")
    if requested_addon_tokens and requested_addon_tokens > 0:
        current_extra = user.get("addon_tokens", 0)
        update_data["addon_tokens"] = current_extra + requested_addon_tokens
        update_data["requested_addon_tokens"] = None
        # CRITICAL: Set addon token expiration (12 months from purchase)
        update_data["addon_tokens_purchased_at"] = datetime.now(timezone.utc).isoformat()
        update_data["addon_tokens_expires_at"] = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
        message_parts.append(f"+{requested_addon_tokens} extra credits added")
        notification_msg_parts.append(f"You received {requested_addon_tokens} extra credit(s).")
        tx_type = "addon_tokens"
        tx_amount = pricing.get("extra_credit", 500) * requested_addon_tokens
        email_credits = f"+{requested_addon_tokens} extra"
        if not email_plan:
            email_plan = get_effective_plan(user).capitalize()
    
    # CRITICAL: Ensure subscription_expires is set if user has approved payment but no expiry
    if not user.get("subscription_expires") and user.get("plan") and user.get("plan") != PLAN_FREE:
        update_data["subscription_expires"] = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        if "billing_cycle_start" not in update_data:
            update_data["billing_cycle_start"] = datetime.now(timezone.utc).isoformat()
    
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
            "addon_tokens": requested_addon_tokens
        }
    )
    
    # Update existing pending transaction(s) to approved instead of creating new ones
    # Find the most recent pending transaction for this user
    pending_tx = await db.transactions.find_one(
        {"user_id": data.user_id, "status": "pending"},
        sort=[("created_at", -1)]
    )
    
    if pending_tx:
        # Update the pending transaction to approved
        await db.transactions.update_one(
            {"id": pending_tx["id"]},
            {"$set": {
                "status": "approved",
                "admin_notes": data.notes,
                "resolved_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    else:
        # No pending transaction found, create a new approved one
        await create_transaction(
            user_id=data.user_id,
            tx_type=tx_type,
            amount=tx_amount,
            status="approved",
            plan=requested_plan,
            addon_tokens=requested_addon_tokens,
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
    """Upload payment proof screenshot with optimization - stores in R2"""
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="Only image files allowed")
    
    # File size limit (10MB)
    MAX_FILE_SIZE = 10 * 1024 * 1024
    
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
            
            # Save to bytes buffer
            buffer = io.BytesIO()
            img.save(buffer, 'JPEG', quality=85, optimize=True)
            optimized_content = buffer.getvalue()
            
        except Exception as img_error:
            logger.error(f"Image processing error: {img_error}")
            optimized_content = content
        
        # Upload to R2 if enabled, otherwise save locally
        if storage.r2_enabled:
            file_key = f"payment_proofs/{filename}"
            success, url_or_error = await storage.upload_file(file_key, optimized_content, "image/jpeg")
            if not success:
                logger.error(f"R2 upload failed for payment proof: {url_or_error}")
                raise HTTPException(status_code=500, detail="Failed to upload file. Please try again.")
            logger.info(f"Payment proof uploaded to R2: {filename}")
            return {"url": url_or_error}
        else:
            # Fallback to local storage
            proofs_dir = Path("uploads/payment_proofs")
            proofs_dir.mkdir(parents=True, exist_ok=True)
            file_path = proofs_dir / filename
            with open(file_path, "wb") as f:
                f.write(optimized_content)
            logger.info(f"Payment proof uploaded locally: {filename}")
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
            "requested_addon_tokens": user.get("requested_addon_tokens")
        }
    )
    
    # Create transaction record
    billing_settings = await get_billing_settings()
    pricing = billing_settings.get("pricing", DEFAULT_PRICING)
    requested_plan = user.get("requested_plan")
    requested_addon_tokens = user.get("requested_addon_tokens")
    tx_amount = 0
    tx_type = "subscription"
    
    if requested_plan:
        tx_type = "upgrade"
        tx_amount = pricing.get(f"{requested_plan}_monthly", 0)
    if requested_addon_tokens:
        tx_type = "addon_tokens"
        tx_amount = pricing.get("extra_credit", 500) * requested_addon_tokens
    
    await create_transaction(
        user_id=data.user_id,
        tx_type=tx_type,
        amount=tx_amount,
        status="rejected",
        plan=requested_plan,
        addon_tokens=requested_addon_tokens,
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
    """Upload QR code image for a payment method - stores in R2"""
    if method not in ["gcash", "maya", "bank", "paypal"]:
        raise HTTPException(status_code=400, detail="Invalid payment method")
    
    # Generate filename with method name
    ext = file.filename.split('.')[-1] if '.' in file.filename else 'png'
    filename = f"{method}_qr_{uuid.uuid4().hex[:8]}.{ext}"
    
    # Read file content
    content = await file.read()
    content_type = file.content_type or f"image/{ext}"
    
    # Upload to R2 if enabled, otherwise save locally
    if storage.r2_enabled:
        file_key = f"payment_qr/{filename}"
        success, url_or_error = await storage.upload_file(file_key, content, content_type)
        if not success:
            logger.error(f"R2 upload failed for payment QR: {url_or_error}")
            raise HTTPException(status_code=500, detail="Failed to upload QR code. Please try again.")
        logger.info(f"Payment QR uploaded to R2: {filename}")
        return {"url": url_or_error}
    else:
        # Fallback to local storage
        qr_dir = Path("uploads/payment_qr")
        qr_dir.mkdir(parents=True, exist_ok=True)
        file_path = qr_dir / filename
        with open(file_path, "wb") as f:
            f.write(content)
        logger.info(f"Payment QR uploaded locally: {filename}")
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
            "subscription_tokens": credits,
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
            "subscription_tokens": credits
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
        "subscription_tokens": user.get("subscription_tokens", 0),
        "addon_tokens": user.get("addon_tokens", 0),
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
            "subscription_tokens": credits,
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
        "requested_addon_tokens": db_user.get("requested_addon_tokens")
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

# Include modular routes (Phase 4 refactoring)
app.include_router(health_router, prefix="/api")

# Setup RSVP Token routes
set_rsvp_token_db(db)
set_rsvp_token_email(send_email, get_email_template, ADMIN_EMAIL, os.environ.get("FRONTEND_URL", ""))
app.include_router(rsvp_token_router)

# Setup invitation routes
from routes.invitation import setup_invitation_routes
setup_invitation_routes(app, db, get_current_user)

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