from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Request, Response, BackgroundTasks, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import RedirectResponse, StreamingResponse
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
import base64
import shutil
import httpx
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

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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

# Default storage quota (in bytes) - 500 MB
DEFAULT_STORAGE_QUOTA = 500 * 1024 * 1024

# Gallery auto-delete after 6 months (in days)
GALLERY_EXPIRATION_DAYS = 180

# Gallery edit lock after 7 days from creation
GALLERY_EDIT_LOCK_DAYS = 7

# Google Drive OAuth configuration
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', '')
GOOGLE_DRIVE_REDIRECT_URI = os.environ.get('GOOGLE_DRIVE_REDIRECT_URI', '')
FRONTEND_URL = os.environ.get('FRONTEND_URL', '')
GOOGLE_DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file']

# Google Drive sync interval (in seconds)
DRIVE_SYNC_INTERVAL = 5 * 60  # 5 minutes

# Background task control
sync_task_running = False

def get_google_oauth_flow(state: str = None):
    """Create Google OAuth flow"""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return None
    
    return Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [GOOGLE_DRIVE_REDIRECT_URI]
            }
        },
        scopes=GOOGLE_DRIVE_SCOPES,
        redirect_uri=GOOGLE_DRIVE_REDIRECT_URI
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
                # Search for existing folder first
                results = drive_service.files().list(
                    q=f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false",
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
    yield
    # Stop background task
    global sync_task_running
    sync_task_running = False

app = FastAPI(lifespan=lifespan)
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

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
    created_at: str

class UpdateGalleryLimit(BaseModel):
    max_galleries: int

class UpdateStorageQuota(BaseModel):
    storage_quota: int  # in bytes

class LandingPageConfig(BaseModel):
    hero_title: str = "Share Your Photography, Beautifully"
    hero_subtitle: str = "Create stunning galleries, share with clients, and let them upload their own photos. The professional way to showcase and collaborate."
    brand_name: str = "PhotoShare"
    hero_image_1: Optional[str] = None
    hero_image_2: Optional[str] = None

class GalleryCreate(BaseModel):
    title: str
    description: Optional[str] = None
    password: Optional[str] = None
    event_title: Optional[str] = None
    event_date: Optional[str] = None
    share_link_expiration_days: int = 30
    guest_upload_enabled_days: int = 3
    download_all_password: Optional[str] = None
    theme: str = "classic"

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
    share_link_expiration_date: Optional[str] = None
    guest_upload_expiration_date: Optional[str] = None
    guest_upload_enabled: bool = True
    has_download_all_password: bool = False
    theme: str = "classic"
    created_at: str
    photo_count: int = 0
    auto_delete_date: Optional[str] = None  # When gallery will be auto-deleted
    days_until_deletion: Optional[int] = None  # Days remaining until deletion
    is_edit_locked: bool = False  # Whether editing is locked (7 days after creation)
    days_until_edit_lock: int = 7  # Days remaining before edit lock

class GalleryUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    password: Optional[str] = None
    event_title: Optional[str] = None
    event_date: Optional[str] = None
    share_link_expiration_days: Optional[int] = None
    guest_upload_enabled_days: Optional[int] = None
    download_all_password: Optional[str] = None
    theme: Optional[str] = None

class Section(BaseModel):
    id: str
    name: str
    order: int

class Photo(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    gallery_id: str
    filename: str
    original_filename: Optional[str] = None  # Store original filename for duplicate detection
    url: str
    uploaded_by: str
    section_id: Optional[str] = None
    uploaded_at: str

class PasswordVerify(BaseModel):
    password: str

class PublicGallery(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    title: str
    description: Optional[str] = None
    photographer_name: str
    has_password: bool
    cover_photo_url: Optional[str] = None
    sections: List[Section] = []
    event_title: Optional[str] = None
    event_date: Optional[str] = None
    is_expired: bool = False
    guest_upload_enabled: bool = True
    has_download_all_password: bool = False
    theme: str = "classic"
    photo_count: int = 0

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

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
        if payload.get("is_admin") != True:
            raise HTTPException(status_code=403, detail="Admin access required")
        return {"is_admin": True}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication")

@api_router.post("/auth/register", response_model=Token)
async def register(user_data: UserRegister):
    existing = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    hashed_pw = hash_password(user_data.password)
    
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
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user_doc)
    
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
    return User(
        id=current_user["id"],
        email=current_user["email"],
        name=current_user["name"],
        business_name=current_user.get("business_name"),
        max_galleries=current_user.get("max_galleries", DEFAULT_MAX_GALLERIES),
        galleries_created_total=current_user.get("galleries_created_total", 0),
        storage_quota=current_user.get("storage_quota", DEFAULT_STORAGE_QUOTA),
        storage_used=current_user.get("storage_used", 0),
        created_at=current_user["created_at"]
    )

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
    if RESEND_API_KEY:
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
            await asyncio.to_thread(resend.Emails.send, params)
        except Exception as e:
            logging.error(f"Failed to send email: {e}")
            raise HTTPException(status_code=500, detail="Failed to send email. Please try again later.")
    else:
        # For testing without email configured
        logging.info(f"New password for {data.email}: {new_password}")
    
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
            created_at=user["created_at"]
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
    image_slot: str = Form(...),  # "hero_image_1" or "hero_image_2"
    admin: dict = Depends(get_admin_user)
):
    """Upload an image for the landing page"""
    if image_slot not in ["hero_image_1", "hero_image_2"]:
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

@api_router.get("/public/landing-config", response_model=LandingPageConfig)
async def get_public_landing_config():
    """Get landing page config for public display"""
    config = await db.site_config.find_one({"type": "landing"}, {"_id": 0})
    if not config:
        return LandingPageConfig()
    return LandingPageConfig(**config)

@api_router.post("/galleries", response_model=Gallery)
async def create_gallery(gallery_data: GalleryCreate, current_user: dict = Depends(get_current_user)):
    # Check gallery limit (count total created, not just active)
    galleries_created_total = current_user.get("galleries_created_total", 0)
    max_galleries = current_user.get("max_galleries", DEFAULT_MAX_GALLERIES)
    
    if galleries_created_total >= max_galleries:
        raise HTTPException(
            status_code=403, 
            detail=f"Gallery limit reached ({max_galleries}). Please contact administrator to add more galleries."
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
        "share_link_expiration_date": share_link_expiration_date,
        "share_link_expiration_days": gallery_data.share_link_expiration_days,
        "guest_upload_expiration_date": guest_upload_expiration_date,
        "guest_upload_enabled_days": gallery_data.guest_upload_enabled_days,
        "download_all_password": hash_password(gallery_data.download_all_password) if gallery_data.download_all_password else None,
        "theme": gallery_data.theme,
        "created_at": created_at.isoformat(),
        "auto_delete_date": (created_at + timedelta(days=GALLERY_EXPIRATION_DAYS)).isoformat(),
        "view_count": 0  # Track gallery views for analytics
    }
    
    await db.galleries.insert_one(gallery_doc)
    
    # Increment total galleries created (this prevents recycling)
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
        days_until_edit_lock=GALLERY_EDIT_LOCK_DAYS
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
        created_at=gallery["created_at"],
        photo_count=photo_count,
        auto_delete_date=auto_delete_date,
        days_until_deletion=days_until_deletion,
        is_edit_locked=edit_info["is_locked"],
        days_until_edit_lock=edit_info["days_until_lock"]
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
        share_link_expiration_date=updated_gallery.get("share_link_expiration_date"),
        guest_upload_expiration_date=updated_gallery.get("guest_upload_expiration_date"),
        guest_upload_enabled=True,
        has_download_all_password=updated_gallery.get("download_all_password") is not None,
        theme=updated_gallery.get("theme", "classic"),
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
    
    photos = await db.photos.find({"gallery_id": gallery_id}, {"_id": 0}).to_list(1000)
    for photo in photos:
        file_path = UPLOAD_DIR / photo["filename"]
        if file_path.exists():
            file_path.unlink()
    
    await db.photos.delete_many({"gallery_id": gallery_id})
    await db.galleries.delete_one({"id": gallery_id})
    
    return {"message": "Gallery deleted"}

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
    await db.galleries.update_one({"id": gallery_id}, {"$set": {"cover_photo_url": cover_url}})
    
    return {"cover_photo_url": cover_url}

@api_router.post("/galleries/{gallery_id}/sections", response_model=Section)
async def create_section(gallery_id: str, name: str = Form(...), current_user: dict = Depends(get_current_user)):
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    section_id = str(uuid.uuid4())
    sections = gallery.get("sections", [])
    new_section = {
        "id": section_id,
        "name": name,
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

@api_router.delete("/galleries/{gallery_id}/sections/{section_id}")
async def delete_section(gallery_id: str, section_id: str, current_user: dict = Depends(get_current_user)):
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    sections = gallery.get("sections", [])
    sections = [s for s in sections if s["id"] != section_id]
    
    await db.galleries.update_one({"id": gallery_id}, {"$set": {"sections": sections}})
    await db.photos.update_many({"gallery_id": gallery_id, "section_id": section_id}, {"$set": {"section_id": None}})
    
    return {"message": "Section deleted"}

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
    
    # Check storage quota
    storage_used = current_user.get("storage_used", 0)
    storage_quota = current_user.get("storage_quota", DEFAULT_STORAGE_QUOTA)
    
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
    
    if storage_used + file_size > storage_quota:
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
    file_path = UPLOAD_DIR / filename
    
    # Use semaphore for concurrency control and async file I/O
    async with upload_semaphore:
        try:
            async with aiofiles.open(file_path, 'wb') as f:
                await f.write(file_content)
            
            # Verify file was written correctly (sync check is fast)
            if not file_path.exists() or file_path.stat().st_size != file_size:
                raise Exception("File verification failed")
        except Exception as e:
            logger.error(f"Error writing file {filename}: {e}")
            # Clean up partial file
            if file_path.exists():
                try:
                    file_path.unlink()
                except:
                    pass
            raise HTTPException(status_code=500, detail="Failed to save photo. Please try again.")
    
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
        "url": f"/api/photos/serve/{filename}",
        "uploaded_by": "photographer",
        "section_id": section_id,
        "file_size": file_size,
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    
    try:
        await db.photos.insert_one(photo_doc)
    except Exception as e:
        logger.error(f"Error saving photo to database: {e}")
        # Clean up file if DB insert fails
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
    
    # Limit to 500 photos with pagination support
    photos = await db.photos.find({"gallery_id": gallery_id}, {"_id": 0}).limit(500).to_list(None)
    return [Photo(**p) for p in photos]

@api_router.delete("/photos/{photo_id}")
async def delete_photo(photo_id: str, current_user: dict = Depends(get_current_user)):
    photo = await db.photos.find_one({"id": photo_id}, {"_id": 0})
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    
    gallery = await db.galleries.find_one({"id": photo["gallery_id"], "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    file_path = UPLOAD_DIR / photo["filename"]
    file_size = 0
    if file_path.exists():
        file_size = file_path.stat().st_size
        file_path.unlink()
    
    # Update storage used
    if file_size > 0:
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$inc": {"storage_used": -file_size}}
        )
    
    await db.photos.delete_one({"id": photo_id})
    
    return {"message": "Photo deleted"}

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
    
    return PublicGallery(
        id=gallery["id"],
        title=gallery["title"],
        description=gallery.get("description"),
        photographer_name=display_name,
        has_password=gallery.get("password") is not None,
        cover_photo_url=gallery.get("cover_photo_url"),
        sections=[Section(**s) for s in sections],
        event_title=gallery.get("event_title"),
        event_date=gallery.get("event_date"),
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
    
    # Limit to 500 photos for public viewing
    photos = await db.photos.find({"gallery_id": gallery["id"]}, {"_id": 0}).sort("uploaded_at", -1).limit(500).to_list(None)
    return [Photo(**p) for p in photos]

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
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: JPEG, PNG, GIF, WebP, HEIC")
    
    # Read file with size limit
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
    try:
        file_content = await file.read()
        file_size = len(file_content)
        
        if file_size == 0:
            raise HTTPException(status_code=400, detail="File is empty")
        
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail=f"File too large. Maximum size is 50MB")
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
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    
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

from fastapi.responses import FileResponse
import mimetypes

# Initialize mimetypes
mimetypes.init()

@api_router.get("/photos/serve/{filename}")
async def serve_photo(filename: str, download: bool = False):
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Photo not found")
    
    # Get correct media type based on file extension
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
    
    # Get file size for Content-Length header
    file_size = file_path.stat().st_size
    
    # Determine content disposition based on download parameter
    disposition = "attachment" if download else "inline"
    
    # Return file with proper caching and headers
    return FileResponse(
        file_path,
        media_type=media_type,
        headers={
            "Content-Disposition": f"{disposition}; filename={filename}",
            "Content-Length": str(file_size),
            "Cache-Control": "public, max-age=31536000, immutable",  # Cache for 1 year (images don't change)
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "Content-Disposition, Content-Length"
        }
    )

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

@api_router.get("/oauth/drive/authorize")
async def google_drive_authorize(gallery_id: str, current_user: dict = Depends(get_current_user)):
    """Start Google Drive OAuth flow"""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=400, 
            detail="Google Drive not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
        )
    
    flow = get_google_oauth_flow()
    if not flow:
        raise HTTPException(status_code=500, detail="Failed to create OAuth flow")
    
    # Generate state with user ID and gallery ID
    state = f"{current_user['id']}:{gallery_id}:{secrets.token_urlsafe(16)}"
    oauth_states[state] = {
        "user_id": current_user["id"],
        "gallery_id": gallery_id,
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
async def google_drive_callback(code: str = Query(...), state: str = Query(...)):
    """Handle Google Drive OAuth callback"""
    # Verify state
    state_data = oauth_states.get(state)
    if not state_data:
        # Redirect to frontend with error
        return RedirectResponse(
            url=f"{FRONTEND_URL}/dashboard?drive_error=invalid_state",
            status_code=302
        )
    
    user_id = state_data["user_id"]
    gallery_id = state_data["gallery_id"]
    
    # Clean up state
    del oauth_states[state]
    
    try:
        flow = get_google_oauth_flow()
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
        
        # Redirect back to gallery
        return RedirectResponse(
            url=f"{FRONTEND_URL}/gallery/{gallery_id}?drive_connected=true",
            status_code=302
        )
        
    except Exception as e:
        logger.error(f"OAuth callback error: {e}")
        return RedirectResponse(
            url=f"{FRONTEND_URL}/gallery/{gallery_id}?drive_error=auth_failed",
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

class PhotographerAnalytics(BaseModel):
    total_galleries: int = 0
    total_photos: int = 0
    total_views: int = 0
    storage_used: int = 0
    storage_quota: int = DEFAULT_STORAGE_QUOTA
    galleries: List[GalleryAnalytics] = []

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
            days_until_deletion=days_remaining
        ))
        total_photos += g.get("total_photos", 0)
        total_views += g.get("view_count", 0)
    
    return PhotographerAnalytics(
        total_galleries=len(galleries),
        total_photos=total_photos,
        total_views=total_views,
        storage_used=current_user.get("storage_used", 0),
        storage_quota=current_user.get("storage_quota", DEFAULT_STORAGE_QUOTA),
        galleries=gallery_analytics
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

app.include_router(api_router)

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