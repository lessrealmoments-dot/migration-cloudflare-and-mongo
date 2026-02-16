"""
Invitation and RSVP API Routes
"""
from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import secrets
import qrcode
import io

from models.invitation import (
    Invitation, InvitationCreate, InvitationUpdate, InvitationSummary,
    PublicInvitation, RSVPResponse, RSVPResponseCreate, RSVPStats,
    RSVPFieldConfig, InvitationDesign, ManualGuestAdd
)

invitation_router = APIRouter()


# Default RSVP fields that users can enable/disable
DEFAULT_RSVP_FIELDS = [
    RSVPFieldConfig(
        field_id="attendance",
        field_type="select",
        label="Will you attend?",
        required=True,
        enabled=True,
        options=["Yes, I'll be there!", "Sorry, can't make it", "Maybe, not sure yet"]
    ),
    RSVPFieldConfig(
        field_id="guest_count",
        field_type="number",
        label="Number of guests (including yourself)",
        placeholder="1",
        required=True,
        enabled=True,
        max_value=10
    ),
    RSVPFieldConfig(
        field_id="meal_preference",
        field_type="select",
        label="Meal Preference",
        required=False,
        enabled=False,
        options=["Beef", "Chicken", "Fish", "Vegetarian", "Vegan"]
    ),
    RSVPFieldConfig(
        field_id="dietary_restrictions",
        field_type="text",
        label="Dietary Restrictions / Allergies",
        placeholder="e.g., Gluten-free, Nut allergy",
        required=False,
        enabled=False
    ),
    RSVPFieldConfig(
        field_id="message",
        field_type="textarea",
        label="Message for the hosts",
        placeholder="Share your wishes or any notes...",
        required=False,
        enabled=True
    ),
    RSVPFieldConfig(
        field_id="email",
        field_type="text",
        label="Email Address",
        placeholder="your@email.com",
        required=False,
        enabled=True
    ),
    RSVPFieldConfig(
        field_id="phone",
        field_type="text",
        label="Phone Number",
        placeholder="+1 234 567 8900",
        required=False,
        enabled=False
    ),
]


def get_default_rsvp_fields():
    """Return a copy of default RSVP fields"""
    return [field.model_copy() for field in DEFAULT_RSVP_FIELDS]


# Invitation Templates
INVITATION_TEMPLATES = [
    {
        "id": "wedding-elegant",
        "name": "Elegant Wedding",
        "category": "wedding",
        "preview_image_url": "/templates/wedding-elegant.jpg",
        "theme_colors": {
            "primary": "#1a1a1a",
            "secondary": "#666666",
            "accent": "#d4a574",
            "background": "#faf8f5",
            "text": "#333333"
        },
        "font_family": "Playfair Display",
        "layout_style": "elegant",
        "is_premium": False
    },
    {
        "id": "wedding-modern",
        "name": "Modern Minimalist",
        "category": "wedding",
        "preview_image_url": "/templates/wedding-modern.jpg",
        "theme_colors": {
            "primary": "#000000",
            "secondary": "#888888",
            "accent": "#e8d5c4",
            "background": "#ffffff",
            "text": "#1a1a1a"
        },
        "font_family": "Inter",
        "layout_style": "modern",
        "is_premium": False
    },
    {
        "id": "wedding-romantic",
        "name": "Romantic Floral",
        "category": "wedding",
        "preview_image_url": "/templates/wedding-romantic.jpg",
        "theme_colors": {
            "primary": "#8b4557",
            "secondary": "#c9a9a6",
            "accent": "#f4e4d7",
            "background": "#fff9f5",
            "text": "#4a3540"
        },
        "font_family": "Cormorant Garamond",
        "layout_style": "romantic",
        "is_premium": False
    },
    {
        "id": "birthday-fun",
        "name": "Fun Celebration",
        "category": "birthday",
        "preview_image_url": "/templates/birthday-fun.jpg",
        "theme_colors": {
            "primary": "#ff6b6b",
            "secondary": "#4ecdc4",
            "accent": "#ffe66d",
            "background": "#ffffff",
            "text": "#2d3436"
        },
        "font_family": "Poppins",
        "layout_style": "fun",
        "is_premium": False
    },
    {
        "id": "birthday-elegant",
        "name": "Elegant Birthday",
        "category": "birthday",
        "preview_image_url": "/templates/birthday-elegant.jpg",
        "theme_colors": {
            "primary": "#2c3e50",
            "secondary": "#7f8c8d",
            "accent": "#f39c12",
            "background": "#fefefe",
            "text": "#2c3e50"
        },
        "font_family": "Lora",
        "layout_style": "elegant",
        "is_premium": False
    },
    {
        "id": "corporate-professional",
        "name": "Professional",
        "category": "corporate",
        "preview_image_url": "/templates/corporate-pro.jpg",
        "theme_colors": {
            "primary": "#1a365d",
            "secondary": "#4a5568",
            "accent": "#3182ce",
            "background": "#ffffff",
            "text": "#1a202c"
        },
        "font_family": "Inter",
        "layout_style": "professional",
        "is_premium": False
    },
    {
        "id": "corporate-modern",
        "name": "Modern Corporate",
        "category": "corporate",
        "preview_image_url": "/templates/corporate-modern.jpg",
        "theme_colors": {
            "primary": "#0d0d0d",
            "secondary": "#525252",
            "accent": "#10b981",
            "background": "#fafafa",
            "text": "#171717"
        },
        "font_family": "DM Sans",
        "layout_style": "modern",
        "is_premium": False
    },
    {
        "id": "baby-shower",
        "name": "Sweet Baby Shower",
        "category": "celebration",
        "preview_image_url": "/templates/baby-shower.jpg",
        "theme_colors": {
            "primary": "#a8d8ea",
            "secondary": "#ffcfdf",
            "accent": "#fefdca",
            "background": "#fff5f5",
            "text": "#5a5a5a"
        },
        "font_family": "Quicksand",
        "layout_style": "soft",
        "is_premium": False
    },
    {
        "id": "graduation",
        "name": "Graduation Celebration",
        "category": "celebration",
        "preview_image_url": "/templates/graduation.jpg",
        "theme_colors": {
            "primary": "#1e3a5f",
            "secondary": "#c9b037",
            "accent": "#c9b037",
            "background": "#f8f9fa",
            "text": "#212529"
        },
        "font_family": "Merriweather",
        "layout_style": "classic",
        "is_premium": False
    },
    {
        "id": "anniversary",
        "name": "Anniversary",
        "category": "celebration",
        "preview_image_url": "/templates/anniversary.jpg",
        "theme_colors": {
            "primary": "#722f37",
            "secondary": "#c9a227",
            "accent": "#f5e6cc",
            "background": "#fffbf5",
            "text": "#3d2314"
        },
        "font_family": "Crimson Text",
        "layout_style": "elegant",
        "is_premium": False
    },
]


def generate_share_link():
    """Generate a unique share link for invitation"""
    return secrets.token_urlsafe(12)


async def get_invitation_by_share_link(db, share_link: str):
    """Get invitation by share link"""
    return await db.invitations.find_one({"share_link": share_link}, {"_id": 0})


async def update_rsvp_stats(db, invitation_id: str):
    """Update RSVP statistics for an invitation"""
    # Get all RSVPs for this invitation
    rsvps = await db.rsvp_responses.find({"invitation_id": invitation_id}).to_list(None)
    
    attending_count = 0
    not_attending_count = 0
    maybe_count = 0
    total_guests = 0
    
    for rsvp in rsvps:
        status = rsvp.get("attendance_status", "").lower()
        if status == "attending" or "yes" in status.lower():
            attending_count += 1
            total_guests += rsvp.get("guest_count", 1)
        elif status == "not_attending" or "no" in status.lower() or "sorry" in status.lower():
            not_attending_count += 1
        else:
            maybe_count += 1
    
    # Update invitation stats
    await db.invitations.update_one(
        {"id": invitation_id},
        {"$set": {
            "total_rsvps": len(rsvps),
            "attending_count": attending_count,
            "not_attending_count": not_attending_count,
            "maybe_count": maybe_count,
            "total_guests": total_guests,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )


def setup_invitation_routes(app, db, get_current_user):
    """Setup invitation routes with database and auth dependencies"""
    
    # Import RSVP token functions
    from routes.rsvp_token import consume_rsvp_token, get_user_token_balance
    
    # ============================================
    # INVITATION CRUD ENDPOINTS
    # ============================================
    
    @invitation_router.get("/templates")
    async def get_invitation_templates():
        """Get all available invitation templates"""
        return INVITATION_TEMPLATES
    
    @invitation_router.get("/default-rsvp-fields")
    async def get_default_fields():
        """Get default RSVP field configurations"""
        return get_default_rsvp_fields()
    
    @invitation_router.post("", response_model=Invitation)
    async def create_invitation(
        data: InvitationCreate,
        current_user: dict = Depends(get_current_user)
    ):
        """Create a new invitation (requires RSVP token)"""
        user_id = current_user["id"]
        
        # Check if user has available RSVP tokens
        balance = await get_user_token_balance(user_id)
        if balance.available_tokens < 1 and not balance.has_unlimited:
            raise HTTPException(
                status_code=402,
                detail="Insufficient RSVP tokens. Please purchase tokens to create an invitation."
            )
        
        invitation_id = str(uuid.uuid4())
        share_link = generate_share_link()
        
        # Consume the token
        token_consumed = await consume_rsvp_token(user_id, invitation_id)
        if not token_consumed:
            raise HTTPException(
                status_code=402,
                detail="Failed to consume RSVP token. Please try again."
            )
        
        # Set default design if not provided
        design = data.design or InvitationDesign()
        
        # Set default RSVP fields if not provided
        rsvp_fields = data.rsvp_fields
        if rsvp_fields is None:
            rsvp_fields = get_default_rsvp_fields()
        
        invitation_doc = {
            "id": invitation_id,
            "user_id": current_user["id"],
            "title": data.title,
            "event_type": data.event_type,
            "host_names": data.host_names,
            "event_date": data.event_date,
            "event_time": data.event_time,
            "event_end_time": data.event_end_time,
            "venue_name": data.venue_name,
            "venue_address": data.venue_address,
            "venue_map_url": data.venue_map_url,
            "message": data.message,
            "additional_info": data.additional_info,
            "external_invitation_url": data.external_invitation_url,
            "design": design.model_dump(),
            "rsvp_enabled": data.rsvp_enabled,
            "rsvp_deadline": data.rsvp_deadline,
            "rsvp_fields": [f.model_dump() for f in rsvp_fields],
            "max_guests_per_rsvp": data.max_guests_per_rsvp,
            "share_link": share_link,
            "qr_code_url": None,
            "is_public": True,
            "password": data.password,
            "linked_gallery_id": None,
            "linked_gallery_share_link": None,
            "total_views": 0,
            "total_rsvps": 0,
            "attending_count": 0,
            "not_attending_count": 0,
            "maybe_count": 0,
            "total_guests": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": None,
            "status": "draft",
            "token_consumed": True  # Track that a token was used
        }
        
        await db.invitations.insert_one(invitation_doc)
        
        # Remove MongoDB _id before returning
        invitation_doc.pop("_id", None)
        
        return Invitation(**invitation_doc)
    
    @invitation_router.get("", response_model=List[InvitationSummary])
    async def get_user_invitations(current_user: dict = Depends(get_current_user)):
        """Get all invitations for the current user"""
        invitations = await db.invitations.find(
            {"user_id": current_user["id"]},
            {"_id": 0}
        ).sort("created_at", -1).to_list(None)
        
        return [InvitationSummary(
            id=inv["id"],
            title=inv["title"],
            event_type=inv["event_type"],
            host_names=inv["host_names"],
            event_date=inv.get("event_date"),
            share_link=inv["share_link"],
            status=inv.get("status", "draft"),
            total_rsvps=inv.get("total_rsvps", 0),
            attending_count=inv.get("attending_count", 0),
            total_guests=inv.get("total_guests", 0),
            linked_gallery_id=inv.get("linked_gallery_id"),
            created_at=inv["created_at"],
            cover_image_url=inv.get("design", {}).get("cover_image_url")
        ) for inv in invitations]
    
    @invitation_router.get("/{invitation_id}", response_model=Invitation)
    async def get_invitation(
        invitation_id: str,
        current_user: dict = Depends(get_current_user)
    ):
        """Get a specific invitation"""
        invitation = await db.invitations.find_one(
            {"id": invitation_id, "user_id": current_user["id"]},
            {"_id": 0}
        )
        
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")
        
        return Invitation(**invitation)
    
    @invitation_router.put("/{invitation_id}", response_model=Invitation)
    async def update_invitation(
        invitation_id: str,
        data: InvitationUpdate,
        current_user: dict = Depends(get_current_user)
    ):
        """Update an invitation (blocked after event date)"""
        invitation = await db.invitations.find_one(
            {"id": invitation_id, "user_id": current_user["id"]}
        )
        
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")
        
        # Check if event date has passed - block editing
        event_date = invitation.get("event_date")
        if event_date:
            try:
                event_datetime = datetime.fromisoformat(event_date.replace('Z', '+00:00'))
                if datetime.now(timezone.utc) > event_datetime:
                    raise HTTPException(
                        status_code=403,
                        detail="This invitation cannot be edited because the event date has passed."
                    )
            except ValueError:
                pass  # Invalid date format, allow editing
        
        update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
        
        # Update only provided fields
        for field, value in data.model_dump(exclude_unset=True).items():
            if value is not None:
                if field == "design" and value:
                    update_data["design"] = value
                elif field == "rsvp_fields" and value:
                    update_data["rsvp_fields"] = [f if isinstance(f, dict) else f.model_dump() for f in value]
                else:
                    update_data[field] = value
        
        await db.invitations.update_one(
            {"id": invitation_id},
            {"$set": update_data}
        )
        
        updated = await db.invitations.find_one({"id": invitation_id}, {"_id": 0})
        return Invitation(**updated)
    
    @invitation_router.delete("/{invitation_id}")
    async def delete_invitation(
        invitation_id: str,
        current_user: dict = Depends(get_current_user)
    ):
        """Delete an invitation and its RSVPs"""
        invitation = await db.invitations.find_one(
            {"id": invitation_id, "user_id": current_user["id"]}
        )
        
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")
        
        # Delete invitation
        await db.invitations.delete_one({"id": invitation_id})
        
        # Delete all RSVPs
        await db.rsvp_responses.delete_many({"invitation_id": invitation_id})
        
        return {"message": "Invitation deleted successfully"}
    
    @invitation_router.post("/{invitation_id}/publish")
    async def publish_invitation(
        invitation_id: str,
        current_user: dict = Depends(get_current_user)
    ):
        """Publish an invitation (make it live)"""
        invitation = await db.invitations.find_one(
            {"id": invitation_id, "user_id": current_user["id"]}
        )
        
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")
        
        await db.invitations.update_one(
            {"id": invitation_id},
            {"$set": {
                "status": "published",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        return {"message": "Invitation published successfully", "share_link": invitation["share_link"]}
    
    @invitation_router.post("/{invitation_id}/link-gallery")
    async def link_gallery_to_invitation(
        invitation_id: str,
        gallery_id: str,
        current_user: dict = Depends(get_current_user)
    ):
        """Link a gallery to an invitation"""
        # Verify invitation ownership
        invitation = await db.invitations.find_one(
            {"id": invitation_id, "user_id": current_user["id"]}
        )
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")
        
        # Verify gallery ownership
        gallery = await db.galleries.find_one(
            {"id": gallery_id, "photographer_id": current_user["id"]}
        )
        if not gallery:
            raise HTTPException(status_code=404, detail="Gallery not found")
        
        # Link them
        await db.invitations.update_one(
            {"id": invitation_id},
            {"$set": {
                "linked_gallery_id": gallery_id,
                "linked_gallery_share_link": gallery["share_link"],
                "linked_gallery_cover_photo": gallery.get("cover_photo_url"),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        return {"message": "Gallery linked successfully"}
    
    @invitation_router.get("/by-gallery/{gallery_id}")
    async def get_invitation_by_gallery(
        gallery_id: str,
        current_user: dict = Depends(get_current_user)
    ):
        """Get invitation linked to a specific gallery"""
        invitation = await db.invitations.find_one(
            {"linked_gallery_id": gallery_id, "user_id": current_user["id"]},
            {"_id": 0}
        )
        
        if not invitation:
            return {"invitation": None}
        
        return {
            "invitation": {
                "id": invitation["id"],
                "title": invitation["title"],
                "share_link": invitation["share_link"],
                "status": invitation.get("status", "draft"),
                "total_rsvps": invitation.get("total_rsvps", 0),
                "attending_count": invitation.get("attending_count", 0)
            }
        }
    
    # ============================================
    # CELEBRANT ACCESS ENDPOINTS
    # ============================================
    
    @invitation_router.post("/{invitation_id}/generate-celebrant-link")
    async def generate_celebrant_access_link(
        invitation_id: str,
        celebrant_name: Optional[str] = None,
        celebrant_email: Optional[str] = None,
        current_user: dict = Depends(get_current_user)
    ):
        """Generate a special access link for the celebrant (HOST ONLY)"""
        invitation = await db.invitations.find_one(
            {"id": invitation_id, "user_id": current_user["id"]}
        )
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")
        
        # Generate unique access code
        access_code = secrets.token_urlsafe(16)
        
        await db.invitations.update_one(
            {"id": invitation_id},
            {"$set": {
                "celebrant_access_code": access_code,
                "celebrant_name": celebrant_name,
                "celebrant_email": celebrant_email,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        return {
            "access_code": access_code,
            "celebrant_link": f"/celebrant/{access_code}",
            "message": "Celebrant access link generated successfully"
        }
    
    @invitation_router.post("/{invitation_id}/revoke-celebrant-link")
    async def revoke_celebrant_access_link(
        invitation_id: str,
        current_user: dict = Depends(get_current_user)
    ):
        """Revoke the celebrant's access link (HOST ONLY)"""
        invitation = await db.invitations.find_one(
            {"id": invitation_id, "user_id": current_user["id"]}
        )
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")
        
        await db.invitations.update_one(
            {"id": invitation_id},
            {"$set": {
                "celebrant_access_code": None,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        return {"message": "Celebrant access revoked"}
    
    @invitation_router.get("/celebrant/{access_code}")
    async def get_celebrant_dashboard(access_code: str):
        """Get invitation data for celebrant dashboard (LIMITED ACCESS)"""
        invitation = await db.invitations.find_one(
            {"celebrant_access_code": access_code},
            {"_id": 0, "password": 0, "user_id": 0}  # Exclude sensitive fields
        )
        
        if not invitation:
            raise HTTPException(status_code=404, detail="Invalid access code")
        
        # Get RSVPs
        rsvps = await db.rsvp_responses.find(
            {"invitation_id": invitation["id"]},
            {"_id": 0}
        ).to_list(1000)
        
        return {
            "invitation": invitation,
            "rsvps": rsvps,
            "can_edit": ["title", "host_names", "event_date", "event_time", "event_end_time", 
                        "venue_name", "venue_address", "venue_map_url", "message", 
                        "additional_info", "rsvp_deadline", "design"],
            "cannot_edit": ["linked_gallery_id", "linked_gallery_share_link", "share_link", 
                          "celebrant_access_code", "user_id", "status"]
        }
    
    @invitation_router.put("/celebrant/{access_code}")
    async def update_invitation_as_celebrant(
        access_code: str,
        updates: dict
    ):
        """Update invitation details as celebrant (LIMITED FIELDS ONLY, blocked after event)"""
        invitation = await db.invitations.find_one(
            {"celebrant_access_code": access_code}
        )
        
        if not invitation:
            raise HTTPException(status_code=404, detail="Invalid access code")
        
        # Check if event date has passed - block editing
        event_date = invitation.get("event_date")
        if event_date:
            try:
                event_datetime = datetime.fromisoformat(event_date.replace('Z', '+00:00'))
                if datetime.now(timezone.utc) > event_datetime:
                    raise HTTPException(
                        status_code=403,
                        detail="This invitation cannot be edited because the event date has passed."
                    )
            except ValueError:
                pass  # Invalid date format, allow editing
        
        # Whitelist of editable fields for celebrant
        allowed_fields = {
            "title", "host_names", "event_date", "event_time", "event_end_time",
            "venue_name", "venue_address", "venue_map_url", "message",
            "additional_info", "rsvp_deadline", "external_invitation_url"
        }
        
        # Also allow design sub-fields
        allowed_design_fields = {
            "cover_image_url", "primary_color", "secondary_color", 
            "accent_color", "font_family"
        }
        
        # Filter updates to only allowed fields
        safe_updates = {}
        for key, value in updates.items():
            if key in allowed_fields:
                safe_updates[key] = value
            elif key == "design" and isinstance(value, dict):
                # Handle design updates
                current_design = invitation.get("design", {})
                for design_key, design_value in value.items():
                    if design_key in allowed_design_fields:
                        current_design[design_key] = design_value
                safe_updates["design"] = current_design
        
        if not safe_updates:
            raise HTTPException(status_code=400, detail="No valid fields to update")
        
        # Blocked fields that celebrant cannot edit
        blocked_fields = ["linked_gallery_id", "linked_gallery_share_link", "share_link",
                        "celebrant_access_code", "user_id", "status", "id"]
        
        for field in blocked_fields:
            if field in updates:
                raise HTTPException(
                    status_code=403, 
                    detail=f"You don't have permission to edit '{field}'. Please contact your host."
                )
        
        safe_updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.invitations.update_one(
            {"id": invitation["id"]},
            {"$set": safe_updates}
        )
        
        return {
            "message": "Invitation updated successfully",
            "updated_fields": list(safe_updates.keys())
        }
    
    @invitation_router.post("/celebrant/{access_code}/add-guest")
    async def add_guest_as_celebrant(
        access_code: str,
        guest_data: ManualGuestAdd
    ):
        """Add a guest manually as celebrant"""
        invitation = await db.invitations.find_one(
            {"celebrant_access_code": access_code}
        )
        
        if not invitation:
            raise HTTPException(status_code=404, detail="Invalid access code")
        
        # Create RSVP record
        rsvp_id = str(uuid.uuid4())
        rsvp_record = {
            "id": rsvp_id,
            "invitation_id": invitation["id"],
            "guest_name": guest_data.guest_name,
            "guest_email": guest_data.guest_email,
            "guest_phone": guest_data.guest_phone,
            "attendance_status": guest_data.attendance_status,
            "guest_count": guest_data.guest_count,
            "responses": {},
            "message": guest_data.notes,
            "submitted_at": datetime.now(timezone.utc).isoformat(),
            "added_via": guest_data.added_via,
            "added_by": "celebrant"
        }
        
        await db.rsvp_responses.insert_one(rsvp_record)
        await update_rsvp_stats(db, invitation["id"])
        
        return {
            "id": rsvp_id,
            "message": "Guest added successfully"
        }
    
    # ============================================
    # PUBLIC INVITATION ENDPOINTS (for guests)
    # ============================================
    
    @invitation_router.get("/public/{share_link}", response_model=PublicInvitation)
    async def get_public_invitation(share_link: str, password: Optional[str] = None):
        """Get public invitation for guests to view and RSVP"""
        invitation = await get_invitation_by_share_link(db, share_link)
        
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")
        
        if invitation.get("status") != "published":
            raise HTTPException(status_code=404, detail="Invitation not available")
        
        # Check password if set
        if invitation.get("password"):
            if not password or password != invitation["password"]:
                raise HTTPException(status_code=401, detail="Password required")
        
        # Increment view count
        await db.invitations.update_one(
            {"share_link": share_link},
            {"$inc": {"total_views": 1}}
        )
        
        return PublicInvitation(
            id=invitation["id"],
            title=invitation["title"],
            event_type=invitation["event_type"],
            host_names=invitation["host_names"],
            event_date=invitation.get("event_date"),
            event_time=invitation.get("event_time"),
            event_end_time=invitation.get("event_end_time"),
            venue_name=invitation.get("venue_name"),
            venue_address=invitation.get("venue_address"),
            venue_map_url=invitation.get("venue_map_url"),
            message=invitation.get("message"),
            additional_info=invitation.get("additional_info"),
            external_invitation_url=invitation.get("external_invitation_url"),
            design=InvitationDesign(**invitation.get("design", {})),
            rsvp_enabled=invitation.get("rsvp_enabled", True),
            rsvp_deadline=invitation.get("rsvp_deadline"),
            rsvp_fields=[RSVPFieldConfig(**f) for f in invitation.get("rsvp_fields", [])],
            max_guests_per_rsvp=invitation.get("max_guests_per_rsvp", 5),
            linked_gallery_share_link=invitation.get("linked_gallery_share_link"),
            linked_gallery_cover_photo=invitation.get("linked_gallery_cover_photo"),
            has_password=invitation.get("password") is not None
        )
    
    # ============================================
    # RSVP ENDPOINTS
    # ============================================
    
    @invitation_router.post("/public/{share_link}/rsvp", response_model=RSVPResponse)
    async def submit_rsvp(
        share_link: str,
        data: RSVPResponseCreate,
        request: Request
    ):
        """Submit an RSVP response (public endpoint for guests)"""
        invitation = await get_invitation_by_share_link(db, share_link)
        
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")
        
        if not invitation.get("rsvp_enabled", True):
            raise HTTPException(status_code=400, detail="RSVP is not enabled for this invitation")
        
        # Check deadline
        if invitation.get("rsvp_deadline"):
            deadline_str = invitation["rsvp_deadline"]
            try:
                # Handle both date-only and datetime formats
                if 'T' in deadline_str:
                    deadline = datetime.fromisoformat(deadline_str.replace('Z', '+00:00'))
                else:
                    # Date only format - set to end of day
                    deadline = datetime.fromisoformat(deadline_str + "T23:59:59+00:00")
                
                # Make sure deadline is timezone-aware
                if deadline.tzinfo is None:
                    deadline = deadline.replace(tzinfo=timezone.utc)
                    
                if datetime.now(timezone.utc) > deadline:
                    raise HTTPException(status_code=400, detail="RSVP deadline has passed")
            except ValueError:
                pass  # Invalid date format, skip deadline check
        
        # Check max guests
        if data.guest_count > invitation.get("max_guests_per_rsvp", 5):
            raise HTTPException(
                status_code=400,
                detail=f"Maximum {invitation.get('max_guests_per_rsvp', 5)} guests allowed per RSVP"
            )
        
        # Map attendance status
        attendance_map = {
            "Yes, I'll be there!": "attending",
            "Sorry, can't make it": "not_attending",
            "Maybe, not sure yet": "maybe"
        }
        attendance_status = attendance_map.get(data.attendance_status, data.attendance_status.lower())
        
        rsvp_id = str(uuid.uuid4())
        rsvp_doc = {
            "id": rsvp_id,
            "invitation_id": invitation["id"],
            "guest_name": data.guest_name,
            "guest_email": data.guest_email,
            "guest_phone": data.guest_phone,
            "attendance_status": attendance_status,
            "guest_count": data.guest_count if attendance_status == "attending" else 0,
            "responses": data.responses,
            "message": data.message,
            "submitted_at": datetime.now(timezone.utc).isoformat(),
            "ip_address": request.client.host if request.client else None
        }
        
        await db.rsvp_responses.insert_one(rsvp_doc)
        
        # Update invitation stats
        await update_rsvp_stats(db, invitation["id"])
        
        rsvp_doc.pop("_id", None)
        return RSVPResponse(**rsvp_doc)
    
    @invitation_router.get("/{invitation_id}/rsvps", response_model=List[RSVPResponse])
    async def get_invitation_rsvps(
        invitation_id: str,
        current_user: dict = Depends(get_current_user)
    ):
        """Get all RSVPs for an invitation"""
        # Verify ownership
        invitation = await db.invitations.find_one(
            {"id": invitation_id, "user_id": current_user["id"]}
        )
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")
        
        rsvps = await db.rsvp_responses.find(
            {"invitation_id": invitation_id},
            {"_id": 0}
        ).sort("submitted_at", -1).to_list(None)
        
        return [RSVPResponse(**rsvp) for rsvp in rsvps]
    
    @invitation_router.get("/{invitation_id}/stats", response_model=RSVPStats)
    async def get_rsvp_stats(
        invitation_id: str,
        current_user: dict = Depends(get_current_user)
    ):
        """Get RSVP statistics for an invitation"""
        invitation = await db.invitations.find_one(
            {"id": invitation_id, "user_id": current_user["id"]},
            {"_id": 0}
        )
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")
        
        return RSVPStats(
            total_rsvps=invitation.get("total_rsvps", 0),
            attending_count=invitation.get("attending_count", 0),
            not_attending_count=invitation.get("not_attending_count", 0),
            maybe_count=invitation.get("maybe_count", 0),
            total_guests=invitation.get("total_guests", 0)
        )
    
    @invitation_router.delete("/{invitation_id}/rsvps/{rsvp_id}")
    async def delete_rsvp(
        invitation_id: str,
        rsvp_id: str,
        current_user: dict = Depends(get_current_user)
    ):
        """Delete a single RSVP response - DISABLED for data protection"""
        # RSVP responses cannot be deleted for data protection
        # This protects both the host and celebrant by maintaining a complete record
        raise HTTPException(
            status_code=403, 
            detail="RSVP responses cannot be deleted. This protects the integrity of your guest list records."
        )
    
    @invitation_router.post("/{invitation_id}/guests")
    async def add_manual_guest(
        invitation_id: str,
        guest_data: ManualGuestAdd,
        current_user: dict = Depends(get_current_user)
    ):
        """Manually add a guest (for phone/in-person RSVPs)"""
        # Verify ownership
        invitation = await db.invitations.find_one(
            {"id": invitation_id, "user_id": current_user["id"]}
        )
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")
        
        # Create RSVP record
        rsvp_id = str(uuid.uuid4())
        rsvp_record = {
            "id": rsvp_id,
            "invitation_id": invitation_id,
            "guest_name": guest_data.guest_name,
            "guest_email": guest_data.guest_email,
            "guest_phone": guest_data.guest_phone,
            "attendance_status": guest_data.attendance_status,
            "guest_count": guest_data.guest_count,
            "responses": {},
            "message": guest_data.notes,
            "submitted_at": datetime.now(timezone.utc).isoformat(),
            "added_via": guest_data.added_via,  # manual, phone, in_person
            "added_by": current_user["id"]
        }
        
        await db.rsvp_responses.insert_one(rsvp_record)
        
        # Update stats
        await update_rsvp_stats(db, invitation_id)
        
        return {
            "id": rsvp_id,
            "message": "Guest added successfully",
            "guest": {
                "name": guest_data.guest_name,
                "status": guest_data.attendance_status,
                "guest_count": guest_data.guest_count
            }
        }
    
    @invitation_router.put("/{invitation_id}/guests/{rsvp_id}")
    async def update_guest(
        invitation_id: str,
        rsvp_id: str,
        guest_data: ManualGuestAdd,
        current_user: dict = Depends(get_current_user)
    ):
        """Update a guest's RSVP"""
        # Verify ownership
        invitation = await db.invitations.find_one(
            {"id": invitation_id, "user_id": current_user["id"]}
        )
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")
        
        # Update the RSVP
        update_data = {
            "guest_name": guest_data.guest_name,
            "guest_email": guest_data.guest_email,
            "guest_phone": guest_data.guest_phone,
            "attendance_status": guest_data.attendance_status,
            "guest_count": guest_data.guest_count,
            "message": guest_data.notes,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        result = await db.rsvp_responses.update_one(
            {"id": rsvp_id, "invitation_id": invitation_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Guest not found")
        
        # Update stats
        await update_rsvp_stats(db, invitation_id)
        
        return {"message": "Guest updated successfully"}
    
    @invitation_router.get("/{invitation_id}/export")
    async def export_rsvps(
        invitation_id: str,
        format: str = "json",
        current_user: dict = Depends(get_current_user)
    ):
        """Export RSVPs (JSON or CSV format)"""
        invitation = await db.invitations.find_one(
            {"id": invitation_id, "user_id": current_user["id"]}
        )
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")
        
        rsvps = await db.rsvp_responses.find(
            {"invitation_id": invitation_id},
            {"_id": 0, "ip_address": 0}
        ).sort("submitted_at", -1).to_list(None)
        
        if format == "csv":
            # Generate CSV
            import csv
            import io
            
            output = io.StringIO()
            if rsvps:
                fieldnames = ["guest_name", "guest_email", "guest_phone", "attendance_status", "guest_count", "message", "submitted_at"]
                writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction='ignore')
                writer.writeheader()
                for rsvp in rsvps:
                    writer.writerow(rsvp)
            
            from fastapi.responses import StreamingResponse
            output.seek(0)
            return StreamingResponse(
                iter([output.getvalue()]),
                media_type="text/csv",
                headers={"Content-Disposition": f"attachment; filename=rsvps_{invitation_id}.csv"}
            )
        
        return {"rsvps": rsvps, "total": len(rsvps)}
    
    @invitation_router.post("/{invitation_id}/upload-cover")
    async def upload_invitation_cover(
        invitation_id: str,
        file: UploadFile = File(...),
        current_user: dict = Depends(get_current_user)
    ):
        """Upload cover image for an invitation"""
        # Verify ownership
        invitation = await db.invitations.find_one(
            {"id": invitation_id, "user_id": current_user["id"]}
        )
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")
        
        if not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="Only image files are allowed")
        
        # Generate unique filename
        photo_id = str(uuid.uuid4())
        file_ext = file.filename.split('.')[-1].lower() if '.' in file.filename else 'jpg'
        filename = f"invitation_cover_{photo_id}.{file_ext}"
        
        # Read file content
        file_content = await file.read()
        
        # Import storage from server (it's already initialized)
        from server import storage, UPLOAD_DIR
        
        # Upload to R2 if enabled
        if storage.r2_enabled:
            upload_result = await storage.upload_with_thumbnails(
                photo_id=f"invitation_cover_{photo_id}",
                content=file_content,
                file_ext=file_ext,
                content_type=file.content_type or 'image/jpeg'
            )
            
            if not upload_result['success']:
                raise HTTPException(status_code=500, detail="Failed to upload cover image")
            
            cover_url = upload_result['original_url']
        else:
            # Fallback to local filesystem
            file_path = UPLOAD_DIR / filename
            with open(file_path, 'wb') as f:
                f.write(file_content)
            cover_url = f"/api/photos/serve/{filename}"
        
        # Update invitation design with cover URL
        current_design = invitation.get("design", {})
        current_design["cover_image_url"] = cover_url
        
        await db.invitations.update_one(
            {"id": invitation_id},
            {"$set": {
                "design": current_design,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        return {"cover_image_url": cover_url, "message": "Cover image uploaded successfully"}
    
    @invitation_router.get("/{invitation_id}/qr-code")
    async def get_invitation_qr_code(
        invitation_id: str,
        current_user: dict = Depends(get_current_user)
    ):
        """Generate QR code for invitation share link"""
        invitation = await db.invitations.find_one(
            {"id": invitation_id, "user_id": current_user["id"]},
            {"_id": 0, "share_link": 1}
        )
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")
        
        # Get the frontend URL from environment - fallback to backend URL without /api
        import os
        frontend_url = os.environ.get('FRONTEND_URL', '').strip()
        if not frontend_url:
            # Fallback: use REACT_APP equivalent or backend URL base
            backend_url = os.environ.get('BACKEND_URL', 'https://invite-master-2.preview.emergentagent.com')
            frontend_url = backend_url
        
        invitation_url = f"{frontend_url}/i/{invitation['share_link']}"
        
        # Generate QR code
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(invitation_url)
        qr.make(fit=True)
        
        # Create image
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Convert to bytes
        img_buffer = io.BytesIO()
        img.save(img_buffer, format='PNG')
        img_buffer.seek(0)
        
        return StreamingResponse(
            img_buffer,
            media_type="image/png",
            headers={"Content-Disposition": f"attachment; filename=invitation_qr_{invitation['share_link']}.png"}
        )
    
    @invitation_router.get("/{invitation_id}/qr-code-base64")
    async def get_invitation_qr_code_base64(
        invitation_id: str,
        current_user: dict = Depends(get_current_user)
    ):
        """Generate QR code as base64 for embedding in UI"""
        invitation = await db.invitations.find_one(
            {"id": invitation_id, "user_id": current_user["id"]},
            {"_id": 0, "share_link": 1}
        )
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")
        
        import os
        import base64
        frontend_url = os.environ.get('FRONTEND_URL', '').strip()
        if not frontend_url:
            backend_url = os.environ.get('BACKEND_URL', 'https://invite-master-2.preview.emergentagent.com')
            frontend_url = backend_url
        
        invitation_url = f"{frontend_url}/i/{invitation['share_link']}"
        
        # Generate QR code
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(invitation_url)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        
        img_buffer = io.BytesIO()
        img.save(img_buffer, format='PNG')
        img_buffer.seek(0)
        
        base64_img = base64.b64encode(img_buffer.getvalue()).decode('utf-8')
        
        return {
            "qr_code_base64": f"data:image/png;base64,{base64_img}",
            "invitation_url": invitation_url
        }
    
    # Include router in app
    app.include_router(invitation_router, prefix="/api/invitations", tags=["Invitations"])
    
    return invitation_router
