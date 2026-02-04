"""
Feature toggle services
"""
from datetime import datetime, timezone
from core.database import db
from core.config import (
    ALL_OVERRIDE_MODES, ALL_PAYMENT_PLANS,
    DEFAULT_MODE_FEATURES, DEFAULT_PLAN_FEATURES,
    PLAN_FREE
)


async def get_global_feature_toggles():
    """Get global feature toggles from database or return defaults"""
    stored = await db.settings.find_one({"type": "global_feature_toggles"})
    
    result = {}
    
    # Override modes
    for mode in ALL_OVERRIDE_MODES:
        if stored and mode in stored:
            result[mode] = stored[mode]
        else:
            result[mode] = DEFAULT_MODE_FEATURES.get(mode, {}).copy()
    
    # Payment plans
    for plan in ALL_PAYMENT_PLANS:
        if stored and plan in stored:
            result[plan] = stored[plan]
        else:
            result[plan] = DEFAULT_PLAN_FEATURES.get(plan, {}).copy()
    
    return result


async def resolve_user_features(user: dict) -> dict:
    """
    Resolve user's features based on authority hierarchy:
    1. Admin Override Mode (highest) - if active and not expired
    2. Payment Plan
    """
    global_toggles = await get_global_feature_toggles()
    
    override_mode = user.get("override_mode")
    override_expires = user.get("override_expires")
    plan = user.get("plan", PLAN_FREE)
    
    # Check if override is active and not expired
    override_active = False
    if override_mode and override_expires:
        try:
            expire_date = datetime.fromisoformat(override_expires.replace('Z', '+00:00'))
            if expire_date > datetime.now(timezone.utc):
                override_active = True
        except:
            pass
    
    # Determine which feature set to use
    if override_active and override_mode in global_toggles:
        features = global_toggles[override_mode].copy()
        features["source"] = f"override:{override_mode}"
    elif plan in global_toggles:
        features = global_toggles[plan].copy()
        features["source"] = f"plan:{plan}"
    else:
        features = DEFAULT_PLAN_FEATURES.get(PLAN_FREE, {}).copy()
        features["source"] = "default:free"
    
    # Add user context
    features["user_plan"] = plan
    features["user_override"] = override_mode if override_active else None
    features["override_active"] = override_active
    
    return features
