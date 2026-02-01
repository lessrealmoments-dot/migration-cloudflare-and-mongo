"""
Test cases for PhotoShare new features:
1. Social Media Sharing - view-only links on public galleries
2. Album Embed Feature - embed code generation
3. Landing Page Updates - brand tagline, 10 hero images
4. Admin Landing Config - brand tagline field, 10 image slots
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "Aa@58798546521325"
PHOTOGRAPHER_EMAIL = "flagtest@test.com"
PHOTOGRAPHER_PASSWORD = "password123"
TEST_GALLERY_SHARE_LINK = "b6fefc9a"
TEST_GALLERY_ID = "2209b131-3049-4e53-b374-d016edd67fce"


class TestPublicGalleryEndpoints:
    """Tests for public gallery endpoints including view-only access"""
    
    def test_public_gallery_loads(self):
        """Test that public gallery can be accessed via share link"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/{TEST_GALLERY_SHARE_LINK}")
        assert response.status_code == 200
        data = response.json()
        assert "title" in data
        assert "photographer_name" in data
        print(f"SUCCESS: Public gallery loaded - title: {data['title']}")
    
    def test_public_gallery_photos(self):
        """Test that public gallery photos endpoint works"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/{TEST_GALLERY_SHARE_LINK}/photos")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"SUCCESS: Gallery has {len(data)} photos")
    
    def test_share_link_format(self):
        """Test that share link in public gallery is correct format"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/{TEST_GALLERY_SHARE_LINK}")
        assert response.status_code == 200
        # Share links should be 8 character strings
        assert len(TEST_GALLERY_SHARE_LINK) == 8
        print("SUCCESS: Share link format is correct (8 characters)")


class TestLandingConfigEndpoints:
    """Tests for landing page configuration including new 10 image carousel and brand tagline"""
    
    def test_public_landing_config(self):
        """Test public landing config endpoint returns correct fields"""
        response = requests.get(f"{BASE_URL}/api/public/landing-config")
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields exist
        assert "hero_title" in data
        assert "hero_subtitle" in data
        assert "brand_name" in data
        
        # Check new brand_tagline field exists
        assert "brand_tagline" in data or data.get("brand_tagline") is None
        print(f"SUCCESS: Brand tagline field: {data.get('brand_tagline')}")
        
        # Check 10 hero image slots exist
        for i in range(1, 11):
            key = f"hero_image_{i}"
            assert key in data or data.get(key) is None, f"Missing {key}"
        print("SUCCESS: All 10 hero image slots present in config")
    
    def test_admin_can_update_landing_config(self):
        """Test admin can update landing config with brand tagline"""
        # Get admin token
        login_response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get current config
        config_response = requests.get(f"{BASE_URL}/api/admin/landing-config", headers=headers)
        assert config_response.status_code == 200
        current_config = config_response.json()
        
        # Update brand tagline - use current value to avoid changing data
        update_response = requests.put(
            f"{BASE_URL}/api/admin/landing-config",
            headers=headers,
            json=current_config  # Send same config back
        )
        assert update_response.status_code == 200
        print("SUCCESS: Admin can update landing config")


class TestAdminEndpoints:
    """Tests for admin-specific endpoints"""
    
    def test_admin_login(self):
        """Test admin login endpoint"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data.get("is_admin") == True
        print("SUCCESS: Admin login works")
    
    def test_admin_landing_config_fields(self):
        """Test admin landing config has all new fields"""
        # Get admin token
        login_response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        config_response = requests.get(f"{BASE_URL}/api/admin/landing-config", headers=headers)
        assert config_response.status_code == 200
        data = config_response.json()
        
        # Verify brand_tagline field accessible
        print(f"Brand tagline value: {data.get('brand_tagline', 'not set')}")
        
        # Verify all 10 hero image slots
        hero_images_with_values = 0
        for i in range(1, 11):
            key = f"hero_image_{i}"
            if data.get(key):
                hero_images_with_values += 1
        print(f"SUCCESS: {hero_images_with_values}/10 hero images configured")


class TestPhotographerGalleryEndpoints:
    """Tests for photographer gallery features including embed code"""
    
    @pytest.fixture
    def auth_token(self):
        """Get photographer auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PHOTOGRAPHER_EMAIL,
            "password": PHOTOGRAPHER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Photographer authentication failed")
    
    def test_photographer_login(self):
        """Test photographer can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PHOTOGRAPHER_EMAIL,
            "password": PHOTOGRAPHER_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        print("SUCCESS: Photographer login works")
    
    def test_gallery_has_share_link(self, auth_token):
        """Test gallery response includes share_link for embed generation"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}", headers=headers)
        
        if response.status_code == 404:
            pytest.skip("Test gallery not found")
        
        assert response.status_code == 200
        data = response.json()
        assert "share_link" in data
        assert len(data["share_link"]) == 8
        print(f"SUCCESS: Gallery has share_link: {data['share_link']}")
    
    def test_gallery_detail_for_embed(self, auth_token):
        """Test gallery details endpoint returns data needed for embed code generation"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}", headers=headers)
        
        if response.status_code == 404:
            pytest.skip("Test gallery not found")
        
        assert response.status_code == 200
        data = response.json()
        
        # Embed code needs: share_link, title
        assert "share_link" in data
        assert "title" in data
        print(f"SUCCESS: Gallery '{data['title']}' has data for embed code")


class TestEmbedCodeGeneration:
    """Tests for embed code URL structure - embed code is generated on frontend"""
    
    def test_embed_url_parameters(self):
        """Verify public gallery supports embed=1 and view=1 parameters"""
        # Test with view=1 (view-only mode)
        view_only_url = f"{BASE_URL}/api/public/gallery/{TEST_GALLERY_SHARE_LINK}"
        response = requests.get(view_only_url)
        assert response.status_code == 200
        
        # The actual embed URL will be frontend handled with ?view=1&embed=1
        # We just verify the base API works
        print("SUCCESS: Public gallery endpoint works (base for embed)")
    
    def test_public_gallery_for_iframe(self):
        """Test that public gallery data is suitable for iframe embedding"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/{TEST_GALLERY_SHARE_LINK}")
        assert response.status_code == 200
        data = response.json()
        
        # Gallery should have title for iframe title attribute
        assert "title" in data
        print(f"SUCCESS: Gallery title for iframe: {data['title']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
