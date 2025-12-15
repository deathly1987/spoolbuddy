"""
ESP32 Firmware OTA Update API Routes

Handles firmware version checking and OTA binary serving for the SpoolBuddy device.
"""

import logging
from pathlib import Path
from typing import Optional
from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from config import GITHUB_REPO, settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/firmware", tags=["firmware"])

# Firmware releases directory
FIRMWARE_DIR = settings.project_root / "firmware" / "releases"

# Cache for GitHub firmware checks
_firmware_cache: Optional[dict] = None
_firmware_cache_time: Optional[datetime] = None
CACHE_DURATION = timedelta(minutes=5)


class FirmwareVersion(BaseModel):
    version: str
    filename: str
    size: Optional[int] = None
    checksum: Optional[str] = None
    url: Optional[str] = None


class FirmwareCheck(BaseModel):
    current_version: Optional[str] = None
    latest_version: Optional[str] = None
    update_available: bool = False
    download_url: Optional[str] = None
    release_notes: Optional[str] = None
    error: Optional[str] = None


def _get_local_firmware() -> list[FirmwareVersion]:
    """Get list of locally available firmware files."""
    if not FIRMWARE_DIR.exists():
        return []

    firmware_files = []
    for f in FIRMWARE_DIR.glob("*.bin"):
        # Extract version from filename (e.g., spoolbuddy-1.0.0.bin -> 1.0.0)
        name = f.stem
        version = name.replace("spoolbuddy-", "").replace("firmware-", "")

        firmware_files.append(FirmwareVersion(
            version=version,
            filename=f.name,
            size=f.stat().st_size,
        ))

    # Sort by version descending
    firmware_files.sort(key=lambda x: x.version, reverse=True)
    return firmware_files


def _compare_versions(current: str, latest: str) -> bool:
    """Compare version strings. Returns True if latest > current."""
    try:
        current_parts = [int(x) for x in current.split(".")]
        latest_parts = [int(x) for x in latest.split(".")]

        while len(current_parts) < len(latest_parts):
            current_parts.append(0)
        while len(latest_parts) < len(current_parts):
            latest_parts.append(0)

        return latest_parts > current_parts
    except (ValueError, AttributeError):
        return latest > current


@router.get("/version", response_model=list[FirmwareVersion])
async def list_firmware_versions():
    """List available firmware versions (local files)."""
    return _get_local_firmware()


@router.get("/latest", response_model=FirmwareVersion)
async def get_latest_firmware():
    """Get the latest available firmware version."""
    firmware_list = _get_local_firmware()
    if not firmware_list:
        raise HTTPException(status_code=404, detail="No firmware available")
    return firmware_list[0]


@router.get("/check", response_model=FirmwareCheck)
async def check_firmware_update(current_version: Optional[str] = None):
    """
    Check for firmware updates.

    Checks both local releases directory and GitHub releases.

    Args:
        current_version: The device's current firmware version
    """
    global _firmware_cache, _firmware_cache_time

    result = FirmwareCheck(current_version=current_version)

    # Check local firmware first
    local_firmware = _get_local_firmware()
    if local_firmware:
        latest_local = local_firmware[0]
        result.latest_version = latest_local.version
        result.download_url = f"/api/firmware/download/{latest_local.filename}"

        if current_version:
            result.update_available = _compare_versions(current_version, latest_local.version)

        return result

    # Check GitHub releases if no local firmware
    if not _firmware_cache or not _firmware_cache_time or \
            datetime.now() - _firmware_cache_time > CACHE_DURATION:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"https://api.github.com/repos/{GITHUB_REPO}/releases",
                    headers={"Accept": "application/vnd.github.v3+json"},
                )

                if response.status_code == 200:
                    releases = response.json()

                    # Find release with firmware asset
                    for release in releases:
                        for asset in release.get("assets", []):
                            if asset["name"].endswith(".bin"):
                                _firmware_cache = {
                                    "version": release["tag_name"].lstrip("v"),
                                    "filename": asset["name"],
                                    "url": asset["browser_download_url"],
                                    "notes": release.get("body"),
                                }
                                _firmware_cache_time = datetime.now()
                                break
                        if _firmware_cache:
                            break

        except Exception as e:
            logger.error(f"Error checking GitHub for firmware: {e}")
            result.error = str(e)

    if _firmware_cache:
        result.latest_version = _firmware_cache["version"]
        result.download_url = _firmware_cache["url"]
        result.release_notes = _firmware_cache.get("notes")

        if current_version:
            result.update_available = _compare_versions(
                current_version, _firmware_cache["version"]
            )

    return result


@router.get("/download/{filename}")
async def download_firmware(filename: str):
    """
    Download a firmware binary file.

    For ESP32 OTA updates, the device will request this endpoint.
    """
    # Security: only allow .bin files and prevent directory traversal
    if not filename.endswith(".bin") or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    filepath = FIRMWARE_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Firmware not found")

    return FileResponse(
        filepath,
        media_type="application/octet-stream",
        filename=filename,
        headers={
            "Content-Length": str(filepath.stat().st_size),
        }
    )


@router.get("/ota")
async def get_ota_firmware(version: Optional[str] = None):
    """
    ESP32 OTA endpoint.

    This endpoint is designed for ESP32 HTTP OTA updates.
    It returns the latest firmware binary with appropriate headers.

    Args:
        version: Optional specific version to download
    """
    firmware_list = _get_local_firmware()
    if not firmware_list:
        raise HTTPException(status_code=404, detail="No firmware available")

    # Find requested version or use latest
    firmware = None
    if version:
        for fw in firmware_list:
            if fw.version == version:
                firmware = fw
                break
        if not firmware:
            raise HTTPException(status_code=404, detail=f"Version {version} not found")
    else:
        firmware = firmware_list[0]

    filepath = FIRMWARE_DIR / firmware.filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Firmware file not found")

    # Return binary with ESP32 OTA-compatible headers
    return FileResponse(
        filepath,
        media_type="application/octet-stream",
        filename=firmware.filename,
        headers={
            "Content-Length": str(filepath.stat().st_size),
            "X-Firmware-Version": firmware.version,
        }
    )


@router.post("/upload")
async def upload_firmware():
    """
    Upload a new firmware binary.

    TODO: Implement firmware upload with validation.
    """
    raise HTTPException(status_code=501, detail="Firmware upload not yet implemented")
