from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Document


def create_document(db: Session, **fields) -> Document:
    # Build a row from keyword args (id, title, content, ...), save it, and reload it
    doc = Document(**fields)
    db.add(doc)
    db.commit()
    db.refresh(doc)  # pulls DB-generated/default values back onto the object
    return doc


def get_document(db: Session, id: str) -> Document | None:
    # Lookup by primary key; returns None if not found
    return db.get(Document, id)


def list_documents(db: Session) -> list[Document]:
    # Newest first
    stmt = select(Document).order_by(Document.created_at.desc())
    return list(db.scalars(stmt).all())


def list_documents_by_user(db: Session, user_id: str) -> list[Document]:
    # Newest first for a specific user
    stmt = (
        select(Document)
        .where(Document.uploaded_by == user_id)
        .order_by(Document.created_at.desc())
    )
    return list(db.scalars(stmt).all())


def update_document(db: Session, doc: Document, **fields) -> Document:
    # Set only the fields passed in, e.g. update_document(db, doc, status="ready", num_chunks=5)
    for key, value in fields.items():
        setattr(doc, key, value)
    db.commit()
    db.refresh(doc)
    return doc


def delete_document(db: Session, doc: Document) -> None:
    db.delete(doc)
    db.commit()
