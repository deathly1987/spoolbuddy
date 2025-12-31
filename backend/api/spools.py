from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from db import get_db
from models import Spool, SpoolCreate, SpoolUpdate


class SetWeightRequest(BaseModel):
    """Request to set spool weight from scale."""
    weight: int  # Current weight in grams (including core)


class LogUsageRequest(BaseModel):
    """Request to manually log filament usage."""
    weight_used: float  # Grams consumed
    print_name: Optional[str] = None
    printer_serial: Optional[str] = None


class KProfileInput(BaseModel):
    """K-profile to associate with a spool."""
    printer_serial: str
    extruder: Optional[int] = None
    nozzle_diameter: Optional[str] = None
    nozzle_type: Optional[str] = None
    k_value: str
    name: Optional[str] = None
    cali_idx: Optional[int] = None
    setting_id: Optional[str] = None


class SaveKProfilesRequest(BaseModel):
    """Request to save K-profiles for a spool."""
    profiles: list[KProfileInput]


router = APIRouter(prefix="/spools", tags=["spools"])


@router.get("", response_model=list[Spool])
async def list_spools():
    """Get all spools."""
    db = await get_db()
    return await db.get_spools()


@router.get("/{spool_id}", response_model=Spool)
async def get_spool(spool_id: str):
    """Get a single spool."""
    db = await get_db()
    spool = await db.get_spool(spool_id)
    if not spool:
        raise HTTPException(status_code=404, detail="Spool not found")
    return spool


@router.post("", response_model=Spool, status_code=201)
async def create_spool(spool: SpoolCreate):
    """Create a new spool."""
    db = await get_db()
    return await db.create_spool(spool)


@router.put("/{spool_id}", response_model=Spool)
async def update_spool(spool_id: str, spool: SpoolUpdate):
    """Update an existing spool."""
    db = await get_db()
    updated = await db.update_spool(spool_id, spool)
    if not updated:
        raise HTTPException(status_code=404, detail="Spool not found")
    return updated


@router.delete("/{spool_id}", status_code=204)
async def delete_spool(spool_id: str):
    """Delete a spool."""
    db = await get_db()
    if not await db.delete_spool(spool_id):
        raise HTTPException(status_code=404, detail="Spool not found")


@router.post("/{spool_id}/weight", response_model=Spool)
async def set_spool_weight(spool_id: str, request: SetWeightRequest):
    """Set spool current weight from scale measurement.

    This updates the current weight and resets the consumed_since_weight counter.
    The weight should be the total weight including the spool core.

    Args:
        spool_id: Spool ID
        request: Weight data (total weight in grams)
    """
    db = await get_db()

    # Get spool to calculate net filament weight
    spool = await db.get_spool(spool_id)
    if not spool:
        raise HTTPException(status_code=404, detail="Spool not found")

    # Subtract core weight to get filament weight
    core_weight = spool.core_weight or 250
    filament_weight = max(0, request.weight - core_weight)

    updated = await db.set_spool_weight(spool_id, filament_weight)
    return updated


@router.post("/{spool_id}/usage", response_model=Spool)
async def log_manual_usage(spool_id: str, request: LogUsageRequest):
    """Manually log filament usage for a spool.

    Use this when usage wasn't automatically tracked (e.g., external printer,
    manual filament change, waste from failed print).

    Args:
        spool_id: Spool ID
        request: Usage data (weight consumed in grams)
    """
    db = await get_db()

    spool = await db.get_spool(spool_id)
    if not spool:
        raise HTTPException(status_code=404, detail="Spool not found")

    # Log to usage history
    await db.log_usage(
        spool_id=spool_id,
        printer_serial=request.printer_serial or "manual",
        print_name=request.print_name or "Manual entry",
        weight_used=request.weight_used,
    )

    # Update spool consumption
    updated = await db.update_spool_consumption(spool_id, request.weight_used)
    return updated


@router.get("/{spool_id}/history")
async def get_spool_usage_history(spool_id: str, limit: int = Query(default=50, le=500)):
    """Get usage history for a specific spool.

    Returns recent print jobs that used this spool with weight consumed.
    """
    db = await get_db()

    spool = await db.get_spool(spool_id)
    if not spool:
        raise HTTPException(status_code=404, detail="Spool not found")

    return await db.get_usage_history(spool_id=spool_id, limit=limit)


@router.get("/usage/history")
async def get_all_usage_history(limit: int = Query(default=100, le=500)):
    """Get global usage history across all spools.

    Returns recent print jobs with spool info and weight consumed.
    """
    db = await get_db()
    return await db.get_usage_history(limit=limit)


@router.get("/{spool_id}/k-profiles")
async def get_spool_k_profiles(spool_id: str):
    """Get K-profiles associated with a spool."""
    db = await get_db()

    spool = await db.get_spool(spool_id)
    if not spool:
        raise HTTPException(status_code=404, detail="Spool not found")

    return await db.get_spool_k_profiles(spool_id)


@router.put("/{spool_id}/k-profiles")
async def save_spool_k_profiles(spool_id: str, request: SaveKProfilesRequest):
    """Save K-profiles for a spool (replaces existing)."""
    db = await get_db()

    spool = await db.get_spool(spool_id)
    if not spool:
        raise HTTPException(status_code=404, detail="Spool not found")

    profiles = [p.model_dump() for p in request.profiles]
    await db.save_spool_k_profiles(spool_id, profiles)

    return {"status": "ok", "count": len(profiles)}
