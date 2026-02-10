"""
User-related Pydantic models
"""
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import Optional

# Import constants directly to avoid circular imports
DEFAULT_MAX_GALLERIES = 1
DEFAULT_STORAGE_QUOTA = 500 * 1024 * 1024
PLAN_FREE = "free"
PAYMENT_NONE = "none"


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
    galleries_created_total: int = 0
    storage_quota: int = DEFAULT_STORAGE_QUOTA
    storage_used: int = 0
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
    plan: str = PLAN_FREE
    event_credits: int = 0
    extra_credits: int = 0
    extra_credits_purchased_at: Optional[str] = None  # When extra credits were purchased (expire after 12 months)
    payment_status: str = PAYMENT_NONE
    subscription_expires: Optional[str] = None  # When current subscription period ends
    override_mode: Optional[str] = None
    override_expires: Optional[str] = None
    requested_plan: Optional[str] = None


class UpdateGalleryLimit(BaseModel):
    max_galleries: int


class UpdateStorageQuota(BaseModel):
    storage_quota: int


class LandingPageConfig(BaseModel):
    hero_title: str = "Share Your Photography, Beautifully"
    hero_subtitle: str = "Create stunning galleries, share with clients, and let them upload their own photos. The professional way to showcase and collaborate."
    brand_name: str = "PhotoShare"
    brand_tagline: Optional[str] = None
    favicon_url: Optional[str] = None
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
