"""
Billing and subscription-related Pydantic models
"""
from pydantic import BaseModel, Field
from typing import Optional

# Constants (duplicated from config to avoid circular imports)
PLAN_FREE = "free"
PLAN_STANDARD = "standard"
PLAN_PRO = "pro"
PAYMENT_NONE = "none"

DEFAULT_PRICING = {
    "standard_monthly": 1000,
    "pro_monthly": 1500,
    "extra_credit": 500
}

MODE_FOUNDERS_CIRCLE = "founders_circle"
MODE_EARLY_PARTNER_BETA = "early_partner_beta"
MODE_COMPED_PRO = "comped_pro"
MODE_COMPED_STANDARD = "comped_standard"
MODE_ENTERPRISE_ACCESS = "enterprise_access"

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
    },
    MODE_ENTERPRISE_ACCESS: {
        "unlimited_token": True,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": True,
        "collaboration_link": True
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


class SubscriptionInfo(BaseModel):
    plan: str = PLAN_FREE
    billing_cycle_start: Optional[str] = None
    event_credits: int = 0
    extra_credits: int = 0
    payment_status: str = PAYMENT_NONE
    payment_proof_url: Optional[str] = None
    payment_submitted_at: Optional[str] = None
    override_mode: Optional[str] = None
    override_expires: Optional[str] = None
    override_reason: Optional[str] = None
    override_assigned_at: Optional[str] = None


class AssignOverrideMode(BaseModel):
    user_id: str
    mode: str
    duration_months: int = Field(ge=1, le=24)
    reason: str


class RemoveOverrideMode(BaseModel):
    user_id: str
    reason: str


class UpdatePricing(BaseModel):
    standard_monthly: Optional[int] = None
    pro_monthly: Optional[int] = None
    extra_credit: Optional[int] = None


class PurchaseExtraCredits(BaseModel):
    quantity: int = Field(ge=1, le=10)


class PaymentProofSubmit(BaseModel):
    proof_url: str
    notes: Optional[str] = None


class ApprovePayment(BaseModel):
    user_id: str
    notes: Optional[str] = None


class RejectPayment(BaseModel):
    user_id: str
    reason: str


class PaymentMethod(BaseModel):
    enabled: bool = True
    name: str
    account_name: str = ""
    account_number: str = ""
    bank_name: Optional[str] = None
    qr_code_url: Optional[str] = None


class BillingSettings(BaseModel):
    billing_enforcement_enabled: bool = False
    pricing: dict = Field(default_factory=lambda: DEFAULT_PRICING.copy())
    payment_methods: dict = Field(default_factory=lambda: {
        "gcash": {
            "enabled": True,
            "name": "GCash",
            "account_name": "Less Real Moments",
            "account_number": "09952568450",
            "qr_code_url": None
        },
        "maya": {
            "enabled": True,
            "name": "Maya",
            "account_name": "Less Real Moments",
            "account_number": "09952568450",
            "qr_code_url": None
        },
        "bank": {
            "enabled": False,
            "name": "Bank Transfer",
            "account_name": "",
            "account_number": "",
            "bank_name": "",
            "qr_code_url": None
        }
    })
    # Universal paid plan settings (applies to Standard and Pro)
    paid_gallery_expiration_months: int = 6  # 1-6 months
    paid_storage_limit_gb: int = -1  # -1 = unlimited, or 10, 20, 30, etc.


class PaymentDispute(BaseModel):
    dispute_message: str
    new_proof_url: str


class Transaction(BaseModel):
    id: str
    user_id: str
    type: str
    amount: int
    plan: Optional[str] = None
    extra_credits: Optional[int] = None
    status: str
    payment_proof_url: Optional[str] = None
    admin_notes: Optional[str] = None
    rejection_reason: Optional[str] = None
    dispute_message: Optional[str] = None
    dispute_proof_url: Optional[str] = None
    created_at: str
    resolved_at: Optional[str] = None


class GlobalFeatureToggles(BaseModel):
    """Global feature toggles for all modes and plans"""
    founders_circle: dict = Field(default_factory=lambda: DEFAULT_MODE_FEATURES[MODE_FOUNDERS_CIRCLE].copy())
    early_partner_beta: dict = Field(default_factory=lambda: DEFAULT_MODE_FEATURES[MODE_EARLY_PARTNER_BETA].copy())
    comped_pro: dict = Field(default_factory=lambda: DEFAULT_MODE_FEATURES[MODE_COMPED_PRO].copy())
    comped_standard: dict = Field(default_factory=lambda: DEFAULT_MODE_FEATURES[MODE_COMPED_STANDARD].copy())
    free: dict = Field(default_factory=lambda: DEFAULT_PLAN_FEATURES[PLAN_FREE].copy())
    standard: dict = Field(default_factory=lambda: DEFAULT_PLAN_FEATURES[PLAN_STANDARD].copy())
    pro: dict = Field(default_factory=lambda: DEFAULT_PLAN_FEATURES[PLAN_PRO].copy())


class FeatureToggle(BaseModel):
    qr_share_enabled: bool = True
    guest_upload_enabled: bool = True
    display_mode_enabled: bool = True
    contributor_link_enabled: bool = True


class UserFeatureToggle(BaseModel):
    qr_share_enabled: Optional[bool] = None
    guest_upload_enabled: Optional[bool] = None
    display_mode_enabled: Optional[bool] = None
    contributor_link_enabled: Optional[bool] = None


class UpgradeRequest(BaseModel):
    requested_plan: str
    proof_url: str


class ExtraCreditRequest(BaseModel):
    quantity: int = Field(ge=1, le=10, default=1)
    proof_url: str
