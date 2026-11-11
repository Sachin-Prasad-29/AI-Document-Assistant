import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import crud
from app.db import models  # noqa: F401  (registers the Document table on Base)
from app.db.database import Base


@pytest.fixture
def session(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path}/visibility.db", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine, autoflush=False)
    db = TestSession()
    yield db
    db.close()
    engine.dispose()


def _make(session, title, uploaded_by, role):
    return crud.create_document(
        session,
        title=title,
        content=f"{title} content",
        uploaded_by=uploaded_by,
        uploaded_by_role=role,
    )


def test_chat_visible_ids_are_own_plus_admin_docs(session):
    own = _make(session, "own", "user-1", "user")
    admin_doc = _make(session, "handbook", "admin-1", "admin")
    other_user_doc = _make(session, "other", "user-2", "user")

    visible = set(crud.list_chat_visible_document_ids(session, "user-1"))
    assert visible == {own.id, admin_doc.id}

    # Admin's own list: their own admin docs (all admin docs are visible to them too)
    admin_visible = set(crud.list_chat_visible_document_ids(session, "admin-1"))
    assert admin_visible == {admin_doc.id}


def test_can_read_in_chat(session):
    own = _make(session, "own", "user-1", "user")
    admin_doc = _make(session, "handbook", "admin-1", "admin")
    other_user_doc = _make(session, "other", "user-2", "user")

    assert crud.can_read_in_chat(own, "user-1") is True
    assert crud.can_read_in_chat(admin_doc, "user-1") is True
    assert crud.can_read_in_chat(other_user_doc, "user-1") is False
    assert crud.can_read_in_chat(admin_doc, None) is True  # admin docs are public in chat
    assert crud.can_read_in_chat(None, "user-1") is False


def test_list_documents_by_user_excludes_admin_docs(session):
    # The list endpoint/tool stays strictly owner-only, even for admin docs
    own = _make(session, "own", "user-1", "user")
    _make(session, "handbook", "admin-1", "admin")

    ids = [d.id for d in crud.list_documents_by_user(session, "user-1")]
    assert ids == [own.id]
