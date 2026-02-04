"""
Database connection and initialization
"""
import os
from motor.motor_asyncio import AsyncIOMotorClient

mongo_url = os.environ['MONGO_URL']

# Optimized MongoDB connection with connection pooling
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


async def create_database_indexes():
    """Create necessary indexes for optimal query performance"""
    # Users collection indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("plan")
    await db.users.create_index("payment_status")
    await db.users.create_index("override_mode")
    
    # Galleries collection indexes
    await db.galleries.create_index("photographer_id")
    await db.galleries.create_index("share_link", unique=True)
    await db.galleries.create_index("auto_delete_date")
    await db.galleries.create_index([("photographer_id", 1), ("created_at", -1)])
    
    # Photos collection indexes
    await db.photos.create_index("gallery_id")
    await db.photos.create_index([("gallery_id", 1), ("order", 1)])
    await db.photos.create_index("is_flagged")
    await db.photos.create_index("uploaded_by")
    
    # Notifications indexes
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.notifications.create_index([("user_id", 1), ("read", 1)])
    
    # Transactions indexes
    await db.transactions.create_index([("user_id", 1), ("created_at", -1)])
    await db.transactions.create_index("status")
    
    # Analytics indexes
    await db.analytics_events.create_index([("gallery_id", 1), ("event_type", 1)])
    await db.analytics_events.create_index([("gallery_id", 1), ("created_at", -1)])
    await db.analytics_events.create_index("created_at")
    
    # Activity logs indexes
    await db.activity_logs.create_index([("created_at", -1)])
    await db.activity_logs.create_index("action")
