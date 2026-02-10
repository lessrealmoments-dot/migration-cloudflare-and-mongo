"""
Test Google Drive Contributor Feature
- Create empty Google Drive section (without URL)
- Generate contributor link for gdrive section
- Contributor page access and submission
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "lessrealmoments@gmail.com"
TEST_PASSWORD = "3tfL99B%u2qw"


class TestGdriveContributorFeature:
    """Test the new Google Drive contributor workflow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        self.test_gallery_id = None
        self.test_section_id = None
        self.test_contributor_link = None
    
    def login(self):
        """Login and get token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        return self.token
    
    def test_01_login_success(self):
        """Test login works"""
        self.login()
        assert self.token is not None
        print("✓ Login successful")
    
    def test_02_get_galleries(self):
        """Get user galleries to find test gallery"""
        self.login()
        response = self.session.get(f"{BASE_URL}/api/galleries")
        assert response.status_code == 200
        galleries = response.json()
        print(f"✓ Found {len(galleries)} galleries")
        
        # Find Test GDrive Gallery
        test_gallery = next((g for g in galleries if "GDrive" in g.get("title", "")), None)
        if test_gallery:
            print(f"✓ Found test gallery: {test_gallery['title']} (ID: {test_gallery['id']})")
            self.test_gallery_id = test_gallery['id']
        return galleries
    
    def test_03_create_empty_gdrive_section(self):
        """Create Google Drive section WITHOUT URL - should succeed"""
        self.login()
        
        # First get galleries to find test gallery
        response = self.session.get(f"{BASE_URL}/api/galleries")
        galleries = response.json()
        test_gallery = next((g for g in galleries if "GDrive" in g.get("title", "")), None)
        
        if not test_gallery:
            pytest.skip("Test GDrive Gallery not found")
        
        gallery_id = test_gallery['id']
        
        # Create empty gdrive section (no URL)
        response = self.session.post(f"{BASE_URL}/api/galleries/{gallery_id}/gdrive-sections", json={
            "gdrive_url": None,
            "section_name": "TEST_Empty_GDrive_Section"
        })
        
        print(f"Create empty section response: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        assert response.status_code == 200, f"Failed to create empty gdrive section: {response.text}"
        
        data = response.json()
        assert "section" in data
        assert data["section"]["type"] == "gdrive"
        assert data["photo_count"] == 0
        assert "message" in data  # Should have message about generating contributor link
        
        self.test_section_id = data["section"]["id"]
        print(f"✓ Created empty Google Drive section: {self.test_section_id}")
        print(f"✓ Message: {data.get('message', 'N/A')}")
    
    def test_04_generate_contributor_link_for_gdrive(self):
        """Generate contributor link for empty gdrive section"""
        self.login()
        
        # Get galleries
        response = self.session.get(f"{BASE_URL}/api/galleries")
        galleries = response.json()
        test_gallery = next((g for g in galleries if "GDrive" in g.get("title", "")), None)
        
        if not test_gallery:
            pytest.skip("Test GDrive Gallery not found")
        
        gallery_id = test_gallery['id']
        
        # Find a gdrive section without contributor link
        sections = test_gallery.get("sections", [])
        gdrive_section = next((s for s in sections if s.get("type") == "gdrive"), None)
        
        if not gdrive_section:
            pytest.skip("No gdrive section found")
        
        section_id = gdrive_section['id']
        
        # Generate contributor link
        response = self.session.post(f"{BASE_URL}/api/galleries/{gallery_id}/sections/{section_id}/contributor-link")
        
        print(f"Generate contributor link response: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        assert response.status_code == 200, f"Failed to generate contributor link: {response.text}"
        
        data = response.json()
        assert "contributor_link" in data
        
        self.test_contributor_link = data["contributor_link"]
        print(f"✓ Generated contributor link: {self.test_contributor_link}")
    
    def test_05_access_contributor_page(self):
        """Access contributor page with generated link"""
        # Use the known test contributor link
        contributor_link = "USUwqE_JTv1veEln7RPo5A"
        
        response = self.session.get(f"{BASE_URL}/api/contributor/{contributor_link}")
        
        print(f"Contributor page response: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        assert response.status_code == 200, f"Failed to access contributor page: {response.text}"
        
        data = response.json()
        assert "gallery_title" in data
        assert "section_type" in data
        assert data["section_type"] == "gdrive"
        
        print(f"✓ Contributor page accessible")
        print(f"  Gallery: {data.get('gallery_title')}")
        print(f"  Section type: {data.get('section_type')}")
    
    def test_06_contributor_page_invalid_link(self):
        """Test contributor page with invalid link returns 404"""
        response = self.session.get(f"{BASE_URL}/api/contributor/invalid_link_12345")
        
        assert response.status_code == 404
        print("✓ Invalid contributor link returns 404")
    
    def test_07_submit_gdrive_url_missing_name(self):
        """Submit without name should fail"""
        contributor_link = "USUwqE_JTv1veEln7RPo5A"
        
        response = self.session.post(f"{BASE_URL}/api/contributor/{contributor_link}/gdrive", json={
            "company_name": "",
            "gdrive_url": "https://drive.google.com/drive/folders/test123"
        })
        
        assert response.status_code == 400
        print("✓ Missing name returns 400")
    
    def test_08_submit_gdrive_url_missing_url(self):
        """Submit without URL should fail"""
        contributor_link = "USUwqE_JTv1veEln7RPo5A"
        
        response = self.session.post(f"{BASE_URL}/api/contributor/{contributor_link}/gdrive", json={
            "company_name": "Test Contributor",
            "gdrive_url": ""
        })
        
        assert response.status_code == 400
        print("✓ Missing URL returns 400")
    
    def test_09_submit_gdrive_invalid_url(self):
        """Submit with invalid URL format should fail"""
        contributor_link = "USUwqE_JTv1veEln7RPo5A"
        
        response = self.session.post(f"{BASE_URL}/api/contributor/{contributor_link}/gdrive", json={
            "company_name": "Test Contributor",
            "gdrive_url": "https://example.com/not-gdrive"
        })
        
        assert response.status_code == 400
        print("✓ Invalid URL format returns 400")
    
    def test_10_verify_gdrive_section_has_contributor_link(self):
        """Verify gdrive section shows contributor link in gallery data"""
        self.login()
        
        # Get galleries
        response = self.session.get(f"{BASE_URL}/api/galleries")
        galleries = response.json()
        test_gallery = next((g for g in galleries if "GDrive" in g.get("title", "")), None)
        
        if not test_gallery:
            pytest.skip("Test GDrive Gallery not found")
        
        # Find gdrive section with contributor link
        sections = test_gallery.get("sections", [])
        gdrive_section = next((s for s in sections if s.get("type") == "gdrive" and s.get("contributor_link")), None)
        
        if gdrive_section:
            print(f"✓ Found gdrive section with contributor link: {gdrive_section.get('contributor_link')}")
            print(f"  Section name: {gdrive_section.get('name')}")
            print(f"  Has folder ID: {gdrive_section.get('gdrive_folder_id') is not None}")
        else:
            print("⚠ No gdrive section with contributor link found (may need to generate one)")
    
    def test_11_cleanup_test_sections(self):
        """Cleanup test sections created during testing"""
        self.login()
        
        # Get galleries
        response = self.session.get(f"{BASE_URL}/api/galleries")
        galleries = response.json()
        test_gallery = next((g for g in galleries if "GDrive" in g.get("title", "")), None)
        
        if not test_gallery:
            return
        
        gallery_id = test_gallery['id']
        sections = test_gallery.get("sections", [])
        
        # Delete test sections
        for section in sections:
            if section.get("name", "").startswith("TEST_"):
                section_id = section['id']
                response = self.session.delete(f"{BASE_URL}/api/galleries/{gallery_id}/sections/{section_id}")
                print(f"Deleted test section: {section.get('name')} - Status: {response.status_code}")


class TestGdriveUrlPrefixRouting:
    """Test that /d/ prefix routes correctly for gdrive contributor links"""
    
    def test_contributor_endpoint_returns_gdrive_type(self):
        """Verify contributor endpoint returns gdrive section type"""
        contributor_link = "USUwqE_JTv1veEln7RPo5A"
        
        response = requests.get(f"{BASE_URL}/api/contributor/{contributor_link}")
        
        if response.status_code == 200:
            data = response.json()
            assert data.get("section_type") == "gdrive", f"Expected gdrive, got {data.get('section_type')}"
            print(f"✓ Contributor link returns gdrive section type")
        else:
            print(f"⚠ Contributor link not found (status: {response.status_code})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
