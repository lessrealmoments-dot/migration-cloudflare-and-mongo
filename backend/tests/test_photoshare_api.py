"""
PhotoShare API Tests - Comprehensive E2E testing
Tests: Auth, Galleries, Photos, Public Access, Guest Uploads, Downloads
"""
import pytest
import requests
import os
from datetime import datetime
from io import BytesIO
from PIL import Image

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://imgshare-30.preview.emergentagent.com').rstrip('/')


class TestAuthentication:
    """Authentication endpoint tests - Registration, Login, Get User"""
    
    def test_register_new_user(self, api_client):
        """Test user registration creates account and returns token"""
        timestamp = datetime.now().strftime('%H%M%S%f')
        response = api_client.post(f"{BASE_URL}/api/auth/register", json={
            "email": f"test_reg_{timestamp}@example.com",
            "password": "TestPass123!",
            "name": "Test User"
        })
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == f"test_reg_{timestamp}@example.com"
        assert data["user"]["name"] == "Test User"
        assert "id" in data["user"]
    
    def test_login_existing_user(self, api_client, registered_user):
        """Test login with valid credentials returns token"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": registered_user["credentials"]["email"],
            "password": registered_user["credentials"]["password"]
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == registered_user["credentials"]["email"]
    
    def test_login_invalid_credentials(self, api_client):
        """Test login with invalid credentials returns 401"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": "nonexistent@example.com",
            "password": "wrongpassword"
        })
        
        assert response.status_code == 401
    
    def test_get_current_user(self, authenticated_client, registered_user):
        """Test get current user returns user data"""
        response = authenticated_client.get(f"{BASE_URL}/api/auth/me")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["email"] == registered_user["credentials"]["email"]
        assert data["name"] == registered_user["credentials"]["name"]


class TestGalleryManagement:
    """Gallery CRUD tests - Create, Read, Update, Delete galleries"""
    
    @pytest.fixture
    def created_gallery(self, authenticated_client):
        """Create a test gallery and return it"""
        response = authenticated_client.post(f"{BASE_URL}/api/galleries", json={
            "title": "TEST_Gallery",
            "description": "Test gallery for API testing",
            "event_title": "Test Event",
            "event_date": "2025-02-15",
            "theme": "classic"
        })
        
        if response.status_code == 200:
            return response.json()
        pytest.skip(f"Gallery creation failed: {response.text}")
    
    def test_create_gallery_basic(self, authenticated_client):
        """Test creating a basic gallery"""
        response = authenticated_client.post(f"{BASE_URL}/api/galleries", json={
            "title": "TEST_Basic Gallery",
            "description": "A basic test gallery"
        })
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["title"] == "TEST_Basic Gallery"
        assert "id" in data
        assert "share_link" in data
        assert data["has_password"] == False
    
    def test_create_gallery_with_theme(self, authenticated_client):
        """Test creating gallery with theme selection"""
        response = authenticated_client.post(f"{BASE_URL}/api/galleries", json={
            "title": "TEST_Themed Gallery",
            "theme": "romantic"
        })
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["theme"] == "romantic"
    
    def test_create_protected_gallery(self, authenticated_client):
        """Test creating password-protected gallery"""
        response = authenticated_client.post(f"{BASE_URL}/api/galleries", json={
            "title": "TEST_Protected Gallery",
            "password": "secret123",
            "download_all_password": "download456"
        })
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["has_password"] == True
        assert data["has_download_all_password"] == True
    
    def test_get_galleries_list(self, authenticated_client, created_gallery):
        """Test getting list of user galleries"""
        response = authenticated_client.get(f"{BASE_URL}/api/galleries")
        
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        assert len(data) >= 1
        
        # Verify created gallery is in list
        gallery_ids = [g["id"] for g in data]
        assert created_gallery["id"] in gallery_ids
    
    def test_get_single_gallery(self, authenticated_client, created_gallery):
        """Test getting single gallery by ID"""
        response = authenticated_client.get(f"{BASE_URL}/api/galleries/{created_gallery['id']}")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["id"] == created_gallery["id"]
        assert data["title"] == created_gallery["title"]
    
    def test_update_gallery(self, authenticated_client, created_gallery):
        """Test updating gallery details"""
        response = authenticated_client.put(
            f"{BASE_URL}/api/galleries/{created_gallery['id']}",
            json={
                "title": "TEST_Updated Gallery Title",
                "theme": "modern"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["title"] == "TEST_Updated Gallery Title"
        assert data["theme"] == "modern"
        
        # Verify persistence with GET
        get_response = authenticated_client.get(f"{BASE_URL}/api/galleries/{created_gallery['id']}")
        assert get_response.status_code == 200
        assert get_response.json()["title"] == "TEST_Updated Gallery Title"


class TestPhotoUpload:
    """Photo upload tests - Photographer uploads"""
    
    @pytest.fixture
    def gallery_for_photos(self, authenticated_client):
        """Create a gallery for photo tests"""
        response = authenticated_client.post(f"{BASE_URL}/api/galleries", json={
            "title": "TEST_Photo Gallery"
        })
        if response.status_code == 200:
            return response.json()
        pytest.skip("Gallery creation failed")
    
    def test_upload_photo_to_gallery(self, authenticated_client, gallery_for_photos, test_image_factory):
        """Test photographer can upload photo to gallery"""
        img = test_image_factory('blue')
        
        # Remove Content-Type for multipart
        headers = dict(authenticated_client.headers)
        headers.pop('Content-Type', None)
        
        response = requests.post(
            f"{BASE_URL}/api/galleries/{gallery_for_photos['id']}/photos",
            files={'file': ('test.jpg', img, 'image/jpeg')},
            headers=headers
        )
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        
        assert "id" in data
        assert data["gallery_id"] == gallery_for_photos["id"]
        assert data["uploaded_by"] == "photographer"
        assert "url" in data
    
    def test_get_gallery_photos(self, authenticated_client, gallery_for_photos, test_image_factory):
        """Test getting photos from gallery"""
        # First upload a photo
        img = test_image_factory('green')
        headers = dict(authenticated_client.headers)
        headers.pop('Content-Type', None)
        
        requests.post(
            f"{BASE_URL}/api/galleries/{gallery_for_photos['id']}/photos",
            files={'file': ('test.jpg', img, 'image/jpeg')},
            headers=headers
        )
        
        # Get photos
        response = authenticated_client.get(f"{BASE_URL}/api/galleries/{gallery_for_photos['id']}/photos")
        
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        assert len(data) >= 1


class TestPublicGalleryAccess:
    """Public gallery access tests - Share links, guest viewing"""
    
    @pytest.fixture
    def public_gallery(self, authenticated_client, test_image_factory):
        """Create a public gallery with photos"""
        # Create gallery
        response = authenticated_client.post(f"{BASE_URL}/api/galleries", json={
            "title": "TEST_Public Gallery",
            "description": "A public gallery for testing"
        })
        
        if response.status_code != 200:
            pytest.skip("Gallery creation failed")
        
        gallery = response.json()
        
        # Upload a photo
        img = test_image_factory('yellow')
        headers = dict(authenticated_client.headers)
        headers.pop('Content-Type', None)
        
        requests.post(
            f"{BASE_URL}/api/galleries/{gallery['id']}/photos",
            files={'file': ('test.jpg', img, 'image/jpeg')},
            headers=headers
        )
        
        return gallery
    
    def test_access_public_gallery_via_share_link(self, api_client, public_gallery):
        """Test accessing gallery via share link"""
        response = api_client.get(f"{BASE_URL}/api/public/gallery/{public_gallery['share_link']}")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["title"] == public_gallery["title"]
        assert "photographer_name" in data
        assert data["has_password"] == False
    
    def test_get_public_gallery_photos(self, api_client, public_gallery):
        """Test getting photos from public gallery"""
        response = api_client.get(f"{BASE_URL}/api/public/gallery/{public_gallery['share_link']}/photos")
        
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)


class TestGuestUpload:
    """Guest photo upload tests - KEY FEATURE"""
    
    @pytest.fixture
    def gallery_for_guest_upload(self, authenticated_client):
        """Create a gallery that allows guest uploads"""
        response = authenticated_client.post(f"{BASE_URL}/api/galleries", json={
            "title": "TEST_Guest Upload Gallery",
            "guest_upload_enabled_days": 7
        })
        
        if response.status_code == 200:
            return response.json()
        pytest.skip("Gallery creation failed")
    
    def test_guest_can_upload_photo(self, api_client, gallery_for_guest_upload, test_image_factory):
        """Test guest can upload photo to public gallery"""
        img = test_image_factory('purple')
        
        # Guest upload - no auth token
        response = requests.post(
            f"{BASE_URL}/api/public/gallery/{gallery_for_guest_upload['share_link']}/upload",
            files={'file': ('guest_photo.jpg', img, 'image/jpeg')}
        )
        
        assert response.status_code == 200, f"Guest upload failed: {response.text}"
        data = response.json()
        
        assert data["uploaded_by"] == "guest"
        assert data["gallery_id"] == gallery_for_guest_upload["id"]


class TestProtectedGallery:
    """Protected gallery tests - Password verification, protected uploads"""
    
    @pytest.fixture
    def protected_gallery(self, authenticated_client):
        """Create a password-protected gallery"""
        response = authenticated_client.post(f"{BASE_URL}/api/galleries", json={
            "title": "TEST_Protected Gallery",
            "password": "gallery123",
            "download_all_password": "download456"
        })
        
        if response.status_code == 200:
            return response.json()
        pytest.skip("Protected gallery creation failed")
    
    def test_verify_correct_password(self, api_client, protected_gallery):
        """Test verifying correct gallery password"""
        response = api_client.post(
            f"{BASE_URL}/api/public/gallery/{protected_gallery['share_link']}/verify-password",
            json={"password": "gallery123"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] == True
    
    def test_reject_wrong_password(self, api_client, protected_gallery):
        """Test rejecting wrong gallery password"""
        response = api_client.post(
            f"{BASE_URL}/api/public/gallery/{protected_gallery['share_link']}/verify-password",
            json={"password": "wrongpassword"}
        )
        
        assert response.status_code == 401
    
    def test_guest_upload_with_password(self, api_client, protected_gallery, test_image_factory):
        """Test guest upload to protected gallery with password"""
        img = test_image_factory('orange')
        
        response = requests.post(
            f"{BASE_URL}/api/public/gallery/{protected_gallery['share_link']}/upload",
            data={'password': 'gallery123'},
            files={'file': ('protected_guest.jpg', img, 'image/jpeg')}
        )
        
        assert response.status_code == 200, f"Protected guest upload failed: {response.text}"
        data = response.json()
        assert data["uploaded_by"] == "guest"


class TestPhotoDownload:
    """Photo download tests - Individual and bulk downloads"""
    
    @pytest.fixture
    def gallery_with_photos(self, authenticated_client, test_image_factory):
        """Create gallery with photos for download testing"""
        # Create gallery with download password
        response = authenticated_client.post(f"{BASE_URL}/api/galleries", json={
            "title": "TEST_Download Gallery",
            "download_all_password": "bulkdownload123"
        })
        
        if response.status_code != 200:
            pytest.skip("Gallery creation failed")
        
        gallery = response.json()
        
        # Upload photos
        headers = dict(authenticated_client.headers)
        headers.pop('Content-Type', None)
        
        for color in ['red', 'green', 'blue']:
            img = test_image_factory(color)
            requests.post(
                f"{BASE_URL}/api/galleries/{gallery['id']}/photos",
                files={'file': (f'{color}.jpg', img, 'image/jpeg')},
                headers=headers
            )
        
        return gallery
    
    def test_serve_individual_photo(self, authenticated_client, gallery_with_photos):
        """Test serving individual photo file"""
        # Get photos
        response = authenticated_client.get(f"{BASE_URL}/api/galleries/{gallery_with_photos['id']}/photos")
        photos = response.json()
        
        if not photos:
            pytest.skip("No photos available")
        
        # Get filename from URL
        filename = photos[0]['url'].split('/')[-1]
        
        # Serve photo
        serve_response = requests.get(f"{BASE_URL}/api/photos/serve/{filename}")
        
        assert serve_response.status_code == 200
        assert 'image' in serve_response.headers.get('Content-Type', '')
    
    def test_download_individual_photo(self, authenticated_client, gallery_with_photos):
        """Test downloading individual photo with download flag"""
        # Get photos
        response = authenticated_client.get(f"{BASE_URL}/api/galleries/{gallery_with_photos['id']}/photos")
        photos = response.json()
        
        if not photos:
            pytest.skip("No photos available")
        
        filename = photos[0]['url'].split('/')[-1]
        
        # Download photo
        download_response = requests.get(f"{BASE_URL}/api/photos/serve/{filename}?download=true")
        
        assert download_response.status_code == 200
        assert 'attachment' in download_response.headers.get('Content-Disposition', '')
    
    def test_bulk_download_with_password(self, api_client, gallery_with_photos):
        """Test bulk download with correct password"""
        response = api_client.post(
            f"{BASE_URL}/api/public/gallery/{gallery_with_photos['share_link']}/download-all",
            json={"password": "bulkdownload123"}
        )
        
        assert response.status_code == 200
        assert response.headers.get('Content-Type') == 'application/zip'
    
    def test_bulk_download_wrong_password(self, api_client, gallery_with_photos):
        """Test bulk download with wrong password fails"""
        response = api_client.post(
            f"{BASE_URL}/api/public/gallery/{gallery_with_photos['share_link']}/download-all",
            json={"password": "wrongpassword"}
        )
        
        assert response.status_code == 401


class TestSectionManagement:
    """Gallery section management tests"""
    
    @pytest.fixture
    def gallery_for_sections(self, authenticated_client):
        """Create gallery for section tests"""
        response = authenticated_client.post(f"{BASE_URL}/api/galleries", json={
            "title": "TEST_Section Gallery"
        })
        
        if response.status_code == 200:
            return response.json()
        pytest.skip("Gallery creation failed")
    
    def test_create_section(self, authenticated_client, gallery_for_sections):
        """Test creating a gallery section"""
        headers = dict(authenticated_client.headers)
        headers.pop('Content-Type', None)
        
        response = requests.post(
            f"{BASE_URL}/api/galleries/{gallery_for_sections['id']}/sections",
            data={'name': 'Wedding Ceremony'},
            headers=headers
        )
        
        assert response.status_code == 200, f"Section creation failed: {response.text}"
        data = response.json()
        
        assert data["name"] == "Wedding Ceremony"
        assert "id" in data
    
    def test_get_sections(self, authenticated_client, gallery_for_sections):
        """Test getting gallery sections"""
        # Create a section first
        headers = dict(authenticated_client.headers)
        headers.pop('Content-Type', None)
        
        requests.post(
            f"{BASE_URL}/api/galleries/{gallery_for_sections['id']}/sections",
            data={'name': 'Reception'},
            headers=headers
        )
        
        # Get sections
        response = authenticated_client.get(f"{BASE_URL}/api/galleries/{gallery_for_sections['id']}/sections")
        
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)


class TestPhotoDelete:
    """Photo deletion tests"""
    
    def test_delete_photo(self, authenticated_client, test_image_factory):
        """Test deleting a photo"""
        # Create gallery
        gallery_response = authenticated_client.post(f"{BASE_URL}/api/galleries", json={
            "title": "TEST_Delete Photo Gallery"
        })
        gallery = gallery_response.json()
        
        # Upload photo
        img = test_image_factory('cyan')
        headers = dict(authenticated_client.headers)
        headers.pop('Content-Type', None)
        
        upload_response = requests.post(
            f"{BASE_URL}/api/galleries/{gallery['id']}/photos",
            files={'file': ('delete_test.jpg', img, 'image/jpeg')},
            headers=headers
        )
        
        photo = upload_response.json()
        
        # Delete photo
        delete_response = authenticated_client.delete(f"{BASE_URL}/api/photos/{photo['id']}")
        
        assert delete_response.status_code == 200
        
        # Verify deletion - photo should not be in gallery
        photos_response = authenticated_client.get(f"{BASE_URL}/api/galleries/{gallery['id']}/photos")
        photos = photos_response.json()
        
        photo_ids = [p["id"] for p in photos]
        assert photo['id'] not in photo_ids


class TestCoverPhoto:
    """Cover photo upload tests"""
    
    def test_upload_cover_photo(self, authenticated_client, test_image_factory):
        """Test uploading gallery cover photo"""
        # Create gallery
        gallery_response = authenticated_client.post(f"{BASE_URL}/api/galleries", json={
            "title": "TEST_Cover Photo Gallery"
        })
        gallery = gallery_response.json()
        
        # Upload cover photo
        img = test_image_factory('magenta')
        headers = dict(authenticated_client.headers)
        headers.pop('Content-Type', None)
        
        response = requests.post(
            f"{BASE_URL}/api/galleries/{gallery['id']}/cover-photo",
            files={'file': ('cover.jpg', img, 'image/jpeg')},
            headers=headers
        )
        
        assert response.status_code == 200, f"Cover upload failed: {response.text}"
        data = response.json()
        
        assert "cover_photo_url" in data
        assert data["cover_photo_url"].startswith("/api/photos/serve/")
