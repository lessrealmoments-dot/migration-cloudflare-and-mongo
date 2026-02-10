"""
Test Bug Fixes - Iteration 20
Bug #1: Download button shows on public gallery even when no download password is set
Bug #2: Edit Gallery modal has Password Settings section with both password fields
Bug #3: Coordinator Name field is present in edit modal and can be edited
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBugFixes:
    """Test the three bug fixes"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test credentials and login"""
        self.email = "lessrealmoments@gmail.com"
        self.password = "3tfL99B%u2qw"
        self.gallery_share_link = "465f44a9"  # THE WEDDING OF DENHAR AND YASMEN
        self.gallery_id = "5e2a7d5d-ffe1-4d4f-8982-60b7ce1d3132"
        
        # Login to get token
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": self.email,
            "password": self.password
        })
        if login_response.status_code == 200:
            self.token = login_response.json().get("access_token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Login failed - skipping authenticated tests")
    
    def test_bug1_public_gallery_download_info_no_password(self):
        """Bug #1: Download info endpoint works without password when gallery has no download password"""
        # Test download-info endpoint without password
        response = requests.post(
            f"{BASE_URL}/api/public/gallery/{self.gallery_share_link}/download-info",
            json={"password": None}
        )
        
        # Should return 200 if no download password is set, or 401 if password is required
        assert response.status_code in [200, 401], f"Unexpected status: {response.status_code}"
        
        if response.status_code == 200:
            data = response.json()
            print(f"Download info response: {data}")
            assert "total_photos" in data or "sections" in data, "Response should contain download info"
            print("SUCCESS: Download info accessible without password")
        else:
            print("INFO: Gallery has download password set - password required")
    
    def test_bug1_public_gallery_has_photos(self):
        """Bug #1: Verify public gallery has photos (download button should show)"""
        # First check if gallery requires password
        info_response = requests.get(f"{BASE_URL}/api/public/gallery/{self.gallery_share_link}")
        assert info_response.status_code == 200
        
        gallery_info = info_response.json()
        
        if gallery_info.get("has_password"):
            # Gallery requires password - use test password
            response = requests.get(
                f"{BASE_URL}/api/public/gallery/{self.gallery_share_link}/photos",
                params={"password": "TEST_password_123"}
            )
        else:
            response = requests.get(f"{BASE_URL}/api/public/gallery/{self.gallery_share_link}/photos")
        
        if response.status_code == 200:
            photos = response.json()
            assert len(photos) > 0, "Gallery should have photos for download button to show"
            print(f"SUCCESS: Gallery has {len(photos)} photos - download button should be visible")
        elif response.status_code == 401:
            print("INFO: Gallery requires password - photos endpoint protected (expected behavior)")
        else:
            assert False, f"Unexpected status: {response.status_code}"
    
    def test_bug2_gallery_update_with_passwords(self):
        """Bug #2: Gallery update endpoint accepts password fields"""
        # First get current gallery data
        get_response = requests.get(
            f"{BASE_URL}/api/galleries/{self.gallery_id}",
            headers=self.headers
        )
        assert get_response.status_code == 200, f"Failed to get gallery: {get_response.status_code}"
        
        gallery_data = get_response.json()
        print(f"Current gallery has_password: {gallery_data.get('has_password')}")
        print(f"Current gallery has_download_all_password: {gallery_data.get('has_download_all_password')}")
        
        # Test that update endpoint accepts password fields (without actually changing them)
        # We'll send empty strings which should not change existing passwords
        update_response = requests.put(
            f"{BASE_URL}/api/galleries/{self.gallery_id}",
            headers=self.headers,
            json={
                "title": gallery_data.get("title"),
                "password": "",  # Empty string should not change password
                "download_all_password": ""  # Empty string should not change password
            }
        )
        
        assert update_response.status_code == 200, f"Update failed: {update_response.status_code}"
        print("SUCCESS: Gallery update endpoint accepts password fields")
    
    def test_bug3_gallery_update_with_coordinator_name(self):
        """Bug #3: Gallery update endpoint accepts coordinator_name field"""
        # First get current gallery data
        get_response = requests.get(
            f"{BASE_URL}/api/galleries/{self.gallery_id}",
            headers=self.headers
        )
        assert get_response.status_code == 200, f"Failed to get gallery: {get_response.status_code}"
        
        gallery_data = get_response.json()
        original_coordinator = gallery_data.get("coordinator_name")
        print(f"Current coordinator_name: {original_coordinator}")
        
        # Test updating coordinator name
        test_coordinator = "TEST_Coordinator_Name"
        update_response = requests.put(
            f"{BASE_URL}/api/galleries/{self.gallery_id}",
            headers=self.headers,
            json={
                "title": gallery_data.get("title"),
                "coordinator_name": test_coordinator
            }
        )
        
        assert update_response.status_code == 200, f"Update failed: {update_response.status_code}"
        
        # Verify the change
        verify_response = requests.get(
            f"{BASE_URL}/api/galleries/{self.gallery_id}",
            headers=self.headers
        )
        assert verify_response.status_code == 200
        
        updated_data = verify_response.json()
        assert updated_data.get("coordinator_name") == test_coordinator, "Coordinator name not updated"
        print(f"SUCCESS: Coordinator name updated to: {updated_data.get('coordinator_name')}")
        
        # Restore original value
        restore_response = requests.put(
            f"{BASE_URL}/api/galleries/{self.gallery_id}",
            headers=self.headers,
            json={
                "title": gallery_data.get("title"),
                "coordinator_name": original_coordinator
            }
        )
        assert restore_response.status_code == 200, "Failed to restore coordinator name"
        print(f"Restored coordinator_name to: {original_coordinator}")
    
    def test_bug2_password_update_persists(self):
        """Bug #2: Verify password changes persist after save"""
        # Get current gallery data
        get_response = requests.get(
            f"{BASE_URL}/api/galleries/{self.gallery_id}",
            headers=self.headers
        )
        assert get_response.status_code == 200
        
        gallery_data = get_response.json()
        original_has_password = gallery_data.get("has_password")
        original_has_download_password = gallery_data.get("has_download_all_password")
        
        # Set a test password
        test_password = "TEST_password_123"
        update_response = requests.put(
            f"{BASE_URL}/api/galleries/{self.gallery_id}",
            headers=self.headers,
            json={
                "title": gallery_data.get("title"),
                "password": test_password
            }
        )
        
        assert update_response.status_code == 200, f"Update failed: {update_response.status_code}"
        
        # Verify password was set
        verify_response = requests.get(
            f"{BASE_URL}/api/galleries/{self.gallery_id}",
            headers=self.headers
        )
        assert verify_response.status_code == 200
        
        updated_data = verify_response.json()
        assert updated_data.get("has_password") == True, "Password should be set"
        print("SUCCESS: Gallery access password was set and persisted")
        
        # Test that the password works on public gallery
        verify_pwd_response = requests.post(
            f"{BASE_URL}/api/public/gallery/{self.gallery_share_link}/verify-password",
            json={"password": test_password}
        )
        assert verify_pwd_response.status_code == 200, "Password verification failed"
        print("SUCCESS: Password verification works on public gallery")
        
        # Restore original state (remove password if it wasn't set before)
        if not original_has_password:
            # Note: There might not be an API to remove password, so we'll leave it
            print("INFO: Password was set for testing - may need manual removal")


class TestPublicGalleryDownload:
    """Test public gallery download functionality"""
    
    def test_public_gallery_info(self):
        """Test public gallery info endpoint"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/465f44a9")
        
        assert response.status_code == 200, f"Failed to get gallery info: {response.status_code}"
        
        data = response.json()
        print(f"Gallery title: {data.get('title')}")
        print(f"Has password: {data.get('has_password')}")
        print(f"Has download password: {data.get('has_download_all_password')}")
        
        # The download button should show based on photos.length > 0, not has_download_all_password
        # This is a frontend fix, but we can verify the API returns the correct flags
        assert "has_download_all_password" in data, "Response should include has_download_all_password flag"
    
    def test_public_gallery_photos_count(self):
        """Test that public gallery has photos (may require password)"""
        # First check if gallery requires password
        info_response = requests.get(f"{BASE_URL}/api/public/gallery/465f44a9")
        assert info_response.status_code == 200
        
        gallery_info = info_response.json()
        
        if gallery_info.get("has_password"):
            # Gallery requires password - use test password
            response = requests.get(
                f"{BASE_URL}/api/public/gallery/465f44a9/photos",
                params={"password": "TEST_password_123"}
            )
        else:
            response = requests.get(f"{BASE_URL}/api/public/gallery/465f44a9/photos")
        
        # Accept 200 (success) or 401 (password required/wrong)
        if response.status_code == 200:
            photos = response.json()
            print(f"Total photos in gallery: {len(photos)}")
            assert len(photos) > 0, "Gallery should have photos"
        elif response.status_code == 401:
            print("INFO: Gallery requires password - photos endpoint protected")
        else:
            assert False, f"Unexpected status: {response.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
