"""
Test Admin Controls for Storage Allocation and Gallery Expiration
Tests:
1. Feature Toggles page - Storage Limit and Gallery Expiration dropdowns for Override Modes
2. Founders Circle defaults - Unlimited storage and Never (100 years) expiration
3. Early Partner Beta defaults - 50 GB storage and 6 Months expiration
4. Billing tab - Paid Plan Settings with Gallery Expiration and Storage Allocation
5. Saving billing settings persists paid_gallery_expiration_months and paid_storage_limit_gb
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://photovault-90.preview.emergentagent.com')

# Admin credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "Aa@58798546521325"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/admin/login", json={
        "username": ADMIN_USERNAME,
        "password": ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    return response.json()["access_token"]


class TestGlobalFeatureToggles:
    """Test Global Feature Toggles API for Override Modes"""
    
    def test_get_global_feature_toggles(self, admin_token):
        """Test GET /api/admin/global-feature-toggles returns correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/admin/global-feature-toggles",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check structure has override_modes and payment_plans
        assert "override_modes" in data
        assert "payment_plans" in data
        
        # Check override modes exist
        override_modes = data["override_modes"]
        assert "founders_circle" in override_modes
        assert "early_partner_beta" in override_modes
        assert "comped_pro" in override_modes
        assert "comped_standard" in override_modes
        assert "enterprise_access" in override_modes
        
        print(f"Override modes found: {list(override_modes.keys())}")
    
    def test_founders_circle_defaults(self, admin_token):
        """Test Founders Circle has correct defaults: Unlimited storage, Never expires"""
        response = requests.get(
            f"{BASE_URL}/api/admin/global-feature-toggles",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        founders = data["override_modes"]["founders_circle"]["features"]
        
        # Check storage_limit_gb is -1 (unlimited)
        storage_limit = founders.get("storage_limit_gb", -1)
        assert storage_limit == -1, f"Founders Circle storage should be -1 (unlimited), got {storage_limit}"
        
        # Check gallery_expiration_days is 36500 (~100 years = never)
        expiration_days = founders.get("gallery_expiration_days", 36500)
        assert expiration_days == 36500, f"Founders Circle expiration should be 36500 (never), got {expiration_days}"
        
        # Check unlimited_token is True
        assert founders.get("unlimited_token", False) == True, "Founders Circle should have unlimited_token=True"
        
        print(f"Founders Circle: storage={storage_limit}, expiration={expiration_days} days, unlimited_token={founders.get('unlimited_token')}")
    
    def test_early_partner_beta_defaults(self, admin_token):
        """Test Early Partner Beta has correct defaults: 50GB storage, 6 months expiration"""
        response = requests.get(
            f"{BASE_URL}/api/admin/global-feature-toggles",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        early_partner = data["override_modes"]["early_partner_beta"]["features"]
        
        # Check storage_limit_gb is 50
        storage_limit = early_partner.get("storage_limit_gb", 50)
        assert storage_limit == 50, f"Early Partner Beta storage should be 50GB, got {storage_limit}"
        
        # Check gallery_expiration_days is 180 (6 months)
        expiration_days = early_partner.get("gallery_expiration_days", 180)
        assert expiration_days == 180, f"Early Partner Beta expiration should be 180 days (6 months), got {expiration_days}"
        
        # Check unlimited_token is False
        assert early_partner.get("unlimited_token", True) == False, "Early Partner Beta should have unlimited_token=False"
        
        print(f"Early Partner Beta: storage={storage_limit}GB, expiration={expiration_days} days, unlimited_token={early_partner.get('unlimited_token')}")
    
    def test_update_feature_toggles(self, admin_token):
        """Test PUT /api/admin/global-feature-toggles updates correctly"""
        # First get current values
        response = requests.get(
            f"{BASE_URL}/api/admin/global-feature-toggles",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        original_data = response.json()
        
        # Prepare update payload with storage and expiration values
        update_payload = {
            "founders_circle": {
                "unlimited_token": True,
                "copy_share_link": True,
                "qr_code": True,
                "view_public_gallery": True,
                "display_mode": True,
                "collaboration_link": True,
                "storage_limit_gb": -1,
                "gallery_expiration_days": 36500
            },
            "early_partner_beta": {
                "unlimited_token": False,
                "copy_share_link": True,
                "qr_code": True,
                "view_public_gallery": True,
                "display_mode": True,
                "collaboration_link": True,
                "storage_limit_gb": 50,
                "gallery_expiration_days": 180
            },
            "comped_pro": original_data["override_modes"]["comped_pro"]["features"],
            "comped_standard": original_data["override_modes"]["comped_standard"]["features"],
            "enterprise_access": original_data["override_modes"]["enterprise_access"]["features"],
            "free": original_data["payment_plans"]["free"]["features"],
            "standard": original_data["payment_plans"]["standard"]["features"],
            "pro": original_data["payment_plans"]["pro"]["features"]
        }
        
        # Update
        response = requests.put(
            f"{BASE_URL}/api/admin/global-feature-toggles",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=update_payload
        )
        assert response.status_code == 200, f"Update failed: {response.text}"
        
        # Verify update
        response = requests.get(
            f"{BASE_URL}/api/admin/global-feature-toggles",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        updated_data = response.json()
        
        # Check founders_circle storage and expiration
        founders = updated_data["override_modes"]["founders_circle"]["features"]
        assert founders.get("storage_limit_gb") == -1
        assert founders.get("gallery_expiration_days") == 36500
        
        print("Feature toggles update successful")


class TestBillingSettings:
    """Test Billing Settings API for Paid Plan Settings"""
    
    def test_get_billing_settings(self, admin_token):
        """Test GET /api/billing/settings returns correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/billing/settings",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields exist
        assert "billing_enforcement_enabled" in data
        assert "pricing" in data
        assert "payment_methods" in data
        assert "paid_gallery_expiration_months" in data
        assert "paid_storage_limit_gb" in data
        
        print(f"Billing settings: expiration={data['paid_gallery_expiration_months']} months, storage={data['paid_storage_limit_gb']}GB")
    
    def test_paid_plan_settings_defaults(self, admin_token):
        """Test Paid Plan Settings have correct defaults"""
        response = requests.get(
            f"{BASE_URL}/api/billing/settings",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check paid_gallery_expiration_months is between 1-6
        expiration = data["paid_gallery_expiration_months"]
        assert 1 <= expiration <= 6, f"Paid gallery expiration should be 1-6 months, got {expiration}"
        
        # Check paid_storage_limit_gb is -1 (unlimited) or a valid value
        storage = data["paid_storage_limit_gb"]
        valid_storage_values = [-1, 10, 20, 30, 40, 50, 100, 200, 500]
        assert storage in valid_storage_values, f"Paid storage should be one of {valid_storage_values}, got {storage}"
        
        print(f"Paid Plan Settings: expiration={expiration} months, storage={storage}GB")
    
    def test_update_billing_settings(self, admin_token):
        """Test PUT /api/billing/settings updates paid plan settings"""
        # First get current values
        response = requests.get(
            f"{BASE_URL}/api/billing/settings",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        original_data = response.json()
        
        # Update with new values
        update_payload = {
            "billing_enforcement_enabled": original_data["billing_enforcement_enabled"],
            "pricing": original_data["pricing"],
            "payment_methods": original_data["payment_methods"],
            "paid_gallery_expiration_months": 3,  # Test with 3 months
            "paid_storage_limit_gb": 50  # Test with 50GB
        }
        
        response = requests.put(
            f"{BASE_URL}/api/billing/settings",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=update_payload
        )
        assert response.status_code == 200, f"Update failed: {response.text}"
        
        # Verify update
        response = requests.get(
            f"{BASE_URL}/api/billing/settings",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        updated_data = response.json()
        
        assert updated_data["paid_gallery_expiration_months"] == 3
        assert updated_data["paid_storage_limit_gb"] == 50
        
        print("Billing settings update successful: expiration=3 months, storage=50GB")
        
        # Restore original values
        restore_payload = {
            "billing_enforcement_enabled": original_data["billing_enforcement_enabled"],
            "pricing": original_data["pricing"],
            "payment_methods": original_data["payment_methods"],
            "paid_gallery_expiration_months": original_data["paid_gallery_expiration_months"],
            "paid_storage_limit_gb": original_data["paid_storage_limit_gb"]
        }
        
        response = requests.put(
            f"{BASE_URL}/api/billing/settings",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=restore_payload
        )
        assert response.status_code == 200
        print("Original billing settings restored")


class TestDashboardNeverExpires:
    """Test Dashboard displays 'Never expires' for days_until_deletion > 36000"""
    
    def test_never_expires_logic_in_code(self):
        """Verify the 'Never expires' display logic exists in Dashboard.jsx"""
        # Read Dashboard.jsx to verify the logic
        dashboard_path = "/app/frontend/src/pages/Dashboard.jsx"
        with open(dashboard_path, 'r') as f:
            content = f.read()
        
        # Check for the 'Never expires' display logic
        assert "days_until_deletion > 36000" in content, "Dashboard should check for days_until_deletion > 36000"
        assert "Never expires" in content, "Dashboard should display 'Never expires'"
        
        print("Dashboard.jsx contains 'Never expires' display logic for days_until_deletion > 36000")


class TestPublicGalleryUpload:
    """Test Public Gallery upload functionality"""
    
    def test_navbar_upload_button_code(self):
        """Verify navbar upload uses setShowUploadModal instead of setGuestUploadExpanded"""
        public_gallery_path = "/app/frontend/src/pages/PublicGallery.jsx"
        with open(public_gallery_path, 'r') as f:
            content = f.read()
        
        # Check that setGuestUploadExpanded is NOT used
        assert "setGuestUploadExpanded" not in content, "PublicGallery should NOT use setGuestUploadExpanded"
        
        # Check that setShowUploadModal IS used
        assert "setShowUploadModal" in content, "PublicGallery should use setShowUploadModal"
        
        # Check that the navbar upload button uses setShowUploadModal
        assert 'onClick={() => setShowUploadModal(true)}' in content, "Navbar upload should use setShowUploadModal"
        
        print("PublicGallery.jsx correctly uses setShowUploadModal for navbar upload")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
