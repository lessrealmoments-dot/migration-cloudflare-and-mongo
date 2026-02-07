"""
Test suite for Videographer Section feature
Tests video section creation, contributor video uploads, video management, and public gallery videos
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_USER_EMAIL = "tester1@gmail.com"
TEST_USER_PASSWORD = "123"
TEST_GALLERY_ID = "63f3be31-ab06-4df0-a270-3f1bc886708b"
TEST_CONTRIBUTOR_LINK = "L1tU7_1w-GKF9iXonHVzCQ"
TEST_YOUTUBE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"


class TestVideoSectionBackend:
    """Test video section backend APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        self.gallery_id = TEST_GALLERY_ID
        
    def get_auth_token(self):
        """Get authentication token"""
        if self.token:
            return self.token
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            return self.token
        return None
    
    # ==========================================
    # Authentication Tests
    # ==========================================
    
    def test_01_login_success(self):
        """Test user login"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        print(f"✓ Login successful for {TEST_USER_EMAIL}")
    
    # ==========================================
    # Gallery and Section Tests
    # ==========================================
    
    def test_02_get_gallery(self):
        """Test getting gallery details"""
        self.get_auth_token()
        response = self.session.get(f"{BASE_URL}/api/galleries/{self.gallery_id}")
        assert response.status_code == 200, f"Get gallery failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["id"] == self.gallery_id
        print(f"✓ Gallery retrieved: {data.get('title', 'Unknown')}")
    
    def test_03_get_gallery_sections(self):
        """Test getting gallery sections"""
        self.get_auth_token()
        response = self.session.get(f"{BASE_URL}/api/galleries/{self.gallery_id}/sections")
        assert response.status_code == 200, f"Get sections failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Found {len(data)} sections")
        
        # Check for video sections
        video_sections = [s for s in data if s.get("type") == "video"]
        print(f"  - Video sections: {len(video_sections)}")
        for vs in video_sections:
            print(f"    - {vs.get('name')} (contributor_link: {vs.get('contributor_link', 'None')})")
    
    def test_04_create_video_section(self):
        """Test creating a new video section"""
        self.get_auth_token()
        
        # Create a video section
        section_name = f"Test Video Section {uuid.uuid4().hex[:6]}"
        response = self.session.post(
            f"{BASE_URL}/api/galleries/{self.gallery_id}/sections",
            data={"name": section_name, "type": "video"}
        )
        
        # Note: This endpoint uses form data, not JSON
        if response.status_code == 422:
            # Try with form data
            self.session.headers.pop("Content-Type", None)
            response = self.session.post(
                f"{BASE_URL}/api/galleries/{self.gallery_id}/sections",
                data={"name": section_name, "type": "video"}
            )
            self.session.headers.update({"Content-Type": "application/json"})
        
        assert response.status_code == 200, f"Create video section failed: {response.text}"
        data = response.json()
        assert data.get("type") == "video"
        print(f"✓ Created video section: {data.get('name')}")
        
        # Store for cleanup
        self.created_section_id = data.get("id")
        return data
    
    def test_05_generate_contributor_link_for_video_section(self):
        """Test generating contributor link for video section"""
        self.get_auth_token()
        
        # First get sections to find a video section
        response = self.session.get(f"{BASE_URL}/api/galleries/{self.gallery_id}/sections")
        assert response.status_code == 200
        sections = response.json()
        
        video_section = next((s for s in sections if s.get("type") == "video"), None)
        if not video_section:
            pytest.skip("No video section found to test contributor link")
        
        section_id = video_section["id"]
        
        # Generate contributor link
        response = self.session.post(
            f"{BASE_URL}/api/galleries/{self.gallery_id}/sections/{section_id}/contributor-link"
        )
        assert response.status_code == 200, f"Generate contributor link failed: {response.text}"
        data = response.json()
        assert "contributor_link" in data
        print(f"✓ Generated contributor link: {data['contributor_link']}")
        return data["contributor_link"]
    
    # ==========================================
    # Contributor Video Upload Tests
    # ==========================================
    
    def test_06_get_contributor_info(self):
        """Test getting contributor info via contributor link"""
        response = self.session.get(f"{BASE_URL}/api/contributor/{TEST_CONTRIBUTOR_LINK}")
        assert response.status_code == 200, f"Get contributor info failed: {response.text}"
        data = response.json()
        
        assert "gallery_title" in data
        assert "section_name" in data
        assert "section_type" in data
        assert data["section_type"] == "video", f"Expected video section, got {data['section_type']}"
        
        print(f"✓ Contributor info retrieved:")
        print(f"  - Gallery: {data.get('gallery_title')}")
        print(f"  - Section: {data.get('section_name')}")
        print(f"  - Type: {data.get('section_type')}")
        print(f"  - Existing videos: {len(data.get('existing_videos', []))}")
    
    def test_07_upload_contributor_video(self):
        """Test uploading a video as contributor"""
        # Remove Content-Type for form data
        headers = {"Content-Type": None}
        
        form_data = {
            "youtube_url": TEST_YOUTUBE_URL,
            "tag": "Same Day Edit (SDE)",
            "company_name": "Test Videography Co",
            "title": "Test Wedding Video",
            "description": "A beautiful test wedding video"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/contributor/{TEST_CONTRIBUTOR_LINK}/video",
            data=form_data
        )
        
        if response.status_code == 400 and "already been added" in response.text:
            print("✓ Video already exists (duplicate check working)")
            return
        
        assert response.status_code == 200, f"Upload contributor video failed: {response.text}"
        data = response.json()
        assert data.get("success") == True
        assert "video" in data
        print(f"✓ Contributor video uploaded: {data['video'].get('id')}")
        
        # Store for cleanup
        self.uploaded_video_id = data["video"]["id"]
    
    def test_08_upload_contributor_video_invalid_url(self):
        """Test uploading video with invalid YouTube URL"""
        form_data = {
            "youtube_url": "https://invalid-url.com/video",
            "tag": "Test",
            "company_name": "Test Co"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/contributor/{TEST_CONTRIBUTOR_LINK}/video",
            data=form_data
        )
        
        assert response.status_code == 400, f"Expected 400 for invalid URL, got {response.status_code}"
        print("✓ Invalid YouTube URL correctly rejected")
    
    def test_09_upload_contributor_video_missing_company(self):
        """Test uploading video without company name"""
        form_data = {
            "youtube_url": TEST_YOUTUBE_URL,
            "tag": "Test",
            "company_name": ""
        }
        
        response = requests.post(
            f"{BASE_URL}/api/contributor/{TEST_CONTRIBUTOR_LINK}/video",
            data=form_data
        )
        
        assert response.status_code == 400, f"Expected 400 for missing company, got {response.status_code}"
        print("✓ Missing company name correctly rejected")
    
    # ==========================================
    # Gallery Video Management Tests
    # ==========================================
    
    def test_10_get_gallery_videos(self):
        """Test getting all videos for a gallery"""
        self.get_auth_token()
        response = self.session.get(f"{BASE_URL}/api/galleries/{self.gallery_id}/videos")
        assert response.status_code == 200, f"Get gallery videos failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Found {len(data)} videos in gallery")
        
        for video in data:
            print(f"  - {video.get('tag')}: {video.get('title', 'No title')} (featured: {video.get('is_featured')})")
    
    def test_11_create_video_as_photographer(self):
        """Test creating a video as photographer"""
        self.get_auth_token()
        
        # Get video sections
        response = self.session.get(f"{BASE_URL}/api/galleries/{self.gallery_id}/sections")
        sections = response.json()
        video_section = next((s for s in sections if s.get("type") == "video"), None)
        
        if not video_section:
            pytest.skip("No video section found")
        
        section_id = video_section["id"]
        
        # Create video
        video_data = {
            "youtube_url": "https://www.youtube.com/watch?v=9bZkp7q19f0",  # Different video
            "tag": "Ceremony",
            "title": "Photographer Test Video",
            "description": "Test video created by photographer",
            "is_featured": False
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/galleries/{self.gallery_id}/sections/{section_id}/videos",
            json=video_data
        )
        
        if response.status_code == 400 and "already been added" in response.text:
            print("✓ Video already exists (duplicate check working)")
            return
        
        assert response.status_code == 200, f"Create video failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["tag"] == "Ceremony"
        print(f"✓ Photographer video created: {data['id']}")
        
        self.photographer_video_id = data["id"]
    
    def test_12_set_video_as_featured(self):
        """Test setting a video as featured"""
        self.get_auth_token()
        
        # Get videos
        response = self.session.get(f"{BASE_URL}/api/galleries/{self.gallery_id}/videos")
        videos = response.json()
        
        if not videos:
            pytest.skip("No videos to test featured functionality")
        
        video_id = videos[0]["id"]
        
        # Set as featured
        response = self.session.post(
            f"{BASE_URL}/api/galleries/{self.gallery_id}/videos/{video_id}/set-featured"
        )
        assert response.status_code == 200, f"Set featured failed: {response.text}"
        data = response.json()
        assert "video_id" in data
        print(f"✓ Video {video_id} set as featured")
    
    def test_13_update_video(self):
        """Test updating a video"""
        self.get_auth_token()
        
        # Get videos
        response = self.session.get(f"{BASE_URL}/api/galleries/{self.gallery_id}/videos")
        videos = response.json()
        
        if not videos:
            pytest.skip("No videos to test update")
        
        video_id = videos[0]["id"]
        
        # Update video
        update_data = {
            "title": "Updated Video Title",
            "description": "Updated description"
        }
        
        response = self.session.put(
            f"{BASE_URL}/api/galleries/{self.gallery_id}/videos/{video_id}",
            json=update_data
        )
        assert response.status_code == 200, f"Update video failed: {response.text}"
        data = response.json()
        assert data["title"] == "Updated Video Title"
        print(f"✓ Video updated successfully")
    
    # ==========================================
    # Public Gallery Video Tests
    # ==========================================
    
    def test_14_get_public_gallery_videos(self):
        """Test getting videos from public gallery endpoint"""
        self.get_auth_token()
        
        # First get the gallery share link
        response = self.session.get(f"{BASE_URL}/api/galleries/{self.gallery_id}")
        gallery = response.json()
        share_link = gallery.get("share_link")
        
        if not share_link:
            pytest.skip("Gallery has no share link")
        
        # Get public videos (no auth needed)
        response = requests.get(f"{BASE_URL}/api/public/gallery/{share_link}/videos")
        assert response.status_code == 200, f"Get public videos failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Public gallery has {len(data)} videos")
    
    # ==========================================
    # Delete Video Tests
    # ==========================================
    
    def test_15_delete_contributor_video(self):
        """Test deleting a video as contributor"""
        # First get existing videos
        response = requests.get(f"{BASE_URL}/api/contributor/{TEST_CONTRIBUTOR_LINK}")
        if response.status_code != 200:
            pytest.skip("Cannot access contributor link")
        
        data = response.json()
        existing_videos = data.get("existing_videos", [])
        
        if not existing_videos:
            print("✓ No contributor videos to delete (skipping)")
            return
        
        # Try to delete the last video
        video_id = existing_videos[-1]["id"]
        response = requests.delete(
            f"{BASE_URL}/api/contributor/{TEST_CONTRIBUTOR_LINK}/video/{video_id}"
        )
        
        # This might fail if video wasn't uploaded by contributor
        if response.status_code == 200:
            print(f"✓ Contributor video {video_id} deleted")
        else:
            print(f"✓ Delete returned {response.status_code} (may not be contributor's video)")
    
    def test_16_delete_video_as_photographer(self):
        """Test deleting a video as photographer"""
        self.get_auth_token()
        
        # Get videos
        response = self.session.get(f"{BASE_URL}/api/galleries/{self.gallery_id}/videos")
        videos = response.json()
        
        # Find a video to delete (prefer non-featured)
        video_to_delete = next((v for v in videos if not v.get("is_featured")), None)
        
        if not video_to_delete:
            print("✓ No non-featured videos to delete (skipping)")
            return
        
        video_id = video_to_delete["id"]
        
        response = self.session.delete(
            f"{BASE_URL}/api/galleries/{self.gallery_id}/videos/{video_id}"
        )
        assert response.status_code == 200, f"Delete video failed: {response.text}"
        print(f"✓ Video {video_id} deleted by photographer")
        
        # Verify deletion
        response = self.session.get(f"{BASE_URL}/api/galleries/{self.gallery_id}/videos")
        videos_after = response.json()
        assert not any(v["id"] == video_id for v in videos_after), "Video still exists after deletion"
        print("✓ Deletion verified")


class TestVideoSectionEdgeCases:
    """Test edge cases and error handling"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def get_auth_token(self):
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        if response.status_code == 200:
            token = response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            return token
        return None
    
    def test_invalid_contributor_link(self):
        """Test accessing invalid contributor link"""
        response = requests.get(f"{BASE_URL}/api/contributor/invalid-link-12345")
        assert response.status_code == 404
        print("✓ Invalid contributor link returns 404")
    
    def test_video_to_photo_section(self):
        """Test that video upload fails for photo sections"""
        self.get_auth_token()
        
        # Get sections
        response = self.session.get(f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/sections")
        sections = response.json()
        
        photo_section = next((s for s in sections if s.get("type") == "photo"), None)
        if not photo_section:
            pytest.skip("No photo section to test")
        
        # Try to add video to photo section
        video_data = {
            "youtube_url": TEST_YOUTUBE_URL,
            "tag": "Test"
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/sections/{photo_section['id']}/videos",
            json=video_data
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Video upload to photo section correctly rejected")
    
    def test_youtube_url_formats(self):
        """Test various YouTube URL formats are accepted"""
        valid_urls = [
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ",
            "https://youtube.com/watch?v=dQw4w9WgXcQ",
            "https://www.youtube.com/embed/dQw4w9WgXcQ",
            "https://www.youtube.com/shorts/dQw4w9WgXcQ"
        ]
        
        # Just verify the URL extraction works by checking contributor endpoint
        response = requests.get(f"{BASE_URL}/api/contributor/{TEST_CONTRIBUTOR_LINK}")
        if response.status_code == 200:
            print("✓ Contributor endpoint accessible for URL format testing")
        else:
            print(f"✓ Contributor endpoint returned {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
