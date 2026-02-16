"""
RSVP Token routes for invitation creation tokens
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone, timedelta
from typing import Optional
import secrets
import os

from models.rsvp_token import (
    RSVPTokenBalance,
    RSVPTokenPurchase,
    RSVPTokenTransaction,
    AdminGrantRSVPTokens,
    AdminRevokeUnlimitedRSVP,
    UpdateRSVPTokenPrice,
    DEFAULT_RSVP_TOKEN_PRICE
)

router = APIRouter(prefix="/api/rsvp-tokens", tags=["rsvp-tokens"])

# Get database from server.py (will be injected)
db = None

def set_database(database):
    global db
    db = database


def get_current_user_id(request) -> str:
    """Extract user ID from request - simplified version"""
    from fastapi import Request
    # This will be replaced with proper auth in server.py integration
    return None


async def get_rsvp_token_settings():
    """Get RSVP token settings from database"""
    settings = await db.settings.find_one({"type": "rsvp_token_settings"})
    if not settings:
        return {
            "token_price": DEFAULT_RSVP_TOKEN_PRICE,
            "expiry_months": 12
        }
    return settings


async def check_user_has_unlimited_rsvp(user_id: str) -> tuple[bool, str]:
    """Check if user has unlimited RSVP tokens"""
    # Check for founder's override - try both _id and id field
    user = await db.users.find_one({"_id": user_id})
    if not user:
        user = await db.users.find_one({"id": user_id})
    
    if user:
        override_mode = user.get("override_mode")
        override_expires = user.get("override_expires")
        
        # Check if override is still valid
        if override_mode and override_expires:
            try:
                from datetime import datetime, timezone
                if isinstance(override_expires, str):
                    expires_dt = datetime.fromisoformat(override_expires.replace('Z', '+00:00'))
                else:
                    expires_dt = override_expires
                    
                if datetime.now(timezone.utc) < expires_dt:
                    if override_mode == "founders_circle":
                        return True, "founders_override"
                    if override_mode == "enterprise_access":
                        return True, "enterprise_access"
            except (ValueError, TypeError):
                pass
    
    # Check for admin-granted unlimited
    unlimited_grant = await db.rsvp_token_grants.find_one({
        "user_id": user_id,
        "unlimited": True,
        "revoked": {"$ne": True}
    })
    if unlimited_grant:
        return True, "admin_grant"
    
    return False, None


async def get_user_token_balance(user_id: str) -> RSVPTokenBalance:
    """Calculate user's available RSVP token balance"""
    # Check for unlimited first
    has_unlimited, unlimited_reason = await check_user_has_unlimited_rsvp(user_id)
    if has_unlimited:
        return RSVPTokenBalance(
            user_id=user_id,
            purchased_tokens=0,
            used_tokens=0,
            available_tokens=999999,
            has_unlimited=True,
            unlimited_reason=unlimited_reason
        )
    
    # Get all non-expired purchased tokens
    now = datetime.now(timezone.utc)
    
    # Count purchased tokens that haven't expired
    purchased_cursor = db.rsvp_token_transactions.find({
        "user_id": user_id,
        "transaction_type": "purchase",
        "status": "approved",
        "$or": [
            {"expires_at": {"$gt": now.isoformat()}},
            {"expires_at": None}
        ]
    })
    purchased_tokens = 0
    async for txn in purchased_cursor:
        purchased_tokens += txn.get("quantity", 0)
    
    # Add admin-granted tokens
    grants_cursor = db.rsvp_token_grants.find({
        "user_id": user_id,
        "unlimited": {"$ne": True},
        "revoked": {"$ne": True}
    })
    async for grant in grants_cursor:
        purchased_tokens += grant.get("quantity", 0)
    
    # Count used tokens
    used_cursor = db.rsvp_token_transactions.find({
        "user_id": user_id,
        "transaction_type": "use"
    })
    used_tokens = 0
    async for txn in used_cursor:
        used_tokens += txn.get("quantity", 0)
    
    available = max(0, purchased_tokens - used_tokens)
    
    return RSVPTokenBalance(
        user_id=user_id,
        purchased_tokens=purchased_tokens,
        used_tokens=used_tokens,
        available_tokens=available,
        has_unlimited=False,
        unlimited_reason=None
    )


async def consume_rsvp_token(user_id: str, invitation_id: str) -> bool:
    """Consume one RSVP token when creating an invitation"""
    # Check if user has unlimited
    has_unlimited, _ = await check_user_has_unlimited_rsvp(user_id)
    if has_unlimited:
        # Log usage but don't actually consume
        await db.rsvp_token_transactions.insert_one({
            "user_id": user_id,
            "transaction_type": "use",
            "quantity": 1,
            "invitation_id": invitation_id,
            "notes": "Unlimited token - no consumption",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        return True
    
    # Check balance
    balance = await get_user_token_balance(user_id)
    if balance.available_tokens < 1:
        return False
    
    # Record token usage
    await db.rsvp_token_transactions.insert_one({
        "user_id": user_id,
        "transaction_type": "use",
        "quantity": 1,
        "invitation_id": invitation_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return True


# ============ User Routes ============

@router.get("/balance")
async def get_balance(user_id: str):
    """Get user's RSVP token balance"""
    balance = await get_user_token_balance(user_id)
    return {
        "purchased_tokens": balance.purchased_tokens,
        "used_tokens": balance.used_tokens,
        "available_tokens": balance.available_tokens,
        "has_unlimited": balance.has_unlimited,
        "unlimited_reason": balance.unlimited_reason
    }


@router.get("/price")
async def get_token_price():
    """Get current RSVP token price"""
    settings = await get_rsvp_token_settings()
    return {
        "token_price": settings.get("token_price", DEFAULT_RSVP_TOKEN_PRICE),
        "currency": "PHP"
    }


@router.post("/purchase")
async def purchase_tokens(user_id: str, purchase: RSVPTokenPurchase):
    """Submit a token purchase request (requires payment proof)"""
    settings = await get_rsvp_token_settings()
    token_price = settings.get("token_price", DEFAULT_RSVP_TOKEN_PRICE)
    total_amount = token_price * purchase.quantity
    expiry_months = settings.get("expiry_months", 12)
    
    # Calculate expiry date
    expires_at = datetime.now(timezone.utc) + timedelta(days=expiry_months * 30)
    
    # Create pending transaction
    transaction = {
        "id": secrets.token_urlsafe(16),
        "user_id": user_id,
        "transaction_type": "purchase",
        "quantity": purchase.quantity,
        "price_paid": total_amount,
        "proof_url": purchase.proof_url,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": expires_at.isoformat()
    }
    
    await db.rsvp_token_transactions.insert_one(transaction)
    
    return {
        "message": "Purchase request submitted. Awaiting admin approval.",
        "transaction_id": transaction["id"],
        "quantity": purchase.quantity,
        "total_amount": total_amount
    }


@router.get("/transactions")
async def get_transactions(user_id: str, limit: int = 20):
    """Get user's RSVP token transaction history"""
    cursor = db.rsvp_token_transactions.find(
        {"user_id": user_id}
    ).sort("created_at", -1).limit(limit)
    
    transactions = []
    async for txn in cursor:
        txn["id"] = str(txn.pop("_id", txn.get("id", "")))
        transactions.append(txn)
    
    return transactions


# ============ Admin Routes ============

@router.post("/admin/grant")
async def admin_grant_tokens(grant: AdminGrantRSVPTokens):
    """Admin grants RSVP tokens to a user"""
    # Verify user exists
    user = await db.users.find_one({"_id": grant.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    is_unlimited = grant.quantity == -1
    
    # Create grant record
    grant_record = {
        "id": secrets.token_urlsafe(16),
        "user_id": grant.user_id,
        "quantity": grant.quantity if not is_unlimited else 0,
        "unlimited": is_unlimited,
        "reason": grant.reason,
        "granted_at": datetime.now(timezone.utc).isoformat(),
        "revoked": False
    }
    
    await db.rsvp_token_grants.insert_one(grant_record)
    
    # Log transaction
    await db.rsvp_token_transactions.insert_one({
        "user_id": grant.user_id,
        "transaction_type": "admin_grant",
        "quantity": grant.quantity,
        "notes": f"Admin grant: {grant.reason}",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "message": f"Successfully granted {'unlimited' if is_unlimited else grant.quantity} RSVP tokens to user",
        "user_id": grant.user_id,
        "quantity": "unlimited" if is_unlimited else grant.quantity
    }


@router.post("/admin/revoke-unlimited")
async def admin_revoke_unlimited(revoke: AdminRevokeUnlimitedRSVP):
    """Admin revokes unlimited RSVP tokens from a user"""
    # Find and revoke unlimited grant
    result = await db.rsvp_token_grants.update_many(
        {"user_id": revoke.user_id, "unlimited": True, "revoked": {"$ne": True}},
        {
            "$set": {
                "revoked": True,
                "revoked_at": datetime.now(timezone.utc).isoformat(),
                "revoke_reason": revoke.reason
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="No unlimited grant found for this user")
    
    return {
        "message": "Unlimited RSVP tokens revoked",
        "user_id": revoke.user_id
    }


@router.put("/admin/settings/price")
async def update_token_price(update: UpdateRSVPTokenPrice):
    """Admin updates RSVP token price"""
    await db.settings.update_one(
        {"type": "rsvp_token_settings"},
        {
            "$set": {
                "token_price": update.token_price,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        },
        upsert=True
    )
    
    return {
        "message": "RSVP token price updated",
        "new_price": update.token_price
    }


@router.get("/admin/settings")
async def get_admin_settings():
    """Get RSVP token admin settings"""
    settings = await get_rsvp_token_settings()
    return settings


@router.get("/admin/pending-purchases")
async def get_pending_purchases():
    """Get all pending RSVP token purchases"""
    cursor = db.rsvp_token_transactions.find({
        "transaction_type": "purchase",
        "status": "pending"
    }).sort("created_at", -1)
    
    pending = []
    async for txn in cursor:
        # Get user info
        user = await db.users.find_one({"_id": txn["user_id"]})
        txn["id"] = str(txn.pop("_id", txn.get("id", "")))
        txn["user_email"] = user.get("email") if user else "Unknown"
        txn["user_name"] = user.get("name") if user else "Unknown"
        pending.append(txn)
    
    return pending


@router.post("/admin/approve/{transaction_id}")
async def approve_purchase(transaction_id: str, notes: Optional[str] = None):
    """Admin approves a token purchase"""
    result = await db.rsvp_token_transactions.update_one(
        {"id": transaction_id, "status": "pending"},
        {
            "$set": {
                "status": "approved",
                "approved_at": datetime.now(timezone.utc).isoformat(),
                "admin_notes": notes
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found or already processed")
    
    return {"message": "Purchase approved", "transaction_id": transaction_id}


@router.post("/admin/reject/{transaction_id}")
async def reject_purchase(transaction_id: str, reason: str):
    """Admin rejects a token purchase"""
    result = await db.rsvp_token_transactions.update_one(
        {"id": transaction_id, "status": "pending"},
        {
            "$set": {
                "status": "rejected",
                "rejected_at": datetime.now(timezone.utc).isoformat(),
                "rejection_reason": reason
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found or already processed")
    
    return {"message": "Purchase rejected", "transaction_id": transaction_id}


@router.get("/admin/user/{user_id}")
async def get_user_token_info(user_id: str):
    """Get detailed token info for a specific user (admin)"""
    balance = await get_user_token_balance(user_id)
    
    # Get user info
    user = await db.users.find_one({"_id": user_id})
    
    # Get recent transactions
    cursor = db.rsvp_token_transactions.find(
        {"user_id": user_id}
    ).sort("created_at", -1).limit(10)
    
    transactions = []
    async for txn in cursor:
        txn["id"] = str(txn.pop("_id", txn.get("id", "")))
        transactions.append(txn)
    
    return {
        "user_id": user_id,
        "user_email": user.get("email") if user else "Unknown",
        "user_name": user.get("name") if user else "Unknown",
        "override_mode": user.get("override_mode") if user else None,
        "balance": {
            "purchased_tokens": balance.purchased_tokens,
            "used_tokens": balance.used_tokens,
            "available_tokens": balance.available_tokens,
            "has_unlimited": balance.has_unlimited,
            "unlimited_reason": balance.unlimited_reason
        },
        "recent_transactions": transactions
    }
