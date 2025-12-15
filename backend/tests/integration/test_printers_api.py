"""Integration tests for the printers API."""

import pytest


class TestPrintersAPI:
    """Test printer CRUD operations via API."""

    async def test_list_printers_empty(self, async_client):
        """Test listing printers when database is empty."""
        response = await async_client.get("/api/printers")
        assert response.status_code == 200
        assert response.json() == []

    async def test_create_printer(self, async_client, sample_printer_data):
        """Test creating a new printer."""
        response = await async_client.post("/api/printers", json=sample_printer_data)
        assert response.status_code == 201

        data = response.json()
        assert data["serial"] == sample_printer_data["serial"]
        assert data["name"] == sample_printer_data["name"]
        assert data["model"] == sample_printer_data["model"]

    async def test_create_printer_minimal(self, async_client):
        """Test creating a printer with minimal required fields."""
        response = await async_client.post("/api/printers", json={
            "serial": "00M09A987654321"
        })
        assert response.status_code == 201

        data = response.json()
        assert data["serial"] == "00M09A987654321"

    async def test_get_printer(self, async_client, sample_printer_data):
        """Test getting a specific printer by serial."""
        # Create a printer first
        await async_client.post("/api/printers", json=sample_printer_data)

        # Get the printer
        response = await async_client.get(f"/api/printers/{sample_printer_data['serial']}")
        assert response.status_code == 200

        data = response.json()
        assert data["serial"] == sample_printer_data["serial"]
        assert data["name"] == sample_printer_data["name"]

    async def test_get_printer_not_found(self, async_client):
        """Test getting a non-existent printer."""
        response = await async_client.get("/api/printers/nonexistent-serial")
        assert response.status_code == 404

    async def test_update_printer(self, async_client, sample_printer_data):
        """Test updating a printer."""
        # Create a printer first
        await async_client.post("/api/printers", json=sample_printer_data)

        # Update the printer
        update_data = {"name": "Updated Printer Name"}
        response = await async_client.put(
            f"/api/printers/{sample_printer_data['serial']}",
            json=update_data
        )
        assert response.status_code == 200

        data = response.json()
        assert data["name"] == "Updated Printer Name"

    async def test_delete_printer(self, async_client, sample_printer_data):
        """Test deleting a printer."""
        # Create a printer first
        await async_client.post("/api/printers", json=sample_printer_data)

        # Delete the printer
        response = await async_client.delete(f"/api/printers/{sample_printer_data['serial']}")
        assert response.status_code == 204

        # Verify it's deleted
        get_response = await async_client.get(f"/api/printers/{sample_printer_data['serial']}")
        assert get_response.status_code == 404

    async def test_delete_printer_not_found(self, async_client):
        """Test deleting a non-existent printer."""
        response = await async_client.delete("/api/printers/nonexistent-serial")
        assert response.status_code == 404

    async def test_upsert_printer(self, async_client, sample_printer_data):
        """Test that creating a printer with same serial updates it."""
        # Create a printer
        await async_client.post("/api/printers", json=sample_printer_data)

        # Create again with same serial but different name
        updated_data = {**sample_printer_data, "name": "New Name"}
        response = await async_client.post("/api/printers", json=updated_data)
        assert response.status_code == 201  # Still returns 201 for upsert

        # Verify it was updated, not duplicated
        list_response = await async_client.get("/api/printers")
        printers = list_response.json()
        assert len(printers) == 1
        assert printers[0]["name"] == "New Name"


class TestPrintersDatabase:
    """Test printer database operations directly."""

    async def test_create_and_get_printer(self, test_db, printer_factory):
        """Test creating and retrieving a printer from database."""
        printer = await printer_factory(name="Test Printer", model="P1S")

        retrieved = await test_db.get_printer(printer.serial)
        assert retrieved is not None
        assert retrieved.name == "Test Printer"
        assert retrieved.model == "P1S"

    async def test_get_auto_connect_printers(self, test_db, printer_factory):
        """Test retrieving only auto-connect enabled printers."""
        # Create printers with different auto_connect settings
        await printer_factory(name="Printer 1", auto_connect=True)
        await printer_factory(name="Printer 2", auto_connect=False)
        await printer_factory(name="Printer 3", auto_connect=True)

        auto_printers = await test_db.get_auto_connect_printers()
        assert len(auto_printers) == 2
        assert all(p.auto_connect for p in auto_printers)

    async def test_delete_printer(self, test_db, printer_factory):
        """Test deleting a printer."""
        printer = await printer_factory()

        deleted = await test_db.delete_printer(printer.serial)
        assert deleted is True

        retrieved = await test_db.get_printer(printer.serial)
        assert retrieved is None

    async def test_delete_printer_not_found(self, test_db):
        """Test deleting a non-existent printer."""
        deleted = await test_db.delete_printer("nonexistent")
        assert deleted is False
