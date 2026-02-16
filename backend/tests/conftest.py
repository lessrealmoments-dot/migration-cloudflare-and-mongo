"""
Shared fixtures for PhotoShare API tests
"""
import pytest
import requests
import os
from datetime import datetime
from io import BytesIO
from PIL import Image

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://payment-fixes-7.preview.emergentagent.com').rstrip('/')

@pytest.fixture(scope="session")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture(scope="session")
def test_user_credentials():
    """Generate unique test user credentials"""
    timestamp = datetime.now().strftime('%H%M%S%f')
    return {
        "email": f"test_photographer_{timestamp}@example.com",
        "password": "TestPass123!",
        "name": "Test Photographer"
    }

@pytest.fixture(scope="session")
def registered_user(api_client, test_user_credentials):
    """Register a test user and return user data with token"""
    response = api_client.post(
        f"{BASE_URL}/api/auth/register",
        json=test_user_credentials
    )
    if response.status_code == 200:
        data = response.json()
        return {
            "token": data["access_token"],
            "user": data["user"],
            "credentials": test_user_credentials
        }
    pytest.skip(f"Registration failed: {response.status_code} - {response.text}")

@pytest.fixture(scope="session")
def auth_token(registered_user):
    """Get authentication token"""
    return registered_user["token"]

@pytest.fixture(scope="session")
def authenticated_client(api_client, auth_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client

@pytest.fixture
def test_image():
    """Create a test image file"""
    img = Image.new('RGB', (100, 100), color='red')
    img_bytes = BytesIO()
    img.save(img_bytes, format='JPEG')
    img_bytes.seek(0)
    return img_bytes

@pytest.fixture
def test_image_factory():
    """Factory to create multiple test images"""
    def create_image(color='red'):
        img = Image.new('RGB', (100, 100), color=color)
        img_bytes = BytesIO()
        img.save(img_bytes, format='JPEG')
        img_bytes.seek(0)
        return img_bytes
    return create_image
