from pathlib import Path

from sqlalchemy.orm import Session

from app.db import crud
from app.db.models import Document
from app.services.vector_store import delete_document_chunks


def delete_document(db: Session, doc: Document) -> None:
    # Order matters: Chroma chunks, then the file, then the SQLite row
    delete_document_chunks(doc.id)
    if doc.file_path:
        Path(doc.file_path).unlink(missing_ok=True)
    crud.delete_document(db, doc)
