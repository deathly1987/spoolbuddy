"""SpoolEase V1/V2 tag encoder/decoder.

SpoolEase tags store spool data in NDEF URL records:
- V1: https://info.filament3d.org/V1?ID=...
- V2: https://info.filament3d.org/V2/?TG=...&ID=...&M=...

URL parameters:
- TG: Tag ID (base64-encoded UID)
- ID: Spool ID
- DE: Encode time (Unix timestamp)
- DA: Added time (Unix timestamp)
- M: Material type (e.g., "PLA")
- MS: Material subtype
- CC: Color code (RGBA hex)
- CN: Color name
- B: Brand
- WL: Weight label (advertised weight)
- WE: Weight empty (core weight)
- WF: Weight full (actual weight when new)
- SC: Slicer filament code (e.g., "GFL99")
- SN: Slicer filament name
- N: Note
"""

import base64
import logging
from typing import Optional
from urllib.parse import parse_qs, urlencode, quote, unquote

from .models import SpoolEaseTagData, SpoolFromTag, TagType

logger = logging.getLogger(__name__)

# URL prefixes
TAG_URL_PREFIX_V1 = "https://info.filament3d.org/V1"
TAG_URL_PREFIX_V2 = "https://info.filament3d.org/V2/"

# Alternate URL that may appear
TAG_URL_PREFIX_ALT = "info.filament3d.org"


class SpoolEaseDecoder:
    """Decoder for SpoolEase NDEF URL tags."""

    @staticmethod
    def can_decode(url: str) -> bool:
        """Check if URL is a SpoolEase tag URL."""
        return (
            TAG_URL_PREFIX_V1 in url
            or TAG_URL_PREFIX_V2 in url
            or TAG_URL_PREFIX_ALT in url
        )

    @staticmethod
    def decode(url: str, uid_hex: str) -> Optional[SpoolEaseTagData]:
        """Decode SpoolEase URL to tag data.

        Args:
            url: The NDEF URL from the tag
            uid_hex: Hex-encoded tag UID

        Returns:
            Parsed tag data, or None if not a valid SpoolEase URL
        """
        if not SpoolEaseDecoder.can_decode(url):
            return None

        # Determine version
        version = 2 if "V2" in url else 1

        # Parse query string
        try:
            # Find the query string part
            if "?" in url:
                query_string = url.split("?", 1)[1]
            else:
                return None

            params = parse_qs(query_string, keep_blank_values=True)

            # Helper to get single value from params
            def get_param(key: str) -> Optional[str]:
                values = params.get(key, [])
                if values:
                    return unquote(values[0]) if values[0] else None
                return None

            def get_int_param(key: str) -> Optional[int]:
                val = get_param(key)
                if val:
                    try:
                        return int(val)
                    except ValueError:
                        return None
                return None

            # Convert UID to base64
            uid_bytes = bytes.fromhex(uid_hex)
            uid_base64 = base64.urlsafe_b64encode(uid_bytes).decode("ascii").rstrip("=")

            # Use tag_id from URL if present, otherwise use UID
            tag_id = get_param("TG") or uid_base64

            return SpoolEaseTagData(
                version=version,
                tag_id=tag_id,
                spool_id=get_param("ID"),
                material=get_param("M"),
                material_subtype=get_param("MS"),
                color_code=get_param("CC"),
                color_name=get_param("CN"),
                brand=get_param("B"),
                weight_label=get_int_param("WL"),
                weight_core=get_int_param("WE"),
                weight_new=get_int_param("WF"),
                slicer_filament_code=get_param("SC"),
                slicer_filament_name=get_param("SN"),
                note=get_param("N"),
                encode_time=get_int_param("DE"),
                added_time=get_int_param("DA"),
            )

        except Exception as e:
            logger.error(f"Failed to decode SpoolEase URL: {e}")
            return None

    @staticmethod
    def to_spool(data: SpoolEaseTagData) -> SpoolFromTag:
        """Convert SpoolEase tag data to normalized spool data."""
        return SpoolFromTag(
            tag_id=data.tag_id,
            tag_type=TagType.SPOOLEASE_V2.value if data.version == 2 else TagType.SPOOLEASE_V1.value,
            material=data.material,
            subtype=data.material_subtype,
            color_name=data.color_name,
            rgba=data.color_code,
            brand=data.brand,
            label_weight=data.weight_label,
            core_weight=data.weight_core,
            weight_new=data.weight_new,
            slicer_filament=data.slicer_filament_code,
            note=data.note,
            data_origin=TagType.SPOOLEASE_V2.value if data.version == 2 else TagType.SPOOLEASE_V1.value,
        )


class SpoolEaseEncoder:
    """Encoder for SpoolEase NDEF URL tags."""

    @staticmethod
    def encode(
        tag_id: str,
        spool_id: str,
        material: Optional[str] = None,
        material_subtype: Optional[str] = None,
        color_code: Optional[str] = None,
        color_name: Optional[str] = None,
        brand: Optional[str] = None,
        weight_label: Optional[int] = None,
        weight_core: Optional[int] = None,
        weight_new: Optional[int] = None,
        slicer_filament_code: Optional[str] = None,
        slicer_filament_name: Optional[str] = None,
        note: Optional[str] = None,
        encode_time: Optional[int] = None,
        added_time: Optional[int] = None,
    ) -> str:
        """Encode spool data to SpoolEase V2 URL.

        Args:
            tag_id: Base64-encoded tag UID
            spool_id: Spool ID in database
            ... other spool fields

        Returns:
            SpoolEase V2 URL string
        """
        # Build parameters (only include non-empty values)
        params = []

        def add_param(key: str, value):
            if value is not None and value != "":
                encoded = quote(str(value), safe="")
                params.append(f"{key}={encoded}")

        # Required params first
        add_param("TG", tag_id)
        add_param("ID", spool_id)

        # Optional params
        add_param("DE", encode_time)
        add_param("DA", added_time)
        add_param("M", material)
        add_param("MS", material_subtype)
        add_param("CC", color_code)
        add_param("CN", color_name)
        add_param("B", brand)
        add_param("WL", weight_label)
        add_param("WE", weight_core)
        add_param("WF", weight_new)
        add_param("SC", slicer_filament_code)
        add_param("SN", slicer_filament_name)
        add_param("N", note)

        return f"{TAG_URL_PREFIX_V2}?{'&'.join(params)}"

    @staticmethod
    def from_spool(
        tag_id: str,
        spool_id: str,
        spool_data: dict,
        encode_time: Optional[int] = None,
    ) -> str:
        """Create SpoolEase URL from spool database record.

        Args:
            tag_id: Base64-encoded tag UID
            spool_id: Spool ID
            spool_data: Spool data dict from database
            encode_time: Optional encode timestamp

        Returns:
            SpoolEase V2 URL string
        """
        return SpoolEaseEncoder.encode(
            tag_id=tag_id,
            spool_id=spool_id,
            material=spool_data.get("material"),
            material_subtype=spool_data.get("subtype"),
            color_code=spool_data.get("rgba"),
            color_name=spool_data.get("color_name"),
            brand=spool_data.get("brand"),
            weight_label=spool_data.get("label_weight"),
            weight_core=spool_data.get("core_weight"),
            weight_new=spool_data.get("weight_new"),
            slicer_filament_code=spool_data.get("slicer_filament"),
            note=spool_data.get("note"),
            encode_time=encode_time,
            added_time=spool_data.get("added_time"),
        )
