"""
Tests for the DSLRBooth → Eventsgallery bridge.

Covers:
- Health
- Section creation (admin)
- Password verification + JWT issuance
- Ingest: success, duplicate detection, hash mismatch, parallel-array validation
- Public per-session list, ZIP download, QR code
"""
import hashlib
import os
from io import BytesIO

import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


def _png_bytes(color=(255, 0, 0)):
    img = Image.new("RGB", (40, 40), color=color)
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture(scope="module")
def bridge_section(authenticated_client):
    """Create a gallery and a Photobooth Bridge section. Returns dict with creds."""
    g = authenticated_client.post(
        f"{BASE_URL}/api/galleries",
        json={"title": "Bridge Test Gallery", "description": "pytest"},
    )
    assert g.status_code == 200, g.text
    gallery = g.json()
    gid = gallery["id"]

    s = authenticated_client.post(
        f"{BASE_URL}/api/galleries/{gid}/sections/photobooth-bridge",
        json={"name": "Photobooth", "contributor_name": "Bridge Test"},
    )
    assert s.status_code == 200, s.text
    body = s.json()
    return {
        "gallery_id": gid,
        "share_link": gallery.get("share_link"),
        "section_id": body["section_id"],
        "contributor_link": body["contributor_link"],
        "section_password": body["section_password"],
    }


class TestBridgeHealth:
    def test_health(self):
        r = requests.get(f"{BASE_URL}/api/bridge/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        assert body["service"] == "photobooth-bridge"


class TestBridgeAuth:
    def test_invalid_link_returns_404(self):
        r = requests.post(
            f"{BASE_URL}/api/bridge/nonexistent_link_xyz/verify-password",
            json={"password": "x"},
        )
        assert r.status_code == 404

    def test_wrong_password_returns_401(self, bridge_section):
        r = requests.post(
            f"{BASE_URL}/api/bridge/{bridge_section['contributor_link']}/verify-password",
            json={"password": "definitely-not-the-password"},
        )
        assert r.status_code == 401

    def test_correct_password_returns_token(self, bridge_section):
        r = requests.post(
            f"{BASE_URL}/api/bridge/{bridge_section['contributor_link']}/verify-password",
            json={"password": bridge_section["section_password"]},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "token" in body and body["token"]
        assert body["gallery_id"] == bridge_section["gallery_id"]
        assert body["section_id"] == bridge_section["section_id"]


@pytest.fixture(scope="module")
def bridge_token(bridge_section):
    r = requests.post(
        f"{BASE_URL}/api/bridge/{bridge_section['contributor_link']}/verify-password",
        json={"password": bridge_section["section_password"]},
    )
    assert r.status_code == 200
    return r.json()["token"]


class TestBridgeIngest:
    def _post_session(self, link, token, session_id, files_payload, headers=None):
        h = {"Authorization": f"Bearer {token}"}
        if headers:
            h.update(headers)
        return requests.post(
            f"{BASE_URL}/api/bridge/{link}/ingest-session",
            data=files_payload["data"],
            files=files_payload["files"],
            headers=h,
        )

    def test_missing_token_rejects(self, bridge_section):
        png = _png_bytes()
        h = hashlib.md5(png).hexdigest()
        r = requests.post(
            f"{BASE_URL}/api/bridge/{bridge_section['contributor_link']}/ingest-session",
            data={
                "session_id": "session_a",
                "media_types": "original",
                "captured_ats": "2025-02-01T12:00:00Z",
                "content_hashes": h,
            },
            files={"files": ("a.png", png, "image/png")},
        )
        assert r.status_code == 401

    def test_invalid_session_id_rejects(self, bridge_section, bridge_token):
        png = _png_bytes()
        h = hashlib.md5(png).hexdigest()
        r = requests.post(
            f"{BASE_URL}/api/bridge/{bridge_section['contributor_link']}/ingest-session",
            data={
                "session_id": "bad/session id with spaces",
                "media_types": "original",
                "captured_ats": "2025-02-01T12:00:00Z",
                "content_hashes": h,
            },
            files={"files": ("a.png", png, "image/png")},
            headers={"Authorization": f"Bearer {bridge_token}"},
        )
        assert r.status_code == 422

    def test_successful_ingest(self, bridge_section, bridge_token):
        png = _png_bytes(color=(0, 128, 0))
        h = hashlib.md5(png).hexdigest()
        r = requests.post(
            f"{BASE_URL}/api/bridge/{bridge_section['contributor_link']}/ingest-session",
            data={
                "session_id": "20250201_120000",
                "session_captured_at": "2025-02-01T12:00:00Z",
                "media_types": "original",
                "captured_ats": "2025-02-01T12:00:00Z",
                "content_hashes": h,
            },
            files={"files": ("photo1.png", png, "image/png")},
            headers={"Authorization": f"Bearer {bridge_token}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["succeeded"] == 1
        assert body["files"][0]["status"] == "uploaded"
        assert body["files"][0]["photo_id"]

    def test_duplicate_returns_existing(self, bridge_section, bridge_token):
        png = _png_bytes(color=(0, 128, 0))  # Same bytes as previous test
        h = hashlib.md5(png).hexdigest()
        r = requests.post(
            f"{BASE_URL}/api/bridge/{bridge_section['contributor_link']}/ingest-session",
            data={
                "session_id": "20250201_120000",
                "media_types": "original",
                "captured_ats": "2025-02-01T12:00:00Z",
                "content_hashes": h,
            },
            files={"files": ("photo1.png", png, "image/png")},
            headers={"Authorization": f"Bearer {bridge_token}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["duplicates"] == 1
        assert body["files"][0]["status"] == "duplicate"
        assert body["files"][0]["photo_id"]

    def test_hash_mismatch_marks_failed(self, bridge_section, bridge_token):
        png = _png_bytes(color=(0, 0, 200))
        bogus_hash = "0" * 32
        r = requests.post(
            f"{BASE_URL}/api/bridge/{bridge_section['contributor_link']}/ingest-session",
            data={
                "session_id": "20250201_120100",
                "media_types": "original",
                "captured_ats": "2025-02-01T12:01:00Z",
                "content_hashes": bogus_hash,
            },
            files={"files": ("photo2.png", png, "image/png")},
            headers={"Authorization": f"Bearer {bridge_token}"},
        )
        # Mixed: in this case all failed → 207 (failed > 0)
        assert r.status_code == 207
        body = r.json()
        assert body["failed"] == 1
        assert "hash mismatch" in (body["files"][0]["error"] or "").lower()

    def test_mixed_media_session_207_on_partial(self, bridge_section, bridge_token):
        good = _png_bytes(color=(255, 255, 0))
        bad = _png_bytes(color=(255, 0, 255))
        good_h = hashlib.md5(good).hexdigest()
        bad_h = "0" * 32  # wrong on purpose
        # Two parallel files, one good, one bad-hash
        files = [
            ("files", ("good.png", good, "image/png")),
            ("files", ("bad.png", bad, "image/png")),
        ]
        r = requests.post(
            f"{BASE_URL}/api/bridge/{bridge_section['contributor_link']}/ingest-session",
            data=[
                ("session_id", "20250201_120200"),
                ("media_types", "original"),
                ("media_types", "print"),
                ("captured_ats", "2025-02-01T12:02:00Z"),
                ("captured_ats", "2025-02-01T12:02:01Z"),
                ("content_hashes", good_h),
                ("content_hashes", bad_h),
            ],
            files=files,
            headers={"Authorization": f"Bearer {bridge_token}"},
        )
        assert r.status_code == 207, r.text
        body = r.json()
        assert body["succeeded"] == 1
        assert body["failed"] == 1


class TestBridgePublic:
    def test_list_sessions_oldest_first(self, bridge_section):
        r = requests.get(
            f"{BASE_URL}/api/public/gallery/{bridge_section['share_link']}/sessions"
        )
        assert r.status_code == 200, r.text
        sessions = r.json()["sessions"]
        # We have at least 2 sessions from previous tests; verify ordering
        if len(sessions) >= 2:
            for a, b in zip(sessions, sessions[1:]):
                assert (a["earliest_captured_at"] or "") <= (b["earliest_captured_at"] or "")

    def test_session_zip_download(self, bridge_section):
        r = requests.get(
            f"{BASE_URL}/api/public/gallery/{bridge_section['share_link']}/session/20250201_120000/download",
            stream=True,
        )
        assert r.status_code == 200
        assert "zip" in r.headers.get("content-type", "").lower()
        body = b"".join(r.iter_content(8192))
        assert body[:2] == b"PK"  # ZIP magic

    def test_session_qr_png(self, bridge_section):
        r = requests.get(
            f"{BASE_URL}/api/public/gallery/{bridge_section['share_link']}/session/20250201_120000/qr"
        )
        assert r.status_code == 200
        assert r.headers.get("content-type") == "image/png"
        assert r.content[:8] == b"\x89PNG\r\n\x1a\n"

    def test_unknown_session_404(self, bridge_section):
        r = requests.get(
            f"{BASE_URL}/api/public/gallery/{bridge_section['share_link']}/session/does_not_exist/download"
        )
        assert r.status_code == 404
