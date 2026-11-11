import logging

from langchain.chat_models import init_chat_model
from langchain_core.output_parsers import StrOutputParser
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sqlalchemy.orm import Session

from app.config import settings
from app.db import crud

logger = logging.getLogger(__name__)

out = StrOutputParser()
SHORT_DOC_LIMIT = 10000  # characters


def _summarize(llm, text: str) -> str:
    # One LLM call: concise summary of whatever text is passed in
    prompt = (
        "Write a concise summary of the key points in the following text. "
        "Use only the information given.\n\n"
        f"{text}"
    )
    return out.invoke(llm.invoke(prompt))


def summarize_document(db: Session, document_id: str, force: bool = False) -> str:
    doc = crud.get_document(db, document_id)
    if doc is None:
        raise LookupError(f"Document {document_id} not found")
    if doc.status != "ready":
        raise ValueError(f"Document is not ready (status: {doc.status})")

    # Return the cached summary unless a regeneration was requested
    if doc.summary and not force:
        logger.info("Returning cached summary for document id=%s", document_id)
        return doc.summary

    logger.info(
        "Generating summary for document id=%s force=%s content_len=%d",
        document_id,
        force,
        len(doc.content),
    )
    llm = ChatGoogleGenerativeAI(model=settings.llm_model)

    if len(doc.content) < SHORT_DOC_LIMIT:
        # Short document: a single call is enough
        summary = _summarize(llm, doc.content)

    else:
        # Long document, map-reduce:
        # map = summarize each piece, reduce = summarize the summaries
        splitter = RecursiveCharacterTextSplitter(chunk_size=4000, chunk_overlap=200)
        pieces = splitter.split_text(doc.content)
        logger.debug("Map-reduce summarization: %d pieces", len(pieces))
        partials = [_summarize(llm, piece) for piece in pieces]
        summary = _summarize(llm, "\n\n".join(partials))

    logger.info("Summary generated for document id=%s", document_id)
    crud.update_document(db, doc, summary=summary)
    return summary
