import { useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UploadCloud,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  CheckCircle2,
  X,
  Plus,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  Cpu,
  Lock,
  Layers,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Notice } from "../../components/ui/Notice";
import { api } from "../../lib/api";
import { LEVELS, type Department, type Role } from "../../lib/types";
import { DocumentWorkflowExplainer } from "./DocumentWorkflowExplainer";

interface SelectedFileItem {
  id: string;
  file: File;
  title: string;
  type: "pdf" | "image" | "spreadsheet" | "database" | "document";
  status: "idle" | "uploading" | "done" | "error";
  progress?: number;
  errorMsg?: string;
}

interface UploadFormProps {
  roles: Role[];
  departments?: Department[];
  onDone: () => void;
  onCancel?: () => void;
}

const INGESTION_STAGES = [
  { label: "Validating file binary & SHA-256 checksum", icon: ShieldCheck },
  { label: "Optical OCR & schema structural extraction", icon: Layers },
  { label: "Prompt injection & adversarial safety scrub", icon: Lock },
  { label: "Generating 768-d Gemini vectors & BM25 indices", icon: Cpu },
  { label: "Compiling SQL RBAC grants & row security rules", icon: Sparkles },
];

export function UploadForm({
  roles,
  departments = [],
  onDone,
  onCancel,
}: UploadFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFileItem[]>([]);
  const [classification, setClassification] = useState(1);
  const [initialGrant, setInitialGrant] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [currentStageIdx, setCurrentStageIdx] = useState(0);
  const [currentFileIdx, setCurrentFileIdx] = useState(0);
  const [batchProgress, setBatchProgress] = useState(0);
  const [showArchitectureGuide, setShowArchitectureGuide] = useState(false);

  const acceptedExtensions = ".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.csv,.tsv,.json,.sql,.txt,.md";
  const validExts = [".pdf", ".png", ".jpg", ".jpeg", ".xlsx", ".docx", ".csv", ".tsv", ".json", ".sql", ".txt", ".md"];

  // Cycle through animated ingestion stages during busy state
  useEffect(() => {
    if (!busy) {
      setCurrentStageIdx(0);
      setBatchProgress(0);
      return;
    }
    const interval = setInterval(() => {
      setCurrentStageIdx((prev) => (prev + 1) % INGESTION_STAGES.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [busy]);

  const getCleanTitle = (fileName: string) => {
    return fileName
      .replace(/\.[^/.]+$/, "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const addFiles = (files: FileList | File[]) => {
    setError("");
    const newItems: SelectedFileItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (!validExts.includes(ext)) {
        setError(`"${file.name}" has an unsupported format. Supported: PDF, PNG, JPG, XLSX, DOCX, CSV, TSV, JSON, SQL, TXT, MD.`);
        continue;
      }
      if (selectedFiles.some((f) => f.file.name === file.name && f.file.size === file.size)) {
        continue;
      }

      let fileType: "pdf" | "image" | "spreadsheet" | "database" | "document" = "document";
      if (ext === ".pdf") fileType = "pdf";
      else if ([".png", ".jpg", ".jpeg"].includes(ext)) fileType = "image";
      else if ([".xlsx", ".csv", ".tsv"].includes(ext)) fileType = "spreadsheet";
      else if ([".json", ".sql"].includes(ext)) fileType = "database";

      newItems.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        title: getCleanTitle(file.name),
        type: fileType,
        status: "idle",
        progress: 0,
      });
    }

    if (newItems.length > 0) {
      setSelectedFiles((prev) => [...prev, ...newItems]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (id: string) => {
    if (busy) return;
    setSelectedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const updateTitle = (id: string, newTitle: string) => {
    setSelectedFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, title: newTitle } : f))
    );
  };

  async function uploadAll(e: React.FormEvent) {
    e.preventDefault();
    if (selectedFiles.length === 0) {
      setError("Please select at least one document to upload.");
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

    setBusy(true);
    setError("");

    let successCount = 0;
    const totalCount = selectedFiles.length;

    for (let i = 0; i < selectedFiles.length; i++) {
      const item = selectedFiles[i];
      setCurrentFileIdx(i);
      setBatchProgress(Math.round((i / totalCount) * 100));

      setSelectedFiles((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: "uploading", progress: 30 } : f))
      );

      const form = new FormData();
      form.append("file", item.file);
      form.append("title", item.title.trim() || item.file.name);
      form.append("classification", String(classification));
      form.append("grants", JSON.stringify(grants));

      try {
        await api("/documents/upload", { method: "POST", body: form });

        setSelectedFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, status: "done", progress: 100 } : f))
        );
        successCount++;
        setBatchProgress(Math.round(((i + 1) / totalCount) * 100));
      } catch (err) {
        const msg = (err as Error).message || "Upload failed";
        setSelectedFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, status: "error", errorMsg: msg } : f))
        );
      }
    }

    setBusy(false);

    if (successCount === totalCount) {
      setSelectedFiles([]);
      onDone();
    } else if (successCount > 0) {
      setError(`Uploaded ${successCount} of ${totalCount} documents. Some files encountered errors.`);
      onDone();
    } else {
      setError("Failed to upload selected documents. Please check file formats and try again.");
    }
  }

  const totalBytes = selectedFiles.reduce((acc, f) => acc + f.file.size, 0);
  const totalSizeMb = (totalBytes / (1024 * 1024)).toFixed(2);
  const CurrentStageIcon = INGESTION_STAGES[currentStageIdx].icon;

  return (
    <form onSubmit={uploadAll} className="space-y-6">
      {/* 1. Drag & Drop Multiple File Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !busy && fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center rounded-3xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-300 ${
          isDragOver
            ? "border-accent bg-accent/10 scale-[0.99] shadow-md"
            : selectedFiles.length > 0
            ? "border-accent/40 bg-surface-subtle/80 hover:border-accent"
            : "border-line bg-surface/50 hover:border-accent/50 hover:bg-surface-subtle"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedExtensions}
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10 text-accent shadow-sm transition-transform group-hover:scale-105">
          <UploadCloud className="h-7 w-7" />
        </div>

        <p className="display text-base font-bold text-ink">
          Select or drag & drop <span className="text-gradient">enterprise documents</span>
        </p>
        <p className="mt-1 max-w-sm text-xs text-muted">
          Support for searchable PDFs, scans, photos, spreadsheets, and SQL/JSON table exports.
        </p>

        {selectedFiles.length > 0 && (
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3.5 py-1 text-xs font-semibold text-accent">
            <Plus className="h-3.5 w-3.5" />
            <span>Add more files to this ingestion batch</span>
          </div>
        )}
      </div>

      {/* 2. Selected Files Queue List */}
      {selectedFiles.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-muted">
              Batch Queue ({selectedFiles.length}) • {totalSizeMb} MB Total
            </h4>
            {!busy && (
              <button
                type="button"
                onClick={() => setSelectedFiles([])}
                className="text-xs font-semibold text-deny hover:underline"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {selectedFiles.map((item) => {
              const sizeKb = (item.file.size / 1024).toFixed(1);

              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between gap-3 rounded-2xl border p-3.5 transition-all ${
                    item.status === "done"
                      ? "border-allow/40 bg-allow/10"
                      : item.status === "error"
                      ? "border-deny/40 bg-deny/10"
                      : item.status === "uploading"
                      ? "border-accent/50 bg-accent/10 shadow-xs"
                      : "border-line bg-surface shadow-xs"
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${
                        item.type === "image"
                          ? "border-sky-500/30 bg-sky-500/10 text-sky-600"
                          : item.type === "pdf"
                          ? "border-rose-500/30 bg-rose-500/10 text-rose-600"
                          : item.type === "spreadsheet" || item.type === "database"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-600"
                      }`}
                    >
                      {item.type === "image" ? (
                        <ImageIcon className="h-5 w-5" />
                      ) : item.type === "pdf" ? (
                        <FileText className="h-5 w-5" />
                      ) : (
                        <FileSpreadsheet className="h-5 w-5" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => updateTitle(item.id, e.target.value)}
                        disabled={busy}
                        placeholder="Document title"
                        className="w-full truncate bg-transparent text-xs font-bold text-ink hover:text-accent focus:outline-none"
                      />
                      <div className="flex items-center gap-2 font-mono text-[10px] text-muted">
                        <span className="truncate max-w-[180px]">{item.file.name}</span>
                        <span>•</span>
                        <span>{sizeKb} KB</span>
                        <span>•</span>
                        <span className="uppercase font-semibold text-ink-light">{item.type}</span>
                      </div>
                      {item.status === "uploading" && (
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle border border-accent/20">
                          <div
                            className="h-full bg-gradient-to-r from-accent to-ai transition-all duration-300"
                            style={{ width: `${item.progress || 40}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status Indicator or Remove Button */}
                  <div className="flex shrink-0 items-center gap-2">
                    {item.status === "uploading" && (
                      <RefreshCw className="h-4 w-4 animate-spin text-accent" />
                    )}
                    {item.status === "done" && (
                      <CheckCircle2 className="h-4 w-4 text-allow" />
                    )}
                    {item.status === "error" && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-deny">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Failed</span>
                      </span>
                    )}
                    {!busy && (
                      <button
                        type="button"
                        onClick={() => removeFile(item.id)}
                        className="rounded-lg p-1 text-muted hover:bg-surface-hover hover:text-deny transition-colors"
                        title="Remove file"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Batch Permissions & Classification Settings */}
      <div className="glass-premium rounded-2xl border border-line p-4 space-y-3">
        <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-muted">
          Security Classification & Scope
        </h4>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">
              Classification Tier
            </label>
            <select
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink focus:border-accent focus:outline-none"
              value={classification}
              onChange={(e) => setClassification(Number(e.target.value))}
              disabled={busy}
            >
              {LEVELS.map((label, i) => (
                <option key={label} value={i}>
                  Level {i} — {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">
              Initial Access Grant
            </label>
            <select
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink focus:border-accent focus:outline-none"
              value={initialGrant}
              onChange={(e) => setInitialGrant(e.target.value)}
              disabled={busy}
            >
              <option value="">Private (Granular Roles Only)</option>
              <option value="*">All Organization Members</option>
              <optgroup label="Specific Roles">
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

      {/* Live Ingestion Progress Indicator when busy */}
      {busy && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-premium rounded-2xl border border-accent/40 p-5 space-y-4 shadow-lg bg-surface/90"
        >
          {/* Batch Upload Progress Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <RefreshCw className="h-4 w-4 text-accent animate-spin" />
              <div>
                <span className="text-xs font-bold text-ink block">
                  Uploading & Ingesting Batch ({batchProgress}%)
                </span>
                <span className="text-[11px] text-muted font-mono">
                  Document {currentFileIdx + 1} of {selectedFiles.length}: "{selectedFiles[currentFileIdx]?.title || ''}"
                </span>
              </div>
            </div>
            <span className="font-mono text-xs text-accent font-bold px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20">
              {batchProgress}% Complete
            </span>
          </div>

          {/* Primary Batch Progress Bar */}
          <div className="h-3 w-full overflow-hidden rounded-full bg-surface-subtle border border-line">
            <motion.div
              className="h-full bg-gradient-to-r from-accent via-ai to-allow shadow-sm"
              animate={{ width: `${Math.max(12, batchProgress)}%` }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            />
          </div>

          {/* Active Pipeline Stage */}
          <div className="pt-1 border-t border-line/40 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <CurrentStageIcon className="h-4 w-4 text-ai animate-spin-slow" />
                <span className="text-xs font-semibold text-ink">
                  {INGESTION_STAGES[currentStageIdx].label}…
                </span>
              </div>
              <span className="font-mono text-[10px] text-muted font-semibold">
                Pipeline Stage {currentStageIdx + 1} of {INGESTION_STAGES.length}
              </span>
            </div>

            {/* Stage micro-bar */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle/80">
              <motion.div
                className="h-full bg-ai/70"
                animate={{ width: `${((currentStageIdx + 1) / INGESTION_STAGES.length) * 100}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>
          </div>
        </motion.div>
      )}

      {error && <Notice tone="error">{error}</Notice>}

      {/* 4. Action Buttons */}
      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <button
          type="button"
          onClick={() => setShowArchitectureGuide(!showArchitectureGuide)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-accent transition-colors"
        >
          <Layers className="h-3.5 w-3.5" />
          <span>{showArchitectureGuide ? "Hide pipeline details" : "How ingestion works"}</span>
          {showArchitectureGuide ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        <div className="flex items-center gap-2.5">
          {onCancel && (
            <Button type="button" kind="secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            disabled={busy || selectedFiles.length === 0}
            className="flex items-center gap-2"
          >
            {busy ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Processing Pipeline...</span>
              </>
            ) : (
              <span>
                {selectedFiles.length > 1
                  ? `Upload & Ingest ${selectedFiles.length} Documents`
                  : selectedFiles.length === 1
                  ? "Upload & Ingest 1 Document"
                  : "Select Documents to Ingest"}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Expandable Architecture Explainer inside drawer */}
      <AnimatePresence>
        {showArchitectureGuide && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden pt-2"
          >
            <div className="rounded-2xl border border-line bg-surface-subtle p-4">
              <DocumentWorkflowExplainer showHeading={false} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}
