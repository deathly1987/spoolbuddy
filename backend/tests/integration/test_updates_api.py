"""Integration tests for the updates API."""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock


class TestUpdatesAPI:
    """Test update check and apply operations via API."""

    async def test_get_version(self, async_client):
        """Test getting current version info."""
        with patch("api.updates._get_git_info") as mock_git:
            mock_git.return_value = ("abc1234", "main")

            response = await async_client.get("/api/updates/version")
            assert response.status_code == 200

            data = response.json()
            assert "version" in data
            assert data["git_commit"] == "abc1234"
            assert data["git_branch"] == "main"

    async def test_check_for_updates_no_update(self, async_client, mock_httpx_client):
        """Test checking for updates when current version is latest."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "tag_name": "v0.1.0",  # Same as current version
            "body": "Release notes",
            "html_url": "https://github.com/test/releases/v0.1.0",
            "published_at": "2024-01-01T00:00:00Z"
        }
        mock_httpx_client.get = AsyncMock(return_value=mock_response)

        with patch("httpx.AsyncClient") as mock_class:
            mock_class.return_value.__aenter__ = AsyncMock(return_value=mock_httpx_client)
            mock_class.return_value.__aexit__ = AsyncMock()

            response = await async_client.get("/api/updates/check?force=true")
            assert response.status_code == 200

            data = response.json()
            assert "current_version" in data
            assert data["update_available"] is False

    async def test_check_for_updates_update_available(self, async_client, mock_httpx_client):
        """Test checking for updates when new version is available."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "tag_name": "v2.0.0",  # Newer than current
            "body": "New features!",
            "html_url": "https://github.com/test/releases/v2.0.0",
            "published_at": "2024-12-01T00:00:00Z"
        }
        mock_httpx_client.get = AsyncMock(return_value=mock_response)

        with patch("httpx.AsyncClient") as mock_class:
            mock_class.return_value.__aenter__ = AsyncMock(return_value=mock_httpx_client)
            mock_class.return_value.__aexit__ = AsyncMock()

            response = await async_client.get("/api/updates/check?force=true")
            assert response.status_code == 200

            data = response.json()
            assert data["update_available"] is True
            assert data["latest_version"] == "2.0.0"
            assert data["release_notes"] == "New features!"

    async def test_check_for_updates_no_releases(self, async_client, mock_httpx_client):
        """Test checking for updates when no releases exist."""
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_httpx_client.get = AsyncMock(return_value=mock_response)

        with patch("httpx.AsyncClient") as mock_class:
            mock_class.return_value.__aenter__ = AsyncMock(return_value=mock_httpx_client)
            mock_class.return_value.__aexit__ = AsyncMock()

            # First call returns 404 for releases, second returns empty tags
            mock_response_tags = MagicMock()
            mock_response_tags.status_code = 200
            mock_response_tags.json.return_value = []

            mock_httpx_client.get = AsyncMock(side_effect=[mock_response, mock_response_tags])

            response = await async_client.get("/api/updates/check?force=true")
            assert response.status_code == 200

            data = response.json()
            assert data["update_available"] is False

    async def test_get_update_status(self, async_client):
        """Test getting update status."""
        response = await async_client.get("/api/updates/status")
        assert response.status_code == 200

        data = response.json()
        assert "status" in data
        assert data["status"] == "idle"

    async def test_reset_update_status(self, async_client):
        """Test resetting update status."""
        response = await async_client.post("/api/updates/reset-status")
        assert response.status_code == 200

        data = response.json()
        assert data["status"] == "idle"

    async def test_apply_update(self, async_client):
        """Test applying an update."""
        with patch("api.updates._apply_update_task") as mock_task:
            response = await async_client.post("/api/updates/apply", json={})
            assert response.status_code == 200

            data = response.json()
            assert data["status"] in ["checking", "downloading", "applying", "idle"]
