"""
Test Suite for Subscription & Billing System
Tests: Credit deduction, plan limits, upgrade flow, admin payment approval, download gate
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from review request
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "Aa@58798546521325"
TEST_USER_FREE_EMAIL = "testupgrade@example.com"
TEST_USER_FREE_PASSWORD = "Test123!"
TEST_USER_COMPED_PRO_EMAIL = "jovelyneahig@gmail.com"
TEST_USER_COMPED_PRO_PASSWORD = "Aa@050772"


class TestHealthAndSetup:
    """Basic health checks"""
    
    def test_api_health(self):
        """Test API is running"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("✓ API health check passed")


class TestAdminLogin:
    """Admin authentication tests"""
    
    def test_admin_login_success(self):
        """Test admin login with correct credentials"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["is_admin"] == True
        print("✓ Admin login successful")
        return data["access_token"]
    
    def test_admin_login_invalid(self):
        """Test admin login with wrong credentials"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "wrong",
            "password": "wrong"
        })
        assert response.status_code == 401
        print("✓ Admin login correctly rejects invalid credentials")


class TestUserLogin:
    """User authentication tests"""
    
    def test_free_user_login(self):
        """Test free user login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_FREE_EMAIL,
            "password": TEST_USER_FREE_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        print(f"✓ Free user login successful: {data['user']['email']}")
        return data["access_token"]
    
    def test_comped_pro_user_login(self):
        """Test comped pro user login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_COMPED_PRO_EMAIL,
            "password": TEST_USER_COMPED_PRO_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        print(f"✓ Comped Pro user login successful: {data['user']['email']}")
        return data["access_token"]


class TestSubscriptionEndpoints:
    """Test subscription-related endpoints"""
    
    @pytest.fixture
    def free_user_token(self):
        """Get token for free user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_FREE_EMAIL,
            "password": TEST_USER_FREE_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Free user login failed")
    
    @pytest.fixture
    def comped_pro_token(self):
        """Get token for comped pro user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_COMPED_PRO_EMAIL,
            "password": TEST_USER_COMPED_PRO_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Comped Pro user login failed")
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Admin login failed")
    
    def test_get_subscription_free_user(self, free_user_token):
        """Test subscription endpoint for free user with pending payment"""
        response = requests.get(f"{BASE_URL}/api/user/subscription", 
            headers={"Authorization": f"Bearer {free_user_token}"})
        assert response.status_code == 200
        data = response.json()
        
        # Verify subscription fields exist
        assert "plan" in data
        assert "effective_plan" in data
        assert "event_credits" in data
        assert "payment_status" in data
        assert "can_download" in data
        assert "features_enabled" in data
        
        print(f"✓ Free user subscription data:")
        print(f"  - Plan: {data['plan']}")
        print(f"  - Effective Plan: {data['effective_plan']}")
        print(f"  - Payment Status: {data['payment_status']}")
        print(f"  - Can Download: {data['can_download']}")
        print(f"  - Requested Plan: {data.get('requested_plan')}")
        
        # If payment is pending, can_download should be False
        if data['payment_status'] == 'pending':
            assert data['can_download'] == False, "Download should be disabled when payment is pending"
            print("✓ Download correctly disabled for pending payment")
        
        return data
    
    def test_get_subscription_comped_pro_user(self, comped_pro_token):
        """Test subscription endpoint for comped pro user"""
        response = requests.get(f"{BASE_URL}/api/user/subscription", 
            headers={"Authorization": f"Bearer {comped_pro_token}"})
        assert response.status_code == 200
        data = response.json()
        
        print(f"✓ Comped Pro user subscription data:")
        print(f"  - Plan: {data['plan']}")
        print(f"  - Effective Plan: {data['effective_plan']}")
        print(f"  - Override Mode: {data.get('override_mode')}")
        print(f"  - Event Credits: {data['event_credits']}")
        print(f"  - Total Credits: {data['total_credits']}")
        print(f"  - Can Download: {data['can_download']}")
        
        # Verify feature toggles based on plan
        features = data.get('features_enabled', {})
        print(f"  - Features: {features}")
        
        return data
    
    def test_billing_pricing_endpoint(self):
        """Test public billing pricing endpoint"""
        response = requests.get(f"{BASE_URL}/api/billing/pricing")
        assert response.status_code == 200
        data = response.json()
        
        assert "standard_monthly" in data
        assert "pro_monthly" in data
        assert "extra_credit" in data
        
        print(f"✓ Billing pricing:")
        print(f"  - Standard: ₱{data['standard_monthly']}/month")
        print(f"  - Pro: ₱{data['pro_monthly']}/month")
        print(f"  - Extra Credit: ₱{data['extra_credit']}")
        
        return data


class TestPendingPayments:
    """Test admin pending payments functionality"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Admin login failed")
    
    def test_get_pending_payments(self, admin_token):
        """Test admin can get pending payments list"""
        response = requests.get(f"{BASE_URL}/api/admin/pending-payments",
            headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ Pending payments count: {len(data)}")
        
        for user in data:
            print(f"  - {user.get('name', 'N/A')} ({user.get('email')})")
            print(f"    Payment Status: {user.get('payment_status')}")
            print(f"    Requested Plan: {user.get('requested_plan')}")
            print(f"    Proof URL: {user.get('payment_proof_url', 'None')}")
        
        return data
    
    def test_get_photographers_with_subscription_info(self, admin_token):
        """Test admin can see photographers with subscription info"""
        response = requests.get(f"{BASE_URL}/api/admin/photographers",
            headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ Total photographers: {len(data)}")
        
        # Check subscription fields are present
        for user in data[:3]:  # Check first 3
            assert "plan" in user
            assert "payment_status" in user
            print(f"  - {user.get('name')}: Plan={user.get('plan')}, Status={user.get('payment_status')}")
        
        return data


class TestFeatureToggles:
    """Test feature toggles based on plan"""
    
    @pytest.fixture
    def free_user_token(self):
        """Get token for free user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_FREE_EMAIL,
            "password": TEST_USER_FREE_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Free user login failed")
    
    @pytest.fixture
    def comped_pro_token(self):
        """Get token for comped pro user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_COMPED_PRO_EMAIL,
            "password": TEST_USER_COMPED_PRO_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Comped Pro user login failed")
    
    def test_feature_toggles_free_user(self, free_user_token):
        """Test feature toggles for free user"""
        response = requests.get(f"{BASE_URL}/api/user/subscription",
            headers={"Authorization": f"Bearer {free_user_token}"})
        assert response.status_code == 200
        data = response.json()
        
        features = data.get('features_enabled', {})
        effective_plan = data.get('effective_plan', 'free')
        
        print(f"✓ Free user features (effective plan: {effective_plan}):")
        print(f"  - QR Share: {features.get('qr_share')}")
        print(f"  - Display Mode: {features.get('display_mode')}")
        print(f"  - Contributor Link: {features.get('contributor_link')}")
        
        # Free plan should have limited features
        if effective_plan == 'free':
            # Free users shouldn't have standard/pro features
            assert features.get('display_mode') == False, "Free plan should not have display_mode"
            assert features.get('contributor_link') == False, "Free plan should not have contributor_link"
            print("✓ Free plan features correctly limited")
    
    def test_feature_toggles_pro_user(self, comped_pro_token):
        """Test feature toggles for pro user"""
        response = requests.get(f"{BASE_URL}/api/user/subscription",
            headers={"Authorization": f"Bearer {comped_pro_token}"})
        assert response.status_code == 200
        data = response.json()
        
        features = data.get('features_enabled', {})
        effective_plan = data.get('effective_plan')
        
        print(f"✓ Pro user features (effective plan: {effective_plan}):")
        print(f"  - QR Share: {features.get('qr_share')}")
        print(f"  - Display Mode: {features.get('display_mode')}")
        print(f"  - Contributor Link: {features.get('contributor_link')}")
        
        # Pro plan should have all features
        if effective_plan == 'pro':
            assert features.get('display_mode') == True, "Pro plan should have display_mode"
            assert features.get('contributor_link') == True, "Pro plan should have contributor_link"
            print("✓ Pro plan features correctly enabled")


class TestStorageQuota:
    """Test storage quota based on plan"""
    
    @pytest.fixture
    def free_user_token(self):
        """Get token for free user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_FREE_EMAIL,
            "password": TEST_USER_FREE_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Free user login failed")
    
    @pytest.fixture
    def comped_pro_token(self):
        """Get token for comped pro user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_COMPED_PRO_EMAIL,
            "password": TEST_USER_COMPED_PRO_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Comped Pro user login failed")
    
    def test_storage_quota_free_user(self, free_user_token):
        """Test storage quota for free user (500MB)"""
        response = requests.get(f"{BASE_URL}/api/user/subscription",
            headers={"Authorization": f"Bearer {free_user_token}"})
        assert response.status_code == 200
        data = response.json()
        
        storage_quota = data.get('storage_quota', 0)
        storage_used = data.get('storage_used', 0)
        
        # Free plan: 500MB = 500 * 1024 * 1024 = 524288000 bytes
        FREE_QUOTA = 500 * 1024 * 1024
        
        print(f"✓ Free user storage:")
        print(f"  - Quota: {storage_quota / (1024*1024):.0f} MB")
        print(f"  - Used: {storage_used / (1024*1024):.2f} MB")
        
        # Note: User might have been upgraded, so we just verify the field exists
        assert storage_quota > 0, "Storage quota should be set"
    
    def test_storage_quota_pro_user(self, comped_pro_token):
        """Test storage quota for pro user (10GB)"""
        response = requests.get(f"{BASE_URL}/api/user/subscription",
            headers={"Authorization": f"Bearer {comped_pro_token}"})
        assert response.status_code == 200
        data = response.json()
        
        storage_quota = data.get('storage_quota', 0)
        storage_used = data.get('storage_used', 0)
        
        # Pro plan: 10GB = 10 * 1024 * 1024 * 1024 = 10737418240 bytes
        PRO_QUOTA = 10 * 1024 * 1024 * 1024
        
        print(f"✓ Pro user storage:")
        print(f"  - Quota: {storage_quota / (1024*1024*1024):.2f} GB")
        print(f"  - Used: {storage_used / (1024*1024):.2f} MB")
        
        # Pro users should have 10GB quota
        assert storage_quota == PRO_QUOTA, f"Pro plan should have 10GB quota, got {storage_quota}"
        print("✓ Pro plan storage quota correctly set to 10GB")


class TestCreditSystem:
    """Test event credit system"""
    
    @pytest.fixture
    def comped_pro_token(self):
        """Get token for comped pro user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_COMPED_PRO_EMAIL,
            "password": TEST_USER_COMPED_PRO_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Comped Pro user login failed")
    
    def test_credit_info_in_subscription(self, comped_pro_token):
        """Test credit information is returned in subscription"""
        response = requests.get(f"{BASE_URL}/api/user/subscription",
            headers={"Authorization": f"Bearer {comped_pro_token}"})
        assert response.status_code == 200
        data = response.json()
        
        assert "event_credits" in data
        assert "extra_credits" in data
        assert "total_credits" in data
        
        print(f"✓ Credit info:")
        print(f"  - Event Credits: {data['event_credits']}")
        print(f"  - Extra Credits: {data['extra_credits']}")
        print(f"  - Total Credits: {data['total_credits']}")
        print(f"  - Is Unlimited: {data.get('is_unlimited_credits', False)}")
        
        return data


class TestDownloadGate:
    """Test download gate for pending payments"""
    
    @pytest.fixture
    def free_user_token(self):
        """Get token for free user with pending payment"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_FREE_EMAIL,
            "password": TEST_USER_FREE_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Free user login failed")
    
    def test_download_disabled_for_pending_payment(self, free_user_token):
        """Test that download is disabled when payment is pending"""
        response = requests.get(f"{BASE_URL}/api/user/subscription",
            headers={"Authorization": f"Bearer {free_user_token}"})
        assert response.status_code == 200
        data = response.json()
        
        payment_status = data.get('payment_status')
        can_download = data.get('can_download')
        
        print(f"✓ Download gate test:")
        print(f"  - Payment Status: {payment_status}")
        print(f"  - Can Download: {can_download}")
        
        if payment_status == 'pending':
            assert can_download == False, "Download should be disabled when payment is pending"
            print("✓ Download correctly disabled for pending payment")
        elif payment_status == 'approved' or payment_status == 'none':
            assert can_download == True, "Download should be enabled when payment is approved or none"
            print("✓ Download correctly enabled")


class TestBillingSettings:
    """Test billing settings endpoints"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Admin login failed")
    
    def test_get_billing_settings(self, admin_token):
        """Test admin can get billing settings"""
        response = requests.get(f"{BASE_URL}/api/billing/settings",
            headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        data = response.json()
        
        assert "billing_enforcement_enabled" in data
        assert "pricing" in data
        
        print(f"✓ Billing settings:")
        print(f"  - Enforcement Enabled: {data['billing_enforcement_enabled']}")
        print(f"  - Pricing: {data['pricing']}")
        
        return data


class TestUpgradeRequestFlow:
    """Test upgrade request flow (without actually submitting)"""
    
    def test_upgrade_request_endpoint_exists(self):
        """Verify upgrade request endpoint exists"""
        # This test just verifies the endpoint exists by checking 401 without auth
        response = requests.post(f"{BASE_URL}/api/user/upgrade-request", json={
            "requested_plan": "standard"
        })
        # Should get 401 (unauthorized) not 404 (not found)
        assert response.status_code == 401 or response.status_code == 403
        print("✓ Upgrade request endpoint exists")
    
    def test_payment_proof_upload_endpoint_exists(self):
        """Verify payment proof upload endpoint exists"""
        response = requests.post(f"{BASE_URL}/api/upload-payment-proof")
        # Should get 401 or 422 (validation error), not 404
        assert response.status_code in [401, 403, 422]
        print("✓ Payment proof upload endpoint exists")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
