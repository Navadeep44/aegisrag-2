"""Exact answers over structured records (CSV, JSON, XLSX, database exports).

Counts, sums, averages, min/max and filtered lists are computed in code over
the rows the user is allowed to read. The rows are loaded through the same SQL
access rule as every other piece of evidence, so a restricted row can never be
counted, summed or shown. A language model may help choose the operation
(plan), but it never sees restricted rows and never does the arithmetic.
"""
import logging
import re
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import ai, llm
from app.authorization import readable_chunk_clause
from app.models import Chunk, Document, Record, User

logger = logging.getLogger(__name__)

OPS = ("count", "sum", "avg", "min", "max", "list")
ANALYTIC_HINT = re.compile(
    r"\b(how many|number of|count|total|sum|average|avg|mean|median|highest|lowest|maximum|minimum|max|min|"
    r"most|least|top|bottom|list|show|which|who|per|by|each|breakdown|group|greater|less|above|below|over|under|"
    r"more than|fewer than|between|records?|rows?|table|all)\b", re.I)


@dataclass
class Table:
    key: str
    document_id: str
    title: str
    sheet: str
    columns: list[str]
    rows: list[dict] = field(default_factory=list)
    chunk_ids: list[int] = field(default_factory=list)
    row_numbers: list[int] = field(default_factory=list)

    def numeric(self, col: str) -> bool:
        values = [r.get(col) for r in self.rows if str(r.get(col, "")).strip()]
        return bool(values) and sum(num(v) is not None for v in values) / len(values) >= 0.8

    def distinct(self, col: str, limit: int = 40) -> list[str]:
        seen: dict[str, None] = {}
        for r in self.rows:
            v = str(r.get(col, "")).strip()
            if v and v not in seen:
                seen[v] = None
                if len(seen) > limit:
                    break
        return list(seen)


def num(value) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    text = str(value or "").strip().replace(",", "").replace("$", "").replace("%", "")
    try:
        return float(text) if text else None
    except ValueError:
        return None


def permitted_tables(db: Session, user: User) -> list[Table]:
    rows = db.execute(
        select(Record.document_id, Record.sheet, Record.row_index, Record.data, Record.chunk_id, Document.title)
        .join(Chunk, Chunk.id == Record.chunk_id)
        .join(Document, Document.id == Record.document_id)
        .where(readable_chunk_clause(user))
        .order_by(Record.document_id, Record.sheet, Record.row_index)
    ).all()
    tables: dict[tuple[str, str], Table] = {}
    for doc_id, sheet, row_index, data, chunk_id, title in rows:
        t = tables.get((doc_id, sheet))
        if t is None:
            t = tables[(doc_id, sheet)] = Table(key=f"T{len(tables) + 1}", document_id=doc_id,
                                                title=title, sheet=sheet, columns=list((data or {}).keys()))
        t.rows.append(data or {})
        t.chunk_ids.append(chunk_id)
        t.row_numbers.append(row_index)
    return list(tables.values())


# ---------- planning ----------

PLAN_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "use_table": {"type": "BOOLEAN"},
        "table": {"type": "STRING"},
        "operation": {"type": "STRING", "enum": list(OPS)},
        "column": {"type": "STRING", "nullable": True},
        "group_by": {"type": "STRING", "nullable": True},
        "filters": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
            "column": {"type": "STRING"},
            "op": {"type": "STRING", "enum": ["eq", "neq", "contains", "gt", "gte", "lt", "lte"]},
            "value": {"type": "STRING"},
        }, "required": ["column", "op", "value"]}},
        "sort_desc": {"type": "BOOLEAN", "nullable": True},
        "limit": {"type": "INTEGER", "nullable": True},
    },
    "required": ["use_table"],
}

PLAN_SYSTEM = """You translate a question into a query plan over the user's structured tables.
Set use_table=false unless the question is answered by computing over or listing rows of one of the tables
(e.g. counts, totals, averages, highest/lowest, filtered lists, per-group breakdowns, a specific record lookup).
Questions about policies, prose documents or anything not in a table must get use_table=false.
Use exact column names. Filter values must be copied from the sample values when a match exists.
operation: count | sum | avg | min | max | list. column is the numeric column for sum/avg/min/max (or the ranking column).
For 'which/who has the highest X' use operation=max with column=X. group_by only for per-group breakdowns."""


def _describe(tables: list[Table]) -> str:
    out = []
    for t in tables:
        cols = []
        for c in t.columns:
            if t.numeric(c):
                cols.append(f"{c} (number)")
            else:
                vals = t.distinct(c, 12)
                cols.append(f"{c} (text; e.g. {', '.join(vals[:12])})" if len(vals) <= 12 else f"{c} (text)")
        out.append(f"{t.key}: '{t.title}' / sheet '{t.sheet}' — columns: " + "; ".join(cols))
    return "\n".join(out)


def _plan_schema(tables: list[Table]) -> dict:
    """PLAN_SCHEMA with the real table keys and column names as enums, so the
    model can only pick things that exist."""
    columns = sorted({c for t in tables for c in t.columns})
    schema = {**PLAN_SCHEMA, "properties": dict(PLAN_SCHEMA["properties"])}
    schema["properties"]["table"] = {"type": "STRING", "enum": [t.key for t in tables]}
    schema["properties"]["column"] = {"type": "STRING", "enum": columns, "nullable": True}
    schema["properties"]["group_by"] = {"type": "STRING", "enum": columns, "nullable": True}
    flt = dict(PLAN_SCHEMA["properties"]["filters"]["items"])
    flt["properties"] = {**flt["properties"], "column": {"type": "STRING", "enum": columns}}
    schema["properties"]["filters"] = {"type": "ARRAY", "items": flt}
    return schema


def _llm_plan(question: str, tables: list[Table], other_docs: list[str]) -> dict | None:
    prompt = (f"TABLES:\n{_describe(tables)}\n\nOTHER (non-table) DOCUMENTS: {', '.join(other_docs) or 'none'}"
              f"\n\nQUESTION: {question}")
    try:
        return llm.generate_json(PLAN_SYSTEM, prompt, _plan_schema(tables), timeout=12)
    except Exception as exc:
        logger.warning("Plan generation failed: %s", exc)
        return None


def _mentions(question: str, phrase: str) -> bool:
    phrase = phrase.strip().lower()
    return bool(phrase) and re.search(rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])", question.lower()) is not None


# Common abbreviations in column names, so "total quantity" finds a "qty" column.
ABBREV = {"qty": "quantity", "amt": "amount", "dept": "department", "num": "number", "no": "number",
          "desc": "description", "cat": "category", "yr": "year", "dob": "birth", "addr": "address",
          "emp": "employee", "mgr": "manager", "sal": "salary", "rev": "revenue", "pct": "percent",
          "avg": "average", "tot": "total", "px": "price", "cnt": "count", "loc": "location"}


def _col_tokens(col: str) -> set[str]:
    words = re.findall(r"[a-z0-9]+", col.lower())
    return set(ai.tokens(" ".join(words + [ABBREV[w] for w in words if w in ABBREV])))


def _col_score(question: str, col: str) -> int:
    return len(set(ai.tokens(question)) & _col_tokens(col))


def heuristic_plan(question: str, tables: list[Table]) -> dict | None:
    q = question.lower()
    best, best_score = None, 0
    for t in tables:
        score = len(set(ai.tokens(question)) & set(ai.tokens(f"{t.title} {t.sheet}"))) * 2
        score += sum(_col_score(question, c) for c in t.columns)
        score += sum(1 for c in t.columns if not t.numeric(c) for v in t.distinct(c) if len(v) > 2 and _mentions(q, v))
        if score > best_score:
            best, best_score = t, score
    if not best or best_score < 2 or not ANALYTIC_HINT.search(q):
        return None
    t = best
    numeric_cols = sorted((c for c in t.columns if t.numeric(c)), key=lambda c: -_col_score(question, c))
    target = numeric_cols[0] if numeric_cols and _col_score(question, numeric_cols[0]) else None
    money_q = re.search(r"\b(cost|price|amount|spend|spent|value|paid|salary|revenue|fee|expense|claim|\$)", q)
    if target is None and numeric_cols and (len(numeric_cols) == 1 or money_q) and re.search(
            r"\b(average|avg|mean|highest|maximum|max|largest|biggest|lowest|minimum|min|smallest|total|sum)\b", q):
        # "highest claim", "average expense": rank by the table's main numeric column.
        money = [c for c in numeric_cols if re.search(r"amount|usd|cost|price|total|value|salary|revenue|fee", c, re.I)]
        target = (money or numeric_cols)[0]
    if re.search(r"\b(average|avg|mean)\b", q) and target:
        op = "avg"
    elif re.search(r"\b(highest|maximum|max|most|largest|biggest|top)\b", q) and target:
        op = "max"
    elif re.search(r"\b(lowest|minimum|min|least|smallest)\b", q) and target:
        op = "min"
    elif re.search(r"\b(total|sum)\b", q) and target:
        op = "sum"
    elif re.search(r"\b(how many|number of|count)\b", q):
        op = "count"
    elif re.search(r"\b(list|show|which|who|all|give)\b", q):
        op = "list"
    else:
        return None
    filters = []
    for c in t.columns:
        if t.numeric(c):
            continue
        for v in t.distinct(c):
            if len(v) > 1 and _mentions(q, v):
                filters.append({"column": c, "op": "eq", "value": v})
                break
    m = re.search(r"\b(above|over|greater than|more than|at least|below|under|less than|at most)\s+\$?([\d,]+(?:\.\d+)?)", q)
    if m and numeric_cols:
        col = target or numeric_cols[0]
        word = m.group(1)
        op_map = {"at least": "gte", "at most": "lte"}
        f_op = op_map.get(word, "gt" if word in ("above", "over", "greater than", "more than") else "lt")
        filters.append({"column": col, "op": f_op, "value": m.group(2).replace(",", "")})
    group_by = None
    g = re.search(r"\b(?:by|per|each|for every)\s+([a-z _-]+)", q)
    if g:
        cand = [c for c in t.columns if not t.numeric(c) and _col_score(g.group(1), c)]
        group_by = cand[0] if cand else None
    return {"use_table": True, "table": t.key, "operation": op, "column": target,
            "group_by": group_by, "filters": filters, "sort_desc": None, "limit": None}


# ---------- execution ----------

def _match(row: dict, f: dict) -> bool:
    raw = row.get(f["column"], "")
    value, op = str(f.get("value", "")).strip(), f.get("op", "eq")
    if op in ("gt", "gte", "lt", "lte"):
        a, b = num(raw), num(value)
        if a is None or b is None:
            return False
        return {"gt": a > b, "gte": a >= b, "lt": a < b, "lte": a <= b}[op]
    left = str(raw).strip().lower()
    if op == "contains":
        return value.lower() in left
    if op == "neq":
        return left != value.lower()
    return left == value.lower() or (num(raw) is not None and num(raw) == num(value))


def _fmt(value: float, money: bool) -> str:
    if money:
        return f"${value:,.2f}"
    return f"{value:,.2f}".rstrip("0").rstrip(".") if value != int(value) else f"{int(value):,}"


def execute(plan: dict, tables: list[Table]) -> dict | None:
    t = next((x for x in tables if x.key == plan.get("table")), None)
    if t is None and len(tables) == 1:
        t = tables[0]
    op = plan.get("operation")
    if t is None or op not in OPS:
        return None
    cols = set(t.columns)
    column, group_by = plan.get("column") or None, plan.get("group_by") or None
    filters = [f for f in (plan.get("filters") or []) if f.get("column") in cols]
    if (column and column not in cols) or (group_by and group_by not in cols):
        return None
    if op in ("sum", "avg", "min", "max") and not (column and t.numeric(column)):
        return None

    idx = [i for i, r in enumerate(t.rows) if all(_match(r, f) for f in filters)]
    money = bool(column) and (bool(re.search(r"usd|\$|price|cost|amount|salary|revenue|fee", column, re.I))
                              or any("$" in str(t.rows[i].get(column, "")) for i in idx[:20]))
    where = " AND ".join(f"{f['column']} {dict(eq='=', neq='≠', contains='∋', gt='>', gte='≥', lt='<', lte='≤')[f['op']]} {f['value']}" for f in filters)
    label = {"count": "COUNT(*)", "sum": f"SUM({column})", "avg": f"AVG({column})",
             "min": f"MIN({column})", "max": f"MAX({column})", "list": "SELECT *"}[op]
    explain = f"{label} FROM {t.title}" + (f" WHERE {where}" if where else "") + (f" GROUP BY {group_by}" if group_by else "")

    def agg(rows_idx: list[int]) -> float | None:
        vals = [num(t.rows[i].get(column)) for i in rows_idx] if column else []
        vals = [v for v in vals if v is not None]
        if op == "count":
            return float(len(rows_idx))
        if not vals:
            return None
        return {"sum": sum(vals), "avg": sum(vals) / len(vals), "min": min(vals), "max": max(vals)}.get(op)

    result: dict = {"table_title": t.title, "document_id": t.document_id, "explain": explain,
                    "scanned": len(t.rows), "matched": len(idx), "operation": op}
    cite_idx = idx

    if group_by and op != "list":
        groups: dict[str, list[int]] = {}
        for i in idx:
            groups.setdefault(str(t.rows[i].get(group_by, "")).strip() or "(blank)", []).append(i)
        out_rows = []
        for g, members in sorted(groups.items(), key=lambda kv: -(agg(kv[1]) or 0)):
            v = agg(members)
            out_rows.append([g, _fmt(v, money and op != "count") if v is not None else "—", str(len(members))])
        head = {"count": "Count", "sum": f"Total {column}", "avg": f"Average {column}",
                "min": f"Min {column}", "max": f"Max {column}"}[op]
        result["table"] = {"columns": [group_by, head, "Rows"], "rows": out_rows}
        result["headline"] = f"{head} by {group_by} across {len(idx)} authorized record(s) in {t.title}."
        result["value"] = None
    elif op == "list":
        sort_col = column if column and t.numeric(column) else None
        if sort_col:
            idx.sort(key=lambda i: num(t.rows[i].get(sort_col)) or 0, reverse=plan.get("sort_desc") is not False)
        limit = min(int(plan.get("limit") or 50), 50)
        cite_idx = idx[:limit]
        shown = t.columns[:8]
        result["table"] = {"columns": ["Row"] + shown,
                           "rows": [[str(t.row_numbers[i])] + [str(t.rows[i].get(c, "")) for c in shown] for i in cite_idx]}
        more = f" (showing {limit})" if len(idx) > limit else ""
        result["headline"] = f"{len(idx)} matching record(s) in {t.title}{more}."
        result["value"] = len(idx)
    else:
        value = agg(idx)
        if value is None:
            return None
        if op in ("min", "max"):
            cite_idx = [i for i in idx if num(t.rows[i].get(column)) == value]
            shown = t.columns[:8]
            result["table"] = {"columns": ["Row"] + shown,
                               "rows": [[str(t.row_numbers[i])] + [str(t.rows[i].get(c, "")) for c in shown] for i in cite_idx[:10]]}
        noun = {"count": "Count", "sum": f"Total {column}", "avg": f"Average {column}",
                "min": f"Lowest {column}", "max": f"Highest {column}"}[op]
        shown_val = _fmt(value, money and op != "count")
        scope = f" where {where}" if where else ""
        who = ""
        if op in ("min", "max") and cite_idx:
            row = t.rows[cite_idx[0]]
            labels = [str(row.get(c, "")) for c in t.columns if c != column and not t.numeric(c)][:3]
            who = f" — {', '.join(v for v in labels if v)}" if labels else ""
        result["headline"] = f"{noun}{scope}: {shown_val}{who} (from {len(idx)} authorized record(s) in {t.title})."
        result["value"] = value

    result["row_chunk_ids"] = [t.chunk_ids[i] for i in cite_idx][:25]
    return result


def answer(db: Session, user: User, question: str, other_docs: list[str]) -> dict | None:
    """Returns a computed result, or None when the question is not a table question."""
    tables = permitted_tables(db, user)
    if not tables:
        return None
    q_tokens = set(ai.tokens(question))
    relevant = any(q_tokens & set(ai.tokens(f"{t.title} {t.sheet} {' '.join(t.columns)}")) for t in tables)
    if not ANALYTIC_HINT.search(question) and not relevant:
        return None
    # The deterministic planner goes first; the model is consulted only when it
    # cannot decide, and its plan is constrained to real tables and columns.
    plan = heuristic_plan(question, tables)
    planner = "heuristic"
    if plan is None and llm.enabled() and ANALYTIC_HINT.search(question):
        plan, planner = _llm_plan(question, tables, other_docs), "model"
    if not plan or not plan.get("use_table"):
        return None
    result = execute(plan, tables)
    if result:
        result["plan"] = {**{k: plan.get(k) for k in ("operation", "column", "group_by", "filters")},
                          "planner": planner}
    return result
