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
  main.py              — FastAPI entry point, mounts static files
  config.py            — Settings from .env
  routers/stats.py     — GET /api/stats
  services/stats_collector.py — System stats via psutil
static/
  index.html, style.css, app.js, services.json
```

## Running

```sh
pip install -r backend/requirements.txt
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

API docs at http://localhost:8000/api/docs

## Key patterns

- Services and links are config-driven via `static/services.json`
- `app.js` fetches `/api/stats` for system stats (replaced old `stats.json` file)
- Status checks use `fetch()` with `mode: 'no-cors'` HEAD requests
- Keyboard shortcuts: `/` = filter, `Escape` = clear, `1-9` = open services, arrows = navigate
- All secrets in `.env` (gitignored), template in `.env.example`
