import { CheckCircle2, FileText, ChevronRight, ShieldCheck, Sparkles, BookOpen } from "lucide-react";
import type { Citation } from "../../lib/types";

interface StructuredAnswerProps {
  content: string;
  citations: Citation[];
  onSelectCitation: (citation: Citation) => void;
}

export function StructuredAnswer({ content, citations, onSelectCitation }: StructuredAnswerProps) {
  // Parse content into sections
  const sections = parseContentSections(content);

  return (
    <div className="space-y-4">
      {/* 1. Direct Answer Card */}
      {sections.directAnswer && (
        <div className="rounded-xl border border-indigo-100 bg-white p-4 sm:p-5 shadow-xs">
          <div className="flex items-center gap-1.5 pb-2 text-[0.72rem] font-semibold uppercase tracking-wider text-indigo-700">
            <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" />
            <span>Direct Answer</span>
          </div>
          <p className="text-sm sm:text-[0.92rem] font-medium text-slate-900 leading-relaxed whitespace-pre-wrap">
            {sections.directAnswer}
          </p>
        </div>
      )}

      {/* 2. Key Policies & Supporting Guidelines Cards */}
      {sections.keyPoints.length > 0 && (
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 sm:p-5 space-y-2.5">
          <div className="flex items-center gap-1.5 pb-1 text-[0.72rem] font-semibold uppercase tracking-wider text-slate-700">
            <FileText className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            <span>{sections.keyPointsTitle || "Key Guidelines & Details"}</span>
          </div>
          <div className="grid gap-2">
            {sections.keyPoints.map((point, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2.5 rounded-lg border border-slate-200/60 bg-white px-3.5 py-2.5 text-xs sm:text-[0.82rem] text-slate-800 shadow-2xs leading-relaxed"
              >
                <span className="mt-1 flex h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />
                <span>{point}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Fallback for Unstructured Answers */}
      {!sections.directAnswer && sections.keyPoints.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs text-sm sm:text-[0.92rem] text-slate-900 leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
      )}

      {/* 4. Verified Source Cards */}
      {citations.length > 0 && (
        <div className="pt-2 space-y-2">
          <div className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span>Verified Sources</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {citations.map((c) => (
              <button
                key={c.chunk_id}
                type="button"
                onClick={() => onSelectCitation(c)}
                className="group flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-left text-xs text-slate-700 hover:border-indigo-400 hover:bg-indigo-50/40 hover:text-indigo-900 transition-all shadow-2xs cursor-pointer"
              >
                <BookOpen className="h-3.5 w-3.5 text-indigo-500 group-hover:text-indigo-600 shrink-0" />
                <span className="font-semibold text-slate-900 group-hover:text-indigo-950 truncate max-w-[200px]">
                  {c.title}
                </span>
                {c.section_heading && (
                  <span className="hidden sm:inline text-[0.7rem] text-slate-500 truncate max-w-[150px]">
                    • {c.section_heading}
                  </span>
                )}
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.65rem] font-mono font-medium text-slate-600">
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

function parseContentSections(text: string): {
  directAnswer: string;
  keyPoints: string[];
  keyPointsTitle: string;
} {
  const lines = text.split("\n");
  let directAnswer = "";
  const keyPoints: string[] = [];
  let keyPointsTitle = "";
  let isKeyPoints = false;
  let isDirectAnswer = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    if (
      rawLine.startsWith("**Direct Answer**") ||
      rawLine.startsWith("### Executive Summary") ||
      rawLine.startsWith("**Executive Summary**")
    ) {
      isDirectAnswer = true;
      isKeyPoints = false;
      continue;
    }

    if (
      rawLine.startsWith("**Key Policy Guidelines") ||
      rawLine.startsWith("**Key Details") ||
      rawLine.startsWith("### Key Details") ||
      rawLine.startsWith("### Policy Details") ||
      rawLine.startsWith("**Verified Sources")
    ) {
      isKeyPoints = true;
      isDirectAnswer = false;
      keyPointsTitle = rawLine.replace(/[*#]/g, "").trim();
      continue;
    }

    if (isKeyPoints) {
      if (rawLine.startsWith("- ") || rawLine.startsWith("• ") || rawLine.startsWith("* ")) {
        keyPoints.push(rawLine.replace(/^[-•*]\s*/, ""));
      } else if (/^\d+\.\s*/.test(rawLine)) {
        keyPoints.push(rawLine.replace(/^\d+\.\s*/, ""));
      }
    } else if (isDirectAnswer) {
      directAnswer = directAnswer ? `${directAnswer}\n${rawLine}` : rawLine;
    } else {
      // First section before headings or standard text
      if (rawLine.startsWith("- ") || rawLine.startsWith("• ")) {
        keyPoints.push(rawLine.replace(/^[-•]\s*/, ""));
      } else if (!directAnswer) {
        directAnswer = rawLine;
      } else {
        directAnswer += `\n${rawLine}`;
      }
    }
  }

  return { directAnswer, keyPoints, keyPointsTitle };
}
