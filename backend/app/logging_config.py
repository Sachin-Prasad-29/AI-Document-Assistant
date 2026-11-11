"""
Centralised logging configuration for the AI Document Assistant backend.

Call ``setup_logging()`` once at application startup (in main.py lifespan).
Every other module then just does:

    import logging
    logger = logging.getLogger(__name__)

and it inherits this configuration automatically via the root logger.
"""

import logging
import logging.config


def setup_logging(log_level: str = "INFO") -> None:
    """Configure the root logger and third-party library noise levels."""

    config: dict = {
        "version": 1,
        "disable_existing_loggers": False,  # keep loggers created before this call
        "formatters": {
            "default": {
                # e.g.  2026-11-11 00:30:00,123 | INFO     | app.agent.tools | tool=search_documents args=...
                "format": "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
                "formatter": "default",
            },
        },
        "loggers": {
            # ── our code: everything under "app" at the requested level ──────
            "app": {
                "handlers": ["console"],
                "level": log_level,
                "propagate": False,
            },
            # ── noisy third-party libraries: bump up to WARNING ───────────────
            "httpx": {"level": "WARNING"},
            "httpcore": {"level": "WARNING"},
            "urllib3": {"level": "WARNING"},
            "chromadb": {"level": "WARNING"},
            "langchain": {"level": "WARNING"},
            "langchain_core": {"level": "WARNING"},
            "openai": {"level": "WARNING"},
            "google": {"level": "WARNING"},
        },
        "root": {
            # Catch-all for anything outside "app" (e.g. uvicorn, sqlalchemy)
            "handlers": ["console"],
            "level": "WARNING",
        },
    }

    logging.config.dictConfig(config)
