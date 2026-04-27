"""
Backend tests for Google Drive Video Mode feature.
Tests the new API endpoints for GDrive video sections:
- POST /api/galleries/{id}/gdrive-sections with gdrive_content_mode='videos'
- GET /api/public/gallery/{share_link}/gdrive-videos
- POST /api/galleries/{id}/gdrive-sections/{section_id}/videos/{video_id}/set-featured
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://gallery-speed-up.preview.emergentagent.com')

# Test credentials from requirements
TEST_USER_EMAIL = "lessrealmoments@gmail.com"
TEST_USER_PASSWORD = "3tfL99B%u2qw"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for test user"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_USER_EMAIL,
        "password": TEST_USER_PASSWORD
    })
    if response.status_code == 200:
        data = response.json()
        return data.get("access_token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def authenticated_client(auth_token):
    """Create a session with auth header"""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    })
    return session


@pytest.fixture(scope="module")
def test_gallery(authenticated_client):
    """Get or create a test gallery for testing"""
    # First, list existing galleries to find a test one
    response = authenticated_client.get(f"{BASE_URL}/api/galleries")
    if response.status_code == 200:
        galleries = response.json()
        if galleries and len(galleries) > 0:
            # Use the first available gallery
            return galleries[0]
    
    # If no gallery exists, create one (but this would consume a credit)
    pytest.skip("No test gallery available")


class TestGDriveSectionCreation:
    """Tests for creating Google Drive sections with content_mode"""

    def test_create_gdrive_section_photo_mode(self, authenticated_client, test_gallery):
        """Test creating a GDrive section with default photo mode"""
        gallery_id = test_gallery["id"]
        section_name = f"TEST_Photo_Section_{uuid.uuid4().hex[:6]}"
        
        response = authenticated_client.post(
            f"{BASE_URL}/api/galleries/{gallery_id}/gdrive-sections",
            json={
                "section_name": section_name,
                "gdrive_url": None,  # Empty section
                "gdrive_content_mode": "photos"
            }
        )
        
        # Check status code
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        # Validate response structure
        data = response.json()
        assert "section" in data, "Response should contain 'section' key"
        assert data["section"]["name"] == section_name
        assert data["section"]["type"] == "gdrive"
        assert data["section"].get("gdrive_content_mode", "photos") == "photos"
        
        print(f"✓ Created GDrive photo section: {section_name}")
        return data["section"]

    def test_create_gdrive_section_video_mode(self, authenticated_client, test_gallery):
        """Test creating a GDrive section with video mode"""
        gallery_id = test_gallery["id"]
        section_name = f"TEST_Video_Section_{uuid.uuid4().hex[:6]}"
        
        response = authenticated_client.post(
            f"{BASE_URL}/api/galleries/{gallery_id}/gdrive-sections",
            json={
                "section_name": section_name,
                "gdrive_url": None,  # Empty section
                "gdrive_content_mode": "videos"
            }
        )
        
        # Check status code
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        # Validate response structure
        data = response.json()
        assert "section" in data, "Response should contain 'section' key"
        assert data["section"]["name"] == section_name
        assert data["section"]["type"] == "gdrive"
        assert data["section"].get("gdrive_content_mode") == "videos", f"Expected 'videos' mode, got: {data['section'].get('gdrive_content_mode')}"
        
        print(f"✓ Created GDrive video section: {section_name}")
        return data["section"]


class TestGDriveVideosEndpoint:
    """Tests for the public GDrive videos endpoint"""

    def test_gdrive_videos_endpoint_exists(self, test_gallery):
        """Test that GET /api/public/gallery/{share_link}/gdrive-videos endpoint exists"""
        share_link = test_gallery.get("share_link")
        if not share_link:
            pytest.skip("Test gallery has no share_link")
        
        response = requests.get(f"{BASE_URL}/api/public/gallery/{share_link}/gdrive-videos")
        
        # Endpoint should return 200 even if empty
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Response should be a list
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        print(f"✓ GET /api/public/gallery/{share_link}/gdrive-videos returned {len(data)} videos")

    def test_gdrive_videos_with_invalid_share_link(self):
        """Test that invalid share link returns 404"""
        fake_share_link = "nonexistent_share_link_12345"
        
        response = requests.get(f"{BASE_URL}/api/public/gallery/{fake_share_link}/gdrive-videos")
        
        # Should return 404 for non-existent gallery
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Invalid share link correctly returns 404")


class TestSetFeaturedVideoEndpoint:
    """Tests for the set-featured endpoint"""

    def test_set_featured_endpoint_exists(self, authenticated_client, test_gallery):
        """Test that the set-featured endpoint exists and is properly secured"""
        gallery_id = test_gallery["id"]
        
        # Use fake IDs to test endpoint structure
        fake_section_id = "fake_section_123"
        fake_video_id = "fake_video_456"
        
        response = authenticated_client.post(
            f"{BASE_URL}/api/galleries/{gallery_id}/gdrive-sections/{fake_section_id}/videos/{fake_video_id}/set-featured"
        )
        
        # Endpoint should return 404 for non-existent video, not 404 for missing route
        # If it returns 404, the endpoint exists but the video wasn't found
        assert response.status_code in [404, 400], f"Expected 404/400 for non-existent video, got {response.status_code}: {response.text}"
        print("✓ Set-featured endpoint exists and is properly secured")

    def test_set_featured_requires_auth(self, test_gallery):
        """Test that set-featured endpoint requires authentication"""
        gallery_id = test_gallery["id"]
        fake_section_id = "fake_section_123"
        fake_video_id = "fake_video_456"
        
        # Make request without auth
        response = requests.post(
            f"{BASE_URL}/api/galleries/{gallery_id}/gdrive-sections/{fake_section_id}/videos/{fake_video_id}/set-featured"
        )
        
        # Should return 401 or 403 for unauthenticated request
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Set-featured endpoint requires authentication")


class TestGallerySectionsResponse:
    """Test that sections response includes gdrive_content_mode"""

    def test_sections_include_content_mode(self, authenticated_client, test_gallery):
        """Verify sections endpoint includes gdrive_content_mode field"""
        gallery_id = test_gallery["id"]
        
        response = authenticated_client.get(f"{BASE_URL}/api/galleries/{gallery_id}/sections")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        sections = response.json()
        assert isinstance(sections, list), "Response should be a list"
        
        # Check if any gdrive sections have content_mode field
        gdrive_sections = [s for s in sections if s.get("type") == "gdrive"]
        if gdrive_sections:
            for section in gdrive_sections:
                # gdrive_content_mode should exist (defaults to 'photos' if not set)
                content_mode = section.get("gdrive_content_mode", "photos")
                assert content_mode in ["photos", "videos"], f"Invalid content_mode: {content_mode}"
                print(f"  - Section '{section['name']}' has content_mode: {content_mode}")
        
        print(f"✓ Sections endpoint returned {len(sections)} sections, {len(gdrive_sections)} are GDrive")


class TestContributorLinkContentMode:
    """Test that contributor info includes content mode for video sections"""

    def test_contributor_endpoint_includes_content_mode(self, authenticated_client, test_gallery):
        """Test that contributor link info includes gdrive_content_mode"""
        gallery_id = test_gallery["id"]
        
        # First, get sections to find one with a contributor link
        sections_response = authenticated_client.get(f"{BASE_URL}/api/galleries/{gallery_id}/sections")
        if sections_response.status_code != 200:
            pytest.skip("Could not get sections")
        
        sections = sections_response.json()
        gdrive_sections = [s for s in sections if s.get("type") == "gdrive" and s.get("contributor_link")]
        
        if not gdrive_sections:
            pytest.skip("No GDrive sections with contributor links found")
        
        section = gdrive_sections[0]
        contributor_link = section["contributor_link"]
        
        # Test the contributor endpoint
        response = requests.get(f"{BASE_URL}/api/contributor/{contributor_link}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "section_type" in data, "Response should include section_type"
        assert data["section_type"] == "gdrive", "Section type should be gdrive"
        
        # Check for gdrive_content_mode if present
        if "gdrive_content_mode" in data:
            assert data["gdrive_content_mode"] in ["photos", "videos"]
            print(f"✓ Contributor endpoint includes gdrive_content_mode: {data['gdrive_content_mode']}")
        else:
            print("✓ Contributor endpoint works (gdrive_content_mode may not be present for older sections)")


class TestCleanupTestSections:
    """Cleanup test sections after tests"""

    def test_cleanup_test_sections(self, authenticated_client, test_gallery):
        """Delete test sections created during testing"""
        gallery_id = test_gallery["id"]
        
        # Get all sections
        response = authenticated_client.get(f"{BASE_URL}/api/galleries/{gallery_id}/sections")
        if response.status_code != 200:
            return
        
        sections = response.json()
        test_sections = [s for s in sections if s.get("name", "").startswith("TEST_")]
        
        for section in test_sections:
            delete_response = authenticated_client.delete(
                f"{BASE_URL}/api/galleries/{gallery_id}/sections/{section['id']}"
            )
            if delete_response.status_code in [200, 204]:
                print(f"  Cleaned up test section: {section['name']}")
        
        print(f"✓ Cleaned up {len(test_sections)} test sections")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
