import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.db import models  # noqa: F401  (registers the Document table on Base)
from app.db.database import Base, get_db
from app.main import app


import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.auth import get_current_user
from app.config import settings
from app.db import models  # noqa: F401  (registers the Document table on Base)
from app.db.database import Base, get_db
from app.main import app


@pytest.fixture
def db_session(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", str(tmp_path))
    (tmp_path / "uploads").mkdir(exist_ok=True)
    (tmp_path / "chroma").mkdir(exist_ok=True)

    engine = create_engine(
        f"sqlite:///{tmp_path}/test.db", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(bind=engine, autoflush=False)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()
    engine.dispose()


import pytest
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.auth import bearer, get_current_user
from app.config import settings
from app.db import models  # noqa: F401  (registers the Document table on Base)
from app.db.database import Base, get_db
from app.main import app


def _mock_get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
) -> dict:
    token = creds.credentials
    if token == "user1":
        return {"id": "user-1", "email": "user1@example.com", "role": "user"}
    elif token == "user2":
        return {"id": "user-2", "email": "user2@example.com", "role": "user"}
    # Default to admin for "admin" token or any other token
    return {"id": "admin-1", "email": "admin@example.com", "role": "admin"}


@pytest.fixture
def db_session(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", str(tmp_path))
    (tmp_path / "uploads").mkdir(exist_ok=True)
    (tmp_path / "chroma").mkdir(exist_ok=True)

    engine = create_engine(
        f"sqlite:///{tmp_path}/test.db", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(bind=engine, autoflush=False)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = _mock_get_current_user

    yield

    app.dependency_overrides.clear()
    engine.dispose()


@pytest.fixture
def client(db_session):
    # Default test client: acts as an admin user
    return TestClient(app, headers={"Authorization": "Bearer admin"})


@pytest.fixture
def user_client(db_session):
    # Regular user client: role="user"
    return TestClient(app, headers={"Authorization": "Bearer user1"})


@pytest.fixture
def other_user_client(db_session):
    # Second regular user client: role="user"
    return TestClient(app, headers={"Authorization": "Bearer user2"})


@pytest.fixture
def unauthed_client(db_session):
    # Unauthenticated client (no Authorization header)
    return TestClient(app)
