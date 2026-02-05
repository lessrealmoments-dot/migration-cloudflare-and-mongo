"""
Test Collage Preset Builder APIs
Tests for admin collage preset CRUD operations and photographer preset selection
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from review request
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "Aa@58798546521325"
PHOTOGRAPHER_EMAIL = "tester1@gmail.com"
PHOTOGRAPHER_PASSWORD = "123"


class TestAdminCollagePresets:
    """Test admin collage preset CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup admin token for tests"""
        self.admin_token = None
        self.created_preset_ids = []
        
        # Login as admin
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            self.admin_token = response.json().get("access_token")
        
        yield
        
        # Cleanup: Delete created presets
        if self.admin_token:
            for preset_id in self.created_preset_ids:
                try:
                    requests.delete(
                        f"{BASE_URL}/api/admin/collage-presets/{preset_id}",
                        headers={"Authorization": f"Bearer {self.admin_token}"}
                    )
                except:
                    pass
    
    def test_admin_login(self):
        """Test admin login works"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data.get("is_admin") == True
        print("✓ Admin login successful")
    
    def test_get_collage_presets_list(self):
        """Test fetching list of collage presets"""
        if not self.admin_token:
            pytest.skip("Admin login failed")
        
        response = requests.get(
            f"{BASE_URL}/api/admin/collage-presets",
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        assert response.status_code == 200, f"Failed to get presets: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} collage presets")
    
    def test_create_collage_preset_landscape(self):
        """Test creating a preset with landscape (3:2) placeholder"""
        if not self.admin_token:
            pytest.skip("Admin login failed")
        
        preset_data = {
            "name": f"TEST_Landscape_Preset_{uuid.uuid4().hex[:6]}",
            "description": "Test preset with landscape placeholder",
            "tags": ["test", "landscape"],
            "placeholders": [
                {
                    "id": "ph1",
                    "x": 5,
                    "y": 5,
                    "width": 25,
                    "height": 29.63,  # 3:2 ratio on 16:9 canvas
                    "ratio": "3:2",
                    "z_index": 0
                }
            ],
            "settings": {
                "gap": 3,
                "border_thickness": 0,
                "border_color": "#000000",
                "border_opacity": 1.0,
                "background_color": "#000000"
            },
            "is_default": False
        }
        
        response = requests.post(
            f"{BASE_URL}/api/admin/collage-presets",
            headers={
                "Authorization": f"Bearer {self.admin_token}",
                "Content-Type": "application/json"
            },
            json=preset_data
        )
        assert response.status_code == 200, f"Failed to create preset: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert data["name"] == preset_data["name"]
        assert len(data["placeholders"]) == 1
        assert data["placeholders"][0]["ratio"] == "3:2"
        
        self.created_preset_ids.append(data["id"])
        print(f"✓ Created landscape preset: {data['id']}")
        return data["id"]
    
    def test_create_collage_preset_portrait(self):
        """Test creating a preset with portrait (2:3) placeholder"""
        if not self.admin_token:
            pytest.skip("Admin login failed")
        
        preset_data = {
            "name": f"TEST_Portrait_Preset_{uuid.uuid4().hex[:6]}",
            "description": "Test preset with portrait placeholder",
            "tags": ["test", "portrait"],
            "placeholders": [
                {
                    "id": "ph1",
                    "x": 10,
                    "y": 5,
                    "width": 11.85,  # 2:3 ratio on 16:9 canvas
                    "height": 40,
                    "ratio": "2:3",
                    "z_index": 0
                }
            ],
            "settings": {
                "gap": 3,
                "border_thickness": 0,
                "border_color": "#000000",
                "border_opacity": 1.0,
                "background_color": "#000000"
            },
            "is_default": False
        }
        
        response = requests.post(
            f"{BASE_URL}/api/admin/collage-presets",
            headers={
                "Authorization": f"Bearer {self.admin_token}",
                "Content-Type": "application/json"
            },
            json=preset_data
        )
        assert response.status_code == 200, f"Failed to create preset: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert data["placeholders"][0]["ratio"] == "2:3"
        
        self.created_preset_ids.append(data["id"])
        print(f"✓ Created portrait preset: {data['id']}")
        return data["id"]
    
    def test_create_collage_preset_square(self):
        """Test creating a preset with square (1:1) placeholder"""
        if not self.admin_token:
            pytest.skip("Admin login failed")
        
        preset_data = {
            "name": f"TEST_Square_Preset_{uuid.uuid4().hex[:6]}",
            "description": "Test preset with square placeholder",
            "tags": ["test", "square"],
            "placeholders": [
                {
                    "id": "ph1",
                    "x": 10,
                    "y": 10,
                    "width": 20,
                    "height": 35.56,  # 1:1 ratio on 16:9 canvas (20 * 16/9)
                    "ratio": "1:1",
                    "z_index": 0
                }
            ],
            "settings": {
                "gap": 3,
                "border_thickness": 0,
                "border_color": "#000000",
                "border_opacity": 1.0,
                "background_color": "#000000"
            },
            "is_default": False
        }
        
        response = requests.post(
            f"{BASE_URL}/api/admin/collage-presets",
            headers={
                "Authorization": f"Bearer {self.admin_token}",
                "Content-Type": "application/json"
            },
            json=preset_data
        )
        assert response.status_code == 200, f"Failed to create preset: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert data["placeholders"][0]["ratio"] == "1:1"
        
        self.created_preset_ids.append(data["id"])
        print(f"✓ Created square preset: {data['id']}")
        return data["id"]
    
    def test_update_collage_preset(self):
        """Test updating a collage preset"""
        if not self.admin_token:
            pytest.skip("Admin login failed")
        
        # First create a preset
        preset_data = {
            "name": f"TEST_Update_Preset_{uuid.uuid4().hex[:6]}",
            "description": "Original description",
            "tags": ["test"],
            "placeholders": [
                {"id": "ph1", "x": 5, "y": 5, "width": 20, "height": 30, "ratio": "3:2", "z_index": 0}
            ],
            "settings": {"gap": 3, "border_thickness": 0, "border_color": "#000000", "border_opacity": 1.0, "background_color": "#000000"},
            "is_default": False
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/admin/collage-presets",
            headers={"Authorization": f"Bearer {self.admin_token}", "Content-Type": "application/json"},
            json=preset_data
        )
        assert create_response.status_code == 200
        preset_id = create_response.json()["id"]
        self.created_preset_ids.append(preset_id)
        
        # Update the preset
        update_data = {
            "name": "TEST_Updated_Preset_Name",
            "description": "Updated description"
        }
        
        update_response = requests.put(
            f"{BASE_URL}/api/admin/collage-presets/{preset_id}",
            headers={"Authorization": f"Bearer {self.admin_token}", "Content-Type": "application/json"},
            json=update_data
        )
        assert update_response.status_code == 200, f"Failed to update preset: {update_response.text}"
        
        updated = update_response.json()
        assert updated["name"] == "TEST_Updated_Preset_Name"
        assert updated["description"] == "Updated description"
        print(f"✓ Updated preset: {preset_id}")
    
    def test_delete_collage_preset(self):
        """Test deleting a collage preset"""
        if not self.admin_token:
            pytest.skip("Admin login failed")
        
        # First create a preset
        preset_data = {
            "name": f"TEST_Delete_Preset_{uuid.uuid4().hex[:6]}",
            "description": "To be deleted",
            "tags": ["test"],
            "placeholders": [
                {"id": "ph1", "x": 5, "y": 5, "width": 20, "height": 30, "ratio": "3:2", "z_index": 0}
            ],
            "settings": {"gap": 3, "border_thickness": 0, "border_color": "#000000", "border_opacity": 1.0, "background_color": "#000000"},
            "is_default": False
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/admin/collage-presets",
            headers={"Authorization": f"Bearer {self.admin_token}", "Content-Type": "application/json"},
            json=preset_data
        )
        assert create_response.status_code == 200
        preset_id = create_response.json()["id"]
        
        # Delete the preset
        delete_response = requests.delete(
            f"{BASE_URL}/api/admin/collage-presets/{preset_id}",
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        assert delete_response.status_code == 200, f"Failed to delete preset: {delete_response.text}"
        
        # Verify deletion
        get_response = requests.get(
            f"{BASE_URL}/api/admin/collage-presets/{preset_id}",
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        assert get_response.status_code == 404
        print(f"✓ Deleted preset: {preset_id}")
    
    def test_duplicate_collage_preset(self):
        """Test duplicating a collage preset"""
        if not self.admin_token:
            pytest.skip("Admin login failed")
        
        # First create a preset
        preset_data = {
            "name": f"TEST_Original_Preset_{uuid.uuid4().hex[:6]}",
            "description": "Original preset",
            "tags": ["test", "original"],
            "placeholders": [
                {"id": "ph1", "x": 5, "y": 5, "width": 20, "height": 30, "ratio": "3:2", "z_index": 0}
            ],
            "settings": {"gap": 3, "border_thickness": 0, "border_color": "#000000", "border_opacity": 1.0, "background_color": "#000000"},
            "is_default": False
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/admin/collage-presets",
            headers={"Authorization": f"Bearer {self.admin_token}", "Content-Type": "application/json"},
            json=preset_data
        )
        assert create_response.status_code == 200
        original_id = create_response.json()["id"]
        self.created_preset_ids.append(original_id)
        
        # Duplicate the preset
        duplicate_response = requests.post(
            f"{BASE_URL}/api/admin/collage-presets/{original_id}/duplicate",
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        assert duplicate_response.status_code == 200, f"Failed to duplicate preset: {duplicate_response.text}"
        
        duplicated = duplicate_response.json()
        assert duplicated["id"] != original_id
        assert "Copy" in duplicated["name"]
        self.created_preset_ids.append(duplicated["id"])
        print(f"✓ Duplicated preset: {original_id} -> {duplicated['id']}")


class TestPhotographerCollagePresets:
    """Test photographer collage preset selection"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup photographer token for tests"""
        self.photographer_token = None
        self.gallery_id = None
        
        # Login as photographer
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PHOTOGRAPHER_EMAIL,
            "password": PHOTOGRAPHER_PASSWORD
        })
        if response.status_code == 200:
            self.photographer_token = response.json().get("access_token")
        
        yield
    
    def test_photographer_login(self):
        """Test photographer login works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": PHOTOGRAPHER_EMAIL,
            "password": PHOTOGRAPHER_PASSWORD
        })
        assert response.status_code == 200, f"Photographer login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        print(f"✓ Photographer login successful: {data['user']['email']}")
    
    def test_get_available_presets(self):
        """Test photographer can get available collage presets"""
        if not self.photographer_token:
            pytest.skip("Photographer login failed")
        
        response = requests.get(
            f"{BASE_URL}/api/collage-presets",
            headers={"Authorization": f"Bearer {self.photographer_token}"}
        )
        assert response.status_code == 200, f"Failed to get presets: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Photographer can access {len(data)} collage presets")
    
    def test_get_photographer_galleries(self):
        """Test getting photographer's galleries"""
        if not self.photographer_token:
            pytest.skip("Photographer login failed")
        
        response = requests.get(
            f"{BASE_URL}/api/galleries",
            headers={"Authorization": f"Bearer {self.photographer_token}"}
        )
        assert response.status_code == 200, f"Failed to get galleries: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        
        if len(data) > 0:
            self.gallery_id = data[0]["id"]
            print(f"✓ Found {len(data)} galleries, using: {self.gallery_id}")
        else:
            print("✓ No galleries found for photographer")
    
    def test_update_gallery_with_collage_preset(self):
        """Test updating gallery with collage_preset_id"""
        if not self.photographer_token:
            pytest.skip("Photographer login failed")
        
        # Get galleries
        galleries_response = requests.get(
            f"{BASE_URL}/api/galleries",
            headers={"Authorization": f"Bearer {self.photographer_token}"}
        )
        if galleries_response.status_code != 200 or len(galleries_response.json()) == 0:
            pytest.skip("No galleries available for testing")
        
        gallery = galleries_response.json()[0]
        gallery_id = gallery["id"]
        
        # Get available presets
        presets_response = requests.get(
            f"{BASE_URL}/api/collage-presets",
            headers={"Authorization": f"Bearer {self.photographer_token}"}
        )
        
        preset_id = None
        if presets_response.status_code == 200 and len(presets_response.json()) > 0:
            preset_id = presets_response.json()[0]["id"]
        
        # Update gallery with collage_preset_id
        update_data = {
            "collage_preset_id": preset_id
        }
        
        update_response = requests.put(
            f"{BASE_URL}/api/galleries/{gallery_id}",
            headers={
                "Authorization": f"Bearer {self.photographer_token}",
                "Content-Type": "application/json"
            },
            json=update_data
        )
        assert update_response.status_code == 200, f"Failed to update gallery: {update_response.text}"
        
        updated = update_response.json()
        assert updated.get("collage_preset_id") == preset_id
        print(f"✓ Updated gallery {gallery_id} with collage_preset_id: {preset_id}")
        
        # Reset to null
        reset_response = requests.put(
            f"{BASE_URL}/api/galleries/{gallery_id}",
            headers={
                "Authorization": f"Bearer {self.photographer_token}",
                "Content-Type": "application/json"
            },
            json={"collage_preset_id": None}
        )
        assert reset_response.status_code == 200
        print(f"✓ Reset gallery collage_preset_id to null")


class TestPublicCollagePresetEndpoints:
    """Test public collage preset endpoints"""
    
    def test_get_default_preset_public(self):
        """Test getting default collage preset (public endpoint)"""
        response = requests.get(f"{BASE_URL}/api/collage-presets/default/public")
        # May return 404 if no default preset exists, which is acceptable
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
        
        if response.status_code == 200:
            data = response.json()
            assert "id" in data
            assert data.get("is_default") == True
            print(f"✓ Got default preset: {data['id']}")
        else:
            print("✓ No default preset configured (404 is acceptable)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
