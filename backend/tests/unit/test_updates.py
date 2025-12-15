"""Unit tests for the updates API module."""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))


class TestVersionComparison:
    """Tests for version string comparison."""

    def test_compare_versions_newer_major(self):
        from api.updates import _compare_versions
        assert _compare_versions("1.0.0", "2.0.0") is True

    def test_compare_versions_newer_minor(self):
        from api.updates import _compare_versions
        assert _compare_versions("1.0.0", "1.1.0") is True

    def test_compare_versions_newer_patch(self):
        from api.updates import _compare_versions
        assert _compare_versions("1.0.0", "1.0.1") is True

    def test_compare_versions_same(self):
        from api.updates import _compare_versions
        assert _compare_versions("1.0.0", "1.0.0") is False

    def test_compare_versions_older(self):
        from api.updates import _compare_versions
        assert _compare_versions("2.0.0", "1.0.0") is False

    def test_compare_versions_different_length(self):
        from api.updates import _compare_versions
        assert _compare_versions("1.0", "1.0.1") is True
        assert _compare_versions("1.0.1", "1.0") is False

    def test_compare_versions_invalid_fallback(self):
        from api.updates import _compare_versions
        # Invalid versions fall back to string comparison
        assert _compare_versions("abc", "def") is True
        assert _compare_versions("def", "abc") is False


class TestGitInfo:
    """Tests for git info retrieval."""

    def test_get_git_info_success(self):
        from api.updates import _get_git_info

        with patch("api.updates._run_git_command") as mock_git:
            mock_git.side_effect = [
                (True, "abc1234"),  # commit
                (True, "main"),      # branch
            ]

            commit, branch = _get_git_info()
            assert commit == "abc1234"
            assert branch == "main"

    def test_get_git_info_no_git(self):
        from api.updates import _get_git_info

        with patch("api.updates._run_git_command") as mock_git:
            mock_git.return_value = (False, "not a git repo")

            commit, branch = _get_git_info()
            assert commit is None
            assert branch is None


class TestRunGitCommand:
    """Tests for git command execution."""

    def test_run_git_command_success(self):
        from api.updates import _run_git_command

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="success output",
                stderr=""
            )

            success, output = _run_git_command(["status"])
            assert success is True
            assert output == "success output"

    def test_run_git_command_failure(self):
        from api.updates import _run_git_command

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=1,
                stdout="",
                stderr="error message"
            )

            success, output = _run_git_command(["invalid"])
            assert success is False
            assert output == "error message"

    def test_run_git_command_timeout(self):
        from api.updates import _run_git_command
        import subprocess

        with patch("subprocess.run") as mock_run:
            mock_run.side_effect = subprocess.TimeoutExpired("git", 60)

            success, output = _run_git_command(["status"])
            assert success is False
            assert "timed out" in output.lower()
