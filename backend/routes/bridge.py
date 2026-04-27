"""
DSLRBooth Bridge ingest routes.

A "Photobooth Bridge" is a new contributor section type that lets a local DSLRBooth
bridge desktop app authenticate per-section (contributor_link + section_password)
and stream sessions of photos/videos directly into a gallery section.

Auth:  contributor_link + section_password  -> short-lived JWT scoped to ONE section
Ingest: multipart upload of one DSLRBooth session (multiple files, parallel arrays)

Companion features:
- Public per-session ZIP download
- Public per-session QR code (points to ZIP download)

This module is intentionally self-contained and depends only on services already
present in the codebase (storage_service, db). Server.py wires it in.
"""
from __future__ import annotations

import hashlib
import io
import os
import re
import secrets
import uuid
import zipfile
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import httpx
import qrcode
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Body, Request
from fastapi.responses import StreamingResponse, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

from core.config import SECRET_KEY, ALGORITHM
from core.database import db
from core.dependencies import get_current_user

# Avoid `from services.storage import ...` which triggers services/__init__.py
# and pulls in modules that depend on names not present in core.config (RESEND_API_KEY, etc.).
# Load services/storage.py directly the same way server.py does.
import importlib.util as _ilu
from pathlib import Path as _Path
_storage_spec = _ilu.spec_from_file_location(
    "_bridge_storage", str(_Path(__file__).resolve().parent.parent / "services" / "storage.py")
)
_storage_module = _ilu.module_from_spec(_storage_spec)
_storage_spec.loader.exec_module(_storage_module)
get_storage_service = _storage_module.get_storage_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/bridge", tags=["bridge"])
public_router = APIRouter(prefix="/api/public/gallery", tags=["bridge-public"])
admin_router = APIRouter(prefix="/api", tags=["bridge-admin"])

bridge_security = HTTPBearer(auto_error=False)
storage = get_storage_service()

# --- Constants ---------------------------------------------------------------

BRIDGE_TOKEN_TTL_MIN = 60  # JWT lifetime for the bridge session
SESSION_ID_RE = re.compile(r"^[A-Za-z0-9_\-:]{1,128}$")
ALLOWED_MEDIA_TYPES = {"original", "print", "single", "animated", "video", "greenscreen"}
ALLOWED_IMAGE_EXTS = {"jpg", "jpeg", "png", "gif", "webp", "heic", "heif"}
ALLOWED_VIDEO_EXTS = {"mp4", "mov", "webm"}
MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB
SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


# --- Helpers -----------------------------------------------------------------

def _safe_filename(name: str) -> str:
    """ASCII-only, safe filename. Keeps extension."""
    cleaned = SAFE_FILENAME_RE.sub("_", name).strip("._")
    return cleaned[:180] or "file"


def _make_bridge_token(gallery_id: str, section_id: str, contributor_link: str) -> tuple[str, str]:
    expire = datetime.now(timezone.utc) + timedelta(minutes=BRIDGE_TOKEN_TTL_MIN)
    payload = {
        "scope": "bridge",
        "gallery_id": gallery_id,
        "section_id": section_id,
        "contributor_link": contributor_link,
        "exp": expire,
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return token, expire.isoformat()


async def _verify_bridge_token(
    contributor_link: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bridge_security),
) -> dict:
    """Validate a bridge JWT and ensure it matches the URL contributor_link."""
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Missing bridge token")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired bridge token")
    if payload.get("scope") != "bridge":
        raise HTTPException(status_code=401, detail="Wrong token scope")
    if payload.get("contributor_link") != contributor_link:
        raise HTTPException(status_code=401, detail="Token does not match contributor link")
    return payload


async def _find_section_by_link(contributor_link: str) -> tuple[dict, dict]:
    """Find gallery + section by contributor_link. Raises 404 if missing."""
    gallery = await db.galleries.find_one(
        {"sections.contributor_link": contributor_link},
        {"_id": 0},
    )
    if not gallery:
        raise HTTPException(status_code=404, detail="Invalid contributor link")
    section = next(
        (s for s in gallery.get("sections", []) if s.get("contributor_link") == contributor_link),
        None,
    )
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    return gallery, section


# --- Health ------------------------------------------------------------------

@router.get("/health")
async def bridge_health():
    return {
        "status": "ok",
        "service": "photobooth-bridge",
        "version": "1.0.0",
        "token_ttl_min": BRIDGE_TOKEN_TTL_MIN,
    }


# --- Auth: verify-password ---------------------------------------------------

@router.post("/{contributor_link}/verify-password")
async def bridge_verify_password(contributor_link: str, data: dict = Body(...)):
    """Verify a bridge contributor link + section password and issue a scoped JWT."""
    gallery, section = await _find_section_by_link(contributor_link)

    if section.get("type") != "photobooth_bridge":
        raise HTTPException(status_code=400, detail="This contributor link is not a Photobooth Bridge section")

    if not section.get("contributor_enabled", False):
        raise HTTPException(status_code=403, detail="Bridge uploads are disabled for this section")

    stored_password = section.get("section_password") or ""
    provided_password = (data or {}).get("password", "") or ""
    if stored_password and provided_password != stored_password:
        raise HTTPException(status_code=401, detail="Invalid section password")

    token, expires_at = _make_bridge_token(gallery["id"], section["id"], contributor_link)
    return {
        "token": token,
        "expires_at": expires_at,
        "gallery_id": gallery["id"],
        "section_id": section["id"],
        "gallery_title": gallery.get("title"),
        "section_name": section.get("name"),
    }


# --- Ingest a session --------------------------------------------------------

@router.post("/{contributor_link}/ingest-session")
async def bridge_ingest_session(
    contributor_link: str,
    request: Request,
    session_id: str = Form(...),
    session_captured_at: Optional[str] = Form(None),
    event_title: Optional[str] = Form(None),
    auto_create_section: bool = Form(True),  # currently unused (section already exists)
    files: List[UploadFile] = File(...),
    media_types: List[str] = Form(...),
    captured_ats: List[str] = Form(...),
    content_hashes: List[str] = Form(...),
    token_payload: dict = Depends(_verify_bridge_token),
):
    """
    Ingest one DSLRBooth session.

    - Parallel arrays: files[i], media_types[i], captured_ats[i], content_hashes[i].
    - Server recomputes MD5 from the received bytes; client hash is a hint.
    - Dedupe via unique index (gallery_id, session_id, content_hash):
      duplicates return status="duplicate" with the existing photo_id.
    - Returns 200 if all succeed, 207 if mixed.
    """
    if not SESSION_ID_RE.match(session_id or ""):
        raise HTTPException(
            status_code=422,
            detail="Invalid session_id (1-128 chars, ASCII alnum + _-:)",
        )

    if not (len(files) == len(media_types) == len(captured_ats) == len(content_hashes)):
        raise HTTPException(
            status_code=422,
            detail="files, media_types, captured_ats and content_hashes must be parallel arrays of equal length",
        )

    if len(files) == 0:
        raise HTTPException(status_code=422, detail="No files provided")

    gallery, section = await _find_section_by_link(contributor_link)

    # Sanity: token must still match the URL link's gallery/section
    if token_payload.get("gallery_id") != gallery["id"] or token_payload.get("section_id") != section["id"]:
        raise HTTPException(status_code=401, detail="Token scope does not match this section")

    if section.get("type") != "photobooth_bridge":
        raise HTTPException(status_code=400, detail="Section is not a Photobooth Bridge")
    if not section.get("contributor_enabled", False):
        raise HTTPException(status_code=403, detail="Bridge uploads disabled for this section")

    contributor_name = (section.get("contributor_name") or "Photobooth Bridge").strip()
    source_app = request.headers.get("X-Bridge-App-Version", "")
    source_machine = request.headers.get("X-Bridge-Machine", "")
    client_ip = request.client.host if request.client else None

    # Look up existing session photo count to keep ordering stable within session
    existing_in_session = await db.photos.count_documents(
        {"gallery_id": gallery["id"], "section_id": section["id"], "session_id": session_id}
    )

    results = []
    succeeded = duplicates = failed = 0
    bytes_total = 0

    for idx, upload in enumerate(files):
        original_name = upload.filename or f"file_{idx}"
        media_type = (media_types[idx] or "").strip().lower()
        captured_at = (captured_ats[idx] or "").strip()
        client_hash = (content_hashes[idx] or "").strip().lower()

        try:
            if media_type not in ALLOWED_MEDIA_TYPES:
                raise ValueError(f"Invalid media_type '{media_type}'")

            file_ext = (original_name.rsplit(".", 1)[-1] if "." in original_name else "").lower()
            if not file_ext or (file_ext not in ALLOWED_IMAGE_EXTS and file_ext not in ALLOWED_VIDEO_EXTS):
                raise ValueError(f"Unsupported file extension '{file_ext}'")

            content = await upload.read()
            size = len(content)
            if size == 0:
                raise ValueError("Empty file")
            if size > MAX_FILE_BYTES:
                raise ValueError(f"File too large ({size} bytes > {MAX_FILE_BYTES})")

            md5 = hashlib.md5(content).hexdigest()
            if client_hash and client_hash != md5:
                # Hash mismatch: the bytes received differ from what the client thinks they sent.
                results.append({
                    "filename": original_name,
                    "status": "failed",
                    "error": f"hash mismatch: client={client_hash} server={md5}",
                })
                failed += 1
                continue

            # Dedupe: same (gallery, session, hash) -> return existing
            existing = await db.photos.find_one(
                {
                    "gallery_id": gallery["id"],
                    "session_id": session_id,
                    "content_hash": md5,
                },
                {"_id": 0, "id": 1, "url": 1, "thumbnail_url": 1, "filename": 1},
            )
            if existing:
                results.append({
                    "filename": original_name,
                    "status": "duplicate",
                    "photo_id": existing["id"],
                    "url": existing.get("url"),
                })
                duplicates += 1
                continue

            # Upload
            photo_id = str(uuid.uuid4())
            safe_name = _safe_filename(original_name)
            is_image = file_ext in ALLOWED_IMAGE_EXTS

            if is_image:
                # Use existing thumbnail-aware path; it stores under photos/<id>.<ext>
                upload_result = await storage.upload_with_thumbnails(
                    photo_id=photo_id,
                    content=content,
                    file_ext=file_ext,
                    content_type=upload.content_type or "image/jpeg",
                )
                if not upload_result.get("success"):
                    raise RuntimeError(upload_result.get("error") or "upload failed")
                photo_url = upload_result["original_url"]
                storage_key = upload_result["original_key"]
                thumb_small = upload_result.get("thumbnail_url")
                thumb_medium = upload_result.get("thumbnail_medium_url")
            else:
                # Video: namespace under photobooth path; no thumbnails generated server-side
                storage_key = f"galleries/{gallery['id']}/photobooth/{session_id}/{md5[:8]}_{safe_name}"
                ok, url_or_err = await storage.upload_file(
                    storage_key, content, upload.content_type or "video/mp4"
                )
                if not ok:
                    raise RuntimeError(url_or_err)
                photo_url = url_or_err
                thumb_small = None
                thumb_medium = None

            now_iso = datetime.now(timezone.utc).isoformat()
            order_idx = existing_in_session + idx
            photo_doc = {
                "id": photo_id,
                "gallery_id": gallery["id"],
                "section_id": section["id"],
                "filename": safe_name,
                "original_filename": original_name,
                "url": photo_url,
                "thumbnail_url": thumb_small,
                "thumbnail_medium_url": thumb_medium,
                "storage_key": storage_key,
                "uploaded_by": "bridge",
                "contributor_name": contributor_name,
                "file_size": size,
                "uploaded_at": now_iso,
                "order": order_idx,
                "is_highlight": False,
                "is_hidden": False,
                "is_flagged": False,
                "auto_flagged": False,
                # Bridge fields
                "session_id": session_id,
                "source": "dslrbooth_bridge",
                "media_type": media_type,
                "content_hash": md5,
                "captured_at": captured_at or now_iso,
            }
            try:
                await db.photos.insert_one(photo_doc)
            except Exception as e:
                # Likely duplicate key (parallel client retry hit unique index race)
                msg = str(e).lower()
                if "duplicate key" in msg or "e11000" in msg:
                    existing = await db.photos.find_one(
                        {"gallery_id": gallery["id"], "session_id": session_id, "content_hash": md5},
                        {"_id": 0, "id": 1, "url": 1},
                    )
                    if existing:
                        results.append({
                            "filename": original_name,
                            "status": "duplicate",
                            "photo_id": existing["id"],
                            "url": existing.get("url"),
                        })
                        duplicates += 1
                        continue
                raise

            # Counters
            await db.galleries.update_one(
                {"id": gallery["id"]},
                {"$inc": {"storage_used": size, "photo_count": 1, "contributor_photos": 1}},
            )
            await db.users.update_one(
                {"id": gallery["photographer_id"]},
                {"$inc": {"storage_used": size}},
            )

            # Upsert session metadata for cheap grouping/sorting
            await db.bridge_sessions.update_one(
                {"gallery_id": gallery["id"], "session_id": session_id},
                {
                    "$setOnInsert": {
                        "gallery_id": gallery["id"],
                        "section_id": section["id"],
                        "session_id": session_id,
                        "first_captured_at": photo_doc["captured_at"],
                        "first_seen_at": now_iso,
                    },
                    "$set": {
                        "last_file_at": now_iso,
                        "event_title": event_title or section.get("name"),
                    },
                    "$inc": {"file_count": 1, "bytes_total": size},
                    "$min": {"earliest_captured_at": photo_doc["captured_at"]},
                },
                upsert=True,
            )

            results.append({
                "filename": original_name,
                "status": "uploaded",
                "photo_id": photo_id,
                "url": photo_url,
            })
            succeeded += 1
            bytes_total += size

        except Exception as e:
            logger.exception(f"Bridge ingest failed for {original_name}: {e}")
            results.append({
                "filename": original_name,
                "status": "failed",
                "error": str(e)[:300],
            })
            failed += 1

    # Audit log (best-effort; do not fail request)
    try:
        await db.bridge_audit.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": gallery["photographer_id"],
            "gallery_id": gallery["id"],
            "section_id": section["id"],
            "session_id": session_id,
            "files_count": len(files),
            "bytes_total": bytes_total,
            "succeeded": succeeded,
            "duplicates": duplicates,
            "failed": failed,
            "source_app_version": source_app,
            "source_machine": source_machine,
            "ip": client_ip,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.warning(f"bridge_audit insert failed: {e}")

    body = {
        "session_id": session_id,
        "total": len(files),
        "succeeded": succeeded,
        "duplicates": duplicates,
        "failed": failed,
        "files": results,
    }
    status_code = 200 if failed == 0 else 207
    return Response(
        content=__import__("json").dumps(body),
        status_code=status_code,
        media_type="application/json",
    )


# --- Public per-session download + QR ---------------------------------------

async def _public_resolve_session(share_link: str, session_id: str) -> tuple[dict, list]:
    gallery = await db.galleries.find_one({"share_link": share_link}, {"_id": 0})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")
    photos_cursor = db.photos.find(
        {"gallery_id": gallery["id"], "session_id": session_id, "is_hidden": {"$ne": True}},
        {"_id": 0},
    ).sort("captured_at", 1)
    photos = [p async for p in photos_cursor]
    if not photos:
        raise HTTPException(status_code=404, detail="Session not found or empty")
    return gallery, photos


async def _fetch_url_bytes(url: str, timeout: float = 30.0) -> Optional[bytes]:
    if not url:
        return None
    if url.startswith("/"):
        # Local served path; convert to absolute file path
        local_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
        # Best effort: filename is the last segment
        fname = url.rstrip("/").split("/")[-1]
        candidate = os.path.join(local_path, fname)
        if os.path.exists(candidate):
            with open(candidate, "rb") as f:
                return f.read()
        return None
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.get(url)
            if r.status_code == 200:
                return r.content
    except Exception as e:
        logger.warning(f"fetch failed for {url}: {e}")
    return None


@public_router.get("/{share_link}/session/{session_id}/download")
async def public_session_download(share_link: str, session_id: str):
    """Stream a ZIP of the session's files. No auth (gallery share_link gates access)."""
    gallery, photos = await _public_resolve_session(share_link, session_id)

    # Build ZIP in-memory (sessions are small: typically 1-12 files)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_STORED) as zf:
        for p in photos:
            data = await _fetch_url_bytes(p.get("url"))
            if data is None:
                continue
            arcname = p.get("original_filename") or p.get("filename") or f"{p['id']}"
            arcname = _safe_filename(arcname)
            zf.writestr(arcname, data)

    buf.seek(0)
    fname = f"{gallery.get('event_title') or gallery.get('title') or 'session'}_{session_id}.zip"
    fname = _safe_filename(fname)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@public_router.get("/{share_link}/session/{session_id}/qr")
async def public_session_qr(share_link: str, session_id: str, request: Request):
    """Return a PNG QR code that points to the per-session download URL."""
    # Confirm session exists
    await _public_resolve_session(share_link, session_id)

    base = os.environ.get("FRONTEND_URL", "").rstrip("/") or str(request.base_url).rstrip("/")
    download_url = f"{base}/api/public/gallery/{share_link}/session/{session_id}/download"

    img = qrcode.make(download_url)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return Response(content=buf.read(), media_type="image/png")


@public_router.get("/{share_link}/sessions")
async def public_list_sessions(share_link: str):
    """List all bridge sessions in this gallery, oldest first, with file counts and a thumbnail."""
    gallery = await db.galleries.find_one({"share_link": share_link}, {"_id": 0, "id": 1})
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")

    sessions_cursor = db.bridge_sessions.find(
        {"gallery_id": gallery["id"]}, {"_id": 0}
    ).sort("earliest_captured_at", 1)
    sessions = [s async for s in sessions_cursor]

    # Attach a cover thumbnail from the earliest photo
    out = []
    for s in sessions:
        cover = await db.photos.find_one(
            {"gallery_id": gallery["id"], "session_id": s["session_id"], "is_hidden": {"$ne": True}},
            {"_id": 0, "thumbnail_url": 1, "url": 1, "captured_at": 1},
            sort=[("captured_at", 1)],
        )
        out.append({
            "session_id": s["session_id"],
            "section_id": s.get("section_id"),
            "earliest_captured_at": s.get("earliest_captured_at") or s.get("first_captured_at"),
            "last_file_at": s.get("last_file_at"),
            "file_count": s.get("file_count", 0),
            "bytes_total": s.get("bytes_total", 0),
            "cover_url": (cover or {}).get("thumbnail_url") or (cover or {}).get("url"),
        })
    return {"sessions": out}


# --- Admin: create a Photobooth Bridge section + manage password ------------

@admin_router.post("/galleries/{gallery_id}/sections/photobooth-bridge")
async def create_photobooth_bridge_section(
    gallery_id: str,
    payload: dict = Body(default={}),
    current_user: dict = Depends(get_current_user),
):
    """Create a new Photobooth Bridge section.

    Returns the contributor_link and section_password to paste into the bridge app.
    Body: { "name": "Photobooth", "contributor_name": "Snap Studio", "section_password": "optional-explicit" }
    """
    gallery = await db.galleries.find_one(
        {"id": gallery_id, "photographer_id": current_user["id"]},
        {"_id": 0},
    )
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")

    name = (payload.get("name") or "Photobooth").strip()[:80]
    contributor_name = (payload.get("contributor_name") or "Photobooth Bridge").strip()[:100]
    section_password = (payload.get("section_password") or secrets.token_urlsafe(9))[:64]

    section_id = str(uuid.uuid4())
    contributor_link = secrets.token_urlsafe(16)

    sections = gallery.get("sections", []) or []
    next_order = (max((s.get("order", 0) for s in sections), default=-1)) + 1

    new_section = {
        "id": section_id,
        "name": name,
        "order": next_order,
        "type": "photobooth_bridge",
        "contributor_link": contributor_link,
        "contributor_name": contributor_name,
        "contributor_role": "Photobooth",
        "contributor_enabled": True,
        "section_password": section_password,
    }
    sections.append(new_section)
    await db.galleries.update_one({"id": gallery_id}, {"$set": {"sections": sections}})

    return {
        "section_id": section_id,
        "contributor_link": contributor_link,
        "section_password": section_password,
        "section": new_section,
    }


@admin_router.post("/galleries/{gallery_id}/sections/{section_id}/bridge-password")
async def rotate_bridge_password(
    gallery_id: str,
    section_id: str,
    payload: dict = Body(default={}),
    current_user: dict = Depends(get_current_user),
):
    """Rotate (or set) the section_password for a Photobooth Bridge section."""
    gallery = await db.galleries.find_one(
        {"id": gallery_id, "photographer_id": current_user["id"]},
        {"_id": 0},
    )
    if not gallery:
        raise HTTPException(status_code=404, detail="Gallery not found")

    sections = gallery.get("sections", []) or []
    idx = next((i for i, s in enumerate(sections) if s.get("id") == section_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Section not found")
    if sections[idx].get("type") != "photobooth_bridge":
        raise HTTPException(status_code=400, detail="Not a Photobooth Bridge section")

    new_password = (payload.get("section_password") or secrets.token_urlsafe(9))[:64]
    sections[idx]["section_password"] = new_password
    await db.galleries.update_one({"id": gallery_id}, {"$set": {"sections": sections}})
    return {
        "section_id": section_id,
        "contributor_link": sections[idx].get("contributor_link"),
        "section_password": new_password,
    }


# --- Index bootstrapping (called from server.py at startup) ------------------

async def ensure_bridge_indexes():
    """Create the indexes the bridge module relies on. Idempotent."""
    # photos: dedupe + grouping
    try:
        await db.photos.create_index(
            [("gallery_id", 1), ("session_id", 1), ("content_hash", 1)],
            name="bridge_dedupe_unique",
            unique=True,
            partialFilterExpression={"session_id": {"$type": "string"}},
        )
    except Exception as e:
        logger.warning(f"bridge_dedupe_unique index: {e}")
    try:
        await db.photos.create_index(
            [("gallery_id", 1), ("session_id", 1), ("captured_at", 1)],
            name="bridge_session_sort",
        )
    except Exception as e:
        logger.warning(f"bridge_session_sort index: {e}")

    # bridge_sessions metadata
    try:
        await db.bridge_sessions.create_index(
            [("gallery_id", 1), ("session_id", 1)],
            name="bridge_sessions_unique",
            unique=True,
        )
    except Exception as e:
        logger.warning(f"bridge_sessions_unique index: {e}")
    try:
        await db.bridge_sessions.create_index(
            [("gallery_id", 1), ("earliest_captured_at", 1)],
            name="bridge_sessions_oldest_first",
        )
    except Exception as e:
        logger.warning(f"bridge_sessions_oldest_first index: {e}")

    # bridge_audit TTL (180 days) — created_at is ISO string so we use a normal index here;
    # consumers can prune via a cron. (TTL requires Date; this codebase stores ISO strings.)
    try:
        await db.bridge_audit.create_index([("created_at", -1)], name="bridge_audit_recent")
    except Exception as e:
        logger.warning(f"bridge_audit_recent index: {e}")
