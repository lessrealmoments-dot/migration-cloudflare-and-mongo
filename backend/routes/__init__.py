"""
Routes package for PhotoShare API

Routes are organized by domain:
- health: Health check endpoints
- (future) auth: Authentication endpoints
- (future) admin: Admin endpoints
- (future) galleries: Gallery management
- (future) billing: Subscription & billing
"""

# Only import routers that exist
from .health import router as health_router

__all__ = ['health_router']
