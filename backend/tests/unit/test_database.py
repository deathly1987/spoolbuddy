"""Unit tests for database operations."""

import pytest


class TestSettingsDatabase:
    """Test settings key-value store operations."""

    async def test_set_and_get_setting(self, test_db):
        """Test setting and getting a value."""
        await test_db.set_setting("test_key", "test_value")
        value = await test_db.get_setting("test_key")
        assert value == "test_value"

    async def test_get_setting_not_found(self, test_db):
        """Test getting a non-existent setting."""
        value = await test_db.get_setting("nonexistent_key")
        assert value is None

    async def test_update_setting(self, test_db):
        """Test updating an existing setting."""
        await test_db.set_setting("test_key", "initial_value")
        await test_db.set_setting("test_key", "updated_value")

        value = await test_db.get_setting("test_key")
        assert value == "updated_value"

    async def test_delete_setting(self, test_db):
        """Test deleting a setting."""
        await test_db.set_setting("test_key", "test_value")

        deleted = await test_db.delete_setting("test_key")
        assert deleted is True

        value = await test_db.get_setting("test_key")
        assert value is None

    async def test_delete_setting_not_found(self, test_db):
        """Test deleting a non-existent setting."""
        deleted = await test_db.delete_setting("nonexistent_key")
        assert deleted is False


class TestSpoolAssignments:
    """Test spool-to-AMS-slot assignment operations."""

    async def test_assign_spool_to_slot(self, test_db, spool_factory, printer_factory):
        """Test assigning a spool to an AMS slot."""
        spool = await spool_factory()
        printer = await printer_factory()

        result = await test_db.assign_spool_to_slot(
            spool.id, printer.serial, ams_id=0, tray_id=0
        )
        assert result is True

        # Verify assignment
        assigned_spool = await test_db.get_spool_for_slot(
            printer.serial, ams_id=0, tray_id=0
        )
        assert assigned_spool == spool.id

    async def test_reassign_slot(self, test_db, spool_factory, printer_factory):
        """Test reassigning a slot to a different spool."""
        spool1 = await spool_factory(material="PLA")
        spool2 = await spool_factory(material="PETG")
        printer = await printer_factory()

        # Assign first spool
        await test_db.assign_spool_to_slot(spool1.id, printer.serial, 0, 0)

        # Reassign to second spool
        await test_db.assign_spool_to_slot(spool2.id, printer.serial, 0, 0)

        # Verify only second spool is assigned
        assigned = await test_db.get_spool_for_slot(printer.serial, 0, 0)
        assert assigned == spool2.id

    async def test_unassign_slot(self, test_db, spool_factory, printer_factory):
        """Test unassigning a spool from a slot."""
        spool = await spool_factory()
        printer = await printer_factory()

        await test_db.assign_spool_to_slot(spool.id, printer.serial, 0, 0)
        result = await test_db.unassign_slot(printer.serial, 0, 0)
        assert result is True

        assigned = await test_db.get_spool_for_slot(printer.serial, 0, 0)
        assert assigned is None

    async def test_unassign_empty_slot(self, test_db, printer_factory):
        """Test unassigning an already empty slot."""
        printer = await printer_factory()

        result = await test_db.unassign_slot(printer.serial, 0, 0)
        assert result is False

    async def test_get_slot_assignments(self, test_db, spool_factory, printer_factory):
        """Test getting all slot assignments for a printer."""
        spool1 = await spool_factory(material="PLA", color_name="Red")
        spool2 = await spool_factory(material="PETG", color_name="Blue")
        printer = await printer_factory()

        await test_db.assign_spool_to_slot(spool1.id, printer.serial, 0, 0)
        await test_db.assign_spool_to_slot(spool2.id, printer.serial, 0, 1)

        assignments = await test_db.get_slot_assignments(printer.serial)
        assert len(assignments) == 2


class TestUsageHistory:
    """Test usage history tracking."""

    async def test_log_usage(self, test_db, spool_factory, printer_factory):
        """Test logging filament usage."""
        spool = await spool_factory()
        printer = await printer_factory()

        usage_id = await test_db.log_usage(
            spool.id, printer.serial, "test_print.gcode", 25.5
        )
        assert usage_id is not None

    async def test_get_usage_history(self, test_db, spool_factory, printer_factory):
        """Test retrieving usage history."""
        spool = await spool_factory()
        printer = await printer_factory()

        await test_db.log_usage(spool.id, printer.serial, "print1.gcode", 10.0)
        await test_db.log_usage(spool.id, printer.serial, "print2.gcode", 20.0)
        await test_db.log_usage(spool.id, printer.serial, "print3.gcode", 15.0)

        history = await test_db.get_usage_history(spool.id)
        assert len(history) == 3

    async def test_get_usage_history_all(self, test_db, spool_factory, printer_factory):
        """Test retrieving all usage history."""
        spool1 = await spool_factory(material="PLA")
        spool2 = await spool_factory(material="PETG")
        printer = await printer_factory()

        await test_db.log_usage(spool1.id, printer.serial, "print1.gcode", 10.0)
        await test_db.log_usage(spool2.id, printer.serial, "print2.gcode", 20.0)

        history = await test_db.get_usage_history()
        assert len(history) == 2

    async def test_get_usage_history_limit(self, test_db, spool_factory, printer_factory):
        """Test usage history respects limit."""
        spool = await spool_factory()
        printer = await printer_factory()

        for i in range(10):
            await test_db.log_usage(spool.id, printer.serial, f"print{i}.gcode", 10.0)

        history = await test_db.get_usage_history(spool.id, limit=5)
        assert len(history) == 5
