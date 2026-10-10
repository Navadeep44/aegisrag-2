import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Lock, Quote, X } from "lucide-react";
import { api, imageUrl } from "../../lib/api";
import { kindStyle } from "../../lib/kinds";
import { LEVELS, type Citation } from "../../lib/types";

const LEVEL_TEXT = ["text-level-0", "text-level-1", "text-level-2", "text-level-3"];

/** Parses "Record #3: Col: v; Col: v." rows into pairs. */
function recordPairs(text: string): [string, string][] | null {
  const m = text.match(/Record #\d+:\s*(.+?)\.?$/m);
  if (!m) return null;
  return m[1].split(/;\s*/).map((p) => {
    const i = p.indexOf(":");
    return (i > 0 ? [p.slice(0, i).trim(), p.slice(i + 1).trim()] : [p, ""]) as [string, string];
  });
}

function highlight(text: string, quote?: string) {
  if (!quote) return text;
  const q = quote.replace(/^Computed: /, "").trim();
  const i = text.indexOf(q);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-amber-200/80 px-0.5 text-ink">{q}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export function EvidenceViewer({ citation, onClose }: { citation: Citation; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [rects, setRects] = useState<number[][]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useState<{ x: number; y: number; panX: number; panY: number }>({ x: 0, y: 0, panX: 0, panY: 0 })[0];

  const k = kindStyle(citation.kind, citation.location);
  const Icon = k.icon;
  const pairs = citation.kind === "database" || citation.kind === "xlsx" ? recordPairs(citation.snippet) : null;
  const showImage = !pairs;

  useEffect(() => {
    let url: string | null = null;
    setSrc(null);
    setRects([]);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    if (showImage) {
      imageUrl(`/documents/${citation.document_id}/pages/${citation.page}`).then((u) => { url = u; setSrc(u); });
    }
    const q = citation.quote || citation.snippet.split("\n").find((l) => l.trim().length > 20) || "";
    if ((citation.kind === "pdf" || citation.kind === "image") && q) {
      api<{ rects: number[][] }>(
        `/documents/${citation.document_id}/pages/${citation.page}/highlights?q=${encodeURIComponent(q.slice(0, 300))}`,
      ).then((r) => setRects(r.rects || [])).catch(() => {});
    }
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [citation.chunk_id, citation.quote, citation.document_id, citation.page, citation.kind]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    setZoom((z) => Math.min(3.5, Math.max(0.6, +(z + delta).toFixed(2))));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.x = e.clientX;
    dragStartRef.y = e.clientY;
    dragStartRef.panX = pan.x;
    dragStartRef.panY = pan.y;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: dragStartRef.panX + (e.clientX - dragStartRef.x),
      y: dragStartRef.panY + (e.clientY - dragStartRef.y),
    });
  };

  const handleDoubleClick = () => {
    if (zoom > 1 || pan.x !== 0 || pan.y !== 0) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    } else {
      setZoom(2);
    }
  };

  return (
    <motion.aside initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}
      className="glass flex h-full flex-col overflow-hidden rounded-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-line p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${k.tint}`}><Icon className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">{citation.title}</p>
            <p className="flex items-center gap-2 text-[11px] text-muted">
              <span>{k.label}</span><span>·</span><span className="truncate">{citation.location || `page ${citation.page}`}</span>
            </p>
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface-hover hover:text-ink" aria-label="Close source">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex flex-wrap gap-2">
          <span className={`chip ${LEVEL_TEXT[citation.classification]}`}><Lock className="h-3 w-3" /> {LEVELS[citation.classification]}</span>
          <span className="chip text-allow">Access re-checked</span>
          {citation.section_heading && <span className="chip max-w-full truncate">§ {citation.section_heading}</span>}
        </div>

        {citation.quote && !citation.quote.startsWith("Computed") && (
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-accent">
              <Quote className="h-3 w-3" /> Exact supporting text
            </p>
            <p className="text-sm text-ink">“{citation.quote}”</p>
          </div>
        )}

        {pairs ? (
          <div className="overflow-hidden rounded-xl border border-line">
            {pairs.map(([key, v]) => (
              <div key={key} className="grid grid-cols-[40%_60%] border-b border-line-subtle last:border-0">
                <span className="bg-surface-subtle px-3 py-2 text-[11px] font-semibold text-muted">{key}</span>
                <span className="px-3 py-2 text-sm text-ink">{v}</span>
              </div>
            ))}
          </div>
        ) : (
          <div
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
            onDoubleClick={handleDoubleClick}
            className="group relative select-none overflow-hidden rounded-xl border border-line bg-white shadow-sm flex items-center justify-center min-h-[280px]"
            style={{ cursor: isDragging ? "grabbing" : zoom > 1 ? "grab" : "default" }}
          >
            {src ? (
              <div
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: "center center",
                  transition: isDragging ? "none" : "transform 0.15s ease-out",
                }}
                className="relative inline-block max-w-full"
              >
                <img src={src} alt={`${citation.title}, page ${citation.page}`} className="block w-full pointer-events-none select-none" />
                {rects.map((r, i) => (
                  <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 + i * 0.02 }}
                    className="absolute rounded-sm bg-amber-300/50 ring-2 ring-amber-500/80 mix-blend-multiply pointer-events-none"
                    style={{ left: `${r[0] * 100}%`, top: `${r[1] * 100}%`, width: `${(r[2] - r[0]) * 100}%`, height: `${(r[3] - r[1]) * 100}%` }} />
                ))}
              </div>
            ) : (
              <div className="skeleton aspect-[3/4] w-full" />
            )}

            {/* Hint overlay on hover */}
            {src && (
              <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-[10px] text-white/90 backdrop-blur-xs opacity-75 group-hover:opacity-100 transition-opacity">
                {Math.round(zoom * 100)}% · Wheel to zoom · Drag to pan · Double-click to reset
              </div>
            )}
          </div>
        )}

        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">Retrieved chunk</p>
          <pre className="whitespace-pre-wrap rounded-xl border border-line bg-surface-subtle p-3 font-sans text-xs leading-relaxed text-ink-light">
            {highlight(citation.snippet, citation.quote)}
          </pre>
        </div>
      </div>
    </motion.aside>
  );
}
