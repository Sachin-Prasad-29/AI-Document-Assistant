def test_me_endpoint(user_client):
    res = user_client.get("/documents/me")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == "user-1"
    assert data["role"] == "user"
    assert data["email"] == "user1@example.com"


def test_unauthenticated_requests_blocked(unauthed_client):
    res = unauthed_client.get("/documents")
    assert res.status_code == 401

    res = unauthed_client.post(
        "/documents", json={"title": "Test", "content": "Content"}
    )
    assert res.status_code == 401


def test_uploaded_by_set_on_creation(user_client):
    res = user_client.post(
        "/documents", json={"title": "User Doc", "content": "Hello user"}
    )
    assert res.status_code == 201
    data = res.json()
    assert data["uploaded_by"] == "user-1"


def test_user_can_only_list_own_documents(user_client, other_user_client, client):
    # User 1 creates Doc 1
    doc1 = user_client.post(
        "/documents", json={"title": "Doc 1", "content": "User 1 content"}
    ).json()

    # User 2 creates Doc 2
    doc2 = other_user_client.post(
        "/documents", json={"title": "Doc 2", "content": "User 2 content"}
    ).json()

    # User 1 lists documents -> only Doc 1
    list1 = user_client.get("/documents").json()
    ids1 = [d["id"] for d in list1]
    assert doc1["id"] in ids1
    assert doc2["id"] not in ids1

    # User 2 lists documents -> only Doc 2
    list2 = other_user_client.get("/documents").json()
    ids2 = [d["id"] for d in list2]
    assert doc2["id"] in ids2
    assert doc1["id"] not in ids2

    # Admin (client) lists documents -> sees only their own (none here)
    admin_list = client.get("/documents").json()
    assert admin_list == []

    # Admin creates a document -> admin list shows only it
    admin_doc = client.post(
        "/documents", json={"title": "Admin Doc", "content": "Admin content"}
    ).json()
    admin_ids = [d["id"] for d in client.get("/documents").json()]
    assert admin_ids == [admin_doc["id"]]


def test_user_cannot_access_other_users_document(user_client, other_user_client):
    doc1 = user_client.post(
        "/documents", json={"title": "Private", "content": "Secret"}
    ).json()

    # Other user attempts to get Doc 1 -> 403 Forbidden
    res = other_user_client.get(f"/documents/{doc1['id']}")
    assert res.status_code == 403

    # Other user attempts to summarize Doc 1 -> 403 Forbidden
    res = other_user_client.post(f"/documents/{doc1['id']}/summarize")
    assert res.status_code == 403


def test_only_uploader_can_delete_document(user_client, other_user_client, client):
    # User 1 creates a document
    doc = user_client.post(
        "/documents", json={"title": "User Doc", "content": "To be deleted"}
    ).json()

    # Another regular user attempts DELETE -> 403 Forbidden
    res = other_user_client.delete(f"/documents/{doc['id']}")
    assert res.status_code == 403

    # Admin (who did not upload it) attempts DELETE -> 403 Forbidden
    res = client.delete(f"/documents/{doc['id']}")
    assert res.status_code == 403

    # The uploader deletes their own document -> 204 No Content
    res = user_client.delete(f"/documents/{doc['id']}")
    assert res.status_code == 204


def test_agent_delete_tool_owner_check(tmp_path, monkeypatch):
    import app.agent.tools as tools
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.db import crud
    from app.db.database import Base

    # Point the agent tools at an isolated database
    engine = create_engine(
        f"sqlite:///{tmp_path}/tools.db", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine, autoflush=False)
    monkeypatch.setattr(tools, "SessionLocal", TestSession)

    with TestSession() as db:
        doc = crud.create_document(
            db,
            title="Admin Doc",
            content="x",
            uploaded_by="admin-1",
            uploaded_by_role="admin",
        )

    # Non-owner (regular user) attempt -> denied before any approval step
    res_user = tools.delete_document.invoke(
        {"document_id": doc.id},
        config={"configurable": {"user_id": "user-1", "user_role": "user"}},
    )
    assert "Permission denied" in res_user

    # Unknown document -> friendly message
    res_missing = tools.delete_document.invoke(
        {"document_id": "does-not-exist"},
        config={"configurable": {"user_id": "admin-1", "user_role": "admin"}},
    )
    assert "No document found" in res_missing
    engine.dispose()
