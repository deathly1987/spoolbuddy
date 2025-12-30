"""
Bambu printer discovery via SSDP.

Bambu Lab printers advertise themselves via SSDP on UDP port 2021.
"""

import asyncio
import socket
import logging
from typing import List, Optional
from dataclasses import dataclass, field
from pydantic import BaseModel

from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/discovery", tags=["discovery"])


class DiscoveredPrinter(BaseModel):
    """Information about a discovered printer."""
    serial: str
    name: Optional[str] = None
    ip_address: str
    model: Optional[str] = None


class DiscoveryStatus(BaseModel):
    """Status of discovery operation."""
    running: bool


# Model code to name mapping
MODEL_MAP = {
    "3DPrinter-X1": "X1",
    "3DPrinter-X1-Carbon": "X1-Carbon",
    "BL-P001": "X1-Carbon",
    "C13": "X1E",
    "C11": "P1P",
    "C12": "P1S",
    "N7": "P2S",
    "N1": "A1-Mini",
    "N2": "A1",
    "O1D": "H2D",
    "H2S": "H2S",
    "H2C": "H2C",
}


# Global state for discovery
@dataclass
class DiscoveryState:
    running: bool = False
    printers: dict = field(default_factory=dict)  # serial -> DiscoveredPrinter
    task: Optional[asyncio.Task] = None


_state = DiscoveryState()


def parse_ssdp_response(data: bytes, addr: tuple) -> Optional[DiscoveredPrinter]:
    """Parse SSDP response from Bambu printer.

    Bambu SSDP format can be either:
    1. NOTIFY broadcast with headers like:
       NT: urn:bambulab-com:device:3dprinter:1
       Location: 192.168.1.100
       USN: 00M09A350100123
       DevName.bambu.com: My Printer
       DevModel.bambu.com: C12

    2. HTTP-style M-SEARCH response with similar headers
    """
    try:
        text = data.decode("utf-8", errors="ignore")
        logger.debug(f"SSDP data from {addr}: {text[:300]}")

        # Parse headers - handle both "Key: Value" and "Key Value" formats
        headers = {}
        for line in text.split("\n"):
            line = line.strip("\r\n ")
            if not line:
                continue

            # Skip HTTP status lines
            if line.startswith("HTTP/") or line.startswith("NOTIFY") or line.startswith("M-SEARCH"):
                continue

            # Try colon separator first (standard HTTP header format)
            if ":" in line:
                idx = line.index(":")
                key = line[:idx].strip()
                value = line[idx + 1:].strip()
                if key and value:
                    headers[key.lower()] = value
            # Also try space separator (some Bambu formats)
            elif " " in line:
                parts = line.split(" ", 1)
                if len(parts) == 2 and parts[0] and parts[1]:
                    key = parts[0].rstrip(":")
                    value = parts[1].strip()
                    headers[key.lower()] = value

        logger.debug(f"Parsed SSDP headers: {headers}")

        # Check for Bambu printer notification type (can be in NT or ST)
        nt = headers.get("nt", "") or headers.get("st", "")
        if "bambulab" not in nt.lower() and "3dprinter" not in nt.lower():
            logger.debug(f"Not a Bambu printer: NT/ST={nt}")
            return None

        # Get serial from USN
        usn = headers.get("usn", "")
        if not usn or len(usn) < 10:
            logger.debug(f"Invalid USN: {usn}")
            return None

        # Get IP from Location header or use sender address
        location = headers.get("location", "")
        ip_address = location if location else addr[0]

        # Get printer name (try multiple header variations)
        dev_name = (
            headers.get("devname.bambu.com", "") or
            headers.get("devname", "") or
            headers.get("dev-name", "") or
            headers.get("friendlyname", "")
        )

        # Get model code and map to name
        model_code = (
            headers.get("devmodel.bambu.com", "") or
            headers.get("devmodel", "") or
            headers.get("dev-model", "")
        )
        model = MODEL_MAP.get(model_code, model_code) if model_code else None

        logger.info(f"Discovered Bambu printer: serial={usn}, name={dev_name}, model={model}, ip={ip_address}")

        return DiscoveredPrinter(
            serial=usn,
            name=dev_name if dev_name else None,
            ip_address=ip_address,
            model=model
        )
    except Exception as e:
        logger.warning(f"Failed to parse SSDP response: {e}")
        return None


def _create_discovery_socket(port: int) -> Optional[socket.socket]:
    """Create a UDP socket that listens for SSDP broadcast/multicast packets."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

        # Try to set SO_REUSEPORT (not available on all platforms)
        try:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
        except (AttributeError, OSError):
            pass

        # Enable broadcast reception
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)

        # Bind to all interfaces on the port
        sock.bind(("", port))

        # Also join the SSDP multicast group (239.255.255.250) for completeness
        try:
            mcast_group = socket.inet_aton("239.255.255.250")
            mreq = mcast_group + socket.inet_aton("0.0.0.0")
            sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
        except Exception as e:
            logger.debug(f"Could not join multicast group: {e}")

        # Set timeout for non-blocking behavior
        sock.settimeout(0.5)

        logger.info(f"SSDP socket listening on port {port}")
        return sock
    except Exception as e:
        logger.warning(f"Failed to create discovery socket on port {port}: {e}")
        return None


def _send_msearch(sock: socket.socket):
    """Send M-SEARCH request to trigger printer responses."""
    # Bambu printers respond to M-SEARCH on port 2021
    msearch = (
        "M-SEARCH * HTTP/1.1\r\n"
        "HOST: 239.255.255.250:1900\r\n"
        "MAN: \"ssdp:discover\"\r\n"
        "MX: 3\r\n"
        "ST: urn:bambulab-com:device:3dprinter:1\r\n"
        "\r\n"
    ).encode("utf-8")

    try:
        # Send to multicast address
        sock.sendto(msearch, ("239.255.255.250", 2021))
        logger.debug("Sent M-SEARCH to multicast 239.255.255.250:2021")
    except Exception as e:
        logger.debug(f"Failed to send M-SEARCH to multicast: {e}")

    try:
        # Also send to broadcast address
        sock.sendto(msearch, ("255.255.255.255", 2021))
        logger.debug("Sent M-SEARCH to broadcast 255.255.255.255:2021")
    except Exception as e:
        logger.debug(f"Failed to send M-SEARCH to broadcast: {e}")


async def _discovery_task(timeout: float = 10.0):
    """Background task to discover Bambu printers via SSDP.

    Bambu printers broadcast NOTIFY packets on ports 1990 and 2021.
    We listen on these ports and also send M-SEARCH to trigger responses.
    """
    global _state

    sockets = []
    try:
        # Create sockets for both Bambu SSDP ports
        for port in [2021, 1990]:
            sock = _create_discovery_socket(port)
            if sock:
                sockets.append((port, sock))

        if not sockets:
            logger.error("Could not bind to any SSDP port")
            return

        # Send M-SEARCH requests to trigger immediate responses
        for port, sock in sockets:
            _send_msearch(sock)

        loop = asyncio.get_event_loop()
        end_time = loop.time() + timeout
        last_msearch = loop.time()

        while _state.running and loop.time() < end_time:
            # Re-send M-SEARCH every 2 seconds
            if loop.time() - last_msearch > 2.0:
                for port, sock in sockets:
                    _send_msearch(sock)
                last_msearch = loop.time()

            for port, sock in sockets:
                try:
                    # Non-blocking receive
                    data, addr = sock.recvfrom(2048)
                    if data:
                        printer = parse_ssdp_response(data, addr)
                        if printer and printer.serial not in _state.printers:
                            _state.printers[printer.serial] = printer
                            logger.info(f"Discovered printer: {printer.name or printer.serial} at {printer.ip_address}")
                except socket.timeout:
                    # No data available, continue
                    pass
                except Exception as e:
                    logger.debug(f"Discovery recv error: {e}")

            # Small delay between socket checks
            await asyncio.sleep(0.1)

    except Exception as e:
        logger.error(f"Discovery task error: {e}")
    finally:
        for port, sock in sockets:
            try:
                sock.close()
            except Exception:
                pass
        _state.running = False
        _state.task = None


@router.get("/status", response_model=DiscoveryStatus)
async def get_discovery_status():
    """Get current discovery status."""
    return DiscoveryStatus(running=_state.running)


@router.post("/start", response_model=DiscoveryStatus)
async def start_discovery():
    """Start printer discovery."""
    global _state

    if _state.running:
        return DiscoveryStatus(running=True)

    _state.running = True
    _state.printers = {}
    _state.task = asyncio.create_task(_discovery_task())
    logger.info("Started printer discovery")

    return DiscoveryStatus(running=True)


@router.post("/stop", response_model=DiscoveryStatus)
async def stop_discovery():
    """Stop printer discovery."""
    global _state

    _state.running = False
    if _state.task:
        _state.task.cancel()
        try:
            await _state.task
        except asyncio.CancelledError:
            pass
        _state.task = None

    logger.info("Stopped printer discovery")
    return DiscoveryStatus(running=False)


@router.get("/printers", response_model=List[DiscoveredPrinter])
async def get_discovered_printers():
    """Get list of discovered printers."""
    return list(_state.printers.values())
