# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Self-hosted service dashboard at pmserver.us. Python FastAPI backend with vanilla HTML/CSS/JS frontend. No build step, no framework. Finance app has been separated to its own service at `~/finance/` (finance.pmserver.us).

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

**Frontend** (`static/`): Vanilla JS. Services and bookmarks both stored in SQLite, fetched from `/api/services` and `/api/bookmarks`. Edit mode (requires auth) enables CRUD for both. No transpilation or bundling.

**Auth flow**: Password login → optional TOTP 2FA → Bearer token stored in sessionStorage. Sessions are in-memory (reset on server restart). `require_auth()` FastAPI dependency protects service CRUD and bookmark CRUD endpoints. Uses `secrets.compare_digest` for constant-time password comparison.

## Key Files

- `backend/main.py` — FastAPI entry point, lifespan hooks, static mount
- `backend/auth.py` — Login, TOTP verification, session management (in-memory `_sessions` dict)
- `backend/database.py` — SQLite setup (WAL mode, foreign keys), table creation (bookmarks, services)
- `backend/routers/bookmarks.py` — Bookmark CRUD + group management
- `backend/routers/services.py` — Service card CRUD + category management
- `static/app.js` — Dashboard: service grid from API, bookmark sidebar, edit mode for both, status checks (HEAD every 60s), system stats, keyboard nav (/, 1-9, arrows)
- `nginx.conf` — Mounted into Docker container for static serving. Note: the CSP `connect-src` directive was stripped of internal URLs (subdomains, internal IPs) for the public repo. If fetches to internal services break, add them back locally — the nginx CSP only governs the static container, not the FastAPI backend.

## Conventions

- All secrets in `.env` (gitignored), template in `.env.example`
- Public endpoints: stats, main dashboard, `GET /api/services`, `GET /api/bookmarks`. Auth-required: service/bookmark mutations
- Frontend uses IIFE pattern for namespace isolation
- Database uses `INSERT OR REPLACE`/`INSERT OR IGNORE` for upserts
- CSS: dark theme (#121212), responsive grid with 768px/600px breakpoints
