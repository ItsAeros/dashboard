from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from backend.routers import stats

app = FastAPI(title="pmserver", docs_url="/api/docs")

# API routes (must be registered before the static file mount)
app.include_router(stats.router, prefix="/api")

# Serve the frontend from static/ (html=True enables index.html fallback)
app.mount("/", StaticFiles(directory="static", html=True), name="static")
