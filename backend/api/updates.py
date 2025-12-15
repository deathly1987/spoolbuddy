"""
Application Update API Routes

Handles version checking and git-based updates from GitHub.
"""

import asyncio
import subprocess
import logging
from typing import Optional
from datetime import datetime, timedelta
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

from config import APP_VERSION, GITHUB_REPO, settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/updates", tags=["updates"])


# Models
class VersionInfo(BaseModel):
    version: str
    git_commit: Optional[str] = None
    git_branch: Optional[str] = None


class UpdateCheck(BaseModel):
    current_version: str
    latest_version: Optional[str] = None
    update_available: bool = False
    release_notes: Optional[str] = None
    release_url: Optional[str] = None
    published_at: Optional[str] = None
    error: Optional[str] = None


class UpdateStatus(BaseModel):
    status: str  # "idle", "checking", "downloading", "applying", "restarting", "error"
    message: Optional[str] = None
    progress: Optional[int] = None
    error: Optional[str] = None


class UpdateApplyRequest(BaseModel):
    version: Optional[str] = None  # If None, updates to latest


# Global state for update operations
_update_status = UpdateStatus(status="idle")
_update_lock = asyncio.Lock()

# Cache for update checks (avoid hammering GitHub API)
_update_cache: Optional[UpdateCheck] = None
_cache_time: Optional[datetime] = None
CACHE_DURATION = timedelta(minutes=5)


def _run_git_command(args: list[str], cwd: Optional[Path] = None) -> tuple[bool, str]:
    """Run a git command and return (success, output)."""
    try:
        result = subprocess.run(
            ["git"] + args,
            cwd=cwd or settings.project_root,
            capture_output=True,
            text=True,
            timeout=60,
        )
        output = result.stdout.strip() or result.stderr.strip()
        return result.returncode == 0, output
    except subprocess.TimeoutExpired:
        return False, "Command timed out"
    except Exception as e:
        return False, str(e)


def _get_git_info() -> tuple[Optional[str], Optional[str]]:
    """Get current git commit and branch."""
    commit = None
    branch = None

    success, output = _run_git_command(["rev-parse", "--short", "HEAD"])
    if success:
        commit = output

    success, output = _run_git_command(["rev-parse", "--abbrev-ref", "HEAD"])
    if success:
        branch = output

    return commit, branch


@router.get("/version", response_model=VersionInfo)
async def get_version():
    """Get current application version and git info."""
    commit, branch = _get_git_info()
    return VersionInfo(
        version=APP_VERSION,
        git_commit=commit,
        git_branch=branch,
    )


@router.get("/check", response_model=UpdateCheck)
async def check_for_updates(force: bool = False):
    """
    Check for available updates from GitHub.

    Args:
        force: If True, bypass cache and check GitHub directly
    """
    global _update_cache, _cache_time

    # Return cached result if available and not expired
    if not force and _update_cache and _cache_time:
        if datetime.now() - _cache_time < CACHE_DURATION:
            return _update_cache

    result = UpdateCheck(current_version=APP_VERSION)

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Get latest release from GitHub
            response = await client.get(
                f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest",
                headers={"Accept": "application/vnd.github.v3+json"},
            )

            if response.status_code == 404:
                # No releases yet, check tags instead
                response = await client.get(
                    f"https://api.github.com/repos/{GITHUB_REPO}/tags",
                    headers={"Accept": "application/vnd.github.v3+json"},
                )
                if response.status_code == 200:
                    tags = response.json()
                    if tags:
                        latest_tag = tags[0]["name"].lstrip("v")
                        result.latest_version = latest_tag
                        result.update_available = _compare_versions(
                            APP_VERSION, latest_tag
                        )
                    else:
                        # No releases or tags - this is fine for development
                        result.latest_version = APP_VERSION
                        result.update_available = False
                else:
                    # No releases or tags - this is fine for development
                    result.latest_version = APP_VERSION
                    result.update_available = False

            elif response.status_code == 200:
                data = response.json()
                latest_version = data.get("tag_name", "").lstrip("v")
                result.latest_version = latest_version
                result.release_notes = data.get("body")
                result.release_url = data.get("html_url")
                result.published_at = data.get("published_at")
                result.update_available = _compare_versions(APP_VERSION, latest_version)

            else:
                result.error = f"GitHub API error: {response.status_code}"

    except httpx.TimeoutException:
        result.error = "Timeout checking for updates"
    except Exception as e:
        logger.error(f"Error checking for updates: {e}")
        result.error = str(e)

    # Cache the result
    _update_cache = result
    _cache_time = datetime.now()

    return result


def _compare_versions(current: str, latest: str) -> bool:
    """Compare version strings. Returns True if latest > current."""
    try:
        current_parts = [int(x) for x in current.split(".")]
        latest_parts = [int(x) for x in latest.split(".")]

        # Pad shorter version with zeros
        while len(current_parts) < len(latest_parts):
            current_parts.append(0)
        while len(latest_parts) < len(current_parts):
            latest_parts.append(0)

        return latest_parts > current_parts
    except (ValueError, AttributeError):
        # If parsing fails, do string comparison
        return latest > current


async def _apply_update_task(version: Optional[str] = None):
    """Background task to apply update via git."""
    global _update_status

    try:
        _update_status = UpdateStatus(status="downloading", message="Fetching updates...")

        # Fetch latest from remote
        success, output = _run_git_command(["fetch", "--all", "--tags"])
        if not success:
            _update_status = UpdateStatus(status="error", error=f"Git fetch failed: {output}")
            return

        _update_status = UpdateStatus(status="applying", message="Applying updates...")

        # Determine target ref
        if version:
            target = f"v{version}" if not version.startswith("v") else version
        else:
            # Get default branch
            success, default_branch = _run_git_command(
                ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"]
            )
            if success:
                target = default_branch.replace("origin/", "")
            else:
                target = "main"

        # Check if target exists
        success, _ = _run_git_command(["rev-parse", "--verify", target])
        if not success:
            # Try with origin/ prefix
            success, _ = _run_git_command(["rev-parse", "--verify", f"origin/{target}"])
            if success:
                target = f"origin/{target}"
            else:
                _update_status = UpdateStatus(
                    status="error", error=f"Target '{target}' not found"
                )
                return

        # Stash any local changes
        _run_git_command(["stash", "push", "-m", "SpoolBuddy auto-stash before update"])

        # Pull/checkout the target
        if version:
            success, output = _run_git_command(["checkout", target])
        else:
            success, output = _run_git_command(["pull", "--ff-only"])

        if not success:
            # Try reset if pull fails
            success, output = _run_git_command(["reset", "--hard", target])

        if not success:
            _update_status = UpdateStatus(status="error", error=f"Git update failed: {output}")
            return

        _update_status = UpdateStatus(
            status="restarting",
            message="Update applied. Please restart the application.",
        )

        logger.info("Update applied successfully. Restart required.")

    except Exception as e:
        logger.error(f"Update failed: {e}")
        _update_status = UpdateStatus(status="error", error=str(e))


@router.post("/apply", response_model=UpdateStatus)
async def apply_update(
    request: UpdateApplyRequest,
    background_tasks: BackgroundTasks,
):
    """
    Apply an update.

    This will:
    1. Fetch latest changes from git
    2. Apply the update (pull or checkout specific version)
    3. Return status indicating restart is needed
    """
    global _update_status

    async with _update_lock:
        if _update_status.status in ("downloading", "applying"):
            raise HTTPException(
                status_code=409, detail="Update already in progress"
            )

        _update_status = UpdateStatus(status="checking", message="Starting update...")
        background_tasks.add_task(_apply_update_task, request.version)

    return _update_status


@router.get("/status", response_model=UpdateStatus)
async def get_update_status():
    """Get current update status."""
    return _update_status


@router.post("/reset-status")
async def reset_update_status():
    """Reset update status to idle (use after restart or error)."""
    global _update_status
    _update_status = UpdateStatus(status="idle")
    return _update_status
