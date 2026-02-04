# Routes module - export all routers
from .auth import router as auth_router
from .admin import router as admin_router
from .galleries import router as galleries_router
from .billing import router as billing_router
from .analytics import router as analytics_router
from .notifications import router as notifications_router
from .files import router as files_router
