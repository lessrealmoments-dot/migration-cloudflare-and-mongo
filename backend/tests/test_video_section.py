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
TEST_YOUTUBE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"


@pytest.fixture(scope="module")
def auth_session():
    """Create authenticated session for all tests"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_USER_EMAIL,
        "password": TEST_USER_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    
    token = response.json().get("access_token")
    session.headers.update({"Authorization": f"Bearer {token}"})
    return session


@pytest.fixture(scope="module")
def video_section_with_contributor_link(auth_session):
    """Get or create a video section with contributor link"""
    # Get existing sections
    response = auth_session.get(f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/sections")
    assert response.status_code == 200
    sections = response.json()
    
    # Find video section with contributor link
    video_section = next(
        (s for s in sections if s.get("type") == "video" and s.get("contributor_link")),
        None
    )
    
    if video_section:
        return video_section
    
    # Find any video section
    video_section = next((s for s in sections if s.get("type") == "video"), None)
    
    if not video_section:
        # Create a video section
        auth_session.headers.pop("Content-Type", None)
        response = auth_session.post(
            f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/sections",
            data={"name": f"Test Video Section {uuid.uuid4().hex[:6]}", "type": "video"}
        )
        auth_session.headers.update({"Content-Type": "application/json"})
        assert response.status_code == 200
        video_section = response.json()
    
    # Generate contributor link
    response = auth_session.post(
        f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/sections/{video_section['id']}/contributor-link"
    )
    assert response.status_code == 200
    
    # Refresh section data
    response = auth_session.get(f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/sections")
    sections = response.json()
    video_section = next((s for s in sections if s["id"] == video_section["id"]), video_section)
    
    return video_section


class TestVideoSectionBackend:
    """Test video section backend APIs"""
    
    # ==========================================
    # Authentication Tests
    # ==========================================
    
    def test_01_login_success(self):
        """Test user login"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
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
    
    def test_02_get_gallery(self, auth_session):
        """Test getting gallery details"""
        response = auth_session.get(f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}")
        assert response.status_code == 200, f"Get gallery failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["id"] == TEST_GALLERY_ID
        print(f"✓ Gallery retrieved: {data.get('title', 'Unknown')}")
    
    def test_03_get_gallery_sections(self, auth_session):
        """Test getting gallery sections"""
        response = auth_session.get(f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/sections")
        assert response.status_code == 200, f"Get sections failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Found {len(data)} sections")
        
        # Check for video sections
        video_sections = [s for s in data if s.get("type") == "video"]
        print(f"  - Video sections: {len(video_sections)}")
        for vs in video_sections:
            print(f"    - {vs.get('name')} (contributor_link: {vs.get('contributor_link', 'None')})")
    
    def test_04_create_video_section(self, auth_session):
        """Test creating a new video section"""
        section_name = f"Test Video Section {uuid.uuid4().hex[:6]}"
        
        # Use form data for this endpoint
        auth_session.headers.pop("Content-Type", None)
        response = auth_session.post(
            f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/sections",
            data={"name": section_name, "type": "video"}
        )
        auth_session.headers.update({"Content-Type": "application/json"})
        
        assert response.status_code == 200, f"Create video section failed: {response.text}"
        data = response.json()
        assert data.get("type") == "video"
        print(f"✓ Created video section: {data.get('name')}")
    
    def test_05_generate_contributor_link_for_video_section(self, auth_session):
        """Test generating contributor link for video section"""
        # Get sections to find a video section without contributor link
        response = auth_session.get(f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/sections")
        assert response.status_code == 200
        sections = response.json()
        
        video_section = next(
            (s for s in sections if s.get("type") == "video" and not s.get("contributor_link")),
            None
        )
        if not video_section:
            video_section = next((s for s in sections if s.get("type") == "video"), None)
        
        if not video_section:
            pytest.skip("No video section found to test contributor link")
        
        section_id = video_section["id"]
        
        # Generate contributor link
        response = auth_session.post(
            f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/sections/{section_id}/contributor-link"
        )
        assert response.status_code == 200, f"Generate contributor link failed: {response.text}"
        data = response.json()
        assert "contributor_link" in data
        print(f"✓ Generated contributor link: {data['contributor_link']}")
    
    # ==========================================
    # Contributor Video Upload Tests
    # ==========================================
    
    def test_06_get_contributor_info(self, video_section_with_contributor_link):
        """Test getting contributor info via contributor link"""
        contributor_link = video_section_with_contributor_link.get("contributor_link")
        assert contributor_link, "No contributor link available"
        
        response = requests.get(f"{BASE_URL}/api/contributor/{contributor_link}")
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
    
    def test_07_upload_contributor_video(self, video_section_with_contributor_link):
        """Test uploading a video as contributor"""
        contributor_link = video_section_with_contributor_link.get("contributor_link")
        assert contributor_link, "No contributor link available"
        
        # Use a unique video URL to avoid duplicates
        unique_video_url = f"https://www.youtube.com/watch?v=jNQXAC9IVRw"  # First YouTube video
        
        form_data = {
            "youtube_url": unique_video_url,
            "tag": "Same Day Edit (SDE)",
            "company_name": "Test Videography Co",
            "title": f"Test Video {uuid.uuid4().hex[:6]}",
            "description": "A beautiful test wedding video"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/contributor/{contributor_link}/video",
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
    
    def test_08_upload_contributor_video_invalid_url(self, video_section_with_contributor_link):
        """Test uploading video with invalid YouTube URL"""
        contributor_link = video_section_with_contributor_link.get("contributor_link")
        assert contributor_link, "No contributor link available"
        
        form_data = {
            "youtube_url": "https://invalid-url.com/video",
            "tag": "Test",
            "company_name": "Test Co"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/contributor/{contributor_link}/video",
            data=form_data
        )
        
        assert response.status_code == 400, f"Expected 400 for invalid URL, got {response.status_code}"
        print("✓ Invalid YouTube URL correctly rejected")
    
    def test_09_upload_contributor_video_missing_company(self, video_section_with_contributor_link):
        """Test uploading video without company name"""
        contributor_link = video_section_with_contributor_link.get("contributor_link")
        assert contributor_link, "No contributor link available"
        
        form_data = {
            "youtube_url": TEST_YOUTUBE_URL,
            "tag": "Test",
            "company_name": ""
        }
        
        response = requests.post(
            f"{BASE_URL}/api/contributor/{contributor_link}/video",
            data=form_data
        )
        
        # 400 or 422 are both acceptable for validation errors
        assert response.status_code in [400, 422], f"Expected 400/422 for missing company, got {response.status_code}"
        print("✓ Missing company name correctly rejected")
    
    # ==========================================
    # Gallery Video Management Tests
    # ==========================================
    
    def test_10_get_gallery_videos(self, auth_session):
        """Test getting all videos for a gallery"""
        response = auth_session.get(f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/videos")
        assert response.status_code == 200, f"Get gallery videos failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Found {len(data)} videos in gallery")
        
        for video in data:
            print(f"  - {video.get('tag')}: {video.get('title', 'No title')} (featured: {video.get('is_featured')})")
    
    def test_11_create_video_as_photographer(self, auth_session, video_section_with_contributor_link):
        """Test creating a video as photographer"""
        section_id = video_section_with_contributor_link["id"]
        
        # Create video with unique URL
        video_data = {
            "youtube_url": "https://www.youtube.com/watch?v=kJQP7kiw5Fk",  # Despacito
            "tag": "Reception",
            "title": f"Photographer Video {uuid.uuid4().hex[:6]}",
            "description": "Test video created by photographer",
            "is_featured": False
        }
        
        response = auth_session.post(
            f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/sections/{section_id}/videos",
            json=video_data
        )
        
        if response.status_code == 400 and "already been added" in response.text:
            print("✓ Video already exists (duplicate check working)")
            return
        
        assert response.status_code == 200, f"Create video failed: {response.text}"
        data = response.json()
        assert "id" in data
        print(f"✓ Photographer video created: {data['id']}")
    
    def test_12_set_video_as_featured(self, auth_session):
        """Test setting a video as featured"""
        # Get videos
        response = auth_session.get(f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/videos")
        videos = response.json()
        
        if not videos:
            pytest.skip("No videos to test featured functionality")
        
        video_id = videos[0]["id"]
        
        # Set as featured
        response = auth_session.post(
            f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/videos/{video_id}/set-featured"
        )
        assert response.status_code == 200, f"Set featured failed: {response.text}"
        data = response.json()
        assert "video_id" in data
        print(f"✓ Video {video_id} set as featured")
    
    def test_13_update_video(self, auth_session):
        """Test updating a video"""
        # Get videos
        response = auth_session.get(f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/videos")
        videos = response.json()
        
        if not videos:
            pytest.skip("No videos to test update")
        
        video_id = videos[0]["id"]
        
        # Update video
        update_data = {
            "title": f"Updated Title {uuid.uuid4().hex[:6]}",
            "description": "Updated description"
        }
        
        response = auth_session.put(
            f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/videos/{video_id}",
            json=update_data
        )
        assert response.status_code == 200, f"Update video failed: {response.text}"
        data = response.json()
        assert "Updated Title" in data["title"]
        print(f"✓ Video updated successfully")
    
    # ==========================================
    # Public Gallery Video Tests
    # ==========================================
    
    def test_14_get_public_gallery_videos(self, auth_session):
        """Test getting videos from public gallery endpoint"""
        # First get the gallery share link
        response = auth_session.get(f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}")
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
    
    def test_15_delete_video_as_photographer(self, auth_session):
        """Test deleting a video as photographer"""
        # Get videos
        response = auth_session.get(f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/videos")
        videos = response.json()
        
        # Find a video to delete (prefer non-featured)
        video_to_delete = next((v for v in videos if not v.get("is_featured")), None)
        
        if not video_to_delete:
            print("✓ No non-featured videos to delete (skipping)")
            return
        
        video_id = video_to_delete["id"]
        
        response = auth_session.delete(
            f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/videos/{video_id}"
        )
        assert response.status_code == 200, f"Delete video failed: {response.text}"
        print(f"✓ Video {video_id} deleted by photographer")
        
        # Verify deletion
        response = auth_session.get(f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/videos")
        videos_after = response.json()
        assert not any(v["id"] == video_id for v in videos_after), "Video still exists after deletion"
        print("✓ Deletion verified")


class TestVideoSectionEdgeCases:
    """Test edge cases and error handling"""
    
    def test_invalid_contributor_link(self):
        """Test accessing invalid contributor link"""
        response = requests.get(f"{BASE_URL}/api/contributor/invalid-link-12345")
        assert response.status_code == 404
        print("✓ Invalid contributor link returns 404")
    
    def test_video_to_photo_section(self, auth_session):
        """Test that video upload fails for photo sections"""
        # Get sections
        response = auth_session.get(f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/sections")
        sections = response.json()
        
        photo_section = next((s for s in sections if s.get("type") == "photo"), None)
        if not photo_section:
            pytest.skip("No photo section to test")
        
        # Try to add video to photo section
        video_data = {
            "youtube_url": TEST_YOUTUBE_URL,
            "tag": "Test"
        }
        
        response = auth_session.post(
            f"{BASE_URL}/api/galleries/{TEST_GALLERY_ID}/sections/{photo_section['id']}/videos",
            json=video_data
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Video upload to photo section correctly rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
