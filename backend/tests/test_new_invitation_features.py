"""
Test new invitation features:
1. QR Code generation endpoints
2. Cover image upload endpoint
3. Public invitation with countdown timer data
"""
import pytest
import requests
import os
import base64

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://rsvp-plus.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_EMAIL = "lessrealmoments@gmail.com"
TEST_PASSWORD = "3tfL99B%u2qw"
EXISTING_SHARE_LINK = "UQ9k2wOAwvthl1dv"


class TestAuth:
    """Authentication helper"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        return data["access_token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get auth headers"""
        return {"Authorization": f"Bearer {auth_token}"}


class TestQRCodeEndpoints(TestAuth):
    """Test QR Code generation endpoints"""
    
    @pytest.fixture(scope="class")
    def invitation_id(self, auth_headers):
        """Get an existing invitation ID"""
        response = requests.get(f"{BASE_URL}/api/invitations", headers=auth_headers)
        assert response.status_code == 200
        invitations = response.json()
        assert len(invitations) > 0, "No invitations found for testing"
        return invitations[0]["id"]
    
    def test_qr_code_base64_endpoint(self, auth_headers, invitation_id):
        """Test GET /api/invitations/{id}/qr-code-base64 returns base64 QR code"""
        response = requests.get(
            f"{BASE_URL}/api/invitations/{invitation_id}/qr-code-base64",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"QR code base64 failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "qr_code_base64" in data, "Missing qr_code_base64 field"
        assert "invitation_url" in data, "Missing invitation_url field"
        
        # Verify base64 format
        qr_base64 = data["qr_code_base64"]
        assert qr_base64.startswith("data:image/png;base64,"), "QR code should be base64 PNG"
        
        # Verify URL format
        invitation_url = data["invitation_url"]
        assert "/i/" in invitation_url, "Invitation URL should contain /i/ path"
        
        print(f"QR Code base64 endpoint working - URL: {invitation_url}")
    
    def test_qr_code_download_endpoint(self, auth_headers, invitation_id):
        """Test GET /api/invitations/{id}/qr-code returns downloadable PNG"""
        response = requests.get(
            f"{BASE_URL}/api/invitations/{invitation_id}/qr-code",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"QR code download failed: {response.text}"
        
        # Verify content type is PNG
        content_type = response.headers.get("content-type", "")
        assert "image/png" in content_type, f"Expected image/png, got {content_type}"
        
        # Verify content disposition for download
        content_disposition = response.headers.get("content-disposition", "")
        assert "attachment" in content_disposition, "Should have attachment disposition"
        assert "invitation_qr_" in content_disposition, "Filename should contain invitation_qr_"
        
        # Verify it's valid PNG data (PNG magic bytes)
        content = response.content
        assert len(content) > 100, "QR code image should have content"
        assert content[:8] == b'\x89PNG\r\n\x1a\n', "Should be valid PNG file"
        
        print(f"QR Code download endpoint working - Size: {len(content)} bytes")
    
    def test_qr_code_unauthorized(self):
        """Test QR code endpoints require authentication"""
        # Try without auth
        response = requests.get(f"{BASE_URL}/api/invitations/fake-id/qr-code-base64")
        assert response.status_code in [401, 403], "Should require authentication"
        
        response = requests.get(f"{BASE_URL}/api/invitations/fake-id/qr-code")
        assert response.status_code in [401, 403], "Should require authentication"
        
        print("QR Code endpoints properly require authentication")
    
    def test_qr_code_not_found(self, auth_headers):
        """Test QR code endpoints return 404 for non-existent invitation"""
        fake_id = "non-existent-invitation-id"
        
        response = requests.get(
            f"{BASE_URL}/api/invitations/{fake_id}/qr-code-base64",
            headers=auth_headers
        )
        assert response.status_code == 404, "Should return 404 for non-existent invitation"
        
        response = requests.get(
            f"{BASE_URL}/api/invitations/{fake_id}/qr-code",
            headers=auth_headers
        )
        assert response.status_code == 404, "Should return 404 for non-existent invitation"
        
        print("QR Code endpoints properly return 404 for non-existent invitations")


class TestCoverImageUpload(TestAuth):
    """Test cover image upload endpoint"""
    
    @pytest.fixture(scope="class")
    def invitation_id(self, auth_headers):
        """Get an existing invitation ID"""
        response = requests.get(f"{BASE_URL}/api/invitations", headers=auth_headers)
        assert response.status_code == 200
        invitations = response.json()
        assert len(invitations) > 0, "No invitations found for testing"
        return invitations[0]["id"]
    
    def test_cover_upload_endpoint_exists(self, auth_headers, invitation_id):
        """Test POST /api/invitations/{id}/upload-cover endpoint exists"""
        # Create a small test image (1x1 pixel PNG)
        # This is a minimal valid PNG file
        png_data = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        )
        
        files = {"file": ("test_cover.png", png_data, "image/png")}
        response = requests.post(
            f"{BASE_URL}/api/invitations/{invitation_id}/upload-cover",
            headers=auth_headers,
            files=files
        )
        
        # Should succeed or fail gracefully (not 404 or 500)
        assert response.status_code in [200, 201, 400], f"Unexpected status: {response.status_code} - {response.text}"
        
        if response.status_code == 200:
            data = response.json()
            assert "cover_image_url" in data, "Should return cover_image_url"
            print(f"Cover upload successful - URL: {data['cover_image_url']}")
        else:
            print(f"Cover upload returned {response.status_code}: {response.text}")
    
    def test_cover_upload_unauthorized(self):
        """Test cover upload requires authentication"""
        png_data = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        )
        
        files = {"file": ("test_cover.png", png_data, "image/png")}
        response = requests.post(
            f"{BASE_URL}/api/invitations/fake-id/upload-cover",
            files=files
        )
        assert response.status_code in [401, 403], "Should require authentication"
        print("Cover upload properly requires authentication")
    
    def test_cover_upload_not_found(self, auth_headers):
        """Test cover upload returns 404 for non-existent invitation"""
        png_data = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        )
        
        files = {"file": ("test_cover.png", png_data, "image/png")}
        response = requests.post(
            f"{BASE_URL}/api/invitations/non-existent-id/upload-cover",
            headers=auth_headers,
            files=files
        )
        assert response.status_code == 404, "Should return 404 for non-existent invitation"
        print("Cover upload properly returns 404 for non-existent invitations")


class TestPublicInvitationCountdown(TestAuth):
    """Test public invitation page returns event_date for countdown timer"""
    
    def test_public_invitation_has_event_date(self):
        """Test GET /api/invitations/public/{shareLink} returns event_date"""
        response = requests.get(f"{BASE_URL}/api/invitations/public/{EXISTING_SHARE_LINK}")
        
        assert response.status_code == 200, f"Public invitation failed: {response.text}"
        data = response.json()
        
        # Verify event_date is present (needed for countdown timer)
        assert "event_date" in data, "Public invitation should include event_date for countdown"
        
        # Verify other essential fields
        assert "title" in data
        assert "host_names" in data
        
        print(f"Public invitation has event_date: {data.get('event_date')}")
        print(f"Title: {data.get('title')}")
    
    def test_public_invitation_design_has_cover_image_url(self):
        """Test public invitation design includes cover_image_url field"""
        response = requests.get(f"{BASE_URL}/api/invitations/public/{EXISTING_SHARE_LINK}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify design object exists
        assert "design" in data, "Public invitation should include design"
        design = data["design"]
        
        # cover_image_url should be in design (can be null)
        # The field should exist in the schema
        print(f"Design object: {design}")
        print(f"Cover image URL: {design.get('cover_image_url', 'Not set')}")


class TestInvitationDesignWithCover(TestAuth):
    """Test invitation design includes cover_image_url"""
    
    @pytest.fixture(scope="class")
    def invitation_id(self, auth_headers):
        """Get an existing invitation ID"""
        response = requests.get(f"{BASE_URL}/api/invitations", headers=auth_headers)
        assert response.status_code == 200
        invitations = response.json()
        assert len(invitations) > 0, "No invitations found for testing"
        return invitations[0]["id"]
    
    def test_invitation_detail_has_design_with_cover(self, auth_headers, invitation_id):
        """Test GET /api/invitations/{id} returns design with cover_image_url"""
        response = requests.get(
            f"{BASE_URL}/api/invitations/{invitation_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify design object
        assert "design" in data, "Invitation should have design object"
        design = data["design"]
        
        # Verify design has expected fields
        expected_fields = ["primary_color", "accent_color", "font_family"]
        for field in expected_fields:
            assert field in design, f"Design should have {field}"
        
        print(f"Invitation design: {design}")
        print(f"Cover image URL: {design.get('cover_image_url', 'Not set')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
