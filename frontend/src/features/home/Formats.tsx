import { Database, FileSpreadsheet, FileText, FileType2, Image as ImageIcon, ScanLine, Table2, type LucideIcon } from "lucide-react";

const FORMATS: { icon: LucideIcon; label: string; note: string }[] = [
  { icon: FileText, label: "PDF", note: "text, headings, tables" },
  { icon: ScanLine, label: "Scanned PDF", note: "OCR" },
  { icon: ImageIcon, label: "Photos", note: "notices, whiteboards" },
  { icon: Database, label: "CSV / TSV", note: "one record per row" },
  { icon: Table2, label: "JSON exports", note: "nested records" },
  { icon: FileSpreadsheet, label: "Excel", note: "every sheet" },
  { icon: FileType2, label: "Word", note: "sections, tables" },
];

/** A slow, endless strip of the file types that land in the same index. */
export function Formats() {
  const row = [...FORMATS, ...FORMATS];
  return (
    <section aria-label="Supported formats" className="border-y border-line/70 bg-surface/50 py-5">
      <div className="marquee-mask overflow-hidden">
        <div className="animate-marquee flex w-max gap-3 motion-reduce:animate-none">
          {row.map((f, i) => {
            const Icon = f.icon;
            return (
              <span key={i} aria-hidden={i >= FORMATS.length}
                className="inline-flex items-center gap-2.5 rounded-full border border-line bg-surface px-4 py-2 text-sm">
                <Icon className="h-4 w-4 text-accent" strokeWidth={1.8} />
                <span className="font-semibold text-ink">{f.label}</span>
                <span className="text-muted">· {f.note}</span>
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}
