"""
Tests for High Concurrency Optimization and Cover Photo Editor Features
=========================================================================
Tests:
1. Cover Photo Position API (PUT/GET)
2. High concurrency upload endpoints
3. Public gallery cover photo position in response
"""

import pytest
import requests
import os
import uuid
from datetime import datetime
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCoverPhotoPositionAPI:
    """Tests for cover photo position save/retrieve endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Create test user and get auth token"""
        unique_id = str(uuid.uuid4())[:8]
        email = f"test_cover_{unique_id}@test.com"
        password = "TestPass123!"
        
        # Register new user
        register_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": email,
            "password": password,
            "name": f"Test User {unique_id}",
            "business_name": "Test Business"
        })
        
        if register_response.status_code == 200:
            return register_response.json()["access_token"]
        
        # If registration fails (email exists), try login
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        
        if login_response.status_code == 200:
            return login_response.json()["access_token"]
        
        pytest.skip("Could not authenticate test user")
    
    @pytest.fixture(scope="class")
    def test_gallery(self, auth_token):
        """Create test gallery for cover photo tests"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        unique_id = str(uuid.uuid4())[:8]
        
        response = requests.post(f"{BASE_URL}/api/galleries", 
            headers=headers,
            json={
                "title": f"Cover Photo Test Gallery {unique_id}",
                "description": "Gallery for testing cover photo position",
                "theme": "classic"
            }
        )
        
        if response.status_code != 200:
            pytest.skip(f"Could not create test gallery: {response.json()}")
        
        return response.json()
    
    def test_get_default_cover_position(self, auth_token, test_gallery):
        """Test GET cover photo position returns defaults when no cover photo"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        response = requests.get(
            f"{BASE_URL}/api/galleries/{test_gallery['id']}/cover-photo-position",
            headers=headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify default values
        assert "scale" in data, "Response should have scale field"
        assert "positionX" in data, "Response should have positionX field"
        assert "positionY" in data, "Response should have positionY field"
        print(f"Default cover position: {data}")
    
    def test_put_cover_position_without_cover_photo_fails(self, auth_token, test_gallery):
        """Test that saving position without cover photo returns error"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        response = requests.put(
            f"{BASE_URL}/api/galleries/{test_gallery['id']}/cover-photo-position",
            headers=headers,
            json={
                "scale": 1.5,
                "positionX": 60,
                "positionY": 40
            }
        )
        
        # Should fail because no cover photo exists
        assert response.status_code == 400, f"Expected 400 (no cover photo), got {response.status_code}"
        print(f"Correctly rejected position update without cover photo: {response.json()}")


class TestCoverPhotoWithImage:
    """Tests requiring an actual cover photo upload"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Create test user and get auth token"""
        unique_id = str(uuid.uuid4())[:8]
        email = f"test_img_{unique_id}@test.com"
        password = "TestPass123!"
        
        register_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": email,
            "password": password,
            "name": f"Test User {unique_id}",
            "business_name": "Test Business"
        })
        
        if register_response.status_code == 200:
            return register_response.json()["access_token"]
        
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        
        if login_response.status_code == 200:
            return login_response.json()["access_token"]
        
        pytest.skip("Could not authenticate test user")
    
    @pytest.fixture(scope="class")
    def gallery_with_cover(self, auth_token):
        """Create gallery and upload cover photo"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        unique_id = str(uuid.uuid4())[:8]
        
        # Create gallery
        gallery_response = requests.post(f"{BASE_URL}/api/galleries", 
            headers=headers,
            json={
                "title": f"Gallery With Cover {unique_id}",
                "description": "Testing cover photo features",
                "theme": "classic"
            }
        )
        
        if gallery_response.status_code != 200:
            pytest.skip(f"Could not create gallery: {gallery_response.json()}")
        
        gallery = gallery_response.json()
        
        # Create a test image (simple 1x1 red PNG)
        import io
        # Minimal valid PNG (1x1 red pixel)
        png_bytes = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # PNG signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  # IHDR chunk
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,  # IDAT chunk
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
            0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xFE,
            0xD4, 0xEF, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,  # IEND chunk
            0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
        ])
        
        # Upload cover photo
        files = {
            'file': ('test_cover.png', io.BytesIO(png_bytes), 'image/png')
        }
        
        cover_response = requests.post(
            f"{BASE_URL}/api/galleries/{gallery['id']}/cover-photo",
            headers=headers,
            files=files
        )
        
        if cover_response.status_code != 200:
            print(f"Cover upload failed: {cover_response.status_code} - {cover_response.text}")
            pytest.skip(f"Could not upload cover photo")
        
        gallery['cover_photo_url'] = cover_response.json().get('cover_photo_url')
        return gallery
    
    def test_save_cover_position(self, auth_token, gallery_with_cover):
        """Test saving cover photo position (zoom and pan)"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        position_data = {
            "scale": 1.5,
            "positionX": 60,
            "positionY": 40
        }
        
        response = requests.put(
            f"{BASE_URL}/api/galleries/{gallery_with_cover['id']}/cover-photo-position",
            headers=headers,
            json=position_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "message" in data or "position" in data, "Should have confirmation message or position"
        print(f"Cover position saved: {data}")
    
    def test_get_saved_cover_position(self, auth_token, gallery_with_cover):
        """Test retrieving saved cover photo position"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        response = requests.get(
            f"{BASE_URL}/api/galleries/{gallery_with_cover['id']}/cover-photo-position",
            headers=headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify saved values are returned
        assert data.get("scale") == 1.5, f"Scale should be 1.5, got {data.get('scale')}"
        assert data.get("positionX") == 60, f"positionX should be 60, got {data.get('positionX')}"
        assert data.get("positionY") == 40, f"positionY should be 40, got {data.get('positionY')}"
        print(f"Retrieved saved position: {data}")
    
    def test_public_gallery_has_cover_position(self, auth_token, gallery_with_cover):
        """Test that public gallery endpoint includes cover photo position"""
        share_link = gallery_with_cover.get('share_link')
        
        response = requests.get(f"{BASE_URL}/api/public/gallery/{share_link}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify cover_photo_position is in public response
        assert "cover_photo_position" in data, "Public gallery should include cover_photo_position"
        position = data["cover_photo_position"]
        
        assert position.get("scale") == 1.5, f"Public should have saved scale"
        assert position.get("positionX") == 60, f"Public should have saved positionX"
        assert position.get("positionY") == 40, f"Public should have saved positionY"
        print(f"Public gallery cover position: {position}")


class TestHighConcurrencyOptimizations:
    """Tests verifying high concurrency optimizations are in place"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Create test user and get auth token"""
        unique_id = str(uuid.uuid4())[:8]
        email = f"test_concurrency_{unique_id}@test.com"
        password = "TestPass123!"
        
        register_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": email,
            "password": password,
            "name": f"Concurrency Test {unique_id}",
            "business_name": "Test Business"
        })
        
        if register_response.status_code == 200:
            return register_response.json()["access_token"]
        
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        
        if login_response.status_code == 200:
            return login_response.json()["access_token"]
        
        pytest.skip("Could not authenticate test user")
    
    @pytest.fixture(scope="class")
    def test_gallery_for_upload(self, auth_token):
        """Create gallery for upload tests"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        unique_id = str(uuid.uuid4())[:8]
        
        response = requests.post(f"{BASE_URL}/api/galleries", 
            headers=headers,
            json={
                "title": f"Upload Test {unique_id}",
                "theme": "classic"
            }
        )
        
        if response.status_code != 200:
            pytest.skip(f"Could not create gallery: {response.json()}")
        
        return response.json()
    
    def test_photographer_upload_endpoint(self, auth_token, test_gallery_for_upload):
        """Test POST /api/galleries/{id}/photos works correctly"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        import io
        
        # Create test image
        png_bytes = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
            0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xFE,
            0xD4, 0xEF, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
            0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
        ])
        
        files = {
            'file': ('test_photo.png', io.BytesIO(png_bytes), 'image/png')
        }
        
        start_time = time.time()
        response = requests.post(
            f"{BASE_URL}/api/galleries/{test_gallery_for_upload['id']}/photos",
            headers=headers,
            files=files
        )
        elapsed = time.time() - start_time
        
        assert response.status_code == 200, f"Photo upload failed: {response.status_code}: {response.text}"
        data = response.json()
        
        assert "id" in data, "Photo response should have id"
        assert "url" in data, "Photo response should have url"
        print(f"Photo uploaded successfully in {elapsed:.2f}s: {data.get('id')}")
    
    def test_guest_upload_endpoint(self, auth_token, test_gallery_for_upload):
        """Test POST /api/public/gallery/{share_link}/upload works"""
        share_link = test_gallery_for_upload.get('share_link')
        import io
        
        # Create test image
        png_bytes = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
            0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xFE,
            0xD4, 0xEF, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
            0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
        ])
        
        files = {
            'file': ('guest_photo.png', io.BytesIO(png_bytes), 'image/png')
        }
        data = {
            'guest_name': 'Test Guest'
        }
        
        start_time = time.time()
        response = requests.post(
            f"{BASE_URL}/api/public/gallery/{share_link}/upload",
            files=files,
            data=data
        )
        elapsed = time.time() - start_time
        
        assert response.status_code == 200, f"Guest upload failed: {response.status_code}: {response.text}"
        result = response.json()
        
        assert "id" in result, "Guest upload response should have id"
        print(f"Guest photo uploaded successfully in {elapsed:.2f}s: {result.get('id')}")
    
    def test_multiple_concurrent_requests(self, auth_token, test_gallery_for_upload):
        """Test API handles multiple concurrent requests"""
        import concurrent.futures
        headers = {"Authorization": f"Bearer {auth_token}"}
        gallery_id = test_gallery_for_upload['id']
        
        def get_gallery():
            return requests.get(
                f"{BASE_URL}/api/galleries/{gallery_id}",
                headers=headers
            )
        
        # Make 5 concurrent requests
        start_time = time.time()
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(get_gallery) for _ in range(5)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]
        elapsed = time.time() - start_time
        
        success_count = sum(1 for r in results if r.status_code == 200)
        assert success_count == 5, f"Expected 5 successful requests, got {success_count}"
        print(f"5 concurrent requests completed in {elapsed:.2f}s")


class TestExistingGalleryWithCover:
    """Test with an existing gallery that has a cover photo"""
    
    def test_existing_gallery_cover_position_endpoint(self):
        """Test cover position endpoints on an existing gallery"""
        # Use existing credentials to login
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "testphoto@test.com",
            "password": "Test123!"
        })
        
        if login_response.status_code != 200:
            pytest.skip("Test user not found - run full test suite first")
        
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get user's galleries
        galleries_response = requests.get(f"{BASE_URL}/api/galleries", headers=headers)
        if galleries_response.status_code != 200:
            pytest.skip("Could not get galleries")
        
        galleries = galleries_response.json()
        
        # Find a gallery with cover photo
        gallery_with_cover = None
        for g in galleries:
            if g.get('cover_photo_url'):
                gallery_with_cover = g
                break
        
        if not gallery_with_cover:
            pytest.skip("No gallery with cover photo found")
        
        # Test get position
        position_response = requests.get(
            f"{BASE_URL}/api/galleries/{gallery_with_cover['id']}/cover-photo-position",
            headers=headers
        )
        
        assert position_response.status_code == 200
        print(f"Existing gallery cover position: {position_response.json()}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
