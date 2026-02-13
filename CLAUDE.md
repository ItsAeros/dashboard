# pmserver.us

Self-hosted service dashboard with Python backend, served at pmserver.us.

## Architecture

- **Backend:** Python FastAPI (`backend/`) — serves API + static files
- **Frontend:** Vanilla HTML/CSS/JS (`static/`) — no build step, no framework
- **Database:** SQLite (`data/pmserver.db`) — created at startup
- **Config:** `.env` file loaded via pydantic-settings (`backend/config.py`)

## Project structure

```
backend/
  main.py                  — FastAPI entry point, mounts static files
  config.py                — Settings from .env
  auth.py                  — Password login + bearer token auth
  database.py              — SQLite setup + table creation
  routers/
    stats.py               — GET /api/stats
    auth.py                — POST /api/auth/login
    finance.py             — /api/finance/* (accounts, transactions, Plaid)
  services/
    stats_collector.py     — System stats via psutil
    plaid_client.py        — Plaid API wrapper
static/
  index.html, style.css, app.js, services.json
  finance/
    index.html, finance.css, finance.js
```

## Running

```sh
pip install -r backend/requirements.txt
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

API docs at http://localhost:8000/api/docs

## Setup

1. Copy `.env.example` to `.env` and fill in values
2. Set `DASHBOARD_PASSWORD` for finance page auth
3. Set Plaid credentials when ready to connect bank accounts

## Key patterns

- Services and links are config-driven via `static/services.json`
- `app.js` fetches `/api/stats` for system stats
- Finance page at `/finance/` — requires password auth, uses Plaid for bank connections
- Public endpoints (stats, dashboard): no auth. Finance endpoints: bearer token auth.
- All secrets in `.env` (gitignored), template in `.env.example`
