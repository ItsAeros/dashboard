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
        CREATE TABLE IF NOT EXISTS plaid_items (
            id TEXT PRIMARY KEY,
            institution_name TEXT,
            access_token TEXT NOT NULL,
            cursor TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            plaid_item_id TEXT NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            subtype TEXT,
            institution_name TEXT,
            mask TEXT,
            current_balance REAL,
            available_balance REAL,
            currency TEXT DEFAULT 'USD',
            last_synced_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (plaid_item_id) REFERENCES plaid_items(id)
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            name TEXT NOT NULL,
            merchant_name TEXT,
            category TEXT,
            pending INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        );

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

    # Default services (previously stored in services.json)
    defaults = [
        # (category, name, url, icon, shortcut, sort_order)
        ("Services", "Vaultwarden", "https://vault.pmserver.us/#/vault", "🔐", 1, 0),
        ("Services", "Nextcloud", "https://files.pmserver.us/", "📁", 2, 1),
        ("Services", "n8n", "https://n8n.pmserver.us/", "🤖", 3, 2),
        ("Server Management", "Portainer", "https://100.116.108.52:9443/#!/home", "🐳", 4, 0),
        ("Server Management", "Cockpit", "https://pmserver.taildd03d9.ts.net:9090/system", "🖥️", 5, 1),
        ("Server Management", "Tailscale", "https://login.tailscale.com/admin/machines?refreshed=true", "🔗", 6, 2),
        ("Domain/DNS", "Namecheap", "https://www.namecheap.com/myaccount", "🌐", 7, 0),
        ("Domain/DNS", "Cloudflare Tunnels", "https://one.dash.cloudflare.com/8f3faff408b5f54974352e52a4af978f/networks/connectors/cloudflare-tunnels/cfd_tunnel/475355a4-afce-4fc4-8b90-cd1e5da2fb60/edit?tab=publicHostname", "🚇", 8, 1),
        ("Domain/DNS", "Cloudflare DNS", "https://dash.cloudflare.com/8f3faff408b5f54974352e52a4af978f/pmserver.us/dns/records", "📋", 9, 2),
        ("API Tools", "Plaid Dashboard", "https://dashboard.plaid.com/overview", "🏦", None, 0),
    ]
    for category, name, url, icon, shortcut, sort_order in defaults:
        conn.execute(
            "INSERT INTO services (category, name, url, icon, shortcut, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
            (category, name, url, icon, shortcut, sort_order),
        )
    conn.commit()
    conn.close()
