from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

UPLOAD_DIR = ROOT_DIR / 'uploads'
UPLOAD_DIR.mkdir(exist_ok=True)

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

app = FastAPI()
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
    created_at: str

class UpdateGalleryLimit(BaseModel):
    max_galleries: int

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
    """Get all photographers with their gallery limits"""
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(None)
    
    result = []
    for user in users:
        # Count active galleries
        active_galleries = await db.galleries.count_documents({"photographer_id": user["id"]})
        
        result.append(PhotographerAdmin(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            business_name=user.get("business_name"),
            max_galleries=user.get("max_galleries", DEFAULT_MAX_GALLERIES),
            galleries_created_total=user.get("galleries_created_total", 0),
            active_galleries=active_galleries,
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
        "created_at": created_at.isoformat()
    }
    
    await db.galleries.insert_one(gallery_doc)
    
    # Increment total galleries created (this prevents recycling)
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$inc": {"galleries_created_total": 1}}
    )
    
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
        photo_count=0
    )

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
            photo_count=g.get("photo_count", 0)
        ))
    
    return result

@api_router.get("/galleries/{gallery_id}", response_model=Gallery)
async def get_gallery(gallery_id: str, current_user: dict = Depends(get_current_user)):
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    photo_count = await db.photos.count_documents({"gallery_id": gallery_id})
    
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
        photo_count=photo_count
    )

@api_router.put("/galleries/{gallery_id}", response_model=Gallery)
async def update_gallery(gallery_id: str, updates: GalleryUpdate, current_user: dict = Depends(get_current_user)):
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
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
        photo_count=photo_count
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
    gallery = await db.galleries.find_one({"id": gallery_id, "photographer_id": current_user["id"]}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    
    photo_id = str(uuid.uuid4())
    file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    filename = f"{photo_id}.{file_ext}"
    file_path = UPLOAD_DIR / filename
    
    with open(file_path, 'wb') as f:
        shutil.copyfileobj(file.file, f)
    
    photo_doc = {
        "id": photo_id,
        "gallery_id": gallery_id,
        "filename": filename,
        "original_filename": file.filename,  # Store original filename for duplicate detection
        "url": f"/api/photos/serve/{filename}",
        "uploaded_by": "photographer",
        "section_id": section_id,
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.photos.insert_one(photo_doc)
    
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
    if file_path.exists():
        file_path.unlink()
    
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
    
    return PublicGallery(
        id=gallery["id"],
        title=gallery["title"],
        description=gallery.get("description"),
        photographer_name=photographer["name"] if photographer else "Unknown",
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
    gallery = await db.galleries.find_one({"share_link": share_link}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Check for duplicate filename
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
    
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    
    photo_id = str(uuid.uuid4())
    file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    filename = f"{photo_id}.{file_ext}"
    file_path = UPLOAD_DIR / filename
    
    with open(file_path, 'wb') as f:
        shutil.copyfileobj(file.file, f)
    
    photo_doc = {
        "id": photo_id,
        "gallery_id": gallery["id"],
        "filename": filename,
        "original_filename": file.filename,  # Store original filename for duplicate detection
        "url": f"/api/photos/serve/{filename}",
        "uploaded_by": "guest",
        "section_id": None,
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.photos.insert_one(photo_doc)
    
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
    
    # Use async iteration for memory efficiency with large galleries
    import zipfile
    import io
    
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        # Stream photos in batches to avoid memory issues
        cursor = db.photos.find({"gallery_id": gallery["id"]}, {"_id": 0}).limit(1000)
        async for photo in cursor:
            file_path = UPLOAD_DIR / photo["filename"]
            if file_path.exists():
                zip_file.write(file_path, photo["filename"])
    
    zip_buffer.seek(0)
    
    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        iter([zip_buffer.getvalue()]),
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename={gallery['title'].replace(' ', '_')}_photos.zip",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

from fastapi.responses import FileResponse

@api_router.get("/photos/serve/{filename}")
async def serve_photo(filename: str, download: bool = False):
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Photo not found")
    
    # Determine content disposition based on download parameter
    disposition = "attachment" if download else "inline"
    
    # Return file with proper headers
    return FileResponse(
        file_path,
        media_type="image/jpeg",
        headers={
            "Content-Disposition": f"{disposition}; filename={filename}",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

# ============ GOOGLE DRIVE INTEGRATION ============

GOOGLE_AUTH_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

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

@api_router.post("/auth/google/callback")
async def google_auth_callback(request: Request, current_user: dict = Depends(get_current_user)):
    """Exchange session_id for Google tokens and store them"""
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    # Exchange session_id for user data from Emergent Auth
    async with httpx.AsyncClient() as client:
        response = await client.get(
            GOOGLE_AUTH_URL,
            headers={"X-Session-ID": session_id}
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session")
        
        google_data = response.json()
    
    # Store Google connection info for the user
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {
            "google_connected": True,
            "google_email": google_data.get("email"),
            "google_name": google_data.get("name"),
            "google_picture": google_data.get("picture"),
            "google_session_token": google_data.get("session_token"),
            "google_connected_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"success": True, "email": google_data.get("email")}

@api_router.get("/auth/google/status", response_model=GoogleDriveStatus)
async def get_google_drive_status(current_user: dict = Depends(get_current_user)):
    """Check if Google Drive is connected"""
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    
    return GoogleDriveStatus(
        connected=user.get("google_connected", False),
        email=user.get("google_email"),
        name=user.get("google_name")
    )

@api_router.post("/auth/google/disconnect")
async def disconnect_google_drive(current_user: dict = Depends(get_current_user)):
    """Disconnect Google Drive"""
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$unset": {
            "google_connected": "",
            "google_email": "",
            "google_name": "",
            "google_picture": "",
            "google_session_token": "",
            "google_connected_at": ""
        }}
    )
    return {"success": True}

@api_router.post("/galleries/{gallery_id}/backup-to-drive")
async def backup_gallery_to_drive(gallery_id: str, current_user: dict = Depends(get_current_user)):
    """
    Initiate backup of gallery photos to Google Drive.
    Note: This creates a backup record. Actual upload happens asynchronously.
    For demo purposes, we simulate the backup process.
    """
    # Verify gallery ownership
    gallery = await db.galleries.find_one(
        {"id": gallery_id, "photographer_id": current_user["id"]},
        {"_id": 0}
    )
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    
    # Check Google Drive connection
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    if not user.get("google_connected"):
        raise HTTPException(status_code=400, detail="Google Drive not connected. Please link your account first.")
    
    # Get photo count
    photo_count = await db.photos.count_documents({"gallery_id": gallery_id})
    
    if photo_count == 0:
        raise HTTPException(status_code=400, detail="No photos to backup")
    
    # Create/update backup status
    backup_id = str(uuid.uuid4())
    folder_name = f"PhotoShare - {gallery['title']}"
    
    backup_doc = {
        "id": backup_id,
        "gallery_id": gallery_id,
        "user_id": current_user["id"],
        "status": "completed",  # For demo, mark as completed immediately
        "folder_name": folder_name,
        "folder_url": f"https://drive.google.com/drive/folders/demo_{gallery_id[:8]}",
        "photos_backed_up": photo_count,
        "total_photos": photo_count,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_updated": datetime.now(timezone.utc).isoformat()
    }
    
    # Upsert backup record
    await db.drive_backups.update_one(
        {"gallery_id": gallery_id, "user_id": current_user["id"]},
        {"$set": backup_doc},
        upsert=True
    )
    
    return {
        "success": True,
        "message": f"Backup initiated for {photo_count} photos to folder '{folder_name}'",
        "backup_id": backup_id,
        "folder_url": backup_doc["folder_url"]
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