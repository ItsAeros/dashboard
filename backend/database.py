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
    """)
    conn.close()
