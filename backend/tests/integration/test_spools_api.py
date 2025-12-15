"""Integration tests for the spools API."""

import pytest


class TestSpoolsAPI:
    """Test spool CRUD operations via API."""

    async def test_list_spools_empty(self, async_client):
        """Test listing spools when database is empty."""
        response = await async_client.get("/api/spools")
        assert response.status_code == 200
        assert response.json() == []

    async def test_create_spool(self, async_client, sample_spool_data):
        """Test creating a new spool."""
        response = await async_client.post("/api/spools", json=sample_spool_data)
        assert response.status_code == 201

        data = response.json()
        assert data["material"] == sample_spool_data["material"]
        assert data["color_name"] == sample_spool_data["color_name"]
        assert data["brand"] == sample_spool_data["brand"]
        assert "id" in data

    async def test_create_spool_minimal(self, async_client):
        """Test creating a spool with minimal required fields."""
        response = await async_client.post("/api/spools", json={
            "material": "PLA"
        })
        assert response.status_code == 201

        data = response.json()
        assert data["material"] == "PLA"
        assert "id" in data

    async def test_get_spool(self, async_client, sample_spool_data):
        """Test getting a specific spool by ID."""
        # Create a spool first
        create_response = await async_client.post("/api/spools", json=sample_spool_data)
        spool_id = create_response.json()["id"]

        # Get the spool
        response = await async_client.get(f"/api/spools/{spool_id}")
        assert response.status_code == 200

        data = response.json()
        assert data["id"] == spool_id
        assert data["material"] == sample_spool_data["material"]

    async def test_get_spool_not_found(self, async_client):
        """Test getting a non-existent spool."""
        response = await async_client.get("/api/spools/nonexistent-id")
        assert response.status_code == 404

    async def test_update_spool(self, async_client, sample_spool_data):
        """Test updating a spool."""
        # Create a spool first
        create_response = await async_client.post("/api/spools", json=sample_spool_data)
        spool_id = create_response.json()["id"]

        # Update the spool
        update_data = {**sample_spool_data, "color_name": "Blue", "rgba": "#0000FFFF"}
        response = await async_client.put(f"/api/spools/{spool_id}", json=update_data)
        assert response.status_code == 200

        data = response.json()
        assert data["color_name"] == "Blue"
        assert data["rgba"] == "#0000FFFF"

    async def test_update_spool_not_found(self, async_client, sample_spool_data):
        """Test updating a non-existent spool."""
        response = await async_client.put("/api/spools/nonexistent-id", json=sample_spool_data)
        assert response.status_code == 404

    async def test_delete_spool(self, async_client, sample_spool_data):
        """Test deleting a spool."""
        # Create a spool first
        create_response = await async_client.post("/api/spools", json=sample_spool_data)
        spool_id = create_response.json()["id"]

        # Delete the spool
        response = await async_client.delete(f"/api/spools/{spool_id}")
        assert response.status_code == 204

        # Verify it's deleted
        get_response = await async_client.get(f"/api/spools/{spool_id}")
        assert get_response.status_code == 404

    async def test_delete_spool_not_found(self, async_client):
        """Test deleting a non-existent spool."""
        response = await async_client.delete("/api/spools/nonexistent-id")
        assert response.status_code == 404

    async def test_list_spools_multiple(self, async_client):
        """Test listing multiple spools."""
        # Create several spools
        materials = ["PLA", "PETG", "ABS"]
        for material in materials:
            await async_client.post("/api/spools", json={"material": material})

        # List all spools
        response = await async_client.get("/api/spools")
        assert response.status_code == 200

        data = response.json()
        assert len(data) == 3


class TestSpoolsDatabase:
    """Test spool database operations directly."""

    async def test_create_and_get_spool(self, test_db, spool_factory):
        """Test creating and retrieving a spool from database."""
        spool = await spool_factory(material="PLA", color_name="White")

        retrieved = await test_db.get_spool(spool.id)
        assert retrieved is not None
        assert retrieved.material == "PLA"
        assert retrieved.color_name == "White"

    async def test_get_spool_by_tag(self, test_db, spool_factory):
        """Test retrieving a spool by tag ID."""
        spool = await spool_factory(tag_id="ABC123==")

        retrieved = await test_db.get_spool_by_tag("ABC123==")
        assert retrieved is not None
        assert retrieved.id == spool.id

    async def test_get_spool_by_tag_not_found(self, test_db):
        """Test retrieving a non-existent spool by tag ID."""
        retrieved = await test_db.get_spool_by_tag("nonexistent")
        assert retrieved is None

    async def test_update_spool_consumption(self, test_db, spool_factory):
        """Test updating spool consumption tracking."""
        spool = await spool_factory(weight_current=1000)

        # Use 50 grams
        updated = await test_db.update_spool_consumption(spool.id, 50.0)

        assert updated is not None
        assert updated.weight_current == 950  # 1000 - 50
        assert updated.consumed_since_add == 50.0
        assert updated.consumed_since_weight == 50.0

    async def test_set_spool_weight(self, test_db, spool_factory):
        """Test setting spool weight from scale."""
        spool = await spool_factory(weight_current=1000, consumed_since_weight=50.0)

        # Set new weight from scale
        updated = await test_db.set_spool_weight(spool.id, 900)

        assert updated is not None
        assert updated.weight_current == 900
        assert updated.consumed_since_weight == 0  # Reset after scale reading
