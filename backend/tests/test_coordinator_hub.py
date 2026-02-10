"""
Test Coordinator Hub Feature
- POST /api/galleries/{id}/coordinator-link - Generate coordinator hub link
- GET /api/coordinator-hub/{link} - Get coordinator hub data
- Role confirmation on contributor upload pages
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCoordinatorHub:
    """Test Coordinator Hub endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test credentials and login"""
        self.email = "lessrealmoments@gmail.com"
        self.password = "3tfL99B%u2qw"
        self.token = None
        self.gallery_id = None
        
        # Login to get token
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": self.email,
            "password": self.password
        })
        if response.status_code == 200:
            self.token = response.json().get("token")
        else:
            pytest.skip(f"Login failed: {response.status_code}")
    
    def test_login_success(self):
        """Test that login works with provided credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": self.email,
            "password": self.password
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data
        print(f"✓ Login successful, token received")
    
    def test_get_galleries(self):
        """Test getting user galleries to find one for testing"""
        response = requests.get(f"{BASE_URL}/api/galleries", headers={
            "Authorization": f"Bearer {self.token}"
        })
        assert response.status_code == 200, f"Failed to get galleries: {response.text}"
        galleries = response.json()
        assert isinstance(galleries, list)
        print(f"✓ Found {len(galleries)} galleries")
        
        if len(galleries) > 0:
            self.gallery_id = galleries[0]["id"]
            print(f"✓ Using gallery: {galleries[0].get('title', 'Unknown')} (ID: {self.gallery_id})")
        return galleries
    
    def test_generate_coordinator_link(self):
        """Test generating coordinator hub link for a gallery"""
        # First get a gallery
        galleries = self.test_get_galleries()
        if not galleries:
            pytest.skip("No galleries found to test")
        
        gallery_id = galleries[0]["id"]
        
        # Generate coordinator link
        response = requests.post(
            f"{BASE_URL}/api/galleries/{gallery_id}/coordinator-link",
            headers={"Authorization": f"Bearer {self.token}"}
        )
        
        assert response.status_code == 200, f"Failed to generate coordinator link: {response.text}"
        data = response.json()
        
        assert "coordinator_hub_link" in data, "Response missing coordinator_hub_link"
        assert "gallery_id" in data, "Response missing gallery_id"
        assert data["gallery_id"] == gallery_id
        
        print(f"✓ Coordinator hub link generated: {data['coordinator_hub_link']}")
        return data["coordinator_hub_link"]
    
    def test_get_coordinator_hub_data(self):
        """Test getting coordinator hub data via the public endpoint"""
        # First generate a link
        hub_link = self.test_generate_coordinator_link()
        
        # Get hub data (public endpoint - no auth needed)
        response = requests.get(f"{BASE_URL}/api/coordinator-hub/{hub_link}")
        
        assert response.status_code == 200, f"Failed to get coordinator hub data: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "gallery_id" in data, "Response missing gallery_id"
        assert "gallery_title" in data, "Response missing gallery_title"
        assert "photographer_name" in data, "Response missing photographer_name"
        assert "sections" in data, "Response missing sections"
        assert isinstance(data["sections"], list), "sections should be a list"
        
        print(f"✓ Coordinator hub data retrieved:")
        print(f"  - Gallery: {data.get('gallery_title')}")
        print(f"  - Photographer: {data.get('photographer_name')}")
        print(f"  - Sections: {len(data.get('sections', []))}")
        
        # Verify section structure if sections exist
        for section in data.get("sections", []):
            assert "id" in section, "Section missing id"
            assert "name" in section, "Section missing name"
            assert "type" in section, "Section missing type"
            assert "status" in section, "Section missing status"
            assert "link_prefix" in section, "Section missing link_prefix"
            assert "role_label" in section, "Section missing role_label"
            print(f"  - Section: {section.get('name')} ({section.get('type')}) - {section.get('status')}")
        
        return data
    
    def test_invalid_coordinator_hub_link(self):
        """Test that invalid coordinator hub link returns 404"""
        response = requests.get(f"{BASE_URL}/api/coordinator-hub/invalid-link-12345")
        assert response.status_code == 404, f"Expected 404 for invalid link, got {response.status_code}"
        print("✓ Invalid coordinator hub link correctly returns 404")
    
    def test_contributor_endpoint_returns_section_type(self):
        """Test that contributor endpoint returns section_type for role confirmation"""
        # Get galleries and find one with sections
        galleries = self.test_get_galleries()
        if not galleries:
            pytest.skip("No galleries found")
        
        # Find a gallery with sections that have contributor links
        for gallery in galleries:
            gallery_id = gallery["id"]
            sections_response = requests.get(
                f"{BASE_URL}/api/galleries/{gallery_id}/sections",
                headers={"Authorization": f"Bearer {self.token}"}
            )
            if sections_response.status_code == 200:
                sections = sections_response.json()
                for section in sections:
                    if section.get("contributor_link"):
                        # Test the contributor endpoint
                        contributor_link = section["contributor_link"]
                        response = requests.get(f"{BASE_URL}/api/contributor/{contributor_link}")
                        
                        if response.status_code == 200:
                            data = response.json()
                            assert "section_type" in data, "Contributor endpoint missing section_type"
                            assert "section_name" in data, "Contributor endpoint missing section_name"
                            assert "gallery_title" in data, "Contributor endpoint missing gallery_title"
                            print(f"✓ Contributor endpoint returns section_type: {data.get('section_type')}")
                            print(f"  - Section: {data.get('section_name')}")
                            return
        
        print("⚠ No sections with contributor links found to test")


class TestContributorUploadPages:
    """Test contributor upload page endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test credentials"""
        self.email = "lessrealmoments@gmail.com"
        self.password = "3tfL99B%u2qw"
        
        # Login
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": self.email,
            "password": self.password
        })
        if response.status_code == 200:
            self.token = response.json().get("token")
        else:
            pytest.skip("Login failed")
    
    def test_contributor_endpoint_structure(self):
        """Test that contributor endpoint returns expected structure for role confirmation"""
        # Get galleries
        response = requests.get(f"{BASE_URL}/api/galleries", headers={
            "Authorization": f"Bearer {self.token}"
        })
        
        if response.status_code != 200:
            pytest.skip("Could not get galleries")
        
        galleries = response.json()
        
        # Find any contributor link
        for gallery in galleries:
            sections_response = requests.get(
                f"{BASE_URL}/api/galleries/{gallery['id']}/sections",
                headers={"Authorization": f"Bearer {self.token}"}
            )
            
            if sections_response.status_code == 200:
                sections = sections_response.json()
                for section in sections:
                    if section.get("contributor_link"):
                        # Test the endpoint
                        link = section["contributor_link"]
                        resp = requests.get(f"{BASE_URL}/api/contributor/{link}")
                        
                        if resp.status_code == 200:
                            data = resp.json()
                            # Verify fields needed for role confirmation
                            required_fields = ["section_type", "section_name", "gallery_title", "photographer_name"]
                            for field in required_fields:
                                assert field in data, f"Missing field: {field}"
                            
                            print(f"✓ Contributor endpoint has all required fields for role confirmation")
                            print(f"  - section_type: {data.get('section_type')}")
                            print(f"  - section_name: {data.get('section_name')}")
                            return
        
        print("⚠ No contributor links found to test")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
