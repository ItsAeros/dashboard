from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from backend.database import create_tables, seed_bookmarks, seed_services
from backend.routers import stats, auth, bookmarks, services


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create database tables, seed default data
    create_tables()
    seed_bookmarks()
    seed_services()
    yield


app = FastAPI(title="pmserver", docs_url="/api/docs", lifespan=lifespan)

# API routes (must be registered before the static file mount)
app.include_router(stats.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(bookmarks.router, prefix="/api")
app.include_router(services.router, prefix="/api")

# Serve the frontend from static/ (html=True enables index.html fallback)
app.mount("/", StaticFiles(directory="static", html=True), name="static")
