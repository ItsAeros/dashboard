import datetime
import psutil


def collect_stats() -> dict:
    """Collect system stats (CPU, RAM, disk, uptime). Replaces stats.sh."""
    boot_time = datetime.datetime.fromtimestamp(psutil.boot_time())
    uptime_delta = datetime.datetime.now() - boot_time
    days = uptime_delta.days
    hours, remainder = divmod(uptime_delta.seconds, 3600)
    minutes, _ = divmod(remainder, 60)

    parts = []
    if days:
        parts.append(f"{days} day{'s' if days != 1 else ''}")
    if hours:
        parts.append(f"{hours} hour{'s' if hours != 1 else ''}")
    parts.append(f"{minutes} minute{'s' if minutes != 1 else ''}")

    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")

    return {
        "uptime": ", ".join(parts),
        "cpu": round(psutil.cpu_percent(interval=0.5), 1),
        "memory": {
            "used": round(mem.used / 1024 / 1024),
            "total": round(mem.total / 1024 / 1024),
            "percent": round(mem.percent, 1),
        },
        "disk": {
            "used": round(disk.used / 1024 / 1024 / 1024),
            "total": round(disk.total / 1024 / 1024 / 1024),
            "percent": round(disk.percent),
        },
        "timestamp": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
