"""Spool catalog API endpoints."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from db.database import get_db

router = APIRouter(prefix="/catalog", tags=["catalog"])


class CatalogEntry(BaseModel):
    """Spool catalog entry."""
    id: int
    name: str
    weight: int
    is_default: bool
    created_at: Optional[int] = None


class CatalogEntryCreate(BaseModel):
    """Create a spool catalog entry."""
    name: str
    weight: int


class CatalogEntryUpdate(BaseModel):
    """Update a spool catalog entry."""
    name: str
    weight: int


@router.get("")
async def get_catalog() -> list[CatalogEntry]:
    """Get all spool catalog entries."""
    db = await get_db()
    entries = await db.get_spool_catalog()
    return [CatalogEntry(**e) for e in entries]


@router.post("")
async def add_catalog_entry(entry: CatalogEntryCreate) -> CatalogEntry:
    """Add a new spool catalog entry."""
    db = await get_db()
    result = await db.add_spool_catalog_entry(entry.name, entry.weight)
    if not result:
        raise HTTPException(status_code=500, detail="Failed to add entry")
    return CatalogEntry(**result)


@router.put("/{entry_id}")
async def update_catalog_entry(entry_id: int, entry: CatalogEntryUpdate) -> CatalogEntry:
    """Update a spool catalog entry."""
    db = await get_db()
    result = await db.update_spool_catalog_entry(entry_id, entry.name, entry.weight)
    if not result:
        raise HTTPException(status_code=404, detail="Entry not found")
    return CatalogEntry(**result)


@router.delete("/{entry_id}")
async def delete_catalog_entry(entry_id: int) -> dict:
    """Delete a spool catalog entry."""
    db = await get_db()
    success = await db.delete_spool_catalog_entry(entry_id)
    if not success:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"status": "deleted"}


@router.post("/reset")
async def reset_catalog() -> dict:
    """Reset spool catalog to defaults."""
    db = await get_db()
    await db.reset_spool_catalog()
    return {"status": "reset"}
