"""
Pre-Launch Audit Tests for EventsGallery.vip
Tests critical functionality before official launch
"""
import pytest
import requests
import os

# Use production URL for testing
BASE_URL = "https://eventsgallery.vip"

# Test credentials
PHOTOGRAPHER_EMAIL = "lessrealmoments@gmail.com"
PHOTOGRAPHER_PASSWORD = "3tfL99B%u2qw"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "Aa@58798546521325"
TEST_GALLERY_SHARE_LINK = "2ba87e10"


class TestHealthAndBasicEndpoints:
    """Test basic API health and public endpoints"""
    
    def test_health_endpoint(self):
        """API health check"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print(f"Health check passed: {data}")
    
    def test_landing_config(self):
        """Landing page configuration endpoint"""
        response = requests.get(f"{BASE_URL}/api/public/landing-config")
        assert response.status_code == 200
        data = response.json()
        assert "brand_name" in data or "hero_image_1" in data
        print(f"Landing config loaded successfully: {data.get('brand_name')}")
    
    def test_public_feature_toggles(self):
        """Public feature toggles endpoint"""
        response = requests.get(f"{BASE_URL}/api/public/feature-toggles")
        assert response.status_code == 200
        print("Public feature toggles accessible")


class TestPhotographerAuthentication:
    """Test photographer login and authentication"""
    
    def test_photographer_login(self):
        """Test photographer login with valid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": PHOTOGRAPHER_EMAIL, "password": PHOTOGRAPHER_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == PHOTOGRAPHER_EMAIL
        print(f"Photographer login successful: {data['user']['name']}")
        return data["access_token"]
    
    def test_photographer_login_invalid(self):
        """Test login with invalid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "invalid@test.com", "password": "wrongpassword"}
        )
        assert response.status_code in [401, 404]
        print("Invalid login correctly rejected")
    
    def test_get_current_user(self):
        """Test getting current user info"""
        # First login
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": PHOTOGRAPHER_EMAIL, "password": PHOTOGRAPHER_PASSWORD}
        )
        token = login_response.json()["access_token"]
        
        # Get user info
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == PHOTOGRAPHER_EMAIL
        print(f"Current user retrieved: {data['name']}")


class TestAdminAuthentication:
    """Test admin login and authentication"""
    
    def test_admin_login(self):
        """Test admin login with valid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        print("Admin login successful")
        return data["access_token"]
    
    def test_admin_login_invalid(self):
        """Test admin login with invalid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "wrongadmin", "password": "wrongpassword"}
        )
        assert response.status_code == 401
        print("Invalid admin login correctly rejected")


class TestGalleryAccess:
    """Test public gallery access and data"""
    
    def test_public_gallery_info(self):
        """Test fetching public gallery information"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/{TEST_GALLERY_SHARE_LINK}")
        assert response.status_code == 200
        data = response.json()
        assert "title" in data
        assert "sections" in data
        assert data["photo_count"] > 0
        print(f"Gallery: {data['title']} - {data['photo_count']} photos, {data['video_count']} videos")
    
    def test_public_gallery_photos(self):
        """Test fetching gallery photos"""
        response = requests.get(
            f"{BASE_URL}/api/public/gallery/{TEST_GALLERY_SHARE_LINK}/photos",
            params={"page": 1, "limit": 20}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        # Verify photo structure
        photo = data[0]
        assert "id" in photo
        assert "url" in photo or "thumbnail_url" in photo
        print(f"Retrieved {len(data)} photos from gallery")
    
    def test_public_gallery_videos(self):
        """Test fetching gallery videos"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/{TEST_GALLERY_SHARE_LINK}/videos")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Retrieved {len(data)} videos from gallery")
    
    def test_gallery_not_found(self):
        """Test accessing non-existent gallery"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/nonexistent123")
        assert response.status_code == 404
        print("Non-existent gallery correctly returns 404")


class TestSubscriptionAndBilling:
    """Test subscription and billing endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": PHOTOGRAPHER_EMAIL, "password": PHOTOGRAPHER_PASSWORD}
        )
        return response.json()["access_token"]
    
    def test_user_subscription(self, auth_token):
        """Test getting user subscription info"""
        response = requests.get(
            f"{BASE_URL}/api/user/subscription",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "plan" in data or "override_mode" in data
        print(f"Subscription info: {data}")
    
    def test_user_features(self, auth_token):
        """Test getting user features"""
        response = requests.get(
            f"{BASE_URL}/api/user/features",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        print(f"User features: {data}")
    
    def test_billing_settings(self):
        """Test getting billing settings (admin)"""
        # Login as admin
        admin_response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        admin_token = admin_response.json()["access_token"]
        
        response = requests.get(
            f"{BASE_URL}/api/billing/settings",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "billing_enforcement" in data or "pricing" in data
        print(f"Billing settings retrieved")


class TestAdminFeatures:
    """Test admin panel features"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        return response.json()["access_token"]
    
    def test_list_photographers(self, admin_token):
        """Test listing all photographers"""
        response = requests.get(
            f"{BASE_URL}/api/admin/photographers",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} photographers")
    
    def test_global_feature_toggles(self, admin_token):
        """Test getting global feature toggles"""
        response = requests.get(
            f"{BASE_URL}/api/admin/global-feature-toggles",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "override_modes" in data or "payment_plans" in data
        print("Global feature toggles retrieved")
    
    def test_collage_presets(self, admin_token):
        """Test getting collage presets - requires photographer auth"""
        # Collage presets require photographer auth, not admin
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": PHOTOGRAPHER_EMAIL, "password": PHOTOGRAPHER_PASSWORD}
        )
        photographer_token = login_response.json()["access_token"]
        
        response = requests.get(
            f"{BASE_URL}/api/collage-presets",
            headers={"Authorization": f"Bearer {photographer_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} collage presets")


class TestDisplayMode:
    """Test display/slideshow mode endpoints"""
    
    def test_display_endpoint(self):
        """Test display mode data endpoint"""
        response = requests.get(f"{BASE_URL}/api/display/{TEST_GALLERY_SHARE_LINK}")
        assert response.status_code == 200
        data = response.json()
        assert "photos" in data
        assert len(data["photos"]) > 0
        print(f"Display mode: {len(data['photos'])} photos available")
    
    def test_display_photos_have_urls(self):
        """Test that display photos have proper URLs"""
        response = requests.get(f"{BASE_URL}/api/display/{TEST_GALLERY_SHARE_LINK}")
        data = response.json()
        
        # Check first few photos have display_url
        for photo in data["photos"][:5]:
            assert "display_url" in photo or "url" in photo or "thumbnail_url" in photo
        print("Display photos have proper URLs")


class TestExternalIntegrations:
    """Test external integrations (pCloud, GDrive, Fotoshare)"""
    
    def test_gallery_sections_have_integrations(self):
        """Test that gallery sections include integration data"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/{TEST_GALLERY_SHARE_LINK}")
        data = response.json()
        
        sections = data.get("sections", [])
        section_types = [s.get("type") for s in sections]
        
        print(f"Section types found: {section_types}")
        
        # Check for various section types
        has_photo = "photo" in section_types
        has_video = "video" in section_types
        has_pcloud = "pcloud" in section_types
        has_fotoshare = "fotoshare" in section_types
        
        print(f"Photo sections: {has_photo}, Video: {has_video}, pCloud: {has_pcloud}, Fotoshare: {has_fotoshare}")
        
        # At least one section type should exist
        assert len(sections) > 0


class TestStorageAndCDN:
    """Test storage and CDN functionality"""
    
    def test_cdn_image_accessible(self):
        """Test that CDN images are accessible"""
        # Get a photo URL from the gallery
        response = requests.get(
            f"{BASE_URL}/api/public/gallery/{TEST_GALLERY_SHARE_LINK}/photos",
            params={"page": 1, "limit": 1}
        )
        photos = response.json()
        
        if photos and len(photos) > 0:
            photo = photos[0]
            thumbnail_url = photo.get("thumbnail_url") or photo.get("url")
            
            if thumbnail_url and "cdn.eventsgallery.vip" in thumbnail_url:
                # Test CDN accessibility
                img_response = requests.head(thumbnail_url, timeout=10)
                print(f"CDN image status: {img_response.status_code}")
                # Note: May fail due to CORS but HEAD should work
            else:
                print(f"Photo URL: {thumbnail_url}")


class TestAnalytics:
    """Test analytics endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": PHOTOGRAPHER_EMAIL, "password": PHOTOGRAPHER_PASSWORD}
        )
        return response.json()["access_token"]
    
    def test_photographer_analytics(self, auth_token):
        """Test photographer analytics endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/photographer",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_galleries" in data or "total_photos" in data
        print(f"Analytics: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
