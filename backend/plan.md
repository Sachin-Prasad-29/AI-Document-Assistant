Here is a README you can drop into the repo and hand to your coding agent. It is written as a plan: fixed decisions first, then phases with sub-tasks and "Done when" checks.

````markdown
# AI Document Assistant

An agentic RAG API. Upload documents, then chat with an AI agent that **decides for itself which tool to call**: search, read, list, summarize, or delete. Destructive actions pause the agent and wait for **human approval** before continuing.

This is not "upload PDF → ask question → get answer". The LLM is given tools and picks between them.

```
"How many casual leaves can an employee take?"
  Agent → search_documents() → Vector DB → relevant chunks → Agent → answer with source

"Delete the old leave policy document."
  Agent → list_documents() → delete_document() → interrupt() ⏸
  API returns "awaiting_approval" → human approves → resume ▶ → document deleted → answer
```

---

## 0. Instructions for the coding agent

1. Build **phase by phase, in order** (Section 8). Each phase has sub-tasks and a "Done when" checklist.
2. Do not start the next phase until every "Done when" item passes. After each phase, stop and report what was built and how to verify it.
3. Keep API routes and agent tools **thin**. All real logic lives in `app/services/`; routes and tools call the same service functions.
4. Stick to the tech stack in Section 1. Do not build anything listed under "Out of scope".
5. LangChain and LangGraph APIs change often. **Verify imports and signatures against the installed versions** instead of relying on memory.
6. Never commit secrets. All configuration goes through `.env` and `app/config.py`.
7. Tick the checkboxes in this file as tasks are completed.

---

## 1. Tech stack (decided, do not substitute)

| Concern | Choice | Notes |
|---|---|---|
| Language | Python 3.11+ | |
| API | FastAPI + Uvicorn | Use sync (`def`) endpoints for simplicity |
| Agent | `create_agent` from `langchain.agents` (LangChain ≥ 1.0) | Runs on LangGraph under the hood |
| Human-in-the-loop | LangGraph `interrupt()` + `Command(resume=...)` | Called inside the delete tool |
| Agent state / memory | `SqliteSaver` checkpointer (`langgraph-checkpoint-sqlite`) | Required for interrupt/resume; one conversation per `thread_id` |
| Metadata DB | SQLite + SQLAlchemy 2.0 | `data/app.db` |
| Vector DB | Chroma, local persistent (`langchain-chroma`) | `data/chroma/` |
| Loaders | `PyPDFLoader` (.pdf), `TextLoader` (.txt, .md) | |
| Chunking | `RecursiveCharacterTextSplitter` | Size 1000, overlap 150 |
| LLM | `init_chat_model(settings.llm_model)` | Default `openai:gpt-4o-mini`; any tool-calling model works |
| Embeddings | `OpenAIEmbeddings` (`text-embedding-3-small`) | Created in one factory function so it can be swapped |
| Config | `pydantic-settings` + `.env` | |
| Tests | `pytest` + FastAPI `TestClient` | |

---

## 2. Architecture

```
┌────────────────────── FastAPI ──────────────────────┐
│  /documents/*  routes            /chat/*  routes    │
└────────┬───────────────────────────────┬────────────┘
         │                               ▼
         │              Agent (create_agent + checkpointer)
         │                               │ tool calls
         ▼                               ▼
┌─────────────────── Service layer ───────────────────┐
│  documents · ingestion · vector_store · summarizer  │
└────────┬─────────────────┬─────────────────┬────────┘
         ▼                 ▼                 ▼
      SQLite            Chroma         data/uploads
  metadata, text,      chunks +          raw files
     summaries        embeddings
```

---

## 3. Project structure

```
ai-document-assistant/
├── README.md
├── pyproject.toml            # or requirements.txt
├── .env.example
├── .gitignore                # must include .env and data/
├── app/
│   ├── main.py               # FastAPI app, lifespan (init DB, build agent), routers
│   ├── config.py             # Settings (pydantic-settings)
│   ├── schemas.py            # Pydantic request/response models
│   ├── db/
│   │   ├── database.py       # engine, SessionLocal, Base, get_db
│   │   ├── models.py         # Document ORM model
│   │   └── crud.py           # create / get / list / update / delete
│   ├── api/
│   │   ├── documents.py      # /documents routes
│   │   └── chat.py           # /chat routes
│   ├── services/
│   │   ├── documents.py      # create + delete orchestration (SQLite + Chroma + disk)
│   │   ├── ingestion.py      # load → chunk → embed → store
│   │   ├── vector_store.py   # embeddings + Chroma: add / search / delete
│   │   └── summarizer.py     # summarize with caching
│   └── agent/
│       ├── tools.py          # the 5 tools
│       ├── prompts.py        # system prompt
│       └── agent.py          # build_agent(): model + tools + checkpointer
├── samples/                  # small test documents with known facts
├── tests/
└── data/                     # gitignored, created at startup
    ├── app.db
    ├── checkpoints.sqlite
    ├── chroma/
    └── uploads/
```

---

## 4. Configuration (`.env.example`)

```
OPENAI_API_KEY=sk-...
LLM_MODEL=openai:gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small
DATA_DIR=./data
CHUNK_SIZE=1000
CHUNK_OVERLAP=150
RETRIEVAL_K=4
MAX_UPLOAD_MB=20
```

---

## 5. Data model

**SQLite table `documents`**

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT, PK | uuid4 string |
| `title` | TEXT | From the request, or filename without extension |
| `filename` | TEXT, nullable | Original filename (null for raw-text documents) |
| `file_path` | TEXT, nullable | Location in `data/uploads/` |
| `content` | TEXT | Full extracted text (used by `get_document` and the summarizer) |
| `num_chunks` | INTEGER | Default 0 |
| `status` | TEXT | `processing` → `ready` or `failed` |
| `error` | TEXT, nullable | Reason when `failed` |
| `summary` | TEXT, nullable | Cached summary |
| `created_at` | DATETIME | |

**Chroma chunks** (collection `documents`)

- Chunk id: `"{document_id}:{chunk_index}"` (deterministic, so deleting a document's chunks is easy)
- Metadata: `document_id`, `title`, `chunk_index`, `page` (PDF only, 1-indexed)
- Chroma rejects `None` metadata values: omit `page` for non-PDF documents.

---

## 6. API

| Method | Path | Purpose | Request | Response |
|---|---|---|---|---|
| POST | `/documents` | Create a document from raw text | JSON `{title, content}` | 201 Document |
| POST | `/documents/upload` | Upload a file (.pdf, .txt, .md) | multipart `file` | 201 Document |
| GET | `/documents` | List documents | – | 200 `[Document]` |
| GET | `/documents/{id}` | Get one document's metadata | – | 200 Document |
| DELETE | `/documents/{id}` | Delete directly (explicit human call, no approval step) | – | 204 |
| POST | `/documents/{id}/summarize` | Generate or return cached summary | optional `{force}` | 200 `{document_id, summary}` |
| POST | `/chat` | Send a message to the agent | `{message, thread_id?}` | 200 ChatResponse |
| POST | `/chat/resume` | Approve or reject a pending action | `{thread_id, approved}` | 200 ChatResponse |
| GET | `/health` | Liveness check | – | 200 |

Errors: 404 unknown document · 415 unsupported file type · 413 file too large · 409 state conflict (see HITL rules) · 502 LLM/embedding provider failure.

**ChatResponse: completed**

```json
{
  "thread_id": "abc-123",
  "status": "completed",
  "answer": "Employees can take 12 casual leaves per year (leave_policy, page 2).",
  "tools_used": ["search_documents"],
  "approval_request": null
}
```

**ChatResponse: paused for approval**

```json
{
  "thread_id": "abc-123",
  "status": "awaiting_approval",
  "answer": null,
  "tools_used": ["list_documents", "delete_document"],
  "approval_request": {
    "action": "delete_document",
    "document_id": "…",
    "title": "leave_policy_2025",
    "message": "'leave_policy_2025' will be permanently deleted. Approve?"
  }
}
```

**Resume request**

```json
{ "thread_id": "abc-123", "approved": true }
```

---

## 7. Agent

### Tools

| Tool | Arguments | Returns | Backed by |
|---|---|---|---|
| `list_documents` | – | id, title, filename, status, created_at of every document | SQLite |
| `search_documents` | `query`, optional `document_id` | Top-k chunks, each with title, page, text | Chroma |
| `get_document` | `document_id` | Metadata + content (truncated to ~6000 chars) | SQLite |
| `summarize_document` | `document_id` | Summary (cached) | Summarizer service |
| `delete_document` | `document_id` | Result message, **requires human approval** | `interrupt()` + document service |

Tool rules:

- Docstrings are what the LLM reads to choose a tool. Describe clearly *when* to use each one.
- Tools return strings. For expected problems (unknown id, document not ready), return a readable message instead of raising, so the agent can recover.
- Tools open their own DB session via `SessionLocal`. Do not use FastAPI `Depends` inside tools.

### System prompt must cover

- Answer only from the uploaded documents, using tools. Never invent document content.
- Cite the document title (and page when available) for every fact.
- If the answer is not in the documents, say so.
- When the user refers to a document by name or description ("the old leave policy"), call `list_documents` to resolve it to an id. If several could match, ask which one.
- `search_documents` for specific questions, `summarize_document` for overviews, `get_document` for full text or metadata.
- Call `delete_document` only when the user explicitly asks to delete, one document per turn. Do not ask "are you sure?" in chat; calling the tool triggers the approval step.

### Human-in-the-loop flow

```
POST /chat  {"message": "Delete the old leave policy document"}
  → agent calls list_documents()            → finds leave_policy_2025
  → agent calls delete_document(id)
  → tool calls interrupt({...})             → graph pauses, checkpointer saves state
  → API responds status="awaiting_approval" + approval_request

POST /chat/resume  {"thread_id": "...", "approved": true}
  → agent.invoke(Command(resume={"approved": true}), config)
  → tool re-runs from the top; interrupt() now returns {"approved": true}
  → tool deletes the document (Chroma + file + SQLite)
  → agent writes the final answer → API responds status="completed"
```

Tool sketch:

```python
from langchain_core.tools import tool
from langgraph.types import interrupt

@tool
def delete_document(document_id: str) -> str:
    """Permanently delete a document. Requires human approval.
    Call list_documents first to find the correct document_id."""
    doc = document_service.get(document_id)        # read-only, safe to re-run
    if doc is None:
        return f"No document found with id {document_id}."

    decision = interrupt({                          # pauses here on the first run
        "action": "delete_document",
        "document_id": doc.id,
        "title": doc.title,
        "message": f"'{doc.title}' will be permanently deleted. Approve?",
    })

    if decision.get("approved"):                    # only reached after resume
        document_service.delete(doc.id)
        return f"Deleted '{doc.title}'."
    return "Deletion was rejected by the user. Nothing was deleted."
```

API sketch:

```python
from langgraph.types import Command

config = {"configurable": {"thread_id": thread_id}}

# POST /chat
result = agent.invoke({"messages": [{"role": "user", "content": message}]}, config)

# POST /chat/resume
result = agent.invoke(Command(resume={"approved": approved}), config)

# Both: did the agent pause?
if result.get("__interrupt__"):
    request = result["__interrupt__"][0].value      # → status="awaiting_approval"
else:
    answer = result["messages"][-1].content         # → status="completed"
```

HITL rules:

1. A checkpointer is mandatory, and resume must use the same `thread_id`.
2. On resume, the tool function **re-executes from its first line**. Nothing with side effects may run before `interrupt()`; only read-only lookups.
3. Check that the document exists *before* `interrupt()`. Never ask a human to approve deleting something that does not exist.
4. Never wrap `interrupt()` in a broad `try/except`. It works by raising a special exception that LangGraph must receive.
5. `POST /chat` on a thread with a pending approval → 409. `POST /chat/resume` on a thread with no pending approval → 409. Check with `agent.get_state(config)`.
6. Use raw `interrupt()` in the tool. Do not use `HumanInTheLoopMiddleware`; learning the primitive is the point.
7. The MVP assumes one pending approval per thread. If several interrupts are ever pending at once, LangGraph expects `Command(resume={interrupt_id: value})`; handling that is a stretch goal.

---

## 8. Implementation plan

### Phase 0: Project setup
*Practices: FastAPI basics, configuration*

- [ ] **0.1** Create the folder structure, `.gitignore` (`.env`, `data/`, `.venv/`, `__pycache__/`), and `.env.example`.
- [ ] **0.2** Add dependencies: `fastapi`, `uvicorn[standard]`, `python-multipart`, `pydantic-settings`, `sqlalchemy`, `langchain` (≥ 1.0), `langgraph`, `langgraph-checkpoint-sqlite`, `langchain-openai`, `langchain-community`, `langchain-text-splitters`, `langchain-chroma`, `pypdf`. Dev: `pytest`, `httpx`.
- [ ] **0.3** `app/config.py`: `Settings` class reading the variables from Section 4.
- [ ] **0.4** `app/main.py`: FastAPI app with a lifespan that creates the `data/` subfolders, plus `GET /health`.

**Done when**
- [ ] `uvicorn app.main:app --reload` starts without errors
- [ ] `GET /health` returns `{"status": "ok"}` and `/docs` renders

### Phase 1: SQLite + document CRUD (no AI yet)
*Practices: SQLite CRUD, FastAPI routes, file upload*

- [ ] **1.1** `db/database.py`: engine for `data/app.db` (`check_same_thread=False`), `SessionLocal`, `Base`, `get_db` dependency. Create tables at startup.
- [ ] **1.2** `db/models.py`: `Document` model per Section 5.
- [ ] **1.3** `schemas.py`: `DocumentCreate` (title, content) and `DocumentOut` (everything except `content` and `file_path`).
- [ ] **1.4** `db/crud.py`: `create_document`, `get_document`, `list_documents`, `update_document`, `delete_document`.
- [ ] **1.5** Routes in `api/documents.py`:
  - `POST /documents` stores raw text as a document
  - `POST /documents/upload` validates extension and size, saves the file as `data/uploads/{id}{ext}` (never use the user's filename in the path), creates the row
  - `GET /documents`, `GET /documents/{id}`, `DELETE /documents/{id}`
- [ ] **1.6** Tests for every route using `TestClient` and a temporary database.

Ingestion arrives in Phase 2; for now rows are created with `status="processing"`.

**Done when**
- [ ] Upload a file → it appears in the list → fetch by id → delete → row and file are gone
- [ ] Unknown id → 404; unsupported file type → 415
- [ ] Tests pass

### Phase 2: Ingestion pipeline
*Practices: document loaders, chunking, embeddings, vector DB*

- [ ] **2.1** `services/vector_store.py`: `get_embeddings()` and `get_vector_store()` (persistent Chroma collection `documents`), created once and reused.
- [ ] **2.2** Loading in `services/ingestion.py`: pick a loader by extension. `PyPDFLoader` for PDF (one LangChain `Document` per page; convert its 0-indexed page to 1-indexed), `TextLoader` for `.txt`/`.md`. Raw-text documents skip the loader and are wrapped in a single `Document`.
- [ ] **2.3** Chunking: `RecursiveCharacterTextSplitter` with size/overlap from settings. Attach the metadata from Section 5 to every chunk.
- [ ] **2.4** Storing: add chunks to Chroma with deterministic ids.
- [ ] **2.5** `ingest_document(document_id)`: runs 2.2–2.4, saves the full text to `documents.content`, sets `num_chunks` and `status="ready"`. On any exception set `status="failed"` and store the error. If no text was extracted (e.g. a scanned PDF), fail with a clear message.
- [ ] **2.6** Call ingestion from both create endpoints (synchronously; fine for this project).
- [ ] **2.7** `services/documents.py` → `delete_document(id)`: delete Chroma chunks, then the file, then the SQLite row. `DELETE /documents/{id}` now calls this.
- [ ] **2.8** Create `samples/` with three small documents containing known facts: `company_policy`, `employee_handbook`, `leave_policy` (at least one as PDF). Example fact: "Employees get 12 casual leaves per year."

**Done when**
- [ ] Uploading a sample gives `status="ready"` and `num_chunks > 0`
- [ ] Chroma holds the chunks with correct metadata
- [ ] Deleting a document removes all its chunks (collection count drops)
- [ ] An empty or unreadable file gives `status="failed"` with an error, without crashing

### Phase 3: Retrieval + summarization
*Practices: retriever, RAG building blocks*

- [ ] **3.1** `vector_store.search(query, k, document_id=None)` returns a list of `{text, document_id, title, page, score}`, with an optional metadata filter to one document.
- [ ] **3.2** `services/summarizer.py` → `summarize_document(document_id, force=False)`:
  - return the cached `documents.summary` unless `force`
  - short document (under ~12,000 characters): one LLM call
  - long document: map-reduce (summarize groups of chunks, then summarize the summaries)
  - save the result to `documents.summary`
- [ ] **3.3** `POST /documents/{id}/summarize` with optional body `{"force": true}`.
- [ ] **3.4** Retrieval test against the sample documents.

**Done when**
- [ ] Searching "casual leave" returns the leave-policy chunk as the top result
- [ ] The summarize endpoint returns a sensible summary; a second call is instant (cached)
- [ ] Summarizing a document that is not `ready` → 409

### Phase 4: Agent with read-only tools + `/chat`
*Practices: tools, create_agent, RAG, LangGraph state (threads + checkpointer)*

- [ ] **4.1** `agent/tools.py`: implement `list_documents`, `search_documents`, `get_document`, `summarize_document` with `@tool`, type hints, and clear docstrings (see tool rules).
- [ ] **4.2** `agent/prompts.py`: system prompt covering every point in Section 7.
- [ ] **4.3** `agent/agent.py` → `build_agent()`:
  ```python
  conn = sqlite3.connect(checkpoint_path, check_same_thread=False)
  agent = create_agent(
      model=init_chat_model(settings.llm_model),
      tools=[...],
      system_prompt=SYSTEM_PROMPT,
      checkpointer=SqliteSaver(conn),
  )
  ```
  Build it once in the FastAPI lifespan and store it on `app.state.agent`.
- [ ] **4.4** `POST /chat`: generate a `thread_id` if none is given, invoke the agent with it, return a `ChatResponse` including `tools_used` (tool names called during this turn).
- [ ] **4.5** Log every tool call (name + arguments).

**Done when** (with the sample documents loaded)
- [ ] "How many casual leaves can an employee take?" → uses `search_documents` → correct answer with source
- [ ] "What documents do you have?" → uses `list_documents`
- [ ] "Summarize the employee handbook" → `list_documents` then `summarize_document`
- [ ] A follow-up on the same `thread_id` ("And sick leaves?") works
- [ ] A question the documents do not cover → the agent says it could not find it

### Phase 5: Human-in-the-loop delete
*Practices: interrupt(), Command(resume), persisted graph state*

- [ ] **5.1** Add the `delete_document` tool (sketch in Section 7) and register it with the agent.
- [ ] **5.2** `/chat`: detect a pause after invoke and return `status="awaiting_approval"` with the interrupt payload.
- [ ] **5.3** `POST /chat/resume`: resume with `Command(resume={"approved": ...})` and return a `ChatResponse`.
- [ ] **5.4** Add both 409 guards (HITL rule 5).
- [ ] **5.5** Optional: `GET /chat/{thread_id}` returning message history and any pending approval, read from `agent.get_state(config)`. Good for seeing what LangGraph state looks like.
- [ ] **5.6** Tests for the approve and reject paths.

**Done when**
- [ ] "Delete the leave policy document" → `awaiting_approval`, and the document **still exists**
- [ ] Resume with `approved=true` → document gone from SQLite, Chroma, and disk; agent confirms
- [ ] Resume with `approved=false` → document intact; agent says nothing was deleted
- [ ] Restart the server between request and approval → resume still works
- [ ] Both 409 guards work

### Phase 6: Polish

- [ ] **6.1** Consistent JSON error shape; provider failures → 502 with a readable message.
- [ ] **6.2** Use fake embeddings (e.g. `DeterministicFakeEmbedding`) for fast unit tests; mark tests that need a real LLM as `integration`.
- [ ] **6.3** Add user docs to this README: setup, env vars, run command, curl examples.
- [ ] **6.4** Run the final demo below end to end.

---

## 9. Final demo (acceptance test)

```bash
# 1. Upload
curl -F "file=@samples/leave_policy.pdf" localhost:8000/documents/upload

# 2. List
curl localhost:8000/documents

# 3. Ask a question (note the thread_id in the response)
curl -X POST localhost:8000/chat -H "Content-Type: application/json" \
  -d '{"message": "How many casual leaves can an employee take?"}'

# 4. Ask the agent to delete → expect status "awaiting_approval"
curl -X POST localhost:8000/chat -H "Content-Type: application/json" \
  -d '{"message": "Delete the leave policy document", "thread_id": "<thread_id>"}'

# 5. Approve → expect status "completed"
curl -X POST localhost:8000/chat/resume -H "Content-Type: application/json" \
  -d '{"thread_id": "<thread_id>", "approved": true}'

# 6. Confirm it is gone
curl localhost:8000/documents
```

---

## 10. Scope

**Out of scope (do not build):** authentication, multi-user support, frontend UI, OCR for scanned PDFs, Docker/deployment, job queues.

**Stretch goals (only after Phase 6):**
- Streaming responses (SSE) with `agent.stream`
- Background ingestion with FastAPI `BackgroundTasks`
- `.docx` support
- Replace raw `interrupt()` with `HumanInTheLoopMiddleware` and compare the two
- Streamlit chat UI with Approve / Reject buttons
- LangSmith tracing
- Async endpoints with `AsyncSqliteSaver`
````

I made a few decisions your description left open, so change them in the README if you disagree:

- **Two additions for HITL:** I added a `delete_document` tool and a `POST /chat/resume` endpoint, since your flow needs both.
- **The two POST endpoints:** I read `POST /documents` as "create from raw text (JSON)" and `POST /documents/upload` as "file upload".
- **Direct delete:** `DELETE /documents/{id}` skips approval because a human is calling it directly; only the agent's delete goes through `interrupt()`.
- **Defaults:** I picked OpenAI and Chroma. To use another provider, edit Sections 1 and 4 and add its `langchain-*` package in task 0.2.

Give the coding agent one phase at a time, for example: "Implement Phase 0 from README.md, then stop and show me the Done-when checks." Reviewing between phases is also how you'll learn each concept.