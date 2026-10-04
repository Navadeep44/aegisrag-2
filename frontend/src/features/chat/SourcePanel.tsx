import { useEffect, useState } from "react";
import { Banded, Level } from "../../components/ui/Classification";
import { imageUrl } from "../../lib/api";
import type { Citation } from "../../lib/types";

export function SourcePanel({ citation }: { citation: Citation }) {
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    setImage(null);
    if (citation.kind === "pdf" || citation.kind === "image") {
      imageUrl(`/documents/${citation.document_id}/pages/${citation.page}`).then((u) => {
        if (cancelled) { if (u) URL.revokeObjectURL(u); return; }
        url = u;
        setImage(u);
      });
    }
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [citation.document_id, citation.page, citation.kind]);

  return (
    <Banded level={citation.classification} className="p-4">
      <Level level={citation.classification} />
      <p className="display text-2xl">{citation.title}</p>
      <p className="text-xs text-muted">{citation.location || `page ${citation.page}`}</p>
      <blockquote className="mt-4 whitespace-pre-wrap border-l border-ink pl-3 text-sm leading-relaxed">{citation.snippet}</blockquote>
      {image && <img src={image} alt={`Page ${citation.page} of ${citation.title}`} className="mt-4 max-w-full rounded border border-line" />}
    </Banded>
  );
}
