"""
Billing and subscription services
"""
from datetime import datetime, timezone, timedelta
from core.database import db
from core.config import (
    PLAN_FREE, PLAN_STANDARD, PLAN_PRO, PAYMENT_PENDING, PAYMENT_APPROVED,
    MODE_FOUNDERS_CIRCLE, MODE_EARLY_PARTNER_BETA, MODE_COMPED_PRO, MODE_COMPED_STANDARD,
    PLAN_CREDITS, MODE_CREDITS, DEFAULT_PRICING
)


def get_effective_plan(user: dict) -> str:
    """
    Get user's effective plan based on authority hierarchy:
    1. Admin Override Mode (highest)
    2. Payment Plan
    """
    override_mode = user.get("override_mode")
    override_expires = user.get("override_expires")
    
    # Check if override is active and not expired
    if override_mode and override_expires:
        try:
            expire_date = datetime.fromisoformat(override_expires.replace('Z', '+00:00'))
            if expire_date > datetime.now(timezone.utc):
                # Map override mode to effective plan
                if override_mode in [MODE_FOUNDERS_CIRCLE, MODE_EARLY_PARTNER_BETA, MODE_COMPED_PRO]:
                    return PLAN_PRO
                elif override_mode == MODE_COMPED_STANDARD:
                    return PLAN_STANDARD
        except:
            pass
    
    return user.get("plan", PLAN_FREE)


def get_effective_credits(user: dict) -> int:
    """Get user's effective credits based on plan/mode"""
    override_mode = user.get("override_mode")
    override_expires = user.get("override_expires")
    
    # Check if override is active
    if override_mode and override_expires:
        try:
            expire_date = datetime.fromisoformat(override_expires.replace('Z', '+00:00'))
            if expire_date > datetime.now(timezone.utc):
                mode_credits = MODE_CREDITS.get(override_mode)
                if mode_credits == -1:  # Unlimited
                    return 999
                elif mode_credits is not None:
                    return user.get("event_credits", 0) + user.get("extra_credits", 0)
        except:
            pass
    
    # Regular plan credits
    return user.get("event_credits", 0) + user.get("extra_credits", 0)


def is_feature_enabled_for_user(user: dict, feature: str) -> bool:
    """Check if a specific feature is enabled for the user"""
    plan = get_effective_plan(user)
    
    # Pro features only available to Pro users
    if feature in ["display_mode", "contributor_link"]:
        return plan == PLAN_PRO
    
    # Standard features available to Standard and Pro
    if feature in ["qr_share", "online_gallery", "owner_uploads", "guest_uploads"]:
        return plan in [PLAN_STANDARD, PLAN_PRO]
    
    return False


def can_download(user: dict) -> bool:
    """Check if user can download (not blocked by pending payment)"""
    payment_status = user.get("payment_status", "none")
    return payment_status != PAYMENT_PENDING


async def get_billing_settings() -> dict:
    """Get billing settings from database or return defaults"""
    settings = await db.settings.find_one({"type": "billing"})
    if settings:
        return {
            "billing_enforcement_enabled": settings.get("billing_enforcement_enabled", False),
            "pricing": settings.get("pricing", DEFAULT_PRICING),
            "payment_methods": settings.get("payment_methods", {})
        }
    return {
        "billing_enforcement_enabled": False,
        "pricing": DEFAULT_PRICING,
        "payment_methods": {
            "gcash": {"enabled": True, "name": "GCash", "account_name": "Less Real Moments", "account_number": "09952568450", "qr_code_url": None},
            "maya": {"enabled": True, "name": "Maya", "account_name": "Less Real Moments", "account_number": "09952568450", "qr_code_url": None},
            "bank": {"enabled": False, "name": "Bank Transfer", "account_name": "", "account_number": "", "bank_name": "", "qr_code_url": None}
        }
    }


async def reset_user_credits_if_needed(user_id: str):
    """Reset user credits if billing cycle has reset (monthly)"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        return
    
    billing_cycle_start = user.get("billing_cycle_start")
    if not billing_cycle_start:
        return
    
    try:
        cycle_start = datetime.fromisoformat(billing_cycle_start.replace('Z', '+00:00'))
        now = datetime.now(timezone.utc)
        
        # Check if 30 days have passed since cycle start
        days_since_cycle_start = (now - cycle_start).days
        if days_since_cycle_start >= 30:
            # Reset credits based on plan
            plan = get_effective_plan(user)
            override_mode = user.get("override_mode")
            
            # Determine new credit amount
            if override_mode and MODE_CREDITS.get(override_mode) == -1:
                new_credits = 999  # Unlimited for founders
            else:
                new_credits = PLAN_CREDITS.get(plan, 0)
            
            # Update user
            await db.users.update_one(
                {"id": user_id},
                {
                    "$set": {
                        "event_credits": new_credits,
                        "extra_credits": 0,  # Extra credits don't roll over
                        "billing_cycle_start": now.isoformat()
                    }
                }
            )
    except Exception as e:
        pass  # Silently fail, don't break the flow
