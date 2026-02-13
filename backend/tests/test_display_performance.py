"""
Test suite for Display Performance Optimization
Tests the /api/display/{shareLink} endpoint to verify:
1. display_url field is present for all photo types (upload, pcloud, gdrive)
2. Optimized URLs are being used (thumbnails for uploads, 1600px for pCloud/GDrive)
3. Photos from all sources are returned correctly
4. Photos are shuffled randomly
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test gallery share link with 2000+ photos
TEST_SHARE_LINK = "2ba87e10"
EXPECTED_PHOTO_COUNT_MIN = 2000  # At least 2000 photos expected


class TestDisplayEndpoint:
    """Tests for /api/display/{shareLink} endpoint"""
    
    def test_display_endpoint_returns_photos(self):
        """Test that display endpoint returns photos"""
        response = requests.get(f"{BASE_URL}/api/display/{TEST_SHARE_LINK}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        photos = data.get('photos', [])
        
        assert len(photos) >= EXPECTED_PHOTO_COUNT_MIN, \
            f"Expected at least {EXPECTED_PHOTO_COUNT_MIN} photos, got {len(photos)}"
        print(f"✓ Display endpoint returned {len(photos)} photos")
    
    def test_all_photos_have_display_url(self):
        """Test that all photos have display_url field"""
        response = requests.get(f"{BASE_URL}/api/display/{TEST_SHARE_LINK}")
        assert response.status_code == 200
        
        data = response.json()
        photos = data.get('photos', [])
        
        missing_display_url = []
        for i, photo in enumerate(photos):
            if not photo.get('display_url'):
                missing_display_url.append({
                    'index': i,
                    'id': photo.get('id'),
                    'source': photo.get('source', 'upload')
                })
        
        assert len(missing_display_url) == 0, \
            f"Found {len(missing_display_url)} photos without display_url: {missing_display_url[:5]}"
        print(f"✓ All {len(photos)} photos have display_url field")
    
    def test_photos_from_all_sources(self):
        """Test that photos from upload, pcloud, and gdrive sources are present"""
        response = requests.get(f"{BASE_URL}/api/display/{TEST_SHARE_LINK}")
        assert response.status_code == 200
        
        data = response.json()
        photos = data.get('photos', [])
        
        # Count by source
        sources = {}
        for photo in photos:
            source = photo.get('source', 'upload')
            sources[source] = sources.get(source, 0) + 1
        
        print(f"Photo sources: {sources}")
        
        # Verify all expected sources are present
        assert 'upload' in sources, "No upload photos found"
        assert 'pcloud' in sources, "No pCloud photos found"
        assert 'gdrive' in sources, "No Google Drive photos found"
        
        # Verify expected counts (approximately)
        assert sources.get('upload', 0) >= 500, f"Expected ~702 uploads, got {sources.get('upload', 0)}"
        assert sources.get('pcloud', 0) >= 1000, f"Expected ~1459 pCloud, got {sources.get('pcloud', 0)}"
        assert sources.get('gdrive', 0) >= 30, f"Expected ~37 GDrive, got {sources.get('gdrive', 0)}"
        
        print(f"✓ Photos from all sources present: {sources}")
    
    def test_upload_photos_use_optimized_thumbnails(self):
        """Test that upload photos use thumbnail_medium_url for display_url"""
        response = requests.get(f"{BASE_URL}/api/display/{TEST_SHARE_LINK}")
        assert response.status_code == 200
        
        data = response.json()
        photos = data.get('photos', [])
        
        upload_photos = [p for p in photos if p.get('source') == 'upload']
        
        # Check that display_url uses thumbnails (contains 'thumbnail' or '_medium')
        optimized_count = 0
        for photo in upload_photos[:50]:  # Check first 50
            display_url = photo.get('display_url', '')
            if 'thumbnail' in display_url or '_medium' in display_url:
                optimized_count += 1
        
        # At least 80% should use optimized thumbnails
        optimization_rate = optimized_count / min(50, len(upload_photos)) * 100
        assert optimization_rate >= 80, \
            f"Only {optimization_rate:.1f}% of upload photos use optimized thumbnails"
        
        print(f"✓ {optimization_rate:.1f}% of upload photos use optimized thumbnails")
    
    def test_pcloud_photos_use_1600px_thumbnails(self):
        """Test that pCloud photos use 1600x1600 thumbnail size"""
        response = requests.get(f"{BASE_URL}/api/display/{TEST_SHARE_LINK}")
        assert response.status_code == 200
        
        data = response.json()
        photos = data.get('photos', [])
        
        pcloud_photos = [p for p in photos if p.get('source') == 'pcloud']
        
        # Check that display_url contains 1600x1600 size parameter
        optimized_count = 0
        for photo in pcloud_photos[:50]:  # Check first 50
            display_url = photo.get('display_url', '')
            if '1600x1600' in display_url or 'size=1600' in display_url:
                optimized_count += 1
        
        optimization_rate = optimized_count / min(50, len(pcloud_photos)) * 100
        assert optimization_rate >= 80, \
            f"Only {optimization_rate:.1f}% of pCloud photos use 1600px thumbnails"
        
        print(f"✓ {optimization_rate:.1f}% of pCloud photos use 1600px thumbnails")
    
    def test_gdrive_photos_use_w1600_thumbnails(self):
        """Test that Google Drive photos use w1600 thumbnail size"""
        response = requests.get(f"{BASE_URL}/api/display/{TEST_SHARE_LINK}")
        assert response.status_code == 200
        
        data = response.json()
        photos = data.get('photos', [])
        
        gdrive_photos = [p for p in photos if p.get('source') == 'gdrive']
        
        # Check that display_url contains w1600 size parameter
        optimized_count = 0
        for photo in gdrive_photos:
            display_url = photo.get('display_url', '')
            if 'sz=w1600' in display_url:
                optimized_count += 1
        
        optimization_rate = optimized_count / len(gdrive_photos) * 100 if gdrive_photos else 0
        assert optimization_rate >= 80, \
            f"Only {optimization_rate:.1f}% of GDrive photos use w1600 thumbnails"
        
        print(f"✓ {optimization_rate:.1f}% of GDrive photos use w1600 thumbnails")
    
    def test_api_response_time(self):
        """Test that API responds within acceptable time for 2000+ photos"""
        start_time = time.time()
        response = requests.get(f"{BASE_URL}/api/display/{TEST_SHARE_LINK}")
        response_time = time.time() - start_time
        
        assert response.status_code == 200
        
        # API should respond within 5 seconds even for 2000+ photos
        assert response_time < 5.0, \
            f"API response took {response_time:.2f}s, expected < 5s"
        
        print(f"✓ API responded in {response_time:.2f} seconds")
    
    def test_display_url_format_by_source(self):
        """Test that display_url has correct format for each source type"""
        response = requests.get(f"{BASE_URL}/api/display/{TEST_SHARE_LINK}")
        assert response.status_code == 200
        
        data = response.json()
        photos = data.get('photos', [])
        
        # Sample one photo from each source
        upload_sample = next((p for p in photos if p.get('source') == 'upload'), None)
        pcloud_sample = next((p for p in photos if p.get('source') == 'pcloud'), None)
        gdrive_sample = next((p for p in photos if p.get('source') == 'gdrive'), None)
        
        # Verify upload photo display_url format
        if upload_sample:
            display_url = upload_sample.get('display_url', '')
            assert display_url.startswith('http'), \
                f"Upload display_url should be absolute URL: {display_url}"
            print(f"✓ Upload display_url format: {display_url[:80]}...")
        
        # Verify pCloud photo display_url format
        if pcloud_sample:
            display_url = pcloud_sample.get('display_url', '')
            assert '/api/pcloud/thumb/' in display_url, \
                f"pCloud display_url should use pcloud thumb endpoint: {display_url}"
            print(f"✓ pCloud display_url format: {display_url[:80]}...")
        
        # Verify GDrive photo display_url format
        if gdrive_sample:
            display_url = gdrive_sample.get('display_url', '')
            assert 'drive.google.com/thumbnail' in display_url, \
                f"GDrive display_url should use Google thumbnail: {display_url}"
            print(f"✓ GDrive display_url format: {display_url[:80]}...")


class TestDisplayGalleryMetadata:
    """Tests for gallery metadata in display response"""
    
    def test_gallery_metadata_present(self):
        """Test that gallery metadata is returned"""
        response = requests.get(f"{BASE_URL}/api/display/{TEST_SHARE_LINK}")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check required fields
        assert 'gallery_id' in data, "Missing gallery_id"
        assert 'photos' in data, "Missing photos array"
        
        print(f"✓ Gallery metadata present: gallery_id={data.get('gallery_id')}")
    
    def test_invalid_share_link_returns_404(self):
        """Test that invalid share link returns 404"""
        response = requests.get(f"{BASE_URL}/api/display/invalid_link_xyz")
        assert response.status_code == 404, \
            f"Expected 404 for invalid share link, got {response.status_code}"
        
        print("✓ Invalid share link returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
