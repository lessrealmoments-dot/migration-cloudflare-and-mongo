"""
Test Global Feature Toggle System - Admin Override Authority Hierarchy
Tests for:
- GET /api/admin/global-feature-toggles - returns all modes and plans with features
- PUT /api/admin/global-feature-toggles - saves all feature toggles
- PUT /api/admin/global-feature-toggles/{mode_or_plan} - updates single mode/plan features
- GET /api/user/features - returns resolved features using authority hierarchy
- GET /api/admin/users/{user_id}/features - returns resolved features for specific user
- Authority hierarchy: Override mode takes precedence over payment plan
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "Aa@58798546521325"

# Override modes
MODE_FOUNDERS_CIRCLE = "founders_circle"
MODE_EARLY_PARTNER_BETA = "early_partner_beta"
MODE_COMPED_PRO = "comped_pro"
MODE_COMPED_STANDARD = "comped_standard"

# Payment plans
PLAN_FREE = "free"
PLAN_STANDARD = "standard"
PLAN_PRO = "pro"

# All features
ALL_FEATURES = ["unlimited_token", "copy_share_link", "qr_code", "view_public_gallery", "display_mode", "collaboration_link"]

# Default expected features per mode
DEFAULT_MODE_FEATURES = {
    MODE_FOUNDERS_CIRCLE: {
        "unlimited_token": True,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": True,
        "collaboration_link": True
    },
    MODE_EARLY_PARTNER_BETA: {
        "unlimited_token": False,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": True,
        "collaboration_link": True
    },
    MODE_COMPED_PRO: {
        "unlimited_token": False,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": True,
        "collaboration_link": True
    },
    MODE_COMPED_STANDARD: {
        "unlimited_token": False,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": False,
        "collaboration_link": False
    }
}

# Default expected features per plan
DEFAULT_PLAN_FEATURES = {
    PLAN_FREE: {
        "unlimited_token": False,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": True,
        "collaboration_link": True
    },
    PLAN_STANDARD: {
        "unlimited_token": False,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": False,
        "collaboration_link": False
    },
    PLAN_PRO: {
        "unlimited_token": False,
        "copy_share_link": True,
        "qr_code": True,
        "view_public_gallery": True,
        "display_mode": True,
        "collaboration_link": True
    }
}


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/admin/login", json={
        "username": ADMIN_USERNAME,
        "password": ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def test_user_token():
    """Create a test user and get authentication token"""
    unique_id = str(uuid.uuid4())[:8]
    email = f"TEST_featuretest_{unique_id}@example.com"
    password = "Test123!"
    
    # Register user
    response = requests.post(f"{BASE_URL}/api/auth/register", json={
        "email": email,
        "password": password,
        "name": f"Feature Test User {unique_id}"
    })
    
    if response.status_code == 200:
        data = response.json()
        return {
            "token": data["access_token"],
            "user_id": data["user"]["id"],
            "email": email
        }
    elif response.status_code == 400 and "already registered" in response.text:
        # User exists, try login
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        if login_response.status_code == 200:
            data = login_response.json()
            return {
                "token": data["access_token"],
                "user_id": data["user"]["id"],
                "email": email
            }
    
    pytest.skip(f"Could not create/login test user: {response.text}")


class TestHealthCheck:
    """Basic health check"""
    
    def test_api_health(self):
        """Test API is healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("✓ API health check passed")


class TestGetGlobalFeatureToggles:
    """Tests for GET /api/admin/global-feature-toggles"""
    
    def test_get_global_toggles_requires_admin(self):
        """Test that endpoint requires admin authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/global-feature-toggles")
        assert response.status_code == 403 or response.status_code == 401
        print("✓ GET global-feature-toggles requires admin auth")
    
    def test_get_global_toggles_returns_all_modes_and_plans(self, admin_token):
        """Test that endpoint returns all override modes and payment plans"""
        response = requests.get(
            f"{BASE_URL}/api/admin/global-feature-toggles",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check structure
        assert "override_modes" in data
        assert "payment_plans" in data
        assert "feature_definitions" in data
        
        # Check all override modes present
        assert MODE_FOUNDERS_CIRCLE in data["override_modes"]
        assert MODE_EARLY_PARTNER_BETA in data["override_modes"]
        assert MODE_COMPED_PRO in data["override_modes"]
        assert MODE_COMPED_STANDARD in data["override_modes"]
        
        # Check all payment plans present
        assert PLAN_FREE in data["payment_plans"]
        assert PLAN_STANDARD in data["payment_plans"]
        assert PLAN_PRO in data["payment_plans"]
        
        print("✓ GET global-feature-toggles returns all modes and plans")
    
    def test_override_modes_have_correct_structure(self, admin_token):
        """Test that each override mode has label and features"""
        response = requests.get(
            f"{BASE_URL}/api/admin/global-feature-toggles",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        for mode in [MODE_FOUNDERS_CIRCLE, MODE_EARLY_PARTNER_BETA, MODE_COMPED_PRO, MODE_COMPED_STANDARD]:
            mode_data = data["override_modes"][mode]
            assert "label" in mode_data
            assert "features" in mode_data
            
            # Check all features present
            for feature in ALL_FEATURES:
                assert feature in mode_data["features"], f"Missing feature {feature} in {mode}"
        
        print("✓ Override modes have correct structure with all features")
    
    def test_payment_plans_have_correct_structure(self, admin_token):
        """Test that each payment plan has label and features"""
        response = requests.get(
            f"{BASE_URL}/api/admin/global-feature-toggles",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        for plan in [PLAN_FREE, PLAN_STANDARD, PLAN_PRO]:
            plan_data = data["payment_plans"][plan]
            assert "label" in plan_data
            assert "features" in plan_data
            
            # Check all features present
            for feature in ALL_FEATURES:
                assert feature in plan_data["features"], f"Missing feature {feature} in {plan}"
        
        print("✓ Payment plans have correct structure with all features")
    
    def test_founders_circle_has_unlimited_token_enabled(self, admin_token):
        """Test that Founders Circle has unlimited_token enabled by default"""
        response = requests.get(
            f"{BASE_URL}/api/admin/global-feature-toggles",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        founders_features = data["override_modes"][MODE_FOUNDERS_CIRCLE]["features"]
        assert founders_features["unlimited_token"] == True, "Founders Circle should have unlimited_token enabled"
        print("✓ Founders Circle has unlimited_token enabled by default")
    
    def test_comped_standard_has_display_mode_disabled(self, admin_token):
        """Test that Comped Standard has display_mode and collaboration_link disabled"""
        response = requests.get(
            f"{BASE_URL}/api/admin/global-feature-toggles",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        comped_std_features = data["override_modes"][MODE_COMPED_STANDARD]["features"]
        assert comped_std_features["display_mode"] == False, "Comped Standard should have display_mode disabled"
        assert comped_std_features["collaboration_link"] == False, "Comped Standard should have collaboration_link disabled"
        print("✓ Comped Standard has display_mode and collaboration_link disabled by default")
    
    def test_standard_plan_has_display_mode_disabled(self, admin_token):
        """Test that Standard payment plan has display_mode and collaboration_link disabled"""
        response = requests.get(
            f"{BASE_URL}/api/admin/global-feature-toggles",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        standard_features = data["payment_plans"][PLAN_STANDARD]["features"]
        assert standard_features["display_mode"] == False, "Standard plan should have display_mode disabled"
        assert standard_features["collaboration_link"] == False, "Standard plan should have collaboration_link disabled"
        print("✓ Standard payment plan has display_mode and collaboration_link disabled by default")


class TestUpdateGlobalFeatureToggles:
    """Tests for PUT /api/admin/global-feature-toggles"""
    
    def test_update_global_toggles_requires_admin(self):
        """Test that endpoint requires admin authentication"""
        response = requests.put(
            f"{BASE_URL}/api/admin/global-feature-toggles",
            json={}
        )
        assert response.status_code == 403 or response.status_code == 401
        print("✓ PUT global-feature-toggles requires admin auth")
    
    def test_update_global_toggles_saves_all_features(self, admin_token):
        """Test that endpoint saves all feature toggles"""
        # Create test payload with all modes and plans
        payload = {
            "founders_circle": DEFAULT_MODE_FEATURES[MODE_FOUNDERS_CIRCLE],
            "early_partner_beta": DEFAULT_MODE_FEATURES[MODE_EARLY_PARTNER_BETA],
            "comped_pro": DEFAULT_MODE_FEATURES[MODE_COMPED_PRO],
            "comped_standard": DEFAULT_MODE_FEATURES[MODE_COMPED_STANDARD],
            "free": DEFAULT_PLAN_FEATURES[PLAN_FREE],
            "standard": DEFAULT_PLAN_FEATURES[PLAN_STANDARD],
            "pro": DEFAULT_PLAN_FEATURES[PLAN_PRO]
        }
        
        response = requests.put(
            f"{BASE_URL}/api/admin/global-feature-toggles",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=payload
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "toggles" in data
        print("✓ PUT global-feature-toggles saves all features successfully")
    
    def test_update_and_verify_persistence(self, admin_token):
        """Test that updates persist correctly"""
        # First, update with modified values
        modified_payload = {
            "founders_circle": {**DEFAULT_MODE_FEATURES[MODE_FOUNDERS_CIRCLE], "qr_code": False},
            "early_partner_beta": DEFAULT_MODE_FEATURES[MODE_EARLY_PARTNER_BETA],
            "comped_pro": DEFAULT_MODE_FEATURES[MODE_COMPED_PRO],
            "comped_standard": DEFAULT_MODE_FEATURES[MODE_COMPED_STANDARD],
            "free": DEFAULT_PLAN_FEATURES[PLAN_FREE],
            "standard": DEFAULT_PLAN_FEATURES[PLAN_STANDARD],
            "pro": DEFAULT_PLAN_FEATURES[PLAN_PRO]
        }
        
        update_response = requests.put(
            f"{BASE_URL}/api/admin/global-feature-toggles",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=modified_payload
        )
        assert update_response.status_code == 200
        
        # Verify by fetching
        get_response = requests.get(
            f"{BASE_URL}/api/admin/global-feature-toggles",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert get_response.status_code == 200
        data = get_response.json()
        
        # Check the modified value persisted
        assert data["override_modes"][MODE_FOUNDERS_CIRCLE]["features"]["qr_code"] == False
        
        # Restore original values
        restore_payload = {
            "founders_circle": DEFAULT_MODE_FEATURES[MODE_FOUNDERS_CIRCLE],
            "early_partner_beta": DEFAULT_MODE_FEATURES[MODE_EARLY_PARTNER_BETA],
            "comped_pro": DEFAULT_MODE_FEATURES[MODE_COMPED_PRO],
            "comped_standard": DEFAULT_MODE_FEATURES[MODE_COMPED_STANDARD],
            "free": DEFAULT_PLAN_FEATURES[PLAN_FREE],
            "standard": DEFAULT_PLAN_FEATURES[PLAN_STANDARD],
            "pro": DEFAULT_PLAN_FEATURES[PLAN_PRO]
        }
        requests.put(
            f"{BASE_URL}/api/admin/global-feature-toggles",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=restore_payload
        )
        
        print("✓ Feature toggle updates persist correctly")


class TestUpdateSingleModeFeatures:
    """Tests for PUT /api/admin/global-feature-toggles/{mode_or_plan}"""
    
    def test_update_single_mode_requires_admin(self):
        """Test that endpoint requires admin authentication"""
        response = requests.put(
            f"{BASE_URL}/api/admin/global-feature-toggles/founders_circle",
            json={"unlimited_token": True}
        )
        assert response.status_code == 403 or response.status_code == 401
        print("✓ PUT single mode features requires admin auth")
    
    def test_update_single_mode_validates_mode_name(self, admin_token):
        """Test that endpoint validates mode/plan name"""
        response = requests.put(
            f"{BASE_URL}/api/admin/global-feature-toggles/invalid_mode",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"unlimited_token": True}
        )
        assert response.status_code == 400
        print("✓ PUT single mode validates mode/plan name")
    
    def test_update_single_mode_validates_feature_keys(self, admin_token):
        """Test that endpoint validates feature keys"""
        response = requests.put(
            f"{BASE_URL}/api/admin/global-feature-toggles/founders_circle",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"invalid_feature": True}
        )
        assert response.status_code == 400
        print("✓ PUT single mode validates feature keys")
    
    def test_update_single_mode_success(self, admin_token):
        """Test successful update of single mode features"""
        # Update founders_circle
        response = requests.put(
            f"{BASE_URL}/api/admin/global-feature-toggles/founders_circle",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=DEFAULT_MODE_FEATURES[MODE_FOUNDERS_CIRCLE]
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "features" in data
        print("✓ PUT single mode features updates successfully")


class TestUserFeatures:
    """Tests for GET /api/user/features"""
    
    def test_user_features_requires_auth(self):
        """Test that endpoint requires user authentication"""
        response = requests.get(f"{BASE_URL}/api/user/features")
        assert response.status_code == 403 or response.status_code == 401
        print("✓ GET user/features requires authentication")
    
    def test_user_features_returns_resolved_features(self, test_user_token):
        """Test that endpoint returns resolved features using authority hierarchy"""
        response = requests.get(
            f"{BASE_URL}/api/user/features",
            headers={"Authorization": f"Bearer {test_user_token['token']}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields
        assert "authority_source" in data
        assert "effective_plan" in data
        assert "features" in data
        assert "override_active" in data
        assert "has_unlimited_credits" in data
        assert "credits_available" in data
        assert "can_download" in data
        assert "payment_required" in data
        
        print("✓ GET user/features returns resolved features with all required fields")
    
    def test_user_features_authority_source_is_payment_plan(self, test_user_token):
        """Test that new user without override has payment_plan as authority source"""
        response = requests.get(
            f"{BASE_URL}/api/user/features",
            headers={"Authorization": f"Bearer {test_user_token['token']}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # New user should have payment_plan as authority source (no override)
        assert data["authority_source"] == "payment_plan"
        assert data["override_active"] == False
        print("✓ New user has payment_plan as authority source")


class TestAdminUserFeatures:
    """Tests for GET /api/admin/users/{user_id}/features"""
    
    def test_admin_user_features_requires_admin(self, test_user_token):
        """Test that endpoint requires admin authentication"""
        response = requests.get(
            f"{BASE_URL}/api/admin/users/{test_user_token['user_id']}/features"
        )
        assert response.status_code == 403 or response.status_code == 401
        print("✓ GET admin/users/{user_id}/features requires admin auth")
    
    def test_admin_user_features_returns_resolved_features(self, admin_token, test_user_token):
        """Test that endpoint returns resolved features for specific user"""
        response = requests.get(
            f"{BASE_URL}/api/admin/users/{test_user_token['user_id']}/features",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields
        assert "user_id" in data
        assert data["user_id"] == test_user_token["user_id"]
        assert "authority_source" in data
        assert "effective_plan" in data
        assert "features" in data
        assert "override_active" in data
        assert "has_unlimited_credits" in data
        assert "credits_available" in data
        assert "can_download" in data
        assert "payment_required" in data
        
        print("✓ GET admin/users/{user_id}/features returns resolved features")
    
    def test_admin_user_features_404_for_invalid_user(self, admin_token):
        """Test that endpoint returns 404 for non-existent user"""
        response = requests.get(
            f"{BASE_URL}/api/admin/users/invalid-user-id-12345/features",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 404
        print("✓ GET admin/users/{user_id}/features returns 404 for invalid user")


class TestAuthorityHierarchy:
    """Tests for authority hierarchy: Override Mode > Payment Plan > Payment Status"""
    
    def test_assign_override_and_verify_authority(self, admin_token, test_user_token):
        """Test that assigning override mode changes authority source"""
        user_id = test_user_token["user_id"]
        
        # First check current authority (should be payment_plan)
        before_response = requests.get(
            f"{BASE_URL}/api/admin/users/{user_id}/features",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert before_response.status_code == 200
        before_data = before_response.json()
        assert before_data["authority_source"] == "payment_plan"
        
        # Assign override mode
        assign_response = requests.post(
            f"{BASE_URL}/api/admin/assign-override",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "user_id": user_id,
                "mode": MODE_FOUNDERS_CIRCLE,
                "duration_months": 1,
                "reason": "Testing authority hierarchy"
            }
        )
        assert assign_response.status_code == 200
        
        # Check authority changed to override_mode
        after_response = requests.get(
            f"{BASE_URL}/api/admin/users/{user_id}/features",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert after_response.status_code == 200
        after_data = after_response.json()
        
        assert after_data["authority_source"] == "override_mode"
        assert after_data["override_active"] == True
        assert after_data["override_mode"] == MODE_FOUNDERS_CIRCLE
        assert after_data["has_unlimited_credits"] == True  # Founders Circle has unlimited
        
        # Verify features match Founders Circle
        assert after_data["features"]["unlimited_token"] == True
        
        print("✓ Override mode takes precedence over payment plan (authority hierarchy)")
        
        # Cleanup: Remove override
        remove_response = requests.post(
            f"{BASE_URL}/api/admin/remove-override",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "user_id": user_id,
                "reason": "Test cleanup"
            }
        )
        assert remove_response.status_code == 200
        
        # Verify authority reverted to payment_plan
        final_response = requests.get(
            f"{BASE_URL}/api/admin/users/{user_id}/features",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert final_response.status_code == 200
        final_data = final_response.json()
        assert final_data["authority_source"] == "payment_plan"
        assert final_data["override_active"] == False
        
        print("✓ Removing override reverts authority to payment_plan")


class TestFeatureDefinitions:
    """Tests for feature definitions in response"""
    
    def test_feature_definitions_present(self, admin_token):
        """Test that feature definitions are included in response"""
        response = requests.get(
            f"{BASE_URL}/api/admin/global-feature-toggles",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "feature_definitions" in data
        definitions = data["feature_definitions"]
        
        # Check all features have definitions
        for feature in ALL_FEATURES:
            assert feature in definitions, f"Missing definition for {feature}"
            assert isinstance(definitions[feature], str)
            assert len(definitions[feature]) > 0
        
        print("✓ Feature definitions present for all features")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
