import { useRef, useState } from "react";
import { UploadCloud, File, X, Shield, Lock } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Notice } from "../../components/ui/Notice";
import { api } from "../../lib/api";
import { LEVELS, type Department, type Role } from "../../lib/types";

interface UploadFormProps {
  roles: Role[];
  departments?: Department[];
  onDone: () => void;
  onCancel?: () => void;
}

export function UploadForm({
  roles,
  departments = [],
  onDone,
  onCancel,
}: UploadFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [classification, setClassification] = useState(1);
  const [initialGrant, setInitialGrant] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!title) {
        // Auto-generate clean title from filename
        const cleanName = file.name
          .replace(/\.[^/.]+$/, "")
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase());
        setTitle(cleanName);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!title) {
        const cleanName = file.name
          .replace(/\.[^/.]+$/, "")
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase());
        setTitle(cleanName);
      }
    }
  };

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) {
      setError("Please choose a file to upload.");
      return;
    }

    let grants: unknown[] = [];
    if (initialGrant === "*") {
      grants = [{ subject_type: "everyone" }];
    } else if (initialGrant.startsWith("role:")) {
      grants = [{ subject_type: "role", subject_id: initialGrant.replace("role:", "") }];
    } else if (initialGrant.startsWith("department:")) {
      grants = [{ subject_type: "department", subject_id: initialGrant.replace("department:", "") }];
    }

    const form = new FormData();
    form.append("file", selectedFile);
    form.append("title", title.trim() || selectedFile.name);
    form.append("classification", String(classification));
    form.append("grants", JSON.stringify(grants));

    setBusy(true);
    setError("");
    try {
      await api("/documents/upload", { method: "POST", body: form });
      setTitle("");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={upload} className="space-y-5">
      {/* Drag and Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
          isDragOver
            ? "border-ink bg-surface-subtle"
            : selectedFile
            ? "border-allow-border bg-allow-bg/40"
            : "border-line bg-surface hover:border-ink/50 hover:bg-surface-subtle/50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.xlsx,.txt,.md"
          className="hidden"
          onChange={handleFileChange}
        />

        {selectedFile ? (
          <div className="flex items-center gap-3 text-left">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-allow-bg text-allow border border-allow-border">
              <File className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink truncate">{selectedFile.name}</p>
              <p className="text-[0.7rem] text-muted">
                {(selectedFile.size / 1024).toFixed(1)} KB • Click to choose a different file
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-surface-subtle text-muted">
              <UploadCloud className="h-5 w-5" />
            </div>
            <p className="text-xs font-semibold text-ink">
              Click to select or drag and drop your document
            </p>
            <p className="text-[0.7rem] text-muted">
              Supports PDF, Scanned Images (PNG/JPG), Excel, TXT or Markdown (up to 25MB)
            </p>
          </div>
        )}
      </div>

      {/* Document Metadata Form */}
      <div className="space-y-3 text-xs sm:text-sm">
        <div>
          <label className="block text-xs font-medium text-ink mb-1">Document Title</label>
          <input
            type="text"
            placeholder="e.g. Employee Leave Policy 2026"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Classification Tier</label>
            <select
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
              value={classification}
              onChange={(e) => setClassification(Number(e.target.value))}
            >
              {LEVELS.map((label, i) => (
                <option key={label} value={i}>
                  Level {i} — {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1">Initial Access Grant</label>
            <select
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
              value={initialGrant}
              onChange={(e) => setInitialGrant(e.target.value)}
            >
              <option value="">No access yet (Private)</option>
              <option value="*">Everyone in organization</option>
              <optgroup label="Roles">
                {roles.map((r) => (
                  <option key={r.id} value={`role:${r.id}`}>
                    Role: {r.name}
                  </option>
                ))}
              </optgroup>
              {departments.length > 0 && (
                <optgroup label="Departments">
                  {departments.map((d) => (
                    <option key={d.id} value={`department:${d.id}`}>
                      Dept: {d.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface-subtle/50 p-3 text-xs text-muted leading-relaxed">
        <strong>Zero-Trust Guarantee:</strong> Documents are quarantined during ingestion. Optical Character Recognition (OCR), text extraction, and prompt sanitizers run before vector indexing.
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex justify-end gap-2.5 pt-2">
        {onCancel && (
          <Button type="button" kind="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={busy || !selectedFile}>
          {busy ? "Uploading and processing..." : "Upload document"}
        </Button>
      </div>
    </form>
  );
}
