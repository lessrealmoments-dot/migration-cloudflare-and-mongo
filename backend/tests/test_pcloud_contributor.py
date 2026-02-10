"""
Test pCloud Contributor Feature
- pCloud section creation with upload link (required) and viewing link (optional)
- Contributor link generation for pCloud sections (/p/ prefix)
- Contributor page access and submission
- Auto-sync tasks verification
- Public gallery contributors aggregation
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "lessrealmoments@gmail.com"
TEST_PASSWORD = "3tfL99B%u2qw"

# Test gallery ID from previous iteration
TEST_GALLERY_ID = "9c18f814-2d34-4009-9b68-e4bb181f2549"

# Public gallery share link for contributors test
PUBLIC_GALLERY_SHARE_LINK = "465f44a9"


class TestPcloudSectionCreation:
    """Test pCloud section creation with new workflow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup auth token for tests"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            token = response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Authentication failed")
    
    def test_create_pcloud_section_without_viewing_url(self):
        """Create pCloud section with only upload link (no viewing URL) - should succeed"""
        response = self.session.post(
            f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/pcloud-sections",
            json={
                "section_name": "TEST_Empty_pCloud_Section",
                "pcloud_upload_link": "https://u.pcloud.link/publink/upload?code=test123",
                "pcloud_url": None  # No viewing URL
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify section was created
        assert "section" in data
        assert data["section"]["name"] == "TEST_Empty_pCloud_Section"
        assert data["section"]["type"] == "pcloud"
        assert data["section"]["pcloud_code"] is None  # No viewing URL means no code
        assert data["section"]["pcloud_upload_link"] == "https://u.pcloud.link/publink/upload?code=test123"
        
        # Store section ID for cleanup
        self.created_section_id = data["section"]["id"]
        print(f"Created empty pCloud section: {self.created_section_id}")
    
    def test_create_pcloud_section_requires_name_when_no_url(self):
        """Creating pCloud section without viewing URL requires section name"""
        response = self.session.post(
            f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/pcloud-sections",
            json={
                "pcloud_upload_link": "https://u.pcloud.link/publink/upload?code=test456",
                "pcloud_url": None,
                "section_name": None  # No name
            }
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "Section name is required" in response.json().get("detail", "")
    
    def test_create_pcloud_section_with_both_links(self):
        """Create pCloud section with both upload and viewing links"""
        # Note: This test would require a valid pCloud viewing URL
        # For now, we test that the endpoint accepts both parameters
        response = self.session.post(
            f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/pcloud-sections",
            json={
                "section_name": "TEST_Full_pCloud_Section",
                "pcloud_upload_link": "https://u.pcloud.link/publink/upload?code=test789",
                "pcloud_url": "https://u.pcloud.link/publink/show?code=invalid"  # Invalid URL for test
            }
        )
        
        # Should fail because the viewing URL is invalid
        assert response.status_code == 400, f"Expected 400 for invalid URL, got {response.status_code}"


class TestPcloudContributorLink:
    """Test contributor link generation for pCloud sections"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup auth token and create test section"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            token = response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Authentication failed")
        
        # Create a test pCloud section
        response = self.session.post(
            f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/pcloud-sections",
            json={
                "section_name": "TEST_Contributor_pCloud",
                "pcloud_upload_link": "https://u.pcloud.link/publink/upload?code=contrib123",
                "pcloud_url": None
            }
        )
        if response.status_code == 200:
            self.test_section_id = response.json()["section"]["id"]
        else:
            pytest.skip("Failed to create test section")
        
        yield
        
        # Cleanup - delete test section
        self.session.delete(f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/sections/{self.test_section_id}")
    
    def test_generate_contributor_link_for_pcloud_section(self):
        """Generate contributor link for pCloud section"""
        response = self.session.post(
            f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/sections/{self.test_section_id}/contributor-link"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "contributor_link" in data
        assert len(data["contributor_link"]) > 10  # Should be a token
        assert data["section_id"] == self.test_section_id
        
        self.contributor_link = data["contributor_link"]
        print(f"Generated contributor link: {self.contributor_link}")
        
        # Verify the link works with /p/ prefix
        return self.contributor_link
    
    def test_access_pcloud_contributor_page(self):
        """Access pCloud contributor page at /p/{link}"""
        # First generate a contributor link
        gen_response = self.session.post(
            f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/sections/{self.test_section_id}/contributor-link"
        )
        assert gen_response.status_code == 200
        contributor_link = gen_response.json()["contributor_link"]
        
        # Access the contributor info endpoint
        response = requests.get(f"{BASE_URL}/api/contributor/{contributor_link}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify it's a pCloud section
        assert data["section_type"] == "pcloud"
        assert data["gallery_title"] is not None
        assert "pcloud_upload_link" in data
        
        print(f"Contributor page data: section_type={data['section_type']}, gallery={data['gallery_title']}")


class TestPcloudContributorSubmission:
    """Test pCloud contributor submission endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup auth token and create test section with contributor link"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            token = response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Authentication failed")
        
        # Create a test pCloud section
        response = self.session.post(
            f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/pcloud-sections",
            json={
                "section_name": "TEST_Submit_pCloud",
                "pcloud_upload_link": "https://u.pcloud.link/publink/upload?code=submit123",
                "pcloud_url": None
            }
        )
        if response.status_code == 200:
            self.test_section_id = response.json()["section"]["id"]
        else:
            pytest.skip("Failed to create test section")
        
        # Generate contributor link
        gen_response = self.session.post(
            f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/sections/{self.test_section_id}/contributor-link"
        )
        if gen_response.status_code == 200:
            self.contributor_link = gen_response.json()["contributor_link"]
        else:
            pytest.skip("Failed to generate contributor link")
        
        yield
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/sections/{self.test_section_id}")
    
    def test_submit_pcloud_requires_name(self):
        """Submitting pCloud viewing link requires contributor name"""
        response = requests.post(
            f"{BASE_URL}/api/contributor/{self.contributor_link}/pcloud",
            json={
                "company_name": "",  # Empty name
                "pcloud_viewing_url": "https://u.pcloud.link/publink/show?code=test"
            }
        )
        
        assert response.status_code == 400
        assert "name" in response.json().get("detail", "").lower()
    
    def test_submit_pcloud_requires_viewing_url(self):
        """Submitting pCloud requires viewing URL"""
        response = requests.post(
            f"{BASE_URL}/api/contributor/{self.contributor_link}/pcloud",
            json={
                "company_name": "Test Contributor",
                "pcloud_viewing_url": ""  # Empty URL
            }
        )
        
        assert response.status_code == 400
        assert "viewing link" in response.json().get("detail", "").lower()
    
    def test_submit_pcloud_validates_url_format(self):
        """Submitting pCloud validates URL format"""
        response = requests.post(
            f"{BASE_URL}/api/contributor/{self.contributor_link}/pcloud",
            json={
                "company_name": "Test Contributor",
                "pcloud_viewing_url": "https://invalid-url.com/not-pcloud"
            }
        )
        
        assert response.status_code == 400
        assert "invalid" in response.json().get("detail", "").lower()


class TestAutoSyncTasks:
    """Test auto-sync background tasks for Google Drive and pCloud"""
    
    def test_backend_logs_show_autosync_started(self):
        """Verify auto-sync tasks are started in backend logs"""
        import subprocess
        
        result = subprocess.run(
            ["tail", "-n", "100", "/var/log/supervisor/backend.err.log"],
            capture_output=True,
            text=True
        )
        
        logs = result.stdout
        
        # Check for Google Drive auto-sync
        assert "Google Drive auto-sync task started" in logs, "Google Drive auto-sync task not found in logs"
        
        # Check for pCloud auto-sync
        assert "pCloud auto-sync task started" in logs, "pCloud auto-sync task not found in logs"
        
        print("Both auto-sync tasks confirmed running in backend logs")


class TestPublicGalleryContributors:
    """Test public gallery shows contributors from all section types"""
    
    def test_public_gallery_has_contributors_field(self):
        """Public gallery response includes contributors array"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/{PUBLIC_GALLERY_SHARE_LINK}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify contributors field exists
        assert "contributors" in data, "contributors field missing from public gallery response"
        assert isinstance(data["contributors"], list), "contributors should be a list"
        
        # Should have at least the gallery owner
        assert len(data["contributors"]) >= 1, "Should have at least one contributor (owner)"
        
        # First contributor should be the owner
        owner = data["contributors"][0]
        assert owner.get("is_owner") == True, "First contributor should be the owner"
        
        print(f"Public gallery has {len(data['contributors'])} contributors")
        for c in data["contributors"]:
            print(f"  - {c.get('name')}: {c.get('role')} (owner={c.get('is_owner')})")
    
    def test_public_gallery_contributors_structure(self):
        """Verify contributor structure has name, role, is_owner"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/{PUBLIC_GALLERY_SHARE_LINK}")
        
        assert response.status_code == 200
        data = response.json()
        
        for contributor in data.get("contributors", []):
            assert "name" in contributor, "Contributor missing 'name' field"
            assert "role" in contributor, "Contributor missing 'role' field"
            assert "is_owner" in contributor, "Contributor missing 'is_owner' field"


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            token = response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_cleanup_test_sections(self):
        """Clean up any TEST_ prefixed sections"""
        # Get gallery sections
        response = self.session.get(f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/sections")
        
        if response.status_code == 200:
            sections = response.json()
            for section in sections:
                if section.get("name", "").startswith("TEST_"):
                    delete_response = self.session.delete(
                        f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/sections/{section['id']}"
                    )
                    print(f"Deleted test section: {section['name']} - {delete_response.status_code}")
        
        print("Cleanup completed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
