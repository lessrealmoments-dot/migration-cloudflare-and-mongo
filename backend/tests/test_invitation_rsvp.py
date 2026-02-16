"""
Test suite for Invitation and RSVP API endpoints
Tests: Create, Read, Update, Delete invitations, RSVP submission, stats, export
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_USER_EMAIL = "lessrealmoments@gmail.com"
TEST_USER_PASSWORD = "3tfL99B%u2qw"
EXISTING_SHARE_LINK = "UQ9k2wOAwvthl1dv"


class TestInvitationTemplatesAndDefaults:
    """Test public endpoints for templates and default fields"""
    
    def test_get_invitation_templates(self):
        """Test fetching invitation templates"""
        response = requests.get(f"{BASE_URL}/api/invitations/templates")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        templates = response.json()
        assert isinstance(templates, list), "Templates should be a list"
        assert len(templates) > 0, "Should have at least one template"
        
        # Verify template structure
        template = templates[0]
        assert "id" in template, "Template should have id"
        assert "name" in template, "Template should have name"
        assert "category" in template, "Template should have category"
        assert "theme_colors" in template, "Template should have theme_colors"
        assert "font_family" in template, "Template should have font_family"
        print(f"✓ Found {len(templates)} invitation templates")
    
    def test_get_default_rsvp_fields(self):
        """Test fetching default RSVP fields"""
        response = requests.get(f"{BASE_URL}/api/invitations/default-rsvp-fields")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        fields = response.json()
        assert isinstance(fields, list), "Fields should be a list"
        assert len(fields) > 0, "Should have at least one default field"
        
        # Verify field structure
        field = fields[0]
        assert "field_id" in field, "Field should have field_id"
        assert "field_type" in field, "Field should have field_type"
        assert "label" in field, "Field should have label"
        print(f"✓ Found {len(fields)} default RSVP fields")


class TestInvitationCRUD:
    """Test invitation CRUD operations"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Response should contain token"
        print(f"✓ Logged in as {TEST_USER_EMAIL}")
        return data["token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get auth headers"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_get_user_invitations(self, auth_headers):
        """Test fetching user's invitations"""
        response = requests.get(f"{BASE_URL}/api/invitations", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        invitations = response.json()
        assert isinstance(invitations, list), "Invitations should be a list"
        print(f"✓ User has {len(invitations)} invitations")
        return invitations
    
    def test_create_invitation(self, auth_headers):
        """Test creating a new invitation"""
        unique_id = str(uuid.uuid4())[:8]
        invitation_data = {
            "title": f"TEST_Wedding Invitation {unique_id}",
            "event_type": "wedding",
            "host_names": "John & Jane Test",
            "event_date": "2026-06-15",
            "event_time": "14:00",
            "event_end_time": "22:00",
            "venue_name": "Test Grand Ballroom",
            "venue_address": "123 Test Street, Test City",
            "message": "We joyfully invite you to celebrate our wedding!",
            "additional_info": "Dress code: Semi-formal",
            "rsvp_enabled": True,
            "rsvp_deadline": "2026-06-01",
            "max_guests_per_rsvp": 4
        }
        
        response = requests.post(f"{BASE_URL}/api/invitations", json=invitation_data, headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        invitation = response.json()
        assert "id" in invitation, "Response should contain id"
        assert "share_link" in invitation, "Response should contain share_link"
        assert invitation["title"] == invitation_data["title"], "Title should match"
        assert invitation["event_type"] == "wedding", "Event type should be wedding"
        assert invitation["status"] == "draft", "New invitation should be draft"
        
        print(f"✓ Created invitation: {invitation['id']} with share_link: {invitation['share_link']}")
        return invitation
    
    def test_get_single_invitation(self, auth_headers):
        """Test fetching a single invitation"""
        # First create an invitation
        invitation = self.test_create_invitation(auth_headers)
        invitation_id = invitation["id"]
        
        # Then fetch it
        response = requests.get(f"{BASE_URL}/api/invitations/{invitation_id}", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        fetched = response.json()
        assert fetched["id"] == invitation_id, "ID should match"
        assert fetched["title"] == invitation["title"], "Title should match"
        print(f"✓ Fetched invitation: {invitation_id}")
        
        return invitation_id
    
    def test_update_invitation(self, auth_headers):
        """Test updating an invitation"""
        # First create an invitation
        invitation = self.test_create_invitation(auth_headers)
        invitation_id = invitation["id"]
        
        # Update it
        update_data = {
            "title": "TEST_Updated Wedding Title",
            "message": "Updated invitation message",
            "venue_name": "Updated Venue Name"
        }
        
        response = requests.put(f"{BASE_URL}/api/invitations/{invitation_id}", json=update_data, headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        updated = response.json()
        assert updated["title"] == update_data["title"], "Title should be updated"
        assert updated["message"] == update_data["message"], "Message should be updated"
        assert updated["venue_name"] == update_data["venue_name"], "Venue should be updated"
        
        # Verify persistence with GET
        response = requests.get(f"{BASE_URL}/api/invitations/{invitation_id}", headers=auth_headers)
        assert response.status_code == 200
        fetched = response.json()
        assert fetched["title"] == update_data["title"], "Updated title should persist"
        
        print(f"✓ Updated invitation: {invitation_id}")
        return invitation_id
    
    def test_publish_invitation(self, auth_headers):
        """Test publishing an invitation"""
        # First create an invitation
        invitation = self.test_create_invitation(auth_headers)
        invitation_id = invitation["id"]
        
        # Publish it
        response = requests.post(f"{BASE_URL}/api/invitations/{invitation_id}/publish", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        result = response.json()
        assert "share_link" in result, "Response should contain share_link"
        
        # Verify status changed
        response = requests.get(f"{BASE_URL}/api/invitations/{invitation_id}", headers=auth_headers)
        assert response.status_code == 200
        fetched = response.json()
        assert fetched["status"] == "published", "Status should be published"
        
        print(f"✓ Published invitation: {invitation_id}")
        return invitation_id, fetched["share_link"]
    
    def test_delete_invitation(self, auth_headers):
        """Test deleting an invitation"""
        # First create an invitation
        invitation = self.test_create_invitation(auth_headers)
        invitation_id = invitation["id"]
        
        # Delete it
        response = requests.delete(f"{BASE_URL}/api/invitations/{invitation_id}", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify it's deleted
        response = requests.get(f"{BASE_URL}/api/invitations/{invitation_id}", headers=auth_headers)
        assert response.status_code == 404, "Deleted invitation should return 404"
        
        print(f"✓ Deleted invitation: {invitation_id}")


class TestPublicInvitation:
    """Test public invitation endpoints (for guests)"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get auth headers"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    @pytest.fixture(scope="class")
    def published_invitation(self, auth_headers):
        """Create and publish an invitation for testing"""
        unique_id = str(uuid.uuid4())[:8]
        invitation_data = {
            "title": f"TEST_Public Invitation {unique_id}",
            "event_type": "birthday",
            "host_names": "Test Host",
            "event_date": "2026-07-20",
            "event_time": "18:00",
            "venue_name": "Test Party Venue",
            "message": "Join us for a celebration!",
            "rsvp_enabled": True,
            "max_guests_per_rsvp": 3
        }
        
        # Create
        response = requests.post(f"{BASE_URL}/api/invitations", json=invitation_data, headers=auth_headers)
        assert response.status_code == 200
        invitation = response.json()
        
        # Publish
        response = requests.post(f"{BASE_URL}/api/invitations/{invitation['id']}/publish", headers=auth_headers)
        assert response.status_code == 200
        
        print(f"✓ Created and published test invitation: {invitation['share_link']}")
        return invitation
    
    def test_get_public_invitation(self, published_invitation):
        """Test fetching public invitation by share link"""
        share_link = published_invitation["share_link"]
        
        response = requests.get(f"{BASE_URL}/api/invitations/public/{share_link}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        public_inv = response.json()
        assert public_inv["title"] == published_invitation["title"], "Title should match"
        assert public_inv["rsvp_enabled"] == True, "RSVP should be enabled"
        assert "rsvp_fields" in public_inv, "Should have RSVP fields"
        
        print(f"✓ Fetched public invitation: {share_link}")
    
    def test_get_public_invitation_not_found(self):
        """Test fetching non-existent public invitation"""
        response = requests.get(f"{BASE_URL}/api/invitations/public/nonexistent123")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Non-existent invitation returns 404")
    
    def test_existing_share_link(self):
        """Test fetching existing invitation by share link"""
        response = requests.get(f"{BASE_URL}/api/invitations/public/{EXISTING_SHARE_LINK}")
        # May be 200 if published, 404 if not found/not published
        print(f"Existing share link status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Found existing invitation: {data.get('title', 'N/A')}")
        else:
            print(f"Note: Existing share link returned {response.status_code}")


class TestRSVPSubmission:
    """Test RSVP submission and management"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get auth headers"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    @pytest.fixture(scope="class")
    def published_invitation(self, auth_headers):
        """Create and publish an invitation for RSVP testing"""
        unique_id = str(uuid.uuid4())[:8]
        invitation_data = {
            "title": f"TEST_RSVP Test Invitation {unique_id}",
            "event_type": "wedding",
            "host_names": "RSVP Test Hosts",
            "event_date": "2026-08-15",
            "event_time": "15:00",
            "venue_name": "RSVP Test Venue",
            "message": "Please RSVP!",
            "rsvp_enabled": True,
            "rsvp_deadline": "2026-08-01",
            "max_guests_per_rsvp": 5
        }
        
        # Create
        response = requests.post(f"{BASE_URL}/api/invitations", json=invitation_data, headers=auth_headers)
        assert response.status_code == 200
        invitation = response.json()
        
        # Publish
        response = requests.post(f"{BASE_URL}/api/invitations/{invitation['id']}/publish", headers=auth_headers)
        assert response.status_code == 200
        
        print(f"✓ Created RSVP test invitation: {invitation['share_link']}")
        return invitation
    
    def test_submit_rsvp_attending(self, published_invitation):
        """Test submitting an RSVP with attending status"""
        share_link = published_invitation["share_link"]
        unique_id = str(uuid.uuid4())[:8]
        
        rsvp_data = {
            "guest_name": f"TEST_Guest Attending {unique_id}",
            "guest_email": f"test_attending_{unique_id}@test.com",
            "guest_phone": "+1234567890",
            "attendance_status": "attending",
            "guest_count": 2,
            "message": "Looking forward to it!",
            "responses": {}
        }
        
        response = requests.post(f"{BASE_URL}/api/invitations/public/{share_link}/rsvp", json=rsvp_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        rsvp = response.json()
        assert "id" in rsvp, "RSVP should have id"
        assert rsvp["guest_name"] == rsvp_data["guest_name"], "Guest name should match"
        assert rsvp["attendance_status"] == "attending", "Status should be attending"
        assert rsvp["guest_count"] == 2, "Guest count should be 2"
        
        print(f"✓ Submitted attending RSVP: {rsvp['id']}")
        return rsvp
    
    def test_submit_rsvp_not_attending(self, published_invitation):
        """Test submitting an RSVP with not attending status"""
        share_link = published_invitation["share_link"]
        unique_id = str(uuid.uuid4())[:8]
        
        rsvp_data = {
            "guest_name": f"TEST_Guest Not Attending {unique_id}",
            "guest_email": f"test_notattending_{unique_id}@test.com",
            "attendance_status": "not_attending",
            "guest_count": 1,
            "message": "Sorry, can't make it!",
            "responses": {}
        }
        
        response = requests.post(f"{BASE_URL}/api/invitations/public/{share_link}/rsvp", json=rsvp_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        rsvp = response.json()
        assert rsvp["attendance_status"] == "not_attending", "Status should be not_attending"
        
        print(f"✓ Submitted not attending RSVP: {rsvp['id']}")
    
    def test_submit_rsvp_maybe(self, published_invitation):
        """Test submitting an RSVP with maybe status"""
        share_link = published_invitation["share_link"]
        unique_id = str(uuid.uuid4())[:8]
        
        rsvp_data = {
            "guest_name": f"TEST_Guest Maybe {unique_id}",
            "attendance_status": "maybe",
            "guest_count": 1,
            "responses": {}
        }
        
        response = requests.post(f"{BASE_URL}/api/invitations/public/{share_link}/rsvp", json=rsvp_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        rsvp = response.json()
        assert rsvp["attendance_status"] == "maybe", "Status should be maybe"
        
        print(f"✓ Submitted maybe RSVP: {rsvp['id']}")
    
    def test_submit_rsvp_exceeds_max_guests(self, published_invitation):
        """Test that RSVP with too many guests is rejected"""
        share_link = published_invitation["share_link"]
        
        rsvp_data = {
            "guest_name": "TEST_Too Many Guests",
            "attendance_status": "attending",
            "guest_count": 10,  # Max is 5
            "responses": {}
        }
        
        response = requests.post(f"{BASE_URL}/api/invitations/public/{share_link}/rsvp", json=rsvp_data)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("✓ RSVP with too many guests rejected")


class TestRSVPManagement:
    """Test RSVP management endpoints (authenticated)"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get auth headers"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    @pytest.fixture(scope="class")
    def invitation_with_rsvps(self, auth_headers):
        """Create invitation with RSVPs for testing"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create invitation
        invitation_data = {
            "title": f"TEST_RSVP Management Test {unique_id}",
            "event_type": "corporate",
            "host_names": "Test Corp",
            "event_date": "2026-09-10",
            "rsvp_enabled": True,
            "max_guests_per_rsvp": 5
        }
        
        response = requests.post(f"{BASE_URL}/api/invitations", json=invitation_data, headers=auth_headers)
        assert response.status_code == 200
        invitation = response.json()
        
        # Publish
        response = requests.post(f"{BASE_URL}/api/invitations/{invitation['id']}/publish", headers=auth_headers)
        assert response.status_code == 200
        
        # Submit some RSVPs
        share_link = invitation["share_link"]
        for i in range(3):
            rsvp_data = {
                "guest_name": f"TEST_Management Guest {i}",
                "attendance_status": "attending" if i < 2 else "not_attending",
                "guest_count": i + 1,
                "responses": {}
            }
            requests.post(f"{BASE_URL}/api/invitations/public/{share_link}/rsvp", json=rsvp_data)
        
        print(f"✓ Created invitation with RSVPs: {invitation['id']}")
        return invitation
    
    def test_get_invitation_rsvps(self, auth_headers, invitation_with_rsvps):
        """Test fetching RSVPs for an invitation"""
        invitation_id = invitation_with_rsvps["id"]
        
        response = requests.get(f"{BASE_URL}/api/invitations/{invitation_id}/rsvps", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        rsvps = response.json()
        assert isinstance(rsvps, list), "RSVPs should be a list"
        assert len(rsvps) >= 3, f"Should have at least 3 RSVPs, got {len(rsvps)}"
        
        print(f"✓ Fetched {len(rsvps)} RSVPs for invitation")
        return rsvps
    
    def test_get_rsvp_stats(self, auth_headers, invitation_with_rsvps):
        """Test fetching RSVP statistics"""
        invitation_id = invitation_with_rsvps["id"]
        
        response = requests.get(f"{BASE_URL}/api/invitations/{invitation_id}/stats", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        stats = response.json()
        assert "total_rsvps" in stats, "Stats should have total_rsvps"
        assert "attending_count" in stats, "Stats should have attending_count"
        assert "not_attending_count" in stats, "Stats should have not_attending_count"
        assert "total_guests" in stats, "Stats should have total_guests"
        
        print(f"✓ RSVP Stats: {stats['total_rsvps']} total, {stats['attending_count']} attending, {stats['total_guests']} guests")
        return stats
    
    def test_delete_rsvp(self, auth_headers, invitation_with_rsvps):
        """Test deleting an RSVP"""
        invitation_id = invitation_with_rsvps["id"]
        
        # Get RSVPs
        response = requests.get(f"{BASE_URL}/api/invitations/{invitation_id}/rsvps", headers=auth_headers)
        assert response.status_code == 200
        rsvps = response.json()
        
        if len(rsvps) > 0:
            rsvp_id = rsvps[0]["id"]
            
            # Delete RSVP
            response = requests.delete(f"{BASE_URL}/api/invitations/{invitation_id}/rsvps/{rsvp_id}", headers=auth_headers)
            assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
            
            # Verify deletion
            response = requests.get(f"{BASE_URL}/api/invitations/{invitation_id}/rsvps", headers=auth_headers)
            updated_rsvps = response.json()
            assert len(updated_rsvps) == len(rsvps) - 1, "RSVP count should decrease by 1"
            
            print(f"✓ Deleted RSVP: {rsvp_id}")
    
    def test_export_rsvps_json(self, auth_headers, invitation_with_rsvps):
        """Test exporting RSVPs as JSON"""
        invitation_id = invitation_with_rsvps["id"]
        
        response = requests.get(f"{BASE_URL}/api/invitations/{invitation_id}/export?format=json", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "rsvps" in data, "Response should have rsvps"
        assert "total" in data, "Response should have total"
        
        print(f"✓ Exported {data['total']} RSVPs as JSON")
    
    def test_export_rsvps_csv(self, auth_headers, invitation_with_rsvps):
        """Test exporting RSVPs as CSV"""
        invitation_id = invitation_with_rsvps["id"]
        
        response = requests.get(f"{BASE_URL}/api/invitations/{invitation_id}/export?format=csv", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert "text/csv" in response.headers.get("content-type", ""), "Should return CSV content type"
        
        print("✓ Exported RSVPs as CSV")


class TestGalleryLinking:
    """Test linking galleries to invitations"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get auth headers"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_link_gallery_to_invitation(self, auth_headers):
        """Test linking a gallery to an invitation"""
        # First get user's galleries
        response = requests.get(f"{BASE_URL}/api/galleries", headers=auth_headers)
        if response.status_code != 200:
            pytest.skip("No galleries endpoint or no galleries available")
        
        galleries = response.json()
        if len(galleries) == 0:
            pytest.skip("No galleries available to link")
        
        gallery_id = galleries[0]["id"]
        
        # Create an invitation
        unique_id = str(uuid.uuid4())[:8]
        invitation_data = {
            "title": f"TEST_Gallery Link Test {unique_id}",
            "event_type": "wedding",
            "host_names": "Test Hosts",
            "rsvp_enabled": True
        }
        
        response = requests.post(f"{BASE_URL}/api/invitations", json=invitation_data, headers=auth_headers)
        assert response.status_code == 200
        invitation = response.json()
        invitation_id = invitation["id"]
        
        # Link gallery
        response = requests.post(
            f"{BASE_URL}/api/invitations/{invitation_id}/link-gallery?gallery_id={gallery_id}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify link
        response = requests.get(f"{BASE_URL}/api/invitations/{invitation_id}", headers=auth_headers)
        assert response.status_code == 200
        updated = response.json()
        assert updated["linked_gallery_id"] == gallery_id, "Gallery should be linked"
        
        print(f"✓ Linked gallery {gallery_id} to invitation {invitation_id}")


# Cleanup test data
class TestCleanup:
    """Cleanup test data after tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Cannot login for cleanup")
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get auth headers"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_cleanup_test_invitations(self, auth_headers):
        """Delete all TEST_ prefixed invitations"""
        response = requests.get(f"{BASE_URL}/api/invitations", headers=auth_headers)
        if response.status_code != 200:
            print("Could not fetch invitations for cleanup")
            return
        
        invitations = response.json()
        deleted_count = 0
        
        for inv in invitations:
            if inv.get("title", "").startswith("TEST_"):
                response = requests.delete(f"{BASE_URL}/api/invitations/{inv['id']}", headers=auth_headers)
                if response.status_code == 200:
                    deleted_count += 1
        
        print(f"✓ Cleaned up {deleted_count} test invitations")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
