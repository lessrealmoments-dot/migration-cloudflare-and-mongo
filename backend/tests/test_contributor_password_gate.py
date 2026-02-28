"""
Tests for P0 Security Fix: Contributor Upload Password Gate
Tests the /api/contributor/{link}/verify-password endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
PRO_USER_EMAIL = "lessrealmoments@gmail.com"
PRO_USER_PASSWORD = "3tfL99B%u2qw"

# Test data - password protected sections created during testing
TEST_SECTIONS = {
    "video": {"link": "DaNk7W_DAeo21JuWPf9SJw", "password": "testpass123"},
    "gdrive": {"link": "_FOm1ON3Ce5lX5FDLIJPcQ", "password": "gdrivepass1"},
    "pcloud": {"link": "wW3WUC_I20biyYReXFZsFQ", "password": "pcloudpass1"},
    "fotoshare": {"link": "KJXxHvLfnSXHgeNcNwoVmg", "password": "fotosharepass1"},
    "photobooth": {"link": "0ugnrKPpGqOAHDIZuTmF9Q", "password": "photoboothpass1"}
}

# Sections without password
OPEN_SECTIONS = {
    "video": "a1EuNPclb_k",
    "gdrive": "PDUAgAaexx8",
    "pcloud": "iCx2vJ9Oka0",
    "fotoshare": "MCKb_qxQToc"
}


class TestPasswordVerificationEndpoint:
    """Test /api/contributor/{link}/verify-password endpoint"""
    
    def test_invalid_link_returns_404(self):
        """POST verify-password with invalid link returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/contributor/nonexistent_link_12345/verify-password",
            json={"password": "test"}
        )
        assert response.status_code == 404
        print("PASS: verify-password returns 404 for invalid contributor link")
    
    def test_open_section_returns_verified(self):
        """Section without password returns {verified: true}"""
        link = OPEN_SECTIONS["video"]
        response = requests.post(
            f"{BASE_URL}/api/contributor/{link}/verify-password",
            json={"password": ""}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("verified") == True
        print(f"PASS: Open section returns verified=true")
    
    def test_protected_section_wrong_password_returns_401(self):
        """Section with password returns 401 for wrong password"""
        link = TEST_SECTIONS["video"]["link"]
        response = requests.post(
            f"{BASE_URL}/api/contributor/{link}/verify-password",
            json={"password": "wrong_password"}
        )
        assert response.status_code == 401
        print(f"PASS: Protected section returns 401 for wrong password")
    
    def test_protected_section_correct_password_returns_verified(self):
        """Section with password returns {verified: true} for correct password"""
        link = TEST_SECTIONS["video"]["link"]
        password = TEST_SECTIONS["video"]["password"]
        response = requests.post(
            f"{BASE_URL}/api/contributor/{link}/verify-password",
            json={"password": password}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("verified") == True
        print(f"PASS: Protected section returns verified=true for correct password")


class TestContributorInfoRequiresPassword:
    """Test that GET /api/contributor/{link} returns requires_password flag"""
    
    def test_video_section_has_requires_password_true(self):
        """Video section with password has requires_password=true"""
        link = TEST_SECTIONS["video"]["link"]
        response = requests.get(f"{BASE_URL}/api/contributor/{link}")
        assert response.status_code == 200
        data = response.json()
        assert data.get("requires_password") == True
        assert data.get("section_type") == "video"
        print(f"PASS: Video section has requires_password=true")
    
    def test_gdrive_section_has_requires_password_true(self):
        """GDrive section with password has requires_password=true"""
        link = TEST_SECTIONS["gdrive"]["link"]
        response = requests.get(f"{BASE_URL}/api/contributor/{link}")
        assert response.status_code == 200
        data = response.json()
        assert data.get("requires_password") == True
        assert data.get("section_type") == "gdrive"
        print(f"PASS: GDrive section has requires_password=true")
    
    def test_pcloud_section_has_requires_password_true(self):
        """pCloud section with password has requires_password=true"""
        link = TEST_SECTIONS["pcloud"]["link"]
        response = requests.get(f"{BASE_URL}/api/contributor/{link}")
        assert response.status_code == 200
        data = response.json()
        assert data.get("requires_password") == True
        assert data.get("section_type") == "pcloud"
        print(f"PASS: pCloud section has requires_password=true")
    
    def test_fotoshare_section_has_requires_password_true(self):
        """Fotoshare section with password has requires_password=true"""
        link = TEST_SECTIONS["fotoshare"]["link"]
        response = requests.get(f"{BASE_URL}/api/contributor/{link}")
        assert response.status_code == 200
        data = response.json()
        assert data.get("requires_password") == True
        assert data.get("section_type") == "fotoshare"
        print(f"PASS: Fotoshare section has requires_password=true")
    
    def test_photobooth_section_has_requires_password_true(self):
        """Photobooth section with password has requires_password=true"""
        link = TEST_SECTIONS["photobooth"]["link"]
        response = requests.get(f"{BASE_URL}/api/contributor/{link}")
        assert response.status_code == 200
        data = response.json()
        assert data.get("requires_password") == True
        assert data.get("section_type") == "fotoshare_photobooth"
        print(f"PASS: Photobooth section has requires_password=true")


class TestOpenSectionsNoPassword:
    """Test that sections without password have requires_password=false"""
    
    def test_open_video_section_has_requires_password_false(self):
        """Video section without password has requires_password=false"""
        link = OPEN_SECTIONS["video"]
        response = requests.get(f"{BASE_URL}/api/contributor/{link}")
        assert response.status_code == 200
        data = response.json()
        assert data.get("requires_password") == False
        print(f"PASS: Open video section has requires_password=false")
    
    def test_open_gdrive_section_has_requires_password_false(self):
        """GDrive section without password has requires_password=false"""
        link = OPEN_SECTIONS["gdrive"]
        response = requests.get(f"{BASE_URL}/api/contributor/{link}")
        assert response.status_code == 200
        data = response.json()
        assert data.get("requires_password") == False
        print(f"PASS: Open gdrive section has requires_password=false")
    
    def test_open_pcloud_section_has_requires_password_false(self):
        """pCloud section without password has requires_password=false"""
        link = OPEN_SECTIONS["pcloud"]
        response = requests.get(f"{BASE_URL}/api/contributor/{link}")
        assert response.status_code == 200
        data = response.json()
        assert data.get("requires_password") == False
        print(f"PASS: Open pcloud section has requires_password=false")
    
    def test_open_fotoshare_section_has_requires_password_false(self):
        """Fotoshare section without password has requires_password=false"""
        link = OPEN_SECTIONS["fotoshare"]
        response = requests.get(f"{BASE_URL}/api/contributor/{link}")
        assert response.status_code == 200
        data = response.json()
        assert data.get("requires_password") == False
        print(f"PASS: Open fotoshare section has requires_password=false")


class TestAllSectionTypesPasswordVerification:
    """Test password verification works for all section types"""
    
    def test_video_section_password_verification(self):
        """Video section password verification"""
        section = TEST_SECTIONS["video"]
        # Wrong password
        resp = requests.post(
            f"{BASE_URL}/api/contributor/{section['link']}/verify-password",
            json={"password": "wrong"}
        )
        assert resp.status_code == 401
        # Correct password
        resp = requests.post(
            f"{BASE_URL}/api/contributor/{section['link']}/verify-password",
            json={"password": section['password']}
        )
        assert resp.status_code == 200
        assert resp.json().get("verified") == True
        print("PASS: Video section password verification works")
    
    def test_gdrive_section_password_verification(self):
        """GDrive section password verification"""
        section = TEST_SECTIONS["gdrive"]
        # Wrong password
        resp = requests.post(
            f"{BASE_URL}/api/contributor/{section['link']}/verify-password",
            json={"password": "wrong"}
        )
        assert resp.status_code == 401
        # Correct password
        resp = requests.post(
            f"{BASE_URL}/api/contributor/{section['link']}/verify-password",
            json={"password": section['password']}
        )
        assert resp.status_code == 200
        assert resp.json().get("verified") == True
        print("PASS: GDrive section password verification works")
    
    def test_pcloud_section_password_verification(self):
        """pCloud section password verification"""
        section = TEST_SECTIONS["pcloud"]
        # Wrong password
        resp = requests.post(
            f"{BASE_URL}/api/contributor/{section['link']}/verify-password",
            json={"password": "wrong"}
        )
        assert resp.status_code == 401
        # Correct password
        resp = requests.post(
            f"{BASE_URL}/api/contributor/{section['link']}/verify-password",
            json={"password": section['password']}
        )
        assert resp.status_code == 200
        assert resp.json().get("verified") == True
        print("PASS: pCloud section password verification works")
    
    def test_fotoshare_section_password_verification(self):
        """Fotoshare section password verification"""
        section = TEST_SECTIONS["fotoshare"]
        # Wrong password
        resp = requests.post(
            f"{BASE_URL}/api/contributor/{section['link']}/verify-password",
            json={"password": "wrong"}
        )
        assert resp.status_code == 401
        # Correct password
        resp = requests.post(
            f"{BASE_URL}/api/contributor/{section['link']}/verify-password",
            json={"password": section['password']}
        )
        assert resp.status_code == 200
        assert resp.json().get("verified") == True
        print("PASS: Fotoshare section password verification works")
    
    def test_photobooth_section_password_verification(self):
        """Photobooth section password verification"""
        section = TEST_SECTIONS["photobooth"]
        # Wrong password
        resp = requests.post(
            f"{BASE_URL}/api/contributor/{section['link']}/verify-password",
            json={"password": "wrong"}
        )
        assert resp.status_code == 401
        # Correct password
        resp = requests.post(
            f"{BASE_URL}/api/contributor/{section['link']}/verify-password",
            json={"password": section['password']}
        )
        assert resp.status_code == 200
        assert resp.json().get("verified") == True
        print("PASS: Photobooth section password verification works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
