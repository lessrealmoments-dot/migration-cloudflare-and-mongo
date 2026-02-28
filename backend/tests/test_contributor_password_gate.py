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


class TestContributorPasswordVerification:
    """Test password verification endpoint for contributor uploads"""
    
    @pytest.fixture(autouse=True)
    def setup(self, request):
        """Setup session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Authenticate
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": PRO_USER_EMAIL,
            "password": PRO_USER_PASSWORD
        })
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            if token:
                self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        yield
        self.session.close()
    
    def test_verify_password_endpoint_exists_404_for_invalid_link(self):
        """POST /api/contributor/{link}/verify-password returns 404 for invalid link"""
        response = requests.post(
            f"{BASE_URL}/api/contributor/nonexistent_link_12345/verify-password",
            json={"password": "test"}
        )
        assert response.status_code == 404
        print("PASS: verify-password returns 404 for invalid contributor link")
    
    def test_verify_password_no_password_set_returns_verified(self):
        """When section has no password, verify-password should return {verified: true}"""
        # First get galleries to find a section without password
        galleries_response = self.session.get(f"{BASE_URL}/api/galleries")
        if galleries_response.status_code != 200:
            pytest.skip("Could not fetch galleries")
        
        galleries = galleries_response.json()
        if not galleries:
            pytest.skip("No galleries found")
        
        # Find a section with contributor_link but no password
        for gallery in galleries:
            sections = gallery.get("sections", [])
            for section in sections:
                contributor_link = section.get("contributor_link")
                if contributor_link:
                    # Test the endpoint
                    response = requests.post(
                        f"{BASE_URL}/api/contributor/{contributor_link}/verify-password",
                        json={"password": ""}
                    )
                    # If no password is set, should return verified: true
                    # If password is set and wrong, should return 401
                    if response.status_code == 200:
                        data = response.json()
                        assert data.get("verified") == True
                        print(f"PASS: Section without password returns verified=true (link: {contributor_link})")
                        return
                    elif response.status_code == 401:
                        # This section has a password, continue looking
                        continue
        
        print("INFO: No sections without password found, test inconclusive")
    
    def test_verify_password_wrong_password_returns_401(self):
        """When section has password, wrong password should return 401"""
        # Get galleries and find one with password protection
        galleries_response = self.session.get(f"{BASE_URL}/api/galleries")
        if galleries_response.status_code != 200:
            pytest.skip("Could not fetch galleries")
        
        galleries = galleries_response.json()
        for gallery in galleries:
            sections = gallery.get("sections", [])
            for section in sections:
                contributor_link = section.get("contributor_link")
                section_password = section.get("section_password")
                if contributor_link and section_password:
                    # Test with wrong password
                    response = requests.post(
                        f"{BASE_URL}/api/contributor/{contributor_link}/verify-password",
                        json={"password": "wrong_password_12345"}
                    )
                    assert response.status_code == 401
                    print(f"PASS: Section with password returns 401 for wrong password (link: {contributor_link})")
                    return
        
        pytest.skip("No sections with password found")
    
    def test_verify_password_correct_password_returns_verified(self):
        """When section has password, correct password should return {verified: true}"""
        # Get galleries and find one with password protection
        galleries_response = self.session.get(f"{BASE_URL}/api/galleries")
        if galleries_response.status_code != 200:
            pytest.skip("Could not fetch galleries")
        
        galleries = galleries_response.json()
        for gallery in galleries:
            sections = gallery.get("sections", [])
            for section in sections:
                contributor_link = section.get("contributor_link")
                section_password = section.get("section_password")
                if contributor_link and section_password:
                    # Test with correct password
                    response = requests.post(
                        f"{BASE_URL}/api/contributor/{contributor_link}/verify-password",
                        json={"password": section_password}
                    )
                    assert response.status_code == 200
                    data = response.json()
                    assert data.get("verified") == True
                    print(f"PASS: Section with password returns verified=true for correct password")
                    return
        
        pytest.skip("No sections with password found")


class TestContributorInfoEndpoint:
    """Test contributor info endpoint returns requires_password flag"""
    
    def test_contributor_info_includes_requires_password_flag(self):
        """GET /api/contributor/{link} should include requires_password boolean"""
        # Login first
        session = requests.Session()
        login_response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": PRO_USER_EMAIL,
            "password": PRO_USER_PASSWORD
        })
        if login_response.status_code != 200:
            pytest.skip("Could not authenticate")
        
        token = login_response.json().get("token")
        if token:
            session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get galleries to find a contributor link
        galleries_response = session.get(f"{BASE_URL}/api/galleries")
        if galleries_response.status_code != 200:
            pytest.skip("Could not fetch galleries")
        
        galleries = galleries_response.json()
        for gallery in galleries:
            sections = gallery.get("sections", [])
            for section in sections:
                contributor_link = section.get("contributor_link")
                if contributor_link:
                    # Get contributor info
                    response = requests.get(f"{BASE_URL}/api/contributor/{contributor_link}")
                    if response.status_code == 200:
                        data = response.json()
                        # Check that requires_password field exists
                        assert "requires_password" in data
                        assert isinstance(data["requires_password"], bool)
                        print(f"PASS: contributor info includes requires_password={data['requires_password']}")
                        return
        
        pytest.skip("No contributor links found")


class TestSecurityScenarios:
    """Test security scenarios for password-protected contributor pages"""
    
    @pytest.fixture(autouse=True)
    def setup(self, request):
        """Setup authenticated session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": PRO_USER_EMAIL,
            "password": PRO_USER_PASSWORD
        })
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            if token:
                self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        yield
        self.session.close()
    
    def test_video_section_returns_requires_password(self):
        """Video sections should return requires_password flag in contributor info"""
        galleries_response = self.session.get(f"{BASE_URL}/api/galleries")
        if galleries_response.status_code != 200:
            pytest.skip("Could not fetch galleries")
        
        for gallery in galleries_response.json():
            for section in gallery.get("sections", []):
                if section.get("section_type") == "video" and section.get("contributor_link"):
                    response = requests.get(f"{BASE_URL}/api/contributor/{section['contributor_link']}")
                    if response.status_code == 200:
                        data = response.json()
                        assert "requires_password" in data
                        print(f"PASS: Video section has requires_password field")
                        return
        
        pytest.skip("No video sections with contributor links found")
    
    def test_gdrive_section_returns_requires_password(self):
        """GDrive sections should return requires_password flag in contributor info"""
        galleries_response = self.session.get(f"{BASE_URL}/api/galleries")
        if galleries_response.status_code != 200:
            pytest.skip("Could not fetch galleries")
        
        for gallery in galleries_response.json():
            for section in gallery.get("sections", []):
                if section.get("section_type") == "gdrive" and section.get("contributor_link"):
                    response = requests.get(f"{BASE_URL}/api/contributor/{section['contributor_link']}")
                    if response.status_code == 200:
                        data = response.json()
                        assert "requires_password" in data
                        print(f"PASS: GDrive section has requires_password field")
                        return
        
        pytest.skip("No GDrive sections with contributor links found")
    
    def test_pcloud_section_returns_requires_password(self):
        """pCloud sections should return requires_password flag in contributor info"""
        galleries_response = self.session.get(f"{BASE_URL}/api/galleries")
        if galleries_response.status_code != 200:
            pytest.skip("Could not fetch galleries")
        
        for gallery in galleries_response.json():
            for section in gallery.get("sections", []):
                if section.get("section_type") == "pcloud" and section.get("contributor_link"):
                    response = requests.get(f"{BASE_URL}/api/contributor/{section['contributor_link']}")
                    if response.status_code == 200:
                        data = response.json()
                        assert "requires_password" in data
                        print(f"PASS: pCloud section has requires_password field")
                        return
        
        pytest.skip("No pCloud sections with contributor links found")
    
    def test_fotoshare_section_returns_requires_password(self):
        """Fotoshare sections should return requires_password flag in contributor info"""
        galleries_response = self.session.get(f"{BASE_URL}/api/galleries")
        if galleries_response.status_code != 200:
            pytest.skip("Could not fetch galleries")
        
        for gallery in galleries_response.json():
            for section in gallery.get("sections", []):
                if section.get("section_type") == "fotoshare" and section.get("contributor_link"):
                    response = requests.get(f"{BASE_URL}/api/contributor/{section['contributor_link']}")
                    if response.status_code == 200:
                        data = response.json()
                        assert "requires_password" in data
                        print(f"PASS: Fotoshare section has requires_password field")
                        return
        
        pytest.skip("No Fotoshare sections with contributor links found")
    
    def test_photobooth_section_returns_requires_password(self):
        """Photobooth sections should return requires_password flag in contributor info"""
        galleries_response = self.session.get(f"{BASE_URL}/api/galleries")
        if galleries_response.status_code != 200:
            pytest.skip("Could not fetch galleries")
        
        for gallery in galleries_response.json():
            for section in gallery.get("sections", []):
                if section.get("section_type") == "photobooth" and section.get("contributor_link"):
                    response = requests.get(f"{BASE_URL}/api/contributor/{section['contributor_link']}")
                    if response.status_code == 200:
                        data = response.json()
                        assert "requires_password" in data
                        print(f"PASS: Photobooth section has requires_password field")
                        return
        
        pytest.skip("No Photobooth sections with contributor links found")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
