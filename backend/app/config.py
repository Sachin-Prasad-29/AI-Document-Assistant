import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Each field is filled from the .env key with the same name (case-insensitive).
    # A field with no default (openai_api_key) is required; the app won't start without it.
    openai_api_key: str
    google_api_key: str
    groq_api_key: str
    nvidia_api_key: str
    llm_model: str = "gemini-3.5-flash-lite"
    embedding_model: str = "nvidia/nemotron-3-embed-1b"
    data_dir: str = "./data"
    chunk_size: int = 1000
    chunk_overlap: int = 150
    retrieval_k: int = 4
    max_upload_mb: int = 20

    # Supabase – used by app/auth.py to validate JWTs via JWKS
    supabase_url: str

    # Load values from .env and ignore any keys we haven't declared above
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


# Single shared instance: import this everywhere (from app.config import settings)
settings = Settings()
# print("Settings ->",settings)

# pydantic-settings reads .env but does NOT export it to the environment.
# LangChain's OpenAI classes look for OPENAI_API_KEY in os.environ, so set it here.
os.environ.setdefault("OPENAI_API_KEY", settings.openai_api_key)
os.environ.setdefault("GOOGLE_API_KEY", settings.google_api_key)
os.environ.setdefault("NVIDIA_API_KEY", settings.nvidia_api_key)
os.environ.setdefault("GROQ_API_KEY", settings.groq_api_key)
