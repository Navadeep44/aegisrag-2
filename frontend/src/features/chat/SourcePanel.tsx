import { useEffect, useState } from "react";
import { ClearancePill } from "../../components/ui/StatusPill";
import { imageUrl } from "../../lib/api";
import type { Citation } from "../../lib/types";
import { Skeleton } from "../../components/ui/Skeleton";
import { FileText, ExternalLink } from "lucide-react";

export function SourcePanel({ citation }: { citation: Citation }) {
  const [image, setImage] = useState<string | null>(null);
  const [loadingImg, setLoadingImg] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    setImage(null);
    setLoadingImg(true);

    if (citation.kind === "pdf" || citation.kind === "image") {
      imageUrl(`/documents/${citation.document_id}/pages/${citation.page}`)
        .then((u) => {
          if (cancelled) {
            if (u) URL.revokeObjectURL(u);
            return;
          }
          url = u;
          setImage(u);
        })
        .finally(() => {
          if (!cancelled) setLoadingImg(false);
        });
    } else {
      setLoadingImg(false);
    }

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [citation.document_id, citation.page, citation.kind]);

  return (
    <div className="space-y-5">
      {/* Header Info */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <ClearancePill clearance={citation.classification} />
          <span className="rounded bg-line px-1.5 py-0.5 font-mono text-[0.65rem] uppercase text-muted">
            {citation.kind}
          </span>
          <span className="font-mono text-xs text-muted">
            {citation.location || `Page ${citation.page}`}
          </span>
        </div>
        <h3 className="display text-2xl font-semibold text-ink leading-tight">
          {citation.title}
        </h3>
      </div>

      {/* Verified Passage Excerpt */}
      <div className="rounded-xl border border-line bg-surface-subtle/70 p-4 space-y-1.5">
        <p className="text-[0.65rem] uppercase tracking-wider font-semibold text-muted font-mono">
          Cited Passage Chunk:
        </p>
        <blockquote className="text-xs sm:text-sm text-ink leading-relaxed whitespace-pre-wrap pl-3 border-l-2 border-accent">
          {citation.snippet}
        </blockquote>
      </div>

      {/* High-Resolution Rendered Page Scan */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted font-mono">
            Original Page Render (Page {citation.page}):
          </p>
          {image && (
            <a
              href={image}
              target="_blank"
              rel="noreferrer"
              className="text-[0.7rem] text-accent hover:underline flex items-center gap-1"
            >
              <span>Full size</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {loadingImg ? (
          <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-line bg-surface-subtle p-4">
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
        ) : image ? (
          <div className="rounded-xl border border-line bg-surface p-2 shadow-xs overflow-hidden">
            <img
              src={image}
              alt={`Page ${citation.page} of ${citation.title}`}
              className="w-full object-contain rounded-lg border border-line max-h-[500px]"
            />
          </div>
        ) : (
          <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-line bg-surface-subtle p-4 text-xs text-muted text-center">
            Original scanned image preview is not available for this plain text or table format.
          </div>
        )}
      </div>
    </div>
  );
}
