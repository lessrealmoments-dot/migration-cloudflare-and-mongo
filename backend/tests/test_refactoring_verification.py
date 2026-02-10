"""
Backend API Tests - Refactoring Verification
Tests to verify all API endpoints work correctly after extracting:
- 45+ Pydantic models to /app/backend/models/
- 5 background tasks to /app/backend/tasks/
- Health route to /app/backend/routes/
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
USER_EMAIL = "lessrealmoments@gmail.com"
USER_PASSWORD = "3tfL99B%u2qw"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "Aa@58798546521325"


class TestHealthEndpoint:
    """Test health check endpoint - verifies routes module extraction"""
    
    def test_api_health_endpoint(self):
        """Test /api/health endpoint returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "service" in data
        print(f"✓ Health endpoint working: {data}")
    
    def test_root_health_endpoint(self):
        """Test root /health endpoint for Kubernetes probes"""
        response = requests.get(f"{BASE_URL}/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print(f"✓ Root health endpoint working: {data}")


class TestUserAuthentication:
    """Test user authentication - verifies user models extraction"""
    
    def test_user_login_success(self):
        """Test user login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_EMAIL,
            "password": USER_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == USER_EMAIL
        print(f"✓ User login successful: {data['user']['name']}")
        return data["access_token"]
    
    def test_user_login_invalid_credentials(self):
        """Test user login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "invalid@example.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid login correctly rejected")
    
    def test_get_current_user(self):
        """Test /auth/me endpoint with valid token"""
        # First login to get token
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_EMAIL,
            "password": USER_PASSWORD
        })
        token = login_response.json()["access_token"]
        
        # Get current user
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == USER_EMAIL
        print(f"✓ Get current user working: {data['name']}")


class TestGalleriesEndpoint:
    """Test galleries endpoints - verifies gallery models extraction"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_EMAIL,
            "password": USER_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_galleries_list(self, auth_token):
        """Test /api/galleries endpoint returns list of galleries"""
        response = requests.get(
            f"{BASE_URL}/api/galleries",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Galleries list endpoint working: {len(data)} galleries found")
        
        # Verify gallery structure if any exist
        if data:
            gallery = data[0]
            assert "id" in gallery
            assert "title" in gallery
            assert "photographer_id" in gallery
            print(f"  First gallery: {gallery['title']}")


class TestSubscriptionEndpoint:
    """Test subscription endpoint - verifies billing models extraction"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_EMAIL,
            "password": USER_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_user_subscription(self, auth_token):
        """Test /api/user/subscription endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/user/subscription",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify subscription response structure
        assert "plan" in data
        assert "effective_plan" in data
        assert "event_credits" in data
        assert "extra_credits" in data
        assert "total_credits" in data
        assert "is_unlimited_credits" in data
        assert "payment_status" in data
        assert "features_enabled" in data
        assert "authority_source" in data
        
        print(f"✓ Subscription endpoint working:")
        print(f"  Plan: {data['plan']}")
        print(f"  Effective Plan: {data['effective_plan']}")
        print(f"  Override Mode: {data.get('override_mode')}")
        print(f"  Unlimited Credits: {data['is_unlimited_credits']}")


class TestAnalyticsEndpoint:
    """Test analytics endpoint - verifies analytics models extraction"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_EMAIL,
            "password": USER_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_photographer_analytics(self, auth_token):
        """Test /api/analytics/photographer endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/photographer",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify analytics response structure
        assert "total_galleries" in data
        assert "total_photos" in data
        assert "total_views" in data
        assert "galleries" in data
        
        print(f"✓ Analytics endpoint working:")
        print(f"  Total Galleries: {data['total_galleries']}")
        print(f"  Total Photos: {data['total_photos']}")
        print(f"  Total Views: {data['total_views']}")


class TestAdminEndpoints:
    """Test admin endpoints - verifies admin authentication and billing settings"""
    
    def test_admin_login_success(self):
        """Test admin login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data.get("is_admin") == True
        print(f"✓ Admin login successful")
        return data["access_token"]
    
    def test_admin_login_invalid_credentials(self):
        """Test admin login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "wrongadmin",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid admin login correctly rejected")
    
    def test_get_billing_settings(self):
        """Test /api/admin/billing/settings endpoint"""
        # First login as admin
        login_response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        admin_token = login_response.json()["access_token"]
        
        # Get billing settings
        response = requests.get(
            f"{BASE_URL}/api/admin/billing/settings",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify billing settings structure
        assert "billing_enforcement_enabled" in data
        assert "pricing" in data
        assert "payment_methods" in data
        
        print(f"✓ Billing settings endpoint working:")
        print(f"  Billing Enforcement: {data['billing_enforcement_enabled']}")
        print(f"  Pricing: {data['pricing']}")
    
    def test_get_photographers_list(self):
        """Test /api/admin/photographers endpoint"""
        # First login as admin
        login_response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        admin_token = login_response.json()["access_token"]
        
        # Get photographers list
        response = requests.get(
            f"{BASE_URL}/api/admin/photographers",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        print(f"✓ Photographers list endpoint working: {len(data)} photographers found")
        
        # Verify photographer structure if any exist
        if data:
            photographer = data[0]
            assert "id" in photographer
            assert "email" in photographer
            assert "name" in photographer
            print(f"  First photographer: {photographer['name']} ({photographer['email']})")


class TestModelsImport:
    """Test that models are correctly imported from the models package"""
    
    def test_user_models_import(self):
        """Verify user models are importable"""
        from models.user import (
            UserRegister, UserLogin, User, UserProfile, Token,
            ForgotPassword, ChangePassword, AdminLogin, AdminToken,
            PhotographerAdmin, UpdateGalleryLimit, UpdateStorageQuota,
            LandingPageConfig
        )
        print("✓ User models imported successfully")
    
    def test_gallery_models_import(self):
        """Verify gallery models are importable"""
        from models.gallery import (
            GalleryCreate, Gallery, GalleryUpdate, Section, Photo,
            PasswordVerify, BulkPhotoAction, PhotoReorder, BulkFlagAction,
            BulkUnflagAction, PublicGallery, CoverPhotoPosition,
            DuplicateCheckRequest, DuplicateCheckResponse,
            ThumbnailRepairRequest, PhotoHealthCheck
        )
        print("✓ Gallery models imported successfully")
    
    def test_billing_models_import(self):
        """Verify billing models are importable"""
        from models.billing import (
            SubscriptionInfo, AssignOverrideMode, RemoveOverrideMode,
            UpdatePricing, PurchaseExtraCredits, PaymentProofSubmit,
            ApprovePayment, RejectPayment, PaymentMethod, BillingSettings,
            PaymentDispute, Transaction, GlobalFeatureToggles,
            FeatureToggle, UserFeatureToggle, UpgradeRequest, ExtraCreditRequest
        )
        print("✓ Billing models imported successfully")
    
    def test_analytics_models_import(self):
        """Verify analytics models are importable"""
        from models.analytics import (
            GalleryAnalytics, PhotographerAnalytics, AdminAnalytics,
            GoogleDriveBackupStatus
        )
        print("✓ Analytics models imported successfully")
    
    def test_notification_models_import(self):
        """Verify notification models are importable"""
        from models.notification import Notification, NotificationCreate
        print("✓ Notification models imported successfully")
    
    def test_video_models_import(self):
        """Verify video models are importable"""
        from models.video import (
            GalleryVideo, VideoCreate, VideoUpdate, FotoshareVideo,
            PCloudPhoto, FotoshareSectionCreate, GoogleDriveSectionCreate,
            SectionDownloadRequest
        )
        print("✓ Video models imported successfully")
    
    def test_collage_models_import(self):
        """Verify collage models are importable"""
        from models.collage import (
            CollagePreset, CollagePresetCreate, CollagePresetUpdate,
            CollagePresetPlaceholder, CollagePresetSettings
        )
        print("✓ Collage models imported successfully")


class TestBackgroundTasksModule:
    """Test that background tasks module is correctly set up"""
    
    def test_tasks_module_import(self):
        """Verify tasks module is importable"""
        from tasks import (
            init_tasks, stop_tasks,
            auto_refresh_fotoshare_sections,
            auto_sync_gdrive_sections,
            auto_sync_pcloud_sections,
            auto_sync_drive_backup_task,
            auto_delete_expired_galleries
        )
        print("✓ Background tasks module imported successfully")


class TestRoutesModule:
    """Test that routes module is correctly set up"""
    
    def test_routes_module_import(self):
        """Verify routes module is importable"""
        from routes import health_router
        print("✓ Routes module imported successfully")


class TestEffectiveSettings:
    """Test effective settings endpoint - verifies feature resolution"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_EMAIL,
            "password": USER_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_effective_settings(self, auth_token):
        """Test /api/auth/effective-settings endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/auth/effective-settings",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify effective settings structure
        assert "effective_plan" in data
        assert "features" in data
        assert "authority_source" in data
        
        print(f"✓ Effective settings endpoint working:")
        print(f"  Effective Plan: {data['effective_plan']}")
        print(f"  Authority Source: {data['authority_source']}")
        print(f"  Features: {list(data['features'].keys())}")


class TestUserFeatures:
    """Test user features endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_EMAIL,
            "password": USER_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_user_features(self, auth_token):
        """Test /api/user/features endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/user/features",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify features structure
        assert "features" in data
        assert "effective_plan" in data
        
        print(f"✓ User features endpoint working:")
        print(f"  Effective Plan: {data['effective_plan']}")
        print(f"  Features: {data['features']}")


class TestGlobalFeatureToggles:
    """Test global feature toggles endpoint"""
    
    def test_get_public_feature_toggles(self):
        """Test /api/public/feature-toggles endpoint (no auth required)"""
        response = requests.get(f"{BASE_URL}/api/public/feature-toggles")
        assert response.status_code == 200
        data = response.json()
        
        # Verify feature toggles structure
        assert isinstance(data, dict)
        
        print(f"✓ Public feature toggles endpoint working")
        print(f"  Available toggles: {list(data.keys())}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
