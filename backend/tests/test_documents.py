from app.config import settings


def create_doc(client, title="Policy", content="Employees get 12 casual leaves."):
    # Helper: create a raw-text document and return the response
    return client.post("/documents", json={"title": title, "content": content})


def upload_txt(client, name="notes.txt", data=b"hello world"):
    # Helper: upload a small text file and return the response
    return client.post("/documents/upload", files={"file": (name, data, "text/plain")})


def upload_docx(client, name="sample.docx", text="Hello docx document"):
    import io
    import zipfile

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        xml = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            f"<w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body></w:document>"
        )
        z.writestr("word/document.xml", xml)

    return client.post(
        "/documents/upload",
        files={
            "file": (
                name,
                buf.getvalue(),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )


def test_create_document(client):
    res = create_doc(client)
    assert res.status_code == 201
    body = res.json()
    assert "id" in body
    # Ingestion is synchronous, so by the time the response arrives the
    # document is already "ready" (or "failed" if something went wrong).
    assert body["status"] in {"ready", "failed"}
    assert "content" not in body  # DocumentOut hides content


def test_upload_txt(client, tmp_path):
    res = upload_txt(client)
    assert res.status_code == 201
    body = res.json()
    assert body["title"] == "notes"
    assert body["filename"] == "notes.txt"
    # File is saved as uploads/{id}.txt
    assert (tmp_path / "uploads" / f"{body['id']}.txt").exists()


def test_upload_docx(client, tmp_path):
    res = upload_docx(client)
    assert res.status_code == 201
    body = res.json()
    assert body["title"] == "sample"
    assert body["filename"] == "sample.docx"
    assert body["status"] == "ready"
    assert (tmp_path / "uploads" / f"{body['id']}.docx").exists()


def test_upload_unsupported_type(client):
    res = client.post(
        "/documents/upload", files={"file": ("pic.png", b"fake", "image/png")}
    )
    assert res.status_code == 415


def test_upload_too_large(client, monkeypatch):
    # Limit of 0 MB means any non-empty file is too large
    monkeypatch.setattr(settings, "max_upload_mb", 0)
    res = upload_txt(client)
    assert res.status_code == 413


def test_list_documents(client):
    id1 = create_doc(client, title="A").json()["id"]
    id2 = create_doc(client, title="B").json()["id"]
    res = client.get("/documents")
    assert res.status_code == 200
    assert {d["id"] for d in res.json()} == {id1, id2}


def test_get_document(client):
    doc_id = create_doc(client).json()["id"]
    res = client.get(f"/documents/{doc_id}")
    assert res.status_code == 200
    assert res.json()["id"] == doc_id


def test_get_unknown_returns_404(client):
    assert client.get("/documents/does-not-exist").status_code == 404


def test_delete_document(client, tmp_path):
    doc_id = upload_txt(client).json()["id"]
    file_path = tmp_path / "uploads" / f"{doc_id}.txt"
    assert file_path.exists()

    assert client.delete(f"/documents/{doc_id}").status_code == 204
    assert client.get(f"/documents/{doc_id}").status_code == 404
    assert not file_path.exists()  # file removed from disk too


def test_delete_unknown_returns_404(client):
    assert client.delete("/documents/does-not-exist").status_code == 404
