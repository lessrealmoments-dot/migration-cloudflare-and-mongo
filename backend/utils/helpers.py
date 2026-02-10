"""
Utility helper functions for EventsGallery backend
"""
import re
from typing import Optional


# ============ YouTube Utilities ============

def extract_youtube_video_id(url: str) -> Optional[str]:
    """Extract video ID from various YouTube URL formats"""
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})',
        r'youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def get_youtube_thumbnail_url(video_id: str) -> str:
    """Get the highest quality thumbnail URL for a YouTube video"""
    return f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"


def get_youtube_embed_url(video_id: str) -> str:
    """Get embeddable YouTube URL"""
    return f"https://www.youtube.com/embed/{video_id}"


# ============ Fotoshare Utilities ============

def extract_fotoshare_event_id(url: str) -> Optional[str]:
    """Extract event ID from fotoshare.co URL"""
    patterns = [
        r'fotoshare\.co/e/([a-zA-Z0-9_-]+)',
        r'fotoshare\.co/event/([a-zA-Z0-9_-]+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


# ============ pCloud Utilities ============

def extract_pcloud_code(url: str) -> Optional[str]:
    """Extract the share code from various pCloud URL formats"""
    patterns = [
        r'code=([a-zA-Z0-9]+)',  # ?code=xxx or &code=xxx
        r'publink/show\?code=([a-zA-Z0-9]+)',
        r'#page=publink&code=([a-zA-Z0-9]+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    # If it's just the code itself (no URL)
    if re.match(r'^[a-zA-Z0-9]+$', url):
        return url
    return None


# ============ Google Drive Utilities ============

def extract_gdrive_folder_id(url: str) -> Optional[str]:
    """Extract folder ID from Google Drive URL"""
    patterns = [
        r'drive\.google\.com/drive/folders/([a-zA-Z0-9_-]+)',
        r'drive\.google\.com/drive/u/\d+/folders/([a-zA-Z0-9_-]+)',
        r'drive\.google\.com/open\?id=([a-zA-Z0-9_-]+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


# ============ String Utilities ============

def generate_random_string(length: int = 32) -> str:
    """Generate a random alphanumeric string"""
    import secrets
    import string
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def format_file_size(size_bytes: int) -> str:
    """Format file size in human-readable format"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} TB"
