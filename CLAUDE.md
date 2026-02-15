# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Self-hosted service dashboard + financial tracker at pmserver.us. Python FastAPI backend with vanilla HTML/CSS/JS frontend. No build step, no framework.

## Running

```sh
# Install dependencies (use venv/ already in repo)
source venv/bin/activate
pip install -r backend/requirements.txt

# Run dev server
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

# Generate TOTP secret (optional 2FA)
python scripts/generate_totp.py
```

API docs at http://localhost:8000/api/docs

## Deployment

- **Static files served via nginx:alpine Docker container** on port 3001, proxied through Cloudflare Tunnel (`home.pmserver.us`)
- nginx.conf in repo root mounts into container at `/etc/nginx/conf.d/default.conf`
- nginx root points to `/usr/share/nginx/html/static` (not repo root)
- Docker stack managed via Portainer
- Cloudflare tunnel config at `~/.cloudflared/config.yml`

## Architecture

**Backend** (`backend/`): FastAPI app. Routes registered before static mount (order matters — prevents static handler from catching `/api/*`). SQLite database created on startup via lifespan hook.

**Frontend** (`static/`): Vanilla JS with config-driven service grid. `services.json` defines all dashboard cards and link groups. No transpilation or bundling.

**Auth flow**: Password login → optional TOTP 2FA → Bearer token stored in sessionStorage. Sessions are in-memory (reset on server restart). `require_auth()` FastAPI dependency protects finance endpoints. Uses `secrets.compare_digest` for constant-time password comparison.

**Finance/Plaid**: Incremental transaction sync via cursor. Link token → public token → access token exchange. Accounts and transactions stored in SQLite with foreign key cascades.

## Key Files

- `backend/main.py` — FastAPI entry point, lifespan hooks, static mount
- `backend/auth.py` — Login, TOTP verification, session management (in-memory `_sessions` dict)
- `backend/routers/finance.py` — Plaid link/exchange, account CRUD, transaction sync+query, financial summary
- `backend/database.py` — SQLite setup (WAL mode, foreign keys), table creation (plaid_items, accounts, transactions)
- `static/app.js` — Dashboard: service grid, status checks (HEAD every 60s), system stats, keyboard nav (/, 1-9, arrows)
- `static/finance/finance.js` — Finance SPA: two-step login, `apiFetch()` wrapper with auto-logout on 401, Plaid Link widget, bar charts
- `static/services.json` — Config for dashboard service cards and link groups
- `nginx.conf` — Mounted into Docker container for static serving

## Conventions

- All secrets in `.env` (gitignored), template in `.env.example`
- Public endpoints: stats, main dashboard. Auth-required: all `/api/finance/*`
- Frontend uses IIFE pattern for namespace isolation
- Database uses `INSERT OR REPLACE`/`INSERT OR IGNORE` for upserts
- CSS: dark theme (#121212), responsive grid with 768px/600px breakpoints
