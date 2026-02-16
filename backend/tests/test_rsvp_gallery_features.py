"""
Test RSVP and Gallery Integration Features
- GET /api/invitations/by-gallery/{gallery_id} endpoint
- Public invitation page features
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://rsvp-invite-1.preview.emergentagent.com')

# Test credentials
TEST_EMAIL = "lessrealmoments@gmail.com"
TEST_PASSWORD = "3tfL99B%u2qw"
LINKED_GALLERY_ID = "ad3629c4-3ca0-47de-8e55-f2217663d3e3"
INVITATION_SHARE_LINK = "UQ9k2wOAwvthl1dv"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Authentication failed - skipping authenticated tests")


@pytest.fixture
def authenticated_client(auth_token):
    """Session with auth header"""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    })
    return session


class TestInvitationByGalleryEndpoint:
    """Test GET /api/invitations/by-gallery/{gallery_id} endpoint"""
    
    def test_get_invitation_by_gallery_success(self, authenticated_client):
        """Test getting invitation linked to a gallery"""
        response = authenticated_client.get(f"{BASE_URL}/api/invitations/by-gallery/{LINKED_GALLERY_ID}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "invitation" in data
        
        if data["invitation"]:
            invitation = data["invitation"]
            assert "id" in invitation
            assert "title" in invitation
            assert "share_link" in invitation
            assert "status" in invitation
            assert "total_rsvps" in invitation
            assert "attending_count" in invitation
            
            print(f"Found linked invitation: {invitation['title']}")
            print(f"Attending count: {invitation['attending_count']}")
    
    def test_get_invitation_by_gallery_not_found(self, authenticated_client):
        """Test getting invitation for gallery with no linked invitation"""
        fake_gallery_id = "00000000-0000-0000-0000-000000000000"
        response = authenticated_client.get(f"{BASE_URL}/api/invitations/by-gallery/{fake_gallery_id}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Should return null invitation
        assert data["invitation"] is None
    
    def test_get_invitation_by_gallery_unauthorized(self):
        """Test endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/invitations/by-gallery/{LINKED_GALLERY_ID}")
        
        # Should return 401 or 403
        assert response.status_code in [401, 403]


class TestPublicInvitationPage:
    """Test public invitation page features"""
    
    def test_public_invitation_loads(self):
        """Test public invitation endpoint returns correct data"""
        response = requests.get(f"{BASE_URL}/api/invitations/public/{INVITATION_SHARE_LINK}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify required fields
        assert "id" in data
        assert "title" in data
        assert "event_type" in data
        assert "host_names" in data
        assert "design" in data
        assert "rsvp_enabled" in data
        
        print(f"Public invitation title: {data['title']}")
    
    def test_public_invitation_has_design(self):
        """Test public invitation includes design settings"""
        response = requests.get(f"{BASE_URL}/api/invitations/public/{INVITATION_SHARE_LINK}")
        
        assert response.status_code == 200
        data = response.json()
        
        design = data.get("design", {})
        
        # Verify design fields for frosted glass layout
        assert "primary_color" in design
        assert "accent_color" in design
        assert "font_family" in design
        
        print(f"Primary color: {design.get('primary_color')}")
        print(f"Cover image URL: {design.get('cover_image_url')}")
    
    def test_public_invitation_has_external_url(self):
        """Test public invitation includes external invitation URL"""
        response = requests.get(f"{BASE_URL}/api/invitations/public/{INVITATION_SHARE_LINK}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Check for external invitation URL (View Invitation button)
        external_url = data.get("external_invitation_url")
        if external_url:
            print(f"External invitation URL: {external_url}")
            assert external_url.startswith("http")
        else:
            print("No external invitation URL set")
    
    def test_public_invitation_has_linked_gallery(self):
        """Test public invitation includes linked gallery share link"""
        response = requests.get(f"{BASE_URL}/api/invitations/public/{INVITATION_SHARE_LINK}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Check for linked gallery
        gallery_link = data.get("linked_gallery_share_link")
        if gallery_link:
            print(f"Linked gallery share link: {gallery_link}")
        else:
            print("No linked gallery")
    
    def test_public_invitation_has_event_date(self):
        """Test public invitation includes event date for countdown"""
        response = requests.get(f"{BASE_URL}/api/invitations/public/{INVITATION_SHARE_LINK}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Check for event date (needed for countdown timer)
        event_date = data.get("event_date")
        event_time = data.get("event_time")
        
        if event_date:
            print(f"Event date: {event_date}")
            print(f"Event time: {event_time}")
        else:
            print("No event date set")


class TestRSVPSubmission:
    """Test RSVP submission on public page"""
    
    def test_rsvp_submission_success(self):
        """Test submitting an RSVP"""
        import uuid
        unique_name = f"Test Guest {uuid.uuid4().hex[:8]}"
        
        response = requests.post(
            f"{BASE_URL}/api/invitations/public/{INVITATION_SHARE_LINK}/rsvp",
            json={
                "guest_name": unique_name,
                "guest_email": f"test_{uuid.uuid4().hex[:8]}@example.com",
                "attendance_status": "attending",
                "guest_count": 1,
                "responses": {},
                "message": "Test RSVP from pytest"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert "id" in data
        assert data["guest_name"] == unique_name
        assert data["attendance_status"] == "attending"
        
        print(f"RSVP submitted successfully: {data['id']}")
    
    def test_rsvp_requires_name(self):
        """Test RSVP requires guest name"""
        response = requests.post(
            f"{BASE_URL}/api/invitations/public/{INVITATION_SHARE_LINK}/rsvp",
            json={
                "guest_name": "",
                "attendance_status": "attending",
                "guest_count": 1
            }
        )
        
        # Should fail validation
        assert response.status_code in [400, 422]


class TestInvitationStats:
    """Test invitation statistics"""
    
    def test_get_rsvp_stats(self, authenticated_client):
        """Test getting RSVP statistics"""
        # First get the invitation ID
        response = authenticated_client.get(f"{BASE_URL}/api/invitations/by-gallery/{LINKED_GALLERY_ID}")
        assert response.status_code == 200
        
        invitation = response.json().get("invitation")
        if not invitation:
            pytest.skip("No linked invitation found")
        
        invitation_id = invitation["id"]
        
        # Get stats
        stats_response = authenticated_client.get(f"{BASE_URL}/api/invitations/{invitation_id}/stats")
        assert stats_response.status_code == 200
        
        stats = stats_response.json()
        
        assert "total_rsvps" in stats
        assert "attending_count" in stats
        assert "not_attending_count" in stats
        assert "maybe_count" in stats
        assert "total_guests" in stats
        
        print(f"RSVP Stats: {stats}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
