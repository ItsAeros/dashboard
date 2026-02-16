import asyncio

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.auth import require_auth
from backend.database import get_db, DB_PATH

router = APIRouter(tags=["services"])


# --- Request models ---

class ServiceCreate(BaseModel):
    category: str
    name: str
    url: str
    icon: str = ""
    shortcut: int | None = None
    sort_order: int = 0


class ServiceUpdate(BaseModel):
    category: str | None = None
    name: str | None = None
    url: str | None = None
    icon: str | None = None
    shortcut: int | None = None
    sort_order: int | None = None


class CategoryCreate(BaseModel):
    name: str


class CategoryRename(BaseModel):
    new_name: str


# --- Public: list all services grouped by category ---

@router.get("/services")
def list_services(db=Depends(get_db)):
    """Return all services grouped by category, respecting category sort order."""
    rows = db.execute(
        """SELECT s.*, COALESCE(co.sort_order, 999) AS cat_order
           FROM services s
           LEFT JOIN service_category_order co ON co.name = s.category
           ORDER BY cat_order, s.category, s.sort_order, s.id"""
    ).fetchall()

    groups: dict[str, list] = {}
    for row in rows:
        r = dict(row)
        r.pop("cat_order", None)
        cat = r["category"]
        if cat not in groups:
            groups[cat] = []
        groups[cat].append(r)

    return [{"name": name, "services": items} for name, items in groups.items()]


# --- Public: server-side status checks ---

async def _check_one(client: httpx.AsyncClient, service_id: int, url: str):
    """Check if a single service URL is reachable. Returns (id, bool)."""
    try:
        resp = await client.head(url, follow_redirects=True)
        return (service_id, resp.status_code < 500)
    except Exception:
        return (service_id, False)


@router.get("/services/status")
async def service_status():
    """Check reachability of all service URLs server-side."""
    import sqlite3
    # Create a direct connection (async endpoints run on the event loop,
    # so we can't use the sync get_db generator dependency here)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute("SELECT id, url FROM services").fetchall()
        services = [(row["id"], row["url"]) for row in rows]
    finally:
        conn.close()

    async with httpx.AsyncClient(verify=False, timeout=5.0) as client:
        results = await asyncio.gather(
            *[_check_one(client, sid, url) for sid, url in services]
        )
    return {str(sid): up for sid, up in results}


# --- Auth-required: reorder services ---

class ReorderBody(BaseModel):
    ids: list[int]


@router.put("/services/reorder", dependencies=[Depends(require_auth)])
def reorder_services(body: ReorderBody, db=Depends(get_db)):
    """Set sort_order for each service based on position in the ids array."""
    for idx, service_id in enumerate(body.ids):
        db.execute(
            "UPDATE services SET sort_order = ? WHERE id = ?",
            (idx, service_id),
        )
    db.commit()
    return {"status": "ok"}


class CategoryReorderBody(BaseModel):
    names: list[str]


@router.put("/services/categories/reorder", dependencies=[Depends(require_auth)])
def reorder_categories(body: CategoryReorderBody, db=Depends(get_db)):
    """Set sort_order for each service category based on position in the names array."""
    for idx, name in enumerate(body.names):
        db.execute(
            "INSERT OR REPLACE INTO service_category_order (name, sort_order) VALUES (?, ?)",
            (name, idx),
        )
    db.commit()
    return {"status": "ok"}


# --- Auth-required: service CRUD ---

@router.post("/services", dependencies=[Depends(require_auth)])
def create_service(body: ServiceCreate, db=Depends(get_db)):
    """Create a new service card."""
    cursor = db.execute(
        "INSERT INTO services (category, name, url, icon, shortcut, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
        (body.category, body.name, body.url, body.icon, body.shortcut, body.sort_order),
    )
    db.commit()
    row = db.execute("SELECT * FROM services WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return dict(row)


@router.put("/services/{service_id}", dependencies=[Depends(require_auth)])
def update_service(service_id: int, body: ServiceUpdate, db=Depends(get_db)):
    """Update an existing service card."""
    existing = db.execute("SELECT * FROM services WHERE id = ?", (service_id,)).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Service not found")

    # Build update from provided fields only
    updates = {}
    for field in ("category", "name", "url", "icon", "shortcut", "sort_order"):
        val = getattr(body, field)
        if val is not None:
            updates[field] = val

    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [service_id]
        db.execute(f"UPDATE services SET {set_clause} WHERE id = ?", values)
        db.commit()

    row = db.execute("SELECT * FROM services WHERE id = ?", (service_id,)).fetchone()
    return dict(row)


@router.delete("/services/{service_id}", dependencies=[Depends(require_auth)])
def delete_service(service_id: int, db=Depends(get_db)):
    """Delete a service card."""
    existing = db.execute("SELECT * FROM services WHERE id = ?", (service_id,)).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Service not found")

    db.execute("DELETE FROM services WHERE id = ?", (service_id,))
    db.commit()
    return {"status": "ok"}


# --- Auth-required: category management ---

@router.post("/services/categories", dependencies=[Depends(require_auth)])
def create_category(body: CategoryCreate, db=Depends(get_db)):
    """Create a new empty category."""
    existing = db.execute(
        "SELECT COUNT(*) as c FROM services WHERE category = ?", (body.name,)
    ).fetchone()
    if existing["c"] > 0:
        raise HTTPException(status_code=409, detail="Category already exists")

    return {"status": "ok", "name": body.name}


@router.put("/services/categories/{name}", dependencies=[Depends(require_auth)])
def rename_category(name: str, body: CategoryRename, db=Depends(get_db)):
    """Rename a category (updates all services in it)."""
    count = db.execute(
        "SELECT COUNT(*) as c FROM services WHERE category = ?", (name,)
    ).fetchone()["c"]
    if count == 0:
        raise HTTPException(status_code=404, detail="Category not found")

    db.execute(
        "UPDATE services SET category = ? WHERE category = ?",
        (body.new_name, name),
    )
    db.commit()
    return {"status": "ok", "name": body.new_name}


@router.delete("/services/categories/{name}", dependencies=[Depends(require_auth)])
def delete_category(name: str, db=Depends(get_db)):
    """Delete a category and all its services."""
    db.execute("DELETE FROM services WHERE category = ?", (name,))
    db.commit()
    return {"status": "ok"}
