"""
Test cases for contributor photos display and section reordering bug fixes.
Tests verify that:
1. Contributor photos appear in public gallery via API
2. Section order is returned correctly
3. Contributor name is associated with sections
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestContributorPhotos:
    """Test contributor photos display bug fix"""
    
    def test_public_gallery_returns_sections(self):
        """Verify gallery has sections with contributor info"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/a189497a")
        assert response.status_code == 200
        
        data = response.json()
        assert 'sections' in data
        assert len(data['sections']) > 0
        
        # Find Official Photographer section
        official_section = None
        for section in data['sections']:
            if section['name'] == 'Official Photographer':
                official_section = section
                break
        
        assert official_section is not None, "Official Photographer section not found"
        assert official_section['contributor_name'] == 'LRM', f"Expected contributor_name 'LRM', got '{official_section.get('contributor_name')}'"
        assert official_section['contributor_enabled'] == True
        
    def test_public_gallery_photos_returns_contributor_photos(self):
        """Verify contributor photos are returned in public gallery photos endpoint"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/a189497a/photos?password=")
        assert response.status_code == 200
        
        photos = response.json()
        assert len(photos) > 0, "No photos returned"
        
        # Count contributor photos
        contributor_photos = [p for p in photos if p.get('uploaded_by') == 'contributor']
        assert len(contributor_photos) >= 4, f"Expected at least 4 contributor photos, got {len(contributor_photos)}"
        
        # Verify contributor photos have section_id
        for photo in contributor_photos:
            assert photo.get('section_id') is not None, f"Contributor photo {photo['id']} missing section_id"
    
    def test_contributor_photos_belong_to_official_section(self):
        """Verify contributor photos belong to Official Photographer section"""
        # First get the section ID
        gallery_response = requests.get(f"{BASE_URL}/api/public/gallery/a189497a")
        gallery_data = gallery_response.json()
        
        official_section_id = None
        for section in gallery_data['sections']:
            if section['name'] == 'Official Photographer':
                official_section_id = section['id']
                break
        
        assert official_section_id is not None, "Official Photographer section not found"
        
        # Get photos and verify contributor photos are in this section
        photos_response = requests.get(f"{BASE_URL}/api/public/gallery/a189497a/photos?password=")
        photos = photos_response.json()
        
        contributor_photos = [p for p in photos if p.get('uploaded_by') == 'contributor']
        for photo in contributor_photos:
            assert photo['section_id'] == official_section_id, \
                f"Contributor photo {photo['id']} in wrong section: {photo['section_id']} vs {official_section_id}"


class TestSectionReordering:
    """Test section reordering feature"""
    
    def test_sections_have_order_field(self):
        """Verify sections have order field"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/a189497a")
        assert response.status_code == 200
        
        data = response.json()
        for section in data['sections']:
            assert 'order' in section, f"Section {section['name']} missing 'order' field"
            assert isinstance(section['order'], int), f"Section order should be int, got {type(section['order'])}"
    
    def test_sections_ordered_correctly(self):
        """Verify sections are returned in correct order"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/a189497a")
        assert response.status_code == 200
        
        data = response.json()
        sections = data['sections']
        
        # Verify sections are sorted by order
        for i in range(len(sections) - 1):
            assert sections[i]['order'] <= sections[i+1]['order'], \
                f"Sections not in order: {sections[i]['name']}({sections[i]['order']}) should come before {sections[i+1]['name']}({sections[i+1]['order']})"


class TestGalleryData:
    """Test gallery data integrity"""
    
    def test_gallery_title_correct(self):
        """Verify gallery title is correct"""
        response = requests.get(f"{BASE_URL}/api/public/gallery/a189497a")
        assert response.status_code == 200
        
        data = response.json()
        assert data['title'] == "RUBY AND SAPPHIRE'S BIRTHDAY"
        assert data['photographer_name'] == "Less Real Moments"
    
    def test_gallery_photo_count_matches(self):
        """Verify photo count matches actual photos"""
        gallery_response = requests.get(f"{BASE_URL}/api/public/gallery/a189497a")
        gallery_data = gallery_response.json()
        
        photos_response = requests.get(f"{BASE_URL}/api/public/gallery/a189497a/photos?password=")
        photos = photos_response.json()
        
        # photo_count should be close to actual returned photos (some might be filtered)
        assert abs(gallery_data['photo_count'] - len(photos)) <= 5, \
            f"Photo count mismatch: {gallery_data['photo_count']} vs {len(photos)}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
