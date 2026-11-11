import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agent.agent import build_agent
from app.api import chat, documents
from app.config import settings
from app.db import models  # noqa: F401  (import registers the Document table on Base)
from app.db.database import init_db
from app.logging_config import setup_logging

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Configure logging first so every module that runs during startup emits output.
    setup_logging()
    logger.info("Starting AI Document Assistant backend")

    # Startup: create the data folders if they don't exist yet
    data_dir = Path(settings.data_dir)
    (data_dir / "chroma").mkdir(parents=True, exist_ok=True)
    (data_dir / "uploads").mkdir(parents=True, exist_ok=True)

    # Create the documents table. Must run after the folders exist
    # (SQLite needs data/ to create app.db) and after models are imported.
    init_db()

    # Build the agent once; every request reuses it via request.app.state.agent
    app.state.agent = build_agent()
    logger.info("Agent ready. Application startup complete.")

    yield  # the app runs while we're paused here

    logger.info("Shutting down AI Document Assistant backend")


app = FastAPI(title="AI Document Assistant", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the /documents routes
app.include_router(documents.router)
app.include_router(chat.router)


@app.get("/health")
def health():
    return {"status": "ok"}
