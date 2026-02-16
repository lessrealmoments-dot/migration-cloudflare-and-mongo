"""
Invitation and RSVP Pydantic models
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime


# RSVP Field Configuration
class RSVPFieldConfig(BaseModel):
    """Configuration for a single RSVP form field"""
    field_id: str
    field_type: str  # text, select, number, textarea, checkbox
    label: str
    placeholder: Optional[str] = None
    required: bool = False
    enabled: bool = True
    options: Optional[List[str]] = None  # For select/checkbox fields
    max_value: Optional[int] = None  # For number fields (e.g., max guests)


# RSVP Response from a guest
class RSVPResponse(BaseModel):
    """A single guest's RSVP response"""
    model_config = ConfigDict(extra="ignore")
    id: str
    invitation_id: str
    guest_name: str
    guest_email: Optional[str] = None
    guest_phone: Optional[str] = None
    attendance_status: str  # attending, not_attending, maybe
    guest_count: int = 1  # Number of people attending (including +1s)
    responses: dict = {}  # Custom field responses {field_id: value}
    message: Optional[str] = None  # Guest message/notes
    submitted_at: str
    ip_address: Optional[str] = None


class RSVPResponseCreate(BaseModel):
    """Create RSVP response request"""
    guest_name: str
    guest_email: Optional[str] = None
    guest_phone: Optional[str] = None
    attendance_status: str  # attending, not_attending, maybe
    guest_count: int = 1
    responses: dict = {}  # Custom field responses
    message: Optional[str] = None


# Invitation Templates
class InvitationTemplate(BaseModel):
    """Pre-designed invitation template"""
    id: str
    name: str
    category: str  # wedding, birthday, corporate, celebration
    preview_image_url: str
    theme_colors: dict  # {primary, secondary, accent, background, text}
    font_family: str
    layout_style: str  # classic, modern, minimal, elegant
    is_premium: bool = False


# Invitation Design Settings
class InvitationDesign(BaseModel):
    """Custom design settings for an invitation"""
    template_id: Optional[str] = None
    cover_image_url: Optional[str] = None
    background_color: str = "#ffffff"
    primary_color: str = "#1a1a1a"
    secondary_color: str = "#666666"
    accent_color: str = "#d4a574"
    font_family: str = "Playfair Display"
    custom_css: Optional[str] = None


# Main Invitation Model
class Invitation(BaseModel):
    """Full invitation with all details"""
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    
    # Basic Info
    title: str
    event_type: str  # wedding, birthday, corporate, baby_shower, etc.
    host_names: str  # "John & Jane" or "ABC Company"
    
    # Event Details
    event_date: Optional[str] = None
    event_time: Optional[str] = None
    event_end_time: Optional[str] = None
    venue_name: Optional[str] = None
    venue_address: Optional[str] = None
    venue_map_url: Optional[str] = None  # Google Maps link
    
    # Invitation Content
    message: Optional[str] = None  # Main invitation message
    additional_info: Optional[str] = None  # Dress code, parking, etc.
    
    # External Invitation Link (for clients using other services like Canva)
    external_invitation_url: Optional[str] = None
    
    # Design
    design: InvitationDesign
    
    # RSVP Settings
    rsvp_enabled: bool = True
    rsvp_deadline: Optional[str] = None
    rsvp_fields: List[RSVPFieldConfig] = []
    max_guests_per_rsvp: int = 5
    
    # Sharing
    share_link: str
    qr_code_url: Optional[str] = None
    is_public: bool = True
    password: Optional[str] = None
    
    # Gallery Link (optional - linked later)
    linked_gallery_id: Optional[str] = None
    linked_gallery_share_link: Optional[str] = None
    
    # Stats
    total_views: int = 0
    total_rsvps: int = 0
    attending_count: int = 0
    not_attending_count: int = 0
    maybe_count: int = 0
    total_guests: int = 0  # Sum of all guest_count from attending RSVPs
    
    # Metadata
    created_at: str
    updated_at: Optional[str] = None
    status: str = "draft"  # draft, published, archived


class InvitationCreate(BaseModel):
    """Create invitation request"""
    title: str
    event_type: str
    host_names: str
    event_date: Optional[str] = None
    event_time: Optional[str] = None
    event_end_time: Optional[str] = None
    venue_name: Optional[str] = None
    venue_address: Optional[str] = None
    venue_map_url: Optional[str] = None
    message: Optional[str] = None
    additional_info: Optional[str] = None
    design: Optional[InvitationDesign] = None
    rsvp_enabled: bool = True
    rsvp_deadline: Optional[str] = None
    rsvp_fields: Optional[List[RSVPFieldConfig]] = None
    max_guests_per_rsvp: int = 5
    password: Optional[str] = None


class InvitationUpdate(BaseModel):
    """Update invitation request"""
    title: Optional[str] = None
    host_names: Optional[str] = None
    event_date: Optional[str] = None
    event_time: Optional[str] = None
    event_end_time: Optional[str] = None
    venue_name: Optional[str] = None
    venue_address: Optional[str] = None
    venue_map_url: Optional[str] = None
    message: Optional[str] = None
    additional_info: Optional[str] = None
    design: Optional[InvitationDesign] = None
    rsvp_enabled: Optional[bool] = None
    rsvp_deadline: Optional[str] = None
    rsvp_fields: Optional[List[RSVPFieldConfig]] = None
    max_guests_per_rsvp: Optional[int] = None
    password: Optional[str] = None
    is_public: Optional[bool] = None
    status: Optional[str] = None
    linked_gallery_id: Optional[str] = None


class InvitationSummary(BaseModel):
    """Summary view for invitation list"""
    model_config = ConfigDict(extra="ignore")
    id: str
    title: str
    event_type: str
    host_names: str
    event_date: Optional[str] = None
    share_link: str
    status: str
    total_rsvps: int = 0
    attending_count: int = 0
    total_guests: int = 0
    linked_gallery_id: Optional[str] = None
    created_at: str
    cover_image_url: Optional[str] = None


# Public Invitation View (for guests)
class PublicInvitation(BaseModel):
    """Public view of invitation for guests"""
    model_config = ConfigDict(extra="ignore")
    id: str
    title: str
    event_type: str
    host_names: str
    event_date: Optional[str] = None
    event_time: Optional[str] = None
    event_end_time: Optional[str] = None
    venue_name: Optional[str] = None
    venue_address: Optional[str] = None
    venue_map_url: Optional[str] = None
    message: Optional[str] = None
    additional_info: Optional[str] = None
    design: InvitationDesign
    rsvp_enabled: bool
    rsvp_deadline: Optional[str] = None
    rsvp_fields: List[RSVPFieldConfig] = []
    max_guests_per_rsvp: int = 5
    linked_gallery_share_link: Optional[str] = None
    has_password: bool = False


# RSVP Stats
class RSVPStats(BaseModel):
    """RSVP statistics for an invitation"""
    total_rsvps: int = 0
    attending_count: int = 0
    not_attending_count: int = 0
    maybe_count: int = 0
    total_guests: int = 0  # Sum of guest_count from attending
    pending_count: int = 0  # Sent but not responded (future feature)
    responses_by_date: dict = {}  # {date: count}
