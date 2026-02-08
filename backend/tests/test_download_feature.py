"""
Test suite for Enhanced Download Feature
- GET /api/public/gallery/{share_link}/download-info
- POST /api/public/gallery/{share_link}/download-section
- ZIP chunking at 250MB boundary
- Section-based downloads
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test gallery credentials
TEST_GALLERY = {
    "share_link": "e76c37ae",
    "download_password": "123"
}


class TestDownloadInfo:
    """Tests for GET /api/public/gallery/{share_link}/download-info endpoint"""
    
    def test_download_info_with_valid_password(self):
        """Test download-info returns correct data with valid password"""
        response = requests.post(
            f"{BASE_URL}/api/public/gallery/{TEST_GALLERY['share_link']}/download-info",
            json={"password": TEST_GALLERY['download_password']}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify required fields exist
        assert "gallery_id" in data
        assert "gallery_title" in data
        assert "total_photos" in data
        assert "total_size_mb" in data
        assert "chunk_count" in data
        assert "chunks" in data
        assert "sections" in data
        
        # Verify data types
        assert isinstance(data["total_photos"], int)
        assert isinstance(data["total_size_mb"], (int, float))
        assert isinstance(data["chunk_count"], int)
        assert isinstance(data["chunks"], list)
        assert isinstance(data["sections"], list)
        
        print(f"✓ Download info returned: {data['total_photos']} photos, {data['total_size_mb']}MB, {data['chunk_count']} chunks")
    
    def test_download_info_returns_sections(self):
        """Test that download-info returns section information"""
        response = requests.post(
            f"{BASE_URL}/api/public/gallery/{TEST_GALLERY['share_link']}/download-info",
            json={"password": TEST_GALLERY['download_password']}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify sections are returned
        assert len(data["sections"]) > 0, "Expected at least one section"
        
        # Verify section structure
        for section in data["sections"]:
            assert "id" in section
            assert "title" in section
            assert "photo_count" in section
            assert "size_mb" in section
            assert isinstance(section["photo_count"], int)
            assert isinstance(section["size_mb"], (int, float))
        
        print(f"✓ Sections returned: {[s['title'] for s in data['sections']]}")
    
    def test_download_info_chunk_calculation(self):
        """Test that chunks are calculated correctly based on 250MB limit"""
        response = requests.post(
            f"{BASE_URL}/api/public/gallery/{TEST_GALLERY['share_link']}/download-info",
            json={"password": TEST_GALLERY['download_password']}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify chunk structure
        for chunk in data["chunks"]:
            assert "chunk_number" in chunk
            assert "photo_count" in chunk
            assert "size_bytes" in chunk
            assert "size_mb" in chunk
            
            # Each chunk should be <= 250MB (except possibly the last one)
            # The 250MB limit is 262144000 bytes
            if chunk["chunk_number"] < data["chunk_count"]:
                # Non-last chunks should be close to 250MB
                assert chunk["size_bytes"] <= 262144000, f"Chunk {chunk['chunk_number']} exceeds 250MB"
        
        # Total photos in chunks should equal total_photos
        total_in_chunks = sum(c["photo_count"] for c in data["chunks"])
        assert total_in_chunks == data["total_photos"], f"Chunk photo count mismatch: {total_in_chunks} vs {data['total_photos']}"
        
        print(f"✓ Chunk calculation correct: {data['chunk_count']} chunks for {data['total_size_mb']}MB")
    
    def test_download_info_invalid_password(self):
        """Test download-info rejects invalid password"""
        response = requests.post(
            f"{BASE_URL}/api/public/gallery/{TEST_GALLERY['share_link']}/download-info",
            json={"password": "wrong_password"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Invalid password correctly rejected")
    
    def test_download_info_missing_password(self):
        """Test download-info rejects missing password when required"""
        response = requests.post(
            f"{BASE_URL}/api/public/gallery/{TEST_GALLERY['share_link']}/download-info",
            json={}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Missing password correctly rejected")
    
    def test_download_info_nonexistent_gallery(self):
        """Test download-info returns 404 for non-existent gallery"""
        response = requests.post(
            f"{BASE_URL}/api/public/gallery/nonexistent123/download-info",
            json={"password": "test"}
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Non-existent gallery returns 404")
    
    def test_download_info_for_specific_section(self):
        """Test download-info can filter by section_id"""
        # First get all sections
        response = requests.post(
            f"{BASE_URL}/api/public/gallery/{TEST_GALLERY['share_link']}/download-info",
            json={"password": TEST_GALLERY['download_password']}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        if len(data["sections"]) > 0:
            section_id = data["sections"][0]["id"]
            section_photo_count = data["sections"][0]["photo_count"]
            
            # Now request info for just that section
            section_response = requests.post(
                f"{BASE_URL}/api/public/gallery/{TEST_GALLERY['share_link']}/download-info",
                json={"password": TEST_GALLERY['download_password'], "section_id": section_id}
            )
            
            assert section_response.status_code == 200
            section_data = section_response.json()
            
            # Total photos should match section photo count
            assert section_data["total_photos"] == section_photo_count, \
                f"Section filter mismatch: {section_data['total_photos']} vs {section_photo_count}"
            
            print(f"✓ Section filter works: {section_photo_count} photos in section")


class TestDownloadSection:
    """Tests for POST /api/public/gallery/{share_link}/download-section endpoint"""
    
    def test_download_section_all_photos_chunk1(self):
        """Test downloading all photos (first chunk)"""
        response = requests.post(
            f"{BASE_URL}/api/public/gallery/{TEST_GALLERY['share_link']}/download-section?chunk=1",
            json={"password": TEST_GALLERY['download_password']},
            stream=True
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert response.headers.get('content-type') == 'application/zip'
        
        # Check Content-Disposition header
        content_disposition = response.headers.get('content-disposition', '')
        assert 'attachment' in content_disposition
        assert '.zip' in content_disposition
        
        # Verify we got actual content
        content_length = int(response.headers.get('content-length', 0))
        assert content_length > 0, "Expected non-empty ZIP file"
        
        print(f"✓ Download chunk 1 successful: {content_length / (1024*1024):.1f}MB")
    
    def test_download_section_specific_section(self):
        """Test downloading a specific section"""
        # First get section info
        info_response = requests.post(
            f"{BASE_URL}/api/public/gallery/{TEST_GALLERY['share_link']}/download-info",
            json={"password": TEST_GALLERY['download_password']}
        )
        
        assert info_response.status_code == 200
        info_data = info_response.json()
        
        if len(info_data["sections"]) > 0:
            section_id = info_data["sections"][0]["id"]
            section_title = info_data["sections"][0]["title"]
            
            # Download that section
            response = requests.post(
                f"{BASE_URL}/api/public/gallery/{TEST_GALLERY['share_link']}/download-section?chunk=1",
                json={"password": TEST_GALLERY['download_password'], "section_id": section_id},
                stream=True
            )
            
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            assert response.headers.get('content-type') == 'application/zip'
            
            # Filename should contain section title
            content_disposition = response.headers.get('content-disposition', '')
            # Section title in filename should have spaces replaced with underscores
            expected_section_name = section_title.replace(" ", "_").replace("/", "-")
            assert expected_section_name in content_disposition or 'Section' in content_disposition, \
                f"Expected section name in filename: {content_disposition}"
            
            print(f"✓ Section download successful: {section_title}")
    
    def test_download_section_invalid_password(self):
        """Test download-section rejects invalid password"""
        response = requests.post(
            f"{BASE_URL}/api/public/gallery/{TEST_GALLERY['share_link']}/download-section?chunk=1",
            json={"password": "wrong_password"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Invalid password correctly rejected for download")
    
    def test_download_section_invalid_chunk(self):
        """Test download-section returns 404 for invalid chunk number"""
        response = requests.post(
            f"{BASE_URL}/api/public/gallery/{TEST_GALLERY['share_link']}/download-section?chunk=999",
            json={"password": TEST_GALLERY['download_password']}
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Invalid chunk number returns 404")
    
    def test_download_section_nonexistent_gallery(self):
        """Test download-section returns 404 for non-existent gallery"""
        response = requests.post(
            f"{BASE_URL}/api/public/gallery/nonexistent123/download-section?chunk=1",
            json={"password": "test"}
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Non-existent gallery returns 404")


class TestDownloadFiltering:
    """Tests for download filtering (hidden/flagged photos)"""
    
    def test_download_excludes_hidden_photos(self):
        """Verify download info excludes hidden photos"""
        # Get download info
        response = requests.post(
            f"{BASE_URL}/api/public/gallery/{TEST_GALLERY['share_link']}/download-info",
            json={"password": TEST_GALLERY['download_password']}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Get public gallery info to compare photo counts
        gallery_response = requests.get(
            f"{BASE_URL}/api/public/gallery/{TEST_GALLERY['share_link']}"
        )
        
        assert gallery_response.status_code == 200
        gallery_data = gallery_response.json()
        
        # Download photo count should be <= gallery photo count
        # (some photos might be hidden or flagged)
        assert data["total_photos"] <= gallery_data.get("photo_count", 999), \
            "Download should not include more photos than gallery shows"
        
        print(f"✓ Download filtering: {data['total_photos']} downloadable out of {gallery_data.get('photo_count', 'unknown')} total")


class TestChunkingLogic:
    """Tests for 250MB chunking logic"""
    
    def test_chunk_size_limit(self):
        """Verify chunks respect 250MB limit"""
        response = requests.post(
            f"{BASE_URL}/api/public/gallery/{TEST_GALLERY['share_link']}/download-info",
            json={"password": TEST_GALLERY['download_password']}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        CHUNK_LIMIT_BYTES = 250 * 1024 * 1024  # 250MB
        
        for i, chunk in enumerate(data["chunks"]):
            # All chunks except possibly the last should be under 250MB
            if i < len(data["chunks"]) - 1:
                assert chunk["size_bytes"] <= CHUNK_LIMIT_BYTES, \
                    f"Chunk {chunk['chunk_number']} exceeds 250MB limit: {chunk['size_mb']}MB"
        
        print(f"✓ All chunks respect 250MB limit")
    
    def test_multiple_chunks_for_large_gallery(self):
        """Test that large galleries are split into multiple chunks"""
        response = requests.post(
            f"{BASE_URL}/api/public/gallery/{TEST_GALLERY['share_link']}/download-info",
            json={"password": TEST_GALLERY['download_password']}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # If total size > 250MB, should have multiple chunks
        if data["total_size_mb"] > 250:
            assert data["chunk_count"] > 1, \
                f"Expected multiple chunks for {data['total_size_mb']}MB gallery"
            print(f"✓ Large gallery ({data['total_size_mb']}MB) correctly split into {data['chunk_count']} chunks")
        else:
            print(f"✓ Gallery ({data['total_size_mb']}MB) fits in single chunk")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
