"""
Notification and transaction services
"""
import uuid
from datetime import datetime, timezone
from core.database import db


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
                            rejection_reason: str = None):
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
        "created_at": datetime.now(timezone.utc).isoformat(),
        "resolved_at": None
    }
    await db.transactions.insert_one(transaction)
    return transaction
