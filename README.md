# AegisRAG

Secure multimodal RAG with access control. Hackathon build for PS-01.

People ask questions across company documents and only get answers from
sources they are allowed to read. Permissions are enforced inside the
retrieval SQL query, before anything reaches the language model.

## Run

You need Python 3.10 or newer and Node 20 or newer. There is no database to
install: by default the app keeps its data in a local SQLite file.

1. Start the backend:

   ```bash
   cd backend
   cp .env.example .env        # Windows: copy .env.example .env
   pip install -r requirements.txt
   python -m uvicorn app.main:app --port 8000
   ```

   The first start creates the tables and loads two fictional organizations
   with demo users and documents.
2. In a second terminal, start the frontend:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. Open http://localhost:5173. The home page leads to sign-in, where you
   choose a demo account.

Pages: `/` home, `/signin`, `/app/ask`, `/app/documents`, and for admins
`/app/simulator` and `/app/security`.

Reset to the demo state at any time (from `backend/`): `python -m app.seed`

### Optional: Postgres with pgvector

Set `DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/DBNAME` in
`backend/.env`. Search then runs inside Postgres (pgvector plus full-text
search). The permission rule and every test are identical on both databases.
`docker compose up --build` from the project root starts this variant with
its own database.

## Demo accounts (Acme Corp)

| Account | Roles | Clearance | Can read |
| --- | --- | --- | --- |
| admin@acme.test | admin | internal | Leave Policy, IT Onboarding Notes. Manages access for all documents |
| hr@acme.test | hr, employee | restricted | plus Salary Bands |
| finance@acme.test | finance, employee | confidential | plus Revenue Report, Scanned Invoice |
| engineer@acme.test | engineering, employee | confidential | plus Architecture Overview |
| employee@acme.test | employee | internal | Leave Policy, IT Onboarding Notes |

`user@globex.test` belongs to a second organization and sees none of the above.

## Five-minute demo

1. Sign in as Emil (Employee). Ask "How many days of annual leave do employees get?" and open the citation.
2. Ask "What was our annual revenue?" The answer is "no authorized source".
3. Switch to Asha (Admin). Open Permission simulator, pick Emil and run the same question to show why.
4. In Documents, on FY2025 Revenue Report, choose "Grant to a person" and pick Emil.
5. Switch to Emil and ask again. The answer now cites the report, with the page shown.
6. Switch to Asha, remove Emil's grant. Switch to Emil, ask again: blocked. Reopen the earlier conversation: the old answer is withdrawn.
7. As Asha, open Security. Run the tests and show the activity log, including the instruction found hidden in IT Onboarding Notes.

## Access rule

A user can read a document only if it is active, in their organization, and either

- they hold an individual grant on it, or
- it is granted to everyone or to one of their roles, and their clearance is at least the document's classification.

The rule lives in `backend/app/authorization.py`. `readable_clause()` is the only path to documents and chunks.

## Using a real model

Set `AI_PROVIDER=openai` and fill in `AI_BASE_URL`, `AI_API_KEY`, `AI_CHAT_MODEL` and `AI_EMBED_MODEL` in `backend/.env` for any OpenAI-compatible API. The chat model must accept images for scans, charts and diagrams to be read. Then reset the demo data so documents are embedded with the new model.

## Tests

```bash
cd backend
python -m pytest tests
python -m scripts.evaluate
```

Tests use a separate throwaway database and the local provider, so they
never touch live data. The Security screen runs the same suite and shows the results.

## Project structure

```
backend/
  app/
    authorization.py   the access rule; the only path to documents and chunks
    retrieval.py       permission-filtered hybrid search (SQLite or Postgres)
    chat.py            answers, citation validation, history checks, rate limit
    ingestion.py       upload validation, extraction, injection sanitizing, chunking
    ai.py              model adapter (local and OpenAI-compatible)
    api.py             all endpoints
    auth.py  audit.py  models.py  db.py  config.py  seed.py  demo_docs.py  main.py
  tests/               access and attack tests, unit tests
  scripts/evaluate.py  small evaluation on the demo data
frontend/src/
  main.tsx  App.tsx    entry point and routes
  styles/              design tokens and typography
  lib/                 API client and shared types
  context/             sign-in state
  components/
    ui/                Button, Notice, classification band, page header, fields
    layout/            app shell, public navigation, footer, route guards
    motion/            Framer Motion reveal and page transition
    three/             the three.js document stack on the home page
  features/
    home/              hero (GSAP), comparison, scroll-driven steps, checks
    chat/              message bubble, source panel
    documents/         access editor, upload form
  pages/               Home, SignIn, Chat, Documents, Simulator, Security, NotFound
docs/api-contracts.md  endpoint reference
```

## Known limits

- The local provider is a stand-in. It matches keywords and quotes one sentence; it cannot read scanned pages or images.
- Tables are created at startup with no migration tool. After changing a model, reset the database.
- On the default SQLite database, ranking runs in Python over the permitted chunks. That suits a demo; use Postgres with pgvector for large collections.
- The rate limit is kept in memory and resets when the server restarts.
- Injection handling is pattern-based and will miss rephrased attacks. The real protection is that the model has no tools and only ever receives chunks the user may read.
- No malware scanning of uploads. Files are checked for type, content signature and size only.
