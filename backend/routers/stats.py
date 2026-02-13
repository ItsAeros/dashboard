from fastapi import APIRouter
from backend.services.stats_collector import collect_stats

router = APIRouter(tags=["stats"])


@router.get("/stats")
def get_stats():
    """Return current system stats (CPU, RAM, disk, uptime)."""
    return collect_stats()
