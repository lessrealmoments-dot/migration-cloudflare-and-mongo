"""
Tests for the admin Gallery Photos endpoint P0 perf fix.

GET /api/galleries/{gallery_id}/photos
- Default (no params): backwards compatible, returns ALL photos with full Photo schema
- ?fields=thumb&limit=200&offset=0: thumbnail-only payload (no full-res 'url' overhead),
  fast, paginated.
- Auth still enforced (401 without token, 404 for foreign gallery).
"""
import os
import time
import uuid
from io import BytesIO

import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


def _img_bytes(color=(120, 200, 50), size=(200, 200)):
    img = Image.new("RGB", size, color=color)
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=70)
    buf.seek(0)
    return buf


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def perf_gallery(authenticated_client):
    """Reuse existing gallery or create one, then upload >=22 photos for pagination edges."""
    # Reuse existing gallery if user already has one (free tier = 1 gallery max)
    existing = authenticated_client.get(f"{BASE_URL}/api/galleries")
    gid = None
    if existing.status_code == 200 and isinstance(existing.json(), list) and existing.json():
        gid = existing.json()[0]["id"]
    if not gid:
        g = authenticated_client.post(
            f"{BASE_URL}/api/galleries",
            json={"title": "TEST_perf_pagination_gallery", "description": "pytest perf"},
        )
        assert g.status_code == 200, g.text
        gid = g.json()["id"]

    # Upload ~22 small photos through the standard endpoint.
    # NOTE: don't use the shared session (it has Content-Type: application/json which
    # would clobber multipart/form-data). Use raw requests with auth header.
    auth_header = {"Authorization": authenticated_client.headers.get("Authorization", "")}
    uploaded = 0
    for i in range(22):
        files = {"file": (f"TEST_p{i}.jpg", _img_bytes(color=(i * 10 % 255, 100, 200)), "image/jpeg")}
        r = requests.post(
            f"{BASE_URL}/api/galleries/{gid}/photos",
            files=files,
            headers=auth_header,
        )
        if r.status_code == 200:
            uploaded += 1
        else:
            print(f"upload {i} status={r.status_code} body={r.text[:160]}")
    assert uploaded >= 5, f"Could not upload enough photos for pagination test (got {uploaded})"
    return {"gallery_id": gid, "uploaded": uploaded}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class TestAdminPhotosAuth:
    def test_no_auth_returns_401(self, perf_gallery):
        r = requests.get(f"{BASE_URL}/api/galleries/{perf_gallery['gallery_id']}/photos")
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_foreign_gallery_returns_404(self, authenticated_client):
        # Random unowned gallery id
        bogus = str(uuid.uuid4())
        r = authenticated_client.get(f"{BASE_URL}/api/galleries/{bogus}/photos")
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Backwards compatibility: default returns full Photo schema
# ---------------------------------------------------------------------------

class TestAdminPhotosBackwardsCompat:
    def test_default_returns_full_schema(self, authenticated_client, perf_gallery):
        r = authenticated_client.get(
            f"{BASE_URL}/api/galleries/{perf_gallery['gallery_id']}/photos"
        )
        assert r.status_code == 200, r.text
        photos = r.json()
        assert isinstance(photos, list)
        assert len(photos) >= perf_gallery["uploaded"], (
            f"expected at least {perf_gallery['uploaded']} photos, got {len(photos)}"
        )

        first = photos[0]
        # Full Photo schema: must have full-res 'url'
        assert "url" in first and first["url"], f"full mode should include url, got keys={list(first.keys())}"
        assert "id" in first
        assert "gallery_id" in first
        assert first["gallery_id"] == perf_gallery["gallery_id"]
        # Mongo objectId must be excluded
        assert "_id" not in first


# ---------------------------------------------------------------------------
# Thumb mode + pagination
# ---------------------------------------------------------------------------

class TestAdminPhotosThumbMode:
    def test_thumb_mode_payload_shape(self, authenticated_client, perf_gallery):
        r = authenticated_client.get(
            f"{BASE_URL}/api/galleries/{perf_gallery['gallery_id']}/photos",
            params={"fields": "thumb", "limit": 200, "offset": 0},
        )
        assert r.status_code == 200, r.text
        photos = r.json()
        assert isinstance(photos, list)
        assert len(photos) > 0
        assert len(photos) <= 200

        first = photos[0]
        # thumb fields present
        assert "id" in first
        assert "thumbnail_url" in first or "thumbnail_medium_url" in first
        # _id excluded
        assert "_id" not in first
        # heavy / unrelated fields should NOT be present
        for heavy in ("exif_data", "file_size", "width", "height"):
            assert heavy not in first, f"{heavy} should be excluded in thumb mode"

    def test_thumb_mode_is_fast(self, authenticated_client, perf_gallery):
        # Warm up
        authenticated_client.get(
            f"{BASE_URL}/api/galleries/{perf_gallery['gallery_id']}/photos",
            params={"fields": "thumb", "limit": 200, "offset": 0},
        )
        t0 = time.time()
        r = authenticated_client.get(
            f"{BASE_URL}/api/galleries/{perf_gallery['gallery_id']}/photos",
            params={"fields": "thumb", "limit": 200, "offset": 0},
        )
        elapsed = time.time() - t0
        assert r.status_code == 200
        assert elapsed < 5.0, f"thumb endpoint slow: {elapsed:.2f}s"

    def test_pagination_offset_returns_next_page(self, authenticated_client, perf_gallery):
        # Page 1
        r1 = authenticated_client.get(
            f"{BASE_URL}/api/galleries/{perf_gallery['gallery_id']}/photos",
            params={"fields": "thumb", "limit": 10, "offset": 0},
        )
        assert r1.status_code == 200
        page1 = r1.json()
        assert len(page1) == 10

        # Page 2
        r2 = authenticated_client.get(
            f"{BASE_URL}/api/galleries/{perf_gallery['gallery_id']}/photos",
            params={"fields": "thumb", "limit": 10, "offset": 10},
        )
        assert r2.status_code == 200
        page2 = r2.json()
        assert len(page2) >= 1, "offset=10 should return at least 1 photo (>20 uploaded)"

        # Disjoint
        ids1 = {p["id"] for p in page1}
        ids2 = {p["id"] for p in page2}
        assert ids1.isdisjoint(ids2), "Page 1 and Page 2 should not overlap"


# ---------------------------------------------------------------------------
# Regression: related endpoints still work
# ---------------------------------------------------------------------------

class TestRelatedEndpointsRegression:
    def test_get_gallery_meta(self, authenticated_client, perf_gallery):
        r = authenticated_client.get(f"{BASE_URL}/api/galleries/{perf_gallery['gallery_id']}")
        assert r.status_code == 200
        assert r.json()["id"] == perf_gallery["gallery_id"]

    def test_get_sections(self, authenticated_client, perf_gallery):
        r = authenticated_client.get(
            f"{BASE_URL}/api/galleries/{perf_gallery['gallery_id']}/sections"
        )
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_videos(self, authenticated_client, perf_gallery):
        r = authenticated_client.get(
            f"{BASE_URL}/api/galleries/{perf_gallery['gallery_id']}/videos"
        )
        # Either 200 (list) or 404 if endpoint scoped to feature - both acceptable as regression
        assert r.status_code in (200, 404), r.text


# ---------------------------------------------------------------------------
# Photobooth Bridge: section creation returns creds
# ---------------------------------------------------------------------------

class TestPhotoboothBridgeSectionCreation:
    def test_create_bridge_section_returns_creds(self, authenticated_client, perf_gallery):
        r = authenticated_client.post(
            f"{BASE_URL}/api/galleries/{perf_gallery['gallery_id']}/sections/photobooth-bridge",
            json={"name": "TEST_BoothBridge", "contributor_name": "TEST_DSLRBooth"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("section_id", "contributor_link", "section_password", "section"):
            assert k in body, f"missing {k} in response"
        assert isinstance(body["contributor_link"], str) and len(body["contributor_link"]) > 5
        assert isinstance(body["section_password"], str) and len(body["section_password"]) >= 6
        assert body["section"]["type"] == "photobooth_bridge"

        # And verify-password endpoint accepts it
        vp = requests.post(
            f"{BASE_URL}/api/bridge/{body['contributor_link']}/verify-password",
            json={"password": body["section_password"]},
        )
        assert vp.status_code == 200, vp.text
        assert "token" in vp.json() and vp.json()["token"]


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
