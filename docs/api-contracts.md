# API contract

All routes are under `/api`. Every route except health and login needs `Authorization: Bearer <token>`.
Errors return `{"detail": "message"}`.

| Method | Route | Who | Purpose |
| --- | --- | --- | --- |
| GET | /health | anyone | API, database and pgvector status |
| POST | /auth/login | anyone | `{email, password}` returns `{token, user}` |
| GET | /auth/demo-users | anyone | Demo accounts; empty unless demo mode is on |
| POST | /auth/demo-login | anyone | `{email}` returns `{token, user}`; 404 unless demo mode is on |
| GET | /users/me | user | Current user with roles and clearance |
| GET | /users | admin | Users in the admin's organization |
| GET | /roles | admin | Roles in the admin's organization |
| GET | /documents | user | Readable documents; admins get all titles plus access lists |
| POST | /documents/upload | admin | Multipart: `file`, `title`, `classification` (0-3), `grants` (JSON list) |
| PATCH | /documents/{id}/access | admin | `{classification?, grants: [{subject_type, subject_id}]}` replaces the grant list |
| DELETE | /documents/{id} | admin | Removes the document, its chunks and files |
| GET | /documents/{id}/pages/{n} | user | PNG of a page; 404 if missing or not readable |
| POST | /chat/query | user | `{question, conversation_id?}` returns `{conversation_id, status, answer, citations}` |
| GET | /chat/sessions | user | The user's conversations |
| GET | /chat/sessions/{id} | user | Messages; answers citing sources the user lost are withdrawn |
| POST | /policies/simulate | admin | `{user_id, question}` returns matches, searchable and excluded documents with reasons |
| GET | /audit/events | admin | Activity log; optional `?decision=` filter |
| GET | /security/tests | admin | Results of the last test run |
| POST | /security/tests/run | admin | Runs the test suite against the test database |

`subject_type` is `everyone`, `role` or `user`. `status` on a chat reply is `answered` or `abstained`.
A citation is `{chunk_id, document_id, title, page, location, kind, classification, snippet}`.
