import { Database, FileSpreadsheet, FileText, FileType2, Image as ImageIcon, ScanLine, type LucideIcon } from "lucide-react";

export type KindStyle = { icon: LucideIcon; label: string; tint: string };

const KINDS: Record<string, KindStyle> = {
  pdf: { icon: FileText, label: "PDF", tint: "text-rose-700 bg-rose-500/10 border-rose-500/30" },
  image: { icon: ImageIcon, label: "Image · OCR", tint: "text-violet-700 bg-violet-500/10 border-violet-500/30" },
  database: { icon: Database, label: "DB records", tint: "text-emerald-700 bg-emerald-500/10 border-emerald-500/30" },
  xlsx: { icon: FileSpreadsheet, label: "Spreadsheet", tint: "text-teal-700 bg-teal-500/10 border-teal-500/30" },
  docx: { icon: FileType2, label: "Word", tint: "text-sky-700 bg-sky-500/10 border-sky-500/30" },
  text: { icon: FileText, label: "Text", tint: "text-slate-700 bg-slate-500/10 border-slate-500/30" },
};

export function kindStyle(kind: string, location = ""): KindStyle {
  if (/ocr/i.test(location) && kind === "pdf") {
    return { icon: ScanLine, label: "Scanned · OCR", tint: "text-amber-700 bg-amber-500/10 border-amber-500/30" };
  }
  return KINDS[kind] ?? KINDS.text;
}
