import sqlite3

from langchain.agents import create_agent
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.checkpoint.sqlite import SqliteSaver

from app.agent.prompts import SYSTEM_PROMPT
from app.agent.tools import (
    delete_document,
    get_document,
    list_documents,
    search_documents,
    summarize_document,
)

from app.config import settings


def build_agent():
    # Checkpointer stores conversation state per thread_id in its own SQLite file.
    # check_same_thread=False because FastAPI serves requests from a thread pool.
    conn = sqlite3.connect(
        f"{settings.data_dir}/checkpoints.sqlite", check_same_thread=False
    )

    return create_agent(
        model=ChatGoogleGenerativeAI(model=settings.llm_model),
        tools=[
            list_documents,
            search_documents,
            get_document,
            summarize_document,
            delete_document,
        ],
        system_prompt=SYSTEM_PROMPT,
        checkpointer=SqliteSaver(conn),
    )
