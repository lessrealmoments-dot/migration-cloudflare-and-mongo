"""
Application configuration and constants
"""
import os
from pathlib import Path
from dotenv import load_dotenv
import logging
import asyncio
import resend

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

# Upload directories
UPLOAD_DIR = ROOT_DIR / 'uploads'
UPLOAD_DIR.mkdir(exist_ok=True)
THUMBNAILS_DIR = UPLOAD_DIR / 'thumbnails'
THUMBNAILS_DIR.mkdir(exist_ok=True)

# Concurrency control for uploads
MAX_CONCURRENT_UPLOADS = 50
upload_semaphore = asyncio.Semaphore(MAX_CONCURRENT_UPLOADS)

# JWT configuration
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
DEFAULT_MAX_GALLERIES = 1

# Default storage quota (in bytes) - 500 MB for Free
DEFAULT_STORAGE_QUOTA = 500 * 1024 * 1024

# Plan-based storage quotas (in bytes)
PLAN_STORAGE_QUOTAS = {
    "free": 500 * 1024 * 1024,
    "standard": 10 * 1024 * 1024 * 1024,
    "pro": 10 * 1024 * 1024 * 1024
}

# Gallery expiration settings
GALLERY_EXPIRATION_DAYS = 180
FREE_GALLERY_EXPIRATION_HOURS = 6
GALLERY_EDIT_LOCK_DAYS = 7
DEMO_FEATURE_WINDOW_HOURS = 6

# ============================================
# SUBSCRIPTION & BILLING CONSTANTS
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

ALL_OVERRIDE_MODES = [MODE_FOUNDERS_CIRCLE, MODE_EARLY_PARTNER_BETA, MODE_COMPED_PRO, MODE_COMPED_STANDARD]
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
    PLAN_FREE: 0,
    PLAN_STANDARD: 2,
    PLAN_PRO: 2
}

# Mode credits (override)
MODE_CREDITS = {
    MODE_FOUNDERS_CIRCLE: -1,  # -1 = unlimited
    MODE_EARLY_PARTNER_BETA: 2,
    MODE_COMPED_PRO: 2,
    MODE_COMPED_STANDARD: 2
}

# ============================================
# FEATURE TOGGLE DEFAULTS
# ============================================

DEFAULT_MODE_FEATURES = {
    MODE_FOUNDERS_CIRCLE: {
        "unlimited_token": True,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": True,
        "collaboration_link": True
    },
    MODE_EARLY_PARTNER_BETA: {
        "unlimited_token": False,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": True,
        "collaboration_link": True
    },
    MODE_COMPED_PRO: {
        "unlimited_token": False,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": True,
        "collaboration_link": True
    },
    MODE_COMPED_STANDARD: {
        "unlimited_token": False,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": False,
        "collaboration_link": False
    }
}

DEFAULT_PLAN_FEATURES = {
    PLAN_FREE: {
        "unlimited_token": False,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": True,
        "collaboration_link": True
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

STANDARD_FEATURES = ["qr_share", "online_gallery", "owner_uploads", "guest_uploads"]
PRO_FEATURES = ["display_mode", "contributor_link", "supplier_sections", "supplier_attribution", "photographer_moderation"]

# Image optimization settings
THUMBNAIL_SIZES = {
    'small': (300, 300),
    'medium': (800, 800),
    'large': (1600, 1600),
}
JPEG_QUALITY = 85
