"""Serial port proxy API for USB recovery.

Provides server-side serial port access that works in any browser.
"""

import asyncio
import logging
from typing import Optional, List
from contextlib import asynccontextmanager

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/serial", tags=["serial"])

# Try to import serial library
try:
    import serial
    import serial.tools.list_ports
    SERIAL_AVAILABLE = True
except ImportError:
    SERIAL_AVAILABLE = False
    logger.warning("pyserial not installed - serial features disabled")


class SerialPortInfo(BaseModel):
    """Information about a serial port."""
    device: str
    description: str
    hwid: str
    manufacturer: Optional[str] = None
    product: Optional[str] = None
    serial_number: Optional[str] = None
    vid: Optional[int] = None
    pid: Optional[int] = None


class SerialConfig(BaseModel):
    """Serial port configuration."""
    port: str
    baudrate: int = 115200
    bytesize: int = 8
    parity: str = "N"
    stopbits: float = 1
    timeout: float = 0.1


# Global state
_active_port: Optional["serial.Serial"] = None
_active_config: Optional[SerialConfig] = None


@router.get("/ports", response_model=List[SerialPortInfo])
async def list_serial_ports():
    """List available serial ports."""
    if not SERIAL_AVAILABLE:
        raise HTTPException(status_code=501, detail="pyserial not installed on server")

    ports = []
    for port in serial.tools.list_ports.comports():
        # Filter for likely ESP32 devices
        ports.append(SerialPortInfo(
            device=port.device,
            description=port.description,
            hwid=port.hwid,
            manufacturer=port.manufacturer,
            product=port.product,
            serial_number=port.serial_number,
            vid=port.vid,
            pid=port.pid,
        ))

    # Sort by device name, prioritizing USB ports
    ports.sort(key=lambda p: (
        0 if "USB" in p.device or "ACM" in p.device else 1,
        p.device
    ))

    return ports


@router.get("/status")
async def get_serial_status():
    """Get current serial connection status."""
    if not SERIAL_AVAILABLE:
        return {"available": False, "connected": False, "reason": "pyserial not installed"}

    return {
        "available": True,
        "connected": _active_port is not None and _active_port.is_open,
        "port": _active_config.port if _active_config else None,
        "baudrate": _active_config.baudrate if _active_config else None,
    }


@router.post("/connect")
async def connect_serial(config: SerialConfig):
    """Connect to a serial port."""
    global _active_port, _active_config

    if not SERIAL_AVAILABLE:
        raise HTTPException(status_code=501, detail="pyserial not installed on server")

    # Close existing connection
    if _active_port and _active_port.is_open:
        _active_port.close()

    try:
        _active_port = serial.Serial(
            port=config.port,
            baudrate=config.baudrate,
            bytesize=config.bytesize,
            parity=config.parity,
            stopbits=config.stopbits,
            timeout=config.timeout,
        )
        _active_config = config
        logger.info(f"Connected to serial port: {config.port}")
        return {"success": True, "message": f"Connected to {config.port}"}
    except PermissionError as e:
        logger.error(f"Permission denied for {config.port}: {e}")
        raise HTTPException(
            status_code=403,
            detail=f"Permission denied: {config.port}. Run: sudo usermod -aG dialout $USER (then logout/login)"
        )
    except Exception as e:
        logger.error(f"Failed to connect to {config.port}: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/disconnect")
async def disconnect_serial():
    """Disconnect from serial port."""
    global _active_port, _active_config

    if _active_port and _active_port.is_open:
        _active_port.close()
        logger.info("Disconnected from serial port")

    _active_port = None
    _active_config = None
    return {"success": True, "message": "Disconnected"}


@router.post("/send")
async def send_serial(data: str):
    """Send data to serial port."""
    if not _active_port or not _active_port.is_open:
        raise HTTPException(status_code=400, detail="Not connected to serial port")

    try:
        _active_port.write((data + "\r\n").encode())
        return {"success": True, "bytes_sent": len(data) + 2}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.websocket("/ws")
async def serial_websocket(websocket: WebSocket):
    """WebSocket endpoint for real-time serial communication.

    Messages from client: {"type": "send", "data": "command"}
    Messages to client: {"type": "data", "data": "output"} or {"type": "error", "message": "..."}
    """
    await websocket.accept()

    if not SERIAL_AVAILABLE:
        await websocket.send_json({"type": "error", "message": "pyserial not installed on server"})
        await websocket.close()
        return

    if not _active_port or not _active_port.is_open:
        await websocket.send_json({"type": "error", "message": "Not connected to serial port. Connect first via /api/serial/connect"})
        await websocket.close()
        return

    # Start read task
    read_task = asyncio.create_task(read_serial_loop(websocket))

    try:
        while True:
            message = await websocket.receive_json()

            if message.get("type") == "send":
                data = message.get("data", "")
                try:
                    _active_port.write((data + "\r\n").encode())
                except Exception as e:
                    await websocket.send_json({"type": "error", "message": str(e)})

    except WebSocketDisconnect:
        logger.info("Serial WebSocket disconnected")
    except Exception as e:
        logger.error(f"Serial WebSocket error: {e}")
    finally:
        read_task.cancel()
        try:
            await read_task
        except asyncio.CancelledError:
            pass


async def read_serial_loop(websocket: WebSocket):
    """Background task to read from serial and send to WebSocket."""
    while True:
        try:
            if _active_port and _active_port.is_open and _active_port.in_waiting:
                data = _active_port.read(_active_port.in_waiting)
                if data:
                    try:
                        text = data.decode("utf-8", errors="replace")
                        await websocket.send_json({"type": "data", "data": text})
                    except Exception:
                        pass
            await asyncio.sleep(0.05)  # 50ms polling
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Serial read error: {e}")
            await asyncio.sleep(0.5)
