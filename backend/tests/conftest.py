"""Shared test fixtures for SpoolBuddy backend tests."""

import asyncio
import logging
import os
import sys
import tempfile
from pathlib import Path
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Set test environment before imports
os.environ["SPOOLBUDDY_DATABASE_PATH"] = ":memory:"


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for each test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def test_db():
    """Create a test database with temporary file."""
    from db.database import Database

    # Use a temporary file for the database
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = Path(f.name)

    db = Database(db_path)
    await db.connect()

    yield db

    await db.disconnect()
    # Clean up temp file
    try:
        db_path.unlink()
    except Exception:
        pass


@pytest.fixture
async def async_client(test_db) -> AsyncGenerator[AsyncClient, None]:
    """Create an async test client with test database."""
    from main import app
    from db import get_db

    # Override database dependency
    async def override_get_db():
        return test_db

    # Patch the global db getter
    with patch("db.get_db", override_get_db), \
         patch("db.database.get_db", override_get_db), \
         patch("api.spools.get_db", override_get_db), \
         patch("api.printers.get_db", override_get_db), \
         patch("api.cloud.get_db", override_get_db):

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            yield client


# ============================================================================
# Mock External Services
# ============================================================================

@pytest.fixture
def mock_mqtt_client():
    """Mock the MQTT client for printer communication tests."""
    with patch("mqtt.PrinterManager") as mock:
        instance = MagicMock()
        instance.is_connected = MagicMock(return_value=False)
        instance.connect = AsyncMock()
        instance.disconnect = AsyncMock()
        instance.get_state = MagicMock(return_value=None)
        mock.return_value = instance
        yield instance


@pytest.fixture
def mock_httpx_client():
    """Mock httpx for external HTTP calls."""
    with patch("httpx.AsyncClient") as mock_class:
        mock_instance = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = "OK"
        mock_response.json.return_value = {}

        mock_instance.get = AsyncMock(return_value=mock_response)
        mock_instance.post = AsyncMock(return_value=mock_response)
        mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_instance.__aexit__ = AsyncMock()

        mock_class.return_value = mock_instance
        yield mock_instance


@pytest.fixture
def mock_cloud_service():
    """Mock the Bambu Cloud service."""
    with patch("services.bambu_cloud.get_cloud_service") as mock:
        service = MagicMock()
        service.is_authenticated = False
        service.access_token = None
        service.login_request = AsyncMock(return_value={
            "success": False,
            "needs_verification": True,
            "message": "Verification code sent"
        })
        service.verify_code = AsyncMock(return_value={
            "success": True,
            "message": "Login successful"
        })
        service.set_token = MagicMock()
        service.logout = MagicMock()
        service.get_slicer_settings = AsyncMock(return_value={
            "filament": {"private": [], "public": []},
            "printer": {"private": [], "public": []},
            "print": {"private": [], "public": []},
        })
        mock.return_value = service
        yield service


# ============================================================================
# Factory Fixtures for Test Data
# ============================================================================

@pytest.fixture
def spool_factory(test_db):
    """Factory to create test spools."""
    async def _create_spool(**kwargs):
        from models import SpoolCreate

        defaults = {
            "material": "PLA",
            "color_name": "Black",
            "rgba": "#000000FF",
            "brand": "Bambu Lab",
            "label_weight": 1000,
            "core_weight": 250,
        }
        defaults.update(kwargs)

        spool_data = SpoolCreate(**defaults)
        return await test_db.create_spool(spool_data)

    return _create_spool


@pytest.fixture
def printer_factory(test_db):
    """Factory to create test printers."""
    _counter = [0]

    async def _create_printer(**kwargs):
        from models import PrinterCreate

        _counter[0] += 1
        counter = _counter[0]

        defaults = {
            "serial": f"00M09A{counter:09d}",
            "name": f"Test Printer {counter}",
            "model": "X1C",
            "ip_address": f"192.168.1.{100 + counter}",
            "access_code": "12345678",
            "auto_connect": False,
        }
        defaults.update(kwargs)

        printer_data = PrinterCreate(**defaults)
        return await test_db.create_printer(printer_data)

    return _create_printer


# ============================================================================
# Sample Data Fixtures
# ============================================================================

@pytest.fixture
def sample_spool_data():
    """Sample spool input data."""
    return {
        "material": "PETG",
        "subtype": "Basic",
        "color_name": "Red",
        "rgba": "#FF0000FF",
        "brand": "Bambu Lab",
        "label_weight": 1000,
        "core_weight": 250,
        "weight_new": 1000,
        "weight_current": 800,
        "slicer_filament": "GFPG99",
    }


@pytest.fixture
def sample_printer_data():
    """Sample printer input data."""
    return {
        "serial": "00M09A123456789",
        "name": "My X1 Carbon",
        "model": "X1C",
        "ip_address": "192.168.1.100",
        "access_code": "12345678",
        "auto_connect": True,
    }


# ============================================================================
# Log Capture Fixtures
# ============================================================================

class LogCapture(logging.Handler):
    """Handler that captures log records for testing."""

    def __init__(self):
        super().__init__()
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord):
        self.records.append(record)

    def clear(self):
        self.records.clear()

    def get_errors(self) -> list[logging.LogRecord]:
        """Get all ERROR and CRITICAL level records."""
        return [r for r in self.records if r.levelno >= logging.ERROR]

    def has_errors(self) -> bool:
        """Check if any errors were logged."""
        return len(self.get_errors()) > 0

    def format_errors(self) -> str:
        """Format all errors as a string for assertion messages."""
        errors = self.get_errors()
        if not errors:
            return "No errors"
        formatter = logging.Formatter("%(name)s - %(levelname)s - %(message)s")
        return "\n".join(formatter.format(r) for r in errors)


@pytest.fixture
def capture_logs():
    """Fixture that captures log output during a test."""
    handler = LogCapture()
    handler.setLevel(logging.DEBUG)

    root_logger = logging.getLogger()
    root_logger.addHandler(handler)

    yield handler

    root_logger.removeHandler(handler)
