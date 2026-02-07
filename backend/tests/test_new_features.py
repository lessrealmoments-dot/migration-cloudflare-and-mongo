"""
Test suite for new PhotoShare features:
1. Analytics APIs (Photographer & Admin)
2. Storage quota management
3. Gallery auto-delete date tracking
4. View count tracking
5. New themes verification
"""
import pytest
import requests
import os
from datetime import datetime, timedelta
from io import BytesIO
from PIL import Image

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://subimagery.preview.emergentagent.com').rstrip('/')

# Admin credentials from .env
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "Aa@58798546521325"

# Default storage quota (500 MB in bytes)
DEFAULT_STORAGE_QUOTA = 500 * 1024 * 1024

# Gallery expiration days
GALLERY_EXPIRATION_DAYS = 180


class TestPhotographerAnalytics:
    """Test photographer analytics API"""
    
    @pytest.fixture(scope="class")
    def test_user(self, api_client):
        """Create a test user for analytics tests"""
        timestamp = datetime.now().strftime('%H%M%S%f')
        credentials = {
            "email": f"test_analytics_{timestamp}@example.com",
            "password": "TestPass123!",
            "name": "Analytics Test User"
        }
        response = api_client.post(f"{BASE_URL}/api/auth/register", json=credentials)
        if response.status_code == 200:
            data = response.json()
            return {"token": data["access_token"], "user": data["user"]}
        pytest.skip(f"User registration failed: {response.text}")
    
    def test_photographer_analytics_endpoint_exists(self, api_client, test_user):
        """Test GET /api/analytics/photographer returns 200"""
        response = api_client.get(
            f"{BASE_URL}/api/analytics/photographer",
            headers={"Authorization": f"Bearer {test_user['token']}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASS: Photographer analytics endpoint returns 200")
    
    def test_photographer_analytics_response_structure(self, api_client, test_user):
        """Test analytics response has required fields"""
        response = api_client.get(
            f"{BASE_URL}/api/analytics/photographer",
            headers={"Authorization": f"Bearer {test_user['token']}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify required fields
        assert "total_galleries" in data, "Missing total_galleries field"
        assert "total_photos" in data, "Missing total_photos field"
        assert "total_views" in data, "Missing total_views field"
        assert "storage_used" in data, "Missing storage_used field"
        assert "storage_quota" in data, "Missing storage_quota field"
        assert "galleries" in data, "Missing galleries list"
        
        # Verify data types
        assert isinstance(data["total_galleries"], int)
        assert isinstance(data["total_photos"], int)
        assert isinstance(data["total_views"], int)
        assert isinstance(data["storage_used"], int)
        assert isinstance(data["storage_quota"], int)
        assert isinstance(data["galleries"], list)
        
        print(f"PASS: Analytics response structure valid - {data['total_galleries']} galleries, {data['storage_used']}/{data['storage_quota']} storage")
    
    def test_photographer_analytics_storage_quota_default(self, api_client, test_user):
        """Test new user has default storage quota of 500MB"""
        response = api_client.get(
            f"{BASE_URL}/api/analytics/photographer",
            headers={"Authorization": f"Bearer {test_user['token']}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["storage_quota"] == DEFAULT_STORAGE_QUOTA, \
            f"Expected default quota {DEFAULT_STORAGE_QUOTA}, got {data['storage_quota']}"
        print(f"PASS: Default storage quota is {DEFAULT_STORAGE_QUOTA} bytes (500 MB)")


class TestAdminAnalytics:
    """Test admin analytics API"""
    
    @pytest.fixture(scope="class")
    def admin_token(self, api_client):
        """Get admin authentication token"""
        response = api_client.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip(f"Admin login failed: {response.text}")
    
    def test_admin_analytics_endpoint_exists(self, api_client, admin_token):
        """Test GET /api/admin/analytics returns 200"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/analytics",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASS: Admin analytics endpoint returns 200")
    
    def test_admin_analytics_response_structure(self, api_client, admin_token):
        """Test admin analytics response has required fields"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/analytics",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify required fields
        assert "total_photographers" in data, "Missing total_photographers field"
        assert "total_galleries" in data, "Missing total_galleries field"
        assert "total_photos" in data, "Missing total_photos field"
        assert "total_storage_used" in data, "Missing total_storage_used field"
        assert "top_galleries" in data, "Missing top_galleries list"
        
        # Verify data types
        assert isinstance(data["total_photographers"], int)
        assert isinstance(data["total_galleries"], int)
        assert isinstance(data["total_photos"], int)
        assert isinstance(data["total_storage_used"], int)
        assert isinstance(data["top_galleries"], list)
        
        print(f"PASS: Admin analytics - {data['total_photographers']} photographers, {data['total_galleries']} galleries, {data['total_photos']} photos")
    
    def test_admin_analytics_requires_auth(self, api_client):
        """Test admin analytics requires authentication"""
        response = api_client.get(f"{BASE_URL}/api/admin/analytics")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: Admin analytics requires authentication")


class TestStorageQuotaManagement:
    """Test storage quota update by admin"""
    
    @pytest.fixture(scope="class")
    def admin_token(self, api_client):
        """Get admin authentication token"""
        response = api_client.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip(f"Admin login failed: {response.text}")
    
    @pytest.fixture(scope="class")
    def test_user(self, api_client):
        """Create a test user for storage quota tests"""
        timestamp = datetime.now().strftime('%H%M%S%f')
        credentials = {
            "email": f"test_storage_{timestamp}@example.com",
            "password": "TestPass123!",
            "name": "Storage Test User"
        }
        response = api_client.post(f"{BASE_URL}/api/auth/register", json=credentials)
        if response.status_code == 200:
            data = response.json()
            return {"token": data["access_token"], "user": data["user"]}
        pytest.skip(f"User registration failed: {response.text}")
    
    def test_update_storage_quota_endpoint(self, api_client, admin_token, test_user):
        """Test PUT /api/admin/photographers/{user_id}/storage-quota"""
        user_id = test_user["user"]["id"]
        new_quota = 1024 * 1024 * 1024  # 1 GB
        
        response = api_client.put(
            f"{BASE_URL}/api/admin/photographers/{user_id}/storage-quota",
            json={"storage_quota": new_quota},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"PASS: Storage quota update endpoint works - set to 1 GB")
    
    def test_storage_quota_persisted(self, api_client, admin_token, test_user):
        """Test storage quota change is persisted"""
        user_id = test_user["user"]["id"]
        new_quota = 2 * 1024 * 1024 * 1024  # 2 GB
        
        # Update quota
        api_client.put(
            f"{BASE_URL}/api/admin/photographers/{user_id}/storage-quota",
            json={"storage_quota": new_quota},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        # Verify via photographer analytics
        response = api_client.get(
            f"{BASE_URL}/api/analytics/photographer",
            headers={"Authorization": f"Bearer {test_user['token']}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["storage_quota"] == new_quota, f"Expected {new_quota}, got {data['storage_quota']}"
        print(f"PASS: Storage quota persisted correctly - {new_quota} bytes (2 GB)")
    
    def test_storage_quota_requires_admin(self, api_client, test_user):
        """Test storage quota update requires admin auth"""
        user_id = test_user["user"]["id"]
        response = api_client.put(
            f"{BASE_URL}/api/admin/photographers/{user_id}/storage-quota",
            json={"storage_quota": 1024 * 1024 * 1024},
            headers={"Authorization": f"Bearer {test_user['token']}"}  # Using user token, not admin
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: Storage quota update requires admin authentication")


class TestStorageTracking:
    """Test storage tracking on photo upload/delete"""
    
    @pytest.fixture(scope="class")
    def test_user_with_gallery(self, api_client):
        """Create a test user with a gallery"""
        timestamp = datetime.now().strftime('%H%M%S%f')
        credentials = {
            "email": f"test_upload_{timestamp}@example.com",
            "password": "TestPass123!",
            "name": "Upload Test User"
        }
        response = api_client.post(f"{BASE_URL}/api/auth/register", json=credentials)
        if response.status_code != 200:
            pytest.skip(f"User registration failed: {response.text}")
        
        data = response.json()
        token = data["access_token"]
        
        # Create a gallery
        gallery_response = api_client.post(
            f"{BASE_URL}/api/galleries",
            json={"title": f"Storage Test Gallery {timestamp}", "theme": "classic"},
            headers={"Authorization": f"Bearer {token}"}
        )
        if gallery_response.status_code != 200:
            pytest.skip(f"Gallery creation failed: {gallery_response.text}")
        
        return {
            "token": token,
            "user": data["user"],
            "gallery": gallery_response.json()
        }
    
    def test_storage_increases_on_upload(self, api_client, test_user_with_gallery):
        """Test storage_used increases when photo is uploaded"""
        token = test_user_with_gallery["token"]
        gallery_id = test_user_with_gallery["gallery"]["id"]
        
        # Get initial storage
        initial_response = api_client.get(
            f"{BASE_URL}/api/analytics/photographer",
            headers={"Authorization": f"Bearer {token}"}
        )
        initial_storage = initial_response.json()["storage_used"]
        
        # Upload a photo
        img = Image.new('RGB', (100, 100), color='blue')
        img_bytes = BytesIO()
        img.save(img_bytes, format='JPEG')
        img_bytes.seek(0)
        
        upload_response = api_client.post(
            f"{BASE_URL}/api/galleries/{gallery_id}/photos",
            files={"file": ("test_storage.jpg", img_bytes, "image/jpeg")},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert upload_response.status_code == 200, f"Upload failed: {upload_response.text}"
        
        # Check storage increased
        final_response = api_client.get(
            f"{BASE_URL}/api/analytics/photographer",
            headers={"Authorization": f"Bearer {token}"}
        )
        final_storage = final_response.json()["storage_used"]
        
        assert final_storage > initial_storage, f"Storage should increase: {initial_storage} -> {final_storage}"
        print(f"PASS: Storage increased from {initial_storage} to {final_storage} bytes after upload")
    
    def test_storage_decreases_on_delete(self, api_client, test_user_with_gallery):
        """Test storage_used decreases when photo is deleted"""
        token = test_user_with_gallery["token"]
        gallery_id = test_user_with_gallery["gallery"]["id"]
        
        # Upload a photo first
        img = Image.new('RGB', (100, 100), color='green')
        img_bytes = BytesIO()
        img.save(img_bytes, format='JPEG')
        img_bytes.seek(0)
        
        upload_response = api_client.post(
            f"{BASE_URL}/api/galleries/{gallery_id}/photos",
            files={"file": ("test_delete.jpg", img_bytes, "image/jpeg")},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert upload_response.status_code == 200
        photo_id = upload_response.json()["id"]
        
        # Get storage after upload
        after_upload = api_client.get(
            f"{BASE_URL}/api/analytics/photographer",
            headers={"Authorization": f"Bearer {token}"}
        ).json()["storage_used"]
        
        # Delete the photo
        delete_response = api_client.delete(
            f"{BASE_URL}/api/photos/{photo_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        
        # Check storage decreased
        after_delete = api_client.get(
            f"{BASE_URL}/api/analytics/photographer",
            headers={"Authorization": f"Bearer {token}"}
        ).json()["storage_used"]
        
        assert after_delete < after_upload, f"Storage should decrease: {after_upload} -> {after_delete}"
        print(f"PASS: Storage decreased from {after_upload} to {after_delete} bytes after delete")


class TestGalleryAutoDeleteDate:
    """Test gallery auto-delete date tracking"""
    
    @pytest.fixture(scope="class")
    def test_user(self, api_client):
        """Create a test user"""
        timestamp = datetime.now().strftime('%H%M%S%f')
        credentials = {
            "email": f"test_autodelete_{timestamp}@example.com",
            "password": "TestPass123!",
            "name": "AutoDelete Test User"
        }
        response = api_client.post(f"{BASE_URL}/api/auth/register", json=credentials)
        if response.status_code == 200:
            data = response.json()
            return {"token": data["access_token"], "user": data["user"]}
        pytest.skip(f"User registration failed: {response.text}")
    
    def test_new_gallery_has_auto_delete_date(self, api_client, test_user):
        """Test new galleries have auto_delete_date set to 6 months from creation"""
        token = test_user["token"]
        timestamp = datetime.now().strftime('%H%M%S%f')
        
        response = api_client.post(
            f"{BASE_URL}/api/galleries",
            json={"title": f"AutoDelete Test {timestamp}", "theme": "classic"},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Gallery creation failed: {response.text}"
        
        gallery = response.json()
        assert "auto_delete_date" in gallery, "Missing auto_delete_date field"
        assert gallery["auto_delete_date"] is not None, "auto_delete_date should not be None"
        
        # Verify it's approximately 180 days from now
        auto_delete = datetime.fromisoformat(gallery["auto_delete_date"].replace('Z', '+00:00'))
        expected_date = datetime.now().astimezone() + timedelta(days=GALLERY_EXPIRATION_DAYS)
        
        # Allow 1 day tolerance
        diff = abs((auto_delete - expected_date).days)
        assert diff <= 1, f"auto_delete_date should be ~180 days from now, diff is {diff} days"
        
        print(f"PASS: Gallery has auto_delete_date set to {gallery['auto_delete_date']}")
    
    def test_gallery_has_days_until_deletion(self, api_client, test_user):
        """Test galleries show days_until_deletion in API response"""
        token = test_user["token"]
        timestamp = datetime.now().strftime('%H%M%S%f')
        
        # Create gallery
        create_response = api_client.post(
            f"{BASE_URL}/api/galleries",
            json={"title": f"DaysUntil Test {timestamp}", "theme": "classic"},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert create_response.status_code == 200
        gallery_id = create_response.json()["id"]
        
        # Get gallery
        get_response = api_client.get(
            f"{BASE_URL}/api/galleries/{gallery_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert get_response.status_code == 200
        
        gallery = get_response.json()
        assert "days_until_deletion" in gallery, "Missing days_until_deletion field"
        
        # Should be approximately 180 days
        days = gallery["days_until_deletion"]
        assert 178 <= days <= 181, f"days_until_deletion should be ~180, got {days}"
        
        print(f"PASS: Gallery shows {days} days until deletion")


class TestGalleryViewTracking:
    """Test gallery view count tracking"""
    
    @pytest.fixture(scope="class")
    def test_gallery(self, api_client):
        """Create a test user and gallery"""
        timestamp = datetime.now().strftime('%H%M%S%f')
        credentials = {
            "email": f"test_views_{timestamp}@example.com",
            "password": "TestPass123!",
            "name": "Views Test User"
        }
        response = api_client.post(f"{BASE_URL}/api/auth/register", json=credentials)
        if response.status_code != 200:
            pytest.skip(f"User registration failed: {response.text}")
        
        data = response.json()
        token = data["access_token"]
        
        # Create a gallery
        gallery_response = api_client.post(
            f"{BASE_URL}/api/galleries",
            json={"title": f"View Test Gallery {timestamp}", "theme": "classic"},
            headers={"Authorization": f"Bearer {token}"}
        )
        if gallery_response.status_code != 200:
            pytest.skip(f"Gallery creation failed: {gallery_response.text}")
        
        return {
            "token": token,
            "gallery": gallery_response.json()
        }
    
    def test_view_tracking_endpoint_exists(self, api_client, test_gallery):
        """Test POST /api/public/gallery/{share_link}/view endpoint"""
        share_link = test_gallery["gallery"]["share_link"]
        
        response = api_client.post(f"{BASE_URL}/api/public/gallery/{share_link}/view")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Response should indicate success"
        print("PASS: View tracking endpoint returns 200")
    
    def test_view_count_increments(self, api_client, test_gallery):
        """Test view count increments when endpoint is called"""
        share_link = test_gallery["gallery"]["share_link"]
        token = test_gallery["token"]
        
        # Get initial analytics
        initial_response = api_client.get(
            f"{BASE_URL}/api/analytics/photographer",
            headers={"Authorization": f"Bearer {token}"}
        )
        initial_views = initial_response.json()["total_views"]
        
        # Track 3 views
        for _ in range(3):
            api_client.post(f"{BASE_URL}/api/public/gallery/{share_link}/view")
        
        # Get updated analytics
        final_response = api_client.get(
            f"{BASE_URL}/api/analytics/photographer",
            headers={"Authorization": f"Bearer {token}"}
        )
        final_views = final_response.json()["total_views"]
        
        assert final_views >= initial_views + 3, f"Views should increase by at least 3: {initial_views} -> {final_views}"
        print(f"PASS: View count incremented from {initial_views} to {final_views}")
    
    def test_view_tracking_invalid_share_link(self, api_client):
        """Test view tracking returns 404 for invalid share link"""
        response = api_client.post(f"{BASE_URL}/api/public/gallery/invalid_link_xyz/view")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASS: View tracking returns 404 for invalid share link")


class TestNewThemes:
    """Test new gallery themes are available"""
    
    @pytest.fixture(scope="class")
    def test_user(self, api_client):
        """Create a test user"""
        timestamp = datetime.now().strftime('%H%M%S%f')
        credentials = {
            "email": f"test_themes_{timestamp}@example.com",
            "password": "TestPass123!",
            "name": "Themes Test User"
        }
        response = api_client.post(f"{BASE_URL}/api/auth/register", json=credentials)
        if response.status_code == 200:
            data = response.json()
            return {"token": data["access_token"], "user": data["user"]}
        pytest.skip(f"User registration failed: {response.text}")
    
    @pytest.mark.parametrize("theme", [
        "party", "tropical", "sunset", "neon", "garden", 
        "lavender", "corporate", "christmas", "minimalist"
    ])
    def test_new_theme_can_be_used(self, api_client, test_user, theme):
        """Test new themes can be used when creating galleries"""
        token = test_user["token"]
        timestamp = datetime.now().strftime('%H%M%S%f')
        
        response = api_client.post(
            f"{BASE_URL}/api/galleries",
            json={"title": f"Theme Test {theme} {timestamp}", "theme": theme},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Failed to create gallery with theme '{theme}': {response.text}"
        
        gallery = response.json()
        assert gallery["theme"] == theme, f"Expected theme '{theme}', got '{gallery['theme']}'"
        print(f"PASS: Theme '{theme}' can be used for galleries")


class TestStorageQuotaEnforcement:
    """Test storage quota enforcement on uploads"""
    
    @pytest.fixture(scope="class")
    def limited_user(self, api_client):
        """Create a user with very small storage quota"""
        timestamp = datetime.now().strftime('%H%M%S%f')
        credentials = {
            "email": f"test_limited_{timestamp}@example.com",
            "password": "TestPass123!",
            "name": "Limited Storage User"
        }
        response = api_client.post(f"{BASE_URL}/api/auth/register", json=credentials)
        if response.status_code != 200:
            pytest.skip(f"User registration failed: {response.text}")
        
        data = response.json()
        token = data["access_token"]
        user_id = data["user"]["id"]
        
        # Admin sets very small quota (1 KB)
        admin_response = api_client.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        admin_token = admin_response.json()["access_token"]
        
        api_client.put(
            f"{BASE_URL}/api/admin/photographers/{user_id}/storage-quota",
            json={"storage_quota": 1024},  # 1 KB
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        # Create a gallery
        gallery_response = api_client.post(
            f"{BASE_URL}/api/galleries",
            json={"title": f"Limited Gallery {timestamp}", "theme": "classic"},
            headers={"Authorization": f"Bearer {token}"}
        )
        
        return {
            "token": token,
            "user_id": user_id,
            "gallery_id": gallery_response.json()["id"] if gallery_response.status_code == 200 else None
        }
    
    def test_upload_rejected_when_quota_exceeded(self, api_client, limited_user):
        """Test photo upload is rejected when storage quota is exceeded"""
        if not limited_user.get("gallery_id"):
            pytest.skip("Gallery creation failed")
        
        token = limited_user["token"]
        gallery_id = limited_user["gallery_id"]
        
        # Try to upload a large image (should exceed 1 KB quota)
        img = Image.new('RGB', (500, 500), color='red')
        img_bytes = BytesIO()
        img.save(img_bytes, format='JPEG')
        img_bytes.seek(0)
        
        response = api_client.post(
            f"{BASE_URL}/api/galleries/{gallery_id}/photos",
            files={"file": ("large_image.jpg", img_bytes, "image/jpeg")},
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 403, f"Expected 403 (quota exceeded), got {response.status_code}"
        assert "quota" in response.text.lower() or "storage" in response.text.lower(), \
            f"Error message should mention quota/storage: {response.text}"
        print("PASS: Upload rejected when storage quota exceeded")


@pytest.fixture(scope="session")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session
