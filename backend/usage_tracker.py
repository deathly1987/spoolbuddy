"""Usage tracker for automatic filament consumption tracking.

Monitors printer state changes via MQTT and logs filament usage when prints complete.
"""

import asyncio
import logging
from collections.abc import Callable
from dataclasses import dataclass, field

from models import PrinterState

logger = logging.getLogger(__name__)


@dataclass
class PrintSession:
    """Tracks a single print session."""

    printer_serial: str
    print_name: str
    start_progress: int = 0
    # Track AMS tray remain percentages at start
    tray_remain_start: dict = field(default_factory=dict)  # (ams_id, tray_id) -> remain%
    active_tray: int | None = None  # tray_now at start


@dataclass
class UsageTracker:
    """Tracks print sessions and calculates filament usage."""

    # Active print sessions by printer serial
    _sessions: dict[str, PrintSession] = field(default_factory=dict)
    # Callback to log usage (async)
    _on_usage_logged: Callable | None = None
    # Event loop for async operations
    _loop: asyncio.AbstractEventLoop | None = None

    def set_usage_callback(self, callback: Callable):
        """Set callback for when usage is logged.

        Callback signature: async def on_usage(serial, print_name, tray_usage: dict)
        where tray_usage is {(ams_id, tray_id): remain_used_percent}
        """
        self._on_usage_logged = callback

    def set_event_loop(self, loop: asyncio.AbstractEventLoop):
        """Set event loop for async operations."""
        self._loop = loop

    def on_state_update(self, serial: str, state: PrinterState, prev_state: PrinterState | None):
        """Handle printer state update.

        Args:
            serial: Printer serial number
            state: Current printer state
            prev_state: Previous printer state (for comparison)
        """
        gcode_state = state.gcode_state
        prev_gcode_state = prev_state.gcode_state if prev_state else None

        # Detect print start
        if gcode_state == "RUNNING" and prev_gcode_state != "RUNNING":
            self._on_print_start(serial, state)

        # Detect print completion (FINISH) or failure (FAILED)
        elif gcode_state in ("FINISH", "IDLE") and prev_gcode_state == "RUNNING":
            self._on_print_end(serial, state, success=(gcode_state == "FINISH"))

        # Also detect PAUSE -> FINISH transition (print completed after pause)
        elif gcode_state == "FINISH" and prev_gcode_state == "PAUSE":
            self._on_print_end(serial, state, success=True)

    def _on_print_start(self, serial: str, state: PrinterState):
        """Handle print start."""
        print_name = state.subtask_name or "Unknown"

        # Capture initial tray remain percentages
        tray_remain = {}
        for ams_unit in state.ams_units:
            for tray in ams_unit.trays:
                if tray.remain is not None:
                    tray_remain[(ams_unit.id, tray.tray_id)] = tray.remain
                    logger.debug(f"[{serial}] Captured tray start: AMS {ams_unit.id}, tray {tray.tray_id}, remain={tray.remain}%")

        # Also capture virtual tray if present
        if state.vt_tray and state.vt_tray.remain is not None:
            tray_remain[(255, 0)] = state.vt_tray.remain
            logger.debug(f"[{serial}] Captured virtual tray start: remain={state.vt_tray.remain}%")

        session = PrintSession(
            printer_serial=serial,
            print_name=print_name,
            start_progress=state.print_progress or 0,
            tray_remain_start=tray_remain,
            active_tray=state.tray_now,
        )
        self._sessions[serial] = session

        logger.info(f"Print started on {serial}: '{print_name}', tracking {len(tray_remain)} tray(s) with remain values")
        if not tray_remain:
            logger.warning(f"[{serial}] Print started but no tray remain data captured! ams_units={len(state.ams_units)}, vt_tray={state.vt_tray is not None}")

    def _on_print_end(self, serial: str, state: PrinterState, success: bool):
        """Handle print end."""
        session = self._sessions.pop(serial, None)
        if not session:
            logger.debug(f"No active session for {serial}, ignoring print end")
            return

        # Calculate usage by comparing remain percentages
        tray_usage = {}

        # Current tray remains
        current_remain = {}
        for ams_unit in state.ams_units:
            for tray in ams_unit.trays:
                if tray.remain is not None:
                    current_remain[(ams_unit.id, tray.tray_id)] = tray.remain
                    logger.debug(f"[{serial}] Captured tray end: AMS {ams_unit.id}, tray {tray.tray_id}, remain={tray.remain}%")

        if state.vt_tray and state.vt_tray.remain is not None:
            current_remain[(255, 0)] = state.vt_tray.remain
            logger.debug(f"[{serial}] Captured virtual tray end: remain={state.vt_tray.remain}%")

        # Calculate delta for each tray
        for key, start_remain in session.tray_remain_start.items():
            end_remain = current_remain.get(key)
            if end_remain is not None and start_remain > end_remain:
                used_percent = start_remain - end_remain
                if used_percent > 0:
                    tray_usage[key] = used_percent
                    logger.debug(f"[{serial}] Tray {key}: {start_remain}% -> {end_remain}% (used {used_percent}%)")
            else:
                if key not in current_remain:
                    logger.warning(f"[{serial}] Tray {key} was tracked at start ({start_remain}%) but not found at end (ams_units={len(state.ams_units)})")

        status = "completed" if success else "failed"
        logger.info(f"Print {status} on {serial}: '{session.print_name}', usage: {tray_usage}")
        if not tray_usage and session.tray_remain_start:
            logger.warning(f"[{serial}] Print ended but usage is empty! Started with {len(session.tray_remain_start)} tray(s), ended with {len(current_remain)} tray(s)")

        # Notify callback if usage detected
        if tray_usage and self._on_usage_logged:
            if self._loop:
                self._loop.call_soon_threadsafe(
                    lambda: asyncio.create_task(self._on_usage_logged(serial, session.print_name, tray_usage))
                )

    def get_active_sessions(self) -> dict[str, dict]:
        """Get info about active print sessions."""
        return {
            serial: {
                "print_name": session.print_name,
                "active_tray": session.active_tray,
                "trays_tracked": len(session.tray_remain_start),
            }
            for serial, session in self._sessions.items()
        }


def estimate_weight_from_percent(
    remain_percent_used: int,
    label_weight: int = 1000,
    core_weight: int = 250,
) -> float:
    """Estimate grams used from remain percentage change.

    The AMS "remain" percentage is an estimate based on the filament preset's
    expected spool weight. This function converts that back to grams.

    Args:
        remain_percent_used: Percentage points consumed (e.g., 5 means 5% used)
        label_weight: Spool's labeled filament weight in grams (default 1000g)
        core_weight: Empty spool weight in grams (default 250g)

    Returns:
        Estimated grams of filament used
    """
    # remain% is based on filament weight only, not including core
    return (remain_percent_used / 100.0) * label_weight
