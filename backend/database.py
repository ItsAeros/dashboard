import os
import sqlite3
from backend.config import settings

DB_PATH = settings.database_path


def get_db():
    """Yield a database connection. Used as a FastAPI dependency."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # rows behave like dicts
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
    finally:
        conn.close()


def create_tables():
    """Create all tables if they don't exist. Called once at startup."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS bookmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_name TEXT NOT NULL,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS services (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            icon TEXT NOT NULL DEFAULT '',
            shortcut INTEGER,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        -- Ordering tables for category/group drag-and-drop reorder
        CREATE TABLE IF NOT EXISTS service_category_order (
            name TEXT PRIMARY KEY,
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS bookmark_group_order (
            name TEXT PRIMARY KEY,
            sort_order INTEGER NOT NULL DEFAULT 0
        );
    """)
    conn.close()


def seed_bookmarks():
    """One-time seed: if the bookmarks table is empty, populate with default links."""
    conn = sqlite3.connect(DB_PATH)
    count = conn.execute("SELECT COUNT(*) FROM bookmarks").fetchone()[0]
    if count > 0:
        conn.close()
        return

    # Default bookmarks (previously stored in services.json "links" array)
    defaults = [
        ("Developer", "GitHub", "https://github.com", 0),
        ("Developer", "Grok", "https://grok.com", 1),
        ("Social", "X", "https://x.com", 0),
        ("Social", "LinkedIn", "https://linkedin.com", 1),
        ("Entertainment", "YouTube", "https://youtube.com", 0),
        ("Entertainment", "Rumble", "https://rumble.com", 1),
        ("Entertainment", "Netflix", "https://netflix.com", 2),
    ]
    for group_name, name, url, sort_order in defaults:
        conn.execute(
            "INSERT INTO bookmarks (group_name, name, url, sort_order) VALUES (?, ?, ?, ?)",
            (group_name, name, url, sort_order),
        )
    conn.commit()
    conn.close()


def seed_services():
    """One-time seed: if the services table is empty, populate with defaults."""
    conn = sqlite3.connect(DB_PATH)
    count = conn.execute("SELECT COUNT(*) FROM services").fetchone()[0]
    if count > 0:
        conn.close()
        return

    # Default services for a fresh install — replace with your own URLs after setup
    defaults = [
        # (category, name, url, icon, shortcut, sort_order)
        ("Services", "Example Service", "https://example.com", "🔐", 1, 0),
        ("Server Management", "Portainer", "https://localhost:9443", "🐳", 2, 0),
        ("API Tools", "Plaid Dashboard", "https://dashboard.plaid.com/overview", "🏦", None, 0),
    ]
    for category, name, url, icon, shortcut, sort_order in defaults:
        conn.execute(
            "INSERT INTO services (category, name, url, icon, shortcut, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
            (category, name, url, icon, shortcut, sort_order),
        )
    conn.commit()
    conn.close()
