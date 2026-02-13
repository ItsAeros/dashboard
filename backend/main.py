from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from backend.database import create_tables
from backend.routers import stats, auth, finance


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create database tables
    create_tables()
    yield


app = FastAPI(title="pmserver", docs_url="/api/docs", lifespan=lifespan)

# API routes (must be registered before the static file mount)
app.include_router(stats.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(finance.router, prefix="/api/finance")

# Serve the frontend from static/ (html=True enables index.html fallback)
app.mount("/", StaticFiles(directory="static", html=True), name="static")
