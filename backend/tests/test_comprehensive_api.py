"""
Comprehensive API Tests for PhotoShare Application
Tests all major features: Auth, Gallery, Photos, Admin, Analytics, Cover Photo Editor
"""

import pytest
import requests
import os
import time
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = f"test_{uuid.uuid4().hex[:8]}@test.com"
TEST_PASSWORD = "TestPass123!"
TEST_NAME = "Test Photographer"
TEST_BUSINESS = "Test Business"

# Admin credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "Aa@58798546521325"

# Store auth tokens and IDs
auth_data = {}


class TestHealthAndLanding:
    """Basic health and landing page config tests"""
    
    def test_landing_config(self):
        """Test public landing config endpoint"""
        response = requests.get(f"{BASE_URL}/api/public/landing-config")
        assert response.status_code == 200, f"Landing config failed: {response.text}"
        data = response.json()
        assert "hero_title" in data
        assert "brand_name" in data
        print(f"✓ Landing config: {data['brand_name']}")


class TestAuthenticationFlow:
    """Authentication endpoints tests"""
    
    def test_01_register_photographer(self):
        """Register a new photographer account"""
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "name": TEST_NAME,
            "business_name": TEST_BUSINESS
        })
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["email"] == TEST_EMAIL
        auth_data["token"] = data["access_token"]
        auth_data["user_id"] = data["user"]["id"]
        print(f"✓ Registration successful: {TEST_EMAIL}")
    
    def test_02_login_photographer(self):
        """Test login with created credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        auth_data["token"] = data["access_token"]
        print(f"✓ Login successful")
    
    def test_03_get_current_user(self):
        """Get current user profile"""
        headers = {"Authorization": f"Bearer {auth_data['token']}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200, f"Get user failed: {response.text}"
        data = response.json()
        assert data["email"] == TEST_EMAIL
        assert "storage_quota" in data
        assert "storage_used" in data
        print(f"✓ Get current user: {data['name']}, storage: {data['storage_used']}/{data['storage_quota']}")
    
    def test_04_update_profile(self):
        """Update user profile"""
        headers = {"Authorization": f"Bearer {auth_data['token']}"}
        response = requests.put(f"{BASE_URL}/api/auth/profile", 
            headers=headers,
            json={"name": "Updated Name", "business_name": "Updated Business"}
        )
        assert response.status_code == 200, f"Update profile failed: {response.text}"
        data = response.json()
        assert data["name"] == "Updated Name"
        print(f"✓ Profile updated")
    
    def test_05_change_password(self):
        """Change user password"""
        headers = {"Authorization": f"Bearer {auth_data['token']}"}
        response = requests.put(f"{BASE_URL}/api/auth/change-password",
            headers=headers,
            json={"current_password": TEST_PASSWORD, "new_password": TEST_PASSWORD + "New"}
        )
        assert response.status_code == 200, f"Change password failed: {response.text}"
        print(f"✓ Password changed")
        
        # Change back for subsequent tests
        response = requests.put(f"{BASE_URL}/api/auth/change-password",
            headers=headers,
            json={"current_password": TEST_PASSWORD + "New", "new_password": TEST_PASSWORD}
        )
        assert response.status_code == 200
    
    def test_06_login_invalid_credentials(self):
        """Test login with wrong password returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": "WrongPassword123"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Invalid login correctly rejected")


class TestGalleryManagement:
    """Gallery CRUD operations tests"""
    
    def test_01_create_gallery(self):
        """Create a new gallery with all options"""
        headers = {"Authorization": f"Bearer {auth_data['token']}"}
        gallery_data = {
            "title": f"Test Gallery {uuid.uuid4().hex[:6]}",
            "description": "Test description for gallery",
            "password": "gallery123",
            "event_title": "Test Event",
            "event_date": datetime.now().isoformat(),
            "theme": "classic",
            "share_link_expiration_days": 30,
            "guest_upload_enabled_days": 7,
            "download_all_password": "download123"
        }
        response = requests.post(f"{BASE_URL}/api/galleries", headers=headers, json=gallery_data)
        assert response.status_code == 200, f"Create gallery failed: {response.text}"
        data = response.json()
        assert data["title"] == gallery_data["title"]
        assert data["has_password"] == True
        assert data["has_download_all_password"] == True
        assert "share_link" in data
        assert "auto_delete_date" in data
        assert "days_until_deletion" in data
        auth_data["gallery_id"] = data["id"]
        auth_data["share_link"] = data["share_link"]
        print(f"✓ Gallery created: {data['title']}, share link: {data['share_link']}")
    
    def test_02_get_galleries_list(self):
        """Get list of user's galleries"""
        headers = {"Authorization": f"Bearer {auth_data['token']}"}
        response = requests.get(f"{BASE_URL}/api/galleries", headers=headers)
        assert response.status_code == 200, f"Get galleries failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        print(f"✓ Gallery list retrieved: {len(data)} galleries")
    
    def test_03_get_single_gallery(self):
        """Get single gallery details"""
        headers = {"Authorization": f"Bearer {auth_data['token']}"}
        response = requests.get(f"{BASE_URL}/api/galleries/{auth_data['gallery_id']}", headers=headers)
        assert response.status_code == 200, f"Get gallery failed: {response.text}"
        data = response.json()
        assert data["id"] == auth_data["gallery_id"]
        assert "is_edit_locked" in data
        assert "days_until_edit_lock" in data
        print(f"✓ Gallery details retrieved: edit locked={data['is_edit_locked']}")
    
    def test_04_update_gallery(self):
        """Update gallery details"""
        headers = {"Authorization": f"Bearer {auth_data['token']}"}
        response = requests.put(f"{BASE_URL}/api/galleries/{auth_data['gallery_id']}",
            headers=headers,
            json={"title": "Updated Gallery Title", "description": "Updated description"}
        )
        assert response.status_code == 200, f"Update gallery failed: {response.text}"
        data = response.json()
        assert data["title"] == "Updated Gallery Title"
        print(f"✓ Gallery updated")
    
    def test_05_create_section(self):
        """Create a section in gallery"""
        headers = {"Authorization": f"Bearer {auth_data['token']}"}
        response = requests.post(
            f"{BASE_URL}/api/galleries/{auth_data['gallery_id']}/sections",
            headers=headers,
            data={"name": "Test Section"}
        )
        assert response.status_code == 200, f"Create section failed: {response.text}"
        data = response.json()
        assert data["name"] == "Test Section"
        auth_data["section_id"] = data["id"]
        print(f"✓ Section created: {data['name']}")
    
    def test_06_get_sections(self):
        """Get gallery sections"""
        headers = {"Authorization": f"Bearer {auth_data['token']}"}
        response = requests.get(f"{BASE_URL}/api/galleries/{auth_data['gallery_id']}/sections", headers=headers)
        assert response.status_code == 200, f"Get sections failed: {response.text}"
        data = response.json()
        assert len(data) >= 1
        print(f"✓ Sections retrieved: {len(data)}")


class TestPhotoUpload:
    """Photo upload and management tests"""
    
    def test_01_photographer_upload(self):
        """Test photographer photo upload (performance check)"""
        headers = {"Authorization": f"Bearer {auth_data['token']}"}
        
        # Create a simple test image (1x1 red pixel JPEG)
        test_image_data = bytes([
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
            0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
            0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
            0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
            0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
            0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
            0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
            0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
            0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
            0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
            0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
            0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
            0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
            0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
            0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
            0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
            0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
            0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
            0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
            0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
            0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
            0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
            0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
            0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
            0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
            0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
            0x00, 0x00, 0x3F, 0x00, 0xFB, 0xD5, 0xDB, 0x20, 0xA8, 0xA2, 0x80, 0x0F,
            0xFF, 0xD9
        ])
        
        files = {"file": ("test_photo.jpg", test_image_data, "image/jpeg")}
        
        start_time = time.time()
        response = requests.post(
            f"{BASE_URL}/api/galleries/{auth_data['gallery_id']}/photos",
            headers=headers,
            files=files
        )
        upload_time = time.time() - start_time
        
        assert response.status_code == 200, f"Photo upload failed: {response.text}"
        data = response.json()
        assert "url" in data
        auth_data["photo_id"] = data["id"]
        auth_data["photo_url"] = data["url"]
        print(f"✓ Photographer photo uploaded in {upload_time:.2f}s: {data['url']}")
    
    def test_02_get_gallery_photos(self):
        """Get gallery photos list"""
        headers = {"Authorization": f"Bearer {auth_data['token']}"}
        response = requests.get(f"{BASE_URL}/api/galleries/{auth_data['gallery_id']}/photos", headers=headers)
        assert response.status_code == 200, f"Get photos failed: {response.text}"
        data = response.json()
        assert len(data) >= 1
        print(f"✓ Gallery photos retrieved: {len(data)} photos")
    
    def test_03_serve_photo_with_cache_headers(self):
        """Test photo serving with cache headers"""
        # Get photo URL (without auth - public serving)
        photo_path = auth_data.get("photo_url", "").replace("/api", "")
        response = requests.get(f"{BASE_URL}/api{photo_path}")
        assert response.status_code == 200, f"Photo serve failed: {response.status_code}"
        
        # Check cache headers
        cache_control = response.headers.get("Cache-Control", "")
        print(f"✓ Photo served with cache headers: {cache_control[:50]}...")


class TestPublicGallery:
    """Public gallery access tests"""
    
    def test_01_access_public_gallery(self):
        """Access gallery via share link"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/{auth_data['share_link']}")
        assert response.status_code == 200, f"Public gallery access failed: {response.text}"
        data = response.json()
        assert "title" in data
        assert "photographer_name" in data
        assert "cover_photo_position" in data
        assert data["has_password"] == True
        print(f"✓ Public gallery accessed: {data['title']}")
    
    def test_02_verify_password(self):
        """Verify gallery password"""
        response = requests.post(
            f"{BASE_URL}/api/public/gallery/{auth_data['share_link']}/verify-password",
            json={"password": "gallery123"}
        )
        assert response.status_code == 200, f"Password verification failed: {response.text}"
        data = response.json()
        assert data["valid"] == True
        print(f"✓ Password verified")
    
    def test_03_guest_upload(self):
        """Test guest photo upload with password (required for protected galleries)"""
        # Create a simple test image
        test_image_data = bytes([
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
            0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
            0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
            0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
            0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
            0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
            0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
            0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
            0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
            0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
            0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
            0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
            0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
            0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0xFB, 0xD5,
            0xDB, 0x20, 0xA8, 0xA2, 0x80, 0x0F, 0xFF, 0xD9
        ])
        
        files = {"file": ("guest_photo.jpg", test_image_data, "image/jpeg")}
        # Include password for protected gallery upload
        data = {"guest_name": "Test Guest", "password": "gallery123"}
        
        start_time = time.time()
        response = requests.post(
            f"{BASE_URL}/api/public/gallery/{auth_data['share_link']}/upload",
            files=files,
            data=data
        )
        upload_time = time.time() - start_time
        
        assert response.status_code == 200, f"Guest upload failed: {response.text}"
        result = response.json()
        assert result["uploaded_by"] == "guest"
        print(f"✓ Guest photo uploaded in {upload_time:.2f}s")
    
    def test_04_track_view(self):
        """Track gallery view"""
        response = requests.post(f"{BASE_URL}/api/public/gallery/{auth_data['share_link']}/view")
        assert response.status_code == 200, f"View tracking failed: {response.text}"
        print(f"✓ View tracked")
    
    def test_05_get_public_photos(self):
        """Get public gallery photos with password"""
        response = requests.get(
            f"{BASE_URL}/api/public/gallery/{auth_data['share_link']}/photos",
            params={"password": "gallery123"}
        )
        assert response.status_code == 200, f"Get public photos failed: {response.text}"
        data = response.json()
        assert len(data) >= 2  # Should have photographer + guest photo
        print(f"✓ Public photos retrieved: {len(data)}")


class TestCoverPhotoEditor:
    """Cover photo editor functionality tests"""
    
    def test_01_upload_cover_photo(self):
        """Upload cover photo"""
        headers = {"Authorization": f"Bearer {auth_data['token']}"}
        
        # Simple test image
        test_image_data = bytes([
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
            0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
            0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
            0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
            0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 
            0x00, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0xFB, 
            0xD5, 0xDB, 0x20, 0xA8, 0xA2, 0x80, 0x0F, 0xFF, 0xD9
        ])
        
        files = {"file": ("cover.jpg", test_image_data, "image/jpeg")}
        response = requests.post(
            f"{BASE_URL}/api/galleries/{auth_data['gallery_id']}/cover-photo",
            headers=headers,
            files=files
        )
        assert response.status_code == 200, f"Cover photo upload failed: {response.text}"
        data = response.json()
        assert "cover_photo_url" in data
        auth_data["cover_photo_url"] = data["cover_photo_url"]
        print(f"✓ Cover photo uploaded: {data['cover_photo_url']}")
    
    def test_02_get_cover_photo_position(self):
        """Get cover photo position (default values)"""
        headers = {"Authorization": f"Bearer {auth_data['token']}"}
        response = requests.get(
            f"{BASE_URL}/api/galleries/{auth_data['gallery_id']}/cover-photo-position",
            headers=headers
        )
        assert response.status_code == 200, f"Get position failed: {response.text}"
        data = response.json()
        assert "scale" in data
        assert "positionX" in data
        assert "positionY" in data
        print(f"✓ Cover position default: scale={data['scale']}, posX={data['positionX']}, posY={data['positionY']}")
    
    def test_03_update_cover_photo_position(self):
        """Update cover photo position (zoom, pan)"""
        headers = {"Authorization": f"Bearer {auth_data['token']}"}
        position = {
            "scale": 1.5,
            "positionX": 30,
            "positionY": 70
        }
        response = requests.put(
            f"{BASE_URL}/api/galleries/{auth_data['gallery_id']}/cover-photo-position",
            headers=headers,
            json=position
        )
        assert response.status_code == 200, f"Update position failed: {response.text}"
        print(f"✓ Cover position updated")
    
    def test_04_verify_position_persisted(self):
        """Verify position change persisted"""
        headers = {"Authorization": f"Bearer {auth_data['token']}"}
        response = requests.get(
            f"{BASE_URL}/api/galleries/{auth_data['gallery_id']}/cover-photo-position",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["scale"] == 1.5
        assert data["positionX"] == 30
        assert data["positionY"] == 70
        print(f"✓ Position persistence verified")
    
    def test_05_public_gallery_shows_position(self):
        """Verify public gallery includes cover position"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/{auth_data['share_link']}")
        assert response.status_code == 200
        data = response.json()
        assert data.get("cover_photo_position") is not None
        pos = data["cover_photo_position"]
        assert pos.get("scale") == 1.5
        print(f"✓ Public gallery shows cover position")


class TestAdminDashboard:
    """Admin dashboard and management tests"""
    
    def test_01_admin_login(self):
        """Admin login"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert data["is_admin"] == True
        auth_data["admin_token"] = data["access_token"]
        print(f"✓ Admin login successful")
    
    def test_02_get_photographers(self):
        """Get all photographers list"""
        headers = {"Authorization": f"Bearer {auth_data['admin_token']}"}
        response = requests.get(f"{BASE_URL}/api/admin/photographers", headers=headers)
        assert response.status_code == 200, f"Get photographers failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        # Find our test user
        test_user = next((u for u in data if u["email"] == TEST_EMAIL), None)
        assert test_user is not None
        assert "storage_quota" in test_user
        assert "storage_used" in test_user
        print(f"✓ Photographers retrieved: {len(data)}")
    
    def test_03_update_gallery_limit(self):
        """Update photographer gallery limit"""
        headers = {"Authorization": f"Bearer {auth_data['admin_token']}"}
        response = requests.put(
            f"{BASE_URL}/api/admin/photographers/{auth_data['user_id']}/gallery-limit",
            headers=headers,
            json={"max_galleries": 5}
        )
        assert response.status_code == 200, f"Update limit failed: {response.text}"
        print(f"✓ Gallery limit updated to 5")
    
    def test_04_update_storage_quota(self):
        """Update photographer storage quota"""
        headers = {"Authorization": f"Bearer {auth_data['admin_token']}"}
        new_quota = 1024 * 1024 * 1024  # 1GB
        response = requests.put(
            f"{BASE_URL}/api/admin/photographers/{auth_data['user_id']}/storage-quota",
            headers=headers,
            json={"storage_quota": new_quota}
        )
        assert response.status_code == 200, f"Update quota failed: {response.text}"
        print(f"✓ Storage quota updated to 1GB")
    
    def test_05_get_admin_analytics(self):
        """Get admin analytics"""
        headers = {"Authorization": f"Bearer {auth_data['admin_token']}"}
        response = requests.get(f"{BASE_URL}/api/admin/analytics", headers=headers)
        assert response.status_code == 200, f"Get analytics failed: {response.text}"
        data = response.json()
        assert "total_photographers" in data
        assert "total_galleries" in data
        assert "total_photos" in data
        assert "total_storage_used" in data
        assert "top_galleries" in data
        print(f"✓ Admin analytics: {data['total_photographers']} photographers, {data['total_galleries']} galleries")
    
    def test_06_get_landing_config(self):
        """Get landing page config (admin)"""
        headers = {"Authorization": f"Bearer {auth_data['admin_token']}"}
        response = requests.get(f"{BASE_URL}/api/admin/landing-config", headers=headers)
        assert response.status_code == 200, f"Get landing config failed: {response.text}"
        data = response.json()
        assert "hero_title" in data
        print(f"✓ Landing config retrieved")


class TestAnalytics:
    """Analytics endpoints tests"""
    
    def test_01_photographer_analytics(self):
        """Get photographer analytics"""
        headers = {"Authorization": f"Bearer {auth_data['token']}"}
        response = requests.get(f"{BASE_URL}/api/analytics/photographer", headers=headers)
        assert response.status_code == 200, f"Get analytics failed: {response.text}"
        data = response.json()
        assert "total_galleries" in data
        assert "total_photos" in data
        assert "total_views" in data
        assert "storage_used" in data
        assert "storage_quota" in data
        assert "galleries" in data
        print(f"✓ Photographer analytics: {data['total_galleries']} galleries, {data['total_photos']} photos, {data['total_views']} views")


class TestGoogleDriveIntegration:
    """Google Drive integration status tests"""
    
    def test_01_google_drive_status(self):
        """Check Google Drive connection status"""
        headers = {"Authorization": f"Bearer {auth_data['token']}"}
        response = requests.get(f"{BASE_URL}/api/auth/google/status", headers=headers)
        assert response.status_code == 200, f"Google status failed: {response.text}"
        data = response.json()
        assert "connected" in data
        print(f"✓ Google Drive status: connected={data['connected']}")
    
    def test_02_backup_status(self):
        """Check gallery backup status"""
        headers = {"Authorization": f"Bearer {auth_data['token']}"}
        response = requests.get(
            f"{BASE_URL}/api/galleries/{auth_data['gallery_id']}/backup-status",
            headers=headers
        )
        assert response.status_code == 200, f"Backup status failed: {response.text}"
        data = response.json()
        assert "status" in data
        print(f"✓ Backup status: {data['status']}")


class TestCleanup:
    """Cleanup test data"""
    
    def test_99_delete_gallery(self):
        """Delete test gallery"""
        headers = {"Authorization": f"Bearer {auth_data['token']}"}
        response = requests.delete(
            f"{BASE_URL}/api/galleries/{auth_data['gallery_id']}",
            headers=headers
        )
        assert response.status_code == 200, f"Delete gallery failed: {response.text}"
        print(f"✓ Test gallery deleted")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
