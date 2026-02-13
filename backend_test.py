#!/usr/bin/env python3

import requests
import sys
import json
import os
from datetime import datetime
from io import BytesIO
from PIL import Image

class PhotoShareAPITester:
    def __init__(self, base_url="https://imagebay-2.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        
        # Test data
        self.test_email = f"test_photographer_{datetime.now().strftime('%H%M%S')}@example.com"
        self.test_password = "TestPass123!"
        self.test_name = "Test Photographer"
        
        # Gallery and photo IDs for cleanup
        self.created_galleries = []
        self.created_photos = []

    def log_result(self, test_name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {test_name} - PASSED")
        else:
            print(f"❌ {test_name} - FAILED: {details}")
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details
        })

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None, headers=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        
        if headers:
            test_headers.update(headers)
        
        if files:
            # Remove Content-Type for multipart/form-data
            test_headers.pop('Content-Type', None)

        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        print(f"   Method: {method}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, params=data)
            elif method == 'POST':
                if files:
                    response = requests.post(url, data=data, files=files, headers=test_headers)
                else:
                    response = requests.post(url, json=data, headers=test_headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers)

            success = response.status_code == expected_status
            
            if success:
                print(f"   ✅ Status: {response.status_code}")
                try:
                    return True, response.json() if response.content else {}
                except:
                    return True, {}
            else:
                error_detail = f"Expected {expected_status}, got {response.status_code}"
                try:
                    error_detail += f" - {response.json()}"
                except:
                    error_detail += f" - {response.text}"
                print(f"   ❌ {error_detail}")
                return False, {}

        except Exception as e:
            print(f"   ❌ Exception: {str(e)}")
            return False, {}

    def create_test_image(self):
        """Create a test image file"""
        img = Image.new('RGB', (100, 100), color='red')
        img_bytes = BytesIO()
        img.save(img_bytes, format='JPEG')
        img_bytes.seek(0)
        return img_bytes

    def test_auth_register(self):
        """Test user registration"""
        success, response = self.run_test(
            "User Registration",
            "POST",
            "auth/register",
            200,
            data={
                "email": self.test_email,
                "password": self.test_password,
                "name": self.test_name
            }
        )
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_id = response['user']['id']
            self.log_result("User Registration", True)
            return True
        else:
            self.log_result("User Registration", False, "No access token received")
            return False

    def test_auth_login(self):
        """Test user login"""
        success, response = self.run_test(
            "User Login",
            "POST",
            "auth/login",
            200,
            data={
                "email": self.test_email,
                "password": self.test_password
            }
        )
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.log_result("User Login", True)
            return True
        else:
            self.log_result("User Login", False, "Login failed")
            return False

    def test_auth_me(self):
        """Test get current user"""
        success, response = self.run_test(
            "Get Current User",
            "GET",
            "auth/me",
            200
        )
        
        if success and response.get('email') == self.test_email:
            self.log_result("Get Current User", True)
            return True
        else:
            self.log_result("Get Current User", False, "User data mismatch")
            return False

    def test_create_gallery(self):
        """Test gallery creation"""
        gallery_data = {
            "title": "Test Gallery",
            "description": "A test gallery for API testing",
            "password": None
        }
        
        success, response = self.run_test(
            "Create Gallery (Public)",
            "POST",
            "galleries",
            200,
            data=gallery_data
        )
        
        if success and 'id' in response:
            self.created_galleries.append(response)
            self.log_result("Create Gallery (Public)", True)
            return response
        else:
            self.log_result("Create Gallery (Public)", False, "Gallery creation failed")
            return None

    def test_create_protected_gallery(self):
        """Test protected gallery creation"""
        gallery_data = {
            "title": "Protected Test Gallery",
            "description": "A password-protected test gallery",
            "password": "secret123"
        }
        
        success, response = self.run_test(
            "Create Gallery (Protected)",
            "POST",
            "galleries",
            200,
            data=gallery_data
        )
        
        if success and 'id' in response and response.get('has_password'):
            self.created_galleries.append(response)
            self.log_result("Create Gallery (Protected)", True)
            return response
        else:
            self.log_result("Create Gallery (Protected)", False, "Protected gallery creation failed")
            return None

    def test_get_galleries(self):
        """Test get user galleries"""
        success, response = self.run_test(
            "Get User Galleries",
            "GET",
            "galleries",
            200
        )
        
        if success and isinstance(response, list):
            self.log_result("Get User Galleries", True)
            return True
        else:
            self.log_result("Get User Galleries", False, "Failed to get galleries")
            return False

    def test_upload_photo(self, gallery):
        """Test photo upload by photographer"""
        if not gallery:
            self.log_result("Upload Photo (Photographer)", False, "No gallery available")
            return None
            
        img_file = self.create_test_image()
        
        success, response = self.run_test(
            "Upload Photo (Photographer)",
            "POST",
            f"galleries/{gallery['id']}/photos",
            200,
            files={'file': ('test.jpg', img_file, 'image/jpeg')}
        )
        
        if success and 'id' in response:
            self.created_photos.append(response)
            self.log_result("Upload Photo (Photographer)", True)
            return response
        else:
            self.log_result("Upload Photo (Photographer)", False, "Photo upload failed")
            return None

    def test_get_gallery_photos(self, gallery):
        """Test get gallery photos"""
        if not gallery:
            self.log_result("Get Gallery Photos", False, "No gallery available")
            return False
            
        success, response = self.run_test(
            "Get Gallery Photos",
            "GET",
            f"galleries/{gallery['id']}/photos",
            200
        )
        
        if success and isinstance(response, list):
            self.log_result("Get Gallery Photos", True)
            return True
        else:
            self.log_result("Get Gallery Photos", False, "Failed to get photos")
            return False

    def test_public_gallery_access(self, gallery):
        """Test public gallery access"""
        if not gallery:
            self.log_result("Public Gallery Access", False, "No gallery available")
            return False
            
        success, response = self.run_test(
            "Public Gallery Access",
            "GET",
            f"public/gallery/{gallery['share_link']}",
            200
        )
        
        if success and response.get('title') == gallery['title']:
            self.log_result("Public Gallery Access", True)
            return True
        else:
            self.log_result("Public Gallery Access", False, "Public access failed")
            return False

    def test_public_gallery_photos(self, gallery):
        """Test public gallery photos access"""
        if not gallery:
            self.log_result("Public Gallery Photos", False, "No gallery available")
            return False
            
        success, response = self.run_test(
            "Public Gallery Photos",
            "GET",
            f"public/gallery/{gallery['share_link']}/photos",
            200
        )
        
        if success and isinstance(response, list):
            self.log_result("Public Gallery Photos", True)
            return True
        else:
            self.log_result("Public Gallery Photos", False, "Failed to get public photos")
            return False

    def test_guest_upload(self, gallery):
        """Test guest photo upload (KEY FEATURE)"""
        if not gallery:
            self.log_result("Guest Photo Upload", False, "No gallery available")
            return None
            
        img_file = self.create_test_image()
        
        # Test without authentication (guest upload)
        old_token = self.token
        self.token = None
        
        success, response = self.run_test(
            "Guest Photo Upload",
            "POST",
            f"public/gallery/{gallery['share_link']}/upload",
            200,
            files={'file': ('guest_test.jpg', img_file, 'image/jpeg')}
        )
        
        self.token = old_token
        
        if success and 'id' in response and response.get('uploaded_by') == 'guest':
            self.created_photos.append(response)
            self.log_result("Guest Photo Upload", True)
            return response
        else:
            self.log_result("Guest Photo Upload", False, "Guest upload failed")
            return None

    def test_protected_gallery_password(self, protected_gallery):
        """Test protected gallery password verification"""
        if not protected_gallery:
            self.log_result("Protected Gallery Password", False, "No protected gallery available")
            return False
            
        # Test with correct password
        success, response = self.run_test(
            "Protected Gallery Password (Correct)",
            "POST",
            f"public/gallery/{protected_gallery['share_link']}/verify-password",
            200,
            data={"password": "secret123"}
        )
        
        if success and response.get('valid'):
            self.log_result("Protected Gallery Password (Correct)", True)
            
            # Test with wrong password
            success, response = self.run_test(
                "Protected Gallery Password (Wrong)",
                "POST",
                f"public/gallery/{protected_gallery['share_link']}/verify-password",
                401,
                data={"password": "wrongpassword"}
            )
            
            if success:  # 401 is expected for wrong password
                self.log_result("Protected Gallery Password (Wrong)", True)
                return True
            else:
                self.log_result("Protected Gallery Password (Wrong)", False, "Should reject wrong password")
                return False
        else:
            self.log_result("Protected Gallery Password (Correct)", False, "Password verification failed")
            return False

    def test_guest_upload_protected(self, protected_gallery):
        """Test guest upload to protected gallery"""
        if not protected_gallery:
            self.log_result("Guest Upload (Protected)", False, "No protected gallery available")
            return None
            
        img_file = self.create_test_image()
        
        # Test without authentication (guest upload with password)
        old_token = self.token
        self.token = None
        
        success, response = self.run_test(
            "Guest Upload (Protected)",
            "POST",
            f"public/gallery/{protected_gallery['share_link']}/upload",
            200,
            data={'password': 'secret123'},
            files={'file': ('guest_protected.jpg', img_file, 'image/jpeg')}
        )
        
        self.token = old_token
        
        if success and 'id' in response and response.get('uploaded_by') == 'guest':
            self.created_photos.append(response)
            self.log_result("Guest Upload (Protected)", True)
            return response
        else:
            self.log_result("Guest Upload (Protected)", False, "Protected guest upload failed")
            return None

    def test_photo_serving(self, photo):
        """Test photo file serving"""
        if not photo:
            self.log_result("Photo File Serving", False, "No photo available")
            return False
            
        # Extract filename from URL
        filename = photo['url'].split('/')[-1]
        
        success, _ = self.run_test(
            "Photo File Serving",
            "GET",
            f"photos/serve/{filename}",
            200
        )
        
        if success:
            self.log_result("Photo File Serving", True)
            return True
        else:
            self.log_result("Photo File Serving", False, "Photo serving failed")
            return False

    def test_delete_photo(self, photo):
        """Test photo deletion"""
        if not photo:
            self.log_result("Delete Photo", False, "No photo available")
            return False
            
        success, response = self.run_test(
            "Delete Photo",
            "DELETE",
            f"photos/{photo['id']}",
            200
        )
        
        if success:
            self.log_result("Delete Photo", True)
            return True
        else:
            self.log_result("Delete Photo", False, "Photo deletion failed")
            return False

    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting PhotoShare API Tests")
        print(f"📍 Base URL: {self.base_url}")
        print("=" * 60)
        
        # Authentication Tests
        if not self.test_auth_register():
            print("❌ Registration failed, stopping tests")
            return False
            
        if not self.test_auth_login():
            print("❌ Login failed, stopping tests")
            return False
            
        if not self.test_auth_me():
            print("❌ Get user failed, stopping tests")
            return False
        
        # Gallery Tests
        public_gallery = self.test_create_gallery()
        protected_gallery = self.test_create_protected_gallery()
        
        if not self.test_get_galleries():
            print("❌ Get galleries failed")
        
        # Photo Upload Tests (Photographer)
        photo = None
        if public_gallery:
            photo = self.test_upload_photo(public_gallery)
            self.test_get_gallery_photos(public_gallery)
        
        # Public Access Tests
        if public_gallery:
            self.test_public_gallery_access(public_gallery)
            self.test_public_gallery_photos(public_gallery)
            
            # KEY FEATURE: Guest Upload
            guest_photo = self.test_guest_upload(public_gallery)
        
        # Protected Gallery Tests
        if protected_gallery:
            self.test_protected_gallery_password(protected_gallery)
            self.test_guest_upload_protected(protected_gallery)
        
        # Photo Serving Tests
        if photo:
            self.test_photo_serving(photo)
        
        # Cleanup Tests
        if photo:
            self.test_delete_photo(photo)
        
        # Print Results
        print("\n" + "=" * 60)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return True
        else:
            print("⚠️  Some tests failed. Check details above.")
            return False

def main():
    tester = PhotoShareAPITester()
    success = tester.run_all_tests()
    
    # Save detailed results
    results = {
        "timestamp": datetime.now().isoformat(),
        "total_tests": tester.tests_run,
        "passed_tests": tester.tests_passed,
        "success_rate": f"{(tester.tests_passed/tester.tests_run*100):.1f}%" if tester.tests_run > 0 else "0%",
        "test_details": tester.test_results
    }
    
    with open('/app/backend_test_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())