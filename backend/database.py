"""Database connection and configuration"""
import os
import asyncio
import logging
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection with optimized pooling
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(
    mongo_url,
    maxPoolSize=100,
    minPoolSize=10,
    maxIdleTimeMS=30000,
    connectTimeoutMS=5000,
    serverSelectionTimeoutMS=5000,
    waitQueueTimeoutMS=10000
)
db = client[os.environ['DB_NAME']]

# Upload directory
UPLOAD_DIR = ROOT_DIR / 'uploads'
UPLOAD_DIR.mkdir(exist_ok=True)

# Concurrency control
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

# Default limits
DEFAULT_MAX_GALLERIES = 1
DEFAULT_STORAGE_QUOTA = 500 * 1024 * 1024  # 500 MB
GALLERY_EXPIRATION_DAYS = 180
GALLERY_EDIT_LOCK_DAYS = 7

# Google Drive OAuth
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', '')
GOOGLE_DRIVE_REDIRECT_URI = os.environ.get('GOOGLE_DRIVE_REDIRECT_URI', '')
FRONTEND_URL = os.environ.get('FRONTEND_URL', '')
GOOGLE_DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file']
DRIVE_SYNC_INTERVAL = 5 * 60  # 5 minutes
