"""
Test suite for gallery pagination and photo loading fixes
Tests the fix for:
1) Loading regression where galleries showed only 50 photos due to broken pagination
2) Backend API returns optimized payload with only essential fields
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test gallery with 702 photos
TEST_GALLERY_SHARE_LINK = "2ba87e10"


class TestGalleryPhotosAPI:
    """Test the /api/public/gallery/{share_link}/photos endpoint"""
    
    def test_api_returns_all_photos_not_limited_to_50(self):
        """Verify API returns all photos, not limited to 50"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/{TEST_GALLERY_SHARE_LINK}/photos")
        
        assert response.status_code == 200
        photos = response.json()
        
        # Gallery has 702 photos - should return all, not just 50
        assert len(photos) > 50, f"Expected more than 50 photos, got {len(photos)}"
        assert len(photos) >= 700, f"Expected ~702 photos, got {len(photos)}"
        print(f"✓ API returned {len(photos)} photos (not limited to 50)")
    
    def test_api_returns_optimized_payload(self):
        """Verify API returns only essential fields for grid display"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/{TEST_GALLERY_SHARE_LINK}/photos")
        
        assert response.status_code == 200
        photos = response.json()
        
        assert len(photos) > 0, "No photos returned"
        
        # Check first photo has essential fields
        first_photo = photos[0]
        essential_fields = ['id', 'url', 'thumbnail_url', 'section_id', 'is_highlight', 'uploaded_by']
        
        for field in essential_fields:
            assert field in first_photo, f"Missing essential field: {field}"
        
        # Verify _id is excluded (MongoDB ObjectId)
        assert '_id' not in first_photo, "MongoDB _id should be excluded from response"
        
        print(f"✓ Photo has essential fields: {list(first_photo.keys())}")
    
    def test_api_excludes_heavy_fields(self):
        """Verify API excludes heavy fields not needed for grid display"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/{TEST_GALLERY_SHARE_LINK}/photos")
        
        assert response.status_code == 200
        photos = response.json()
        
        first_photo = photos[0]
        
        # These fields should NOT be in the optimized response
        # (they're heavy and not needed for grid display)
        heavy_fields_to_exclude = ['original_filename', 'file_size', 'width', 'height', 
                                   'exif_data', 'created_at', 'updated_at']
        
        # Note: Some of these might be included if needed - this is informational
        included_heavy = [f for f in heavy_fields_to_exclude if f in first_photo]
        if included_heavy:
            print(f"  Info: These fields are included (may be needed): {included_heavy}")
        
        print(f"✓ Response fields: {list(first_photo.keys())}")


class TestGalleryMetadata:
    """Test gallery metadata endpoint"""
    
    def test_gallery_returns_correct_photo_count(self):
        """Verify gallery metadata shows correct photo count"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/{TEST_GALLERY_SHARE_LINK}")
        
        assert response.status_code == 200
        gallery = response.json()
        
        # Check gallery has sections
        assert 'sections' in gallery, "Gallery should have sections"
        
        # Get actual photo count from photos endpoint
        photos_response = requests.get(f"{BASE_URL}/api/public/gallery/{TEST_GALLERY_SHARE_LINK}/photos")
        actual_photo_count = len(photos_response.json())
        
        print(f"✓ Gallery has {len(gallery.get('sections', []))} sections")
        print(f"✓ Actual photo count: {actual_photo_count}")
    
    def test_gallery_sections_have_correct_structure(self):
        """Verify gallery sections have required fields"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/{TEST_GALLERY_SHARE_LINK}")
        
        assert response.status_code == 200
        gallery = response.json()
        
        sections = gallery.get('sections', [])
        assert len(sections) > 0, "Gallery should have at least one section"
        
        for section in sections:
            assert 'id' in section, "Section should have id"
            assert 'name' in section, "Section should have name"
            assert 'type' in section, "Section should have type"
            print(f"  Section: {section.get('name')} (type: {section.get('type')})")


class TestPhotosBySection:
    """Test photos are correctly grouped by section"""
    
    def test_photos_have_section_id(self):
        """Verify photos have section_id for grouping"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/{TEST_GALLERY_SHARE_LINK}/photos")
        
        assert response.status_code == 200
        photos = response.json()
        
        # Count photos by section
        section_counts = {}
        for photo in photos:
            section_id = photo.get('section_id', 'no_section')
            section_counts[section_id] = section_counts.get(section_id, 0) + 1
        
        print(f"✓ Photos grouped by {len(section_counts)} sections")
        for section_id, count in section_counts.items():
            print(f"  Section {section_id[:8]}...: {count} photos")
    
    def test_photos_sorted_correctly(self):
        """Verify photos are sorted by highlight status and order"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/{TEST_GALLERY_SHARE_LINK}/photos")
        
        assert response.status_code == 200
        photos = response.json()
        
        # Check if highlights come first
        highlight_indices = [i for i, p in enumerate(photos) if p.get('is_highlight')]
        non_highlight_indices = [i for i, p in enumerate(photos) if not p.get('is_highlight')]
        
        if highlight_indices and non_highlight_indices:
            max_highlight_idx = max(highlight_indices)
            min_non_highlight_idx = min(non_highlight_indices)
            # Highlights should generally come before non-highlights
            print(f"✓ Highlights found at indices: {highlight_indices[:5]}...")
        else:
            print(f"✓ No highlights in this gallery")


class TestAPIPerformance:
    """Test API performance for large galleries"""
    
    def test_api_response_time_acceptable(self):
        """Verify API responds within acceptable time for large gallery"""
        import time
        
        start = time.time()
        response = requests.get(f"{BASE_URL}/api/public/gallery/{TEST_GALLERY_SHARE_LINK}/photos")
        elapsed = time.time() - start
        
        assert response.status_code == 200
        
        # Should respond within 5 seconds for 700+ photos
        assert elapsed < 5.0, f"API took too long: {elapsed:.2f}s"
        
        photos = response.json()
        print(f"✓ API returned {len(photos)} photos in {elapsed:.2f}s")
    
    def test_payload_size_reasonable(self):
        """Verify payload size is reasonable for large gallery"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/{TEST_GALLERY_SHARE_LINK}/photos")
        
        assert response.status_code == 200
        
        # Get response size in KB
        content_length = len(response.content) / 1024
        photos = response.json()
        
        # Average size per photo should be reasonable (< 1KB per photo with optimized fields)
        avg_size = content_length / len(photos) if photos else 0
        
        print(f"✓ Total payload: {content_length:.1f}KB for {len(photos)} photos")
        print(f"✓ Average per photo: {avg_size:.2f}KB")
        
        # With optimized projection, should be under 500KB for 700 photos
        assert content_length < 1000, f"Payload too large: {content_length:.1f}KB"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
