import React, { useState } from "react";
import {
  CheckCircle2,
  FileText,
  ChevronRight,
  ShieldCheck,
  Sparkles,
  BookOpen,
  Copy,
  Check,
  Table,
  Layers,
  Info,
  Calculator,
} from "lucide-react";
import type { Citation } from "../../lib/types";

interface StructuredAnswerProps {
  content: string;
  citations: Citation[];
  onSelectCitation: (citation: Citation) => void;
  isTyping?: boolean;
}

export function StructuredAnswer({
  content,
  citations,
  onSelectCitation,
  isTyping = false,
}: StructuredAnswerProps) {
  return (
    <div className="space-y-4 text-slate-800">
      {/* Markdown formatted content */}
      <MarkdownContent text={content} isTyping={isTyping} />

      {/* Verified Source Cards (Only shown when not typing or when citations exist) */}
      {!isTyping && citations.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-200/80 space-y-2">
          <div className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wider text-slate-500 font-mono">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <span>Verified Sources ({citations.length})</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {citations.map((c) => (
              <button
                key={c.chunk_id}
                type="button"
                onClick={() => onSelectCitation(c)}
                className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-700 hover:border-indigo-400 hover:bg-indigo-50/40 hover:text-indigo-950 transition-all shadow-2xs cursor-pointer"
              >
                <BookOpen className="h-3.5 w-3.5 text-indigo-500 group-hover:text-indigo-600 shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 group-hover:text-indigo-950 truncate max-w-[220px]">
                    {c.title}
                  </p>
                  {c.section_heading && (
                    <p className="text-[0.68rem] text-slate-500 truncate max-w-[200px]">
                      § {c.section_heading}
                    </p>
                  )}
                </div>
                <span className="ml-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.65rem] font-mono font-semibold text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-700">
                  p.{c.page}
                </span>
                <ChevronRight className="h-3 w-3 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-transform" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MarkdownContent({ text, isTyping }: { text: string; isTyping: boolean }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  let inCodeBlock = false;
  let codeBlockLang = "";
  let codeBlockLines: string[] = [];

  let inTable = false;
  let tableLines: string[] = [];

  let currentParagraphLines: string[] = [];

  const flushParagraph = () => {
    if (currentParagraphLines.length > 0) {
      const pText = currentParagraphLines.join("\n").trim();
      if (pText) {
        elements.push(
          <div key={`p-${elements.length}`} className="my-1.5 text-sm sm:text-[0.92rem] leading-relaxed text-slate-800">
            {currentParagraphLines.map((line, idx) => (
              <React.Fragment key={idx}>
                {renderInlineFormattedText(line)}
                {idx < currentParagraphLines.length - 1 && <br />}
              </React.Fragment>
            ))}
          </div>
        );
      }
      currentParagraphLines = [];
    }
  };

  const flushTable = () => {
    if (tableLines.length >= 2) {
      elements.push(
        <RenderTable key={`tbl-${elements.length}`} lines={tableLines} />
      );
    } else if (tableLines.length === 1) {
      // Not a valid table, treat as normal text
      currentParagraphLines.push(...tableLines);
      flushParagraph();
    }
    tableLines = [];
    inTable = false;
  };

  const flushCodeBlock = () => {
    if (codeBlockLines.length > 0 || inCodeBlock) {
      elements.push(
        <RenderCodeBlock
          key={`code-${elements.length}`}
          code={codeBlockLines.join("\n")}
          language={codeBlockLang}
        />
      );
      codeBlockLines = [];
      inCodeBlock = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Code blocks ```
    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        flushParagraph();
        flushTable();
        inCodeBlock = true;
        codeBlockLang = trimmed.replace(/^```/, "").trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      continue;
    }

    // Markdown tables (| col1 | col2 |)
    if (trimmed.startsWith("|") && (trimmed.endsWith("|") || trimmed.includes("|"))) {
      flushParagraph();
      inTable = true;
      tableLines.push(trimmed);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Blank line
    if (!trimmed) {
      flushParagraph();
      continue;
    }

    // Headings: #, ##, ###, #### or bold headers like **Direct Answer**
    if (
      trimmed.startsWith("# ") ||
      trimmed.startsWith("## ") ||
      trimmed.startsWith("### ") ||
      trimmed.startsWith("#### ") ||
      trimmed === "**Direct Answer**" ||
      trimmed.startsWith("**Direct Answer**") ||
      trimmed === "**Executive Summary**" ||
      trimmed.startsWith("**Key Policy Guidelines") ||
      trimmed.startsWith("**Key Details") ||
      trimmed.startsWith("**Calculation & Methodology") ||
      trimmed.startsWith("**Dataset Overview**") ||
      trimmed.startsWith("**Dataset Attributes") ||
      trimmed.startsWith("**Summary of Records**") ||
      (trimmed.startsWith("**") && (trimmed.endsWith("**") || trimmed.endsWith("**:")) && trimmed.length < 80 && !trimmed.slice(2, -2).includes("\n"))
    ) {
      flushParagraph();

      let headingLevel = 3;
      let headingTitle = trimmed;

      if (trimmed.startsWith("# ")) {
        headingLevel = 1;
        headingTitle = trimmed.replace(/^#\s+/, "");
      } else if (trimmed.startsWith("## ")) {
        headingLevel = 2;
        headingTitle = trimmed.replace(/^##\s+/, "");
      } else if (trimmed.startsWith("### ")) {
        headingLevel = 3;
        headingTitle = trimmed.replace(/^###\s+/, "");
      } else if (trimmed.startsWith("#### ")) {
        headingLevel = 4;
        headingTitle = trimmed.replace(/^####\s+/, "");
      } else {
        // Remove bold delimiters
        headingTitle = trimmed.replace(/^\*\*/, "").replace(/(\*\*:?|\*\*)$/, "").trim();
      }

      const isDirectAnswerHdr = headingTitle.toLowerCase().includes("direct answer") || headingTitle.toLowerCase().includes("executive summary");
      const isCalcHdr = headingTitle.toLowerCase().includes("calculation") || headingTitle.toLowerCase().includes("methodology") || headingTitle.toLowerCase().includes("formula");
      const isRecordHdr = headingTitle.toLowerCase().includes("record") || headingTitle.toLowerCase().includes("doctor") || headingTitle.toLowerCase().includes("patient");

      elements.push(
        <div key={`hdr-${elements.length}`} className="pt-3 pb-1">
          <div className="flex items-center gap-2">
            {isDirectAnswerHdr ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-indigo-100 text-indigo-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </span>
            ) : isCalcHdr ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-100 text-amber-800">
                <Calculator className="h-3.5 w-3.5" />
              </span>
            ) : isRecordHdr ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
                <Layers className="h-3.5 w-3.5" />
              </span>
            ) : (
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                <FileText className="h-3.5 w-3.5" />
              </span>
            )}
            <h3 className={`font-bold tracking-tight text-slate-900 ${
              headingLevel === 1
                ? "text-lg"
                : headingLevel === 2
                ? "text-base"
                : "text-sm sm:text-[0.95rem]"
            }`}>
              {headingTitle}
            </h3>
          </div>
        </div>
      );
      continue;
    }

    // Bullet points (- , * , • )
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ")) {
      flushParagraph();
      const bulletText = trimmed.replace(/^[-*•]\s+/, "");
      elements.push(
        <div key={`bullet-${elements.length}`} className="flex items-start gap-2.5 py-1 pl-1 text-sm sm:text-[0.92rem]">
          <span className="mt-2 h-1.5 w-1.5 rounded-full bg-indigo-600 shrink-0" />
          <span className="leading-relaxed text-slate-800 flex-1">
            {renderInlineFormattedText(bulletText)}
          </span>
        </div>
      );
      continue;
    }

    // Numbered lists (1. , 2. )
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      flushParagraph();
      const num = numMatch[1];
      const rest = numMatch[2];
      elements.push(
        <div key={`num-${elements.length}`} className="flex items-start gap-2.5 py-1 pl-1 text-sm sm:text-[0.92rem]">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-700 text-[0.7rem] font-bold font-mono border border-indigo-100">
            {num}
          </span>
          <span className="leading-relaxed text-slate-800 flex-1 pt-0.5">
            {renderInlineFormattedText(rest)}
          </span>
        </div>
      );
      continue;
    }

    // Callout quote (> quote)
    if (trimmed.startsWith("> ")) {
      flushParagraph();
      const quoteText = trimmed.replace(/^>\s+/, "");
      elements.push(
        <div key={`quote-${elements.length}`} className="my-2 rounded-xl border-l-4 border-indigo-500 bg-indigo-50/50 p-3.5 text-xs sm:text-sm text-indigo-950 font-medium">
          {renderInlineFormattedText(quoteText)}
        </div>
      );
      continue;
    }

    // Default: normal line inside paragraph
    currentParagraphLines.push(rawLine);
  }

  if (inCodeBlock) flushCodeBlock();
  if (inTable) flushTable();
  flushParagraph();

  return (
    <div className="space-y-1">
      {elements}
      {isTyping && (
        <span className="inline-block h-4 w-1.5 ml-1 bg-indigo-600 animate-cursor-blink align-middle rounded-full" />
      )}
    </div>
  );
}

function RenderTable({ lines }: { lines: string[] }) {
  if (lines.length < 2) return null;

  const headerLine = lines[0];
  const headers = headerLine
    .split("|")
    .map((h) => h.trim())
    .filter((h, i, arr) => (i === 0 && !h ? false : i === arr.length - 1 && !h ? false : true));

  // Filter separator line (|---|---|)
  const isSeparator = (l: string) => /^\|?(\s*:?-+:?\s*\|?)+$/.test(l.trim());
  const startRowIdx = isSeparator(lines[1]) ? 2 : 1;
  const rowLines = lines.slice(startRowIdx);

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider text-[0.68rem] border-b border-slate-200">
              {headers.map((h, i) => (
                <th key={i} className="px-3.5 py-2.5 font-mono whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rowLines.map((rowStr, rIdx) => {
              if (isSeparator(rowStr)) return null;
              const cells = rowStr
                .split("|")
                .map((c) => c.trim())
                .filter((c, i, arr) => (i === 0 && !c ? false : i === arr.length - 1 && !c ? false : true));

              if (cells.length === 0) return null;

              return (
                <tr key={rIdx} className="hover:bg-indigo-50/25 transition-colors">
                  {cells.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3.5 py-2 text-slate-800 text-xs leading-relaxed whitespace-nowrap">
                      {renderInlineFormattedText(cell)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RenderCodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-slate-100 shadow-md">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 py-2 text-xs">
        <span className="font-mono text-[0.7rem] uppercase font-semibold text-slate-400">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-[0.7rem] text-slate-400 hover:text-white transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-slate-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderInlineFormattedText(text: string): React.ReactNode {
  // Parse inline bold (**bold**), code (`code`), and italics (*italic*)
  const tokens = text.split(/(\*\*.*?\*\*|`.*?`)/g);

  return tokens.map((token, index) => {
    if (token.startsWith("**") && token.endsWith("**") && token.length >= 4) {
      return (
        <strong key={index} className="font-bold text-slate-950">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith("`") && token.endsWith("`") && token.length >= 2) {
      return (
        <code
          key={index}
          className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-indigo-700 font-semibold"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    return token;
  });
}
