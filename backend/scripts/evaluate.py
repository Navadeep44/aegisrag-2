"""Small evaluation on the seeded demo data. Run: python -m scripts.evaluate
Reports retrieval hit rate, citation validity and abstention on questions that
have no authorized answer."""
from sqlalchemy import select

from app import chat
from app.db import SessionLocal
from app.models import User

# (user, question, title of the document that should be cited, or None if the user must get no answer)
CASES = [
    ("employee@acme.test", "How many days of annual leave do employees get?", "Leave Policy"),
    ("employee@acme.test", "How many days of sick leave do employees receive?", "Leave Policy"),
    ("employee@acme.test", "How is VPN access requested?", "IT Onboarding Notes"),
    ("employee@acme.test", "How long must passwords be?", "IT Onboarding Notes"),
    ("finance@acme.test", "What was our annual revenue?", "FY2025 Revenue Report"),
    ("finance@acme.test", "What is the revenue forecast for FY2026?", "FY2025 Revenue Report"),
    ("finance@acme.test", "Which quarter was the highest for revenue?", "FY2025 Revenue Report"),
    ("engineer@acme.test", "Which three services does the platform run on?", "Platform Architecture Overview"),
    ("engineer@acme.test", "Where does the retrieval service store embeddings?", "Platform Architecture Overview"),
    ("hr@acme.test", "What is the salary band for a senior engineer?", "Salary Bands 2026"),
    ("employee@acme.test", "What was our annual revenue?", None),
    ("employee@acme.test", "What is the salary band for a senior engineer?", None),
    ("engineer@acme.test", "What is the revenue forecast for FY2026?", None),
    ("admin@acme.test", "Which three services does the platform run on?", None),
    ("employee@acme.test", "What is the capital of Australia?", None),
]


def main() -> None:
    hits = answerable = abstained = unanswerable = cited = valid = 0
    with SessionLocal() as db:
        for email, question, expected in CASES:
            user = db.execute(select(User).where(User.email == email)).scalar_one()
            result = chat.answer_question(db, user, question, None)
            titles = {c["title"] for c in result["citations"]}
            if expected:
                answerable += 1
                hits += expected in titles
                cited += len(titles)
                valid += len(titles & {expected})
            else:
                unanswerable += 1
                abstained += result["status"] == "abstained"
            mark = "ok " if (expected in titles if expected else result["status"] == "abstained") else "MISS"
            print(f"{mark} {email:22} {question}")
    print(f"\nCorrect source cited: {hits}/{answerable}")
    print(f"Citations pointing at the expected source: {valid}/{cited}")
    print(f"Abstained when no authorized answer exists: {abstained}/{unanswerable}")


if __name__ == "__main__":
    main()
