import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import errors
from app.config import get_settings
from app.db import close_pool
from app.models.api import HealthOut
from app.routers import intake, places, trips

VERSION = "0.1.0"

logging.basicConfig(level=logging.INFO, format="%(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    close_pool()


app = FastAPI(title="Limitless API", version=VERSION, lifespan=lifespan)
errors.install(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (intake.router, trips.router, places.router):
    app.include_router(router, prefix="/api")


@app.get("/health", response_model=HealthOut)
def health() -> HealthOut:
    return HealthOut(status="ok", version=VERSION)
