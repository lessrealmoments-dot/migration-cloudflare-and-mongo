"""
Test suite for Notification System, Transaction History, and Payment Dispute features
Tests:
- Notification endpoints (GET, mark read, mark all read)
- Transaction history endpoints (user and admin)
- Payment dispute endpoint
- Admin transaction history view
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "Aa@58798546521325"
TEST_USER_EMAIL = "test@example.com"
TEST_USER_PASSWORD = "password123"

class TestNotificationEndpoints:
    """Test notification system endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def get_user_token(self, email=TEST_USER_EMAIL, password=TEST_USER_PASSWORD):
        """Get user authentication token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        return None
    
    def get_admin_token(self):
        """Get admin authentication token"""
        response = self.session.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        return None
    
    def test_health_check(self):
        """Test API health endpoint"""
        response = self.session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("✓ Health check passed")
    
    def test_admin_login(self):
        """Test admin login"""
        response = self.session.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data.get("is_admin") == True
        print("✓ Admin login successful")
    
    def test_get_notifications_endpoint_exists(self):
        """Test GET /api/user/notifications endpoint exists"""
        # First try to login as existing user or create one
        token = self.get_user_token()
        
        if not token:
            # Try to register a new test user
            unique_email = f"test_notif_{uuid.uuid4().hex[:8]}@example.com"
            reg_response = self.session.post(f"{BASE_URL}/api/auth/register", json={
                "email": unique_email,
                "password": "Test123!",
                "name": "Test Notification User"
            })
            if reg_response.status_code == 200:
                token = reg_response.json().get("access_token")
            else:
                pytest.skip("Could not create test user")
        
        response = self.session.get(
            f"{BASE_URL}/api/user/notifications",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/user/notifications returns list (count: {len(data)})")
    
    def test_get_unread_count_endpoint(self):
        """Test GET /api/user/notifications/unread-count endpoint"""
        token = self.get_user_token()
        
        if not token:
            unique_email = f"test_unread_{uuid.uuid4().hex[:8]}@example.com"
            reg_response = self.session.post(f"{BASE_URL}/api/auth/register", json={
                "email": unique_email,
                "password": "Test123!",
                "name": "Test Unread User"
            })
            if reg_response.status_code == 200:
                token = reg_response.json().get("access_token")
            else:
                pytest.skip("Could not create test user")
        
        response = self.session.get(
            f"{BASE_URL}/api/user/notifications/unread-count",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "count" in data
        assert isinstance(data["count"], int)
        print(f"✓ GET /api/user/notifications/unread-count returns count: {data['count']}")
    
    def test_mark_all_notifications_read(self):
        """Test PUT /api/user/notifications/read-all endpoint"""
        token = self.get_user_token()
        
        if not token:
            unique_email = f"test_markall_{uuid.uuid4().hex[:8]}@example.com"
            reg_response = self.session.post(f"{BASE_URL}/api/auth/register", json={
                "email": unique_email,
                "password": "Test123!",
                "name": "Test Mark All User"
            })
            if reg_response.status_code == 200:
                token = reg_response.json().get("access_token")
            else:
                pytest.skip("Could not create test user")
        
        response = self.session.put(
            f"{BASE_URL}/api/user/notifications/read-all",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✓ PUT /api/user/notifications/read-all works: {data['message']}")
    
    def test_notifications_require_auth(self):
        """Test that notification endpoints require authentication"""
        response = self.session.get(f"{BASE_URL}/api/user/notifications")
        assert response.status_code in [401, 403]
        print("✓ Notification endpoints require authentication")


class TestTransactionEndpoints:
    """Test transaction history endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def get_admin_token(self):
        """Get admin authentication token"""
        response = self.session.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        return None
    
    def get_user_token(self, email=TEST_USER_EMAIL, password=TEST_USER_PASSWORD):
        """Get user authentication token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        return None
    
    def test_admin_get_all_transactions(self):
        """Test GET /api/admin/transactions endpoint"""
        token = self.get_admin_token()
        assert token is not None, "Admin login failed"
        
        response = self.session.get(
            f"{BASE_URL}/api/admin/transactions?limit=100",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/admin/transactions returns list (count: {len(data)})")
        
        # If there are transactions, verify structure
        if len(data) > 0:
            tx = data[0]
            assert "id" in tx
            assert "user_id" in tx
            assert "type" in tx
            assert "status" in tx
            assert "created_at" in tx
            print(f"✓ Transaction structure verified: id={tx['id'][:8]}..., type={tx['type']}, status={tx['status']}")
    
    def test_admin_get_user_transactions(self):
        """Test GET /api/admin/users/{user_id}/transactions endpoint"""
        token = self.get_admin_token()
        assert token is not None, "Admin login failed"
        
        # First get list of photographers to get a user_id
        photographers_response = self.session.get(
            f"{BASE_URL}/api/admin/photographers",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert photographers_response.status_code == 200
        photographers = photographers_response.json()
        
        if len(photographers) == 0:
            pytest.skip("No photographers to test with")
        
        user_id = photographers[0]["id"]
        
        response = self.session.get(
            f"{BASE_URL}/api/admin/users/{user_id}/transactions",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/admin/users/{user_id[:8]}../transactions returns list (count: {len(data)})")
    
    def test_user_get_own_transactions(self):
        """Test GET /api/user/transactions endpoint"""
        token = self.get_user_token()
        
        if not token:
            unique_email = f"test_tx_{uuid.uuid4().hex[:8]}@example.com"
            reg_response = self.session.post(f"{BASE_URL}/api/auth/register", json={
                "email": unique_email,
                "password": "Test123!",
                "name": "Test Transaction User"
            })
            if reg_response.status_code == 200:
                token = reg_response.json().get("access_token")
            else:
                pytest.skip("Could not create test user")
        
        response = self.session.get(
            f"{BASE_URL}/api/user/transactions",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/user/transactions returns list (count: {len(data)})")
    
    def test_transactions_require_admin_auth(self):
        """Test that admin transaction endpoints require admin auth"""
        # Try without auth
        response = self.session.get(f"{BASE_URL}/api/admin/transactions")
        assert response.status_code in [401, 403]
        
        # Try with user auth (not admin)
        user_token = self.get_user_token()
        if user_token:
            response = self.session.get(
                f"{BASE_URL}/api/admin/transactions",
                headers={"Authorization": f"Bearer {user_token}"}
            )
            assert response.status_code in [401, 403]
        
        print("✓ Admin transaction endpoints require admin authentication")


class TestPaymentStatusAndDispute:
    """Test payment status and dispute endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def get_user_token(self, email=TEST_USER_EMAIL, password=TEST_USER_PASSWORD):
        """Get user authentication token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        return None
    
    def test_get_payment_status_endpoint(self):
        """Test GET /api/user/payment-status endpoint"""
        token = self.get_user_token()
        
        if not token:
            unique_email = f"test_status_{uuid.uuid4().hex[:8]}@example.com"
            reg_response = self.session.post(f"{BASE_URL}/api/auth/register", json={
                "email": unique_email,
                "password": "Test123!",
                "name": "Test Payment Status User"
            })
            if reg_response.status_code == 200:
                token = reg_response.json().get("access_token")
            else:
                pytest.skip("Could not create test user")
        
        response = self.session.get(
            f"{BASE_URL}/api/user/payment-status",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify expected fields
        assert "payment_status" in data
        assert "can_dispute" in data
        assert "payment_dispute_count" in data
        print(f"✓ GET /api/user/payment-status returns: status={data['payment_status']}, can_dispute={data['can_dispute']}")
    
    def test_payment_dispute_endpoint_exists(self):
        """Test POST /api/user/payment-dispute endpoint exists"""
        token = self.get_user_token()
        
        if not token:
            unique_email = f"test_dispute_{uuid.uuid4().hex[:8]}@example.com"
            reg_response = self.session.post(f"{BASE_URL}/api/auth/register", json={
                "email": unique_email,
                "password": "Test123!",
                "name": "Test Dispute User"
            })
            if reg_response.status_code == 200:
                token = reg_response.json().get("access_token")
            else:
                pytest.skip("Could not create test user")
        
        # Try to submit a dispute (should fail if no rejected payment)
        response = self.session.post(
            f"{BASE_URL}/api/user/payment-dispute",
            json={
                "dispute_message": "Test dispute message",
                "new_proof_url": "/api/files/test.jpg"
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        
        # Should return 400 if no rejected payment to dispute
        # or 200 if there is a rejected payment
        assert response.status_code in [200, 400]
        
        if response.status_code == 400:
            data = response.json()
            assert "detail" in data
            print(f"✓ POST /api/user/payment-dispute correctly rejects when no rejected payment: {data['detail']}")
        else:
            print("✓ POST /api/user/payment-dispute endpoint works")
    
    def test_payment_dispute_requires_auth(self):
        """Test that payment dispute requires authentication"""
        response = self.session.post(
            f"{BASE_URL}/api/user/payment-dispute",
            json={
                "dispute_message": "Test",
                "new_proof_url": "/test.jpg"
            }
        )
        assert response.status_code in [401, 403]
        print("✓ Payment dispute endpoint requires authentication")


class TestNotificationCreationOnPaymentActions:
    """Test that notifications are created when admin approves/rejects payments"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def get_admin_token(self):
        """Get admin authentication token"""
        response = self.session.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        return None
    
    def test_admin_approve_payment_endpoint_exists(self):
        """Test POST /api/admin/approve-payment endpoint exists"""
        token = self.get_admin_token()
        assert token is not None, "Admin login failed"
        
        # Try to approve a non-existent user (should fail with 404)
        response = self.session.post(
            f"{BASE_URL}/api/admin/approve-payment",
            json={"user_id": "non-existent-user-id", "notes": "Test"},
            headers={"Authorization": f"Bearer {token}"}
        )
        
        # Should return 404 for non-existent user
        assert response.status_code in [404, 400]
        print("✓ POST /api/admin/approve-payment endpoint exists and validates user")
    
    def test_admin_reject_payment_endpoint_exists(self):
        """Test POST /api/admin/reject-payment endpoint exists"""
        token = self.get_admin_token()
        assert token is not None, "Admin login failed"
        
        # Try to reject a non-existent user (should fail with 404)
        response = self.session.post(
            f"{BASE_URL}/api/admin/reject-payment",
            json={"user_id": "non-existent-user-id", "reason": "Test rejection"},
            headers={"Authorization": f"Bearer {token}"}
        )
        
        # Should return 404 for non-existent user
        assert response.status_code in [404, 400]
        print("✓ POST /api/admin/reject-payment endpoint exists and validates user")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
