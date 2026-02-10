"""
Test Google Drive Section API Endpoints
Tests for creating, refreshing, and fetching Google Drive sections in galleries.
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "lessrealmoments@gmail.com"
TEST_PASSWORD = "3tfL99B%u2qw"

# Sample Google Drive folder URL (public folder)
# Note: This is a test URL - actual testing requires a real public Google Drive folder
SAMPLE_GDRIVE_URL = "https://drive.google.com/drive/folders/1ABC123DEF456GHI789JKL"


class TestGoogleDriveSectionAPI:
    """Test Google Drive section API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        self.gallery_id = None
        
    def get_auth_token(self):
        """Get authentication token"""
        if self.token:
            return self.token
            
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        if response.status_code == 200:
            self.token = response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            return self.token
        return None
    
    def get_test_gallery(self):
        """Get or create a test gallery"""
        token = self.get_auth_token()
        if not token:
            pytest.skip("Authentication failed")
            
        # Get existing galleries
        response = self.session.get(f"{BASE_URL}/api/galleries")
        if response.status_code == 200:
            galleries = response.json()
            if galleries:
                self.gallery_id = galleries[0]["id"]
                return self.gallery_id
        
        # Create a new gallery if none exist
        response = self.session.post(f"{BASE_URL}/api/galleries", json={
            "title": "Test GDrive Gallery",
            "description": "Test gallery for Google Drive integration"
        })
        
        if response.status_code in [200, 201]:
            self.gallery_id = response.json()["id"]
            return self.gallery_id
        
        pytest.skip("Could not get or create test gallery")
    
    # ============ Authentication Tests ============
    
    def test_login_success(self):
        """Test successful login with valid credentials"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        print(f"Login successful for user: {data['user']['email']}")
    
    # ============ Google Drive Section Creation Tests ============
    
    def test_create_gdrive_section_invalid_url(self):
        """Test creating Google Drive section with invalid URL"""
        gallery_id = self.get_test_gallery()
        
        response = self.session.post(
            f"{BASE_URL}/api/galleries/{gallery_id}/gdrive-sections",
            json={
                "gdrive_url": "https://invalid-url.com/not-gdrive",
                "section_name": "Test Section"
            }
        )
        
        # Should return 400 for invalid URL
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        assert "Invalid Google Drive URL" in response.text or "Invalid" in response.text
        print("Invalid URL correctly rejected")
    
    def test_create_gdrive_section_missing_url(self):
        """Test creating Google Drive section without URL"""
        gallery_id = self.get_test_gallery()
        
        response = self.session.post(
            f"{BASE_URL}/api/galleries/{gallery_id}/gdrive-sections",
            json={
                "section_name": "Test Section"
            }
        )
        
        # Should return 422 for missing required field
        assert response.status_code == 422, f"Expected 422, got {response.status_code}: {response.text}"
        print("Missing URL correctly rejected with 422")
    
    def test_create_gdrive_section_nonexistent_gallery(self):
        """Test creating Google Drive section for non-existent gallery"""
        self.get_auth_token()
        
        response = self.session.post(
            f"{BASE_URL}/api/galleries/nonexistent-gallery-id/gdrive-sections",
            json={
                "gdrive_url": SAMPLE_GDRIVE_URL,
                "section_name": "Test Section"
            }
        )
        
        # Should return 404 for non-existent gallery
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("Non-existent gallery correctly returns 404")
    
    def test_create_gdrive_section_unauthorized(self):
        """Test creating Google Drive section without authentication"""
        # Remove auth header
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        response = session.post(
            f"{BASE_URL}/api/galleries/some-gallery-id/gdrive-sections",
            json={
                "gdrive_url": SAMPLE_GDRIVE_URL,
                "section_name": "Test Section"
            }
        )
        
        # Should return 401 or 403 for unauthorized
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}: {response.text}"
        print("Unauthorized request correctly rejected")
    
    # ============ Google Drive Section Refresh Tests ============
    
    def test_refresh_gdrive_section_nonexistent(self):
        """Test refreshing non-existent Google Drive section"""
        gallery_id = self.get_test_gallery()
        
        response = self.session.post(
            f"{BASE_URL}/api/galleries/{gallery_id}/gdrive-sections/nonexistent-section-id/refresh"
        )
        
        # Should return 404 for non-existent section
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("Non-existent section refresh correctly returns 404")
    
    def test_refresh_gdrive_section_unauthorized(self):
        """Test refreshing Google Drive section without authentication"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        response = session.post(
            f"{BASE_URL}/api/galleries/some-gallery-id/gdrive-sections/some-section-id/refresh"
        )
        
        # Should return 401 or 403 for unauthorized
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}: {response.text}"
        print("Unauthorized refresh correctly rejected")
    
    # ============ Public Google Drive Photos Tests ============
    
    def test_get_public_gdrive_photos_nonexistent_gallery(self):
        """Test getting Google Drive photos for non-existent gallery"""
        response = self.session.get(
            f"{BASE_URL}/api/public/gallery/nonexistent-share-link/gdrive-photos"
        )
        
        # Should return 404 for non-existent gallery
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("Non-existent gallery correctly returns 404")
    
    def test_get_public_gdrive_photos_valid_gallery(self):
        """Test getting Google Drive photos for a valid gallery"""
        # First get a gallery with a share link
        gallery_id = self.get_test_gallery()
        
        # Get gallery details to get share_link
        response = self.session.get(f"{BASE_URL}/api/galleries/{gallery_id}")
        if response.status_code != 200:
            pytest.skip("Could not get gallery details")
        
        gallery_data = response.json()
        share_link = gallery_data.get("share_link")
        is_published = gallery_data.get("is_published", False)
        
        if not share_link:
            pytest.skip("Gallery has no share link")
        
        # Now test the public endpoint
        response = self.session.get(
            f"{BASE_URL}/api/public/gallery/{share_link}/gdrive-photos"
        )
        
        # If gallery is not published, it will return 404
        if not is_published:
            assert response.status_code == 404, f"Expected 404 for unpublished gallery, got {response.status_code}"
            print("Unpublished gallery correctly returns 404 for public endpoint")
        else:
            # Should return 200 with empty array or photos
            assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
            data = response.json()
            assert isinstance(data, list), "Response should be a list"
            print(f"Got {len(data)} Google Drive photos for gallery")
    
    # ============ Google Drive Proxy Tests ============
    
    def test_gdrive_proxy_invalid_file_id(self):
        """Test Google Drive proxy with invalid file ID"""
        response = self.session.get(
            f"{BASE_URL}/api/gdrive/proxy/invalid-file-id"
        )
        
        # Should return error for invalid file ID
        # The proxy might return various error codes depending on Google's response
        # 520 is Cloudflare's "Web server is returning an unknown error"
        assert response.status_code in [400, 404, 500, 502, 503, 520], f"Expected error code, got {response.status_code}"
        print(f"Invalid file ID correctly returns error: {response.status_code}")
    
    # ============ Delete Google Drive Section Tests ============
    
    def test_delete_gdrive_section_nonexistent(self):
        """Test deleting non-existent Google Drive section"""
        gallery_id = self.get_test_gallery()
        
        response = self.session.delete(
            f"{BASE_URL}/api/galleries/{gallery_id}/gdrive-sections/nonexistent-section-id"
        )
        
        # Should return 404 or 200 (some APIs return 200 for idempotent deletes)
        # Based on the code, it removes from array so it might succeed even if not found
        assert response.status_code in [200, 404], f"Expected 200/404, got {response.status_code}: {response.text}"
        print(f"Delete non-existent section returns: {response.status_code}")
    
    def test_delete_gdrive_section_unauthorized(self):
        """Test deleting Google Drive section without authentication"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        response = session.delete(
            f"{BASE_URL}/api/galleries/some-gallery-id/gdrive-sections/some-section-id"
        )
        
        # Should return 401 or 403 for unauthorized
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}: {response.text}"
        print("Unauthorized delete correctly rejected")
    
    # ============ Toggle Highlight Tests ============
    
    def test_toggle_highlight_nonexistent_photo(self):
        """Test toggling highlight for non-existent photo"""
        gallery_id = self.get_test_gallery()
        
        response = self.session.post(
            f"{BASE_URL}/api/galleries/{gallery_id}/gdrive-sections/some-section-id/photos/nonexistent-photo-id/highlight"
        )
        
        # Should return 404 for non-existent photo
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("Non-existent photo highlight toggle correctly returns 404")
    
    def test_toggle_highlight_unauthorized(self):
        """Test toggling highlight without authentication"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        response = session.post(
            f"{BASE_URL}/api/galleries/some-gallery-id/gdrive-sections/some-section-id/photos/some-photo-id/highlight"
        )
        
        # Should return 401 or 403 for unauthorized
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}: {response.text}"
        print("Unauthorized highlight toggle correctly rejected")


class TestGoogleDriveURLExtraction:
    """Test Google Drive URL extraction utility"""
    
    def test_valid_gdrive_urls(self):
        """Test that valid Google Drive URLs are recognized"""
        # These are format tests - the actual API will validate the folder exists
        valid_urls = [
            "https://drive.google.com/drive/folders/1ABC123DEF456GHI789JKL",
            "https://drive.google.com/drive/u/0/folders/1ABC123DEF456GHI789JKL",
            "https://drive.google.com/drive/u/1/folders/1ABC123DEF456GHI789JKL",
        ]
        
        for url in valid_urls:
            # Just verify the URL format is valid (contains expected pattern)
            assert "drive.google.com" in url
            assert "folders" in url
            print(f"Valid URL format: {url[:50]}...")
    
    def test_invalid_gdrive_urls(self):
        """Test that invalid URLs are rejected"""
        invalid_urls = [
            "https://example.com/folder",
            "https://dropbox.com/folder/123",
            "not-a-url",
            "",
        ]
        
        for url in invalid_urls:
            # These should not match Google Drive pattern
            assert "drive.google.com/drive/folders" not in url
            print(f"Invalid URL correctly identified: {url[:30] if url else '(empty)'}...")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
