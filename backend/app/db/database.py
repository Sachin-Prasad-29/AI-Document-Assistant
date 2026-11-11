from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

# Points at data/app.db (the file is created on first connection)
DATABASE_URL = f"sqlite:///{settings.data_dir}/app.db"

# check_same_thread=False: FastAPI runs sync endpoints in a thread pool,
# and SQLite blocks cross-thread use by default
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

# Factory for DB sessions. Routes get one via get_db, agent tools use it directly.
SessionLocal = sessionmaker(bind=engine, autoflush=False)


class Base(DeclarativeBase):
    # All ORM models inherit from this so SQLAlchemy can track their tables
    pass


def get_db():
    # FastAPI dependency: one session per request, always closed afterwards
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    # Creates any missing tables. Call after models are imported so they're registered on Base.
    Base.metadata.create_all(bind=engine)
    _migrate_documents_uploaded_by_role()


def _migrate_documents_uploaded_by_role():
    # create_all never alters existing tables, so add the column by hand on old databases.
    columns = {col["name"] for col in inspect(engine).get_columns("documents")}
    if "uploaded_by_role" in columns:
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE documents "
                "ADD COLUMN uploaded_by_role TEXT NOT NULL DEFAULT 'user'"
            )
        )
