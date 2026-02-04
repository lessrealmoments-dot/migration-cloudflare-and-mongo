"""
Notification-related Pydantic models
"""
from pydantic import BaseModel
from typing import Optional


class Notification(BaseModel):
    id: str
    user_id: str
    type: str
    title: str
    message: str
    read: bool = False
    created_at: str
    metadata: Optional[dict] = None


class NotificationCreate(BaseModel):
    user_id: str
    type: str
    title: str
    message: str
    metadata: Optional[dict] = None
