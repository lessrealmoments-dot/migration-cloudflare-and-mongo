"""
RSVP Token models for invitation creation
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

# Default RSVP token price in pesos
DEFAULT_RSVP_TOKEN_PRICE = 500


class RSVPTokenBalance(BaseModel):
    """User's RSVP token balance"""
    user_id: str
    purchased_tokens: int = 0
    used_tokens: int = 0
    available_tokens: int = 0
    has_unlimited: bool = False
    unlimited_reason: Optional[str] = None  # "founders_override", "admin_grant", etc.


class RSVPTokenPurchase(BaseModel):
    """Purchase RSVP tokens"""
    quantity: int = Field(ge=1, le=50, default=1)
    proof_url: str


class RSVPTokenTransaction(BaseModel):
    """RSVP token transaction record"""
    id: str
    user_id: str
    transaction_type: str  # "purchase", "use", "admin_grant", "refund", "expire"
    quantity: int
    price_paid: Optional[int] = None  # Only for purchases
    invitation_id: Optional[str] = None  # Only for "use" type
    notes: Optional[str] = None
    created_at: str
    expires_at: Optional[str] = None  # For purchased tokens (1 year expiry)


class AdminGrantRSVPTokens(BaseModel):
    """Admin grant RSVP tokens to user"""
    user_id: str
    quantity: int = Field(ge=-1)  # -1 = unlimited
    reason: str


class AdminRevokeUnlimitedRSVP(BaseModel):
    """Admin revoke unlimited RSVP tokens from user"""
    user_id: str
    reason: str


class RSVPTokenSettings(BaseModel):
    """RSVP token pricing settings"""
    token_price: int = DEFAULT_RSVP_TOKEN_PRICE
    expiry_months: int = 12  # Tokens expire after this many months


class UpdateRSVPTokenPrice(BaseModel):
    """Update RSVP token price"""
    token_price: int = Field(ge=0)
