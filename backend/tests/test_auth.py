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

    # Admin (client) lists documents -> sees both
    admin_list = client.get("/documents").json()
    admin_ids = [d["id"] for d in admin_list]
    assert doc1["id"] in admin_ids
    assert doc2["id"] in admin_ids


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


def test_regular_user_cannot_delete_document(user_client, client):
    # User 1 creates a document
    doc = user_client.post(
        "/documents", json={"title": "User Doc", "content": "To be deleted"}
    ).json()

    # Regular user attempts DELETE -> 403 Forbidden
    res = user_client.delete(f"/documents/{doc['id']}")
    assert res.status_code == 403

    # Admin attempts DELETE -> 204 No Content
    res = client.delete(f"/documents/{doc['id']}")
    assert res.status_code == 204


def test_agent_delete_tool_role_check():
    from app.agent.tools import delete_document

    # 1. Non-admin user role in config -> denied immediately
    res_non_admin = delete_document.invoke(
        {"document_id": "any-doc-id"},
        config={"configurable": {"user_id": "u1", "user_role": "user"}},
    )
    assert (
        "Permission denied: only admin users are allowed to delete documents."
        in res_non_admin
    )
