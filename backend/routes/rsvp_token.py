"""
RSVP Token routes for invitation creation tokens
"""
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
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
# Email functions - will be injected from server.py
send_email_func = None
get_email_template_func = None
ADMIN_EMAIL = None
FRONTEND_URL = None

def set_database(database):
    global db
    db = database

def set_email_functions(send_email, get_email_template, admin_email, frontend_url):
    global send_email_func, get_email_template_func, ADMIN_EMAIL, FRONTEND_URL
    send_email_func = send_email
    get_email_template_func = get_email_template
    ADMIN_EMAIL = admin_email
    FRONTEND_URL = frontend_url


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
async def purchase_tokens(user_id: str, purchase: RSVPTokenPurchase, background_tasks: BackgroundTasks):
    """Submit a token purchase request (requires payment proof)"""
    settings = await get_rsvp_token_settings()
    token_price = settings.get("token_price", DEFAULT_RSVP_TOKEN_PRICE)
    total_amount = token_price * purchase.quantity
    expiry_months = settings.get("expiry_months", 12)
    
    # Get user info for email
    user = await db.users.find_one({"_id": user_id})
    if not user:
        user = await db.users.find_one({"id": user_id})
    
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
    
    # Send email notifications
    if send_email_func and get_email_template_func and user:
        user_name = user.get("name", "User")
        user_email = user.get("email", "")
        admin_url = f"{FRONTEND_URL or ''}/admin/dashboard"
        
        # Email to Admin
        admin_subject, admin_html = get_email_template_func("admin_rsvp_token_purchase", {
            "name": user_name,
            "email": user_email,
            "quantity": purchase.quantity,
            "amount": total_amount,
            "submitted_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            "admin_url": admin_url
        })
        background_tasks.add_task(send_email_func, ADMIN_EMAIL, admin_subject, admin_html)
        
        # Email to User
        if user_email:
            user_subject, user_html = get_email_template_func("customer_rsvp_token_pending", {
                "name": user_name,
                "quantity": purchase.quantity,
                "amount": total_amount
            })
            background_tasks.add_task(send_email_func, user_email, user_subject, user_html)
    
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
        # Get user info - try both _id and id field
        user = await db.users.find_one({"_id": txn["user_id"]})
        if not user:
            user = await db.users.find_one({"id": txn["user_id"]})
        
        # Remove MongoDB _id but keep the custom id field
        txn.pop("_id", None)
        txn["user_email"] = user.get("email") if user else "Unknown"
        txn["user_name"] = user.get("name") if user else "Unknown"
        pending.append(txn)
    
    return pending


@router.post("/admin/approve/{transaction_id}")
async def approve_purchase(transaction_id: str, background_tasks: BackgroundTasks, notes: Optional[str] = None):
    """Admin approves a token purchase"""
    # Get transaction info before updating
    transaction = await db.rsvp_token_transactions.find_one({"id": transaction_id, "status": "pending"})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found or already processed")
    
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
    
    # Send approval email to user
    if send_email_func and get_email_template_func:
        user_id = transaction.get("user_id")
        user = await db.users.find_one({"_id": user_id})
        if not user:
            user = await db.users.find_one({"id": user_id})
        
        if user:
            # Get new balance
            balance = await get_user_token_balance(user_id)
            dashboard_url = f"{FRONTEND_URL or ''}/invitations"
            
            subject, html = get_email_template_func("customer_rsvp_token_approved", {
                "name": user.get("name", "User"),
                "quantity": transaction.get("quantity", 0),
                "new_balance": balance.available_tokens,
                "expires_at": transaction.get("expires_at", "12 months from purchase"),
                "dashboard_url": dashboard_url
            })
            background_tasks.add_task(send_email_func, user.get("email"), subject, html)
    
    return {"message": "Purchase approved", "transaction_id": transaction_id}


@router.post("/admin/reject/{transaction_id}")
async def reject_purchase(transaction_id: str, reason: str, background_tasks: BackgroundTasks):
    """Admin rejects a token purchase"""
    # Get transaction info before updating
    transaction = await db.rsvp_token_transactions.find_one({"id": transaction_id, "status": "pending"})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found or already processed")
    
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
    
    # Send rejection email to user
    if send_email_func and get_email_template_func:
        user_id = transaction.get("user_id")
        user = await db.users.find_one({"_id": user_id})
        if not user:
            user = await db.users.find_one({"id": user_id})
        
        if user:
            subject, html = get_email_template_func("customer_rsvp_token_rejected", {
                "name": user.get("name", "User"),
                "reason": reason
            })
            background_tasks.add_task(send_email_func, user.get("email"), subject, html)
    
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
