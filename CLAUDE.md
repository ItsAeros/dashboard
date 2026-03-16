# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Self-hosted service dashboard. Python FastAPI backend with vanilla HTML/CSS/JS frontend. No build step, no framework.

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

Runs as a Docker container via `docker-compose.yml`. The `static/` directory is bind-mounted so frontend changes take effect without rebuilding.

```sh
docker compose up -d --force-recreate
```

Bump `?v=N` query strings in `index.html` when changing `style.css` or `app.js` to bust CDN/browser caches.

## Architecture

**Backend** (`backend/`): FastAPI app. Routes registered before static mount (order matters — prevents static handler from catching `/api/*`). SQLite database created on startup via lifespan hook.

**Frontend** (`static/`): Vanilla JS. Services and bookmarks both stored in SQLite, fetched from `/api/services` and `/api/bookmarks`. Edit mode (requires auth) enables CRUD for both. No transpilation or bundling.

**Auth flow**: Password login → optional TOTP 2FA → Bearer token stored in sessionStorage. Sessions are in-memory (reset on server restart). `require_auth()` FastAPI dependency protects service CRUD and bookmark CRUD endpoints.

**Drag-and-drop**: Service cards use Pointer Events API (not HTML5 DnD). Drag handles appear in edit mode only. Cross-section reordering uses heading-based section detection.

## Key Files

- `backend/main.py` — FastAPI entry point, lifespan hooks, static mount
- `backend/auth.py` — Login, TOTP verification, session management
- `backend/database.py` — SQLite setup (WAL mode, foreign keys), table creation
- `backend/routers/bookmarks.py` — Bookmark CRUD + group management
- `backend/routers/services.py` — Service card CRUD + category management + icon upload
- `static/app.js` — Dashboard: service grid, bookmark sidebar, edit mode, status checks (HEAD every 60s), system stats, keyboard nav (/, 1-9, arrows)
- `static/style.css` — Dark theme, responsive grid
- `docker-compose.yml` — Container config with bind mounts

## Conventions

- All secrets in `.env` (gitignored), template in `.env.example`
- Public endpoints: stats, dashboard, `GET /api/services`, `GET /api/bookmarks`. Auth-required: all mutations
- Frontend uses IIFE pattern for namespace isolation
- Database uses `INSERT OR REPLACE`/`INSERT OR IGNORE` for upserts
- CSS: dark theme (#121212), responsive grid with 768px/600px breakpoints
