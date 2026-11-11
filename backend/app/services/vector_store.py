import logging
from functools import lru_cache

from langchain_chroma import Chroma
from langchain_core.documents import Document as LCDocument
from langchain_nvidia_ai_endpoints import NVIDIAEmbeddings
from langchain_openai import OpenAIEmbeddings

from app.config import settings

logger = logging.getLogger(__name__)


@lru_cache
def get_embeddings() -> NVIDIAEmbeddings:
    # Single factory for embeddings, so swapping providers later is a one-line change.
    # lru_cache means it's created once and reused.
    return NVIDIAEmbeddings(model=settings.embedding_model)


@lru_cache
def get_vector_store() -> Chroma:
    # Persistent local Chroma collection stored in data/chroma/
    return Chroma(
        collection_name="documents",
        embedding_function=get_embeddings(),
        persist_directory=f"{settings.data_dir}/chroma",
    )


def add_chunks(chunks: list[LCDocument], ids: list[str]) -> None:
    # Embeds each chunk and stores it under a deterministic id ("{document_id}:{index}")
    logger.info("Adding %d chunks to vector store", len(chunks))
    get_vector_store().add_documents(chunks, ids=ids)


def delete_document_chunks(document_id: str) -> None:
    # Removes every chunk whose metadata document_id matches
    logger.info("Deleting vector store chunks for document_id=%s", document_id)
    get_vector_store().delete(where={"document_id": document_id})


def count() -> int:
    # Total chunks in the collection (handy for checking "Done when" items)
    return get_vector_store()._collection.count()


def search(
    query: str, k: int | None = None, document_id: str | None = None
) -> list[dict]:
    # Embeds the query and returns the k closest chunks.
    # If document_id is given, only chunks from that document are considered.
    k = k or settings.retrieval_k
    metadata_filter = {"document_id": document_id} if document_id else None
    logger.debug("Vector search query=%r k=%d document_id=%s", query, k, document_id)
    logger.debug("Vector search query=%r k=%d document_id=%s", query, k, document_id)

    results = get_vector_store().similarity_search_with_score(
        query, k=k, filter=metadata_filter
    )

    return [
        {
            "text": doc.page_content,
            "document_id": doc.metadata.get("document_id"),
            "title": doc.metadata.get("title"),
            "page": doc.metadata.get("page"),  # None for non-PDFs
            "score": score,  # distance: lower = more similar
        }
        for doc, score in results
    ]
