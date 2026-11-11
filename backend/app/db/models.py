import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class Document(Base):
    __tablename__ = "documents"

    # uuid4 string, generated in Python when the row is created
    id: Mapped[str] = mapped_column(
        Text, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    title: Mapped[str] = mapped_column(Text)

    # Null for raw-text documents (no original file)
    filename: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_path: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Full extracted text, used by get_document and the summarizer
    content: Mapped[str] = mapped_column(Text, default="")

    num_chunks: Mapped[int] = mapped_column(Integer, default=0)

    # processing -> ready | failed
    status: Mapped[str] = mapped_column(Text, default="processing")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Cached summary, filled by the summarizer in Phase 3
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Supabase user UUID of the person who uploaded this document
    uploaded_by: Mapped[str | None] = mapped_column(Text, nullable=True, index=True)

    # Role of the uploader at upload time ("admin" or "user").
    # Admin-uploaded documents are readable by everyone in chat.
    uploaded_by_role: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="user", default="user"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
