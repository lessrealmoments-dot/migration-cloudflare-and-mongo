"""
Test suite for Celebrant Dashboard features
Tests: Manual guest addition, guest update, external invitation URL, dashboard data
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


class TestManualGuestAddition:
    """Test manual guest addition API for phone/in-person RSVPs"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        token = data.get("access_token") or data.get("token")
        assert token, "Response should contain access_token or token"
        print(f"✓ Logged in as {TEST_USER_EMAIL}")
        return token
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get auth headers"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    @pytest.fixture(scope="class")
    def test_invitation(self, auth_headers):
        """Create a test invitation for manual guest testing"""
        unique_id = str(uuid.uuid4())[:8]
        invitation_data = {
            "title": f"TEST_Manual Guest Test {unique_id}",
            "event_type": "wedding",
            "host_names": "Test Hosts",
            "event_date": "2026-06-15",
            "rsvp_enabled": True,
            "max_guests_per_rsvp": 10
        }
        
        response = requests.post(f"{BASE_URL}/api/invitations", json=invitation_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create invitation: {response.text}"
        invitation = response.json()
        
        # Publish it
        response = requests.post(f"{BASE_URL}/api/invitations/{invitation['id']}/publish", headers=auth_headers)
        assert response.status_code == 200
        
        print(f"✓ Created test invitation: {invitation['id']}")
        return invitation
    
    def test_add_manual_guest_attending(self, auth_headers, test_invitation):
        """Test adding a manual guest with attending status"""
        invitation_id = test_invitation["id"]
        unique_id = str(uuid.uuid4())[:8]
        
        guest_data = {
            "guest_name": f"TEST_Manual Guest {unique_id}",
            "guest_email": f"manual_{unique_id}@test.com",
            "guest_phone": "+1234567890",
            "attendance_status": "attending",
            "guest_count": 2,
            "notes": "Added via phone call",
            "added_via": "phone"
        }
        
        response = requests.post(f"{BASE_URL}/api/invitations/{invitation_id}/guests", json=guest_data, headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        result = response.json()
        assert "id" in result, "Response should contain guest id"
        assert result["guest"]["name"] == guest_data["guest_name"], "Guest name should match"
        assert result["guest"]["status"] == "attending", "Status should be attending"
        assert result["guest"]["guest_count"] == 2, "Guest count should be 2"
        
        print(f"✓ Added manual guest: {result['id']}")
        return result["id"]
    
    def test_add_manual_guest_not_attending(self, auth_headers, test_invitation):
        """Test adding a manual guest with not_attending status"""
        invitation_id = test_invitation["id"]
        unique_id = str(uuid.uuid4())[:8]
        
        guest_data = {
            "guest_name": f"TEST_Not Attending Guest {unique_id}",
            "attendance_status": "not_attending",
            "guest_count": 1,
            "notes": "Declined in person",
            "added_via": "in_person"
        }
        
        response = requests.post(f"{BASE_URL}/api/invitations/{invitation_id}/guests", json=guest_data, headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        result = response.json()
        assert result["guest"]["status"] == "not_attending", "Status should be not_attending"
        
        print(f"✓ Added not attending guest: {result['id']}")
    
    def test_add_manual_guest_maybe(self, auth_headers, test_invitation):
        """Test adding a manual guest with maybe status"""
        invitation_id = test_invitation["id"]
        unique_id = str(uuid.uuid4())[:8]
        
        guest_data = {
            "guest_name": f"TEST_Maybe Guest {unique_id}",
            "attendance_status": "maybe",
            "guest_count": 1,
            "added_via": "manual"
        }
        
        response = requests.post(f"{BASE_URL}/api/invitations/{invitation_id}/guests", json=guest_data, headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        result = response.json()
        assert result["guest"]["status"] == "maybe", "Status should be maybe"
        
        print(f"✓ Added maybe guest: {result['id']}")
    
    def test_verify_manual_guests_in_rsvp_list(self, auth_headers, test_invitation):
        """Verify manually added guests appear in RSVP list"""
        invitation_id = test_invitation["id"]
        
        response = requests.get(f"{BASE_URL}/api/invitations/{invitation_id}/rsvps", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        rsvps = response.json()
        assert len(rsvps) >= 3, f"Should have at least 3 RSVPs, got {len(rsvps)}"
        
        # Check for added_via field
        manual_guests = [r for r in rsvps if r.get("added_via") in ["phone", "in_person", "manual"]]
        assert len(manual_guests) >= 3, f"Should have at least 3 manual guests, got {len(manual_guests)}"
        
        print(f"✓ Found {len(manual_guests)} manually added guests in RSVP list")
    
    def test_stats_include_manual_guests(self, auth_headers, test_invitation):
        """Verify stats include manually added guests"""
        invitation_id = test_invitation["id"]
        
        response = requests.get(f"{BASE_URL}/api/invitations/{invitation_id}/stats", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        stats = response.json()
        assert stats["total_rsvps"] >= 3, f"Should have at least 3 RSVPs, got {stats['total_rsvps']}"
        assert stats["attending_count"] >= 1, f"Should have at least 1 attending, got {stats['attending_count']}"
        assert stats["not_attending_count"] >= 1, f"Should have at least 1 not attending, got {stats['not_attending_count']}"
        assert stats["maybe_count"] >= 1, f"Should have at least 1 maybe, got {stats['maybe_count']}"
        
        print(f"✓ Stats: {stats['total_rsvps']} total, {stats['attending_count']} attending, {stats['total_guests']} expected guests")


class TestGuestUpdate:
    """Test updating guest RSVP information"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        return data.get("access_token") or data.get("token")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get auth headers"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    @pytest.fixture(scope="class")
    def invitation_with_guest(self, auth_headers):
        """Create invitation with a guest for update testing"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create invitation
        invitation_data = {
            "title": f"TEST_Guest Update Test {unique_id}",
            "event_type": "birthday",
            "host_names": "Update Test Host",
            "rsvp_enabled": True
        }
        
        response = requests.post(f"{BASE_URL}/api/invitations", json=invitation_data, headers=auth_headers)
        assert response.status_code == 200
        invitation = response.json()
        
        # Publish
        response = requests.post(f"{BASE_URL}/api/invitations/{invitation['id']}/publish", headers=auth_headers)
        assert response.status_code == 200
        
        # Add a guest
        guest_data = {
            "guest_name": f"TEST_Update Guest {unique_id}",
            "guest_email": f"update_{unique_id}@test.com",
            "attendance_status": "attending",
            "guest_count": 1,
            "added_via": "manual"
        }
        
        response = requests.post(f"{BASE_URL}/api/invitations/{invitation['id']}/guests", json=guest_data, headers=auth_headers)
        assert response.status_code == 200
        guest_result = response.json()
        
        return {"invitation": invitation, "guest_id": guest_result["id"]}
    
    def test_update_guest_status(self, auth_headers, invitation_with_guest):
        """Test updating guest attendance status"""
        invitation_id = invitation_with_guest["invitation"]["id"]
        guest_id = invitation_with_guest["guest_id"]
        
        update_data = {
            "guest_name": "TEST_Updated Guest Name",
            "attendance_status": "not_attending",
            "guest_count": 1,
            "notes": "Changed mind",
            "added_via": "manual"
        }
        
        response = requests.put(f"{BASE_URL}/api/invitations/{invitation_id}/guests/{guest_id}", json=update_data, headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify update
        response = requests.get(f"{BASE_URL}/api/invitations/{invitation_id}/rsvps", headers=auth_headers)
        assert response.status_code == 200
        rsvps = response.json()
        
        updated_guest = next((r for r in rsvps if r["id"] == guest_id), None)
        assert updated_guest is not None, "Guest should exist"
        assert updated_guest["guest_name"] == "TEST_Updated Guest Name", "Name should be updated"
        assert updated_guest["attendance_status"] == "not_attending", "Status should be updated"
        
        print(f"✓ Updated guest {guest_id} status to not_attending")
    
    def test_update_guest_count(self, auth_headers, invitation_with_guest):
        """Test updating guest count"""
        invitation_id = invitation_with_guest["invitation"]["id"]
        guest_id = invitation_with_guest["guest_id"]
        
        update_data = {
            "guest_name": "TEST_Updated Guest Name",
            "attendance_status": "attending",
            "guest_count": 3,
            "notes": "Bringing family",
            "added_via": "manual"
        }
        
        response = requests.put(f"{BASE_URL}/api/invitations/{invitation_id}/guests/{guest_id}", json=update_data, headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify stats updated
        response = requests.get(f"{BASE_URL}/api/invitations/{invitation_id}/stats", headers=auth_headers)
        assert response.status_code == 200
        stats = response.json()
        
        assert stats["total_guests"] >= 3, f"Total guests should be at least 3, got {stats['total_guests']}"
        
        print(f"✓ Updated guest count, total expected guests: {stats['total_guests']}")


class TestExternalInvitationURL:
    """Test external invitation URL feature (for Canva/other platforms)"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        return data.get("access_token") or data.get("token")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get auth headers"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_set_external_invitation_url(self, auth_headers):
        """Test setting external invitation URL"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create invitation
        invitation_data = {
            "title": f"TEST_External URL Test {unique_id}",
            "event_type": "wedding",
            "host_names": "External URL Test",
            "rsvp_enabled": True
        }
        
        response = requests.post(f"{BASE_URL}/api/invitations", json=invitation_data, headers=auth_headers)
        assert response.status_code == 200
        invitation = response.json()
        invitation_id = invitation["id"]
        
        # Set external URL
        external_url = "https://www.canva.com/design/test-invitation-12345"
        update_data = {
            "external_invitation_url": external_url
        }
        
        response = requests.put(f"{BASE_URL}/api/invitations/{invitation_id}", json=update_data, headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify update
        response = requests.get(f"{BASE_URL}/api/invitations/{invitation_id}", headers=auth_headers)
        assert response.status_code == 200
        updated = response.json()
        assert updated["external_invitation_url"] == external_url, "External URL should be set"
        
        print(f"✓ Set external invitation URL: {external_url}")
        return invitation
    
    def test_external_url_in_public_view(self, auth_headers):
        """Test that external URL appears in public invitation view"""
        unique_id = str(uuid.uuid4())[:8]
        external_url = "https://www.canva.com/design/public-test-12345"
        
        # Create invitation with external URL
        invitation_data = {
            "title": f"TEST_Public External URL {unique_id}",
            "event_type": "birthday",
            "host_names": "Public External Test",
            "external_invitation_url": external_url,
            "rsvp_enabled": True
        }
        
        response = requests.post(f"{BASE_URL}/api/invitations", json=invitation_data, headers=auth_headers)
        assert response.status_code == 200
        invitation = response.json()
        
        # Publish
        response = requests.post(f"{BASE_URL}/api/invitations/{invitation['id']}/publish", headers=auth_headers)
        assert response.status_code == 200
        
        # Check public view
        response = requests.get(f"{BASE_URL}/api/invitations/public/{invitation['share_link']}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        public_inv = response.json()
        assert public_inv["external_invitation_url"] == external_url, "External URL should be in public view"
        
        print(f"✓ External URL visible in public view: {external_url}")


class TestDashboardData:
    """Test dashboard data endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        return data.get("access_token") or data.get("token")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get auth headers"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_get_existing_invitation_for_dashboard(self, auth_headers):
        """Test fetching existing invitation data for dashboard"""
        # Get user's invitations
        response = requests.get(f"{BASE_URL}/api/invitations", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        invitations = response.json()
        if len(invitations) == 0:
            pytest.skip("No invitations available")
        
        # Get first invitation details
        invitation_id = invitations[0]["id"]
        
        response = requests.get(f"{BASE_URL}/api/invitations/{invitation_id}", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        invitation = response.json()
        assert "id" in invitation
        assert "title" in invitation
        assert "share_link" in invitation
        
        print(f"✓ Fetched invitation for dashboard: {invitation['title']}")
    
    def test_get_rsvps_for_dashboard(self, auth_headers):
        """Test fetching RSVPs for dashboard display"""
        # Get user's invitations
        response = requests.get(f"{BASE_URL}/api/invitations", headers=auth_headers)
        assert response.status_code == 200
        
        invitations = response.json()
        if len(invitations) == 0:
            pytest.skip("No invitations available")
        
        invitation_id = invitations[0]["id"]
        
        # Get RSVPs
        response = requests.get(f"{BASE_URL}/api/invitations/{invitation_id}/rsvps", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        rsvps = response.json()
        assert isinstance(rsvps, list), "RSVPs should be a list"
        
        # Verify RSVP structure for dashboard
        if len(rsvps) > 0:
            rsvp = rsvps[0]
            assert "id" in rsvp
            assert "guest_name" in rsvp
            assert "attendance_status" in rsvp
            assert "guest_count" in rsvp
        
        print(f"✓ Fetched {len(rsvps)} RSVPs for dashboard")
    
    def test_get_stats_for_dashboard(self, auth_headers):
        """Test fetching stats for dashboard display"""
        # Get user's invitations
        response = requests.get(f"{BASE_URL}/api/invitations", headers=auth_headers)
        assert response.status_code == 200
        
        invitations = response.json()
        if len(invitations) == 0:
            pytest.skip("No invitations available")
        
        invitation_id = invitations[0]["id"]
        
        # Get stats
        response = requests.get(f"{BASE_URL}/api/invitations/{invitation_id}/stats", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        stats = response.json()
        assert "total_rsvps" in stats
        assert "attending_count" in stats
        assert "not_attending_count" in stats
        assert "maybe_count" in stats
        assert "total_guests" in stats
        
        print(f"✓ Dashboard stats: {stats['total_rsvps']} RSVPs, {stats['attending_count']} attending, {stats['total_guests']} expected guests")


class TestQuickActions:
    """Test quick action endpoints used by dashboard"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        return data.get("access_token") or data.get("token")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get auth headers"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    @pytest.fixture(scope="class")
    def test_invitation(self, auth_headers):
        """Create a test invitation for quick actions"""
        unique_id = str(uuid.uuid4())[:8]
        invitation_data = {
            "title": f"TEST_Quick Actions Test {unique_id}",
            "event_type": "wedding",
            "host_names": "Quick Actions Test",
            "rsvp_enabled": True
        }
        
        response = requests.post(f"{BASE_URL}/api/invitations", json=invitation_data, headers=auth_headers)
        assert response.status_code == 200
        invitation = response.json()
        
        # Publish
        response = requests.post(f"{BASE_URL}/api/invitations/{invitation['id']}/publish", headers=auth_headers)
        assert response.status_code == 200
        
        return invitation
    
    def test_qr_code_generation(self, auth_headers, test_invitation):
        """Test QR code generation for dashboard"""
        invitation_id = test_invitation["id"]
        
        # Test base64 QR code (used in modal)
        response = requests.get(f"{BASE_URL}/api/invitations/{invitation_id}/qr-code-base64", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "qr_code_base64" in data, "Response should contain qr_code_base64"
        assert "invitation_url" in data, "Response should contain invitation_url"
        assert data["qr_code_base64"].startswith("data:image/png;base64,"), "Should be base64 PNG"
        
        print(f"✓ Generated QR code for invitation")
    
    def test_qr_code_download(self, auth_headers, test_invitation):
        """Test QR code download for dashboard"""
        invitation_id = test_invitation["id"]
        
        response = requests.get(f"{BASE_URL}/api/invitations/{invitation_id}/qr-code", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert "image/png" in response.headers.get("content-type", ""), "Should return PNG image"
        
        print(f"✓ Downloaded QR code PNG")
    
    def test_export_csv(self, auth_headers, test_invitation):
        """Test CSV export for dashboard"""
        invitation_id = test_invitation["id"]
        
        response = requests.get(f"{BASE_URL}/api/invitations/{invitation_id}/export?format=csv", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert "text/csv" in response.headers.get("content-type", ""), "Should return CSV"
        
        print(f"✓ Exported guest list as CSV")


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip("Cannot login for cleanup")
        data = response.json()
        return data.get("access_token") or data.get("token")
    
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
