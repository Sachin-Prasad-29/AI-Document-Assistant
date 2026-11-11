from sqlalchemy import or_, select
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


def list_documents_by_user(db: Session, user_id: str) -> list[Document]:
    # Newest first for a specific user
    stmt = (
        select(Document)
        .where(Document.uploaded_by == user_id)
        .order_by(Document.created_at.desc())
    )
    return list(db.scalars(stmt).all())


def list_chat_visible_document_ids(db: Session, user_id: str) -> list[str]:
    # Ids the user may read in chat: their own documents plus every
    # admin-uploaded document (company knowledge base).
    stmt = select(Document.id).where(
        or_(
            Document.uploaded_by == user_id,
            Document.uploaded_by_role == "admin",
        )
    )
    return list(db.scalars(stmt).all())


def can_read_in_chat(doc: Document | None, user_id: str | None) -> bool:
    # A document is readable in chat when it belongs to the user or was
    # uploaded by an admin.
    if doc is None:
        return False
    if user_id and doc.uploaded_by == user_id:
        return True
    return doc.uploaded_by_role == "admin"


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
